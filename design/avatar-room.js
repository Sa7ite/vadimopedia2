// Комната-кабинет (вид спереди). Время суток — по часу; предметы открываются достижениями.
(function () {
  const INK = '#1D2330';
  const sky = (h) => (h >= 5 && h < 11 ? { c: '#F0CF95', night: 0, sun: [150, 150, '#F7E7B5'] }
    : h >= 11 && h < 17 ? { c: '#A9CBD6', night: 0, sun: [170, 90, '#FBF3C8'] }
    : h >= 17 && h < 21 ? { c: '#D9865E', night: .22, sun: [110, 170, '#F6C77C'] }
    : { c: '#1F2A44', night: .5, moon: true });
  const o = (cls, inner) => `<g class="rm-o ${cls}">${inner}</g>`;
  function roomSvg(opt) {
    const h = opt.hour, sk = sky(h), it = opt.items || {};
    const stars = sk.moon ? '<g fill="#F4F4EC"><circle cx="80" cy="76" r="1.6"/><circle cx="120" cy="70" r="1.2"/><circle cx="188" cy="92" r="1.6"/><circle cx="160" cy="62" r="1.2"/><circle cx="98" cy="120" r="1.2"/></g><circle cx="165" cy="108" r="14" fill="#EDE8CF"/><circle cx="171" cy="104" r="12" fill="#1F2A44"/>' : '';
    const sun = sk.sun ? `<circle cx="${sk.sun[0]}" cy="${sk.sun[1]}" r="20" fill="${sk.sun[2]}"/>` : '';
    const clouds = !sk.moon ? '<path d="M74 110 q6 -12 20 -6 q8 -10 22 0 q14 0 12 10 h-56 q-4 -2 2 -4z" fill="#F4F4EC" opacity=".85"/>' : '';
    const lampOn = h >= 17 || h < 6;
    const cone = lampOn ? '<path d="M206 236 L150 322 L300 322 Z" fill="#F5E38A" opacity=".24"/>' : '';
    const tint = sk.night ? `<rect x="0" y="0" width="640" height="420" fill="#0B1220" opacity="${sk.night}"/>` : '';
    return `
    <g class="rm-wall"><rect width="640" height="340" fill="#7F948B"/><rect y="262" width="640" height="80" fill="#5E7168"/><path d="M0 262 H640" class="ln" stroke-width="3"/>
      <path d="M0 340 H640" class="ln" stroke-width="3"/></g>
    <g class="rm-floor"><rect y="340" width="640" height="80" fill="#2B3A33"/><path d="M0 366 H640 M0 392 H640 M90 340 V366 M300 366 V392 M470 340 V366 M180 392 V420" stroke="#22302B" stroke-width="2" fill="none"/></g>
    ${o('rm-win', `<rect x="56" y="50" width="160" height="156" class="s" fill="${sk.c}"/>${stars}${sun}${clouds}
      <path d="M136 50 V206 M56 128 H216" class="ln" stroke-width="3.4"/><rect x="48" y="206" width="176" height="12" class="s" fill="#8A6A45"/><rect x="56" y="50" width="160" height="156" fill="none" stroke="${INK}" stroke-width="5"/>`)}
    ${o('rm-hat', `<rect x="396" y="72" width="62" height="12" class="s" fill="#8A6A45"/><path d="M410 84 v8 M427 84 v8 M444 84 v8" class="ln" stroke-width="3"/>
      <path d="M402 92 q8 -22 16 0 z M434 92 q10 -26 20 0 z" class="s" fill="#C6A663"/><path d="M414 100 h24" class="ln" stroke-width="3"/>`)}
    ${o('rm-cab', `<rect x="474" y="120" width="130" height="220" class="s" fill="#55645E"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="482" y="${130 + i * 50}" width="114" height="42" class="s" fill="#62736C"/><rect x="520" y="${142 + i * 50}" width="38" height="10" class="s" fill="#E6E6DC"/><path d="M528 ${160 + i * 50} h22" class="ln" stroke-width="3"/>`).join('')}`)}
    ${it.frame ? o('rm-frame', `<rect x="268" y="40" width="104" height="76" class="s" fill="#C6A663"/><rect x="276" y="48" width="88" height="60" class="s" fill="#E6E6DC"/><path d="M288 66 h64 M288 78 h64 M288 90 h40" class="ln" stroke-width="2.4"/><circle cx="346" cy="92" r="7" fill="#8F1D17" stroke="${INK}" stroke-width="2"/>`) : ''}
    ${it.medal ? o('rm-medal', `<path d="M400 120 v34 l8 -6 l8 6 v-34 z" class="s" fill="#8F1D17"/><circle cx="408" cy="164" r="14" class="s" fill="#C6A663"/><circle cx="408" cy="164" r="7" fill="none" stroke="${INK}" stroke-width="2"/>`) : ''}
    ${it.cup ? o('rm-cup', `<path d="M526 96 h42 v16 q0 22 -21 24 q-21 -2 -21 -24 z" class="s" fill="#C6A663"/><path d="M526 102 q-14 0 -12 10 q2 8 14 8 M568 102 q14 0 12 10 q-2 8 -14 8" class="ln" stroke-width="2.6"/><rect x="540" y="136" width="14" height="8" class="s" fill="#C6A663"/><rect x="532" y="144" width="30" height="8" class="s" fill="#8A6A45"/>`) : ''}
    <g class="av-slot" transform="translate(${opt.ax} ${opt.ay}) scale(${opt.as})">${opt.avatar}</g>
    ${tint}${cone}
    ${o('rm-desk', `<rect x="130" y="300" width="450" height="24" class="s" fill="#9A7650"/><rect x="146" y="324" width="418" height="96" class="s" fill="#6B4F31"/>
      <rect x="170" y="340" width="150" height="56" class="s" fill="#7A5B3A"/><rect x="390" y="340" width="150" height="56" class="s" fill="#7A5B3A"/><path d="M230 368 h30 M450 368 h30" class="ln" stroke-width="4"/>`)}
    ${o('rm-lamp', `<ellipse cx="190" cy="298" rx="24" ry="6" class="s" fill="#2B3A33"/><path d="M190 296 L176 252 L214 232" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M196 226 L230 244 L220 224 Z" class="s" fill="${lampOn ? '#F5E38A' : '#55645E'}"/>`)}
    ${o('rm-papers', `<rect x="252" y="290" width="60" height="10" class="s" fill="#E6E6DC"/><rect x="256" y="283" width="52" height="8" class="s" fill="#DADBD0"/>`)}
    ${it.teapot ? o('rm-teapot', `<ellipse cx="454" cy="288" rx="18" ry="13" class="s" fill="#2B4C8C"/><path d="M472 284 l12 -8 M436 282 q-12 0 -10 10" class="ln" stroke-width="3"/><rect x="448" y="272" width="12" height="6" class="s" fill="#2B4C8C"/><rect x="437" y="299" width="34" height="3" fill="${INK}"/>`) : ''}
    ${it.cactus ? o('rm-cactus', `<rect x="520" y="282" width="26" height="20" class="s" fill="#C46A3C"/><path d="M533 282 V252 q0 -8 6 -6 q4 0 4 8 V282 M533 270 q-12 0 -10 -12 v-4" class="s" fill="#3C7A4A"/><path d="M533 282 V250 q0 -6 6 -4 V282 Z" class="s" fill="#3C7A4A"/>`) : ''}`;
  }
  window.VPRoom = { roomSvg };
})();
