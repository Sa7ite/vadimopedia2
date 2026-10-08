-- T1.0: базовая безопасность (идемпотентно)
-- 1. Анонимы (без входа) больше не читают профили, события и чат
revoke select on public.profiles, public.events, public.chat_messages from anon;

-- 2. Титулы: пользователь может только включать/выключать свой титул, но не подменять его
create or replace function public.protect_user_titles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    new.title_id := old.title_id;
    new.user_id := old.user_id;
    new.granted_by := old.granted_by;
    new.granted_at := old.granted_at;
  end if;
  return new;
end $$;
drop trigger if exists protect_user_titles on public.user_titles;
create trigger protect_user_titles before update on public.user_titles
  for each row execute function public.protect_user_titles();

-- 3. Фиксированный путь поиска у служебной функции
create or replace function public.chronicler_id() returns uuid
language sql immutable set search_path = public
as $$ select '0c0c0c0c-1e70-4c0c-8c0c-000000000001'::uuid $$;

-- 4. Функции с правами владельца не вызываются анонимами
revoke execute on function public.approve_event(bigint) from public, anon;
revoke execute on function public.refresh_achievements(boolean) from public, anon;
grant execute on function public.approve_event(bigint) to authenticated;
grant execute on function public.refresh_achievements(boolean) to authenticated;

-- 5. Страховка летописи: текущая версия сохраняется в истории, чтобы «откат» не мог стереть текст
insert into public.chronicle_versions (chronicle_id, content, version)
select c.id, c.content, c.version from public.chronicle c
where not exists (select 1 from public.chronicle_versions v where v.version = c.version and v.content = c.content);
revoke execute on function public.protect_user_titles() from public, anon, authenticated;
