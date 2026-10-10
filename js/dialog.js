// Диалоги в стиле темы вместо системных окон confirm() и prompt().
// askConfirm(текст, настройки) → Promise<boolean>; askText(текст, настройки) → Promise<строка | null>.
const DANGER = /^(Удалить|Убрать|Отменить|Отозвать|Отказать)/;
let last = null;

function open({ title, message, ok, cancel, danger, field }) {
  return new Promise((resolve) => {
    last = document.activeElement;
    const root = document.createElement('div');
    root.className = 'vp-ask';
    root.innerHTML = `
      <div class="vp-ask-sheet" role="alertdialog" aria-modal="true" aria-labelledby="vp-ask-t" aria-describedby="vp-ask-m">
        <p class="vp-ask-doc" id="vp-ask-t"></p>
        <p class="vp-ask-msg" id="vp-ask-m"></p>
        ${field ? '<input class="vp-ask-field" type="text" autocomplete="off" aria-labelledby="vp-ask-m">' : ''}
        <div class="vp-ask-acts">
          <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-ask="ok"></button>
          <button type="button" class="btn-secondary" data-ask="no"></button>
        </div>
      </div>`;
    root.querySelector('#vp-ask-t').textContent = title;
    root.querySelector('#vp-ask-m').textContent = message;
    const okBtn = root.querySelector('[data-ask=ok]'), noBtn = root.querySelector('[data-ask=no]');
    okBtn.textContent = ok; noBtn.textContent = cancel;
    const input = root.querySelector('.vp-ask-field');
    if (input) input.value = field.value || '';
    const done = (val) => {
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      if (last && last.focus && document.contains(last)) last.focus();
      resolve(val);
    };
    const result = (yes) => (input ? (yes ? input.value : null) : yes);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(result(false)); }
      else if (e.key === 'Enter' && input && e.target === input) { e.preventDefault(); done(result(true)); }
      else if (e.key === 'Tab') {
        const items = [...root.querySelectorAll('input,button')];
        const i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', () => done(result(true)));
    noBtn.addEventListener('click', () => done(result(false)));
    root.addEventListener('mousedown', (e) => { if (e.target === root) done(result(false)); });
    document.body.appendChild(root);
    (input || (danger ? noBtn : okBtn)).focus();
    if (input) input.select();
  });
}

export function askConfirm(message, opts = {}) {
  const verb = String(message).match(DANGER);
  const danger = opts.danger ?? !!verb;
  return open({
    title: opts.title || 'Подтвердите действие',
    message: String(message),
    ok: opts.ok || (verb ? verb[1] : 'Подтвердить'),
    cancel: opts.cancel || 'Отмена',
    danger,
  });
}

export function askText(message, opts = {}) {
  return open({
    title: opts.title || 'Нужен ответ',
    message: String(message),
    ok: opts.ok || 'Готово',
    cancel: opts.cancel || 'Отмена',
    danger: false,
    field: { value: opts.value || '' },
  });
}
