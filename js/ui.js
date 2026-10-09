import { icon } from './icons.js';
// ============================================
// МОДУЛЬ ИНТЕРФЕЙСА
// ============================================

export function showSection(sectionName) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
    section.style.display = 'none';
  });

  const targetSection = document.getElementById(`section-${sectionName}`);
  if (targetSection) {
    targetSection.style.display = 'block';
    targetSection.classList.add('active');
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.section === sectionName) link.classList.add('active');
  });

  // запоминаем раздел в адресе, чтобы после обновления страницы остаться в нём
  const hash = sectionName === 'home' ? '' : `#${sectionName}`;
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

export function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `<p>${message}</p>`;
  container.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

export function updateUIForUser(user, profile, onEditClick) {
  const authButtons = document.getElementById('auth-buttons');
  if (authButtons) authButtons.style.display = 'none';

  const navProfile = document.getElementById('nav-profile');
  if (navProfile) navProfile.style.display = 'block';

  const addEventForm = document.getElementById('add-event-form-container');
  if (addEventForm) addEventForm.style.display = 'block';

  if (profile && (profile.role === 'admin' || profile.role === 'moderator')) {
    const navAdmin = document.getElementById('nav-admin');
    if (navAdmin) navAdmin.style.display = 'block';
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'inline-block');
  }

  renderProfile(profile, onEditClick);
}

export function updateUIForGuest() {
  const authButtons = document.getElementById('auth-buttons');
  if (authButtons) authButtons.style.display = 'flex';

  const navProfile = document.getElementById('nav-profile');
  if (navProfile) navProfile.style.display = 'none';

  const navAdmin = document.getElementById('nav-admin');
  if (navAdmin) navAdmin.style.display = 'none';

  const addEventForm = document.getElementById('add-event-form-container');
  if (addEventForm) addEventForm.style.display = 'none';

  document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');

  const profileContent = document.getElementById('profile-content');
  if (profileContent) profileContent.innerHTML = '<p>Войдите, чтобы увидеть свой профиль</p>';
}

function getAvatarUrl(profile) {
  // T1.4: фото профиля убраны; до появления аватара — инициалы в круге
  const words = (profile.full_name || 'Вадим').match(/[A-Za-zА-Яа-яЁё0-9]+/g) || ['В'];
  const initials = words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><circle cx="75" cy="75" r="73" fill="#efe6d2" stroke="#222" stroke-width="3"/><text x="75" y="78" font-family="PT Mono,Courier New,monospace" font-size="56" font-weight="bold" fill="#222" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function formatTitles(userTitles) {
  if (!userTitles || !Array.isArray(userTitles) || userTitles.length === 0) return '';
  const activeTitles = userTitles.filter(ut => ut && ut.titles && ut.is_active !== false && !ut.revoked_at);
  if (activeTitles.length === 0) return '';
  return activeTitles.map(ut => escapeHtml(ut.titles.title_name)).join(', ');
}

// D6: в профиле титулы выводятся стопкой, по одному в строке
function formatTitlesList(userTitles) {
  const active = (userTitles || []).filter(ut => ut && ut.titles && ut.is_active !== false && !ut.revoked_at);
  if (!active.length) return '';
  return `<ul class="profile-titles">${active.map(ut => `<li>${icon('star')} ${escapeHtml(ut.titles.title_name)}</li>`).join('')}</ul>`;
}

export function renderProfile(profile, onEditClick) {
  const profileContent = document.getElementById('profile-content');
  if (!profileContent || !profile) return;

  const avatarUrl = getAvatarUrl(profile);
  const titlesText = formatTitlesList(profile.user_titles);

  profileContent.innerHTML = `
    <div class="profile-card">
      <div class="profile-header">
        <div class="avatar-wrap"><img src="${avatarUrl}" alt="Аватар" class="profile-avatar">${credBadgeHtml(profile)}</div>
        <div class="profile-info">
          <h3>${escapeHtml(profile.full_name || 'Без имени')}</h3>
          ${titlesText}
          <p class="profile-location">${icon('pin')} ${escapeHtml(profile.city || 'Локация не указана')}</p>
          <p class="profile-role">${icon('badge')} Роль: ${profile.role}</p>
        </div>
      </div>
      ${profile.bio ? `<div class="profile-bio"><h4>О себе</h4><p>${escapeHtml(profile.bio)}</p></div>` : ''}
      <div class="profile-actions">
        <button class="btn-primary" id="btn-edit-profile">Редактировать профиль</button>
        <button class="btn-secondary" id="btn-manage-titles">Управление титулами</button>
        <button class="btn-danger" id="btn-logout">Выйти</button>
      </div>
      <section class="ach-showcase" id="profile-achievements"></section>
      <div id="profile-quotes">${quoteShelfHtml('Мои цитаты')}</div>
      <details class="profile-evidence" id="profile-evidence">
        <summary>${icon('evidence')} Улики <small>(видите только вы)</small></summary>
        <div id="evidence-list"><p>Загрузка…</p></div>
      </details>
      <div class="profile-settings">
        <h4>Оформление</h4>
        <div class="theme-picker" id="theme-picker">
          <button type="button" data-t="dossier">Секретное досье</button>
          <button type="button" data-t="agit">Агитпроп</button>
        </div>
      </div>
    </div>
  `;
  window.vpMarkTheme?.();

  const btnEditProfile = document.getElementById('btn-edit-profile');
  if (btnEditProfile && onEditClick) btnEditProfile.addEventListener('click', () => onEditClick());
  document.getElementById('profile-evidence')?.addEventListener('toggle', e => { if (e.target.open) renderEvidenceList(); });
  if (window.vpQuoteHandlers) renderQuoteShelf(document.getElementById('profile-quotes'), profile.id, { own: true, ...window.vpQuoteHandlers });
  renderAchievements(document.getElementById('profile-achievements'), profile.id);
  profileContent.querySelector('[data-wallet]')?.addEventListener('click', () => showWallet(profile, window.vpWalletHandlers?.(profile) || {}));

  const btnManageTitles = document.getElementById('btn-manage-titles');
  if (btnManageTitles) btnManageTitles.addEventListener('click', () => showTitlesManager(profile));

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', async () => {
    const { logoutUser } = await import('./auth.js');
    await logoutUser();
  });
}

async function showTitlesManager(profile) {
  const { getAllTitles, getUserTitles, createTitle, deleteTitle } = await import('./api.js');
  
  const allTitles = await getAllTitles();
  const userTitles = await getUserTitles(profile.id);
  
  const activeTitleIds = userTitles.filter(ut => ut.is_active !== false).map(ut => ut.title_id);
  const unlockedTitleIds = userTitles.map(ut => ut.title_id);
  
  const commonTitles = allTitles.filter(t => t.title_type === 'common');
  const specialTitles = allTitles.filter(t => t.title_type === 'special');
  const isAdmin = profile.role === 'admin';
  
  let tempActiveTitles = [...activeTitleIds];
  let tempUnlockedTitles = [...unlockedTitleIds];
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.id = 'modal-titles-manager';
  
  let titlesHTML = '';
  
  if (isAdmin) {
    titlesHTML = `
      <div class="titles-section">
        <h3>${icon('trophy')} Базовые титулы</h3>
        <div class="titles-grid">
          ${commonTitles.map(title => {
            const isActive = tempActiveTitles.includes(title.id);
            return `
              <div class="title-card ${isActive ? 'selected' : ''}" data-title-id="${title.id}" data-type="common">
                <div class="title-name">${escapeHtml(title.title_name)}</div>
                <div class="title-desc">${escapeHtml(title.description || '')}</div>
                <button class="btn-delete-title" data-title-id="${title.id}">${icon('trash')} Удалить</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="titles-section">
        <h3>${icon('star')} Особые титулы</h3>
        <div class="titles-grid">
          ${specialTitles.map(title => {
            const isActive = tempActiveTitles.includes(title.id);
            return `
              <div class="title-card special ${isActive ? 'selected' : ''}" data-title-id="${title.id}" data-type="special">
                <div class="title-name">${escapeHtml(title.title_name)}</div>
                <div class="title-desc">${escapeHtml(title.description || '')}</div>
                <button class="btn-delete-title" data-title-id="${title.id}">${icon('trash')} Удалить</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="titles-section admin-controls">
        <h3>Создать новый титул</h3>
        <div class="create-title-form">
          <input type="text" id="new-title-name" placeholder="Название титула">
          <textarea id="new-title-desc" placeholder="Описание" rows="2"></textarea>
          <select id="new-title-type">
            <option value="common">Обычный</option>
            <option value="special">Премиальный</option>
          </select>
          <button class="btn-primary" id="btn-create-title">Создать титул</button>
        </div>
      </div>
    `;
  } else {
    const myTitles = userTitles;
    const availableCommon = commonTitles.filter(t => !unlockedTitleIds.includes(t.id));
    const availableSpecial = specialTitles.filter(t => !unlockedTitleIds.includes(t.id));
    
    titlesHTML = `
      <div class="titles-section">
        <h3>Мои титулы</h3>
        <p class="request-hint">Нажмите на титул, чтобы надеть или снять его</p>
        <div class="titles-grid">
          ${myTitles.length === 0 ? '<p>У вас пока нет титулов</p>' : myTitles.map(ut => {
            const isActive = ut.is_active !== false;
            const isSpecial = ut.titles.title_type === 'special';
            return `
              <div class="title-card ${isActive ? 'selected' : ''} ${isSpecial ? 'special' : ''}" data-title-id="${ut.title_id}" data-type="${ut.titles.title_type}" data-unlocked="true">
                <div class="title-name">${escapeHtml(ut.titles.title_name)}</div>
                <div class="title-desc">${escapeHtml(ut.titles.description || '')}</div>
                <div class="title-status">${isActive ? 'Надет' : 'Снят'}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ${availableCommon.length > 0 ? `
        <div class="titles-section">
          <h3>${icon('trophy')} Доступные базовые титулы</h3>
          <p class="request-hint">Нажмите, чтобы получить титул</p>
          <div class="titles-grid">
            ${availableCommon.map(title => `
              <div class="title-card" data-title-id="${title.id}" data-type="common" data-unlocked="false">
                <div class="title-name">${escapeHtml(title.title_name)}</div>
                <div class="title-desc">${escapeHtml(title.description || '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${availableSpecial.length > 0 ? `
        <div class="titles-section">
          <h3>${icon('star')} Особые титулы</h3>
          <p class="request-hint">Нажмите "Запросить", чтобы отправить запрос администратору</p>
          <div class="titles-grid">
            ${availableSpecial.map(title => `
              <div class="title-card requestable" data-title-id="${title.id}">
                <div class="title-name">${escapeHtml(title.title_name)}</div>
                <div class="title-desc">${escapeHtml(title.description || '')}</div>
                <button class="btn-request-title" data-title-id="${title.id}">Запросить</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }
  
  modal.innerHTML = `
    <div class="modal-content titles-modal">
      <span class="close-modal" data-modal="modal-titles-manager">&times;</span>
      <div class="modal-header">
        <h2>Управление титулами</h2>
        <p>Надето: <span id="titles-count">${tempActiveTitles.length}</span> / 3</p>
      </div>
      ${titlesHTML}
      <div class="form-actions">
        <button class="btn-secondary" id="btn-cancel-titles">Отмена</button>
        <button class="btn-primary" id="btn-confirm-titles">Подтвердить</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.querySelector('#btn-cancel-titles').addEventListener('click', () => modal.remove());
  modal.querySelector('#btn-confirm-titles').addEventListener('click', async () => {
    await confirmTitleChanges(profile.id, activeTitleIds, tempActiveTitles, unlockedTitleIds, tempUnlockedTitles);
    modal.remove();
    const { getProfileWithTitles } = await import('./api.js');
    const updatedProfile = await getProfileWithTitles(profile.id);
    renderProfile(updatedProfile, () => renderEditProfileForm(updatedProfile, window.handleSaveProfile));
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelectorAll('.title-card:not(.requestable)').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-title') || e.target.classList.contains('btn-request-title')) return;
      
      const titleId = parseInt(card.dataset.titleId);
      const titleType = card.dataset.type;
      const isUnlocked = card.dataset.unlocked === 'true';
      const isActive = card.classList.contains('selected');
      const currentCount = tempActiveTitles.length;
      
      if (isUnlocked) {
        if (isActive) {
          tempActiveTitles = tempActiveTitles.filter(id => id !== titleId);
          card.classList.remove('selected');
          const statusEl = card.querySelector('.title-status');
          if (statusEl) statusEl.textContent = ' Снят';
        } else {
          if (titleType === 'common' && currentCount >= 3) {
            showNotification('Максимум 3 титула', 'error');
            return;
          }
          tempActiveTitles.push(titleId);
          card.classList.add('selected');
          const statusEl = card.querySelector('.title-status');
          if (statusEl) statusEl.textContent = 'Надет';
        }
      } else {
        if (titleType === 'common' && currentCount >= 3) {
          showNotification('Максимум 3 титула', 'error');
          return;
        }
        tempUnlockedTitles.push(titleId);
        tempActiveTitles.push(titleId);
        card.classList.add('selected');
        card.dataset.unlocked = 'true';
        const statusDiv = document.createElement('div');
        statusDiv.className = 'title-status';
        statusDiv.textContent = 'Надет';
        card.appendChild(statusDiv);
      }
      
      modal.querySelector('#titles-count').textContent = tempActiveTitles.length;
    });
  });
  
  if (isAdmin) {
    modal.querySelectorAll('.btn-delete-title').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const titleId = parseInt(btn.dataset.titleId);
        if (!confirm('Удалить этот титул из системы?')) return;
        try {
          await deleteTitle(titleId);
          showNotification('Титул удалён из системы', 'success');
          modal.remove();
          showTitlesManager(profile);
        } catch (error) {
          showNotification(`Ошибка: ${error.message}`, 'error');
        }
      });
    });
  }
  
  if (!isAdmin) {
    modal.querySelectorAll('.btn-request-title').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const titleId = parseInt(btn.dataset.titleId);
        const reason = prompt('Укажите причину запроса титула:');
        if (!reason || !reason.trim()) return;
        try {
          const { requestTitle } = await import('./api.js');
          await requestTitle(titleId, reason.trim());
          showNotification('Запрос отправлен администратору', 'success');
          btn.disabled = true;
          btn.textContent = 'Запрос отправлен';
        } catch (error) {
          showNotification(`Ошибка: ${error.message}`, 'error');
        }
      });
    });
  }
  
  if (isAdmin) {
    modal.querySelector('#btn-create-title').addEventListener('click', async () => {
      const name = modal.querySelector('#new-title-name').value.trim();
      const desc = modal.querySelector('#new-title-desc').value.trim();
      const type = modal.querySelector('#new-title-type').value;
      if (!name) { showNotification('Введите название титула', 'error'); return; }
      try {
        await createTitle(name, type, desc, '');
        showNotification('Титул создан', 'success');
        modal.remove();
        showTitlesManager(profile);
      } catch (error) {
        showNotification(`Ошибка: ${error.message}`, 'error');
      }
    });
  }
}

