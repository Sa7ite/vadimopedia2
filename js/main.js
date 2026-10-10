// ============================================
// ГЛАВНЫЙ МОДУЛЬ (ТОЧКА ВХОДА)
// ============================================
import { askConfirm, askText } from './dialog.js';
import { supabase } from './config.js';
import { 
  getProfileWithTitles, getUserCount, getApprovedEvents, getPendingEvents,
  addEvent, updateEvent, updateProfile, deleteEvent,
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
  getTheories, createTheory, voteTheory, setTheoryStatus, addEvidence, removeEvidence, getMyEvidence,
  getYearPolls, getYearPoll, voteEventOfYear, openYearPoll, closeYearPoll,
  addQuote, shareQuoteToChat, deleteQuote, revokeTitle
} from './api.js';
import { setupAdminPanel } from './admin.js';
import { renderCases, openCaseAgainst, checkDoorKnock } from './cases.js';
import { renderQueue, renderMySubmissions, reportFlow } from './moderation.js';
import { setupBell, teardownBell } from './bell.js';
import { renderDesk } from './desk.js';
import { getFactionOfUsers } from './api.js';
import { getArrest, getMessageReactions, getMessageById, muteUser, getMyMute, getEventOfDay, getMentionables, getUserFaction, getFactions } from './api.js';
import { registerUser, loginUser, logoutUser, onAuthStateChange } from './auth.js';
import { validateDate, geocodePlace } from './validation.js';
import {
  showSection, showNotification, updateUIForUser, updateUIForGuest,
  renderEvents, renderProfile, renderEditProfileForm,
  renderChatMessages, showDeleteReasonModal, showUserProfile,
  renderChronicle, chronicleNewKeys, markChronicleSeen, renderChronicleEditor, renderInsertReview, renderTimeline, renderTheories, renderBookmarks, renderYearPolls, setupQuoteCapture, renderQuoteShelf, announceNewAchievements,
  showEventModal, showEditEventModal, eventTagsPickerHtml, readEventTags,
  openModal, closeModal, setupModalCloseHandlers
} from './ui.js';

