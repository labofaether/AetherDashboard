/**
 * Reminder Service
 * Background service for checking and triggering reminders
 */

const TaskModel = require('../models/TaskModel');
const EmailModel = require('../models/EmailModel');
const dataCleanupService = require('./DataCleanupService');
const retentionConfig = require('../config/dataRetention');
const PaperService = require('./PaperService');
const cron = require('node-cron');
const log = require('../utils/logger');

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
        this.syncStats = {
            lastSyncAt: null,
            lastSuccessAt: null,
            lastError: null,
            consecutiveFailures: 0,
            totalSyncs: 0,
            totalFailures: 0,
        };
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
                log.info(`Triggering reminder: ${reminder.taskTitle} (ID: ${reminder.id})`);

                // Mark as triggered
                TaskModel.markReminderTriggered(reminder.id);

                // Emit event
                this.emit('reminder', reminder);
            }

            return dueReminders.length;
        } catch (error) {
            log.error('Error checking reminders:', error);
            return 0;
        }
    }

    /**
     * Sync emails from all providers
     */
    async syncEmails() {
        const stats = this.syncStats;
        stats.totalSyncs++;
        stats.lastSyncAt = new Date().toISOString();

        try {
            const emailConfig = require('../config/emailProviders');
            const providers = emailConfig.getEnabledProviders();
            let totalNew = 0;
            const providerErrors = [];

            for (const provider of providers) {
                try {
                    const newCount = await EmailModel.syncEmails(provider.type);
                    totalNew += newCount;
                    if (newCount > 0) {
                        log.info(`Synced ${newCount} new emails from ${provider.name}`);
                        this.emit('emails-synced', { providerType: provider.type, count: newCount });
                    }
                } catch (error) {
                    log.error(`Error syncing from ${provider.name}:`, error);
                    providerErrors.push({ provider: provider.name, message: error.message });
                }
            }

            if (providerErrors.length > 0 && providerErrors.length === providers.length && providers.length > 0) {
                // All providers failed — treat as overall failure
                stats.consecutiveFailures++;
                stats.totalFailures++;
                stats.lastError = { at: stats.lastSyncAt, errors: providerErrors };
            } else {
                stats.consecutiveFailures = 0;
                stats.lastSuccessAt = stats.lastSyncAt;
                if (providerErrors.length === 0) stats.lastError = null;
            }

            return totalNew;
        } catch (error) {
            log.error('Error syncing emails:', error);
            stats.consecutiveFailures++;
            stats.totalFailures++;
            stats.lastError = { at: stats.lastSyncAt, message: error.message };
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
            log.error('Error running light cleanup:', error);
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
            log.error('Error running full cleanup:', error);
            return 0;
        }
    }

    /**
     * Sync daily papers
     */
    async syncDailyPapers() {
        try {
            log.info('Running daily paper sync...');
            const result = await PaperService.syncPapers(false);
            if (result.success && result.papers.length > 0) {
                log.info(`Synced ${result.papers.length} papers successfully`);
                this.emit('papers-synced', { count: result.papers.length, papers: result.papers });
            } else if (result.cached) {
                log.info('Using cached papers for today');
            }
            return result;
        } catch (error) {
            log.error('Error syncing daily papers:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Start the reminder service
     */
    start() {
        if (this.isRunning) {
            log.info('Reminder service is already running');
            return;
        }

        this.isRunning = true;
        log.info('Starting Reminder Service...');

        const safeAsync = (label, fn) => {
            return () => {
                Promise.resolve()
                    .then(() => fn())
                    .catch(err => log.error(`ReminderService.${label} unhandled`, { message: err?.message, stack: err?.stack }));
            };
        };
        const safeSync = (label, fn) => {
            return () => {
                try { fn(); }
                catch (err) { log.error(`ReminderService.${label} unhandled`, { message: err?.message, stack: err?.stack }); }
            };
        };

        // Phase-shift each timer's first tick by 0–10% of its interval. Without
        // this, multiple instances started together would call external APIs
        // (Outlook sync, paper sync) at the exact same moment forever — a
        // thundering-herd risk if/when this is deployed to more than one user.
        const jittered = (interval, cb) => {
            const startDelay = Math.floor(Math.random() * interval * 0.1);
            const wrapper = { id: null, started: false };
            wrapper.id = setTimeout(() => {
                wrapper.started = true;
                wrapper.id = setInterval(cb, interval);
            }, startDelay);
            return wrapper;
        };

        // Check reminders on interval
        this.checkTimer = jittered(this.checkInterval, safeAsync('checkReminders', () => this.checkReminders()));

        // Sync emails on interval
        this.syncTimer = jittered(this.emailSyncInterval, safeAsync('syncEmails', () => this.syncEmails()));

        // Light cleanup every hour
        this.lightCleanupTimer = jittered(this.lightCleanupInterval, safeSync('runLightCleanup', () => this.runLightCleanup()));

        // Full cleanup once a day
        this.fullCleanupTimer = jittered(this.fullCleanupInterval, safeSync('runFullCleanup', () => this.runFullCleanup()));

        // Do initial check and sync (also wrapped — unhandled rejections from these shouldn't crash startup)
        safeAsync('checkReminders[initial]', () => this.checkReminders())();
        safeAsync('syncEmails[initial]', () => this.syncEmails())();

        // Schedule daily paper sync at 8:00 AM
        try {
            const paperSyncJob = cron.schedule('0 8 * * *', () => {
                log.info('Cron: Running daily paper sync...');
                Promise.resolve(this.syncDailyPapers()).catch(err =>
                    log.error('ReminderService.syncDailyPapers[cron] unhandled', { message: err?.message, stack: err?.stack }));
            }, {
                scheduled: true,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
            this.cronJobs.push(paperSyncJob);
            log.info('Daily paper sync scheduled for 8:00 AM');
        } catch (error) {
            log.error('Failed to schedule paper sync cron job:', error);
        }

        // Initial paper sync (try to get papers on startup)
        setTimeout(() => {
            Promise.resolve(this.syncDailyPapers()).catch(err =>
                log.error('ReminderService.syncDailyPapers[initial] unhandled', { message: err?.message, stack: err?.stack }));
        }, 10000);

        // Run initial cleanup in background
        setTimeout(() => {
            try {
                dataCleanupService.runInitialCleanup();
            } catch (error) {
                log.error('Error during initial cleanup:', error);
            }
        }, 5000);

        log.info(`Reminder Service started (check interval: ${this.checkInterval}ms, sync interval: ${this.emailSyncInterval}ms)`);
    }

    /**
     * Stop the reminder service
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        // Each timer is now a {id, started} wrapper from jittered(): id is a
        // setTimeout handle until startDelay fires, then a setInterval handle.
        // Clear the right one based on which phase we're in.
        const clearJittered = (w) => {
            if (!w) return;
            if (w.started) clearInterval(w.id);
            else clearTimeout(w.id);
        };
        clearJittered(this.checkTimer); this.checkTimer = null;
        clearJittered(this.syncTimer); this.syncTimer = null;
        clearJittered(this.lightCleanupTimer); this.lightCleanupTimer = null;
        clearJittered(this.fullCleanupTimer); this.fullCleanupTimer = null;

        this.cronJobs.forEach(job => job.stop());
        this.cronJobs = [];

        log.info('Reminder Service stopped');
    }

    /**
     * Get service status
     * @returns {Object} Status info
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            emailSyncInterval: this.emailSyncInterval,
            sync: { ...this.syncStats },
            degraded: this.syncStats.consecutiveFailures >= 3,
        };
    }
}

// Create singleton instance
const reminderService = new ReminderService();

module.exports = reminderService;
