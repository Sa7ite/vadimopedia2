import { launch, page, go, USER } from './lib.mjs';
const b = await launch(); const errs = [];
for (const [w,h] of [[1440,900],[390,844]]) {
  const u = await page(b, USER, w, h, errs);
  await u.evaluate(() => localStorage.setItem('vpNew','1')); await u.reload({waitUntil:'networkidle'}); await u.waitForTimeout(3000);
  await go(u, 'events');
  // событие с комментариями и реакциями, если есть
  await u.locator('#events-list .event-open').first().click(); await u.waitForTimeout(3500);
  await u.screenshot({ path: `/data/e${w}.png`, fullPage: false });
  const m = u.locator('#modal-event-detail .modal-content');
  await m.screenshot({ path: `/data/em${w}.png` });
  console.log(w, 'hscroll', await u.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'close is button', await u.locator('#modal-event-detail button.close-modal').count());
  await u.keyboard.press('Escape'); await u.waitForTimeout(500);
  console.log('closed', await u.locator('#modal-event-detail').count() === 0);
}
console.log('errors', errs.slice(0,5)); await b.close(); process.exit(0);
