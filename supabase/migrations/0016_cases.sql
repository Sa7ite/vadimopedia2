-- T2.12: дела (9.12) — открытие, ордер, «к вам пришли», удостоверение, ответ, суд, приговор, камера, апелляция,
-- ложное обвинение, отмена админом. Арест (is_arrested) закрывает события, голоса и общий чат; камера открыта.
-- Писать в таблицы напрямую нельзя: только функции ниже. Сроки снимаются сами по ends_at.

-- 0. Титул с полномочием ареста (выдаёт админ обычным порядком)
insert into public.titles (title_name, title_type, description, icon, grants_authority)
select 'Следователь', 'special', 'Может предъявить удостоверение при аресте', '', array['arrest']
where not exists (select 1 from public.titles where title_name = 'Следователь');

-- 1. Таблицы
create table if not exists public.cases (
  id bigint generated always as identity primary key,
  accuser_id uuid not null references public.profiles(id) on delete cascade,
  defendant_id uuid not null references public.profiles(id) on delete cascade,
  charge text not null check (length(btrim(charge)) between 5 and 500),
  status text not null default 'warrant' check (status in ('warrant', 'arrest', 'trial', 'closed')),
  warrant_by text check (warrant_by in ('admin', 'faction')),
  warrant_at timestamptz,
  door text check (door in ('pending', 'docs_ok', 'opened', 'resisted', 'auto')),
  door_deadline timestamptz,
  credential_id integer references public.user_titles(id) on delete set null,
  docs_checked boolean not null default false,
  resistance boolean not null default false,
  warned boolean not null default false,
  defense text check (defense is null or length(defense) <= 1000),
  defense_at timestamptz,
  trial_ends_at timestamptz,
  verdict text check (verdict in ('guilty', 'acquitted', 'invalid', 'cancelled', 'rejected', 'expired')),
  verdict_by text check (verdict_by in ('admin', 'vote', 'system')),
  false_accusation boolean not null default false,
  sentence_hours int check (sentence_hours is null or sentence_hours between 1 and 720),
  appeals int not null default 0,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (accuser_id <> defendant_id)
);
create index if not exists cases_accuser_idx on public.cases (accuser_id, created_at);
create index if not exists cases_defendant_idx on public.cases (defendant_id);
create index if not exists cases_open_idx on public.cases (status) where status <> 'closed';

create table if not exists public.case_votes (
  case_id bigint not null references public.cases(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('warrant', 'verdict')),
  value text not null check (value in ('support', 'guilty', 'acquit', 'false')),
  created_at timestamptz not null default now(),
  primary key (case_id, user_id, kind)
);

