// Вадимопедия: поиск, «Вадим дня», новые главы, прогресс чтения, «Поделиться», PWA
(function(){
const $=s=>document.querySelector(s);
// поиск по ленте
document.addEventListener('input',e=>{if(e.target.id!=='events-search')return;const q=e.target.value.trim().toLowerCase();
  document.querySelectorAll('#events-list>li').forEach(li=>{li.style.display=!q||li.textContent.toLowerCase().includes(q)?'':'none';});});
// поделиться
document.addEventListener('click',async e=>{const b=e.target.closest('[data-share]');if(!b)return;
  const text=decodeURIComponent(b.dataset.share)+'\n— Вадимопедия, '+location.origin;
  try{if(navigator.share)await navigator.share({title:'Вадимопедия',text});else{await navigator.clipboard.writeText(text);b.textContent='Скопировано!';}}catch(_){}});
// новые главы летописи
const navChron=()=>document.querySelector('.nav-link[data-section="chronicle"]');
window.vpChronicleCheck=c=>{if(!c||!c.content)return;const seen=+localStorage.getItem('chronicleSeen')||0;
  if(c.version>seen){navChron()?.classList.add('has-new');if(seen)setTimeout(()=>window.vpToast?.('Вышла новая глава летописи!'),1500);}};
window.vpChronicleSeen=c=>{if(!c)return;const prev=localStorage.getItem('chronicleText')||'';localStorage.setItem('chronicleSeen',c.version);navChron()?.classList.remove('has-new');
  // подсветка нового текста: абзацы, которых не было в прошлый раз
  if(prev&&prev!==c.content){document.querySelectorAll('#chronicle-content p').forEach(p=>{const t=p.textContent.slice(0,60);if(t&&!prev.replace(/\[\[\d+\|([^\]]+)\]\]/g,'$1').includes(t))p.classList.add('chronicle-new');});}
  localStorage.setItem('chronicleText',c.content);
  const y=+localStorage.getItem('chronicleScroll')||0;if(y>300)setTimeout(()=>window.scrollTo({top:y,behavior:'smooth'}),300);};
window.vpToast=m=>{const c=$('#notification-container');if(!c)return;const d=document.createElement('div');d.className='notification info';d.textContent=m;c.appendChild(d);setTimeout(()=>d.remove(),5000);};
// прогресс чтения
addEventListener('scroll',()=>{const sec=$('#section-chronicle'),bar=$('#read-progress');if(!sec||!bar)return;
  const on=sec.offsetParent!==null&&$('#chronicle-content .chronicle-ref');bar.style.display=on?'block':'none';if(!on)return;
  const r=sec.getBoundingClientRect(),h=r.height-innerHeight,p=Math.min(1,Math.max(0,-r.top/(h||1)));bar.style.width=(p*100)+'%';
  localStorage.setItem('chronicleScroll',scrollY);},{passive:true});
// Вадим дня
window.vpVadimOfDay=(ev,open)=>{const box=$('#vadim-of-day');if(!box||!ev||!ev.length)return;
  const d=new Date(),k=(d.getFullYear()*372+d.getMonth()*31+d.getDate())*2654435761>>>0,e=ev[k%ev.length];
  box.innerHTML=`<div class="vod-label">Событие дня</div><div class="vod-text"></div><div class="vod-meta"></div>`;
  box.querySelector('.vod-meta').textContent=[e.event_date,e.city].filter(Boolean).join(' · ');
  box.querySelector('.vod-text').textContent=e.event_text.length>220?e.event_text.slice(0,220)+'…':e.event_text;
  box.style.display='block';box.style.cursor='pointer';box.onclick=()=>open&&open(e);};
// D8: переключатель темы в профиле
window.vpMarkTheme=()=>document.querySelectorAll('.theme-picker button').forEach(b=>b.classList.toggle('on',document.body.classList.contains('theme-'+b.dataset.t)));
document.addEventListener('click',e=>{const b=e.target.closest('.theme-picker button');if(!b)return;
  localStorage.setItem('theme',b.dataset.t);document.body.classList.remove('theme-agit','theme-dossier');document.body.classList.add('theme-'+b.dataset.t);window.vpMarkTheme();});
// PWA
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
