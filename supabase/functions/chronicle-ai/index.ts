// Серверная функция: ИИ-летописец Вадимопедии (OpenRouter).
// Доступна только админам. Ключ берётся из секрета vadimopedia-AI-KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { STYLE, checkStyle, dateKey, parseAnswer, checkPiece, splitBlocks, idsOf, keyOf, findInsertion, buildInsertPrompt, parseInsertAnswer, limitToJunction, checkInsert, applyInsert, deathConflict } from './logic.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Порядок моделей: основная + запасные (OpenRouter сам переключится, если модель недоступна)
// Порядок моделей (проверено 08.10.2026): nemotron стабильно ставит метки; openrouter/free и gemma — запасные
// 09.10.2026 (T2.6): gemma-4 отвечает «Provider returned error», ultra и lightning не укладываются по времени — сравнение в quality-log
const MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'openrouter/free'];
const BATCH_MAX = 5;            // потолок событий за один вызов (настройка ai.batch_size — не больше него)
const ATTEMPT_MS = 70_000;      // время на одну попытку
const TOTAL_MS = 135_000;       // общий запас внутри лимита Edge Function (~150 с)
const CONTEXT_CHARS = 4000;     // сколько конца летописи отдаём для связности

const SYSTEM_PROMPT = `${STYLE}

ПРОДОЛЖЕНИЕ ТЕКСТА
- Тебе дан конец уже написанной летописи — только для связности. Не повторяй и не пересказывай его.
- Напиши ТОЛЬКО продолжение: новые абзацы с новыми событиями, плавно продолжающие последний абзац. Один абзац — одна сцена.
- Новую главу начинай, когда меняется эпоха, место или тема (поле "chapter"). Название главы — короткая фраза, как в книге («Курск пал на исходе зимы»), без слова «Глава» и без номера. Не больше одной новой главы на порцию.
- Существующие метки [[...]] в тексте не трогай.

ФОРМАТ ОТВЕТА — СТРОГО JSON, без пояснений и блоков кода:
{"paragraphs":[{"chapter":null,"text":"Абзац с метками [[ID|фрагмент]]"}],"review_flags":[{"event_id":123,"note":"почему админу стоит проверить"}]}
- "paragraphs" — новые абзацы по порядку. Если с абзаца начинается новая глава, укажи её название в "chapter", иначе null. В "text" не пиши "## ".
- Если событие противоречит уже написанному (например, герой уже погиб), НЕ исправляй противоречие сам: опиши событие как есть и добавь запись в "review_flags". Если противоречий нет — пустой массив.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Нужно войти в аккаунт' }, 401);
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return json({ error: 'Только для администратора' }, 403);

    const apiKey = Deno.env.get('vadimopedia-AI-KEY') ?? Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) return json({ error: 'Ключ OpenRouter не добавлен в секреты Supabase (vadimopedia-AI-KEY)' }, 500);

    const { currentContent = '', events = [], model: onlyModel = null } = await req.json();
    // для проверки моделей админом: можно указать одну бесплатную модель
    const models = typeof onlyModel === 'string' && /^(openrouter\/free|[\w.-]+\/[\w.-]+:free)$/.test(onlyModel) ? [onlyModel] : MODELS;
    if (!Array.isArray(events) || events.length === 0) return json({ error: 'Нет событий для летописи' }, 400);
    const { data: batchRow } = await supabase.from('settings').select('value').eq('key', 'ai.batch_size').maybeSingle();
    const batchMax = Math.min(BATCH_MAX, Math.max(1, Number(batchRow?.value ?? BATCH_MAX) || BATCH_MAX));
    if (events.length > batchMax) return json({ error: `За раз не больше ${batchMax} событий` }, 400);

    const sorted = [...(events as any[])].sort((a, b) => dateKey(a.event_date) - dateKey(b.event_date));
    const base = String(currentContent).trim();
    const blocks = splitBlocks(base);
    const contentIds = [...new Set(blocks.flatMap((b) => idsOf(b.text)))];
    const dup = sorted.filter((e) => contentIds.includes(Number(e.id)));
    if (dup.length) return json({ error: `Эти события уже есть в тексте: ${dup.map((e) => e.id).join(', ')}` }, 400);

    // ai.max_retries из настроек: сколько повторов после первой попытки (по умолчанию 3)
    const { data: retriesRow } = await supabase.from('settings').select('value').eq('key', 'ai.max_retries').maybeSingle();
    const attempts = 1 + Math.min(5, Math.max(0, Number(retriesRow?.value ?? 3) || 0));
    const started = Date.now();
    const problems: string[] = [];
    // Пробуем модели по очереди, пока не уложимся в общий запас времени. handle возвращает результат или текст ошибки
    const run = async (prompt: string, handle: (raw: string, model: string) => any, maxTokens = 4000) => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const left = TOTAL_MS - (Date.now() - started);
        if (left < 15_000) { problems.push('закончилось время'); break; }
        const model = models[attempt % models.length];
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(ATTEMPT_MS, left));
        try {
          const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', signal: ctrl.signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Vadimopedia Chronicle' },
            // думающие модели тратят токены на рассуждения: просим думать коротко и не показывать рассуждения
            body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, reasoning: { effort: 'low', exclude: true }, temperature: 0.8 }),
          });
          const data = await r.json();
          if (!r.ok) { problems.push(`${model}: ${data?.error?.message ?? r.statusText}`); continue; }
          const choice = data?.choices?.[0];
          const raw = choice?.message?.content;
          if (!raw) { problems.push(`${model}: пустой ответ${choice?.finish_reason ? ` (${choice.finish_reason})` : ''}`); continue; }
          if (choice?.finish_reason === 'length') { problems.push(`${model}: обрыв текста`); continue; }
          let res;
          try { res = handle(raw, data.model ?? model); } catch (e) { res = (e as any)?.message ?? 'невалидный JSON'; }
          if (typeof res === 'string') { problems.push(`${model}: ${res}`); continue; }
          return res;
        } catch (e) {
          problems.push(`${model}: ${(e as any)?.name === 'AbortError' ? 'не успела ответить' : String((e as any)?.message ?? e)}`);
        } finally {
          clearTimeout(timer);
        }
      }
      return null;
    };

    // T2.5: событие раньше уже описанных — вставка в середину (по одному за вызов), иначе продолжение в конец
    const { data: rows, error: rowsErr } = await supabase.from('events')
      .select('id, event_date, event_text, city, event_year, event_month, event_day').in('id', [...contentIds, ...sorted.map((e) => Number(e.id))]);
    if (rowsErr) return json({ error: `Не удалось прочитать даты событий: ${rowsErr.message}` }, 500);
    const keyById = new Map<number, number>((rows ?? []).map((r: any) => [Number(r.id), keyOf(r)]));
    const keyFor = (e: any) => keyById.get(Number(e.id)) ?? dateKey(e.event_date);
    const inserts = sorted.map((e) => ({ e, ins: findInsertion(blocks, keyById, keyFor(e)) })).filter((x) => x.ins.isInsert);
    if (inserts.length) {
      const { e, ins } = inserts[0];
      const newId = Number(e.id);
      const context = new Map([...ins.before, ...ins.after].map((x) => [x.id, x.text]));
      const known = [...(rows ?? []), { ...e, id: newId }];
      const out = await run(buildInsertPrompt(ins, e), (raw, model) => {
        const ans = parseInsertAnswer(raw, context);
        const soft: string[] = [];
        const err = limitToJunction(ans, ins, soft) ?? checkInsert(ans, newId, context, known, soft) ?? checkStyle([ans.new_paragraph], [e], soft);
        if (err) return err;
        return { ans, soft, model };
      }, 8000);
      if (!out) return json({ error: `ИИ не справился со вставкой, ничего не изменено. ${problems.join('; ')}` }, 502);
      const { ans, soft, model } = out;
      const changed = new Map(ans.paragraphs.map((p: any) => [p.id, p.text]));
      const window = [
        ...ins.before.map((x) => ({ id: x.id, before: x.text, after: changed.get(x.id) ?? null })),
        { id: 'new', before: '', after: ans.new_paragraph },
        ...ins.after.map((x) => ({ id: x.id, before: x.text, after: changed.get(x.id) ?? null })),
      ];
      const death = deathConflict(String(e.event_text ?? ''), blocks, ins);
      const review_flags = [...(ans.needs_review ? [`№ ${newId}: нужна проверка${ans.note ? ' — ' + ans.note : ''}`] : []), ...(death ? [`№ ${newId}: ${death}`] : []), ...soft];
      return json({
        mode: 'insert', text: applyInsert(blocks, ins, ans), usedIds: [newId], model, seconds: Math.round((Date.now() - started) / 1000), notes: problems,
        review_flags, changes_meaning: ans.changes_meaning, needs_review: ans.needs_review, note: ans.note, window,
        remaining: sorted.length - 1, remaining_inserts: inserts.length - 1,
      });
    }

    const eventsText = sorted.map((e) => [
      `ID: ${e.id}`,
      `Что произошло: ${e.event_text}`,
      e.event_date ? `Когда: ${e.event_date}` : 'Когда: дата не указана',
      e.city ? `Где: ${e.city}` : null,
      `Кто принёс весть: ${e.author}`,
    ].filter(Boolean).join('\n')).join('\n\n');
    const tail = base.length > CONTEXT_CHARS ? base.slice(base.lastIndexOf('\n\n', base.length - CONTEXT_CHARS) + 2) : base;
    const userPrompt = (tail
      ? `КОНЕЦ УЖЕ НАПИСАННОЙ ЛЕТОПИСИ (только для связности, не повторять):\n<<<\n${tail}\n>>>\n\n`
      : `Летопись ещё не начата. Начни её с короткого вступления (2–3 предложения) о том, что это хроника всех Вадимов мира, и первой главы.\n\n`)
      + `НОВЫЕ СОБЫТИЯ (уже по порядку дат), которые нужно вплести в продолжение:\n\n${eventsText}\n\nВерни только JSON с продолжением летописи.`;
    const wanted = sorted.map((e) => Number(e.id));
    const out = await run(`${SYSTEM_PROMPT}\n\n=====\n\n${userPrompt}`, (raw, model) => {
      const answer = parseAnswer(raw);
      const soft: string[] = [];
      const err = checkPiece(answer.paragraphs, wanted, sorted, tail, soft) ?? checkStyle(answer.paragraphs.map((p: any) => p.text), sorted, soft);
      if (err) return err;
      return { answer, soft, model };
    }, 8000);
    if (out) {
      const { answer, soft, model } = out;
      const piece = answer.paragraphs.map((p: any) => (p.chapter ? `## ${p.chapter}\n\n` : '') + p.text).join('\n\n');
      const text = base ? `${base}\n\n${piece}` : piece;
      const review_flags = [...answer.review_flags.map((f: any) => (f.event_id ? `№ ${f.event_id}: ` : '') + f.note), ...soft];
      return json({ mode: 'append', text, model, usedIds: wanted, seconds: Math.round((Date.now() - started) / 1000), notes: problems, review_flags });
    }
    return json({ error: `ИИ не справился, ничего не сохранено. ${problems.join('; ')}` }, 502);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
