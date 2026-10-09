-- T2.10: достижения (справочник + выданные, условия считает база) и удостоверения (номер, отзыв, полномочия)
-- Идемпотентно. Старая таблица achievements остаётся как архив (1 запись), новая логика её не использует.

-- 1. Справочник достижений
create table if not exists public.achievement_defs (
  code text primary key,
  title text not null,
  description text not null,
  icon text not null default 'star',
  reward_item_code text,
  sort_order int not null default 100
);
alter table public.achievement_defs enable row level security;
drop policy if exists ach_defs_read on public.achievement_defs;
create policy ach_defs_read on public.achievement_defs for select to authenticated using (true);
revoke all on public.achievement_defs from anon;
revoke insert, update, delete, truncate on public.achievement_defs from authenticated;
grant select on public.achievement_defs to authenticated;

insert into public.achievement_defs (code, title, description, icon, reward_item_code, sort_order) values
  ('first_event',   'Первое событие',            'Ваше событие опубликовано',                          'scroll',   'frame_diploma',  10),
  ('in_chronicle',  'Событие вошло в летопись',  'Ваше событие вплетено в летопись',                   'check',    'medal_chronicle', 20),
  ('first_comment', 'Первый комментарий',        'Написали первый комментарий к событию',              'pencil',   null,             30),
  ('chat_50',       '50 сообщений',              'Написали 50 сообщений в чате',                       'user',     'teapot',         40),
  ('likes_10',      '10 лайков',                 'Ваши события собрали 10 «Нравится»',                 'like',     null,             50),
  ('witness_10',    'Очевидец 10 событий',       'Отметились очевидцем у 10 событий',                  'witness',  'binoculars',     60),
  ('first_theory',  'Первая теория',             'Протянули первую нитку между событиями',             'theory',   null,             70),
  ('theory_canon',  'Теория стала каноном',      'Админ признал вашу теорию каноном',                  'theory',   'red_thread',     80),
  ('year_winner',   'Победа в Событии года',     'Ваше событие победило в голосовании «Событие года»', 'trophy',   'cup',            90),
  ('first_case',    'Первое дело',               'Участвовали в первом деле',                          'badge',    null,            100),
  ('acquitted',     'Оправдан',                  'Суд признал вас невиновным',                         'check',    'cactus',        110),
  ('jailed',        'Побывал в камере',          'Отсидели срок в камере',                             'evidence', 'striped_cap',   120)
on conflict (code) do update set title = excluded.title, description = excluded.description, icon = excluded.icon,
  reward_item_code = excluded.reward_item_code, sort_order = excluded.sort_order;

-- 2. Выданные достижения: читают все вошедшие (витрина), пишет только база
create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null references public.achievement_defs(code) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.user_achievements enable row level security;
drop policy if exists user_ach_read on public.user_achievements;
create policy user_ach_read on public.user_achievements for select to authenticated using (true);
revoke all on public.user_achievements from anon;
revoke insert, update, delete, truncate on public.user_achievements from authenticated;
grant select on public.user_achievements to authenticated;
-- старую таблицу больше никто не пишет
revoke insert, update, delete, truncate on public.achievements from anon, authenticated;

-- 3. Условия. Дела (first_case, acquitted, jailed) появятся в T2.12 — пока не выдаются
create or replace function public.check_achievements(p_uid uuid) returns setof text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if p_uid is null then return; end if;
  for c in
    select x from (values
      ('first_event',   exists (select 1 from events where (user_id = p_uid or submitted_by = p_uid) and is_approved)),
      ('in_chronicle',  exists (select 1 from events where (user_id = p_uid or submitted_by = p_uid) and is_in_chronicle)),
      ('first_comment', exists (select 1 from event_comments where user_id = p_uid)),
      ('chat_50',       (select count(*) from chat_messages where user_id = p_uid and not coalesce(is_deleted, false)) >= 50),
      ('likes_10',      (select count(*) from reactions r join events e on r.target_type = 'event' and r.target_id = e.id::text
                          where r.type = 'like' and (e.user_id = p_uid or e.submitted_by = p_uid)) >= 10),
      ('witness_10',    (select count(*) from reactions where user_id = p_uid and type = 'witness') >= 10),
      ('first_theory',  exists (select 1 from theories where author_id = p_uid)),
      ('theory_canon',  exists (select 1 from theories where author_id = p_uid and status = 'canon')),
      ('year_winner',   exists (select 1 from year_polls where winner_user = p_uid))
    ) a(x, ok) where ok
  loop
    insert into user_achievements (user_id, code) values (p_uid, c) on conflict do nothing;
    if found then return next c; end if;
  end loop;
