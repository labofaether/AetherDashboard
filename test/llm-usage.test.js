require('./helpers/setup');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { resetDb } = require('./helpers/setup');
const { getDb } = require('../db');
const LlmUsageModel = require('../models/LlmUsageModel');
const { todayLocal } = require('../utils/dateRange');

beforeEach(() => resetDb());

function insertCall({ model = 'm1', success = 1, tokens = 100, ts = null }) {
    const db = getDb();
    db.prepare(`
        INSERT INTO llm_usage (provider, model, endpoint, method, success, tokensUsed, timestamp)
        VALUES ('p', ?, '/messages', 'POST', ?, ?, ?)
    `).run(model, success, tokens, ts || new Date().toISOString());
}

test('getTodaySummary counts today\'s calls and tokens', () => {
    insertCall({ tokens: 100 });
    insertCall({ tokens: 250 });
    insertCall({ tokens: 50, ts: '2026-01-01T00:00:00Z' }); // old, not today

    const r = LlmUsageModel.getTodaySummary();
    assert.equal(r.calls, 2);
    assert.equal(r.tokens, 350);
});

test('getTodaySummary returns zero when no rows', () => {
    const r = LlmUsageModel.getTodaySummary();
    assert.equal(r.calls, 0);
    assert.equal(r.tokens, 0);
});

test('getSuccessRate returns success ratio', () => {
    insertCall({ success: 1 });
    insertCall({ success: 1 });
    insertCall({ success: 0 });
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const r = LlmUsageModel.getSuccessRate(since);
    assert.ok(Math.abs(r - 2/3) < 0.001);
});

test('getSuccessRate returns null when no rows', () => {
    const since = new Date().toISOString();
    const r = LlmUsageModel.getSuccessRate(since);
    assert.equal(r, null);
});

test('getLast7Days returns array of 7 day-buckets', () => {
    insertCall({});
    insertCall({});
    const r = LlmUsageModel.getLast7Days();
    assert.equal(r.length, 7);
    assert.ok(r.every(d => typeof d.date === 'string' && typeof d.calls === 'number'));
    // Today's bucket should have 2
    const today = todayLocal();
    const todayBucket = r.find(d => d.date === today);
    assert.equal(todayBucket.calls, 2);
});

test('getLast7Days returns zero-filled buckets when empty', () => {
    const r = LlmUsageModel.getLast7Days();
    assert.equal(r.length, 7);
    assert.ok(r.every(d => d.calls === 0));
    // last entry is today, first is 6 days ago
    assert.equal(r[6].date, todayLocal());
});

test('getByModel groups by model', () => {
    insertCall({ model: 'A', tokens: 100 });
    insertCall({ model: 'A', tokens: 200 });
    insertCall({ model: 'B', tokens: 50 });

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const r = LlmUsageModel.getByModel(since);
    assert.equal(r.length, 2);
    const a = r.find(x => x.model === 'A');
    assert.equal(a.calls, 2);
    assert.equal(a.tokens, 300);
});
