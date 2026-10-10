// Название события (events.title) — необязательное, до 80 знаков.
// Если названия нет, в тесных местах берём первые слова текста. Сам текст события не меняется.
export const hasTitle = (e) => !!String(e?.title || '').trim();

export function autoTitle(text, n = 48) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s.replace(/[.!?…]+$/, '');
  const cut = s.slice(0, n), i = cut.lastIndexOf(' ');
  return (i > n * 0.5 ? cut.slice(0, i) : cut).replace(/[\s,;:—-]+$/, '') + '…';
}

export const evTitle = (e, n = 48) => String(e?.title || '').trim() || autoTitle(e?.event_text, n);
