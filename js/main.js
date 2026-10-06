// ============================================
// ГЛАВНЫЙ МОДУЛЬ (ТОЧКА ВХОДА)
// ============================================
import { supabase } from './config.js';
import { 
  getProfileWithTitles, getUserCount, getApprovedEvents, getPendingEvents,
  addEvent, updateEvent, uploadAvatar, updateProfile, approveEvent, rejectEvent, deleteEvent,
  getChatMessages, sendChatMessage, softDeleteChatMessage, hardDeleteChatMessage,
  subscribeToChatMessages, unsubscribeFromChatMessages,
  connectToPresence, disconnectFromPresence,
  getTitleRequests, approveTitleRequest, rejectTitleRequest,
  getChronicle, updateChronicle, generateChronicleText, rollbackChronicle,
  getLoreSignificantEventsNotInChronicle,
  toggleReaction, addEventComment, deleteEventComment,
  toggleBookmark, getBookmarks,
  getEventsByUser
} from './api.js';
import { registerUser, loginUser, logoutUser, onAuthStateChange } from './auth.js';
import {
  showSection, showNotification, updateUIForUser, updateUIForGuest,
  renderEvents, renderPendingEvents, renderProfile, renderEditProfileForm,
  renderChatMessages, showDeleteReasonModal, showUserProfile,
  renderChronicle, renderChronicleEditor, renderTimeline, renderMap, renderBookmarks,
  showEventModal, showEditEventModal,
  openModal, closeModal, setupModalCloseHandlers
} from './ui.js';

let currentProfile = null;
let chatChannel = null;
let chatMessages = [];
let chatRefreshInterval = null;
let presenceChannel = null;
let chronicleData = null;
let chronicleViewMode = 'read';

async function initApp() {
  console.log('Вадимопедия загружается...');
  setupModalCloseHandlers();
  setupNavigation();
  setupAuthButtons();
  setupForms();
  await loadUserCount();

  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    currentProfile = await getProfileWithTitles(session.user.id);
    window.handleSaveProfile = handleSaveProfile;
    updateUIForUser(session.user, currentProfile, () => renderEditProfileForm(currentProfile, handleSaveProfile));
    await loadEvents();
    if (currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator')) {
      await loadPendingEvents();
      setupAdminTitleRequests();
    }
    presenceChannel = connectToPresence(session.user.id, updateOnlineCount);
  } else {
    updateUIForGuest();
    await loadEvents();
    updateOnlineCount(0);
  }

  onAuthStateChange(async (event, session) => {
    if (session) {
      currentProfile = await getProfileWithTitles(session.user.id);
      window.handleSaveProfile = handleSaveProfile;
      updateUIForUser(session.user, currentProfile, () => renderEditProfileForm(currentProfile, handleSaveProfile));
      await loadEvents();
      if (currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator')) {
        await loadPendingEvents();
        setupAdminTitleRequests();
      }
      if (!presenceChannel) presenceChannel = connectToPresence(session.user.id, updateOnlineCount);
    } else {
      currentProfile = null;
      updateUIForGuest();
      await loadEvents();
      updateOnlineCount(0);
      if (chatChannel) { unsubscribeFromChatMessages(chatChannel); chatChannel = null; }
      if (chatRefreshInterval) { clearInterval(chatRefreshInterval); chatRefreshInterval = null; }
      if (presenceChannel) { disconnectFromPresence(presenceChannel); presenceChannel = null; }
    }
  });

  console.log('Приложение инициализировано');
}

async function loadUserCount() {
  const count = await getUserCount();
  const el = document.getElementById('stat-users');
  if (el) el.textContent = count;
}

function updateOnlineCount(count) {
  const el = document.getElementById('stat-online');
  if (el) el.textContent = count;
}

function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      if (section) showSection(section);
      if (section === 'chat' && currentProfile) setupChat();
      if (section === 'chronicle') setupChronicle();
    });
  });
  const btnGoEvents = document.getElementById('btn-go-events');
  if (btnGoEvents) btnGoEvents.addEventListener('click', () => showSection('events'));
}

function setupAuthButtons() {
  const btnShowRegister = document.getElementById('btn-show-register');
  if (btnShowRegister) btnShowRegister.addEventListener('click', () => openModal('modal-register'));
  const btnShowLogin = document.getElementById('btn-show-login');
  if (btnShowLogin) btnShowLogin.addEventListener('click', () => openModal('modal-login'));
}

