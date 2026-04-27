const { getDb } = require('../db');
const { todayLocal } = require('../utils/dateRange');

function getAllTasks(projectId = null) {
    const db = getDb();
    if (projectId !== null) {
        return db.prepare('SELECT * FROM tasks WHERE projectId = ? ORDER BY id DESC').all(projectId);
    }
    return db.prepare('SELECT * FROM tasks ORDER BY id DESC').all();
}

function getTaskById(taskId) {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) || null;
}

function logActivity(action, taskId, taskTitle, details = {}) {
    const db = getDb();
    db.prepare(
        'INSERT INTO activity_log (action, taskId, taskTitle, details, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(action, taskId, taskTitle, JSON.stringify(details), new Date().toISOString());

    // Keep only last 50 entries
    db.prepare(`
        DELETE FROM activity_log WHERE id NOT IN (
            SELECT id FROM activity_log ORDER BY id DESC LIMIT 50
        )
    `).run();
}

function createTask(title, description, priority, dueDate, status, projectId = null, tags = []) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(`
        INSERT INTO tasks (title, description, priority, status, projectId, tags, dueDate, completedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(title, description || '', priority, status, projectId, JSON.stringify(tags), dueDate || null, now, now);

    logActivity('CREATE', result.lastInsertRowid, title);
    return result.lastInsertRowid;
}

function updateTask(taskId, status) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return false;

    const oldStatus = task.status;
    const now = new Date().toISOString();
    let completedAt = task.completedAt;

    if (status === 'donecontainer' && oldStatus !== 'donecontainer') {
        completedAt = now;
    } else if (status !== 'donecontainer' && oldStatus === 'donecontainer') {
        completedAt = null;
    }

    db.prepare('UPDATE tasks SET status = ?, completedAt = ?, updatedAt = ? WHERE id = ?')
        .run(status, completedAt, now, taskId);

    logActivity('STATUS_CHANGE', taskId, task.title, { from: oldStatus, to: status });
    return true;
}

function updateTaskFields(taskId, fields) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return false;

    const allowed = ['title', 'description', 'priority', 'dueDate', 'projectId', 'tags', 'pinnedToday', 'recurPattern', 'recurNextDate', 'isUrgent', 'isImportant'];
    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
        if (!allowed.includes(key)) continue;
        if (key === 'tags') {
            sets.push('tags = ?'); values.push(JSON.stringify(val));
        } else {
            sets.push(`${key} = ?`); values.push(val);
        }
    }
    if (sets.length === 0) return false;

    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(taskId);

    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    logActivity('UPDATE', taskId, task.title);
    return true;
}

function updateTaskDescription(taskId, description) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return false;

    db.prepare('UPDATE tasks SET description = ?, updatedAt = ? WHERE id = ?')
        .run(description, new Date().toISOString(), taskId);

    logActivity('UPDATE_DESCRIPTION', taskId, task.title);
    return true;
}

function deleteTask(taskId) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return false;

    const del = db.transaction(() => {
        db.prepare('DELETE FROM reminders WHERE taskId = ?').run(taskId);
        db.prepare('DELETE FROM subtasks WHERE taskId = ?').run(taskId);
        // Emails are independent of tasks — keep them but break the link.
        db.prepare('UPDATE emails SET taskId = NULL, convertedToTask = 0, updatedAt = ? WHERE taskId = ?')
            .run(new Date().toISOString(), taskId);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    });
    del();

    logActivity('DELETE', taskId, task.title);
    return true;
}

function clearCompletedTasks(projectId = null) {
    const db = getDb();
    let completed;
    if (projectId !== null) {
        completed = db.prepare('SELECT id FROM tasks WHERE status = ? AND projectId = ?').all('donecontainer', projectId);
    } else {
        completed = db.prepare('SELECT id FROM tasks WHERE status = ?').all('donecontainer');
    }

    if (completed.length === 0) return 0;

    const ids = completed.map(t => t.id);
    const placeholders = ids.map(() => '?').join(',');

    const clear = db.transaction(() => {
        db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);
        db.prepare(`DELETE FROM reminders WHERE taskId IN (${placeholders})`).run(...ids);
    });
    clear();

    logActivity('CLEAR_COMPLETED', null, null, { count: ids.length });
    return ids.length;
}

// Reminder functions
function getAllReminders() {
    const db = getDb();
    return db.prepare('SELECT * FROM reminders ORDER BY remindAt ASC').all();
}

function getRemindersByTask(taskId) {
    const db = getDb();
    return db.prepare('SELECT * FROM reminders WHERE taskId = ?').all(taskId);
}

function getDueReminders() {
    const db = getDb();
    const now = new Date().toISOString();
    return db.prepare('SELECT * FROM reminders WHERE triggered = 0 AND remindAt <= ?').all(now);
}

function setReminder(taskId, remindAt, note = '') {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) throw new Error('Task not found');

    const result = db.prepare(`
        INSERT INTO reminders (taskId, taskTitle, remindAt, note, triggered, createdAt)
        VALUES (?, ?, ?, ?, 0, ?)
    `).run(taskId, task.title, remindAt, note, new Date().toISOString());

    return result.lastInsertRowid;
}

function updateReminder(reminderId, updates) {
    const db = getDb();
    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
    if (!reminder) return false;

    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
        sets.push(`${key} = ?`);
        values.push(val);
    }
    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(reminderId);

    db.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return true;
}

function deleteReminder(reminderId) {
    const db = getDb();
    const result = db.prepare('DELETE FROM reminders WHERE id = ?').run(reminderId);
    return result.changes > 0;
}

function deleteRemindersByTask(taskId) {
    const db = getDb();
    const result = db.prepare('DELETE FROM reminders WHERE taskId = ?').run(taskId);
    return result.changes > 0;
}

function markReminderTriggered(reminderId) {
    return updateReminder(reminderId, { triggered: 1, triggeredAt: new Date().toISOString() });
}

// Subtask functions
function getSubtasks(taskId) {
    const db = getDb();
    return db.prepare('SELECT * FROM subtasks WHERE taskId = ? ORDER BY sortOrder ASC, id ASC').all(taskId)
        .map(r => ({ ...r, completed: !!r.completed }));
}

function createSubtask(taskId, title) {
    const db = getDb();
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) throw new Error('Task not found');

    const maxOrder = db.prepare('SELECT MAX(sortOrder) as m FROM subtasks WHERE taskId = ?').get(taskId).m || 0;
    const result = db.prepare(
        'INSERT INTO subtasks (taskId, title, completed, sortOrder, createdAt) VALUES (?, ?, 0, ?, ?)'
    ).run(taskId, title, maxOrder + 1, new Date().toISOString());
    return result.lastInsertRowid;
}

function updateSubtask(subtaskId, updates) {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId);
    if (!sub) return false;

    const sets = [];
    const values = [];
    if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
    if (updates.completed !== undefined) { sets.push('completed = ?'); values.push(updates.completed ? 1 : 0); }
    if (updates.sortOrder !== undefined) { sets.push('sortOrder = ?'); values.push(updates.sortOrder); }
    if (sets.length === 0) return false;

    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(subtaskId);

    db.prepare(`UPDATE subtasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return true;
}

function deleteSubtask(subtaskId) {
    const db = getDb();
    return db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtaskId).changes > 0;
}

