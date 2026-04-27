const { getDb } = require('../db');

function logApiCall(provider, endpoint, method, success = true) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO api_usage (provider, endpoint, method, success, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(provider, endpoint, method, success ? 1 : 0, now);

    // Keep only last 1000
    db.prepare(`
        DELETE FROM api_usage WHERE id NOT IN (
            SELECT id FROM api_usage ORDER BY id DESC LIMIT 1000
        )
    `).run();

    return { id: result.lastInsertRowid, provider, endpoint, method, success, timestamp: now };
}

function getApiStats(hours = 24) {
    const db = getDb();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const recent = db.prepare('SELECT * FROM api_usage WHERE timestamp >= ?').all(since);

    const stats = {
        totalCalls: recent.length,
        successfulCalls: recent.filter(e => e.success).length,
        failedCalls: recent.filter(e => !e.success).length,
        byProvider: {},
        byEndpoint: {},
        callsByHour: []
    };

    recent.forEach(e => {
        stats.byProvider[e.provider] = (stats.byProvider[e.provider] || 0) + 1;
        stats.byEndpoint[e.endpoint] = (stats.byEndpoint[e.endpoint] || 0) + 1;
    });

    for (let i = hours - 1; i >= 0; i--) {
        const hourStart = new Date(Date.now() - i * 60 * 60 * 1000);
        const hourEnd = new Date(Date.now() - (i - 1) * 60 * 60 * 1000);
        const count = recent.filter(e => {
            const t = new Date(e.timestamp);
            return t >= hourStart && t < hourEnd;
        }).length;
        stats.callsByHour.push({ hour: hourStart.getHours(), count });
    }

    return stats;
}

function getSyncStatus() {
    const db = getDb();
    const syncStates = db.prepare('SELECT * FROM email_sync_state').all();

    return syncStates.map(state => ({
        provider: state.providerType,
        connected: !!state.connected,
        lastEmailSyncAt: state.lastEmailSyncAt || null,
        emailCount: db.prepare('SELECT COUNT(*) as cnt FROM emails WHERE providerType = ?').get(state.providerType).cnt,
        userEmail: state.userEmail || null,
        userDisplayName: state.userDisplayName || null
    }));
}

module.exports = {
    logApiCall,
    getApiStats,
    getSyncStatus
};
