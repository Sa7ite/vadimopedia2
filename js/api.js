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
    .select('id, title_id, is_active, serial, revoked_at, granted_at, titles (id, title_name, title_type, description, icon, grants_authority)')
    .eq('user_id', userId);

  profile.user_titles = titlesError ? [] : (userTitles || []);
  return profile;
}

export async function getUserCount() {
  const { count, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).neq('id', '0c0c0c0c-1e70-4c0c-8c0c-000000000001').not('full_name', 'like', 'Агент%');
  if (error) return 0;
  return count || 0;
}

const EVENT_SELECT = '*, profiles (full_name, avatar_url), campaign:campaigns (id, name), participants:event_participants (person:persons (id, name))';

export async function getApprovedEvents(limit = 500) {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { console.error('Ошибка получения событий:', error); return []; }
  return data;
}

export async function getEventsByUser(userId, limit = 20) {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
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
    .select(EVENT_SELECT)
    .eq('is_approved', false)
    .order('created_at', { ascending: false });

  if (error) { console.error('Ошибка получения неподтверждённых событий:', error); return []; }
  return data;
}

export async function getLoreSignificantEventsNotInChronicle() {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('is_approved', true)
    .eq('is_lore_significant', true)
    .or('is_in_chronicle.is.null,is_in_chronicle.eq.false')
    .order('created_at', { ascending: true });

  if (error) { console.error('Ошибка получения значимых событий:', error); return []; }
  return data;
}

export async function getEventById(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle();
  if (error) { console.error('Ошибка получения события:', error); return null; }
  return data;
}

// ИСПРАВЛЕНИЕ 3: Добавлен параметр isAutoApprove
export async function addEvent(eventText, city, isLoreSignificant, eventDate, isAutoApprove = false, coords = {}, asChronicler = false, campaignId = null, personIds = []) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');

  const { data, error } = await supabase
    .from('events')
    .insert([{
      user_id: user.id,
      event_text: eventText,
      city: city,
      is_lore_significant: isLoreSignificant,
      is_approved: isAutoApprove, // ИСПРАВЛЕНИЕ: автоодобрение для админов
      event_date: eventDate || null,
      lat: coords.lat ?? null,
      lon: coords.lon ?? null,
      as_chronicler: asChronicler,
      campaign_id: campaignId || null
    }]).select('id').single();

  if (error) { console.error('Ошибка добавления события:', error); throw error; }
  if (personIds.length) await setEventParticipants(data.id, personIds);
  return data.id;
}

// Справочники персонажей и кампаний (T1.6)
export async function getPersons() {
  const { data, error } = await supabase.from('persons').select('id, name, aliases').order('sort_order').order('name');
  if (error) { console.error('Ошибка загрузки персонажей:', error); return []; }
  return data;
}

export async function getCampaigns() {
  const { data, error } = await supabase.from('campaigns').select('id, name, sort_order').order('sort_order').order('name');
  if (error) { console.error('Ошибка загрузки кампаний:', error); return []; }
  return data;
}

