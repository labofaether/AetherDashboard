const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

// Defensive normalization. Without this, two specific bad inputs corrupt logs:
//   1. callers pass a STRING (e.g. err.message) — spreading iterates each char,
//      producing entries like {"0":"g","1":"e","2":"t",...}.
//   2. callers pass a RAW HTTP error / axios error — JSON.stringify chokes on
//      circular refs (Agent → sockets → ClientRequest → agent).
// Both used to silently mangle log output. Now they unwrap to clean fields.
function safeMeta(meta) {
    if (meta == null) return {};
    if (typeof meta === 'string') return { context: meta };
    if (typeof meta !== 'object') return { value: String(meta) };
    if (meta instanceof Error) {
        return {
            error: meta.message,
            stack: meta.stack,
            ...(meta.response ? { status: meta.response.status, data: meta.response.data } : {}),
        };
    }
    // Plain object — verify it's serializable; fall back to a sanitized copy.
    try {
        JSON.stringify(meta);
        return meta;
    } catch {
        return {
            error: meta.message || String(meta),
            status: meta.response?.status,
            data: meta.response?.data,
        };
    }
}

function log(level, message, meta = {}) {
    if (LOG_LEVELS[level] < currentLevel) return;
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...safeMeta(meta),
    };
    let output;
    try { output = JSON.stringify(entry); }
    catch { output = JSON.stringify({ timestamp: entry.timestamp, level, message, error: 'log serialization failed' }); }
    if (level === 'error') {
        process.stderr.write(output + '\n');
    } else {
        process.stdout.write(output + '\n');
    }
}

module.exports = {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
};
