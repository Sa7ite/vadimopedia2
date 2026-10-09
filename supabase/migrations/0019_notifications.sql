-- T2.15: уведомления — колокольчик и настройки. Пишет только база (триггеры), читает и отмечает прочитанным — владелец
-- Идемпотентно.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('reply', 'mention', 'comment', 'review', 'case', 'chronicle', 'theory', 'year', 'achievement', 'title')),
  title text not null,
  body text,
  link jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_mark on public.notifications;
create policy notifications_mark on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- настройки: какие виды выключены, «не беспокоить» (без всплывающих окон)
create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted_kinds text[] not null default '{}',
  quiet boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;
drop policy if exists notification_prefs_read on public.notification_prefs;
create policy notification_prefs_read on public.notification_prefs for select to authenticated using (user_id = auth.uid());

create or replace function public.save_notification_prefs(p_muted text[], p_quiet boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if exists (select 1 from unnest(coalesce(p_muted, '{}')) k where k not in ('reply', 'mention', 'comment', 'review', 'case', 'chronicle', 'theory', 'year', 'achievement', 'title')) then
    raise exception 'Неизвестный вид уведомлений' using errcode = '22023';
  end if;
  if 'case' = any(coalesce(p_muted, '{}')) then raise exception 'Уведомления о делах выключить нельзя — это часть игры' using errcode = '22023'; end if;
  insert into notification_prefs (user_id, muted_kinds, quiet, updated_at) values (auth.uid(), coalesce(p_muted, '{}'), coalesce(p_quiet, false), now())
  on conflict (user_id) do update set muted_kinds = excluded.muted_kinds, quiet = excluded.quiet, updated_at = now();
end $$;
revoke execute on function public.save_notification_prefs(text[], boolean) from public, anon;
grant execute on function public.save_notification_prefs(text[], boolean) to authenticated;

-- внутреннее: записать уведомление (с учётом настроек; себе за свои действия — нет)
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text default null, p_link jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = public.chronicler_id() then return; end if;
  if auth.uid() is not null and p_user = auth.uid() and p_kind not in ('achievement', 'year', 'title') then return; end if;
  if exists (select 1 from notification_prefs where user_id = p_user and p_kind = any(muted_kinds)) then return; end if;
  insert into notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, left(p_title, 200), left(p_body, 300), coalesce(p_link, '{}'));
end $$;
revoke execute on function public.notify(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.actor_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from profiles where id = auth.uid()), 'Кто-то')
$$;
revoke execute on function public.actor_name() from public, anon, authenticated;

-- чат: ответ и упоминание
create or replace function public.ntf_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_author uuid; m uuid; who text;
begin
  if new.kind <> 'user' or new.user_id is null then return null; end if;
  select full_name into who from profiles where id = new.user_id;
  if new.reply_to is not null then
    select user_id into parent_author from chat_messages where id = new.reply_to;
    if parent_author is not null and parent_author <> new.user_id then
      perform public.notify(parent_author, 'reply', coalesce(who, 'Кто-то') || ' ответил(а) вам в чате', left(new.message_text, 140),
        jsonb_build_object('section', 'chat', 'channel', new.channel, 'message_id', new.id));
    end if;
  end if;
  foreach m in array coalesce(new.mentions, '{}') loop
    if m is distinct from parent_author then
      perform public.notify(m, 'mention', coalesce(who, 'Кто-то') || ' упомянул(а) вас в чате', left(new.message_text, 140),
        jsonb_build_object('section', 'chat', 'channel', new.channel, 'message_id', new.id));
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.ntf_chat() from public, anon, authenticated;
drop trigger if exists ntf_chat on public.chat_messages;
create trigger ntf_chat after insert on public.chat_messages for each row execute function public.ntf_chat();

-- комментарий к твоему событию
create or replace function public.ntf_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; who text;
begin
  select coalesce(submitted_by, user_id) into owner from events where id = new.event_id;
  select full_name into who from profiles where id = new.user_id;
  if owner is not null and owner <> new.user_id then
    perform public.notify(owner, 'comment', coalesce(who, 'Кто-то') || ' прокомментировал(а) ваше событие', left(new.comment_text, 140),
      jsonb_build_object('event_id', new.event_id));
  end if;
  return null;
end $$;
revoke execute on function public.ntf_comment() from public, anon, authenticated;
drop trigger if exists ntf_comment on public.event_comments;
create trigger ntf_comment after insert on public.event_comments for each row execute function public.ntf_comment();

-- решение модератора по твоему событию
create or replace function public.ntf_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid := coalesce(new.submitted_by, new.user_id);
begin
  if new.is_approved and not coalesce(old.is_approved, false) then
    perform public.notify(owner, 'review', 'Ваше событие опубликовано', left(new.event_text, 140), jsonb_build_object('event_id', new.id));
  elsif new.review_status is not null and new.review_status is distinct from old.review_status then
    perform public.notify(owner, 'review',
      case new.review_status when 'needs_work' then 'Событие вернули на доработку' else 'Событие отклонено' end,
      'Причина: ' || coalesce(new.review_note, '—'), jsonb_build_object('section', 'profile'));
  end if;
  return null;
end $$;
revoke execute on function public.ntf_review() from public, anon, authenticated;
drop trigger if exists ntf_review on public.events;
create trigger ntf_review after update of is_approved, review_status on public.events for each row execute function public.ntf_review();

