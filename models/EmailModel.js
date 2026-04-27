const { getDb } = require('../db');
const emailConfig = require('../config/emailProviders');
const OutlookProvider = require('../emailProviders/OutlookProvider');
const dataCleanupService = require('../services/DataCleanupService');
const log = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');

// Provider instances cache
const providerInstances = {};

function getProviderInstance(type) {
    if (providerInstances[type]) {
        return providerInstances[type];
    }

    const config = emailConfig.getProvider(type);
    if (!config) throw new Error(`Provider ${type} not found`);

    let provider;
    switch (type) {
        case 'outlook':
            provider = new OutlookProvider(config);
            break;
        default:
            throw new Error(`Provider ${type} not supported`);
    }

    providerInstances[type] = provider;
    return provider;
}

// Email Functions
function buildEmailFilterClause(filters) {
    let sql = '';
    const params = [];
    if (filters.providerType) { sql += ' AND providerType = ?'; params.push(filters.providerType); }
    if (filters.isRead !== undefined) { sql += ' AND isRead = ?'; params.push(filters.isRead ? 1 : 0); }
    if (filters.projectId) { sql += ' AND projectId = ?'; params.push(filters.projectId); }
    return { sql, params };
}

// `opts.limit` / `opts.offset` are honored when present; called without opts the
// signature stays backwards-compatible (returns the full result set, used by
// internal callers that pass the array to in-memory filtering).
function getAllEmails(filters = {}, opts = {}) {
    const db = getDb();
    const { sql: whereSql, params } = buildEmailFilterClause(filters);
    let sql = 'SELECT * FROM emails WHERE 1=1' + whereSql + ' ORDER BY receivedAt DESC';
    if (Number.isInteger(opts.limit) && opts.limit > 0) {
        sql += ' LIMIT ?';
        params.push(opts.limit);
        if (Number.isInteger(opts.offset) && opts.offset > 0) {
            sql += ' OFFSET ?';
            params.push(opts.offset);
        }
    }
    return db.prepare(sql).all(...params).map(rowToEmail);
}

function countEmails(filters = {}) {
    const db = getDb();
    const { sql: whereSql, params } = buildEmailFilterClause(filters);
    return db.prepare('SELECT COUNT(*) AS n FROM emails WHERE 1=1' + whereSql).get(...params).n;
}

function rowToEmail(row) {
    if (!row) return null;
    return { ...row, isRead: !!row.isRead, convertedToTask: !!row.convertedToTask, hasAttachments: !!row.hasAttachments };
}

function getEmailById(id) {
    const db = getDb();
    return rowToEmail(db.prepare('SELECT * FROM emails WHERE id = ?').get(id));
}

function saveEmail(emailData) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM emails WHERE providerId = ? AND providerType = ?')
        .get(emailData.providerId, emailData.providerType);
    if (existing) return existing.id;

    const now = new Date().toISOString();
    const result = db.prepare(`
        INSERT INTO emails (providerId, providerType, subject, "from", fromName, bodyPreview,
            receivedAt, isRead, importance, hasAttachments, webLink, convertedToTask, taskId, projectId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
    `).run(
        emailData.providerId, emailData.providerType, emailData.subject,
        emailData.from, emailData.fromName, emailData.bodyPreview,
        emailData.receivedAt, emailData.isRead ? 1 : 0, emailData.importance,
        emailData.hasAttachments ? 1 : 0, emailData.webLink,
        now, now
    );
    return result.lastInsertRowid;
}

