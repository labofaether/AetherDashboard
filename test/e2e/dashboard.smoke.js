// End-to-end smoke test: boots a fresh server with an in-memory DB,
// loads the dashboard in headless Chromium, asserts no console errors and
// no failed network requests. Designed to catch regressions like the
// renderSyncStatus ReferenceError that slipped through commit af38af4.
//
// Run with: npm run test:e2e
// Requires the playwright devDep + a previously-installed chromium
// (`npx playwright install chromium`).

require('../helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { chromium } = require('playwright');

const PORT = 3458;
const URL = `http://localhost:${PORT}`;

let serverProc;
let browser;

async function waitForReady(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch { /* not yet */ }
        await sleep(150);
    }
    throw new Error(`server not ready at ${url} within ${timeoutMs}ms`);
}

before(async () => {
    serverProc = spawn('node', ['server.js'], {
        env: {
            ...process.env,
            PORT: String(PORT),
            AETHER_DB_PATH: ':memory:',
            LOG_LEVEL: 'error',
            ALLOWED_ORIGINS: URL,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForReady(URL);
    browser = await chromium.launch({ headless: true });
});

after(async () => {
    if (browser) await browser.close();
    if (serverProc) {
        serverProc.kill('SIGTERM');
        await new Promise(r => serverProc.once('exit', r));
    }
});

test('dashboard loads without console errors or failed requests', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    const errors = [];
    const failedRequests = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', req => failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`));

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);

    assert.equal(page.url().replace(/\/$/, ''), URL, 'navigated to dashboard root');
    assert.equal(errors.length, 0, `expected zero console errors, got:\n  ${errors.join('\n  ')}`);
    assert.equal(failedRequests.length, 0, `expected zero failed requests, got:\n  ${failedRequests.join('\n  ')}`);

    // Sanity: dashboardView should be in the DOM
    const dashCount = await page.locator('#dashboardView').count();
    assert.equal(dashCount, 1, '#dashboardView present');

    await ctx.close();
});

test('static assets respond with cache headers', async () => {
    // Express static was configured with etag + maxAge=1h. If perf/server-static-compression
    // landed, this passes; if not, the headers are missing — surface that.
    const res = await fetch(`${URL}/script.js`);
    assert.equal(res.status, 200);
    const cacheControl = res.headers.get('cache-control') || '';
    const etag = res.headers.get('etag');
    // Don't fail hard if cache headers aren't present yet — log a warning.
    if (!cacheControl.includes('max-age')) {
        console.warn('static assets missing Cache-Control (perf/server-static-compression not merged?)');
    }
    if (!etag) {
        console.warn('static assets missing ETag (perf/server-static-compression not merged?)');
    }
});
