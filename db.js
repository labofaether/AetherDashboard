const Database = require('better-sqlite3');
const path = require('path');
const log = require('./utils/logger');

// AETHER_DB_PATH overrides the default location. ":memory:" is used by tests for
// an isolated, ephemeral DB; production keeps using ./aether.db.
const dbPath = process.env.AETHER_DB_PATH || path.join(__dirname, 'aether.db');

let db;

function getDb() {
    if (db) return db;

    db = new Database(dbPath);
    if (dbPath !== ':memory:') db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema();
    log.info('SQLite database initialized', { path: dbPath });
    return db;
}

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority TEXT,
            status TEXT NOT NULL,
            projectId INTEGER,
            tags TEXT DEFAULT '[]',
            dueDate TEXT,
            completedAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#64ffda',
            description TEXT DEFAULT '',
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            taskId INTEGER,
            taskTitle TEXT,
            details TEXT DEFAULT '{}',
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            providerId TEXT,
            providerType TEXT,
            subject TEXT,
            "from" TEXT,
            fromName TEXT,
            bodyPreview TEXT,
            receivedAt TEXT,
            isRead INTEGER DEFAULT 0,
            importance TEXT,
            hasAttachments INTEGER DEFAULT 0,
            webLink TEXT,
            convertedToTask INTEGER DEFAULT 0,
            taskId INTEGER,
            projectId INTEGER,
            createdAt TEXT NOT NULL,
            updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS email_sync_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            providerType TEXT UNIQUE NOT NULL,
            connected INTEGER DEFAULT 0,
            tokens TEXT,
            lastEmailSyncAt TEXT,
            lastEventSyncAt TEXT,
            userEmail TEXT,
            userDisplayName TEXT,
            updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            taskId INTEGER NOT NULL,
            taskTitle TEXT,
            remindAt TEXT NOT NULL,
            note TEXT DEFAULT '',
            triggered INTEGER DEFAULT 0,
            triggeredAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            providerId TEXT,
            providerType TEXT,
            subject TEXT,
            start TEXT,
            end TEXT,
            location TEXT,
            isAllDay INTEGER DEFAULT 0,
            organizer TEXT,
            organizerEmail TEXT,
            bodyPreview TEXT,
            webLink TEXT,
            createdAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT,
            endpoint TEXT,
            method TEXT,
            success INTEGER DEFAULT 1,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_filters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emailId INTEGER,
            important INTEGER,
            reason TEXT,
            confidence REAL,
            filteredAt TEXT
        );

        CREATE TABLE IF NOT EXISTS llm_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT,
            model TEXT,
            endpoint TEXT,
            method TEXT,
            success INTEGER DEFAULT 1,
            tokensUsed INTEGER,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            arxivId TEXT UNIQUE,
            title TEXT,
            abstract TEXT,
            authors TEXT DEFAULT '[]',
            publishedAt TEXT,
            updatedAt TEXT,
            url TEXT,
            categories TEXT DEFAULT '[]',
            category TEXT,
            worthPushing INTEGER DEFAULT 0,
            filterReason TEXT,
            summary TEXT,
            innovation TEXT,
            displayedOn TEXT,
            createdAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            taskId INTEGER NOT NULL,
            title TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            sortOrder INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_subtasks_taskId ON subtasks(taskId);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON tasks(projectId);
        CREATE INDEX IF NOT EXISTS idx_tasks_dueDate ON tasks(dueDate);
        CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt);
        CREATE INDEX IF NOT EXISTS idx_tasks_completedAt ON tasks(completedAt);
        CREATE INDEX IF NOT EXISTS idx_emails_providerType ON emails(providerType);
        CREATE INDEX IF NOT EXISTS idx_emails_providerId ON emails(providerId, providerType);
        CREATE INDEX IF NOT EXISTS idx_emails_receivedAt ON emails(receivedAt);
        CREATE INDEX IF NOT EXISTS idx_email_filters_emailId ON email_filters(emailId);
        CREATE INDEX IF NOT EXISTS idx_events_start ON events(start);
        CREATE INDEX IF NOT EXISTS idx_papers_displayedOn ON papers(displayedOn);
        CREATE INDEX IF NOT EXISTS idx_papers_arxivId ON papers(arxivId);
        CREATE INDEX IF NOT EXISTS idx_reminders_taskId ON reminders(taskId);
        CREATE INDEX IF NOT EXISTS idx_reminders_triggered ON reminders(triggered, remindAt);
        CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_llm_usage_timestamp ON llm_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);

        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL DEFAULT '',
            color TEXT DEFAULT '#fef3c7',
            sortOrder INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            targetDate TEXT,
            targetCount INTEGER DEFAULT 1,
            currentCount INTEGER DEFAULT 0,
            category TEXT DEFAULT 'general',
            completed INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS focus_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            taskId INTEGER,
            duration INTEGER NOT NULL DEFAULT 1500,
            elapsed INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            startedAt TEXT NOT NULL,
            endedAt TEXT,
            FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS task_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            subtasks TEXT DEFAULT '[]',
            defaultPriority TEXT DEFAULT 'medium',
            createdAt TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_focus_taskId ON focus_sessions(taskId);
        CREATE INDEX IF NOT EXISTS idx_focus_startedAt ON focus_sessions(startedAt);
    `);

    // Add new columns to tasks table (ALTER TABLE doesn't support IF NOT EXISTS in SQLite)
    try { db.exec("ALTER TABLE tasks ADD COLUMN pinnedToday INTEGER DEFAULT 0"); } catch(e) {}
    try { db.exec("ALTER TABLE tasks ADD COLUMN recurPattern TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE tasks ADD COLUMN recurNextDate TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE tasks ADD COLUMN isUrgent INTEGER DEFAULT 0"); } catch(e) {}
    try { db.exec("ALTER TABLE tasks ADD COLUMN isImportant INTEGER DEFAULT 0"); } catch(e) {}

    // Index on pinnedToday (must be after ALTER TABLE)
    db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_pinnedToday ON tasks(pinnedToday)");
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

// No-op for backwards compat — SQLite handles persistence automatically
async function forceFlush() {}

process.on('SIGTERM', () => closeDb());
process.on('SIGINT', () => closeDb());

module.exports = { getDb, closeDb, forceFlush };
