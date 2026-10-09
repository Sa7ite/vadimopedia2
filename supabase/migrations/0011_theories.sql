-- T2.7: теории — нитка между двумя событиями с запиской до 280 знаков (9.7), голоса «верю / не верю», канон.
-- Писать в таблицы напрямую нельзя: только функции ниже (лимиты и права проверяет база).
create table if not exists public.theories (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  event_a bigint not null references public.events(id) on delete cascade,
  event_b bigint not null references public.events(id) on delete cascade,
  note varchar(280) not null check (length(btrim(note)) between 3 and 280),
  status text not null default 'active' check (status in ('active', 'canon', 'removed')),
  created_at timestamptz not null default now(),
  status_changed_at timestamptz,
  check (event_a < event_b)                       -- пара хранится упорядоченно
);
create unique index if not exists theories_author_pair on public.theories (author_id, event_a, event_b) where status <> 'removed';
create index if not exists theories_a_idx on public.theories (event_a);
create index if not exists theories_b_idx on public.theories (event_b);
create table if not exists public.theory_votes (
  theory_id bigint not null references public.theories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('believe', 'doubt')),
  created_at timestamptz not null default now(),
  primary key (theory_id, user_id)
);
alter table public.theories enable row level security;
alter table public.theory_votes enable row level security;
revoke all on public.theories, public.theory_votes from anon, authenticated;
grant select on public.theories, public.theory_votes to authenticated;
drop policy if exists theories_read on public.theories;
create policy theories_read on public.theories for select to authenticated using (status <> 'removed' or public.is_admin());
drop policy if exists theory_votes_read on public.theory_votes;
create policy theory_votes_read on public.theory_votes for select to authenticated using (true);

-- Список с голосами и событиями (права — как у читающего)
create or replace view public.theory_list with (security_invoker = true) as
select t.id, t.author_id, p.full_name as author_name, t.event_a, t.event_b, t.note, t.status, t.created_at,
  ea.event_text as event_a_text, ea.event_date as event_a_date, eb.event_text as event_b_text, eb.event_date as event_b_date,
  (select count(*) from theory_votes v where v.theory_id = t.id and v.vote = 'believe')::int as believe,
  (select count(*) from theory_votes v where v.theory_id = t.id and v.vote = 'doubt')::int as doubt,
  (select v.vote from theory_votes v where v.theory_id = t.id and v.user_id = auth.uid()) as my_vote
from theories t
left join profiles p on p.id = t.author_id
join events ea on ea.id = t.event_a
join events eb on eb.id = t.event_b;
revoke all on public.theory_list from anon;
grant select on public.theory_list to authenticated;

create or replace function public.create_theory(p_event_a bigint, p_event_b bigint, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); lim int; today int; a bigint := least(p_event_a, p_event_b); b bigint := greatest(p_event_a, p_event_b); nid bigint;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if a = b then raise exception 'Нужны два разных события' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Напишите, почему события связаны' using errcode = '22023'; end if;
  if length(btrim(p_note)) > 280 then raise exception 'Записка не длиннее 280 знаков' using errcode = '22023'; end if;
  if (select count(*) from events where id in (a, b) and is_approved) < 2 then
    raise exception 'Оба события должны быть опубликованы' using errcode = '23503';
  end if;
  select coalesce((value)::int, 3) into lim from settings where key = 'theory.max_per_day';
  select count(*) into today from theories where author_id = u and created_at > now() - interval '1 day';
  if today >= coalesce(lim, 3) then raise exception 'Не больше % теорий в сутки', coalesce(lim, 3) using errcode = 'P0001'; end if;
  if exists (select 1 from theories where author_id = u and event_a = a and event_b = b and status <> 'removed') then
    raise exception 'Вы уже связали эти события' using errcode = '23505';
  end if;
  insert into theories (author_id, event_a, event_b, note) values (u, a, b, btrim(p_note)) returning id into nid;
  return nid;
end $$;

