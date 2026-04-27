const { getDb } = require('../db');

function getAllTemplates() {
    const db = getDb();
    return db.prepare('SELECT * FROM task_templates ORDER BY id DESC').all();
}

function getTemplateById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) || null;
}

function createTemplate(name, subtasks, defaultPriority) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO task_templates (name, subtasks, defaultPriority, createdAt) VALUES (?, ?, ?, ?)'
    ).run(name, JSON.stringify(subtasks || []), defaultPriority || 'medium', now);
    return result.lastInsertRowid;
}

function deleteTemplate(id) {
    const db = getDb();
    return db.prepare('DELETE FROM task_templates WHERE id = ?').run(id).changes > 0;
}

module.exports = { getAllTemplates, getTemplateById, createTemplate, deleteTemplate };
