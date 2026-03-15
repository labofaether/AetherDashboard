/**
 * Reminder Service
 * Background service for checking and triggering reminders
 */

const TaskModel = require('../models/TaskModel');
const EmailModel = require('../models/EmailModel');
const cron = require('node-cron');

class ReminderService {
    constructor() {
        this.checkInterval = parseInt(process.env.REMINDER_CHECK_INTERVAL) || 60000;
        this.emailSyncInterval = parseInt(process.env.EMAIL_SYNC_INTERVAL) || 300000;
        this.isRunning = false;
        this.checkTimer = null;
        this.syncTimer = null;
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

        // Do initial check and sync
        this.checkReminders();
        this.syncEmails();

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