create table if not exists public.sentences (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_id bigint references public.cases(id) on delete set null,
  reason text not null check (reason in ('verdict', 'false_accusation')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  cancelled_at timestamptz
);
create index if not exists sentences_user_idx on public.sentences (user_id, ends_at);

alter table public.cases enable row level security;
alter table public.case_votes enable row level security;
alter table public.sentences enable row level security;
revoke all on public.cases, public.case_votes, public.sentences from anon, authenticated;
grant select on public.cases, public.case_votes, public.sentences to authenticated;
drop policy if exists cases_read on public.cases;
create policy cases_read on public.cases for select to authenticated using (true);
drop policy if exists sentences_read on public.sentences;
create policy sentences_read on public.sentences for select to authenticated using (true);
drop policy if exists case_votes_own on public.case_votes;
create policy case_votes_own on public.case_votes for select to authenticated using (user_id = auth.uid());
-- улики, приложенные к делу, видят все вошедшие (улики вне дел — по-прежнему только владелец)
drop policy if exists evidence_case_read on public.evidence;
create policy evidence_case_read on public.evidence for select to authenticated using (case_id is not null);

drop trigger if exists audit_cases on public.cases;
create trigger audit_cases after insert or update or delete on public.cases for each row execute function public.audit_row();

-- 2. Под арестом ли (срок не отменён и не истёк)
create or replace function public.is_arrested(p_uid uuid default auth.uid()) returns boolean
language sql stable security invoker set search_path = public as $$
  select p_uid is not null and exists (select 1 from sentences where user_id = p_uid and cancelled_at is null and ends_at > now())
$$;
create or replace function public.arrest_until(p_uid uuid) returns timestamptz
language sql stable security invoker set search_path = public as $$
  select max(ends_at) from sentences where user_id = p_uid and cancelled_at is null and ends_at > now()
$$;
revoke execute on function public.is_arrested(uuid), public.arrest_until(uuid) from public, anon;
grant execute on function public.is_arrested(uuid), public.arrest_until(uuid) to authenticated;

-- 3. Чат: общий и камера (каналы фракций добавит T2.13)
alter table public.chat_messages add column if not exists channel text not null default 'general';
alter table public.chat_messages drop constraint if exists chat_messages_channel_check;
alter table public.chat_messages add constraint chat_messages_channel_check check (channel in ('general', 'cell'));
create index if not exists chat_messages_channel_idx on public.chat_messages (channel, created_at);
alter policy chat_select on public.chat_messages using (channel = 'general' or public.is_admin() or public.is_arrested(auth.uid()));

-- 4. Охрана: арестованный не публикует события, не голосует и не пишет в общий чат; в камеру — только арестованные и админ
create or replace function public.arrest_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then return new; end if;              -- служебные вставки (импорт, расписание)
  if tg_table_name = 'chat_messages' then
    if tg_op = 'UPDATE' then new.channel := old.channel; return new; end if;
    if new.channel = 'cell' then
      if not (public.is_arrested(u) or public.is_admin()) then raise exception 'В камеру пишут только арестованные' using errcode = '42501'; end if;
      return new;
    end if;
  end if;
  if public.is_arrested(u) then
    raise exception 'Вы под арестом до % (МСК) — это действие недоступно. Камера открыта в чате.',
      to_char(public.arrest_until(u) at time zone 'Europe/Moscow', 'DD.MM HH24:MI') using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.arrest_guard() from public, anon, authenticated;
drop trigger if exists arrest_guard on public.events;
create trigger arrest_guard before insert on public.events for each row execute function public.arrest_guard();
drop trigger if exists arrest_guard on public.chat_messages;
create trigger arrest_guard before insert or update on public.chat_messages for each row execute function public.arrest_guard();
drop trigger if exists arrest_guard on public.theories;
create trigger arrest_guard before insert on public.theories for each row execute function public.arrest_guard();
drop trigger if exists arrest_guard on public.theory_votes;
create trigger arrest_guard before insert or update on public.theory_votes for each row execute function public.arrest_guard();
drop trigger if exists arrest_guard on public.event_year_votes;
create trigger arrest_guard before insert on public.event_year_votes for each row execute function public.arrest_guard();
drop trigger if exists arrest_guard on public.case_votes;
create trigger arrest_guard before insert or update on public.case_votes for each row execute function public.arrest_guard();

-- 5. Внутреннее: настройка, вердикт, ордер
create or replace function public.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::int from settings where key = p_key), p_default)
$$;
revoke execute on function public.setting_int(text, int) from public, anon, authenticated;

