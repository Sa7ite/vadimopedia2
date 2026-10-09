// T2.15: колокольчик — список уведомлений, «прочитано», настройки. Уведомления пишет только база
import {
  getNotifications, getUnreadCount, markNotificationsRead, getNotificationPrefs, saveNotificationPrefs,
  subscribeNotifications, unsubscribeNotifications
} from './api.js';
import { showNotification } from './ui.js';
import { icon } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KINDS = [
  ['reply', 'Ответы мне в чате'], ['mention', 'Упоминания @'], ['comment', 'Комментарии к моим событиям'],
  ['review', 'Решения по моим событиям'], ['case', 'Дела и приговоры (всегда)'], ['chronicle', 'Новая глава летописи'],
  ['theory', 'Голоса за мои теории'], ['year', '«Событие года»'], ['achievement', 'Новые достижения'], ['title', 'Выданные титулы']
];
const KIND_ICON = { reply: 'chat', mention: 'chat', comment: 'chat', review: 'check', case: 'badge', chronicle: 'scroll', theory: 'theory', year: 'trophy', achievement: 'trophy', title: 'badge' };

let st = null; // { userId, ch, timer, prefs, open, handlers }

function ago(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export async function setupBell(profile, handlers) {
  if (!profile) return teardownBell();
  if (st?.userId === profile.id) return refreshCount();
  teardownBell();
  const nav = document.querySelector('.navbar .container');
  if (!nav) return;
  const wrap = document.createElement('div');
  wrap.className = 'bell-wrap'; wrap.id = 'bell';
  wrap.innerHTML = `<button type="button" class="bell-btn" aria-haspopup="true" aria-expanded="false" aria-label="Уведомления">
      ${icon('bell')}<span class="bell-count" hidden></span></button>
    <div class="bell-panel" role="dialog" aria-label="Уведомления" hidden></div>`;
  nav.appendChild(wrap);
  st = { userId: profile.id, handlers, prefs: await getNotificationPrefs(), open: false };
  wrap.querySelector('.bell-btn').addEventListener('click', () => toggle());
  document.addEventListener('click', outside);
  document.addEventListener('keydown', onEsc);
  st.ch = subscribeNotifications(profile.id, n => {
    refreshCount();
    if (st.open) renderList();
    else if (!st.prefs.quiet) showNotification(n.title, 'info');
  });
  st.timer = setInterval(refreshCount, 60000);   // запасной путь, если realtime отвалился
  refreshCount();
}

export function teardownBell() {
  if (!st) { document.getElementById('bell')?.remove(); return; }
  unsubscribeNotifications(st.ch); clearInterval(st.timer);
  document.removeEventListener('click', outside); document.removeEventListener('keydown', onEsc);
  document.getElementById('bell')?.remove();
  st = null;
}

function outside(e) { if (st?.open && !e.target.closest('#bell')) toggle(false); }
function onEsc(e) { if (st?.open && e.key === 'Escape') { toggle(false); document.querySelector('#bell .bell-btn')?.focus(); } }

async function refreshCount() {
  const el = document.querySelector('#bell .bell-count');
  if (!el) return;
  const n = await getUnreadCount();
  el.hidden = !n; el.textContent = n > 99 ? '99+' : n;
  document.querySelector('#bell .bell-btn')?.setAttribute('aria-label', n ? `Уведомления: ${n} новых` : 'Уведомления');
}

function toggle(force) {
  st.open = force ?? !st.open;
  const panel = document.querySelector('#bell .bell-panel');
  panel.hidden = !st.open;
  // на телефоне панель во всю ширину — сразу под колокольчиком
  const top = Math.round(document.querySelector('#bell .bell-btn').getBoundingClientRect().bottom + 8);
  panel.style.top = innerWidth <= 600 ? `${top}px` : '';
  panel.style.maxHeight = innerWidth <= 600 ? `calc(100vh - ${top + 12}px)` : '';
  document.querySelector('#bell .bell-btn').setAttribute('aria-expanded', String(st.open));
  if (st.open) renderList();
}

async function renderList() {
  const panel = document.querySelector('#bell .bell-panel');
  if (!panel) return;
  const list = await getNotifications(30);
  const unread = list.filter(n => !n.read_at).length;
  panel.innerHTML = `<div class="bell-head"><b>Уведомления</b>
      ${unread ? '<button type="button" class="bell-link" data-b="all">Прочитать все</button>' : ''}
      <button type="button" class="bell-link" data-b="prefs">Настройки</button></div>
    <ul class="bell-list">${list.length ? list.map(n => `
      <li><button type="button" class="bell-item ${n.read_at ? '' : 'unread'}" data-id="${n.id}">
        <span class="bell-ico" aria-hidden="true">${icon(KIND_ICON[n.kind] || 'star')}</span>
        <span class="bell-txt"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<time>${ago(n.created_at)}</time></span>
      </button></li>`).join('') : '<li class="bell-empty">Пока тихо. Здесь появятся ответы, упоминания, решения и дела.</li>'}</ul>`;
  panel.onclick = async e => {
    const b = e.target.closest('[data-b], .bell-item'); if (!b) return;
    e.stopPropagation();
    if (b.dataset.b === 'all') { await markNotificationsRead().catch(() => {}); refreshCount(); renderList(); return; }
    if (b.dataset.b === 'prefs') { renderPrefs(); return; }
    const n = list.find(x => String(x.id) === b.dataset.id);
    if (!n.read_at) { markNotificationsRead([n.id]).then(refreshCount).catch(() => {}); }
    toggle(false);
    go(n.link || {});
  };
}

function go(l) {
  const h = st?.handlers || {};
  if (l.event_id) h.openEvent?.(l.event_id);
  else if (l.section === 'chat') h.openChat?.(l.channel || 'general');
  else if (l.section) h.openSection?.(l.section);
}

function renderPrefs() {
  const panel = document.querySelector('#bell .bell-panel');
  const muted = new Set(st.prefs.muted_kinds || []);
  panel.innerHTML = `<div class="bell-head"><b>Что присылать</b><button type="button" class="bell-link" data-b="back">← Назад</button></div>
    <form class="bell-prefs">${KINDS.map(([k, l]) => `<label><input type="checkbox" value="${k}" ${muted.has(k) ? '' : 'checked'} ${k === 'case' ? 'disabled' : ''}> ${l}</label>`).join('')}
      <label class="bell-quiet"><input type="checkbox" name="quiet" ${st.prefs.quiet ? 'checked' : ''}> Не беспокоить — без всплывающих окон (колокольчик всё равно считает)</label>
      <button type="submit" class="btn-primary">Сохранить</button></form>`;
  panel.onclick = e => { if (e.target.closest('[data-b="back"]')) { e.stopPropagation(); renderList(); } };
  panel.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    const off = [...f.querySelectorAll('input[value]')].filter(i => !i.checked && !i.disabled).map(i => i.value);
    const quiet = f.quiet.checked;
    try { await saveNotificationPrefs(off, quiet); st.prefs = { muted_kinds: off, quiet }; showNotification('Настройки уведомлений сохранены', 'success'); renderList(); }
    catch (err) { showNotification(err.message, 'error'); }
  });
}
