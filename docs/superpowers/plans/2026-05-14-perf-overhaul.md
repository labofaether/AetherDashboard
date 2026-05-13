# 2026-05-14 · Aether 全栈性能 Overhaul — 实施 Plan

配套 spec：[`docs/superpowers/specs/2026-05-14-perf-overhaul-design.md`](../specs/2026-05-14-perf-overhaul-design.md)

每条任务格式：

> **目标 / 改动文件 / 步骤 / 验证 / 提交标题**

## Iter 1 — 阻塞性 bug（分支：`fix/dashboard-render-and-test`）

### Task 1.1 · 删 dashboard 中已不存在函数的调用
- **改动**：`public/script.js` 删 1785 行的 `// Sync Status and LLM Status` 注释 + 1786 `renderSyncStatus()` + 1787 `renderLlmSyncStatus()`
- **验证**：`node --check public/script.js`；启动后浏览器打开 `http://localhost:3000`，DevTools 控制台无 ReferenceError
- **commit**：`fix(script): remove dead renderSyncStatus / renderLlmSyncStatus calls (af38af4 follow-up)`

### Task 1.2 · 修 `getLast7Days` 时区一致性 + 测试
- **改动**：
  - `models/LlmUsageModel.js:108-126`：导入 `localDateNDaysAgo` from `utils/dateRange.js`；output bucket key 改用 `localDateNDaysAgo(i)` 而非 `toISOString().slice(0,10)`
  - `test/llm-usage.test.js:50-60`：`today` 改用 `todayLocal()`；assertion 沿用 local-date 约定
- **验证**：`node --test test/llm-usage.test.js` 全绿；`npm test` 全绿
- **commit**：`fix(llm-usage): align getLast7Days bucket keys to local timezone`

## Iter 2A — 存储瘦身 + DB pragma（分支：`perf/db-pragmas-and-storage`）

### Task 2A.1 · DB pragma
- **改动**：`db.js` initSchema 末尾，WAL 之后追加：
  ```js
  if (dbPath !== ':memory:') {
      db.pragma('synchronous = NORMAL');
      db.pragma('cache_size = -64000');
      db.pragma('mmap_size = 30000000');
      db.pragma('temp_store = MEMORY');
      db.pragma('wal_autocheckpoint = 200');
      db.pragma('journal_size_limit = 10485760');
      db.pragma('wal_checkpoint(TRUNCATE)'); // 一次性截掉历史 WAL
  }
  ```
- **验证**：`node --test`；启动 server，确认 `aether.db-wal` 不再 4MB

### Task 2A.2 · 三模型从"每写必删"改"达阈值才删"
- **改动**：`models/LlmUsageModel.js`、`models/ApiUsageModel.js`、`models/ActivityLogModel.js`
  - 在模块顶层维护 `let writesSincePrune = 0`
  - 每次 insert 后 `writesSincePrune++`；`if (writesSincePrune >= 50) { prune(); writesSincePrune = 0; }`
  - 阈值导出 `PRUNE_BATCH_SIZE = 50`，方便测试调小
- **验证**：模型现有测试全绿；新增一个测试：连续 insert 60 次后行数 ≤ MAX + PRUNE_BATCH_SIZE
- **commit**：`perf(models): batch prune to every 50 writes (was per-write)`

### Task 2A.3 · DataCleanupService 加 LLM/API/News 清理
- **改动**：
  - `services/DataCleanupService.js`：新增 3 个函数，分别按 `config/dataRetention.js` 的 `llmUsageRetentionDays` / `apiUsageRetentionDays` / `newsRetentionDays`（缺则设默认 30 / 30 / 30）
  - 加入 `runFullCleanup()` 调用链
  - `config/dataRetention.js`：补字段 + JSDoc
- **验证**：新增 `test/services/data-cleanup.test.js`：插入 100 条带过期 timestamp 的行，调清理函数后只剩近 N 天
- **commit**：`feat(cleanup): add llm_usage / api_usage / news_items retention sweep`

## Iter 2B — 后端性能（按子任务并行子分支或合并到一个分支均可）

### Task 2B.1 · SQL 端聚合 LLM/API 小时桶（分支：`perf/backend-stats-aggregation`）
- **改动**：`models/LlmUsageModel.js` `getLlmStats(hours)` + `models/ApiUsageModel.js` 同名
  - 替换 JS for 循环 filter，用单条 SQL：
    ```sql
    SELECT strftime('%Y-%m-%dT%H:00', timestamp, 'localtime') AS bucket, COUNT(*) AS count
    FROM llm_usage WHERE timestamp >= ? GROUP BY bucket ORDER BY bucket
    ```
  - 在 JS 端把缺失桶补 0（保持原契约）
- **验证**：现有测试 + 新增"覆盖空小时返回 0"
- **commit**：`perf(stats): aggregate hour buckets in SQL (was O(rows*hours) JS scan)`

### Task 2B.2 · Express 静态资源 + 压缩（分支：`perf/server-static-compression`）
- **改动**：
  - `npm install --save compression`
  - `server.js` 顶部 `const compression = require('compression');` → `app.use(compression());`（在 routes 前）
  - `server.js:70` `express.static(public, { etag: true, maxAge: '1h', lastModified: true })`
- **验证**：`curl -H 'Accept-Encoding: gzip' -I http://localhost:3000/script.js` 应见 `Content-Encoding: gzip` 与 `Cache-Control: public, max-age=3600`
- **commit**：`perf(server): enable gzip compression and static asset caching`

