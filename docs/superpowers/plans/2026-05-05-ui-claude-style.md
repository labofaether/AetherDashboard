# Aether Dashboard — Claude-style UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the dashboard view + global shell (top bar / sidebar / command palette) to a Claude-style warm-minimalism aesthetic, replace the LLM Status binary indicator with a quantitative AI Usage card, drop dark mode entirely, and reset information hierarchy so Tech News is the visual hero.

**Architecture:** All visual changes flow through new CSS custom properties. Old token names (`--bg-primary`, `--accent`, etc.) stay in place but get re-valued — the cascade does most of the migration automatically. New tokens (`--surface`, `--border`, `--space-N`, `--radius-N`, `--shadow-N`) are added alongside and used in new component CSS. Only one new backend endpoint (`/llm-usage/summary`) and three new model functions. No new frontend dependencies.

**Tech Stack:** Vanilla CSS / HTML / JS (no framework), Express + better-sqlite3 backend, Google Fonts CDN (Source Serif Pro / Inter / JetBrains Mono), node:test for backend tests.

**Spec:** [`docs/superpowers/specs/2026-05-05-ui-claude-style-design.md`](../specs/2026-05-05-ui-claude-style-design.md)

---

## Conventions

- **CSS workflow**: After every CSS change, refresh the dashboard in the browser (the user does this manually since I have no browser access). The user reports any visual issues.
- **Test workflow**: After every change that touches `.js` files (frontend or backend), run `npm test` — must remain at 26+/26+ passing. After every CSS change, run `node --check public/script.js` to make sure no JS got corrupted.
- **Commit style**: One commit per task. Use `feat:`, `style:`, or `refactor:` prefix. Body is optional but include it for non-obvious changes.
- **Server**: Always restart server after backend changes via `pkill -f "node server.js"; sleep 1; node server.js > /tmp/aether.log 2>&1 &` — wait for `"Aether Dashboard started"` in log before testing endpoints.
- **Snapshot test count**: Plan starts at **26 tests passing**. AI Usage backend tasks add new tests; final count target is **31 tests passing**.

---

## Phase 1 — Foundation: tokens & fonts

### Task 1: Load Google Fonts

**Files:**
- Modify: `public/index.html` (head section, before existing `<link rel="stylesheet" href="style.css">`)

- [ ] **Step 1: Add font preconnect + link tags**

In `public/index.html`, find the `<head>` block and add the following lines just before the existing stylesheet link:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Verify HTML still loads**

Run:
```bash
curl -s http://localhost:3000/ | grep -c 'fonts.googleapis.com'
```
Expected: `1` (one match)

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "style: load Source Serif Pro / Inter / JetBrains Mono fonts"
```

---

### Task 2: Define new design tokens in :root

**Files:**
- Modify: `public/style.css` (`:root` block at top)

- [ ] **Step 1: Replace :root color values + add new tokens**

In `public/style.css`, find the `:root { ... }` block (lines ~10-30) and replace with the warm palette below. Keep the variable names that already exist (so cascading just works); change values + add the new ones (`--surface`, `--border`, `--space-N`, `--radius-N`, `--shadow-N`, `--transition`).

```css
:root {
    /* Warm minimalism — claude.ai-inspired palette */
    --bg: #faf9f5;
    --bg-primary: var(--bg);            /* legacy alias — components migrate over time */
    --bg-secondary: #f5f3ed;            /* slightly cooler than bg, for nested fills */
    --bg-tertiary: #ebe6dc;             /* same as --border, used by some components */
    --bg-hover: #f0eee5;
    --surface: #ffffff;                 /* card surface */
    --border: #ebe6dc;                  /* near-invisible card border */

    --text-primary: #1f1c18;
    --text-secondary: #6b6358;
    --text-tertiary: #9c9486;

    --accent: #c97c40;                  /* warm copper */
    --accent-hover: #b56a30;
    --accent-light: rgba(201, 124, 64, 0.10);

    --danger: #b85450;
    --success: #6b8e5c;

    /* Spacing scale */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 24px;
    --space-6: 32px;
    --space-7: 48px;
    --space-8: 64px;

    /* Radius scale */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 10px;
    --radius-xl: 14px;

    /* Shadow scale — paper-like, no glow */
    --shadow-xs: 0 1px 2px rgba(31, 28, 24, 0.04);
    --shadow-sm: 0 4px 12px rgba(31, 28, 24, 0.06);
    --shadow-md: 0 12px 32px rgba(31, 28, 24, 0.10);

    /* Animation */
    --transition: 180ms cubic-bezier(0.4, 0, 0.2, 1);

    /* Typography */
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    --font-serif: 'Source Serif Pro', Georgia, 'Times New Roman', serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', Monaco, Consolas, monospace;
}
```

- [ ] **Step 2: Update body baseline**

Find the existing `body` selector in `public/style.css` and replace its declaration block:

```css
body {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
```

Add right after `body`:

```css
h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-serif);
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
}

code, pre, .mono, [class*="-mono"] {
    font-family: var(--font-mono);
}
```

- [ ] **Step 3: Visual smoke (user)**

Refresh `http://localhost:3000` in the browser. Background should now be warm cream `#faf9f5` instead of pure white; existing accent green should now be copper. Headings should be serif. Report any obvious breakage to me.

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: warm-minimalism color tokens + serif headings"
```

---

## Phase 2 — Drop dark mode

### Task 3: Remove `.dark-mode` CSS branches

**Files:**
- Modify: `public/style.css` (every `.dark-mode` selector)

- [ ] **Step 1: Find every dark-mode selector**

Run:
```bash
grep -nE '\.dark-mode' public/style.css | wc -l
```
Note the count — these all get deleted.

- [ ] **Step 2: Delete `.dark-mode` blocks**

Open `public/style.css`. Delete every CSS ruleset whose selector contains `.dark-mode`. The two main blocks to remove:

1. The `.dark-mode { ... }` token-override block near the top of the file (around line 38-60 currently — re-defines `--bg-primary` etc.)
2. Any per-component `.dark-mode .xxx { ... }` overrides scattered throughout the file.

Use this command to verify no `.dark-mode` selectors remain after edit:
```bash
grep -c '\.dark-mode' public/style.css
```
Expected: `0`

- [ ] **Step 3: Verify other tests still pass**

Run:
```bash
node --check public/script.js && npm test 2>&1 | tail -3
```
Expected: 26+/26+ tests pass; no JS syntax error.

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: drop dark-mode CSS branches"
```

---

### Task 4: Remove theme toggle from HTML + JS

**Files:**
- Modify: `public/index.html` (line 43, the `#themeToggle` button)
- Modify: `public/script.js` (toggleTheme function, init event listener)

