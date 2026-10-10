// T1.7: панель админа — настройки, персонажи, кампании, журнал действий
import {
  getSettings, updateSetting, getPersons, savePerson, deletePerson,
  getCampaigns, saveCampaign, getFactions, saveFaction, deleteFaction, deleteCampaign, getAuditLog,
  getAdminUsers, setUserRole, muteUser, revokeTitle, getAllTitles, grantTitle, undoAction,
  createTitle, updateTitle, deleteTitle
} from './api.js';
import { showNotification } from './ui.js';
import { supabase } from './config.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const splitAliases = s => s.split(',').map(a => a.trim()).filter(Boolean);

const ACTIONS = { insert: 'добавил', update: 'изменил', delete: 'удалил', approve: 'одобрил', reject: 'отклонил', return: 'вернул на доработку',
  revoke: 'отозвал', restore: 'вернул', mute: 'запретил писать в чат:', unmute: 'снял запрет писать в чат:', publish: 'опубликовал', rollback: 'откатил к версии',
  open: 'открыл голосование', close: 'закрыл голосование', theory_status: 'сменил статус', report_remove: 'убрал по жалобе', report_dismiss: 'отклонил жалобу на',
  role: 'сменил роль:', undo: 'отменил действие:' };
const TARGETS = { settings: 'настройку', persons: 'персонажа', campaigns: 'кампанию', events: 'событие', user_titles: 'титул', factions: 'фракцию', cases: 'дело',
  chat_mutes: '', chronicle: 'летопись', year_polls: '«Событие года»', theory: 'теории', reports: '', profiles: '' };
const ROLES = { user: 'участник', moderator: 'модератор', admin: 'админ' };
// что можно отменить (то же проверяет база)
const UNDOABLE = (r) => !r.undone_at && r.action !== 'undo' && (
  ['cases', 'reports'].includes(r.target_type) ||
  (r.target_type === 'chronicle' && r.action === 'publish') || (r.target_type === 'chat_mutes' && r.action === 'mute') ||
  r.target_type === 'theory' || (r.target_type === 'user_titles' && ['revoke', 'restore', 'insert', 'delete'].includes(r.action)) ||
  (r.target_type === 'profiles' && r.action === 'role') ||
  (r.target_type === 'events' && ['reject', 'return', 'approve', 'update', 'delete'].includes(r.action)) ||
  (['settings', 'persons', 'campaigns', 'factions'].includes(r.target_type) && ['insert', 'update', 'delete'].includes(r.action)));
let userNames = {};

function describe(row) {
  const d = row.details || {};
  const obj = d.new || d.old || {};
  const name = (row.target_type === 'cases' ? `№ ${String(row.target_id).padStart(4, '0')}` : null) || obj.name || (obj.label ? `«${obj.label}»` : obj.key) || (obj.event_text ? `«${obj.event_text.slice(0, 60)}${obj.event_text.length > 60 ? '…' : ''}»` : `№ ${row.target_id}`);
  let extra = '';
  if (row.target_type === 'settings' && d.old && d.new) extra = `: было ${d.old.value}, стало ${d.new.value}`;
  if (row.action === 'role') return `${ACTIONS.role} ${userNames[row.target_id] || 'участник'} — было «${ROLES[d.old] || d.old}», стало «${ROLES[d.new] || d.new}»`;
  if (row.action === 'mute' || row.action === 'unmute') return `${ACTIONS[row.action]} ${userNames[row.target_id] || 'участник'}${d.minutes ? ` на ${d.minutes} мин.` : ''}${d.reason ? ` (${d.reason})` : ''}`;
  if (row.action === 'reject' || row.action === 'return') return `${ACTIONS[row.action]} событие «${(d.old?.event_text || '').slice(0, 60)}» — ${d.reason}`;
  if (row.action === 'report_remove' || row.action === 'report_dismiss') return `${ACTIONS[row.action]} ${{ event: 'событие', theory: 'теорию', message: 'сообщение' }[d.type] || ''} «${(d.snapshot || '').slice(0, 60)}» (жалоба: ${d.reason})`;
  if (row.action === 'theory_status') return `${ACTIONS.theory_status} теории № ${row.target_id}: было «${d.old}», стало «${d.new}»`;
  if (row.action === 'undo') return `${ACTIONS.undo} ${ACTIONS[d.action] || d.action} ${TARGETS[row.target_type] ?? row.target_type}`;
  return `${ACTIONS[row.action] || row.action} ${TARGETS[row.target_type] || row.target_type} ${name}${extra}`;
}

