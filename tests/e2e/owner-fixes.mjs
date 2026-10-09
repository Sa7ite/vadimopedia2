import { launch, page, go, ADMIN, USER } from './lib.mjs';
const b = await launch(); const errs = [];
// 1) пользователь: теория об одном событии
const u = await page(b, USER, 1440, 900, errs);
await u.evaluate(() => localStorage.setItem('vpNew','1')); await u.reload({waitUntil:'networkidle'}); await u.waitForTimeout(3000);
await go(u, 'chronicle'); await u.click('#btn-theories-chronicle'); await u.waitForTimeout(2500);
const det = u.locator('.theories details.theory-new'); if (!(await det.getAttribute('open') !== null)) await det.locator('summary').click();
const form = u.locator('.theories .theory-form');
const firstOpt = await form.locator('select[name=a] option').nth(1).getAttribute('value');
await form.locator('select[name=a]').selectOption(firstOpt);
await form.locator('textarea[name=note]').fill('Проверка агента: теория об одном событии');
await form.locator('button[type=submit]').click(); await u.waitForTimeout(3000);
const card = u.locator('.theory-card', { hasText: 'Проверка агента: теория об одном событии' });
console.log('single theory cards:', await card.count(), 'single class:', await card.locator('.th-pair.th-single').count());
await card.first().screenshot({ path: '/data/th1.png' }).catch(()=>{});
u.on('dialog', d => d.accept());
await card.first().locator('[data-status=removed]').click(); await u.waitForTimeout(2500);
console.log('after delete:', await u.locator('.theory-card', { hasText: 'Проверка агента' }).count());
// 2) админ: блок «Титулы»
const a = await page(b, ADMIN, 1440, 900, errs);
await a.evaluate(() => localStorage.setItem('vpNew','1')); await a.reload({waitUntil:'networkidle'}); await a.waitForTimeout(3000);
await go(a, 'admin');
await a.locator('details.admin-block', { hasText: 'Титулы' }).locator('summary').click(); await a.waitForTimeout(800);
console.log('title rows:', await a.locator('#admin-titles tr[data-id]').count());
await a.locator('#admin-titles').screenshot({ path: '/data/th2.png' });
await go(a, 'profile'); await a.click('#btn-manage-titles'); await a.waitForTimeout(1500);
console.log('admin create form in profile:', await a.locator('#btn-create-title').count());
// 3) чат вживую
await go(a, 'chat'); await a.locator('#chat-messages').screenshot({ path: '/data/th3.png' }).catch(()=>{});
console.log('errors:', errs.slice(0, 6)); await b.close(); process.exit(0);
