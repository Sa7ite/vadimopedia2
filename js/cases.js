// T2.12: ДЕЛА — открытие, ордер, «к вам пришли», удостоверение, ответ, суд, приговор, апелляция (права — в базе)
import { icon } from './icons.js';
import { showNotification } from './ui.js';
import {
  getCases, openCase, supportWarrant, adminWarrant, answerDoor, submitDefense, voteVerdict, adminVerdict,
  appealCase, cancelCase, getArrest, getCaseCandidates, getMyEvidence, getSettingValue
} from './api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const caseNo = n => '№ ' + String(n).padStart(4, '0');
const fmt = d => d ? new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
const hoursWord = h => h % 10 === 1 && h % 100 !== 11 ? 'час' : [2, 3, 4].includes(h % 10) && ![12, 13, 14].includes(h % 100) ? 'часа' : 'часов';
const STAMP = { warrant: 'Ждёт ордера', arrest: 'К ответчику пришли', trial: 'Суд идёт' };
const VERDICT = { guilty: 'Виновен', acquitted: 'Оправдан', invalid: 'Недействительно', cancelled: 'Отменено', rejected: 'Ордер отклонён', expired: 'Ордер не получен' };
const AUTH = { arrest: 'арест' };

let me = null;
let prefill = null;
let cfg = {};

// из чужого профиля: «Открыть дело» с готовым ответчиком
export function openCaseAgainst(userId) { prefill = userId; }

// после входа: «К вам пришли» — короткое напоминание и метка у раздела
export async function checkDoorKnock(profile) {
  const link = document.querySelector('.nav-link[data-section="cases"]');
  try {
    const mine = (await getCases()).filter(c => c.status === 'arrest' && c.defendant_id === profile.id);
    link?.classList.toggle('has-alert', mine.length > 0);
    if (mine.length) showNotification(`К вам пришли: дело ${caseNo(mine[0].id)}. Откройте раздел «Дела».`, 'info');
  } catch { /* дел нет или нет сети — молчим */ }
}

export async function renderCases(profile) {
  me = profile;
  const box = document.getElementById('cases-content');
  if (!box || !me) return;
  box.innerHTML = '<p>Загрузка…</p>';
  let cases, evidence, people, arrest;
  try {
    [cases, evidence, people, arrest, cfg.votes, cfg.hours, cfg.max, cfg.appeals] = await Promise.all([
      getCases(), getMyEvidence().catch(() => []), getCaseCandidates(me.id), getArrest(me.id),
      getSettingValue('warrant.votes_required', 2), getSettingValue('case.verdict_hours', 72),
      getSettingValue('sentence.max_hours', 24), getSettingValue('appeal.max', 1)]);
  } catch (err) { box.innerHTML = `<p class="empty-state">Не удалось загрузить дела: ${esc(err.message)}</p>`; return; }
  cfg.arrested = !!arrest;
  document.querySelector('.nav-link[data-section="cases"]')?.classList.toggle('has-alert', cases.some(c => c.status === 'arrest' && c.defendant_id === me.id));
  const free = evidence.filter(e => !e.case_id);
  const open = cases.filter(c => c.status !== 'closed');
  const closed = cases.filter(c => c.status === 'closed');
  box.innerHTML = `
    ${arrest ? `<p class="case-jail">${icon('alert')} Вы под арестом до ${fmt(arrest)}. Пока нельзя публиковать события, голосовать и писать в общий чат. Камера открыта в чате.</p>` : ''}
    <p class="case-lead">Шуточный суд Вадимов. Дело открывают с обвинением и хотя бы одной своей уликой. Ордер выдаёт админ или ${cfg.votes} участника фракции обвинителя. Потом к ответчику приходят, он отвечает, идёт суд (${cfg.hours} ч), приговор — до ${cfg.max} ч камеры. За ложное обвинение такой же срок получает обвинитель.</p>
    <details class="case-new" ${prefill ? 'open' : ''}>
      <summary class="btn-primary">Открыть дело</summary>
      ${formHtml(people, free)}
    </details>
    ${cases.length ? '' : '<p class="empty-state">Дел пока нет. Вадимы чисты.</p>'}
    ${open.length ? `<h3 class="case-group">Открытые (${open.length})</h3><div class="case-list">${open.map(cardHtml).join('')}</div>` : ''}
    ${closed.length ? `<h3 class="case-group">Архив (${closed.length})</h3><div class="case-list">${closed.map(cardHtml).join('')}</div>` : ''}`;
  bind(box);
  if (prefill) box.querySelector('.case-new')?.scrollIntoView({ block: 'start' });
  prefill = null;
}

