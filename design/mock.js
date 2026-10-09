(function(){
const E = D.events;
const h = (n)=>{let x=0;for(const c of String(n))x=(x*31+c.charCodeAt(0))|0;return x;};
const rot = (id,max)=>(((Math.abs(h(id))%1000)/1000)*2-1)*max; // детерминированный поворот
const esc = s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const ic = (id,cls='')=>`<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const stamp = (t,c,r)=>`<span class="stamp st-${c}" style="--r:${r}deg">${t}</span>`;
const no = id=>String(id).padStart(4,'0');
const ev = id=>E.find(e=>e.id===id);
const paraHtml = (p,cls)=>esc(p).replace(/\[(\d+)\|([^\]]+)\]/g,(m,id,t)=>`${t}<sup class="${cls}">(прил.&nbsp;${id})</sup>`);
const menu = ['События','Летопись','Доска','Чат','Дела','Профиль'];

const BLOCKS = [
 {k:'head', n:'Шапка и меню'},
 {k:'home', n:'Главная: ящик картотеки'},
 {k:'sheet', n:'Событие: лист-донесение'},
 {k:'tome', n:'Летопись: том дела'},
 {k:'board', n:'Доска расследования'},
 {k:'profile', n:'Профиль: удостоверения и награды'},
 {k:'chat', n:'Чат: протокол'},
 {k:'door', n:'Дело: «К вам пришли»'}
];
const VN = {1:'Кабинет',2:'Опись',3:'Под лампой'};

/* ---------- 1. Шапка ---------- */
const head = {
1:()=>`<header class="h1bar">
  <div class="h1logo"><span class="h1holder"><span>Вадимопедия</span></span></div>
  <nav class="h1nav">${menu.map((m,i)=>`<a class="h1plate${i===0?' on':''}">${m}${i===0?'<i class="h1seal"></i>':''}</a>`).join('')}<a class="h1plate adm">Канцелярия</a></nav>
  <div class="h1tools"><button class="h1btn" aria-label="Поиск">${ic('search')}</button><button class="h1btn bell" aria-label="Уведомления: 3">${ic('bell')}<span class="h1tag">3</span></button></div>
</header>`,
2:()=>`<header class="h2bar">
  <div class="h2logo">Вадимопедия<small>Опись материалов по делу о Вадимах</small></div>
  <nav class="h2nav">${menu.map((m,i)=>`<a class="${i===0?'on':''}">${m}${i===0?'<svg class="h2ring" viewBox="0 0 120 44" preserveAspectRatio="none"><path d="M8 24C6 10 40 4 66 5c30 1 50 7 48 19-2 13-36 17-62 16C26 39 10 34 9 22" fill="none" stroke="#5A2E8F" stroke-width="2.4" stroke-linecap="round"/></svg>':''}</a>`).join('')}<a>Канцелярия</a></nav>
  <div class="h2tools"><label class="h2search">${ic('search')}<span>Поиск по делу</span></label><button class="h2bell" aria-label="Уведомления: 3">${ic('bell')}<span>3</span></button></div>
</header>`,
3:()=>`<header class="h3bar">
  <div class="h3logo">Вадимопедия</div>
  <nav class="h3nav">${menu.map((m,i)=>`<a class="h3tab${i===0?' on':''}" style="--r:${rot(m,1.2).toFixed(2)}deg">${m}</a>`).join('')}<a class="h3tab adm">Канцелярия</a></nav>
  <div class="h3tools"><button class="h3btn" aria-label="Поиск">${ic('search')}</button><button class="h3btn" aria-label="Уведомления: 3">${ic('bell')}<span class="h3tag">3</span></button></div>
</header>`
};

/* ---------- 2. Главная ---------- */
const folders = E.slice(0,10);
const today = ev(391);
const home = {
1:()=>`<div class="desk d1"><div class="hm1">
  <div class="hm1-left">
    <div class="drawer1">
      <div class="drawer1-in">${folders.map((e,i)=>`<div class="fold1 pos${i%3}${i===6?' up':''}" style="--hue:${(i%4)*3}"><span class="fold1-tab">${e.y}</span><span class="fold1-city">${esc(e.city)}</span></div>`).join('')}</div>
      <div class="drawer1-front"><div class="drawer1-holder"><span>Кампания: Первая война</span></div><div class="drawer1-handle"></div></div>
    </div>
    <div class="hm1-under">
      <div class="tome1"><span class="tome1-lab">Летопись, новая глава</span><b>После войны</b><span class="tome1-sticker">Новое</span></div>
      <div class="cards1"><div class="cards1-h">Популярное за неделю</div>${[ev(395),ev(400),ev(398)].map((e,i)=>`<div class="icard1" style="--r:${rot(e.id,1.4).toFixed(2)}deg;--i:${i}"><span>${e.y}, ${esc(e.city)}</span>${esc(e.t.slice(0,70))}…</div>`).join('')}</div>
    </div>
  </div>
  <article class="sheet1 day1" style="--r:${rot(today.id,.6).toFixed(2)}deg">
    <svg class="clip1"><use href="#i-clip"/></svg>
    <div class="form-head"><span>Событие дня</span><span>Дело № ${no(today.id)}</span></div>
    <p class="day1-meta">${today.y} год, ${esc(today.city)}</p>
    <p class="day1-t">${esc(today.t)}</p>
    <a class="btn-ink">Открыть дело</a>
  </article>
</div></div>`,
2:()=>`<div class="desk d2"><div class="hm2">
  <div class="hm2-main">
    <div class="hm2-title"><h2>Картотека</h2><span class="hm2-sub">Ящик 1 из 7, кампания «Первая война»</span></div>
    <div class="drawer2">
      <div class="drawer2-rail">${folders.map((e,i)=>`<div class="fold2${i===6?' on':''}" style="margin-left:${i? -6:0}px"><i class="fold2-tab p${i%3}">${e.y}</i><span>${esc(e.city)}</span></div>`).join('')}</div>
      <div class="drawer2-front"><span class="drawer2-label">Первая война, 2035–2037</span><span class="drawer2-pull"></span></div>
    </div>
    <div class="hm2-row">
      <div class="hm2-box"><div class="hm2-k">Летопись</div><div class="hm2-v">Новая глава «После войны»</div><a class="btn-line">Читать</a></div>
      <div class="hm2-box"><div class="hm2-k">Популярное</div><ol class="hm2-list">${[ev(395),ev(400),ev(398)].map(e=>`<li><span>${e.y}</span>${esc(e.t.slice(0,54))}…</li>`).join('')}</ol></div>
    </div>
  </div>
  <article class="form2 day2">
    <div class="form2-grid"><div><i>Форма</i>Донесение дня</div><div><i>Дело №</i>${no(today.id)}</div><div><i>Год</i>${today.y}</div><div><i>Место</i>${esc(today.city)}</div></div>
    <p class="form2-t">${esc(today.t)}</p>
    <div class="form2-foot"><a class="btn-seal">Открыть дело</a>${stamp('Одобрено','purple',-5)}</div>
  </article>
</div></div>`,
3:()=>`<div class="desk d3"><div class="lamp3"></div><div class="hm3">
  <div class="drawer3">
    <div class="drawer3-lip"></div>
    <div class="drawer3-rows">${folders.map((e,i)=>`<div class="fold3${i===6?' up':''}" style="--d:${i}"><span class="fold3-tab p${i%3}">${e.y}, ${esc(e.city)}</span></div>`).join('')}</div>
    <div class="drawer3-front"><span class="drawer3-holder">Первая война</span></div>
  </div>
  <div class="hm3-side">
    <div class="photo3" style="--r:${rot(today.id,3).toFixed(2)}deg"><span class="tape3"></span><div class="photo3-img"><span>${today.y}</span><small>${esc(today.city)}</small></div><div class="photo3-cap">Событие дня</div></div>
    <div class="note3" style="--r:${(-rot(today.id,2)).toFixed(2)}deg"><div class="note3-h">Дело № ${no(today.id)}</div><p>${esc(today.t)}</p><a class="btn-seal">Открыть дело</a></div>
    <div class="tome3"><b>После войны</b><span>новая глава в летописи</span></div>
  </div>
</div></div>`
};

/* ---------- 3. Лист-донесение ---------- */
const S = ev(401);
const comments = [{w:'kentas IV',t:'СЗАО до сих пор помнит.'},{w:'дианон',t:'а где Артемий Иванков был до этого'}];
const reacts = [['like','Нравится',12],['dislike','Не нравится',3],['witness','Я свидетель',5],['bag','В улики',null]];
const sheet = {
1:()=>`<div class="desk d1"><div class="sh1wrap">
 <article class="sheet1 big" style="--r:${rot(S.id,.4).toFixed(2)}deg">
  <svg class="clip1 l"><use href="#i-clip"/></svg><i class="corner1"></i>
  <div class="blank1">
   <div><span>Дело №</span><b>${no(S.id)}-2036</b></div><div><span>Дата</span><b>${S.y}</b></div><div><span>Место</span><b>${esc(S.city)}</b></div>
   <div class="w2"><span>Участники</span><b>KENTA$$, Артемий Иванков</b></div><div><span>Кампания</span><b>${esc(S.camp)}</b></div>
  </div>
  <p class="sh1-text">${esc(S.t)}</p>
  <div class="sh1-mid">${stamp('Одобрено','purple',-7)}<div class="wit1"><span>Очевидцы</span><i>kentas I</i><i>VadimSexov282</i></div></div>
  <div class="reacts1">${reacts.map(r=>`<button class="r1">${ic(r[0])}<span class="sr">${r[1]}</span>${r[2]!=null?`<b>${r[2]}</b>`:''}</button>`).join('')}<span class="sp"></span><a class="btn-line">${ic('share')}Поделиться</a><a class="btn-line">${ic('report')}Пожаловаться</a></div>
  <a class="thread1"><span>2 теории</span></a>
 </article>
 <div class="strips1">${comments.map((c,i)=>`<div class="strip1" style="--w:${88-i*9}%;--r:${rot(c.w,.8).toFixed(2)}deg"><i class="staple"></i><b>${esc(c.w)}</b> ${esc(c.t)}</div>`).join('')}</div>
</div></div>`,
2:()=>`<div class="desk d2"><article class="form2 sh2">
  <div class="sh2-top"><div class="sh2-title">Донесение<small>Форма 7-В</small></div><div class="sh2-no">№ ${no(S.id)}</div></div>
  <table class="sh2-grid"><tr><th>Дата</th><td>${S.y}</td><th>Место</th><td>${esc(S.city)}</td></tr><tr><th>Участники</th><td>KENTA$$, Артемий Иванков</td><th>Кампания</th><td>${esc(S.camp)}</td></tr></table>
  <div class="sh2-body"><div class="sh2-lbl">Содержание</div><p>${esc(S.t)}</p></div>
  <div class="sh2-row"><div class="sh2-wit"><div class="sh2-lbl">Очевидцы</div><span>kentas I</span><span>VadimSexov282</span></div><div class="sh2-st">${stamp('Одобрено','purple',-4)}</div></div>
  <div class="sh2-react">${reacts.map(r=>`<button>${ic(r[0])}<span>${r[1]}</span>${r[2]!=null?`<b>${r[2]}</b>`:''}</button>`).join('')}</div>
  <div class="sh2-com"><div class="sh2-lbl">Комментарии (2)</div>${comments.map(c=>`<div class="sh2-c"><b>${esc(c.w)}</b><span>${esc(c.t)}</span></div>`).join('')}</div>
</article></div>`,
3:()=>`<div class="desk d3"><div class="lamp3 r"></div><div class="sh3wrap">
  <div class="folder3open"><span class="folder3-tab">${S.y}, ${esc(S.city)}</span></div>
  <article class="sheet3" style="--r:${rot(S.id,1).toFixed(2)}deg">
    <div class="sh3-head"><span>Дело № ${no(S.id)}</span><span>${S.y}</span><span>${esc(S.city)}</span></div>
    <h3 class="sh3-who">KENTA$$, Артемий Иванков</h3>
    <p class="sh3-text">${esc(S.t)}</p>
    <div class="sh3-st">${stamp('Секретно','red',8)}${stamp('Одобрено','purple',-9)}</div>
    <div class="sh3-react">${reacts.map(r=>`<button>${ic(r[0])}<span class="sr">${r[1]}</span>${r[2]!=null?`<b>${r[2]}</b>`:''}</button>`).join('')}</div>
  </article>
  <svg class="thread3" viewBox="0 0 300 160" preserveAspectRatio="none"><path d="M0 20 C 120 120, 200 120, 300 60" fill="none" stroke="#C83A30" stroke-width="2.4"/></svg>
  <div class="tag3" style="--r:4deg">2 теории<br><small>на доске</small></div>
  <div class="sticks3">${comments.map((c,i)=>`<div class="stick3" style="--r:${(i?2.5:-2)}deg"><span class="tape3 s"></span><b>${esc(c.w)}</b>${esc(c.t)}</div>`).join('')}</div>
</div></div>`
};

/* ---------- 4. Летопись ---------- */
const CH = D.chapters;
const tome = {
1:()=>`<div class="desk d1"><div class="tm1">
  <div class="tm1-tabs">${CH.map((c,i)=>`<a class="tm1-tab${i===0?' on':''}" title="${esc(c)}">${i+1}</a>`).join('')}</div>
  <article class="tm1-page">
    <div class="tm1-kicker">Глава 1 из ${CH.length}</div>
    <h2 class="tm1-h">${esc(CH[0])}</h2>
    <p class="tm1-p first">${paraHtml(D.paras[0],'app1')}</p>
    <p class="tm1-p">${paraHtml(D.paras[1],'app1')}<span class="margin1">тут спор,<br>см. доску</span></p>
    <p class="tm1-p new">${paraHtml(D.paras[2],'app1')}<i class="newtag1">новое</i></p>
    <div class="tm1-end">${stamp('Глава закрыта','purple',-3)}</div>
  </article>
  <div class="tm1-stack" aria-label="Прочитано 30%"><i style="--k:3"></i><i style="--k:7"></i></div>
</div></div>`,
2:()=>`<div class="desk d2"><div class="tm2">
  <aside class="tm2-toc"><div class="tm2-toc-h">Опись тома</div>${CH.map((c,i)=>`<a class="${i===0?'on':''}"><span>${esc(c)}</span><i></i><b>${String(1+i*4).padStart(2,'0')}</b></a>`).join('')}<div class="tm2-prog"><span style="width:30%"></span></div><small>прочитано 3 главы из ${CH.length}</small></aside>
  <article class="form2 tm2-page">
    <div class="tm2-head"><span>Летопись</span><span>Лист 01</span></div>
    <h2>${esc(CH[0])}</h2>
    ${D.paras.map((p,i)=>`<p class="${i===2?'new':''}">${paraHtml(p,'app2')}</p>`).join('')}
    <div class="tm2-foot">${stamp('Глава закрыта','purple',-2)}<a class="btn-line">Следующая глава</a></div>
  </article>
</div></div>`,
3:()=>`<div class="desk d3"><div class="lamp3 c"></div><div class="tm3">
  <div class="book3">
    <div class="book3-l"><div class="book3-run">Вадимопедия, летопись</div><div class="book3-cap">Глава первая</div><h2>${esc(CH[0])}</h2><p class="dropcap3">${paraHtml(D.paras[0],'app3')}</p><p>${paraHtml(D.paras[1],'app3')}</p></div>
    <div class="book3-r"><div class="book3-run r">стр. 2</div><p>${paraHtml(D.paras[2],'app3')}</p><div class="sticky3">новое с вашего прошлого визита</div><div class="tm3-end">${stamp('Глава закрыта','purple',4)}</div></div>
    <i class="ribbon3"></i>
    <div class="book3-tabs">${CH.map((c,i)=>`<a class="${i===0?'on':''}" style="--i:${i}">${i+1}</a>`).join('')}</div>
  </div>
</div></div>`
};

/* ---------- 5. Доска ---------- */
const bcards = [ev(396),ev(398),ev(401),ev(393)];
const thrd = (d,w,c='#B5261E')=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const board = {
1:()=>`<div class="desk d1"><div class="bd1">
  <div class="bd1-bar">${['Глава','Кампания','Группа','Эпоха'].map((t,i)=>`<a class="${i===1?'on':''}">${t}</a>`).join('')}<span>Выбрано: Первая война</span></div>
  <div class="cork1">
    <svg class="bd1-svg" viewBox="0 0 1000 440" preserveAspectRatio="none">${thrd('M150 92 Q 330 190 520 96',3)}${thrd('M520 96 Q 700 180 845 120',1.6)}${thrd('M150 92 Q 350 360 600 300',4.5)}</svg>
    ${bcards.slice(0,3).map((e,i)=>`<div class="ic1" style="left:${[8,44,78][i]}%;top:${[10,12,18][i]}%;--r:${rot(e.id,2.5).toFixed(2)}deg"><i class="pin ${['blue','yellow','green'][i]}"></i><b>${e.y}</b><span>${esc(e.city)}</span><p>${esc(e.t.slice(0,58))}…</p></div>`).join('')}
    <div class="pass1" style="left:52%;top:58%"><i class="pin red"></i><div class="pass1-ph"></div><div><b>KENTA$$</b><span>паспортная карточка</span></div></div>
    <div class="note1" style="left:30%;top:31%">тайный союз</div>
    <div class="seal1" style="left:37%;top:66%"><span>В</span></div>
    <div class="note1 r" style="left:66%;top:28%">одна армия</div>
  </div>
</div></div>`,
2:()=>`<div class="desk d2"><div class="bd2">
  <div class="bd2-top"><h2>Доска</h2><div class="bd2-scope">${['Глава','Кампания','Группа','Эпоха'].map((t,i)=>`<a class="${i===1?'on':''}">${t}</a>`).join('')}</div><span class="bd2-legend"><i class="l1"></i>теория <i class="l2"></i>канон</span></div>
  <div class="grid2">
    <svg class="bd2-svg" viewBox="0 0 1000 400" preserveAspectRatio="none">${thrd('M190 80 C 330 80 360 90 500 90','2.2')}${thrd('M500 90 C 640 90 680 130 810 130','1.6')}${thrd('M190 110 C 260 300 480 320 560 300','4')}</svg>
    ${bcards.slice(0,3).map((e,i)=>`<div class="ic2" style="left:${[4,41,76][i]}%;top:${[10,12,22][i]}%"><div class="ic2-h"><b>${e.y}</b><span>№ ${no(e.id)}</span></div><p>${esc(e.t.slice(0,62))}…</p></div>`).join('')}
    <div class="pp2" style="left:52%;top:64%"><div class="pp2-ph"></div><b>KENTA$$</b></div>
    <div class="lbl2" style="left:24%;top:30%">тайный союз, верят 7</div>
    <div class="lbl2 canon" style="left:33%;top:80%">канон</div>
  </div>
</div></div>`,
3:()=>`<div class="desk d3"><div class="lamp3 w"></div><div class="bd3">
  <div class="cork3">
    <svg class="bd3-svg" viewBox="0 0 1000 460" preserveAspectRatio="none">${thrd('M170 80 Q 330 210 520 110',3,'#D2463C')}${thrd('M520 110 Q 690 200 840 70',2,'#D2463C')}${thrd('M170 80 Q 300 380 610 330',5,'#D2463C')}${thrd('M840 70 Q 860 260 610 330',1.4,'#D2463C')}</svg>
    ${bcards.map((e,i)=>`<div class="pol3" style="left:${[9,45,80,25][i]}%;top:${[6,14,4,58][i]}%;--r:${rot(e.id,5).toFixed(2)}deg"><i class="pin ${['blue','yellow','green','blue'][i]}"></i><div class="pol3-img"><b>${e.y}</b></div><span>${esc(e.who)}</span></div>`).join('')}
    <div class="pass3" style="left:55%;top:62%;--r:-3deg"><i class="pin red"></i><div class="pass3-ph"></div><b>KENTA$$</b><small>паспорт № 0001</small></div>
    <div class="note3b" style="left:33%;top:30%;--r:-6deg">тайный союз?</div>
    <div class="seal1" style="left:36%;top:70%"><span>В</span></div>
  </div>
</div></div>`
};

/* ---------- 6. Профиль ---------- */
const creds = [{t:'Летописец',n:'0002',p:true},{t:'Следователь',n:'0004'},{t:'Свидетель эпохи',n:'0011'},{t:'Событие года 2036',n:'0001',p:true}];
const medals = ['Первое событие','Комментатор','Теоретик','Легенда','Свидетель','В каноне'];
const avatar = `<svg class="ava" viewBox="0 0 60 80"><rect x="0" y="0" width="60" height="80" fill="#B9BBAF"/><circle cx="30" cy="30" r="13" fill="#E1C9A8" stroke="#1D2330" stroke-width="2"/><path d="M17 27c1-9 7-13 13-13s12 4 13 13c-4-4-9-5-13-5s-9 1-13 5z" fill="#3B2A20" stroke="#1D2330" stroke-width="2"/><path d="M8 80c1-15 10-22 22-22s21 7 22 22" fill="#2B4C8C" stroke="#1D2330" stroke-width="2"/><circle cx="25" cy="31" r="1.4" fill="#1D2330"/><circle cx="35" cy="31" r="1.4" fill="#1D2330"/><path d="M26 37c2 1.4 6 1.4 8 0" stroke="#1D2330" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
const medalSvg = (i,open=true)=>`<svg viewBox="0 0 30 46" class="medal ${open?'':'off'}"><path d="M8 0h14l-3 18h-8z" fill="${['#5A2E8F','#B5261E','#2B4C8C'][i%3]}" stroke="#1D2330" stroke-width="1.6"/><circle cx="15" cy="30" r="11" fill="#C9A44C" stroke="#1D2330" stroke-width="1.8"/><circle cx="15" cy="30" r="6.5" fill="none" stroke="#1D2330" stroke-width="1.2"/></svg>`;
const profile = {
1:()=>`<div class="desk d1"><div class="pr1">
  <div class="room1">
    <div class="room1-wall">
      <div class="win1"><i></i></div>
      <div class="medals1">${medals.map((m,i)=>`<div title="${m}">${medalSvg(i,i<4)}</div>`).join('')}</div>
      <div class="shelf1"><div class="qframe1">«${esc(D.quote)}»</div></div>
      <div class="cab1"><i></i><i></i><i></i></div>
    </div>
    <div class="room1-desk"><div class="ava1">${avatar}<span class="badge1">Летописец +3</span></div><div class="lamp1"></div></div>
  </div>
  <div class="pr1-desk">
    <div class="wallet1"><div class="wallet1-h">Кошелёк удостоверений</div><div class="fan1">${creds.map((c,i)=>`<div class="cred1${c.p?' prem':''}" style="--i:${i}"><i class="hole"></i><div class="cred1-ph">${avatar}</div><div class="cred1-t"><b>${c.t}</b><span>№ ${c.n}</span></div><span class="cred1-seal">В</span></div>`).join('')}</div></div>
    <div class="evbox1"><div class="evbox1-lock"></div><b>Ящик улик</b><span>14 улик, видите только вы</span></div>
  </div>
</div></div>`,
2:()=>`<div class="desk d2"><article class="form2 pr2">
  <div class="pr2-top"><div class="pr2-photo">${avatar}<span>фото 3×4</span></div>
   <div class="pr2-fields"><div class="pr2-title">Личное дело<small>№ 0001</small></div>
    <div class="fld"><i>Позывной</i><b>KENTA$$</b></div><div class="fld"><i>Фракция</i><b>Междумосковье</b></div><div class="fld"><i>Звание</i><b>Летописец</b></div><div class="fld"><i>В деле с</i><b>12.09.2025</b></div></div>
   <div class="pr2-st">${stamp('Не судим','purple',-6)}</div></div>
  <div class="pr2-sec"><div class="sh2-lbl">Удостоверения (4)</div><div class="pr2-creds">${creds.map(c=>`<div class="cred2${c.p?' prem':''}"><div class="cred2-ph">${avatar}</div><div><b>${c.t}</b><span>№ ${c.n}</span></div></div>`).join('')}</div></div>
  <div class="pr2-sec"><div class="sh2-lbl">Награды: 4 из 12</div><div class="pr2-med">${medals.map((m,i)=>`<div class="${i<4?'':'off'}">${medalSvg(i,i<4)}<span>${m}</span></div>`).join('')}</div></div>
</article></div>`,
3:()=>`<div class="desk d3"><div class="lamp3 c"></div><div class="pr3">
  <div class="pr3-card" style="--r:-2deg">${avatar}<div><b>KENTA$$</b><span>Междумосковье</span></div>${stamp('Не судим','purple',-10)}</div>
  <div class="wallet3"><div class="wallet3-l"></div><div class="wallet3-r">${creds.map((c,i)=>`<div class="cred3${c.p?' prem':''}" style="--i:${i}"><div class="cred1-ph">${avatar}</div><div class="cred1-t"><b>${c.t}</b><span>№ ${c.n}</span></div></div>`).join('')}</div><span class="wallet3-lab">кошелёк</span></div>
  <div class="ribbon3m">${medals.slice(0,4).map((m,i)=>`<div style="--r:${(i-1.5)*6}deg" title="${m}">${medalSvg(i)}</div>`).join('')}</div>
  <div class="clip3" style="--r:3deg">«${esc(D.quote)}»<small>цитата на полке</small></div>
</div></div>`
};

/* ---------- 7. Чат ---------- */
const chatRows = (cls)=>D.chat.map(m=>m.sys?`<div class="${cls}-sys"><span>Летопись сообщает</span>${esc(m.t)}<time>${m.time}</time></div>`:`<div class="${cls}-m${m.me?' me':''}"><div class="${cls}-l"><b>${esc(m.who)}</b><time>${m.time}</time></div>${m.reply?`<div class="${cls}-q">${esc(m.reply)}</div>`:''}<p>${esc(m.t).replace(/@kentas I/,'<mark>@kentas I</mark>')}</p>${m.likes?`<span class="${cls}-r">${ic('like')}${m.likes}</span>`:''}</div>`).join('');
const chat = {
1:()=>`<div class="desk d1"><div class="ch1">
  <div class="ch1-tabs"><a class="on">Общий</a><a>Фракция</a><a class="cell">${ic('cell')}Камера</a></div>
  <div class="ch1-sheet">${chatRows('c1')}<div class="ch1-in"><span>Сообщение</span><i></i><a class="btn-seal">Отправить</a></div></div>
</div></div>`,
2:()=>`<div class="desk d2"><article class="form2 ch2">
  <div class="ch2-top"><b>Протокол чата</b><div class="ch2-tabs"><a class="on">Общий</a><a>Фракция</a><a>Камера</a></div></div>
  <div class="ch2-tbl">${D.chat.map(m=>`<div class="ch2-r${m.sys?' sys':''}${m.me?' me':''}"><time>${m.time}</time><b>${m.sys?'Летопись':esc(m.who)}</b><p>${m.reply?`<span class="ch2-q">в ответ на «${esc(m.reply)}»</span>`:''}${esc(m.t).replace(/@kentas I/,'<mark>@kentas I</mark>')}</p><span>${m.likes?ic('like')+m.likes:''}</span></div>`).join('')}</div>
  <div class="ch2-in"><span>Сообщение</span><i></i><a class="btn-seal">Отправить</a></div>
</article></div>`,
3:()=>`<div class="desk d3"><div class="lamp3 r"></div><div class="ch3">
  <div class="ch3-roll"><div class="ch3-tabs"><a class="on">Общий</a><a>Фракция</a><a>Камера</a></div>${chatRows('c3')}</div>
  <div class="ch3-type"><div class="ch3-paper"><span>Сообщение</span><i class="caret"></i></div><div class="ch3-keys">${'ЙЦУКЕНГШЩЗ'.split('').map(k=>`<i>${k}</i>`).join('')}</div><a class="btn-seal">Отправить</a></div>
</div></div>`
};

/* ---------- 8. «К вам пришли» ---------- */
const door = {
1:()=>`<div class="desk d1 dim"><div class="dr1">
  <article class="sheet1 summons1" style="--r:-.6deg">
    <div class="sm1-h"><span>Повестка</span><span>Дело № 0007</span></div>
    <h2>К вам пришли</h2>
    <p>Обвинитель kentas I. Обвинение: «Брал пикап без спроса». Ордер выдан фракцией «Междумосковье».</p>
    <p class="sm1-small">Если не ответить за 24 часа, считается, что вы открыли дверь.</p>
    <div class="sm1-btns"><a class="btn-seal">Открыть дверь</a><a class="btn-seal alt">Предъявите документы</a></div>
    <a class="btn-line danger">Не открывать</a>
  </article>
</div></div>`,
2:()=>`<div class="desk d2"><article class="form2 dr2">
  <div class="dr2-h"><div><b>Постановление о проверке</b><small>Дело № 0007 от 09.10.2026, 14:02</small></div>${stamp('Срочно','red',-4)}</div>
  <div class="dr2-row"><div class="dr2-card"><div class="cred2 big"><div class="cred2-ph">${avatar}</div><div><b>Следователь</b><span>№ 0004, kentas I</span></div></div></div>
   <ul class="dr2-checks"><li><i class="ok"></i>Титул подлинный</li><li><i class="ok"></i>Не отозван</li><li><i class="ok"></i>Полномочия достаточны: арест</li></ul></div>
  <div class="dr2-foot"><a class="btn-seal">Открыть дверь</a><a class="btn-line danger">Не открывать</a></div>
</article></div>`,
3:()=>`<div class="desk d3 dark"><div class="dr3">
  <div class="door3"><i class="door3-peep"></i><i class="door3-handle"></i><span class="door3-plate">кв. 14</span></div>
  <div class="dr3-side">
    <div class="dr3-h">Дело № 0007</div>
    <h2>Стук в дверь.<br>К вам пришли.</h2>
    <p>Обвинитель kentas I. Ордер выдан.</p>
    <div class="cred3 big"><div class="cred1-ph">${avatar}</div><div class="cred1-t"><b>Следователь</b><span>№ 0004</span></div></div>
    <div class="dr3-ok">${stamp('Подлинный','purple',-6)}${stamp('Не отозван','purple',5)}${stamp('Полномочия','purple',-3)}</div>
    <div class="dr3-btns"><a class="btn-seal">Открыть дверь</a><a class="btn-line danger">Не открывать</a></div>
  </div>
</div></div>`
};

const R = {head,home,sheet,tome,board,profile,chat,door};

/* ---------- Конструктор ---------- */
let pick = BLOCKS.map(()=>1);
const m = location.hash.match(/v=([1-3]{8})/); if(m) pick = m[1].split('').map(Number);
const main = document.getElementById('mock');
const cmp = document.getElementById('cmp');
function render(){
  main.innerHTML = BLOCKS.map((b,i)=>{
    const vs = cmp.checked?[1,2,3]:[pick[i]];
    return `<section class="blkwrap" id="b${i+1}"><div class="blk-label"><span class="blk-n">Блок ${i+1}</span><span class="blk-t">${b.n}</span><span class="blk-pick">${[1,2,3].map(v=>`<button data-b="${i}" data-v="${v}" class="${pick[i]===v?'on':''}">${v} · ${VN[v]}</button>`).join('')}</span></div>${vs.map(v=>`${cmp.checked?`<div class="blk-sub">Блок ${i+1} — вариант ${v} «${VN[v]}»</div>`:''}<div class="blk b-${b.k} v${v}">${R[b.k][v]()}</div>`).join('')}</section>`;
  }).join('');
  document.getElementById('choice').textContent = BLOCKS.map((b,i)=>`блок ${i+1} — вариант ${pick[i]}`).join(', ');
  history.replaceState(null,'','#v='+pick.join(''));
}
document.addEventListener('click',e=>{
  const t=e.target.closest('button'); if(!t) return;
  if(t.dataset.b){pick[+t.dataset.b]=+t.dataset.v; const y=t.closest('section').offsetTop; render(); }
  if(t.dataset.all){pick=pick.map(()=>+t.dataset.all); render();}
  if(t.id==='copy'){navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('choice').textContent); t.textContent='Скопировано';}
});
cmp.addEventListener('change',render);
window.vpSet=(arr,c)=>{pick=arr;cmp.checked=!!c;render();};
render();
})();
