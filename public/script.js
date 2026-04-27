const API_BASE = '/tasks';
const PROJECT_API_BASE = '/projects';
const ACTIVITY_API_BASE = '/activity';
const EMAIL_API_BASE = '/emails';
const PAPER_API_BASE = '/papers';

let allEmails = [];
let allEvents = [];
let currentEmailFilter = 'all';
let selectedEmailId = null;
let emailButtonsSetup = false;

let currentModule = 'dashboard';
let currentProjectId = 'all';
let allTasks = [];

// --- Custom confirm dialog ---
function showConfirm({ title = 'Confirm', message, okText = 'Delete', danger = true }) {
    return new Promise(resolve => {
        const dialog = document.getElementById('confirmDialog');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const okBtn = document.getElementById('confirmOk');
        okBtn.textContent = okText;
        okBtn.className = 'confirm-btn ' + (danger ? 'confirm-btn-danger' : 'confirm-btn-cancel');
        dialog.classList.remove('hidden');

        function cleanup(result) {
            dialog.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            document.getElementById('confirmCancel').removeEventListener('click', onCancel);
            dialog.removeEventListener('click', onBackdrop);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onBackdrop(e) { if (e.target === dialog) cleanup(false); }

        okBtn.addEventListener('click', onOk);
        document.getElementById('confirmCancel').addEventListener('click', onCancel);
        dialog.addEventListener('click', onBackdrop);
    });
}

// --- Toast notification ---
function showToast(message, { undoFn, duration = 2800 } = {}) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    if (undoFn) {
        const btn = document.createElement('button');
        btn.className = 'toast-undo';
        btn.textContent = 'Undo';
        btn.onclick = () => {
            undoFn();
            toast.remove();
        };
        toast.appendChild(btn);
    }

    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}
// localStorage throws in private browsing / when quota is exceeded — wrap so a
// non-essential write never crashes the page. Reads return null on failure.
const safeStorage = {
    get(key) {
        try { return localStorage.getItem(key); }
        catch { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; }
        catch (e) {
            if (!safeStorage._warned) {
                console.warn('localStorage unavailable — preferences will not persist:', e.message);
                safeStorage._warned = true;
            }
            return false;
        }
    },
};

// --- Dark mode toggle ---
function initTheme() {
    const saved = safeStorage.get('theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeIcon();
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        safeStorage.set('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        safeStorage.set('theme', 'dark');
    }
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '\u2600' : '\u263D';
}

// --- Mobile sidebar ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// --- Undo/Redo Stack (command pattern) ---
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 30;

function pushUndo(cmd) {
    undoStack.push(cmd);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
}

async function undo() {
    const cmd = undoStack.pop();
    if (!cmd) return showToast('Nothing to undo');
    try {
        await cmd.undo();
        redoStack.push(cmd);
        showToast(`Undo: ${cmd.label}`);
    } catch (e) {
        console.error('Undo failed:', e);
        showToast('Undo failed');
    }
}

async function redo() {
    const cmd = redoStack.pop();
    if (!cmd) return showToast('Nothing to redo');
    try {
        await cmd.redo();
        undoStack.push(cmd);
        showToast(`Redo: ${cmd.label}`);
    } catch (e) {
        console.error('Redo failed:', e);
        showToast('Redo failed');
    }
}

// --- Browser Notifications ---
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
    }
}

async function pollDueReminders() {
    try {
        const res = await fetch('/tasks/reminders/due');
        if (!res.ok) return;
        const data = await res.json();
        for (const r of data.reminders || []) {
            showNotification('Reminder', `${r.taskTitle}${r.note ? ' — ' + r.note : ''}`);
            showToast(`Reminder: ${r.taskTitle}`);
        }
    } catch (e) { /* silent */ }
}

// Init theme immediately
initTheme();

let allProjects = [];
let selectedColor = '#10a37f';
let calendarMonth = new Date();

document.addEventListener('DOMContentLoaded', () => {
    // Theme & sidebar
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('hamburgerBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

    setupModuleButtons();
    setupVideoAgentButton();
    setupProjectButtons();
    setupModalButtons();
    setupBoardButtons();
    setupCalendarButtons();
    setupListControls();
    setupColorOptions();
    setupPaperButtons();

    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    loadProjects();
    loadTasks();
    loadActivityLog();
    loadEmails();
    loadImportantEmails();
    loadEvents();
    loadSyncStatus();
    loadLlmSyncStatus();
    loadDailyPapers();
    setInterval(loadActivityLog, 5000);
    setInterval(() => {
        loadEmails();
        loadImportantEmails();
        loadEvents();
        loadSyncStatus();
        loadLlmSyncStatus();
        loadDailyPapers();
    }, 60000);

    // Browser notifications
    requestNotificationPermission();
    pollDueReminders();
    setInterval(pollDueReminders, 60000);
});

function updateCurrentTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('currentTime').textContent = timeStr;
}

function setupModuleButtons() {
    document.querySelectorAll('.module-btn, .nav-item').forEach(btn => {
        if (btn.dataset.module) {
            btn.addEventListener('click', () => {
                switchModule(btn.dataset.module);
            });
        }
    });
}

function setupVideoAgentButton() {
    const videoBtn = document.getElementById('videoAgentBtn');
    if (videoBtn) {
        videoBtn.addEventListener('click', () => {
            window.open('http://localhost:3001', '_blank');
        });
    }
}

function switchModule(module) {
    // Tear down per-view timers from the previous module before switching.
    // Without this, countdowns on board cards keep ticking against detached/hidden
    // nodes — wasted CPU and a slow leak as renderTasks pushes new ones each refresh.
    if (currentModule !== module) {
        _countdownIntervals.forEach(id => clearInterval(id));
        _countdownIntervals = [];
    }

    currentModule = module;
    // Support both .module-btn and .nav-item for navigation
    document.querySelectorAll('.module-btn, .nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.module === module);
    });
    document.querySelectorAll('.module-view').forEach(view => {
        view.classList.add('hidden');
    });
    const viewEl = document.getElementById(`${module}View`);
    if (viewEl) viewEl.classList.remove('hidden');

    // Setup email buttons and load emails when switching to email module
    if (module === 'email') {
        setupEmailButtons();
        loadEmails();
    }

    renderCurrentView();
}

function renderCurrentView() {
    switch (currentModule) {
        case 'dashboard':
            renderDashboard();
            if (typeof loadWeeklyReview === 'function') loadWeeklyReview();
            break;
        case 'board':
            renderTasks(getFilteredTasks());
            if (typeof renderEisenhowerView === 'function') renderEisenhowerView();
            break;
        case 'calendar':
            renderCalendar();
            break;
        case 'list':
            renderList();
            break;
        case 'email':
            renderEmails();
            break;
        case 'today':
            if (typeof renderTodayView === 'function') renderTodayView();
            break;
        case 'focus':
            if (typeof loadFocusView === 'function') loadFocusView();
            break;
    }
}

function setupProjectButtons() {
    document.getElementById('addProjectBtn').addEventListener('click', openProjectModal);
}

function setupModalButtons() {
    document.getElementById('closeDescriptionButton').onclick = () => {
        document.getElementById('descriptionModal').classList.add('hidden');
    };
    document.getElementById('descriptionModal').onclick = (e) => {
        if (e.target.id === 'descriptionModal') {
            document.getElementById('descriptionModal').classList.add('hidden');
        }
    };

    document.getElementById('closeProjectButton').onclick = () => {
        document.getElementById('projectModal').classList.add('hidden');
    };
    document.getElementById('projectModal').onclick = (e) => {
        if (e.target.id === 'projectModal') {
            document.getElementById('projectModal').classList.add('hidden');
        }
    };
    document.getElementById('saveProjectButton').onclick = saveProject;
}

function setupBoardButtons() {
    document.getElementById('addTaskButton').addEventListener('click', addTask);
    document.getElementById('taskInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
    document.getElementById('clearDoneBtn').addEventListener('click', clearCompletedTasks);
}

function setupCalendarButtons() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        calendarMonth.setMonth(calendarMonth.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        calendarMonth.setMonth(calendarMonth.getMonth() + 1);
        renderCalendar();
    });
}

function setupListControls() {
    document.getElementById('listFilter').addEventListener('change', renderList);
    document.getElementById('listSort').addEventListener('change', renderList);
}

function setupColorOptions() {
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedColor = opt.dataset.color;
        });
    });
}

