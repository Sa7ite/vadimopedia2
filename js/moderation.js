// T2.14: очередь модерации, жалобы, «Мои заявки», окно с причиной. Права проверяет база
import {
  getPendingEvents, approveEvent, reviewEvent, reportContent, resolveReport, getOpenReports,
  getCases, adminWarrant, getTheories, setTheoryStatus, getMySubmissions, deleteEvent
} from './api.js';
import { showNotification } from './ui.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (t, n = 220) => { t = String(t || ''); return t.length > n ? t.slice(0, n) + '…' : t; };
const day = d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

// Окно «напишите причину»: Promise<string|null>
export function askText({ title, label, placeholder = '', ok = 'Отправить', min = 3, max = 500, danger = false }) {
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'modal ask-modal'; m.style.display = 'flex';
    m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="ask-title">
      <button type="button" class="close-modal" aria-label="Закрыть">&times;</button>
      <div class="modal-header"><h2 id="ask-title">${esc(title)}</h2></div>
      <label class="ask-label" for="ask-text">${esc(label)}</label>
      <textarea id="ask-text" rows="3" maxlength="${max}" placeholder="${esc(placeholder)}"></textarea>
      <div class="ask-foot"><small class="ask-count">0 / ${max}</small>
        <button type="button" class="btn-secondary" data-ask="no">Отмена</button>
        <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-ask="ok" disabled>${esc(ok)}</button></div>
    </div>`;
    document.body.appendChild(m);
    const ta = m.querySelector('textarea'), okBtn = m.querySelector('[data-ask="ok"]'), cnt = m.querySelector('.ask-count');
    const done = v => { m.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    ta.addEventListener('input', () => { const n = ta.value.trim().length; cnt.textContent = `${ta.value.length} / ${max}`; okBtn.disabled = n < min; });
    okBtn.onclick = () => done(ta.value.trim());
    m.querySelector('[data-ask="no"]').onclick = () => done(null);
    m.querySelector('.close-modal').onclick = () => done(null);
    m.addEventListener('click', e => { if (e.target === m) done(null); });
    setTimeout(() => ta.focus(), 30);
  });
}

// «Пожаловаться» — на событие, теорию или сообщение
export async function reportFlow(type, id) {
  const what = { event: 'событие', theory: 'теорию', message: 'сообщение' }[type];
  const reason = await askText({ title: `Пожаловаться на ${what}`, label: 'Что не так? Админ увидит жалобу и решит, убирать ли. Автор не узнает, кто пожаловался.', placeholder: 'Например: настоящие оскорбления, чужие личные данные…', ok: 'Отправить жалобу' });
  if (!reason) return;
  try { await reportContent(type, id, reason); showNotification('Жалоба отправлена — админ разберётся', 'success'); }
  catch (e) { showNotification(e.message, 'error'); }
}

// ---------- Очередь ----------
let qFilter = 'all';
export async function renderQueue(el, profile, onChanged = () => {}) {
  if (!el) return;
  const isAdmin = profile.role === 'admin';
  el.innerHTML = '<h3>Очередь</h3><p class="q-empty">Загрузка…</p>';
  const weekAgo = Date.now() - 7 * 864e5;
  const [events, cases, theories, reports] = await Promise.all([
    getPendingEvents(),
    isAdmin ? getCases().catch(() => []) : [],
    isAdmin ? getTheories({ status: 'active' }) : [],
    isAdmin ? getOpenReports() : []
  ]);
  const warrants = (cases || []).filter(c => c.status === 'warrant');
  const fresh = theories.filter(t => new Date(t.created_at).getTime() > weekAgo);
  // жалобы — по одной карточке на материал
  const groups = {};
  reports.forEach(r => { (groups[r.target_type + ':' + r.target_id] ||= []).push(r); });
  const items = [
    ...events.map(e => ({ kind: 'event', at: e.created_at, e })),
    ...warrants.map(c => ({ kind: 'warrant', at: c.created_at, c })),
    ...fresh.map(t => ({ kind: 'theory', at: t.created_at, t })),
    ...Object.values(groups).map(g => ({ kind: 'report', at: g[0].created_at, g }))
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  const tabs = [['all', 'Все'], ['event', 'События'], ...(isAdmin ? [['warrant', 'Ордера'], ['theory', 'Теории'], ['report', 'Жалобы']] : [])];
  const count = k => k === 'all' ? items.length : items.filter(i => i.kind === k).length;
  if (!tabs.some(t => t[0] === qFilter)) qFilter = 'all';
  const shown = items.filter(i => qFilter === 'all' || i.kind === qFilter);
  el.innerHTML = `<h3>Очередь</h3>
    <div class="q-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-q="${k}" aria-selected="${k === qFilter}">${l} <b>${count(k)}</b></button>`).join('')}</div>
    <ul class="q-list">${shown.length ? shown.map(itemHtml).join('') : '<li class="q-empty">Пусто — всё разобрано.</li>'}</ul>`;
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { qFilter = b.dataset.q; renderQueue(el, profile, onChanged); });
  el.querySelector('.q-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const id = b.dataset.id, act = b.dataset.act;
    let ok = null;
    try {
      if (act === 'approve') { await approveEvent(id); ok = 'Событие одобрено'; }
      else if (act === 'return' || act === 'reject') {
        const reason = await askText(act === 'return'
          ? { title: 'Вернуть на доработку', label: 'Что исправить? Автор увидит это в профиле, поправит — и событие снова придёт сюда.', ok: 'Вернуть автору' }
          : { title: 'Отклонить событие', label: 'Причина отказа. Автор увидит её в профиле.', ok: 'Отклонить', danger: true });
        if (!reason) return;
        await reviewEvent(id, act, reason); ok = act === 'return' ? 'Возвращено автору на доработку' : 'Событие отклонено';
      }
      else if (act === 'warrant-yes' || act === 'warrant-no') { await adminWarrant(id, act === 'warrant-yes'); ok = act === 'warrant-yes' ? 'Ордер выдан' : 'В ордере отказано'; }
      else if (act === 'canon' || act === 'removed') {
        if (act === 'removed' && !confirm('Убрать теорию?')) return;
        await setTheoryStatus(Number(id), act); ok = act === 'canon' ? 'Теория признана каноном' : 'Теория убрана';
      }
      else if (act === 'rep-remove' || act === 'rep-dismiss') {
        const remove = act === 'rep-remove';
        if (remove && !confirm('Убрать материал? Отменить можно в журнале действий.')) return;
        await resolveReport(id, remove); ok = remove ? 'Убрано по жалобе' : 'Жалоба отклонена';
      }
      b.disabled = true;
      showNotification(ok, 'success');
      await renderQueue(el, profile, onChanged);
      onChanged();
    } catch (err) { showNotification(err.message, 'error'); }
  });
}

function itemHtml(i) {
  if (i.kind === 'event') {
    const e = i.e;
    return `<li class="q-item"><span class="q-kind">Событие</span>
      <p class="q-text">${e.title ? `<b>${esc(e.title)}.</b> ` : ''}${esc(short(e.event_text, 400))}</p>
      <p class="q-meta">${esc(e.profiles?.full_name || 'Аноним')} · ${day(e.created_at)}${e.event_date ? ' · ' + esc(e.event_date) : ''}${e.is_lore_significant ? ' · значимое для летописи' : ''}${e.as_chronicler ? ' · от имени Летописца' : ''}</p>
      ${e.review_note ? `<p class="q-note">Исправлено после замечания: «${esc(e.review_note)}»</p>` : ''}
      <div class="q-actions"><button type="button" class="btn-approve" data-act="approve" data-id="${e.id}">Одобрить</button>
        <button type="button" class="btn-secondary" data-act="return" data-id="${e.id}">На доработку</button>
        <button type="button" class="btn-reject" data-act="reject" data-id="${e.id}">Отклонить</button></div></li>`;
  }
  if (i.kind === 'warrant') {
    const c = i.c;
    return `<li class="q-item"><span class="q-kind">Ордер · дело № ${String(c.id).padStart(4, '0')}</span>
      <p class="q-text">${esc(c.accuser)} обвиняет ${esc(c.defendant)}: «${esc(short(c.charge, 300))}»</p>
      <p class="q-meta">${day(c.created_at)} · голосов фракции: ${c.warrant_votes ?? 0} · улик: ${(c.evidence || []).length}</p>
      <div class="q-actions"><button type="button" class="btn-approve" data-act="warrant-yes" data-id="${c.id}">Выдать ордер</button>
        <button type="button" class="btn-reject" data-act="warrant-no" data-id="${c.id}">Отказать</button></div></li>`;
  }
  if (i.kind === 'theory') {
    const t = i.t;
    return `<li class="q-item"><span class="q-kind">Новая теория</span>
      <p class="q-text">«${esc(t.note)}»</p>
      <p class="q-meta">${esc(t.author_name || 'Аноним')} · ${day(t.created_at)} · верю ${t.believe} / не верю ${t.doubt}</p>
      <p class="q-note">${esc(t.event_a_title || short(t.event_a_text, 90))}${t.event_b_text || t.event_b_title ? ` и ${esc(t.event_b_title || short(t.event_b_text, 90))}` : ''}</p>
      <div class="q-actions"><button type="button" class="btn-approve" data-act="canon" data-id="${t.id}">В канон</button>
        <button type="button" class="btn-reject" data-act="removed" data-id="${t.id}">Убрать</button></div></li>`;
  }
  const g = i.g, r = g[0];
  const what = { event: 'событие', theory: 'теорию', message: 'сообщение в чате' }[r.target_type];
  return `<li class="q-item is-report"><span class="q-kind">Жалоба на ${what}${g.length > 1 ? ` · ${g.length} жалобы` : ''}</span>
    <p class="q-text">«${esc(short(r.snapshot, 400))}»</p>
    <ul class="q-reasons">${g.map(x => `<li><b>${esc(x.reporter?.full_name || '—')}:</b> ${esc(x.reason)}</li>`).join('')}</ul>
    <div class="q-actions"><button type="button" class="btn-reject" data-act="rep-remove" data-id="${r.id}">Убрать ${what.split(' ')[0]}</button>
      <button type="button" class="btn-secondary" data-act="rep-dismiss" data-id="${r.id}">Отклонить жалобу</button></div></li>`;
}

// ---------- «Мои заявки» в профиле ----------
export async function renderMySubmissions(el, userId, onEdit) {
  if (!el) return;
  const list = await getMySubmissions(userId);
  if (!list.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const st = e => e.review_status === 'rejected' ? ['rejected', 'Отклонено'] : e.review_status === 'needs_work' ? ['needs-work', 'На доработку'] : ['pending', 'На проверке'];
  el.innerHTML = `<h4>Мои заявки</h4><ul class="sub-list">${list.map(e => { const [c, l] = st(e); return `
    <li class="sub-item ${c}"><span class="sub-stamp">${l}</span>
      <p>${e.title ? `<b>${esc(e.title)}.</b> ` : ''}${esc(short(e.event_text, 200))}</p>
      ${e.review_note && e.review_status ? `<p class="sub-note">Модератор: «${esc(e.review_note)}»</p>` : ''}
      <div class="sub-actions">${e.review_status === 'needs_work' ? `<button type="button" class="btn-primary" data-sub="edit" data-id="${e.id}">Исправить и отправить</button>` : ''}
        <button type="button" class="btn-secondary" data-sub="del" data-id="${e.id}">${e.review_status === 'rejected' ? 'Удалить' : 'Отозвать'}</button></div>
    </li>`; }).join('')}</ul>`;
  el.onclick = async ev => {
    const b = ev.target.closest('[data-sub]'); if (!b) return;
    const e = list.find(x => String(x.id) === b.dataset.id);
    if (b.dataset.sub === 'edit') { onEdit?.(e, () => renderMySubmissions(el, userId, onEdit)); return; }
    if (!confirm('Удалить заявку?')) return;
    try { await deleteEvent(e.id); showNotification('Заявка удалена', 'success'); renderMySubmissions(el, userId, onEdit); }
    catch (err) { showNotification(err.message, 'error'); }
  };
}
