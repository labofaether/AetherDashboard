/**
 * Data Cleanup Service
 * Handles periodic cleanup of old data to prevent database bloat
 */

const { readDB, writeDB } = require('../db');
const retentionConfig = require('../config/dataRetention');

class DataCleanupService {
    constructor() {
        this.lastLightCleanup = null;
        this.lastFullCleanup = null;
    }

    /**
     * Clean up old emails based on retention policy
     * @returns {number} Number of emails removed
     */
    cleanupOldEmails() {
        const db = readDB();
        const config = retentionConfig.emails;
        const now = new Date();
        const initialCount = db.emails.length;

        if (initialCount === 0) return 0;

        // Sort emails by received date (newest first)
        const sortedEmails = [...db.emails].sort((a, b) =>
            new Date(b.receivedAt) - new Date(a.receivedAt)
        );

        const keptEmails = [];
        const maxAgeDate = new Date(now.getTime() - config.maxAgeDays * 24 * 60 * 60 * 1000);
        const convertedMaxAgeDate = new Date(now.getTime() - config.keepConvertedMaxAgeDays * 24 * 60 * 60 * 1000);

        for (let i = 0; i < sortedEmails.length; i++) {
            const email = sortedEmails[i];
            const receivedDate = new Date(email.receivedAt);

            // Always keep the first N emails regardless of age
            if (i < config.maxCount) {
                keptEmails.push(email);
                continue;
            }

            // Check if email should be kept based on age
            if (email.convertedToTask && config.keepConvertedToTask) {
                if (receivedDate >= convertedMaxAgeDate) {
                    keptEmails.push(email);
                    continue;
                }
            } else if (receivedDate >= maxAgeDate) {
                keptEmails.push(email);
                continue;
            }

            // Otherwise, remove the email
        }

        if (keptEmails.length !== initialCount) {
            db.emails = keptEmails;
            writeDB(db);
            console.log(`Cleaned up ${initialCount - keptEmails.length} old emails`);
        }

        return initialCount - keptEmails.length;
    }

    /**
     * Clean up old calendar events
     * @returns {number} Number of events removed
     */
    cleanupOldEvents() {
        const db = readDB();
        const config = retentionConfig.events;
        const now = new Date();
        const initialCount = db.events.length;

        if (initialCount === 0) return 0;

        const keepPastDate = new Date(now.getTime() - config.keepPastDays * 24 * 60 * 60 * 1000);

        db.events = db.events.filter(event => {
            const eventEnd = new Date(event.end);

            // Keep all future events
            if (config.keepFuture && eventEnd >= now) {
                return true;
            }

            // Keep recent past events
            return eventEnd >= keepPastDate;
        });

        const removedCount = initialCount - db.events.length;
        if (removedCount > 0) {
            writeDB(db);
            console.log(`Cleaned up ${removedCount} old events`);
        }

        return removedCount;
    }

    /**
     * Clean up old triggered reminders
     * @returns {number} Number of reminders removed
     */
    cleanupOldReminders() {
        const db = readDB();
        const config = retentionConfig.reminders;
        const now = new Date();
        const initialCount = db.reminders.length;

        if (initialCount === 0) return 0;

        const keepTriggeredDate = new Date(now.getTime() - config.keepTriggeredDays * 24 * 60 * 60 * 1000);

        db.reminders = db.reminders.filter(reminder => {
            // Keep non-triggered reminders
            if (!reminder.triggered) {
                return true;
            }

            // Keep recently triggered reminders
            const triggeredAt = reminder.triggeredAt
                ? new Date(reminder.triggeredAt)
                : new Date(reminder.createdAt);

            return triggeredAt >= keepTriggeredDate;
        });

        const removedCount = initialCount - db.reminders.length;
        if (removedCount > 0) {
            writeDB(db);
            console.log(`Cleaned up ${removedCount} old reminders`);
        }

        return removedCount;
    }

