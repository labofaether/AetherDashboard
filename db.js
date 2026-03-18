const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'board.json');

// In-memory cache
let cachedDB = null;
let isDirty = false;
let writeQueue = Promise.resolve();
let flushTimer = null;

// Configurable flush interval (default: 2 seconds)
const FLUSH_INTERVAL = parseInt(process.env.DB_FLUSH_INTERVAL) || 2000;

// Default database structure
function getDefaultDB() {
    return {
        tasks: [],
        activityLog: [],
        projects: [],
        emails: [],
        emailSyncState: [],
        reminders: [],
        events: [],
        apiUsage: [],
        emailFilters: [],
        llmUsage: []
    };
}

// Load database from file into memory
function loadDB() {
    if (cachedDB !== null) {
        return cachedDB;
    }

    if (!fs.existsSync(dbPath)) {
        cachedDB = getDefaultDB();
        return cachedDB;
    }

    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        const db = JSON.parse(data);

        // Migrate/ensure all fields exist
        const defaultDB = getDefaultDB();
        for (const key of Object.keys(defaultDB)) {
            if (!db[key]) {
                db[key] = defaultDB[key];
            }
        }

        // Add completedAt field to existing tasks
        if (db.tasks) {
            db.tasks = db.tasks.map(task => ({
                completedAt: null,
                ...task
            }));
        }

        cachedDB = db;
        return cachedDB;
    } catch (e) {
        console.error('Error loading database, using defaults:', e);
        cachedDB = getDefaultDB();
        return cachedDB;
    }
}

// Read database (from cache if available)
function readDB() {
    return loadDB();
}

// Flush changes to disk
async function flushToDisk() {
    if (!isDirty || !cachedDB) {
        return;
    }

    return new Promise((resolve, reject) => {
        writeQueue = writeQueue.then(async () => {
            try {
                // Make a copy to avoid race conditions
                const dataToWrite = JSON.stringify(cachedDB, null, 2);
                fs.writeFileSync(dbPath, dataToWrite, 'utf8');
                isDirty = false;
                resolve();
            } catch (e) {
                console.error('Error writing database:', e);
                reject(e);
            }
        });
    });
}

// Schedule a flush (debounced)
function scheduleFlush() {
    if (flushTimer) {
        clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
        flushToDisk().catch(console.error);
    }, FLUSH_INTERVAL);
}

// Write database (updates cache and schedules flush)
function writeDB(data) {
    cachedDB = data;
    isDirty = true;
    scheduleFlush();
}

// Force flush all pending changes (for shutdown)
async function forceFlush() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    await flushToDisk();
}

// Clear cache (for testing)
function clearCache() {
    cachedDB = null;
    isDirty = false;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Flushing database before shutdown...');
    await forceFlush();
});

process.on('SIGINT', async () => {
    console.log('Flushing database before shutdown...');
    await forceFlush();
});

module.exports = {
    readDB,
    writeDB,
    forceFlush,
    clearCache
};
