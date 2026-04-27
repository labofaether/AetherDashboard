const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db');
const { validate } = require('../middleware/validate');
const log = require('../utils/logger');
const { safeJsonParse } = require('../utils/safeJson');
const router = express.Router();

const searchQuerySchema = z.object({
    q: z.string().max(200).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', validate(searchQuerySchema, 'query'), (req, res) => {
    try {
        const q = req.query.q.trim();
        if (!q) return res.json({ tasks: [], emails: [], papers: [] });

        const limit = req.query.limit;
        const db = getDb();
        const pattern = `%${q}%`;

        const tasks = db.prepare(
            'SELECT * FROM tasks WHERE title LIKE ? OR description LIKE ? ORDER BY id DESC LIMIT ?'
        ).all(pattern, pattern, limit);

        const emails = db.prepare(
            'SELECT * FROM emails WHERE subject LIKE ? OR bodyPreview LIKE ? ORDER BY receivedAt DESC LIMIT ?'
        ).all(pattern, pattern, limit).map(r => ({ ...r, isRead: !!r.isRead }));

        const papers = db.prepare(
            'SELECT * FROM papers WHERE title LIKE ? OR abstract LIKE ? ORDER BY publishedAt DESC LIMIT ?'
        ).all(pattern, pattern, limit).map(r => ({
            ...r,
            authors: safeJsonParse(r.authors, [], `search paper.authors id=${r.id}`),
            categories: safeJsonParse(r.categories, [], `search paper.categories id=${r.id}`),
            worthPushing: !!r.worthPushing
        }));

        res.json({ tasks, emails, papers });
    } catch (error) {
        log.error('Search error', { error: error.message });
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;
