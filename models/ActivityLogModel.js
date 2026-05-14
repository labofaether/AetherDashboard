const { getDb } = require('../db');
const { safeJsonParse } = require('../utils/safeJson');

// Cap at 500 — enough for months of single-user activity, small enough that
// the LIMIT-based prune stays cheap. Exported so route/query maxes stay aligned.
const ACTIVITY_LOG_MAX_ROWS = 500;
const PRUNE_BATCH_SIZE = 50;
let writesSincePrune = 0;

function prune() {
    const db = getDb();
    db.prepare(`
        DELETE FROM activity_log WHERE id NOT IN (
            SELECT id FROM activity_log ORDER BY id DESC LIMIT ?
        )
    `).run(ACTIVITY_LOG_MAX_ROWS);
    writesSincePrune = 0;
}

function getRecentActivity(limit = 20) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit);
    return rows.map(r => ({ ...r, details: safeJsonParse(r.details, {}, `activity_log.details id=${r.id}`) }));
}

function getActivityCount() {
    const db = getDb();
    return db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;
}

function addActivity(action, taskId, taskTitle, details = {}) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO activity_log (action, taskId, taskTitle, details, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(action, taskId, taskTitle, JSON.stringify(details), now);

    if (++writesSincePrune >= PRUNE_BATCH_SIZE) prune();

    return { id: result.lastInsertRowid, action, taskId, taskTitle, details, timestamp: now };
}

function clearActivityLog() {
    const db = getDb();
    db.prepare('DELETE FROM activity_log').run();
    writesSincePrune = 0;
}

module.exports = {
    getRecentActivity,
    getActivityCount,
    addActivity,
    clearActivityLog,
    prune,
    ACTIVITY_LOG_MAX_ROWS,
    PRUNE_BATCH_SIZE,
};