let onListsChanged = () => {};

export async function setupAdminPanel(isAdmin, listsChanged) {
  const box = document.getElementById('admin-panel');
  if (!box) return;
  if (!isAdmin) { box.innerHTML = ''; return; }
  if (listsChanged) onListsChanged = listsChanged;
  box.innerHTML = `
    <details class="admin-block" open><summary>Персонажи</summary><div id="admin-persons"></div></details>
    <details class="admin-block"><summary>Кампании</summary><div id="admin-campaigns"></div></details>
    <details class="admin-block"><summary>Фракции</summary><div id="admin-factions"></div></details>
    <details class="admin-block"><summary>Титулы</summary><div id="admin-titles"></div></details>
    <details class="admin-block"><summary>Пользователи</summary><div id="admin-users"></div></details>
    <details class="admin-block"><summary>Настройки игры</summary><div id="admin-settings"></div></details>
    <details class="admin-block"><summary>Журнал действий</summary><div id="admin-audit"></div></details>`;
  await Promise.all([renderPersons(), renderCampaigns(), renderFactions(), renderSettings(), renderTitles()]);
  box.querySelector('#admin-audit').closest('details').addEventListener('toggle', e => { if (e.target.open) renderAudit(); });
  box.querySelector('#admin-users').closest('details').addEventListener('toggle', e => { if (e.target.open) renderUsers(); });
}

async function run(fn, okText) {
  try { await fn(); if (okText) showNotification(okText, 'success'); return true; }
  catch (err) {
    const msg = err.code === '23505' ? 'Такое имя уже есть' : err.message;
    showNotification(`Ошибка: ${msg}`, 'error'); return false;
  }
}

async function renderPersons() {
  const el = document.getElementById('admin-persons');
  const persons = await getPersons();
  el.innerHTML = `
    <p class="admin-hint">Прозвища через запятую — по ним сайт находит персонажа в тексте события.</p>
    <table class="admin-table"><thead><tr><th>Имя</th><th>Прозвища</th><th></th></tr></thead><tbody>
      ${persons.map(p => `<tr data-id="${p.id}">
        <td><input class="p-name" value="${esc(p.name)}" aria-label="Имя"></td>
        <td><input class="p-aliases" value="${esc((p.aliases || []).join(', '))}" aria-label="Прозвища"></td>
        <td class="admin-actions"><button class="btn-secondary p-save">Сохранить</button><button class="btn-secondary p-del">Удалить</button></td>
      </tr>`).join('')}
      <tr class="admin-new">
        <td><input class="p-name" placeholder="Новый персонаж" aria-label="Имя нового персонажа"></td>
        <td><input class="p-aliases" placeholder="Прозвища через запятую" aria-label="Прозвища нового персонажа"></td>
        <td class="admin-actions"><button class="btn-primary p-save">Добавить</button></td>
      </tr>
    </tbody></table>`;
  el.querySelectorAll('.p-save').forEach(btn => btn.addEventListener('click', async () => {
    const tr = btn.closest('tr');
    const name = tr.querySelector('.p-name').value.trim();
    if (!name) { showNotification('Введите имя', 'error'); return; }
    if (await run(() => savePerson({ id: tr.dataset.id, name, aliases: splitAliases(tr.querySelector('.p-aliases').value) }), tr.dataset.id ? 'Сохранено' : 'Персонаж добавлен')) {
      await renderPersons(); onListsChanged();
    }
  }));
  el.querySelectorAll('.p-del').forEach(btn => btn.addEventListener('click', async () => {
    const tr = btn.closest('tr');
    if (!confirm(`Удалить «${tr.querySelector('.p-name').value}»? Он пропадёт из участников всех событий. Запись останется в журнале.`)) return;
    if (await run(() => deletePerson(tr.dataset.id), 'Удалено')) { await renderPersons(); onListsChanged(); }
  }));
}