async function confirmTitleChanges(userId, oldActiveIds, newActiveIds, oldUnlockedIds, newUnlockedIds) {
  const { toggleUserTitle, addUserTitle } = await import('./api.js');
  
  const newlyUnlocked = newUnlockedIds.filter(id => !oldUnlockedIds.includes(id));
  for (const titleId of newlyUnlocked) {
    try { await addUserTitle(userId, titleId); }
    catch (error) { showNotification(`Ошибка: ${error.message}`, 'error'); return; }
  }
  
  const toDeactivate = oldActiveIds.filter(id => !newActiveIds.includes(id));
  for (const titleId of toDeactivate) {
    try { await toggleUserTitle(userId, titleId, false); }
    catch (error) { showNotification(`Ошибка: ${error.message}`, 'error'); return; }
  }
  
  const toActivate = newActiveIds.filter(id => !oldActiveIds.includes(id));
  for (const titleId of toActivate) {
    try {
      if (oldUnlockedIds.includes(titleId) || newlyUnlocked.includes(titleId)) {
        await toggleUserTitle(userId, titleId, true);
      }
    } catch (error) { showNotification(`Ошибка: ${error.message}`, 'error'); return; }
  }
  
  if (newlyUnlocked.length > 0 || toActivate.length > 0 || toDeactivate.length > 0) {
    showNotification('Титулы обновлены', 'success');
  }
}

// ============================================
// ПРОСМОТР ПРОФИЛЯ ДРУГОГО ПОЛЬЗОВАТЕЛЯ
// ============================================

export async function showUserProfile(userId, currentUserId) {
  const { getProfileWithTitles, getEventsByUser } = await import('./api.js');
  
  const profile = await getProfileWithTitles(userId);
  if (!profile) { showNotification('Пользователь не найден', 'error'); return; }
  
  const userEvents = await getEventsByUser(userId);
  const avatarUrl = getAvatarUrl(profile);
  const titlesText = formatTitles(profile.user_titles);
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.id = 'modal-user-profile';
  
  modal.innerHTML = `
    <div class="modal-content user-profile-modal">
      <span class="close-modal" data-modal="modal-user-profile">&times;</span>
      <div class="profile-card">
        <div class="profile-header">
          <div class="avatar-wrap"><img src="${avatarUrl}" alt="Аватар" class="profile-avatar">${credBadgeHtml(profile)}</div>
          <div class="profile-info">
            <h3>${escapeHtml(profile.full_name || 'Без имени')}</h3>
            ${titlesText ? `<div class="profile-titles">${titlesText}</div>` : ''}
            <p class="profile-location">${icon('pin')} ${escapeHtml(profile.city || 'Локация не указана')}</p>
            <p class="profile-role">${icon('badge')} Роль: ${profile.role}</p>
          </div>
        </div>
        ${profile.bio ? `<div class="profile-bio"><h4>О себе</h4><p>${escapeHtml(profile.bio)}</p></div>` : ''}
      </div>
      <section class="ach-showcase" id="user-achievements"></section>
      <div id="user-quotes">${quoteShelfHtml('Цитаты')}</div>
      <div class="user-events-section">
        <h3>События пользователя (${userEvents.length})</h3>
        <div class="user-events-list">
          ${userEvents.length === 0 ? '<p class="empty-state">У пользователя пока нет событий</p>' : userEvents.map(event => {
            const date = new Date(event.created_at).toLocaleDateString('ru-RU');
            return `
              <div class="user-event-item">
                <div class="user-event-header">
                  <span class="event-date">${date}</span>
                  ${event.city ? `<span class="badge">${icon('pin')} ${escapeHtml(event.city)}</span>` : ''}
                </div>
                <p class="event-text">${escapeHtml(event.event_text)}</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-secondary" id="btn-close-profile">Закрыть</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  renderAchievements(modal.querySelector('#user-achievements'), userId);
  modal.querySelector('[data-wallet]')?.addEventListener('click', () => showWallet(profile, window.vpWalletHandlers?.(profile, () => modal.remove()) || {}));
  renderQuoteShelf(modal.querySelector('#user-quotes'), userId, { own: String(userId) === String(currentUserId), ...(window.vpQuoteHandlers || {}), onEventClick: (ev) => { modal.remove(); window.vpQuoteHandlers?.onEventClick(ev); } });
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.querySelector('#btn-close-profile').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

export function renderEditProfileForm(profile, onSave) {
  const profileContent = document.getElementById('profile-content');
  if (!profileContent) return;
  const avatarUrl = getAvatarUrl(profile);

  profileContent.innerHTML = `
    <div class="profile-card">
      <h3 class="edit-form-title">Редактирование профиля</h3>
      <div class="avatar-section">
        <img src="${avatarUrl}" alt="Аватар" class="profile-avatar" id="avatar-preview">
      </div>
      <form id="form-edit-profile">
        <div class="form-input-group">
          <label for="edit-name">Имя</label>
          <input type="text" id="edit-name" value="${escapeHtml(profile.full_name || '')}" required>
        </div>
        <div class="form-input-group">
          <label for="edit-location">Локация</label>
          <input type="text" id="edit-location" value="${escapeHtml(profile.city || '')}">
        </div>
        <div class="form-input-group">
          <label for="edit-bio">О себе</label>
          <textarea id="edit-bio" rows="4">${escapeHtml(profile.bio || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Сохранить</button>
          <button type="button" class="btn-secondary" id="btn-cancel-edit">Отмена</button>
        </div>
      </form>
    </div>
  `;

  const btnChangeAvatar = document.getElementById('btn-change-avatar');
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');
  if (btnChangeAvatar && avatarInput) {
    btnChangeAvatar.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) { const reader = new FileReader(); reader.onload = (event) => { avatarPreview.src = event.target.result; }; reader.readAsDataURL(file); }
    });
  }
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => renderProfile(profile, () => renderEditProfileForm(profile, onSave)));
  const formEditProfile = document.getElementById('form-edit-profile');
  if (formEditProfile && onSave) formEditProfile.addEventListener('submit', async (e) => { e.preventDefault(); await onSave(); });
}

