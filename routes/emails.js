const express = require('express');
const { z } = require('zod');
const router = express.Router();
const crypto = require('crypto');
const EmailModel = require('../models/EmailModel');
const ApiUsageModel = require('../models/ApiUsageModel');
const LlmUsageModel = require('../models/LlmUsageModel');
const EmailFilterService = require('../services/EmailFilterService');
const emailConfig = require('../config/emailProviders');
const { validate } = require('../middleware/validate');
const { validateIdParam } = require('../middleware/validateIdParam');
const log = require('../utils/logger');

const oauthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OAUTH_STATE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of oauthStates) {
        if (now - v.createdAt > OAUTH_STATE_TTL_MS) oauthStates.delete(k);
    }
}, OAUTH_STATE_CLEANUP_INTERVAL_MS).unref();

// providerType is also used to dispatch to a specific provider — keep it small
// and well-formed so a giant string can't slip through to downstream routing.
const providerType = z.string().min(1).max(50);

const syncSchema = z.object({
    providerType: providerType.default('outlook'),
});

const markReadSchema = z.object({
    isRead: z.boolean().default(true),
});

const convertTaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.string().max(40).nullable().optional(),
    status: z.string().max(50).optional(),
    projectId: z.number().int().positive().nullable().optional(),
});

const batchFilterSchema = z.object({
    emailIds: z.array(z.number().int().positive()).min(1, 'emailIds array required').max(100, 'max 100 emails per batch'),
});

const usageStatsQuerySchema = z.object({
    hours: z.coerce.number().int().min(1).max(720).default(24),
});

// `limit` is optional so existing callers (no UI pagination yet) keep getting
// the full result set. Cap is 500 — past that, callers must paginate explicitly.
const emailListQuerySchema = z.object({
    providerType: z.string().max(50).optional(),
    isRead: z.enum(['true', 'false']).optional(),
    unread: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).default(0),
});

router.get('/providers', (req, res) => {
    try {
        const providers = emailConfig.getEnabledProviders().map(p => {
            const state = EmailModel.getSyncState(p.type);
            return {
                type: p.type,
                name: p.name,
                isConnected: state?.connected || false
            };
        });
        res.json({ providers });
    } catch (error) {
        log.error('Error getting providers', { error: error.message });
        res.status(500).json({ error: 'Failed to get providers' });
    }
});

// `:type` is a URL path segment that ends up routing to a provider class. Reject
// anything that isn't a known enabled provider before doing any work — otherwise
// a malformed value reaches getProviderInstance() and surfaces as a 500.
function requireKnownProviderType(req, res, next) {
    const enabled = new Set(emailConfig.getEnabledProviders().map(p => p.type));
    if (!enabled.has(req.params.type)) {
        return res.status(400).json({ error: 'Unknown provider type' });
    }
    next();
}

// OAuth state is 32 random bytes hex-encoded — exactly 64 hex chars. Validating
// shape blocks both array smuggling (?state=a&state=b becomes [a,b]) and weird
// inputs that could confuse Map.get() lookups downstream.
const OAUTH_STATE_RE = /^[0-9a-f]{64}$/i;

router.get('/providers/:type/auth-url', requireKnownProviderType, (req, res) => {
    try {
        const { type } = req.params;
        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, { type, createdAt: Date.now() });

        const provider = EmailModel.getProviderInstance(type);
        const authUrl = provider.getAuthorizationUrl(state);

        res.json({ authUrl, state });
    } catch (error) {
        log.error('Error getting auth URL', { error: error.message });
        res.status(500).json({ error: 'Failed to get authorization URL' });
    }
});