function openProjectModal() {
    document.getElementById('projectModalTitle').textContent = 'New Project';
    document.getElementById('projectNameInput').value = '';
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
    document.querySelector('.color-option[data-color="#10a37f"]').classList.add('selected');
    selectedColor = '#10a37f';
    document.getElementById('projectModal').classList.remove('hidden');
}

async function saveProject() {
    const name = document.getElementById('projectNameInput').value.trim();
    if (!name) return;

    try {
        const response = await fetch(PROJECT_API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color: selectedColor })
        });
        if (response.ok) {
            document.getElementById('projectModal').classList.add('hidden');
            loadProjects();
        }
    } catch (err) {
        console.error('Error creating project:', err);
    }
}

async function loadProjects() {
    try {
        const response = await fetch(PROJECT_API_BASE);
        if (response.ok) {
            allProjects = await response.json();
            renderProjects();
        }
    } catch (err) {
        console.error('Error loading projects:', err);
    }
}

function getProject(projectId) {
    if (!projectId) return null;
    return allProjects.find(p => p.id === projectId);
}

function renderProjects() {
    const list = document.getElementById('projectList');
    if (!list) return;
    let html = `
        <div class="project-item ${currentProjectId === 'all' ? 'active' : ''}" data-project-id="all">
            <span class="project-color" style="background: #10a37f"></span>
            <span class="project-name">All Projects</span>
            <span class="project-count" id="allCount">${allTasks.length}</span>
        </div>
    `;

    allProjects.forEach(project => {
        const projectTasks = allTasks.filter(t => t.projectId === project.id);
        html += `
            <div class="project-item ${currentProjectId === project.id ? 'active' : ''}" data-project-id="${project.id}">
                <span class="project-color" style="background: ${project.color}"></span>
                <span class="project-name">${escapeHtml(project.name)}</span>
                <span class="project-count">${projectTasks.length}</span>
            </div>
        `;
    });

    list.innerHTML = html;

    list.querySelectorAll('.project-item').forEach(item => {
        item.addEventListener('click', () => {
            const pid = item.dataset.projectId;
            currentProjectId = pid === 'all' ? 'all' : parseInt(pid);
            renderProjects();
            renderCurrentView();
        });
    });

    setText('allCount', allTasks.length);
}

function getFilteredTasks() {
    if (currentProjectId === 'all') return allTasks;
    return allTasks.filter(t => t.projectId === currentProjectId);
}

async function loadTasks() {
    const boardContainer = document.getElementById('boardView');
    if (boardContainer) boardContainer.classList.add('loading');
    try {
        // Always load ALL tasks, filter at display time
        const response = await fetch(API_BASE);
        if (response.ok) {
            allTasks = await response.json();
            renderProjects();
            renderCurrentView();
            updateStats(allTasks);
        }
    } catch (err) {
        console.error('Error loading tasks:', err);
    } finally {
        if (boardContainer) boardContainer.classList.remove('loading');
    }
}

function updateStats(tasks) {
    const filtered = currentProjectId === 'all' ? tasks : getFilteredTasks();
    const todoCount = filtered.filter(t => mapStatusToFrontend(t.status) === 'todo').length;
    const doingCount = filtered.filter(t => mapStatusToFrontend(t.status) === 'doing').length;
    const doneCount = filtered.filter(t => mapStatusToFrontend(t.status) === 'done').length;

    const overdueCount = filtered.filter(t => {
        if (!t.dueDate) return false;
        if (mapStatusToFrontend(t.status) === 'done') return false;
        return new Date(t.dueDate) < new Date();
    }).length;

    setText('dashTotal', filtered.length);
    setText('dashDoing', doingCount);
    setText('dashDone', doneCount);
    setText('dashOverdue', overdueCount);
}


function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCompletedDateTime(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarTitle');
    if (!grid || !title) return;

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    title.textContent = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = weekDays.map(d => `<div class="calendar-day-header">${d}</div>`).join('');

    const today = new Date();
    const filtered = getFilteredTasks();

    const prevMonth = new Date(year, month, 0);
    for (let i = startDay - 1; i >= 0; i--) {
        const day = prevMonth.getDate() - i;
        html += renderCalendarDay(day, month - 1, year, true, today, filtered, allEvents);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        html += renderCalendarDay(day, month, year, false, today, filtered, allEvents);
    }

    const remainingDays = 42 - (startDay + daysInMonth);
    for (let day = 1; day <= remainingDays; day++) {
        html += renderCalendarDay(day, month + 1, year, true, today, filtered, allEvents);
    }

    grid.innerHTML = html;
}

function renderCalendarDay(day, month, year, isOtherMonth, today, tasks, events) {
    const date = new Date(year, month, day);
    const isToday = date.toDateString() === today.toDateString();
    const dateStr = formatLocalDate(date);

    const dayTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        const taskDate = formatLocalDate(new Date(t.dueDate));
        return taskDate === dateStr;
    });

    const dayEvents = (events || []).filter(e => {
        if (!e.start) return false;
        const eventDate = formatLocalDate(new Date(e.start));
        return eventDate === dateStr;
    });

    let tasksHtml = dayTasks.map(task => {
        const project = getProject(task.projectId);
        return `
        <div class="calendar-task ${task.priority}">
            ${project ? `<span class="calendar-task-project" style="background: ${project.color}"></span>` : ''}
            ${escapeHtml(task.title.substring(0, 20))}
        </div>
    `;
    }).join('');

    let eventsHtml = dayEvents.map(event => `
        <div class="calendar-event">
            <span class="calendar-event-dot"></span>
            ${escapeHtml(event.subject.substring(0, 18))}
        </div>
    `).join('');

    return `
        <div class="calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}">
            <div class="calendar-day-number">${day}</div>
            <div class="calendar-day-tasks">${tasksHtml}${eventsHtml}</div>
        </div>
    `;
}

