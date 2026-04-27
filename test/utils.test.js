require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { safeJsonParse } = require('../utils/safeJson');
const { todayLocal, localDateNDaysAgo, formatLocal } = require('../utils/dateRange');
const { validateEnv } = require('../utils/envValidator');

test('safeJsonParse returns parsed object on valid JSON', () => {
    assert.deepEqual(safeJsonParse('{"a":1}', null), { a: 1 });
    assert.deepEqual(safeJsonParse('[1,2,3]', null), [1, 2, 3]);
});

test('safeJsonParse returns fallback on invalid JSON', () => {
    assert.equal(safeJsonParse('not json', 'fallback'), 'fallback');
    assert.equal(safeJsonParse('{', null), null);
});

test('safeJsonParse returns fallback on null/undefined/empty', () => {
    assert.equal(safeJsonParse(null, 'x'), 'x');
    assert.equal(safeJsonParse(undefined, 'x'), 'x');
    assert.equal(safeJsonParse('', 'x'), 'x');
});

test('formatLocal returns YYYY-MM-DD in local timezone', () => {
    const d = new Date(2026, 0, 5); // local Jan 5 2026
    assert.equal(formatLocal(d), '2026-01-05');
});

test('todayLocal matches Date.now in local time', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    assert.equal(todayLocal(), expected);
});

test('localDateNDaysAgo subtracts days correctly', () => {
    const today = new Date();
    const expected = new Date(today);
    expected.setDate(today.getDate() - 7);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    assert.equal(localDateNDaysAgo(7), expectedStr);
});

test('validateEnv reports fatal for malformed PORT', () => {
    const r = validateEnv({ PORT: 'abc' });
    assert.ok(r.fatal.some(f => f.includes('PORT')));
});

test('validateEnv reports fatal for short ENCRYPTION_KEY', () => {
    const r = validateEnv({ ENCRYPTION_KEY: 'short' });
    assert.ok(r.fatal.some(f => f.includes('ENCRYPTION_KEY')));
});

test('validateEnv reports fatal for invalid LOG_LEVEL', () => {
    const r = validateEnv({ LOG_LEVEL: 'verbose' });
    assert.ok(r.fatal.some(f => f.includes('LOG_LEVEL')));
});

test('validateEnv reports fatal for invalid AZURE_REDIRECT_URI', () => {
    const r = validateEnv({
        AZURE_TENANT_ID: 'a', AZURE_CLIENT_ID: 'b',
        AZURE_CLIENT_SECRET: 'c', AZURE_REDIRECT_URI: 'not a url',
    });
    assert.ok(r.fatal.some(f => f.includes('AZURE_REDIRECT_URI')));
});

test('validateEnv warns for partial OAuth config', () => {
    const r = validateEnv({ AZURE_CLIENT_ID: 'real-id', AZURE_TENANT_ID: 'real-tenant' });
    assert.equal(r.fatal.length, 0);
    assert.ok(r.warn.some(w => w.includes('partially configured')));
    assert.equal(r.features.outlookOAuth, false);
});

test('validateEnv passes when fully configured', () => {
    const r = validateEnv({
        PORT: '3000',
        ENCRYPTION_KEY: 'a'.repeat(32),
        AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c',
        AZURE_CLIENT_SECRET: 's',
        AZURE_REDIRECT_URI: 'http://localhost:3000/cb',
        ANTHROPIC_API_KEY: 'sk-real',
    });
    assert.equal(r.fatal.length, 0);
    assert.equal(r.features.outlookOAuth, true);
    assert.equal(r.features.llm, true);
});
