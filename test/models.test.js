// Verifies cascade-delete invariants from the H10 fix: deleting a task must also
// remove its subtasks and unlink any emails (preserving the email row).
require('./helpers/setup');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { resetDb } = require('./helpers/setup');
const { getDb } = require('../db');
const TaskModel = require('../models/TaskModel');
const EmailModel = require('../models/EmailModel');
const ActivityLogModel = require('../models/ActivityLogModel');

beforeEach(() => resetDb());

test('deleteTask cascades to subtasks', () => {
    const taskId = TaskModel.createTask('parent', '', 'medium', null, 'todocontainer');
    TaskModel.createSubtask(taskId, 'child 1');
    TaskModel.createSubtask(taskId, 'child 2');

    const db = getDb();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subtasks WHERE taskId = ?').get(taskId).n, 2);

    TaskModel.deleteTask(taskId);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subtasks WHERE taskId = ?').get(taskId).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE id = ?').get(taskId).n, 0);
});

test('deleteTask unlinks emails (preserves email row)', () => {
    const db = getDb();
    const taskId = TaskModel.createTask('linked task', '', 'medium', null, 'todocontainer');
    db.prepare(`
        INSERT INTO emails (providerId, providerType, subject, taskId, convertedToTask, createdAt)
        VALUES ('p1', 'outlook', 'subject 1', ?, 1, datetime('now'))
    `).run(taskId);

    TaskModel.deleteTask(taskId);

    const email = db.prepare('SELECT * FROM emails WHERE providerId = ?').get('p1');
    assert.ok(email, 'email row must survive task deletion');
    assert.equal(email.taskId, null, 'email.taskId must be unlinked');
    assert.equal(email.convertedToTask, 0, 'convertedToTask flag must reset');
});

test('deleteEmail cascades to email_filters', () => {
    const db = getDb();
    const insertEmail = db.prepare(`
        INSERT INTO emails (providerId, providerType, subject, createdAt)
        VALUES ('p2', 'outlook', 's', datetime('now'))
    `);
    const r = insertEmail.run();
    const emailId = r.lastInsertRowid;
    db.prepare('INSERT INTO email_filters (emailId, important, reason, confidence, filteredAt) VALUES (?, 1, ?, 0.9, datetime(\'now\'))').run(emailId, 'reason');

    EmailModel.deleteEmail(emailId);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_filters WHERE emailId = ?').get(emailId).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM emails WHERE id = ?').get(emailId).n, 0);
});

test('countEmails matches getAllEmails length without pagination', () => {
    const db = getDb();
    const ins = db.prepare(`
        INSERT INTO emails (providerId, providerType, subject, isRead, createdAt)
        VALUES (?, 'outlook', ?, 0, datetime('now'))
    `);
    for (let i = 0; i < 7; i++) ins.run('p' + i, 'subject ' + i);

    const all = EmailModel.getAllEmails();
    const count = EmailModel.countEmails();
    assert.equal(all.length, 7);
    assert.equal(count, 7);
});

test('getAllEmails honors limit/offset', () => {
    const db = getDb();
    const ins = db.prepare(`
        INSERT INTO emails (providerId, providerType, subject, receivedAt, createdAt)
        VALUES (?, 'outlook', ?, ?, datetime('now'))
    `);
    for (let i = 0; i < 10; i++) ins.run('p' + i, 's' + i, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`);

    const page1 = EmailModel.getAllEmails({}, { limit: 3, offset: 0 });
    const page2 = EmailModel.getAllEmails({}, { limit: 3, offset: 3 });
    assert.equal(page1.length, 3);
    assert.equal(page2.length, 3);
    assert.notEqual(page1[0].providerId, page2[0].providerId);
});

test('countEmails respects providerType filter', () => {
    const db = getDb();
    const ins = db.prepare(`
        INSERT INTO emails (providerId, providerType, subject, createdAt)
        VALUES (?, ?, ?, datetime('now'))
    `);
    ins.run('p1', 'outlook', 's1');
    ins.run('p2', 'outlook', 's2');
    ins.run('p3', 'gmail', 's3');

    assert.equal(EmailModel.countEmails(), 3);
    assert.equal(EmailModel.countEmails({ providerType: 'outlook' }), 2);
    assert.equal(EmailModel.countEmails({ providerType: 'gmail' }), 1);
});

test('activity log prunes to ACTIVITY_LOG_MAX_ROWS', () => {
    const { ACTIVITY_LOG_MAX_ROWS } = ActivityLogModel;
    for (let i = 0; i < ACTIVITY_LOG_MAX_ROWS + 50; i++) {
        ActivityLogModel.addActivity('test_action', i, 'title-' + i);
    }
    const count = ActivityLogModel.getActivityCount();
    assert.equal(count, ACTIVITY_LOG_MAX_ROWS);
});
