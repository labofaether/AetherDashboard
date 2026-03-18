/**
 * Reminder Service
 * Background service for checking and triggering reminders
 */

const TaskModel = require('../models/TaskModel');
const EmailModel = require('../models/EmailModel');
const dataCleanupService = require('./DataCleanupService');
const retentionConfig = require('../config/dataRetention');
const cron = require('node-cron');

class ReminderService {
    constructor() {
        this.checkInterval = parseInt(process.env.REMINDER_CHECK_INTERVAL) || 60000;
        this.emailSyncInterval = parseInt(process.env.EMAIL_SYNC_INTERVAL) || 300000;
        this.lightCleanupInterval = retentionConfig.schedule.lightCleanupInterval;
        this.fullCleanupInterval = retentionConfig.schedule.fullCleanupInterval;
        this.isRunning = false;
        this.checkTimer = null;
        this.syncTimer = null;
        this.lightCleanupTimer = null;
        this.fullCleanupTimer = null;
        this.cronJobs = [];
        this.listeners = [];
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @private
     */
    emit(event, data) {
        this.listeners
            .filter(l => l.event === event)
            .forEach(l => l.callback(data));
    }

    /**
     * Check for due reminders
     */
    async checkReminders() {
        try {
            const dueReminders = TaskModel.getDueReminders();

            for (const reminder of dueReminders) {
                console.log(`Triggering reminder: ${reminder.taskTitle} (ID: ${reminder.id})`);

                // Mark as triggered
                TaskModel.markReminderTriggered(reminder.id);

                // Emit event
                this.emit('reminder', reminder);
            }

            return dueReminders.length;
        } catch (error) {
            console.error('Error checking reminders:', error);
            return 0;
        }
    }

    /**
     * Sync emails from all providers
     */
    async syncEmails() {
        try {
            const emailConfig = require('../config/emailProviders');
            const providers = emailConfig.getEnabledProviders();
            let totalNew = 0;

            for (const provider of providers) {
                try {
                    const newCount = await EmailModel.syncEmails(provider.type);
                    totalNew += newCount;
                    if (newCount > 0) {
                        console.log(`Synced ${newCount} new emails from ${provider.name}`);
                        this.emit('emails-synced', { providerType: provider.type, count: newCount });
                    }
                } catch (error) {
                    console.error(`Error syncing from ${provider.name}:`, error);
                }
            }

            return totalNew;
        } catch (error) {
            console.error('Error syncing emails:', error);
            return 0;
        }
    }

    /**
     * Run light data cleanup
     */
    runLightCleanup() {
        try {
            const removed = dataCleanupService.runLightCleanup();
            if (removed > 0) {
                this.emit('light-cleanup', { removed });
            }
            return removed;
        } catch (error) {
            console.error('Error running light cleanup:', error);
            return 0;
        }
    }

    /**
     * Run full data cleanup
     */
    runFullCleanup() {
        try {
            const removed = dataCleanupService.runFullCleanup();
            if (removed > 0) {
                this.emit('full-cleanup', { removed });
            }
            return removed;
        } catch (error) {
            console.error('Error running full cleanup:', error);
            return 0;
        }
    }

    /**
     * Start the reminder service
     */
    start() {
        if (this.isRunning) {
            console.log('Reminder service is already running');
            return;
        }

        this.isRunning = true;
        console.log('Starting Reminder Service...');

        // Check reminders on interval
        this.checkTimer = setInterval(() => {
            this.checkReminders();
        }, this.checkInterval);

        // Sync emails on interval
        this.syncTimer = setInterval(() => {
            this.syncEmails();
        }, this.emailSyncInterval);

        // Light cleanup every hour
        this.lightCleanupTimer = setInterval(() => {
            this.runLightCleanup();
        }, this.lightCleanupInterval);

        // Full cleanup once a day
        this.fullCleanupTimer = setInterval(() => {
            this.runFullCleanup();
        }, this.fullCleanupInterval);

        // Do initial check, sync, and cleanup
        this.checkReminders();
        this.syncEmails();

        // Run initial cleanup in background
        setTimeout(() => {
            try {
                dataCleanupService.runInitialCleanup();
            } catch (error) {
                console.error('Error during initial cleanup:', error);
            }
        }, 5000);

        console.log(`Reminder Service started (check interval: ${this.checkInterval}ms, sync interval: ${this.emailSyncInterval}ms)`);
    }

    /**
     * Stop the reminder service
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }

        if (this.lightCleanupTimer) {
            clearInterval(this.lightCleanupTimer);
            this.lightCleanupTimer = null;
        }

        if (this.fullCleanupTimer) {
            clearInterval(this.fullCleanupTimer);
            this.fullCleanupTimer = null;
        }

        this.cronJobs.forEach(job => job.stop());
        this.cronJobs = [];

        console.log('Reminder Service stopped');
    }

    /**
     * Get service status
     * @returns {Object} Status info
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            emailSyncInterval: this.emailSyncInterval
        };
    }
}

// Create singleton instance
const reminderService = new ReminderService();

module.exports = reminderService;
