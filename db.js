const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'board.json');

function readDB() {
    if (!fs.existsSync(dbPath)) {
        return { tasks: [], activityLog: [], projects: [] };
    }
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        const db = JSON.parse(data);
        if (!db.activityLog) db.activityLog = [];
        if (!db.projects) db.projects = [];
        return db;
    } catch (e) {
        return { tasks: [], activityLog: [], projects: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
