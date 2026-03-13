const { readDB, writeDB } = require('../db');

function getAllTasks(projectId = null) {
    const db = readDB();
    let tasks = db.tasks;
    if (projectId !== null) {
        tasks = tasks.filter(t => t.projectId === projectId);
    }
    return tasks.sort((a, b) => b.id - a.id);
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
        dueDate: dueDate || null
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
    if (count > 0) {
        writeDB(db);
        logActivity('CLEAR_COMPLETED', null, null, { count });
    }
    return count;
}

module.exports = {
    getAllTasks,
    createTask,
    updateTask,
    deleteTask,
    updateTaskDescription,
    clearCompletedTasks
};