- [ ] **Step 1: Remove theme toggle button from HTML**

In `public/index.html`, find and delete the line:
```html
<button class="theme-toggle" id="themeToggle" title="Toggle dark mode">&#9789;</button>
```

- [ ] **Step 2: Remove theme toggle JS**

In `public/script.js`, find:
1. The `toggleTheme` function definition — delete it.
2. The line `document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);` — delete it.
3. Any line that reads/writes `localStorage.getItem('theme')` or `localStorage.setItem('theme', ...)` or `document.body.classList.add('dark-mode')` etc. — delete them.

After edit, verify:
```bash
grep -nE 'toggleTheme|themeToggle|dark-mode' public/script.js
```
Expected: empty output (no matches)

- [ ] **Step 3: Add one-time stale localStorage cleanup**

Find the existing `document.addEventListener('DOMContentLoaded', () => {` block near line 197 in `public/script.js`. Add this as the FIRST line inside the handler:

```javascript
    // One-time cleanup of stale dark-mode preference (theme toggle removed in v2 redesign).
    try { localStorage.removeItem('theme'); } catch {}
```

- [ ] **Step 4: Run tests + check syntax**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/script.js
git commit -m "feat: remove theme toggle (no dark mode)"
```

---

## Phase 3 — Top bar + sync indicator

### Task 5: Restyle top bar

**Files:**
- Modify: `public/index.html` (top bar / header markup, lines ~10-50)
- Modify: `public/style.css` (top bar selectors)

- [ ] **Step 1: Read current top bar HTML to understand structure**

```bash
sed -n '10,60p' public/index.html
```
Note the current classes used (e.g. `.app-header`, `.brand`, `.search-trigger`).

- [ ] **Step 2: Update top bar HTML structure**

Find the existing top bar (between body open and `<div class="app-container">`). Replace with:

```html
<header class="topbar">
    <button class="hamburger" id="hamburgerBtn" title="Toggle sidebar" aria-label="Menu">&#9776;</button>
    <div class="topbar-brand">Aether</div>
    <button class="topbar-search" id="topbarSearch" type="button">
        <span class="topbar-search-icon">⌘K</span>
        <span class="topbar-search-text">Search tasks, emails, news…</span>
    </button>
    <div class="topbar-meta">
        <span class="topbar-time" id="topbarTime"></span>
        <span class="topbar-sync" id="topbarSync" title="Sync status">
            <span class="topbar-sync-dot" data-state="ok"></span>
        </span>
    </div>
</header>
```

(If the current markup uses `id="dashboardMeta"` for the time display, reroute the time-update logic to `#topbarTime` in step 3.)

- [ ] **Step 3: Update time-update logic in script.js**

Find `updateCurrentTime()` in `public/script.js`. Make sure it writes to `#topbarTime`:

```javascript
function updateCurrentTime() {
    const el = document.getElementById('topbarTime');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}
```

- [ ] **Step 4: Add CSS for top bar**

In `public/style.css`, find the existing `.app-header`, `.topbar`, `.brand`, etc. selectors. **Delete** the old rulesets for these. **Add** the following at the appropriate place (look for "/* Header */" or similar comment, otherwise just append at end of relevant section):

```css
.topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 56px;
    padding: 0 var(--space-5);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
}

.topbar-brand {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 18px;
    color: var(--text-primary);
    letter-spacing: -0.01em;
}

.topbar-search {
    flex: 1;
    max-width: 480px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-3);
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    color: var(--text-tertiary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: var(--transition);
}
.topbar-search:hover {
    border-color: var(--accent);
    color: var(--text-secondary);
}
.topbar-search-icon {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
}

.topbar-meta {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-4);
}
.topbar-time {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-tertiary);
}

.topbar-sync {
    display: inline-flex;
    align-items: center;
    cursor: default;
}
.topbar-sync-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 3px rgba(107, 142, 92, 0.15);
    transition: var(--transition);
}
.topbar-sync-dot[data-state="stale"] {
    background: #c08a3e;
    box-shadow: 0 0 0 3px rgba(192, 138, 62, 0.15);
}
.topbar-sync-dot[data-state="error"] {
    background: var(--danger);
    box-shadow: 0 0 0 3px rgba(184, 84, 80, 0.15);
}

.hamburger {
    display: none;          /* hidden on desktop */
    background: none;
    border: 0;
    color: var(--text-primary);
    font-size: 18px;
    cursor: pointer;
    padding: var(--space-2);
}

@media (max-width: 1279px) {
    .hamburger { display: inline-flex; }
}
```

- [ ] **Step 5: Wire command palette open from top bar**

In `public/script.js`, find where the command palette open handler is currently set up (search for `openCommandPalette`). Add an event listener for `#topbarSearch`:

```javascript
document.getElementById('topbarSearch')?.addEventListener('click', openCommandPalette);
```

- [ ] **Step 6: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```
Expected: pass.

User refreshes `http://localhost:3000`. Top bar should show: `[☰ (mobile only)] Aether [⌘K Search ...] [time] [● dot]`. Click the search box → command palette opens.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/script.js public/style.css
git commit -m "feat: redesigned top bar with serif brand + search trigger + sync indicator"
```

---

### Task 6: Wire sync indicator to actual state

**Files:**
- Modify: `public/script.js` (loadSyncStatus / sync polling)

- [ ] **Step 1: Find existing sync-status fetch**

Run:
```bash
grep -nE 'loadSyncStatus|syncStatus|sync-status' public/script.js | head -10
```
Note: existing `loadSyncStatus()` writes to `#syncStatus`. We are removing that DOM node in Task 16; first re-route this function to drive `#topbarSync` instead.

- [ ] **Step 2: Rewrite loadSyncStatus**

Replace the existing `loadSyncStatus` function in `public/script.js` with:

```javascript
async function loadSyncStatus() {
    try {
        const res = await fetch(`${EMAIL_API_BASE}/usage/sync-status`);
        if (!res.ok) {
            setSyncDot('error', 'Sync status unavailable');
            return;
        }
        const data = await res.json();
        const failures = data?.reminder?.sync?.consecutiveFailures || 0;
        const lastSuccess = data?.reminder?.sync?.lastSuccessAt;
        let state = 'ok';
        if (failures >= 3) state = 'error';
        else if (failures > 0) state = 'stale';
        const tooltip = lastSuccess ? `Last sync: ${new Date(lastSuccess).toLocaleString()}` : 'Awaiting first sync';
        setSyncDot(state, tooltip + (failures ? ` · ${failures} consecutive failures` : ''));
    } catch (err) {
        setSyncDot('error', 'Sync status check failed');
    }
}

function setSyncDot(state, tooltip) {
    const wrap = document.getElementById('topbarSync');
    if (!wrap) return;
    const dot = wrap.querySelector('.topbar-sync-dot');
    if (dot) dot.dataset.state = state;
    wrap.title = tooltip || '';
}
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js
```
Expected: no error.

