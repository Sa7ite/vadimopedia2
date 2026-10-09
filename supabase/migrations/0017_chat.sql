-- T2.13: чат (9.13) — каналы (общий, фракция, камера), ответы, упоминания, реакции, антиспам, мут, системные сообщения, срок хранения.
-- Писать — только своё и только текст; правка сообщения после отправки запрещена (кроме удаления).

-- 1. Поля сообщений
alter table public.chat_messages add column if not exists reply_to bigint references public.chat_messages(id) on delete set null;
alter table public.chat_messages add column if not exists kind text not null default 'user';
alter table public.chat_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.chat_messages alter column user_id drop not null;
alter table public.chat_messages drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check check (kind in ('user', 'system'));
alter table public.chat_messages drop constraint if exists chat_messages_channel_check;
alter table public.chat_messages add constraint chat_messages_channel_check check (channel ~ '^(general|cell|faction:[0-9]+)$');
create index if not exists chat_messages_user_time_idx on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_mentions_idx on public.chat_messages using gin (mentions);

-- 2. Кто видит канал: общий — все; фракция — её участники и админ; камера — арестованные и админ
create or replace function public.can_see_channel(p_channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_channel = 'general' then auth.uid() is not null
    when p_channel = 'cell' then public.is_admin() or public.is_arrested(auth.uid())
    when p_channel like 'faction:%' then public.is_admin()
      or exists (select 1 from faction_members where user_id = auth.uid() and faction_id::text = substr(p_channel, 9))
    else false end
$$;
revoke execute on function public.can_see_channel(text) from public, anon;
grant execute on function public.can_see_channel(text) to authenticated;
alter policy chat_select on public.chat_messages using (public.can_see_channel(channel));

-- 3. Мут (выдаёт админ на время)
create table if not exists public.chat_mutes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  until timestamptz not null,
  reason text check (reason is null or length(reason) <= 200),
  muted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.chat_mutes enable row level security;
revoke all on public.chat_mutes from anon, authenticated;
grant select on public.chat_mutes to authenticated;
drop policy if exists chat_mutes_read on public.chat_mutes;
create policy chat_mutes_read on public.chat_mutes for select to authenticated using (user_id = auth.uid() or public.is_admin());

create or replace function public.mute_user(p_user uuid, p_minutes int, p_reason text default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Себя не мутят' using errcode = '22023'; end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 43200 then raise exception 'Мут — от 0 до 43200 минут (0 — снять)' using errcode = '22023'; end if;
  if p_minutes = 0 then delete from chat_mutes where user_id = p_user; t := null;
  else
    t := now() + make_interval(mins => p_minutes);
    insert into chat_mutes (user_id, until, reason, muted_by) values (p_user, t, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid())
    on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, muted_by = excluded.muted_by, created_at = now();
  end if;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_minutes = 0 then 'unmute' else 'mute' end, 'chat_mutes', p_user::text, jsonb_build_object('minutes', p_minutes, 'reason', p_reason));
  return t;
end $$;

-- 4. Охрана сообщений: автор — сам, только текст до 1000 знаков, канал свой, мут, не чаще chat.min_interval_sec,
--    ответ — в том же канале, упоминания — только реально упомянутые @Имя; после отправки менять можно только удаление
create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); m timestamptz; gap int; last timestamptz;
begin
  if tg_op = 'UPDATE' then
    if u is null then return new; end if;                        -- служебные правки (расписание, тесты)
    new.user_id := old.user_id; new.created_at := old.created_at; new.kind := old.kind; new.reply_to := old.reply_to;
    new.mentions := old.mentions; new.message_text := old.message_text;   -- удаление стирает текст отдельным триггером
    return new;
  end if;
  if coalesce(current_setting('vp.system_post', true), '') = 'on' then new.kind := 'system'; return new; end if;
  new.kind := 'user';
  if u is null then return new; end if;                          -- служебные вставки
  new.user_id := u;
  new.message_text := btrim(coalesce(new.message_text, ''));
  if length(new.message_text) = 0 then raise exception 'Пустое сообщение' using errcode = '22023'; end if;
  if length(new.message_text) > 1000 then raise exception 'Сообщение не длиннее 1000 знаков' using errcode = '22023'; end if;
  if new.channel like 'faction:%' and not public.can_see_channel(new.channel) then raise exception 'Это чат чужой фракции' using errcode = '42501'; end if;
  select until into m from chat_mutes where user_id = u and until > now();
  if found then raise exception 'Вам запрещено писать в чат до % (МСК)', to_char(m at time zone 'Europe/Moscow', 'DD.MM HH24:MI') using errcode = '42501'; end if;
  gap := public.setting_int('chat.min_interval_sec', 2);
  select max(created_at) into last from chat_messages where user_id = u and created_at > now() - make_interval(secs => gap);
  if last is not null then raise exception 'Не так быстро: не чаще одного сообщения в % сек.', gap using errcode = 'P0001'; end if;
  if new.reply_to is not null and not exists (select 1 from chat_messages where id = new.reply_to and channel = new.channel and not is_deleted) then
    new.reply_to := null;
  end if;
  new.mentions := coalesce(array(select p.id from profiles p where p.id = any(coalesce(new.mentions, '{}')) and p.id <> u
                    and position('@' || p.full_name in new.message_text) > 0), '{}');
  return new;
