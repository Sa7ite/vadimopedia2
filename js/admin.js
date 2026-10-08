// T1.7: панель админа — настройки, персонажи, кампании, журнал действий
import {
  getSettings, updateSetting, getPersons, savePerson, deletePerson,
  getCampaigns, saveCampaign, deleteCampaign, getAuditLog
} from './api.js';
import { showNotification } from './ui.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const splitAliases = s => s.split(',').map(a => a.trim()).filter(Boolean);

const ACTIONS = { insert: 'добавил', update: 'изменил', delete: 'удалил', approve: 'одобрил' };
const TARGETS = { settings: 'настройку', persons: 'персонажа', campaigns: 'кампанию', events: 'событие', user_titles: 'титул' };

function describe(row) {
  const d = row.details || {};
  const obj = d.new || d.old || {};
  const name = obj.name || (obj.label ? `«${obj.label}»` : obj.key) || (obj.event_text ? `«${obj.event_text.slice(0, 60)}${obj.event_text.length > 60 ? '…' : ''}»` : `№ ${row.target_id}`);
  let extra = '';
  if (row.target_type === 'settings' && d.old && d.new) extra = `: ${d.old.value} → ${d.new.value}`;
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
    <details class="admin-block"><summary>Настройки игры</summary><div id="admin-settings"></div></details>
    <details class="admin-block"><summary>Журнал действий</summary><div id="admin-audit"></div></details>`;
  await Promise.all([renderPersons(), renderCampaigns(), renderSettings()]);
  box.querySelector('#admin-audit').closest('details').addEventListener('toggle', e => { if (e.target.open) renderAudit(); });
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
    const rows = await getAuditLog(50);
    el.innerHTML = rows.length ? `<ol class="audit-list">${rows.map(r => `
      <li><time>${new Date(r.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</time>
      <strong>${esc(r.actor_name)}</strong> ${esc(describe(r))}</li>`).join('')}</ol>` : '<p>Пока пусто.</p>';
  } catch (err) { el.innerHTML = `<p>Не удалось загрузить: ${esc(err.message)}</p>`; }
}
