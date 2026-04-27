const { getDb } = require('../db');

function getAllNotes() {
    const db = getDb();
    return db.prepare('SELECT * FROM notes ORDER BY sortOrder ASC, id DESC').all();
}

function createNote(content, color) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO notes (content, color, sortOrder, createdAt) VALUES (?, ?, 0, ?)'
    ).run(content, color || '#fef3c7', now);
    return result.lastInsertRowid;
}

function updateNote(id, { content, color, sortOrder }) {
    const db = getDb();
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    if (!note) return false;

    const sets = [];
    const values = [];
    if (content !== undefined) { sets.push('content = ?'); values.push(content); }
    if (color !== undefined) { sets.push('color = ?'); values.push(color); }
    if (sortOrder !== undefined) { sets.push('sortOrder = ?'); values.push(sortOrder); }
    if (sets.length === 0) return false;

    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return true;
}

function deleteNote(id) {
    const db = getDb();
    return db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
}

module.exports = { getAllNotes, createNote, updateNote, deleteNote };
