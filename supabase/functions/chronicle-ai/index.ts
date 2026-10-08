// Серверная функция: ИИ-летописец Вадимопедии (OpenRouter).
// Доступна только админам. Ключ берётся из секрета vadimopedia-AI-KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Порядок моделей: основная + запасные (OpenRouter сам переключится, если модель недоступна)
// Порядок моделей (проверено 08.10.2026): nemotron стабильно ставит метки; openrouter/free и gemma — запасные
const MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'openrouter/free', 'google/gemma-4-31b-it:free'];
const BATCH_MAX = 5;            // потолок событий за один вызов (настройка ai.batch_size — не больше него)
const ATTEMPT_MS = 70_000;      // время на одну попытку
const TOTAL_MS = 135_000;       // общий запас внутри лимита Edge Function (~150 с)
const CONTEXT_CHARS = 4000;     // сколько конца летописи отдаём для связности

const SYSTEM_PROMPT = `Ты — Летописец Вадимопедии: хроники обо всех Вадимах мира. Ты пишешь единую художественную летопись — связный рассказ, который читается как книга, а не как список новостей.

СТИЛЬ
- Слог древнерусской летописи и эпического сказания, но понятный современному читателю: "В лето...", "и было так", "молва разнеслась по земле".
- Лёгкая ирония и теплота: повседневные дела Вадимов звучат величаво, как подвиги.
- Повествование от третьего лица, в прошедшем времени.
- Абзацы по 3–6 предложений, между абзацами — пустая строка.
- Новую главу начинай, когда меняется эпоха, место или тема (поле "chapter" в ответе). Не больше одной главы на 3–5 событий.

КАК ВПЛЕТАТЬ СОБЫТИЯ (самое важное)
- Никогда не перечисляй события и не пиши шаблонно "сначала случилось X, затем Y", "вчера произошло: ...", "через час: ...".
- Никогда не копируй текст события дословно — всегда пересказывай другими словами.
- Не повторяй одни и те же связки: "И тогда", "Так", "Спустя" — каждую не больше одного раза на весь новый текст. Начала предложений должны быть разнообразными.
- Перескажи каждое событие своими словами, как сцену: кто, где, зачем, что почувствовали люди вокруг, к чему это привело.
- Связывай события между собой: причина и следствие, отголоски, совпадения, общие места и герои. Переходы делай плавными и разнообразными, не начинай каждый абзац с даты.
- Строго соблюдай хронологию: новые события уже отсортированы по дате — описывай их в этом порядке.
- Даты и места упоминай естественно внутри фраз, переводи их в летописную форму ("в лето 2024-е, в месяц березозол" или просто "весной 2024 года").
- Не выдумывай новых фактов, героев и последствий, которых нет в событиях. Можно добавлять атмосферу и детали обстановки, но смысл события должен остаться точным.
- Автор события — это летописец-очевидец, который принёс весть. Упоминай его изредка и к месту ("как поведал ..."), не в каждом событии.

МЕТКИ СОБЫТИЙ (обязательно)
- Каждое новое событие отметь в тексте ровно один раз: [[ID|фрагмент]], где ID — номер события, а фрагмент — 3–10 слов из твоего пересказа (не исходный текст события и не дата).
- Метка ЗАМЕНЯЕТ фрагмент в предложении, а не добавляется рядом. Текст внутри метки читатель видит как обычную часть предложения, поэтому не повторяй его до или после метки.
- Правильно: "И тогда [[42|Вадим из Коломны распахнул двери своей кофейни]], и запах зёрен поплыл над рекой."
- Неправильно: "Вадим из Коломны распахнул двери своей кофейни [[42|Вадим из Коломны распахнул двери своей кофейни]]".
- Существующие метки [[...]] и старые вставки вида [СОБЫТИЕ: ...] в тексте сохраняй как есть.

ПРОДОЛЖЕНИЕ ТЕКСТА
- Тебе дан конец уже написанной летописи — только для связности. Не повторяй и не пересказывай его.
- Напиши ТОЛЬКО продолжение: новые абзацы с новыми событиями, плавно продолжающие последний абзац.

ФОРМАТ ОТВЕТА — СТРОГО JSON, без пояснений и блоков кода:
{"paragraphs":[{"chapter":null,"text":"Абзац с метками [[ID|фрагмент]]"}],"review_flags":[{"event_id":123,"note":"почему админу стоит проверить"}]}
- "paragraphs" — новые абзацы по порядку. Если с этого абзаца начинается новая глава, укажи её название в "chapter", иначе null.
- В "text" не пиши "## " — заголовок главы только в поле "chapter".
- Если событие противоречит уже написанному (например, герой уже погиб), НЕ исправляй противоречие сам: опиши событие как есть и добавь запись в "review_flags". Если противоречий нет — пустой массив.
- Пиши только на русском языке, современной орфографией (без "ъ" на конце слов и дореформенных букв). Латиницу используй только для имён и слов, которые так написаны в событиях.`;

