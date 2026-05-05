# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                 # Install deps (better-sqlite3 needs node-gyp)
npm start                   # Run server on http://localhost:${PORT:-3000}
npm test                    # Run all tests (node:test runner, ~200ms)
node --test test/utils.test.js          # Run a single test file
node --test --test-name-pattern='cascade' test/models.test.js   # One test
node --check public/script.js           # Syntax-check the frontend
```

There is no lint / format / typecheck step — the project is intentionally toolchain-light. JS is plain ES2022 (`node:test`, no transpiler). The frontend is vanilla — no bundler, no framework.

For tests that need DB isolation, set `AETHER_DB_PATH=:memory:` (`test/helpers/setup.js` does this for you and exposes `resetDb()` for `beforeEach`).

## Outdated parts of README.md

`README.md` predates the SQLite migration (audit Phase 2) and still describes JSON storage and `board.json`. **Storage is SQLite (`aether.db`)** since `db.js` was rewritten. Treat the README's "Data Storage" and "Project Structure" sections as historical. `scripts/migrate-json-to-sqlite.js` was the one-shot migration; legacy `board.json.bak` is kept only in case anyone still has data to import.

## Architecture

Four-layer Express app, each layer well-bounded — never bypass:

```
routes/  ── HTTP, zod validation, never touches the DB directly
services/ ── orchestration (timers, external APIs, multi-step flows)
models/  ── single-table SQL via better-sqlite3 prepared statements
db.js    ── schema + indexes + migrations, exports getDb() / closeDb()
```

Cross-cutting:
- `utils/` — `safeJson` (defensive JSON.parse), `dateRange` (timezone-correct local date helpers), `encryption` (AES-256-GCM tokens), `envValidator` (startup env check), `logger` (structured JSON to stdout), `safeStorage` (frontend localStorage wrapper)
- `middleware/` — `validate(schema, source='body')` for zod, `validateIdParam(name='id')` for `:id` route params
- `emailProviders/` — abstract `EmailProviderInterface` + concrete `OutlookProvider` (Microsoft Graph). New providers plug in via interface.

`server.js` is the only file that mounts routes. `services/ReminderService.js` is a singleton that owns all background timers (reminder check, email sync, light/full cleanup, daily news cron).

## Key conventions (re-use these — don't invent parallel mechanisms)

**Validation**:
- `:id` params → `router.use(validateIdParam())` mounted before handler
- request body → `validate(zodSchema)` middleware
- query string → `validate(zodSchema, 'query')` — coerce numerics with `z.coerce.number().int()`

**JSON parsing of stored columns** (e.g. `tasks.tags`, `emails.metadata`):
- always `safeJsonParse(row.col, fallback, 'context-string-for-log')` from `utils/safeJson.js`
- never raw `JSON.parse` on DB content — corrupted rows used to crash routes

**Local-time date queries**:
- date strings → `todayLocal()` / `localDateNDaysAgo(n)` from `utils/dateRange.js`
- SQL aggregations across timezones → `WHERE DATE(col, 'localtime') = DATE('now', 'localtime')` (NOT `DATE(col)` — UTC drift on the boundary)

**Cascade deletes** (FK constraints aren't fully wired):
- `TaskModel.deleteTask(id)` cascades subtasks + unlinks emails
- `EmailModel.deleteEmail(id)` cascades email_filters
- Both are wrapped in `db.transaction()` — preserve that envelope when extending

**Background timer creation in `ReminderService`**:
- always wrap with the existing `jittered(interval, cb)` helper (0–10% startup phase shift; prevents thundering-herd to external APIs across multi-instance deploys)
- timer fields are `{id, started}` wrappers — don't replace with raw timer IDs, `stop()` relies on the shape

**Errors**:
- routes throw or `next(err)`; the global handler in `server.js` formats response. Don't `res.status(500).json()` inline — bypasses logging.
- background services that emit events (`syncStats`, etc.) must update their stat counters even on success path — `getStatus()` is consumed by the top-bar sync indicator.

## Database

- SQLite via `better-sqlite3`. Single file `aether.db` in repo root. WAL mode on.
- Schema lives in `db.js initSchema()`. Adding a column: prefer `ALTER TABLE ... ADD COLUMN` wrapped in `try{}catch{}` (idempotent, since SQLite doesn't have `IF NOT EXISTS` for ALTER).
- Indexes are listed at the bottom of `initSchema()`. Add one when a route touches a non-indexed column for filtering / ordering.
- `getDb()` is the only entry point. Don't `new Database(...)` elsewhere.
- For tests: `AETHER_DB_PATH=:memory:` env var routes around the file. `test/helpers/setup.js:resetDb()` closes + reopens for clean state per test.

## LLM integration gotchas

The user runs against **Doubao via Volcano Engine Ark** (Anthropic-compatible `/v1/messages` endpoint), not Anthropic directly. Two non-obvious things:

1. **Doubao emits "extended thinking" content blocks** alongside (sometimes instead of) `text` blocks. `response.data.content[0]` may be `{type: 'thinking', thinking: '...'}` with no text answer. Pattern (see `services/NewsService.js`):
   ```js
   const blocks = Array.isArray(response.data.content) ? response.data.content : [];
   const textBlock = blocks.find(b => b?.type === 'text' && b.text);
   const thinkingBlock = blocks.find(b => b?.type === 'thinking' && b.thinking);
   const content = textBlock?.text
       || response.data.choices?.[0]?.message?.content   // OpenAI-compat fallback
       || thinkingBlock?.thinking
       || '';
   ```
2. **`max_tokens` must be ≥ 1024** for any non-trivial prompt. Thinking blocks consume tokens; tight budgets (e.g. 300) leave nothing for the actual JSON answer. `EmailFilterService` runs at `max_tokens: 50` only because its prompt is so simple Doubao doesn't engage thinking — don't copy that pattern.

Every LLM call must call `LlmUsageModel.logLlmCall(provider, model, endpoint, method, success, tokensUsed)`. The dashboard's AI Usage card and `/llm-usage/summary` aggregate this table.

## Token encryption

`utils/encryption.js` always returns **strings**:
- with `ENCRYPTION_KEY` set: AES-256-GCM, prefix `enc:`
- without key: plain JSON, prefix `json:`

Never persist a raw object as `tokens` — better-sqlite3 binds objects via named-param mode and reports "Too few parameter values were provided". `EmailModel.updateSyncState` always routes through `encrypt(val)` for the tokens column.

## News pipeline

`services/NewsService.js` aggregates Hacker News + RSS feeds (TechCrunch / The Verge / 36氪) and filters for commercial events about internet companies via the LLM. Sources configured in `config/newsConfig.js`. Each item is tagged with `eventType` ∈ {funding/earnings/M&A/leadership/launch/regulatory/partnership/layoff} or null. Daily cron at 8:00 local; selection prefers diversity by `(company, eventType)`.

`news_items` is the storage table; legacy `papers` table is dropped via `DROP TABLE IF EXISTS papers` in `db.js` (one-shot migration).

## Frontend

- Single `public/index.html` + `public/script.js` + `public/style.css` — no module system, no framework.
- Design tokens are CSS custom properties in `:root` (`--bg`, `--surface`, `--accent`, `--space-1..8`, `--radius-sm/md/lg/xl`, `--shadow-xs/sm/md`). New components must use tokens, not hardcoded colors / px.
- Light mode only (dark mode was removed; do not reintroduce `[data-theme="dark"]` selectors).
- The dashboard view (`#dashboardView`) follows: serif date header → news hero card → 5-up news secondary row → 2×2 grid (Tasks / Email / Calendar / AI Usage). The sidebar is text-only nav with copper active accent.
- `safeStorage.get/set` (in `script.js`) wraps localStorage with fail-silent — use it instead of raw `localStorage.*` for non-critical writes.

## Memory and specs

- Claude Code's per-project memory lives at `~/.claude/projects/-Users-feifuyang-Desktop-To-Do-List/memory/`. Index file is `MEMORY.md`. Don't write project facts into the repo when they belong in memory.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` hold design + implementation docs from the brainstorming/writing-plans/subagent-driven-development workflow. The current spec is `2026-05-05-ui-claude-style-design.md`; the matching 22-task plan is `2026-05-05-ui-claude-style.md`.

## Robustness audit baseline

A 34-issue audit baseline sits in memory (`project_robustness_audit_2026-04-26.md`). 27/34 are fixed. Remaining 7 items are filed as Phases 15–17 in the working plan: a11y/UX polish, soft-delete schema migration, performance/virtualization. When touching code, check whether your change relates to a remaining item before proposing parallel fixes.
