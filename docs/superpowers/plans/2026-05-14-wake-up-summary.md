# 2026-05-14 · Wake-up summary — Aether perf overhaul

干完了。整体路径：1 个全栈调研轮 → 1 个 spec + plan → 7 个独立分支并按"修改 → 测试 → rebase → push"流程过；最后用一个本地 integration 分支验过 7 个分支无冲突共存且全测 + e2e 全绿。每个分支独立可 review、独立可 merge。

## 你需要做的事

```bash
# 1. 拉所有分支
git fetch --all

# 2. 在 GitHub 网页上为这 7 个分支开 PR（仓库没装 gh CLI，没法自动开）
#    建议 merge 顺序见下方"建议 merge 顺序"
```

PR 创建链接（github.com 给的 quick-create URL，每行点一下就能开）：
- https://github.com/labofaether/AetherDashboard/pull/new/fix/dashboard-render-and-test
- https://github.com/labofaether/AetherDashboard/pull/new/perf/db-pragmas-and-storage
- https://github.com/labofaether/AetherDashboard/pull/new/perf/backend-stats-aggregation
- https://github.com/labofaether/AetherDashboard/pull/new/perf/server-static-compression
- https://github.com/labofaether/AetherDashboard/pull/new/perf/llm-pipeline-resilience
- https://github.com/labofaether/AetherDashboard/pull/new/perf/frontend-overhaul
- https://github.com/labofaether/AetherDashboard/pull/new/test/playwright-smoke-and-coverage

## 已 commit 到 main 的东西

- `8fe203f docs: add perf overhaul spec + plan (2026-05-14)` — spec + plan 文档落地

## 7 个 feature 分支

| # | 分支 | tip commit | 说明 | 风险 |
|---|---|---|---|---|
| 1 | `fix/dashboard-render-and-test` | `097d300` | 删 dashboard 里调用已删除函数（renderSyncStatus / renderLlmSyncStatus）；修 `getLast7Days` 时区 bug | 极低 |
| 2 | `perf/db-pragmas-and-storage` | `d06394e` | SQLite pragma 调优 + 三模型 batched prune + DataCleanupService 加 LLM/API/News 清理 | 低 |
| 3 | `perf/backend-stats-aggregation` | `1e147d9` | `getLlmStats` / `getApiStats` 把 168 小时 JS filter 换成 SQL `strftime` 聚合 | 低 |
| 4 | `perf/server-static-compression` | `f6464c9` | gzip 中间件 + 静态资源 etag/maxAge=1h；新依赖：`compression` | 极低 |
| 5 | `perf/llm-pipeline-resilience` | `7628ffd` | LLM 超时 15s + 并发上限 3 + sourceId 预 dedup + 关键词 regex 编译 + EmailFilterService 修 thinking-block 兼容 + 合并 logLlmCall | 中（动了 Doubao 调用形态） |
| 6 | `perf/frontend-overhaul` | `7c85e4c` | 时钟 1s→30s、活动日志 5s→30s、每 task setInterval → 单全局 tick、`<script defer>`、`tasksByProject` Map 预算 | 低 |
| 7 | `test/playwright-smoke-and-coverage` | `81c98d5` | 加 `test/e2e/dashboard.smoke.js` + `npm run test:e2e`；新 devDep：`playwright`；首次跑需 `npx playwright install chromium`（已为你装好） | 极低 |

每个分支都已 rebase 到 fix 分支之上；CI 失败时合并 fix 分支即可 catch up。

## 验证情况

| 测试 | 数 | 状态 |
|---|---|---|
| `npm test`（unit + integration）整合后 | 44 | 全绿 |
| `npm run test:e2e`（Playwright headless） | 2 | 全绿 |
| 启动后 `curl -I /script.js` | — | 见到 `Cache-Control: public, max-age=3600` |
| 启动后 `/llm-usage/summary` | — | 返回 7 天本地时区 buckets，不再 throw |
| Manual playwright smoke 之前发现的 `renderSyncStatus` ReferenceError | — | 修复后控制台干净 |

## 建议 merge 顺序

1. `fix/dashboard-render-and-test`（其他分支都已 rebase 在它之上）
2. 后续 6 个分支顺序无所谓，可并行 review
3. 最后视情况删 `ui-redesign-claude-style` 旧分支（已合并，未清理）

## 不在本批次的 punted 项（明确没做）

- Outlook 同步指数退避 / 多页 fetch loop —— 个人单账户用不到
- Token 加密用 `scryptSync` 派生 —— 威胁模型不匹配
- Schema 迁移版本表 —— 现 idempotent ALTER 够用
- FTS5 / 虚拟列表 —— 数据量太小（5 tasks / 236 emails）
- 命令面板 hover 拦截 —— 是我之前 Playwright 选择器太宽匹配到 palette 内部的 "Tasks" 字串，不是真 bug；新 e2e 测试用更精确选择器

## 顺手发现的事

- `aether.db-wal` 之前 4MB / 现在 916KB — pragma 生效后会按 200 page 自动 checkpoint，并在每次启动 truncate 一次
- 你机器上有个跑了 8 天的 Aether server 进程（PID 59850）和一个 Next.js 进程（PID 54204 跑 6dolandingpage）共占 3000 端口，导致测试中途 curl 挂死 — **我没杀**。本次所有 e2e 都用了 PORT=3458/3459 + `:memory:` 隔离。要不要把那俩老进程 kill 你自己看
- GitHub dependabot 提示仓库 main 分支有 1 个 moderate 漏洞：https://github.com/labofaether/AetherDashboard/security/dependabot/8 —— 不在本次 perf 范围，你早上看一下

## 文件落点

- spec：`docs/superpowers/specs/2026-05-14-perf-overhaul-design.md`
- plan：`docs/superpowers/plans/2026-05-14-perf-overhaul.md`
- 本 wake-up：`docs/superpowers/plans/2026-05-14-wake-up-summary.md`
