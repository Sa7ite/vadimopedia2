-- T2.8: «Событие года» — голосование по году события, победитель получает премиальный титул с номером удостоверения
-- Идемпотентно. Голоса — только через функции; кто за что голосовал, видит только сам голосующий.

-- 1. Номер удостоверения (serial) — порядковый номер выдачи внутри титула; отзыв (revoked_at)
alter table public.user_titles add column if not exists serial int;
alter table public.user_titles add column if not exists revoked_at timestamptz;
update public.user_titles u set serial = x.n
from (select id, row_number() over (partition by title_id order by granted_at, id) n from public.user_titles) x
where x.id = u.id and u.serial is null;

create or replace function public.user_titles_serial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('user_titles_serial'), new.title_id);
    select coalesce(max(serial), 0) + 1 into new.serial from user_titles where title_id = new.title_id;
  else
    new.serial := old.serial;  -- номер не меняется никогда
    if not public.is_admin() then new.revoked_at := old.revoked_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists user_titles_serial on public.user_titles;
create trigger user_titles_serial before insert or update on public.user_titles
  for each row execute function public.user_titles_serial();
revoke execute on function public.user_titles_serial() from public, anon, authenticated;

-- 2. Голосования по годам
create table if not exists public.year_polls (
  year int primary key,
  status text not null default 'open' check (status in ('open', 'tie', 'closed')),
  opened_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null,
  closed_at timestamptz,
  winner_event bigint references public.events(id) on delete set null,
  winner_user uuid references public.profiles(id) on delete set null,
  title_id int references public.titles(id) on delete set null
);
alter table public.year_polls enable row level security;
drop policy if exists year_polls_read on public.year_polls;
create policy year_polls_read on public.year_polls for select to authenticated using (true);
revoke all on public.year_polls from anon;
revoke insert, update, delete, truncate on public.year_polls from authenticated;
grant select on public.year_polls to authenticated;

-- 3. Старая таблица голосов: запись только через функцию, читать — только свои
do $$ begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'event_year_votes_bak_20261009') then
    create table public.event_year_votes_bak_20261009 as select * from public.event_year_votes;
    alter table public.event_year_votes_bak_20261009 enable row level security;
  end if;
end $$;
alter table public.event_year_votes alter column event_id type bigint;
drop policy if exists vy_ins on public.event_year_votes;
drop policy if exists vy_upd on public.event_year_votes;
drop policy if exists vy_del on public.event_year_votes;
drop policy if exists vy_read on public.event_year_votes;
create policy vy_read on public.event_year_votes for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.event_year_votes from anon;
revoke insert, update, delete, truncate on public.event_year_votes from authenticated;

-- автор события для титула: кто прислал; события Летописца без отправителя — без титула
create or replace function public.event_author(e public.events) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(e.submitted_by, case when e.user_id is distinct from public.chronicler_id() then e.user_id end)
$$;
revoke execute on function public.event_author(public.events) from public, anon;

-- 4. Состояние голосования: события года, голоса, мой голос (без раскрытия чужих голосов)
create or replace function public.get_year_poll(p_year int) returns json
language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  return (select json_build_object(
    'poll', (select row_to_json(p) from year_polls p where p.year = p_year),
    'my_vote', (select event_id from event_year_votes where user_id = u and year = p_year),
    'events', coalesce((select json_agg(x order by x.votes desc, x.id) from (
      select e.id, e.event_text, e.event_date,
        (select count(*) from event_year_votes v where v.event_id = e.id and v.year = p_year)::int as votes,
        (e.user_id = u or e.submitted_by = u) as own
      from events e where e.is_approved and e.event_year = p_year) x), '[]')));
end $$;

-- 5. Голос: один на человека за год, не за своё, событие этого года, голосование открыто
create or replace function public.vote_event_of_year(p_event bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); e events; p year_polls;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  select * into e from events where id = p_event and is_approved;
  if not found then raise exception 'Событие не найдено' using errcode = '23503'; end if;
  if e.event_year is null then raise exception 'У события нет года' using errcode = '22023'; end if;
  select * into p from year_polls where year = e.event_year;
  if not found then raise exception 'Голосование за % год не открыто', e.event_year using errcode = '22023'; end if;
  if p.status <> 'open' or p.closes_at <= now() then raise exception 'Голосование за % год закрыто', e.event_year using errcode = '22023'; end if;
  if e.user_id = u or e.submitted_by = u then raise exception 'За своё событие голосовать нельзя' using errcode = '42501'; end if;
  if exists (select 1 from event_year_votes where user_id = u and year = e.event_year) then
    raise exception 'Вы уже голосовали за % год', e.event_year using errcode = '23505';
  end if;
  insert into event_year_votes (event_id, user_id, year) values (p_event, u, e.event_year);
end $$;