router.get('/:type/callback', requireKnownProviderType, async (req, res) => {
    try {
        const { type } = req.params;
        const { code, state, error } = req.query;

        if (error) {
            const errorDescription = req.query.error_description || '';
            log.error('OAuth authorization error', { error, errorDescription });
            return res.status(400).json({ error, error_description: errorDescription });
        }

        if (typeof state !== 'string' || !OAUTH_STATE_RE.test(state)) {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }
        if (typeof code !== 'string' || code.length === 0 || code.length > 4096) {
            return res.status(400).json({ error: 'Invalid authorization code' });
        }

        const stateData = oauthStates.get(state);
        if (!stateData || stateData.type !== type) {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }
        // Always consume the state — prevents replay even if expired check returns first.
        oauthStates.delete(state);
        if (Date.now() - stateData.createdAt > OAUTH_STATE_TTL_MS) {
            return res.status(400).json({ error: 'OAuth state expired, please retry sign-in' });
        }

        const provider = EmailModel.getProviderInstance(type);
        const tokens = await provider.handleCallback(code);

        let userProfile;
        try {
            userProfile = await provider.getUserProfile();
        } catch (profileError) {
            log.warn('Error fetching user profile, continuing without it', { error: profileError.message });
            userProfile = { email: null, displayName: null };
        }

        EmailModel.saveProviderTokens(type, tokens);
        const updateData = { connected: true };
        if (userProfile?.email) {
            updateData.userEmail = userProfile.email;
            updateData.userDisplayName = userProfile.displayName;
        }
        EmailModel.updateSyncState(type, updateData);

        res.redirect('/?email-connected=true');
    } catch (error) {
        const detail = error.response?.data || error.message;
        log.error('OAuth callback error', { error: error.message, detail });
        res.status(500).json({ error: 'Failed to complete authentication', detail });
    }
});

router.get('/', validate(emailListQuerySchema, 'query'), (req, res) => {
    try {
        const { providerType, isRead, unread, limit, offset } = req.query;
        const filters = {};
        if (providerType) filters.providerType = providerType;
        if (isRead !== undefined) filters.isRead = isRead === 'true';
        if (unread === 'true') filters.isRead = false;

        const total = EmailModel.countEmails(filters);
        const opts = limit ? { limit, offset } : {};
        const emails = EmailModel.getAllEmails(filters, opts);
        res.json({
            emails,
            total,
            limit: limit || null,
            offset,
            hasMore: limit ? offset + emails.length < total : false,
        });
    } catch (error) {
        log.error('Error getting emails', { error: error.message });
        res.status(500).json({ error: 'Failed to get emails' });
    }
});

router.get('/events', (req, res) => {
    try {
        const { startDateTime, endDateTime } = req.query;
        const filters = {};
        if (startDateTime) filters.startDateTime = startDateTime;
        if (endDateTime) filters.endDateTime = endDateTime;

        const events = EmailModel.getAllEvents(filters);
        res.json({ events });
    } catch (error) {
        log.error('Error getting events', { error: error.message });
        res.status(500).json({ error: 'Failed to get events' });
    }
});

router.get('/sync-state', (req, res) => {
    try {
        const { providerType } = req.query;
        if (providerType) {
            const state = EmailModel.getSyncState(providerType);
            res.json({ state: state || null });
        } else {
            const providers = emailConfig.getEnabledProviders();
            const states = providers.map(p => ({
                providerType: p.type,
                state: EmailModel.getSyncState(p.type)
            }));
            res.json({ states });
        }
    } catch (error) {
        log.error('Error getting sync state', { error: error.message });
        res.status(500).json({ error: 'Failed to get sync state' });
    }
});

router.get('/:id', validateIdParam(), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const email = EmailModel.getEmailById(id);
        if (!email) return res.status(404).json({ error: 'Email not found' });
        res.json({ email });
    } catch (error) {
        log.error('Error getting email', { error: error.message });
        res.status(500).json({ error: 'Failed to get email' });
    }
});

router.post('/sync', validate(syncSchema), async (req, res) => {
    try {
        const { providerType } = req.body;
        const result = await EmailModel.syncAll(providerType);
        res.json({ success: true, ...result });
    } catch (error) {
        log.error('Error syncing', { error: error.message });
        res.status(500).json({ error: error.message || 'Failed to sync' });
    }
});

router.post('/sync-emails', validate(syncSchema), async (req, res) => {
    try {
        const { providerType } = req.body;
        const count = await EmailModel.syncEmails(providerType);
        res.json({ success: true, newEmails: count });
    } catch (error) {
        log.error('Error syncing emails', { error: error.message });
        res.status(500).json({ error: error.message || 'Failed to sync emails' });
    }
});

router.post('/sync-events', validate(syncSchema), async (req, res) => {
    try {
        const { providerType } = req.body;
        const count = await EmailModel.syncEvents(providerType);
        res.json({ success: true, newEvents: count });
    } catch (error) {
        log.error('Error syncing events', { error: error.message });
        res.status(500).json({ error: error.message || 'Failed to sync events' });
    }
});

router.put('/:id/read', validateIdParam(), validate(markReadSchema), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { isRead } = req.body;
        const success = await EmailModel.markAsRead(id, isRead);
        if (!success) return res.status(404).json({ error: 'Email not found' });
        res.json({ success: true });
    } catch (error) {
        log.error('Error marking email as read', { error: error.message });
        res.status(500).json({ error: 'Failed to update email' });
    }
});

