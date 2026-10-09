import { launch, page, go, hscroll, token, ADMIN, USER } from './lib.mjs';
import fs from 'fs';
const cfg = fs.readFileSync('/data/repo/js/config.js', 'utf8');
const KEY = cfg.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+/)[0];
const SB = 'https://dgfsxsargqypvwiifyrp.supabase.co';
async function rest(email, path, method = 'GET', body) {
  const t = (await token(email)).access_token;
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: KEY, authorization: 'Bearer ' + t, 'content-type': 'application/json', prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
  const x = await r.text(); try { return JSON.parse(x); } catch { return x; }
}
const log = (...a) => console.log(...a);
const errs = [];
const b = await launch();
const u = await page(b, USER, 1440, 900, errs);
const a = await page(b, ADMIN, 1440, 900, errs);
log('bell present:', await u.$$eval('#bell .bell-btn', l => l.length), 'count hidden:', await u.$eval('#bell .bell-count', e => e.hidden));
const [m] = await rest(USER, 'chat_messages', 'POST', { message_text: 'Тест T2.15: напишите мне' });
await go(a, 'chat');
await a.locator('.chat-message', { hasText: 'Тест T2.15: напишите' }).first().locator('.chat-reply-btn').click();
await a.fill('#chat-message-text', 'Тест T2.15: отвечаю'); await a.click('#form-chat-message button[type=submit]');
await u.waitForTimeout(4000);
log('user count after reply:', await u.$eval('#bell .bell-count', e => e.hidden ? 'скрыт' : e.textContent));
log('toast:', await u.evaluate(() => [...document.querySelectorAll('.notification, .toast, [class*=notif]')].map(e => e.textContent.trim()).filter(Boolean).slice(-2)));
await u.click('#bell .bell-btn'); await u.waitForTimeout(1500);
log('items:', await u.$$eval('.bell-item', l => l.map(x => (x.classList.contains('unread') ? '* ' : '') + x.innerText.replace(/\s+/g, ' ').slice(0, 90))));
await u.screenshot({ path: '/data/work/t215-bell-1440.png' });
await u.locator('.bell-item').first().click(); await u.waitForTimeout(2500);
log('went to chat:', await u.$eval('#section-chat', e => e.classList.contains('active')), 'count:', await u.$eval('#bell .bell-count', e => e.hidden ? 'скрыт' : e.textContent));
// настройки: выключить ответы
await u.click('#bell .bell-btn'); await u.waitForTimeout(800);
await u.click('.bell-link[data-b=prefs]'); await u.waitForTimeout(300);
log('case disabled:', await u.$eval('.bell-prefs input[value=case]', e => e.disabled));
await u.uncheck('.bell-prefs input[value=reply]'); await u.click('.bell-prefs button[type=submit]'); await u.waitForTimeout(1500);
await u.keyboard.press('Escape');
await a.waitForTimeout(2200);
await a.locator('.chat-message', { hasText: 'Тест T2.15: напишите' }).first().locator('.chat-reply-btn').click();
await a.fill('#chat-message-text', 'Тест T2.15: второй ответ'); await a.click('#form-chat-message button[type=submit]');
await u.waitForTimeout(4000);
log('count after muted reply:', await u.$eval('#bell .bell-count', e => e.hidden ? 'скрыт' : e.textContent));
// вернуть настройки
await u.click('#bell .bell-btn'); await u.waitForTimeout(800); await u.click('.bell-link[data-b=prefs]'); await u.check('.bell-prefs input[value=reply]'); await u.click('.bell-prefs button[type=submit]'); await u.waitForTimeout(1200);
const p = await rest(USER, 'notification_prefs?select=muted_kinds,quiet'); log('prefs:', JSON.stringify(p));
// телефон
const mu = await page(b, USER, 390, 844, errs);
log('390 hscroll:', await hscroll(mu));
await mu.click('#bell .bell-btn'); await mu.waitForTimeout(1500);
await mu.screenshot({ path: '/data/work/t215-bell-390.png' });
log('390 panel inside viewport:', await mu.$eval('.bell-panel', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
log('errors:', errs.filter(e => !/future|JWT/.test(e)));
await b.close(); process.exit(0);