User refreshes page; the sync dot should be green within ~2 seconds. Hovering shows tooltip with last-sync time.

- [ ] **Step 4: Commit**

```bash
git add public/script.js
git commit -m "feat: wire top-bar sync indicator to email sync-status endpoint"
```

---

## Phase 4 — Sidebar

### Task 7: Restyle sidebar to text-only nav

**Files:**
- Read first: `public/index.html` (lines 49-90, the `<aside class="sidebar">` block)
- Modify: `public/index.html` (sidebar markup)
- Modify: `public/style.css` (sidebar selectors)

- [ ] **Step 1: Read current sidebar markup**

```bash
sed -n '49,90p' public/index.html
```
Note the existing structure (probably uses `.module-btn` or `.nav-item` classes with `data-module` attrs).

- [ ] **Step 2: Replace sidebar HTML**

Replace the entire `<aside class="sidebar" id="sidebar"> ... </aside>` block with:

```html
<aside class="sidebar" id="sidebar">
    <nav class="sidebar-nav">
        <div class="sidebar-group">
            <a class="sidebar-item" data-module="dashboard" href="#">Today</a>
            <a class="sidebar-item" data-module="board" href="#">Tasks</a>
            <a class="sidebar-item" data-module="calendar" href="#">Calendar</a>
            <a class="sidebar-item" data-module="email" href="#">Email</a>
        </div>
        <div class="sidebar-group">
            <a class="sidebar-item" data-module="focus" href="#">Focus</a>
            <a class="sidebar-item" data-module="goals" href="#">Goals</a>
            <a class="sidebar-item" data-module="notes" href="#">Notes</a>
        </div>
        <div class="sidebar-group">
            <a class="sidebar-item" data-module="list" href="#">List</a>
            <a class="sidebar-item" data-module="today" href="#">Today (alt)</a>
        </div>
    </nav>
    <div class="sidebar-footer">v1.0</div>
</aside>
```

(If the existing module set uses different `data-module` keys, keep the keys but change the displayed text. Verify by running `grep 'data-module' public/script.js` to see which keys are used.)

- [ ] **Step 3: Add CSS for sidebar**

Delete the old `.sidebar`, `.module-btn`, `.nav-item`, `.sidebar-section`, etc. selector blocks in `public/style.css`. Add:

```css
.sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: var(--space-5) 0;
    height: calc(100vh - 56px);
    position: sticky;
    top: 56px;
    overflow-y: auto;
}

.sidebar-nav { flex: 1; }

.sidebar-group {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
}
.sidebar-group:last-child { border-bottom: 0; }

.sidebar-item {
    display: block;
    padding: var(--space-2) var(--space-5);
    font-family: var(--font-serif);
    font-size: 15px;
    font-weight: 400;
    color: var(--text-secondary);
    text-decoration: none;
    border-left: 2px solid transparent;
    transition: var(--transition);
}
.sidebar-item:hover {
    color: var(--text-primary);
}
.sidebar-item.active {
    color: var(--accent);
    border-left-color: var(--accent);
}

.sidebar-footer {
    padding: var(--space-4) var(--space-5) 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 11px;
}

@media (max-width: 1279px) {
    .sidebar {
        position: fixed;
        left: 0;
        top: 56px;
        bottom: 0;
        transform: translateX(-100%);
        z-index: 40;
        transition: transform var(--transition);
    }
    .sidebar.open { transform: translateX(0); }
}
```

- [ ] **Step 4: Wire active state in JS**

Find `setupModuleButtons` or `switchModule` in `public/script.js`. The existing logic probably toggles a class on `.module-btn`. Update the selector:

```javascript
function setupModuleButtons() {
    document.querySelectorAll('.sidebar-item, .module-btn, .nav-item').forEach(btn => {
        if (btn.dataset.module) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                switchModule(btn.dataset.module);
            });
        }
    });
}
```

In `switchModule`, add the active-state toggle (if not already present):

```javascript
// Inside switchModule(module), at the end:
document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.module === module);
});
```

- [ ] **Step 5: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```
Expected: pass.

User refreshes; sidebar should show plain text nav with sections separated by horizontal rules; current module highlighted with copper text + 2px copper left border.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/script.js public/style.css
git commit -m "feat: text-only sidebar nav with copper active accent"
```

---

## Phase 5 — Component primitives

### Task 8: Restyle buttons

**Files:**
- Modify: `public/style.css` (button selectors — `.add-button`, `.icon-btn-small`, `.task-action-btn`, etc.)

- [ ] **Step 1: Locate existing button styles**

```bash
grep -nE '^\.(add-button|icon-btn-small|task-action-btn|btn-primary|btn-secondary)' public/style.css
```

- [ ] **Step 2: Replace button rulesets**

Find each existing button selector block in `style.css` and replace with the unified system below. Append at end if they don't exist:

```css
/* ================================
   Buttons (unified)
   ================================ */
.btn,
.add-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--accent);
    color: #fff;
    border: 0;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: var(--transition);
}
.btn:hover,
.add-button:hover { background: var(--accent-hover); }
.btn:disabled,
.add-button:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
    background: transparent;
    color: var(--text-primary);
    border: 1px solid #d6cfc1;
}
.btn-secondary:hover { border-color: var(--accent); background: transparent; }

.btn-ghost {
    background: transparent;
    color: var(--accent);
    border: 0;
    padding: var(--space-2) var(--space-3);
}
.btn-ghost:hover { color: var(--accent-hover); text-decoration: underline; text-underline-offset: 2px; }

.btn-danger {
    background: var(--danger);
}
.btn-danger:hover { background: #9f4642; }

.icon-btn-small,
.task-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    color: var(--text-secondary);
    border: 0;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: var(--transition);
}
.icon-btn-small:hover,
.task-action-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
}
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: unified button system (primary copper, secondary, ghost, danger)"
```

---

### Task 9: Restyle inputs and textareas

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: Locate existing input styles**

```bash
grep -nE '^\.(task-input|date-input|priority-select|input|textarea)' public/style.css | head
```

- [ ] **Step 2: Replace input rulesets**

Find the existing input/textarea/select rulesets and replace; append at end if missing:

```css
/* ================================
   Inputs
   ================================ */
.task-input,
.date-input,
.priority-select,
input[type="text"]:not(.command-input):not(.no-style),
input[type="email"],
input[type="password"],
input[type="number"],
input[type="datetime-local"],
input[type="date"],
input[type="time"],
input[type="search"],
select,
textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    height: 40px;
    padding: 0 var(--space-3);
    background: var(--bg);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: 13px;
    transition: var(--transition);
}
textarea {
    height: auto;
    min-height: 80px;
    padding: var(--space-3);
    line-height: 1.5;
}

input:focus,
select:focus,
textarea:focus {
    outline: none;
    border-color: var(--accent);
}

input::placeholder,
textarea::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
}
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: unified inputs (warm bg, copper focus, no glow)"
```

---

### Task 10: Restyle cards (.dashboard-section)

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: Locate existing card styles**

```bash
grep -nE '^\.(dashboard-section|stat-card|news-card)' public/style.css | head
```

- [ ] **Step 2: Replace card rulesets**

Find existing `.dashboard-section`, `.stat-card`, etc. blocks and replace with:

```css
/* ================================
   Cards
   ================================ */
.dashboard-section {
    background: var(--surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-6);
    box-shadow: var(--shadow-xs);
    border: 1px solid transparent;
    transition: var(--transition);
}
.dashboard-section:hover {
    border-color: var(--border);
    box-shadow: var(--shadow-sm);
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
}
.section-title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
}
.subsection { margin-top: var(--space-4); }
.subsection-title {
    margin: 0 0 var(--space-2) 0;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
}
.stat-value {
    font-family: var(--font-serif);
    font-size: 32px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1;
}
.stat-label {
    margin-top: var(--space-2);
    font-size: 12px;
    color: var(--text-tertiary);
}
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: card system (paper-like, subtle shadow, serif headings)"
```

---

### Task 11: Restyle badges (eventType + company + priority)

**Files:**
- Modify: `public/style.css` (existing `.news-event*`, `.news-company`, `.priority-badge`)

- [ ] **Step 1: Locate badge selectors**

```bash
grep -nE '^\.(news-event|news-company|priority|tag-)' public/style.css | head
```

- [ ] **Step 2: Update company badge to copper-tonal**

Find the existing `.news-company { ... }` rule and replace with:

```css
.news-company {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--accent-light);
    color: var(--accent);
    letter-spacing: 0.02em;
}
```

- [ ] **Step 3: Desaturate priority badges**

Find any `.priority-low`, `.priority-medium`, `.priority-high`, `.priority-urgent` rules. Replace their backgrounds with these warm-tonal variants:

```css
.priority-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.priority-low      { background: rgba(107, 142, 92, 0.10); color: var(--success); }
.priority-medium   { background: rgba(192, 138, 62, 0.10); color: #c08a3e; }
.priority-high     { background: rgba(184, 84, 80, 0.10);  color: var(--danger); }
.priority-urgent   { background: rgba(184, 84, 80, 0.18);  color: var(--danger); border: 1px solid rgba(184, 84, 80, 0.3); }
```

- [ ] **Step 4: eventType badges stay as-is (already approved)**

No changes to `.news-event-funding`, etc. — they already render cleanly on the cream background.

- [ ] **Step 5: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 6: Commit**

```bash
git add public/style.css
git commit -m "style: company badge → copper-tonal; priority badges desaturated"
```

---

### Task 12: Restyle modals

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: Locate modal selectors**

```bash
grep -nE '^\.(modal|projectModal|descriptionModal|convertModal)' public/style.css | head
```

- [ ] **Step 2: Replace modal rulesets**

Find the existing modal-related blocks and replace with:

```css
/* ================================
   Modals
   ================================ */
.modal,
.project-modal,
.description-modal,
.convert-modal {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(31, 28, 24, 0.4);
    /* No backdrop-filter — claude.ai doesn't blur */
    animation: modal-fade var(--transition) ease-out;
}
.modal.hidden,
.project-modal.hidden,
.description-modal.hidden,
.convert-modal.hidden { display: none; }

.modal-content,
.project-modal-content,
.description-modal-content,
.convert-modal-content {
    position: relative;
    background: var(--surface);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
    padding: var(--space-7);
    max-width: 560px;
    width: calc(100% - var(--space-8));
    max-height: calc(100vh - var(--space-7));
    overflow-y: auto;
}

.modal-close,
.close-btn {
    position: absolute;
    top: var(--space-4);
    right: var(--space-5);
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    color: var(--text-tertiary);
    font-size: 18px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: var(--transition);
}
.modal-close:hover,
.close-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }

@keyframes modal-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
}
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: modal system with paper shadow, no blur"
```

---

### Task 13: Restyle toasts

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: Locate toast selectors**

```bash
grep -nE '^\.(toast|toast-)' public/style.css
```

- [ ] **Step 2: Replace toast rulesets**

Find existing `.toast` blocks and replace with:

```css
/* ================================
   Toasts
   ================================ */
.toast {
    position: fixed;
    left: 50%;
    bottom: var(--space-6);
    transform: translateX(-50%) translateY(16px);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 280px;
    max-width: 480px;
    padding: var(--space-3) var(--space-5);
    background: var(--surface);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    color: var(--text-primary);
    font-size: 13px;
    opacity: 0;
    transition: opacity var(--transition), transform var(--transition);
    z-index: 200;
}
.toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}
.toast.toast-error { border-left-color: var(--danger); }
.toast.toast-success { border-left-color: var(--accent); }

.toast .toast-action {
    margin-left: auto;
    color: var(--accent);
    background: transparent;
    border: 0;
    padding: var(--space-1) var(--space-2);
    font: inherit;
    cursor: pointer;
}
.toast .toast-action:hover { color: var(--accent-hover); text-decoration: underline; }
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: toast with copper accent left bar"
```

---

### Task 14: Restyle custom checkboxes

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: Locate checkbox selectors**

```bash
grep -nE 'subtask-check|task-check|checkbox' public/style.css | head
```

- [ ] **Step 2: Add custom checkbox classes**

Append to `style.css`:

```css
/* ================================
   Custom checkboxes
   ================================ */
.checkbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 1.5px solid var(--accent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: var(--transition);
    flex-shrink: 0;
}
.checkbox.checked {
    background: var(--accent);
    border-color: var(--accent);
}
.checkbox.checked::after {
    content: '';
    width: 10px;
    height: 6px;
    border-left: 2px solid #fff;
    border-bottom: 2px solid #fff;
    transform: rotate(-45deg) translate(1px, -1px);
}
.checkbox:hover { border-color: var(--accent-hover); }
.checkbox.checked:hover { background: var(--accent-hover); }
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: custom checkbox with copper fill"
```

---

## Phase 6 — Command palette

### Task 15: Restyle command palette

**Files:**
- Modify: `public/style.css` (`.command-palette*` selectors)

- [ ] **Step 1: Locate command palette selectors**

```bash
grep -nE '^\.command-' public/style.css | head -20
```