// Отрисовка событий (с умной кнопкой редактирования)
export function renderEvents(events, currentUserRole, currentUserId, onDeleteEvent, onAuthorClick, onEditEvent) {
  const eventsList = document.getElementById('events-list');
  if (!eventsList) return;
  eventsList.innerHTML = '';
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'moderator';
  if (events.length === 0) { eventsList.innerHTML = '<li class="empty-state">Пока нет событий. Будьте первым!</li>'; return; }

  events.forEach(event => {
    const li = document.createElement('li');
    // D9: в ленте показываем дату события; если её нет — дату добавления с пометкой
    const date = event.event_date
      ? escapeHtml(event.event_date)
      : new Date(event.created_at).toLocaleDateString('ru-RU') + ' <small>(добавлено)</small>';
    const deleteButton = isAdmin ? `<button class="btn-delete-event" data-id="${event.id}">Удалить</button>` : '';
    
    const isAuthor = String(event.user_id) === String(currentUserId);
    // ИСПРАВЛЕНИЕ 2: Админ редактирует только значимые, юзер - свои незначимые
    const canEdit = isAdmin ? event.is_lore_significant : (isAuthor && !event.is_lore_significant);
    const editButton = canEdit ? `<button class="btn-edit-event" data-id="${event.id}">${icon('pencil')} Редактировать</button>` : '';
    
    const authorName = event.profiles?.full_name || 'Аноним';
    const authorId = event.user_id;
    const clickableAuthor = onAuthorClick && authorId 
      ? `<span class="clickable-author" data-user-id="${authorId}">${escapeHtml(authorName)}</span>` 
      : `<strong>${escapeHtml(authorName)}</strong>`;
    const loreBadge = event.is_lore_significant 
      ? `<span class="badge badge-lore"> Значимое</span>` 
      : '';
    const yearBadge = event.year_award ? `<span class="badge badge-year">${icon('trophy')} Событие ${event.year_award} года</span>` : '';
    const chronicleBadge = event.is_in_chronicle 
      ? `<span class="badge badge-chronicle">${icon('check')} В летописи</span>` 
      : '';
    
    li.innerHTML = `
      <div class="event-header">
        ${clickableAuthor}
        <span class="event-date">${date}</span>
      </div>
      <p class="event-text">${escapeHtml(event.event_text)}</p>
      ${eventTagsLine(event)}
      ${event.city ? `<span class="badge">${icon('pin')} ${escapeHtml(event.city)}</span>` : ''}
      ${yearBadge}
      ${loreBadge}
      ${chronicleBadge}
      <button class="event-open" data-id="${event.id}" title="Открыть: реакции и комментарии">
        <span>${icon('like')} ${event.rc?.likes || 0}</span><span>${icon('dislike')} ${event.rc?.dislikes || 0}</span><span>${icon('witness')} ${event.rc?.witnesses || 0}</span><span class="event-open-label">Открыть</span>
      </button>
      ${editButton}
      ${deleteButton}
    `;
    eventsList.appendChild(li);
  });

  if (isAdmin) {
    document.querySelectorAll('.btn-delete-event').forEach(btn => {
      btn.addEventListener('click', async () => { await onDeleteEvent(btn.dataset.id); });
    });
  }

  if (onEditEvent) {
    document.querySelectorAll('.btn-edit-event').forEach(btn => {
      btn.addEventListener('click', () => {
        const event = events.find(e => String(e.id) === String(btn.dataset.id));
        if (event) onEditEvent(event);
      });
    });
  }

  if (onAuthorClick) {
    document.querySelectorAll('.clickable-author').forEach(span => {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        onAuthorClick(span.dataset.userId);
      });
    });
  }
}

export function renderPendingEvents(events, onApprove, onReject) {
  const pendingList = document.getElementById('admin-pending-events');
  if (!pendingList) return;
  pendingList.innerHTML = '';
  if (events.length === 0) { pendingList.innerHTML = '<li class="empty-state">Нет событий на модерации</li>'; return; }

  events.forEach(event => {
    const li = document.createElement('li');
    li.className = 'pending-event-item';
    const date = new Date(event.created_at).toLocaleDateString('ru-RU');
    li.innerHTML = `
      <div class="pending-event-header">
        <strong>${escapeHtml(event.profiles?.full_name || 'Аноним')}</strong>
        <span class="event-date">${date}</span>
      </div>
      <p class="event-text">${escapeHtml(event.event_text)}</p>
      ${event.city ? `<span class="badge">${icon('pin')} ${escapeHtml(event.city)}</span>` : ''}
      ${event.event_date ? `<span class="badge">${icon('calendar')} ${escapeHtml(event.event_date)}</span>` : ''}
      ${event.is_lore_significant ? `<span class="badge badge-lore">${icon('star')} Значимое для летописи</span>` : ''}
      ${event.as_chronicler ? `<span class="badge badge-lore">${icon('scroll')} Просит опубликовать от имени Летописца</span>` : ''}
      <div class="pending-event-actions">
        <button class="btn-approve" data-id="${event.id}">Одобрить</button>
        <button class="btn-reject" data-id="${event.id}">Отклонить</button>
      </div>
    `;
    pendingList.appendChild(li);
  });

  document.querySelectorAll('.btn-approve').forEach(btn => { btn.addEventListener('click', async () => await onApprove(btn.dataset.id)); });
  document.querySelectorAll('.btn-reject').forEach(btn => { btn.addEventListener('click', async () => await onReject(btn.dataset.id)); });
}

function isDeletedMessageExpired(message) {
  if (!message.is_deleted) return false;
  if (!message.deleted_at) return true;
  return (Date.now() - new Date(message.deleted_at).getTime()) > 5 * 60 * 1000;
}

export function renderChatMessages(messages, currentUserId, currentUserRole, onDeleteClick, onAuthorClick) {
  const chatMessagesEl = document.getElementById('chat-messages');
  if (!chatMessagesEl) return;

  chatMessagesEl.innerHTML = '';
  const filteredMessages = messages.filter(msg => !isDeletedMessageExpired(msg));

  if (filteredMessages.length === 0) {
    chatMessagesEl.innerHTML = '<div class="chat-empty">Сообщений пока нет. Напишите первое!</div>';
    return;
  }

  const isModerator = currentUserRole === 'admin' || currentUserRole === 'moderator';

  filteredMessages.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    if (msg.is_deleted) div.classList.add('deleted');
    
    const isOwnMessage = String(msg.user_id) === String(currentUserId);
    const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const canDelete = isOwnMessage || isModerator;
    const deleteBtn = canDelete && !msg.is_deleted 
      ? `<button class="btn-delete-message" data-id="${msg.id}" data-own="${isOwnMessage}">Удалить</button>` 
      : '';
    
    const titlesText = msg.user_titles && msg.user_titles.length > 0
      ? msg.user_titles.map(ut => ut.titles?.title_name || '').filter(s => s.trim()).join(', ')
      : '';
    
    const authorName = msg.profiles?.full_name || 'Аноним';
    const authorId = msg.user_id;
    const clickableAuthor = onAuthorClick && authorId
      ? `<span class="clickable-author" data-user-id="${authorId}">${escapeHtml(authorName)}</span>`
      : `<strong class="chat-author ${isOwnMessage ? 'own' : ''}">${escapeHtml(authorName)}</strong>`;
    
    if (msg.is_deleted) {
      div.innerHTML = `
        <div class="chat-message-header">
          ${clickableAuthor}
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message-text deleted-text">
          Сообщение удалено
          ${msg.delete_reason ? `<br><em>Причина: ${escapeHtml(msg.delete_reason)}</em>` : ''}
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="chat-message-header">
          ${clickableAuthor}
          ${titlesText ? `<span class="chat-titles">[${escapeHtml(titlesText)}]</span>` : ''}
          <span class="chat-time">${time}</span>
          <button class="btn-evidence-message" data-id="${msg.id}" title="Сохранить в улики (видите только вы)" aria-label="В улики">${icon('evidence')}</button>
          ${deleteBtn}
        </div>
        ${msg.card?.type === 'quote'
          ? `<blockquote class="chat-quote">«${escapeHtml(msg.card.quote)}»<cite>${escapeHtml(msg.card.source || '')} · из коллекции ${escapeHtml(msg.card.collector || '')}</cite></blockquote>`
          : `<div class="chat-message-text">${escapeHtml(msg.message_text)}</div>`}
      `;
    }
    
    chatMessagesEl.appendChild(div);
  });

  chatMessagesEl.querySelectorAll('.btn-evidence-message').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const { addEvidence } = await import('./api.js');
        const id = await addEvidence('message', btn.dataset.id);
        showNotification(id ? 'Сообщение сохранено в ваши улики' : 'Это сообщение уже в уликах', 'success');
      } catch (error) { showNotification(`Ошибка: ${error.message}`, 'error'); }
    });
  });

  chatMessagesEl.querySelectorAll('.btn-delete-message').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDeleteClick(btn.dataset.id, btn.dataset.own === 'true', isModerator);
    });
  });

  if (onAuthorClick) {
    chatMessagesEl.querySelectorAll('.clickable-author').forEach(span => {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        onAuthorClick(span.dataset.userId);
      });
    });
  }

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

export function showDeleteReasonModal(messageId, isOwn, isModerator, onConfirm) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.id = 'modal-delete-reason';
  
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-modal" data-modal="modal-delete-reason">&times;</span>
      <div class="modal-header"><h2>Удаление сообщения</h2></div>
      <div class="form-input-group">
        <label for="delete-reason-input">Причина удаления</label>
        <textarea id="delete-reason-input" rows="3" placeholder="Например: нарушение правил..."></textarea>
      </div>
      <div class="form-actions">
        <button class="btn-primary" id="btn-confirm-delete">Удалить с причиной</button>
        <button class="btn-danger" id="btn-hard-delete">Удалить полностью</button>
        <button class="btn-secondary" id="btn-cancel-delete">Отмена</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#btn-cancel-delete').addEventListener('click', () => modal.remove());
  modal.querySelector('#btn-confirm-delete').addEventListener('click', () => {
    onConfirm(messageId, modal.querySelector('#delete-reason-input').value.trim(), 'soft');
    modal.remove();
  });
  const btnHardDelete = modal.querySelector('#btn-hard-delete');
  if (isModerator && !isOwn) {
    btnHardDelete.addEventListener('click', () => { onConfirm(messageId, null, 'hard'); modal.remove(); });
  } else {
    btnHardDelete.style.display = 'none';
  }
}

export function openModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = 'flex'; }
export function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = 'none'; }

export function setupModalCloseHandlers() {
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => { const modal = document.getElementById(btn.dataset.modal); if (modal) modal.style.display = 'none'; });
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  });
}

