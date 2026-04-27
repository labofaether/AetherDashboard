const { getDb } = require('../db');
const { todayLocal, localDateNDaysAgo } = require('../utils/dateRange');

function getRecentSessions(limit = 10) {
    const db = getDb();
    return db.prepare(`
        SELECT fs.*, t.title AS taskTitle
        FROM focus_sessions fs
        LEFT JOIN tasks t ON fs.taskId = t.id
        ORDER BY fs.startedAt DESC
        LIMIT ?
    `).all(limit);
}

function startSession(taskId, duration) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO focus_sessions (taskId, duration, elapsed, completed, startedAt) VALUES (?, ?, 0, 0, ?)'
    ).run(taskId || null, duration || 1500, now);
    return result.lastInsertRowid;
}

function endSession(id, elapsed, completed) {
    const db = getDb();
    const session = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
    if (!session) return false;

    const now = new Date().toISOString();
    db.prepare('UPDATE focus_sessions SET elapsed = ?, completed = ?, endedAt = ? WHERE id = ?')
        .run(elapsed, completed ? 1 : 0, now, id);
    return true;
}

function getTodayStats() {
    const db = getDb();
    const today = todayLocal();
    const row = db.prepare(`
        SELECT
            COALESCE(SUM(elapsed), 0) AS totalFocusTime,
            COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS sessionsCompleted
        FROM focus_sessions
        WHERE DATE(startedAt, 'localtime') = ?
    `).get(today);
    return row;
}

function getWeeklyStats() {
    const db = getDb();
    const startDate = localDateNDaysAgo(6);

    const rows = db.prepare(`
        SELECT
            DATE(startedAt, 'localtime') AS day,
            COALESCE(SUM(elapsed), 0) AS totalFocusTime,
            COUNT(*) AS sessionCount
        FROM focus_sessions
        WHERE DATE(startedAt, 'localtime') >= ?
        GROUP BY DATE(startedAt, 'localtime')
        ORDER BY day ASC
    `).all(startDate);
    return rows;
}

module.exports = { getRecentSessions, startSession, endSession, getTodayStats, getWeeklyStats };