-- Голос: 'believe', 'doubt' или null (снять). За свою теорию нельзя
create or replace function public.vote_theory(p_theory bigint, p_vote text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); t record;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  select * into t from theories where id = p_theory and status <> 'removed';
  if t.id is null then raise exception 'Теория не найдена' using errcode = '23503'; end if;
  if t.author_id = u then raise exception 'За свою теорию голосовать нельзя' using errcode = '42501'; end if;
  if p_vote is null then delete from theory_votes where theory_id = p_theory and user_id = u; return; end if;
  if p_vote not in ('believe', 'doubt') then raise exception 'Голос: верю или не верю' using errcode = '22023'; end if;
  insert into theory_votes (theory_id, user_id, vote) values (p_theory, u, p_vote)
    on conflict (theory_id, user_id) do update set vote = excluded.vote, created_at = now();
end $$;

-- Статус: канон и снятие — админ; автор может только снять свою (removed)
create or replace function public.set_theory_status(p_theory bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); t record;
begin
  select * into t from theories where id = p_theory;
  if t.id is null then raise exception 'Теория не найдена' using errcode = '23503'; end if;
  if p_status not in ('active', 'canon', 'removed') then raise exception 'Неизвестный статус' using errcode = '22023'; end if;
  if not public.is_admin() and not (t.author_id = u and p_status = 'removed') then
    raise exception 'Только админ может менять статус теории' using errcode = '42501';
  end if;
  update theories set status = p_status, status_changed_at = now() where id = p_theory;
  if p_status = 'removed' then
    update evidence set original_deleted = true where target_type = 'theory' and target_id = p_theory::text;
  end if;
  insert into audit_log (actor_id, action, target_type, target_id, details)
    values (u, 'theory_status', 'theory', p_theory::text, jsonb_build_object('old', t.status, 'new', p_status));
end $$;

revoke execute on function public.create_theory(bigint, bigint, text), public.vote_theory(bigint, text), public.set_theory_status(bigint, text) from public, anon;
grant execute on function public.create_theory(bigint, bigint, text), public.vote_theory(bigint, text), public.set_theory_status(bigint, text) to authenticated;

-- Реакции на теории: «свидетель» по-прежнему только к событиям (проверка в триггере реакций не меняется)
-- Улики на теории: снимок записки с обеими событиями
create or replace function public.add_evidence(p_target_type text, p_target_id text) returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); t text; a_id uuid; a_name text; d text; c timestamptz; ttl int; new_id bigint;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if p_target_type = 'event' then
    select e.event_text, e.user_id, p.full_name, e.event_date, e.created_at into t, a_id, a_name, d, c
      from events e left join profiles p on p.id = e.user_id
      where e.id::text = p_target_id and (e.is_approved or e.user_id = u or e.submitted_by = u);
  elsif p_target_type = 'message' then
    select m.message_text, m.user_id, p.full_name, null, m.created_at into t, a_id, a_name, d, c
      from chat_messages m left join profiles p on p.id = m.user_id
      where m.id::text = p_target_id and not coalesce(m.is_deleted, false);
  elsif p_target_type = 'theory' then
    select 'Теория: ' || th.note || ' (связывает № ' || th.event_a || ' и № ' || th.event_b || ')', th.author_id, p.full_name, null, th.created_at
      into t, a_id, a_name, d, c
      from theories th left join profiles p on p.id = th.author_id
      where th.id::text = p_target_id and th.status <> 'removed';
  else
    raise exception 'Неизвестный тип улики' using errcode = '22023';
  end if;
  if t is null then raise exception 'Оригинал не найден или удалён' using errcode = '23503'; end if;
  select coalesce((value)::int, 30) into ttl from settings where key = 'evidence.ttl_days';
  insert into evidence (owner_id, target_type, target_id, snapshot_text, snapshot_author, snapshot_author_id, snapshot_date, original_created_at, expires_at)
  values (u, p_target_type, p_target_id, t, coalesce(a_name, 'Аноним'), a_id, d, c, now() + make_interval(days => coalesce(ttl, 30)))
  on conflict (owner_id, target_type, target_id) do nothing
  returning id into new_id;
  return new_id;
end $$;

-- Теория удалена вместе с событием → улика остаётся с пометкой «оригинал удалён»
create or replace function public.evidence_theory_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update evidence set original_deleted = true where target_type = 'theory' and target_id = old.id::text;
  return old;
end $$;
revoke execute on function public.evidence_theory_deleted() from public, anon, authenticated;
drop trigger if exists evidence_theory_deleted on public.theories;
create trigger evidence_theory_deleted after delete on public.theories for each row execute function public.evidence_theory_deleted();
