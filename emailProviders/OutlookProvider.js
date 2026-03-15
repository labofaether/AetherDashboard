/**
 * Outlook Email Provider
 * Microsoft Azure/Outlook implementation using OAuth 2.0 Authorization Code Flow
 * Supports both Mail and Calendar APIs
 */

const EmailProviderInterface = require('./EmailProviderInterface');
const axios = require('axios');
const querystring = require('querystring');
const ApiUsageModel = require('../models/ApiUsageModel');

class OutlookProvider extends EmailProviderInterface {
    constructor(config) {
        super(config);
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiresAt = null;
    }

    /**
     * Get authorization URL for OAuth flow
     * @param {string} state - State parameter for security
     * @returns {string} Authorization URL
     */
    getAuthorizationUrl(state) {
        const params = querystring.stringify({
            client_id: this.config.credentials.clientId,
            response_type: 'code',
            redirect_uri: this.config.credentials.redirectUri,
            scope: this.config.scopes.join(' '),
            state: state,
            response_mode: 'query',
            access_type: 'offline'
        });
        return `https://login.microsoftonline.com/${this.config.credentials.tenantId}/oauth2/v2.0/authorize?${params}`;
    }

    /**
     * Handle OAuth callback and exchange code for tokens
     * @param {string} code - Authorization code from callback
     * @returns {Promise<Object>} Token data
     */
    async handleCallback(code) {
        try {
            const tokenData = await this._exchangeCodeForTokens(code);
            this.accessToken = tokenData.access_token;
            this.refreshToken = tokenData.refresh_token;
            this.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);
            this.isAuthenticated = true;
            return {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                expiresAt: this.tokenExpiresAt
            };
        } catch (error) {
            console.error('OutlookProvider handleCallback error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Log an API call
     * @private
     * @param {string} endpoint - API endpoint
     * @param {string} method - HTTP method
     * @param {boolean} success - Whether the call succeeded
     */
    _logApiCall(endpoint, method, success) {
        try {
            ApiUsageModel.logApiCall('outlook', endpoint, method, success);
        } catch (e) {
            console.error('Failed to log API call:', e);
        }
    }

    /**
     * Exchange authorization code for access tokens
     * @private
     * @param {string} code - Authorization code
     * @returns {Promise<Object>} Token response
     */
    async _exchangeCodeForTokens(code) {
        const url = `https://login.microsoftonline.com/${this.config.credentials.tenantId}/oauth2/v2.0/token`;
        const data = querystring.stringify({
            client_id: this.config.credentials.clientId,
            client_secret: this.config.credentials.clientSecret,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.config.credentials.redirectUri
        });

        try {
            const response = await axios.post(url, data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            this._logApiCall('/oauth2/token', 'POST', true);
            return response.data;
        } catch (error) {
            this._logApiCall('/oauth2/token', 'POST', false);
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     * @private
     * @returns {Promise<boolean>} Success status
     */
    async _refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const url = `https://login.microsoftonline.com/${this.config.credentials.tenantId}/oauth2/v2.0/token`;
            const data = querystring.stringify({
                client_id: this.config.credentials.clientId,
                client_secret: this.config.credentials.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken
            });

            const response = await axios.post(url, data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this._logApiCall('/oauth2/token', 'POST', true);
            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token || this.refreshToken;
            this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
            this.isAuthenticated = true;
            return true;
        } catch (error) {
            this._logApiCall('/oauth2/token', 'POST', false);
            console.error('OutlookProvider refresh token error:', error.response?.data || error.message);
            this.isAuthenticated = false;
            throw error;
        }
    }

    /**
     * Ensure we have a valid access token
     * @private
     */
    async _ensureValidToken() {
        if (!this.accessToken) {
            throw new Error('Not authenticated. Please authenticate first.');
        }

        // Refresh token if it's about to expire (within 5 minutes)
        if (this.tokenExpiresAt && Date.now() > (this.tokenExpiresAt - 5 * 60 * 1000)) {
            await this._refreshAccessToken();
        }
    }

    /**
     * Authenticate with stored tokens
     * @param {Object} tokens - Stored token data
     * @returns {Promise<boolean>} Success status
     */
    async authenticate(tokens = null) {
        if (tokens) {
            this.accessToken = tokens.accessToken;
            this.refreshToken = tokens.refreshToken;
            this.tokenExpiresAt = tokens.expiresAt;
            this.isAuthenticated = true;

            try {
                await this._ensureValidToken();
                return true;
            } catch {
                this.isAuthenticated = false;
                return false;
            }
        }
        return false;
    }

    /**
     * Fetch emails from Outlook
     * @param {Object} options - Fetch options (limit, since, etc.)
     * @returns {Promise<Array>} List of normalized emails
     */
    async fetchEmails(options = {}) {
        await this._ensureValidToken();
        const { limit = 50, since = null, folder = 'Inbox' } = options;

        try {
            let url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc`;

            if (since) {
                const sinceDate = new Date(since).toISOString();
                url += `&$filter=receivedDateTime ge ${sinceDate}`;
            }

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            this._logApiCall('/me/messages', 'GET', true);
            return response.data.value.map(email => this.normalizeEmail(email));
        } catch (error) {
            this._logApiCall('/me/messages', 'GET', false);
            console.error('OutlookProvider fetchEmails error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Fetch calendar events from Outlook
     * @param {Object} options - Fetch options (limit, startDateTime, endDateTime)
     * @returns {Promise<Array>} List of normalized events
     */
    async fetchEvents(options = {}) {
        await this._ensureValidToken();
        const { limit = 100, startDateTime = null, endDateTime = null } = options;

        try {
            const now = new Date().toISOString();
            let url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${encodeURIComponent('2026-12-31T23:59:59Z')}&$top=${limit}&$orderby=start/dateTime`;

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Prefer': 'outlook.timezone="Asia/Shanghai"'
                }
            });

            this._logApiCall('/me/calendarView', 'GET', true);
            return response.data.value.map(event => this.normalizeEvent(event));
        } catch (error) {
            this._logApiCall('/me/calendarView', 'GET', false);
            console.error('OutlookProvider fetchEvents error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get a single email by ID
     * @param {string} emailId - Provider-specific email ID
     * @returns {Promise<Object>} Normalized email
     */
    async getEmail(emailId) {
        await this._ensureValidToken();

        try {
            const response = await axios.get(`https://graph.microsoft.com/v1.0/me/messages/${emailId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            this._logApiCall('/me/messages/{id}', 'GET', true);
            return this.normalizeEmail(response.data);
        } catch (error) {
            this._logApiCall('/me/messages/{id}', 'GET', false);
            console.error('OutlookProvider getEmail error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Mark email as read/unread
     * @param {string} emailId - Provider-specific email ID
     * @param {boolean} isRead - Read status
     * @returns {Promise<boolean>} Success status
     */
    async markAsRead(emailId, isRead = true) {
        await this._ensureValidToken();

        try {
            await axios.patch(`https://graph.microsoft.com/v1.0/me/messages/${emailId}`, {
                isRead: isRead
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            this._logApiCall('/me/messages/{id}', 'PATCH', true);
            return true;
        } catch (error) {
            this._logApiCall('/me/messages/{id}', 'PATCH', false);
            console.error('OutlookProvider markAsRead error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Delete an email
     * @param {string} emailId - Provider-specific email ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteEmail(emailId) {
        await this._ensureValidToken();

        try {
            await axios.delete(`https://graph.microsoft.com/v1.0/me/messages/${emailId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            this._logApiCall('/me/messages/{id}', 'DELETE', true);
            return true;
        } catch (error) {
            this._logApiCall('/me/messages/{id}', 'DELETE', false);
            console.error('OutlookProvider deleteEmail error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Send an email
     * @param {Object} email - Email data (to, subject, body, etc.)
     * @returns {Promise<boolean>} Success status
     */
    async sendEmail(email) {
        await this._ensureValidToken();

        try {
            const message = {
                subject: email.subject,
                body: {
                    contentType: email.isHtml ? 'HTML' : 'Text',
                    content: email.body
                },
                toRecipients: email.to.map(addr => ({
                    emailAddress: { address: addr }
                }))
            };

            if (email.cc) {
                message.ccRecipients = email.cc.map(addr => ({
                    emailAddress: { address: addr }
                }));
            }

            await axios.post('https://graph.microsoft.com/v1.0/me/sendMail', {
                message: message,
                saveToSentItems: true
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            this._logApiCall('/me/sendMail', 'POST', true);
            return true;
        } catch (error) {
            this._logApiCall('/me/sendMail', 'POST', false);
            console.error('OutlookProvider sendEmail error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Normalize Outlook email data to standard format
     * @param {Object} rawEmail - Raw email from Microsoft Graph API
     * @returns {Object} Normalized email
     */
    normalizeEmail(rawEmail) {
        return {
            providerId: rawEmail.id,
            providerType: 'outlook',
            subject: rawEmail.subject || '(No subject)',
            body: rawEmail.body?.content || '',
            bodyPreview: rawEmail.bodyPreview || '',
            isHtml: rawEmail.body?.contentType === 'html',
            from: rawEmail.from?.emailAddress?.address || '',
            fromName: rawEmail.from?.emailAddress?.name || '',
            to: (rawEmail.toRecipients || []).map(r => r.emailAddress?.address).filter(Boolean),
            cc: (rawEmail.ccRecipients || []).map(r => r.emailAddress?.address).filter(Boolean),
            receivedAt: rawEmail.receivedDateTime,
            sentAt: rawEmail.sentDateTime,
            isRead: rawEmail.isRead || false,
            hasAttachments: rawEmail.hasAttachments || false,
            importance: rawEmail.importance || 'normal',
            conversationId: rawEmail.conversationId || null,
            webLink: rawEmail.webLink || ''
        };
    }

    /**
     * Normalize Outlook calendar event data to standard format
     * @param {Object} rawEvent - Raw event from Microsoft Graph API
     * @returns {Object} Normalized event
     */
    normalizeEvent(rawEvent) {
        return {
            providerId: rawEvent.id,
            providerType: 'outlook',
            subject: rawEvent.subject || '(No title)',
            body: rawEvent.body?.content || '',
            bodyPreview: rawEvent.bodyPreview || '',
            start: rawEvent.start?.dateTime,
            end: rawEvent.end?.dateTime,
            isAllDay: rawEvent.isAllDay || false,
            location: rawEvent.location?.displayName || '',
            attendees: (rawEvent.attendees || []).map(a => ({
                email: a.emailAddress?.address,
                name: a.emailAddress?.name,
                status: a.status?.response
            })),
            organizer: rawEvent.organizer?.emailAddress?.address || '',
            organizerName: rawEvent.organizer?.emailAddress?.name || '',
            reminderMinutesBeforeStart: rawEvent.reminderMinutesBeforeStart,
            isReminderOn: rawEvent.isReminderOn || false,
            showAs: rawEvent.showAs || 'busy',
            sensitivity: rawEvent.sensitivity || 'normal',
            webLink: rawEvent.webLink || '',
            createdAt: rawEvent.createdDateTime,
            updatedAt: rawEvent.lastModifiedDateTime
        };
    }

    /**
     * Get current token data for persistence
     * @returns {Object|null} Token data or null
     */
    getTokenData() {
        if (!this.accessToken) return null;
        return {
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiresAt: this.tokenExpiresAt
        };
    }

    /**
     * Get user profile (email address, display name, etc.)
     * @returns {Promise<Object>} User profile data
     */
    async getUserProfile() {
        // Try to decode email from access token first (no API call needed)
        if (this.accessToken) {
            try {
                const tokenParts = this.accessToken.split('.');
                if (tokenParts.length >= 2) {
                    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));
                    const email = payload.upn || payload.email || payload.unique_name;
                    const displayName = payload.name || payload.given_name;
                    if (email) {
                        return { email, displayName, id: payload.oid };
                    }
                }
            } catch (e) {
                console.warn('Failed to decode token, falling back to API call');
            }
        }

        // Fall back to API call if token decoding fails
        await this._ensureValidToken();

        try {
            const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            this._logApiCall('/me', 'GET', true);
            return {
                email: response.data.mail || response.data.userPrincipalName,
                displayName: response.data.displayName,
                id: response.data.id
            };
        } catch (error) {
            this._logApiCall('/me', 'GET', false);
            console.error('OutlookProvider getUserProfile error:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = OutlookProvider;
