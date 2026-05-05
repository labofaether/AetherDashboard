# Aether Dashboard

A self-hosted, single-user productivity dashboard. One screen for today's tasks, important email, calendar, tech-business news, and AI-usage stats. Runs locally — your data never leaves the machine.

Part of the **Aether** project family. Visual language: warm-minimalism inspired by [claude.ai](https://claude.ai). Light mode only, by design. See [`docs/superpowers/specs/2026-05-05-ui-claude-style-design.md`](docs/superpowers/specs/2026-05-05-ui-claude-style-design.md) for the design spec.

## What's on the dashboard

- **Tech News digest** — daily aggregation of Hacker News + TechCrunch + The Verge + 36氪 RSS, filtered by an LLM for commercial events about notable internet companies. Each item gets tagged with `eventType` (funding / earnings / M&A / leadership / launch / regulatory / partnership / layoff) and a company name.
- **Tasks** — recent + upcoming-deadline lists, with full Board / List / Calendar / Today views via the sidebar.
- **Email** — Outlook integration via Microsoft Graph (OAuth 2.0). Important inbox preview on the dashboard, full inbox on its own module.
- **Calendar** — upcoming events from the same Outlook account.
- **AI Usage** — KPIs (today's calls, tokens, 7-day success rate) + a 7-day SVG sparkline. Reflects this app's own LLM activity, not your Anthropic Console balance.
- **Sync indicator** — top-bar dot (green / amber / red) shows email-sync health at a glance.
- **Command palette** — `⌘K` searches tasks, emails, and news from anywhere.

Other modules accessible from the sidebar: Focus (Pomodoro), Goals, Notes (sticky notes), All Tasks (table view).

## Quick start

```bash
npm install                          # better-sqlite3 needs node-gyp
cp .env.example .env                 # then fill in (see "Configuration" below)
npm start                            # serves on http://localhost:3000
```

Open http://localhost:3000 in your browser. The dashboard works without any external configuration; email and AI features are progressive — the dashboard renders fine if you skip them.

### Run the test suite

```bash
npm test
```

Uses Node's built-in `node:test` runner. Tests run against an in-memory SQLite (no fixture cleanup needed).

## Configuration

`.env` is read by `dotenv` at startup. All vars are optional — leave them unset to disable that feature.

| Variable | What it does | Required for |
|---|---|---|
| `PORT` | Server port (default 3000) | — |
| `ENCRYPTION_KEY` | 32+ char secret used to AES-256-GCM-encrypt OAuth tokens at rest | OAuth persistence |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_REDIRECT_URI` | Azure AD app credentials for Outlook OAuth | Email integration |
| `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`) | LLM API key | News filtering, AI email triage |
| `ANTHROPIC_BASE_URL` | LLM endpoint (defaults to Anthropic; can point at any Anthropic-compatible API like Volcano Engine Ark) | — |
| `ANTHROPIC_MODEL` | Model name (e.g. `claude-haiku-20240307`, `Doubao-Seed-2.0-Code`) | — |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist (default: `http://localhost:${PORT}`) | — |
| `REMINDER_CHECK_INTERVAL` | Reminder check tick (ms, default 60000) | — |
| `EMAIL_SYNC_INTERVAL` | Email sync tick (ms, default 300000) | — |

If `ENCRYPTION_KEY` is unset the server logs a warning at startup and falls back to plain JSON for token storage — fine for dev, set it for any persistent install.

## Storage

A single SQLite file: `aether.db` (created on first run, WAL mode). All tasks, projects, emails, sync state, news items, and LLM usage logs live here. Back up by copying the file when the server is stopped (or copy the `.db` + `.db-wal` + `.db-shm` triplet while running).

For tests, set `AETHER_DB_PATH=:memory:` to route around the file.

A migration script for the legacy JSON-storage format (`scripts/migrate-json-to-sqlite.js`) is kept in the repo only for historical interest — there's no `board.json` data to migrate in any new install.

## Tech stack

- **Backend**: Node.js, Express 4, better-sqlite3, zod, node-cron, axios, rss-parser
- **Frontend**: vanilla HTML / CSS / JS — no framework, no bundler. Three Google Fonts (Source Serif Pro / Inter / JetBrains Mono).
- **Tests**: `node:test` (Node 24+ built-in, no Jest / Mocha dependency).
- **Storage**: SQLite via better-sqlite3.
- **Auth**: OAuth 2.0 against Microsoft Graph for Outlook. Tokens encrypted at rest (AES-256-GCM) when `ENCRYPTION_KEY` is set.

## Architecture

Four-layer Express app: `routes/` → `services/` → `models/` → `db.js`. Background tasks (reminders, email sync, daily news cron, retention cleanup) run inside a single `services/ReminderService.js` singleton with phase-jittered timers.

Engineering details — conventions, gotchas (e.g. Doubao "thinking" content blocks, custom encryption shape), validation patterns — are documented in [`CLAUDE.md`](CLAUDE.md). New contributors and AI agents should read that file before touching code.

## Project layout

```
.
├── server.js              # Express entry — mounts routes, owns shutdown
├── db.js                  # SQLite schema, migrations, getDb() / closeDb()
├── routes/                # 12 route files (tasks, projects, news, emails, llmUsage, …)
├── services/              # ReminderService (timers), NewsService, EmailFilterService, DataCleanupService
├── models/                # 1-table-per-file CRUD via prepared statements
├── emailProviders/        # Provider abstraction + OutlookProvider
├── middleware/            # validate(zodSchema, source), validateIdParam(name)
├── utils/                 # safeJson, dateRange, encryption, envValidator, logger
├── public/                # index.html + style.css + script.js  (vanilla, no build)
├── test/                  # 33 tests, node:test
├── docs/superpowers/      # Specs + plans (UI redesign, audits, future phases)
├── scripts/               # One-shot migrations / utilities
└── CLAUDE.md              # Engineering reference for AI agents
```

## API surface

Routes are mounted at `/tasks`, `/projects`, `/activity`, `/emails`, `/news`, `/search`, `/notes`, `/goals`, `/focus`, `/templates`, `/stats`, `/llm-usage`. Each is a small, focused REST surface; see the corresponding file in `routes/` for the schema. A few highlights:

- `GET /news` — today's selected items (LLM-filtered)
- `POST /news/sync?force=true` — manually re-run the daily aggregation
- `GET /llm-usage/summary` — today's calls/tokens, 7-day success rate, daily breakdown, by-model rollup
- `GET /search?q=…` — unified search across tasks, emails, news (used by `⌘K`)
- `GET /health` — liveness probe (200 + uptime)

All `:id` route params are validated by `middleware/validateIdParam` (rejects non-positive integers with 400). Body and query schemas use `zod` via `middleware/validate`.

## Status

Phases 0–7 (foundation through bulk operations) and a four-cycle robustness audit (27 of 34 issues fixed) are complete. The most recent work is a Claude-style UI redesign and a switch from arXiv-based academic-paper recommendations to commercial-news aggregation. See [`docs/superpowers/`](docs/superpowers/) for the in-flight specs and plans.

## License

ISC. Personal project — feel free to copy patterns, fork, or learn from it. No support promised.