function renderList() {
    const tbody = document.getElementById('listTableBody');
    const filterEl = document.getElementById('listFilter');
    const sortEl = document.getElementById('listSort');
    if (!tbody || !filterEl || !sortEl) return;
    const filter = filterEl.value;
    const sort = sortEl.value;
    let filtered = getFilteredTasks();

    if (filter !== 'all') {
        filtered = filtered.filter(t => mapStatusToFrontend(t.status) === filter);
    }

    filtered.sort((a, b) => {
        switch (sort) {
            case 'dueDate':
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            case 'priority':
                const order = { high: 0, medium: 1, low: 2 };
                return order[a.priority] - order[b.priority];
            case 'createdAt':
                return new Date(b.createdAt) - new Date(a.createdAt);
            default:
                return 0;
        }
    });

    tbody.innerHTML = filtered.map(task => {
        const status = mapStatusToFrontend(task.status);
        const isOverdue = task.dueDate && status !== 'done' && new Date(task.dueDate) < new Date();
        const project = getProject(task.projectId);
        const completedTime = (status === 'done' && task.completedAt) ? formatCompletedDateTime(task.completedAt) : '-';
        return `
            <tr>
                <td>
                    <div class="list-status">
                        <span class="list-status-dot ${status}"></span>
                        <span class="list-status-text">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </div>
                </td>
                <td class="list-title">${escapeHtml(task.title)}</td>
                <td>
                    ${project ? `<span class="list-project" style="--project-color: ${project.color}">${escapeHtml(project.name)}</span>` : ''}
                </td>
                <td><span class="list-priority ${task.priority}">${task.priority.toUpperCase()}</span></td>
                <td class="list-due ${isOverdue ? 'overdue' : ''}">${task.dueDate ? formatDate(task.dueDate) : '-'}</td>
                <td class="list-completed">${completedTime}</td>
                <td class="list-actions">
                    <button class="task-action-btn move-btn" onclick="moveTask(${task.id}, '${status}')">${getNextStatusLabel(status)}</button>
                    <button class="task-action-btn delete-btn" onclick="deleteTaskConfirm(${task.id})">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

function mapStatusToFrontend(status) {
    if (status === 'todocontainer') return 'todo';
    if (status === 'doingcontainer') return 'doing';
    if (status === 'donecontainer') return 'done';
    return status;
}

function mapStatusToBackend(status) {
    if (status === 'todo') return 'todocontainer';
    if (status === 'doing') return 'doingcontainer';
    if (status === 'done') return 'donecontainer';
    return status;
}

function formatActivityAction(action) {
    const actionMap = {
        'CREATE': 'TASK_CREATED',
        'STATUS_CHANGE': 'STATUS_UPDATED',
        'UPDATE_DESCRIPTION': 'DETAILS_UPDATED',
        'DELETE': 'TASK_DELETED',
        'CLEAR_COMPLETED': 'CLEARED_COMPLETED'
    };
    return actionMap[action] || action;
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now - then) / 1000);

    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

async function loadActivityLog() {
    try {
        const response = await fetch(`${ACTIVITY_API_BASE}?limit=15`);
        if (response.ok) {
            const activities = await response.json();
            renderActivityLog(activities);
        }
    } catch (err) {
        console.error('Error loading activity log:', err);
    }
}

function renderActivityLog(activities) {
    const list = document.getElementById('activityList');
    if (!activities || activities.length === 0) {
        list.innerHTML = '<div class="no-activity">No recent activity...</div>';
        return;
    }

    list.innerHTML = activities.map((activity, index) => `
        <div class="activity-item">
            <div class="activity-action">${formatActivityAction(activity.action)}</div>
            <div class="activity-details">
                ${activity.taskTitle ? escapeHtml(activity.taskTitle.substring(0, 40)) : (activity.details?.count ? `${activity.details.count} tasks` : '')}
            </div>
            <div class="activity-time">${formatTimeAgo(activity.timestamp)}</div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Returns YYYY-MM-DD in the browser's local timezone.
// `Date#toISOString().split('T')[0]` returns UTC date — wrong for users near midnight.
function formatLocalDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Defensive DOM helpers — render functions can run before/after their target view
// is mounted (e.g. cross-view background refresh). Silent no-op beats NPE.
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

let _countdownIntervals = [];

function renderTasks(tasks) {
    // Clear previous countdown intervals to prevent memory leaks
    _countdownIntervals.forEach(id => clearInterval(id));
    _countdownIntervals = [];

    const todoList = document.getElementById('todoList');
    const doingList = document.getElementById('doingList');
    const doneList = document.getElementById('doneList');

    if (!todoList || !doingList || !doneList) return;

    todoList.innerHTML = '';
    doingList.innerHTML = '';
    doneList.innerHTML = '';

    tasks.forEach((task) => {
        const frontendStatus = mapStatusToFrontend(task.status);
        const listItem = createTaskElement(
            task.id,
            task.title,
            task.priority,
            task.dueDate,
            frontendStatus,
            task.description,
            task.projectId,
            task.completedAt
        );
        // Add recurring badge if applicable
        if (task.recurPattern) {
            const badge = document.createElement('div');
            badge.className = 'task-recurring-badge';
            badge.innerHTML = `<span class="recur-icon">&#x21bb;</span> ${task.recurPattern}`;
            listItem.querySelector('.task-meta')?.prepend(badge);
        }
        if (frontendStatus === 'todo') {
            todoList.appendChild(listItem);
        } else if (frontendStatus === 'doing') {
            doingList.appendChild(listItem);
        } else if (frontendStatus === 'done') {
            doneList.appendChild(listItem);
        }
    });

    setText('todoCount', todoList.children.length);
    setText('doingCount', doingList.children.length);
    setText('doneCount', doneList.children.length);

    // Setup drag-and-drop on each task list
    [todoList, doingList, doneList].forEach(setupDropZone);
}

// --- Drag and Drop ---
function setupDropZone(listEl) {
    listEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        listEl.classList.add('drag-over');
    });

    listEl.addEventListener('dragleave', () => {
        listEl.classList.remove('drag-over');
    });

    listEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        listEl.classList.remove('drag-over');
        const rawId = e.dataTransfer.getData('text/plain');
        const taskId = parseInt(rawId, 10);
        if (!Number.isInteger(taskId) || taskId <= 0) return;

        // Determine target status from the column's data-status
        const column = listEl.closest('.column');
        const targetFrontend = column?.dataset.status;
        if (!targetFrontend) return;

        const targetBackend = mapStatusToBackend(targetFrontend);

        // Find the task's current status
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        const oldBackend = task.status;
        if (oldBackend === targetBackend) return;

        try {
            const response = await fetch(`${API_BASE}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, status: targetBackend }),
            });
            if (response.ok) {
                pushUndo({
                    label: 'drag move',
                    undo: async () => {
                        await fetch(`${API_BASE}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, status: oldBackend }) });
                        loadTasks(); loadActivityLog();
                    },
                    redo: async () => {
                        await fetch(`${API_BASE}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, status: targetBackend }) });
                        loadTasks(); loadActivityLog();
                    }
                });
                loadTasks();
                loadActivityLog();
            } else {
                if (typeof showToast === 'function') showToast('Move failed (server rejected)', 'error');
                loadTasks();
            }
        } catch (err) {
            console.error('Error moving task:', err);
            if (typeof showToast === 'function') showToast('Move failed (network error)', 'error');
            loadTasks();
        }
    });
}

// Attach dragstart to task cards (delegated from board)
document.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.task-card');
    if (!card) return;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.taskId);
    e.dataTransfer.effectAllowed = 'move';
});

document.addEventListener('dragend', (e) => {
    const card = e.target.closest?.('.task-card');
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.task-list.drag-over').forEach(el => el.classList.remove('drag-over'));
});

// --- Inline Edit Helper ---
function startInlineEdit(element, currentValue, onSave) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = currentValue;

    element.style.display = 'none';
    element.parentNode.insertBefore(input, element);
    input.focus();
    input.select();

    let finishing = false; // re-entry guard: blur can fire while save is in flight
    async function finish(save) {
        if (finishing) return;
        finishing = true;
        const value = input.value.trim();
        const shouldSave = save && value && value !== currentValue;
        if (shouldSave) {
            input.disabled = true;
            try {
                await onSave(value);
                element.textContent = value;
            } catch (err) {
                console.error('Inline save failed:', err);
                if (typeof showToast === 'function') showToast('Save failed', 'error');
            }
        }
        input.remove();
        element.style.display = '';
    }

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { finish(false); }
    });
}

function createTaskElement(taskId, taskText, priority, dueDate, status, description, projectId, completedAt) {
    const listItem = document.createElement('li');
    listItem.className = `task-card ${priority}`;
    listItem.draggable = true;
    listItem.dataset.taskId = taskId;

    // Bulk selection checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.addEventListener('change', () => updateBulkSelection());
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    listItem.appendChild(checkbox);

    const project = getProject(projectId);

    if (project) {
        const projectLabel = document.createElement('div');
        projectLabel.className = 'task-project';
        projectLabel.innerHTML = `
            <span class="task-project-dot" style="background: ${project.color}"></span>
            <span class="task-project-name">${escapeHtml(project.name)}</span>
        `;
        listItem.appendChild(projectLabel);
    }

    const taskTitle = document.createElement('p');
    taskTitle.className = 'task-title';
    taskTitle.textContent = taskText;
    taskTitle.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEdit(taskTitle, taskText, async (newTitle) => {
            if (newTitle && newTitle !== taskText) {
                const r = await fetch(`${API_BASE}/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle }),
                });
                if (!r.ok) throw new Error(`Title update failed: ${r.status}`);
                loadTasks();
                loadActivityLog();
            }
        });
    });
    listItem.appendChild(taskTitle);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'task-meta';

    let descriptionText = description || 'No description added.';
    if (description && description.trim()) {
        const descriptionLink = document.createElement('a');
        descriptionLink.className = 'task-desc-link';
        descriptionLink.textContent = 'View Details';
        descriptionLink.href = '#';
        descriptionLink.onclick = (e) => {
            e.stopPropagation();
            showDescription(descriptionText);
        };
        metaDiv.appendChild(descriptionLink);
    }

    const countdown = document.createElement('span');
    countdown.className = 'task-countdown';
    if (dueDate) {
        updateCountdown(countdown, dueDate);
        _countdownIntervals.push(setInterval(() => updateCountdown(countdown, dueDate), 1000));
    } else {
        countdown.textContent = '';
    }
    metaDiv.appendChild(countdown);
    listItem.appendChild(metaDiv);

    // Show completed time for done tasks
    if (status === 'done' && completedAt) {
        const completedTime = document.createElement('div');
        completedTime.className = 'task-completed';
        const formattedTime = formatCompletedDateTime(completedAt);
        completedTime.textContent = `✓ Completed ${formattedTime}`;
        listItem.appendChild(completedTime);
    }

    // Subtask section
    const subtaskContainer = document.createElement('div');
    subtaskContainer.className = 'subtask-section';
    listItem.appendChild(subtaskContainer);
    loadSubtasksForCard(taskId, subtaskContainer);

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'task-actions';

    const editButton = document.createElement('button');
    editButton.className = 'task-action-btn edit-btn';
    editButton.textContent = 'Edit';
    editButton.onclick = async (e) => {
        e.stopPropagation();
        // Show inline textarea for description editing
        let existingEditor = listItem.querySelector('.inline-edit-input');
        if (existingEditor) { existingEditor.focus(); return; }

        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-input';
        textarea.value = descriptionText === 'No description added.' ? '' : descriptionText;
        textarea.rows = 3;
        textarea.placeholder = 'Add a description...';

        // Insert before buttons
        listItem.insertBefore(textarea, buttonDiv);
        textarea.focus();

        let saving = false;
        async function saveDesc() {
            if (saving) return;
            saving = true;
            const newDesc = textarea.value.trim();
            const original = descriptionText === 'No description added.' ? '' : descriptionText;
            if (newDesc === original) {
                textarea.remove();
                return;
            }
            textarea.disabled = true;
            try {
                const r = await fetch(`${API_BASE}/description`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId, description: newDesc }),
                });
                if (!r.ok) throw new Error(`Description update failed: ${r.status}`);
                descriptionText = newDesc || 'No description added.';
                textarea.remove();
                loadTasks();
                loadActivityLog();
            } catch (err) {
                console.error('Error updating description:', err);
                textarea.disabled = false;
                saving = false;
                if (typeof showToast === 'function') showToast('Save failed, try again', 'error');
            }
        }

        textarea.addEventListener('blur', saveDesc);
        textarea.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') { textarea.removeEventListener('blur', saveDesc); textarea.remove(); }
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); textarea.removeEventListener('blur', saveDesc); saveDesc(); }
        });
    };
    buttonDiv.appendChild(editButton);

    const statusButton = document.createElement('button');
    statusButton.className = 'task-action-btn move-btn';
    statusButton.textContent = getNextStatusLabel(status);
    statusButton.onclick = async (e) => {
        e.stopPropagation();
        await moveTask(taskId, status);
    };
    buttonDiv.appendChild(statusButton);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'task-action-btn delete-btn';
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        await deleteTaskConfirm(taskId);
    };
    buttonDiv.appendChild(deleteButton);

    listItem.appendChild(buttonDiv);
    return listItem;
}

