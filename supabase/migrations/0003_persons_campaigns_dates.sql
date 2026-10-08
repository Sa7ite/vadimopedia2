-- T1.6: справочники участников и кампаний, связи с событиями, проверка даты события в базе
create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  bio_short text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.event_participants (
  event_id bigint not null references public.events(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  primary key (event_id, person_id)
);
create index if not exists event_participants_person_idx on public.event_participants(person_id);
alter table public.events add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.events add column if not exists event_year int;
alter table public.events add column if not exists event_month int;
alter table public.events add column if not exists event_day int;
create index if not exists events_campaign_idx on public.events(campaign_id);

alter table public.persons enable row level security;
alter table public.campaigns enable row level security;
alter table public.event_participants enable row level security;
revoke all on public.persons, public.campaigns, public.event_participants from anon;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists persons_read on public.persons;
create policy persons_read on public.persons for select to authenticated using (true);
drop policy if exists persons_admin on public.persons;
create policy persons_admin on public.persons for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns for select to authenticated using (true);
drop policy if exists campaigns_admin on public.campaigns;
create policy campaigns_admin on public.campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ep_read on public.event_participants;
create policy ep_read on public.event_participants for select to authenticated using (true);
-- участников события меняет тот, кто может править событие: автор обычного события или админ для значимых
drop policy if exists ep_write on public.event_participants;
create policy ep_write on public.event_participants for all to authenticated
  using (exists (select 1 from events e where e.id = event_id and ((e.user_id = auth.uid() and not e.is_lore_significant) or e.submitted_by = auth.uid() and not e.is_approved or (public.is_admin() and (e.is_lore_significant or e.user_id = auth.uid() or e.user_id = public.chronicler_id())))))
  with check (exists (select 1 from events e where e.id = event_id and ((e.user_id = auth.uid() and not e.is_lore_significant) or e.submitted_by = auth.uid() and not e.is_approved or (public.is_admin() and (e.is_lore_significant or e.user_id = auth.uid() or e.user_id = public.chronicler_id())))));

-- Разбор и проверка даты события: «21.04.2006», «07.2049», «2049», «2049-04-21», «15 марта 2024». Год 1–99999.
create or replace function public.parse_event_date(raw text, out y int, out m int, out d int)
language plpgsql immutable set search_path = public as $$
declare s text := lower(btrim(coalesce(raw, ''))); r text[]; months text[] := array['янв','фев','мар','апр','ма','июн','июл','авг','сен','окт','ноя','дек']; i int;
begin
  if s = '' then return; end if;
  if s ~ '^\d{1,2}[./-]\d{1,2}[./-]\d{1,5}$' then r := regexp_match(s, '^(\d{1,2})[./-](\d{1,2})[./-](\d{1,5})$'); d := r[1]::int; m := r[2]::int; y := r[3]::int;
  elsif s ~ '^\d{1,5}-\d{1,2}-\d{1,2}$' then r := regexp_match(s, '^(\d{1,5})-(\d{1,2})-(\d{1,2})$'); y := r[1]::int; m := r[2]::int; d := r[3]::int;
  elsif s ~ '^\d{1,2}[./]\d{1,5}$' then r := regexp_match(s, '^(\d{1,2})[./](\d{1,5})$'); m := r[1]::int; y := r[2]::int;
  elsif s ~ '^\d{1,5}$' then y := s::int;
  elsif s ~ '^(\d{1,2}\s+)?[а-яё]+\s+\d{1,5}(\s*(г\.?|года?))?$' then
    r := regexp_match(s, '^(?:(\d{1,2})\s+)?([а-яё]+)\s+(\d{1,5})');
    for i in 1..12 loop
      if (i = 5 and r[2] like 'ма%' and r[2] not like 'мар%') or (i <> 5 and r[2] like months[i] || '%') then m := i; end if;
    end loop;
    if m is null then raise exception 'Не понял месяц в дате «%»', raw using errcode = '22007'; end if;
    d := r[1]::int; y := r[3]::int;
  else raise exception 'Не понял дату «%». Примеры: 2049, 07.2049, 21.04.2006, 15 марта 2024', raw using errcode = '22007';
  end if;
  if y < 1 or y > 99999 then raise exception 'Год должен быть от 1 до 99999' using errcode = '22008'; end if;
  if m is not null and (m < 1 or m > 12) then raise exception 'Месяца % не бывает', m using errcode = '22008'; end if;
  if d is not null and (d < 1 or d > extract(day from (make_date(least(y, 9999), m, 1) + interval '1 month' - interval '1 day'))) then
    raise exception 'В этом месяце нет % числа', d using errcode = '22008'; end if;
end $$;

create or replace function public.events_fill_date() returns trigger
language plpgsql set search_path = public as $$
declare p record;
begin
  if tg_op = 'INSERT' or new.event_date is distinct from old.event_date or (new.event_year is null and new.event_date is not null) then
    select * into p from public.parse_event_date(new.event_date);
    new.event_year := p.y; new.event_month := p.m; new.event_day := p.d;
  end if;
  return new;
end $$;
drop trigger if exists events_fill_date on public.events;
create trigger events_fill_date before insert or update on public.events
  for each row execute function public.events_fill_date();
revoke execute on function public.events_fill_date() from public, anon, authenticated;

alter table public.events drop constraint if exists events_year_range;
alter table public.events add constraint events_year_range check (event_year is null or event_year between 1 and 99999);

-- Начальные списки [по умолчанию, управляет админ]
insert into public.campaigns (name, sort_order) values
 ('Дом Венедов',1),('Тёмный век',2),('Рождение поколения',3),('Первая война',4),('Междумосковская империя',5),('Вторая война',6),('После войны',7)
on conflict (name) do nothing;
insert into public.persons (name, aliases, sort_order) values
 ('Вадим Венедский', '{Венедск}', 1),
 ('Вадим Школов', '{Школов}', 2),
 ('KENTA$$ (Артемий Савинов)', '{KENTA$$,Кентас,Савинов}', 3),
 ('Максим Левашов', '{Левашов,Ubilfashion}', 4),
 ('Tony Ray', '{Tony Ray,Тони Рэ}', 5),
 ('Кулаев Давид', '{Кулаев}', 6),
 ('Артемий Иванков', '{Иванков}', 7),
 ('Бурлак Михаил', '{Бурлак}', 8),
 ('МкАДКИД', '{МкАДКИД}', 9),
 ('Андрей Перетятько', '{Перетятько}', 10)
on conflict (name) do nothing;

-- Заполнить разобранные даты у существующих событий
update public.events set event_date = event_date where event_year is null and event_date is not null;