- [ ] **Step 2: Replace palette rulesets**

Find existing `.command-palette` blocks and replace with:

```css
/* ================================
   Command palette
   ================================ */
.command-palette {
    position: fixed;
    inset: 0;
    z-index: 110;
    background: rgba(31, 28, 24, 0.4);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    animation: modal-fade var(--transition) ease-out;
}
.command-palette.hidden { display: none; }

.command-palette-content {
    width: 640px;
    max-width: calc(100% - var(--space-8));
    background: var(--surface);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
    overflow: hidden;
}

.command-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    height: 56px;
    padding: 0 var(--space-5);
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    font-family: var(--font-serif);
    font-size: 18px;
    color: var(--text-primary);
}
.command-input:focus { outline: none; }
.command-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
    font-family: var(--font-serif);
}

.command-results {
    max-height: 50vh;
    overflow-y: auto;
    padding: var(--space-2) 0;
}

.command-group-label {
    padding: var(--space-3) var(--space-5) var(--space-1);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.command-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: border-left-color var(--transition);
}
.command-item:hover,
.command-item.active { border-left-color: var(--accent); }
.command-item-icon {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
}
.command-item-text { flex: 1; min-width: 0; }
.command-item-title {
    font-size: 14px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.command-item-sub {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
}

.command-empty {
    padding: var(--space-5);
    color: var(--text-tertiary);
    text-align: center;
    font-style: italic;
}

.command-footer {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background: var(--bg);
    border-top: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
}
.command-footer kbd {
    display: inline-block;
    padding: 1px 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
}
```

- [ ] **Step 3: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "style: command palette with serif input + copper hover bar"
```

---

## Phase 7 — Dashboard restructure

### Task 16: Drop Weekly Review + LLM Status + Sync Status sections from HTML

**Files:**
- Modify: `public/index.html` (dashboard view)
- Modify: `public/script.js` (remove `loadLlmSyncStatus`, `loadWeeklyReview` calls)

- [ ] **Step 1: Delete the three sections from HTML**

In `public/index.html`, find and delete:

1. The entire `<div class="weekly-review-section" id="weeklyReviewSection"> ... </div>` block (lines ~121-142).
2. The `<div class="dashboard-section">` block containing `<h3 class="section-title">Sync Status</h3>` (lines ~182-187).
3. The `<div class="dashboard-section">` block containing `<h3 class="section-title">LLM Status</h3>` (lines ~189-194).

Verify after edit:
```bash
grep -cE 'weeklyReview|Sync Status|LLM Status' public/index.html
```
Expected: `0`

- [ ] **Step 2: Also delete the 4 stat-cards at top of dashboard**

These 4 small stat cards (`#dashTotal`, `#dashDoing`, `#dashDone`, `#dashOverdue` at lines 95-118) duplicate info shown on the Tasks card and add visual noise. Delete the entire `<div class="dashboard-grid"> ... </div>` block.

Verify:
```bash
grep -c 'dashboard-grid' public/index.html
```
Expected: `0`

- [ ] **Step 3: Remove orphaned JS calls AND function definitions**

In `public/script.js`, find and delete:
1. The `loadLlmSyncStatus` function body itself (search for `function loadLlmSyncStatus` or `async function loadLlmSyncStatus`).
2. Both `loadLlmSyncStatus()` call sites (init block at the top + the 60s `setInterval` block).
3. If a `loadWeeklyReview` function exists: delete the function body and any call sites.
4. Any DOM write that targets `#syncStatus` (note: NOT `#topbarSync` — that one stays). The `loadSyncStatus()` function defined in Task 6 already writes only to `#topbarSync`, so as long as you implemented that correctly there's nothing to remove here.
5. Any code referencing the deleted stat-card IDs: `#dashTotal`, `#dashDoing`, `#dashDone`, `#dashOverdue`. Often these are set by a `renderStats()` or similar; if that function only writes to those four IDs, delete the whole function and its call sites.

Run:
```bash
grep -nE 'loadLlmSyncStatus|loadWeeklyReview|#syncStatus[^-]|#llmSyncStatus|#dashTotal|#dashDoing|#dashDone|#dashOverdue' public/script.js
```
Expected: empty output (no matches). The negative lookbehind `[^-]` after `#syncStatus` keeps `#topbarSync` results out.

- [ ] **Step 4: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/script.js
git commit -m "feat: drop Weekly Review, LLM Status, Sync Status, and stat-grid from dashboard"
```

---

### Task 17: New dashboard layout (HTML + CSS)

**Files:**
- Modify: `public/index.html` (dashboard view body)
- Modify: `public/style.css` (dashboard layout)

- [ ] **Step 1: Replace dashboard HTML structure**

In `public/index.html`, find the `<div id="dashboardView" class="module-view">` block and replace its body (between the open tag and the close tag) with:

```html
<div class="dashboard-header">
    <h2 class="dashboard-date" id="dashboardDate">Today</h2>
</div>

<div class="dashboard-news-hero" id="dashboardNewsHero"></div>
<div class="dashboard-news-secondary" id="dashboardNewsSecondary"></div>

<div class="dashboard-grid-2x2">
    <div class="dashboard-section">
        <div class="section-header">
            <h3 class="section-title">Tasks</h3>
        </div>
        <div class="subsection">
            <h4 class="subsection-title">Recent</h4>
            <div class="recent-tasks" id="recentTasks"></div>
        </div>
        <div class="subsection">
            <h4 class="subsection-title">Upcoming Deadlines</h4>
            <div class="upcoming-tasks" id="upcomingTasks"></div>
        </div>
    </div>

    <div class="dashboard-section">
        <div class="section-header">
            <h3 class="section-title">Email</h3>
        </div>
        <div class="subsection">
            <h4 class="subsection-title">Important</h4>
            <div class="recent-emails" id="recentEmails"></div>
        </div>
    </div>

    <div class="dashboard-section">
        <div class="section-header">
            <h3 class="section-title">Calendar</h3>
        </div>
        <div class="subsection">
            <h4 class="subsection-title">Upcoming Meetings</h4>
            <div class="upcoming-events" id="upcomingEvents"></div>
        </div>
    </div>

    <div class="dashboard-section" id="aiUsageCard">
        <div class="section-header">
            <h3 class="section-title">AI Usage</h3>
            <span class="section-meta">Last 7 days</span>
        </div>
        <div class="ai-usage-body" id="aiUsageBody"></div>
    </div>
</div>
```

- [ ] **Step 2: Add CSS for new dashboard layout**

In `public/style.css`, find any leftover `.dashboard-content`, `.dashboard-column`, `.dashboard-grid` rules. **Delete** them. **Append**:

```css
/* ================================
   Dashboard layout (v2)
   ================================ */