async function moveTask(taskId, currentStatus) {
    const newFrontendStatus = getNextStatus(currentStatus);
    const newBackendStatus = mapStatusToBackend(newFrontendStatus);
    const oldBackendStatus = mapStatusToBackend(currentStatus);
    try {
        const response = await fetch(`${API_BASE}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, status: newBackendStatus }),
        });
        if (response.ok) {
            const statusLabels = { todo: 'Backlog', doing: 'In Progress', done: 'Completed' };
            showToast(`Task moved to ${statusLabels[newFrontendStatus] || newFrontendStatus}`, {
                undoFn: async () => { await undo(); }
            });
            pushUndo({
                label: 'status change',
                undo: async () => {
                    await fetch(`${API_BASE}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, status: oldBackendStatus }) });
                    loadTasks(); loadActivityLog();
                },
                redo: async () => {
                    await fetch(`${API_BASE}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, status: newBackendStatus }) });
                    loadTasks(); loadActivityLog();
                }
            });
            loadTasks();
            loadActivityLog();
        } else {
            const errText = await response.text();
            console.error('Failed to update status', errText);
            showToast('Failed to update task status');
        }
    } catch (err) {
        console.error('Error updating status:', err);
        showToast('Error updating task status');
    }
}

async function deleteTaskConfirm(taskId) {
    // Fetch task data before deleting (for undo)
    let taskData = null;
    try {
        const r = await fetch(`${API_BASE}/${taskId}`);
        if (r.ok) taskData = await r.json();
    } catch (e) { /* proceed without undo data */ }

    const ok = await showConfirm({
        title: 'Delete Task',
        message: 'Are you sure you want to delete this task?',
    });
    if (!ok) return;
    try {
        const response = await fetch(API_BASE, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId }),
        });
        if (response.ok) {
            if (taskData) {
                pushUndo({
                    label: `delete "${taskData.title}"`,
                    undo: async () => {
                        await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: taskData.title, description: taskData.description, priority: taskData.priority, dueDate: taskData.dueDate, projectId: taskData.projectId }) });
                        loadTasks(); loadActivityLog();
                    },
                    redo: async () => {
                        // We can't delete the exact same ID, so just reload
                        loadTasks(); loadActivityLog();
                    }
                });
            }
            showToast('Task deleted', {
                undoFn: taskData ? async () => { await undo(); } : undefined
            });
            loadTasks();
            loadActivityLog();
        } else {
            console.error('Failed to delete task', await response.text());
        }
    } catch (err) {
        console.error('Error deleting task:', err);
    }
}

function getNextStatus(currentStatus) {
    if (currentStatus === 'todo') return 'doing';
    if (currentStatus === 'doing') return 'done';
    return 'todo';
}

function getNextStatusLabel(currentStatus) {
    if (currentStatus === 'todo') return 'Start';
    if (currentStatus === 'doing') return 'Complete';
    return 'Restart';
}

async function addTask() {
    const taskInput = document.getElementById('taskInput');
    const dueDateInput = document.getElementById('dueDateInput');
    const prioritySelect = document.getElementById('prioritySelect');
    const taskText = taskInput.value.trim();
    const dueDate = dueDateInput.value.trim() || null;

    if (!taskText) {
        document.getElementById('errormessage').textContent = 'Please enter a task.';
        return;
    }
    if (taskText.length > 500) {
        document.getElementById('errormessage').textContent = 'Task title is too long (max 500 characters).';
        return;
    }
    document.getElementById('errormessage').textContent = '';

    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: taskText,
                description: '',
                priority: prioritySelect.value,
                dueDate,
                projectId: currentProjectId === 'all' ? null : currentProjectId
            }),
        });
        if (response.ok) {
            const result = await response.json();
            const newTaskId = result.taskId;
            pushUndo({
                label: `create "${taskText}"`,
                undo: async () => {
                    await fetch(API_BASE, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: newTaskId }) });
                    loadTasks(); loadActivityLog();
                },
                redo: async () => {
                    await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: taskText, description: '', priority: prioritySelect.value, dueDate, projectId: currentProjectId === 'all' ? null : currentProjectId }) });
                    loadTasks(); loadActivityLog();
                }
            });
            taskInput.value = '';
            dueDateInput.value = '';
            // Set recurring pattern if selected
            const recurSelect = document.getElementById('recurSelect');
            const recurPattern = recurSelect ? recurSelect.value : '';
            if (recurPattern && newTaskId) {
                try {
                    await fetch(`${API_BASE}/${newTaskId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recurPattern }),
                    });
                } catch (e) { /* ignore */ }
                if (recurSelect) recurSelect.value = '';
            }
            loadTasks();
            loadActivityLog();
        } else {
            const error = await response.text();
            console.error('Failed to create task', error);
        }
    } catch (err) {
        console.error('Error creating task:', err.message);
    }
}

