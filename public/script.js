const API_BASE = '/tasks';
const PROJECT_API_BASE = '/projects';
const ACTIVITY_API_BASE = '/activity';

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
    setInterval(loadActivityLog, 5000);
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

function renderDashboard() {
    const filtered = getFilteredTasks();
    updateStats(filtered);

    const recentTasks = [...filtered]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8);

    const recentHtml = recentTasks.length ? recentTasks.map(task => `
        <div class="dash-task-item">
            <div class="dash-task-title">${escapeHtml(task.title)}</div>
            <div class="dash-task-meta">
                <span class="dash-task-priority ${task.priority}">${task.priority.toUpperCase()}</span>
                <span class="dash-task-due">${task.dueDate ? formatDate(task.dueDate) : 'No due date'}</span>
            </div>
        </div>
    `).join('') : '<div class="no-dash-tasks">No recent tasks</div>';

    document.getElementById('recentTasks').innerHTML = recentHtml;

    const upcomingTasks = filtered
        .filter(t => t.dueDate && mapStatusToFrontend(t.status) !== 'done')
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 8);

    const upcomingHtml = upcomingTasks.length ? upcomingTasks.map(task => `
        <div class="dash-task-item">
            <div class="dash-task-title">${escapeHtml(task.title)}</div>
            <div class="dash-task-meta">
                <span class="dash-task-priority ${task.priority}">${task.priority.toUpperCase()}</span>
                <span class="dash-task-due">${formatDate(task.dueDate)}</span>
            </div>
        </div>
    `).join('') : '<div class="no-dash-tasks">No upcoming deadlines</div>';

    document.getElementById('upcomingTasks').innerHTML = upcomingHtml;
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
        html += renderCalendarDay(day, month - 1, year, true, today, filtered);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        html += renderCalendarDay(day, month, year, false, today, filtered);
    }

    const remainingDays = 42 - (startDay + daysInMonth);
    for (let day = 1; day <= remainingDays; day++) {
        html += renderCalendarDay(day, month + 1, year, true, today, filtered);
    }

    grid.innerHTML = html;
}

function renderCalendarDay(day, month, year, isOtherMonth, today, tasks) {
    const date = new Date(year, month, day);
    const isToday = date.toDateString() === today.toDateString();
    const dateStr = date.toISOString().split('T')[0];

    const dayTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        const taskDate = new Date(t.dueDate).toISOString().split('T')[0];
        return taskDate === dateStr;
    });

    let tasksHtml = dayTasks.map(task => `
        <div class="calendar-task ${task.priority}">${escapeHtml(task.title.substring(0, 20))}</div>
    `).join('');

    return `
        <div class="calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}">
            <div class="calendar-day-number">${day}</div>
            <div class="calendar-day-tasks">${tasksHtml}</div>
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
        return `
            <tr>
                <td>
                    <div class="list-status">
                        <span class="list-status-dot ${status}"></span>
                        <span class="list-status-text">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </div>
                </td>
                <td class="list-title">${escapeHtml(task.title)}</td>
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
            task.description
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

function createTaskElement(taskId, taskText, priority, dueDate, status, description) {
    const listItem = document.createElement('li');
    listItem.className = `task-card ${priority}`;

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
