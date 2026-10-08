-- T1.7: настройки сайта и журнал действий админа
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  label text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.settings from anon, authenticated;
grant select on public.settings to authenticated;
grant update (value) on public.settings to authenticated;

create or replace function public.settings_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.value) <> 'number' or (new.value)::numeric < 0 or (new.value)::numeric <> trunc((new.value)::numeric) then
    raise exception 'Значение настройки «%» должно быть целым числом от 0', new.key using errcode = '22023';
  end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end $$;
drop trigger if exists settings_check on public.settings;
create trigger settings_check before insert or update on public.settings for each row execute function public.settings_check();
revoke execute on function public.settings_check() from public, anon, authenticated;

insert into public.settings (key, value, label) values
 ('case.max_per_day', '1', 'Дел в день от одного участника'),
 ('case.max_open_per_user', '1', 'Открытых дел на одного участника'),
 ('case.verdict_hours', '72', 'Часов до приговора'),
 ('warrant.votes_required', '2', 'Голосов для ордера'),
 ('sentence.max_hours', '24', 'Максимальный срок наказания, часов'),
 ('appeal.max', '1', 'Апелляций на дело'),
 ('theory.max_per_day', '3', 'Теорий в день'),
 ('faction.switch_days', '14', 'Дней между сменой фракции'),
 ('evidence.ttl_days', '30', 'Дней хранения улик'),
 ('chat.retention_days', '90', 'Дней хранения чата'),
 ('chat.min_interval_sec', '2', 'Секунд между сообщениями в чате'),
 ('year_poll.hours', '72', 'Часов на голосование «Событие года»'),
 ('ai.batch_size', '5', 'Событий за один запуск ИИ (1–5)'),
 ('ai.max_retries', '3', 'Повторов запроса к ИИ'),
 ('arrest.reply_hours', '24', 'Часов на ответ при аресте')
on conflict (key) do nothing;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- Запись в журнал: в details старая и новая версия строки (для отката)
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid text; extra jsonb := '{}';
begin
  if tg_table_name in ('events', 'user_titles') and not public.is_admin() then return coalesce(new, old); end if;
  if tg_table_name = 'events' and tg_op = 'UPDATE' and new.is_approved is not distinct from old.is_approved
     and new.event_text is not distinct from old.event_text and new.event_date is not distinct from old.event_date
     and new.campaign_id is not distinct from old.campaign_id then return new; end if;
  tid := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', to_jsonb(new)->>'key', to_jsonb(old)->>'key');
  if tg_table_name = 'persons' and tg_op = 'DELETE' then
    extra := jsonb_build_object('event_ids', (select coalesce(jsonb_agg(event_id), '[]') from event_participants where person_id = old.id));
  end if;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(),
          case when tg_table_name = 'events' and tg_op = 'UPDATE' and new.is_approved and not coalesce(old.is_approved, false) then 'approve' else lower(tg_op) end,
          tg_table_name, tid,
          jsonb_strip_nulls(jsonb_build_object('old', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                                               'new', case when tg_op <> 'DELETE' then to_jsonb(new) end)) || extra);
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

drop trigger if exists audit_settings on public.settings;
create trigger audit_settings after update on public.settings for each row execute function public.audit_row();
drop trigger if exists audit_persons on public.persons;
create trigger audit_persons after insert or update on public.persons for each row execute function public.audit_row();
drop trigger if exists audit_persons_del on public.persons;
create trigger audit_persons_del before delete on public.persons for each row execute function public.audit_row();
drop trigger if exists audit_campaigns on public.campaigns;
create trigger audit_campaigns after insert or update or delete on public.campaigns for each row execute function public.audit_row();
drop trigger if exists audit_events on public.events;
create trigger audit_events after update or delete on public.events for each row execute function public.audit_row();
drop trigger if exists audit_user_titles on public.user_titles;
create trigger audit_user_titles after insert or delete on public.user_titles for each row execute function public.audit_row();
