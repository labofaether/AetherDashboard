const express = require('express');
const router = express.Router();
const LlmUsageModel = require('../models/LlmUsageModel');
const log = require('../utils/logger');

router.get('/summary', (req, res) => {
    try {
        const today = LlmUsageModel.getTodaySummary();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const successRate7d = LlmUsageModel.getSuccessRate(sevenDaysAgo);
        const last7d = LlmUsageModel.getLast7Days();
        const byModel = LlmUsageModel.getByModel(sevenDaysAgo);

        res.json({
            today,
            successRate7d,
            last7d,
            byModel,
        });
    } catch (err) {
        log.error('Error getting LLM usage summary', { error: err.message });
        res.status(500).json({ error: 'Failed to get LLM usage summary' });
    }
});

module.exports = router;
