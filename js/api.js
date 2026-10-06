// ============================================
// МОДУЛЬ РАБОТЫ С БАЗОЙ ДАННЫХ
// ============================================
import { supabase } from './config.js';

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) { console.error('Ошибка получения профиля:', error); return null; }
  return data;
}

export async function getProfileWithTitles(userId) {
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (profileError) { console.error('Ошибка получения профиля:', profileError); return null; }

  const { data: userTitles, error: titlesError } = await supabase
    .from('user_titles')
    .select('title_id, is_active, titles (id, title_name, title_type, description, icon)')
    .eq('user_id', userId);

  profile.user_titles = titlesError ? [] : (userTitles || []);
  return profile;
}

export async function getUserCount() {
  const { count, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  if (error) return 0;
  return count || 0;
}

export async function getApprovedEvents(limit = 50) {
  const { data, error } = await supabase
    .from('events')
    .select('*, profiles (full_name, avatar_url)')
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { console.error('Ошибка получения событий:', error); return []; }
  return data;
}

export async function getEventsByUser(userId, limit = 20) {
  const { data, error } = await supabase
    .from('events')
    .select('*, profiles (full_name, avatar_url)')
    .eq('is_approved', true)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { console.error('Ошибка получения событий пользователя:', error); return []; }
  return data;
}

export async function getPendingEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*, profiles (full_name, avatar_url)')
    .eq('is_approved', false)
    .order('created_at', { ascending: false });

  if (error) { console.error('Ошибка получения неподтверждённых событий:', error); return []; }
  return data;
}

export async function getLoreSignificantEventsNotInChronicle() {
  const { data: chronicle, error: chronicleError } = await supabase
    .from('chronicle')
    .select('last_event_id')
    .single();

  if (chronicleError) return [];

  const lastEventId = chronicle.last_event_id || 0;

  const { data, error } = await supabase
    .from('events')
    .select('*, profiles (full_name, avatar_url)')
    .eq('is_approved', true)
    .eq('is_lore_significant', true)
    .gt('id', lastEventId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Ошибка получения значимых событий:', error); return []; }
  return data;
}

// ИСПРАВЛЕНИЕ 3: Добавлен параметр isAutoApprove
export async function addEvent(eventText, city, isLoreSignificant, eventDate, isAutoApprove = false) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');

  const { error } = await supabase
    .from('events')
    .insert([{
      user_id: user.id,
      event_text: eventText,
      city: city,
      is_lore_significant: isLoreSignificant,
      is_approved: isAutoApprove, // ИСПРАВЛЕНИЕ: автоодобрение для админов
      event_date: eventDate || null
    }]);

  if (error) { console.error('Ошибка добавления события:', error); throw error; }
  return true;
}

// ИСПРАВЛЕНИЕ 1 и 2: Новая функция редактирования события
export async function updateEvent(eventId, updates) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');

  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile && (profile.role === 'admin' || profile.role === 'moderator');

  // ИСПРАВЛЕНИЕ 2: Админ может редактировать только значимые события
  if (isAdmin && !event.is_lore_significant) {
    throw new Error('Администратор может редактировать только значимые события');
  }

  // Обычный пользователь может редактировать только свои незначимые события
  if (!isAdmin) {
    if (event.user_id !== user.id) {
      throw new Error('У вас нет прав на редактирование этого события');
    }
    if (event.is_lore_significant) {
      throw new Error('Значимые события может редактировать только администратор');
    }
  }

  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', eventId)
    .select();

  if (error) throw error;
  return data[0];
}

export async function approveEvent(eventId) {
  const { data, error } = await supabase.from('events').update({ is_approved: true }).eq('id', eventId).select();
  if (error) throw error;
  return data;
}