router.put('/mark-all-read', async (req, res) => {
    try {
        const { providerType } = req.body;
        const count = await EmailModel.markAllAsRead(providerType);
        res.json({ success: true, count });
    } catch (error) {
        log.error('Error marking all as read', { error: error.message });
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

router.post('/:id/convert-task', validateIdParam(), validate(convertTaskSchema), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { title, description, priority, dueDate, status, projectId } = req.body;
        const taskId = EmailModel.convertToTask(id, { title, description, priority, dueDate, status, projectId });
        res.json({ success: true, taskId });
    } catch (error) {
        log.error('Error converting email to task', { error: error.message });
        if (error.message === 'Email not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to convert email to task' });
    }
});

router.delete('/:id', validateIdParam(), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const success = EmailModel.deleteEmail(id);
        if (!success) return res.status(404).json({ error: 'Email not found' });
        res.json({ success: true });
    } catch (error) {
        log.error('Error deleting email', { error: error.message });
        res.status(500).json({ error: 'Failed to delete email' });
    }
});

// Email Filter endpoints
router.get('/filter/important', async (req, res) => {
    try {
        const { providerType } = req.query;
        const filters = {};
        if (providerType) filters.providerType = providerType;

        const emails = EmailModel.getAllEmails(filters);
        const importantEmails = await EmailFilterService.getImportantEmails(emails);
        res.json({ emails: importantEmails });
    } catch (error) {
        log.error('Error getting important emails', { error: error.message });
        res.status(500).json({ error: 'Failed to get important emails' });
    }
});

router.post('/filter/:id', validateIdParam(), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const email = EmailModel.getEmailById(id);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const result = await EmailFilterService.filterEmail(email);
        EmailFilterService.saveFilterResults(id, result);
        res.json({ ...result, emailId: id });
    } catch (error) {
        log.error('Error filtering email', { error: error.message });
        res.status(500).json({ error: 'Failed to filter email' });
    }
});

router.post('/filter/batch', validate(batchFilterSchema), async (req, res) => {
    const { emailIds } = req.body;
    const results = [];
    const errors = [];

    for (const id of emailIds) {
        try {
            const email = EmailModel.getEmailById(id);
            if (!email) {
                errors.push({ emailId: id, error: 'not_found' });
                continue;
            }
            const result = await EmailFilterService.filterEmail(email);
            EmailFilterService.saveFilterResults(id, result);
            results.push({ emailId: id, ...result });
        } catch (err) {
            log.error('Batch filter: per-email failure', { emailId: id, error: err.message });
            errors.push({ emailId: id, error: err.message || 'filter_failed' });
        }
    }

    const status = errors.length === 0 ? 200 : (results.length === 0 ? 500 : 207);
    res.status(status).json({
        results,
        errors,
        summary: { requested: emailIds.length, succeeded: results.length, failed: errors.length },
    });
});

// API Usage Monitor endpoints
router.get('/usage/stats', validate(usageStatsQuerySchema, 'query'), (req, res) => {
    try {
        const stats = ApiUsageModel.getApiStats(req.query.hours);
        res.json({ stats });
    } catch (error) {
        log.error('Error getting API stats', { error: error.message });
        res.status(500).json({ error: 'Failed to get API stats' });
    }
});

router.get('/usage/sync-status', (req, res) => {
    try {
        const status = ApiUsageModel.getSyncStatus();
        const reminderService = require('../services/ReminderService');
        const reminder = reminderService.getStatus();
        res.json({ status, reminder });
    } catch (error) {
        log.error('Error getting sync status', { error: error.message });
        res.status(500).json({ error: 'Failed to get sync status' });
    }
});

// LLM Usage Monitor endpoints
router.get('/llm-usage/stats', validate(usageStatsQuerySchema, 'query'), (req, res) => {
    try {
        const stats = LlmUsageModel.getLlmStats(req.query.hours);
        res.json({ stats });
    } catch (error) {
        log.error('Error getting LLM stats', { error: error.message });
        res.status(500).json({ error: 'Failed to get LLM stats' });
    }
});

router.get('/llm-usage/sync-status', (req, res) => {
    try {
        const status = LlmUsageModel.getLlmSyncStatus();
        res.json({ status });
    } catch (error) {
        log.error('Error getting LLM sync status', { error: error.message });
        res.status(500).json({ error: 'Failed to get LLM sync status' });
    }
});

module.exports = router;
