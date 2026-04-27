const { getDb } = require('../db');

function logLlmCall(provider, model, endpoint, method, success = true, tokensUsed = null) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO llm_usage (provider, model, endpoint, method, success, tokensUsed, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(provider, model, endpoint, method, success ? 1 : 0, tokensUsed, now);

    // Keep only last 1000
    db.prepare(`
        DELETE FROM llm_usage WHERE id NOT IN (
            SELECT id FROM llm_usage ORDER BY id DESC LIMIT 1000
        )
    `).run();

    return { id: result.lastInsertRowid, provider, model, endpoint, method, success, tokensUsed, timestamp: now };
}

function getLlmStats(hours = 24) {
    const db = getDb();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const recent = db.prepare('SELECT * FROM llm_usage WHERE timestamp >= ?').all(since);

    const stats = {
        totalCalls: recent.length,
        successfulCalls: recent.filter(e => e.success).length,
        failedCalls: recent.filter(e => !e.success).length,
        totalTokens: recent.filter(e => e.tokensUsed).reduce((sum, e) => sum + e.tokensUsed, 0),
        byModel: {},
        byEndpoint: {},
        callsByHour: []
    };

    recent.forEach(e => {
        const modelKey = e.model || 'unknown';
        const endpointKey = e.endpoint || 'unknown';
        stats.byModel[modelKey] = (stats.byModel[modelKey] || 0) + 1;
        stats.byEndpoint[endpointKey] = (stats.byEndpoint[endpointKey] || 0) + 1;
    });

    for (let i = hours - 1; i >= 0; i--) {
        const hourStart = new Date(Date.now() - i * 60 * 60 * 1000);
        const hourEnd = new Date(Date.now() - (i - 1) * 60 * 60 * 1000);
        const filtered = recent.filter(e => {
            const t = new Date(e.timestamp);
            return t >= hourStart && t < hourEnd;
        });
        stats.callsByHour.push({
            hour: hourStart.getHours(),
            count: filtered.length,
            tokens: filtered.filter(e => e.tokensUsed).reduce((sum, e) => sum + e.tokensUsed, 0)
        });
    }

    return stats;
}

function getLlmSyncStatus() {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as cnt FROM llm_usage').get().cnt;
    const now = Date.now();

    function usageInWindow(ms) {
        const since = new Date(now - ms).toISOString();
        const calls = db.prepare('SELECT COUNT(*) as cnt FROM llm_usage WHERE timestamp >= ?').get(since).cnt;
        const tokens = db.prepare('SELECT COALESCE(SUM(tokensUsed), 0) as total FROM llm_usage WHERE timestamp >= ? AND tokensUsed IS NOT NULL').get(since).total;
        return { calls, tokens };
    }

    const recent = db.prepare('SELECT * FROM llm_usage ORDER BY id DESC LIMIT 10').all();
    const lastCall = recent[0] || null;

    return {
        totalCalls: total,
        lastCallAt: lastCall?.timestamp || null,
        recentSuccessRate: recent.length > 0
            ? (recent.filter(e => e.success).length / recent.length * 100).toFixed(1) + '%'
            : 'N/A',
        recentCalls: recent.length,
        fiveHourUsage: usageInWindow(5 * 60 * 60 * 1000),
        weeklyUsage: usageInWindow(7 * 24 * 60 * 60 * 1000),
        monthlyUsage: usageInWindow(30 * 24 * 60 * 60 * 1000)
    };
}

module.exports = {
    logLlmCall,
    getLlmStats,
    getLlmSyncStatus
};
