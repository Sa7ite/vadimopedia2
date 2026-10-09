import { launch, page, go, hscroll, token, ADMIN, USER } from './lib.mjs';
import fs from 'fs';
const cfg = fs.readFileSync('/data/repo/js/config.js', 'utf8');
const KEY = cfg.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+/)[0];
const SB = 'https://dgfsxsargqypvwiifyrp.supabase.co';
const tok = {};
async function rest(email, path, method = 'GET', body) {
  tok[email] ||= (await token(email)).access_token;
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: KEY, authorization: 'Bearer ' + tok[email], 'content-type': 'application/json', prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
}
const log = (...a) => console.log(...a);
const errs = [];
const [ev] = await rest(USER, 'events', 'POST', { event_text: 'Тест T2.14: заявка агента', is_lore_significant: true });
log('pending event', ev.id, ev.is_approved);
const [msg] = await rest(ADMIN, 'chat_messages', 'POST', { message_text: 'Тест T2.14: сообщение для жалобы' });
fs.writeFileSync('/data/work/t214-ids.json', JSON.stringify({ ev: ev.id, msg: msg.id }));
const b = await launch();
const a = await page(b, ADMIN, 1440, 900, errs); a.on('dialog', d => d.accept());
const u = await page(b, USER, 1440, 900, errs); u.on('dialog', d => d.accept());
await go(a, 'admin');
log('queue tabs:', await a.$$eval('.q-tabs button', l => l.map(x => x.textContent.trim())));
const item = a.locator('.q-item', { hasText: 'Тест T2.14: заявка' });
await item.locator('[data-act=return]').click();
await a.fill('#ask-text', 'Добавьте дату'); await a.click('[data-ask=ok]'); await a.waitForTimeout(2000);
log('after return, in queue:', await a.locator('.q-item', { hasText: 'Тест T2.14: заявка' }).count());
await go(u, 'profile');
log('my subs:', await u.$$eval('#profile-submissions .sub-item', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 120))));
await u.screenshot({ path: '/data/work/t214-subs.png', fullPage: false, clip: undefined });
await u.click('#profile-submissions [data-sub=edit]'); await u.waitForTimeout(800);
await u.fill('#edit-event-text', 'Тест T2.14: заявка агента, 1 мая 2024'); await u.click('#btn-save-event'); await u.waitForTimeout(2500);
log('subs after fix:', await u.$$eval('#profile-submissions .sub-stamp', l => l.map(x => x.textContent)));
await go(a, 'home'); await go(a, 'admin');
const it2 = a.locator('.q-item', { hasText: 'Тест T2.14: заявка' });
log('back in queue with note:', await it2.locator('.q-note').textContent().catch(() => 'нет'));
await it2.locator('[data-act=reject]').click();
await a.fill('#ask-text', 'Дубль события'); await a.click('[data-ask=ok]'); await a.waitForTimeout(2000);
await go(u, 'home'); await go(u, 'profile');
log('user sees rejected:', await u.$$eval('#profile-submissions .sub-item', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 120))));
// журнал: отменить отклонение
await a.click('#admin-audit').catch(() => {});
await a.evaluate(() => { const d = document.getElementById('admin-audit').closest('details'); d.open = true; d.dispatchEvent(new Event('toggle')); });
await a.waitForTimeout(2500);
log('audit top:', await a.$$eval('.audit-list li', l => l.slice(0, 3).map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 110))));
await a.locator('.audit-list li', { hasText: 'отклонил событие' }).first().locator('.audit-undo').click(); await a.waitForTimeout(2500);
log('undone mark:', await a.$$eval('.audit-list li.is-undone', l => l.length));
await go(a, 'home'); await go(a, 'admin');
await a.locator('.q-item', { hasText: 'Тест T2.14: заявка' }).locator('[data-act=approve]').click(); await a.waitForTimeout(2000);
log('approved -> queue count:', await a.locator('.q-item', { hasText: 'Тест T2.14: заявка' }).count());
// жалоба на сообщение
await go(u, 'chat');
await u.locator('.chat-message', { hasText: 'Тест T2.14: сообщение' }).locator('.chat-report-btn').click();
await u.fill('#ask-text', 'Проверка жалобы'); await u.click('[data-ask=ok]'); await u.waitForTimeout(1500);
await go(a, 'home'); await go(a, 'admin');
await a.click('.q-tabs [data-q=report]'); await a.waitForTimeout(1500);
log('reports:', await a.$$eval('.q-item.is-report', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 140))));
await a.screenshot({ path: '/data/work/t214-queue-1440.png' });
await a.locator('.q-item.is-report', { hasText: 'Тест T2.14' }).locator('[data-act=rep-remove]').click(); await a.waitForTimeout(2000);
const m1 = await rest(ADMIN, `chat_messages?id=eq.${msg.id}&select=is_deleted,delete_reason`);
log('message after remove:', JSON.stringify(m1));
await a.evaluate(() => { const d = document.getElementById('admin-audit').closest('details'); d.open = false; d.open = true; d.dispatchEvent(new Event('toggle')); });
await a.waitForTimeout(2500);
await a.locator('.audit-list li', { hasText: 'убрал по жалобе' }).first().locator('.audit-undo').click(); await a.waitForTimeout(2500);
const m2 = await rest(ADMIN, `chat_messages?id=eq.${msg.id}&select=is_deleted,message_text`);
log('message after undo:', JSON.stringify(m2));
// пользователи
await a.evaluate(() => { const d = document.getElementById('admin-users').closest('details'); d.open = true; d.dispatchEvent(new Event('toggle')); });
await a.waitForTimeout(2500);
log('users:', await a.$$eval('.user-row', l => l.map(x => x.querySelector('strong').textContent + ':' + x.querySelector('.u-role').value)));
await a.locator('.user-row', { hasText: 'Агент (юзер)' }).locator('.u-role').selectOption('moderator'); await a.waitForTimeout(2000);
const p1 = await rest(ADMIN, 'profiles?id=eq.1ba20aa6-e054-4eb5-b303-8a9488659de0&select=role'); log('role now', JSON.stringify(p1));
await a.locator('.user-row', { hasText: 'Агент (юзер)' }).locator('.u-role').selectOption('user'); await a.waitForTimeout(2000);
const p2 = await rest(ADMIN, 'profiles?id=eq.1ba20aa6-e054-4eb5-b303-8a9488659de0&select=role'); log('role back', JSON.stringify(p2));
await a.screenshot({ path: '/data/work/t214-users-1440.png', fullPage: true });
// окно события: кнопка жалобы
// телефон
const m = await page(b, ADMIN, 390, 844, errs); m.on('dialog', d => d.accept()); await go(m, 'admin');
log('390 hscroll admin:', await hscroll(m));
await m.evaluate(() => { for (const id of ['admin-users', 'admin-audit']) { const d = document.getElementById(id).closest('details'); d.open = true; d.dispatchEvent(new Event('toggle')); } });
await m.waitForTimeout(3000);
log('390 hscroll admin open:', await hscroll(m));
await m.screenshot({ path: '/data/work/t214-admin-390.png', fullPage: true });
const mu = await page(b, USER, 390, 844, errs); await go(mu, 'chat');
await mu.locator('.chat-message', { hasText: 'Тест T2.14: сообщение' }).locator('.chat-report-btn').click();
await mu.waitForTimeout(500); await mu.screenshot({ path: '/data/work/t214-ask-390.png' });
log('390 hscroll user:', await hscroll(mu));
log('errors:', errs.filter(e => !/future|JWT/.test(e)));
await b.close(); process.exit(0);
