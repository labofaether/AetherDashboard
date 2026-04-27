const express = require('express');
const { z } = require('zod');
const { getRecentActivity, getActivityCount, clearActivityLog, ACTIVITY_LOG_MAX_ROWS } = require('../models/ActivityLogModel');
const { clearCompletedTasks } = require('../models/TaskModel');
const { validate } = require('../middleware/validate');
const log = require('../utils/logger');
const router = express.Router();

const listQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(ACTIVITY_LOG_MAX_ROWS).default(20),
});

router.get('/', validate(listQuerySchema, 'query'), (req, res) => {
    try {
        const activities = getRecentActivity(req.query.limit);
        res.json(activities);
    } catch (err) {
        log.error('Error fetching activity log', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/count', (req, res) => {
    try {
        res.json({ count: getActivityCount(), max: ACTIVITY_LOG_MAX_ROWS });
    } catch (err) {
        log.error('Error counting activity', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/clear', (req, res) => {
    try {
        clearActivityLog();
        res.status(200).json({ message: 'Activity log cleared' });
    } catch (err) {
        log.error('Error clearing activity log', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/clear-completed', (req, res) => {
    try {
        const count = clearCompletedTasks();
        res.status(200).json({ message: `${count} completed tasks cleared`, count });
    } catch (err) {
        log.error('Error clearing completed tasks', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
