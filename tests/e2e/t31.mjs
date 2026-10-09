import { launch, token, ADMIN, USER, hscroll } from '/data/tests/lib.mjs';
import fs from 'fs';
const out='/data/work/t31'; fs.mkdirSync(out,{recursive:true});
const b = await launch(); const errs=[];
async function mk(email,w,h){
  const ctx = await b.newContext({ viewport:{width:w,height:h} });
  const init = email ? JSON.stringify(await token(email)) : null;
  await ctx.addInitScript(([v])=>{ localStorage.setItem('vpNew','1'); if(v) localStorage.setItem('sb-dgfsxsargqypvwiifyrp-auth-token', v); }, [init]);
  const p = await ctx.newPage();
  p.on('console',m=>{if(m.type()==='error')errs.push(`${email||'guest'}@${w}: ${m.text().slice(0,160)}`)});
  p.on('pageerror',e=>errs.push(`${email||'guest'}@${w} PAGE: ${e.message}`));
  await p.goto('http://localhost:8765/',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
  return p;
}
const secs0 = process.argv[2] ? process.argv[2].split(',') : ['home','events','chronicle','chat','cases','profile','admin'];
for (const [email,tag] of [[null,'guest'],[ADMIN,'admin']]) for (const w of [1440,390]) {
  const p = await mk(email,w,w>500?900:844);
  for (const s of secs0) {
    const l = await p.$(s==='home'?'.bar-logo':`.nav-plates .nav-link[data-section="${s}"]`); if(!l || !(await l.isVisible())) continue;
    await l.click(); await p.waitForTimeout(1800);
    await p.screenshot({path:`${out}/${tag}_${w}_${s}.png`});
    if (await hscroll(p)) errs.push(`hscroll ${tag} ${w} ${s}`);
  }
  if (tag==='guest' && w===1440) { await p.click('#btn-show-login'); await p.waitForTimeout(400); await p.screenshot({path:`${out}/guest_login.png`}); }
  await p.context().close();
}
console.log(errs.length?errs.join('\n'):'no errors'); await b.close();