function updateEmail(id, updates) {
    const db = getDb();
    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
        const col = key === 'from' ? '"from"' : key;
        if (typeof val === 'boolean') {
            sets.push(`${col} = ?`); values.push(val ? 1 : 0);
        } else {
            sets.push(`${col} = ?`); values.push(val);
        }
    }
    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const result = db.prepare(`UPDATE emails SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
}

function deleteEmail(id) {
    const db = getDb();
    const del = db.transaction(() => {
        db.prepare('DELETE FROM email_filters WHERE emailId = ?').run(id);
        return db.prepare('DELETE FROM emails WHERE id = ?').run(id);
    });
    const result = del();
    return result.changes > 0;
}

// Calendar Event Functions
function getAllEvents(filters = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (filters.startDateTime) { sql += ' AND end >= ?'; params.push(filters.startDateTime); }
    if (filters.endDateTime) { sql += ' AND start <= ?'; params.push(filters.endDateTime); }

    sql += ' ORDER BY start ASC';
    return db.prepare(sql).all(...params).map(r => ({ ...r, isAllDay: !!r.isAllDay }));
}

function saveEvent(eventData) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM events WHERE providerId = ? AND providerType = ?')
        .get(eventData.providerId, eventData.providerType);
    if (existing) return existing.id;

    const result = db.prepare(`
        INSERT INTO events (providerId, providerType, subject, start, end, location, isAllDay,
            organizer, organizerEmail, bodyPreview, webLink, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        eventData.providerId, eventData.providerType, eventData.subject,
        eventData.start, eventData.end, eventData.location,
        eventData.isAllDay ? 1 : 0, eventData.organizer, eventData.organizerEmail,
        eventData.bodyPreview, eventData.webLink,
        new Date().toISOString()
    );
    return result.lastInsertRowid;
}

// Sync State Functions
function getSyncState(providerType) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM email_sync_state WHERE providerType = ?').get(providerType);
    if (!row) return null;
    return { ...row, connected: !!row.connected, tokens: row.tokens ? decrypt(row.tokens) : null };
}

function updateSyncState(providerType, state) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM email_sync_state WHERE providerType = ?').get(providerType);

    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(state)) {
        if (key === 'tokens') {
            sets.push('tokens = ?'); values.push(val ? encrypt(val) : null);
        } else if (typeof val === 'boolean') {
            sets.push(`${key} = ?`); values.push(val ? 1 : 0);
        } else {
            sets.push(`${key} = ?`); values.push(val);
        }
    }
    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());

    if (existing) {
        values.push(providerType);
        db.prepare(`UPDATE email_sync_state SET ${sets.join(', ')} WHERE providerType = ?`).run(...values);
    } else {
        db.prepare(`INSERT INTO email_sync_state (providerType, ${sets.map(s => s.split(' = ')[0]).join(', ')}) VALUES (?, ${values.map(() => '?').join(', ')})`)
            .run(providerType, ...values);
    }
}

function saveProviderTokens(providerType, tokens) {
    updateSyncState(providerType, { tokens });
}

function getProviderTokens(providerType) {
    const state = getSyncState(providerType);
    return state?.tokens || null;
}

// Persist refreshed tokens after a provider operation. Provider may have rotated
// the access token via refresh_token internally; without this call those rotated
// tokens are lost on next sync.
function persistRefreshedTokens(providerType, provider) {
    try {
        const fresh = provider.getTokenData?.();
        if (fresh) saveProviderTokens(providerType, fresh);
    } catch (e) {
        log.warn('Failed to persist refreshed tokens', { providerType, error: e.message });
    }
}

// Sync Functions
async function syncEmails(providerType) {
    const provider = getProviderInstance(providerType);
    const tokens = getProviderTokens(providerType);
    if (!tokens) throw new Error('Provider not authenticated');

    await provider.authenticate(tokens);

    let userProfile = null;
    try {
        userProfile = await provider.getUserProfile();
    } catch (error) {
        log.warn('Failed to get user profile, continuing without it', { error: error.message });
    }

    const state = getSyncState(providerType);
    const lastSyncAt = state?.lastEmailSyncAt;
    const emails = await provider.fetchEmails({ limit: 100, since: lastSyncAt });

    let newCount = 0;
    for (const email of emails) {
        saveEmail(email);
        newCount++;
    }

    const updateData = { lastEmailSyncAt: new Date().toISOString(), connected: true };
    if (userProfile) {
        updateData.userEmail = userProfile.email;
        updateData.userDisplayName = userProfile.displayName;
    }
    updateSyncState(providerType, updateData);
    persistRefreshedTokens(providerType, provider);

    try { dataCleanupService.cleanupOldEmails(); } catch (error) {
        log.error('Error cleaning up old emails after sync', { error: error.message });
    }

    return newCount;
}

