// Прототип аватара и комнаты (Фаза 4). Одна библиотека: детали, схема JSON, рендер в SVG.
// Позже переедет в js/avatar.js без изменений формата.
(function () {
  const INK = '#1D2330';
  const PAL = {
    skin: ['#F1D3B5', '#E3B994', '#C48B63', '#8D5A3B', '#5B3A27'],
    hair: ['#1D2330', '#4A3022', '#A6652B', '#D2AE55', '#8E9096', '#8F1D17'],
    cloth: ['#55645E', '#5A2E8F', '#2B4C8C', '#8F1D17', '#C6A663', '#3C7A4A', '#DADBD0', '#1D2330'],
    acc: ['#C6A663', '#8F1D17', '#2B4C8C', '#1D2330', '#DADBD0', '#3C7A4A']
  };
  // слои снизу вверх; ax, ay — точка, вокруг которой применяются сдвиг, поворот и масштаб
  const LAYERS = [
    { id: 'body', name: 'Тело', ax: 100, ay: 190, pal: 'skin', hidden: true },
    { id: 'hairB', name: 'Волосы сзади', ax: 100, ay: 92, pal: 'hair' },
    { id: 'clothes', name: 'Одежда', ax: 100, ay: 205, pal: 'cloth' },
    { id: 'head', name: 'Голова', ax: 100, ay: 92, pal: 'skin' },
    { id: 'eyes', name: 'Глаза', ax: 100, ay: 92, pal: 'acc', eyeColors: true },
    { id: 'brows', name: 'Брови', ax: 100, ay: 80, pal: 'hair' },
    { id: 'nose', name: 'Нос', ax: 100, ay: 102, pal: null },
    { id: 'mouth', name: 'Рот', ax: 100, ay: 120, pal: null },
    { id: 'hairF', name: 'Волосы спереди', ax: 100, ay: 60, pal: 'hair' },
    { id: 'glasses', name: 'Очки', ax: 100, ay: 92, pal: 'acc' },
    { id: 'hat', name: 'Головной убор', ax: 100, ay: 50, pal: 'cloth' },
    { id: 'acc', name: 'Аксессуар', ax: 100, ay: 150, pal: 'acc' },
    { id: 'badge', name: 'Нашивка', ax: 140, ay: 204, pal: 'acc' }
  ];
  const S = (c, d, extra = '') => `<path class="s" fill="${c}" d="${d}" ${extra}/>`;
  const L = (d, w = 2.6) => `<path class="ln" d="${d}" stroke-width="${w}"/>`;
  const SHOULDERS = 'M14 240 C14 200 48 178 84 172 L116 172 C152 178 186 200 186 240 Z';
  const light = (c) => c; // зарезервировано для затемнения цвета
  const P = {
    body: { a: { name: 'Шея и плечи', svg: (c) => S(c, 'M84 120 H116 V178 Q100 190 84 178 Z') } },
    hairB: {
      none: { name: 'Нет', svg: () => '' },
      long: { name: 'Длинные', svg: (c) => S(c, 'M58 90 C54 40 146 40 142 90 L150 176 Q100 190 50 176 Z') },
      bob: { name: 'Каре', svg: (c) => S(c, 'M56 92 C52 40 148 40 144 92 L146 140 Q100 150 54 140 Z') },
      bun: { name: 'Пучок', svg: (c) => S(c, 'M62 80 C62 44 138 44 138 80 Z') + S(c, 'M100 18 a16 16 0 1 1 -0.1 0 Z') },
      afro: { name: 'Афро', svg: (c) => S(c, 'M100 24 a54 52 0 1 1 -0.1 0 Z') }
    },
    clothes: {
      shirt: { name: 'Рубашка и галстук', svg: (c) => S(c, SHOULDERS) + S('#E6E6DC', 'M84 172 L100 196 L116 172 L108 168 L100 178 L92 168 Z') + S('#8F1D17', 'M95 184 L105 184 L108 230 L100 238 L92 230 Z') + L('M92 168 L100 178 L108 168', 2.2) },
      hoodie: { name: 'Худи', svg: (c) => S(c, SHOULDERS) + S(c, 'M70 170 C70 156 130 156 130 170 C130 190 70 190 70 170 Z') + L('M92 184 V214 M108 184 V214', 2.4) + L('M70 170 C70 190 130 190 130 170', 2.2) },
      jacket: { name: 'Пиджак', svg: (c) => S(c, SHOULDERS) + S('#E6E6DC', 'M86 172 L100 214 L114 172 Z') + S(c, 'M84 172 L100 226 L74 232 L70 190 Z') + S(c, 'M116 172 L100 226 L126 232 L130 190 Z') },
      sweater: { name: 'Свитер', svg: (c) => S(c, SHOULDERS) + S(c, 'M80 168 Q100 188 120 168 L120 178 Q100 196 80 178 Z') + L('M30 214 H70 M130 214 H170 M26 226 H74 M126 226 H174', 2) }
    },
    head: {
      oval: { name: 'Овал', svg: (c) => S(c, 'M100 44 C132 44 140 70 138 96 C136 124 120 140 100 140 C80 140 64 124 62 96 C60 70 68 44 100 44 Z') + S(c, 'M63 94 a6 9 0 1 0 0.1 0 Z') + S(c, 'M137 94 a6 9 0 1 1 -0.1 0 Z') },
      square: { name: 'Квадрат', svg: (c) => S(c, 'M66 54 Q66 46 76 46 H124 Q134 46 134 54 V104 Q134 140 100 140 Q66 140 66 104 Z') + S(c, 'M65 94 a6 9 0 1 0 0.1 0 Z') + S(c, 'M135 94 a6 9 0 1 1 -0.1 0 Z') },
      round: { name: 'Круг', svg: (c) => S(c, 'M100 48 a44 46 0 1 1 -0.1 0 Z') + S(c, 'M57 94 a6 9 0 1 0 0.1 0 Z') + S(c, 'M143 94 a6 9 0 1 1 -0.1 0 Z') },
      long: { name: 'Вытянутая', svg: (c) => S(c, 'M100 40 C126 40 134 66 132 98 C130 128 116 148 100 148 C84 148 70 128 68 98 C66 66 74 40 100 40 Z') + S(c, 'M68 96 a5 9 0 1 0 0.1 0 Z') + S(c, 'M132 96 a5 9 0 1 1 -0.1 0 Z') }
    },
    eyes: {
      dots: { name: 'Точки', svg: (c) => `<g class="blink"><circle cx="83" cy="94" r="4.4" fill="${INK}"/><circle cx="117" cy="94" r="4.4" fill="${INK}"/></g>` },
      round: { name: 'Круглые', svg: (c) => `<g class="blink"><circle cx="83" cy="94" r="9" fill="#F4F4EC" class="s"/><circle cx="117" cy="94" r="9" fill="#F4F4EC" class="s"/><circle cx="84" cy="95" r="4.6" fill="${c}"/><circle cx="116" cy="95" r="4.6" fill="${c}"/><circle cx="84" cy="95" r="2" fill="${INK}"/><circle cx="116" cy="95" r="2" fill="${INK}"/></g>` },
      almond: { name: 'Миндаль', svg: (c) => `<g class="blink"><path d="M71 95 Q83 84 95 95 Q83 103 71 95 Z" fill="#F4F4EC" class="s"/><path d="M105 95 Q117 84 129 95 Q117 103 105 95 Z" fill="#F4F4EC" class="s"/><circle cx="83" cy="94.5" r="4.4" fill="${c}"/><circle cx="117" cy="94.5" r="4.4" fill="${c}"/><circle cx="83" cy="94.5" r="1.9" fill="${INK}"/><circle cx="117" cy="94.5" r="1.9" fill="${INK}"/></g>` },
      sleepy: { name: 'Сонные', svg: () => `<g class="blink">${L('M72 94 Q83 102 94 94')}${L('M106 94 Q117 102 128 94')}</g>` }
    },
    brows: {
      none: { name: 'Нет', svg: () => '' },
      straight: { name: 'Прямые', svg: (c) => `<path d="M70 80 H95 M105 80 H130" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/>` },
      arch: { name: 'Дугой', svg: (c) => `<path d="M70 82 Q83 72 96 80 M104 80 Q117 72 130 82" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/>` },
      angry: { name: 'Грозные', svg: (c) => `<path d="M70 74 L96 82 M104 82 L130 74" stroke="${c}" stroke-width="5.4" stroke-linecap="round" fill="none"/>` }
    },
    nose: {
      none: { name: 'Нет', svg: () => '' },
      line: { name: 'Линия', svg: () => L('M101 96 L97 110 H104') },
      dot: { name: 'Точка', svg: () => `<circle cx="100" cy="108" r="4" fill="rgba(29,35,48,.35)" stroke="${INK}" stroke-width="2"/>` },
      tri: { name: 'Треугольник', svg: () => L('M100 98 L93 112 H107 Z') }
    },
    mouth: {
      smile: { name: 'Улыбка', svg: () => L('M84 120 Q100 134 116 120') },
      flat: { name: 'Прямой', svg: () => L('M88 122 H112') },
      open: { name: 'Открытый', svg: () => `<path class="s" fill="#7A1F1F" d="M84 118 Q100 140 116 118 Z"/>` },
      smirk: { name: 'Усмешка', svg: () => L('M88 124 Q102 124 114 116') }
    },
    hairF: {
      none: { name: 'Нет', svg: () => '' },
      crop: { name: 'Короткие', svg: (c) => S(c, 'M62 76 C62 38 138 38 138 76 C128 62 116 56 100 56 C84 56 72 62 62 76 Z') },
      side: { name: 'Косой пробор', svg: (c) => S(c, 'M60 84 C54 36 146 34 140 84 C132 66 118 58 92 56 C86 66 74 74 60 84 Z') },
      curly: { name: 'Кудри', svg: (c) => S(c, 'M60 84 a12 12 0 0 1 4 -22 a12 12 0 0 1 20 -14 a12 12 0 0 1 22 -6 a12 12 0 0 1 22 6 a12 12 0 0 1 20 14 a12 12 0 0 1 4 22 C132 70 116 62 100 62 C84 62 68 70 60 84 Z') },
      mohawk: { name: 'Гребень', svg: (c) => S(c, 'M88 54 L92 20 L100 44 L108 18 L112 54 Q100 50 88 54 Z') }
    },
    glasses: {
      none: { name: 'Нет', svg: () => '' },
      round: { name: 'Круглые', svg: (c) => `<g fill="rgba(240,240,230,.28)" stroke="${c}" stroke-width="3.4"><circle cx="83" cy="94" r="14"/><circle cx="117" cy="94" r="14"/></g>` + `<path d="M97 94 H103" stroke="${c}" stroke-width="3.4" fill="none"/>` },
      square: { name: 'Квадратные', svg: (c) => `<g fill="rgba(240,240,230,.28)" stroke="${c}" stroke-width="3.4"><rect x="68" y="82" width="30" height="24" rx="4"/><rect x="102" y="82" width="30" height="24" rx="4"/></g><path d="M98 92 H102" stroke="${c}" stroke-width="3.4" fill="none"/>` },
      shades: { name: 'Тёмные', svg: (c) => `<g fill="${INK}" stroke="${c}" stroke-width="3"><path d="M66 84 H98 V96 Q98 106 86 106 H78 Q66 106 66 96 Z"/><path d="M102 84 H134 V96 Q134 106 122 106 H114 Q102 106 102 96 Z"/></g>` }
    },
    hat: {
      none: { name: 'Нет', svg: () => '' },
      ushanka: { name: 'Ушанка', svg: (c) => S(c, 'M58 74 C58 22 142 22 142 74 L150 120 Q144 126 138 120 L134 84 C120 70 80 70 66 84 L62 120 Q56 126 50 120 Z') + L('M66 82 C82 72 118 72 134 82', 2.2) },
      fedora: { name: 'Федора', svg: (c) => S(c, 'M36 66 Q100 82 164 66 Q164 58 148 56 Q138 12 100 12 Q62 12 52 56 Q36 58 36 66 Z') + S(INK, 'M54 54 Q100 66 146 54 L146 60 Q100 72 54 60 Z') },
      cap: { name: 'Кепка', svg: (c) => S(c, 'M60 70 C58 26 142 26 140 70 Z') + S(c, 'M60 68 Q100 62 140 68 Q172 70 176 82 Q130 76 60 78 Z') },
      beanie: { name: 'Шапочка', svg: (c) => S(c, 'M60 70 C60 22 140 22 140 70 Z') + S(c, 'M56 66 H144 V78 H56 Z') + L('M70 66 V78 M84 66 V78 M98 66 V78 M112 66 V78 M126 66 V78', 1.8) }
    },
    acc: {
      none: { name: 'Нет', svg: () => '' },
      scarf: { name: 'Шарф', svg: (c) => S(c, 'M72 150 Q100 170 128 150 L132 166 Q100 186 68 166 Z') + S(c, 'M112 164 L128 164 L132 206 L116 210 Z') },
      mustache: { name: 'Усы', svg: (c) => `<path class="s" fill="${c}" d="M82 114 Q92 108 100 114 Q108 108 118 114 Q108 124 100 118 Q92 124 82 114 Z"/>` },
      phones: { name: 'Наушники', svg: (c) => `<path d="M64 96 C60 36 140 36 136 96" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/><rect x="54" y="88" width="14" height="26" rx="6" class="s" fill="${c}"/><rect x="132" y="88" width="14" height="26" rx="6" class="s" fill="${c}"/>` },
      bowtie: { name: 'Бабочка', svg: (c) => S(c, 'M100 176 L80 166 V186 Z') + S(c, 'M100 176 L120 166 V186 Z') + S(c, 'M96 172 H104 V182 H96 Z') }
    },
    badge: {
      none: { name: 'Нет', svg: () => '' },
      star: { name: 'Звезда', svg: (c) => S(c, 'M140 190 L144 200 L155 200 L146 207 L150 218 L140 211 L130 218 L134 207 L125 200 L136 200 Z') },
      stripes: { name: 'Нашивка', svg: (c) => S('#DADBD0', 'M124 196 H160 V224 H124 Z') + `<path d="M124 204 H160 M124 212 H160" stroke="${c}" stroke-width="4" fill="none"/>` },
      seal: { name: 'Печать', svg: (c) => `<circle class="s" cx="140" cy="206" r="14" fill="${c}"/><circle cx="140" cy="206" r="9" fill="none" stroke="#DADBD0" stroke-width="2"/>` }
    }
  };
  const DEFAULT = () => ({
    v: 1,
    layers: {
      body: { part: 'a', color: PAL.skin[1] },
      hairB: { part: 'none', color: PAL.hair[1] },
      clothes: { part: 'jacket', color: PAL.cloth[2] },
      head: { part: 'oval', color: PAL.skin[1] },
      eyes: { part: 'round', color: PAL.acc[2] },
      brows: { part: 'arch', color: PAL.hair[1] },
      nose: { part: 'line' },
      mouth: { part: 'smile' },
      hairF: { part: 'side', color: PAL.hair[1] },
      glasses: { part: 'none', color: PAL.acc[3] },
      hat: { part: 'none', color: PAL.cloth[1] },
      acc: { part: 'none', color: PAL.acc[0] },
      badge: { part: 'none', color: PAL.acc[0] }
    },
    tf: { clothes: { dy: -14 } } // сдвиги слоёв: { слой: { dx, dy, s, r, f } }
  });
  const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  function transformOf(layer, tf) {
    const t = (tf && tf[layer.id]) || {};
    const dx = num(t.dx, 0), dy = num(t.dy, 0), s = num(t.s, 1), r = num(t.r, 0), f = t.f ? -1 : 1;
    if (!dx && !dy && s === 1 && !r && f === 1) return '';
    return ` transform="translate(${layer.ax + dx} ${layer.ay + dy}) rotate(${r}) scale(${s * f} ${s}) translate(${-layer.ax} ${-layer.ay})"`;
  }
  // отрисовка аватара: строка SVG-разметки (группа в системе координат 200x240)
  function avatarSvg(cfg) {
    const out = [];
    for (const layer of LAYERS) {
      const sel = (cfg.layers || {})[layer.id];
      const part = P[layer.id][sel && sel.part] || Object.values(P[layer.id])[0];
      const color = (sel && sel.color) || (layer.pal ? PAL[layer.pal][0] : INK);
      out.push(`<g class="av-l av-${layer.id}"${transformOf(layer, cfg.tf)}>${part.svg(color)}</g>`);
    }
    return out.join('');
  }
  window.VPAvatar = { INK, PAL, LAYERS, PARTS: P, DEFAULT, avatarSvg };
})();