export async function rejectEvent(eventId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// ============================================
// ТИТУЛЫ
// ============================================

export async function getAllTitles() {
  const { data, error } = await supabase.from('titles').select('*').order('title_type', { ascending: true }).order('title_name', { ascending: true });
  if (error) { console.error('Ошибка получения титулов:', error); return []; }
  return data;
}

export async function getUserTitles(userId) {
  const { data, error } = await supabase.from('user_titles').select('title_id, is_active, titles (id, title_name, title_type, description, icon)').eq('user_id', userId);
  if (error) { console.error('Ошибка получения титулов пользователя:', error); return []; }
  return data;
}

export async function addUserTitle(userId, titleId) {
  const { error } = await supabase.from('user_titles').insert([{ user_id: userId, title_id: titleId, is_active: true }]);
  if (error) throw error;
}

export async function toggleUserTitle(userId, titleId, isActive) {
  const { error } = await supabase.from('user_titles').update({ is_active: isActive }).eq('user_id', userId).eq('title_id', titleId);
  if (error) throw error;
}

export async function removeUserTitle(userId, titleId) {
  const { error } = await supabase.from('user_titles').delete().eq('user_id', userId).eq('title_id', titleId);
  if (error) throw error;
}

export async function createTitle(titleName, titleType, description, icon) {
  const { data, error } = await supabase.from('titles').insert([{ title_name: titleName, title_type: titleType, description: description, icon: icon }]).select();
  if (error) throw error;
  return data[0];
}

export async function deleteTitle(titleId) {
  const { error } = await supabase.from('titles').delete().eq('id', titleId);
  if (error) throw error;
}

export async function requestTitle(titleId, reason) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');
  const { error } = await supabase.from('title_requests').insert([{ user_id: user.id, title_id: titleId, reason: reason }]);
  if (error) throw error;
}

export async function getTitleRequests(userId, isAdmin) {
  let query = supabase.from('title_requests').select(`*, profiles!title_requests_user_id_fkey (full_name), titles (title_name, icon, title_type)`).order('created_at', { ascending: false });
  if (!isAdmin) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) { console.error('Ошибка получения запросов:', error); return []; }
  return data;
}

export async function approveTitleRequest(requestId, adminId) {
  const { data: request, error: fetchError } = await supabase.from('title_requests').select('*').eq('id', requestId).single();
  if (fetchError) throw fetchError;

  const { error: insertError } = await supabase.from('user_titles').insert([{ user_id: request.user_id, title_id: request.title_id, is_active: true }]);
  if (insertError) throw insertError;

  const { error: updateError } = await supabase.from('title_requests').update({ status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq('id', requestId);
  if (updateError) throw updateError;
}

export async function rejectTitleRequest(requestId, adminId) {
  const { error } = await supabase.from('title_requests').update({ status: 'rejected', reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq('id', requestId);
  if (error) throw error;
}

// ============================================
// ЧАТ
// ============================================

export async function getChatMessages(limit = 100) {
  const { data, error } = await supabase.from('chat_messages').select('*, profiles (full_name, avatar_url, role)').order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('Ошибка получения сообщений:', error); return []; }

  const messagesWithTitles = await Promise.all(
    (data || []).map(async (msg) => {
      const { data: titles } = await supabase.from('user_titles').select('titles (title_name, icon)').eq('user_id', msg.user_id).eq('is_active', true);
      return { ...msg, user_titles: titles || [] };
    })
  );

  return messagesWithTitles.reverse();
}

export async function sendChatMessage(messageText) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');
  const { error } = await supabase.from('chat_messages').insert([{ user_id: user.id, message_text: messageText }]);
  if (error) throw error;
  return true;
}

export async function softDeleteChatMessage(messageId, reason) {
  const { data, error } = await supabase.from('chat_messages').update({ is_deleted: true, delete_reason: reason || null, deleted_at: new Date().toISOString() }).eq('id', messageId).select();
  if (error) throw error;
  return data;
}

export async function hardDeleteChatMessage(messageId) {
  const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
  if (error) throw error;
}

export function subscribeToChatMessages(onNewMessage) {
  return supabase.channel('chat-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => onNewMessage(payload.new, 'INSERT'))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => onNewMessage(payload.new, 'UPDATE'))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => onNewMessage(payload.old, 'DELETE'))
    .subscribe();
}

export function unsubscribeFromChatMessages(channel) {
  if (channel) supabase.removeChannel(channel);
}

// ============================================
// PRESENCE
// ============================================

export function connectToPresence(userId, onPresenceChange) {
  const presenceChannel = supabase.channel('online-users', { config: { presence: { key: userId } } });
  presenceChannel
    .on('presence', { event: 'sync' }, () => { onPresenceChange(Object.keys(presenceChannel.presenceState()).length); })
    .on('presence', { event: 'join' }, () => { onPresenceChange(Object.keys(presenceChannel.presenceState()).length); })
    .on('presence', { event: 'leave' }, () => { onPresenceChange(Object.keys(presenceChannel.presenceState()).length); })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: userId });
    });
  return presenceChannel;
}

