const { getDb } = require('../db');
const paperConfig = require('../config/paperCategories');
const { safeJsonParse } = require('../utils/safeJson');
const { todayLocal } = require('../utils/dateRange');

function generateId() {
    return 'paper_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function rowToPaper(row) {
    if (!row) return null;
    return {
        ...row,
        authors: safeJsonParse(row.authors, [], `paper.authors id=${row.id}`),
        categories: safeJsonParse(row.categories, [], `paper.categories id=${row.id}`),
        worthPushing: !!row.worthPushing
    };
}

function getAllPapers(filters = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM papers WHERE 1=1';
    const params = [];

    if (filters.category) { sql += ' AND category = ?'; params.push(filters.category); }
    if (filters.worthPushing !== undefined) { sql += ' AND worthPushing = ?'; params.push(filters.worthPushing ? 1 : 0); }
    if (filters.displayedOn) { sql += ' AND displayedOn = ?'; params.push(filters.displayedOn); }
    if (filters.since) { sql += ' AND createdAt >= ?'; params.push(filters.since); }

    sql += ' ORDER BY publishedAt DESC';
    return db.prepare(sql).all(...params).map(rowToPaper);
}

function getTodaysPapers(dateStr = null) {
    const targetDate = dateStr || todayLocal();
    return getAllPapers({ displayedOn: targetDate, worthPushing: true });
}

function getPaperById(id) {
    const db = getDb();
    return rowToPaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id));
}

function getPaperByArxivId(arxivId) {
    const db = getDb();
    return rowToPaper(db.prepare('SELECT * FROM papers WHERE arxivId = ?').get(arxivId));
}

function savePaper(paperData) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM papers WHERE arxivId = ?').get(paperData.arxivId);

    if (existing) {
        const sets = [];
        const values = [];
        for (const [key, val] of Object.entries(paperData)) {
            if (key === 'id') continue;
            if (key === 'authors' || key === 'categories') {
                sets.push(`${key} = ?`); values.push(JSON.stringify(val));
            } else if (typeof val === 'boolean') {
                sets.push(`${key} = ?`); values.push(val ? 1 : 0);
            } else {
                sets.push(`${key} = ?`); values.push(val);
            }
        }
        sets.push('updatedAt = ?');
        values.push(new Date().toISOString());
        values.push(existing.id);
        db.prepare(`UPDATE papers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        return existing.id;
    }

    const id = paperData.id || generateId();
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO papers (id, arxivId, title, abstract, authors, publishedAt, updatedAt, url,
            categories, category, worthPushing, filterReason, summary, innovation, displayedOn, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, paperData.arxivId, paperData.title, paperData.abstract,
        JSON.stringify(paperData.authors || []), paperData.publishedAt, now, paperData.url,
        JSON.stringify(paperData.categories || []), paperData.category,
        paperData.worthPushing ? 1 : 0, paperData.filterReason,
        paperData.summary, paperData.innovation, paperData.displayedOn || null, now
    );
    return id;
}

function savePapers(paperDataList) {
    const ids = [];
    for (const paperData of paperDataList) {
        ids.push(savePaper(paperData));
    }
    return ids;
}

function markAsDisplayed(paperIds, dateStr = null) {
    const targetDate = dateStr || todayLocal();
    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE papers SET displayedOn = ?, updatedAt = ? WHERE id = ?');
    const update = db.transaction(() => {
        for (const id of paperIds) {
            stmt.run(targetDate, now, id);
        }
    });
    update();
}

function hasTodaysPapers() {
    const today = todayLocal();
    return getTodaysPapers(today).length >= paperConfig.selection.totalDailyPapers;
}

function getUndisplayedPapers() {
    const db = getDb();
    return db.prepare('SELECT * FROM papers WHERE displayedOn IS NULL AND worthPushing = 1 ORDER BY publishedAt DESC')
        .all().map(rowToPaper);
}

function cleanupOldPapers() {
    const db = getDb();
    const maxAgeMs = paperConfig.retention.maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = db.prepare('DELETE FROM papers WHERE createdAt < ?').run(cutoff);
    return result.changes;
}

function getPaperHistory(days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const papers = getAllPapers({ since, worthPushing: true });

    const grouped = {};
    for (const paper of papers) {
        const date = paper.displayedOn || paper.createdAt.split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(paper);
    }
    return grouped;
}

module.exports = {
    getAllPapers,
    getTodaysPapers,
    getPaperById,
    getPaperByArxivId,
    savePaper,
    savePapers,
    markAsDisplayed,
    hasTodaysPapers,
    getUndisplayedPapers,
    cleanupOldPapers,
    getPaperHistory
};