function formHtml(people, free) {
  if (cfg.arrested) return '<p class="case-note">Под арестом дела не открывают.</p>';
  if (!free.length) return '<p class="case-note">Нужна хотя бы одна улика. Нажмите «Улика» у события или значок папки у сообщения в чате — потом возвращайтесь.</p>';
  return `<form class="case-form" id="case-form">
    <label>Ответчик
      <select name="defendant" required><option value="">— выберите —</option>
        ${people.map(p => `<option value="${p.id}" ${p.id === prefill ? 'selected' : ''}>${esc(p.full_name || 'Без имени')}</option>`).join('')}
      </select></label>
    <label>Обвинение <textarea name="charge" rows="3" minlength="5" maxlength="500" required placeholder="В чём обвиняется (до 500 знаков)"></textarea></label>
    <fieldset><legend>Улики (хотя бы одна)</legend>
      ${free.map(e => `<label class="case-ev-pick"><input type="checkbox" name="ev" value="${e.id}"> <span><b>${esc(e.snapshot_author || 'Аноним')}:</b> ${esc(e.snapshot_text.slice(0, 140))}${e.snapshot_text.length > 140 ? '…' : ''}</span></label>`).join('')}
    </fieldset>
    <p class="case-note">Приложенные улики увидят все участники, убрать их из дела будет нельзя.</p>
    <button type="submit" class="btn-primary">Подать дело</button>
  </form>`;
}

function credHtml(cr) {
  if (!cr) return '<p class="case-warn">Удостоверения нет.</p>';
  const ok = cr.genuine && !cr.revoked && (cr.authority || []).includes('arrest');
  return `<div class="case-cred">
    <article class="cred-card is-special ${cr.revoked ? 'is-revoked' : ''}" style="--i:1">
      <div class="cred-top"><span>Удостоверение</span><b class="cred-no">№ ${String(cr.serial || 0).padStart(4, '0')}</b></div>
      <h4>${esc(cr.title)}</h4>
      <p class="cred-holder">${esc(cr.holder || '')}</p>
      <p class="cred-meta">Выдано ${cr.granted_at ? new Date(cr.granted_at).toLocaleDateString('ru-RU') : '—'} · полномочия: ${esc((cr.authority || []).map(a => AUTH[a] || a).join(', ') || 'нет')}</p>
      ${cr.revoked ? `<span class="cred-stamp">Отозвано ${new Date(cr.revoked_at).toLocaleDateString('ru-RU')}</span>` : ''}
    </article>
    <p class="${ok ? 'case-ok' : 'case-warn'}">${ok ? `${icon('check')} Сайт проверил: удостоверение настоящее, действует и даёт право ареста.` : `${icon('alert')} Документы не в порядке.`}</p>
  </div>`;
}

function verdictLine(c) {
  if (c.verdict === 'guilty') return `Приговор: виновен, ${c.sentence_hours} ${hoursWord(c.sentence_hours)} камеры${c.sentence_until ? ` (до ${fmt(c.sentence_until)})` : ''}.`;
  if (c.verdict === 'acquitted') return c.false_accusation
    ? `Оправдан. Обвинение признано ложным: обвинителю ${c.sentence_hours} ${hoursWord(c.sentence_hours)} камеры${c.sentence_until ? ` (до ${fmt(c.sentence_until)})` : ''}.`
    : 'Оправдан.';
  if (c.verdict === 'invalid') return 'Дело недействительно: документы не в порядке. Следователю вынесено предупреждение.';
  if (c.verdict === 'cancelled') return 'Админ отменил дело, ограничения сняты.';
  if (c.verdict === 'rejected') return 'Админ отказал в ордере.';
  if (c.verdict === 'expired') return `Ордер не получен за ${cfg.hours} ч.`;
  return '';
}

