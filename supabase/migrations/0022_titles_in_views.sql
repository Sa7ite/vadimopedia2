-- 0022_titles_in_views: название события доступно в виде theory_list и в голосовании «Событие года».
-- Новые колонки добавлены в конец вида, прежние не тронуты.
create or replace view public.theory_list with (security_invoker = true) as
 SELECT t.id,
    t.author_id,
    p.full_name AS author_name,
    t.event_a,
    t.event_b,
    t.note,
    t.status,
    t.created_at,
    ea.event_text AS event_a_text,
    ea.event_date AS event_a_date,
    eb.event_text AS event_b_text,
    eb.event_date AS event_b_date,
    (( SELECT count(*) AS count FROM theory_votes v WHERE ((v.theory_id = t.id) AND (v.vote = 'believe'::text))))::integer AS believe,
    (( SELECT count(*) AS count FROM theory_votes v WHERE ((v.theory_id = t.id) AND (v.vote = 'doubt'::text))))::integer AS doubt,
    ( SELECT v.vote FROM theory_votes v WHERE ((v.theory_id = t.id) AND (v.user_id = auth.uid()))) AS my_vote,
    ea.title AS event_a_title,
    eb.title AS event_b_title
   FROM (((theories t
     LEFT JOIN profiles p ON ((p.id = t.author_id)))
     JOIN events ea ON ((ea.id = t.event_a)))
     LEFT JOIN events eb ON ((eb.id = t.event_b)));

create or replace function public.get_year_poll(p_year integer)
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  return (select json_build_object(
    'poll', (select row_to_json(p) from year_polls p where p.year = p_year),
    'my_vote', (select event_id from event_year_votes where user_id = u and year = p_year),
    'events', coalesce((select json_agg(x order by x.votes desc, x.id) from (
      select e.id, e.event_text, e.title, e.event_date,
        (select count(*) from event_year_votes v where v.event_id = e.id and v.year = p_year)::int as votes,
        (e.user_id = u or e.submitted_by = u) as own
      from events e where e.is_approved and e.event_year = p_year) x), '[]')));
end $function$;