// ИСПРАВЛЕНИЕ 5: Валидация города
function isValidCity(cityStr) {
  if (!cityStr || !cityStr.trim()) return true;
  const regex = /^[a-zA-Zа-яА-ЯёЁ\s\-]{2,}$/;
  return regex.test(cityStr.trim());
}

// Валидация даты
function isValidDate(dateStr) {
  if (!dateStr || !dateStr.trim()) return true;
  
  const str = dateStr.trim();
  
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{1,})$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1]);
    const month = parseInt(dotMatch[2]);
    const year = parseInt(dotMatch[3]);
    
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > daysInMonth[month - 1]) return false;
    
    if (month === 2 && day === 29) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (!isLeap) return false;
    }
    
    return true;
  }
  
  const dashMatch = str.match(/^(\d{1,})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    const year = parseInt(dashMatch[1]);
    const month = parseInt(dashMatch[2]);
    const day = parseInt(dashMatch[3]);
    
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > daysInMonth[month - 1]) return false;
    
    if (month === 2 && day === 29) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (!isLeap) return false;
    }
    
    return true;
  }
  
  const monthNames = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  const textMatch = str.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{1,})$/i);
  if (textMatch) {
    const day = parseInt(textMatch[1]);
    const monthText = textMatch[2].toLowerCase();
    const year = parseInt(textMatch[3]);
    
    const monthIndex = monthNames.findIndex(m => monthText.startsWith(m));
    if (monthIndex === -1) return false;
    
    const month = monthIndex + 1;
    if (day < 1 || day > 31) return false;
    
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > daysInMonth[month - 1]) return false;
    
    if (month === 2 && day === 29) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (!isLeap) return false;
    }
    
    return true;
  }
  
  const monthYearMatch = str.match(/^([а-яё]+)\s+(\d{1,})$/i);
  if (monthYearMatch) {
    const monthText = monthYearMatch[1].toLowerCase();
    const monthIndex = monthNames.findIndex(m => monthText.startsWith(m));
    if (monthIndex === -1) return false;
    return true;
  }
  
  const yearMatch = str.match(/^\d{1,}$/);
  if (yearMatch) return true;
  
  return false;
}

function setupForms() {
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      await loginUser(document.getElementById('login-email').value, document.getElementById('login-password').value);
      closeModal('modal-login');
    });
  }
  
  const formRegister = document.getElementById('form-register');
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      await registerUser(
        document.getElementById('register-email').value,
        document.getElementById('register-password').value,
        document.getElementById('register-name').value,
        document.getElementById('register-city').value
      );
      closeModal('modal-register');
    });
  }
  
  const formAddEvent = document.getElementById('form-add-event');
  if (formAddEvent) {
    formAddEvent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventText = document.getElementById('event-text').value.trim();
      const city = document.getElementById('event-city').value.trim();
      const isLore = document.getElementById('event-is-lore').checked;
      const eventDateEl = document.getElementById('event-date');
      const eventDate = eventDateEl ? eventDateEl.value.trim() : null;

      if (!eventText) {
        showNotification('Введите текст события', 'error');
        return;
      }
      if (eventDate && !isValidDate(eventDate)) {
        showNotification('Неверная дата. Примеры: "15.03.2024", "15 марта 2024", "2024"', 'error');
        return;
      }
      // ИСПРАВЛЕНИЕ 5: Валидация города
      if (city && !isValidCity(city)) {
        showNotification('Неверный формат города. Используйте только буквы (например: "Москва", "Нью-Йорк")', 'error');
        return;
      }

      // ИСПРАВЛЕНИЕ 3: Автоодобрение для админов
      const isAutoApprove = currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator');

      try {
        await addEvent(eventText, city, isLore, eventDate, isAutoApprove);
        if (isAutoApprove) {
          showNotification('✅ Событие добавлено и опубликовано!', 'success');
        } else {
          showNotification('📖 Событие добавлено! Ожидает модерации.', 'success');
        }
        formAddEvent.reset();
        await loadEvents();
        if (currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator')) await loadPendingEvents();
      } catch (error) { 
        showNotification(`Ошибка: ${error.message}`, 'error'); 
      }
    });
  }
  
  const formChat = document.getElementById('form-chat-message');
  if (formChat) {
    formChat.addEventListener('submit', async (e) => {
      e.preventDefault();
      const messageText = document.getElementById('chat-message-text').value.trim();
      if (!messageText) return;
      try {
        await sendChatMessage(messageText);
        document.getElementById('chat-message-text').value = '';
      } catch (error) { 
        showNotification(`Ошибка отправки: ${error.message}`, 'error'); 
      }
    });
  }
}

