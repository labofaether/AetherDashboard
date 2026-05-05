# Aether Dashboard UI Redesign — Claude-style Warm Minimalism

**Date**: 2026-05-05
**Scope**: Dashboard view + global shell (top bar / sidebar / command palette)
**Out of scope**: Per-module views (Board / Calendar / Email / List / Today / Focus / Goals) inherit new color tokens automatically; their internal layouts are not restructured in this spec.
**Estimated effort**: ~12 hours focused work, split across 9 implementation steps.

---

## 1. Goals & non-goals

### Goals
- Establish a recognizable visual identity inspired by claude.ai (warm minimalism: cream backgrounds, serif headers, copper accent, paper-like spacing).
- Reset dashboard information hierarchy: Tech News becomes the visual hero; Tasks / Email / Calendar / AI Usage anchor the secondary grid.
- Replace the binary "LLM API up/down" indicator with a quantitative AI Usage card driven by the existing `llm_usage` table.
- Remove cosmetic clutter: Weekly Review section, Sync Status section (collapse to a top-bar dot), theme toggle (no dark mode).
- Make the entire dashboard feel deliberately "calm" — subtle shadows, gentle transitions, low-contrast borders.

### Non-goals
- No new business features (no new task types, no new email behaviors, etc.).
- No new heavy frontend dependencies (no chart library, no UI framework). SVG sparkline rendered inline.
- No restructuring of per-module views in this round.
- No dark mode. The toggle and `.dark-mode` CSS branches will be deleted entirely.

---

## 2. Visual tokens

### 2.1 Color palette (light only)

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#faf9f5` | App background — warm off-white |
| `--surface` | `#ffffff` | Card surface — slightly lighter than bg |
| `--border` | `#ebe6dc` | Card / divider borders, near-invisible |
| `--text-primary` | `#1f1c18` | Headings, body, near-black with warm tint |
| `--text-secondary` | `#6b6358` | Subtitles, body de-emphasis |
| `--text-tertiary` | `#9c9486` | Metadata, timestamps |
| `--accent` | `#c97c40` | Primary action, active nav, links — warm copper |
| `--accent-hover` | `#b56a30` | Hover state on copper |
| `--danger` | `#b85450` | Errors, destructive — muted red |
| `--success` | `#6b8e5c` | Success — muted green |

eventType badges (existing, retained):
funding (green), earnings (green), M&A (purple), leadership (amber), launch (blue), regulatory (red), partnership (teal), layoff (rose).

### 2.2 Typography

| Role | Family | Source |
|---|---|---|
| Headings, large numbers, dates | **Source Serif Pro** | Google Fonts (free) |
| Body, UI labels | **Inter** | Google Fonts (free) |
| Time / tokens / mono metadata | **JetBrains Mono** | Google Fonts (free) |

Loaded via single `<link rel="stylesheet">` to `fonts.googleapis.com`. No npm dep, no font-file checkin.

### 2.3 Spacing scale

`--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-5` 24px · `--space-6` 32px · `--space-7` 48px · `--space-8` 64px.

Existing arbitrary px values throughout `style.css` migrated to these tokens during component pass.

### 2.4 Radius scale

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Badges, pills |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 10px | Cards |
| `--radius-xl` | 14px | Modals |

### 2.5 Shadow scale

| Token | Value | Usage |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(31,28,24,0.04)` | Card resting |
| `--shadow-sm` | `0 4px 12px rgba(31,28,24,0.06)` | Card hover, popovers |
| `--shadow-md` | `0 12px 32px rgba(31,28,24,0.10)` | Modals |

Deliberately lighter than existing values; no dramatic glow.

### 2.6 Animation

- All transitions: `150–200ms cubic-bezier(0.4, 0, 0.2, 1)`
- Avoid: bouncy spring, scale pop, opacity flicker
- Prefer: subtle fade / slide

---

## 3. Layout & shell

### 3.1 Top bar (h: 56px)

Layout, left to right:

```
[ Aether ]   [ Cmd+K to search ]                  [ 14:23 ]  [ ● ]
```

- Brand name (left): Source Serif, 18px, `--text-primary`.
- Search trigger (center): pill-shaped, `--bg` filled, dotted `--border`. Click opens command palette.
- Time (right): JetBrains Mono, 13px, `--text-tertiary`. Updates every 1s (existing logic).
- Sync indicator (right): 8×8 dot, green / amber / red. Hover popover shows last sync timestamp + provider.

Removed from top bar: theme toggle, hamburger button (on desktop).

### 3.2 Sidebar (w: 240px)

Vertical text-only nav:

```
   ──────
   Today
   Tasks
   Calendar
   Email
   ──────
   Focus
   Goals
   Notes
   ──────
   Activity