end $$;
revoke execute on function public.chat_guard() from public, anon, authenticated;
drop trigger if exists chat_guard on public.chat_messages;
create trigger chat_guard before insert or update on public.chat_messages for each row execute function public.chat_guard();

-- 5. Системные сообщения (внутреннее)
create or replace function public.post_system(p_channel text, p_text text, p_card jsonb default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  perform set_config('vp.system_post', 'on', true);
  perform set_config('vp.quote_share', 'on', true);   -- разрешает поле card
  insert into chat_messages (user_id, message_text, channel, card) values (null, p_text, p_channel, p_card) returning id into nid;
  perform set_config('vp.system_post', 'off', true);
  perform set_config('vp.quote_share', 'off', true);
  return nid;
end $$;
revoke execute on function public.post_system(text, text, jsonb) from public, anon, authenticated;

-- «Открыто дело»
create or replace function public.sys_case_opened() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.post_system('general',
    'Открыто дело № ' || lpad(new.id::text, 4, '0') || ': ' || coalesce((select full_name from profiles where id = new.accuser_id), '?')
      || ' против ' || coalesce((select full_name from profiles where id = new.defendant_id), '?') || '.',
    jsonb_build_object('type', 'case', 'case_id', new.id));
  return null;
end $$;
revoke execute on function public.sys_case_opened() from public, anon, authenticated;
drop trigger if exists sys_case_opened on public.cases;
create trigger sys_case_opened after insert on public.cases for each row execute function public.sys_case_opened();

-- «Новая глава»: опубликована новая версия летописи
create or replace function public.sys_chronicle_published() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform public.post_system('general', 'В летописи новая глава: опубликована свежая версия. Загляните в «Летопись».', jsonb_build_object('type', 'chronicle'));
  end if;
  return null;
end $$;
revoke execute on function public.sys_chronicle_published() from public, anon, authenticated;
drop trigger if exists sys_chronicle_published on public.chronicle_editions;
create trigger sys_chronicle_published after insert or update of status on public.chronicle_editions for each row execute function public.sys_chronicle_published();

-- «Событие дня»: одно на всех — из популярных (нравится − не нравится > 0), если таких нет — из всех опубликованных
create or replace function public.event_of_day(p_day date default (now() at time zone 'Europe/Moscow')::date) returns bigint
language sql stable security definer set search_path = public as $$
  with score as (
    select e.id, coalesce(sum(case r.type when 'like' then 1 when 'dislike' then -1 else 0 end), 0) s
    from events e left join reactions r on r.target_type = 'event' and r.target_id = e.id::text
    where e.is_approved group by e.id)
  select id from score where s > 0 or not exists (select 1 from score where s > 0)
  order by md5(id::text || p_day::text) limit 1
$$;
revoke execute on function public.event_of_day(date) from public, anon;
grant execute on function public.event_of_day(date) to authenticated;

create or replace function public.sys_event_of_day() returns void
language plpgsql security definer set search_path = public as $$
declare eid bigint := public.event_of_day(); t text;
begin
  if eid is null then return; end if;
  select event_text into t from events where id = eid;
  perform public.post_system('general', 'Событие дня: «' || left(t, 200) || case when length(t) > 200 then '…' else '' end || '»',
    jsonb_build_object('type', 'event', 'event_id', eid));
end $$;
revoke execute on function public.sys_event_of_day() from public, anon, authenticated;

-- 6. Срок хранения: старше chat.retention_days — удалить (и их реакции)
create or replace function public.purge_old_chat() returns void
language plpgsql security definer set search_path = public as $$
declare days int := public.setting_int('chat.retention_days', 90);
begin
  delete from chat_messages where created_at < now() - make_interval(days => days);
  delete from reactions r where r.target_type = 'message' and not exists (select 1 from chat_messages m where m.id::text = r.target_id);
end $$;
revoke execute on function public.purge_old_chat() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'purge-old-chat') then perform cron.unschedule('purge-old-chat'); end if;
  perform cron.schedule('purge-old-chat', '41 3 * * *', 'select public.purge_old_chat()');
  if exists (select 1 from cron.job where jobname = 'event-of-day') then perform cron.unschedule('event-of-day'); end if;
  perform cron.schedule('event-of-day', '0 6 * * *', 'select public.sys_event_of_day()');   -- 09:00 МСК
end $$;

-- 7. Системные сообщения не задерживает охрана ареста (публикацию летописи может делать и админ под арестом)
create or replace function public.arrest_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null or coalesce(current_setting('vp.system_post', true), '') = 'on' then return new; end if;
  if tg_table_name = 'chat_messages' then
    if tg_op = 'UPDATE' then new.channel := old.channel; return new; end if;
    if new.channel = 'cell' then
      if not (public.is_arrested(u) or public.is_admin()) then raise exception 'В камеру пишут только арестованные' using errcode = '42501'; end if;
      return new;
    end if;
    if new.channel like 'faction:%' then return new; end if;     -- чат фракции арест не закрывает (закрыт только общий)
  end if;
  if public.is_arrested(u) then
    raise exception 'Вы под арестом до % (МСК) — это действие недоступно. Камера открыта в чате.',
      to_char(public.arrest_until(u) at time zone 'Europe/Moscow', 'DD.MM HH24:MI') using errcode = '42501';
  end if;
  return new;
end $$;

-- 8. Права на вызов
revoke execute on function public.mute_user(uuid, int, text) from public, anon;
grant execute on function public.mute_user(uuid, int, text) to authenticated;