async function renderCampaigns() {
  const el = document.getElementById('admin-campaigns');
  const campaigns = await getCampaigns();
  el.innerHTML = `
    <p class="admin-hint">Порядок — число: чем меньше, тем выше в списке.</p>
    <table class="admin-table"><thead><tr><th>Порядок</th><th>Название</th><th></th></tr></thead><tbody>
      ${campaigns.map(c => `<tr data-id="${c.id}">
        <td><input class="c-order" type="number" min="0" value="${c.sort_order ?? 0}" aria-label="Порядок"></td>
        <td><input class="c-name" value="${esc(c.name)}" aria-label="Название"></td>
        <td class="admin-actions"><button class="btn-secondary c-save">Сохранить</button><button class="btn-secondary c-del">Удалить</button></td>
      </tr>`).join('')}
      <tr class="admin-new">
        <td><input class="c-order" type="number" min="0" value="${(campaigns.length + 1)}" aria-label="Порядок новой кампании"></td>
        <td><input class="c-name" placeholder="Новая кампания" aria-label="Название новой кампании"></td>
        <td class="admin-actions"><button class="btn-primary c-save">Добавить</button></td>
      </tr>
    </tbody></table>`;
  el.querySelectorAll('.c-save').forEach(btn => btn.addEventListener('click', async () => {
    const tr = btn.closest('tr');
    const name = tr.querySelector('.c-name').value.trim();
    if (!name) { showNotification('Введите название', 'error'); return; }
    const sort_order = parseInt(tr.querySelector('.c-order').value, 10) || 0;
    if (await run(() => saveCampaign({ id: tr.dataset.id, name, sort_order }), tr.dataset.id ? 'Сохранено' : 'Кампания добавлена')) {
      await renderCampaigns(); onListsChanged();
    }
  }));
  el.querySelectorAll('.c-del').forEach(btn => btn.addEventListener('click', async () => {
    const tr = btn.closest('tr');
    if (!confirm(`Удалить кампанию «${tr.querySelector('.c-name').value}»? У её событий кампания станет «не указана».`)) return;
    if (await run(() => deleteCampaign(tr.dataset.id), 'Удалено')) { await renderCampaigns(); onListsChanged(); }
  }));
}

async function renderSettings() {
  const el = document.getElementById('admin-settings');
  let settings;
  try { settings = await getSettings(); } catch (err) { el.innerHTML = `<p>Не удалось загрузить: ${esc(err.message)}</p>`; return; }
  el.innerHTML = `
    <p class="admin-hint">Целые числа от 0. Многие правила заработают в следующих фазах.</p>
    <table class="admin-table"><tbody>
      ${settings.map(s => `<tr data-key="${esc(s.key)}">
        <td><label for="set-${esc(s.key)}">${esc(s.label || s.key)}</label><div class="admin-key">${esc(s.key)}</div></td>
        <td><input id="set-${esc(s.key)}" type="number" min="0" step="1" value="${esc(s.value)}" data-old="${esc(s.value)}"></td>
      </tr>`).join('')}
    </tbody></table>
    <button class="btn-primary" id="btn-save-settings">Сохранить изменения</button>`;
  el.querySelector('#btn-save-settings').addEventListener('click', async () => {
    const changed = [...el.querySelectorAll('tr[data-key] input')].filter(i => i.value !== i.dataset.old);
    if (!changed.length) { showNotification('Ничего не изменено', 'info'); return; }
    for (const i of changed) {
      const v = Number(i.value);
      if (!Number.isInteger(v) || v < 0) { showNotification(`«${i.closest('tr').querySelector('label').textContent}»: нужно целое число от 0`, 'error'); return; }
    }
    if (await run(async () => { for (const i of changed) await updateSetting(i.closest('tr').dataset.key, Number(i.value)); }, `Сохранено: ${changed.length}`)) await renderSettings();
  });
}

async function renderAudit() {
  const el = document.getElementById('admin-audit');
  el.innerHTML = '<p>Загрузка…</p>';
  try {
    const [rows, users] = await Promise.all([getAuditLog(50), getAdminUsers().catch(() => [])]);
    userNames = Object.fromEntries(users.map(u => [u.id, u.full_name]));
    el.innerHTML = rows.length ? `<p class="admin-hint">«Отменить» возвращает как было. Удалённое событие вернётся без реакций и комментариев.</p><ol class="audit-list">${rows.map(r => `
      <li class="${r.undone_at ? 'is-undone' : ''}"><time>${new Date(r.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</time>
      <span><strong>${esc(r.actor_name)}</strong> ${esc(describe(r))}</span>
      ${r.undone_at ? '<em class="audit-undone">отменено</em>' : UNDOABLE(r) ? `<button type="button" class="btn-secondary audit-undo" data-id="${r.id}">Отменить</button>` : ''}</li>`).join('')}</ol>` : '<p>Пока пусто.</p>';
    el.querySelectorAll('.audit-undo').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Отменить это действие?')) return;
      b.disabled = true;
      if (await run(() => undoAction(b.dataset.id), 'Отменено')) { renderAudit(); onListsChanged(); } else b.disabled = false;
    }));
  } catch (err) { el.innerHTML = `<p>Не удалось загрузить: ${esc(err.message)}</p>`; }
}