create or replace function public.case_finalize(p_case bigint, p_verdict text, p_by text, p_hours int, p_false boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c cases; h int;
begin
  select * into c from cases where id = p_case for update;
  if c.status = 'closed' then return; end if;
  h := least(greatest(coalesce(p_hours, public.setting_int('sentence.max_hours', 24)), 1), public.setting_int('sentence.max_hours', 24));
  update cases set status = 'closed', verdict = p_verdict, verdict_by = p_by, closed_at = now(),
    false_accusation = (p_verdict = 'acquitted' and coalesce(p_false, false)),
    sentence_hours = case when p_verdict = 'guilty' or (p_verdict = 'acquitted' and coalesce(p_false, false)) then h end
  where id = p_case;
  if p_verdict = 'guilty' then
    insert into sentences (user_id, case_id, reason, ends_at) values (c.defendant_id, p_case, 'verdict', now() + make_interval(hours => h));
  elsif p_verdict = 'acquitted' and coalesce(p_false, false) then
    insert into sentences (user_id, case_id, reason, ends_at) values (c.accuser_id, p_case, 'false_accusation', now() + make_interval(hours => h));
  end if;
end $$;
revoke execute on function public.case_finalize(bigint, text, text, int, boolean) from public, anon, authenticated;

create or replace function public.case_grant_warrant(p_case bigint, p_by text) returns void
language sql security definer set search_path = public as $$
  update cases set status = 'arrest', warrant_by = p_by, warrant_at = now(), door = 'pending',
    door_deadline = now() + make_interval(hours => public.setting_int('arrest.reply_hours', 24))
  where id = p_case and status = 'warrant'
$$;
revoke execute on function public.case_grant_warrant(bigint, text) from public, anon, authenticated;

-- 6. Часы дел: просроченные ордера, молчание за дверью, итог суда по голосам
create or replace function public.case_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r record; g int; a int; f int; vh int := public.setting_int('case.verdict_hours', 72);
begin
  update cases set status = 'closed', verdict = 'expired', verdict_by = 'system', closed_at = now()
    where status = 'warrant' and created_at + make_interval(hours => vh) < now();
  update cases set door = 'auto', status = 'trial', trial_ends_at = now() + make_interval(hours => vh)
    where status = 'arrest' and door in ('pending', 'docs_ok') and door_deadline < now();
  for r in select id from cases where status = 'trial' and trial_ends_at < now() loop
    select count(*) filter (where value = 'guilty'), count(*) filter (where value = 'acquit'), count(*) filter (where value = 'false')
      into g, a, f from case_votes where case_id = r.id and kind = 'verdict';
    if g > a + f then perform public.case_finalize(r.id, 'guilty', 'vote', null, false);
    else perform public.case_finalize(r.id, 'acquitted', 'vote', null, f * 2 > g + a + f); end if;
  end loop;
  -- «Побывал в камере» — после конца срока
  for r in select distinct s.user_id from sentences s where s.cancelled_at is null and s.ends_at <= now()
           and not exists (select 1 from user_achievements ua where ua.user_id = s.user_id and ua.code = 'jailed') loop
    perform public.check_achievements(r.user_id);
  end loop;
end $$;
revoke execute on function public.case_tick() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'case-tick') then perform cron.unschedule('case-tick'); end if;
  perform cron.schedule('case-tick', '*/10 * * * *', 'select public.case_tick()');
end $$;

-- 7. Открыть дело: обвинение + хотя бы одна своя улика; одно в день и одно открытое (из settings)
create or replace function public.open_case(p_defendant uuid, p_charge text, p_evidence bigint[]) returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); nid bigint; n int; ev bigint[] := array(select distinct x from unnest(coalesce(p_evidence, '{}')) x where x is not null);
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if public.is_arrested(u) then raise exception 'Под арестом дела не открывают' using errcode = '42501'; end if;
  if p_defendant is null or p_defendant = u then raise exception 'Против себя дело не открывают' using errcode = '22023'; end if;
  if p_defendant = public.chronicler_id() then raise exception 'Летописец неподсуден' using errcode = '22023'; end if;
  if not exists (select 1 from profiles where id = p_defendant) then raise exception 'Участник не найден' using errcode = 'P0002'; end if;
  if exists (select 1 from profiles where id = p_defendant and role = 'admin') then raise exception 'Против админа дело не открывают' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_charge, ''))) < 5 then raise exception 'Сформулируйте обвинение (от 5 знаков)' using errcode = '22023'; end if;
  if length(btrim(p_charge)) > 500 then raise exception 'Обвинение не длиннее 500 знаков' using errcode = '22023'; end if;
  if cardinality(ev) = 0 then raise exception 'Без улики дело не принимается' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('open_case:' || u::text));
  if (select count(*) from evidence where id = any(ev) and owner_id = u and case_id is null) <> cardinality(ev) then
    raise exception 'Улики должны быть вашими и не приложенными к другому делу' using errcode = '42501';
  end if;
  select count(*) into n from cases where accuser_id = u and created_at > now() - interval '1 day';
  if n >= public.setting_int('case.max_per_day', 1) then raise exception 'Лимит дел в сутки исчерпан (%): следующее — через сутки после предыдущего', public.setting_int('case.max_per_day', 1) using errcode = 'P0001'; end if;
  select count(*) into n from cases where accuser_id = u and status <> 'closed';
  if n >= public.setting_int('case.max_open_per_user', 1) then raise exception 'У вас уже есть открытое дело' using errcode = 'P0001'; end if;
  insert into cases (accuser_id, defendant_id, charge) values (u, p_defendant, btrim(p_charge)) returning id into nid;
  update evidence set case_id = nid where id = any(ev);
  return nid;
