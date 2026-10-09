import { launch, page, USER } from '/data/tests/lib.mjs';
const b = await launch(); const m = await page(b, USER, 390, 844, []);
await m.click('#bell .bell-btn'); await m.waitForTimeout(1500);
await m.screenshot({ path: '/data/work/t215-bell-390b.png' }); await b.close(); process.exit(0);
