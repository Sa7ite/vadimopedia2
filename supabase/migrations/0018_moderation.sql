-- T2.14: модерация — причины отклонения и «на доработку», жалобы, роли, отмена действий из журнала
-- Идемпотентно. Права — только в базе.

-- 1. Журнал: отметка «отменено»
alter table public.audit_log add column if not exists undone_at timestamptz;
alter table public.audit_log add column if not exists undone_by uuid references auth.users(id) on delete set null;

-- 2. События: решение модератора видно автору
alter table public.events add column if not exists review_status text;
alter table public.events add column if not exists review_note text;
alter table public.events add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.events add column if not exists reviewed_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_review_status_check') then
    alter table public.events add constraint events_review_status_check check (review_status in ('needs_work', 'rejected'));
  end if;
end $$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'moderator'))
$$;
revoke execute on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

-- служебный режим отмены (включает только undo_action, только для админа)
create or replace function public.in_undo() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('vp.undo', true), '') = 'on' and public.is_admin()
$$;
revoke execute on function public.in_undo() from public, anon, authenticated;

create or replace function public.protect_event_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.in_undo() then return new; end if;
  if auth.uid() is not null and not public.is_moderator() then
    if old.review_status = 'rejected' then
      raise exception 'Отклонённое событие изменить нельзя — его можно только удалить' using errcode = '42501';
    end if;
    new.is_approved := old.is_approved;
    new.user_id := old.user_id;
    new.as_chronicler := old.as_chronicler;
    new.submitted_by := old.submitted_by;
    new.is_in_chronicle := old.is_in_chronicle;
    new.review_note := old.review_note; new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
    -- исправил после «на доработку» — событие снова в очереди (замечание остаётся для модератора)
    new.review_status := case when old.review_status = 'needs_work'
      and (new.event_text, new.event_date, new.city, new.campaign_id) is distinct from (old.event_text, old.event_date, old.city, old.campaign_id)
      then null else old.review_status end;
  end if;
  return new;
end $$;

create or replace function public.set_user_id_from_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  if auth.uid() is null or public.in_undo() then return new; end if;   -- служебная вставка / восстановление из журнала
  new.user_id := auth.uid();
  new.review_status := null; new.review_note := null; new.reviewed_by := null; new.reviewed_at := null;
  is_admin := public.is_moderator();
  if new.as_chronicler then
    new.submitted_by := auth.uid();
    if is_admin then new.user_id := public.chronicler_id(); new.is_approved := true;
    else new.is_approved := false; end if;
  else
    new.submitted_by := null;
    if is_admin then new.is_approved := true;
    elsif new.is_lore_significant then new.is_approved := false;
    else new.is_approved := true;
    end if;
  end if;
  return new;
end $$;

-- автор правит событие, отправленное на доработку (даже если оно «значимое для летописи»)
drop policy if exists events_update_own_needs_work on public.events;
create policy events_update_own_needs_work on public.events for update to authenticated
  using (auth.uid() = user_id and review_status = 'needs_work') with check (auth.uid() = user_id);

create or replace function public.approve_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модератора' using errcode = '42501'; end if;
  update events set is_approved = true, review_status = null, review_note = null, reviewed_by = auth.uid(), reviewed_at = now(),
    user_id = case when as_chronicler then public.chronicler_id() else user_id end
  where id = p_event_id;
end $$;

create or replace function public.review_event(p_event bigint, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; r text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_moderator() then raise exception 'Только для модератора' using errcode = '42501'; end if;
  if p_decision not in ('reject', 'return') then raise exception 'Неизвестное решение' using errcode = '22023'; end if;
  if length(r) < 3 or length(r) > 500 then raise exception 'Напишите причину: от 3 до 500 знаков' using errcode = '22023'; end if;
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'Событие не найдено' using errcode = 'P0002'; end if;
  if e.is_approved then raise exception 'Событие уже одобрено' using errcode = '22023'; end if;
  update events set review_status = case p_decision when 'reject' then 'rejected' else 'needs_work' end,
    review_note = r, reviewed_by = auth.uid(), reviewed_at = now() where id = p_event;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_decision, 'events', p_event::text,
          jsonb_build_object('reason', r, 'old', jsonb_build_object('event_text', e.event_text, 'review_status', e.review_status, 'review_note', e.review_note)));
end $$;
revoke execute on function public.review_event(bigint, text, text) from public, anon;
grant execute on function public.review_event(bigint, text, text) to authenticated;