async function handleSaveProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { showNotification('Вы не авторизованы', 'error'); return; }
  
  const name = document.getElementById('edit-name').value;
  const location = document.getElementById('edit-location').value;
  const bio = document.getElementById('edit-bio').value;
  const avatarInput = document.getElementById('avatar-input');
  const avatarFile = avatarInput.files[0];
  
  showNotification('Сохранение...', 'info');
  
  try {
    let avatarUrl = null;
    if (avatarFile) avatarUrl = await uploadAvatar(avatarFile, user.id);
    
    const updates = { full_name: name, city: location, bio: bio };
    if (avatarUrl) updates.avatar_url = avatarUrl;
    
    await updateProfile(user.id, updates);
    showNotification('Профиль обновлен!', 'success');
    
    currentProfile = await getProfileWithTitles(user.id);
    renderProfile(currentProfile, () => renderEditProfileForm(currentProfile, handleSaveProfile));
  } catch (error) { 
    showNotification(`Ошибка: ${error.message}`, 'error'); 
  }
}

// ИСПРАВЛЕНИЕ 1: Передаём currentUserId в renderEvents
async function loadEvents() {
  const events = await getApprovedEvents();
  const onAuthorClick = currentProfile ? handleAuthorClick : null;
  const onEditEvent = currentProfile ? handleEditEvent : null;
  renderEvents(events, currentProfile?.role, currentProfile?.id, handleDeleteEvent, onAuthorClick, onEditEvent);
  const statEvents = document.getElementById('stat-events');
  if (statEvents) statEvents.textContent = events.length;
}

async function loadPendingEvents() {
  const pendingEvents = await getPendingEvents();
  renderPendingEvents(pendingEvents, handleApproveEvent, handleRejectEvent);
}

async function handleApproveEvent(eventId) {
  try { 
    await approveEvent(eventId); 
    showNotification('Событие одобрено!', 'success'); 
    await loadEvents(); 
    await loadPendingEvents(); 
  } catch (error) { 
    showNotification(`Ошибка: ${error.message}`, 'error'); 
  }
}

async function handleRejectEvent(eventId) {
  if (!confirm('Вы уверены, что хотите отклонить это событие?')) return;
  try { 
    await rejectEvent(eventId); 
    showNotification('Событие отклонено', 'info'); 
    await loadPendingEvents(); 
  } catch (error) { 
    showNotification(`Ошибка: ${error.message}`, 'error'); 
  }
}

async function handleDeleteEvent(eventId) {
  if (!confirm('Вы уверены, что хотите удалить это событие?')) return;
  try { 
    await deleteEvent(eventId); 
    showNotification('Событие удалено', 'success'); 
    await loadEvents(); 
    await loadPendingEvents(); 
  } catch (error) { 
    showNotification(`Ошибка: ${error.message}`, 'error'); 
  }
}

// ИСПРАВЛЕНИЕ 1: Новая функция редактирования
function handleEditEvent(event) {
  showEditEventModal(event, async (eventId, updates) => {
    await updateEvent(eventId, updates);
    await loadEvents();
  }, isValidDate, isValidCity);
}

async function handleAuthorClick(userId) {
  if (!currentProfile) return;
  if (userId === currentProfile.id) return;
  await showUserProfile(userId, currentProfile.id);
}

// ============================================
// ЛЕТОПИСЬ
// ============================================

async function setupChronicle() {
  if (!currentProfile) {
    showNotification('Войдите, чтобы читать летопись', 'error');
    return;
  }

  if (!chronicleData) {
    chronicleData = await getChronicle();
  }

  if (chronicleViewMode === 'read') {
    renderChronicle(chronicleData, handleShowEventModal);
  }

  const btnRead = document.getElementById('btn-read-chronicle');
  const btnTimeline = document.getElementById('btn-timeline-chronicle');
  const btnMap = document.getElementById('btn-map-chronicle');
  const btnBookmarks = document.getElementById('btn-bookmarks-chronicle');
  const btnEdit = document.getElementById('btn-edit-chronicle');

  if (btnRead) {
    btnRead.onclick = async () => {
      chronicleViewMode = 'read';
      chronicleData = await getChronicle();
      renderChronicle(chronicleData, handleShowEventModal);
    };
  }

  if (btnTimeline) {
    btnTimeline.onclick = async () => {
      chronicleViewMode = 'timeline';
      const events = await getApprovedEvents(200);
      const eventsWithDate = events.filter(e => e.event_date || e.is_lore_significant);
      renderTimeline(eventsWithDate, handleShowEventModal);
    };
  }

  if (btnMap) {
    btnMap.onclick = async () => {
      chronicleViewMode = 'map';
      const events = await getApprovedEvents(200);
      renderMap(events, handleShowEventModal);
    };
  }

  if (btnBookmarks) {
    btnBookmarks.onclick = async () => {
      chronicleViewMode = 'bookmarks';
      const bookmarks = await getBookmarks();
      renderBookmarks(bookmarks, handleShowEventModal);
    };
  }

  if (btnEdit && currentProfile.role === 'admin') {
    btnEdit.onclick = async () => {
      chronicleViewMode = 'edit';
      await loadChronicleEditor();
    };
  }
}