// ============================================
// ЛЕТОПИСЬ — РЕЖИМ ЧТЕНИЯ
// ============================================

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Превращает текст летописи в HTML: главы (## ...), абзацы, метки событий [[ID|фрагмент]]
// и старые вставки [СОБЫТИЕ: ... | АВТОР: ... | ДАТА: ... | ГОРОД: ...]
export function formatChronicleHtml(text) {
  const legacyRegex = /\[СОБЫТИЕ:\s*(.*?)\s*\|\s*АВТОР:\s*(.*?)\s*\|\s*ДАТА:\s*(.*?)\s*\|\s*ГОРОД:\s*(.*?)\s*\]/g;
  const inline = (raw) => escapeHtml(raw)
    .replace(/\[\[(\d+)\|([^\]]+)\]\]/g, (m, id, frag) => `<span class="chronicle-ref" data-event-id="${id}" title="Нажми, чтобы узнать, кто и когда это записал">${frag}</span>`)
    .replace(legacyRegex, (m, text, author, date, city) =>
      `<span class="chronicle-ref legacy" data-event-text="${text}" data-author="${author}" data-date="${date}" data-city="${city}">${text}</span>`)
    .replace(/\n/g, '<br>');
  return String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).map(block => {
    const heading = block.match(/^#{1,3}\s+(.+?)(?:\n([\s\S]*))?$/);
    if (heading) return `<h3 class="chronicle-chapter">${inline(heading[1])}</h3>` + (heading[2] ? `<p>${inline(heading[2].trim())}</p>` : '');
    return `<p>${inline(block)}</p>`;
  }).join('');
}

export function renderChronicle(chronicle, onEventClick, canonTheories = []) {
  const content = document.getElementById('chronicle-content');
  if (!content) return;

  if (!chronicle || !chronicle.content) {
    content.innerHTML = '<div class="chronicle-empty"><p>Летопись ещё пуста. Здесь скоро появится история Вадимопедии.</p></div>';
    return;
  }

  content.innerHTML = `
    <div class="chronicle-reader">
      <div class="chronicle-header">
        <h2>Летопись Вадимопедии</h2>
        <p class="chronicle-meta">Версия ${chronicle.version} • Обновлено: ${new Date(chronicle.updated_at).toLocaleDateString('ru-RU')}</p>
      </div>
      <div class="chronicle-text">${formatChronicleHtml(chronicle.content)}</div>
    </div>
  `;

  insertCanonCallouts(content.querySelector('.chronicle-text'), canonTheories, onEventClick);

  content.querySelectorAll('.chronicle-ref').forEach(ref => {
    ref.addEventListener('click', () => {
      if (!onEventClick) return;
      if (ref.dataset.eventId) onEventClick({ id: Number(ref.dataset.eventId) });
      else onEventClick({ event_text: ref.dataset.eventText, author: ref.dataset.author, event_date: ref.dataset.date, city: ref.dataset.city });
    });
  });
}