-- 3. Журнал: во время отмены не пишем лишнего; при удалении события запоминаем участников
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid text; extra jsonb := '{}'; jn jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end; jo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; act text := lower(tg_op);
begin
  if public.in_undo() then return coalesce(new, old); end if;
  if tg_table_name in ('events', 'user_titles') and not public.is_admin() then return coalesce(new, old); end if;
  if tg_table_name = 'events' and tg_op = 'UPDATE' then
    if (jn->'is_approved') is not distinct from (jo->'is_approved') and (jn->'event_text') is not distinct from (jo->'event_text')
       and (jn->'event_date') is not distinct from (jo->'event_date') and (jn->'campaign_id') is not distinct from (jo->'campaign_id') then
      return new;
    end if;
    if coalesce((jn->>'is_approved')::boolean, false) and not coalesce((jo->>'is_approved')::boolean, false) then act := 'approve'; end if;
  end if;
  tid := coalesce(jn->>'id', jo->>'id', jn->>'key', jo->>'key');
  if tg_table_name = 'persons' and tg_op = 'DELETE' then
    extra := jsonb_build_object('event_ids', (select coalesce(jsonb_agg(event_id), '[]') from event_participants where person_id = (jo->>'id')::uuid));
  elsif tg_table_name = 'events' and tg_op = 'DELETE' then
    extra := jsonb_build_object('person_ids', (select coalesce(jsonb_agg(person_id), '[]') from event_participants where event_id = (jo->>'id')::bigint));
  end if;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), act, tg_table_name, tid, (case when jo is null then jsonb_build_object('new', jn) when jn is null then jsonb_build_object('old', jo) else jsonb_build_object('old', jo, 'new', jn) end) || extra);
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;
-- удаление события пишем ДО каскада, чтобы успеть запомнить участников
drop trigger if exists audit_events on public.events;
create trigger audit_events after update on public.events for each row execute function public.audit_row();
drop trigger if exists audit_events_del on public.events;
create trigger audit_events_del before delete on public.events for each row execute function public.audit_row();

-- чат: восстановление сообщения из журнала
create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); m timestamptz; gap int; last timestamptz;
begin
  if tg_op = 'UPDATE' then
    if u is null or public.in_undo() then return new; end if;    -- служебные правки (расписание, отмена из журнала)
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

-- 4. Жалобы
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('event', 'theory', 'message')),
  target_id text not null,
  target_author uuid,
  snapshot text,
  reason text not null check (length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists reports_one_open on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());

create or replace function public.report_content(p_type text, p_id text, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); r text := btrim(coalesce(p_reason, '')); author uuid; snap text; nid bigint;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if length(r) < 3 or length(r) > 500 then raise exception 'Опишите причину: от 3 до 500 знаков' using errcode = '22023'; end if;
  if (select count(*) from reports where reporter_id = u and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Не больше 10 жалоб в сутки' using errcode = 'P0001';
  end if;
  if p_type = 'event' then
    select coalesce(submitted_by, user_id), event_text into author, snap from events where id::text = p_id and is_approved;
  elsif p_type = 'theory' then
    select author_id, note into author, snap from theories where id::text = p_id and status <> 'removed';
  elsif p_type = 'message' then
    select user_id, message_text into author, snap from chat_messages
      where id::text = p_id and kind = 'user' and not is_deleted and public.can_see_channel(channel);
  else raise exception 'Неизвестный тип' using errcode = '22023';
  end if;
  if not found then raise exception 'Не найдено (возможно, уже удалено)' using errcode = 'P0002'; end if;
  if author = u then raise exception 'На себя пожаловаться нельзя' using errcode = '22023'; end if;
  if exists (select 1 from reports where reporter_id = u and target_type = p_type and target_id = p_id and status = 'open') then
    raise exception 'Вы уже пожаловались — админ разберётся' using errcode = '23505';
  end if;
  insert into reports (reporter_id, target_type, target_id, target_author, snapshot, reason)
  values (u, p_type, p_id, author, left(snap, 1000), r) returning id into nid;
  return nid;
end $$;
revoke execute on function public.report_content(text, text, text) from public, anon;
grant execute on function public.report_content(text, text, text) to authenticated;

-- решение по жалобе: p_remove = убрать материал, иначе отклонить жалобу. Закрывает все жалобы на этот материал
create or replace function public.resolve_report(p_report bigint, p_remove boolean) returns void
language plpgsql security definer set search_path = public as $$
declare rp reports; d jsonb := '{}'; ids jsonb; m chat_messages; th theories; e events;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  select * into rp from reports where id = p_report;
  if rp.id is null then raise exception 'Жалоба не найдена' using errcode = 'P0002'; end if;
  if rp.status <> 'open' then raise exception 'Жалоба уже разобрана' using errcode = '22023'; end if;
  if p_remove then
    if rp.target_type = 'message' then
      select * into m from chat_messages where id::text = rp.target_id;
      if m.id is not null and not m.is_deleted then
        d := jsonb_build_object('text', m.message_text);
        update chat_messages set is_deleted = true, delete_reason = 'Удалено по жалобе', deleted_at = now() where id = m.id;
      end if;
    elsif rp.target_type = 'theory' then
      select * into th from theories where id::text = rp.target_id;
      if th.id is not null and th.status <> 'removed' then
        d := jsonb_build_object('old_status', th.status);
        update theories set status = 'removed', status_changed_at = now() where id = th.id;
        update evidence set original_deleted = true where target_type = 'theory' and target_id = rp.target_id;
      end if;
    elsif rp.target_type = 'event' then
      select * into e from events where id::text = rp.target_id;
      if e.id is not null then
        d := jsonb_build_object('row', to_jsonb(e), 'person_ids', (select coalesce(jsonb_agg(person_id), '[]') from event_participants where event_id = e.id));
        perform set_config('vp.undo', 'on', true);   -- удаление пишем одной записью «по жалобе»
        delete from events where id = e.id;
        perform set_config('vp.undo', 'off', true);
      end if;
    end if;
  end if;
  with upd as (
    update reports set status = case when p_remove then 'removed' else 'dismissed' end, resolved_by = auth.uid(), resolved_at = now()
    where target_type = rp.target_type and target_id = rp.target_id and status = 'open' returning id)
  select jsonb_agg(id) into ids from upd;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_remove then 'report_remove' else 'report_dismiss' end, 'reports', p_report::text,
          d || jsonb_build_object('type', rp.target_type, 'id', rp.target_id, 'report_ids', ids, 'snapshot', left(rp.snapshot, 200), 'reason', rp.reason));
