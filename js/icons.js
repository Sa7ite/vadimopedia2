// Свои SVG-иконки Вадимопедии: моно-линия, цвет берётся из текста (currentColor)
const P = {
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-5.5 7-5.5s6.2 1.7 7 5.5"/>',
  badge: '<rect x="5" y="3.5" width="14" height="17"/><path d="M9.5 3.5v3h5v-3"/><circle cx="12" cy="11.5" r="2.3"/><path d="M8.5 17c.6-1.6 1.9-2.4 3.5-2.4s2.9.8 3.5 2.4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M9.5 17h5"/>',
  star: '<path d="M12 3.8l2.4 5 5.4.7-4 3.7 1 5.4L12 16l-4.8 2.6 1-5.4-4-3.7 5.4-.7z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z"/><path d="M13.5 7l3.5 3.5M4 20h6"/>',
  check: '<path d="M4.5 12.5l4.5 4.5L19.5 6.5"/>',
  scroll: '<path d="M7 4h11v13a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2v-2h11v1.5"/><path d="M7 4a2 2 0 0 0-2 2v10M10 8h5M10 11.5h5"/>',
  alert: '<path d="M12 4L2.8 19.5h18.4z"/><path d="M12 10v4.5M12 16.8v.4"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-3"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  map: '<path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  evidence: '<path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5"/><circle cx="11" cy="14" r="3"/><path d="M13.2 16.2l3 3"/>',
  like: '<path d="M7.5 10.5v9.5H4v-9.5zM7.5 10.5l3.5-7c1.6 0 2.5 1 2.5 2.6V9h5.2c1 0 1.8 1 1.6 2l-1.4 7.2c-.2 1-1 1.8-2 1.8H7.5"/>',
  dislike: '<path d="M7.5 13.5V4H4v9.5zM7.5 13.5l3.5 7c1.6 0 2.5-1 2.5-2.6V15h5.2c1 0 1.8-1 1.6-2l-1.4-7.2c-.2-1-1-1.8-2-1.8H7.5"/>',
  witness: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/><path d="M12 2v2M5 4.5l1.3 1.5M19 4.5l-1.3 1.5"/>',
};
export function icon(name, label = '') {
  const a = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" ${a} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter">${P[name] || ''}</svg>`;
}