// Заменяет список участников события
export async function setEventParticipants(eventId, personIds) {
  const { error: delError } = await supabase.from('event_participants').delete().eq('event_id', eventId);
  if (delError) throw delError;
  if (!personIds.length) return;
  const { error } = await supabase.from('event_participants').insert(personIds.map(person_id => ({ event_id: eventId, person_id })));
  if (error) throw error;
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
  // одобрение через серверную функцию: она же переводит событие на Летописца, если автор просил
  const { error } = await supabase.rpc('approve_event', { p_event_id: Number(eventId) });
  if (error) throw error;
  return true;
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

// T2.3: летопись хранится главами и абзацами; черновик → публикация → откат (всё проверяет база)
export async function getChronicleEditor() {
  const { data, error } = await supabase.rpc('get_chronicle_editor');
  if (error) throw error;
  return data;
}

export async function saveChronicleDraft(content, note = null) {
  const { data, error } = await supabase.rpc('save_chronicle_draft', { p_content: content, p_note: note });
  if (error) throw error;
  return data;
}

export async function publishChronicle(editionId) {
  const { error } = await supabase.rpc('publish_chronicle', { p_edition: editionId });
  if (error) throw error;
  return getChronicle();
}

export async function rollbackChronicle() {
  const { error } = await supabase.rpc('rollback_chronicle');
  if (error) throw error;
  return getChronicle();
}

export async function generateChronicleText(currentContent, newEvents) {
  // ИИ вызывается через серверную функцию Supabase (ключ OpenRouter хранится на сервере)
  const events = newEvents.map(e => ({
    id: e.id,
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
  return {
    text: data.text, usedIds: data.usedIds || [], model: data.model, reviewFlags: data.review_flags || [], notes: data.notes || [],
    // T2.5: вставка в середину — окно «было / стало» и решение ИИ о смысле
    mode: data.mode || 'append', window: data.window || [], changesMeaning: !!data.changes_meaning, needsReview: !!data.needs_review,
    note: data.note || '', remaining: data.remaining || 0
  };
}

// ============================================
// РЕАКЦИИ И КОММЕНТАРИИ
// ============================================

export async function getEventReactions(eventId) {
  const { data, error } = await supabase
    .from('reactions')
    .select('type, user_id, profiles (full_name)')
    .eq('target_type', 'event')
    .eq('target_id', String(eventId));
  if (error) { console.error('Ошибка получения реакций:', error); return []; }
  return data;
}

// Поставить или снять реакцию. «Нравится» и «Не нравится» взаимоисключают друг друга (проверяет база)
export async function toggleReaction(targetId, type, targetType = 'event') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');
  const match = { target_type: targetType, target_id: String(targetId), user_id: user.id, type };
  const { data: existing } = await supabase.from('reactions').select('id').match(match).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
    if (error) throw error;
    return { action: 'removed' };
  }
  const { error } = await supabase.from('reactions').insert([match]);
  if (error) throw error;
  return { action: 'added' };
}

// Счётчики реакций всех событий: { [event_id]: { likes, dislikes, witnesses, score } }
export async function getReactionCounts() {
  const { data, error } = await supabase.from('event_reaction_counts').select('*');
  if (error) { console.error('Ошибка счётчиков реакций:', error); return {}; }
  return Object.fromEntries(data.map(r => [String(r.event_id), r]));
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
    .select(`event_id, events (${EVENT_SELECT})`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) { console.error('Ошибка получения закладок:', error); return []; }
  return data.map(b => b.events);
}

// ============================================
// T2.10: ДОСТИЖЕНИЯ (выдаёт база) и УДОСТОВЕРЕНИЯ
// ============================================
export async function getAchievements(userId) {
  const [defs, mine] = await Promise.all([
    supabase.from('achievement_defs').select('*').order('sort_order'),
    supabase.from('user_achievements').select('code, granted_at').eq('user_id', userId)
  ]);
  return { defs: defs.data || [], mine: Object.fromEntries((mine.data || []).map(a => [a.code, a.granted_at])) };
}
export const refreshAchievements = () => rpcOrThrow('refresh_achievements', { p_read: false });
export const revokeTitle = (userTitleId, revoke = true) => rpcOrThrow('revoke_title', { p_user_title: Number(userTitleId), p_revoke: revoke });

// ============================================
// T2.8: «СОБЫТИЕ ГОДА» — голосование по году события (правила и титул — в базе)
// ============================================
export async function getYearPolls() {
  const { data, error } = await supabase.from('year_polls').select('*').order('year', { ascending: false });
  if (error) { console.error('Ошибка получения голосований:', error); return []; }
  return data;
}
export const getYearPoll = (year) => rpcOrThrow('get_year_poll', { p_year: Number(year) });
export const voteEventOfYear = (eventId) => rpcOrThrow('vote_event_of_year', { p_event: Number(eventId) });
export const openYearPoll = (year) => rpcOrThrow('open_year_poll', { p_year: Number(year) });
export const closeYearPoll = (year, winner = null) => rpcOrThrow('close_year_poll', { p_year: Number(year), p_winner: winner == null ? null : Number(winner) });

// ============================================
// T1.7: настройки, справочники, журнал (пишет только админ — проверяет база)
// ============================================
export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('key, value, label, updated_at').order('key');
  if (error) throw error;
  return data;
}

export async function getSettingValue(key, fallback) {
  const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  return data ? data.value : fallback;
}

export async function updateSetting(key, value) {
  const { data, error } = await supabase.from('settings').update({ value }).eq('key', key).select();
  if (error) throw error;
  if (!data.length) throw new Error('Нет прав на изменение настроек');
}

export async function savePerson(person) {
  const row = { name: person.name, aliases: person.aliases || [] };
  const q = person.id
    ? supabase.from('persons').update(row).eq('id', person.id)
    : supabase.from('persons').insert([{ ...row, sort_order: 100 }]);
  const { error } = await q;
  if (error) throw error;
}

export async function deletePerson(id) {
  const { error } = await supabase.from('persons').delete().eq('id', id);
  if (error) throw error;
}

export async function saveCampaign(campaign) {
  const q = campaign.id
    ? supabase.from('campaigns').update({ name: campaign.name, sort_order: campaign.sort_order }).eq('id', campaign.id)
    : supabase.from('campaigns').insert([{ name: campaign.name, sort_order: campaign.sort_order ?? 100 }]);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteCampaign(id) {
  const { error } = await supabase.from('campaigns').delete().eq('id', id);
  if (error) throw error;
}

export async function getAuditLog(limit = 50) {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const ids = [...new Set(data.map(r => r.actor_id).filter(Boolean))];
  const names = {};
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    (profs || []).forEach(p => { names[p.id] = p.full_name; });
  }
  return data.map(r => ({ ...r, actor_name: names[r.actor_id] || 'система' }));
}

// ============================================
// T2.2: улики (видит только владелец; снимок делает база)
// ============================================
export async function addEvidence(targetType, targetId) {
  const { data, error } = await supabase.rpc('add_evidence', { p_target_type: targetType, p_target_id: String(targetId) });
  if (error) throw error;
  return data;
}

export async function removeEvidence(targetType, targetId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('evidence').delete().match({ owner_id: user.id, target_type: targetType, target_id: String(targetId) });
  if (error) throw error;
}

export async function hasEvidence(targetType, targetId) {
  const { data } = await supabase.from('evidence').select('id').match({ target_type: targetType, target_id: String(targetId) }).maybeSingle();
  return !!data;
}

export async function getMyEvidence() {
  const { data, error } = await supabase.from('evidence').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ============================================
// T2.7: ТЕОРИИ — нитка между двумя событиями, голоса «верю / не верю», канон (права и лимиты — в базе)
// ============================================
async function rpcOrThrow(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
export async function getTheories({ eventId = null, status = null } = {}) {
  let q = supabase.from('theory_list').select('*');
  if (eventId) q = q.or(`event_a.eq.${Number(eventId)},event_b.eq.${Number(eventId)}`);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(300);
  if (error) { console.error('Ошибка получения теорий:', error); return []; }
  return data.sort((a, b) => (b.status === 'canon') - (a.status === 'canon') || (b.believe - b.doubt) - (a.believe - a.doubt));
}
export const createTheory = (a, b, note) => rpcOrThrow('create_theory', { p_event_a: Number(a), p_event_b: Number(b), p_note: note });
export const voteTheory = (id, vote) => rpcOrThrow('vote_theory', { p_theory: id, p_vote: vote });
export const setTheoryStatus = (id, status) => rpcOrThrow('set_theory_status', { p_theory: id, p_status: status });

// ============================================
// T2.9: КОЛЛЕКЦИЯ ЦИТАТ (дословность и лимит 300 проверяет база)
// ============================================
export async function getQuotes(userId) {
  const { data, error } = await supabase.from('quotes').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
  if (error) { console.error('Ошибка получения цитат:', error); return []; }
  return data;
}
export const addQuote = (text, eventId, source) => rpcOrThrow('add_quote', { p_text: text, p_event: eventId == null ? null : Number(eventId), p_source: source });
export const shareQuoteToChat = (id) => rpcOrThrow('share_quote_to_chat', { p_quote: id });
export async function deleteQuote(id) {
  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ============================================
// T2.11: ФРАКЦИИ — состав и смена проверяет база (раз в faction.switch_days)
// ============================================
export async function getFactions() {
  const { data, error } = await supabase.from('faction_list').select('*').order('name');
  if (error) { console.error('Ошибка получения фракций:', error); return []; }
  return data;
}
export async function getUserFaction(userId) {
  const { data } = await supabase.from('faction_members').select('faction_id, joined_at, changed_at, factions(id, name, color, motto)').eq('user_id', userId).maybeSingle();
  return data;
}
export async function getFactionMembers(factionId) {
  const { data } = await supabase.from('faction_members').select('user_id, joined_at, profiles(full_name)').eq('faction_id', factionId).order('joined_at');
  return data || [];
}
export const joinFaction = (id) => rpcOrThrow('join_faction', { p_faction: Number(id) });
export const leaveFaction = () => rpcOrThrow('leave_faction', {});
export const saveFaction = (f) => rpcOrThrow('save_faction', { p_id: f.id == null ? null : Number(f.id), p_name: f.name, p_motto: f.motto || null, p_color: f.color || null });
export const deleteFaction = (id) => rpcOrThrow('delete_faction', { p_id: Number(id) });
