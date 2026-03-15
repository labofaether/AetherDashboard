const { readDB, writeDB } = require('../db');

function logLlmCall(provider, model, endpoint, method, success = true, tokensUsed = null) {
    const db = readDB();
    const entry = {
        id: db.llmUsage && db.llmUsage.length > 0 ? Math.max(...db.llmUsage.map(e => e.id)) + 1 : 1,
        provider,
        model,
        endpoint,
        method,
        success,
        tokensUsed,
        timestamp: new Date().toISOString()
    };

    if (!db.llmUsage) db.llmUsage = [];
    db.llmUsage.push(entry);

    if (db.llmUsage.length > 1000) {
        db.llmUsage = db.llmUsage.slice(-1000);
    }

    writeDB(db);
    return entry;
}

function getLlmStats(hours = 24) {
    const db = readDB();
    if (!db.llmUsage) db.llmUsage = [];

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recent = db.llmUsage.filter(e => new Date(e.timestamp) >= since);

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
        const count = recent.filter(e => {
            const t = new Date(e.timestamp);
            return t >= hourStart && t < hourEnd;
        }).length;
        const tokens = recent.filter(e => {
            const t = new Date(e.timestamp);
            return t >= hourStart && t < hourEnd && e.tokensUsed;
        }).reduce((sum, e) => sum + e.tokensUsed, 0);
        stats.callsByHour.push({
            hour: hourStart.getHours(),
            count,
            tokens
        });
    }

    return stats;
}

function getLlmSyncStatus() {
    const db = readDB();
    if (!db.llmUsage) db.llmUsage = [];

    const now = Date.now();
    const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const usageInWindow = (startTime) => {
        const calls = db.llmUsage.filter(e => new Date(e.timestamp) >= startTime);
        const tokens = calls.filter(e => e.tokensUsed).reduce((sum, e) => sum + e.tokensUsed, 0);
        return { calls: calls.length, tokens };
    };

    const recent = db.llmUsage.slice(-10);
    const lastCall = db.llmUsage.length > 0 ? db.llmUsage[db.llmUsage.length - 1] : null;

    return {
        totalCalls: db.llmUsage.length,
        lastCallAt: lastCall?.timestamp || null,
        recentSuccessRate: recent.length > 0
            ? (recent.filter(e => e.success).length / recent.length * 100).toFixed(1) + '%'
            : 'N/A',
        recentCalls: recent.length,
        fiveHourUsage: usageInWindow(fiveHoursAgo),
        weeklyUsage: usageInWindow(oneWeekAgo),
        monthlyUsage: usageInWindow(oneMonthAgo)
    };
}

module.exports = {
    logLlmCall,
    getLlmStats,
    getLlmSyncStatus
};