```

- Background: `--surface`.
- Group dividers: 1px `--border`, 24px vertical padding.
- Module label: Source Serif, 15px, `--text-secondary`.
- Active state: `--accent` color + 2px left border in `--accent`. **No background fill.**
- Hover: `--text-primary` color (no underline, no background).
- No icons by default. (Fallback if usability suffers: hover reveals a 14px monochrome icon at the right edge — kept as a contingency.)
- Footer: version string only (e.g. `v1.0`), small, `--text-tertiary`. Brand name lives only in the top bar.

### 3.3 Dashboard view layout

```
Today — Mon 5 May
─────────────────

┌────────────────────────────────────────────────────────────┐
│  TECH NEWS                                                  │
│  [eventType]  Company                                       │
│  Hero serif title (24px)                                    │
│  Two-line summary in Inter…                                 │
│  ▲ score  💬 comments  source  2h ago        [+ Task]       │
└────────────────────────────────────────────────────────────┘

┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ news 2 │ │ news 3 │ │ news 4 │ │ news 5 │ │ news 6 │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘

┌──────────────────────────┐ ┌──────────────────────────┐
│  Tasks                   │ │  Email                   │
└──────────────────────────┘ └──────────────────────────┘

┌──────────────────────────┐ ┌──────────────────────────┐
│  Calendar                │ │  AI Usage                │
└──────────────────────────┘ └──────────────────────────┘
```

- Date header: Source Serif, 28px, `--text-primary`. Format: `Today — Mon 5 May`.
- Tech News hero: full-width card, ~280px tall. Top item rendered with hero treatment; remaining 5 items in horizontal row, each ~150px tall, 1fr columns (gap 16px).
- Lower grid: 2×2, 24px gap. Each card 32px / 24px padding.
- Card header: Source Serif H3 (18px) + optional `View all →` link in `--accent` (revealed on card hover).

### 3.4 Responsive breakpoints

- `≥ 1280px`: full layout as above.
- `768–1279px`: sidebar collapses to 64px icon-only (icons reintroduced for this breakpoint only); news secondary reduces to 3-up.
- `< 768px`: sidebar becomes drawer (existing hamburger logic restored for mobile only); all dashboard cards stack vertically.

---

## 4. AI Usage card

### 4.1 Visual layout

```
AI Usage                                            Last 7 days
───────────────────────────────────────────────────────────────

   142            18.4k              98%
   calls          tokens             success rate

   ▁▂▁▃▂▅▆        ← 7-day sparkline
   Mon Tue Wed Thu Fri Sat Sun

   ─────────────────────────────────────────
   Doubao-Seed-2.0-Code         142 calls   18.4k tok
```

- Three KPIs: today's call count, today's token sum, last-7d success rate.
- Success rate color thresholds: ≥95% `--text-secondary`, 90–95% amber `#c08a3e`, <90% `--danger`.
- Sparkline: 200×40px inline SVG, polyline. Today's bar in `--accent`, others `--text-tertiary`. X-axis labels (Mon–Sun) in 10px JetBrains Mono.
- "By model" row: shown only when ≥2 distinct models in last 7 days; otherwise omitted.
- Empty state: single line "No LLM activity yet" in `--text-tertiary`.

### 4.2 Backend

**New route**: `routes/llmUsage.js`, mounted at `/llm-usage` in `server.js`.

**Endpoint**: `GET /llm-usage/summary`

**Response shape**:

```json
{
  "today": {
    "calls": 142,
    "tokens": 18420
  },
  "successRate7d": 0.98,
  "last7d": [
    { "date": "2026-04-29", "calls": 12 },
    { "date": "2026-04-30", "calls": 18 },
    "..."
  ],
  "byModel": [
    { "model": "Doubao-Seed-2.0-Code", "calls": 142, "tokens": 18420 }
  ]
}
```

The visual shows a 7-day success rate, not today's, because today alone is too small a sample for a meaningful percentage.

**Model functions** (added to `models/LlmUsageModel.js`):

- `getTodaySummary()` — single SQL with `WHERE DATE(timestamp, 'localtime') = ?`, returns `{calls, tokens}`.
- `getSuccessRate(sinceISO)` — `SELECT AVG(success) FROM llm_usage WHERE timestamp >= ?`. Returns float `[0, 1]` or `null` when no rows.
- `getLast7Days()` — `GROUP BY DATE(timestamp, 'localtime')`, ordered ascending. Fills missing days with 0 calls in JS to keep array length = 7.
- `getByModel(sinceISO)` — `GROUP BY model` with `WHERE timestamp >= ?`. Returns array.

All three are single-statement, sub-millisecond on the existing `idx_llm_usage_timestamp` index.

### 4.3 Frontend

- Remove: `loadLlmSyncStatus()` and `#llmSyncStatus` DOM node.
- Add: `loadAiUsage()` — fetches `/llm-usage/summary`, renders into `#aiUsageCard`.
- Sparkline rendering: pure SVG `<polyline>` with normalized point coordinates. No chart library.
- Refresh interval: piggyback on existing 60s dashboard refresh tick.

### 4.4 Why no cost display

Doubao and Claude pricing differs significantly and a price table requires ongoing maintenance. v1 shows volume only. Cost computation can be added later via a separate `services/UsageCostService.js`.

---

## 5. Component patterns

### 5.1 Card

- `--surface` bg, `--radius-lg`, `--shadow-xs` resting, `--shadow-sm` on hover.
- No border. Border `--border` appears only on hover.
- Padding: 32px / 24px.
- Header: H3 serif + optional `View all →` (copper, no underline; reveals on card hover).

### 5.2 Buttons

| Variant | Bg | Border | Text | Hover |
|---|---|---|---|---|
| primary | `--accent` | none | white | bg → `--accent-hover` |
| secondary | transparent | 1px `#d6cfc1` | `--text-primary` | border → `--accent` |
| ghost | none | none | `--accent` | text → `--accent-hover` + 1px underline |
| danger | `--danger` | none | white | bg darken |

- Radius `--radius-md`. Padding 8/16 (small), 12/24 (medium). Font weight 500.
- No shadow on buttons.

### 5.3 Inputs

- 1px `--border`, bg `--bg`, placeholder italic `--text-tertiary`.
- Focus: border → `--accent`. **No glow / box-shadow.**
- Heights: 40px (default), 56px (large — login / signup style).

### 5.4 Badges

- eventType badges retain their colored bg+text mappings (good against cream bg).
- Company badge: change from blue to copper-tonal — bg `rgba(201,124,64,0.08)`, text `--accent`.
- Priority badge: desaturated tonal palette.

### 5.5 Modal

