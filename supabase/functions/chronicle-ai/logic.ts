// Чистая логика летописца: разбор, автопроверка, вставка в середину. Без обращений к сети — проверяется тестами.
export const MONTH_STEMS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
// Ключ сортировки по дате события (год*10000 + месяц*100 + день); без даты — в конец
export function dateKey(raw?: string | null): number {
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
export function cleanText(text: string): string {
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
export function parseAnswer(raw: string): { paragraphs: { chapter: string | null; text: string }[]; review_flags: { event_id?: number; note: string }[] } {
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

export const FOREIGN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f\u0900-\u097f\u10a0-\u10ff]/;
export const SERVICE = /летопись пуста|как (языковая )?модель|как ии\b|вот (продолжение|текст)|я не могу|продолжение летописи:|```/i;
export const yearsIn = (t: string) => [...t.matchAll(/(?<![\d.])(\d{3,5})(?=\s*(?:-?(?:е|й|го|м|х))?\s*(?:год|г\.|лет|$|[\s,.;:!?)»]))/g)].map((m) => Number(m[1])).filter((y) => y >= 100);
export const latinWords = (t: string) => [...t.replace(/\[\[\d+\|/g, '').matchAll(/[A-Za-z][A-Za-z$'-]{1,}/g)].map((m) => m[0].toLowerCase());

// Автопроверка порции (9.2). Возвращает текст ошибки или null; мягкие замечания — в flags
export function checkPiece(paras: { chapter: string | null; text: string }[], wanted: number[], sorted: any[], tail: string, flags: string[], checkRepeat = true): string | null {
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
    if (checkRepeat && tail && tail.includes(p.text.slice(0, 120))) return 'повтор уже написанного';
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
  // латиница — только если она есть в событиях или в прошлом тексте (иначе неудачная попытка: английские вставки вроде «guiding star»)
  const known = new Set(latinWords(sorted.map((e) => `${e.event_text} ${e.city ?? ''} ${e.author ?? ''}`).join(' ') + ' ' + tail));
  const strange = [...new Set(latinWords(all).filter((w) => !known.has(w)))];
  if (strange.length) return `латиница не из событий: ${strange.slice(0, 5).join(', ')}`;
  return null;
}


// ===== T2.5: вставка события в середину летописи (9.3) =====
export type Block = { kind: 'h' | 'p'; text: string };
export const NO_DATE = Number.MAX_SAFE_INTEGER;

// Текст летописи → блоки: заголовки глав («## ...») и абзацы
export function splitBlocks(content: string): Block[] {
  return String(content ?? '').replace(/\r/g, '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).flatMap((s): Block[] => {
    const m = s.match(/^##\s+([^\n]*)(?:\n([\s\S]*))?$/);
    if (!m) return [{ kind: 'p', text: s }];
    const out: Block[] = [{ kind: 'h', text: `## ${m[1].trim()}` }];
    if (m[2]?.trim()) out.push({ kind: 'p', text: m[2].trim() });
    return out;
  });
}
export const joinBlocks = (blocks: Block[]) => blocks.map((b) => b.text).join('\n\n');
export const idsOf = (t: string) => [...String(t).matchAll(/\[\[(\d+)\|/g)].map((m) => Number(m[1]));
// Ключ даты события: из полей базы (год/месяц/день), иначе разбором текста даты
export const keyOf = (e: any) => (e?.event_year ? e.event_year * 10000 + (e.event_month ?? 0) * 100 + (e.event_day ?? 0) : dateKey(e?.event_date));

// Куда встаёт событие: перед первым абзацем, все события которого позже нового.
// pos — номер абзаца (среди абзацев), перед которым вставка; pos === число абзацев → обычное продолжение в конец
export function findInsertion(blocks: Block[], keyById: Map<number, number>, newKey: number) {
  const paras = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.kind === 'p');
  let pos = paras.length;
  if (newKey !== NO_DATE) {
    for (let j = 0; j < paras.length; j++) {
      const ks = idsOf(paras[j].b.text).map((id) => keyById.get(id)).filter((k): k is number => k != null && k !== NO_DATE);
      if (ks.length && Math.min(...ks) > newKey) { pos = j; break; }
    }
  }
  const at = pos >= paras.length ? blocks.length : pos > 0 ? paras[pos - 1].i + 1 : paras[0].i; // индекс блока для вставки
  const label = (j: number) => `P${j + 1}`;
  const before = paras.slice(Math.max(0, pos - 2), pos).map((x, k) => ({ id: label(Math.max(0, pos - 2) + k), block: x.i, text: x.b.text }));
  const after = paras.slice(pos, pos + 2).map((x, k) => ({ id: label(pos + k), block: x.i, text: x.b.text }));
  return { pos, isInsert: pos < paras.length, at, before, after };
}

export const INSERT_PROMPT = `Ты — Летописец Вадимопедии. Летопись — связный художественный рассказ, который читается как книга. В уже написанную летопись нужно вставить новое событие в середину, строго по хронологии: между абзацами ДО и ПОСЛЕ.

ЧТО СДЕЛАТЬ
1. Напиши один новый абзац (3–6 предложений) с этим событием в том же стиле, что соседние абзацы: третье лицо, прошедшее время, пересказ своими словами, а не список. Год события упомяни естественно. Не добавляй фактов, которых нет в событии: ни того, что было потом, ни чужих планов и поступков. Можно добавить только обстановку.
2. Реши, меняет ли новое событие смысл соседних абзацев (например, герой в нём погибает, а после него ещё действует, или событие объясняет то, что было после) — поле "changes_meaning".
3. Если смысл НЕ меняется ("changes_meaning": false) — правь соседние абзацы минимально: только связку на стыке (последнее предложение абзаца ДО и первое предложение абзаца ПОСЛЕ), чтобы переход был незаметен. Если стык и так гладкий — ничего не меняй.
4. Если смысл меняется ("changes_meaning": true) — перепиши затронутые соседние абзацы ровно настолько, чтобы рассказ остался связным. Не добавляй новых фактов.
5. Если для связности пришлось бы менять больше четырёх абзацев или событие противоречит написанному — ничего не меняй в соседях ("paragraphs": []), поставь "needs_review": true и коротко объясни в "note".

МЕТКИ СОБЫТИЙ
- Новое событие отметь в новом абзаце ровно один раз: [[ID|фрагмент]], где фрагмент — 3–10 слов из твоего пересказа. Метка заменяет фрагмент, а не добавляется рядом с ним.
- В изменённых соседних абзацах все прежние метки [[...]] сохрани: те же номера, каждую ровно один раз. Новых меток туда не добавляй.
- Цитаты участников и слова из событий не исправляй и не смягчай.

ФОРМАТ ОТВЕТА — СТРОГО JSON, без пояснений и блоков кода:
{"changes_meaning":false,"paragraphs":[{"id":"P2","text":"полный новый текст изменённого абзаца"}],"new_paragraph":"Новый абзац с меткой [[ID|фрагмент]]","needs_review":false,"note":"коротко: что и почему поменял"}
- В "paragraphs" — только изменённые соседние абзацы (id из списка ниже), полный текст каждого. Неизменённые не включай.
- Пиши только на русском языке, современной орфографией, и поле "note" тоже. Латиницу — только там, где она есть в событиях.`;

export function buildInsertPrompt(ins: ReturnType<typeof findInsertion>, e: any): string {
  const show = (xs: { id: string; text: string }[]) => (xs.length ? xs.map((x) => `[${x.id}]\n${x.text}`).join('\n\n') : '(нет — это начало летописи)');
  return `${INSERT_PROMPT}\n\n=====\n\nАБЗАЦЫ ДО МЕСТА ВСТАВКИ:\n<<<\n${show(ins.before)}\n>>>\n\n>>> СЮДА ВСТАЁТ НОВЫЙ АБЗАЦ <<<\n\nАБЗАЦЫ ПОСЛЕ МЕСТА ВСТАВКИ:\n<<<\n${show(ins.after)}\n>>>\n\nНОВОЕ СОБЫТИЕ:\n` + [
    `ID: ${e.id}`, `Что произошло: ${e.event_text}`, e.event_date ? `Когда: ${e.event_date}` : null, e.city ? `Где: ${e.city}` : null, e.author ? `Кто принёс весть: ${e.author}` : null,
  ].filter(Boolean).join('\n') + '\n\nВерни только JSON.';
}

export type InsertAnswer = { changes_meaning: boolean; needs_review: boolean; note: string; new_paragraph: string; paragraphs: { id: string; text: string }[] };
export function parseInsertAnswer(raw: string, context: Map<string, string>): InsertAnswer {
  const s = raw.trim().replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('ответ не в формате JSON');
  const obj = JSON.parse(s.slice(a, b + 1));
  const np = cleanText(obj?.new_paragraph ?? '');
  if (!np) throw new Error('в JSON нет нового абзаца');
  const seen = new Set<string>();
  const paragraphs = (Array.isArray(obj.paragraphs) ? obj.paragraphs : [])
    .map((p: any) => ({ id: String(p?.id ?? '').replace(/[\[\]\s]/g, '').toUpperCase(), text: cleanText(p?.text ?? '') }))
    .filter((p: { id: string; text: string }) => {
      if (!context.has(p.id)) throw new Error(`абзац ${p.id || '?'} не из переданных`);
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return p.text && p.text !== context.get(p.id);   // без изменений — не считаем
    });
  return { changes_meaning: obj.changes_meaning === true, needs_review: obj.needs_review === true, note: String(obj.note ?? '').slice(0, 300), new_paragraph: np, paragraphs };
}

const sortedIds = (t: string) => idsOf(t).sort((x, y) => x - y).join(',');
const words = (t: string) => t.toLowerCase().replace(/\[\[\d+\|/g, '').match(/[а-яёa-z0-9]+/g) ?? [];
// Доля слов абзаца, которых нет в новой версии (грубая мера переписанности)
export function changedShare(before: string, after: string): number {
  const w = new Set(words(after));
  const old = words(before);
  return old.length ? old.filter((x) => !w.has(x)).length / old.length : 1;
}

// Автопроверка вставки: метки, затем общие проверки 9.2 (письмена, служебные фразы, длина, годы)
export function checkInsert(ans: InsertAnswer, newId: number, context: Map<string, string>, events: any[], flags: string[]): string | null {
  const nIds = idsOf(ans.new_paragraph);
  if (nIds.length !== 1 || nIds[0] !== newId) return `в новом абзаце должна быть ровно одна метка [[${newId}|...]]`;
  for (const p of ans.paragraphs) {
    if (sortedIds(p.text) !== sortedIds(context.get(p.id) ?? '')) return `в абзаце ${p.id} изменились метки событий`;
  }
  const paras = [{ chapter: null, text: ans.new_paragraph }, ...ans.paragraphs.map((p) => ({ chapter: null, text: p.text }))];
  const wanted = paras.flatMap((p) => idsOf(p.text));
  const err = checkPiece(paras, wanted, events, [...context.values()].join('\n\n'), flags, false);
  if (err) return err;
  if (!ans.changes_meaning) {
    for (const p of ans.paragraphs) if (changedShare(context.get(p.id) ?? '', p.text) > 0.4) flags.push(`ИИ считает, что смысл не меняется, но абзац ${p.id} заметно переписан`);
  }
  return null;
}

// Предложения абзаца (метки [[...]] не разрываются)
export const sentences = (t: string) => String(t).trim().split(/(?<=[.!?…]»?)\s+(?=[«"(\[]*[А-ЯЁA-Z0-9\[«])/).filter(Boolean);

// Если смысл не меняется, ИИ может править только стык: последнее предложение абзаца ДО и первое — абзаца ПОСЛЕ.
// Остальное берётся из исходного текста (ИИ иногда «случайно» портит слова в середине). Дальние абзацы не трогаются.
export function limitToJunction(ans: InsertAnswer, ins: ReturnType<typeof findInsertion>, flags: string[]): string | null {
  if (ans.changes_meaning) return null;
  const endId = ins.before.at(-1)?.id, startId = ins.after[0]?.id;
  const kept: { id: string; text: string }[] = [];
  for (const p of ans.paragraphs) {
    const orig = [...ins.before, ...ins.after].find((x) => x.id === p.id)!.text;
    const o = sentences(orig), u = sentences(p.text);
    let text: string;
    if (p.id === endId && u.length >= o.length) {
      const junction = u.slice(o.length - 1).join(' ');
      if (changedShare(o.at(-1)!, junction) > 0.6) return `абзац ${p.id}: стык переписан слишком сильно`;
      text = [...o.slice(0, -1), junction].join(' ');
    } else if (p.id === startId && u.length >= o.length) {
      const junction = u.slice(0, u.length - o.length + 1).join(' ');
      if (changedShare(o[0], junction) > 0.6) return `абзац ${p.id}: стык переписан слишком сильно`;
      text = [junction, ...o.slice(1)].join(' ');
    } else {
      flags.push(`ИИ правил абзац ${p.id} не только на стыке — правка отброшена`);
      continue;
    }
    if (text !== orig) kept.push({ id: p.id, text });
  }
  ans.paragraphs = kept;
  return null;
}

// Событие о гибели, а герой действует позже — ИИ на бесплатных моделях это часто пропускает, поэтому проверяем сами
const DEATH = /погиб|умер|убит|скончал|казн[её]н|расстрел|пал в бою/i;
export function deathConflict(eventText: string, blocks: Block[], ins: ReturnType<typeof findInsertion>): string | null {
  if (!DEATH.test(eventText)) return null;
  const names = [...new Set((eventText.match(/[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё$-]{3,}/g) ?? []).filter((w) => !/^вадим/i.test(w)))];
  const stem = (w: string) => (/^[А-ЯЁ]/i.test(w) && w.length >= 6 ? w.slice(0, w.length - 2) : w).toLowerCase();
  const later = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.kind === 'p' && x.i >= ins.at);
  for (const n of names) {
    const st = stem(n);
    const hit = later.find((x) => x.b.text.toLowerCase().includes(st));
    if (hit) return `событие о гибели, а «${n}» упоминается в летописи позже (${hit.b.text.replace(/\[\[\d+\|([^\]]*)\]\]/g, '$1').slice(0, 60)}…) — проверьте связность`;
  }
  return null;
}

// Собрать новый текст: заменить изменённые абзацы и вставить новый
export function applyInsert(blocks: Block[], ins: ReturnType<typeof findInsertion>, ans: InsertAnswer): string {
  const out = blocks.map((b) => ({ ...b }));
  for (const p of ans.paragraphs) {
    const ref = [...ins.before, ...ins.after].find((x) => x.id === p.id);
    if (ref) out[ref.block].text = p.text;
  }
  out.splice(ins.at, 0, { kind: 'p', text: ans.new_paragraph });
  return joinBlocks(out);
}
