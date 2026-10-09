// ============================================
// МОДУЛЬ АВТОРИЗАЦИИ
// ============================================
import { supabase } from './config.js';
import { showNotification, updateUIForUser, updateUIForGuest } from './ui.js';

// Регистрация нового пользователя
export async function registerUser(email, password, fullName, city) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // после подтверждения почты пользователь вернётся на сайт
      emailRedirectTo: window.location.origin,
      data: {
        full_name: fullName,
        city: city,
        rules_accepted_at: new Date().toISOString()
      }
    }
  });

  if (error) {
    showNotification(`Ошибка регистрации: ${error.message}`, 'error');
    return null;
  }

  showNotification('Регистрация успешна! Проверьте почту для подтверждения.', 'success');
  return data;
}

// Вход пользователя
export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message || '')) {
      await resendConfirmation(email);
      return null;
    }
    showNotification(`Ошибка входа: ${error.message}`, 'error');
    return null;
  }

  showNotification('Добро пожаловать!', 'success');
  return data;
}

// Повторная отправка письма подтверждения (ссылка в письме действует 24 часа)
export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) {
    const wait = /security purposes|rate limit|after \d+ seconds/i.test(error.message || '');
    showNotification(wait
      ? 'Почта ещё не подтверждена. Новое письмо можно запросить через минуту — попробуйте войти чуть позже.'
      : 'Почта ещё не подтверждена, а новое письмо отправить не удалось. Попробуйте позже.', 'error');
    return false;
  }
  showNotification('Почта ещё не подтверждена. Мы отправили новое письмо — откройте ссылку из него в течение 24 часов.', 'info');
  return true;
}

// Ошибка из ссылки подтверждения: Supabase возвращает её в адресе (#error=...&error_code=otp_expired)
function checkConfirmLinkError() {
  const raw = (location.hash || '').replace(/^#/, '') || (location.search || '').replace(/^\?/, '');
  if (!/(^|&)error(_code)?=/.test(raw)) return;
  const q = new URLSearchParams(raw);
  const code = q.get('error_code') || q.get('error') || '';
  history.replaceState(null, '', location.pathname);
  const msg = code === 'otp_expired'
    ? 'Ссылка из письма устарела (она действует 24 часа). Войдите с почтой и паролем — мы сразу пришлём новое письмо.'
    : 'Не получилось подтвердить почту по ссылке. Войдите с почтой и паролем — мы пришлём новое письмо.';
  setTimeout(() => showNotification(msg, 'error'), 300);
}
checkConfirmLinkError();

// Выход пользователя
export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showNotification(`Ошибка выхода: ${error.message}`, 'error');
    return;
  }
  showNotification('До свидания!', 'info');
}

// Отслеживание изменения сессии (автоматически вызывается при входе/выходе)
export function onAuthStateChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// Получить текущего пользователя
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}