async function loadChronicleEditor() {
  const pendingEvents = await getLoreSignificantEventsNotInChronicle();
  renderChronicleEditor(
    chronicleData,
    pendingEvents,
    handleSaveChronicle,
    handleGenerateChronicle,
    handleRollbackChronicle
  );
}

async function handleSaveChronicle(content) {
  try {
    showNotification('Сохранение...', 'info');
    chronicleData = await updateChronicle(content, chronicleData?.last_event_id);
    showNotification('Летопись сохранена!', 'success');
    chronicleViewMode = 'read';
    renderChronicle(chronicleData, handleShowEventModal);
  } catch (error) {
    showNotification(`Ошибка сохранения: ${error.message}`, 'error');
  }
}

async function handleGenerateChronicle() {
  try {
    showNotification('Генерация текста... Это может занять до 30 секунд.', 'info');
    const pendingEvents = await getLoreSignificantEventsNotInChronicle();
    if (pendingEvents.length === 0) {
      showNotification('Нет новых значимых событий для добавления', 'error');
      return;
    }
    const newText = await generateChronicleText(chronicleData?.content || '', pendingEvents);
    const textarea = document.getElementById('chronicle-textarea');
    if (textarea) {
      textarea.value = newText;
      const preview = document.getElementById('chronicle-preview');
      if (preview) {
        const paragraphs = newText.split('\n\n').filter(p => p.trim());
        preview.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
      }
    }
    showNotification('Текст сгенерирован! Проверьте и сохраните.', 'success');
  } catch (error) {
    showNotification(`Ошибка генерации: ${error.message}`, 'error');
  }
}

async function handleRollbackChronicle() {
  try {
    showNotification('Откат...', 'info');
    chronicleData = await rollbackChronicle();
    showNotification('Откат выполнен!', 'success');
    chronicleViewMode = 'read';
    renderChronicle(chronicleData, handleShowEventModal);
  } catch (error) {
    showNotification(`Ошибка отката: ${error.message}`, 'error');
  }
}

async function handleShowEventModal(event) {
  if (!currentProfile) return;
  await showEventModal(
    event,
    currentProfile.id,
    handleToggleReaction,
    handleAddComment,
    handleToggleBookmark,
    handleDeleteComment
  );
}

async function handleToggleReaction(eventId, reactionType) {
  return await toggleReaction(eventId, reactionType);
}

async function handleAddComment(eventId, commentText) {
  const comment = await addEventComment(eventId, commentText);
  if (currentProfile) {
    const { checkAndAwardAchievements } = await import('./api.js');
    const newAchievements = await checkAndAwardAchievements(currentProfile.id);
    if (newAchievements.length > 0) {
      showNotification(`🏆 Достижение: ${newAchievements.join(', ')}`, 'success');
    }
  }
  return comment;
}

async function handleToggleBookmark(eventId) {
  return await toggleBookmark(eventId);
}

async function handleDeleteComment(commentId) {
  await deleteEventComment(commentId);
}

// ============================================
// АДМИН: ЗАПРОСЫ НА ТИТУЛЫ
// ============================================

