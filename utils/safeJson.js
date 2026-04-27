const log = require('./logger');

function safeJsonParse(str, fallback = null, context = '') {
    if (str === null || str === undefined || str === '') return fallback;
    try {
        return JSON.parse(str);
    } catch (err) {
        log.warn('JSON parse failed, using fallback', {
            context,
            error: err.message,
            preview: typeof str === 'string' ? str.slice(0, 80) : typeof str,
        });
        return fallback;
    }
}

module.exports = { safeJsonParse };
