/**
 * Data Retention Configuration
 * Defines retention policies for different data types
 */

module.exports = {
    // Emails: Keep recent 500 emails or 30 days, whichever is fewer
    emails: {
        maxCount: 500,
        maxAgeDays: 30,
        // Keep emails that have been converted to tasks longer
        keepConvertedToTask: true,
        keepConvertedMaxAgeDays: 90
    },

    // Events: Keep all future events + past 14 days
    events: {
        keepFuture: true,
        keepPastDays: 14
    },

    // Reminders: Keep triggered reminders for 7 days
    reminders: {
        keepTriggeredDays: 7
    },

    // Email Filters: Keep recent 100 filter results
    emailFilters: {
        maxCount: 100
    },

    // Completed Tasks: Optional cleanup (disabled by default)
    completedTasks: {
        enabled: false,
        keepDays: 30
    },

    // LLM call log: keep ~30 days of usage history (rolling cap also lives in
    // models/LlmUsageModel.js LLM_USAGE_MAX_ROWS = 1000; the retention window
    // applies on top, so whichever bound hits first wins).
    llmUsage: {
        keepDays: 30
    },

    // External API call log (Outlook, HN, RSS): same shape as llmUsage.
    apiUsage: {
        keepDays: 30
    },

    // News items: cron adds ~30/day; 30 days = ~900 rows max.
    news: {
        keepDays: 30
    },

    // Cleanup schedule
    schedule: {
        // Light cleanup runs every hour (in ms)
        lightCleanupInterval: 60 * 60 * 1000,
        // Full cleanup runs once a day (in ms)
        fullCleanupInterval: 24 * 60 * 60 * 1000
    }
};
