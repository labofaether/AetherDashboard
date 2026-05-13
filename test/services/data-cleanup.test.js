require('../helpers/setup');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { resetDb } = require('../helpers/setup');
const { getDb } = require('../../db');
const DataCleanupService = require('../../services/DataCleanupService');

beforeEach(() => resetDb());

function isoDaysAgo(d) {
    return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

test('cleanupOldLlmUsage drops rows older than retention window', () => {
    const db = getDb();
    const ins = db.prepare(
        'INSERT INTO llm_usage (provider, model, endpoint, method, success, tokensUsed, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    // 3 fresh, 5 ancient
    for (let i = 0; i < 3; i++) ins.run('p', 'm', '/x', 'POST', 1, 100, isoDaysAgo(1));
    for (let i = 0; i < 5; i++) ins.run('p', 'm', '/x', 'POST', 1, 100, isoDaysAgo(60));

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM llm_usage').get().n, 8);
    const removed = DataCleanupService.cleanupOldLlmUsage();
    assert.equal(removed, 5);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM llm_usage').get().n, 3);
});

test('cleanupOldApiUsage drops rows older than retention window', () => {
    const db = getDb();
    const ins = db.prepare(
        'INSERT INTO api_usage (provider, endpoint, method, success, timestamp) VALUES (?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < 2; i++) ins.run('p', '/x', 'POST', 1, isoDaysAgo(1));
    for (let i = 0; i < 4; i++) ins.run('p', '/x', 'POST', 1, isoDaysAgo(45));

    const removed = DataCleanupService.cleanupOldApiUsage();
    assert.equal(removed, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM api_usage').get().n, 2);
});

test('cleanupOldNewsItems drops rows older than retention window', () => {
    const db = getDb();
    const ins = db.prepare(
        'INSERT INTO news_items (id, sourceId, source, title, createdAt) VALUES (?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < 3; i++) ins.run('n' + i, 'sid' + i, 'hn', 't', isoDaysAgo(2));
    for (let i = 3; i < 10; i++) ins.run('n' + i, 'sid' + i, 'hn', 't', isoDaysAgo(90));

    const removed = DataCleanupService.cleanupOldNewsItems();
    assert.equal(removed, 7);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM news_items').get().n, 3);
});

test('runFullCleanup invokes all sweepers without throwing', () => {
    // Empty DB — should be a no-op, just verify no exception
    const removed = DataCleanupService.runFullCleanup();
    assert.equal(typeof removed, 'number');
    assert.ok(removed >= 0);
});