let currentProfile = null;
let feedEvents = [];
let chatChannel = null;
let chatMessages = [];
let chatChannelName = 'general'; // T2.12/T2.13: general | cell | faction:N
let chatReplyTo = null;       // T2.13: сообщение, на которое отвечаем
let chatReactions = {};       // реакции на сообщения текущего канала
let chatPeople = [];          // [{id, full_name}] — для @упоминаний
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
  
  // T2.10: кошелёк — админ может отозвать удостоверение; после изменения профиль перечитывается
  window.vpWalletHandlers = (profile, closeParent) => ({
    isAdmin: currentProfile?.role === 'admin',
    onRevoke: revokeTitle,
    onChanged: async () => {
      closeParent?.();
      if (String(profile.id) === String(currentProfile.id)) { currentProfile = await getProfileWithTitles(currentProfile.id); renderProfile(currentProfile, () => renderEditProfileForm(currentProfile, handleSaveProfile)); }
      else showUserProfile(profile.id, currentProfile.id);
    }
  });

  // T2.12: «Открыть дело» из чужого профиля
  window.vpOpenCase = (userId) => { openCaseAgainst(userId); showSection('cases'); renderCases(currentProfile); };

  // T2.9: цитаты — кнопка «В коллекцию» при выделении и действия полки
  window.vpReport = reportFlow;   // T2.14: «Пожаловаться» из окна события, теорий и чата
  window.vpSubmissions = (el) => currentProfile && renderMySubmissions(el, currentProfile.id, handleEditEvent);
  window.vpQuoteHandlers = { onShare: shareQuoteToChat, onDelete: deleteQuote, onEventClick: (ev) => handleShowEventModal(ev) };
  setupQuoteCapture((text, eventId, source) => addQuote(text, eventId, source));

  if (session) {
    currentProfile = await getProfileWithTitles(session.user.id);
    window.handleSaveProfile = handleSaveProfile;
    updateUIForUser(session.user, currentProfile, () => renderEditProfileForm(currentProfile, handleSaveProfile));
    await loadEvents();
    renderAddEventTags();
    announceNewAchievements(session.user.id);
    checkDoorKnock(currentProfile);
    if (currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'moderator')) {
      await loadPendingEvents();
      setupAdminTitleRequests();
    }
    setupAdminPanel(currentProfile?.role === 'admin', () => { loadEventLists(true).then(renderAddEventTags); });
    presenceChannel = connectToPresence(session.user.id, updateOnlineCount);
    setupBell(currentProfile, bellHandlers());
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
      setupBell(currentProfile, bellHandlers());
    } else {
      teardownBell();
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

// T2.15: куда ведёт уведомление из колокольчика
function bellHandlers() {
  return {
    openEvent: (id) => handleShowEventModal({ id: Number(id) }),
    openChat: (channel) => { chatChannelName = channel; setChatReply(null); document.querySelector('.nav-link[data-section="chat"]')?.click(); },
    openSection: (sec) => document.querySelector(`.nav-link[data-section="${sec}"]`)?.click()
  };
}

async function loadUserCount(session) {
  // гости (без входа) данные базы не читают: показываем приглашение войти
  if (session === undefined) ({ data: { session } } = await supabase.auth.getSession());
  document.body.classList.toggle('guest', !session);
  if (!session) return;
  getChronicle().then(c => window.vpChronicleCheck?.(c)).catch(() => {});
  // «Событие дня» (T2.13): одно на всех, выбирает база (event_of_day); запасной путь — по-старому
  getEventOfDay().then(async id => {
    const e = id ? await getEventById(id) : null;
    if (e) return window.vpVadimOfDay?.([e], handleShowEventModal);
    const [ev, rc] = await Promise.all([getApprovedEvents(500), getReactionCounts()]);
    const popular = ev.filter(x => (rc[String(x.id)]?.score || 0) > 0);
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
      if (section === 'cases' && currentProfile) renderCases(currentProfile);
      if (section === 'admin' && currentProfile) loadPendingEvents();   // T2.14: очередь всегда свежая
      if (section === 'chronicle') setupChronicle();
      if (section === 'profile' && currentProfile) { refreshProfileQuotes(); window.vpSubmissions(document.getElementById('profile-submissions')); }
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
  // бланк «Донесение» свёрнут: картотека под ним видна сразу, бланк раскрывается по кнопке
  const blToggle = document.getElementById('bl-toggle'), blSheet = document.getElementById('bl-sheet');
  const setBlank = (open) => {
    if (!blToggle || !blSheet) return;
    blSheet.hidden = !open; blToggle.hidden = open; blToggle.setAttribute('aria-expanded', String(open));
    if (open) { blSheet.classList.remove('unfold'); void blSheet.offsetWidth; blSheet.classList.add('unfold'); document.getElementById('event-text')?.focus(); }
    else blToggle.focus();
  };
  blToggle?.addEventListener('click', () => setBlank(true));
  document.getElementById('bl-close')?.addEventListener('click', () => setBlank(false));
  if (formAddEvent) {
    formAddEvent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventText = document.getElementById('event-text').value.trim();
      const eventTitle = document.getElementById('event-title')?.value.trim() || '';
      const city = document.getElementById('event-city').value.trim();
      const isLore = document.getElementById('event-is-lore').checked;
      const asChronicler = document.getElementById('event-as-chronicler')?.checked || false;
      const eventDateEl = document.getElementById('event-date');
      const eventDate = eventDateEl ? eventDateEl.value.trim() : null;

      if (!eventText) {
        showNotification('Введите текст события', 'error');
        return;
      }
      if (eventTitle.length > 80) {
        showNotification('Название длиннее 80 знаков. Сократите его или оставьте поле пустым.', 'error');
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
        await addEvent(eventText, city, isLore, eventDate, isAutoApprove, coords, asChronicler, tags.campaignId, tags.personIds, eventTitle);
        if (asChronicler && !isAutoApprove) {
          showNotification('Отправлено на проверку. После одобрения появится от имени Летописца.', 'success');
        } else if (isAutoApprove || !isLore) {
          showNotification(asChronicler ? 'Опубликовано от имени Летописца!' : 'Событие добавлено и опубликовано!', 'success');
        } else {
          showNotification('Событие добавлено! Ожидает модерации.', 'success');
        }
        formAddEvent.reset();
        setBlank(false);
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
      const input = document.getElementById('chat-message-text');
      const send = formChat.querySelector('button[type="submit"]');
      const messageText = input.value.trim();
      if (!messageText || send.disabled) return;
      // @Имя → id упомянутых (база ещё раз проверит, что имя действительно в тексте)
      const mentions = chatPeople.filter(p => p.full_name && p.id !== currentProfile?.id && messageText.includes('@' + p.full_name)).map(p => p.id);
      send.disabled = true;
      try {
        await sendChatMessage(messageText, chatChannelName, chatReplyTo?.id || null, mentions);
        input.value = '';
        setChatReply(null);
      } catch (error) {
        showNotification(`Не отправлено: ${error.message}`, 'error');
      } finally {
        setTimeout(() => { if (!input.disabled) send.disabled = false; }, 1500);
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
    renderDesk(null);
    return;
  }
  const [allEvents, counts, polls, factionOf] = await Promise.all([getApprovedEvents(), getReactionCounts(), getYearPolls(), getFactionOfUsers()]);
  window.vpFactionOf = factionOf;
  // T2.8: значок «Событие года» у победителей
  const awards = Object.fromEntries(polls.filter(p => p.winner_event).map(p => [String(p.winner_event), p.year]));
  allEvents.forEach(e => { e.rc = counts[String(e.id)] || { likes: 0, dislikes: 0, witnesses: 0, score: 0 }; e.year_award = awards[String(e.id)] || null; });
  const byDate = (a, b) => eventDateKey(b.event_date) - eventDateKey(a.event_date);
  // T2.1: «Популярное» — счёт = нравится − не нравится, при равенстве — по дате
  const sortMode = document.getElementById('events-sort')?.value || 'date';
  const events = allEvents.sort(sortMode === 'popular' ? (a, b) => (b.rc.score - a.rc.score) || byDate(a, b) : byDate);
  feedEvents = events;
  const onAuthorClick = currentProfile ? handleAuthorClick : null;
  const onEditEvent = currentProfile ? handleEditEvent : null;
  renderEvents(events, currentProfile?.role, currentProfile?.id, handleDeleteEvent, onAuthorClick, onEditEvent);
  renderDesk(events, handleShowEventModal);
  const statEvents = document.getElementById('stat-events');
  if (statEvents) statEvents.textContent = events.length;
  await loadYearPolls(polls, events);
}

// T2.8: блок «Событие года» над лентой
async function loadYearPolls(polls = null, events = feedEvents) {
  const box = document.getElementById('year-poll-box');
  if (!box || !currentProfile) return;
  polls = polls || await getYearPolls();
  const active = polls.filter(p => p.status !== 'closed');
  const states = Object.fromEntries(await Promise.all(active.map(async p => [p.year, await getYearPoll(p.year).catch(() => ({ events: [] }))])));
  const used = new Set(polls.map(p => p.year));
  const years = [...new Set(events.map(e => e.event_year).filter(y => y != null && !used.has(y)))].sort((a, b) => b - a);
  renderYearPolls(box, { polls, states, years, isAdmin: currentProfile.role === 'admin' }, {
    onVote: voteEventOfYear,
    onOpen: openYearPoll,
    onClose: closeYearPoll,
    onEventClick: handleShowEventModal,
    reload: async () => { await loadEvents(); }
  });
}

// T2.14: очередь модерации (события; для админа ещё ордера, новые теории, жалобы)
async function loadPendingEvents() {
  if (!currentProfile) return;
  await renderQueue(document.getElementById('admin-queue'), currentProfile, () => loadEvents());
}

async function handleDeleteEvent(eventId) {
  if (!await askConfirm('Вы уверены, что хотите удалить это событие?')) return;
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
async function handleEditEvent(event, after) {
  const lists = await loadEventLists();
  showEditEventModal(event, async (eventId, updates, personIds) => {
    const coords = await resolvePlace(updates.city);
    await updateEvent(eventId, { ...updates, ...coords });
    if (personIds) await setEventParticipants(eventId, personIds);
    await loadEvents();
    after?.();
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

  if (chronicleViewMode === 'read') await readChronicle(false);
  else markChronicleTab();

  const btnRead = document.getElementById('btn-read-chronicle');
  const btnTimeline = document.getElementById('btn-timeline-chronicle');
  const btnTheories = document.getElementById('btn-theories-chronicle');
  const btnBookmarks = document.getElementById('btn-bookmarks-chronicle');
  const btnEdit = document.getElementById('btn-edit-chronicle');

  if (btnRead) {
    btnRead.onclick = async () => {
      chronicleViewMode = 'read';
      await readChronicle(true);
    };
  }

  if (btnTimeline) {
    btnTimeline.onclick = async () => {
      chronicleViewMode = 'timeline'; markChronicleTab();
      const events = await getApprovedEvents(200);
      const eventsWithDate = events.filter(e => e.event_date || e.is_lore_significant);
      renderTimeline(eventsWithDate, handleShowEventModal);
    };
  }

  if (btnTheories) {
    btnTheories.onclick = async () => {
      chronicleViewMode = 'theories'; markChronicleTab();
      await showTheories();
    };
  }

  if (btnBookmarks) {
    btnBookmarks.onclick = async () => {
      chronicleViewMode = 'bookmarks'; markChronicleTab();
      const bookmarks = await getBookmarks();
      renderBookmarks(bookmarks, handleShowEventModal);
    };
  }

  if (btnEdit && currentProfile.role === 'admin') {
    btnEdit.onclick = async () => {
      chronicleViewMode = 'edit'; markChronicleTab();
      await loadChronicleEditor();
    };
  }
}

// T3.4: чтение тома; «новое» помнится на устройстве, ушко на главной обновляется после чтения
async function readChronicle(reload) {
  markChronicleTab();
  if (reload || !chronicleData) chronicleData = await getChronicle();
  renderChronicle(chronicleData, handleShowEventModal, await getTheories(), {
    uid: currentProfile?.id,
    onTheories: async (ids) => { chronicleViewMode = 'theories'; markChronicleTab(); await showTheories(ids); }
  });
  if (!window.VP_NEW) markChronicleSeen(chronicleData, currentProfile?.id);
  window.vpChronicleCheck?.(chronicleData);
}

// активная вкладка над томом
function markChronicleTab() {
  const ids = { read: 'btn-read-chronicle', timeline: 'btn-timeline-chronicle', theories: 'btn-theories-chronicle', bookmarks: 'btn-bookmarks-chronicle', edit: 'btn-edit-chronicle' };
  Object.entries(ids).forEach(([m, id]) => { const b = document.getElementById(id); if (b) { b.classList.toggle('on', m === chronicleViewMode); b.setAttribute('aria-pressed', String(m === chronicleViewMode)); } });
}

// книга на главной: «новая глава», если в летописи есть абзацы, которых человек не видел
window.vpChronicleCheck = async (c) => {
  if (!c) return;
  const uid = currentProfile?.id || (await supabase.auth.getSession()).data.session?.user?.id;
  const fresh = chronicleNewKeys(c, uid);
  window.vpDeskTome?.(c, !!fresh && fresh.size > 0);
};

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
    await readChronicle(false);
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
        onAccept: async () => {
          if (textarea && textarea.value !== baseText && !await askConfirm('Текст в редакторе изменился, пока ИИ работал. Вставка заменит эти правки. Продолжить?')) {
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
    await readChronicle(false);
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

// T2.9: полка цитат обновляется при каждом открытии профиля
function refreshProfileQuotes() {
  const box = document.getElementById('profile-quotes');
  if (box) renderQuoteShelf(box, currentProfile.id, { own: true, ...window.vpQuoteHandlers });
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
    onCreate: async (a, b, note) => { await createTheory(a, b, note); announceNewAchievements(currentProfile.id); },
    onVote: voteTheory,
    onStatus: async (id, status) => { await setTheoryStatus(id, status); chronicleData = null; },
    onEvidence: (id, has) => has ? removeEvidence('theory', id) : addEvidence('theory', id),
    onEventClick: handleShowEventModal
  };
}

async function showTheories(focusIds = null) {
  const [ctx, theories] = await Promise.all([theoryContext(), getTheories()]);
  ctx.reload = async () => { if (chronicleViewMode === 'theories') await showTheories(); };
  const list = theories.filter(t => t.status !== 'removed');
  renderTheories(list, ctx.events, ctx);
  // пришли с полей летописи: подсветить теории этого абзаца
  if (focusIds?.length) {
    const hit = list.filter(t => focusIds.includes(Number(t.event_a)) || focusIds.includes(Number(t.event_b)));
    const cards = hit.map(t => document.querySelector(`#chronicle-content [data-theory-id="${t.id}"]`)).filter(Boolean);
    cards.forEach(c => c.classList.add('th-focus'));
    cards[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

async function handleToggleReaction(eventId, reactionType) {
  const r = await toggleReaction(eventId, reactionType);
  announceNewAchievements(currentProfile.id);
  return r;
}

async function handleAddComment(eventId, commentText) {
  const comment = await addEventComment(eventId, commentText);
  if (currentProfile) {
    announceNewAchievements(currentProfile.id);
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

// T2.12/T2.13: вкладки «Общий / Фракция / Камера». Кто что видит и куда пишет — решает база
async function setupChatChannel() {
  const isAdmin = currentProfile.role === 'admin';
  const [until, mute, fm, all] = await Promise.all([
    getArrest(currentProfile.id), getMyMute(currentProfile.id),
    getUserFaction(currentProfile.id), isAdmin ? getFactions() : Promise.resolve([])
  ]);
  const tabs = document.getElementById('chat-tabs');
  const jail = document.getElementById('chat-jail');
  const input = document.getElementById('chat-message-text');
  const send = document.querySelector('#form-chat-message button[type="submit"]');
  const list = [{ ch: 'general', label: 'Общий' }];
  const facs = isAdmin ? all.map(f => ({ id: f.id, name: f.name })) : fm?.factions ? [{ id: fm.factions.id, name: fm.factions.name }] : [];
  facs.forEach(f => list.push({ ch: 'faction:' + f.id, label: isAdmin ? f.name : 'Фракция «' + f.name + '»' }));
  if (until || isAdmin) list.push({ ch: 'cell', label: 'Камера' });
  if (until && !tabs.dataset.jailed) chatChannelName = 'cell'; // при аресте сразу в камеру (один раз)
  tabs.dataset.jailed = until ? '1' : '';
  if (!list.some(t => t.ch === chatChannelName)) chatChannelName = 'general';
  tabs.hidden = list.length < 2;
  document.getElementById('section-chat').dataset.ch = chatChannelName.startsWith('faction:') ? 'faction' : chatChannelName;
  tabs.innerHTML = list.map(t => `<button type="button" role="tab" data-ch="${t.ch}" aria-selected="${t.ch === chatChannelName}">${escapeText(t.label)}</button>`).join('');
  if (!tabs.dataset.bound) {
    tabs.dataset.bound = '1';
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-ch]'); if (b && b.dataset.ch !== chatChannelName) { chatChannelName = b.dataset.ch; setChatReply(null); setupChat(); } });
  }
  const blocked = !!mute || (!!until && chatChannelName === 'general');
  const fmt = d => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  jail.hidden = !until && !mute;
  jail.textContent = mute ? `Вам запрещено писать в чат до ${fmt(mute.until)}${mute.reason ? ` — ${mute.reason}` : ''}. Читать можно.`
    : until ? `Вы под арестом до ${fmt(until)}. В общий чат писать нельзя — камера и чат фракции открыты.` : '';
  input.disabled = blocked; if (send) send.disabled = blocked;
  input.maxLength = 1000;
  input.placeholder = mute ? 'Писать пока нельзя' : blocked ? 'Под арестом — пишите в камеру' : chatChannelName === 'cell' ? 'Сообщение в камеру…'
    : chatChannelName.startsWith('faction:') ? 'Своим… (@Имя — упомянуть)' : 'Сообщение… (@Имя — упомянуть)';
}
function escapeText(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// полоса «Ответ на …» над полем ввода
function setChatReply(msg) {
  chatReplyTo = msg || null;
  let bar = document.getElementById('chat-reply-bar');
  const form = document.getElementById('form-chat-message');
  if (!msg) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'chat-reply-bar'; bar.className = 'chat-reply-bar';
    form.parentNode.insertBefore(bar, form);
  }
  const t = (msg.message_text || '').slice(0, 80);
  bar.innerHTML = `<span>Ответ <b>${escapeText(msg.profiles?.full_name || 'Летописи')}</b>: ${escapeText(t)}${(msg.message_text || '').length > 80 ? '…' : ''}</span><button type="button" aria-label="Отменить ответ">×</button>`;
  bar.querySelector('button').onclick = () => setChatReply(null);
  document.getElementById('chat-message-text').focus();
}

function chatCtx(extra = {}) {
  return {
    reactions: chatReactions,
    names: chatPeople.map(p => p.full_name).filter(Boolean),
    onReact: async (id, type) => {
      try { await toggleReaction(id, type, 'message'); await refreshChatReactions(); }
      catch (e) { showNotification(`Ошибка: ${e.message}`, 'error'); }
    },
    onReply: (msg) => { if (msg && !document.getElementById('chat-message-text').disabled) setChatReply(msg); },
    onMute: currentProfile?.role === 'admin' ? handleMute : null,
    onReport: (id) => reportFlow('message', id),
    onSystem: (kind, ref) => {
      if (kind === 'event' && ref) handleShowEventModal({ id: Number(ref) });
      else if (kind === 'case') { showSection('cases'); renderCases(currentProfile); }
      else if (kind === 'chronicle') document.querySelector('.nav-link[data-section="chronicle"]')?.click();
    },
    ...extra
  };
}
function renderChat(extra) {
  renderChatMessages(chatMessages, currentProfile.id, currentProfile.role, handleDeleteChatClick, handleAuthorClick, chatCtx(extra));
}
async function refreshChatReactions() {
  chatReactions = await getMessageReactions(chatMessages.filter(m => m.kind !== 'system').map(m => m.id), currentProfile.id);
  renderChat();
}

async function handleMute(userId, name) {
  const v = await askText(`Запретить «${name}» писать в чат на сколько минут?\n0 — снять запрет.`, { value: '60', title: 'Запрет писать' });
  if (v === null) return;
  const min = parseInt(v, 10);
  if (!(min >= 0)) { showNotification('Нужно число минут', 'error'); return; }
  const reason = min > 0 ? ((await askText('Причина (увидит человек):', { title: 'Запрет писать' })) || '') : '';
  try { await muteUser(userId, min, reason); showNotification(min ? `«${name}» молчит ${min} мин.` : `Запрет для «${name}» снят`, 'success'); }
  catch (e) { showNotification(`Ошибка: ${e.message}`, 'error'); }
}

async function setupChat() {
  if (!currentProfile) return;
  await setupChatChannel();
  if (!chatPeople.length) chatPeople = await getMentionables();
  chatMessages = await getChatMessages(100, chatChannelName);
  chatReactions = await getMessageReactions(chatMessages.filter(m => m.kind !== 'system').map(m => m.id), currentProfile.id);
  renderChat({ forceBottom: true });

  if (!chatRefreshInterval) {
    // раз в минуту: обновить «удалено» и реакции других
    chatRefreshInterval = setInterval(() => { if (currentProfile) refreshChatReactions().catch(() => {}); }, 60000);
  }

  if (!chatChannel) {
    chatChannel = subscribeToChatMessages((payload, eventType) => {
      if (eventType === 'INSERT') loadNewMessage(payload.id);
      else if (eventType === 'UPDATE') updateMessageInList(payload);
      else if (eventType === 'DELETE') {
        chatMessages = chatMessages.filter(msg => msg.id !== payload.id);
        renderChat();
      }
    });
  }
}

async function loadNewMessage(messageId) {
  const data = await getMessageById(messageId);
  if (!data || (data.channel || 'general') !== chatChannelName || chatMessages.find(m => m.id === data.id)) return;
  if (data.user_id) {
    const { data: titles } = await supabase.from('user_titles').select('titles (title_name, icon)').eq('user_id', data.user_id).eq('is_active', true);
    data.user_titles = titles || [];
  }
  chatMessages.push(data);
  if (chatMessages.length > 200) chatMessages = chatMessages.slice(-200);
  renderChat({ forceBottom: data.user_id === currentProfile.id });
  if ((data.mentions || []).includes(currentProfile.id) && !document.getElementById('section-chat')?.classList.contains('active')) {
    showNotification(`Вас упомянул(а) ${data.profiles?.full_name || 'кто-то'} в чате`, 'info');
  }
}

function updateMessageInList(updatedMsg) {
  const index = chatMessages.findIndex(msg => msg.id === updatedMsg.id);
  if (index !== -1) {
    chatMessages[index] = { ...chatMessages[index], ...updatedMsg };
    renderChat();
  }
}

async function handleDeleteChatClick(messageId, isOwn, isModerator) {
  if (isOwn) {
    if (await askConfirm('Удалить ваше сообщение?')) handleDeleteOwnMessage(messageId);
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
// T3.2б: переключатель группировки перерисовывает ящик без новых запросов
function redrawEvents() {
  if (!currentProfile || !feedEvents) return;
  renderEvents(feedEvents, currentProfile.role, currentProfile.id, handleDeleteEvent, handleAuthorClick, handleEditEvent);
  const q = document.getElementById('events-search');
  if (q?.value) q.dispatchEvent(new Event('input', { bubbles: true }));
}
document.getElementById('ev-grouper')?.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.group) localStorage.setItem('vpGroup', b.dataset.group);
  else if (b.id === 'ev-group-first') localStorage.setItem('vpGroupFirst', localStorage.getItem('vpGroupFirst') === 'years' ? 'groups' : 'years');
  redrawEvents();
});
// стрелки по папкам, Enter открывает
document.getElementById('events-list')?.addEventListener('keydown', (e) => {
  const card = e.target.closest?.('.ev-card');
  if (!card || e.target !== card) return;
  if (e.key === 'Enter') { e.preventDefault(); card.querySelector('.event-open')?.click(); return; }
  const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!dir) return;
  e.preventDefault();
  const cards = [...document.querySelectorAll('#events-list > li.ev-card')].filter(li => li.style.display !== 'none');
  const next = cards[cards.indexOf(card) + dir];
  if (next) { next.focus(); next.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
});
let reactionsReloadTimer = null;
window.addEventListener('vp:reactions-changed', () => {
  clearTimeout(reactionsReloadTimer);
  reactionsReloadTimer = setTimeout(() => { if (currentProfile) loadEvents(); }, 400);
});