async function clearCompletedTasks() {
    const doneCount = document.getElementById('doneCount').textContent;
    if (doneCount === '0') {
        return;
    }
    const ok = await showConfirm({
        title: 'Clear Completed',
        message: `Clear ${doneCount} completed task(s)? This cannot be undone.`,
        okText: 'Clear',
    });
    if (!ok) return;

    try {
        const pid = currentProjectId === 'all' ? '' : `?projectId=${currentProjectId}`;
        const response = await fetch(`${API_BASE}/clear-completed${pid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            loadTasks();
            loadActivityLog();
        } else {
            console.error('Failed to clear completed tasks', await response.text());
        }
    } catch (err) {
        console.error('Error clearing completed tasks:', err);
    }
}

function updateCountdown(element, dueDate) {
    if (!dueDate) {
        element.textContent = '';
        return;
    }

    const due = new Date(dueDate);
    if (isNaN(due.getTime())) {
        element.textContent = '';
        return;
    }

    const remainingTime = due - new Date();
    element.classList.remove('overdue', 'due-warning', 'due-danger', 'due-ok');
    if (remainingTime > 0) {
        const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) {
            element.textContent = `${days}d ${hours}h left`;
            element.classList.add(days <= 1 ? 'due-warning' : 'due-ok');
        } else if (hours > 0) {
            element.textContent = `${hours}h ${minutes}m left`;
            element.classList.add(hours <= 3 ? 'due-danger' : 'due-warning');
        } else {
            element.textContent = `${minutes}m left`;
            element.classList.add('due-danger');
        }
    } else {
        const overdueDays = Math.abs(Math.floor(remainingTime / (1000 * 60 * 60 * 24)));
        element.textContent = overdueDays > 0 ? `${overdueDays}d overdue` : 'Overdue';
        element.classList.add('overdue');
    }
}

function showDescription(description) {
    const modal = document.getElementById('descriptionModal');
    document.getElementById('taskDescriptionContent').textContent = description;
    modal.classList.remove('hidden');
}

// ================================
// Email Functions
// ================================

function setupEmailButtons() {
    if (emailButtonsSetup) return;
    emailButtonsSetup = true;

    // Mark all as read button
    document.getElementById('markAllReadBtn')?.addEventListener('click', markAllAsRead);

    // Connect email button
    document.getElementById('connectEmailBtn')?.addEventListener('click', connectOutlook);

    // Sync button
    document.getElementById('syncEmailBtn')?.addEventListener('click', syncEmails);

    // Close email detail
    document.getElementById('closeEmailDetail')?.addEventListener('click', () => {
        document.getElementById('emailDetail').classList.add('hidden');
    });

    // Email tabs
    document.querySelectorAll('.email-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.email-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentEmailFilter = tab.dataset.filter;
            renderEmails();
        });
    });

    // Email list event delegation
    const emailList = document.getElementById('emailList');
    if (emailList) {
        emailList.addEventListener('click', (e) => {
            const target = e.target;

            // Convert to task button
            const convertBtn = target.closest('[data-action="convert"]');
            if (convertBtn) {
                e.stopPropagation();
                const emailId = parseInt(convertBtn.dataset.emailId);
                openConvertModal(e, emailId);
                return;
            }

            // Email item click (show detail)
            const emailItem = target.closest('.email-item');
            if (emailItem && !target.closest('.icon-btn-small')) {
                const emailId = parseInt(emailItem.dataset.emailId);
                showEmailDetail(emailId);
            }
        });
    }

    // Convert to task modal
    document.getElementById('closeConvertTaskButton')?.addEventListener('click', () => {
        document.getElementById('convertTaskModal').classList.add('hidden');
    });
    document.getElementById('confirmConvertButton')?.addEventListener('click', confirmConvertToTask);

    // Close modals on backdrop click
    document.getElementById('emailConnectModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'emailConnectModal') {
            document.getElementById('emailConnectModal').classList.add('hidden');
        }
    });
    document.getElementById('convertTaskModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'convertTaskModal') {
            document.getElementById('convertTaskModal').classList.add('hidden');
        }
    });
}

async function loadEmails() {
    try {
        let url = EMAIL_API_BASE;
        if (currentEmailFilter === 'unread') {
            url += '?unread=true';
        }
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            allEmails = data.emails || [];
            updateEmailBadge();
            if (currentModule === 'email') {
                renderEmails();
            }
        }
    } catch (err) {
        console.error('Error loading emails:', err);
    }
}

let importantEmails = [];

async function loadImportantEmails() {
    try {
        const response = await fetch(`${EMAIL_API_BASE}/filter/important`);
        if (response.ok) {
            const data = await response.json();
            importantEmails = data.emails || [];
        }
    } catch (err) {
        console.error('Error loading important emails:', err);
        importantEmails = [];
    }
}

function updateEmailBadge() {
    const badge = document.getElementById('emailBadge');
    const unreadCount = allEmails.filter(e => !e.isRead).length;
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function renderEmails() {
    const list = document.getElementById('emailList');
    if (!list) return;

    let filteredEmails = allEmails;
    if (currentEmailFilter === 'unread') {
        filteredEmails = allEmails.filter(e => !e.isRead);
    }

    if (filteredEmails.length === 0) {
        list.innerHTML = '<div class="no-emails">No emails yet. Click 🔄 to sync.</div>';
        return;
    }

    list.innerHTML = filteredEmails.map(email => `
        <div class="email-item ${email.isRead ? '' : 'unread'}" data-email-id="${email.id}">
            <div class="email-avatar">${(email.fromName || email.from || '?')[0].toUpperCase()}</div>
            <div class="email-content">
                <div class="email-header">
                    <span class="email-sender">${escapeHtml(email.fromName || email.from)}</span>
                    <span class="email-date">${formatEmailDate(email.receivedAt)}</span>
                </div>
                <div class="email-subject">${escapeHtml(email.subject)}</div>
                <div class="email-preview">${escapeHtml(email.bodyPreview || '')}</div>
                ${email.convertedToTask ? '<span class="email-badge-task">Converted to Task</span>' : ''}
            </div>
            <div class="email-item-actions">
                ${!email.convertedToTask ? `<button class="icon-btn-small" data-action="convert" data-email-id="${email.id}" title="Convert to Task">✓</button>` : ''}
            </div>
        </div>
    `).join('');
}

function formatEmailDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;

    if (diff < 86400000 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diff < 604800000) {
        return d.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

async function showEmailDetail(emailId) {
    const email = allEmails.find(e => e.id === emailId);
    if (!email) return;

    selectedEmailId = emailId;
    const detail = document.getElementById('emailDetail');
    const content = document.getElementById('emailDetailContent');

    // Mark as read if not already
    if (!email.isRead) {
        try {
            await fetch(`${EMAIL_API_BASE}/${emailId}/read`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isRead: true })
            });
            email.isRead = true;
            updateEmailBadge();
        } catch (err) {
            console.error('Error marking as read:', err);
        }
    }

    content.innerHTML = `
        <h2 class="email-detail-subject">${escapeHtml(email.subject)}</h2>
        <div class="email-detail-meta">
            <div class="email-detail-sender">
                <div class="email-avatar">${(email.fromName || email.from || '?')[0].toUpperCase()}</div>
                <div>
                    <div class="email-detail-from">${escapeHtml(email.fromName || email.from)}</div>
                    <div class="email-detail-to">to ${escapeHtml(email.to?.join(', ') || 'me')}</div>
                </div>
            </div>
            <div class="email-detail-date">${new Date(email.receivedAt).toLocaleString()}</div>
        </div>
        <div class="email-detail-body">
            ${email.isHtml ? email.body : escapeHtml(email.body || email.bodyPreview || '').replace(/\n/g, '<br>')}
        </div>
        <div class="email-detail-actions">
            ${!email.convertedToTask ? `
                <button class="add-button" onclick="openConvertModal(event, ${email.id})">Convert to Task</button>
            ` : '<span class="email-badge-task">Converted to Task</span>'}
            <button class="task-action-btn delete-btn" onclick="deleteEmail(${email.id})">Delete</button>
        </div>
    `;

    detail.classList.remove('hidden');
}

function openConvertModal(e, emailId) {
    e?.stopPropagation();
    selectedEmailId = emailId;
    const email = allEmails.find(e => e.id === emailId);
    if (!email) return;

    document.getElementById('convertTaskTitle').value = email.subject;

    // Populate project select
    const projectSelect = document.getElementById('convertTaskProject');
    projectSelect.innerHTML = '<option value="">No Project</option>';
    allProjects.forEach(p => {
        projectSelect.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
    });

    document.getElementById('convertTaskModal').classList.remove('hidden');
}

async function confirmConvertToTask() {
    if (!selectedEmailId) return;

    const title = document.getElementById('convertTaskTitle').value.trim();
    const dueDate = document.getElementById('convertTaskDueDate').value || null;
    const priority = document.getElementById('convertTaskPriority').value;
    const projectId = document.getElementById('convertTaskProject').value || null;

    if (!title) return;

    try {
        const response = await fetch(`${EMAIL_API_BASE}/${selectedEmailId}/convert-task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                priority,
                dueDate,
                projectId: projectId ? parseInt(projectId) : null,
                status: 'todocontainer'
            })
        });

        if (response.ok) {
            document.getElementById('convertTaskModal').classList.add('hidden');
            loadEmails();
            loadTasks();
        }
    } catch (err) {
        console.error('Error converting to task:', err);
    }
}