-- дела: открыто, «к вам пришли», суд, приговор
create or replace function public.ntf_case() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text := '№ ' || lpad(new.id::text, 4, '0'); l jsonb := jsonb_build_object('section', 'cases', 'case_id', new.id);
  v text;
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.defendant_id, 'case', 'Против вас открыто дело ' || n, left(new.charge, 140), l);
    return null;
  end if;
  if new.status = 'arrest' and old.status is distinct from 'arrest' then
    perform public.notify(new.defendant_id, 'case', 'К вам пришли! Дело ' || n, 'Ордер выдан. Ответьте на стук в разделе «Дела».', l);
    perform public.notify(new.accuser_id, 'case', 'Ордер по делу ' || n || ' выдан', null, l);
  elsif new.status = 'trial' and old.status is distinct from 'trial' then
    perform public.notify(new.defendant_id, 'case', 'Дело ' || n || ' передано в суд', 'Можно написать защиту.', l);
    perform public.notify(new.accuser_id, 'case', 'Дело ' || n || ' передано в суд', null, l);
  elsif new.status = 'closed' and old.status is distinct from 'closed' then
    v := case new.verdict when 'guilty' then 'виновен' || coalesce(', срок ' || new.sentence_hours || ' ч', '')
      when 'acquitted' then 'оправдан' || case when new.false_accusation then ' (обвинение признано ложным)' else '' end
      when 'cancelled' then 'дело отменено админом' when 'rejected' then 'в ордере отказано' when 'expired' then 'ордер не получен'
      else coalesce(new.verdict, 'закрыто') end;
    perform public.notify(new.defendant_id, 'case', 'Приговор по делу ' || n, 'Итог: ' || v, l);
    perform public.notify(new.accuser_id, 'case', 'Итог по делу ' || n, 'Итог: ' || v, l);
  end if;
  return null;
end $$;
revoke execute on function public.ntf_case() from public, anon, authenticated;
drop trigger if exists ntf_case on public.cases;
create trigger ntf_case after insert or update of status on public.cases for each row execute function public.ntf_case();

-- новая глава летописи — всем
create or replace function public.ntf_chronicle() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    for p in select id from profiles where id <> public.chronicler_id() loop
      perform public.notify(p.id, 'chronicle', 'В летописи новая глава', null, jsonb_build_object('section', 'chronicle'));
    end loop;
  end if;
  return null;
end $$;
revoke execute on function public.ntf_chronicle() from public, anon, authenticated;
drop trigger if exists ntf_chronicle on public.chronicle_editions;
create trigger ntf_chronicle after update of status on public.chronicle_editions for each row execute function public.ntf_chronicle();

-- голоса за твою теорию
create or replace function public.ntf_theory_vote() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid; who text;
begin
  select author_id into a from theories where id = new.theory_id;
  select full_name into who from profiles where id = new.user_id;
  if a is not null and a <> new.user_id then
    perform public.notify(a, 'theory', coalesce(who, 'Кто-то') || case when new.vote = 'believe' then ' верит' else ' не верит' end || ' вашей теории', null,
      jsonb_build_object('section', 'chronicle', 'theory_id', new.theory_id));
  end if;
  return null;
end $$;
revoke execute on function public.ntf_theory_vote() from public, anon, authenticated;
drop trigger if exists ntf_theory_vote on public.theory_votes;
create trigger ntf_theory_vote after insert on public.theory_votes for each row execute function public.ntf_theory_vote();

-- победитель «События года»
create or replace function public.ntf_year() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.winner_user is not null and new.winner_user is distinct from old.winner_user then
    perform public.notify(new.winner_user, 'year', 'Ваше событие — «Событие ' || new.year || ' года»!', 'Вам выдан премиальный титул с номером удостоверения.',
      jsonb_build_object('event_id', new.winner_event));
  end if;
  return null;
end $$;
revoke execute on function public.ntf_year() from public, anon, authenticated;
drop trigger if exists ntf_year on public.year_polls;
create trigger ntf_year after update of winner_user on public.year_polls for each row execute function public.ntf_year();

-- новое достижение
create or replace function public.ntf_achievement() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select title into t from achievement_defs where code = new.code;
  perform public.notify(new.user_id, 'achievement', 'Новое достижение: ' || coalesce(t, new.code), null, jsonb_build_object('section', 'profile'));
  return null;
end $$;
revoke execute on function public.ntf_achievement() from public, anon, authenticated;
drop trigger if exists ntf_achievement on public.user_achievements;
create trigger ntf_achievement after insert on public.user_achievements for each row execute function public.ntf_achievement();

-- выдан титул
create or replace function public.ntf_title() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select title_name into t from titles where id = new.title_id;
  if t like 'Событие года%' then return null; end if;   -- об этом уже сообщает ntf_year
  perform public.notify(new.user_id, 'title', 'Вам выдан титул «' || coalesce(t, '?') || '»', null, jsonb_build_object('section', 'profile'));
  return null;
end $$;
revoke execute on function public.ntf_title() from public, anon, authenticated;
drop trigger if exists ntf_title on public.user_titles;
create trigger ntf_title after insert on public.user_titles for each row execute function public.ntf_title();

-- хранение: уведомления старше 60 дней удаляются
create or replace function public.purge_old_notifications() returns void
language sql security definer set search_path = public as $$
  delete from notifications where created_at < now() - interval '60 days';
$$;
revoke execute on function public.purge_old_notifications() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'purge-old-notifications') then perform cron.unschedule('purge-old-notifications'); end if;
  perform cron.schedule('purge-old-notifications', '30 3 * * *', 'select public.purge_old_notifications()');
end $$;

-- realtime: колокольчик получает новые записи сразу
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
