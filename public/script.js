const API_BASE = '/tasks';
const PROJECT_API_BASE = '/projects';
const ACTIVITY_API_BASE = '/activity';
const EMAIL_API_BASE = '/emails';

let allEmails = [];
let allEvents = [];
let currentEmailFilter = 'all';
let selectedEmailId = null;
let emailButtonsSetup = false;

let currentModule = 'dashboard';
let currentProjectId = 'all';
let allTasks = [];
let allProjects = [];
let selectedColor = '#10a37f';
let calendarMonth = new Date();

document.addEventListener('DOMContentLoaded', () => {
    setupModuleButtons();
    setupProjectButtons();
    setupModalButtons();
    setupBoardButtons();
    setupCalendarButtons();
    setupListControls();
    setupColorOptions();

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
    setInterval(loadActivityLog, 5000);
    setInterval(() => {
        loadEmails();
        loadImportantEmails();
        loadEvents();
        loadSyncStatus();
        loadLlmSyncStatus();
    }, 60000);
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
    document.querySelectorAll('.module-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchModule(btn.dataset.module);
        });
    });
}

function switchModule(module) {
    currentModule = module;
    document.querySelectorAll('.module-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.module === module);
    });
    document.querySelectorAll('.module-view').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(`${module}View`).classList.remove('hidden');

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
            break;
        case 'board':
            renderTasks(getFilteredTasks());
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

    document.getElementById('allCount').textContent = allTasks.length;
}

function getFilteredTasks() {
    if (currentProjectId === 'all') return allTasks;
    return allTasks.filter(t => t.projectId === currentProjectId);
}

async function loadTasks() {
    try {
        const pid = currentProjectId === 'all' ? '' : `?projectId=${currentProjectId}`;
        const response = await fetch(API_BASE + pid);
        if (response.ok) {
            allTasks = await response.json();
            renderProjects();
            renderCurrentView();
            updateStats(allTasks);
        }
    } catch (err) {
        console.error('Error loading tasks:', err);
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

    document.getElementById('dashTotal').textContent = filtered.length;
    document.getElementById('dashDoing').textContent = doingCount;
    document.getElementById('dashDone').textContent = doneCount;
    document.getElementById('dashOverdue').textContent = overdueCount;
}


function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarTitle');

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
    const dateStr = date.toISOString().split('T')[0];

    const dayTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        const taskDate = new Date(t.dueDate).toISOString().split('T')[0];
        return taskDate === dateStr;
    });

    const dayEvents = (events || []).filter(e => {
        if (!e.start) return false;
        const eventDate = new Date(e.start).toISOString().split('T')[0];
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
    const filter = document.getElementById('listFilter').value;
    const sort = document.getElementById('listSort').value;
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

function renderTasks(tasks) {
    const todoList = document.getElementById('todoList');
    const doingList = document.getElementById('doingList');
    const doneList = document.getElementById('doneList');

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
            task.projectId
        );
        if (frontendStatus === 'todo') {
            todoList.appendChild(listItem);
        } else if (frontendStatus === 'doing') {
            doingList.appendChild(listItem);
        } else if (frontendStatus === 'done') {
            doneList.appendChild(listItem);
        }
    });

    document.getElementById('todoCount').textContent = todoList.children.length;
    document.getElementById('doingCount').textContent = doingList.children.length;
    document.getElementById('doneCount').textContent = doneList.children.length;
}

function createTaskElement(taskId, taskText, priority, dueDate, status, description, projectId) {
    const listItem = document.createElement('li');
    listItem.className = `task-card ${priority}`;

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
        setInterval(() => updateCountdown(countdown, dueDate), 1000);
    } else {
        countdown.textContent = '';
    }
    metaDiv.appendChild(countdown);
    listItem.appendChild(metaDiv);

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'task-actions';

    const editButton = document.createElement('button');
    editButton.className = 'task-action-btn edit-btn';
    editButton.textContent = 'Edit';
    editButton.onclick = async (e) => {
        e.stopPropagation();
        const newDescription = prompt('Enter a description for this task:', descriptionText === 'No description added.' ? '' : descriptionText);
        if (newDescription !== null) {
            descriptionText = newDescription || 'No description added.';
            try {
                const response = await fetch(`${API_BASE}/description`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId, description: newDescription }),
                });
                if (!response.ok) {
                    console.error('Failed to update description', await response.text());
                }
                loadTasks();
                loadActivityLog();
            } catch (err) {
                console.error('Error updating description:', err);
            }
        }
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
    try {
        const response = await fetch(`${API_BASE}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, status: newBackendStatus }),
        });
        if (response.ok) {
            loadTasks();
            loadActivityLog();
        } else {
            console.error('Failed to update status', await response.text());
        }
    } catch (err) {
        console.error('Error updating status:', err);
    }
}

async function deleteTaskConfirm(taskId) {
    if (!confirm('Delete this task?')) return;
    try {
        const response = await fetch(API_BASE, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId }),
        });
        if (response.ok) {
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
            taskInput.value = '';
            dueDateInput.value = '';
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
    if (!confirm(`Clear ${doneCount} completed task(s)?`)) return;

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
    if (remainingTime > 0) {
        const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) {
            element.textContent = `${days}d ${hours}h left`;
        } else if (hours > 0) {
            element.textContent = `${hours}h ${minutes}m left`;
        } else {
            element.textContent = `${minutes}m left`;
        }
        element.classList.remove('overdue');
    } else {
        element.textContent = 'Overdue';
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
    if (!confirm('Delete this email?')) return;

    try {
        const response = await fetch(`${EMAIL_API_BASE}/${emailId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
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
                alert(`Marked ${data.count} email(s) as read!`);
            } else {
                alert('No unread emails to mark as read.');
            }
            loadEmails();
            loadImportantEmails();
            if (currentModule === 'dashboard') {
                renderDashboard();
            }
        } else {
            const err = await response.text();
            alert('Failed to mark all as read: ' + err);
        }
    } catch (err) {
        console.error('Error marking all as read:', err);
        alert('Failed to mark all as read');
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
        alert('Failed to connect to Outlook');
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
                alert(`Synced ${messages.join(' and ')}!`);
            } else {
                alert('No new emails or events found.');
            }
            loadEmails();
            loadEvents();
            if (currentModule === 'dashboard') {
                renderDashboard();
            }
        } else {
            const err = await response.text();
            alert('Failed to sync: ' + err);
        }
    } catch (err) {
        console.error('Error syncing:', err);
        alert('Failed to sync: ' + err.message);
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

    // Recent Tasks
    const recentTasks = [...filtered]
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

    // Upcoming Deadlines
    const upcomingTasks = filtered
        .filter(t => t.dueDate && mapStatusToFrontend(t.status) !== 'done')
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

    const emailsHtml = emailsToShow.map(email => `
        <div class="dash-task-item ${email.isRead ? '' : 'unread'}" onclick="switchToEmail(${email.id})">
            <div class="dash-task-title">${escapeHtml(email.subject)}</div>
            <div class="dash-task-meta">
                <span class="dash-task-project" style="--project-color: #3b82f6">${escapeHtml(email.fromName || email.from)}</span>
                <span class="dash-task-due">${formatEmailDate(email.receivedAt)}</span>
            </div>
        </div>
    `).join('');

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


