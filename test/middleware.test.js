require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validateIdParam } = require('../middleware/validateIdParam');

function runMiddleware(req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; resolve({ res: this, calledNext: false }); },
        };
        const next = () => resolve({ res, calledNext: true });
        validateIdParam()(req, res, next);
    });
}

test('validateIdParam accepts positive integer', async () => {
    const req = { params: { id: '5' } };
    const r = await runMiddleware(req);
    assert.equal(r.calledNext, true);
    assert.equal(req.params.id, 5);
    assert.equal(typeof req.params.id, 'number');
});

test('validateIdParam rejects non-integer string', async () => {
    const r = await runMiddleware({ params: { id: 'abc' } });
    assert.equal(r.calledNext, false);
    assert.equal(r.res.statusCode, 400);
});

test('validateIdParam rejects zero', async () => {
    const r = await runMiddleware({ params: { id: '0' } });
    assert.equal(r.calledNext, false);
    assert.equal(r.res.statusCode, 400);
});

test('validateIdParam rejects negative', async () => {
    const r = await runMiddleware({ params: { id: '-1' } });
    assert.equal(r.calledNext, false);
    assert.equal(r.res.statusCode, 400);
});

test('validateIdParam rejects float', async () => {
    const r = await runMiddleware({ params: { id: '1.5' } });
    assert.equal(r.calledNext, false);
    assert.equal(r.res.statusCode, 400);
});

test('validateIdParam rejects SQL injection attempt', async () => {
    const r = await runMiddleware({ params: { id: "1; DROP TABLE tasks" } });
    assert.equal(r.calledNext, false);
    assert.equal(r.res.statusCode, 400);
});

test('validateIdParam supports custom param name', async () => {
    const req = { params: { subtaskId: '7' } };
    const res = {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; },
    };
    let calledNext = false;
    validateIdParam('subtaskId')(req, res, () => { calledNext = true; });
    assert.equal(calledNext, true);
    assert.equal(req.params.subtaskId, 7);
});
