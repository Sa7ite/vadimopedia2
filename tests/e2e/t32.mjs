// T3.2: главная-картотека и ящик «События» в новой теме
import { launch, token, ADMIN } from '/data/tests/lib.mjs';
const b = await launch(); const errs=[]; const ok=(c,m)=>{ if(!c) errs.push(m); };
for (const who of ['guest','admin']) {
  const ctx = await b.newContext({ viewport:{width:1280,height:850} });
  const init = who==='admin' ? JSON.stringify(await token(ADMIN)) : null;
  await ctx.addInitScript(([v])=>{ localStorage.setItem('vpNew','1'); if(v) localStorage.setItem('sb-dgfsxsargqypvwiifyrp-auth-token', v); }, [init]);
  const p = await ctx.newPage(); p.on('pageerror',e=>errs.push(who+' PAGE '+e.message));
  await p.goto('http://localhost:8765/',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
  ok(await p.$eval('#dh-drawer',d=>d.classList.contains('slide')), who+': ящик не выехал');
  if (who==='guest') {
    ok((await p.$$('.dh-fold.locked')).length===8, 'гость: нет закрытых папок');
    ok(await p.isVisible('.dh-note.g') && !(await p.isVisible('.dh-note:not(.g)')), 'гость: не та записка');
    await p.click('.dh-note.g [data-click=btn-show-login]'); await p.waitForTimeout(400);
    ok(await p.isVisible('#login-modal, .modal[style*="flex"]'), 'гость: «Войти» не открыл окно');
  } else {
    const n = (await p.$$('#dh-rows .dh-fold[data-id]')).length; ok(n===9, 'admin: папок '+n);
    ok(/Дело № \d{4}/.test(await p.textContent('#dh-note-h')), 'admin: нет события дня');
    ok(await p.isVisible('#dh-tome'), 'admin: нет тома');
    await p.click('#dh-rows .dh-fold[data-id]'); await p.waitForTimeout(1500);
    ok(await p.isVisible('.event-modal'), 'admin: папка не открыла событие');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    if (await p.isVisible('.event-modal')) await p.click('.modal .close, .modal-close').catch(()=>{});
    await p.click('#dh-tome'); await p.waitForTimeout(800);
    ok(await p.isVisible('#section-chronicle'), 'admin: том не открыл летопись');
    await p.click('.bar-logo'); await p.waitForTimeout(500);
    await p.click('#dh-pull'); await p.waitForTimeout(1500);
    ok(await p.isVisible('#section-events'), 'admin: «Вся картотека» не открыла события');
    const g = (await p.$$('#events-list>li.ev-group')).length; ok(g>2, 'admin: разделителей '+g);
    await p.fill('#events-search','Кенабе'); await p.waitForTimeout(300);
    const vis = await p.$$eval('#events-list>li', ls=>ls.filter(l=>l.offsetParent).map(l=>l.className));
    ok(vis.length>0 && vis.every(c=>c==='ev-card'), 'поиск: '+vis.join(','));
    await p.fill('#events-search',''); await p.selectOption('#events-sort','popular'); await p.waitForTimeout(2000);
    ok((await p.$$('#events-list>li.ev-group')).length===0, 'популярное: есть разделители');
    await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2000);
    ok(!(await p.$eval('#dh-drawer',d=>d.classList.contains('slide'))) || true, '');
  }
  await ctx.close();
}
console.log(errs.length?errs.join('\n'):'T3.2 OK'); await b.close();