- Backdrop: `rgba(31,28,24,0.4)`. **No blur** (claude.ai doesn't use blur).
- Card: `--surface`, `--radius-xl`, `--shadow-md`, padding 40px.
- Close (×): ghost button, top-right, 24/20px offset.

### 5.6 Toast (existing `showToast`)

- Bottom-center, 32px from bottom.
- Success: cream bg + 4px `--accent` left bar + dark text.
- Error: cream bg + 4px `--danger` left bar.
- Slide up from +16px, fade in, 180ms ease-out.

### 5.7 Checkbox / radio

- 18×18 box, 1.5px `--accent` border, no fill when unchecked.
- Checked: `--accent` filled + white SVG check. Custom div, hidden native input.

### 5.8 Command palette

- Centered modal, 640px wide, 15vh from top.
- Search input: 56px tall, serif placeholder.
- Result item: hover reveals 2px `--accent` left border (matches sidebar active state). No bg highlight.
- Group label: JetBrains Mono uppercase 11px `--text-tertiary`.

---

## 6. Files modified / created

| Op | Path | Notes |
|---|---|---|
| new | `docs/superpowers/specs/2026-05-05-ui-claude-style-design.md` | This spec |
| new | `routes/llmUsage.js` | `GET /llm-usage/summary` |
| major | `public/style.css` | Tokens + all components + shell + dashboard layout |
| major | `public/index.html` | Dashboard restructure, drop 3 sections, font link |
| major | `public/script.js` | `loadAiUsage` + sparkline; add `loadAiUsage` to existing 60s `setInterval` block; remove `loadLlmSyncStatus`, `toggleTheme`, theme localStorage migration on first load; Tech News hero render |
| medium | `models/LlmUsageModel.js` | Add 3 aggregation functions |
| small | `server.js` | Mount `/llm-usage` route |

### Untouched (relies on token cascade)

- All per-module views (Board / Calendar / Email / List / Today / Focus / Goals).
- Backend business logic (NewsService, TaskModel, EmailModel, etc.).
- Existing 26 tests.

---

## 7. Implementation steps & order

Each step is a small, independently committable unit. Run `npm test` (must stay 26/26) and a manual dashboard refresh after each.

1. **Tokens** — replace CSS variables in `:root` (1h)
2. **Fonts + body baseline** — add `<link>`, set `body { font-family }`, headings (30m)
3. **Component primitives** — button, input, card, badge, modal, toast, checkbox (3h)
4. **Global shell** — top bar, sidebar, command palette (2h)
5. **Dashboard restructure (HTML)** — drop Weekly Review / LLM Status / Sync Status sections; add hero news layout; 2×2 grid (1h)
6. **Tech News hero rendering (JS)** — split first item into hero treatment, remaining 5 into secondary row (1h)
7. **AI Usage** — model functions + `routes/llmUsage.js` + frontend `loadAiUsage` + SVG sparkline (2h)
8. **Drop dark mode** — delete `.dark-mode` selectors, `toggleTheme` function, `theme` localStorage key (1h)
9. **Smoke + tests** — `npm test`, server start, `/health` 200, `/llm-usage/summary` shape (30m)

---

## 8. Verification

### Automated

- `npm test` must report 26/26 after every step.
- `node --check public/script.js` must pass after every JS edit.
- Server starts cleanly: log shows `Aether Dashboard started`, no startup errors.
- Endpoint smoke: `curl /health` returns 200; `curl /llm-usage/summary` returns the shape in §4.2.

### Manual (user-driven)

- After each step lands, user refreshes dashboard. Visual issues are flagged immediately and patched.
- Final visual sweep: scroll the entire dashboard, click into command palette, open one modal (e.g. project edit). Confirm coherence.

### What I cannot verify

I have no browser access. All visual confirmation depends on the user. Pre-flight bugs that DON'T require a browser (HTML structure, CSS syntax, JS syntax) will be caught via `node --check` and structural greps.

---

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| CSS migration leaks (selectors not updated to new tokens) | high | After tokens land, `grep -nE '#[0-9a-f]{6}' public/style.css` to find any hardcoded color and migrate; same for `px` values not in spacing scale. |
| Sidebar text-only nav causes "where do I click" friction | medium | Contingency: hover reveals a tiny monochrome icon at right edge. Decision after user's first review. |
| Tech News hero looks empty when daily picks < 6 | medium | Render fewer secondary cards; never blank slots. If `items.length === 0`, hero shows "No news for today yet" + Sync Now CTA (existing pattern). |
| Removing dark mode breaks users who had `theme=dark` in localStorage | low | On load, ignore localStorage `theme` key (or actively delete it once on first load). |
| AI Usage card showing 0 / 0 when LLM hasn't been called yet | certain on fresh installs | Empty state copy "No LLM activity yet" already specified. |
| Sparkline math edge case with 0 calls all 7 days | possible | Render a flat dotted line at the bottom of the SVG with same Mon–Sun labels. |

---

## 10. Open questions for review

- None at design-approval time. All decisions resolved during brainstorming. If something surfaces during implementation, it will be raised inline rather than re-opening the spec.
