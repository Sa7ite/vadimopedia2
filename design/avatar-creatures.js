// Концепты аватара-существа (Фаза 4, второй этап проекта). Шесть существ; у игрока три выбора: цвет, лицо, предмет.
(function () {
  const INK = '#1D2330';
  const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const shade = (h, f) => '#' + hx(h).map((v) => Math.round(v * (1 - f)).toString(16).padStart(2, '0')).join('');
  const tint = (h, f) => '#' + hx(h).map((v) => Math.round(v + (255 - v) * f).toString(16).padStart(2, '0')).join('');
  const S = (fill, d, extra) => `<path class="s" d="${d}" fill="${fill}"${extra || ''}/>`;
  const L = (d, w) => `<path class="ln" d="${d}" stroke-width="${w || 3}"/>`;
  const E = (cx, cy, rx, ry, fill) => `<ellipse class="s" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
  const ground = (rx) => `<ellipse cx="100" cy="207" rx="${rx || 56}" ry="6" fill="#0B1220" opacity=".28"/>`;

  // лицо: глаза, брови, рот. mood: ok, joy, sus
  function face(cx, cy, mood, o) {
    o = o || {};
    const gap = o.gap || 19, r = o.r || 11, px = mood === 'sus' ? 3 : 0, mouth = o.mouth !== false;
    let s = '';
    for (const k of [-1, 1]) {
      const x = cx + k * gap;
      s += `<g class="blink"><circle class="s" cx="${x}" cy="${cy}" r="${r}" fill="#F4F4EC"/><circle cx="${x + px}" cy="${cy + 1}" r="${mood === 'joy' ? r * 0.55 : r * 0.45}" fill="${INK}"/><circle cx="${x + px - 1.5}" cy="${cy - 1.5}" r="1.6" fill="#fff"/></g>`;
    }
    if (mood === 'sus') {
      s += `<path d="M${cx - gap - r - 1} ${cy - 2} H${cx - gap + r + 1} M${cx + gap - r - 1} ${cy - 2} H${cx + gap + r + 1}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
      s += L(`M${cx - gap - r} ${cy - r - 6} L${cx - gap + r} ${cy - r - 1}`, 3.4) + L(`M${cx + gap - r} ${cy - r - 2} L${cx + gap + r} ${cy - r - 8}`, 3.4);
    } else if (mood === 'joy') {
      s += L(`M${cx - gap - r + 1} ${cy - r - 4} Q${cx - gap} ${cy - r - 10} ${cx - gap + r - 1} ${cy - r - 4}`, 3) + L(`M${cx + gap - r + 1} ${cy - r - 4} Q${cx + gap} ${cy - r - 10} ${cx + gap + r - 1} ${cy - r - 4}`, 3);
    }
    if (mouth) {
      const my = cy + (o.my || 24);
      if (mood === 'joy') s += `<path class="s" d="M${cx - 13} ${my - 3} Q${cx} ${my + 20} ${cx + 13} ${my - 3} Z" fill="${INK}"/><path d="M${cx - 6} ${my + 8} Q${cx} ${my + 3} ${cx + 6} ${my + 8} Q${cx} ${my + 14} ${cx - 6} ${my + 8}Z" fill="#D9675B"/>`;
      else if (mood === 'sus') s += L(`M${cx - 9} ${my + 3} L${cx + 9} ${my - 2}`, 3.4);
      else s += L(`M${cx - 10} ${my} Q${cx} ${my + 9} ${cx + 10} ${my}`, 3.2);
    }
    return s;
  }

  const C = {};

  // 1. Папка
  C.folder = {
    name: 'Папка-дело', colors: ['#D9B26B', '#6F8FB8', '#7FA37A', '#C9654F', '#9A9DA3'],
    extras: [['none', 'Без предмета'], ['clip', 'Скрепка'], ['stamp', 'Печать'], ['glasses', 'Очки']],
    draw(c, mood, ex) {
      const d = shade(c, .16), d2 = shade(c, .3);
      let s = ground(54) + L('M82 186 V202 H70 M118 186 V202 H130', 5);
      s += `<g class="bob"><g transform="rotate(-5 90 70)">${S('#E6E6DC', 'M60 30 H124 V96 H60 Z')}${L('M68 42 H116 M68 52 H110 M68 62 H116', 2)}</g><g transform="rotate(4 112 70)">${S('#F2F2E8', 'M76 24 H140 V96 H76 Z')}${L('M84 36 H130 M84 46 H124', 2)}</g></g>`;
      s += S(d, 'M44 62 H156 V190 H44 Z') + S(d2, 'M44 62 V52 Q44 47 49 47 H86 L95 62 Z') + S(c, 'M44 76 H156 V190 H44 Z');
      s += S('#F2F2E8', 'M64 162 H136 V182 H64 Z') + L('M70 170 H112 M70 177 H98', 2);
      s += L('M44 128 Q28 136 30 156', 4) + L('M156 128 Q172 136 170 156', 4) + `<circle class="s" cx="30" cy="158" r="5" fill="${c}"/><circle class="s" cx="170" cy="158" r="5" fill="${c}"/>`;
      s += face(100, 112, mood, { gap: 20, my: 22 });
      if (ex === 'clip') s += `<path d="M136 56 V96 q0 11 -9 11 q-9 0 -9 -11 V64" fill="none" stroke="#8A8F96" stroke-width="4" stroke-linecap="round"/>`;
      if (ex === 'stamp') s += `<g transform="rotate(-12 138 150)"><circle cx="138" cy="150" r="17" fill="none" stroke="#8F1D17" stroke-width="3.4"/><circle cx="138" cy="150" r="12" fill="none" stroke="#8F1D17" stroke-width="1.6"/><text x="138" y="156" text-anchor="middle" font-family="PT Mono,monospace" font-weight="700" font-size="16" fill="#8F1D17">В</text></g>`;
      if (ex === 'glasses') s += `<g fill="#F4F4EC" fill-opacity=".25" stroke="${INK}" stroke-width="3"><circle cx="80" cy="112" r="17"/><circle cx="120" cy="112" r="17"/></g>` + L('M97 112 H103', 3);
      return s;
    }
  };

  // 2. Ворон
  C.raven = {
    name: 'Ворон-архивариус', colors: ['#262A36', '#5C6270', '#E8E6DC', '#3A4C7A', '#6B4A36'],
    extras: [['none', 'Без предмета'], ['bowler', 'Шляпа-котелок'], ['monocle', 'Монокль'], ['scarf', 'Шарф']],
    draw(c, mood, ex) {
      const d = shade(c, .25), belly = tint(c, .18), light = (hx(c).reduce((a, b) => a + b, 0) > 520);
      const beak = '#E2A93B';
      let s = ground(52);
      s += S('#D6A94A', 'M36 184 H164 V194 H36 Z') + S('#B98A33', 'M164 184 L176 189 L164 194 Z') + L('M52 184 V194 M70 184 V194', 2);
      s += S(d, 'M88 170 L76 212 L98 198 L118 212 L112 170 Z');
      s += E(100, 126, 48, 56, c) + E(100, 140, 28, 38, belly);
      s += `<g class="wing">${S(d, 'M58 96 Q36 140 66 182 Q90 154 84 104 Z')}${S(d, 'M142 96 Q164 140 134 182 Q110 154 116 104 Z')}</g>`;
      s += L('M88 176 V184 M112 176 V184', 4) + L('M82 184 l-5 4 M88 184 l0 5 M94 184 l5 4 M106 184 l-5 4 M112 184 l0 5 M118 184 l5 4', 2.4);
      s += `<g class="headbob">${E(100, 70, 34, 32, c)}`;
      s += face(100, 64, mood, { gap: 15, r: 9, mouth: false });
      s += mood === 'joy' ? S(beak, 'M90 78 L110 78 L100 86 Z') + S('#D9675B', 'M92 88 H108 L100 94 Z') + S(beak, 'M92 90 L108 90 L100 100 Z')
        : mood === 'sus' ? S(beak, 'M90 78 L110 78 L102 98 Z') : S(beak, 'M90 78 L110 78 L100 98 Z');
      if (ex === 'bowler') s += S(INK, 'M70 48 Q70 18 100 18 Q130 18 130 48 Z') + S(INK, 'M60 50 Q100 40 140 50 Q140 56 100 56 Q60 56 60 50 Z') + L('M72 44 H128', 2.4).replace('class="ln"', 'class="ln" style="stroke:#C6A663"');
      if (ex === 'monocle') s += `<circle cx="115" cy="64" r="14" fill="#F4F4EC" fill-opacity=".25" stroke="#C6A663" stroke-width="3"/>` + L('M127 72 Q140 100 126 130', 1.8);
      s += '</g>';
      if (ex === 'scarf') s += S('#B5443A', 'M64 98 Q100 114 136 98 L134 112 Q100 128 66 112 Z') + S('#B5443A', 'M120 112 L132 146 L116 144 Z') + L('M124 124 L127 136 M118 122 L121 134', 1.6);
      return s;
    }
  };

  // 3. Чайник
  C.kettle = {
    name: 'Чайник', colors: ['#3E6FB5', '#B5443A', '#4F9A6A', '#EDEDE3', '#C98B4E'],
    extras: [['none', 'Без предмета'], ['tag', 'Бирка чая'], ['dots', 'Узор'], ['bow', 'Бабочка']],
    draw(c, mood, ex) {
      const d = shade(c, .2), puffs = mood === 'joy' ? 4 : mood === 'sus' ? 1 : 2;
      let s = ground(60);
      for (let i = 0; i < puffs; i++) s += `<path class="steam st${i}" d="M${176 + (i % 2) * 6} ${86 - i * 4} q-8 -10 0 -20 q8 -10 0 -20" fill="none" stroke="#F4F4EC" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
      s += `<path d="M46 118 Q14 112 18 148 Q22 176 54 166" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M46 118 Q14 112 18 148 Q22 176 54 166" fill="none" stroke="${d}" stroke-width="7" stroke-linecap="round"/>`;
      s += `<path d="M150 134 Q172 126 182 96" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M150 134 Q172 126 182 96" fill="none" stroke="${c}" stroke-width="11" stroke-linecap="round"/>`;
      s += E(76, 194, 14, 6, d) + E(124, 194, 14, 6, d);
      s += S(c, 'M42 140 Q42 96 100 96 Q158 96 158 140 Q158 190 100 190 Q42 190 42 140 Z');
      s += E(100, 94, 32, 9, d) + `<circle class="s" cx="100" cy="82" r="8" fill="${d}"/>`;
      s += face(100, 138, mood, { gap: 21, my: 24 });
      if (ex === 'tag') s += L('M112 92 Q132 100 134 120', 1.8) + S('#F2F2E8', 'M124 118 H146 V142 H124 Z') + L('M129 126 H141 M129 133 H138', 1.8);
      if (ex === 'dots') s += `<g fill="${tint(c, .55)}" stroke="none"><circle cx="62" cy="120" r="4"/><circle cx="140" cy="118" r="4"/><circle cx="56" cy="160" r="3.4"/><circle cx="146" cy="164" r="3.4"/><circle cx="100" cy="176" r="3.4"/></g>`;
      if (ex === 'bow') s += S('#8F1D17', 'M100 106 L80 96 V116 Z') + S('#8F1D17', 'M100 106 L120 96 V116 Z') + `<circle class="s" cx="100" cy="106" r="5" fill="#8F1D17"/>`;
      return s;
    }
  };

  // 4. Гриб
  C.mushroom = {
    name: 'Гриб-следопыт', colors: ['#C8442F', '#8A5A3C', '#7B4FB0', '#E0B23A', '#3E7FA8'],
    extras: [['none', 'Без предмета'], ['flower', 'Цветок'], ['moss', 'Мох'], ['ribbon', 'Лента']],
    draw(c, mood, ex) {
      const d = shade(c, .22), spot = '#F4F1E4';
      let s = ground(46);
      s += S('#CDB894', 'M68 200 Q74 136 76 120 H124 Q126 136 132 200 Z') + S('#F1E5CF', 'M72 198 Q78 136 80 122 H120 Q122 136 128 198 Z');
      s += `<path d="M60 202 l-6 -12 l10 6 l4 -10 l6 12 M136 202 l6 -12 l-10 6 l-4 -10 l-6 12" fill="none" stroke="#4F8A56" stroke-width="3" stroke-linecap="round"/>`;
      s += S('#CDB894', 'M48 124 Q100 114 152 124 L150 134 Q100 126 50 134 Z');
      s += face(100, 156, mood, { gap: 14, r: 9, my: 18 });
      s += `<g class="headbob">` + S(c, 'M28 124 Q28 38 100 38 Q172 38 172 124 Q172 136 150 134 Q100 124 50 134 Q28 136 28 124 Z');
      s += `<g fill="${spot}" stroke="${INK}" stroke-width="2"><circle cx="64" cy="82" r="10"/><circle cx="112" cy="62" r="12"/><circle cx="146" cy="94" r="9"/><circle cx="96" cy="104" r="7"/><circle cx="52" cy="112" r="5"/></g>`;
      if (ex === 'flower') s += L('M100 38 V20', 3) + `<g class="s" fill="#F2C94C"><circle cx="100" cy="12" r="5"/><circle cx="92" cy="18" r="5"/><circle cx="108" cy="18" r="5"/><circle cx="94" cy="8" r="5"/><circle cx="106" cy="8" r="5"/></g><circle class="s" cx="100" cy="13" r="3.4" fill="#C8442F"/>`;
      if (ex === 'moss') s += S('#4F8A56', 'M62 52 Q78 36 100 42 Q116 36 128 50 Q120 56 112 52 Q100 60 88 52 Q76 62 62 52 Z');
      s += '</g>';
      if (ex === 'ribbon') s += S('#B5443A', 'M74 128 Q100 138 126 128 V138 Q100 148 74 138 Z') + S('#B5443A', 'M100 140 L90 158 L98 154 L100 162 L104 154 L112 158 Z');
      return s;
    }
  };

  // 5. Лампа
  C.lamp = {
    name: 'Лампа-наблюдатель', colors: ['#4C7A63', '#B5443A', '#C6A663', '#5A2E8F', '#DADBD0'],
    extras: [['none', 'Без предмета'], ['stripes', 'Полосы'], ['flag', 'Флажок'], ['bow', 'Бант']],
    draw(c, mood, ex) {
      const d = shade(c, .25), cone = mood === 'joy' ? .42 : mood === 'sus' ? .12 : .26;
      let s = ground(50);
      s += `<path d="M64 112 L160 112 L190 204 L34 204 Z" fill="#F5E38A" opacity="${cone}"/>`;
      s += `<path d="M100 186 L70 150 L108 110" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M100 186 L70 150 L108 110" fill="none" stroke="#9AA39F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<circle class="s" cx="70" cy="150" r="7" fill="#9AA39F"/>`;
      s += S(d, 'M54 204 Q56 186 100 184 Q144 186 146 204 Z');
      s += `<g class="headbob">` + S(c, 'M40 106 Q40 30 108 30 Q176 30 176 106 Z') + E(108, 106, 68, 9, d);
      if (ex === 'stripes') s += `<g fill="${tint(c, .55)}" stroke="none"><path d="M76 34 Q70 60 66 100 H84 Q86 66 90 32 Z"/><path d="M126 31 Q130 60 132 102 H150 Q148 64 142 34 Z"/></g>`;
      const cx = 108, cy = 70;
      if (mood === 'joy') s += `<circle class="s" cx="${cx}" cy="${cy}" r="24" fill="#F4F4EC"/><path d="M${cx - 15} ${cy + 4} Q${cx} ${cy - 18} ${cx + 15} ${cy + 4}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
      else {
        s += `<g class="blink"><circle class="s" cx="${cx}" cy="${cy}" r="24" fill="#F4F4EC"/><circle cx="${cx + (mood === 'sus' ? 7 : 0)}" cy="${cy + 2}" r="11" fill="${INK}"/><circle cx="${cx + (mood === 'sus' ? 4 : -3)}" cy="${cy - 3}" r="3" fill="#fff"/></g>`;
        if (mood === 'sus') s += `<path d="M${cx - 26} ${cy - 4} H${cx + 26}" stroke="${INK}" stroke-width="4"/><path d="M${cx - 26} ${cy - 6} H${cx + 26} L${cx + 22} ${cy - 24} Q${cx} ${cy - 30} ${cx - 22} ${cy - 24} Z" fill="${c}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` + L(`M${cx - 20} ${cy - 30} L${cx + 18} ${cy - 36}`, 3.4);
      }
      if (ex === 'flag') s += L('M158 52 V10', 3) + S('#B5443A', 'M158 10 H184 L176 20 L184 30 H158 Z');
      s += '</g>';
      if (ex === 'bow') s += S('#8F1D17', 'M86 156 L66 146 V166 Z') + S('#8F1D17', 'M86 156 L104 146 V166 Z') + `<circle class="s" cx="86" cy="156" r="4.6" fill="#8F1D17"/>`;
      return s;
    }
  };

  // 6. Ушанка
  C.ushanka = {
    name: 'Ушанка', colors: ['#7A7E85', '#6B4A36', '#2E3038', '#E8E6DC', '#9B3A32'],
    extras: [['none', 'Без предмета'], ['glasses', 'Очки'], ['snow', 'Снег'], ['medal', 'Медаль']],
    draw(c, mood, ex) {
      const d = shade(c, .22), fur = tint(c, .12);
      const flap = mood === 'joy' ? 'flap up' : 'flap';
      let s = ground(56) + L('M76 190 V204 H64 M124 190 V204 H136', 5);
      s += `<g class="${flap} fl">${S(c, 'M44 126 Q16 146 22 190 Q30 206 50 198 Q60 168 56 134 Z')}${L('M32 150 q-4 18 2 36', 2)}</g>`;
      s += `<g class="${flap} fr">${S(c, 'M156 126 Q184 146 178 190 Q170 206 150 198 Q140 168 144 134 Z')}${L('M168 150 q4 18 -2 36', 2)}</g>`;
      s += S(c, 'M38 142 Q38 36 100 36 Q162 36 162 142 Z');
      s += `<g fill="${fur}" stroke="${INK}" stroke-width="2"><circle cx="48" cy="134" r="11"/><circle cx="66" cy="140" r="11"/><circle cx="86" cy="144" r="11"/><circle cx="106" cy="145" r="11"/><circle cx="126" cy="144" r="11"/><circle cx="146" cy="140" r="11"/><circle cx="154" cy="132" r="9"/></g>`;
      s += S(d, 'M60 130 Q100 138 140 130 L138 142 Q100 150 62 142 Z', '');
      s += `<g fill="#C8442F" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"><path d="M100 46 L104 56 L115 57 L107 64 L110 75 L100 69 L90 75 L93 64 L85 57 L96 56 Z" fill="#C8442F"/></g>`;
      s += face(100, 98, mood, { gap: 20, r: 10, my: 22 });
      if (ex === 'glasses') s += `<g fill="#9FC1CF" fill-opacity=".45" stroke="${INK}" stroke-width="3"><circle cx="79" cy="98" r="17"/><circle cx="121" cy="98" r="17"/></g>` + L('M96 98 H104', 3);
      if (ex === 'snow') s += '<g fill="#F4F4EC" stroke="none"><circle cx="58" cy="62" r="4"/><circle cx="138" cy="70" r="4"/><circle cx="74" cy="44" r="3"/><circle cx="148" cy="108" r="3.4"/><circle cx="52" cy="104" r="3"/></g>';
      if (ex === 'medal') s += L('M92 150 L100 168 L108 150', 2.4) + `<circle class="s" cx="100" cy="174" r="9" fill="#C6A663"/><circle cx="100" cy="174" r="4" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
      return s;
    }
  };

  window.VPCreatures = { INK, C, order: ['folder', 'raven', 'kettle', 'mushroom', 'lamp', 'ushanka'] };
})();
