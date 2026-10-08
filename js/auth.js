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
    showNotification(`Ошибка входа: ${error.message}`, 'error');
    return null;
  }

  showNotification('Добро пожаловать!', 'success');
  return data;
}

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