export function renderChronicleEditor(editor, pendingEvents, handlers) {
  const content = document.getElementById('chronicle-content');
  if (!content) return;
  const draft = editor?.draft;
  const published = editor?.published;
  const fmt = d => new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  const status = draft
    ? `Открыт <b>черновик</b> от ${fmt(draft.created_at)} — читатели его не видят, пока вы не опубликуете.`
    : `Открыт <b>опубликованный</b> текст${published?.published_at ? ` (от ${fmt(published.published_at)})` : ''}. Изменения сначала сохраняются черновиком.`;

  content.innerHTML = `
    <div class="chronicle-editor">
      <div class="editor-header">
        <h2>${icon('pencil')} Редактор летописи</h2>
        <div class="editor-actions">
          <button class="btn-primary" id="btn-generate-chronicle">Дописать с ИИ</button>
          <button class="btn-secondary" id="btn-save-chronicle">Сохранить черновик</button>
          <button class="btn-primary" id="btn-publish-chronicle">Опубликовать</button>
          <button class="btn-secondary" id="btn-rollback-chronicle" ${editor?.archived_count ? '' : 'disabled title="Нет прошлых версий"'}>${icon('undo')} Откатить</button>
        </div>
      </div>
      <p class="editor-status" id="editor-status">${status}</p>

      <div class="pending-events-panel">
        <h3>Новые значимые события, ещё не вошедшие в летопись (${pendingEvents.length})</h3>
        ${pendingEvents.length === 0 ? '<p>Нет новых значимых событий</p>' : `
          <div class="pending-events-list">
            ${pendingEvents.map(e => `
              <div class="pending-event-card" data-id="${e.id}">
                <strong>${escapeHtml(e.event_text)}</strong>
                <div class="event-meta">
                  <span>№ ${e.id}</span>
                  ${e.event_date ? `<span>${icon('calendar')} ${escapeHtml(e.event_date)}</span>` : ''}
                  ${e.city ? `<span>${icon('pin')} ${escapeHtml(e.city)}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <section id="insert-review" class="insert-review" hidden aria-live="polite"></section>

      <p class="editor-hint">Главы начинаются с «## ». Абзацы разделяются пустой строкой. Событие отмечается так: [[номер|фраза]] — каждое ровно один раз.</p>
      <textarea id="chronicle-textarea" rows="20" placeholder="Текст летописи...">${escapeHtml(draft?.content ?? published?.content ?? '')}</textarea>

      <details class="editor-preview" open>
        <summary>${icon('eye')} Предпросмотр <small>(новые абзацы подсвечены)</small></summary>
        <div id="chronicle-preview" class="chronicle-text"></div>
      </details>
    </div>
  `;

  const textarea = document.getElementById('chronicle-textarea');
  const preview = document.getElementById('chronicle-preview');
  const publishedParas = new Set((published?.content || '').split(/\n{2,}/).map(t => t.trim()));
  const updatePreview = () => {
    preview.innerHTML = formatChronicleHtml(textarea.value);
    const fresh = textarea.value.split(/\n{2,}/).map(t => t.trim()).filter(t => t && !t.startsWith('## ') && !publishedParas.has(t));
    const freshPlain = new Set(fresh.map(t => t.replace(/\[\[\d+\|([^\]]*)\]\]/g, '$1').slice(0, 80)));
    preview.querySelectorAll('p').forEach(p => { if (freshPlain.has(p.textContent.trim().slice(0, 80))) p.classList.add('chronicle-new'); });
  };
  textarea.addEventListener('input', updatePreview);
  updatePreview();

  document.getElementById('btn-save-chronicle').addEventListener('click', () => handlers.onSaveDraft(textarea.value));
  document.getElementById('btn-publish-chronicle').addEventListener('click', () => {
    if (confirm('Опубликовать этот текст? Читатели увидят его сразу. Прошлая версия сохранится для отката.')) handlers.onPublish(textarea.value);
  });
  document.getElementById('btn-generate-chronicle').addEventListener('click', () => handlers.onGenerate());
  document.getElementById('btn-rollback-chronicle').addEventListener('click', () => {
    if (confirm('Вернуть предыдущую опубликованную версию? Текущая опубликованная будет снята.')) handlers.onRollback();
  });
}

// T2.5: различия по словам (наибольшая общая подпоследовательность). Возвращает [было, стало] в HTML
export function diffWordsHtml(before, after) {
  const a = String(before || '').split(/(\s+)/).filter(Boolean);
  const b = String(after || '').split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 400000) return [escapeHtml(before), escapeHtml(after)];  // слишком длинно — без подсветки
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, l = '', r = '';
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { l += escapeHtml(a[i]); r += escapeHtml(b[j]); i++; j++; }
    else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) { r += /^\s+$/.test(b[j]) ? b[j] : `<ins>${escapeHtml(b[j])}</ins>`; j++; }
    else { l += /^\s+$/.test(a[i]) ? a[i] : `<del>${escapeHtml(a[i])}</del>`; i++; }
  }
  return [l, r];
}

// T2.5: панель «было / стало» для вставки события в середину. Без «Принять» текст редактора не меняется
export function renderInsertReview(result, { onAccept, onReject }) {
  const box = document.getElementById('insert-review');
  if (!box) return;
  // разметку [[номер|фраза]] показываем читаемо: «фраза [№ номер]»
  const plain = t => String(t || '').replace(/\[\[(\d+)\|([^\]]*)\]\]/g, '$2 [№\u00a0$1]');
  const newAt = result.window.findIndex(w => w.id === 'new');
  // неизменённые соседи — только край у места вставки
  const edge = (t, i) => { const x = plain(t); return x.length <= 240 ? x : i < newAt ? '…' + x.slice(-220) : x.slice(0, 220) + '…'; };
  const rows = result.window.map((w, i) => {
    if (w.id === 'new') return `<div class="ir-row ir-new"><div class="ir-cell ir-empty">не было</div><div class="ir-cell"><b class="ir-tag">Новый абзац</b> <ins>${escapeHtml(plain(w.after))}</ins></div></div>`;
    if (w.after == null) return `<div class="ir-row ir-same"><div class="ir-cell"><b class="ir-tag">${w.id} · без изменений</b> ${escapeHtml(edge(w.before, i))}</div></div>`;
    const [l, r] = diffWordsHtml(plain(w.before), plain(w.after));
    return `<div class="ir-row"><div class="ir-cell"><b class="ir-tag">${w.id} · было</b> ${l}</div><div class="ir-cell"><b class="ir-tag">${w.id} · стало</b> ${r}</div></div>`;
  }).join('');
  const changed = result.window.filter(w => w.id !== 'new' && w.after != null).length;
  box.innerHTML = `
    <h3>Вставка события № ${escapeHtml(result.usedIds.join(', '))} в середину летописи</h3>
    <p class="ir-summary">${result.changesMeaning ? 'ИИ считает, что событие <b>меняет смысл</b> соседних абзацев.' : 'Смысл соседних абзацев не меняется, правятся только связки.'}
      Изменено соседних абзацев: ${changed}.${result.note ? ` Пояснение ИИ: «${escapeHtml(result.note)}».` : ''}</p>
    ${result.needsReview ? `<p class="ir-warn">${icon('alert')} Нужна проверка: ИИ не стал менять соседние абзацы. Прочитайте место вставки сами.</p>` : ''}
    <div class="ir-head"><span>Было</span><span>Стало</span></div>
    <div class="ir-rows">${rows}</div>
    <div class="ir-actions">
      <button class="btn-primary" id="btn-insert-accept">Принять вставку</button>
      <button class="btn-secondary" id="btn-insert-reject">Отклонить</button>
    </div>`;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const close = () => { box.hidden = true; box.innerHTML = ''; };
  box.querySelector('#btn-insert-accept').addEventListener('click', () => { close(); onAccept(); });
  box.querySelector('#btn-insert-reject').addEventListener('click', () => { close(); onReject(); });
}

// ============================================
// ЛЕТОПИСЬ — ТАЙМЛАЙН
// ============================================

export function renderTimeline(events, onEventClick) {
  const content = document.getElementById('chronicle-content');
  if (!content) return;

  if (events.length === 0) {
    content.innerHTML = '<div class="chronicle-empty"><p>Пока нет событий для таймлайна.</p></div>';
    return;
  }

  const eventsByYear = {};
  events.forEach(e => {
    let year;
    if (e.event_date) {
      const match = e.event_date.match(/\b(\d{4})\b/);
      year = match ? match[1] : new Date(e.created_at).getFullYear().toString();
    } else {
      year = new Date(e.created_at).getFullYear().toString();
    }
    if (!eventsByYear[year]) eventsByYear[year] = [];
    eventsByYear[year].push(e);
  });

  const years = Object.keys(eventsByYear).sort((a, b) => parseInt(a) - parseInt(b));

  content.innerHTML = `
    <div class="timeline-container">
      <h2>${icon('calendar')} Таймлайн событий</h2>
      <div class="timeline">
        ${years.map(year => `
          <div class="timeline-year">
            <div class="year-marker">${year}</div>
            <div class="year-events">
              ${eventsByYear[year].map(e => `
                <div class="timeline-event" data-id="${e.id}">
                  <div class="event-dot"></div>
                  <div class="event-card">
                    <strong>${escapeHtml(e.event_text)}</strong>
                    <div class="event-meta">
                      <span>${icon('user')} ${escapeHtml(e.profiles?.full_name || 'Аноним')}</span>
                      ${e.event_date ? `<span>${icon('calendar')} ${escapeHtml(e.event_date)}</span>` : ''}
                      ${e.city ? `<span>${icon('pin')} ${escapeHtml(e.city)}</span>` : ''}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  content.querySelectorAll('.timeline-event').forEach(el => {
    el.addEventListener('click', () => {
      const event = events.find(e => e.id === parseInt(el.dataset.id));
      if (event && onEventClick) onEventClick(event);
    });
  });
}

// ============================================
// T2.7: ТЕОРИИ — список ниток между событиями (доска появится в Фазе 3)
// ============================================
const shortText = (t, n = 90) => { const s = String(t || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// карточка теории: пара событий, записка, автор, голоса и толщина нитки (1–5 px по «верю»)
export function theoryCardHtml(t, ctx) {
  const mine = String(t.author_id) === String(ctx.userId);
  const canon = t.status === 'canon';
  const thick = 1 + Math.min(4, t.believe || 0);
  const ev = (id, text, date) => `<button type="button" class="th-event" data-th-event="${id}">${date ? `<span class="th-date">${escapeHtml(date)}</span>` : ''}${escapeHtml(shortText(text))}</button>`;
  const vote = (kind, label, n) => `<button type="button" class="th-vote ${t.my_vote === kind ? 'active' : ''}" data-th-act="vote" data-vote="${kind}" aria-pressed="${t.my_vote === kind}" ${mine ? 'disabled title="За свою теорию голосовать нельзя"' : ''}>${label} <b>${n}</b></button>`;
  const admin = ctx.isAdmin
    ? `<button type="button" class="btn-secondary th-small" data-th-act="status" data-status="${canon ? 'active' : 'canon'}">${canon ? 'Снять канон' : 'Сделать каноном'}</button>` : '';
  const del = (ctx.isAdmin || mine) ? `<button type="button" class="btn-secondary th-small" data-th-act="status" data-status="removed">${icon('trash')} Удалить</button>` : '';
  return `
    <article class="theory-card ${canon ? 'is-canon' : ''}" data-theory-id="${t.id}">
      ${canon ? '<span class="th-stamp">Канон</span>' : ''}
      <div class="th-pair">
        ${ev(t.event_a, t.event_a_text, t.event_a_date)}
        <span class="th-thread" style="--th:${thick}px" title="Толщина нитки — по числу «верю»" aria-hidden="true"></span>
        ${ev(t.event_b, t.event_b_text, t.event_b_date)}
      </div>
      <p class="th-note">«${escapeHtml(t.note)}»</p>
      <div class="th-meta">${icon('user')} ${escapeHtml(t.author_name || 'Аноним')} · ${new Date(t.created_at).toLocaleDateString('ru-RU')}</div>
      <div class="th-actions">
        ${vote('believe', 'Верю', t.believe)}
        ${vote('doubt', 'Не верю', t.doubt)}
        <button type="button" class="btn-bookmark btn-evidence th-small ${ctx.evidence?.has(String(t.id)) ? 'active' : ''}" data-th-act="evidence" title="Тайно сохранить снимок в свои улики">${icon('evidence')} <span>${ctx.evidence?.has(String(t.id)) ? 'В уликах' : 'Улика'}</span></button>
        ${admin}${del}
      </div>
    </article>`;
}

// форма новой теории: два события + записка до 280 знаков. fixedId — событие, из окна которого связываем
export function theoryFormHtml(events, fixedId = null) {
  const opts = (sel) => events.map(e => `<option value="${e.id}" ${String(e.id) === String(sel) ? 'selected' : ''}>${e.event_date ? escapeHtml(e.event_date) + ' — ' : ''}${escapeHtml(shortText(e.event_text, 70))}</option>`).join('');
  return `
    <form class="theory-form" novalidate>
      <label>Первое событие
        <select name="a" ${fixedId ? 'disabled' : ''} required><option value="">— выберите —</option>${opts(fixedId)}</select></label>
      <label>Второе событие
        <select name="b" required><option value="">— выберите —</option>${opts(null)}</select></label>
      <label>Почему они связаны
        <textarea name="note" rows="3" maxlength="280" placeholder="Например: после этого Вадимы и начали…" required></textarea></label>
      <div class="th-form-foot"><span class="th-count">0 / 280</span><button type="submit" class="btn-primary">Протянуть нитку</button></div>
    </form>`;
}

// общие обработчики для списка теорий (и в разделе, и в окне события)
export function bindTheories(root, ctx) {
  // делегирование: форма может перерисовываться после каждого действия
  root.addEventListener('input', (e) => {
    const f = e.target.closest('.theory-form');
    if (f && e.target.name === 'note') f.querySelector('.th-count').textContent = `${e.target.value.length} / 280`;
  });
  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('.theory-form');
    if (!form) return;
    e.preventDefault();
    const a = form.querySelector('[name=a]').value, b = form.querySelector('[name=b]').value, text = form.querySelector('[name=note]').value.trim();
    if (!a || !b) return showNotification('Выберите два события', 'error');
    if (a === b) return showNotification('Нужны два разных события', 'error');
    if (text.length < 3) return showNotification('Напишите, почему события связаны', 'error');
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try { await ctx.onCreate(a, b, text); showNotification('Нитка протянута', 'success'); await ctx.reload(); }
    catch (err) { showNotification(err.message, 'error'); btn.disabled = false; }
  });
  root.addEventListener('click', async (e) => {
    const evBtn = e.target.closest('[data-th-event]');
    if (evBtn) { ctx.onEventClick?.({ id: Number(evBtn.dataset.thEvent) }); return; }
    const btn = e.target.closest('[data-th-act]');
    if (!btn || btn.disabled) return;
    const card = btn.closest('[data-theory-id]');
    const id = Number(card.dataset.theoryId);
    const t = ctx.theories.find(x => x.id === id);
    btn.disabled = true;
    try {
      if (btn.dataset.thAct === 'vote') {
        await ctx.onVote(id, t?.my_vote === btn.dataset.vote ? null : btn.dataset.vote);
      } else if (btn.dataset.thAct === 'status') {
        const s = btn.dataset.status;
        if (s === 'removed' && !confirm('Удалить теорию? Голоса пропадут, у кого она в уликах — останется снимок с пометкой.')) { btn.disabled = false; return; }
        await ctx.onStatus(id, s);
        showNotification(s === 'canon' ? 'Теория признана каноном — она появится в летописи врезкой «Говорят, что…»' : s === 'removed' ? 'Теория удалена' : 'Канон снят', 'success');
      } else if (btn.dataset.thAct === 'evidence') {
        const has = ctx.evidence.has(String(id));
        await ctx.onEvidence(id, has);
        has ? ctx.evidence.delete(String(id)) : ctx.evidence.add(String(id));
        showNotification(has ? 'Убрано из улик' : 'Снимок теории сохранён в ваши улики. Его видите только вы.', 'success');
      }
      await ctx.reload();
    } catch (err) { showNotification(err.message, 'error'); btn.disabled = false; }
  });
}

// раздел «Теории» в летописи
export function renderTheories(theories, events, ctx) {
  const content = document.getElementById('chronicle-content');
  if (!content) return;
  const full = { ...ctx, theories };
  const canon = theories.filter(t => t.status === 'canon');
  const rest = theories.filter(t => t.status !== 'canon');
  content.innerHTML = `
    <div class="theories">
      <div class="theories-head">
        <h2>${icon('theory')} Теории</h2>
        <p class="th-lead">Нитка между двумя событиями и записка, почему они связаны. Чем больше «верю», тем толще нитка. Каноническую теорию админ выносит в летопись врезкой «Говорят, что…». Не больше ${ctx.maxPerDay} теорий в день.</p>
      </div>
      <details class="theory-new" ${theories.length ? '' : 'open'}>
        <summary class="btn-primary">Новая теория</summary>
        ${theoryFormHtml(events)}
      </details>
      ${theories.length === 0 ? '<p class="empty-state">Теорий пока нет. Протяните первую нитку.</p>' : ''}
      ${canon.length ? `<h3 class="th-group">Канон (${canon.length})</h3><div class="theory-list">${canon.map(t => theoryCardHtml(t, full)).join('')}</div>` : ''}
      ${rest.length ? `<h3 class="th-group">На проверке (${rest.length})</h3><div class="theory-list">${rest.map(t => theoryCardHtml(t, full)).join('')}</div>` : ''}
    </div>`;
  bindTheories(content.querySelector('.theories'), full);
}

// врезки «Говорят, что…» в летописи: после абзаца, где позже по тексту упомянуто одно из двух событий
function insertCanonCallouts(root, canon, onEventClick) {
  if (!canon?.length) return;
  const paraOf = id => { const r = root.querySelector(`.chronicle-ref[data-event-id="${id}"]`); return r ? r.closest('p, h3') : null; };
  const all = [...root.querySelectorAll('.chronicle-text > *')];
  for (const t of canon) {
    const ps = [paraOf(t.event_a), paraOf(t.event_b)].filter(Boolean);
    if (!ps.length) continue;  // ни одно событие не вошло в летопись — врезку не ставим
    const after = ps.sort((x, y) => all.indexOf(y) - all.indexOf(x))[0];
    const box = document.createElement('aside');
    box.className = 'chronicle-callout';
    box.innerHTML = `<b class="cc-title">Говорят, что…</b><p>${escapeHtml(t.note)}</p>
      <div class="cc-links">${icon('theory')} Связывает: <button type="button" data-ev="${t.event_a}">№ ${t.event_a}</button> и <button type="button" data-ev="${t.event_b}">№ ${t.event_b}</button> </div><div class="cc-links">Автор теории: ${escapeHtml(t.author_name || 'аноним')}. Это версия, а не факт.</div>`;
    let anchor = after;
    while (anchor.nextElementSibling?.classList.contains('chronicle-callout')) anchor = anchor.nextElementSibling;
    anchor.after(box);
    box.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => onEventClick?.({ id: Number(b.dataset.ev) })));
  }
}

// ============================================
// T2.8: «СОБЫТИЕ ГОДА» — блок над лентой: открытые голосования, ничья, прошлые победители
// ============================================
export function renderYearPolls(box, { polls, states, years, isAdmin }, h) {
  if (!box) return;
  const fmt = d => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const active = polls.filter(p => p.status !== 'closed');
  const winners = polls.filter(p => p.status === 'closed' && p.winner_event);
  const pollHtml = (p) => {
    const st = states[p.year] || { events: [] };
    const tie = p.status === 'tie';
    const expired = !tie && new Date(p.closes_at) <= new Date();
    const top = Math.max(0, ...st.events.map(e => e.votes));
    const rows = st.events.map(e => {
      const mine = String(st.my_vote) === String(e.id);
      const leader = tie && e.votes === top && top > 0;
      let action = '';
      if (tie) action = isAdmin && leader ? `<button class="btn-primary yp-small" data-yp="pick" data-year="${p.year}" data-event="${e.id}">Выбрать победителем</button>` : '';
      else if (mine) action = `<span class="yp-mine">${icon('check')} Ваш голос</span>`;
      else if (e.own) action = '<span class="yp-note">Ваше событие</span>';
      else if (!st.my_vote && !expired) action = `<button class="btn-primary yp-small" data-yp="vote" data-event="${e.id}" data-year="${p.year}">Голосовать</button>`;
      return `<li class="yp-row ${leader ? 'is-leader' : ''}">
        <button type="button" class="yp-event" data-open="${e.id}">${e.event_date ? `<b>${escapeHtml(e.event_date)}</b> ` : ''}${escapeHtml(shortText(e.event_text, 160))}</button>
        <span class="yp-votes" title="Голосов">${e.votes}</span>
        <span class="yp-act">${action}</span></li>`;
    }).join('');
    return `<article class="yp-poll">
      <h3>${icon('trophy')} Событие ${p.year} года</h3>
      <p class="yp-sub">${tie ? `Голосование закрыто: ничья (${top} : ${top}). Победителя выбирает админ.`
        : expired ? 'Время вышло, итог подводится.' : `Голосование до ${fmt(p.closes_at)}. Один голос на человека, за своё событие нельзя.${st.my_vote ? ' Вы уже проголосовали.' : ''}`}</p>
      <details class="yp-fold" ${st.my_vote && !tie ? '' : 'open'}><summary>События ${p.year} года (${st.events.length})</summary>
      <ol class="yp-list">${rows || '<li class="empty-state">Событий этого года нет</li>'}</ol></details>
      ${isAdmin && !tie ? `<button class="btn-secondary yp-small" data-yp="close" data-year="${p.year}">Закрыть сейчас и подвести итог</button>` : ''}
    </article>`;
  };
  const opener = isAdmin ? `<details class="yp-admin"><summary>Открыть голосование «Событие года»</summary>
      ${years.length ? `<div class="yp-open"><select id="yp-year" aria-label="Год">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select>
      <button class="btn-primary yp-small" data-yp="open">Открыть</button></div>
      <p class="yp-note">В списке годы, где есть события и голосования ещё не было. Прошлый календарный год открывается сам.</p>` : '<p class="yp-note">Все годы с событиями уже голосовали.</p>'}</details>` : '';
  const past = winners.length ? `<p class="yp-past">${icon('trophy')} Победители: ${winners.slice(0, 6).map(w => `<button type="button" class="yp-link" data-open="${w.winner_event}">${w.year}</button>`).join(', ')}</p>` : '';
  if (!active.length && !past && !opener) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = active.map(pollHtml).join('') + past + opener;
  box.onclick = async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { h.onEventClick({ id: Number(open.dataset.open) }); return; }
    const btn = e.target.closest('[data-yp]');
    if (!btn || btn.disabled) return;
    const k = btn.dataset.yp, year = btn.dataset.year;
    if (k === 'vote' && !confirm('Отдать голос этому событию? Изменить выбор будет нельзя.')) return;
    if (k === 'close' && !confirm(`Закрыть голосование за ${year} год сейчас?`)) return;
    btn.disabled = true;
    try {
      if (k === 'vote') { await h.onVote(btn.dataset.event); showNotification('Голос учтён', 'success'); }
      if (k === 'open') { const y = box.querySelector('#yp-year').value; await h.onOpen(y); showNotification(`Голосование за ${y} год открыто`, 'success'); }
      if (k === 'close' || k === 'pick') {
        const r = await h.onClose(year, k === 'pick' ? btn.dataset.event : null);
        showNotification(r === 'tie' ? 'Ничья — выберите победителя среди лидеров' : r === 'no_votes' ? 'Голосов не было — закрыто без победителя' : r === 'winner_no_author' ? 'Итог подведён. У события нет автора-участника, титул не выдан' : 'Итог подведён, автор получил титул «Событие года»', 'success');
      }
      await h.reload();
    } catch (err) { showNotification(err.message, 'error'); btn.disabled = false; }
  };
}

// ============================================
// T2.9: КОЛЛЕКЦИЯ ЦИТАТ — выделить фразу в событии или летописи → «В коллекцию»; полка в профиле
// ============================================
const QUOTE_MAX = 300;
// где можно брать цитату: текст летописи (режим чтения) и текст события в его окне
function quoteSourceOf(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  const ev = el?.closest('#modal-event-detail .event-detail-header h3');
  if (ev) { const id = Number(ev.closest('[data-event-id]')?.dataset.eventId); return id ? { source: 'event', eventId: id, root: ev } : null; }
  const ch = el?.closest('.chronicle-reader .chronicle-text');
  if (ch) return { source: 'chronicle', root: ch };
  return null;
}

export function setupQuoteCapture(onSave) {
  if (document.getElementById('quote-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'quote-fab'; fab.type = 'button'; fab.className = 'quote-fab'; fab.hidden = true;
  document.body.appendChild(fab);
  let pick = null;
  const update = () => {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, ' ').trim() : '';
    const a = sel?.anchorNode && quoteSourceOf(sel.anchorNode), b = sel?.focusNode && quoteSourceOf(sel.focusNode);
    if (!text || text.length < 3 || !a || !b || a.root !== b.root) { fab.hidden = true; pick = null; return; }
    pick = { ...a, text };
    if (a.source === 'chronicle') {  // фраза целиком внутри метки события — запомним событие
      const ra = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('.chronicle-ref');
      const rb = (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement).closest('.chronicle-ref');
      pick.eventId = ra && ra === rb ? ra.dataset.eventId : null;
    }
    const long = text.length > QUOTE_MAX;
    fab.disabled = long;
    fab.innerHTML = long ? `Слишком длинно: ${text.length} / ${QUOTE_MAX}` : `${icon('scroll')} В коллекцию <small>${text.length} / ${QUOTE_MAX}</small>`;
    fab.hidden = false;
  };
  let t = null;
  document.addEventListener('selectionchange', () => { clearTimeout(t); t = setTimeout(update, 150); });
  fab.addEventListener('mousedown', e => e.preventDefault());  // не сбрасывать выделение
  fab.addEventListener('click', async () => {
    if (!pick || fab.disabled) return;
    fab.disabled = true;
    try {
      await onSave(pick.text, pick.eventId || null, pick.source);
      showNotification('Цитата добавлена в коллекцию — она на полке в профиле', 'success');
      window.getSelection()?.removeAllRanges(); fab.hidden = true;
    } catch (err) { showNotification(err.message, 'error'); }
    fab.disabled = false;
  });
}

// полка цитат: своя (с кнопками «В чат» и «Удалить») или чужая (только чтение)
export async function renderQuoteShelf(box, userId, { own, onShare, onDelete, onEventClick }) {
  if (!box) return;
  const { getQuotes } = await import('./api.js');
  const quotes = await getQuotes(userId);
  const head = box.querySelector('.qs-count');
  if (head) head.textContent = `(${quotes.length})`;
  const list = box.querySelector('.qs-list');
  list.innerHTML = quotes.length ? quotes.map(q => `
    <li class="qs-item" data-id="${q.id}">
      <blockquote>«${escapeHtml(q.quote_text)}»</blockquote>
      <div class="qs-meta">
        ${q.event_id ? `<button type="button" class="qs-src" data-ev="${q.event_id}">${escapeHtml(q.source || '')}</button>` : `<span>${escapeHtml(q.source || '')}</span>`}
        · ${new Date(q.created_at).toLocaleDateString('ru-RU')}
        ${own ? `<span class="qs-actions"><button type="button" class="btn-secondary qs-btn" data-q="share">В чат</button><button type="button" class="btn-secondary qs-btn" data-q="del" aria-label="Удалить цитату">${icon('trash')}</button></span>` : ''}
      </div>
    </li>`).join('') : `<li class="empty-state">${own ? 'Полка пуста. Выделите фразу в событии или в летописи и нажмите «В коллекцию».' : 'Цитат пока нет'}</li>`;
  list.onclick = async (e) => {
    const src = e.target.closest('[data-ev]');
    if (src) { onEventClick?.({ id: Number(src.dataset.ev) }); return; }
    const btn = e.target.closest('[data-q]');
    if (!btn) return;
    const id = Number(btn.closest('[data-id]').dataset.id);
    btn.disabled = true;
    try {
      if (btn.dataset.q === 'share') { await onShare(id); showNotification('Цитата отправлена в чат карточкой', 'success'); btn.disabled = false; }
      else if (confirm('Убрать цитату с полки? Карточки в чате останутся.')) { await onDelete(id); await renderQuoteShelf(box, userId, { own, onShare, onDelete, onEventClick }); }
      else btn.disabled = false;
    } catch (err) { showNotification(err.message, 'error'); btn.disabled = false; }
  };
}

export const quoteShelfHtml = (title) => `<details class="quote-shelf" open><summary>${icon('scroll')} ${title} <span class="qs-count"></span></summary><ul class="qs-list"><li>Загрузка…</li></ul></details>`;

// ============================================
// T2.10: УДОСТОВЕРЕНИЯ (кошелёк, бейдж) и ВИТРИНА ДОСТИЖЕНИЙ
// ============================================
const credNo = n => '№ ' + String(n || 0).padStart(4, '0');
const validCreds = uts => (uts || []).filter(ut => ut?.titles && !ut.revoked_at);
// «верхний» титул: премиальный раньше обычного, затем более свежий
function topCred(uts) {
  return validCreds(uts).sort((a, b) => (b.titles.title_type === 'special') - (a.titles.title_type === 'special') || new Date(b.granted_at) - new Date(a.granted_at))[0];
}

// бейдж на аватаре: верхний титул и число остальных
export function credBadgeHtml(profile) {
  const all = (profile.user_titles || []).filter(ut => ut?.titles);
  if (!all.length) return '';
  const top = topCred(all) || all[0];
  const more = validCreds(all).length - (top.revoked_at ? 0 : 1);
  return `<button type="button" class="cred-badge" data-wallet title="Открыть кошелёк удостоверений" aria-label="Удостоверения: ${all.length}">
    <span class="cb-name">${escapeHtml(top.titles.title_name)}</span>${more > 0 ? `<span class="cb-more">+${more}</span>` : ''}</button>`;
}

// кошелёк: веер удостоверений; админ может отозвать или вернуть
export function showWallet(profile, { isAdmin, onRevoke, onChanged } = {}) {
  const creds = (profile.user_titles || []).filter(ut => ut?.titles).sort((a, b) => !!a.revoked_at - !!b.revoked_at || new Date(a.granted_at) - new Date(b.granted_at));
  const modal = document.createElement('div');
  modal.className = 'modal'; modal.style.display = 'flex'; modal.id = 'modal-wallet';
  const card = (ut, i) => `
    <article class="cred-card ${ut.titles.title_type === 'special' ? 'is-special' : ''} ${ut.revoked_at ? 'is-revoked' : ''}" style="--i:${i}">
      <div class="cred-top"><span>Удостоверение</span><b class="cred-no">${credNo(ut.serial)}</b></div>
      <h4>${escapeHtml(ut.titles.title_name)}</h4>
      <p class="cred-holder">${escapeHtml(profile.full_name || 'Без имени')}</p>
      <p class="cred-meta">${ut.titles.title_type === 'special' ? 'Премиальный' : 'Обычный'} · выдано ${ut.granted_at ? new Date(ut.granted_at).toLocaleDateString('ru-RU') : '—'}</p>
      ${ut.titles.grants_authority?.length ? `<p class="cred-meta">Полномочия: ${escapeHtml(ut.titles.grants_authority.join(', '))}</p>` : ''}
      ${ut.revoked_at ? `<span class="cred-stamp">Отозвано ${new Date(ut.revoked_at).toLocaleDateString('ru-RU')}</span>` : ''}
      ${isAdmin && ut.id ? `<button type="button" class="btn-secondary cred-act" data-ut="${ut.id}" data-revoke="${ut.revoked_at ? 'false' : 'true'}">${ut.revoked_at ? 'Вернуть' : 'Отозвать'}</button>` : ''}
    </article>`;
  modal.innerHTML = `
    <div class="modal-content wallet-modal">
      <span class="close-modal">&times;</span>
      <h3>${icon('badge')} Кошелёк: ${escapeHtml(profile.full_name || '')}</h3>
      <p class="wallet-hint">Номер удостоверения — порядковый номер выдачи этого титула: чем меньше, тем раньше получен.</p>
      <div class="wallet-fan">${creds.length ? creds.map(card).join('') : '<p class="empty-state">Удостоверений пока нет</p>'}</div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.close-modal').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelectorAll('.cred-act').forEach(btn => btn.addEventListener('click', async () => {
    const revoke = btn.dataset.revoke === 'true';
    if (revoke && !confirm('Отозвать удостоверение? Оно станет недействительным при проверке.')) return;
    btn.disabled = true;
    try { await onRevoke(btn.dataset.ut, revoke); showNotification(revoke ? 'Удостоверение отозвано' : 'Удостоверение снова действует', 'success'); close(); onChanged?.(); }
    catch (err) { showNotification(err.message, 'error'); btn.disabled = false; }
  }));
}

// витрина достижений: открытые цветом с датой, закрытые — серым с условием
export async function renderAchievements(box, userId) {
  if (!box) return;
  const { getAchievements } = await import('./api.js');
  const { defs, mine } = await getAchievements(userId);
  const got = defs.filter(d => mine[d.code]).length;
  box.innerHTML = `
    <h4 class="ach-head">${icon('trophy')} Достижения <small>${got} из ${defs.length}</small></h4>
    <ul class="ach-grid">${defs.map(d => {
      const at = mine[d.code];
      return `<li class="ach ${at ? 'is-got' : 'is-locked'}" title="${escapeHtml(d.description)}">
        <span class="ach-ic">${icon(d.icon)}</span>
        <span class="ach-txt"><b>${escapeHtml(d.title)}</b><small>${at ? 'получено ' + new Date(at).toLocaleDateString('ru-RU') : escapeHtml(d.description)}</small></span></li>`;
    }).join('')}</ul>`;
}

// новые достижения с прошлого визита — короткое уведомление (первый раз молча запоминаем)
export async function announceNewAchievements(userId) {
  const { getAchievements } = await import('./api.js');
  const { defs, mine } = await getAchievements(userId);
  const key = 'vp-ach-seen-' + userId;
  const seen = JSON.parse(localStorage.getItem(key) || 'null');
  const codes = Object.keys(mine);
  localStorage.setItem(key, JSON.stringify(codes));
  if (!seen) return;
  const fresh = defs.filter(d => mine[d.code] && !seen.includes(d.code));
  if (fresh.length) showNotification(`Новое достижение: ${fresh.map(d => d.title).join(', ')}`, 'success');
}

// ============================================
// ЛЕТОПИСЬ — ЗАКЛАДКИ
// ============================================

export function renderBookmarks(bookmarks, onEventClick) {
  const content = document.getElementById('chronicle-content');
  if (!content) return;

  if (bookmarks.length === 0) {
    content.innerHTML = '<div class="chronicle-empty"><p>У вас пока нет закладок. Добавьте события в закладки, чтобы быстро к ним возвращаться.</p></div>';
    return;
  }

  content.innerHTML = `
    <div class="bookmarks-container">
      <h2>${icon('bookmark')} Мои закладки</h2>
      <div class="bookmarks-list">
        ${bookmarks.map(e => `
          <div class="bookmark-card" data-id="${e.id}">
            <div class="bookmark-header">
              <strong>${escapeHtml(e.profiles?.full_name || 'Аноним')}</strong>
              <span class="event-date">${new Date(e.created_at).toLocaleDateString('ru-RU')}</span>
            </div>
            <p class="event-text">${escapeHtml(e.event_text)}</p>
            <div class="event-meta">
              ${e.event_date ? `<span>${icon('calendar')} ${escapeHtml(e.event_date)}</span>` : ''}
              ${e.city ? `<span>${icon('pin')} ${escapeHtml(e.city)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  content.querySelectorAll('.bookmark-card').forEach(el => {
    el.addEventListener('click', () => {
      const event = bookmarks.find(e => e.id === parseInt(el.dataset.id));
      if (event && onEventClick) onEventClick(event);
    });
  });
}

// ============================================
// МОДАЛКА СОБЫТИЯ (реакции БЕЗ МИГАНИЯ)
// ============================================

const REACTIONS = [
  { type: 'like', label: 'Нравится' },
  { type: 'dislike', label: 'Не нравится' },
  { type: 'witness', label: 'Я свидетель' }
];

function reactionsHtml(reactions, currentUserId, isOwnEvent) {
  const count = t => reactions.filter(r => r.type === t).length;
  const mine = t => reactions.some(r => r.type === t && String(r.user_id) === String(currentUserId));
  const witnesses = reactions.filter(r => r.type === 'witness').map(r => r.profiles?.full_name || 'Аноним');
  return `
    <h4>Реакции</h4>
    <div class="reactions-list">
      ${REACTIONS.map(({ type, label }) => `
        <button class="reaction-btn ${mine(type) ? 'active' : ''}" data-type="${type}" aria-pressed="${mine(type)}" ${isOwnEvent ? 'disabled' : ''} title="${label}">
          ${icon(type)} <span>${label}</span> <b class="reaction-count">${count(type) || ''}</b>
        </button>`).join('')}
    </div>
    ${isOwnEvent ? '<p class="reactions-hint">Это ваше событие — реакции на своё ставить нельзя.</p>' : ''}
    ${witnesses.length ? `<p class="witness-list">${icon('witness')} Очевидцы: ${witnesses.map(escapeHtml).join(', ')}</p>` : ''}`;
}

// T2.2: список улик в своём профиле
export async function renderEvidenceList() {
  const box = document.getElementById('evidence-list');
  if (!box) return;
  const { getMyEvidence, removeEvidence } = await import('./api.js');
  let items;
  try { items = await getMyEvidence(); } catch (err) { box.innerHTML = `<p>Не удалось загрузить: ${escapeHtml(err.message)}</p>`; return; }
  if (!items.length) { box.innerHTML = '<p class="empty-state">Пока пусто. Нажмите «Улика» в событии или значок папки у сообщения в чате.</p>'; return; }
  box.innerHTML = `<ul class="evidence-items">${items.map(ev => `
    <li class="evidence-item ${ev.original_deleted ? 'is-deleted' : ''}">
      <div class="evidence-meta">
        <span>${ev.target_type === 'event' ? 'Событие' : 'Сообщение'}</span>
        <strong>${escapeHtml(ev.snapshot_author || 'Аноним')}</strong>
        <span>${escapeHtml(ev.snapshot_date || new Date(ev.original_created_at || ev.created_at).toLocaleDateString('ru-RU'))}</span>
        ${ev.original_deleted ? '<span class="evidence-deleted">оригинал удалён</span>' : ''}
      </div>
      <p>${escapeHtml(ev.snapshot_text)}</p>
      <div class="evidence-foot">
        <small>Хранится до ${new Date(ev.expires_at).toLocaleDateString('ru-RU')}</small>
        <button class="btn-secondary btn-remove-evidence" data-type="${ev.target_type}" data-id="${escapeHtml(ev.target_id)}">Убрать</button>
      </div>
    </li>`).join('')}</ul>`;
  box.querySelectorAll('.btn-remove-evidence').forEach(btn => btn.addEventListener('click', async () => {
    try { await removeEvidence(btn.dataset.type, btn.dataset.id); renderEvidenceList(); }
    catch (err) { showNotification(`Ошибка: ${err.message}`, 'error'); }
  }));
}

export async function showEventModal(event, currentUserId, onReaction, onComment, onBookmark, onDeleteComment, theoryCtx = null) {
  const { getEventReactions, getEventComments } = await import('./api.js');
  
  const reactions = await getEventReactions(event.id);
  const comments = await getEventComments(event.id);

  const { hasEvidence, addEvidence, removeEvidence } = await import('./api.js');
  let hasEv = await hasEvidence('event', event.id);
  const isOwnEvent = currentUserId && (String(event.user_id) === String(currentUserId) || String(event.submitted_by) === String(currentUserId));
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.id = 'modal-event-detail';

  modal.innerHTML = `
    <div class="modal-content event-modal" data-event-id="${event.id}">
      <span class="close-modal" data-modal="modal-event-detail">&times;</span>
      <div class="event-detail-header">
        <h3>${escapeHtml(event.event_text)}</h3>
        <div class="event-detail-meta">
          <span>${icon('user')} ${escapeHtml(event.profiles?.full_name || 'Аноним')}</span>
          ${event.event_date ? `<span>${icon('calendar')} ${escapeHtml(event.event_date)}</span>` : ''}
          <button class="btn-secondary share-btn" data-share="${encodeURIComponent((event.event_date ? event.event_date + ' — ' : '') + event.event_text)}">Поделиться</button>
          ${event.city ? `<span> ${escapeHtml(event.city)}</span>` : ''}
        </div>
        ${eventTagsLine(event)}
      </div>

      <div class="reactions-section" id="reactions-section">${reactionsHtml(reactions, currentUserId, isOwnEvent)}</div>

      <div class="bookmark-section">
        <button class="btn-bookmark" id="btn-toggle-bookmark">
          ${icon('bookmark')} Добавить в закладки
        </button>
        <button class="btn-bookmark btn-evidence ${hasEv ? 'active' : ''}" id="btn-toggle-evidence" aria-pressed="${hasEv}" title="Тайно сохранить снимок в свои улики">
          ${icon('evidence')} <span>${hasEv ? 'В уликах' : 'Улика'}</span>
        </button>
      </div>

      ${theoryCtx ? '<div class="theories-section" id="event-theories"></div>' : ''}

      <div class="comments-section">
        <h4>Комментарии (${comments.length})</h4>
        <div class="comments-list" id="comments-list">
          ${comments.length === 0 ? '<p class="empty-state">Пока нет комментариев</p>' : comments.map(c => `
            <div class="comment-item" data-id="${c.id}">
              <div class="comment-header">
                <strong>${escapeHtml(c.profiles?.full_name || 'Аноним')}</strong>
                <span class="comment-date">${new Date(c.created_at).toLocaleDateString('ru-RU')}</span>
                ${c.user_id === currentUserId ? `<button class="btn-delete-comment" data-id="${c.id}">${icon('trash')} </button>` : ''}
              </div>
              <p class="comment-text">${escapeHtml(c.comment_text)}</p>
            </div>
          `).join('')}
        </div>
        <div class="comment-form">
          <textarea id="comment-input" rows="2" placeholder="Написать комментарий..."></textarea>
          <button class="btn-primary" id="btn-submit-comment">Отправить</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // T2.1: реакции — после нажатия перечитываем их из базы (счётчики и список очевидцев)
  const reactBox = modal.querySelector('#reactions-section');
  reactBox.addEventListener('click', async (e) => {
    const btn = e.target.closest('.reaction-btn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      await onReaction(event.id, btn.dataset.type);
      reactBox.innerHTML = reactionsHtml(await getEventReactions(event.id), currentUserId, isOwnEvent);
      window.dispatchEvent(new CustomEvent('vp:reactions-changed'));
    } catch (error) {
      showNotification(`Ошибка: ${error.message}`, 'error');
      btn.disabled = false;
    }
  });

  // T2.7: теории по событию + «Связать с другим событием»
  const thBox = modal.querySelector('#event-theories');
  if (thBox) {
    const ctx = { ...theoryCtx, onEventClick: (ev) => { modal.remove(); theoryCtx.onEventClick?.(ev); } };
    const drawTheories = async () => {
      const list = (await theoryCtx.load(event.id)).filter(t => t.status !== 'removed');
      ctx.theories = list;
      const others = (theoryCtx.events || []).filter(e => e.id !== event.id);
      thBox.innerHTML = `
        <h4>${icon('theory')} Теории (${list.length})</h4>
        ${list.length ? `<div class="theory-list">${list.map(t => theoryCardHtml(t, ctx)).join('')}</div>` : '<p class="empty-state">Это событие ещё ни с чем не связано</p>'}
        ${event.is_approved === false ? '' : `<details class="theory-new"><summary class="btn-secondary">Связать с другим событием</summary>${theoryFormHtml([event, ...others], event.id)}</details>`}`;
    };
    ctx.reload = drawTheories;
    await drawTheories();
    bindTheories(thBox, ctx);
  }

  modal.querySelector('#btn-toggle-evidence').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      if (hasEv) await removeEvidence('event', event.id); else await addEvidence('event', event.id);
      hasEv = !hasEv;
      btn.classList.toggle('active', hasEv); btn.setAttribute('aria-pressed', hasEv);
      btn.querySelector('span').textContent = hasEv ? 'В уликах' : 'Улика';
      showNotification(hasEv ? 'Снимок сохранён в ваши улики. Его видите только вы.' : 'Убрано из улик', 'success');
    } catch (error) { showNotification(`Ошибка: ${error.message}`, 'error'); }
  });

  modal.querySelector('#btn-toggle-bookmark').addEventListener('click', async () => {
    try {
      const result = await onBookmark(event.id);
      const btn = modal.querySelector('#btn-toggle-bookmark');
      btn.textContent = result.action === 'added' ? 'В закладках' : 'Добавить в закладки';
    } catch (error) {
      showNotification(`Ошибка: ${error.message}`, 'error');
    }
  });

  modal.querySelector('#btn-submit-comment').addEventListener('click', async () => {
    const input = modal.querySelector('#comment-input');
    const text = input.value.trim();
    if (!text) return;
    try {
      const comment = await onComment(event.id, text);
      input.value = '';
      const commentsList = modal.querySelector('#comments-list');
      if (commentsList.querySelector('.empty-state')) commentsList.innerHTML = '';
      const commentEl = document.createElement('div');
      commentEl.className = 'comment-item';
      commentEl.dataset.id = comment.id;
      commentEl.innerHTML = `
        <div class="comment-header">
          <strong>Вы</strong>
          <span class="comment-date">${new Date(comment.created_at).toLocaleDateString('ru-RU')}</span>
          <button class="btn-delete-comment" data-id="${comment.id}">️</button>
        </div>
        <p class="comment-text">${escapeHtml(comment.comment_text)}</p>
      `;
      commentsList.appendChild(commentEl);
      commentEl.querySelector('.btn-delete-comment').addEventListener('click', async () => {
        try {
          await onDeleteComment(comment.id);
          commentEl.remove();
        } catch (error) {
          showNotification(`Ошибка: ${error.message}`, 'error');
        }
      });
    } catch (error) {
      showNotification(`Ошибка: ${error.message}`, 'error');
    }
  });

  modal.querySelectorAll('.btn-delete-comment').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await onDeleteComment(parseInt(btn.dataset.id));
        btn.closest('.comment-item').remove();
      } catch (error) {
        showNotification(`Ошибка: ${error.message}`, 'error');
      }
    });
  });

}

// T1.6: кампания и участники события
export function eventTagsLine(event) {
  const people = (event.participants || []).map(p => p.person?.name).filter(Boolean);
  const parts = [];
  if (event.campaign?.name) parts.push(`<span class="badge badge-campaign">${escapeHtml(event.campaign.name)}</span>`);
  if (people.length) parts.push(`<span class="event-people">${icon('user')} ${people.map(escapeHtml).join(', ')}</span>`);
  return parts.length ? `<div class="event-tags">${parts.join(' ')}</div>` : '';
}

export function eventTagsPickerHtml(prefix, persons = [], campaigns = [], event = {}) {
  const selPeople = new Set((event.participants || []).map(p => p.person?.id));
  const campId = event.campaign?.id || event.campaign_id || '';
  return `
    <div class="form-input-group">
      <label for="${prefix}-campaign">Кампания (необязательно)</label>
      <select id="${prefix}-campaign">
        <option value="">— не указана —</option>
        ${campaigns.map(c => `<option value="${c.id}" ${c.id === campId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    ${persons.length ? `<fieldset class="form-input-group people-picker" id="${prefix}-people">
      <legend>Участники (необязательно)</legend>
      ${persons.map(p => `<label class="people-chip"><input type="checkbox" value="${p.id}" ${selPeople.has(p.id) ? 'checked' : ''}> ${escapeHtml(p.name)}</label>`).join('')}
    </fieldset>` : ''}`;
}

export function readEventTags(root, prefix) {
  const campaignId = root.querySelector(`#${prefix}-campaign`)?.value || null;
  const personIds = [...root.querySelectorAll(`#${prefix}-people input:checked`)].map(i => i.value);
  return { campaignId, personIds };
}

// Новая функция: модалка редактирования события
export function showEditEventModal(event, onSave, isValidDate, isValidCity, lists = {}) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.id = 'modal-edit-event';
  
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-modal" data-modal="modal-edit-event">&times;</span>
      <div class="modal-header">
        <h2>Редактировать событие</h2>
      </div>
      <div class="form-input-group">
        <label for="edit-event-text">Текст события</label>
        <textarea id="edit-event-text" rows="3">${escapeHtml(event.event_text)}</textarea>
      </div>
      <div class="form-input-group">
        <label for="edit-event-city">Место</label>
        <input type="text" id="edit-event-city" value="${escapeHtml(event.city || '')}" placeholder="Город, например: Коломна">
      </div>
      <div class="form-input-group">
        <label for="edit-event-date">Дата события</label>
        <input type="text" id="edit-event-date" value="${escapeHtml(event.event_date || '')}" placeholder="Например: 15 марта 2024, 07.2049 или 2049">
      </div>
      ${eventTagsPickerHtml('edit-event', lists.persons, lists.campaigns, event)}
      <div class="form-actions">
        <button class="btn-primary" id="btn-save-event">Сохранить</button>
        <button class="btn-secondary" id="btn-cancel-edit-event">Отмена</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.querySelector('#btn-cancel-edit-event').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#btn-save-event').addEventListener('click', async () => {
    const text = modal.querySelector('#edit-event-text').value.trim();
    const city = modal.querySelector('#edit-event-city').value.trim();
    const date = modal.querySelector('#edit-event-date').value.trim();
    
    if (!text) {
      showNotification('Текст события не может быть пустым', 'error');
      return;
    }
    
    if (date && isValidDate && !isValidDate(date)) {
      showNotification('Неверная дата. Примеры: "15.03.2024", "15 марта 2024", "2024"', 'error');
      return;
    }
    
    if (city && isValidCity && !isValidCity(city)) {
      showNotification('Неверный формат города. Используйте только буквы (например: "Москва", "Нью-Йорк")', 'error');
      return;
    }
    
    try {
      const tags = readEventTags(modal, 'edit-event');
      const updates = { event_text: text, city: city || null, event_date: date || null };
      if (modal.querySelector('#edit-event-campaign')) updates.campaign_id = tags.campaignId;
      await onSave(event.id, updates, modal.querySelector('#edit-event-people') ? tags.personIds : null);
      showNotification('Событие обновлено!', 'success');
      modal.remove();
    } catch (error) {
      showNotification(`Ошибка: ${error.message}`, 'error');
    }
  });
}