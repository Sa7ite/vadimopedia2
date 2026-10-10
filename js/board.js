// T3.5: Доска расследования — пробка, карточки событий, красные нитки-теории.
// Всё, что нельзя нарушить (лимиты, права, голоса, канон), проверяет база: здесь только показ и жесты.
// Модуль самодостаточный: сам добавляет табличку «Доска» в меню и раздел на страницу.
import { askConfirm } from './dialog.js';
import { supabase } from './config.js';
import { evTitle, hasTitle } from './evtitle.js';
import { getApprovedEvents, getTheories, createTheory, voteTheory, setTheoryStatus, getPersons, getCampaigns, getChronicle, getSettingValue } from './api.js';
import { showSection, showNotification } from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const no = (id) => String(id).padStart(4, '0');
const rnd = (id, salt) => ((((Number(id) * 2654435761 + salt * 40503) >>> 0) % 1000) / 1000) - 0.5; // -0.5…0.5, одно и то же для одного id
const narrow = () => matchMedia('(max-width: 600px)').matches;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const KINDS = [['chapter', 'Глава'], ['campaign', 'Кампания'], ['person', 'Персонаж'], ['epoch', 'Эпоха']];
const BOARD_H = 700;

const yearOf = (e) => e.event_year ?? ((String(e.event_date || '').match(/\d+(?!.*\d)/) || [])[0] ? Number(String(e.event_date).match(/\d+(?!.*\d)/)[0]) : null);
const dateKey = (e) => { const y = yearOf(e); return y == null ? Infinity : y * 10000 + (e.event_month || 0) * 100 + (e.event_day || 0); };
const words3 = (t) => { const w = String(t).trim().split(/\s+/); return w.slice(0, 3).join(' ') + (w.length > 3 ? '…' : ''); };

const S = { me: null, data: null, loadedAt: 0, kind: 'campaign', item: null, page: 0, theories: [], layout: { p: {} }, from: null, sheet: null, fresh: null, token: 0 };
let link, section, saveTimer = null, suppress = false;

