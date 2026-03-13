const { readDB, writeDB } = require('../db');

function getAllProjects() {
    const db = readDB();
    return db.projects.sort((a, b) => a.id - b.id);
}

function getProjectById(projectId) {
    const db = readDB();
    return db.projects.find(p => p.id === projectId);
}

function createProject(name, color, description = '') {
    const db = readDB();
    const newId = db.projects.length > 0 ? Math.max(...db.projects.map(p => p.id)) + 1 : 1;
    const now = new Date().toISOString();
    const project = {
        id: newId,
        name,
        color: color || '#64ffda',
        description,
        createdAt: now,
        updatedAt: now
    };
    db.projects.push(project);
    writeDB(db);
    return newId;
}

function updateProject(projectId, name, color, description) {
    const db = readDB();
    const project = db.projects.find(p => p.id === projectId);
    if (project) {
        if (name !== undefined) project.name = name;
        if (color !== undefined) project.color = color;
        if (description !== undefined) project.description = description;
        project.updatedAt = new Date().toISOString();
        writeDB(db);
        return true;
    }
    return false;
}

function deleteProject(projectId) {
    const db = readDB();
    const initialLength = db.projects.length;
    db.projects = db.projects.filter(p => p.id !== projectId);
    db.tasks = db.tasks.filter(t => t.projectId !== projectId);
    if (db.projects.length !== initialLength) {
        writeDB(db);
        return true;
    }
    return false;
}

module.exports = {
    getAllProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
};
