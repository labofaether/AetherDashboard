// Validates environment variables at startup.
// Fatal: malformed values that would silently misbehave (bad PORT, malformed URL, weak key).
// Warning: optional features missing their config (OAuth, LLM) — the app keeps running with that feature disabled.

const log = require('./logger');

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

function isPositiveInt(v) {
    const n = Number(v);
    return Number.isInteger(n) && n > 0;
}

function isValidUrl(v, { requireHttps = false } = {}) {
    try {
        const u = new URL(v);
        if (requireHttps) return u.protocol === 'https:';
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function checkPort(env, fatal) {
    if (env.PORT === undefined) return;
    const n = Number(env.PORT);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
        fatal.push(`PORT must be an integer in [1,65535], got "${env.PORT}"`);
    }
}

function checkLogLevel(env, fatal) {
    if (env.LOG_LEVEL === undefined) return;
    if (!VALID_LOG_LEVELS.includes(env.LOG_LEVEL)) {
        fatal.push(`LOG_LEVEL must be one of ${VALID_LOG_LEVELS.join('|')}, got "${env.LOG_LEVEL}"`);
    }
}

function checkIntervals(env, fatal) {
    for (const key of ['REMINDER_CHECK_INTERVAL', 'EMAIL_SYNC_INTERVAL', 'DB_FLUSH_INTERVAL']) {
        if (env[key] !== undefined && !isPositiveInt(env[key])) {
            fatal.push(`${key} must be a positive integer (ms), got "${env[key]}"`);
        }
    }
}

function checkAllowedOrigins(env, fatal) {
    if (!env.ALLOWED_ORIGINS) return;
    const origins = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
    for (const o of origins) {
        if (!isValidUrl(o)) fatal.push(`ALLOWED_ORIGINS contains invalid URL "${o}"`);
    }
}

function checkEncryptionKey(env, fatal, warn) {
    if (env.ENCRYPTION_KEY === undefined) {
        warn.push('ENCRYPTION_KEY not set — OAuth tokens will be encrypted with an ephemeral key (lost on restart). Set ENCRYPTION_KEY for persistent encrypted storage.');
        return;
    }
    if (env.ENCRYPTION_KEY.length < 32) {
        fatal.push(`ENCRYPTION_KEY must be at least 32 chars, got ${env.ENCRYPTION_KEY.length}`);
    }
}

function checkOAuthGroup(env, fatal, warn, features) {
    const keys = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_REDIRECT_URI'];
    const present = keys.filter(k => env[k] && env[k] !== `your_${k.toLowerCase()}_here`);
    if (present.length === 0) {
        features.outlookOAuth = false;
        return;
    }
    if (present.length < keys.length) {
        const missing = keys.filter(k => !present.includes(k));
        warn.push(`Outlook OAuth partially configured — missing: ${missing.join(', ')}. OAuth will fail.`);
        features.outlookOAuth = false;
        return;
    }
    if (env.AZURE_REDIRECT_URI && !isValidUrl(env.AZURE_REDIRECT_URI)) {
        fatal.push(`AZURE_REDIRECT_URI must be a valid http(s) URL, got "${env.AZURE_REDIRECT_URI}"`);
    }
    features.outlookOAuth = true;
}

function checkLlm(env, warn, features) {
    const apiKey = env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.startsWith('your_')) {
        warn.push('LLM API key not set — email AI filtering and paper categorization will be disabled.');
        features.llm = false;
        return;
    }
    if (env.ANTHROPIC_BASE_URL && !isValidUrl(env.ANTHROPIC_BASE_URL)) {
        warn.push(`ANTHROPIC_BASE_URL is not a valid URL: "${env.ANTHROPIC_BASE_URL}". Will fall back to default.`);
    }
    features.llm = true;
}

function validateEnv(env = process.env) {
    const fatal = [];
    const warn = [];
    const features = {};

    checkPort(env, fatal);
    checkLogLevel(env, fatal);
    checkIntervals(env, fatal);
    checkAllowedOrigins(env, fatal);
    checkEncryptionKey(env, fatal, warn);
    checkOAuthGroup(env, fatal, warn, features);
    checkLlm(env, warn, features);

    return { fatal, warn, features };
}

function reportAndExitOnFatal(result) {
    for (const w of result.warn) log.warn('env config', { issue: w });
    if (result.fatal.length > 0) {
        for (const f of result.fatal) log.error('env config invalid', { issue: f });
        log.error('Refusing to start — fix the env errors above (see .env.example).');
        process.exit(1);
    }
    log.info('env validated', {
        outlookOAuth: result.features.outlookOAuth,
        llm: result.features.llm,
        warnings: result.warn.length,
    });
}

module.exports = { validateEnv, reportAndExitOnFatal };