-- 6. Открыть голосование (админ или расписание)
create or replace function public._open_year_poll(p_year int, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare hrs int;
begin
  if not exists (select 1 from events where is_approved and event_year = p_year) then
    raise exception 'За % год нет опубликованных событий', p_year using errcode = '22023';
  end if;
  if exists (select 1 from year_polls where year = p_year) then
    raise exception 'Голосование за % год уже было', p_year using errcode = '23505';
  end if;
  select coalesce((value)::int, 72) into hrs from settings where key = 'year_poll.hours';
  insert into year_polls (year, opened_by, closes_at) values (p_year, p_actor, now() + make_interval(hours => coalesce(hrs, 72)));
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (p_actor, 'open', 'year_polls', p_year::text, jsonb_build_object('hours', coalesce(hrs, 72)));
end $$;

create or replace function public.open_year_poll(p_year int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только админ' using errcode = '42501'; end if;
  perform public._open_year_poll(p_year, auth.uid());
end $$;

-- 7. Подвести итог: большинство побеждает; при равенстве статус «tie» — победителя выбирает админ
create or replace function public._finish_year_poll(p_year int, p_winner bigint, p_actor uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p year_polls; top int; leaders bigint[]; win bigint; e events; who uuid; tid int; tname text;
begin
  select * into p from year_polls where year = p_year for update;
  if not found then raise exception 'Голосования за % год нет', p_year using errcode = '22023'; end if;
  if p.status = 'closed' then raise exception 'Голосование за % год уже закрыто', p_year using errcode = '22023'; end if;
  select max(c) into top from (select count(*) c from event_year_votes where year = p_year group by event_id) s;
  select array_agg(event_id order by event_id) into leaders from (
    select event_id from event_year_votes where year = p_year group by event_id having count(*) = top) s;
  if top is null then  -- голосов нет: закрываем без победителя
    update year_polls set status = 'closed', closed_at = now() where year = p_year;
    return 'no_votes';
  end if;
  if p_winner is not null then
    if not (p_winner = any(leaders)) then raise exception 'Победителем можно выбрать только одного из лидеров' using errcode = '22023'; end if;
    win := p_winner;
  elsif array_length(leaders, 1) = 1 then win := leaders[1];
  else
    update year_polls set status = 'tie', closed_at = coalesce(closed_at, now()) where year = p_year;
    return 'tie';
  end if;
  select * into e from events where id = win;
  who := public.event_author(e);
  if who is not null then
    tname := 'Событие года ' || p_year;
    insert into titles (title_name, title_type, description, icon)
    values (tname, 'special', 'Автор события, победившего в голосовании «Событие года ' || p_year || '»', '🏆')
    on conflict (title_name) do nothing;
    select id into tid from titles where title_name = tname;
    insert into user_titles (user_id, title_id, granted_by, is_active) values (who, tid, p_actor, false)
    on conflict (user_id, title_id) do nothing;
  end if;
  update year_polls set status = 'closed', closed_at = coalesce(closed_at, now()), winner_event = win, winner_user = who, title_id = tid where year = p_year;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (p_actor, 'close', 'year_polls', p_year::text, jsonb_build_object('winner_event', win, 'winner_user', who, 'votes', top));
  return case when who is null then 'winner_no_author' else 'winner' end;  -- у событий Летописца без отправителя титул некому выдать
end $$;

create or replace function public.close_year_poll(p_year int, p_winner bigint default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только админ' using errcode = '42501'; end if;
  return public._finish_year_poll(p_year, p_winner, auth.uid());
end $$;

-- 8. Расписание: закрыть просроченные; в январе открыть прошлый календарный год, если в нём есть события
create or replace function public.year_poll_tick() returns void
language plpgsql security definer set search_path = public as $$
declare y int; last_year int := extract(year from now())::int - 1;
begin
  for y in select year from year_polls where status = 'open' and closes_at <= now() loop
    perform public._finish_year_poll(y, null, null);
  end loop;
  -- автооткрытие только в январе: прошлый год закончился, события за него есть, голосования ещё не было
  if extract(month from now()) = 1
     and exists (select 1 from events where is_approved and event_year = last_year)
     and not exists (select 1 from year_polls where year = last_year) then
    perform public._open_year_poll(last_year, null);
  end if;
end $$;

revoke execute on function public._open_year_poll(int, uuid) from public, anon, authenticated;
revoke execute on function public._finish_year_poll(int, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.year_poll_tick() from public, anon, authenticated;
revoke execute on function public.get_year_poll(int) from public, anon;
revoke execute on function public.vote_event_of_year(bigint) from public, anon;
revoke execute on function public.open_year_poll(int) from public, anon;
revoke execute on function public.close_year_poll(int, bigint) from public, anon;
grant execute on function public.get_year_poll(int), public.vote_event_of_year(bigint), public.open_year_poll(int), public.close_year_poll(int, bigint) to authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'year-poll-tick') then perform cron.unschedule('year-poll-tick'); end if;
  perform cron.schedule('year-poll-tick', '*/10 * * * *', 'select public.year_poll_tick()');
end $$;