const MONTH_STEMS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
// Ключ сортировки по дате события (год*10000 + месяц*100 + день); без даты — в конец
function dateKey(raw?: string | null): number {
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const s = raw.toLowerCase().trim();
  let m;
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{1,5})/))) return +m[3] * 10000 + +m[2] * 100 + +m[1];
  if ((m = s.match(/^(\d{1,5})-(\d{1,2})-(\d{1,2})/))) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  if ((m = s.match(/^(\d{1,2})[./](\d{1,5})$/))) return +m[2] * 10000 + +m[1] * 100;
  if ((m = s.match(/^(?:(\d{1,2})\s+)?([а-яё]+)\s+(\d{1,5})/))) {
    const w = m[2];
    const idx = w.startsWith('ма') && !w.startsWith('мар') ? 4 : MONTH_STEMS.findIndex((st, i) => i !== 4 && w.startsWith(st));
    return +m[3] * 10000 + (idx + 1) * 100 + (m[1] ? +m[1] : 0);
  }
  if ((m = s.match(/^(\d{1,5})/))) return +m[1] * 10000;
  return Number.MAX_SAFE_INTEGER;
}

// Убирает лишнее из текста абзаца и дубли меток
function cleanText(text: string): string {
  let t = String(text ?? '').trim();
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^##\s+[^\n]*\n+/, '').replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, ' ');
  // если модель повторила фрагмент прямо перед меткой — убрать повтор
  t = t.replace(/([^\n]*?)\s*\[\[(\d+)\|([^\]]+)\]\]/g, (m, before, id, frag) => {
    const f = frag.trim();
    const i = before.lastIndexOf(f);
    if (i !== -1 && before.length - (i + f.length) < 3) return before.slice(0, i) + `[[${id}|${f}]]`;
    return m;
  });
  return t.trim();
}

