const { getDb } = require('../db');
const retentionConfig = require('../config/dataRetention');
const log = require('../utils/logger');

class DataCleanupService {
    constructor() {
        this.lastLightCleanup = null;
        this.lastFullCleanup = null;
    }

    cleanupOldEmails() {
        const db = getDb();
        const config = retentionConfig.emails;
        const now = new Date();
        const maxAgeDate = new Date(now.getTime() - config.maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
        const convertedMaxAgeDate = new Date(now.getTime() - config.keepConvertedMaxAgeDays * 24 * 60 * 60 * 1000).toISOString();

        const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM emails').get().cnt;
        if (totalCount === 0) return 0;

        // Keep newest maxCount emails + those within age limits
        // Delete emails that are: beyond maxCount AND older than maxAge AND (not converted or converted beyond keepConvertedMaxAge)
        const result = db.prepare(`
            DELETE FROM emails WHERE id NOT IN (
                SELECT id FROM emails ORDER BY receivedAt DESC LIMIT ?
            ) AND receivedAt < ? AND (convertedToTask = 0 OR receivedAt < ?)
        `).run(config.maxCount, maxAgeDate, convertedMaxAgeDate);

        if (result.changes > 0) {
            log.info(`Cleaned up ${result.changes} old emails`);
        }
        return result.changes;
    }

    cleanupOldEvents() {
        const db = getDb();
        const config = retentionConfig.events;
        const now = new Date().toISOString();
        const keepPastDate = new Date(Date.now() - config.keepPastDays * 24 * 60 * 60 * 1000).toISOString();

        const result = db.prepare('DELETE FROM events WHERE end < ?').run(keepPastDate);
        if (result.changes > 0) {
            log.info(`Cleaned up ${result.changes} old events`);
        }
        return result.changes;
    }

    cleanupOldReminders() {
        const db = getDb();
        const config = retentionConfig.reminders;
        const keepTriggeredDate = new Date(Date.now() - config.keepTriggeredDays * 24 * 60 * 60 * 1000).toISOString();

        const result = db.prepare(
            'DELETE FROM reminders WHERE triggered = 1 AND COALESCE(triggeredAt, createdAt) < ?'
        ).run(keepTriggeredDate);

        if (result.changes > 0) {
            log.info(`Cleaned up ${result.changes} old reminders`);
        }
        return result.changes;
    }

    cleanupOldEmailFilters() {
        const db = getDb();
        const config = retentionConfig.emailFilters;

        const result = db.prepare(`
            DELETE FROM email_filters WHERE id NOT IN (
                SELECT id FROM email_filters ORDER BY id DESC LIMIT ?
            )
        `).run(config.maxCount);

        if (result.changes > 0) {
            log.info(`Cleaned up ${result.changes} old email filters`);
        }
        return result.changes;
    }

    cleanupCompletedTasks(olderThanDays = null) {
        const config = retentionConfig.completedTasks;
        if (!config.enabled && olderThanDays === null) return 0;

        const db = getDb();
        const daysToKeep = olderThanDays || config.keepDays;
        const keepDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

        const completed = db.prepare(
            'SELECT id FROM tasks WHERE status = ? AND COALESCE(updatedAt, createdAt) < ?'
        ).all('donecontainer', keepDate);

        if (completed.length === 0) return 0;

        const ids = completed.map(t => t.id);
        const placeholders = ids.map(() => '?').join(',');

        const cleanup = db.transaction(() => {
            db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);
            db.prepare(`DELETE FROM reminders WHERE taskId IN (${placeholders})`).run(...ids);
        });
        cleanup();

        log.info(`Cleaned up ${ids.length} old completed tasks`);
        return ids.length;
    }

    runLightCleanup() {
        log.info('Running light data cleanup...');
        let totalRemoved = 0;
        try {
            totalRemoved += this.cleanupOldReminders();
            totalRemoved += this.cleanupOldEmailFilters();
        } catch (error) {
            log.error('Error during light cleanup', { error: error.message });
        }
        this.lastLightCleanup = new Date();
        log.info(`Light cleanup complete. Total removed: ${totalRemoved} items`);
        return totalRemoved;
    }

    runFullCleanup() {
        log.info('Running full data cleanup...');
        let totalRemoved = 0;
        try {
            totalRemoved += this.cleanupOldEmails();
            totalRemoved += this.cleanupOldEvents();
            totalRemoved += this.cleanupOldReminders();
            totalRemoved += this.cleanupOldEmailFilters();
            if (retentionConfig.completedTasks.enabled) {
                totalRemoved += this.cleanupCompletedTasks();
            }
        } catch (error) {
            log.error('Error during full cleanup', { error: error.message });
        }
        this.lastFullCleanup = new Date();
        log.info(`Full cleanup complete. Total removed: ${totalRemoved} items`);
        return totalRemoved;
    }

    runInitialCleanup() {
        log.info('Running initial data cleanup...');
        return this.runFullCleanup();
    }

    getStatus() {
        const db = getDb();
        return {
            lastLightCleanup: this.lastLightCleanup,
            lastFullCleanup: this.lastFullCleanup,
            currentCounts: {
                emails: db.prepare('SELECT COUNT(*) as cnt FROM emails').get().cnt,
                events: db.prepare('SELECT COUNT(*) as cnt FROM events').get().cnt,
                reminders: db.prepare('SELECT COUNT(*) as cnt FROM reminders').get().cnt,
                emailFilters: db.prepare('SELECT COUNT(*) as cnt FROM email_filters').get().cnt,
                tasks: db.prepare('SELECT COUNT(*) as cnt FROM tasks').get().cnt,
                activityLog: db.prepare('SELECT COUNT(*) as cnt FROM activity_log').get().cnt,
                apiUsage: db.prepare('SELECT COUNT(*) as cnt FROM api_usage').get().cnt,
                llmUsage: db.prepare('SELECT COUNT(*) as cnt FROM llm_usage').get().cnt
            }
        };
    }
}

const dataCleanupService = new DataCleanupService();
module.exports = dataCleanupService;
