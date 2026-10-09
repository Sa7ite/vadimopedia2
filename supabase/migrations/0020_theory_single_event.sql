-- Теория может касаться одного события (второе необязательно): догадка «что на самом деле было» без пары.
alter table public.theories alter column event_b drop not null;
alter table public.theories drop constraint if exists theories_check;
alter table public.theories add constraint theories_check check (event_b is null or event_a < event_b);
create unique index if not exists theories_author_single on public.theories (author_id, event_a) where event_b is null and status <> 'removed';

create or replace view public.theory_list with (security_invoker = true) as
select t.id, t.author_id, p.full_name as author_name, t.event_a, t.event_b, t.note, t.status, t.created_at,
  ea.event_text as event_a_text, ea.event_date as event_a_date, eb.event_text as event_b_text, eb.event_date as event_b_date,
  (select count(*) from theory_votes v where v.theory_id = t.id and v.vote = 'believe')::int as believe,
  (select count(*) from theory_votes v where v.theory_id = t.id and v.vote = 'doubt')::int as doubt,
  (select v.vote from theory_votes v where v.theory_id = t.id and v.user_id = auth.uid()) as my_vote
from theories t
left join profiles p on p.id = t.author_id
join events ea on ea.id = t.event_a
left join events eb on eb.id = t.event_b;
revoke all on public.theory_list from anon;
grant select on public.theory_list to authenticated;

create or replace function public.create_theory(p_event_a bigint, p_event_b bigint, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); lim int; today int; a bigint; b bigint; nid bigint;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if p_event_a is null and p_event_b is null then raise exception 'Выберите событие' using errcode = '22023'; end if;
  if p_event_a is null or p_event_b is null then a := coalesce(p_event_a, p_event_b); b := null;
  else a := least(p_event_a, p_event_b); b := greatest(p_event_a, p_event_b); end if;
  if a = b then raise exception 'Нужны два разных события' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Напишите, в чём теория' using errcode = '22023'; end if;
  if length(btrim(p_note)) > 280 then raise exception 'Записка не длиннее 280 знаков' using errcode = '22023'; end if;
  if (select count(*) from events where id in (a, b) and is_approved) < (case when b is null then 1 else 2 end) then
    raise exception 'Событие должно быть опубликовано' using errcode = '23503';
  end if;
  select coalesce((value)::int, 3) into lim from settings where key = 'theory.max_per_day';
  select count(*) into today from theories where author_id = u and created_at > now() - interval '1 day';
  if today >= coalesce(lim, 3) then raise exception 'Не больше % теорий в сутки', coalesce(lim, 3) using errcode = 'P0001'; end if;
  if exists (select 1 from theories where author_id = u and event_a = a and event_b is not distinct from b and status <> 'removed') then
    raise exception 'У вас уже есть такая теория' using errcode = '23505';
  end if;
  insert into theories (author_id, event_a, event_b, note) values (u, a, b, btrim(p_note)) returning id into nid;
  return nid;
end $$;

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
    select 'Теория: ' || th.note || case when th.event_b is null then ' (о событии № ' || th.event_a || ')'
                                         else ' (связывает № ' || th.event_a || ' и № ' || th.event_b || ')' end,
           th.author_id, p.full_name, null, th.created_at
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