    /**
     * Clean up old email filter results
     * @returns {number} Number of filters removed
     */
    cleanupOldEmailFilters() {
        const db = readDB();
        const config = retentionConfig.emailFilters;
        const initialCount = db.emailFilters.length;

        if (initialCount === 0) return 0;

        if (initialCount > config.maxCount) {
            // Keep the newest N filters
            db.emailFilters = db.emailFilters.slice(-config.maxCount);
            writeDB(db);
            console.log(`Cleaned up ${initialCount - config.maxCount} old email filters`);
            return initialCount - config.maxCount;
        }

        return 0;
    }

    /**
     * Clean up old completed tasks (optional, disabled by default)
     * @param {number} olderThanDays - Optional override for days to keep
     * @returns {number} Number of tasks removed
     */
    cleanupCompletedTasks(olderThanDays = null) {
        const db = readDB();
        const config = retentionConfig.completedTasks;

        // Only run if enabled or explicitly called with days
        if (!config.enabled && olderThanDays === null) {
            return 0;
        }

        const daysToKeep = olderThanDays || config.keepDays;
        const now = new Date();
        const keepDate = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000);
        const initialCount = db.tasks.length;

        if (initialCount === 0) return 0;

        const completedTaskIds = new Set();

        db.tasks = db.tasks.filter(task => {
            if (task.status !== 'donecontainer') {
                return true;
            }

            const updatedAt = new Date(task.updatedAt || task.createdAt);
            if (updatedAt >= keepDate) {
                return true;
            }

            completedTaskIds.add(task.id);
            return false;
        });

        // Also remove reminders for deleted tasks
        if (completedTaskIds.size > 0) {
            db.reminders = db.reminders.filter(r => !completedTaskIds.has(r.taskId));
        }

        const removedCount = initialCount - db.tasks.length;
        if (removedCount > 0) {
            writeDB(db);
            console.log(`Cleaned up ${removedCount} old completed tasks`);
        }

        return removedCount;
    }

    /**
     * Run light cleanup (runs hourly)
     * Quick cleanup operations that don't take much time
     */
    runLightCleanup() {
        console.log('Running light data cleanup...');
        let totalRemoved = 0;

        try {
            totalRemoved += this.cleanupOldReminders();
            totalRemoved += this.cleanupOldEmailFilters();
        } catch (error) {
            console.error('Error during light cleanup:', error);
        }

        this.lastLightCleanup = new Date();
        console.log(`Light cleanup complete. Total removed: ${totalRemoved} items`);
        return totalRemoved;
    }

    /**
     * Run full cleanup (runs daily)
     * More comprehensive cleanup operations
     */
    runFullCleanup() {
        console.log('Running full data cleanup...');
        let totalRemoved = 0;

        try {
            totalRemoved += this.cleanupOldEmails();
            totalRemoved += this.cleanupOldEvents();
            totalRemoved += this.cleanupOldReminders();
            totalRemoved += this.cleanupOldEmailFilters();

            // Only run completed task cleanup if enabled
            if (retentionConfig.completedTasks.enabled) {
                totalRemoved += this.cleanupCompletedTasks();
            }
        } catch (error) {
            console.error('Error during full cleanup:', error);
        }

        this.lastFullCleanup = new Date();
        console.log(`Full cleanup complete. Total removed: ${totalRemoved} items`);
        return totalRemoved;
    }

    /**
     * Run initial cleanup on service start
     */
    runInitialCleanup() {
        console.log('Running initial data cleanup...');
        return this.runFullCleanup();
    }

    /**
     * Get cleanup status
     */
    getStatus() {
        const db = readDB();
        return {
            lastLightCleanup: this.lastLightCleanup,
            lastFullCleanup: this.lastFullCleanup,
            currentCounts: {
                emails: db.emails.length,
                events: db.events.length,
                reminders: db.reminders.length,
                emailFilters: db.emailFilters.length,
                tasks: db.tasks.length,
                activityLog: db.activityLog.length,
                apiUsage: db.apiUsage.length,
                llmUsage: (db.llmUsage || []).length
            }
        };
    }
}

// Create singleton instance
const dataCleanupService = new DataCleanupService();

module.exports = dataCleanupService;
