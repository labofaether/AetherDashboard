const { getDb } = require('../db');

function searchAll(q, limit) {
    const db = getDb();
    const pattern = `%${q}%`;

    const tasks = db.prepare(
        'SELECT * FROM tasks WHERE title LIKE ? OR description LIKE ? ORDER BY id DESC LIMIT ?'
    ).all(pattern, pattern, limit);

    const emails = db.prepare(
        'SELECT * FROM emails WHERE subject LIKE ? OR bodyPreview LIKE ? ORDER BY receivedAt DESC LIMIT ?'
    ).all(pattern, pattern, limit).map(r => ({ ...r, isRead: !!r.isRead }));

    const news = db.prepare(
        'SELECT * FROM news_items WHERE title LIKE ? OR summary LIKE ? ORDER BY publishedAt DESC LIMIT ?'
    ).all(pattern, pattern, limit).map(r => ({ ...r, worthPushing: !!r.worthPushing }));

    return { tasks, emails, news };
}

module.exports = { searchAll };
