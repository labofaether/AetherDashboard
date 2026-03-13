const { readDB, writeDB } = require('../db');

function getRecentActivity(limit = 20) {
    const db = readDB();
    return db.activityLog.slice(0, limit);
}

function addActivity(action, taskId, taskTitle, details = {}) {
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
    if (db.activityLog.length > 100) {
        db.activityLog = db.activityLog.slice(0, 100);
    }
    writeDB(db);
    return logEntry;
}

function clearActivityLog() {
    const db = readDB();
    db.activityLog = [];
    writeDB(db);
}

module.exports = { getRecentActivity, addActivity, clearActivityLog };
