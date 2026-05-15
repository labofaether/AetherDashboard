const { test } = require('node:test');
const assert = require('node:assert/strict');

// We instantiate fresh stores per test rather than reuse the singleton, since
// the public consumer is the Express route — but the class is what carries the
// behavior we want to lock in.
const path = require('node:path');
const OauthStateStore = require(path.join('..', '..', 'services', 'OauthStateStore.js')).constructor;

test('consume returns the stored type and removes the entry', () => {
    const store = new OauthStateStore(60_000);
    store.set('s1', 'outlook');
    const r = store.consume('s1');
    assert.deepEqual(r, { type: 'outlook' });
    assert.equal(store.size(), 0);
});

test('consume returns null for an unknown key', () => {
    const store = new OauthStateStore(60_000);
    assert.equal(store.consume('missing'), null);
});

test('consume returns expired:true and still deletes the entry', () => {
    const store = new OauthStateStore(1); // 1ms TTL — already expired by the time consume runs
    store.set('s1', 'outlook');
    // Force-age the entry past the TTL.
    store.states.get('s1').createdAt = Date.now() - 5;
    const r = store.consume('s1');
    assert.equal(r.expired, true);
    assert.equal(store.size(), 0);
});

test('consume cannot succeed twice for the same key (replay defence)', () => {
    const store = new OauthStateStore(60_000);
    store.set('s1', 'outlook');
    const first = store.consume('s1');
    const second = store.consume('s1');
    assert.deepEqual(first, { type: 'outlook' });
    assert.equal(second, null);
});

test('cleanup drops only entries past the TTL', () => {
    const store = new OauthStateStore(1000);
    store.set('fresh', 'outlook');
    store.set('stale', 'outlook');
    store.states.get('stale').createdAt = Date.now() - 5000;
    const removed = store.cleanup();
    assert.equal(removed, 1);
    assert.equal(store.size(), 1);
    assert.ok(store.get('fresh'));
});