// Bulk operations
function bulkUpdateTasks(taskIds, updates) {
    const db = getDb();
    const allowed = ['status', 'priority', 'projectId'];
    const sets = [];
    const values = [];

    for (const [key, val] of Object.entries(updates)) {
        if (!allowed.includes(key)) continue;
        sets.push(`${key} = ?`);
        values.push(val);
    }
    if (sets.length === 0) return 0;

    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());

    const placeholders = taskIds.map(() => '?').join(',');
    const result = db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id IN (${placeholders})`).run(...values, ...taskIds);

    if (updates.status === 'donecontainer') {
        const now = new Date().toISOString();
        db.prepare(`UPDATE tasks SET completedAt = ? WHERE id IN (${placeholders}) AND completedAt IS NULL`).run(now, ...taskIds);
    } else if (updates.status && updates.status !== 'donecontainer') {
        db.prepare(`UPDATE tasks SET completedAt = NULL WHERE id IN (${placeholders}) AND completedAt IS NOT NULL`).run(...taskIds);
    }

    return result.changes;
}

function bulkDeleteTasks(taskIds) {
    const db = getDb();
    const placeholders = taskIds.map(() => '?').join(',');
    const del = db.transaction(() => {
        db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...taskIds);
        db.prepare(`DELETE FROM reminders WHERE taskId IN (${placeholders})`).run(...taskIds);
        db.prepare(`DELETE FROM subtasks WHERE taskId IN (${placeholders})`).run(...taskIds);
    });
    del();
    logActivity('BULK_DELETE', null, null, { count: taskIds.length });
    return taskIds.length;
}

function pinTaskToday(taskId, pinned) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return false;

    db.prepare('UPDATE tasks SET pinnedToday = ?, updatedAt = ? WHERE id = ?')
        .run(pinned ? 1 : 0, new Date().toISOString(), taskId);
    return true;
}

function getTodayTasks() {
    const db = getDb();
    const today = todayLocal();
    return db.prepare(`
        SELECT * FROM tasks
        WHERE pinnedToday = 1 OR (dueDate = ? AND status != 'donecontainer')
        ORDER BY id DESC
    `).all(today);
}

function setTaskUrgentImportant(taskId, { isUrgent, isImportant }) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return false;

    db.prepare('UPDATE tasks SET isUrgent = ?, isImportant = ?, updatedAt = ? WHERE id = ?')
        .run(isUrgent ? 1 : 0, isImportant ? 1 : 0, new Date().toISOString(), taskId);
    return true;
}

function getRecurringTasks() {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks WHERE recurPattern IS NOT NULL ORDER BY id DESC').all();
}

module.exports = {
    getAllTasks,
    getTaskById,
    createTask,
    updateTask,
    updateTaskFields,
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
    markReminderTriggered,
    getSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    bulkUpdateTasks,
    bulkDeleteTasks,
    pinTaskToday,
    getTodayTasks,
    setTaskUrgentImportant,
    getRecurringTasks
};
