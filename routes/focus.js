const express = require('express');
const { z } = require('zod');
const { getRecentSessions, startSession, endSession, getTodayStats, getWeeklyStats } = require('../models/FocusModel');
const { validate } = require('../middleware/validate');
const { validateIdParam } = require('../middleware/validateIdParam');
const log = require('../utils/logger');
const router = express.Router();

const startSessionSchema = z.object({
    taskId: z.number().int().positive().nullable().optional(),
    duration: z.number().int().positive().default(1500),
});

const endSessionSchema = z.object({
    elapsed: z.number().int().min(0),
    completed: z.boolean(),
});

const historyQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(10),
});

router.get('/history', validate(historyQuerySchema, 'query'), (req, res) => {
    try {
        const sessions = getRecentSessions(req.query.limit);
        res.json(sessions);
    } catch (err) {
        log.error('Error fetching focus history', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/today', (req, res) => {
    try {
        const stats = getTodayStats();
        res.json(stats);
    } catch (err) {
        log.error('Error fetching today focus stats', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/weekly', (req, res) => {
    try {
        const stats = getWeeklyStats();
        res.json(stats);
    } catch (err) {
        log.error('Error fetching weekly focus stats', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/start', validate(startSessionSchema), (req, res) => {
    const { taskId, duration } = req.body;
    try {
        const id = startSession(taskId, duration);
        res.status(201).json({ message: 'Focus session started', id });
    } catch (err) {
        log.error('Error starting focus session', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id/stop', validateIdParam(), validate(endSessionSchema), (req, res) => {
    const id = parseInt(req.params.id);
    const { elapsed, completed } = req.body;
    try {
        const updated = endSession(id, elapsed, completed);
        if (updated) {
            res.status(200).json({ message: 'Focus session ended' });
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    } catch (err) {
        log.error('Error ending focus session', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
