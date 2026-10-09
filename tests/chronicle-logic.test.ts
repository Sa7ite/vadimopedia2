import { checkStyle, deathConflict, limitToJunction, sentences, splitBlocks, joinBlocks, findInsertion, parseInsertAnswer, checkInsert, applyInsert, keyOf, idsOf } from '../supabase/functions/chronicle-ai/logic.ts';
let fail = 0; const ok = (c: any, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const ev = [
  { id: 1, event_year: 1987, event_date: '1987', event_text: 'Вадим родился в Коломне' },
  { id: 2, event_year: 1990, event_date: '1990', event_text: 'Вадим пошёл в школу' },
  { id: 3, event_year: 2024, event_date: '2024', event_text: 'Вадим открыл кофейню' },
  { id: 4, event_year: 2030, event_date: '2030', event_text: 'Вадим стал императором' },
  { id: 9, event_year: 2004, event_date: '2004', event_text: 'Вадим уехал учиться в Москву' },
];
const P = (s: string) => s + ' Это было давно, и молва о том разошлась по всем землям Междумосковья.';
const content = `Вступление без событий, хроника всех Вадимов мира, которую начали писать очень давно.\n\n## Начало\n\n${P('В 1987 году [[1|Вадим родился в Коломне]].')}\n\n${P('В 1990 году [[2|Вадим пошёл в школу]].')}\n\n## Новое время\n\n${P('В 2024 году [[3|Вадим открыл кофейню]].')}\n\n${P('В 2030 году [[4|Вадим стал императором]].')}`;
const blocks = splitBlocks(content);
ok(joinBlocks(blocks) === content, 'разбор и сборка текста без потерь');
const keys = new Map(ev.map((e) => [e.id, keyOf(e)]));
let ins = findInsertion(blocks, keys, keyOf(ev[4]));
ok(ins.isInsert && ins.before.map((x) => x.id).join() === 'P2,P3' && ins.after.map((x) => x.id).join() === 'P4,P5', '2004 встаёт между 1990 и 2024: P2,P3 | P4,P5');
ok(blocks[ins.at - 1].text.includes('[[2|'), 'вставка в конец главы «Начало», перед заголовком следующей');
ok(!findInsertion(blocks, keys, 2031 * 10000).isInsert, '2031 — обычное продолжение в конец');
ok(!findInsertion(blocks, keys, Number.MAX_SAFE_INTEGER).isInsert, 'без даты — в конец');
const early = findInsertion(blocks, keys, 1000 * 10000);
ok(early.isInsert && early.before.map((x) => x.id).join() === 'P1' && early.after[0].id === 'P2', '1000 год — после вступления, перед первым абзацем');
ok(findInsertion(blocks, keys, 1987 * 10000).after[0].id === 'P3', 'тот же год, что у события — встаёт после него');

const ctx = new Map([...ins.before, ...ins.after].map((x) => [x.id, x.text]));
const good = JSON.stringify({ changes_meaning: false, paragraphs: [{ id: 'P4', text: P('Спустя годы, в 2024 году, [[3|Вадим открыл кофейню]] уже в столице.') }], new_paragraph: P('В 2004 году [[9|Вадим уехал учиться в Москву]], оставив родной город.'), needs_review: false, note: 'связка' });
let a = parseInsertAnswer(good, ctx); let flags: string[] = [];
ok(checkInsert(a, 9, ctx, ev, flags) === null, 'правильный ответ проходит автопроверку');
const text = applyInsert(blocks, ins, a);
ok(idsOf(text).join() === '1,2,9,3,4', 'порядок событий в тексте 1987, 1990, 2004, 2024, 2030');
ok(text.includes('уже в столице') && !text.includes('В 2024 году [[3|'), 'изменённый соседний абзац заменён');
ok(splitBlocks(text).filter(b => b.kind === 'h').length === 2, 'главы сохранились');
const bad = (o: any) => { try { const x = parseInsertAnswer(JSON.stringify(o), ctx); return checkInsert(x, 9, ctx, ev, []); } catch (e: any) { return e.message; } };
const base = JSON.parse(good);
ok(bad({ ...base, new_paragraph: P('В 2004 году Вадим уехал учиться.') }), 'нет метки нового события — отклонено');
ok(bad({ ...base, new_paragraph: P('В 2004 году [[9|Вадим уехал]] и [[9|снова уехал]].') }), 'метка дважды — отклонено');
ok(bad({ ...base, paragraphs: [{ id: 'P4', text: P('В 2024 году Вадим открыл кофейню.') }] }), 'потеряна метка в соседнем абзаце — отклонено');
ok(bad({ ...base, paragraphs: [{ id: 'P9', text: P('Чужой абзац [[3|x x x]].') }] }), 'абзац не из переданных — отклонено');
ok(bad({ ...base, new_paragraph: P('В 2005 году [[9|Вадим уехал учиться в Москву]].') }), 'неверный год — отклонено');
ok(bad({ ...base, new_paragraph: P('В 2004 году [[9|Вадим уехал учиться в Москву]] 东京.') }), 'чужие письмена — отклонено');
ok(bad({ ...base, new_paragraph: 'Коротко [[9|уехал]].' }), 'слишком короткий абзац — отклонено');
try { parseInsertAnswer('просто текст', ctx); ok(false, 'невалидный JSON'); } catch { ok(true, 'невалидный JSON — неудачная попытка'); }
const same = parseInsertAnswer(JSON.stringify({ ...base, paragraphs: [{ id: 'p3', text: ctx.get('P3') }] }), ctx);
ok(same.paragraphs.length === 0, 'неизменённый абзац не считается изменённым (id в нижнем регистре тоже понят)');
flags = []; const heavy = parseInsertAnswer(JSON.stringify({ ...base, paragraphs: [{ id: 'P4', text: 'Совсем другой рассказ: [[3|кофейня у реки]] открылась, гремели трубы, плясали люди, пели песни до утра.' }] }), ctx);
checkInsert(heavy, 9, ctx, ev, flags);
ok(flags.some(f => f.includes('заметно переписан')), 'сильная правка при changes_meaning=false — мягкая пометка админу');
const rev = parseInsertAnswer(JSON.stringify({ ...base, paragraphs: [], needs_review: true, note: 'затронуто больше 4 абзацев' }), ctx);
ok(rev.needs_review && rev.paragraphs.length === 0 && checkInsert(rev, 9, ctx, ev, []) === null, 'needs_review: соседи не меняются, вставляется только новый абзац');

// стык: реальный случай — ИИ испортил слово в середине абзаца ДО
{
  const o = 'Прошли столетия, и пришла тьма. В 1990 году [[2|Вадим пошёл в школу]], о злодеяниях коего лучше читать отдельно. А в разгар войны всё стихло.';
  const b2 = [{ kind: 'h', text: '## X' }, { kind: 'p', text: o }, { kind: 'p', text: P('В 2024 году [[3|Вадим открыл кофейню]].') }] as any;
  const ins2 = findInsertion(b2, keys, keyOf(ev[4]));
  const u = 'Прошли столетия, и пришла тьма. В 1990 году [[2|Вадим пошёл в школу]], о злодеяниям коего лучше читать отдельно. А в разгар войны всё стихло, а годы спустя всё переменилось.';
  const a2: any = { changes_meaning: false, needs_review: false, note: '', new_paragraph: 'x', paragraphs: [{ id: 'P1', text: u }] };
  const fl: string[] = [];
  ok(limitToJunction(a2, ins2, fl) === null && a2.paragraphs[0].text.includes('о злодеяниях') && a2.paragraphs[0].text.endsWith('а годы спустя всё переменилось.'), 'стык: порча в середине абзаца отброшена, новая связка взята');
  const a3: any = { changes_meaning: false, paragraphs: [{ id: 'P2', text: 'Годы спустя, ' + P('в 2024 году [[3|Вадим открыл кофейню]].').replace(/^в/, 'в') }] };
  ok(limitToJunction(a3, ins2, []) === null && a3.paragraphs[0].text.startsWith('Годы спустя'), 'стык: первое предложение абзаца ПОСЛЕ можно менять');
  const a4: any = { changes_meaning: false, paragraphs: [{ id: 'P1', text: 'Совсем иное. Ничего общего. Абсолютно новые слова здесь без меток вообще никаких.' }] };
  ok(limitToJunction(a4, ins2, []) !== null, 'стык переписан полностью — неудачная попытка');
  const a5: any = { changes_meaning: true, paragraphs: [{ id: 'P1', text: u }] };
  ok(limitToJunction(a5, ins2, []) === null && a5.paragraphs[0].text === u, 'смысл меняется — правка целиком остаётся (админ видит различия)');
}
{
  const fl: string[] = []; const a6: any = { changes_meaning: false, paragraphs: [{ id: 'P2', text: P('Иначе: в 1990 году [[2|Вадим пошёл в школу]].') }] };
  const ins3 = findInsertion(blocks, keys, keyOf(ev[4]));
  // P2 — не на стыке (стык — P3 и P4)
  ok(limitToJunction(a6, ins3, fl) === null && a6.paragraphs.length === 0 && fl.length === 1, 'дальний абзац при неизменном смысле не трогается');
}
ok(sentences('Он сказал: «Иди». Потом [[5|ушёл в 2004 г. домой]]. Всё.').length === 3, 'разбор на предложения');
ok(bad({ ...base, new_paragraph: P('В 2004 году [[9|Вадим уехал учиться в Москву]], это был его guiding star.') }), 'английские слова не из событий — отклонено');
{
  const bb = splitBlocks(`## A\n\n${P('В 1990 году [[2|Вадим пошёл в школу]].')}\n\n${P('В 2035 году KENTA$$ [[4|поднял знамя сопротивления]], и Савинову рукоплескали.')}`);
  const k2 = new Map([[2, 19900000], [4, 20350000]]);
  const i2 = findInsertion(bb, k2, 20290000);
  ok(!!deathConflict('KENTA$$ — Артемий Савинов погиб при обороне Химок', bb, i2), 'гибель героя, который действует позже, — пометка админу');
  ok(!deathConflict('KENTA$$ открыл кофейню', bb, i2), 'не о гибели — без пометки');
  ok(!deathConflict('Вадим погиб в бою', bb, i2), 'имя «Вадим» само по себе не даёт ложной пометки');
}
{
  const evq = [{ id: 7, event_text: 'Школов сказал: «Не быть рабом, блядь, быть Вадимом» и ушёл в пикаповый сад' }];
  ok(checkStyle(['Он сказал: «Не быть рабом, блядь, быть Вадимом». Потом ушёл.'], evq, []) === null, 'цитата дословно (с матом) — проходит');
  ok(!!checkStyle(['Он сказал: «Не быть рабом, быть Вадимом». Потом ушёл.'], evq, []), 'цитата смягчена — отклонено');
  ok(!!checkStyle(['Он воскликнул: «Слава великому Междумосковью навеки»'], evq, []), 'выдуманная цитата — отклонено');
  ok(!!checkStyle(['Он ушёл в пиковый сад и долго сидел там.'], evq, []), '«пиковый сад» — отклонено');
  const fl: string[] = [];
  checkStyle(['Он шёл ' + 'очень '.repeat(35) + 'долго.'], evq, fl);
  ok(fl.some(f => f.includes('длинное предложение')), 'длинное предложение — мягкая пометка');
  const f2: string[] = []; checkStyle(['Той весной он пришёл домой.', 'Той весной она ушла.'], evq, f2);
  ok(f2.some(f => f.includes('одинаково')), 'одинаковое начало абзацев — мягкая пометка');
}
console.log(fail ? `ПРОВАЛЕНО: ${fail}` : 'ВСЕ ТЕСТЫ ПРОШЛИ');
process.exit(fail ? 1 : 0);
