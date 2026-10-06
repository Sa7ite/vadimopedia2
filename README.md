# Вадимопедия

Сайт про всех Вадимов мира: события, летопись (с ИИ), чат, профили и титулы.

- Фронтенд: HTML/CSS/JS (без сборки), хостинг — Vercel
- База и авторизация: Supabase
- ИИ для летописи: Supabase Edge Function `chronicle-ai` → OpenRouter (ключ хранится в секрете Supabase `vadimopedia-AI-KEY`)

Структура:
- `index.html`, `style.css` — разметка и стили
- `js/config.js` — подключение к Supabase (публичный anon-ключ, это нормально)
- `js/api.js` — работа с базой
- `js/auth.js` — вход и регистрация
- `js/ui.js` — отрисовка интерфейса
- `js/main.js` — точка входа и обработчики
- `supabase/functions/chronicle-ai` — серверная функция ИИ
