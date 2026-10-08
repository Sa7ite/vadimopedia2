-- T1.6: разбор дат совпадает с проверкой в форме (период «2035–2040» → год начала, «2024 г.»)
create or replace function public.parse_event_date(raw text, out y int, out m int, out d int)
language plpgsql immutable set search_path = public as $$
declare s text := regexp_replace(regexp_replace(lower(btrim(coalesce(raw, ''))), '\s*(г\.?|года?)$', ''), '\s+', ' ', 'g'); r text[]; months text[] := array['янв','фев','мар','апр','ма','июн','июл','авг','сен','окт','ноя','дек']; i int;
begin
  if s = '' then return; end if;
  if s ~ '^\d{1,2}[./-]\d{1,2}[./-]\d{1,5}$' then r := regexp_match(s, '^(\d{1,2})[./-](\d{1,2})[./-](\d{1,5})$'); d := r[1]::int; m := r[2]::int; y := r[3]::int;
  elsif s ~ '^\d{1,5}-\d{1,2}-\d{1,2}$' then r := regexp_match(s, '^(\d{1,5})-(\d{1,2})-(\d{1,2})$'); y := r[1]::int; m := r[2]::int; d := r[3]::int;
  elsif s ~ '^\d{1,2}[./]\d{1,5}$' then r := regexp_match(s, '^(\d{1,2})[./](\d{1,5})$'); m := r[1]::int; y := r[2]::int;
  elsif s ~ '^\d{1,5}$' then y := s::int;
  elsif s ~ '^\d{3,5}\s*[–—-]\s*\d{3,5}$' then r := regexp_match(s, '^(\d{3,5})\s*[–—-]\s*(\d{3,5})$'); y := r[1]::int;
    if r[2]::int < y then raise exception 'Начало периода позже конца' using errcode = '22008'; end if;
  elsif s ~ '^(\d{1,2}\s+)?[а-яё]+\s+\d{1,5}(\s*(г\.?|года?))?$' then
    r := regexp_match(s, '^(?:(\d{1,2})\s+)?([а-яё]+)\s+(\d{1,5})');
    for i in 1..12 loop
      if (i = 5 and r[2] like 'ма%' and r[2] not like 'мар%') or (i <> 5 and r[2] like months[i] || '%') then m := i; end if;
    end loop;
    if m is null then raise exception 'Не понял месяц в дате «%»', raw using errcode = '22007'; end if;
    d := r[1]::int; y := r[3]::int;
  else raise exception 'Не понял дату «%». Примеры: 2049, 2035–2040, 07.2049, 21.04.2006, 15 марта 2024', raw using errcode = '22007';
  end if;
  if y < 1 or y > 99999 then raise exception 'Год должен быть от 1 до 99999' using errcode = '22008'; end if;
  if m is not null and (m < 1 or m > 12) then raise exception 'Месяца % не бывает', m using errcode = '22008'; end if;
  if d is not null and (d < 1 or d > extract(day from (make_date(least(y, 9999), m, 1) + interval '1 month' - interval '1 day'))) then
    raise exception 'В этом месяце нет % числа', d using errcode = '22008'; end if;
end $$;

select (parse_event_date('2035–2040')).y = 2035 as period_ok, (parse_event_date('2024 г.')).y = 2024 as g_ok;

-- Разметка существующих 89 событий (выполнено один раз 08.10.2026):
-- кампании по годам: ≤950 Дом Венедов; 1930–1943 Тёмный век; 2006–2034 Рождение поколения;
-- 2035–2040 и №414 Первая война; 2041–2046 Междумосковская империя; 2047–2049 Вторая война;
-- №446–448 и ≥2050 После войны. Участники — по алиасам persons.aliases в тексте (ilike).