function actionsHtml(c) {
  const isDef = c.defendant_id === me.id, isAcc = c.accuser_id === me.id, isAdmin = me.role === 'admin';
  const party = isDef || isAcc;
  const out = [];
  if (c.status === 'warrant') {
    out.push(`<p class="case-meta">Ордер: ${c.warrant_votes} из ${cfg.votes} голосов фракции обвинителя.</p>`);
    if (c.my_warrant) out.push('<p class="case-ok">Вы поддержали ордер.</p>');
    else if (c.can_warrant && !cfg.arrested) out.push(`<button type="button" class="btn-secondary" data-act="warrant">Поддержать ордер</button>`);
    if (isAdmin) out.push(`<button type="button" class="btn-primary" data-act="warrant-yes">Выдать ордер</button><button type="button" class="btn-secondary" data-act="warrant-no">Отказать</button>`);
  }
  if (c.status === 'arrest') {
    if (isDef) {
      out.push(`<div class="case-knock"><b>${icon('alert')} К вам пришли: дело ${caseNo(c.id)}.</b>
        <p>Ответьте до ${fmt(c.door_deadline)} — иначе дверь считается открытой.</p>
        ${c.door === 'docs_ok' ? credHtml(c.credential) : ''}
        <div class="case-btns">
          <button type="button" class="btn-primary" data-act="door-open">Открыть дверь</button>
          ${c.door === 'pending' ? '<button type="button" class="btn-secondary" data-act="door-docs">Предъявите документы</button>' : ''}
          ${c.door === 'docs_ok' ? '<button type="button" class="btn-secondary" data-act="door-resist">Не открывать</button>' : ''}
        </div></div>`);
    } else out.push(`<p class="case-meta">Ордер получен (${c.warrant_by === 'admin' ? 'админ' : 'фракция'}). Ждём ответчика у двери до ${fmt(c.door_deadline)}.</p>`);
  }
  if (isDef && ['arrest', 'trial'].includes(c.status) && !c.defense) {
    out.push(`<form class="case-defense"><label>Ваш ответ (один раз)<textarea name="text" rows="2" minlength="3" maxlength="1000" required></textarea></label>
      <button type="submit" class="btn-secondary">Ответить</button></form>`);
  }
  if (c.status === 'trial') {
    const v = c.votes;
    out.push(`<p class="case-meta">Суд до ${fmt(c.trial_ends_at)}. Голоса: виновен ${v.guilty} · оправдан ${v.acquit} · обвинение ложное ${v.false}.</p>`);
    if (!party && !cfg.arrested) out.push(`<div class="case-btns" role="group" aria-label="Ваш голос">
      ${[['guilty', 'Виновен'], ['acquit', 'Оправдан'], ['false', 'Обвинение ложное']].map(([k, t]) => `<button type="button" class="btn-secondary ${c.my_verdict === k ? 'active' : ''}" aria-pressed="${c.my_verdict === k}" data-act="vote" data-v="${k}">${t}</button>`).join('')}</div>`);
    if (isAdmin) out.push(`<div class="case-admin"><label>Срок, ч <input type="number" name="hours" min="1" max="${cfg.max}" value="${cfg.max}"></label>
      <label class="case-check"><input type="checkbox" name="false"> обвинение ложное</label>
      <button type="button" class="btn-primary" data-act="verdict-guilty">Виновен</button><button type="button" class="btn-secondary" data-act="verdict-acquit">Оправдан</button></div>`);
  }
  if (c.status === 'closed' && c.appeals < cfg.appeals && new Date(c.closed_at).getTime() + cfg.hours * 3600e3 > Date.now()
      && ((c.verdict === 'guilty' && isDef) || (c.verdict === 'acquitted' && isAcc))) {
    out.push(`<button type="button" class="btn-secondary" data-act="appeal">Обжаловать (один раз)</button>`);
  }
  if (isAdmin && (c.status !== 'closed' || c.sentence_until)) out.push(`<button type="button" class="btn-danger" data-act="cancel">Отменить дело</button>`);
  return out.join('');
}

