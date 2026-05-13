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

    const totals = db.prepare(`
        SELECT
            COUNT(*) AS totalCalls,
            COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS successfulCalls,
            COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) AS failedCalls
        FROM api_usage WHERE timestamp >= ?
    `).get(since);

    const byProviderRows = db.prepare(`
        SELECT provider AS k, COUNT(*) AS n
        FROM api_usage WHERE timestamp >= ? GROUP BY k
    `).all(since);
    const byEndpointRows = db.prepare(`
        SELECT endpoint AS k, COUNT(*) AS n
        FROM api_usage WHERE timestamp >= ? GROUP BY k
    `).all(since);

    const byProvider = {};
    byProviderRows.forEach(r => { byProvider[r.k] = r.n; });
    const byEndpoint = {};
    byEndpointRows.forEach(r => { byEndpoint[r.k] = r.n; });

    const bucketRows = db.prepare(`
        SELECT strftime('%Y-%m-%dT%H', timestamp) AS bucket, COUNT(*) AS count
        FROM api_usage WHERE timestamp >= ? GROUP BY bucket
    `).all(since);
    const byBucket = new Map(bucketRows.map(r => [r.bucket, r.count]));

    const callsByHour = [];
    for (let i = hours - 1; i >= 0; i--) {
        const hourStart = new Date(Date.now() - i * 60 * 60 * 1000);
        const key = hourStart.toISOString().slice(0, 13);
        callsByHour.push({ hour: hourStart.getHours(), count: byBucket.get(key) || 0 });
    }

    return {
        totalCalls: totals.totalCalls,
        successfulCalls: totals.successfulCalls,
        failedCalls: totals.failedCalls,
        byProvider,
        byEndpoint,
        callsByHour,
    };
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