end $$;

-- 8. Ордер: голос участника фракции обвинителя или решение админа
create or replace function public.support_warrant(p_case bigint) returns int
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c cases; n int;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  perform public.case_tick();
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Дело не найдено' using errcode = 'P0002'; end if;
  if c.status <> 'warrant' then raise exception 'Ордер по этому делу уже не нужен' using errcode = '22023'; end if;
  if u in (c.accuser_id, c.defendant_id) then raise exception 'Стороны дела за ордер не голосуют' using errcode = '42501'; end if;
  if not exists (select 1 from faction_members a join faction_members b on a.faction_id = b.faction_id where a.user_id = c.accuser_id and b.user_id = u) then
    raise exception 'Ордер поддерживают только участники фракции обвинителя' using errcode = '42501';
  end if;
  insert into case_votes (case_id, user_id, kind, value) values (p_case, u, 'warrant', 'support') on conflict do nothing;
  select count(*) into n from case_votes where case_id = p_case and kind = 'warrant';
  if n >= public.setting_int('warrant.votes_required', 2) then perform public.case_grant_warrant(p_case, 'faction'); end if;
  return n;
end $$;

create or replace function public.admin_warrant(p_case bigint, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if not exists (select 1 from cases where id = p_case and status = 'warrant') then raise exception 'Дело не ждёт ордера' using errcode = '22023'; end if;
  if p_approve then perform public.case_grant_warrant(p_case, 'admin');
  else update cases set status = 'closed', verdict = 'rejected', verdict_by = 'admin', closed_at = now() where id = p_case; end if;
end $$;

-- 9. «К вам пришли»: open — открыть дверь; docs — предъявите документы; resist — не открывать (после проверки)
create or replace function public.answer_door(p_case bigint, p_action text) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c cases; cred integer; ok boolean;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  perform public.case_tick();
  select * into c from cases where id = p_case for update;
  if not found or c.defendant_id <> u then raise exception 'Отвечает только ответчик' using errcode = '42501'; end if;
  if c.status <> 'arrest' then raise exception 'Сейчас за дверью никого нет' using errcode = '22023'; end if;
  if p_action = 'open' then
    update cases set door = 'opened', status = 'trial', trial_ends_at = now() + make_interval(hours => public.setting_int('case.verdict_hours', 72)) where id = p_case;
  elsif p_action = 'docs' then
    if c.door <> 'pending' then raise exception 'Документы уже проверены' using errcode = '22023'; end if;
    -- удостоверение обвинителя с полномочием ареста: сначала действующее
    select ut.id, ut.revoked_at is null into cred, ok from user_titles ut join titles t on t.id = ut.title_id
      where ut.user_id = c.accuser_id and 'arrest' = any(t.grants_authority)
      order by ut.revoked_at is not null, ut.serial limit 1;
    if coalesce(ok, false) then
      update cases set docs_checked = true, credential_id = cred, door = 'docs_ok' where id = p_case;
    else
      update cases set docs_checked = true, credential_id = cred, warned = true, status = 'closed', verdict = 'invalid', verdict_by = 'system', closed_at = now() where id = p_case;
    end if;
  elsif p_action = 'resist' then
    if c.door <> 'docs_ok' then raise exception 'Сначала попросите документы' using errcode = '22023'; end if;
    update cases set door = 'resisted', resistance = true, status = 'trial', trial_ends_at = now() + make_interval(hours => public.setting_int('case.verdict_hours', 72)) where id = p_case;
  else raise exception 'Неизвестное действие' using errcode = '22023';
  end if;
  return (select json_build_object('status', status, 'door', door, 'verdict', verdict, 'credential', case when credential_id is not null then public.verify_credential(credential_id) end) from cases where id = p_case);
end $$;

-- 10. Ответ ответчика (один раз)
create or replace function public.submit_defense(p_case bigint, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c cases;
begin
  select * into c from cases where id = p_case for update;
  if not found or c.defendant_id is distinct from u then raise exception 'Отвечает только ответчик' using errcode = '42501'; end if;
  if c.status not in ('arrest', 'trial') then raise exception 'Ответ принимается до приговора' using errcode = '22023'; end if;
  if c.defense is not null then raise exception 'Ответить можно один раз' using errcode = '23505'; end if;
  if length(btrim(coalesce(p_text, ''))) < 3 or length(btrim(p_text)) > 1000 then raise exception 'Ответ — от 3 до 1000 знаков' using errcode = '22023'; end if;
  update cases set defense = btrim(p_text), defense_at = now() where id = p_case;
end $$;

-- 11. Суд: голос участника (не сторон) или решение админа
create or replace function public.vote_verdict(p_case bigint, p_value text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c cases;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  perform public.case_tick();
  select * into c from cases where id = p_case;
  if not found or c.status <> 'trial' then raise exception 'Суд по этому делу не идёт' using errcode = '22023'; end if;
  if u in (c.accuser_id, c.defendant_id) then raise exception 'Стороны дела не голосуют' using errcode = '42501'; end if;
  if p_value not in ('guilty', 'acquit', 'false') then raise exception 'Голос: виновен, оправдан или обвинение ложное' using errcode = '22023'; end if;
  insert into case_votes (case_id, user_id, kind, value) values (p_case, u, 'verdict', p_value)
    on conflict (case_id, user_id, kind) do update set value = excluded.value, created_at = now();
end $$;

create or replace function public.admin_verdict(p_case bigint, p_verdict text, p_hours int, p_false boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if p_verdict not in ('guilty', 'acquitted') then raise exception 'Исход: виновен или оправдан' using errcode = '22023'; end if;
  if not exists (select 1 from cases where id = p_case and status = 'trial') then raise exception 'Суд по этому делу не идёт' using errcode = '22023'; end if;
  if p_hours is not null and (p_hours < 1 or p_hours > public.setting_int('sentence.max_hours', 24)) then
    raise exception 'Срок — от 1 до % ч', public.setting_int('sentence.max_hours', 24) using errcode = '22023';
  end if;
  perform public.case_finalize(p_case, p_verdict, 'admin', p_hours, p_false);
end $$;

-- 12. Апелляция: проигравшая сторона, один раз (appeal.max), в течение case.verdict_hours после приговора
create or replace function public.appeal_case(p_case bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c cases; vh int := public.setting_int('case.verdict_hours', 72);
begin
  select * into c from cases where id = p_case for update;
  if not found or c.status <> 'closed' or c.verdict not in ('guilty', 'acquitted') then raise exception 'Обжаловать можно только приговор' using errcode = '22023'; end if;
  if not ((c.verdict = 'guilty' and u = c.defendant_id) or (c.verdict = 'acquitted' and u = c.accuser_id)) then
    raise exception 'Обжалует сторона, проигравшая суд' using errcode = '42501';
  end if;
  if c.appeals >= public.setting_int('appeal.max', 1) then raise exception 'Апелляция уже была' using errcode = 'P0001'; end if;
  if c.closed_at + make_interval(hours => vh) < now() then raise exception 'Срок обжалования истёк' using errcode = 'P0001'; end if;
  update sentences set cancelled_at = now() where case_id = p_case and cancelled_at is null;
  delete from case_votes where case_id = p_case and kind = 'verdict';
  update cases set status = 'trial', verdict = null, verdict_by = null, closed_at = null, false_accusation = false, sentence_hours = null,
    appeals = appeals + 1, trial_ends_at = now() + make_interval(hours => vh) where id = p_case;
end $$;

-- 13. Админ отменяет любое дело и приговор — ограничения снимаются сразу
create or replace function public.cancel_case(p_case bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if not exists (select 1 from cases where id = p_case) then raise exception 'Дело не найдено' using errcode = 'P0002'; end if;
  update sentences set cancelled_at = now() where case_id = p_case and cancelled_at is null;
  update cases set status = 'closed', verdict = 'cancelled', verdict_by = 'admin', closed_at = coalesce(closed_at, now()) where id = p_case;
end $$;

-- 14. Чтение: список дел (или одно) со счётчиками, своими голосами, уликами и удостоверением
create or replace function public.get_cases(p_case bigint default null) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  perform public.case_tick();
  return coalesce((select json_agg(x order by (x->>'status' = 'closed'), (x->>'id')::bigint desc) from (
    select json_build_object(
      'id', c.id, 'charge', c.charge, 'status', c.status, 'door', c.door, 'door_deadline', c.door_deadline,
      'accuser_id', c.accuser_id, 'accuser', pa.full_name, 'defendant_id', c.defendant_id, 'defendant', pd.full_name,
      'warrant_by', c.warrant_by, 'warrant_at', c.warrant_at, 'docs_checked', c.docs_checked, 'resistance', c.resistance, 'warned', c.warned,
      'defense', c.defense, 'trial_ends_at', c.trial_ends_at, 'verdict', c.verdict, 'verdict_by', c.verdict_by,
      'false_accusation', c.false_accusation, 'sentence_hours', c.sentence_hours, 'appeals', c.appeals,
      'created_at', c.created_at, 'closed_at', c.closed_at,
      'warrant_votes', (select count(*) from case_votes v where v.case_id = c.id and v.kind = 'warrant'),
      'votes', json_build_object(
        'guilty', (select count(*) from case_votes v where v.case_id = c.id and v.kind = 'verdict' and v.value = 'guilty'),
        'acquit', (select count(*) from case_votes v where v.case_id = c.id and v.kind = 'verdict' and v.value = 'acquit'),
        'false',  (select count(*) from case_votes v where v.case_id = c.id and v.kind = 'verdict' and v.value = 'false')),
      'my_warrant', exists (select 1 from case_votes v where v.case_id = c.id and v.kind = 'warrant' and v.user_id = u),
      'my_verdict', (select v.value from case_votes v where v.case_id = c.id and v.kind = 'verdict' and v.user_id = u),
      'can_warrant', c.status = 'warrant' and u not in (c.accuser_id, c.defendant_id)
        and exists (select 1 from faction_members a join faction_members b on a.faction_id = b.faction_id where a.user_id = c.accuser_id and b.user_id = u),
      'sentence_until', (select max(s.ends_at) from sentences s where s.case_id = c.id and s.cancelled_at is null),
      'credential', case when c.credential_id is not null then public.verify_credential(c.credential_id) end,
      'evidence', (select coalesce(json_agg(json_build_object('id', e.id, 'type', e.target_type, 'text', e.snapshot_text, 'author', e.snapshot_author, 'date', e.snapshot_date) order by e.id), '[]'::json)
                   from evidence e where e.case_id = c.id)
    ) x
    from cases c left join profiles pa on pa.id = c.accuser_id left join profiles pd on pd.id = c.defendant_id
    where p_case is null or c.id = p_case
    order by c.id desc limit 200) s), '[]'::json);
end $$;

-- 15. Достижения: первое дело, оправдан, побывал в камере
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
      ('year_winner',   exists (select 1 from year_polls where winner_user = p_uid)),
      ('first_case',    exists (select 1 from cases where accuser_id = p_uid or defendant_id = p_uid)),
      ('acquitted',     exists (select 1 from cases where defendant_id = p_uid and verdict = 'acquitted')),
      ('jailed',        exists (select 1 from sentences where user_id = p_uid and cancelled_at is null and ends_at <= now()))
    ) a(x, ok) where ok
  loop
    insert into user_achievements (user_id, code) values (p_uid, c) on conflict do nothing;
    if found then return next c; end if;
  end loop;
end $$;
revoke execute on function public.check_achievements(uuid) from public, anon, authenticated;

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
  elsif tg_table_name = 'cases' then perform public.check_achievements(new.accuser_id); perform public.check_achievements(new.defendant_id);
  end if;
  return null;
end $$;
drop trigger if exists ach_cases on public.cases;
create trigger ach_cases after insert or update of verdict on public.cases for each row execute function public.ach_after_change();

-- 16. Права на вызов
revoke execute on function public.open_case(uuid, text, bigint[]), public.support_warrant(bigint), public.admin_warrant(bigint, boolean),
  public.answer_door(bigint, text), public.submit_defense(bigint, text), public.vote_verdict(bigint, text),
  public.admin_verdict(bigint, text, int, boolean), public.appeal_case(bigint), public.cancel_case(bigint), public.get_cases(bigint) from public, anon;
grant execute on function public.open_case(uuid, text, bigint[]), public.support_warrant(bigint), public.admin_warrant(bigint, boolean),
  public.answer_door(bigint, text), public.submit_defense(bigint, text), public.vote_verdict(bigint, text),
  public.admin_verdict(bigint, text, int, boolean), public.appeal_case(bigint), public.cancel_case(bigint), public.get_cases(bigint) to authenticated;
