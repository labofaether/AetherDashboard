const { readDB, writeDB } = require('../db');

function getAllTasks(projectId = null) {
    const db = readDB();
    let tasks = db.tasks;
    if (projectId !== null) {
        tasks = tasks.filter(t => t.projectId === projectId);
    }
    return tasks.sort((a, b) => b.id - a.id);
}

function getTaskById(taskId) {
    const db = readDB();
    return db.tasks.find(t => t.id === taskId) || null;
}

function logActivity(action, taskId, taskTitle, details = {}) {
    const db = readDB();
    const logEntry = {
        id: db.activityLog.length > 0 ? Math.max(...db.activityLog.map(l => l.id)) + 1 : 1,
        action,
        taskId,
        taskTitle,
        details,
        timestamp: new Date().toISOString()
    };
    db.activityLog.unshift(logEntry);
    if (db.activityLog.length > 50) {
        db.activityLog = db.activityLog.slice(0, 50);
    }
    writeDB(db);
}

function createTask(title, description, priority, dueDate, status, projectId = null, tags = []) {
    const db = readDB();
    const newId = db.tasks.length > 0 ? Math.max(...db.tasks.map(t => t.id)) + 1 : 1;
    const now = new Date().toISOString();
    const task = {
        id: newId,
        title,
        description: description || '',
        priority,
        status,
        projectId,
        tags,
        createdAt: now,
        updatedAt: now,
        dueDate: dueDate || null,
        completedAt: null
    };
    db.tasks.push(task);
    writeDB(db);
    logActivity('CREATE', newId, title);
    return newId;
}

function updateTask(taskId, status) {
    const db = readDB();
    const task = db.tasks.find(t => t.id === taskId);
    if (task) {
        const oldStatus = task.status;
        task.status = status;
        task.updatedAt = new Date().toISOString();

        // Set completedAt when moving to done, clear when moving out of done
        if (status === 'donecontainer' && oldStatus !== 'donecontainer') {
            task.completedAt = new Date().toISOString();
        } else if (status !== 'donecontainer' && oldStatus === 'donecontainer') {
            task.completedAt = null;
        }

        writeDB(db);
        logActivity('STATUS_CHANGE', taskId, task.title, { from: oldStatus, to: status });
        return true;
    }
    return false;
}

function updateTaskDescription(taskId, description) {
    const db = readDB();
    const task = db.tasks.find(t => t.id === taskId);
    if (task) {
        task.description = description;
        task.updatedAt = new Date().toISOString();
        writeDB(db);
        logActivity('UPDATE_DESCRIPTION', taskId, task.title);
        return true;
    }
    return false;
}

function deleteTask(taskId) {
    const db = readDB();
    const task = db.tasks.find(t => t.id === taskId);
    const initialLength = db.tasks.length;
    db.tasks = db.tasks.filter(t => t.id !== taskId);
    if (db.tasks.length !== initialLength) {
        writeDB(db);
        if (task) {
            logActivity('DELETE', taskId, task.title);
        }
        // Also delete any reminders for this task
        const db2 = readDB();
        db2.reminders = db2.reminders.filter(r => r.taskId !== taskId);
        writeDB(db2);
        return true;
    }
    return false;
}

function clearCompletedTasks(projectId = null) {
    const db = readDB();
    let completedTasks = db.tasks.filter(t => t.status === 'donecontainer');
    if (projectId !== null) {
        completedTasks = completedTasks.filter(t => t.projectId === projectId);
    }
    const count = completedTasks.length;
    const completedIds = new Set(completedTasks.map(t => t.id));
    db.tasks = db.tasks.filter(t => !completedIds.has(t.id));

    // Also delete reminders for completed tasks
    db.reminders = db.reminders.filter(r => !completedIds.has(r.taskId));

    if (count > 0) {
        writeDB(db);
        logActivity('CLEAR_COMPLETED', null, null, { count });
    }
    return count;
}

// Reminder functions
function getAllReminders() {
    const db = readDB();
    return db.reminders.sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
}

function getRemindersByTask(taskId) {
    const db = readDB();
    return db.reminders.filter(r => r.taskId === taskId);
}

function getDueReminders() {
    const db = readDB();
    const now = new Date().toISOString();
    return db.reminders.filter(r => !r.triggered && r.remindAt <= now);
}

function setReminder(taskId, remindAt, note = '') {
    const db = readDB();
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    const newId = db.reminders.length > 0 ? Math.max(...db.reminders.map(r => r.id)) + 1 : 1;
    const reminder = {
        id: newId,
        taskId,
        taskTitle: task.title,
        remindAt,
        note,
        triggered: false,
        createdAt: new Date().toISOString()
    };

    db.reminders.push(reminder);
    writeDB(db);
    return newId;
}

function updateReminder(reminderId, updates) {
    const db = readDB();
    const reminder = db.reminders.find(r => r.id === reminderId);
    if (!reminder) {
        return false;
    }

    Object.assign(reminder, updates, { updatedAt: new Date().toISOString() });
    writeDB(db);
    return true;
}

function deleteReminder(reminderId) {
    const db = readDB();
    const initialLength = db.reminders.length;
    db.reminders = db.reminders.filter(r => r.id !== reminderId);
    if (db.reminders.length !== initialLength) {
        writeDB(db);
        return true;
    }
    return false;
}

function deleteRemindersByTask(taskId) {
    const db = readDB();
    const initialLength = db.reminders.length;
    db.reminders = db.reminders.filter(r => r.taskId !== taskId);
    if (db.reminders.length !== initialLength) {
        writeDB(db);
        return true;
    }
    return false;
}

function markReminderTriggered(reminderId) {
    return updateReminder(reminderId, { triggered: true, triggeredAt: new Date().toISOString() });
}

module.exports = {
    getAllTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    updateTaskDescription,
    clearCompletedTasks,
    getAllReminders,
    getRemindersByTask,
    getDueReminders,
    setReminder,
    updateReminder,
    deleteReminder,
    deleteRemindersByTask,
    markReminderTriggered
};
