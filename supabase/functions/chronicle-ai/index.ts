// Серверная функция: генерация текста летописи через OpenRouter.
// Доступна только админам. Ключ берётся из секрета OPENROUTER_API_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// openrouter/free сам выбирает доступную бесплатную модель
const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'openrouter/free';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Нужно войти в аккаунт' }, 401);
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return json({ error: 'Только для администратора' }, 403);

    const apiKey = Deno.env.get('vadimopedia-AI-KEY') ?? Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) return json({ error: 'Ключ OpenRouter не добавлен в секреты Supabase (vadimopedia-AI-KEY)' }, 500);

    const { currentContent = '', events = [] } = await req.json();
    const eventsText = (events as any[]).map((e) => {
      const date = e.event_date ? ` (дата: ${e.event_date})` : '';
      const city = e.city ? `, город: ${e.city}` : '';
      return `- Событие: "${e.event_text}"${date}${city}. Автор: ${e.author}`;
    }).join('\n');

    const prompt = `Ты — летописец, пишущий эпическую хронику в стиле древних сказаний.

Текущий текст летописи:
"""
${currentContent || 'Летопись пуста. Начни повествование.'}
"""

Новые события, которые нужно вплести в повествование:
${eventsText}

Правила:
1. Впиши новые события органично в существующий текст, соблюдая хронологию (используй дату события, если указана)
2. Сохраняй эпический стиль повествования
3. Выделяй события как цитаты-врезки в формате: [СОБЫТИЕ: текст события | АВТОР: имя автора | ДАТА: дата | ГОРОД: город]
4. Добавляй географический и временной контекст
5. Используй хронологические якоря ("спустя три дня", "в тот же год", "зимой того же года")
6. Не удаляй существующий текст, только добавляй и редактируй для связности

Верни только обновлённый текст летописи на русском языке, без комментариев.`;

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Vadimopedia Chronicle',
      },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 4000, temperature: 0.7 }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message ?? r.statusText }, 502);
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return json({ error: 'ИИ вернул пустой ответ' }, 502);
    return json({ text, model: data.model });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
