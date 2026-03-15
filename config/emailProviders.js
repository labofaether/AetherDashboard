/**
 * Email Provider Configuration
 * Manages and loads email provider settings from environment variables
 */

require('dotenv').config();

const providers = {
    outlook: {
        name: 'Outlook',
        type: 'outlook',
        enabled: true,
        credentials: {
            tenantId: process.env.AZURE_TENANT_ID,
            clientId: process.env.AZURE_CLIENT_ID,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
            redirectUri: process.env.AZURE_REDIRECT_URI
        },
        defaultFromEmail: process.env.DEFAULT_FROM_EMAIL,
        scopes: [
            'https://graph.microsoft.com/Mail.Read',
            'https://graph.microsoft.com/Mail.ReadWrite',
            'https://graph.microsoft.com/Mail.Send',
            'https://graph.microsoft.com/Calendars.Read',
            'https://graph.microsoft.com/Calendars.ReadWrite',
            'offline_access'
        ]
    }
};

/**
 * Get all configured providers
 * @returns {Object} All provider configurations
 */
function getAllProviders() {
    return providers;
}

/**
 * Get a specific provider by type
 * @param {string} type - Provider type (e.g., 'outlook')
 * @returns {Object|null} Provider configuration or null
 */
function getProvider(type) {
    return providers[type] || null;
}

/**
 * Get enabled providers
 * @returns {Array} List of enabled provider configurations
 */
function getEnabledProviders() {
    return Object.values(providers).filter(p => p.enabled);
}

module.exports = {
    getAllProviders,
    getProvider,
    getEnabledProviders
};
