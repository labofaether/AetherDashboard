const express = require('express');
const { getRecentActivity, clearActivityLog } = require('../models/ActivityLogModel');
const { clearCompletedTasks } = require('../models/TaskModel');
const router = express.Router();

router.get('/', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const activities = getRecentActivity(limit);
        res.json(activities);
    } catch (err) {
        console.error('Error fetching activity log:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/clear', (req, res) => {
    try {
        clearActivityLog();
        res.status(200).json({ message: 'Activity log cleared' });
    } catch (err) {
        console.error('Error clearing activity log:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/clear-completed', (req, res) => {
    try {
        const count = clearCompletedTasks();
        res.status(200).json({ message: `${count} completed tasks cleared`, count });
    } catch (err) {
        console.error('Error clearing completed tasks:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
