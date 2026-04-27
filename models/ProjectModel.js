const { getDb } = require('../db');

function getAllProjects() {
    const db = getDb();
    return db.prepare('SELECT * FROM projects ORDER BY id ASC').all();
}

function getProjectById(projectId) {
    const db = getDb();
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) || null;
}

function createProject(name, color, description = '') {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO projects (name, color, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
    ).run(name, color || '#64ffda', description, now, now);
    return result.lastInsertRowid;
}

function updateProject(projectId, name, color, description) {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return false;

    const sets = [];
    const values = [];
    if (name !== undefined) { sets.push('name = ?'); values.push(name); }
    if (color !== undefined) { sets.push('color = ?'); values.push(color); }
    if (description !== undefined) { sets.push('description = ?'); values.push(description); }
    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(projectId);

    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return true;
}

function deleteProject(projectId) {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return false;

    const del = db.transaction(() => {
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        db.prepare('UPDATE tasks SET projectId = NULL, updatedAt = ? WHERE projectId = ?').run(new Date().toISOString(), projectId);
    });
    del();
    return true;
}

module.exports = {
    getAllProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
};