export function disconnectFromPresence(channel) {
  if (channel) supabase.removeChannel(channel);
}

// ============================================
// АВАТАР
// ============================================

export async function uploadAvatar(file, userId) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Файл слишком большой. Максимум 2 МБ');
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) throw new Error('Недопустимый формат. Используйте JPG, PNG или WebP');

  const compressedFile = await compressImage(file);
  const fileExt = compressedFile.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage.from('avatars').upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });
  if (error) throw new Error(`Ошибка загрузки: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
  return publicUrl;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxSize = 400;
        let width = img.width, height = img.height;
        if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
        else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
        canvas.width = width; canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          else reject(new Error('Ошибка сжатия изображения'));
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select();
  if (error) throw new Error(`Ошибка обновления профиля: ${error.message}`);
  return data[0];
}

// ============================================
// ЛЕТОПИСЬ
// ============================================

export async function getChronicle() {
  const { data, error } = await supabase.from('chronicle').select('*').single();
  if (error) { console.error('Ошибка получения летописи:', error); return null; }
  return data;
}

export async function getChronicleVersions() {
  const { data, error } = await supabase
    .from('chronicle_versions')
    .select('*')
    .order('version', { ascending: false })
    .limit(10);

  if (error) { console.error('Ошибка получения версий:', error); return []; }
  return data;
}

export async function updateChronicle(content, lastEventId) {
  const { data: current } = await supabase.from('chronicle').select('*').single();
  if (current) {
    await supabase.from('chronicle_versions').insert([{
      chronicle_id: current.id,
      content: current.content,
      version: current.version
    }]);
  }

  const { data, error } = await supabase
    .from('chronicle')
    .update({
      content: content,
      last_event_id: lastEventId,
      version: (current?.version || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', current?.id || 1)
    .select();

  if (error) throw error;
  return data[0];
}

export async function rollbackChronicle() {
  const { data: versions } = await supabase
    .from('chronicle_versions')
    .select('*')
    .order('version', { ascending: false })
    .limit(1);

  if (!versions || versions.length === 0) throw new Error('Нет предыдущих версий');

  const lastVersion = versions[0];

  await supabase.from('chronicle').update({
    content: lastVersion.content,
    version: lastVersion.version,
    updated_at: new Date().toISOString()
  }).eq('id', lastVersion.chronicle_id);

  await supabase.from('chronicle_versions').delete().eq('id', lastVersion.id);
}

export async function generateChronicleText(currentContent, newEvents) {
  // ИИ вызывается через серверную функцию Supabase (ключ OpenRouter хранится на сервере)
  const events = newEvents.map(e => ({
    event_text: e.event_text,
    event_date: e.event_date || null,
    city: e.city || null,
    author: e.profiles?.full_name || 'Неизвестно'
  }));
  const { data, error } = await supabase.functions.invoke('chronicle-ai', {
    body: { currentContent: currentContent || '', events }
  });
  if (error) {
    let msg = error.message;
    try { const body = await error.context.json(); if (body?.error) msg = body.error; } catch (_) {}
    throw new Error(`Ошибка ИИ: ${msg}`);
  }
  if (!data?.text) throw new Error('ИИ вернул пустой ответ');
  return data.text;
}

// ============================================
// РЕАКЦИИ И КОММЕНТАРИИ
// ============================================

export async function getEventReactions(eventId) {
  const { data, error } = await supabase
    .from('event_reactions')
    .select('reaction_type, user_id, profiles (full_name)')
    .eq('event_id', eventId);

  if (error) { console.error('Ошибка получения реакций:', error); return []; }
  return data;
}

export async function toggleReaction(eventId, reactionType) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');

  const { data: existing } = await supabase
    .from('event_reactions')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .eq('reaction_type', reactionType)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('event_reactions')
      .delete()
      .eq('id', existing.id);
    if (error) throw error;
    return { action: 'removed' };
  } else {
    await supabase
      .from('event_reactions')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', user.id);

    const { error } = await supabase
      .from('event_reactions')
      .insert([{ event_id: eventId, user_id: user.id, reaction_type: reactionType }]);
    if (error) throw error;
    return { action: 'added' };
  }
}

export async function getEventComments(eventId) {
  const { data, error } = await supabase
    .from('event_comments')
    .select('*, profiles (full_name, avatar_url)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Ошибка получения комментариев:', error); return []; }
  return data;
}

export async function addEventComment(eventId, commentText) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');

  const { data, error } = await supabase
    .from('event_comments')
    .insert([{ event_id: eventId, user_id: user.id, comment_text: commentText }])
    .select();

  if (error) throw error;
  return data[0];
}

export async function deleteEventComment(commentId) {
  const { error } = await supabase.from('event_comments').delete().eq('id', commentId);
  if (error) throw error;
}

// ============================================
// ЗАКЛАДКИ
// ============================================

export async function toggleBookmark(eventId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');

  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    const { error } = await supabase.from('bookmarks').delete().eq('id', existing.id);
    if (error) throw error;
    return { action: 'removed' };
  } else {
    const { error } = await supabase.from('bookmarks').insert([{ event_id: eventId, user_id: user.id }]);
    if (error) throw error;
    return { action: 'added' };
  }
}

export async function getBookmarks() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('bookmarks')
    .select('event_id, events (*, profiles (full_name, avatar_url))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) { console.error('Ошибка получения закладок:', error); return []; }
  return data.map(b => b.events);
}

// ============================================
// ДОСТИЖЕНИЯ
// ============================================

export async function checkAndAwardAchievements(userId) {
  const achievements = [];

  const { count: commentCount } = await supabase
    .from('event_comments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (commentCount >= 50) {
    const { data: existing } = await supabase
      .from('achievements')
      .select('id')
      .eq('user_id', userId)
      .eq('achievement_type', 'comment_50')
      .single();

    if (!existing) {
      await supabase.from('achievements').insert([{ user_id: userId, achievement_type: 'comment_50' }]);
      achievements.push('Комментатор (50 комментариев)');
    }
  }

  const { count: reactionCount } = await supabase
    .from('event_reactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (reactionCount >= 100) {
    const { data: existing } = await supabase
      .from('achievements')
      .select('id')
      .eq('user_id', userId)
      .eq('achievement_type', 'reaction_100')
      .single();

    if (!existing) {
      await supabase.from('achievements').insert([{ user_id: userId, achievement_type: 'reaction_100' }]);
      achievements.push('Реакционер (100 реакций)');
    }
  }

  return achievements;
}

// ============================================
// ГОЛОСОВАНИЕ "СОБЫТИЕ ГОДА"
// ============================================

export async function voteForEventOfYear(eventId, year) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');

  const { error } = await supabase
    .from('event_year_votes')
    .upsert([{ event_id: eventId, user_id: user.id, year: year }]);

  if (error) throw error;
}

export async function getEventOfYearVotes(year) {
  const { data, error } = await supabase
    .from('event_year_votes')
    .select('event_id, count(*)')
    .eq('year', year)
    .group('event_id')
    .order('count', { ascending: false });

  if (error) { console.error('Ошибка получения голосов:', error); return []; }
  return data;
}