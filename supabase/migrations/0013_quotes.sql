-- T2.9: коллекция цитат — дословная фраза из события или летописи (до 300 знаков), публичная полка, карточка в чат
-- Идемпотентно. Добавлять цитаты и отправлять карточки — только через функции.

alter table public.quotes add column if not exists source_type text not null default 'event';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_source_type_check') then
    alter table public.quotes add constraint quotes_source_type_check check (source_type in ('event', 'chronicle'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quotes_length_check') then
    alter table public.quotes add constraint quotes_length_check check (char_length(quote_text) between 3 and 300);
  end if;
end $$;
create unique index if not exists quotes_unique_per_user on public.quotes (user_id, source_type, coalesce(event_id, 0), quote_text);
create index if not exists quotes_user_idx on public.quotes (user_id, created_at desc);

drop policy if exists q_read on public.quotes;
drop policy if exists q_ins on public.quotes;
create policy q_read on public.quotes for select to authenticated using (true);
revoke all on public.quotes from anon;
revoke insert, update, truncate on public.quotes from authenticated;
grant select, delete on public.quotes to authenticated;

-- сравнение без учёта лишних пробелов и переносов
create or replace function public.norm_space(t text) returns text
language sql immutable set search_path = public as $$ select regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g') $$;

-- текст летописи так, как его видит читатель: без меток [[N|…]] и знаков глав
create or replace function public.chronicle_plain(t text) returns text
language sql immutable set search_path = public as $$
  select public.norm_space(regexp_replace(regexp_replace(coalesce(t, ''), '\[\[\d+\|([^\]]*)\]\]', '\1', 'g'), '(^|\n)#{1,3}\s+', '\1', 'g'))
$$;

create or replace function public.add_quote(p_text text, p_event bigint default null, p_source text default 'event') returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); t text := public.norm_space(p_text); e events; src text; nid bigint;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  if char_length(t) < 3 then raise exception 'Выделите фразу подлиннее' using errcode = '22023'; end if;
  if char_length(t) > 300 then raise exception 'Цитата не длиннее 300 знаков' using errcode = '22023'; end if;
  if p_event is not null then
    select * into e from events where id = p_event and (is_approved or user_id = u or submitted_by = u);
    if not found then raise exception 'Событие не найдено' using errcode = '23503'; end if;
  end if;
  if p_source = 'event' then
    if p_event is null then raise exception 'Не указано событие' using errcode = '22023'; end if;
    if position(t in public.norm_space(e.event_text)) = 0 then
      raise exception 'Цитата должна быть дословной: выделите фразу прямо в тексте события' using errcode = '22023';
    end if;
    src := 'Событие № ' || e.id || coalesce(', ' || e.event_date, '');
  elsif p_source = 'chronicle' then
    if position(t in (select public.chronicle_plain(content) from chronicle limit 1)) = 0 then
      raise exception 'Цитата должна быть дословной: выделите фразу прямо в летописи' using errcode = '22023';
    end if;
    src := 'Летопись' || coalesce(', событие № ' || e.id, '');
  else
    raise exception 'Неизвестный источник' using errcode = '22023';
  end if;
  insert into quotes (user_id, quote_text, source, event_id, source_type) values (u, t, src, p_event, p_source)
  on conflict do nothing returning id into nid;
  if nid is null then raise exception 'Эта цитата уже в вашей коллекции' using errcode = '23505'; end if;
  return nid;
end $$;

-- карточка цитаты в чате: снимок цитаты, подделать карточку обычной вставкой нельзя
alter table public.chat_messages add column if not exists card jsonb;
create or replace function public.chat_card_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('vp.quote_share', true), '') <> 'on' then
    new.card := case when tg_op = 'UPDATE' then old.card else null end;
  end if;
  return new;
end $$;
drop trigger if exists chat_card_guard on public.chat_messages;
create trigger chat_card_guard before insert or update on public.chat_messages for each row execute function public.chat_card_guard();
revoke execute on function public.chat_card_guard() from public, anon, authenticated;

create or replace function public.share_quote_to_chat(p_quote bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); q quotes; who text; nid bigint;
begin
  if u is null then raise exception 'Нужно войти' using errcode = '42501'; end if;
  select * into q from quotes where id = p_quote;
  if not found then raise exception 'Цитата не найдена' using errcode = '23503'; end if;
  select full_name into who from profiles where id = q.user_id;
  perform set_config('vp.quote_share', 'on', true);
  insert into chat_messages (user_id, message_text, card)
  values (u, '«' || q.quote_text || '» — ' || q.source,
          jsonb_build_object('type', 'quote', 'quote_id', q.id, 'quote', q.quote_text, 'source', q.source, 'event_id', q.event_id, 'collector', coalesce(who, 'Аноним')))
  returning id into nid;
  perform set_config('vp.quote_share', 'off', true);
  return nid;
end $$;

revoke execute on function public.add_quote(text, bigint, text) from public, anon;
revoke execute on function public.share_quote_to_chat(bigint) from public, anon;
grant execute on function public.add_quote(text, bigint, text), public.share_quote_to_chat(bigint) to authenticated;
