const { getDb } = require('../db');
const newsConfig = require('../config/newsConfig');
const { todayLocal } = require('../utils/dateRange');

function generateId() {
    return 'news_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function rowToItem(row) {
    if (!row) return null;
    return { ...row, worthPushing: !!row.worthPushing };
}

function getAllNews(filters = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM news_items WHERE 1=1';
    const params = [];

    if (filters.company) { sql += ' AND company = ?'; params.push(filters.company); }
    if (filters.worthPushing !== undefined) { sql += ' AND worthPushing = ?'; params.push(filters.worthPushing ? 1 : 0); }
    if (filters.displayedOn) { sql += ' AND displayedOn = ?'; params.push(filters.displayedOn); }
    if (filters.since) { sql += ' AND createdAt >= ?'; params.push(filters.since); }
    if (filters.source) { sql += ' AND source = ?'; params.push(filters.source); }
    if (filters.eventType) { sql += ' AND eventType = ?'; params.push(filters.eventType); }

    sql += ' ORDER BY publishedAt DESC';
    return db.prepare(sql).all(...params).map(rowToItem);
}

function getTodaysNews(dateStr = null) {
    const targetDate = dateStr || todayLocal();
    return getAllNews({ displayedOn: targetDate, worthPushing: true });
}

function getNewsById(id) {
    const db = getDb();
    return rowToItem(db.prepare('SELECT * FROM news_items WHERE id = ?').get(id));
}

function getNewsBySourceId(sourceId) {
    const db = getDb();
    return rowToItem(db.prepare('SELECT * FROM news_items WHERE sourceId = ?').get(sourceId));
}

// Returns a Set of sourceId strings seen within the last `days` days. Used by
// NewsService.fetchAndEvaluate to dedupe before spending an LLM call per item.
function getRecentSourceIds(days = 7) {
    const db = getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare('SELECT sourceId FROM news_items WHERE createdAt >= ?').all(cutoff);
    return new Set(rows.map(r => r.sourceId));
}

function saveNews(itemData) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM news_items WHERE sourceId = ?').get(itemData.sourceId);

    if (existing) {
        const sets = [];
        const values = [];
        for (const [key, val] of Object.entries(itemData)) {
            if (key === 'id') continue;
            if (typeof val === 'boolean') {
                sets.push(`${key} = ?`); values.push(val ? 1 : 0);
            } else {
                sets.push(`${key} = ?`); values.push(val);
            }
        }
        if (sets.length === 0) return existing.id;
        values.push(existing.id);
        db.prepare(`UPDATE news_items SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        return existing.id;
    }

    const id = itemData.id || generateId();
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO news_items (id, sourceId, source, title, url, author, score, commentCount,
            publishedAt, summary, company, eventType, worthPushing, filterReason, displayedOn, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, itemData.sourceId, itemData.source, itemData.title, itemData.url,
        itemData.author || null, itemData.score || 0, itemData.commentCount || 0,
        itemData.publishedAt, itemData.summary || null, itemData.company || null,
        itemData.eventType || null,
        itemData.worthPushing ? 1 : 0, itemData.filterReason || null,
        itemData.displayedOn || null, now
    );
    return id;
}

function saveNewsBatch(itemList) {
    const ids = [];
    for (const itemData of itemList) ids.push(saveNews(itemData));
    return ids;
}

function markAsDisplayed(itemIds, dateStr = null) {
    const targetDate = dateStr || todayLocal();
    const db = getDb();
    const stmt = db.prepare('UPDATE news_items SET displayedOn = ? WHERE id = ?');
    const update = db.transaction(() => {
        for (const id of itemIds) stmt.run(targetDate, id);
    });
    update();
}

function hasTodaysNews() {
    const today = todayLocal();
    return getTodaysNews(today).length >= newsConfig.selection.totalDailyItems;
}

function getUndisplayedNews() {
    const db = getDb();
    return db.prepare('SELECT * FROM news_items WHERE displayedOn IS NULL AND worthPushing = 1 ORDER BY score DESC, publishedAt DESC')
        .all().map(rowToItem);
}

function cleanupOldNews() {
    const db = getDb();
    const maxAgeMs = newsConfig.retention.maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = db.prepare('DELETE FROM news_items WHERE createdAt < ?').run(cutoff);
    return result.changes;
}

function getNewsHistory(days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const items = getAllNews({ since, worthPushing: true });

    const grouped = {};
    for (const item of items) {
        const date = item.displayedOn || item.createdAt.split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(item);
    }
    return grouped;
}

module.exports = {
    getAllNews,
    getTodaysNews,
    getNewsById,
    getNewsBySourceId,
    getRecentSourceIds,
    saveNews,
    saveNewsBatch,
    markAsDisplayed,
    hasTodaysNews,
    getUndisplayedNews,
    cleanupOldNews,
    getNewsHistory
};
