const express = require('express');
const { z } = require('zod');
const router = express.Router();
const NewsService = require('../services/NewsService');
const NewsModel = require('../models/NewsModel');
const { validate } = require('../middleware/validate');
const log = require('../utils/logger');
const { todayLocal } = require('../utils/dateRange');

const syncNewsSchema = z.object({
    force: z.boolean().default(false),
});

const historyQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).default(7),
});

const allNewsQuerySchema = z.object({
    company: z.string().max(100).optional(),
    source: z.string().max(50).optional(),
    eventType: z.string().max(50).optional(),
    worthPushing: z.enum(['true', 'false']).optional(),
});

router.get('/', (req, res) => {
    try {
        const items = NewsService.getTodaysNews();
        res.json({ items, date: todayLocal() });
    } catch (error) {
        log.error('Error getting today\'s news', { error: error.message });
        res.status(500).json({ error: 'Failed to get news' });
    }
});

router.get('/history', validate(historyQuerySchema, 'query'), (req, res) => {
    try {
        const history = NewsService.getNewsHistory(req.query.days);
        res.json({ history });
    } catch (error) {
        log.error('Error getting news history', { error: error.message });
        res.status(500).json({ error: 'Failed to get news history' });
    }
});

router.get('/all', validate(allNewsQuerySchema, 'query'), (req, res) => {
    try {
        const { company, source, eventType, worthPushing } = req.query;
        const filters = {};
        if (company) filters.company = company;
        if (source) filters.source = source;
        if (eventType) filters.eventType = eventType;
        if (worthPushing !== undefined) filters.worthPushing = worthPushing === 'true';

        const items = NewsModel.getAllNews(filters);
        res.json({ items });
    } catch (error) {
        log.error('Error getting all news', { error: error.message });
        res.status(500).json({ error: 'Failed to get news' });
    }
});

router.post('/sync', validate(syncNewsSchema), async (req, res) => {
    try {
        const force = req.query.force === 'true' || req.body.force === true;
        const result = await NewsService.syncNews(force);
        res.json(result);
    } catch (error) {
        log.error('Error syncing news', { error: error.message });
        res.status(500).json({ error: 'Failed to sync news', message: error.message });
    }
});

router.get('/status', (req, res) => {
    try {
        const hasTodays = NewsModel.hasTodaysNews();
        const todaysItems = NewsModel.getTodaysNews();
        const allItems = NewsModel.getAllNews();

        res.json({
            hasTodaysNews: hasTodays,
            todaysCount: todaysItems.length,
            totalItems: allItems.length,
            today: todayLocal()
        });
    } catch (error) {
        log.error('Error getting news status', { error: error.message });
        res.status(500).json({ error: 'Failed to get status' });
    }
});

module.exports = router;
