const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'board.json');

function readDB() {
    if (!fs.existsSync(dbPath)) {
        return { tasks: [], activityLog: [], projects: [], emails: [], emailSyncState: [], reminders: [], events: [], apiUsage: [], emailFilters: [], llmUsage: [] };
    }
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        const db = JSON.parse(data);
        if (!db.activityLog) db.activityLog = [];
        if (!db.projects) db.projects = [];
        if (!db.emails) db.emails = [];
        if (!db.emailSyncState) db.emailSyncState = [];
        if (!db.reminders) db.reminders = [];
        if (!db.events) db.events = [];
        if (!db.apiUsage) db.apiUsage = [];
        if (!db.emailFilters) db.emailFilters = [];
        if (!db.llmUsage) db.llmUsage = [];
        return db;
    } catch (e) {
        return { tasks: [], activityLog: [], projects: [], emails: [], emailSyncState: [], reminders: [], events: [], apiUsage: [], emailFilters: [], llmUsage: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