// ---------- каркас: табличка в меню и раздел ----------
function mount() {
  const chron = $('.nav-link[data-section="chronicle"]');
  if (!chron || $('#section-board')) return;
  if (!$('link[href="board.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'board.css'; document.head.appendChild(l); }
  link = document.createElement('a');
  link.href = '#'; link.className = 'nav-link'; link.dataset.section = 'board'; link.id = 'nav-board'; link.textContent = 'Доска'; link.style.display = 'none';
  chron.after(link);
  section = document.createElement('section');
  section.id = 'section-board'; section.className = 'section'; section.style.display = 'none';
  section.innerHTML = '<div class="container"><h2>Доска расследования</h2><div id="board-root"></div></div>';
  ($('#section-chronicle') || document.body).after(section);
  link.addEventListener('click', (e) => { e.preventDefault(); showSection('board'); open(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !section.classList.contains('active')) return;
    if (S.sheet) closeSheet(); else if (S.from) setFrom(null);
  });
  let lastW = 0;
  new ResizeObserver(() => { const w = $('#bd-board')?.clientWidth || 0; if (w !== lastW) { lastW = w; redraw(); } }).observe(section);
}

async function loadMe(s) {
  S.me = null;
  if (s) {
    const { data } = await supabase.from('profiles').select('id, role, full_name').eq('id', s.user.id).maybeSingle();
    S.me = data || { id: s.user.id, role: 'user' };
  }
  link.style.display = s ? '' : 'none';
  if (s && location.hash === '#board' && !section.classList.contains('active')) link.click();
  if (!s && section.classList.contains('active')) open();
}

// ---------- данные ----------
async function ensureData(force) {
  if (!force && S.data && Date.now() - S.loadedAt < 60000) return;
  const [events, persons, campaigns, chron] = await Promise.all([getApprovedEvents(500), getPersons(), getCampaigns(), getChronicle()]);
  S.data = { events, persons, campaigns, chron };
  S.loadedAt = Date.now();
}
const refreshTheories = async () => { S.theories = (await getTheories()).filter((t) => t.status !== 'removed'); };

// ---------- охваты ----------
function scopeItems(kind) {
  const { events, persons, campaigns, chron } = S.data;
  const byId = new Map(events.map((e) => [Number(e.id), e]));
  const out = [];
  if (kind === 'chapter') {
    let cur = null;
    String(chron?.content || '').split('\n').forEach((line) => {
      const h = line.match(/^#{1,3}\s*(.+)$/);
      if (h) { cur = { id: String(out.length), label: h[1].replace(/[*_`]/g, '').trim(), events: [] }; out.push(cur); return; }
      if (!cur) return;
      for (const m of line.matchAll(/(?:\[\[|\{\{e:)(\d+)\|/g)) { const e = byId.get(Number(m[1])); if (e && !cur.events.includes(e)) cur.events.push(e); }
    });
  } else if (kind === 'campaign') {
    campaigns.forEach((c) => out.push({ id: String(c.id), label: c.name, events: events.filter((e) => String(e.campaign?.id ?? e.campaign_id) === String(c.id)) }));
  } else if (kind === 'person') {
    persons.forEach((p) => out.push({ id: p.id, label: p.name, person: p, events: events.filter((e) => (e.participants || []).some((x) => x.person?.id === p.id)) }));
  } else {
    const m = new Map();
    events.forEach((e) => {
      const y = yearOf(e); if (y == null) return;
      const k = y >= 1900 ? `${Math.floor(y / 10) * 10}-е` : `${Math.floor(y / 100) * 100}–${Math.floor(y / 100) * 100 + 99}`;
      const key = y >= 1900 ? Math.floor(y / 10) * 10 : Math.floor(y / 100) * 100;
      if (!m.has(key)) m.set(key, { id: String(key), label: k, events: [], key });
      m.get(key).events.push(e);
    });
    out.push(...[...m.values()].sort((a, b) => a.key - b.key));
  }
  return out.filter((i) => i.events.length).map((i) => ({ ...i, events: i.events.sort((a, b) => dateKey(a) - dateKey(b) || a.id - b.id) }));
}

function pickDefault() {
  try { const s = JSON.parse(localStorage.getItem('vpBoard') || 'null'); if (s?.kind) { S.kind = s.kind; S.item = s.item; S.page = 0; } } catch (_) { /* ничего */ }
  let items = scopeItems(S.kind);
  if (!items.find((i) => i.id === S.item)) {
    const links = (i) => S.theories.filter((t) => i.events.some((e) => e.id === t.event_a) && i.events.some((e) => e.id === t.event_b)).length;
    S.item = ([...items].sort((a, b) => links(b) - links(a))[0] || items[0] || {}).id ?? null;
  }
}

// ---------- раскладка ----------
const cap = () => (narrow() ? 12 : 20);
function autoPos(list, W) {
  const cw = (156 / W) * 100, chp = (165 / BOARD_H) * 100, n = list.length;
  const rows = n > 9 ? 4 : 3, perm = rows === 4 ? [0, 2, 1, 3] : [0, 2, 1], out = {};
  list.forEach((e, i) => {
    const r = perm[i % rows];
    const x = n > 1 ? 2 + (100 - 4 - cw) * (i / (n - 1)) : 40;
    const y = 3 + r * ((100 - 6 - chp) / (rows - 1));
    out[e.id] = [x + rnd(e.id, 1) * 1.6, y + rnd(e.id, 2) * 3];
  });
  return out;
}
const scopeKey = () => `${S.kind}:${S.item}:${S.page}`.slice(0, 120);
async function loadLayout() {
  S.layout = { p: {} };
  if (!S.me) return;
  const { data } = await supabase.from('board_layouts').select('layout').eq('scope', scopeKey()).maybeSingle();
  if (data?.layout?.p) S.layout = { p: data.layout.p };
}
function saveLayout() {
  clearTimeout(saveTimer);
  const key = scopeKey(), layout = { p: S.layout.p };
  saveTimer = setTimeout(async () => {
    const { error } = await supabase.from('board_layouts').upsert({ user_id: S.me.id, scope: key, layout }, { onConflict: 'user_id,scope' });
    if (error) console.error('Раскладка доски не сохранена:', error.message);
  }, 600);
}

// ---------- показ ----------
async function open() {
  const root = $('#board-root');
  if (!S.me) { root.innerHTML = '<p class="bd-empty">Доска доступна участникам. Войдите, чтобы увидеть дела и нитки.</p>'; return; }
  root.innerHTML = '<p class="bd-empty">Ищем в архиве</p>';
  const token = ++S.token;
  try { await Promise.all([ensureData(), refreshTheories()]); } catch (e) { root.innerHTML = '<p class="bd-empty">Нет связи с архивом. Проверьте интернет и повторите.</p>'; return; }
  if (token !== S.token) return;
  pickDefault();
  await render();
}

function current() {
  const items = scopeItems(S.kind);
  const item = items.find((i) => i.id === S.item) || items[0] || null;
  return { items, item };
}

async function render() {
  const root = $('#board-root');
  const { items, item } = current();
  const list = item?.events || [];
  const per = cap(), pages = Math.max(1, Math.ceil(list.length / per));
  S.page = Math.min(S.page, pages - 1);
  const shown = list.slice(S.page * per, S.page * per + per);
  const ids = new Set(shown.map((e) => e.id));
  await loadLayout();

  const ths = S.theories.filter((t) => ids.has(t.event_a) && (t.event_b == null || ids.has(t.event_b)));
  const off = S.theories.filter((t) => (ids.has(t.event_a) !== (t.event_b != null && ids.has(t.event_b))) && t.event_b != null).length;
  const canon = new Set(); ths.filter((t) => t.status === 'canon').forEach((t) => { canon.add(t.event_a); if (t.event_b != null) canon.add(t.event_b); });

  root.innerHTML = `<div class="bd">
    <div class="bd-head">
      <div class="bd-kinds" role="group" aria-label="Охват доски">${KINDS.map(([k, l]) => `<button type="button" class="bd-tag" data-kind="${k}" aria-pressed="${k === S.kind}">${l}</button>`).join('')}</div>
      <label class="bd-pick"><span>Выбрать</span><select id="bd-item" aria-label="Что показать на доске">${items.map((i) => `<option value="${esc(i.id)}"${i.id === item?.id ? ' selected' : ''}>${esc(i.label)} (${i.events.length})</option>`).join('')}</select></label>
      ${pages > 1 ? `<div class="bd-pager"><button type="button" class="btn-secondary" data-page="-1"${S.page === 0 ? ' disabled' : ''}>Предыдущий лист</button><span>Лист ${S.page + 1} из ${pages}</span><button type="button" class="btn-secondary" data-page="1"${S.page >= pages - 1 ? ' disabled' : ''}>Следующий лист</button></div>` : ''}
    </div>
    <p class="bd-info" id="bd-info" aria-live="polite"></p>
    ${shown.length ? `<div class="bd-frame"><div class="bd-scroll"><div class="bd-board" id="bd-board" style="--bd-h:${BOARD_H}px">
      <svg class="bd-threads" id="bd-svg" aria-hidden="true"></svg>
      ${shown.map((e) => cardHtml(e, canon.has(e.id))).join('')}
      <div class="bd-lay" id="bd-lay"></div>
    </div></div></div>
    <details class="bd-list"><summary>Список ниток на этом листе (${ths.length})</summary><ul id="bd-list">${ths.length ? ths.map((t) => `<li><button type="button" class="btn-link" data-th="${t.id}">${t.event_b == null ? `Дело № ${no(t.event_a)}` : `Дела № ${no(t.event_a)} и № ${no(t.event_b)}`}: ${esc(t.note)} (верю ${t.believe}, не верю ${t.doubt}${t.status === 'canon' ? ', канон' : ''})</button></li>`).join('') : '<li>Ниток нет.</li>'}</ul></details>`
      : '<p class="bd-empty">На доске пусто. Выберите другой охват.</p>'}
    <aside class="bd-sheet" id="bd-sheet" role="dialog" aria-label="Нитка" hidden></aside>
  </div>`;
  $('#bd-info').textContent = shown.length
    ? `${item.label}: дела ${S.page * per + 1}–${S.page * per + shown.length} из ${list.length}. Ниток на листе: ${ths.length}.${off ? ` Ещё ${off} за пределами листа.` : ''}${ths.length ? '' : ' Ниток пока нет: потяните от булавки одного дела к другому.'}`
    : '';
  if (!shown.length) return;
  placeCards(shown);
  redraw();
  if (S.sheet) openSheetFor(S.sheet);
}

function cardHtml(e, isCanon) {
  const r = (rnd(e.id, 3) * 5).toFixed(2), c = isCanon ? 'red' : `c${e.id % 3}`;
  const solos = S.theories.filter((t) => t.event_b == null && t.event_a === e.id);
  return `<div class="bd-card" data-id="${e.id}" style="--r:${r}deg">
    <button type="button" class="bd-pin ${c}" data-pin="${e.id}" aria-label="Протянуть нитку от дела № ${no(e.id)}"></button>
    <button type="button" class="bd-open" data-open="${e.id}" title="${esc(e.event_text.length > 220 ? e.event_text.slice(0, 220) + '…' : e.event_text)}" aria-label="Дело № ${no(e.id)}: ${esc(evTitle(e, 64))}, ${esc([yearOf(e), e.city].filter(Boolean).join(', '))}. Открыть. Стрелки двигают карточку.">
      <span class="bd-ch"><span class="bd-no">№ ${no(e.id)}</span><span class="bd-yr">${esc(yearOf(e) ?? '????')}</span></span>
      <span class="bd-tx${hasTitle(e) ? ' has-t' : ''}">${esc(evTitle(e, 64))}</span>
      ${e.city ? `<span class="bd-pl">${esc(e.city)}</span>` : ''}
    </button>
    ${solos.length ? `<span class="bd-solo">${solos.map((t) => `<button type="button" class="bd-note solo" data-th="${t.id}" aria-label="Записка к делу: ${esc(t.note)}">${esc(words3(t.note))}</button>`).join('')}</span>` : ''}
  </div>`;
}

function placeCards(shown) {
  const board = $('#bd-board'), W = board.clientWidth || 1100, auto = autoPos(shown, W);
  shown.forEach((e) => {
    const [x, y] = S.layout.p[e.id] || auto[e.id];
    const el = $(`.bd-card[data-id="${e.id}"]`, board);
    el.style.left = x.toFixed(2) + '%'; el.style.top = y.toFixed(2) + '%';
  });
}

// ---------- нитки ----------
let raf = 0;
function redraw() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; drawThreads(); }); }
function pinOf(card, W) { const l = parseFloat(card.style.left) / 100 * W; return { x: l + card.offsetWidth / 2, y: parseFloat(card.style.top) / 100 * BOARD_H + 9 }; }
function bez(p0, c, p2, t) { const u = 1 - t; return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y }; }

function drawThreads() {
  const board = $('#bd-board'); if (!board) return;
  const svg = $('#bd-svg'), lay = $('#bd-lay'), W = board.clientWidth;
  const pins = {}; board.querySelectorAll('.bd-card').forEach((c) => { pins[c.dataset.id] = pinOf(c, W); });
  svg.setAttribute('viewBox', `0 0 ${W} ${BOARD_H}`); svg.setAttribute('width', W); svg.setAttribute('height', BOARD_H);
  const ths = S.theories.filter((t) => t.event_b != null && pins[t.event_a] && pins[t.event_b]);
  const seen = {}; let paths = '', tags = '';
  ths.forEach((t) => {
    const a = pins[t.event_a], b = pins[t.event_b], k = [t.event_a, t.event_b].sort().join('-'); seen[k] = (seen[k] || 0) + 1;
    const dist = Math.hypot(a.x - b.x, a.y - b.y), sag = Math.min(96, 24 + dist * 0.14) + (seen[k] - 1) * 18;
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 2 * sag };
    const isCanon = t.status === 'canon', w = Math.min(5, 1 + (t.believe || 0)) + (isCanon ? 1 : 0) + (narrow() ? 1 : 0);
    const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    const fresh = S.fresh === t.id && !calm();
    paths += `<g class="bd-th${isCanon ? ' canon' : ''}" data-th="${t.id}"><path class="bd-hit" d="${d}"/><path class="bd-str${fresh ? ' draw' : ''}" d="${d}" pathLength="1" style="stroke-width:${w}px"/></g>`;
    const m = bez(a, c, b, isCanon ? 0.4 : 0.5), s = bez(a, c, b, 0.64);
    tags += `<button type="button" class="bd-note${isCanon ? ' canon' : ''}" data-th="${t.id}" style="left:${m.x.toFixed(1)}px;top:${m.y.toFixed(1)}px;--r:${(rnd(t.id, 4) * 8).toFixed(1)}deg" aria-label="Нитка между делами № ${no(t.event_a)} и № ${no(t.event_b)}${isCanon ? ', канон' : ''}: ${esc(t.note)}">${esc(words3(t.note))}</button>`;
    if (isCanon) tags += `<span class="bd-wax" aria-hidden="true" style="left:${s.x.toFixed(1)}px;top:${s.y.toFixed(1)}px">В</span>`;
  });
  svg.innerHTML = paths + '<line class="bd-drag" id="bd-drag" x1="0" y1="0" x2="0" y2="0" hidden/>';
  lay.innerHTML = tags;
  S.fresh = null;
}

// ---------- жесты ----------
function setFrom(id) {
  S.from = id;
  const board = $('#bd-board'); board?.classList.toggle('connecting', id != null);
  board?.querySelectorAll('.bd-pin').forEach((p) => p.classList.toggle('armed', String(p.dataset.pin) === String(id)));
  const info = $('#bd-info');
  if (info && id != null) info.textContent = `Выбрано дело № ${no(id)}. Нажмите на второе дело. Нажмите на то же дело ещё раз, чтобы оставить записку к одному делу. Esc отменяет выбор.`;
  else if (info && S.data) { const { item } = current(); if (item) info.textContent = `${item.label}: выбор отменён.`; }
}

function activate(id) {
  if (S.from != null) { const from = S.from; setFrom(null); openForm(from, from === id ? null : id); return; }
  openEvent(id);
}

// окно события открывает main.js; доступ к нему — через картотеку главной (см. desk.js)
function openEvent(id) {
  const rows = $('#dh-rows'); if (!rows) return;
  const b = document.createElement('button'); b.className = 'dh-fold'; b.dataset.id = id; b.hidden = true;
  rows.appendChild(b); b.click(); b.remove();
}

function onPointerDown(e) {
  const board = $('#bd-board'); if (!board || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const card = e.target.closest('.bd-card'); if (!card || e.target.closest('.bd-note')) return;
  const id = Number(card.dataset.id);
  if (e.target.closest('.bd-pin')) return startThread(e, id, card);
  startMove(e, id, card);
}

function startMove(e, id, card) {
  const W = card.parentElement.clientWidth, sx = e.clientX, sy = e.clientY, ox = parseFloat(card.style.left), oy = parseFloat(card.style.top);
  let moved = false; card.setPointerCapture(e.pointerId);
  const mv = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true; card.classList.add('drag');
    const cw = card.offsetWidth / W * 100, ch = card.offsetHeight / BOARD_H * 100;
    card.style.left = Math.min(100 - cw, Math.max(0, ox + dx / W * 100)).toFixed(2) + '%';
    card.style.top = Math.min(100 - ch, Math.max(0, oy + dy / BOARD_H * 100)).toFixed(2) + '%';
    redraw();
  };
  const up = () => {
    card.removeEventListener('pointermove', mv); card.removeEventListener('pointerup', up); card.removeEventListener('pointercancel', up);
    card.classList.remove('drag');
    if (moved) { S.layout.p[id] = [parseFloat(card.style.left), parseFloat(card.style.top)]; saveLayout(); suppress = true; setTimeout(() => { suppress = false; }, 0); }
    else if (e.target.closest('.bd-open')) activate(id);
  };
  card.addEventListener('pointermove', mv); card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
}

function startThread(e, id, card) {
  e.preventDefault();
  const board = $('#bd-board'), pin = e.target.closest('.bd-pin'), br = () => board.getBoundingClientRect();
  const p0 = pinOf(card, board.clientWidth), line = $('#bd-drag'), sx = e.clientX, sy = e.clientY;
  let moved = false; pin.setPointerCapture(e.pointerId);
  const mv = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    moved = true; const r = br();
    line.removeAttribute('hidden'); line.setAttribute('x1', p0.x); line.setAttribute('y1', p0.y);
    line.setAttribute('x2', ev.clientX - r.left); line.setAttribute('y2', ev.clientY - r.top);
  };
  const up = (ev) => {
    pin.removeEventListener('pointermove', mv); pin.removeEventListener('pointerup', up); pin.removeEventListener('pointercancel', up);
    line.setAttribute('hidden', '');
    if (ev.type === 'pointercancel') return;
    if (moved) {
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.bd-card');
      if (t && Number(t.dataset.id) !== id) { setFrom(null); openForm(id, Number(t.dataset.id)); }
    } else if (S.from == null) setFrom(id);
    else activate(id);
  };
  pin.addEventListener('pointermove', mv); pin.addEventListener('pointerup', up); pin.addEventListener('pointercancel', up);
}

function onKey(e) {
  const open = e.target.closest?.('.bd-open'); if (!open) return;
  const card = open.closest('.bd-card'), id = Number(card.dataset.id);
  if (e.key === 'Enter' || e.key === ' ') return; // нажатие обработает click
  const step = e.shiftKey ? 5 : 1, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!d) return;
  e.preventDefault();
  const W = card.parentElement.clientWidth, cw = card.offsetWidth / W * 100, ch = card.offsetHeight / BOARD_H * 100;
  card.style.left = Math.min(100 - cw, Math.max(0, parseFloat(card.style.left) + d[0])).toFixed(2) + '%';
  card.style.top = Math.min(100 - ch, Math.max(0, parseFloat(card.style.top) + d[1])).toFixed(2) + '%';
  S.layout.p[id] = [parseFloat(card.style.left), parseFloat(card.style.top)]; saveLayout(); redraw();
}

// ---------- лист-записка: нитка целиком, голоса, новая нитка ----------
const sheet = () => $('#bd-sheet');
function closeSheet() { S.sheet = null; const s = sheet(); if (s) { s.hidden = true; s.innerHTML = ''; } }

function evBrief(id) { const e = S.data.events.find((x) => x.id === id); return e ? `${yearOf(e) ?? '????'}${e.city ? ', ' + e.city : ''}: ${hasTitle(e) ? e.title.trim() : (e.event_text.length > 90 ? e.event_text.slice(0, 90) + '…' : e.event_text)}` : ''; }

function openSheetFor(id) {
  const t = S.theories.find((x) => x.id === id), s = sheet(); if (!t || !s) { closeSheet(); return; }
  S.sheet = id;
  const mine = t.author_id === S.me.id, admin = S.me.role === 'admin', one = t.event_b == null, canon = t.status === 'canon';
  s.innerHTML = `<button type="button" class="close-modal bd-x" data-act="close" aria-label="Закрыть">&times;</button>
    <h3>${one ? `Записка к делу № ${no(t.event_a)}` : `Нитка между делами № ${no(t.event_a)} и № ${no(t.event_b)}`}</h3>
    ${canon ? '<p class="bd-stamp">Достоверно</p>' : ''}
    <blockquote class="bd-q">${esc(t.note)}</blockquote>
    <p class="bd-by">Записал: ${esc(t.author_name || 'неизвестный')}</p>
    <ul class="bd-evs"><li><button type="button" class="btn-link" data-ev="${t.event_a}">Дело № ${no(t.event_a)}</button> ${esc(evBrief(t.event_a))}</li>${one ? '' : `<li><button type="button" class="btn-link" data-ev="${t.event_b}">Дело № ${no(t.event_b)}</button> ${esc(evBrief(t.event_b))}</li>`}</ul>
    <div class="bd-votes">
      <button type="button" class="bd-seal believe" data-vote="believe" aria-pressed="${t.my_vote === 'believe'}"${mine ? ' disabled' : ''}>Верю<b>${t.believe}</b></button>
      <button type="button" class="bd-seal doubt" data-vote="doubt" aria-pressed="${t.my_vote === 'doubt'}"${mine ? ' disabled' : ''}>Не верю<b>${t.doubt}</b></button>
    </div>
    ${mine ? '<p class="bd-hint">За свою нитку голосовать нельзя.</p>' : ''}
    <div class="bd-acts">
      ${admin ? `<button type="button" class="btn-primary" data-act="${canon ? 'uncanon' : 'canon'}">${canon ? 'Снять канон' : 'В канон'}</button>` : ''}
      ${mine || admin ? '<button type="button" class="btn-danger" data-act="remove">Убрать нитку</button>' : ''}
    </div>`;
  s.hidden = false; $('.bd-x', s).focus();
}

async function openForm(a, b) {
  S.sheet = null;
  const s = sheet(), max = await getSettingValue('theory.max_per_day', 3).catch(() => 3);
  s.innerHTML = `<button type="button" class="close-modal bd-x" data-act="close" aria-label="Закрыть">&times;</button>
    <h3>${b == null ? `Записка к делу № ${no(a)}` : `Протянуть нитку между делами № ${no(a)} и № ${no(b)}`}</h3>
    <ul class="bd-evs"><li>Дело № ${no(a)}: ${esc(evBrief(a))}</li>${b == null ? '' : `<li>Дело № ${no(b)}: ${esc(evBrief(b))}</li>`}</ul>
    <form id="bd-form"><div class="form-input-group"><label for="bd-note">Почему эти дела связаны</label><textarea id="bd-note" rows="4" maxlength="280" required></textarea></div>
    <p class="bd-hint"><span id="bd-count">0</span> из 280 знаков. В день можно протянуть до ${max} ниток.</p>
    <div class="bd-acts"><button type="submit" class="btn-primary">Протянуть нитку</button><button type="button" class="btn-secondary" data-act="close">Отмена</button></div></form>`;
  s.hidden = false; const ta = $('#bd-note', s); ta.focus();
  ta.addEventListener('input', () => { $('#bd-count', s).textContent = ta.value.length; });
  $('#bd-form', s).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter; btn.disabled = true;
    try {
      const before = new Set(S.theories.map((t) => t.id));
      await createTheory(a, b, ta.value.trim());
      await refreshTheories();
      S.fresh = (S.theories.find((t) => !before.has(t.id)) || {}).id ?? null;
      closeSheet(); await render();
      showNotification('Нитка протянута', 'success');
    } catch (err) { showNotification(err.message || 'Не удалось протянуть нитку', 'error'); btn.disabled = false; }
  });
}

async function act(fn, ok) {
  try { await fn(); await refreshTheories(); await render(); if (ok) showNotification(ok, 'success'); }
  catch (err) { showNotification(err.message || 'Не получилось', 'error'); }
}

async function onClick(e) {
  const t = e.target;
  const kind = t.closest('[data-kind]');
  if (kind) { S.kind = kind.dataset.kind; S.item = null; S.page = 0; S.sheet = null; pickItemAfterKind(); return; }
  const pg = t.closest('[data-page]');
  if (pg) { S.page += Number(pg.dataset.page); S.sheet = null; render(); return; }
  const th = t.closest('[data-th]');
  if (th && !t.closest('.bd-sheet')) { openSheetFor(Number(th.dataset.th)); return; }
  const ev = t.closest('[data-ev]'); if (ev) { openEvent(Number(ev.dataset.ev)); return; }
  const open = t.closest('.bd-open');
  if (open && e.detail === 0 && !suppress) { activate(Number(open.dataset.open)); return; } // с клавиатуры; мышь — в pointerup
  const vote = t.closest('[data-vote]');
  if (vote && S.sheet) { const id = S.sheet; act(() => voteTheory(id, vote.dataset.vote)); return; }
  const a = t.closest('[data-act]'); if (!a) return;
  const id = S.sheet;
  if (a.dataset.act === 'close') closeSheet();
  else if (a.dataset.act === 'canon') act(() => setTheoryStatus(id, 'canon'), 'Нитка в каноне');
  else if (a.dataset.act === 'uncanon') act(() => setTheoryStatus(id, 'active'), 'Канон снят');
  else if (a.dataset.act === 'remove' && await askConfirm('Убрать нитку? Это нельзя отменить.')) { closeSheet(); act(() => setTheoryStatus(id, 'removed'), 'Нитка убрана'); }
}

function pickItemAfterKind() {
  const items = scopeItems(S.kind); S.item = items[0]?.id ?? null;
  const links = (i) => S.theories.filter((t) => i.events.some((e) => e.id === t.event_a) && i.events.some((e) => e.id === t.event_b)).length;
  S.item = ([...items].sort((a, b) => links(b) - links(a))[0] || {}).id ?? null;
  localStorage.setItem('vpBoard', JSON.stringify({ kind: S.kind, item: S.item }));
  render();
}

function init() {
  mount(); if (!link) return;
  const root = $('#board-root');
  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('keydown', onKey);
  root.addEventListener('change', (e) => {
    if (e.target.id !== 'bd-item') return;
    S.item = e.target.value; S.page = 0; S.sheet = null;
    localStorage.setItem('vpBoard', JSON.stringify({ kind: S.kind, item: S.item })); render();
  });
  supabase.auth.getSession().then(({ data }) => loadMe(data.session));
  supabase.auth.onAuthStateChange((_e, s) => setTimeout(() => loadMe(s), 0));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