#dashboardView {
    padding: var(--space-6);
    max-width: 1200px;
    margin: 0 auto;
}

.dashboard-header { margin-bottom: var(--space-6); }
.dashboard-date {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.02em;
}

.dashboard-news-hero { margin-bottom: var(--space-4); }

.dashboard-news-secondary {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-6);
}

.dashboard-grid-2x2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
}

.section-meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

@media (max-width: 1279px) {
    .dashboard-news-secondary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
    .dashboard-news-secondary { grid-template-columns: 1fr; }
    .dashboard-grid-2x2 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Update date header in JS**

Find the existing logic that wrote to `#dashboardMeta` or similar. Add (or modify) to write the date header:

```javascript
function updateDashboardDate() {
    const el = document.getElementById('dashboardDate');
    if (!el) return;
    const d = new Date();
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    el.textContent = `Today — ${d.toLocaleDateString('en-US', opts)}`;
}
```

Call `updateDashboardDate()` once on DOMContentLoaded and once daily (cheap to call hourly):
```javascript
updateDashboardDate();
setInterval(updateDashboardDate, 60 * 60 * 1000);
```

- [ ] **Step 4: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/script.js public/style.css
git commit -m "feat: dashboard 2x2 grid layout with news hero header + date title"
```

---

## Phase 8 — Tech News hero rendering

### Task 18: Split Tech News into hero + 5 secondary cards

**Files:**
- Modify: `public/script.js` (`renderDailyNews` function)
- Modify: `public/style.css` (hero card styles)

- [ ] **Step 1: Locate current renderDailyNews**

```bash
grep -n 'renderDailyNews\|loadDailyNews' public/script.js | head -5
```
Read the function (around line 2065 currently).

- [ ] **Step 2: Split rendering: hero + secondary**

Replace the entire `renderDailyNews(items, date)` and `loadDailyNews()` functions in `public/script.js` with:

```javascript
async function loadDailyNews() {
    try {
        const response = await fetch(NEWS_API_BASE);
        if (!response.ok) return;
        const data = await response.json();
        renderDailyNews(data.items || [], data.date);
    } catch (error) {
        console.error('Failed to load daily news:', error);
    }
}

function renderDailyNews(items, date) {
    const heroEl = document.getElementById('dashboardNewsHero');
    const secEl = document.getElementById('dashboardNewsSecondary');
    if (!heroEl || !secEl) return;

    if (!items || items.length === 0) {
        heroEl.innerHTML = `
            <div class="news-empty">
                <p>No news for today yet.</p>
                <button class="btn-secondary" onclick="syncNews()">Sync Now</button>
            </div>`;
        secEl.innerHTML = '';
        return;
    }

    heroEl.innerHTML = renderNewsCard(items[0], { hero: true });
    secEl.innerHTML = items.slice(1, 6).map(item => renderNewsCard(item, { hero: false })).join('');
}

function renderNewsCard(item, { hero }) {
    const eventBadge = item.eventType
        ? `<span class="news-event news-event-${escapeHtml(item.eventType.toLowerCase().replace(/[^a-z]/g, ''))}">${escapeHtml(item.eventType)}</span>`
        : '';
    const company = item.company ? `<span class="news-company">${escapeHtml(item.company)}</span>` : '';
    const sourceLabel = item.source && item.source !== 'hackernews' ? item.source : '';
    const titleSafe = escapeHtml(item.title);
    const onclick = `newsToTask('${titleSafe.replace(/'/g, "\\'")}', '${escapeHtml(item.url || '')}')`;

    return `
        <a class="news-card${hero ? ' news-card-hero' : ''}" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer">
            <div class="news-card-tags">${eventBadge}${company}</div>
            <div class="news-card-title">${titleSafe}</div>
            ${hero && item.summary ? `<div class="news-card-summary">${escapeHtml(item.summary)}</div>` : ''}
            <div class="news-card-meta">
                ${item.score ? `<span>▲ ${item.score}</span>` : ''}
                ${item.commentCount ? `<span>💬 ${item.commentCount}</span>` : ''}
                ${sourceLabel ? `<span>${escapeHtml(sourceLabel)}</span>` : ''}
                <span>${formatNewsDate(item.publishedAt)}</span>
                <button class="btn-ghost news-card-action" onclick="event.preventDefault();event.stopPropagation();${onclick}">+ Task</button>
            </div>
        </a>`;
}
```

- [ ] **Step 3: Add hero + secondary card CSS**

In `public/style.css`, locate the existing `.news-card`, `.daily-news` blocks. Replace with:

```css
/* ================================
   News cards (hero + secondary)
   ================================ */
.news-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-5);
    background: var(--surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    border: 1px solid transparent;
    text-decoration: none;
    color: inherit;
    transition: var(--transition);
}
.news-card:hover {
    border-color: var(--border);
    box-shadow: var(--shadow-sm);
}

.news-card-hero {
    padding: var(--space-6) var(--space-7);
    gap: var(--space-3);
}

.news-card-tags {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
}

.news-card-title {
    font-family: var(--font-serif);
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
    font-size: 15px;
}
.news-card-hero .news-card-title { font-size: 24px; letter-spacing: -0.01em; }

.news-card-summary {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.55;
}

.news-card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: auto;
}
.news-card-meta > :last-child { margin-left: auto; }

.news-card-action { padding: 2px 8px !important; font-size: 11px !important; }