end $$;
revoke execute on function public.check_achievements(uuid) from public, anon, authenticated;

-- для клиента: пересчитать свои (старое имя и подпись сохранены), вернуть новые коды
create or replace function public.refresh_achievements(p_read boolean default false) returns setof text
language sql security definer set search_path = public as $$ select public.check_achievements(auth.uid()) $$;
revoke execute on function public.refresh_achievements(boolean) from public, anon;
grant execute on function public.refresh_achievements(boolean) to authenticated;

-- после значимых действий — пересчёт для того, кого это касается
create or replace function public.ach_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if tg_table_name in ('event_comments', 'chat_messages') then perform public.check_achievements(new.user_id);
  elsif tg_table_name = 'reactions' then
    perform public.check_achievements(new.user_id);
    if new.target_type = 'event' then
      select coalesce(submitted_by, user_id) into owner from events where id::text = new.target_id;
      perform public.check_achievements(owner);
    end if;
  elsif tg_table_name = 'theories' then perform public.check_achievements(new.author_id);
  elsif tg_table_name = 'events' then perform public.check_achievements(coalesce(new.submitted_by, new.user_id));
  elsif tg_table_name = 'year_polls' then perform public.check_achievements(new.winner_user);
  end if;
  return null;
end $$;
revoke execute on function public.ach_after_change() from public, anon, authenticated;

drop trigger if exists ach_comments on public.event_comments;
create trigger ach_comments after insert on public.event_comments for each row execute function public.ach_after_change();
drop trigger if exists ach_chat on public.chat_messages;
create trigger ach_chat after insert on public.chat_messages for each row execute function public.ach_after_change();
drop trigger if exists ach_reactions on public.reactions;
create trigger ach_reactions after insert on public.reactions for each row execute function public.ach_after_change();
drop trigger if exists ach_theories on public.theories;
create trigger ach_theories after insert or update of status on public.theories for each row execute function public.ach_after_change();
drop trigger if exists ach_events on public.events;
create trigger ach_events after insert or update of is_approved, is_in_chronicle on public.events for each row execute function public.ach_after_change();
drop trigger if exists ach_year_polls on public.year_polls;
create trigger ach_year_polls after update of winner_user on public.year_polls for each row execute function public.ach_after_change();

-- страховка по расписанию раз в сутки + первичный расчёт для всех
create or replace function public.check_achievements_all() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select id from profiles loop perform public.check_achievements(u); end loop;
end $$;
revoke execute on function public.check_achievements_all() from public, anon, authenticated;
select public.check_achievements_all();
do $$ begin
  if exists (select 1 from cron.job where jobname = 'check-achievements') then perform cron.unschedule('check-achievements'); end if;
  perform cron.schedule('check-achievements', '23 4 * * *', 'select public.check_achievements_all()');
end $$;

-- 4. Удостоверения: полномочия титула, отзыв админом, проверка подлинности
alter table public.titles add column if not exists grants_authority text[] not null default '{}';

create or replace function public.revoke_title(p_user_title bigint, p_revoke boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare ut user_titles;
begin
  if not public.is_admin() then raise exception 'Только админ' using errcode = '42501'; end if;
  select * into ut from user_titles where id = p_user_title;
  if not found then raise exception 'Удостоверение не найдено' using errcode = '23503'; end if;
  update user_titles set revoked_at = case when p_revoke then now() else null end where id = p_user_title;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_revoke then 'revoke' else 'restore' end, 'user_titles', p_user_title::text,
          jsonb_build_object('user_id', ut.user_id, 'title_id', ut.title_id, 'serial', ut.serial));
end $$;

create or replace function public.verify_credential(p_user_title bigint) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', ut.id, 'title', t.title_name, 'serial', ut.serial, 'holder', p.full_name, 'holder_id', ut.user_id,
    'granted_at', ut.granted_at, 'genuine', true, 'revoked', ut.revoked_at is not null, 'revoked_at', ut.revoked_at,
    'authority', t.grants_authority)
  from user_titles ut join titles t on t.id = ut.title_id left join profiles p on p.id = ut.user_id
  where ut.id = p_user_title and auth.uid() is not null
$$;

revoke execute on function public.revoke_title(bigint, boolean) from public, anon;
revoke execute on function public.verify_credential(bigint) from public, anon;
grant execute on function public.revoke_title(bigint, boolean), public.verify_credential(bigint) to authenticated;
