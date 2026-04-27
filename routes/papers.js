const express = require('express');
const { z } = require('zod');
const router = express.Router();
const PaperService = require('../services/PaperService');
const PaperModel = require('../models/PaperModel');
const { validate } = require('../middleware/validate');
const log = require('../utils/logger');
const { todayLocal } = require('../utils/dateRange');

const syncPapersSchema = z.object({
    force: z.boolean().default(false),
});

const historyQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).default(7),
});

const allPapersQuerySchema = z.object({
    category: z.string().max(100).optional(),
    worthPushing: z.enum(['true', 'false']).optional(),
});

router.get('/', (req, res) => {
    try {
        const papers = PaperService.getTodaysPapers();
        res.json({ papers, date: todayLocal() });
    } catch (error) {
        log.error('Error getting today\'s papers', { error: error.message });
        res.status(500).json({ error: 'Failed to get papers' });
    }
});

router.get('/history', validate(historyQuerySchema, 'query'), (req, res) => {
    try {
        const history = PaperService.getPaperHistory(req.query.days);
        res.json({ history });
    } catch (error) {
        log.error('Error getting paper history', { error: error.message });
        res.status(500).json({ error: 'Failed to get paper history' });
    }
});

router.get('/all', validate(allPapersQuerySchema, 'query'), (req, res) => {
    try {
        const { category, worthPushing } = req.query;
        const filters = {};
        if (category) filters.category = category;
        if (worthPushing !== undefined) filters.worthPushing = worthPushing === 'true';

        const papers = PaperModel.getAllPapers(filters);
        res.json({ papers });
    } catch (error) {
        log.error('Error getting all papers', { error: error.message });
        res.status(500).json({ error: 'Failed to get papers' });
    }
});

router.post('/sync', validate(syncPapersSchema), async (req, res) => {
    try {
        const force = req.query.force === 'true' || req.body.force === true;
        const result = await PaperService.syncPapers(force);
        res.json(result);
    } catch (error) {
        log.error('Error syncing papers', { error: error.message });
        res.status(500).json({ error: 'Failed to sync papers', message: error.message });
    }
});

router.get('/status', (req, res) => {
    try {
        const hasTodays = PaperModel.hasTodaysPapers();
        const todaysPapers = PaperModel.getTodaysPapers();
        const allPapers = PaperModel.getAllPapers();

        res.json({
            hasTodaysPapers: hasTodays,
            todaysCount: todaysPapers.length,
            totalPapers: allPapers.length,
            today: todayLocal()
        });
    } catch (error) {
        log.error('Error getting paper status', { error: error.message });
        res.status(500).json({ error: 'Failed to get status' });
    }
});

module.exports = router;
