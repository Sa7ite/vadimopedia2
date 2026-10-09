import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] });
const errs = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('console', m => { if (m.type() === 'error') errs.push(`${w}: ${m.text()}`); });
  p.on('pageerror', e => errs.push(`${w} PAGE: ${e.message}`));
  await p.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const nav = await p.$$eval('.nav-link', a => a.map(x => x.textContent.trim() + (x.style.display === 'none' ? '(скрыт)' : '')));
  console.log(w, nav.join(' | '));
  await p.screenshot({ path: `/data/work/guest-${w}.png` });
  await p.close();
}
console.log('ERRORS:', errs.length ? errs.join('\n') : 'нет');
await b.close(); process.exit(0);