end $$;
revoke execute on function public.resolve_report(bigint, boolean) from public, anon;
grant execute on function public.resolve_report(bigint, boolean) to authenticated;

-- 5. Роли
create or replace function public.set_user_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare old_role text;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if p_role not in ('user', 'moderator', 'admin') then raise exception 'Неизвестная роль' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'Свою роль поменять нельзя' using errcode = '22023'; end if;
  if p_user = public.chronicler_id() then raise exception 'Летописцу роль не меняется' using errcode = '22023'; end if;
  select role into old_role from profiles where id = p_user;
  if not found then raise exception 'Пользователь не найден' using errcode = 'P0002'; end if;
  if old_role = p_role then return; end if;
  update profiles set role = p_role where id = p_user;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'role', 'profiles', p_user::text, jsonb_build_object('old', old_role, 'new', p_role));
end $$;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- список пользователей для админки
create or replace function public.admin_users() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  return coalesce((select json_agg(x order by x.full_name) from (
    select p.id, p.full_name, p.role, p.created_at,
      (select f.name from faction_members fm join factions f on f.id = fm.faction_id where fm.user_id = p.id) faction,
      (select until from chat_mutes where user_id = p.id and until > now()) muted_until,
      public.arrest_until(p.id) arrested_until,
      (select json_agg(json_build_object('id', ut.id, 'title', t.title_name, 'serial', ut.serial, 'revoked', ut.revoked_at is not null) order by ut.id)
         from user_titles ut join titles t on t.id = ut.title_id where ut.user_id = p.id) titles,
      (select count(*) from reports r where r.target_author = p.id and r.status = 'removed') strikes
    from profiles p where p.id <> public.chronicler_id()) x), '[]'::json);
