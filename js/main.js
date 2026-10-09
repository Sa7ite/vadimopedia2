// ============================================
// ГЛАВНЫЙ МОДУЛЬ (ТОЧКА ВХОДА)
// ============================================
import { supabase } from './config.js';
import { 
  getProfileWithTitles, getUserCount, getApprovedEvents, getPendingEvents,
  addEvent, updateEvent, updateProfile, approveEvent, rejectEvent, deleteEvent,
  getChatMessages, sendChatMessage, softDeleteChatMessage, hardDeleteChatMessage,
  subscribeToChatMessages, unsubscribeFromChatMessages,
  connectToPresence, disconnectFromPresence,
  getTitleRequests, approveTitleRequest, rejectTitleRequest,
  getChronicle, getChronicleEditor, saveChronicleDraft, publishChronicle, generateChronicleText, rollbackChronicle,
  getLoreSignificantEventsNotInChronicle,
  toggleReaction, addEventComment, deleteEventComment,
  toggleBookmark, getBookmarks,
  getEventsByUser, getEventById,
  getPersons, getCampaigns, setEventParticipants, getSettingValue, getReactionCounts,
  getTheories, createTheory, voteTheory, setTheoryStatus, addEvidence, removeEvidence, getMyEvidence
} from './api.js';
import { setupAdminPanel } from './admin.js';
import { registerUser, loginUser, logoutUser, onAuthStateChange } from './auth.js';
import { validateDate, geocodePlace } from './validation.js';
import {
  showSection, showNotification, updateUIForUser, updateUIForGuest,
  renderEvents, renderPendingEvents, renderProfile, renderEditProfileForm,
  renderChatMessages, showDeleteReasonModal, showUserProfile,
  renderChronicle, renderChronicleEditor, renderInsertReview, renderTimeline, renderTheories, renderBookmarks,
  showEventModal, showEditEventModal, eventTagsPickerHtml, readEventTags,
  openModal, closeModal, setupModalCloseHandlers
} from './ui.js';

let currentProfile = null;
let feedEvents = [];
let chatChannel = null;
let chatMessages = [];
let chatRefreshInterval = null;
let presenceChannel = null;
let chronicleData = null;
let chronicleViewMode = 'read';
let generatedEventIds = [];
let generatedFlags = []; // T2.4: замечания ИИ для админа (противоречия и т.п.) // события, вплетённые ИИ в текущий черновик летописи

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
    renderAddEventTags();
    if (currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator')) {
      await loadPendingEvents();
      setupAdminTitleRequests();
    }
    setupAdminPanel(currentProfile?.role === 'admin', () => { loadEventLists(true).then(renderAddEventTags); });
    presenceChannel = connectToPresence(session.user.id, updateOnlineCount);
  } else {
    updateUIForGuest();
    await loadEvents();
    updateOnlineCount(0);
  }

  onAuthStateChange(async (event, session) => {
    if (session) {
      currentProfile = await getProfileWithTitles(session.user.id);
      loadUserCount(session);
      window.handleSaveProfile = handleSaveProfile;
      updateUIForUser(session.user, currentProfile, () => renderEditProfileForm(currentProfile, handleSaveProfile));
      await loadEvents();
      renderAddEventTags();
      if (currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator')) {
        await loadPendingEvents();
        setupAdminTitleRequests();
      }
      setupAdminPanel(currentProfile?.role === 'admin', () => { loadEventLists(true).then(renderAddEventTags); });
      if (!presenceChannel) presenceChannel = connectToPresence(session.user.id, updateOnlineCount);
    } else {
      currentProfile = null;
      loadUserCount(null);
      updateUIForGuest();
      setupAdminPanel(false);
      await loadEvents();
      updateOnlineCount(0);
      if (chatChannel) { unsubscribeFromChatMessages(chatChannel); chatChannel = null; }
      if (chatRefreshInterval) { clearInterval(chatRefreshInterval); chatRefreshInterval = null; }
      if (presenceChannel) { disconnectFromPresence(presenceChannel); presenceChannel = null; }
    }
  });

  // после обновления страницы остаёмся в том же разделе (#events, #chat, ...)
  openSectionFromHash();
  window.addEventListener('hashchange', openSectionFromHash);

  console.log('Приложение инициализировано');
}

