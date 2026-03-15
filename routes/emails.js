const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const EmailModel = require('../models/EmailModel');
const ApiUsageModel = require('../models/ApiUsageModel');
const LlmUsageModel = require('../models/LlmUsageModel');
const EmailFilterService = require('../services/EmailFilterService');
const emailConfig = require('../config/emailProviders');

const oauthStates = new Map();

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
        console.error('Error getting providers:', error);
        res.status(500).json({ error: 'Failed to get providers' });
    }
});

router.get('/providers/:type/auth-url', (req, res) => {
    try {
        const { type } = req.params;
        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, { type, createdAt: Date.now() });

        const provider = EmailModel.getProviderInstance(type);
        const authUrl = provider.getAuthorizationUrl(state);

        res.json({ authUrl, state });
    } catch (error) {
        console.error('Error getting auth URL:', error);
        res.status(500).json({ error: 'Failed to get authorization URL' });
    }
});

router.get('/:type/callback', async (req, res) => {
    try {
        const { type } = req.params;
        const { code, state, error } = req.query;

        if (error) {
            return res.status(400).json({ error });
        }

        const stateData = oauthStates.get(state);
        if (!stateData || stateData.type !== type) {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }
        oauthStates.delete(state);

        const provider = EmailModel.getProviderInstance(type);
        const tokens = await provider.handleCallback(code);

        // Get user profile (optional)
        let userProfile;
        try {
            userProfile = await provider.getUserProfile();
        } catch (profileError) {
            console.warn('Error fetching user profile, continuing without it:', profileError);
            userProfile = { email: null, displayName: null };
        }

        // Save tokens and user info
        EmailModel.saveProviderTokens(type, tokens);
        const updateData = { connected: true };
        if (userProfile?.email) {
            updateData.userEmail = userProfile.email;
            updateData.userDisplayName = userProfile.displayName;
        }
        EmailModel.updateSyncState(type, updateData);

        res.redirect('/?email-connected=true');
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).json({ error: 'Failed to complete authentication' });
    }
});

router.get('/', (req, res) => {
    try {
        const { providerType, isRead, unread } = req.query;
        const filters = {};
        if (providerType) filters.providerType = providerType;
        if (isRead !== undefined) filters.isRead = isRead === 'true';
        if (unread === 'true') filters.isRead = false;

        const emails = EmailModel.getAllEmails(filters);
        res.json({ emails });
    } catch (error) {
        console.error('Error getting emails:', error);
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
        console.error('Error getting events:', error);
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
        console.error('Error getting sync state:', error);
        res.status(500).json({ error: 'Failed to get sync state' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const email = EmailModel.getEmailById(id);
        if (!email) return res.status(404).json({ error: 'Email not found' });
        res.json({ email });
    } catch (error) {
        console.error('Error getting email:', error);
        res.status(500).json({ error: 'Failed to get email' });
    }
});

router.post('/sync', async (req, res) => {
    try {
        const { providerType = 'outlook' } = req.body;
        const result = await EmailModel.syncAll(providerType);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error syncing:', error);
        res.status(500).json({ error: error.message || 'Failed to sync' });
    }
});

router.post('/sync-emails', async (req, res) => {
    try {
        const { providerType = 'outlook' } = req.body;
        const count = await EmailModel.syncEmails(providerType);
        res.json({ success: true, newEmails: count });
    } catch (error) {
        console.error('Error syncing emails:', error);
        res.status(500).json({ error: error.message || 'Failed to sync emails' });
    }
});

router.post('/sync-events', async (req, res) => {
    try {
        const { providerType = 'outlook' } = req.body;
        const count = await EmailModel.syncEvents(providerType);
        res.json({ success: true, newEvents: count });
    } catch (error) {
        console.error('Error syncing events:', error);
        res.status(500).json({ error: error.message || 'Failed to sync events' });
    }
});

router.put('/:id/read', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { isRead = true } = req.body;
        const success = await EmailModel.markAsRead(id, isRead);
        if (!success) return res.status(404).json({ error: 'Email not found' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking email as read:', error);
        res.status(500).json({ error: 'Failed to update email' });
    }
});

router.put('/mark-all-read', async (req, res) => {
    try {
        const { providerType } = req.body;
        const count = await EmailModel.markAllAsRead(providerType);
        res.json({ success: true, count });
    } catch (error) {
        console.error('Error marking all as read:', error);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

router.post('/:id/convert-task', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { title, description, priority, dueDate, status, projectId } = req.body;
        const taskId = EmailModel.convertToTask(id, { title, description, priority, dueDate, status, projectId });
        res.json({ success: true, taskId });
    } catch (error) {
        console.error('Error converting email to task:', error);
        if (error.message === 'Email not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to convert email to task' });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const success = EmailModel.deleteEmail(id);
        if (!success) return res.status(404).json({ error: 'Email not found' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting email:', error);
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
        console.error('Error getting important emails:', error);
        res.status(500).json({ error: 'Failed to get important emails' });
    }
});

router.post('/filter/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const email = EmailModel.getEmailById(id);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const result = await EmailFilterService.filterEmail(email);
        EmailFilterService.saveFilterResults(id, result);
        res.json({ ...result, emailId: id });
    } catch (error) {
        console.error('Error filtering email:', error);
        res.status(500).json({ error: 'Failed to filter email' });
    }
});

router.post('/filter/batch', async (req, res) => {
    try {
        const { emailIds } = req.body;
        if (!emailIds || !Array.isArray(emailIds)) {
            return res.status(400).json({ error: 'emailIds array required' });
        }

        const results = [];
        for (const id of emailIds) {
            const email = EmailModel.getEmailById(id);
            if (email) {
                const result = await EmailFilterService.filterEmail(email);
                EmailFilterService.saveFilterResults(id, result);
                results.push({ emailId: id, ...result });
            }
        }

        res.json({ results });
    } catch (error) {
        console.error('Error batch filtering emails:', error);
        res.status(500).json({ error: 'Failed to batch filter emails' });
    }
});

// API Usage Monitor endpoints
router.get('/usage/stats', (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const stats = ApiUsageModel.getApiStats(hours);
        res.json({ stats });
    } catch (error) {
        console.error('Error getting API stats:', error);
        res.status(500).json({ error: 'Failed to get API stats' });
    }
});

router.get('/usage/sync-status', (req, res) => {
    try {
        const status = ApiUsageModel.getSyncStatus();
        res.json({ status });
    } catch (error) {
        console.error('Error getting sync status:', error);
        res.status(500).json({ error: 'Failed to get sync status' });
    }
});

// LLM Usage Monitor endpoints
router.get('/llm-usage/stats', (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const stats = LlmUsageModel.getLlmStats(hours);
        res.json({ stats });
    } catch (error) {
        console.error('Error getting LLM stats:', error);
        res.status(500).json({ error: 'Failed to get LLM stats' });
    }
});

router.get('/llm-usage/sync-status', (req, res) => {
    try {
        const status = LlmUsageModel.getLlmSyncStatus();
        res.json({ status });
    } catch (error) {
        console.error('Error getting LLM sync status:', error);
        res.status(500).json({ error: 'Failed to get LLM sync status' });
    }
});

module.exports = router;
