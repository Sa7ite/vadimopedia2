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
  if (profile.avatar_url) return profile.avatar_url;
  const words = (profile.full_name || 'Вадим').match(/[A-Za-zА-Яа-яЁё0-9]+/g) || ['В'];
  const initials = words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="#6a11cb"/><text x="75" y="75" font-family="Arial" font-size="60" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function formatTitles(userTitles) {
  if (!userTitles || !Array.isArray(userTitles) || userTitles.length === 0) return '';
  const activeTitles = userTitles.filter(ut => ut && ut.titles && ut.is_active !== false);
  if (activeTitles.length === 0) return '';
  return activeTitles.map(ut => ut.titles.title_name).join(', ');
}

export function renderProfile(profile, onEditClick) {
  const profileContent = document.getElementById('profile-content');
  if (!profileContent || !profile) return;

  const avatarUrl = getAvatarUrl(profile);
  const titlesText = formatTitles(profile.user_titles);

  profileContent.innerHTML = `
    <div class="profile-card">
      <div class="profile-header">
        <img src="${avatarUrl}" alt="Аватар" class="profile-avatar">
        <div class="profile-info">
          <h3>${profile.full_name || 'Без имени'}</h3>
          ${titlesText ? `<div class="profile-titles">${titlesText}</div>` : ''}
          <p class="profile-location">📍 ${profile.city || 'Локация не указана'}</p>
          <p class="profile-role">🎭 Роль: ${profile.role}</p>
        </div>
      </div>
      ${profile.bio ? `<div class="profile-bio"><h4>О себе</h4><p>${profile.bio}</p></div>` : ''}
      <div class="profile-actions">
        <button class="btn-primary" id="btn-edit-profile">Редактировать профиль</button>
        <button class="btn-secondary" id="btn-manage-titles">Управление титулами</button>
        <button class="btn-danger" id="btn-logout">Выйти</button>
      </div>
    </div>
  `;

  const btnEditProfile = document.getElementById('btn-edit-profile');
  if (btnEditProfile && onEditClick) btnEditProfile.addEventListener('click', () => onEditClick());

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
        <h3>🏆 Базовые титулы</h3>
        <div class="titles-grid">
          ${commonTitles.map(title => {
            const isActive = tempActiveTitles.includes(title.id);
            return `
              <div class="title-card ${isActive ? 'selected' : ''}" data-title-id="${title.id}" data-type="common">
                <div class="title-name">${title.title_name}</div>
                <div class="title-desc">${title.description || ''}</div>
                <button class="btn-delete-title" data-title-id="${title.id}">🗑️ Удалить</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="titles-section">
        <h3>⭐ Особые титулы</h3>
        <div class="titles-grid">
          ${specialTitles.map(title => {
            const isActive = tempActiveTitles.includes(title.id);
            return `
              <div class="title-card special ${isActive ? 'selected' : ''}" data-title-id="${title.id}" data-type="special">
                <div class="title-name">${title.title_name}</div>
                <div class="title-desc">${title.description || ''}</div>
                <button class="btn-delete-title" data-title-id="${title.id}">🗑️ Удалить</button>
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
                <div class="title-name">${ut.titles.title_name}</div>
                <div class="title-desc">${ut.titles.description || ''}</div>
                <div class="title-status">${isActive ? '✅ Надет' : '⬜ Снят'}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ${availableCommon.length > 0 ? `
        <div class="titles-section">
          <h3>🏆 Доступные базовые титулы</h3>
          <p class="request-hint">Нажмите, чтобы получить титул</p>
          <div class="titles-grid">
            ${availableCommon.map(title => `
              <div class="title-card" data-title-id="${title.id}" data-type="common" data-unlocked="false">
                <div class="title-name">${title.title_name}</div>
                <div class="title-desc">${title.description || ''}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${availableSpecial.length > 0 ? `
        <div class="titles-section">
          <h3>⭐ Особые титулы</h3>
          <p class="request-hint">Нажмите "Запросить", чтобы отправить запрос администратору</p>
          <div class="titles-grid">
            ${availableSpecial.map(title => `
              <div class="title-card requestable" data-title-id="${title.id}">
                <div class="title-name">${title.title_name}</div>
                <div class="title-desc">${title.description || ''}</div>
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
          if (statusEl) statusEl.textContent = '✅ Надет';
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
        statusDiv.textContent = '✅ Надет';
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
          <img src="${avatarUrl}" alt="Аватар" class="profile-avatar">
          <div class="profile-info">
            <h3>${profile.full_name || 'Без имени'}</h3>
            ${titlesText ? `<div class="profile-titles">${titlesText}</div>` : ''}
            <p class="profile-location">📍 ${profile.city || 'Локация не указана'}</p>
            <p class="profile-role">🎭 Роль: ${profile.role}</p>
          </div>
        </div>
        ${profile.bio ? `<div class="profile-bio"><h4>О себе</h4><p>${profile.bio}</p></div>` : ''}
      </div>
      <div class="user-events-section">
        <h3>События пользователя (${userEvents.length})</h3>
        <div class="user-events-list">
          ${userEvents.length === 0 ? '<p class="empty-state">У пользователя пока нет событий</p>' : userEvents.map(event => {
            const date = new Date(event.created_at).toLocaleDateString('ru-RU');
            return `
              <div class="user-event-item">
                <div class="user-event-header">
                  <span class="event-date">${date}</span>
                  ${event.city ? `<span class="badge">📍 ${event.city}</span>` : ''}
                </div>
                <p class="event-text">${event.event_text}</p>
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
        <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/webp" style="display: none;">
        <button type="button" class="btn-secondary" id="btn-change-avatar">Изменить фото</button>
      </div>
      <form id="form-edit-profile">
        <div class="form-input-group">
          <label for="edit-name">Имя</label>
          <input type="text" id="edit-name" value="${profile.full_name || ''}" required>
        </div>
        <div class="form-input-group">
          <label for="edit-location">Локация</label>
          <input type="text" id="edit-location" value="${profile.city || ''}">
        </div>
        <div class="form-input-group">
          <label for="edit-bio">О себе</label>
          <textarea id="edit-bio" rows="4">${profile.bio || ''}</textarea>
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
    const date = new Date(event.created_at).toLocaleDateString('ru-RU');
    const deleteButton = isAdmin ? `<button class="btn-delete-event" data-id="${event.id}">Удалить</button>` : '';
    
    const isAuthor = String(event.user_id) === String(currentUserId);
    // ИСПРАВЛЕНИЕ 2: Админ редактирует только значимые, юзер - свои незначимые
    const canEdit = isAdmin ? event.is_lore_significant : (isAuthor && !event.is_lore_significant);
    const editButton = canEdit ? `<button class="btn-edit-event" data-id="${event.id}">✏️ Редактировать</button>` : '';
    
    const authorName = event.profiles?.full_name || 'Аноним';
    const authorId = event.user_id;
    const clickableAuthor = onAuthorClick && authorId 
      ? `<span class="clickable-author" data-user-id="${authorId}">${authorName}</span>` 
      : `<strong>${authorName}</strong>`;
    const loreBadge = event.is_lore_significant 
      ? `<span class="badge badge-lore"> Значимое</span>` 
      : '';
    const chronicleBadge = event.is_in_chronicle 
      ? `<span class="badge badge-chronicle">✅ В летописи</span>` 
      : '';
    
    li.innerHTML = `
      <div class="event-header">
        ${clickableAuthor}
        <span class="event-date">${date}</span>
      </div>
      <p class="event-text">${event.event_text}</p>
      ${event.city ? `<span class="badge">📍 ${event.city}</span>` : ''}
      ${event.event_date ? `<span class="badge">📅 ${event.event_date}</span>` : ''}
      ${loreBadge}
      ${chronicleBadge}
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
        <strong>${event.profiles?.full_name || 'Аноним'}</strong>
        <span class="event-date">${date}</span>
      </div>
      <p class="event-text">${event.event_text}</p>
      ${event.city ? `<span class="badge">📍 ${event.city}</span>` : ''}
      ${event.event_date ? `<span class="badge">📅 ${event.event_date}</span>` : ''}
      ${event.is_lore_significant ? '<span class="badge badge-lore">⭐ Значимое для летописи</span>' : ''}
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
      ? `<span class="clickable-author" data-user-id="${authorId}">${authorName}</span>`
      : `<strong class="chat-author ${isOwnMessage ? 'own' : ''}">${authorName}</strong>`;
    
    if (msg.is_deleted) {
      div.innerHTML = `
        <div class="chat-message-header">
          ${clickableAuthor}
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message-text deleted-text">
          Сообщение удалено
          ${msg.delete_reason ? `<br><em>Причина: ${msg.delete_reason}</em>` : ''}
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="chat-message-header">
          ${clickableAuthor}
          ${titlesText ? `<span class="chat-titles">[${titlesText}]</span>` : ''}
          <span class="chat-time">${time}</span>
          ${deleteBtn}
        </div>
        <div class="chat-message-text">${msg.message_text}</div>
      `;
    }
    
    chatMessagesEl.appendChild(div);
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

export function renderChronicle(chronicle, onEventClick) {
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

  content.querySelectorAll('.chronicle-ref').forEach(ref => {
    ref.addEventListener('click', () => {
      if (!onEventClick) return;
      if (ref.dataset.eventId) onEventClick({ id: Number(ref.dataset.eventId) });
      else onEventClick({ event_text: ref.dataset.eventText, author: ref.dataset.author, event_date: ref.dataset.date, city: ref.dataset.city });
    });
  });
}

export function renderChronicleEditor(chronicle, pendingEvents, onSave, onGenerate, onRollback) {
  const content = document.getElementById('chronicle-content');
  if (!content) return;

  content.innerHTML = `
    <div class="chronicle-editor">
      <div class="editor-header">
        <h2>✏️ Редактор летописи</h2>
        <div class="editor-actions">
          <button class="btn-primary" id="btn-generate-chronicle">Сгенерировать с ИИ</button>
          <button class="btn-secondary" id="btn-rollback-chronicle">↩️ Откатить</button>
          <button class="btn-primary" id="btn-save-chronicle"> Сохранить</button>
        </div>
      </div>
      
      <div class="pending-events-panel">
        <h3> Значимые события, готовые к добавлению (${pendingEvents.length})</h3>
        ${pendingEvents.length === 0 ? '<p>Нет новых значимых событий</p>' : `
          <div class="pending-events-list">
            ${pendingEvents.map(e => `
              <div class="pending-event-card" data-id="${e.id}">
                <strong>${e.event_text}</strong>
                <div class="event-meta">
                  <span>👤 ${e.profiles?.full_name || 'Аноним'}</span>
                  ${e.event_date ? `<span>📅 ${e.event_date}</span>` : ''}
                  ${e.city ? `<span>📍 ${e.city}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
      
      <textarea id="chronicle-textarea" rows="20" placeholder="Текст летописи...">${chronicle?.content || ''}</textarea>
      
      <div class="editor-preview">
        <h3>👁️ Предпросмотр</h3>
        <div id="chronicle-preview" class="chronicle-text"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-save-chronicle').addEventListener('click', () => {
    const text = document.getElementById('chronicle-textarea').value;
    onSave(text);
  });

  document.getElementById('btn-generate-chronicle').addEventListener('click', () => {
    onGenerate();
  });

  document.getElementById('btn-rollback-chronicle').addEventListener('click', () => {
    if (confirm('Откатить к предыдущей версии? Текущие изменения будут потеряны.')) {
      onRollback();
    }
  });

  const textarea = document.getElementById('chronicle-textarea');
  const preview = document.getElementById('chronicle-preview');
  const updatePreview = () => { preview.innerHTML = formatChronicleHtml(textarea.value); };
  textarea.addEventListener('input', updatePreview);
  updatePreview();
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
      <h2>📅 Таймлайн событий</h2>
      <div class="timeline">
        ${years.map(year => `
          <div class="timeline-year">
            <div class="year-marker">${year}</div>
            <div class="year-events">
              ${eventsByYear[year].map(e => `
                <div class="timeline-event" data-id="${e.id}">
                  <div class="event-dot"></div>
                  <div class="event-card">
                    <strong>${e.event_text}</strong>
                    <div class="event-meta">
                      <span>👤 ${e.profiles?.full_name || 'Аноним'}</span>
                      ${e.event_date ? `<span>📅 ${e.event_date}</span>` : ''}
                      ${e.city ? `<span>📍 ${e.city}</span>` : ''}
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
// ЛЕТОПИСЬ — КАРТА
// ============================================

export function renderMap(events, onEventClick) {
  const content = document.getElementById('chronicle-content');
  if (!content) return;

  const eventsWithCity = events.filter(e => e.city);

  if (eventsWithCity.length === 0) {
    content.innerHTML = '<div class="chronicle-empty"><p>Нет событий с указанием города для отображения на карте.</p></div>';
    return;
  }

  content.innerHTML = `
    <div class="map-container">
      <h2>🗺️ Карта событий</h2>
      <div id="map" style="height: 500px; border-radius: 12px;"></div>
      <div class="map-legend">
        <h3>События по городам:</h3>
        <ul>
          ${eventsWithCity.map(e => `
            <li class="map-event-item" data-id="${e.id}">
              <strong>${e.city}</strong> — ${e.event_text}
              <span class="event-author">(${e.profiles?.full_name || 'Аноним'})</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;

  if (typeof L !== 'undefined') {
    const map = L.map('map').setView([55.7558, 37.6173], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const cityEvents = {};
    eventsWithCity.forEach(e => {
      const cityName = e.city.trim();
      if (!cityEvents[cityName]) cityEvents[cityName] = [];
      cityEvents[cityName].push(e);
    });

    const cityCoords = {
      'москва': [55.7558, 37.6173],
      'санкт-петербург': [59.9343, 30.3351],
      'спб': [59.9343, 30.3351],
      'казань': [55.7887, 49.1221],
      'екатеринбург': [56.8389, 60.6057],
      'новосибирск': [55.0084, 82.9357],
      'краснодар': [45.0355, 38.9753],
      'самара': [53.2001, 50.1500],
      'ростов-на-дону': [47.2357, 39.7015],
      'уфа': [54.7388, 55.9721],
      'красноярск': [56.0184, 92.8672],
      'коломна': [55.0794, 38.7783],
      'киев': [50.4501, 30.5234],
      'токио': [35.6762, 139.6503],
      'лондон': [51.5074, -0.1278],
      'париж': [48.8566, 2.3522],
      'берлин': [52.5200, 13.4050],
      'рим': [41.9028, 12.4964],
      'мадрид': [40.4168, -3.7038],
      'нью-йорк': [40.7128, -74.0060],
      'минск': [53.9006, 27.5590],
      'алматы': [43.2220, 76.8512],
      'ташкент': [41.2995, 69.2401]
    };

    const placedMarkers = [];

    Object.entries(cityEvents).forEach(([city, cityEvts]) => {
      const cityLower = city.toLowerCase().trim();
      const withCoords = cityEvts.find(e => e.lat != null && e.lon != null);
      let coords = withCoords ? [withCoords.lat, withCoords.lon] : cityCoords[cityLower];
      
      if (!coords) {
        for (const [key, value] of Object.entries(cityCoords)) {
          if (cityLower.includes(key) || key.includes(cityLower)) {
            coords = value;
            break;
          }
        }
      }
      
      if (!coords) {
        console.warn(`Город "${city}" не найден в базе координат`);
        return;
      }

      placedMarkers.push(coords);
      const marker = L.marker(coords).addTo(map);
      marker.bindPopup(`
        <strong>${city}</strong><br>
        ${cityEvts.map(e => `
          <div style="margin: 5px 0;">
            ${e.event_text}<br>
            <em>— ${e.profiles?.full_name || 'Аноним'}</em>
          </div>
        `).join('')}
      `);
    });

    if (placedMarkers.length > 0) {
      const group = L.featureGroup(placedMarkers.map(c => L.marker(c)));
      map.fitBounds(group.getBounds().pad(0.1));
    }
  } else {
    content.innerHTML += '<p style="color: #888;">Карта недоступна. Загрузите библиотеку Leaflet.</p>';
  }

  content.querySelectorAll('.map-event-item').forEach(el => {
    el.addEventListener('click', () => {
      const event = events.find(e => e.id === parseInt(el.dataset.id));
      if (event && onEventClick) onEventClick(event);
    });
  });
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
      <h2>🔖 Мои закладки</h2>
      <div class="bookmarks-list">
        ${bookmarks.map(e => `
          <div class="bookmark-card" data-id="${e.id}">
            <div class="bookmark-header">
              <strong>${e.profiles?.full_name || 'Аноним'}</strong>
              <span class="event-date">${new Date(e.created_at).toLocaleDateString('ru-RU')}</span>
            </div>
            <p class="event-text">${e.event_text}</p>
            <div class="event-meta">
              ${e.event_date ? `<span>📅 ${e.event_date}</span>` : ''}
              ${e.city ? `<span>📍 ${e.city}</span>` : ''}
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

export async function showEventModal(event, currentUserId, onReaction, onComment, onBookmark, onDeleteComment) {
  const { getEventReactions, getEventComments } = await import('./api.js');
  
  const reactions = await getEventReactions(event.id);
  const comments = await getEventComments(event.id);

  const reactionCounts = { fire: 0, skull: 0, theater: 0, crown: 0 };
  const userReactions = {};
  reactions.forEach(r => {
    reactionCounts[r.reaction_type]++;
    if (r.user_id === currentUserId) userReactions[r.reaction_type] = true;
  });

  const reactionEmojis = { fire: '🔥', skull: '💀', theater: '🎭', crown: '' };

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.id = 'modal-event-detail';

  modal.innerHTML = `
    <div class="modal-content event-modal">
      <span class="close-modal" data-modal="modal-event-detail">&times;</span>
      <div class="event-detail-header">
        <h3>${event.event_text}</h3>
        <div class="event-detail-meta">
          <span>👤 ${event.profiles?.full_name || 'Аноним'}</span>
          ${event.event_date ? `<span>📅 ${event.event_date}</span>` : ''}
          ${event.city ? `<span> ${event.city}</span>` : ''}
        </div>
      </div>

      <div class="reactions-section">
        <h4>Реакции</h4>
        <div class="reactions-list">
          ${Object.entries(reactionEmojis).map(([type, emoji]) => `
            <button class="reaction-btn ${userReactions[type] ? 'active' : ''}" data-type="${type}">
              ${emoji} ${reactionCounts[type] > 0 ? reactionCounts[type] : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="bookmark-section">
        <button class="btn-bookmark" id="btn-toggle-bookmark">
          🔖 Добавить в закладки
        </button>
      </div>

      <div class="comments-section">
        <h4>Комментарии (${comments.length})</h4>
        <div class="comments-list" id="comments-list">
          ${comments.length === 0 ? '<p class="empty-state">Пока нет комментариев</p>' : comments.map(c => `
            <div class="comment-item" data-id="${c.id}">
              <div class="comment-header">
                <strong>${c.profiles?.full_name || 'Аноним'}</strong>
                <span class="comment-date">${new Date(c.created_at).toLocaleDateString('ru-RU')}</span>
                ${c.user_id === currentUserId ? `<button class="btn-delete-comment" data-id="${c.id}">🗑️</button>` : ''}
              </div>
              <p class="comment-text">${c.comment_text}</p>
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

  // ТОЧЕЧНОЕ обновление реакций БЕЗ пересоздания модалки
  modal.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      try {
        const result = await onReaction(event.id, type);
        
        const allBtns = modal.querySelectorAll('.reaction-btn');
        allBtns.forEach(b => {
          const bType = b.dataset.type;
          let count = parseInt(b.textContent.replace(/\D/g,'')) || 0;
          
          if (bType === type) {
            if (result.action === 'added') {
              b.classList.add('active');
              b.textContent = `${reactionEmojis[type]} ${count + 1}`;
            } else {
              b.classList.remove('active');
              b.textContent = count > 1 ? `${reactionEmojis[type]} ${count - 1}` : reactionEmojis[type];
            }
          } else {
            if (b.classList.contains('active')) {
               b.classList.remove('active');
               b.textContent = count > 1 ? `${reactionEmojis[bType]} ${count - 1}` : reactionEmojis[bType];
            }
          }
        });
      } catch (error) {
        showNotification(`Ошибка: ${error.message}`, 'error');
      }
    });
  });

  modal.querySelector('#btn-toggle-bookmark').addEventListener('click', async () => {
    try {
      const result = await onBookmark(event.id);
      const btn = modal.querySelector('#btn-toggle-bookmark');
      btn.textContent = result.action === 'added' ? '🔖 В закладках' : ' Добавить в закладки';
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
        <p class="comment-text">${comment.comment_text}</p>
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

// Новая функция: модалка редактирования события
export function showEditEventModal(event, onSave, isValidDate, isValidCity) {
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
        <textarea id="edit-event-text" rows="3">${event.event_text}</textarea>
      </div>
      <div class="form-input-group">
        <label for="edit-event-city">Место</label>
        <input type="text" id="edit-event-city" value="${event.city || ''}" placeholder="Город, например: Коломна">
      </div>
      <div class="form-input-group">
        <label for="edit-event-date">Дата события</label>
        <input type="text" id="edit-event-date" value="${event.event_date || ''}" placeholder="Например: 15 марта 2024">
      </div>
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
      await onSave(event.id, { event_text: text, city: city || null, event_date: date || null });
      showNotification('Событие обновлено!', 'success');
      modal.remove();
    } catch (error) {
      showNotification(`Ошибка: ${error.message}`, 'error');
    }
  });
}