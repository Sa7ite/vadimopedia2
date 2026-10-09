// T3.2: главная в теме «Секретное досье» — ящик картотеки, «Событие дня» на фото с запиской, том новой главы.
// Старая тема этот блок не показывает (themes.css). Тексты событий не меняются: длинные обрезает CSS с «…».
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const no = (id) => String(id).padStart(4, '0');
const year = (e) => (String(e.event_date || '').match(/\d+(?!.*\d)/) || [])[0] || '';
const go = (sec) => document.querySelector(`.nav-plates .nav-link[data-section="${sec}"]`)?.click();
const tab = (e) => [year(e), e.city].filter(Boolean).join(', ') || `Дело № ${no(e.id)}`;
let openFn = null;

// ящик выезжает один раз за сессию (design.md, раздел 8)
function slideOnce() {
  const d = $('#dh-drawer');
  if (!d || sessionStorage.getItem('vpDrawer')) return;
  sessionStorage.setItem('vpDrawer', '1');
  d.classList.add('slide');
}

export function renderDesk(events, onOpen) {
  const rows = $('#dh-rows');
  if (!rows) return;
  openFn = onOpen;
  const count = $('#dh-count');
  if (!events) { // гость: папки закрыты
    rows.innerHTML = Array.from({ length: 8 }, (_, i) =>
      `<div class="dh-fold locked" style="--d:${i}"><span class="dh-tab p${i % 3}">Секретно</span></div>`).join('');
    if (count) count.textContent = 'доступ по пропуску';
    slideOnce();
    return;
  }
  const fresh = [...events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 9);
  rows.innerHTML = fresh.length ? fresh.map((e, i) => `<button type="button" class="dh-fold" style="--d:${i}" data-id="${e.id}"
      aria-label="Дело № ${no(e.id)}: ${esc(tab(e))}"><span class="dh-tab p${i % 3}">${esc(tab(e))}</span>
      <span class="dh-line">${esc(e.event_text)}</span></button>`).join('')
    : '<p class="dh-empty">Ящик пока пуст — добавьте первое событие.</p>';
  if (count) count.textContent = `${events.length} ${plural(events.length, 'дело', 'дела', 'дел')}`;
  slideOnce();
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

// «Событие дня»: фото с годом и местом, рядом записка с текстом
window.vpDeskDay = (e, open) => {
  const side = $('#dh-side');
  if (!side || !e) return;
  $('#dh-year').textContent = year(e) || '????';
  $('#dh-city').textContent = e.city || 'место не указано';
  $('#dh-note-h').textContent = `Дело № ${no(e.id)}`;
  $('#dh-note-t').textContent = e.event_text;
  const b = $('#dh-note-btn');
  b.hidden = false;
  b.onclick = () => open && open(e);
};

// том летописи: последняя глава; «новая», если её ещё не читали
window.vpDeskTome = (c, isNew) => {
  const t = $('#dh-tome');
  if (!t || !c?.content) return;
  const heads = [...c.content.matchAll(/^#+\s*(.+)$/gm)].map((m) => m[1].trim());
  if (!heads.length) return;
  t.querySelector('b').textContent = heads[heads.length - 1];
  t.querySelector('span').textContent = isNew ? 'новая глава в летописи' : 'последняя глава летописи';
  t.classList.toggle('is-new', !!isNew);
  t.hidden = false;
};

document.addEventListener('click', (ev) => {
  const f = ev.target.closest('#dh-rows .dh-fold[data-id]');
  if (f) { f.classList.add('up'); setTimeout(() => f.classList.remove('up'), 400); openFn?.({ id: Number(f.dataset.id) }); return; }
  if (ev.target.closest('#dh-pull')) go('events');
  else if (ev.target.closest('#dh-tome')) go('chronicle');
  else { const k = ev.target.closest('.dh-note [data-click]'); if (k) $('#' + k.dataset.click)?.click(); }
});
