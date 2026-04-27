// Forces every test process to use an isolated in-memory DB before any model
// is loaded. Required because db.js caches the connection on first import.
process.env.AETHER_DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'error';
process.env.NODE_ENV = 'test';

// Quiet logger output during tests — only errors surface.
const log = require('../../utils/logger');
const noop = () => {};
log.info = noop;
log.warn = noop;
log.debug = noop;

function resetDb() {
    const { closeDb, getDb } = require('../../db');
    closeDb();
    getDb(); // re-init schema
}

module.exports = { resetDb };