### Task 2B.3 · 邮件 list 默认分页 + LLM 调用超时 + 并发（分支：`perf/llm-pipeline-resilience`）
- **改动**：
  - `routes/emails.js`：`emailListQuerySchema` 给 `limit` 默认 50；route handler 不传 limit 时按默认；显式传保留行为
  - `services/NewsService.js:evaluateWithLLM` + `services/EmailFilterService.js:llmFilter`：axios 加 `timeout: 15000`
  - `services/NewsService.js:fetchAndEvaluate`：评估循环改 `pMapWithConcurrency(items, 3, evaluateWithLLM)`（写一个 9 行的本地 helper，避免引依赖）
  - `services/NewsService.js:fetchAndEvaluate`：循环外预取 `existingIds = new Set(NewsModel.getRecentSourceIds(7days))`，循环内 `if (existingIds.has(s.sourceId))` 跳过 LLM
  - `services/EmailFilterService.js`：模块加载时编译 keyword RegExp，替换 `.some(includes)`
  - `services/EmailFilterService.js`：3 个 `logLlmCall` 合并为 try 结尾单点
- **验证**：`npm test`；手动跑 `node -e "require('./services/NewsService').sync()"` 看 LLM 并发不超 3
- **commit**：`perf(llm-pipeline): add timeouts, concurrency cap, dedup pre-fetch, regex keyword`

## Iter 3 — 前端 perf + UX（分支：`perf/frontend-renders-and-polling` + `perf/frontend-load-and-palette`）

### Task 3.1 · 轮询节流（分支 1）
- **改动**：`public/script.js`
  - activity-log poll 从 5000ms 改 30000ms
  - 60s 多 fetch：定义 `setInterval(tick, 10000)`，tick 内按 `tickIdx % 6` 错峰触发不同 fetch（emails / events / news / usage / sync / activity）
  - clock 1000ms → 30000ms
- **验证**：playwright 跑 30s，DevTools network 截图证实没有 5 个 fetch 同时打的现象

### Task 3.2 · 单全局 tick 替代每任务 `setInterval`（分支 1）
- **改动**：`public/script.js:961` 那段：渲染时给倒计时元素 `data-countdown="<dueDate ISO>"`；模块加载一次 `setInterval(updateAllCountdowns, 30000)`，回调 `querySelectorAll('[data-countdown]').forEach`
- **验证**：playwright 检查倒计时仍正常更新；启动后用 `setInterval` 计数 < 5

### Task 3.3 · `tasksByProject` 预算（分支 1）
- **改动**：`renderProjects()` 入口前算 `const byPid = new Map(); allTasks.forEach(t => byPid.set(t.projectId, (byPid.get(t.projectId)||0)+1));` 然后渲染用这个 map
- **验证**：现有测试无影响（纯前端）；视觉与之前一致

### Task 3.4 · `setupDropZone` 改委托（分支 1）
- **改动**：`script.js:842-854` 已是 document delegation 的同款；把 `setupDropZone` 改为模块级 `init` 一次性绑定，`renderTasks` 不再调用它
- **验证**：playwright 拖拽场景测试

### Task 3.5 · `<script defer>` + 命令面板 hover bug（分支 2）
- **改动**：
  - `public/index.html`：所有 `<script src="…">` 加 `defer`
  - 调查 `#commandPalette`：在 CSS 给 `.command-palette` 设 `pointer-events: none`，仅当 `.command-palette.open` 才 `pointer-events: auto`；JS 层确认开关用 class 而非 inline display
- **验证**：playwright 重跑 task_actions.py，能 hover 到第一个 task

## Iter 3 — 测试与自动化

### Task 3.6 · Playwright smoke 测试入仓（分支：`test/playwright-smoke-and-coverage`）
- **改动**：
  - 新增 `test/e2e/dashboard.smoke.js`：用 `node:test` + `playwright`；启动 dev server，加载首页，断言 `console.error` 数 = 0
  - `package.json`：新增 `"test:e2e": "node --test test/e2e/*.smoke.js"`；不挂在 `npm test` 默认
  - 在 `README.md` / `CLAUDE.md` 加一行说明如何跑
- **验证**：`npm run test:e2e` 在合并完所有 fix 后通过；故意 revert B1（renderSyncStatus 调用）应该让它失败

### Task 3.7 · LlmUsage / News 模型补测试
- 见 spec T2 / T3
- **commit**：`test: add getLast7Days edge cases + NewsModel CRUD coverage`

## Iter 4 — 收尾 review

1. 在 main 上拉取所有合并完的分支，整体 `npm test` 全绿
2. 浏览器开 dashboard：DevTools console 无 error / 无 warning（修过的）
3. `du -sh aether.db*`：WAL ≤ 1MB（cleanup 与 wal_autocheckpoint 已生效）
4. 跑一次完整 webapp-testing 烟测；截图归档
5. 给每个 PR 写描述：动机 / 变更摘要 / 验证步骤
6. 把所有 PR 链接 + benchmarks before/after 整理成"wake-up summary"

## 自主执行模式（用户睡眠期）

- 每个分支由当前会话内 subagent（Agent + worktree isolation）独立完成
- 分支间无共享状态 / 无相互依赖 → 可并行
- 完成后由主 session 顺序 push + 开 PR；**绝不 push main**，**绝不 force push**
- 每轮失败 fallback：留分支不合并，task 标 in_progress 并写错误到本 plan 的 "Issues encountered" 段
