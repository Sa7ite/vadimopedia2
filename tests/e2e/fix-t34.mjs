import { launch, page, go, USER } from './lib.mjs';
const b = await launch(); const errs = [];
for (const [w,h] of [[1440,900],[390,844]]) {
  const u = await page(b, USER, w, h, errs);
  await u.evaluate(() => { localStorage.setItem('vpNew','1'); sessionStorage.setItem('vpDrawer','1'); });
  await u.reload({waitUntil:'networkidle'}); await u.waitForTimeout(3500);
  const f = u.locator('#dh-rows .dh-fold'); 
  if (w === 1440) {
    const before = await f.nth(3).boundingBox(); await f.nth(2).hover(); await u.waitForTimeout(400);
    const after = await f.nth(3).boundingBox(); const hov = await f.nth(2).boundingBox();
    console.log('next fold top', before.y, after.y, 'hovered bottom', hov.y + hov.height);
    await u.locator('.dh-drawer').screenshot({ path: '/data/f_home.png' });
  }
  await go(u, 'events');
  console.log(w, 'toggle visible', await u.locator('#bl-toggle').isVisible(), 'sheet visible', await u.locator('#bl-sheet').isVisible());
  await u.screenshot({ path: `/data/f_ev${w}.png` });
  await u.click('#bl-toggle'); await u.waitForTimeout(500);
  console.log(w, 'after open sheet', await u.locator('#bl-sheet').isVisible(), 'toggle', await u.locator('#bl-toggle').isVisible());
  await u.screenshot({ path: `/data/f_evopen${w}.png` });
  await u.click('#bl-close'); await u.waitForTimeout(300);
  console.log(w, 'closed', !(await u.locator('#bl-sheet').isVisible()));
  await u.locator('#events-list .event-open').nth(1).click(); await u.waitForTimeout(3500);
  const like = u.locator('#modal-event-detail .reaction-btn[data-type="like"]');
  const was = await like.getAttribute('aria-pressed');
  await like.click(); await u.waitForTimeout(w===1440?1300:1300);
  await u.locator('#reactions-section').screenshot({ path: `/data/f_rx${w}.png` });
  console.log(w, 'like was', was, 'now', await u.locator('#modal-event-detail .reaction-btn[data-type="like"]').getAttribute('aria-pressed'), 'stamps', await u.locator('#modal-event-detail .sh-stamps .stamp').allTextContents());
  await u.locator('#modal-event-detail .reaction-btn[data-type="like"]').click(); await u.waitForTimeout(1500);
  console.log(w, 'restored', await u.locator('#modal-event-detail .reaction-btn[data-type="like"]').getAttribute('aria-pressed'));
  await u.keyboard.press('Escape'); await u.waitForTimeout(400);
  await go(u, 'chronicle');
  await u.screenshot({ path: `/data/f_ch${w}.png` });
  const st = u.locator('.tome-stamp');
  console.log(w, 'stamp before scroll', await st.getAttribute('class'));
  await st.scrollIntoViewIfNeeded(); await u.waitForTimeout(800);
  console.log(w, 'stamp after scroll', await st.getAttribute('class'));
}
console.log('errors', errs.slice(0,8)); await b.close(); process.exit(0);
