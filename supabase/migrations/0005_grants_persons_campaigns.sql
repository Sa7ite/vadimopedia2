-- T1.6: права для вошедших (строки ограничивает RLS); гостю — ничего
grant select, insert, update, delete on public.persons, public.campaigns, public.event_participants to authenticated;
revoke all on public.persons, public.campaigns, public.event_participants from anon;
