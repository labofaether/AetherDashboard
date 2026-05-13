require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { heuristicFilter } = require('../../services/EmailFilterService');

test('heuristicFilter flags provider-high importance', () => {
    const r = heuristicFilter({ importance: 'high', subject: 'hi', bodyPreview: '' });
    assert.equal(r.important, true);
    assert.equal(r.reason, 'provider_flagged_high');
});

test('heuristicFilter flags important keywords (case-insensitive)', () => {
    const r = heuristicFilter({ subject: 'URGENT: please review', bodyPreview: '', from: 'a@b.com' });
    assert.equal(r.important, true);
    assert.equal(r.reason, 'keyword_match');
});

test('heuristicFilter flags spam keywords', () => {
    const r = heuristicFilter({ subject: 'Promotion!', bodyPreview: 'unsubscribe', from: 'no-reply@x.com' });
    assert.equal(r.important, false);
    assert.equal(r.reason, 'spam_keyword');
});

test('heuristicFilter returns needs_llm for ambiguous mail', () => {
    const r = heuristicFilter({ subject: 'Status update', bodyPreview: 'the project moves along', from: 'colleague@x.com' });
    assert.equal(r.important, null);
    assert.equal(r.reason, 'needs_llm');
});

test('heuristicFilter handles regex-special characters in input safely', () => {
    // Inputs with regex metacharacters should not throw or false-match.
    const r = heuristicFilter({ subject: 'a.b.c.* (group)', bodyPreview: '$$$', from: '' });
    assert.equal(r.important, null);
});
