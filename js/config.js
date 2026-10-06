// ============================================
// КОНФИГУРАЦИЯ SUPABASE
// ============================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://dgfsxsargqypvwiifyrp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnZnN4c2FyZ3F5cHZ3aWlmeXJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTY5MzUsImV4cCI6MjEwNjE5MjkzNX0.r5Z710frGi3u-oRYBJGFUznAmQdvKh3_K93l9W7aWlY';

export const supabase = createClient(supabaseUrl, supabaseKey);

// ИИ (OpenRouter) вызывается через серверную функцию Supabase `chronicle-ai`.
// Ключ OpenRouter хранится в секретах Supabase, а НЕ в коде сайта.