end $$;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- 6. Отмена действия из журнала в один клик
create or replace function public.undo_action(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a audit_log; o jsonb; tbl text; cols text; r jsonb; cur bigint;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  select * into a from audit_log where id = p_id for update;
  if a.id is null then raise exception 'Запись не найдена' using errcode = 'P0002'; end if;
  if a.undone_at is not null then raise exception 'Уже отменено' using errcode = '22023'; end if;
  o := a.details->'old'; tbl := a.target_type;
  perform set_config('vp.undo', 'on', true);

  if tbl = 'cases' then
    perform public.cancel_case(a.target_id::bigint);
  elsif tbl = 'chronicle' and a.action = 'publish' then
    select id into cur from chronicle_editions where status = 'published';
    if cur::text is distinct from a.target_id then raise exception 'Эта версия летописи уже не текущая' using errcode = '22023'; end if;
    perform public.rollback_chronicle();
  elsif tbl = 'chat_mutes' and a.action = 'mute' then
    delete from chat_mutes where user_id::text = a.target_id;
  elsif tbl = 'theory' and a.action = 'theory_status' then
    update theories set status = a.details->>'old', status_changed_at = now() where id::text = a.target_id;
    if a.details->>'old' <> 'removed' then update evidence set original_deleted = false where target_type = 'theory' and target_id = a.target_id; end if;
  elsif tbl = 'user_titles' and a.action in ('revoke', 'restore') then
    update user_titles set revoked_at = case when a.action = 'revoke' then null else now() end where id::text = a.target_id;
  elsif tbl = 'profiles' and a.action = 'role' then
    if a.target_id = auth.uid()::text then raise exception 'Свою роль поменять нельзя' using errcode = '22023'; end if;
    update profiles set role = a.details->>'old' where id::text = a.target_id;
  elsif tbl = 'events' and a.action in ('reject', 'return') then
    update events set review_status = (o->>'review_status'), review_note = (o->>'review_note') where id::text = a.target_id and not is_approved;
    if not found then raise exception 'Событие уже одобрено или удалено' using errcode = '22023'; end if;
  elsif tbl = 'events' and a.action = 'approve' then
    update events set is_approved = false, user_id = (o->>'user_id')::uuid where id::text = a.target_id;
  elsif tbl = 'reports' then
    update reports set status = 'open', resolved_by = null, resolved_at = null
      where id in (select (jsonb_array_elements_text(coalesce(a.details->'report_ids', '[]'::jsonb)))::bigint);
    if a.action = 'report_remove' then
      if a.details->>'type' = 'message' and a.details ? 'text' then
        update chat_messages set is_deleted = false, delete_reason = null, deleted_at = null, message_text = a.details->>'text' where id::text = a.details->>'id';
        update evidence set original_deleted = false where target_type = 'message' and target_id = a.details->>'id';
      elsif a.details->>'type' = 'theory' and a.details ? 'old_status' then
        update theories set status = a.details->>'old_status', status_changed_at = now() where id::text = a.details->>'id';
        update evidence set original_deleted = false where target_type = 'theory' and target_id = a.details->>'id';
      elsif a.details->>'type' = 'event' and a.details ? 'row' then
        insert into events select * from jsonb_populate_record(null::events, a.details->'row');
        insert into event_participants (event_id, person_id)
          select (a.details->>'id')::bigint, (x)::uuid from jsonb_array_elements_text(coalesce(a.details->'person_ids', '[]'::jsonb)) x on conflict do nothing;
        update evidence set original_deleted = false where target_type = 'event' and target_id = a.details->>'id';
      end if;
    end if;
  elsif tbl in ('settings', 'persons', 'campaigns', 'factions', 'events', 'user_titles') and a.action in ('insert', 'update', 'delete') then
    if a.action = 'insert' then
      execute format('delete from public.%I where id::text = $1', tbl) using a.target_id;
    elsif a.action = 'update' then
      if tbl = 'events' then
        select string_agg(format('%I = r.%I', k, k), ', ') into cols from jsonb_object_keys(o) k
          where k in ('event_text', 'event_date', 'city', 'campaign_id', 'is_approved', 'event_year', 'event_month', 'event_day');
      else
        select string_agg(format('%I = r.%I', k, k), ', ') into cols from jsonb_object_keys(o) k
          where k not in ('id', 'key', 'created_at', 'updated_at', 'updated_by');
      end if;
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.%I::text = $2',
                     tbl, cols, tbl, case when tbl = 'settings' then 'key' else 'id' end) using o, a.target_id;
    else -- delete → вернуть строку
      execute format('insert into public.%I overriding system value select * from jsonb_populate_record(null::public.%I, $1)', tbl, tbl) using o;
      if tbl = 'persons' then
        insert into event_participants (event_id, person_id)
          select (x)::bigint, (o->>'id')::uuid from jsonb_array_elements_text(coalesce(a.details->'event_ids', '[]'::jsonb)) x
          where exists (select 1 from events where id = (x)::bigint) on conflict do nothing;
      elsif tbl = 'events' then
        insert into event_participants (event_id, person_id)
          select (o->>'id')::bigint, (x)::uuid from jsonb_array_elements_text(coalesce(a.details->'person_ids', '[]'::jsonb)) x
          where exists (select 1 from persons where id = (x)::uuid) on conflict do nothing;
        update evidence set original_deleted = false where target_type = 'event' and target_id = o->>'id';
      end if;
    end if;
  else
    raise exception 'Это действие отменить нельзя' using errcode = '22023';
  end if;

  perform set_config('vp.undo', 'off', true);
  update audit_log set undone_at = now(), undone_by = auth.uid() where id = p_id;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'undo', a.target_type, a.target_id, jsonb_build_object('undo_of', p_id, 'action', a.action));
end $$;
revoke execute on function public.undo_action(bigint) from public, anon;
grant execute on function public.undo_action(bigint) to authenticated;
