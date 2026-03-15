const { readDB, writeDB } = require('../db');

function logApiCall(provider, endpoint, method, success = true) {
    const db = readDB();
    const entry = {
        id: db.apiUsage.length > 0 ? Math.max(...db.apiUsage.map(e => e.id)) + 1 : 1,
        provider,
        endpoint,
        method,
        success,
        timestamp: new Date().toISOString()
    };
    db.apiUsage.push(entry);

    if (db.apiUsage.length > 1000) {
        db.apiUsage = db.apiUsage.slice(-1000);
    }

    writeDB(db);
    return entry;
}

function getApiStats(hours = 24) {
    const db = readDB();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const recent = db.apiUsage.filter(e => new Date(e.timestamp) >= since);

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
        stats.callsByHour.push({
            hour: hourStart.getHours(),
            count
        });
    }

    return stats;
}

function getSyncStatus() {
    const db = readDB();
    const syncStates = db.emailSyncState || [];

    return syncStates.map(state => ({
        provider: state.providerType,
        connected: state.connected || false,
        lastEmailSyncAt: state.lastEmailSyncAt || null,
        emailCount: db.emails.filter(e => e.providerType === state.providerType).length,
        userEmail: state.userEmail || null,
        userDisplayName: state.userDisplayName || null
    }));
}

module.exports = {
    logApiCall,
    getApiStats,
    getSyncStatus
};
