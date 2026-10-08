-- T2.1: единые реакции «Нравится», «Не нравится», «Я свидетель» (9.5)
create table if not exists public.reactions (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('event', 'message', 'theory')),
  target_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('like', 'dislike', 'witness')),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id, type)
);
create index if not exists reactions_target_idx on public.reactions(target_type, target_id);
alter table public.reactions enable row level security;
revoke all on public.reactions from anon, authenticated;
grant select, insert, delete on public.reactions to authenticated;
drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select to authenticated using (true);
drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

-- Проверки: автор — текущий пользователь; «свидетель» только у событий; на своё нельзя; объект существует;
-- «нравится» и «не нравится» взаимоисключают друг друга
create or replace function public.reactions_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; owner2 uuid;
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  if new.type = 'witness' and new.target_type <> 'event' then
    raise exception '«Я свидетель» можно поставить только событию' using errcode = '22023';
  end if;
  if new.target_type = 'event' then
    select user_id, submitted_by into owner, owner2 from events where id::text = new.target_id and is_approved;
    if not found then raise exception 'Событие не найдено' using errcode = '23503'; end if;
  elsif new.target_type = 'message' then
    select user_id into owner from chat_messages where id::text = new.target_id and not coalesce(is_deleted, false);
    if not found then raise exception 'Сообщение не найдено' using errcode = '23503'; end if;
  else
    raise exception 'Теории появятся позже' using errcode = '23503';
  end if;
  if new.user_id = owner or new.user_id = owner2 then
    raise exception 'На своё можно поставить только «Улику»' using errcode = '42501';
  end if;
  if new.type in ('like', 'dislike') then
    delete from reactions where target_type = new.target_type and target_id = new.target_id and user_id = new.user_id
      and type = case new.type when 'like' then 'dislike' else 'like' end;
  end if;
  return new;
end $$;
revoke execute on function public.reactions_check() from public, anon, authenticated;
drop trigger if exists reactions_check on public.reactions;
create trigger reactions_check before insert on public.reactions for each row execute function public.reactions_check();

-- Счётчики по событиям: счёт = нравится − не нравится
create or replace view public.event_reaction_counts with (security_invoker = true) as
select target_id::bigint as event_id,
       count(*) filter (where type = 'like') as likes,
       count(*) filter (where type = 'dislike') as dislikes,
       count(*) filter (where type = 'witness') as witnesses,
       count(*) filter (where type = 'like') - count(*) filter (where type = 'dislike') as score
from public.reactions where target_type = 'event' group by target_id;
revoke all on public.event_reaction_counts from anon;
grant select on public.event_reaction_counts to authenticated;

-- Перенос старых реакций (была одна «огонь») → «нравится»; старая таблица остаётся только для чтения
insert into public.reactions (target_type, target_id, user_id, type, created_at)
select 'event', r.event_id::text, r.user_id, 'like', r.created_at from public.event_reactions r
join public.events e on e.id = r.event_id
where r.reaction_type in ('fire', 'crown') and r.user_id is distinct from e.user_id and r.user_id is distinct from e.submitted_by
on conflict do nothing;
revoke insert, update, delete on public.event_reactions from anon, authenticated;

-- Достижения считают новые реакции
create or replace function public.refresh_achievements(p_read boolean default false) returns setof text
language plpgsql security definer set search_path = public as $function$
declare u uuid := auth.uid(); n_ev int; n_chat int; n_re int; n_com int; n_q int; t text;
begin
  if u is null then return; end if;
  select count(*) into n_ev from events where (user_id = u or submitted_by = u) and is_approved;
  select count(*) into n_chat from chat_messages where user_id = u and not coalesce(is_deleted,false);
  select count(*) into n_re from reactions where user_id = u;
  select count(*) into n_com from event_comments where user_id = u;
  select count(*) into n_q from quotes where user_id = u;
  for t in
    select x from (values
      ('first_event', n_ev >= 1), ('events_10', n_ev >= 10),
      ('in_chronicle', exists(select 1 from events where (user_id=u or submitted_by=u) and is_in_chronicle)),
      ('chat_50', n_chat >= 50), ('reaction_100', n_re >= 30), ('comment_50', n_com >= 20),
      ('voter', exists(select 1 from event_year_votes where user_id=u)),
      ('quoter', n_q >= 5),
      ('avatar', exists(select 1 from profiles where id=u and avatar_config is not null)),
      ('read_chronicle', p_read or exists(select 1 from achievements where user_id=u and achievement_type='read_chronicle')),
      ('event_of_year', exists(select 1 from (select distinct on (v.year) v.year, v.event_id, count(*) c from event_year_votes v group by v.year, v.event_id order by v.year, count(*) desc) w join events e on e.id=w.event_id where e.user_id=u or e.submitted_by=u))
    ) a(x, ok) where ok
  loop
    insert into achievements(user_id, achievement_type) values (u, t) on conflict do nothing;
    if found then return next t; end if;
  end loop;
end $function$;
