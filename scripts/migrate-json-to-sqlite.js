/**
 * One-time migration: board.json -> SQLite (aether.db)
 *
 * Usage: node scripts/migrate-json-to-sqlite.js
 *
 * Safe to run multiple times — skips if aether.db already has data.
 */

const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../db');

const jsonPath = path.join(__dirname, '..', 'board.json');

function migrate() {
    if (!fs.existsSync(jsonPath)) {
        console.log('No board.json found — nothing to migrate.');
        return;
    }

    const db = getDb();

    // Check if already migrated
    const taskCount = db.prepare('SELECT COUNT(*) as cnt FROM tasks').get().cnt;
    if (taskCount > 0) {
        console.log(`SQLite already has ${taskCount} tasks — skipping migration.`);
        console.log('Delete aether.db first if you want to re-migrate.');
        return;
    }

    console.log('Reading board.json...');
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);

    const counts = {};

    // Tasks
    if (data.tasks?.length) {
        const stmt = db.prepare(`
            INSERT INTO tasks (id, title, description, priority, status, projectId, tags, dueDate, completedAt, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const t of data.tasks) {
                stmt.run(t.id, t.title, t.description || '', t.priority, t.status,
                    t.projectId, JSON.stringify(t.tags || []), t.dueDate || null,
                    t.completedAt || null, t.createdAt, t.updatedAt);
            }
        });
        insert();
        counts.tasks = data.tasks.length;
    }

    // Projects
    if (data.projects?.length) {
        const stmt = db.prepare(`
            INSERT INTO projects (id, name, color, description, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const p of data.projects) {
                stmt.run(p.id, p.name, p.color || '#64ffda', p.description || '', p.createdAt, p.updatedAt);
            }
        });
        insert();
        counts.projects = data.projects.length;
    }

    // Activity Log
    if (data.activityLog?.length) {
        const stmt = db.prepare(`
            INSERT INTO activity_log (id, action, taskId, taskTitle, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const a of data.activityLog) {
                stmt.run(a.id, a.action, a.taskId, a.taskTitle,
                    JSON.stringify(a.details || {}), a.timestamp);
            }
        });
        insert();
        counts.activityLog = data.activityLog.length;
    }

    // Emails
    if (data.emails?.length) {
        const stmt = db.prepare(`
            INSERT INTO emails (id, providerId, providerType, subject, "from", fromName, bodyPreview,
                receivedAt, isRead, importance, hasAttachments, webLink, convertedToTask, taskId, projectId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const e of data.emails) {
                stmt.run(e.id, e.providerId, e.providerType, e.subject,
                    e.from, e.fromName, e.bodyPreview, e.receivedAt,
                    e.isRead ? 1 : 0, e.importance, e.hasAttachments ? 1 : 0,
                    e.webLink, e.convertedToTask ? 1 : 0, e.taskId, e.projectId,
                    e.createdAt, e.updatedAt);
            }
        });
        insert();
        counts.emails = data.emails.length;
    }

    // Email Sync State
    if (data.emailSyncState?.length) {
        const stmt = db.prepare(`
            INSERT INTO email_sync_state (providerType, connected, tokens, lastEmailSyncAt, lastEventSyncAt,
                userEmail, userDisplayName, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const s of data.emailSyncState) {
                stmt.run(s.providerType, s.connected ? 1 : 0,
                    s.tokens ? JSON.stringify(s.tokens) : null,
                    s.lastEmailSyncAt, s.lastEventSyncAt,
                    s.userEmail, s.userDisplayName, s.updatedAt);
            }
        });
        insert();
        counts.emailSyncState = data.emailSyncState.length;
    }

    // Reminders
    if (data.reminders?.length) {
        const stmt = db.prepare(`
            INSERT INTO reminders (id, taskId, taskTitle, remindAt, note, triggered, triggeredAt, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const r of data.reminders) {
                stmt.run(r.id, r.taskId, r.taskTitle, r.remindAt, r.note || '',
                    r.triggered ? 1 : 0, r.triggeredAt || null, r.createdAt, r.updatedAt);
            }
        });
        insert();
        counts.reminders = data.reminders.length;
    }

    // Events
    if (data.events?.length) {
        const stmt = db.prepare(`
            INSERT INTO events (id, providerId, providerType, subject, start, end, location, isAllDay,
                organizer, organizerEmail, bodyPreview, webLink, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const e of data.events) {
                stmt.run(e.id, e.providerId, e.providerType, e.subject,
                    e.start, e.end, e.location, e.isAllDay ? 1 : 0,
                    e.organizer, e.organizerEmail, e.bodyPreview, e.webLink,
                    e.createdAt || new Date().toISOString());
            }
        });
        insert();
        counts.events = data.events.length;
    }

    // API Usage
    if (data.apiUsage?.length) {
        const stmt = db.prepare(`
            INSERT INTO api_usage (id, provider, endpoint, method, success, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const a of data.apiUsage) {
                stmt.run(a.id, a.provider, a.endpoint, a.method, a.success ? 1 : 0, a.timestamp);
            }
        });
        insert();
        counts.apiUsage = data.apiUsage.length;
    }

    // Email Filters
    if (data.emailFilters?.length) {
        const stmt = db.prepare(`
            INSERT INTO email_filters (emailId, important, reason, confidence, filteredAt)
            VALUES (?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const f of data.emailFilters) {
                stmt.run(f.emailId, f.important ? 1 : 0, f.reason, f.confidence, f.filteredAt);
            }
        });
        insert();
        counts.emailFilters = data.emailFilters.length;
    }

    // LLM Usage
    if (data.llmUsage?.length) {
        const stmt = db.prepare(`
            INSERT INTO llm_usage (id, provider, model, endpoint, method, success, tokensUsed, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const l of data.llmUsage) {
                stmt.run(l.id, l.provider, l.model, l.endpoint, l.method,
                    l.success ? 1 : 0, l.tokensUsed, l.timestamp);
            }
        });
        insert();
        counts.llmUsage = data.llmUsage.length;
    }

    // Papers
    if (data.papers?.length) {
        const stmt = db.prepare(`
            INSERT INTO papers (id, arxivId, title, abstract, authors, publishedAt, updatedAt, url,
                categories, category, worthPushing, filterReason, summary, innovation, displayedOn, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insert = db.transaction(() => {
            for (const p of data.papers) {
                stmt.run(p.id, p.arxivId, p.title, p.abstract,
                    JSON.stringify(p.authors || []), p.publishedAt, p.updatedAt, p.url,
                    JSON.stringify(p.categories || []), p.category,
                    p.worthPushing ? 1 : 0, p.filterReason, p.summary, p.innovation,
                    p.displayedOn || null, p.createdAt);
            }
        });
        insert();
        counts.papers = data.papers.length;
    }

    console.log('\nMigration complete!');
    console.log('Records migrated:');
    for (const [table, count] of Object.entries(counts)) {
        console.log(`  ${table}: ${count}`);
    }

    // Rename board.json to board.json.bak
    const bakPath = jsonPath + '.bak';
    fs.renameSync(jsonPath, bakPath);
    console.log(`\nRenamed board.json -> board.json.bak`);
    console.log('You can delete board.json.bak after verifying the migration.');
}

try {
    migrate();
} finally {
    closeDb();
}
