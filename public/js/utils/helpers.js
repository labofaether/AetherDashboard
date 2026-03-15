/**
 * Utility functions for Aether Dashboard
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format date for display
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format email date with smart formatting (today shows time, this week shows weekday, older shows date)
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
function formatEmailDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;

    if (diff < 86400000 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diff < 604800000) {
        return d.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

/**
 * Format sync time for display
 * @param {string} timeStr - ISO date string
 * @returns {string} Formatted time
 */
function formatSyncTime(timeStr) {
    const d = new Date(timeStr);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) {
        return 'Just now';
    } else if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins} min${mins > 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
}

/**
 * Format priority for display
 * @param {string} priority - Priority string (low/medium/high)
 * @returns {string} Formatted priority
 */
function formatPriority(priority) {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
}