// Достаёт JSON из ответа модели; невалидный JSON = неудачная попытка
function parseAnswer(raw: string): { paragraphs: { chapter: string | null; text: string }[]; review_flags: { event_id?: number; note: string }[] } {
  let s = raw.trim().replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('ответ не в формате JSON');
  const obj = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(obj?.paragraphs) || !obj.paragraphs.length) throw new Error('в JSON нет абзацев');
  return {
    paragraphs: obj.paragraphs.map((p: any) => ({ chapter: p?.chapter ? String(p.chapter).replace(/^#+\s*/, '').trim() || null : null, text: cleanText(p?.text) })),
    review_flags: Array.isArray(obj.review_flags) ? obj.review_flags.filter((f: any) => f?.note).map((f: any) => ({ event_id: Number(f.event_id) || undefined, note: String(f.note).slice(0, 300) })) : [],
  };
}

const FOREIGN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f\u0900-\u097f\u10a0-\u10ff]/;
const SERVICE = /летопись пуста|как (языковая )?модель|как ии\b|вот (продолжение|текст)|я не могу|продолжение летописи:|```/i;
const yearsIn = (t: string) => [...t.matchAll(/(?<![\d.])(\d{3,5})(?=\s*(?:-?(?:е|й|го|м|х))?\s*(?:год|г\.|лет|$|[\s,.;:!?)»]))/g)].map((m) => Number(m[1])).filter((y) => y >= 100);
const latinWords = (t: string) => [...t.replace(/\[\[\d+\|/g, '').matchAll(/[A-Za-z][A-Za-z$'-]{1,}/g)].map((m) => m[0].toLowerCase());

// Автопроверка порции (9.2). Возвращает текст ошибки или null; мягкие замечания — в flags
function checkPiece(paras: { chapter: string | null; text: string }[], wanted: number[], sorted: any[], tail: string, flags: string[]): string | null {
  const ids = paras.flatMap((p) => [...p.text.matchAll(/\[\[(\d+)\|/g)].map((m) => Number(m[1])));
  const missing = wanted.filter((id) => !ids.includes(id));
  if (missing.length) return `не отмечены события ${missing.join(', ')}`;
  const extra = ids.filter((id) => !wanted.includes(id));
  if (extra.length) return `лишние метки ${[...new Set(extra)].join(', ')}`;
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) return `событие отмечено дважды: ${[...new Set(dup)].join(', ')}`;
  const all = paras.map((p) => p.text).join('\n');
  if (FOREIGN.test(all) || paras.some((p) => p.chapter && FOREIGN.test(p.chapter))) return 'иностранные письмена';
  if (SERVICE.test(all)) return 'служебные фразы в тексте';
  const mixed = all.replace(/\[\[\d+\|/g, ' ').match(/[A-Za-z]+[А-Яа-яЁё]+|[А-Яа-яЁё]+[A-Za-z]+/);
  if (mixed) return `слово из смешанных алфавитов: ${mixed[0]}`;
  const seen = new Set<string>();
  for (const p of paras) {
    if (p.text.length < 60) return 'слишком короткий абзац';
    if (p.text.length > 1600) return 'слишком длинный абзац';
    const key = p.text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return 'повтор абзаца';
    seen.add(key);
    if (tail && tail.includes(p.text.slice(0, 120))) return 'повтор уже написанного';
  }
  // годы в абзаце: из привязанных событий, из их текста или из прошлого текста летописи
  const byId = new Map(sorted.map((e) => [Number(e.id), e]));
  const tailYears = new Set(yearsIn(tail));
  for (const p of paras) {
    const own = [...p.text.matchAll(/\[\[(\d+)\|/g)].map((m) => byId.get(Number(m[1])));
    const okYears = new Set<number>(tailYears);
    for (const e of (own.length ? own : sorted)) { yearsIn(`${e?.event_date ?? ''} ${e?.event_text ?? ''}`).forEach((y) => okYears.add(y)); (String(e?.event_date ?? '').match(/\d{3,5}/g) ?? []).forEach((y) => okYears.add(Number(y))); }
    const bad = yearsIn(p.text.replace(/\[\[\d+\|/g, '')).filter((y) => !okYears.has(y));
    if (bad.length) return `годы не совпадают с датами событий: ${[...new Set(bad)].join(', ')}`;
  }
  // латиница — только если она есть в событиях или в прошлом тексте (иначе мягкая пометка)
  const known = new Set(latinWords(sorted.map((e) => `${e.event_text} ${e.city ?? ''} ${e.author ?? ''}`).join(' ') + ' ' + tail));
  const strange = [...new Set(latinWords(all).filter((w) => !known.has(w)))];
  if (strange.length) flags.push(`латиница не из событий: ${strange.slice(0, 5).join(', ')}`);
  return null;
}

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

    const { currentContent = '', events = [] } = await req.json();
    if (!Array.isArray(events) || events.length === 0) return json({ error: 'Нет событий для летописи' }, 400);
    const { data: batchRow } = await supabase.from('settings').select('value').eq('key', 'ai.batch_size').maybeSingle();
    const batchMax = Math.min(BATCH_MAX, Math.max(1, Number(batchRow?.value ?? BATCH_MAX) || BATCH_MAX));
    if (events.length > batchMax) return json({ error: `За раз не больше ${batchMax} событий` }, 400);

    const sorted = [...(events as any[])].sort((a, b) => dateKey(a.event_date) - dateKey(b.event_date));
    const eventsText = sorted.map((e) => [
      `ID: ${e.id}`,
      `Что произошло: ${e.event_text}`,
      e.event_date ? `Когда: ${e.event_date}` : 'Когда: дата не указана',
      e.city ? `Где: ${e.city}` : null,
      `Кто принёс весть: ${e.author}`,
    ].filter(Boolean).join('\n')).join('\n\n');

    const base = String(currentContent).trim();
    const tail = base.length > CONTEXT_CHARS ? base.slice(base.lastIndexOf('\n\n', base.length - CONTEXT_CHARS) + 2) : base;
    const userPrompt = (tail
      ? `КОНЕЦ УЖЕ НАПИСАННОЙ ЛЕТОПИСИ (только для связности, не повторять):\n<<<\n${tail}\n>>>\n\n`
      : `Летопись ещё не начата. Начни её с короткого вступления (2–3 предложения) о том, что это хроника всех Вадимов мира, и первой главы.\n\n`)
      + `НОВЫЕ СОБЫТИЯ (уже по порядку дат), которые нужно вплести в продолжение:\n\n${eventsText}\n\nВерни только JSON с продолжением летописи.`;

    const wanted = sorted.map((e) => Number(e.id));
    // ai.max_retries из настроек: сколько повторов после первой попытки (по умолчанию 3)
    const { data: retriesRow } = await supabase.from('settings').select('value').eq('key', 'ai.max_retries').maybeSingle();
    const attempts = 1 + Math.min(5, Math.max(0, Number(retriesRow?.value ?? 3) || 0));
    const started = Date.now();
    const problems: string[] = [];
    // пробуем модели по очереди, пока не уложимся в общий запас времени
    for (let attempt = 0; attempt < attempts; attempt++) {
      const left = TOTAL_MS - (Date.now() - started);
      if (left < 15_000) { problems.push('закончилось время'); break; }
      const model = MODELS[attempt % MODELS.length];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(ATTEMPT_MS, left));
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: ctrl.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Vadimopedia Chronicle' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n=====\n\n${userPrompt}` }],
            max_tokens: 4000,
            reasoning: { exclude: true },
            temperature: 0.8,
          }),
        });
        const data = await r.json();
        if (!r.ok) { problems.push(`${model}: ${data?.error?.message ?? r.statusText}`); continue; }
        const choice = data?.choices?.[0];
        const raw = choice?.message?.content;
        if (!raw) { problems.push(`${model}: пустой ответ`); continue; }
        if (choice?.finish_reason === 'length') { problems.push(`${model}: обрыв текста`); continue; }
        let answer;
        try { answer = parseAnswer(raw); } catch (e) { problems.push(`${model}: ${(e as any)?.message ?? 'невалидный JSON'}`); continue; }
        const soft: string[] = [];
        const err = checkPiece(answer.paragraphs, wanted, sorted, tail, soft);
        if (err) { problems.push(`${model}: ${err}`); continue; }
        const piece = answer.paragraphs.map((p) => (p.chapter ? `## ${p.chapter}\n\n` : '') + p.text).join('\n\n');
        const text = base ? `${base}\n\n${piece}` : piece;
        const review_flags = [...answer.review_flags.map((f) => (f.event_id ? `№ ${f.event_id}: ` : '') + f.note), ...soft];
        return json({ text, model: data.model ?? model, usedIds: wanted, seconds: Math.round((Date.now() - started) / 1000), notes: problems, review_flags });
      } catch (e) {
        problems.push(`${model}: ${(e as any)?.name === 'AbortError' ? 'не успела ответить' : String((e as any)?.message ?? e)}`);
      } finally {
        clearTimeout(timer);
      }
    }
    return json({ error: `ИИ не справился, ничего не сохранено. ${problems.join('; ')}` }, 502);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
