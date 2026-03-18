const { readDB, writeDB } = require('../db');
const emailConfig = require('../config/emailProviders');
const OutlookProvider = require('../emailProviders/OutlookProvider');
const dataCleanupService = require('../services/DataCleanupService');

// Provider instances cache
const providerInstances = {};

function getProviderInstance(type) {
    if (providerInstances[type]) {
        return providerInstances[type];
    }

    const config = emailConfig.getProvider(type);
    if (!config) {
        throw new Error(`Provider ${type} not found`);
    }

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
function getAllEmails(filters = {}) {
    const db = readDB();
    let emails = [...db.emails];

    if (filters.providerType) emails = emails.filter(e => e.providerType === filters.providerType);
    if (filters.isRead !== undefined) emails = emails.filter(e => e.isRead === filters.isRead);
    if (filters.projectId) emails = emails.filter(e => e.projectId === filters.projectId);

    return emails.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
}

function getEmailById(id) {
    const db = readDB();
    return db.emails.find(e => e.id === id) || null;
}

function saveEmail(emailData) {
    const db = readDB();
    const existing = db.emails.find(e => e.providerId === emailData.providerId && e.providerType === emailData.providerType);
    if (existing) return existing.id;

    const newId = db.emails.length > 0 ? Math.max(...db.emails.map(e => e.id)) + 1 : 1;
    const email = {
        id: newId,
        ...emailData,
        convertedToTask: false,
        taskId: null,
        projectId: null,
        createdAt: new Date().toISOString()
    };

    db.emails.unshift(email);
    writeDB(db);
    return newId;
}

function updateEmail(id, updates) {
    const db = readDB();
    const email = db.emails.find(e => e.id === id);
    if (!email) return false;
    Object.assign(email, updates, { updatedAt: new Date().toISOString() });
    writeDB(db);
    return true;
}

function deleteEmail(id) {
    const db = readDB();
    const initialLength = db.emails.length;
    db.emails = db.emails.filter(e => e.id !== id);
    if (db.emails.length !== initialLength) {
        writeDB(db);
        return true;
    }
    return false;
}

// Calendar Event Functions
function getAllEvents(filters = {}) {
    const db = readDB();
    let events = [...db.events];

    if (filters.startDateTime) {
        events = events.filter(e => new Date(e.end) >= new Date(filters.startDateTime));
    }
    if (filters.endDateTime) {
        events = events.filter(e => new Date(e.start) <= new Date(filters.endDateTime));
    }

    return events.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function saveEvent(eventData) {
    const db = readDB();
    const existing = db.events.find(e => e.providerId === eventData.providerId && e.providerType === eventData.providerType);
    if (existing) return existing.id;

    const newId = db.events.length > 0 ? Math.max(...db.events.map(e => e.id)) + 1 : 1;
    const event = {
        id: newId,
        ...eventData,
        createdAt: new Date().toISOString()
    };

    db.events.push(event);
    writeDB(db);
    return newId;
}

// Sync State Functions
function getSyncState(providerType) {
    const db = readDB();
    return db.emailSyncState.find(s => s.providerType === providerType) || null;
}

function updateSyncState(providerType, state) {
    const db = readDB();
    let syncState = db.emailSyncState.find(s => s.providerType === providerType);
    if (!syncState) {
        syncState = { providerType };
        db.emailSyncState.push(syncState);
    }
    Object.assign(syncState, state, { updatedAt: new Date().toISOString() });
    writeDB(db);
}

function saveProviderTokens(providerType, tokens) {
    updateSyncState(providerType, { tokens });
}

function getProviderTokens(providerType) {
    const state = getSyncState(providerType);
    return state?.tokens || null;
}

// Sync Functions
async function syncEmails(providerType) {
    const provider = getProviderInstance(providerType);
    const tokens = getProviderTokens(providerType);

    if (!tokens) throw new Error('Provider not authenticated');

    await provider.authenticate(tokens);

    // Get user profile (optional)
    let userProfile = null;
    try {
        userProfile = await provider.getUserProfile();
    } catch (error) {
        console.warn('Failed to get user profile, continuing without it:', error.message);
    }

    const syncState = getSyncState(providerType);
    const lastSyncAt = syncState?.lastEmailSyncAt;

    const emails = await provider.fetchEmails({ limit: 100, since: lastSyncAt });

    let newCount = 0;
    for (const email of emails) {
        const id = saveEmail(email);
        const savedEmail = getEmailById(id);
        if (savedEmail && savedEmail.createdAt === savedEmail.updatedAt) newCount++;
    }

    const updateData = {
        lastEmailSyncAt: new Date().toISOString(),
        connected: true
    };

    if (userProfile) {
        updateData.userEmail = userProfile.email;
        updateData.userDisplayName = userProfile.displayName;
    }

    updateSyncState(providerType, updateData);

    // Clean up old emails after sync
    try {
        dataCleanupService.cleanupOldEmails();
    } catch (error) {
        console.error('Error cleaning up old emails after sync:', error);
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
        const id = saveEvent(event);
        newCount++;
    }

    updateSyncState(providerType, {
        lastEventSyncAt: new Date().toISOString(),
        connected: true
    });

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
            console.error('Error marking email as read on provider:', error);
        }
    }

    return updateEmail(id, { isRead });
}

async function markAllAsRead(providerType = null) {
    const db = readDB();
    const unreadEmails = db.emails.filter(e => !e.isRead && (!providerType || e.providerType === providerType));

    // 1. 立即更新本地状态（快速响应用户）
    for (const email of unreadEmails) {
        updateEmail(email.id, { isRead: true });
    }

    // 2. 后台异步更新 provider（不阻塞）
    (async () => {
        let provider = null;
        let tokens = null;
        let currentProviderType = null;

        for (const email of unreadEmails) {
            if (email.providerId && email.providerType) {
                try {
                    // 复用 provider 实例和 token，避免重复认证
                    if (email.providerType !== currentProviderType) {
                        currentProviderType = email.providerType;
                        tokens = getProviderTokens(currentProviderType);
                        if (tokens) {
                            provider = getProviderInstance(currentProviderType);
                            await provider.authenticate(tokens);
                        } else {
                            provider = null;
                        }
                    }

                    if (provider) {
                        await provider.markAsRead(email.providerId, true);
                    }
                } catch (error) {
                    console.error(`Error marking email ${email.id} as read on provider:`, error);
                    // 继续处理其他邮件
                }
            }
        }

        // 最后保存一次 token
        if (provider && currentProviderType) {
            try {
                saveProviderTokens(currentProviderType, provider.getTokenData());
            } catch (e) {
                // ignore
            }
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

    updateEmail(emailId, {
        convertedToTask: true,
        taskId,
        projectId
    });

    return taskId;
}

module.exports = {
    getAllEmails,
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