function openSectionFromHash() {
  const section = decodeURIComponent(location.hash.slice(1));
  if (!section) return;
  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  // раздел недоступен (например, админка у гостя) — остаёмся на главной
  if (!link || link.style.display === 'none') return;
  if (!link.classList.contains('active')) link.click();
}

async function loadUserCount(session) {
  // гости (без входа) данные базы не читают: показываем приглашение войти
  if (session === undefined) ({ data: { session } } = await supabase.auth.getSession());
  document.body.classList.toggle('guest', !session);
  if (!session) return;
  getChronicle().then(c => window.vpChronicleCheck?.(c)).catch(() => {});
  // «Событие дня»: из популярных (нравится − не нравится > 0), если таких нет — из всех одобренных
  Promise.all([getApprovedEvents(500), getReactionCounts()]).then(([ev, rc]) => {
    const popular = ev.filter(e => (rc[String(e.id)]?.score || 0) > 0);
    window.vpVadimOfDay?.(popular.length ? popular : ev, handleShowEventModal);
  }).catch(() => {});
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

// Проверка даты для модалки редактирования (логика — в validation.js)
function isValidDate(dateStr) { return validateDate(dateStr) === null; }

// Проверка места: возвращает координаты или бросает понятную ошибку
async function resolvePlace(city) {
  if (!city) return { lat: null, lon: null };
  const place = await geocodePlace(city);
  if (!place) throw new Error(`Не нашёл место «${city}» на карте. Проверь написание (например: «Москва», «Нью-Йорк»)`);
  return { lat: place.lat, lon: place.lon };
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
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-open-rules]')) return;
    e.preventDefault();
    openModal('modal-rules');
  });

  const formRegister = document.getElementById('form-register');
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!document.getElementById('register-rules')?.checked) { showNotification('Нужно принять правила', 'error'); return; }
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
      const asChronicler = document.getElementById('event-as-chronicler')?.checked || false;
      const eventDateEl = document.getElementById('event-date');
      const eventDate = eventDateEl ? eventDateEl.value.trim() : null;

      if (!eventText) {
        showNotification('Введите текст события', 'error');
        return;
      }
      const dateError = validateDate(eventDate);
      if (dateError) {
        showNotification(dateError, 'error');
        return;
      }
      let coords;
      try {
        coords = await resolvePlace(city);
      } catch (error) {
        showNotification(error.message, 'error');
        return;
      }

      // ИСПРАВЛЕНИЕ 3: Автоодобрение для админов
      const isAutoApprove = currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator');

      try {
        const tags = readEventTags(formAddEvent, 'event');
        await addEvent(eventText, city, isLore, eventDate, isAutoApprove, coords, asChronicler, tags.campaignId, tags.personIds);
        if (asChronicler && !isAutoApprove) {
          showNotification('Отправлено на проверку. После одобрения появится от имени Летописца.', 'success');
        } else if (isAutoApprove || !isLore) {
          showNotification(asChronicler ? 'Опубликовано от имени Летописца!' : 'Событие добавлено и опубликовано!', 'success');
        } else {
          showNotification('Событие добавлено! Ожидает модерации.', 'success');
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
  
  showNotification('Сохранение...', 'info');
  
  try {
    const updates = { full_name: name, city: location, bio: bio };
    
    await updateProfile(user.id, updates);
    showNotification('Профиль обновлен!', 'success');
    
    currentProfile = await getProfileWithTitles(user.id);
    getChronicle().then(c => window.vpChronicleCheck?.(c)).catch(() => {});
    renderProfile(currentProfile, () => renderEditProfileForm(currentProfile, handleSaveProfile));
  } catch (error) { 
    showNotification(`Ошибка: ${error.message}`, 'error'); 
  }
}

// ИСПРАВЛЕНИЕ 1: Передаём currentUserId в renderEvents
async function loadEvents() {
  if (!currentProfile) {
    const list = document.getElementById('events-list');
    if (list) list.innerHTML = '<li class="empty-state">Картотека доступна участникам. Войдите или станьте Вадимом, чтобы читать события.</li>';
    const st = document.getElementById('stat-events');
    if (st) st.textContent = '—';
    return;
  }
  const [allEvents, counts] = await Promise.all([getApprovedEvents(), getReactionCounts()]);
  allEvents.forEach(e => { e.rc = counts[String(e.id)] || { likes: 0, dislikes: 0, witnesses: 0, score: 0 }; });
  const byDate = (a, b) => eventDateKey(b.event_date) - eventDateKey(a.event_date);
  // T2.1: «Популярное» — счёт = нравится − не нравится, при равенстве — по дате
  const sortMode = document.getElementById('events-sort')?.value || 'date';
  const events = allEvents.sort(sortMode === 'popular' ? (a, b) => (b.rc.score - a.rc.score) || byDate(a, b) : byDate);
  feedEvents = events;
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
async function handleEditEvent(event) {
  const lists = await loadEventLists();
  showEditEventModal(event, async (eventId, updates, personIds) => {
    const coords = await resolvePlace(updates.city);
    await updateEvent(eventId, { ...updates, ...coords });
    if (personIds) await setEventParticipants(eventId, personIds);
    await loadEvents();
  }, isValidDate, null, lists);
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
    renderChronicle(chronicleData, handleShowEventModal, await getTheories({ status: 'canon' }));
    window.vpChronicleSeen?.(chronicleData);
  }

  const btnRead = document.getElementById('btn-read-chronicle');
  const btnTimeline = document.getElementById('btn-timeline-chronicle');
  const btnTheories = document.getElementById('btn-theories-chronicle');
  const btnBookmarks = document.getElementById('btn-bookmarks-chronicle');
  const btnEdit = document.getElementById('btn-edit-chronicle');

  if (btnRead) {
    btnRead.onclick = async () => {
      chronicleViewMode = 'read';
      chronicleData = await getChronicle();
      renderChronicle(chronicleData, handleShowEventModal, await getTheories({ status: 'canon' }));
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

  if (btnTheories) {
    btnTheories.onclick = async () => {
      chronicleViewMode = 'theories';
      await showTheories();
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
  let editor;
  try { editor = await getChronicleEditor(); }
  catch (error) { showNotification(`Не удалось открыть редактор: ${error.message}`, 'error'); return; }
  const pendingEvents = await getLoreSignificantEventsNotInChronicle();
  renderChronicleEditor(editor, pendingEvents, {
    onSaveDraft: handleSaveChronicle,
    onPublish: handlePublishChronicle,
    onGenerate: handleGenerateChronicle,
    onRollback: handleRollbackChronicle
  });
}

// T2.3: сохранить черновик (база проверяет разметку: каждое событие один раз)
async function handleSaveChronicle(content, quiet = false) {
  try {
    const note = generatedEventIds.length ? `ИИ: события ${generatedEventIds.join(', ')}${generatedFlags.length ? '. Проверить: ' + generatedFlags.join('; ') : ''}` : null;
    const id = await saveChronicleDraft(content, note);
    if (!quiet) {
      showNotification('Черновик сохранён. Читатели увидят его после публикации.', 'success');
      await loadChronicleEditor();
    }
    return id;
  } catch (error) {
    showNotification(`Ошибка сохранения: ${error.message}`, 'error');
    return null;
  }
}

async function handlePublishChronicle(content) {
  const id = await handleSaveChronicle(content, true);
  if (!id) return;
  try {
    chronicleData = await publishChronicle(id);
    generatedEventIds = []; generatedFlags = [];
    showNotification('Летопись опубликована!', 'success');
    chronicleViewMode = 'read';
    renderChronicle(chronicleData, handleShowEventModal, await getTheories({ status: 'canon' }));
  } catch (error) {
    showNotification(`Ошибка публикации: ${error.message}`, 'error');
  }
}

async function handleGenerateChronicle() {
  try {
    const textarea = document.getElementById('chronicle-textarea');
    const baseText = textarea ? textarea.value : (chronicleData?.content || '');
    // события, уже вплетённые в текст редактора (но ещё не опубликованные), второй раз не отправляем
    const inText = new Set([...baseText.matchAll(/\[\[(\d+)\|/g)].map(m => Number(m[1])));
    const allPending = (await getLoreSignificantEventsNotInChronicle()).filter(e => !inText.has(Number(e.id)));
    // ai.batch_size из настроек; сервер ИИ принимает не больше 5 за раз
    const batch = Math.min(5, Math.max(1, Number(await getSettingValue('ai.batch_size', 5)) || 5));
    const pendingEvents = allPending.slice(0, batch);
    if (pendingEvents.length === 0) {
      showNotification('Нет новых значимых событий для добавления', 'error');
      return;
    }
    if (allPending.length > batch) showNotification(`За раз беру ${batch} из ${allPending.length}. Остальные — следующим нажатием.`, 'info');
    const btn = document.getElementById('btn-generate-chronicle');
    if (btn) { btn.disabled = true; btn.textContent = 'Летописец пишет...'; }
    showNotification(`Летописец работает с событиями: ${pendingEvents.length}. Обычно это 15–40 секунд, максимум около двух минут.`, 'info');
    let result;
    try {
      result = await generateChronicleText(baseText, pendingEvents);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Дописать с ИИ'; }
    }
    const acceptText = () => {
      if (textarea) { textarea.value = result.text; textarea.dispatchEvent(new Event('input')); }
      generatedEventIds = [...new Set([...generatedEventIds, ...result.usedIds])];
      generatedFlags = [...generatedFlags, ...result.reviewFlags];
    };
    // T2.5: вставка в середину — сначала админ сравнивает «было / стало» и подтверждает
    if (result.mode === 'insert') {
      renderInsertReview(result, {
        onAccept: () => {
          if (textarea && textarea.value !== baseText && !confirm('Текст в редакторе изменился, пока ИИ работал. Вставка заменит эти правки. Продолжить?')) {
            showNotification('Вставка не применена, ваши правки сохранены в редакторе.', 'info');
            return;
          }
          acceptText();
          showNotification(`Вставка принята в текст редактора. Проверьте, сохраните черновик или опубликуйте.${result.remaining ? ' Остальные события — следующим нажатием «Дописать с ИИ».' : ''}`, 'success');
        },
        onReject: () => showNotification('Вставка отклонена, текст не изменён.', 'info')
      });
      if (result.reviewFlags.length) showNotification(`Проверьте: ${result.reviewFlags.join('; ')}`, 'info');
      return;
    }
    acceptText();
    const missed = pendingEvents.filter(e => !result.usedIds.includes(e.id));
    if (missed.length) showNotification(`ИИ не отметил событий: ${missed.length}. Проверь текст или сгенерируй ещё раз.`, 'error');
    if (result.reviewFlags.length) showNotification(`Проверьте: ${result.reviewFlags.join('; ')}`, 'info');
    showNotification('Текст дописан. Проверьте, сохраните черновик или опубликуйте.', 'success');
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
    renderChronicle(chronicleData, handleShowEventModal, await getTheories({ status: 'canon' }));
  } catch (error) {
    showNotification(`Ошибка отката: ${error.message}`, 'error');
  }
}

async function handleShowEventModal(event) {
  if (!currentProfile) return;
  // из летописи приходит только id — подгружаем событие целиком
  let fullEvent = event;
  if (event?.id && !event.event_text) {
    fullEvent = await getEventById(event.id);
    if (!fullEvent) { showNotification('Событие не найдено (возможно, удалено)', 'error'); return; }
  }
  const ctx = await theoryContext();
  ctx.load = (id) => getTheories({ eventId: id });
  await showEventModal(
    fullEvent,
    currentProfile.id,
    handleToggleReaction,
    handleAddComment,
    handleToggleBookmark,
    handleDeleteComment,
    ctx
  );
}

// T2.7: общий набор для теорий — события для выбора, мои улики, действия (права проверяет база)
async function theoryContext() {
  const [events, evidence, maxPerDay] = await Promise.all([
    getApprovedEvents(),
    getMyEvidence().catch(() => []),
    getSettingValue('theory.max_per_day', 3)
  ]);
  events.sort((a, b) => eventDateKey(a.event_date) - eventDateKey(b.event_date));
  return {
    userId: currentProfile.id,
    isAdmin: currentProfile.role === 'admin',
    maxPerDay,
    events,
    evidence: new Set(evidence.filter(e => e.target_type === 'theory').map(e => String(e.target_id))),
    onCreate: createTheory,
    onVote: voteTheory,
    onStatus: async (id, status) => { await setTheoryStatus(id, status); chronicleData = null; },
    onEvidence: (id, has) => has ? removeEvidence('theory', id) : addEvidence('theory', id),
    onEventClick: handleShowEventModal
  };
}

async function showTheories() {
  const [ctx, theories] = await Promise.all([theoryContext(), getTheories()]);
  ctx.reload = async () => { if (chronicleViewMode === 'theories') await showTheories(); };
  renderTheories(theories.filter(t => t.status !== 'removed'), ctx.events, ctx);
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
      showNotification(`Достижение: ${newAchievements.join(', ')}`, 'success');
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
            <strong>${esc(req.profiles?.full_name || 'Неизвестно')}</strong>
            <span>запросил титул: ${esc(req.titles?.title_name || '')}</span>
          </div>
          <p class="request-reason">Причина: ${esc(req.reason)}</p>
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

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Ключ сортировки по дате события (год*10000 + месяц*100 + день); без даты — в конец ленты
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function eventDateKey(raw) {
  if (!raw) return -1;
  const s = String(raw).toLowerCase().trim();
  let m;
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{1,5})/))) return +m[3] * 10000 + +m[2] * 100 + +m[1];
  if ((m = s.match(/^(\d{1,5})-(\d{1,2})-(\d{1,2})/))) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  if ((m = s.match(/^(\d{1,2})[./](\d{1,5})$/))) return +m[2] * 10000 + +m[1] * 100;
  if ((m = s.match(/^(?:(\d{1,2})\s+)?([а-яё]+)\s+(\d{1,5})/))) {
    const w = m[2];
    const i = w.startsWith('ма') && !w.startsWith('мар') ? 4 : MONTHS.findIndex((st, k) => k !== 4 && w.startsWith(st));
    return +m[3] * 10000 + (i + 1) * 100 + (m[1] ? +m[1] : 0);
  }
  if ((m = s.match(/^(\d{1,5})/))) return +m[1] * 10000;
  return -1;
}

// T1.6: списки персонажей и кампаний (кэш на сессию) и выбор в форме добавления
let eventListsCache = null;
async function loadEventLists(force = false) {
  if (!eventListsCache || force) {
    const [persons, campaigns] = await Promise.all([getPersons(), getCampaigns()]);
    eventListsCache = { persons, campaigns };
  }
  return eventListsCache;
}

async function renderAddEventTags() {
  const box = document.getElementById('event-tags-picker');
  if (!box || !currentProfile) return;
  const { persons, campaigns } = await loadEventLists();
  box.innerHTML = eventTagsPickerHtml('event', persons, campaigns);
}

// T2.1: открыть событие из ленты, сортировка, обновление счётчиков после реакции
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#events-list .event-open');
  if (!btn) return;
  const ev = feedEvents.find(x => String(x.id) === String(btn.dataset.id));
  if (ev) handleShowEventModal(ev);
});
document.getElementById('events-sort')?.addEventListener('change', () => loadEvents());
let reactionsReloadTimer = null;
window.addEventListener('vp:reactions-changed', () => {
  clearTimeout(reactionsReloadTimer);
  reactionsReloadTimer = setTimeout(() => { if (currentProfile) loadEvents(); }, 400);
});
