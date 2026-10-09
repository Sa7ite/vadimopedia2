-- T2.11: фракции (9.12). Создаёт админ; участник состоит максимум в одной; смена не чаще faction.switch_days.
-- Писать в таблицы напрямую нельзя: только функции ниже.
create table if not exists public.factions (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) between 2 and 40),
  motto text check (motto is null or length(motto) <= 120),
  color text not null default '#6b3fa0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists factions_name_uq on public.factions (lower(btrim(name)));
create table if not exists public.faction_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,   -- primary key = «только в одной»
  faction_id bigint not null references public.factions(id) on delete cascade,
  joined_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);
create index if not exists faction_members_faction_idx on public.faction_members (faction_id);
alter table public.factions enable row level security;
alter table public.faction_members enable row level security;
revoke all on public.factions, public.faction_members from anon, authenticated;
grant select on public.factions, public.faction_members to authenticated;
drop policy if exists factions_read on public.factions;
create policy factions_read on public.factions for select to authenticated using (true);
drop policy if exists faction_members_read on public.faction_members;
create policy faction_members_read on public.faction_members for select to authenticated using (true);

drop trigger if exists audit_factions on public.factions;
create trigger audit_factions after insert or update or delete on public.factions for each row execute function public.audit_row();

-- Список с числом участников
create or replace view public.faction_list with (security_invoker = true) as
select f.id, f.name, f.motto, f.color, f.created_at,
  (select count(*) from faction_members m where m.faction_id = f.id)::int as members
from factions f;
revoke all on public.faction_list from anon;
grant select on public.faction_list to authenticated;

-- Админ: создать / изменить (p_id null = создать)
create or replace function public.save_faction(p_id bigint, p_name text, p_motto text, p_color text) returns bigint
language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Название — от 2 знаков' using errcode = '22023'; end if;
  if p_id is null then
    insert into factions (name, motto, color) values (btrim(p_name), nullif(btrim(coalesce(p_motto, '')), ''), coalesce(nullif(p_color, ''), '#6b3fa0')) returning id into nid;
  else
    update factions set name = btrim(p_name), motto = nullif(btrim(coalesce(p_motto, '')), ''), color = coalesce(nullif(p_color, ''), color) where id = p_id returning id into nid;
    if nid is null then raise exception 'Фракция не найдена' using errcode = 'P0002'; end if;
  end if;
  return nid;
exception when unique_violation then raise exception 'Фракция с таким названием уже есть' using errcode = '23505';
end $$;

-- Админ: удалить (участники остаются без фракции)
create or replace function public.delete_faction(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  delete from factions where id = p_id;
end $$;

-- Вступить или перейти в другую фракцию (первое вступление — без ожидания)
create or replace function public.join_faction(p_faction bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); cur public.faction_members; days int; left_days int;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if not exists (select 1 from factions where id = p_faction) then raise exception 'Фракция не найдена' using errcode = 'P0002'; end if;
  select * into cur from faction_members where user_id = u;
  if found then
    if cur.faction_id = p_faction then return; end if;
    select coalesce((value)::int, 14) into days from settings where key = 'faction.switch_days';
    days := coalesce(days, 14);
    if not public.is_admin() and cur.changed_at > now() - make_interval(days => days) then
      left_days := ceil(extract(epoch from (cur.changed_at + make_interval(days => days) - now())) / 86400)::int;
      raise exception 'Сменить фракцию можно через % дн. (не чаще раза в % дн.)', left_days, days using errcode = 'P0001';
    end if;
    update faction_members set faction_id = p_faction, changed_at = now() where user_id = u;
  else
    insert into faction_members (user_id, faction_id) values (u, p_faction);
  end if;
end $$;

-- Выйти из фракции (считается сменой: вернуться или перейти можно через faction.switch_days — не усложняем: просто удаляем запись)
create or replace function public.leave_faction() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); cur public.faction_members; days int;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  select * into cur from faction_members where user_id = u;
  if not found then return; end if;
  select coalesce((value)::int, 14) into days from settings where key = 'faction.switch_days';
  days := coalesce(days, 14);
  if not public.is_admin() and cur.changed_at > now() - make_interval(days => days) then
    raise exception 'Покинуть фракцию можно не раньше чем через % дн. после вступления', days using errcode = 'P0001';
  end if;
  delete from faction_members where user_id = u;
end $$;

-- Админ: назначить / убрать участника вручную (p_faction null = убрать)
create or replace function public.admin_set_faction(p_user uuid, p_faction bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if p_faction is null then delete from faction_members where user_id = p_user; return; end if;
  insert into faction_members (user_id, faction_id) values (p_user, p_faction)
  on conflict (user_id) do update set faction_id = excluded.faction_id, changed_at = now();
end $$;

revoke execute on function public.save_faction(bigint, text, text, text), public.delete_faction(bigint), public.join_faction(bigint), public.leave_faction(), public.admin_set_faction(uuid, bigint) from public, anon;
grant execute on function public.save_faction(bigint, text, text, text), public.delete_faction(bigint), public.join_faction(bigint), public.leave_faction(), public.admin_set_faction(uuid, bigint) to authenticated;
