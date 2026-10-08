-- T2.2: улики — закрытые снимки событий и сообщений (9.6). Видит только владелец.
create table if not exists public.evidence (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('event', 'message', 'theory')),
  target_id text not null,
  snapshot_text text not null,
  snapshot_author text,
  snapshot_author_id uuid,
  snapshot_date text,
  original_created_at timestamptz,
  original_deleted boolean not null default false,
  case_id bigint,                       -- приложена к делу (Фаза 2, T2.12): тогда не истекает
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (owner_id, target_type, target_id)
);
create index if not exists evidence_owner_idx on public.evidence(owner_id, created_at desc);
create index if not exists evidence_target_idx on public.evidence(target_type, target_id);
alter table public.evidence enable row level security;
revoke all on public.evidence from anon, authenticated;
grant select, delete on public.evidence to authenticated;
drop policy if exists evidence_owner_read on public.evidence;
create policy evidence_owner_read on public.evidence for select to authenticated using (owner_id = auth.uid());
drop policy if exists evidence_owner_delete on public.evidence;
create policy evidence_owner_delete on public.evidence for delete to authenticated using (owner_id = auth.uid() and case_id is null);

-- Снимок делает только база: текст, автор и дата берутся из оригинала, подделать нельзя
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
  else
    raise exception 'Теории появятся позже' using errcode = '22023';
  end if;
  if t is null then raise exception 'Оригинал не найден или удалён' using errcode = '23503'; end if;
  select coalesce((value)::int, 30) into ttl from settings where key = 'evidence.ttl_days';
  insert into evidence (owner_id, target_type, target_id, snapshot_text, snapshot_author, snapshot_author_id, snapshot_date, original_created_at, expires_at)
  values (u, p_target_type, p_target_id, t, coalesce(a_name, 'Аноним'), a_id, d, c, now() + make_interval(days => coalesce(ttl, 30)))
  on conflict (owner_id, target_type, target_id) do nothing
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.add_evidence(text, text) from public, anon;
grant execute on function public.add_evidence(text, text) to authenticated;

-- Оригинал удалён → снимок остаётся с пометкой
create or replace function public.evidence_mark_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'events' then
    update evidence set original_deleted = true where target_type = 'event' and target_id = old.id::text;
  elsif tg_op = 'DELETE' or coalesce(new.is_deleted, false) then
    update evidence set original_deleted = true where target_type = 'message' and target_id = old.id::text;
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.evidence_mark_deleted() from public, anon, authenticated;
drop trigger if exists evidence_event_deleted on public.events;
create trigger evidence_event_deleted after delete on public.events for each row execute function public.evidence_mark_deleted();
drop trigger if exists evidence_message_deleted on public.chat_messages;
create trigger evidence_message_deleted after delete or update of is_deleted on public.chat_messages for each row execute function public.evidence_mark_deleted();

-- Очистка просроченных улик раз в сутки (приложенные к делу не трогаем)
create or replace function public.purge_expired_evidence() returns void
language sql security definer set search_path = public as $$
  delete from evidence where expires_at < now() and case_id is null;
$$;
revoke execute on function public.purge_expired_evidence() from public, anon, authenticated;
select cron.schedule('purge-expired-evidence', '17 3 * * *', 'select public.purge_expired_evidence()');