// T2.14: пользователи — роль, запрет писать, титулы (всё проверяет база)
async function renderUsers() {
  const el = document.getElementById('admin-users');
  el.innerHTML = '<p>Загрузка…</p>';
  const [users, titles] = await Promise.all([getAdminUsers().catch(e => { el.innerHTML = `<p>${esc(e.message)}</p>`; return null; }), getAllTitles()]);
  if (!users) return;
  const myId = (await supabase.auth.getUser()).data.user?.id;
  const fmt = d => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<ul class="user-list">${users.map(u => `
    <li class="user-row" data-id="${u.id}">
      <div class="user-head"><strong>${esc(u.full_name || 'Без имени')}</strong>
        ${u.faction ? `<span class="badge">${esc(u.faction)}</span>` : ''}
        ${u.muted_until ? `<span class="badge badge-warn">молчит до ${fmt(u.muted_until)}</span>` : ''}
        ${u.arrested_until ? `<span class="badge badge-warn">в камере до ${fmt(u.arrested_until)}</span>` : ''}
        ${u.strikes ? `<span class="badge">убрано по жалобам: ${u.strikes}</span>` : ''}</div>
      <div class="user-ctrl">
        <label>Роль <select class="u-role" ${u.id === myId ? 'disabled title="Свою роль поменять нельзя"' : ''}>${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${u.id === myId ? '' : u.muted_until ? '<button type="button" class="btn-secondary" data-u="unmute">Снять запрет</button>'
          : '<button type="button" class="btn-secondary" data-u="mute" data-min="60">Молчать 1 ч</button><button type="button" class="btn-secondary" data-u="mute" data-min="1440">24 ч</button>'}
      </div>
      <div class="user-titles">${(u.titles || []).map(t => `<span class="u-title ${t.revoked ? 'revoked' : ''}">${esc(t.title)}${t.serial ? ` № ${String(t.serial).padStart(4, '0')}` : ''}
          <button type="button" class="u-title-btn" data-u="${t.revoked ? 'restore' : 'revoke'}" data-ut="${t.id}">${t.revoked ? 'вернуть' : 'отозвать'}</button></span>`).join('') || '<small>Титулов нет</small>'}
        <select class="u-grant" aria-label="Выдать титул"><option value="">+ выдать титул…</option>${titles.map(t => `<option value="${t.id}">${esc(t.title_name)}</option>`).join('')}</select>
      </div>
    </li>`).join('')}</ul>`;
  el.querySelectorAll('.user-row').forEach(li => {
    const id = li.dataset.id, name = li.querySelector('strong').textContent;
    li.querySelector('.u-role').addEventListener('change', async e => {
      const role = e.target.value;
      if (!confirm(`Сделать «${name}» — ${ROLES[role]}?`)) { renderUsers(); return; }
      await run(() => setUserRole(id, role), 'Роль изменена'); renderUsers();
    });
    li.querySelector('.u-grant').addEventListener('change', async e => {
      if (!e.target.value) return;
      await run(() => grantTitle(id, e.target.value), 'Титул выдан'); renderUsers();
    });
    li.addEventListener('click', async e => {
      const b = e.target.closest('[data-u]'); if (!b || b.tagName === 'SELECT') return;
      const a = b.dataset.u;
      if (a === 'mute') {
        const reason = prompt(`Причина запрета для «${name}» (увидит человек):`, '');
        if (reason === null) return;
        await run(() => muteUser(id, Number(b.dataset.min), reason), 'Запрет поставлен');
      } else if (a === 'unmute') await run(() => muteUser(id, 0, null), 'Запрет снят');
      else if (a === 'revoke' || a === 'restore') {
        if (a === 'revoke' && !confirm('Отозвать удостоверение?')) return;
        await run(() => revokeTitle(Number(b.dataset.ut), a === 'revoke'), a === 'revoke' ? 'Отозвано' : 'Возвращено');
      } else return;
      renderUsers();
    });
  });
}

// T2.11: фракции — создаёт и правит только админ (права проверяет база)
async function renderFactions() {
  const el = document.getElementById('admin-factions');
  const list = await getFactions();
  const row = f => `<tr data-id="${f?.id ?? ''}">
    <td><input class="f-name" value="${esc(f?.name)}" placeholder="${f ? '' : 'Новая фракция'}" aria-label="Название фракции"></td>
    <td><input class="f-motto" value="${esc(f?.motto)}" placeholder="Девиз" aria-label="Девиз"></td>
    <td><input class="f-color" type="color" value="${esc(f?.color || '#6b3fa0')}" aria-label="Цвет"></td>
    <td class="admin-actions"><button class="btn-secondary f-save">${f ? 'Сохранить' : 'Добавить'}</button>${f ? `<button class="btn-secondary f-del">Удалить</button><small>${f.members} уч.</small>` : ''}</td></tr>`;
  el.innerHTML = `<p class="admin-hint">Участник состоит в одной фракции; менять её можно не чаще, чем раз в N дней (настройка «Дней между сменой фракции»).</p>
    <table class="admin-table"><thead><tr><th>Название</th><th>Девиз</th><th>Цвет</th><th></th></tr></thead><tbody>${list.map(row).join('')}${row(null)}</tbody></table>`;
  el.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id || null;
    tr.querySelector('.f-save').addEventListener('click', async () => {
      const ok = await run(() => saveFaction({ id, name: tr.querySelector('.f-name').value, motto: tr.querySelector('.f-motto').value, color: tr.querySelector('.f-color').value }), 'Сохранено');
      if (ok) renderFactions();
    });
    tr.querySelector('.f-del')?.addEventListener('click', async () => {
      if (!confirm('Удалить фракцию? Участники останутся без фракции.')) return;
      if (await run(() => deleteFaction(id), 'Удалено')) renderFactions();
    });
  });
}

// Титулы: создание, правка и удаление (перенесено из профиля админа). Выдать титул человеку — в «Пользователях»
async function renderTitles() {
  const el = document.getElementById('admin-titles');
  const list = await getAllTitles();
  const row = t => `<tr data-id="${t?.id ?? ''}">
    <td><input class="t-name" value="${esc(t?.title_name)}" placeholder="${t ? '' : 'Новый титул'}" aria-label="Название титула"></td>
    <td><input class="t-desc" value="${esc(t?.description)}" placeholder="Описание" aria-label="Описание"></td>
    <td><select class="t-type" aria-label="Вид"><option value="common" ${t?.title_type !== 'special' ? 'selected' : ''}>Базовый</option><option value="special" ${t?.title_type === 'special' ? 'selected' : ''}>Особый</option></select></td>
    <td><label class="admin-check" style="white-space:nowrap"><input type="checkbox" class="t-arrest" ${(t?.grants_authority || []).includes('arrest') ? 'checked' : ''}> арест</label></td>
    <td class="admin-actions"><button class="btn-${t ? 'secondary' : 'primary'} t-save">${t ? 'Сохранить' : 'Добавить'}</button>${t ? '<button class="btn-secondary t-del">Удалить</button>' : ''}</td></tr>`;
  el.innerHTML = `<p class="admin-hint">Базовые титулы человек надевает сам (не больше 3), особые — выдаёт админ по запросу или в блоке «Пользователи». «Право ареста» — удостоверение для дел.</p>
    <table class="admin-table"><thead><tr><th>Название</th><th>Описание</th><th>Вид</th><th>Полномочия</th><th></th></tr></thead><tbody>${list.map(row).join('')}${row(null)}</tbody></table>`;
  el.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id ? Number(tr.dataset.id) : null;
    tr.querySelector('.t-save').addEventListener('click', async () => {
      const name = tr.querySelector('.t-name').value.trim();
      if (!name) { showNotification('Введите название титула', 'error'); return; }
      const fields = { title_name: name, description: tr.querySelector('.t-desc').value.trim(), title_type: tr.querySelector('.t-type').value,
        grants_authority: tr.querySelector('.t-arrest').checked ? ['arrest'] : [] };
      const ok = await run(async () => {
        if (id) await updateTitle(id, fields);
        else { const t = await createTitle(fields.title_name, fields.title_type, fields.description, ''); if (fields.grants_authority.length) await updateTitle(t.id, { grants_authority: fields.grants_authority }); }
      }, id ? 'Сохранено' : 'Титул создан');
      if (ok) renderTitles();
    });
    tr.querySelector('.t-del')?.addEventListener('click', async () => {
      if (!confirm(`Удалить титул «${tr.querySelector('.t-name').value}» из системы? Он пропадёт у всех, кто его носит.`)) return;
      if (await run(() => deleteTitle(id), 'Титул удалён')) renderTitles();
    });
  });
}