async function syncEvents(providerType) {
    const provider = getProviderInstance(providerType);
    const tokens = getProviderTokens(providerType);
    if (!tokens) throw new Error('Provider not authenticated');

    await provider.authenticate(tokens);
    const events = await provider.fetchEvents({ limit: 100 });

    let newCount = 0;
    for (const event of events) {
        saveEvent(event);
        newCount++;
    }

    updateSyncState(providerType, { lastEventSyncAt: new Date().toISOString(), connected: true });
    persistRefreshedTokens(providerType, provider);
    return newCount;
}

async function syncAll(providerType) {
    const emailCount = await syncEmails(providerType);
    const eventCount = await syncEvents(providerType);
    return { emailCount, eventCount };
}

// Other Functions
async function markAsRead(id, isRead = true) {
    const email = getEmailById(id);
    if (!email) return false;

    if (email.providerId && email.providerType) {
        try {
            const tokens = getProviderTokens(email.providerType);
            if (tokens) {
                const provider = getProviderInstance(email.providerType);
                await provider.authenticate(tokens);
                await provider.markAsRead(email.providerId, isRead);
                saveProviderTokens(email.providerType, provider.getTokenData());
            }
        } catch (error) {
            log.error('Error marking email as read on provider', { error: error.message });
        }
    }

    return updateEmail(id, { isRead });
}

async function markAllAsRead(providerType = null) {
    const db = getDb();
    let sql = 'SELECT * FROM emails WHERE isRead = 0';
    const params = [];
    if (providerType) { sql += ' AND providerType = ?'; params.push(providerType); }

    const unreadEmails = db.prepare(sql).all(...params).map(rowToEmail);

    // Immediately update local state
    const updateSql = providerType
        ? 'UPDATE emails SET isRead = 1, updatedAt = ? WHERE isRead = 0 AND providerType = ?'
        : 'UPDATE emails SET isRead = 1, updatedAt = ? WHERE isRead = 0';
    const updateParams = providerType ? [new Date().toISOString(), providerType] : [new Date().toISOString()];
    db.prepare(updateSql).run(...updateParams);

    // Background sync to provider
    (async () => {
        let provider = null;
        let currentProviderType = null;

        for (const email of unreadEmails) {
            if (email.providerId && email.providerType) {
                try {
                    if (email.providerType !== currentProviderType) {
                        currentProviderType = email.providerType;
                        const tokens = getProviderTokens(currentProviderType);
                        if (tokens) {
                            provider = getProviderInstance(currentProviderType);
                            await provider.authenticate(tokens);
                        } else {
                            provider = null;
                        }
                    }
                    if (provider) await provider.markAsRead(email.providerId, true);
                } catch (error) {
                    log.error('Error marking email as read on provider', { emailId: email.id, error: error.message });
                }
            }
        }

        if (provider && currentProviderType) {
            try { saveProviderTokens(currentProviderType, provider.getTokenData()); } catch (e) { /* ignore */ }
        }
    })();

    return unreadEmails.length;
}

function convertToTask(emailId, taskOptions = {}) {
    const email = getEmailById(emailId);
    if (!email) throw new Error('Email not found');

    const TaskModel = require('./TaskModel');
    const title = taskOptions.title || email.subject;
    const description = taskOptions.description || `${email.bodyPreview}\n\n---\nFrom: ${email.fromName} <${email.from}>\nDate: ${new Date(email.receivedAt).toLocaleString()}`;
    const priority = taskOptions.priority || 'medium';
    const dueDate = taskOptions.dueDate || null;
    const status = taskOptions.status || 'todocontainer';
    const projectId = taskOptions.projectId || null;

    const taskId = TaskModel.createTask(title, description, priority, dueDate, status, projectId);
    updateEmail(emailId, { convertedToTask: true, taskId, projectId });
    return taskId;
}

module.exports = {
    getAllEmails,
    countEmails,
    getEmailById,
    saveEmail,
    updateEmail,
    deleteEmail,
    getAllEvents,
    saveEvent,
    getSyncState,
    updateSyncState,
    saveProviderTokens,
    getProviderTokens,
    getProviderInstance,
    syncEmails,
    syncEvents,
    syncAll,
    markAsRead,
    markAllAsRead,
    convertToTask
};
