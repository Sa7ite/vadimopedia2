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
const BATCH_MAX = 5;            // событий за один вызов (ai.batch_size)
const ATTEMPT_MS = 70_000;      // время на одну попытку
const TOTAL_MS = 135_000;       // общий запас внутри лимита Edge Function (~150 с)
const CONTEXT_CHARS = 4000;     // сколько конца летописи отдаём для связности

const SYSTEM_PROMPT = `Ты — Летописец Вадимопедии: хроники обо всех Вадимах мира. Ты пишешь единую художественную летопись — связный рассказ, который читается как книга, а не как список новостей.

СТИЛЬ
- Слог древнерусской летописи и эпического сказания, но понятный современному читателю: "В лето...", "и было так", "молва разнеслась по земле".
- Лёгкая ирония и теплота: повседневные дела Вадимов звучат величаво, как подвиги.
- Повествование от третьего лица, в прошедшем времени.
- Абзацы по 3–6 предложений, между абзацами — пустая строка.
- Новая глава начинается строкой "## Название главы", когда меняется эпоха, место или тема. Не больше одной главы на 3–5 событий.

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
- Если меняется эпоха, место или тема, начни новую главу строкой "## Название главы".

ФОРМАТ ОТВЕТА
- Верни только текст продолжения: без вступлений, пояснений, кавычек и блоков кода.
- Из разметки используй только "## " для глав и метки [[ID|фрагмент]].
- Пиши только на русском языке, современной орфографией (без "ъ" на конце слов и дореформенных букв). Ни одного английского или иностранного слова.`;

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

function clean(text: string): string {
  let t = text.trim();
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  // убрать служебные вступления
  t = t.replace(/^(вот|ниже)[^\n]{0,80}(летопис|текст)[^\n]*:\s*\n+/i, '');
  t = t.replace(/^летопись пуста\.?[^\n]*\n+/i, '');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/[ \t]+$/gm, '');
  t = t.replace(/^(## [^\n]+)\n(?!\n)/gm, '$1\n\n');
  // если модель повторила фрагмент прямо перед меткой — убрать повтор
  t = t.replace(/([^\n]*?)\s*\[\[(\d+)\|([^\]]+)\]\]/g, (m, before, id, frag) => {
    const f = frag.trim();
    const i = before.lastIndexOf(f);
    if (i !== -1 && before.length - (i + f.length) < 3) return before.slice(0, i) + `[[${id}|${f}]]`;
    return m;
  });
  // каждое событие отмечается один раз: повторные метки превращаем в обычный текст
  const seen = new Set<string>();
  t = t.replace(/\[\[(\d+)\|([^\]]+)\]\]/g, (m, id, frag) => { if (seen.has(id)) return frag; seen.add(id); return m; });
  return t.trim();
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
    if (events.length > BATCH_MAX) return json({ error: `За раз не больше ${BATCH_MAX} событий` }, 400);

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
      + `НОВЫЕ СОБЫТИЯ (уже по порядку дат), которые нужно вплести в продолжение:\n\n${eventsText}\n\nВерни только продолжение летописи.`;

    const wanted = sorted.map((e) => Number(e.id));
    const started = Date.now();
    const problems: string[] = [];
    // пробуем модели по очереди, пока не уложимся в общий запас времени
    for (let attempt = 0; attempt < 4; attempt++) {
      const left = TOTAL_MS - (Date.now() - started);
      if (left < 15_000) break;
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
        const piece = clean(raw);
        const used = [...new Set([...piece.matchAll(/\[\[(\d+)\|/g)].map((m) => Number(m[1])))];
        const missing = wanted.filter((id) => !used.includes(id));
        if (missing.length) { problems.push(`${model}: не отмечены события ${missing.join(', ')}`); continue; }
        if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0590-\u05ff\u0600-\u06ff]/.test(piece)) { problems.push(`${model}: иностранные письмена`); continue; }
        const text = base ? `${base}\n\n${piece}` : piece;
        return json({ text, model: data.model ?? model, usedIds: used, seconds: Math.round((Date.now() - started) / 1000), notes: problems });
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
