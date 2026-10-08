-- T1.7: журнал — поля событий читаем через jsonb, чтобы триггер работал на любых таблицах
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid text; extra jsonb := '{}'; jn jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end; jo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; act text := lower(tg_op);
begin
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
  end if;
  insert into audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), act, tg_table_name, tid, (case when jo is null then jsonb_build_object('new', jn) when jn is null then jsonb_build_object('old', jo) else jsonb_build_object('old', jo, 'new', jn) end) || extra);
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;
