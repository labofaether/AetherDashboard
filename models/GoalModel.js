const { getDb } = require('../db');

function getAllGoals() {
    const db = getDb();
    return db.prepare('SELECT * FROM goals ORDER BY completed ASC, targetDate ASC').all();
}

function getGoalById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM goals WHERE id = ?').get(id) || null;
}

function createGoal(title, targetDate, targetCount, category) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        'INSERT INTO goals (title, targetDate, targetCount, currentCount, category, completed, createdAt) VALUES (?, ?, ?, 0, ?, 0, ?)'
    ).run(title, targetDate || null, targetCount || 1, category || 'general', now);
    return result.lastInsertRowid;
}

function updateGoal(id, { title, targetDate, targetCount, currentCount, category, completed }) {
    const db = getDb();
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
    if (!goal) return false;

    const sets = [];
    const values = [];
    if (title !== undefined) { sets.push('title = ?'); values.push(title); }
    if (targetDate !== undefined) { sets.push('targetDate = ?'); values.push(targetDate); }
    if (targetCount !== undefined) { sets.push('targetCount = ?'); values.push(targetCount); }
    if (currentCount !== undefined) { sets.push('currentCount = ?'); values.push(currentCount); }
    if (category !== undefined) { sets.push('category = ?'); values.push(category); }
    if (completed !== undefined) { sets.push('completed = ?'); values.push(completed ? 1 : 0); }
    if (sets.length === 0) return false;

    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return true;
}

function incrementGoal(id) {
    const db = getDb();
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
    if (!goal) return false;

    const newCount = goal.currentCount + 1;
    const completed = newCount >= goal.targetCount ? 1 : 0;
    const now = new Date().toISOString();

    db.prepare('UPDATE goals SET currentCount = ?, completed = ?, updatedAt = ? WHERE id = ?')
        .run(newCount, completed, now, id);
    return true;
}

function deleteGoal(id) {
    const db = getDb();
    return db.prepare('DELETE FROM goals WHERE id = ?').run(id).changes > 0;
}

module.exports = { getAllGoals, getGoalById, createGoal, updateGoal, incrementGoal, deleteGoal };
