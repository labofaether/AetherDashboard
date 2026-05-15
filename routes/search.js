const express = require('express');
const { z } = require('zod');
const { searchAll } = require('../models/SearchModel');
const { validate } = require('../middleware/validate');
const log = require('../utils/logger');
const router = express.Router();

const searchQuerySchema = z.object({
    q: z.string().max(200).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', validate(searchQuerySchema, 'query'), (req, res) => {
    try {
        const q = req.query.q.trim();
        if (!q) return res.json({ tasks: [], emails: [], news: [] });

        res.json(searchAll(q, req.query.limit));
    } catch (error) {
        log.error('Search error', { error: error.message });
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;
