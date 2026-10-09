import { launch, page, go, USER, ADMIN } from './lib.mjs';
const b = await launch(); const errs = [];
for (const [w,h] of [[1440,900],[390,844]]) {
  const u = await page(b, USER, w, h, errs);
  await u.evaluate(() => { localStorage.setItem('vpNew','1'); localStorage.removeItem('vpChap'); });
  await u.reload({waitUntil:'networkidle'}); await u.waitForTimeout(3000);
  await go(u, 'chronicle');
  console.log(w, 'tabs', await u.locator('.tome-tab').count(), 'apps', await u.locator('.tome-app').count(), 'margins', await u.locator('.tome-margin').count(), 'new', await u.locator('.tome-p.is-new').count());
  // сделать «новое»: забыть последние 4 абзаца
  await u.evaluate(() => { const k = Object.keys(localStorage).find(k => k.startsWith('vpSeenChron:')); const a = JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(a.slice(0, -4))); localStorage.setItem('vpChap','0'); });
  await u.click('#btn-read-chronicle'); await u.waitForTimeout(2500);
  console.log(w, 'after forget: on tab', await u.locator('.tome-tab.on').textContent(), 'new paras', await u.locator('.tome-p.is-new').count(), 'tabs has-new', await u.locator('.tome-tab.has-new').count(), 'hscroll', await u.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
  await u.screenshot({ path: `/data/c${w}new.png` });
  await u.locator('.tome-tab').first().click(); await u.waitForTimeout(600);
  await u.screenshot({ path: `/data/c${w}.png` });
  await u.locator('.tome-page').screenshot({ path: `/data/cp${w}.png` });
  // приложение открывает лист события
  await u.locator('.tome-app').first().click(); await u.waitForTimeout(3000);
  console.log(w, 'modal', await u.locator('#modal-event-detail').count());
  await u.keyboard.press('Escape'); await u.waitForTimeout(500);
  // клавиатура по ушкам
  await u.locator('.tome-tab.on').focus(); await u.keyboard.press('ArrowDown'); await u.waitForTimeout(300);
  console.log(w, 'arrow -> on', await u.locator('.tome-tab.on').textContent(), 'focused', await u.evaluate(() => document.activeElement.className));
  const m = u.locator('.tome-margin').first();
  if (await m.count()) { await m.click(); await u.waitForTimeout(2500); console.log(w, 'theories focus', await u.locator('.theory-card.th-focus').count()); await u.screenshot({ path: `/data/ct${w}.png` }); }
  await u.click('#btn-timeline-chronicle'); await u.waitForTimeout(2500); await u.screenshot({ path: `/data/ctl${w}.png` });
  await u.click('#btn-bookmarks-chronicle'); await u.waitForTimeout(2000); await u.screenshot({ path: `/data/cb${w}.png` });
  await go(u, 'home'); await u.waitForTimeout(1500);
  console.log(w, 'desk tome', await u.locator('#dh-tome').isVisible(), await u.locator('#dh-tome').textContent());
}
const a = await page(b, ADMIN, 1440, 900, errs);
await a.evaluate(() => localStorage.setItem('vpNew','1')); await a.reload({waitUntil:'networkidle'}); await a.waitForTimeout(3000);
await go(a, 'chronicle'); await a.click('#btn-edit-chronicle'); await a.waitForTimeout(3000);
await a.evaluate(() => { const t = document.getElementById('chronicle-textarea'); t.value = t.value.replace('родился, по преданиям', 'родился, как говорят').replace(/\n\n[^\n]+$/, '\n\nНовый абзац для проверки.'); t.dispatchEvent(new Event('input')); });
await a.waitForTimeout(800); await a.evaluate(() => document.getElementById('chronicle-diff-box').open = true);
console.log('diff', await a.locator('#chronicle-diff-count').textContent(), await a.locator('#chronicle-diff del').count(), await a.locator('#chronicle-diff ins').count());
await a.locator('#chronicle-diff-box').scrollIntoViewIfNeeded(); await a.screenshot({ path: '/data/ced.png' });
console.log('errors', errs.slice(0,8)); await b.close(); process.exit(0);
