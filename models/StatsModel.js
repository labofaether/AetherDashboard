const { getDb } = require('../db');
const { formatLocal, localDateNDaysAgo } = require('../utils/dateRange');

function getWeeklyTaskStats() {
    const db = getDb();
    const startDate = localDateNDaysAgo(6);

    const created = db.prepare(`
        SELECT DATE(createdAt, 'localtime') AS day, COUNT(*) AS count
        FROM tasks
        WHERE DATE(createdAt, 'localtime') >= ?
        GROUP BY DATE(createdAt, 'localtime')
        ORDER BY day ASC
    `).all(startDate);

    const completed = db.prepare(`
        SELECT DATE(completedAt, 'localtime') AS day, COUNT(*) AS count
        FROM tasks
        WHERE completedAt IS NOT NULL AND DATE(completedAt, 'localtime') >= ?
        GROUP BY DATE(completedAt, 'localtime')
        ORDER BY day ASC
    `).all(startDate);

    return { created, completed };
}

function getProjectDistribution() {
    const db = getDb();
    const rows = db.prepare(`
        SELECT p.name AS projectName, p.id AS projectId, COUNT(t.id) AS taskCount
        FROM tasks t
        LEFT JOIN projects p ON t.projectId = p.id
        GROUP BY t.projectId
        ORDER BY taskCount DESC
    `).all();
    return rows;
}

function getStreakDays() {
    const db = getDb();
    const rows = db.prepare(`
        SELECT DISTINCT DATE(completedAt, 'localtime') AS day
        FROM tasks
        WHERE completedAt IS NOT NULL
        ORDER BY day DESC
    `).all();

    if (rows.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < rows.length; i++) {
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        const expectedStr = formatLocal(expected);

        if (rows[i].day === expectedStr) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

module.exports = { getWeeklyTaskStats, getProjectDistribution, getStreakDays };