.news-empty {
    padding: var(--space-6);
    background: var(--surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    text-align: center;
    color: var(--text-tertiary);
}
.news-empty p { margin: 0 0 var(--space-3); }
```

- [ ] **Step 4: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```

User refreshes; first news item should be displayed prominently with large serif title; remaining 5 items in a row of compact cards.

- [ ] **Step 5: Commit**

```bash
git add public/script.js public/style.css
git commit -m "feat: Tech News hero card + secondary row layout"
```

---

## Phase 9 — AI Usage card

### Task 19: Add LlmUsageModel aggregation functions (TDD)

**Files:**
- Modify: `models/LlmUsageModel.js`
- Test: `test/llm-usage.test.js` (new)

- [ ] **Step 1: Write failing tests**

Create `test/llm-usage.test.js`:

```javascript
require('./helpers/setup');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { resetDb } = require('./helpers/setup');
const { getDb } = require('../db');
const LlmUsageModel = require('../models/LlmUsageModel');

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
    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = r.find(d => d.date === today);
    assert.equal(todayBucket.calls, 2);
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
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test 2>&1 | tail -15
```
Expected: 6 new failing tests (functions don't exist yet).

- [ ] **Step 3: Implement functions in LlmUsageModel.js**

Open `models/LlmUsageModel.js`. After the existing `getLlmSyncStatus` function, add:

```javascript
function getTodaySummary() {
    const db = getDb();
    const row = db.prepare(`
        SELECT COUNT(*) AS calls, COALESCE(SUM(tokensUsed), 0) AS tokens
        FROM llm_usage
        WHERE DATE(timestamp, 'localtime') = DATE('now', 'localtime')
    `).get();
    return { calls: row.calls || 0, tokens: row.tokens || 0 };
}

function getSuccessRate(sinceISO) {
    const db = getDb();
    const row = db.prepare(`
        SELECT AVG(success) AS rate, COUNT(*) AS n
        FROM llm_usage
        WHERE timestamp >= ?
    `).get(sinceISO);
    if (!row || row.n === 0) return null;
    return row.rate;
}

function getLast7Days() {
    const db = getDb();
    const rows = db.prepare(`
        SELECT DATE(timestamp, 'localtime') AS date, COUNT(*) AS calls
        FROM llm_usage
        WHERE timestamp >= DATE('now', '-6 days')
        GROUP BY DATE(timestamp, 'localtime')
    `).all();
    const byDate = new Map(rows.map(r => [r.date, r.calls]));

    // Backfill missing days with 0 so the array is exactly 7 entries.
    const out = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        out.push({ date: key, calls: byDate.get(key) || 0 });
    }
    return out;
}

function getByModel(sinceISO) {
    const db = getDb();
    return db.prepare(`
        SELECT model, COUNT(*) AS calls, COALESCE(SUM(tokensUsed), 0) AS tokens
        FROM llm_usage
        WHERE timestamp >= ?
        GROUP BY model
        ORDER BY calls DESC
    `).all(sinceISO);
}
```

Update `module.exports` at bottom of file to include the four new functions:

```javascript
module.exports = {
    logLlmCall,
    getLlmStats,
    getLlmSyncStatus,
    getTodaySummary,
    getSuccessRate,
    getLast7Days,
    getByModel,
};
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
npm test 2>&1 | tail -8
```
Expected: 32+/32+ tests pass (was 26 + 6 new = 32).

- [ ] **Step 5: Commit**

```bash
git add models/LlmUsageModel.js test/llm-usage.test.js
git commit -m "feat(LlmUsageModel): add getTodaySummary / getSuccessRate / getLast7Days / getByModel"
```

---

### Task 20: Add /llm-usage/summary route (TDD)

**Files:**
- Create: `routes/llmUsage.js`
- Modify: `server.js` (mount route)
- Test: `test/llm-usage-route.test.js` (new)

- [ ] **Step 1: Write failing route test**

Create `test/llm-usage-route.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test 2>&1 | tail -10
```
Expected: failure (`Cannot find module '../routes/llmUsage'`).

- [ ] **Step 3: Implement route**

Create `routes/llmUsage.js`:

```javascript
const express = require('express');
const router = express.Router();
const LlmUsageModel = require('../models/LlmUsageModel');
const log = require('../utils/logger');

router.get('/summary', (req, res) => {
    try {
        const today = LlmUsageModel.getTodaySummary();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const successRate7d = LlmUsageModel.getSuccessRate(sevenDaysAgo);
        const last7d = LlmUsageModel.getLast7Days();
        const byModel = LlmUsageModel.getByModel(sevenDaysAgo);

        res.json({
            today,
            successRate7d,
            last7d,
            byModel,
        });
    } catch (err) {
        log.error('Error getting LLM usage summary', { error: err.message });
        res.status(500).json({ error: 'Failed to get LLM usage summary' });
    }
});

module.exports = router;
```

- [ ] **Step 4: Mount route in server.js**

In `server.js`, find the section where routes are mounted (look for `app.use('/news', newsRoutes);`). Add nearby:

```javascript
const llmUsageRoutes = require('./routes/llmUsage');
// ... and below the other app.use() calls:
app.use('/llm-usage', llmUsageRoutes);
```

- [ ] **Step 5: Run test, verify pass**

```bash
npm test 2>&1 | tail -8
```
Expected: 33+/33+ pass (was 32 + 1 new).

- [ ] **Step 6: Smoke test live endpoint**

```bash
pkill -f "node server.js" 2>/dev/null; sleep 1
node server.js > /tmp/aether.log 2>&1 &
until grep -q '"Aether Dashboard started"' /tmp/aether.log; do sleep 0.5; done
curl -s http://localhost:3000/llm-usage/summary | python3 -m json.tool
```
Expected: JSON with `today`, `successRate7d`, `last7d` (length 7), `byModel`.

- [ ] **Step 7: Commit**

```bash
git add routes/llmUsage.js server.js test/llm-usage-route.test.js
git commit -m "feat: GET /llm-usage/summary endpoint"
```

---

### Task 21: Frontend AI Usage card + sparkline

**Files:**
- Modify: `public/script.js` (add `loadAiUsage`, sparkline renderer)
- Modify: `public/style.css` (AI Usage card styles)

- [ ] **Step 1: Add loadAiUsage function**

In `public/script.js`, near the news functions, add:

```javascript
async function loadAiUsage() {
    try {
        const res = await fetch('/llm-usage/summary');
        if (!res.ok) return;
        const data = await res.json();
        renderAiUsage(data);
    } catch (err) {
        console.error('Failed to load AI usage:', err);
    }
}

function renderAiUsage(data) {
    const body = document.getElementById('aiUsageBody');
    if (!body) return;

    const today = data.today || { calls: 0, tokens: 0 };
    const sr = data.successRate7d;
    const last7d = Array.isArray(data.last7d) ? data.last7d : [];
    const byModel = Array.isArray(data.byModel) ? data.byModel : [];

    if (today.calls === 0 && byModel.length === 0) {
        body.innerHTML = '<div class="ai-usage-empty">No LLM activity yet</div>';
        return;
    }

    const srPct = sr === null || sr === undefined ? '—' : Math.round(sr * 100) + '%';
    const srClass = sr === null ? 'sr-na' : sr >= 0.95 ? 'sr-ok' : sr >= 0.90 ? 'sr-warn' : 'sr-bad';

    const tokenStr = today.tokens >= 1000 ? (today.tokens / 1000).toFixed(1) + 'k' : String(today.tokens);

    const sparkline = renderSparkline(last7d);
    const modelRows = byModel.length > 1 ? `
        <div class="ai-usage-models">
            ${byModel.map(m => `
                <div class="ai-usage-model-row">
                    <span class="ai-usage-model-name">${escapeHtml(m.model)}</span>
                    <span class="ai-usage-model-stats">${m.calls} calls · ${formatTokenCount(m.tokens)} tok</span>
                </div>`).join('')}
        </div>` : '';

    body.innerHTML = `
        <div class="ai-usage-stats">
            <div class="ai-usage-stat">
                <span class="ai-usage-value">${today.calls}</span>
                <span class="ai-usage-label">calls today</span>
            </div>
            <div class="ai-usage-stat">
                <span class="ai-usage-value">${tokenStr}</span>
                <span class="ai-usage-label">tokens today</span>
            </div>
            <div class="ai-usage-stat">
                <span class="ai-usage-value ${srClass}">${srPct}</span>
                <span class="ai-usage-label">success rate</span>
            </div>
        </div>
        ${sparkline}
        ${modelRows}`;
}

function formatTokenCount(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
}

function renderSparkline(days) {
    if (!days.length) return '';
    const W = 200, H = 40, P = 4;
    const max = Math.max(...days.map(d => d.calls), 1);
    const stepX = (W - 2 * P) / Math.max(days.length - 1, 1);
    const points = days.map((d, i) => {
        const x = P + i * stepX;
        const y = H - P - (d.calls / max) * (H - 2 * P);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const labels = days.map((d, i) => {
        const x = P + i * stepX;
        const day = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' });
        return `<text x="${x.toFixed(1)}" y="${H + 12}" text-anchor="middle">${day.slice(0,1)}</text>`;
    }).join('');

    return `
        <svg class="ai-usage-sparkline" viewBox="0 0 ${W} ${H + 16}" preserveAspectRatio="none">
            <polyline fill="none" stroke="var(--accent)" stroke-width="1.5" points="${points}"/>
            ${days.map((d, i) => {
                const x = P + i * stepX;
                const y = H - P - (d.calls / max) * (H - 2 * P);
                const isToday = i === days.length - 1;
                return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isToday ? 3 : 2}" fill="var(--accent)" opacity="${isToday ? 1 : 0.6}"/>`;
            }).join('')}
            ${labels}
        </svg>`;
}
```

- [ ] **Step 2: Wire loadAiUsage into init + 60s interval**

In `public/script.js`, find the DOMContentLoaded handler (around line 197) and:

1. Add `loadAiUsage();` after the existing `loadDailyNews();` line.
2. Add `loadAiUsage();` inside the existing 60s `setInterval(() => { ... }, 60000)` block.

- [ ] **Step 3: Add AI Usage card CSS**

Append to `public/style.css`:

```css
/* ================================
   AI Usage card
   ================================ */
.ai-usage-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-4);
}
.ai-usage-stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}
.ai-usage-value {
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1;
}
.ai-usage-value.sr-ok   { color: var(--text-secondary); }
.ai-usage-value.sr-warn { color: #c08a3e; }
.ai-usage-value.sr-bad  { color: var(--danger); }
.ai-usage-value.sr-na   { color: var(--text-tertiary); }
.ai-usage-label {
    font-size: 12px;
    color: var(--text-tertiary);
}

.ai-usage-sparkline {
    width: 100%;
    height: 56px;
    overflow: visible;
}
.ai-usage-sparkline text {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--text-tertiary);
}

.ai-usage-models {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
}
.ai-usage-model-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    padding: var(--space-1) 0;
}
.ai-usage-model-name { color: var(--text-primary); }

.ai-usage-empty {
    padding: var(--space-5) 0;
    text-align: center;
    color: var(--text-tertiary);
    font-style: italic;
}
```

- [ ] **Step 4: Verify**

```bash
node --check public/script.js && npm test 2>&1 | tail -3
```
Expected: pass.

User refreshes; AI Usage card should appear in bottom-right of dashboard 2×2 grid with three KPIs + sparkline.

- [ ] **Step 5: Commit**

```bash
git add public/script.js public/style.css
git commit -m "feat: AI Usage card with KPIs + 7-day sparkline (SVG, no chart lib)"
```

---

## Phase 10 — Final smoke + cleanup

### Task 22: Final smoke test

**Files:**
- (verification only)

- [ ] **Step 1: Full test pass**

```bash
npm test 2>&1 | tail -8
```
Expected: 33+/33+ tests pass.

- [ ] **Step 2: Server clean restart**

```bash
pkill -f "node server.js" 2>/dev/null; sleep 1
node server.js > /tmp/aether.log 2>&1 &
until grep -q '"Aether Dashboard started"' /tmp/aether.log; do sleep 0.5; done
echo "ready"
```

- [ ] **Step 3: Endpoint smokes**

```bash
echo "--- /health ---"
curl -s -w '\nHTTP=%{http_code}\n' http://localhost:3000/health

echo "--- /news ---"
curl -s http://localhost:3000/news | head -c 200

echo "--- /llm-usage/summary ---"
curl -s http://localhost:3000/llm-usage/summary | python3 -m json.tool

echo "--- /papers (must 404 — old endpoint dead) ---"
curl -s -o /dev/null -w 'HTTP=%{http_code}\n' http://localhost:3000/papers
```

Expected: all 200 except `/papers` which is 404.

- [ ] **Step 4: Stale-token cleanup verification**

In the browser console while on the dashboard:
```javascript
console.log(localStorage.getItem('theme'));
```
Expected: `null` (the one-time cleanup from Task 4 removed any stale value).

- [ ] **Step 5: Visual sweep (user)**

User scrolls the entire dashboard, opens the command palette (Cmd+K), opens at least one modal (e.g. project edit), clicks one sidebar nav item. Reports any visual issues.

- [ ] **Step 6: Final commit (if any leftover changes)**

```bash
git status --short
# If clean, skip commit. Otherwise:
git add -A
git commit -m "chore: final cleanup after Claude-style UI redesign"
```

---

## Cross-cutting checklist

Before declaring complete, run this checklist:

- [ ] `grep -c '\.dark-mode' public/style.css` → 0
- [ ] `grep -nE 'toggleTheme|themeToggle' public/script.js` → empty
- [ ] `grep -cE 'weeklyReview|loadLlmSyncStatus|#dashTotal' public/script.js` → 0 references
- [ ] `npm test` → 33+/33+ pass
- [ ] Server starts cleanly, `/health` 200, `/llm-usage/summary` returns spec'd shape
- [ ] No JS console errors when navigating between modules
- [ ] Sync indicator dot in top bar shows non-grey state within 5 seconds of page load

---

## Risk reminders (from spec)

- If sidebar text-only navigation feels disorienting, add hover-revealed icons to `.sidebar-item:hover::after` as a small fix, not a re-architecture.
- If Tech News hero looks empty when only 1 picked item, the secondary row is suppressed automatically (renderDailyNews handles this via `items.slice(1, 6)`).
- If a user had `theme=dark` in localStorage from before Task 4, they get a one-time cleanup on next page load (Task 4 step 3).
