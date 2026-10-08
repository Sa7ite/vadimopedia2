-- T1.4: фото профиля убраны (файлы удалены через Storage API), загрузка закрыта
update public.profiles set avatar_url = null where avatar_url is not null;
drop policy if exists "avatars_insert_own_folder" on storage.objects;
update storage.buckets set public = false where id = 'avatars';
