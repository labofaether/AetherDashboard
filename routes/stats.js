const express = require('express');
const { getWeeklyTaskStats, getProjectDistribution, getStreakDays } = require('../models/StatsModel');
const log = require('../utils/logger');
const router = express.Router();

router.get('/weekly', (req, res) => {
    try {
        const stats = getWeeklyTaskStats();
        res.json(stats);
    } catch (err) {
        log.error('Error fetching weekly stats', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/projects', (req, res) => {
    try {
        const distribution = getProjectDistribution();
        res.json(distribution);
    } catch (err) {
        log.error('Error fetching project distribution', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/streak', (req, res) => {
    try {
        const streak = getStreakDays();
        res.json({ streak });
    } catch (err) {
        log.error('Error fetching streak', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
