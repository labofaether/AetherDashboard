/**
 * Email Provider Interface
 * Abstract base class defining the interface for all email providers
 */

class EmailProviderInterface {
    /**
     * Create a new email provider instance
     * @param {Object} config - Provider configuration
     */
    constructor(config) {
        if (this.constructor === EmailProviderInterface) {
            throw new Error('Cannot instantiate abstract class EmailProviderInterface');
        }
        this.config = config;
        this.isAuthenticated = false;
    }

    /**
     * Authenticate with the email provider
     * @returns {Promise<boolean>} Success status
     */
    async authenticate() {
        throw new Error('authenticate() must be implemented');
    }

    /**
     * Get authorization URL for OAuth flow
     * @param {string} state - State parameter for security
     * @returns {string} Authorization URL
     */
    getAuthorizationUrl(state) {
        throw new Error('getAuthorizationUrl() must be implemented');
    }

    /**
     * Handle OAuth callback and exchange code for tokens
     * @param {string} code - Authorization code from callback
     * @returns {Promise<Object>} Token data
     */
    async handleCallback(code) {
        throw new Error('handleCallback() must be implemented');
    }

    /**
     * Fetch emails from the provider
     * @param {Object} options - Fetch options (limit, since, etc.)
     * @returns {Promise<Array>} List of emails
     */
    async fetchEmails(options = {}) {
        throw new Error('fetchEmails() must be implemented');
    }

    /**
     * Get a single email by ID
     * @param {string} emailId - Provider-specific email ID
     * @returns {Promise<Object>} Email data
     */
    async getEmail(emailId) {
        throw new Error('getEmail() must be implemented');
    }

    /**
     * Mark email as read/unread
     * @param {string} emailId - Provider-specific email ID
     * @param {boolean} isRead - Read status
     * @returns {Promise<boolean>} Success status
     */
    async markAsRead(emailId, isRead = true) {
        throw new Error('markAsRead() must be implemented');
    }

    /**
     * Delete an email
     * @param {string} emailId - Provider-specific email ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteEmail(emailId) {
        throw new Error('deleteEmail() must be implemented');
    }

    /**
     * Send an email
     * @param {Object} email - Email data (to, subject, body, etc.)
     * @returns {Promise<boolean>} Success status
     */
    async sendEmail(email) {
        throw new Error('sendEmail() must be implemented');
    }

    /**
     * Check if provider is authenticated
     * @returns {boolean} Authentication status
     */
    isAuthenticated() {
        return this.isAuthenticated;
    }

    /**
     * Get provider type
     * @returns {string} Provider type
     */
    getType() {
        return this.config.type;
    }

    /**
     * Get provider name
     * @returns {string} Provider name
     */
    getName() {
        return this.config.name;
    }

    /**
     * Normalize email data to standard format
     * @param {Object} rawEmail - Raw email from provider
     * @returns {Object} Normalized email
     */
    normalizeEmail(rawEmail) {
        throw new Error('normalizeEmail() must be implemented');
    }
}

module.exports = EmailProviderInterface;