function cardHtml(c) {
  const stamp = c.status === 'closed' ? VERDICT[c.verdict] || 'Закрыто' : STAMP[c.status];
  const showCred = c.docs_checked && (c.door !== 'docs_ok' || c.defendant_id !== me.id);
  return `<article class="case-card is-${c.status} ${c.verdict ? 'v-' + c.verdict : ''}" data-case="${c.id}">
    <div class="case-top"><b class="case-no">Дело ${caseNo(c.id)}</b><span class="case-stamp">${esc(stamp)}</span></div>
    <p class="case-parties">Обвинитель: <b>${esc(c.accuser || '—')}</b> · ответчик: <b>${esc(c.defendant || '—')}</b></p>
    <p class="case-charge">${esc(c.charge)}</p>
    <p class="case-meta">Открыто ${fmt(c.created_at)}${c.appeals ? ' · была апелляция' : ''}${c.resistance ? ' · <span class="case-resist">сопротивление</span>' : ''}</p>
    ${showCred ? credHtml(c.credential) : ''}
    <details class="case-ev"><summary>${icon('evidence')} Улики (${c.evidence.length})</summary>
      <ul>${c.evidence.map(e => `<li><b>${esc(e.author || 'Аноним')}${e.date ? ', ' + esc(e.date) : ''}:</b> ${esc(e.text)}</li>`).join('')}</ul></details>
    ${c.defense ? `<blockquote class="case-defense-text"><b>Ответ ответчика:</b> ${esc(c.defense)}</blockquote>` : ''}
    ${c.status === 'closed' ? `<p class="case-verdict">${esc(verdictLine(c))}</p>` : ''}
    <div class="case-actions">${actionsHtml(c)}</div>
  </article>`;
}

function bind(box) {
  const reload = () => renderCases(me);
  const run = async (btn, fn, ok) => {
    if (btn) btn.disabled = true;
    try { const r = await fn(); if (ok) showNotification(typeof ok === 'function' ? ok(r) : ok, 'success'); await reload(); }
    catch (err) { showNotification(err.message, 'error'); if (btn) btn.disabled = false; }
  };
  box.querySelector('#case-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const ev = [...f.querySelectorAll('input[name="ev"]:checked')].map(i => i.value);
    if (!ev.length) { showNotification('Без улики дело не принимается', 'error'); return; }
    run(f.querySelector('button[type="submit"]'), () => openCase(f.defendant.value, f.charge.value.trim(), ev), id => `Дело ${caseNo(id)} открыто`);
  });
  box.querySelectorAll('.case-card').forEach(card => {
    const id = card.dataset.case;
    card.querySelector('.case-defense')?.addEventListener('submit', e => {
      e.preventDefault();
      run(e.target.querySelector('button'), () => submitDefense(id, e.target.text.value.trim()), 'Ответ записан в деле');
    });
    card.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const a = btn.dataset.act;
      const adm = card.querySelector('.case-admin');
      if (a === 'warrant') run(btn, () => supportWarrant(id), 'Голос за ордер учтён');
      else if (a === 'warrant-yes') run(btn, () => adminWarrant(id, true), 'Ордер выдан');
      else if (a === 'warrant-no') { if (confirm('Отказать в ордере? Дело закроется.')) run(btn, () => adminWarrant(id, false), 'В ордере отказано'); }
      else if (a === 'door-open') run(btn, () => answerDoor(id, 'open'), 'Дверь открыта. Дело ушло в суд');
      else if (a === 'door-docs') run(btn, () => answerDoor(id, 'docs'), r => r.verdict === 'invalid' ? 'Документы не в порядке — дело недействительно' : 'Документы в порядке. Решайте: открыть или нет');
      else if (a === 'door-resist') { if (confirm('Не открывать? В деле появится штамп «сопротивление».')) run(btn, () => answerDoor(id, 'resist'), 'Не открыли. Дело ушло в суд'); }
      else if (a === 'vote') run(btn, () => voteVerdict(id, btn.dataset.v), 'Голос учтён');
      else if (a === 'verdict-guilty' || a === 'verdict-acquit') {
        const guilty = a === 'verdict-guilty';
        const isFalse = !guilty && adm.querySelector('[name="false"]').checked;
        const h = Number(adm.querySelector('[name="hours"]').value);
        if (confirm(guilty ? `Виновен, ${h} ч камеры?` : isFalse ? `Оправдать и дать обвинителю ${h} ч за ложное обвинение?` : 'Оправдать?'))
          run(btn, () => adminVerdict(id, guilty ? 'guilty' : 'acquitted', h, isFalse), 'Приговор вынесен');
      }
      else if (a === 'appeal') { if (confirm('Обжаловать? Это можно сделать только один раз; суд пройдёт заново.')) run(btn, () => appealCase(id), 'Апелляция подана, срок приостановлен'); }
      else if (a === 'cancel') { if (confirm('Отменить дело и приговор? Ограничения снимутся сразу.')) run(btn, () => cancelCase(id), 'Дело отменено'); }
    }));
  });
}