async function setupAdminTitleRequests() {
  if (!currentProfile || currentProfile.role !== 'admin') return;
  const adminContent = document.getElementById('admin-content');
  if (!adminContent) return;
  
  const requests = await getTitleRequests(currentProfile.id, true);
  const pendingRequests = requests.filter(r => r.status === 'pending');
  
  const requestsSection = document.createElement('div');
  requestsSection.className = 'admin-section';
  requestsSection.innerHTML = `
    <h3>Запросы на титулы (${pendingRequests.length})</h3>
    <div id="title-requests-list">
      ${pendingRequests.length === 0 ? '<p>Нет запросов</p>' : pendingRequests.map(req => `
        <div class="title-request-item" data-request-id="${req.id}">
          <div class="request-header">
            <strong>${req.profiles?.full_name || 'Неизвестно'}</strong>
            <span>запросил титул: ${req.titles?.title_name || ''}</span>
          </div>
          <p class="request-reason">Причина: ${req.reason}</p>
          <div class="request-actions">
            <button class="btn-approve-request" data-id="${req.id}">Одобрить</button>
            <button class="btn-reject-request" data-id="${req.id}">Отклонить</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  const oldSection = adminContent.querySelector('.admin-section');
  if (oldSection) oldSection.remove();
  adminContent.appendChild(requestsSection);
  
  requestsSection.querySelectorAll('.btn-approve-request').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { 
        await approveTitleRequest(parseInt(btn.dataset.id), currentProfile.id); 
        showNotification('Титул выдан!', 'success'); 
        setupAdminTitleRequests(); 
      } catch (error) { 
        showNotification(`Ошибка: ${error.message}`, 'error'); 
      }
    });
  });
  
  requestsSection.querySelectorAll('.btn-reject-request').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { 
        await rejectTitleRequest(parseInt(btn.dataset.id), currentProfile.id); 
        showNotification('Запрос отклонён', 'info'); 
        setupAdminTitleRequests(); 
      } catch (error) { 
        showNotification(`Ошибка: ${error.message}`, 'error'); 
      }
    });
  });
}

// ============================================
// ЧАТ
// ============================================

async function setupChat() {
  if (!currentProfile) return;
  
  chatMessages = await getChatMessages();
  renderChatMessages(chatMessages, currentProfile.id, currentProfile.role, handleDeleteChatClick, handleAuthorClick);
  
  if (!chatRefreshInterval) {
    chatRefreshInterval = setInterval(() => {
      renderChatMessages(chatMessages, currentProfile.id, currentProfile.role, handleDeleteChatClick, handleAuthorClick);
    }, 60000);
  }
  
  if (!chatChannel) {
    chatChannel = subscribeToChatMessages((payload, eventType) => {
      if (eventType === 'INSERT') loadNewMessage(payload.id);
      else if (eventType === 'UPDATE') updateMessageInList(payload);
      else if (eventType === 'DELETE') {
        chatMessages = chatMessages.filter(msg => msg.id !== payload.id);
        renderChatMessages(chatMessages, currentProfile.id, currentProfile.role, handleDeleteChatClick, handleAuthorClick);
      }
    });
  }
}

async function loadNewMessage(messageId) {
  const { data } = await supabase
    .from('chat_messages')
    .select('*, profiles (full_name, avatar_url, role)')
    .eq('id', messageId)
    .single();
  
  if (data) {
    const { data: titles } = await supabase
      .from('user_titles')
      .select('titles (title_name, icon)')
      .eq('user_id', data.user_id)
      .eq('is_active', true);
    
    data.user_titles = titles || [];
    
    if (!chatMessages.find(msg => msg.id === data.id)) {
      chatMessages.push(data);
      renderChatMessages(chatMessages, currentProfile.id, currentProfile.role, handleDeleteChatClick, handleAuthorClick);
    }
  }
}

function updateMessageInList(updatedMsg) {
  const index = chatMessages.findIndex(msg => msg.id === updatedMsg.id);
  if (index !== -1) {
    chatMessages[index] = { ...chatMessages[index], ...updatedMsg };
    renderChatMessages(chatMessages, currentProfile.id, currentProfile.role, handleDeleteChatClick, handleAuthorClick);
  }
}

function handleDeleteChatClick(messageId, isOwn, isModerator) {
  if (isOwn) {
    if (confirm('Удалить ваше сообщение?')) handleDeleteOwnMessage(messageId);
  } else {
    showDeleteReasonModal(messageId, isOwn, isModerator, handleDeleteConfirm);
  }
}

async function handleDeleteOwnMessage(messageId) {
  try { 
    await softDeleteChatMessage(messageId, null);
    showNotification('Сообщение удалено', 'success'); 
  } catch (error) { 
    showNotification(`Ошибка: ${error.message}`, 'error'); 
  }
}

async function handleDeleteConfirm(messageId, reason, deleteType) {
  try {
    if (deleteType === 'soft') { 
      await softDeleteChatMessage(messageId, reason); 
      showNotification('Сообщение помечено как удалённое', 'success'); 
    } else { 
      await hardDeleteChatMessage(messageId); 
      showNotification('Сообщение полностью удалено', 'success'); 
    }
  } catch (error) { 
    showNotification(`Ошибка: ${error.message}`, 'error'); 
  }
}

document.addEventListener('DOMContentLoaded', initApp);