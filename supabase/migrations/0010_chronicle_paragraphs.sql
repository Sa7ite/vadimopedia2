-- T2.3: летопись хранится главами и абзацами с привязкой к событиям (раздел 8, 9.2).
-- В абзацах упоминания размечены {{e:ID|фраза}}. Таблица chronicle остаётся «зеркалом» опубликованной
-- версии в прежнем формате [[ID|фраза]] — её читают страница и ИИ; писать в неё может только база.
create table if not exists public.chronicle_editions (
  id bigint generated always as identity primary key,
  status text not null check (status in ('draft', 'published', 'archived', 'rolled_back')),
  created_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index if not exists chronicle_one_published on public.chronicle_editions ((true)) where status = 'published';
create unique index if not exists chronicle_one_draft on public.chronicle_editions ((true)) where status = 'draft';
create table if not exists public.chronicle_chapters (
  id bigint generated always as identity primary key,
  edition_id bigint not null references public.chronicle_editions(id) on delete cascade,
  position int not null,
  title text,
  unique (edition_id, position)
);
create table if not exists public.chronicle_paragraphs (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.chronicle_chapters(id) on delete cascade,
  position int not null,
  text text not null,
  review_flags jsonb not null default '[]',
  unique (chapter_id, position)
);
create table if not exists public.paragraph_events (
  paragraph_id bigint not null references public.chronicle_paragraphs(id) on delete cascade,
  edition_id bigint not null references public.chronicle_editions(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  primary key (paragraph_id, event_id),
  unique (edition_id, event_id)          -- каждое событие входит в версию ровно один раз
);
alter table public.chronicle_editions enable row level security;
alter table public.chronicle_chapters enable row level security;
alter table public.chronicle_paragraphs enable row level security;
alter table public.paragraph_events enable row level security;
revoke all on public.chronicle_editions, public.chronicle_chapters, public.chronicle_paragraphs, public.paragraph_events from anon, authenticated;
grant select on public.chronicle_editions, public.chronicle_chapters, public.chronicle_paragraphs, public.paragraph_events to authenticated;
drop policy if exists ce_read on public.chronicle_editions;
create policy ce_read on public.chronicle_editions for select to authenticated using (status = 'published' or public.is_admin());
drop policy if exists cc_read on public.chronicle_chapters;
create policy cc_read on public.chronicle_chapters for select to authenticated
  using (exists (select 1 from chronicle_editions e where e.id = edition_id and (e.status = 'published' or public.is_admin())));
drop policy if exists cp_read on public.chronicle_paragraphs;
create policy cp_read on public.chronicle_paragraphs for select to authenticated
  using (exists (select 1 from chronicle_chapters c join chronicle_editions e on e.id = c.edition_id where c.id = chapter_id and (e.status = 'published' or public.is_admin())));
drop policy if exists pe_read on public.paragraph_events;
create policy pe_read on public.paragraph_events for select to authenticated
  using (exists (select 1 from chronicle_editions e where e.id = edition_id and (e.status = 'published' or public.is_admin())));

-- Разбор текста (## глава, абзацы через пустую строку, [[ID|фраза]] или {{e:ID|фраза}}) в версию
create or replace function public.chronicle_build(p_edition bigint, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare line text; buf text := ''; ch bigint; ch_pos int := 0; p_pos int := 0; par bigint; m text[]; ptxt text;
begin
  for line in select x from regexp_split_to_table(replace(coalesce(p_content, ''), E'\r', '') || E'\n', E'\n') x loop
    if line ~ '^##\s+' or btrim(line) = '' then
      if btrim(buf) <> '' then
        if ch is null then
          insert into chronicle_chapters (edition_id, position, title) values (p_edition, 0, null) returning id into ch;
        end if;
        ptxt := regexp_replace(btrim(buf, E' \n'), '\[\[(\d+)\|([^\]]*)\]\]', '{{e:\1|\2}}', 'g');
        p_pos := p_pos + 1;
        insert into chronicle_paragraphs (chapter_id, position, text) values (ch, p_pos, ptxt) returning id into par;
        for m in select regexp_matches(ptxt, '\{\{e:(\d+)\|', 'g') loop
          if not exists (select 1 from events where id = m[1]::bigint) then
            raise exception 'В тексте ссылка на несуществующее событие № %', m[1] using errcode = '23503';
          end if;
          begin
            insert into paragraph_events (paragraph_id, edition_id, event_id) values (par, p_edition, m[1]::bigint);
          exception when unique_violation then
            raise exception 'Событие № % упомянуто в летописи больше одного раза', m[1] using errcode = '23505';
          end;
        end loop;
      end if;
      buf := '';
      if line ~ '^##\s+' then
        ch_pos := ch_pos + 1; p_pos := 0;
        insert into chronicle_chapters (edition_id, position, title) values (p_edition, ch_pos, regexp_replace(line, '^##\s+', '')) returning id into ch;
      end if;
    else
      buf := buf || case when buf = '' then '' else E'\n' end || line;
    end if;
  end loop;
end $$;

-- Сборка версии обратно в текст прежнего формата
create or replace function public.chronicle_render(p_edition bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(block, E'\n\n' order by c.position), '')
  from (
    select c.position,
      concat_ws(E'\n\n', case when c.title is not null then '## ' || c.title end,
        (select string_agg(regexp_replace(p.text, '\{\{e:(\d+)\|([^}]*)\}\}', '[[\1|\2]]', 'g'), E'\n\n' order by p.position)
           from chronicle_paragraphs p where p.chapter_id = c.id)) as block
    from chronicle_chapters c where c.edition_id = p_edition
  ) c;
$$;

-- Опубликовать версию: атомарно, прошлая уходит в архив, зеркало и отметки событий обновляются
create or replace function public.chronicle_publish_internal(p_edition bigint, p_old_status text default 'archived') returns void
language plpgsql security definer set search_path = public as $$
declare txt text;
begin
  update chronicle_editions set status = p_old_status where status = 'published' and id <> p_edition;
  update chronicle_editions set status = 'published', published_at = now() where id = p_edition;
  txt := chronicle_render(p_edition);
  update chronicle set content = txt, version = coalesce(version, 0) + 1, updated_at = now();
  update events set is_in_chronicle = exists (select 1 from paragraph_events pe where pe.edition_id = p_edition and pe.event_id = events.id)
    where is_in_chronicle is distinct from exists (select 1 from paragraph_events pe where pe.edition_id = p_edition and pe.event_id = events.id);
end $$;

create or replace function public.save_chronicle_draft(p_content text, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare ed bigint;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  delete from chronicle_editions where status = 'draft';
  insert into chronicle_editions (status, created_by, note) values ('draft', auth.uid(), p_note) returning id into ed;
  perform chronicle_build(ed, p_content);
  insert into audit_log (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'draft', 'chronicle', ed::text, jsonb_build_object('note', p_note));
  return ed;
end $$;

create or replace function public.publish_chronicle(p_edition bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  if not exists (select 1 from chronicle_editions where id = p_edition and status = 'draft') then
    raise exception 'Черновик не найден' using errcode = '23503';
  end if;
  perform chronicle_publish_internal(p_edition);
  insert into audit_log (actor_id, action, target_type, target_id) values (auth.uid(), 'publish', 'chronicle', p_edition::text);
end $$;

-- Откат: текущая версия помечается «откатанной», публикуется предыдущая из архива
create or replace function public.rollback_chronicle() returns bigint
language plpgsql security definer set search_path = public as $$
declare cur bigint; prev bigint;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  select id into cur from chronicle_editions where status = 'published';
  select id into prev from chronicle_editions where status = 'archived' order by published_at desc nulls last, id desc limit 1;
  if prev is null then raise exception 'Нет предыдущей версии для отката' using errcode = '23503'; end if;
  perform chronicle_publish_internal(prev, 'rolled_back');
  insert into audit_log (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'rollback', 'chronicle', prev::text, jsonb_build_object('from', cur));
  return prev;
end $$;

-- Для редактора: текст черновика (если есть) или опубликованной версии и сведения о версиях
create or replace function public.get_chronicle_editor() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d record; p record;
begin
  if not public.is_admin() then raise exception 'Только для админа' using errcode = '42501'; end if;
  select * into d from chronicle_editions where status = 'draft';
  select * into p from chronicle_editions where status = 'published';
  return jsonb_build_object(
    'draft', case when d.id is not null then jsonb_build_object('id', d.id, 'created_at', d.created_at, 'note', d.note, 'content', chronicle_render(d.id)) end,
    'published', case when p.id is not null then jsonb_build_object('id', p.id, 'published_at', p.published_at, 'content', chronicle_render(p.id)) end,
    'archived_count', (select count(*) from chronicle_editions where status = 'archived'));
end $$;

revoke execute on function public.chronicle_build(bigint, text), public.chronicle_render(bigint), public.chronicle_publish_internal(bigint, text) from public, anon, authenticated;
revoke execute on function public.save_chronicle_draft(text, text), public.publish_chronicle(bigint), public.rollback_chronicle(), public.get_chronicle_editor() from public, anon;
grant execute on function public.save_chronicle_draft(text, text), public.publish_chronicle(bigint), public.rollback_chronicle(), public.get_chronicle_editor() to authenticated;

-- Писать в зеркало и старые версии напрямую больше нельзя
revoke insert, update, delete, truncate, references, trigger on public.chronicle, public.chronicle_versions from anon, authenticated;

-- Перенос текущей летописи (версия 2) без потери текста: строим опубликованную версию и сверяем
do $$
declare ed bigint; orig text; back text;
begin
  if exists (select 1 from chronicle_editions) then return; end if;
  select content into orig from chronicle limit 1;
  insert into chronicle_editions (status, note, published_at) values ('published', 'Перенос версии 2 из старой схемы', now()) returning id into ed;
  perform chronicle_build(ed, orig);
  back := chronicle_render(ed);
  if back <> regexp_replace(btrim(orig, E' \n'), E'\n{3,}', E'\n\n', 'g') then
    raise exception 'Текст после переноса не совпал с исходным (длина % против %)', length(back), length(orig);
  end if;
end $$;