async function deleteEmail(emailId) {
    const ok = await showConfirm({
        title: 'Delete Email',
        message: 'Are you sure you want to delete this email?',
    });
    if (!ok) return;

    try {
        const response = await fetch(`${EMAIL_API_BASE}/${emailId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Email deleted');
            document.getElementById('emailDetail').classList.add('hidden');
            loadEmails();
        }
    } catch (err) {
        console.error('Error deleting email:', err);
    }
}

async function loadEvents() {
    try {
        const response = await fetch(`${EMAIL_API_BASE}/events`);
        if (response.ok) {
            const data = await response.json();
            allEvents = data.events || [];
        }
    } catch (err) {
        console.error('Error loading events:', err);
    }
}

async function markAllAsRead() {
    try {
        const response = await fetch(`${EMAIL_API_BASE}/mark-all-read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerType: 'outlook' })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.count > 0) {
                showToast(`Marked ${data.count} email(s) as read!`);
            } else {
                showToast('No unread emails to mark as read.');
            }
            loadEmails();
            loadImportantEmails();
            if (currentModule === 'dashboard') {
                renderDashboard();
            }
        } else {
            const err = await response.text();
            showToast('Failed to mark all as read: ' + err);
        }
    } catch (err) {
        console.error('Error marking all as read:', err);
        showToast('Failed to mark all as read');
    }
}

async function connectOutlook() {
    try {
        const response = await fetch(`${EMAIL_API_BASE}/providers/outlook/auth-url`);
        if (response.ok) {
            const data = await response.json();
            window.location.href = data.authUrl;
        }
    } catch (err) {
        console.error('Error getting auth URL:', err);
        showToast('Failed to connect to Outlook');
    }
}

async function syncEmails() {
    const btn = document.getElementById('syncEmailBtn');
    if (!btn) return;

    btn.style.animation = 'spin 1s linear infinite';

    try {
        const response = await fetch(`${EMAIL_API_BASE}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerType: 'outlook' })
        });

        if (response.ok) {
            const data = await response.json();
            const messages = [];
            if (data.emailCount > 0) messages.push(`${data.emailCount} email(s)`);
            if (data.eventCount > 0) messages.push(`${data.eventCount} event(s)`);
            if (messages.length > 0) {
                showToast(`Synced ${messages.join(' and ')}!`);
            } else {
                showToast('No new emails or events found.');
            }
            loadEmails();
            loadEvents();
            if (currentModule === 'dashboard') {
                renderDashboard();
            }
        } else {
            const err = await response.text();
            showToast('Failed to sync: ' + err);
        }
    } catch (err) {
        console.error('Error syncing:', err);
        showToast('Failed to sync: ' + err.message);
    } finally {
        if (btn) btn.style.animation = '';
    }
}

let syncStatusData = null;
let llmSyncStatusData = null;

async function loadSyncStatus() {
    try {
        const response = await fetch(`${EMAIL_API_BASE}/usage/sync-status`);
        if (response.ok) {
            const data = await response.json();
            syncStatusData = data.status;
            if (currentModule === 'dashboard') {
                renderSyncStatus();
            }
        }
    } catch (err) {
        console.error('Error loading sync status:', err);
    }
}

function renderSyncStatus() {
    const container = document.getElementById('syncStatus');
    if (!container || !syncStatusData) return;

    const html = syncStatusData.map(status => `
        <div class="sync-provider">
            <div class="sync-provider-header">
                <span class="sync-provider-name">${status.provider.charAt(0).toUpperCase() + status.provider.slice(1)}</span>
                <span class="sync-status-badge ${status.connected ? 'connected' : 'disconnected'}">
                    ${status.connected ? 'Connected' : 'Disconnected'}
                </span>
            </div>
            <div class="sync-provider-details">
                ${status.userEmail ? `
                <div class="sync-detail-item">
                    <span class="sync-detail-label">Email</span>
                    <span class="sync-detail-value">${status.userEmail}</span>
                </div>
                ` : ''}
                <div class="sync-detail-item">
                    <span class="sync-detail-label">Emails Synced</span>
                    <span class="sync-detail-value">${status.emailCount}</span>
                </div>
                <div class="sync-detail-item">
                    <span class="sync-detail-label">Last Sync</span>
                    <span class="sync-detail-value">${status.lastEmailSyncAt ? formatSyncTime(status.lastEmailSyncAt) : 'Never'}</span>
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function formatSyncTime(timeStr) {
    const d = new Date(timeStr);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadLlmSyncStatus() {
    try {
        const response = await fetch(`${EMAIL_API_BASE}/llm-usage/sync-status`);
        if (response.ok) {
            const data = await response.json();
            llmSyncStatusData = data.status;
            if (currentModule === 'dashboard') {
                renderLlmSyncStatus();
            }
        }
    } catch (err) {
        console.error('Error loading LLM sync status:', err);
    }
}

function renderLlmSyncStatus() {
    const container = document.getElementById('llmSyncStatus');
    if (!container || !llmSyncStatusData) return;

    const formatTokens = (tokens) => {
        if (tokens >= 1000000) return (tokens / 1000000).toFixed(2) + 'M';
        if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
        return tokens.toString();
    };

    const html = `
        <div class="sync-provider">
            <div class="sync-provider-header">
                <span class="sync-provider-name">LLM API</span>
                <span class="sync-status-badge connected">Active</span>
            </div>
            <div class="sync-provider-details">
                <div class="sync-detail-item">
                    <span class="sync-detail-label">Last 5 Hours</span>
                    <span class="sync-detail-value">${llmSyncStatusData.fiveHourUsage.calls} calls, ${formatTokens(llmSyncStatusData.fiveHourUsage.tokens)} tokens</span>
                </div>
                <div class="sync-detail-item">
                    <span class="sync-detail-label">This Week</span>
                    <span class="sync-detail-value">${llmSyncStatusData.weeklyUsage.calls} calls, ${formatTokens(llmSyncStatusData.weeklyUsage.tokens)} tokens</span>
                </div>
                <div class="sync-detail-item">
                    <span class="sync-detail-label">This Month</span>
                    <span class="sync-detail-value">${llmSyncStatusData.monthlyUsage.calls} calls, ${formatTokens(llmSyncStatusData.monthlyUsage.tokens)} tokens</span>
                </div>
                <div class="sync-detail-item">
                    <span class="sync-detail-label">Success Rate</span>
                    <span class="sync-detail-value">${llmSyncStatusData.recentSuccessRate}</span>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// Helper to check if task is not expired
function isNotExpired(task) {
    if (!task.dueDate) return true;
    return new Date(task.dueDate) >= new Date().setHours(0, 0, 0, 0);
}

function renderDashboard() {
    const filtered = getFilteredTasks();
    updateStats(filtered);

    const metaContainer = document.getElementById('dashboardMeta');
    if (metaContainer) {
        metaContainer.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Recent Tasks - only high priority, non-expired, non-completed tasks
    const recentTasks = [...filtered]
        .filter(t => mapStatusToFrontend(t.status) !== 'done')
        .filter(t => t.priority === 'high')
        .filter(t => isNotExpired(t))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8);

    const recentHtml = recentTasks.length ? recentTasks.map(task => {
        const project = getProject(task.projectId);
        return `
        <div class="dash-task-item">
            <div class="dash-task-title">${escapeHtml(task.title)}</div>
            <div class="dash-task-meta">
                ${project ? `<span class="dash-task-project" style="--project-color: ${project.color}">${escapeHtml(project.name)}</span>` : ''}
                <span class="dash-task-priority ${task.priority}">${task.priority.toUpperCase()}</span>
                <span class="dash-task-due">${task.dueDate ? formatDate(task.dueDate) : 'No due date'}</span>
            </div>
        </div>
    `;
    }).join('') : '<div class="no-dash-tasks">No recent tasks</div>';

    const recentContainer = document.getElementById('recentTasks');
    if (recentContainer) recentContainer.innerHTML = recentHtml;

    // Important Emails (unread and high importance first)
    renderRecentEmails();

    // Upcoming Deadlines - only high priority, non-expired tasks
    const upcomingTasks = filtered
        .filter(t => t.dueDate && mapStatusToFrontend(t.status) !== 'done')
        .filter(t => t.priority === 'high')
        .filter(t => isNotExpired(t))
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 8);

    const upcomingHtml = upcomingTasks.length ? upcomingTasks.map(task => {
        const project = getProject(task.projectId);
        return `
        <div class="dash-task-item">
            <div class="dash-task-title">${escapeHtml(task.title)}</div>
            <div class="dash-task-meta">
                ${project ? `<span class="dash-task-project" style="--project-color: ${project.color}">${escapeHtml(project.name)}</span>` : ''}
                <span class="dash-task-priority ${task.priority}">${task.priority.toUpperCase()}</span>
                <span class="dash-task-due">${formatDate(task.dueDate)}</span>
            </div>
        </div>
    `;
    }).join('') : '<div class="no-dash-tasks">No upcoming deadlines</div>';

    const upcomingContainer = document.getElementById('upcomingTasks');
    if (upcomingContainer) upcomingContainer.innerHTML = upcomingHtml;

    // Upcoming Meetings
    renderUpcomingEvents();

    // Sync Status and LLM Status
    renderSyncStatus();
    renderLlmSyncStatus();
}

function renderRecentEmails() {
    const container = document.getElementById('recentEmails');
    if (!container) return;

    // Use AI-filtered important emails if available, otherwise fall back to heuristic
    const emailsToShow = importantEmails && importantEmails.length > 0
        ? importantEmails.slice(0, 5)
        : (allEmails || [])
            .sort((a, b) => {
                if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
                if (a.importance !== b.importance) {
                    const order = { high: 0, normal: 1, low: 2 };
                    return (order[a.importance] || 1) - (order[b.importance] || 1);
                }
                return new Date(b.receivedAt) - new Date(a.receivedAt);
            })
            .slice(0, 5);

    if (emailsToShow.length === 0) {
        container.innerHTML = '<div class="no-dash-tasks">No important emails</div>';
        return;
    }

    // Helper to get recipient email from providerType
    const getRecipientEmail = (providerType) => {
        if (!syncStatusData) return providerType || 'email';
        const status = syncStatusData.find(s => s.provider === providerType);
        return status?.userEmail || providerType || 'email';
    };

    const emailsHtml = emailsToShow.map(email => {
        const recipientEmail = getRecipientEmail(email.providerType);
        return `
        <div class="dash-task-item ${email.isRead ? '' : 'unread'}" onclick="switchToEmail(${email.id})">
            <div class="dash-task-title">${escapeHtml(email.subject)}</div>
            <div class="dash-task-meta">
                <span class="dash-task-project" style="--project-color: #3b82f6">From: ${escapeHtml(email.fromName || email.from)}</span>
                <span style="font-size: 12px; color: var(--text-tertiary); background: var(--bg-tertiary); padding: 2px 8px; border-radius: 4px;">To: ${escapeHtml(recipientEmail)}</span>
                <span class="dash-task-due">${formatEmailDate(email.receivedAt)}</span>
            </div>
        </div>
    `}).join('');

    container.innerHTML = emailsHtml;
}

function switchToEmail(emailId) {
    switchModule('email');
    setTimeout(() => showEmailDetail(emailId), 100);
}

function renderUpcomingEvents() {
    const container = document.getElementById('upcomingEvents');
    if (!container) return;

    if (!allEvents || allEvents.length === 0) {
        container.innerHTML = '<div class="no-dash-tasks">No upcoming meetings</div>';
        return;
    }

    const now = new Date();
    const upcomingEvents = allEvents
        .filter(e => new Date(e.start) >= now)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 5);

    if (upcomingEvents.length === 0) {
        container.innerHTML = '<div class="no-dash-tasks">No upcoming meetings</div>';
        return;
    }

    const eventsHtml = upcomingEvents.map(event => `
        <div class="dash-task-item">
            <div class="dash-task-title">${escapeHtml(event.subject)}</div>
            <div class="dash-task-meta">
                <span class="dash-task-priority medium">EVENT</span>
                <span class="dash-task-due">${formatEventDate(event.start)}</span>
            </div>
        </div>
    `).join('');

    container.innerHTML = eventsHtml;
}

function formatEventDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ================================
// Daily Papers Functions
// ================================

function setupPaperButtons() {
    const syncBtn = document.getElementById('syncPapersBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            await syncPapers();
        });
    }
}

async function loadDailyPapers() {
    try {
        const response = await fetch(PAPER_API_BASE);
        if (!response.ok) return;

        const data = await response.json();
        renderDailyPapers(data.papers || [], data.date);
    } catch (error) {
        console.error('Failed to load daily papers:', error);
    }
}

async function syncPapers() {
    const container = document.getElementById('dailyPapers');
    if (!container) return;

    container.innerHTML = '<div class="no-papers">Syncing papers...</div>';

    try {
        const response = await fetch(`${PAPER_API_BASE}/sync?force=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Sync failed');
        }

        const data = await response.json();

        if (data.success) {
            await loadDailyPapers();
        } else {
            container.innerHTML = '<div class="no-papers">Failed to sync papers</div>';
        }
    } catch (error) {
        console.error('Failed to sync papers:', error);
        container.innerHTML = '<div class="no-papers">Failed to sync papers</div>';
    }
}

function renderDailyPapers(papers, date) {
    const container = document.getElementById('dailyPapers');
    if (!container) return;

    if (!papers || papers.length === 0) {
        container.innerHTML = `
            <div class="no-papers">
                No papers for today yet.<br>
                <button class="add-button" style="padding: 6px 12px; font-size: 12px; margin-top: 8px;" onclick="syncPapers()">Sync Now</button>
            </div>
        `;
        return;
    }

    const papersHtml = papers.map(paper => `
        <div class="paper-card">
            <div class="paper-header">
                <div class="paper-title">
                    <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(paper.title)}
                    </a>
                </div>
                <span class="paper-category ${paper.category}">${paper.category.toUpperCase()}</span>
            </div>
            <div class="paper-summary">${escapeHtml(paper.summary || paper.abstract?.substring(0, 150) || '')}</div>
            ${paper.innovation ? `
                <div class="paper-innovation">
                    <span class="paper-innovation-label">Innovation</span>
                    <span class="paper-innovation-text">${escapeHtml(paper.innovation)}</span>
                </div>
            ` : ''}
            <div class="paper-date">
                ${formatPaperDate(paper.publishedAt)}
                ${date ? ` • ${date}` : ''}
                <button class="task-action-btn move-btn" style="margin-left:8px;padding:2px 8px;font-size:11px;" onclick="paperToTask('${escapeHtml(paper.title).replace(/'/g, "\\'")}', '${escapeHtml(paper.url)}')">+ Task</button>
            </div>
        </div>
    `).join('');

    container.innerHTML = papersHtml;
}

async function paperToTask(title, url) {
    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: `Read: ${title}`,
                description: url ? `Paper URL: ${url}` : '',
                priority: 'medium',
            }),
        });
        if (response.ok) {
            showToast('Paper added as task');
            loadTasks();
        }
    } catch (err) {
        console.error('Error creating task from paper:', err);
    }
}

function formatPaperDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ================================
// Command Palette (Ctrl+K)
// ================================
let commandActiveIndex = -1;
let commandItems = [];
let searchDebounce = null;
// Monotonic counter — each query gets a token, only the latest token's response
// is allowed to render. Without this, slow responses can overwrite faster newer
// ones (e.g. user types "ema" then "email" — "ema" returns later, replacing email results).
let searchSeq = 0;

function openCommandPalette() {
    const palette = document.getElementById('commandPalette');
    const input = document.getElementById('commandInput');
    palette.classList.remove('hidden');
    input.value = '';
    input.focus();
    document.getElementById('commandResults').innerHTML = '';
    commandActiveIndex = -1;
    commandItems = [];
}

function closeCommandPalette() {
    document.getElementById('commandPalette').classList.add('hidden');
}

async function searchCommand(query) {
    const results = document.getElementById('commandResults');
    if (!results) return;
    if (!query.trim()) {
        results.innerHTML = '';
        commandItems = [];
        commandActiveIndex = -1;
        return;
    }

    const mySeq = ++searchSeq;
    try {
        const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
        if (mySeq !== searchSeq) return; // a newer query has been issued — drop this response
        const data = await res.json();
        if (mySeq !== searchSeq) return; // also after JSON parse, in case it raced

        let html = '';
        commandItems = [];

        if (data.tasks.length) {
            html += '<div class="command-group-label">Tasks</div>';
            for (const t of data.tasks) {
                const idx = commandItems.length;
                commandItems.push({ type: 'task', data: t });
                html += `<div class="command-item" data-idx="${idx}">
                    <div class="command-item-icon">T</div>
                    <div class="command-item-text">
                        <div class="command-item-title">${escapeHtml(t.title)}</div>
                        <div class="command-item-sub">${t.status.replace('container', '')} ${t.priority ? '• ' + t.priority : ''}</div>
                    </div>
                </div>`;
            }
        }

        if (data.emails.length) {
            html += '<div class="command-group-label">Emails</div>';
            for (const e of data.emails) {
                const idx = commandItems.length;
                commandItems.push({ type: 'email', data: e });
                html += `<div class="command-item" data-idx="${idx}">
                    <div class="command-item-icon">@</div>
                    <div class="command-item-text">
                        <div class="command-item-title">${escapeHtml(e.subject || '(no subject)')}</div>
                        <div class="command-item-sub">${escapeHtml(e.fromName || e.from || '')}</div>
                    </div>
                </div>`;
            }
        }

        if (data.papers.length) {
            html += '<div class="command-group-label">Papers</div>';
            for (const p of data.papers) {
                const idx = commandItems.length;
                commandItems.push({ type: 'paper', data: p });
                html += `<div class="command-item" data-idx="${idx}">
                    <div class="command-item-icon">P</div>
                    <div class="command-item-text">
                        <div class="command-item-title">${escapeHtml(p.title)}</div>
                        <div class="command-item-sub">${(p.authors || []).slice(0, 2).join(', ')}</div>
                    </div>
                </div>`;
            }
        }

        if (!html) {
            html = '<div class="command-empty">No results found</div>';
        }

        results.innerHTML = html;
        commandActiveIndex = -1;

        // Click handlers
        results.querySelectorAll('.command-item').forEach(el => {
            el.addEventListener('click', () => selectCommandItem(parseInt(el.dataset.idx)));
        });
    } catch (err) {
        console.error('Search failed:', err);
    }
}

