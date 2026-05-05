require('./helpers/setup');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { resetDb } = require('./helpers/setup');
const { getDb } = require('../db');

function createApp() {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/llm-usage', require('../routes/llmUsage'));
    return app;
}

beforeEach(() => resetDb());

test('GET /llm-usage/summary returns expected shape', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO llm_usage (provider, model, endpoint, method, success, tokensUsed, timestamp)
                VALUES ('p', 'm1', '/messages', 'POST', 1, 100, ?)`).run(new Date().toISOString());

    const app = createApp();
    const srv = await new Promise((res) => {
        const s = app.listen(0, () => res(s));
    });
    const port = srv.address().port;

    const data = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: '/llm-usage/summary' }, (r) => {
            let body = '';
            r.on('data', d => body += d);
            r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(body) }));
        }).on('error', reject);
    });
    srv.close();

    assert.equal(data.status, 200);
    assert.ok(data.body.today);
    assert.equal(typeof data.body.today.calls, 'number');
    assert.equal(typeof data.body.today.tokens, 'number');
    assert.ok(Array.isArray(data.body.last7d));
    assert.equal(data.body.last7d.length, 7);
    assert.ok(Array.isArray(data.body.byModel));
});