function navigateCommand(direction) {
    if (commandItems.length === 0) return;
    const results = document.getElementById('commandResults');
    const items = results.querySelectorAll('.command-item');

    if (commandActiveIndex >= 0 && items[commandActiveIndex]) {
        items[commandActiveIndex].classList.remove('active');
    }

    commandActiveIndex += direction;
    if (commandActiveIndex < 0) commandActiveIndex = commandItems.length - 1;
    if (commandActiveIndex >= commandItems.length) commandActiveIndex = 0;

    if (items[commandActiveIndex]) {
        items[commandActiveIndex].classList.add('active');
        items[commandActiveIndex].scrollIntoView({ block: 'nearest' });
    }
}

function selectCommandItem(idx) {
    if (idx < 0 || idx >= commandItems.length) return;
    const item = commandItems[idx];
    closeCommandPalette();

    switch (item.type) {
        case 'task':
            switchModule('board');
            break;
        case 'email':
            switchModule('email');
            break;
        case 'paper':
            if (item.data.url) window.open(item.data.url, '_blank');
            break;
        case 'papers':
            switchModule('dashboard');
            break;
    }
}

// Command palette events
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('commandInput');
    const palette = document.getElementById('commandPalette');

    input?.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => searchCommand(input.value), 200);
    });

    input?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); navigateCommand(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); navigateCommand(-1); }
        else if (e.key === 'Enter' && commandActiveIndex >= 0) { e.preventDefault(); selectCommandItem(commandActiveIndex); }
        else if (e.key === 'Escape') { closeCommandPalette(); }
    });

    palette?.addEventListener('click', (e) => {
        if (e.target === palette) closeCommandPalette();
    });
});

// ================================
// Subtasks
// ================================
async function loadSubtasksForCard(taskId, container) {
    try {
        const res = await fetch(`${API_BASE}/${taskId}/subtasks`);
        if (!res.ok) return;
        const data = await res.json();
        renderSubtasks(taskId, container, data.subtasks || []);
    } catch (e) { /* silent */ }
}

function renderSubtasks(taskId, container, subtasks) {
    container.innerHTML = '';
    if (subtasks.length === 0 && !container.closest('.task-card')?.querySelector('.subtask-add')) {
        // Show add button only
        const addRow = createSubtaskAddRow(taskId, container);
        container.appendChild(addRow);
        return;
    }

    // Progress bar
    if (subtasks.length > 0) {
        const done = subtasks.filter(s => s.completed).length;
        const progress = document.createElement('div');
        progress.className = 'subtask-progress';
        progress.innerHTML = `<div class="subtask-progress-bar" style="width:${(done / subtasks.length * 100).toFixed(0)}%"></div>`;
        container.appendChild(progress);
    }

    // Subtask list
    const list = document.createElement('div');
    list.className = 'subtask-list';
    for (const sub of subtasks) {
        const item = document.createElement('div');
        item.className = 'subtask-item' + (sub.completed ? ' done' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = sub.completed;
        cb.addEventListener('change', async () => {
            await fetch(`${API_BASE}/${taskId}/subtasks/${sub.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: cb.checked })
            });
            loadSubtasksForCard(taskId, container);
        });

        const label = document.createElement('span');
        label.textContent = sub.title;

        const del = document.createElement('button');
        del.className = 'subtask-delete';
        del.textContent = '\u00d7';
        del.onclick = async () => {
            await fetch(`${API_BASE}/${taskId}/subtasks/${sub.id}`, { method: 'DELETE' });
            loadSubtasksForCard(taskId, container);
        };

        item.append(cb, label, del);
        list.appendChild(item);
    }
    container.appendChild(list);

    // Add new subtask input
    container.appendChild(createSubtaskAddRow(taskId, container));
}

function createSubtaskAddRow(taskId, container) {
    const addRow = document.createElement('div');
    addRow.className = 'subtask-add';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '+ Add subtask';
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            e.preventDefault();
            await fetch(`${API_BASE}/${taskId}/subtasks`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: input.value.trim() })
            });
            loadSubtasksForCard(taskId, container);
        }
    });
    addRow.appendChild(input);
    return addRow;
}

// ================================
// Bulk Operations
// ================================
let bulkMode = false;

function getSelectedTaskIds() {
    return Array.from(document.querySelectorAll('.task-checkbox:checked'))
        .map(cb => parseInt(cb.closest('.task-card').dataset.taskId))
        .filter(id => !isNaN(id));
}

function updateBulkSelection() {
    const ids = getSelectedTaskIds();
    const bar = document.getElementById('bulkBar');
    if (ids.length > 0) {
        bulkMode = true;
        document.querySelector('.board')?.classList.add('bulk-mode');
        bar.classList.remove('hidden');
        document.getElementById('bulkCount').textContent = `${ids.length} selected`;
    } else {
        exitBulkMode();
    }
}

function exitBulkMode() {
    bulkMode = false;
    document.querySelector('.board')?.classList.remove('bulk-mode');
    document.getElementById('bulkBar').classList.add('hidden');
    document.querySelectorAll('.task-checkbox:checked').forEach(cb => cb.checked = false);
}

async function bulkMove(status) {
    const ids = getSelectedTaskIds();
    if (!ids.length) return;
    try {
        await fetch(`${API_BASE}/bulk`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskIds: ids, action: 'move', status })
        });
        exitBulkMode();
        loadTasks();
        loadActivityLog();
        showToast(`${ids.length} task(s) moved`);
    } catch (e) { console.error('Bulk move failed:', e); }
}

async function bulkDelete() {
    const ids = getSelectedTaskIds();
    if (!ids.length) return;
    const ok = await showConfirm({
        title: 'Delete Tasks',
        message: `Delete ${ids.length} selected task(s)? This cannot be undone.`,
    });
    if (!ok) return;
    try {
        await fetch(`${API_BASE}/bulk`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskIds: ids, action: 'delete' })
        });
        exitBulkMode();
        loadTasks();
        loadActivityLog();
        showToast(`${ids.length} task(s) deleted`);
    } catch (e) { console.error('Bulk delete failed:', e); }
}

// ================================
// Keyboard Shortcuts
// ================================
const MODULE_KEYS = { '1': 'dashboard', '2': 'board', '3': 'calendar', '4': 'email', '5': 'list', '6': 'today', '7': 'focus' };

document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;

    // Escape — close any open modal/palette (always, even in input — lets users dismiss popups)
    if (e.key === 'Escape') {
        if (!document.getElementById('commandPalette').classList.contains('hidden')) {
            closeCommandPalette(); return;
        }
        document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
        closeSidebar();
        return;
    }

    // Ctrl/Cmd combos and plain key shortcuts: skip when typing.
    // Browsers handle native Cmd+K/Cmd+Z within inputs (e.g. textarea undo) — don't override.
    if (inInput) return;

    // Ctrl+K — open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
        return;
    }

    // Ctrl+Z — undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
    }

    // Ctrl+Shift+Z — redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
    }

    // Ctrl+N — new task
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        switchModule('board');
        setTimeout(() => document.getElementById('taskInput')?.focus(), 100);
        return;
    }

    // 1-5 — switch modules
    if (MODULE_KEYS[e.key]) {
        e.preventDefault();
        switchModule(MODULE_KEYS[e.key]);
        return;
    }

    // ? — show shortcuts help
    if (e.key === '?') {
        e.preventDefault();
        document.getElementById('shortcutsHelp').classList.remove('hidden');
    }
});

