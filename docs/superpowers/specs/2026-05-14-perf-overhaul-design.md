# 2026-05-14 · Aether 全栈性能与正确性 Overhaul — 设计文档

## 背景

应用是单用户、跑在个人 Mac 上的本地 dashboard。无分布式 / HA 需求。重点：**响应延迟、后台资源消耗、轻量化存储、消除已知 bug**。

调研基线（2026-05-14）：

- 仓库：`labofaether/AetherDashboard`，main 分支 clean
- DB 体量：`aether.db` 916 KB（5 tasks / 236 emails / 76 news / 1000 llm_usage / 4 projects）
- WAL：4 MB（异常，大于 DB 本体；提示 checkpoint 没在跑）
- 前端：单文件 `script.js` 88 KB、`style.css` 71 KB、`index.html` 28 KB
- 测试：`npm test` ~215ms，**1 失败**：`getLast7Days returns array of 7 day-buckets`（actual 0 / expected 2）
- 浏览器 smoke test 发现 **每次 dashboard 渲染都抛 ReferenceError**：`renderSyncStatus is not defined`（commit `af38af4` 删函数没删 caller）

## 五条调研主线产出（节选）

并行 5 个 Explore agent 覆盖 backend / frontend / background services / tests / LLM 管线，要点已逐项核实，剔除臆测。

## 目标 / 非目标

**目标**

- 修复阻塞性 bug（dashboard render error、失败测试）
- 用 SQLite pragma 与定期清理把 WAL / 表行数压回轻量
- 把 dashboard 首屏关键路径的同步 JS 阻塞与重复网络请求收敛
- 给后台 LLM 调用加超时、批并发、生命周期保护
- 落一个 Playwright 烟雾测试到仓库（防止类似 dashboard render error 再次溜进来）

**非目标**

- 引入 bundler / TypeScript / framework
- 引入 Redis / 队列 / 微服务
- FTS5、向量检索、虚拟列表（数据量太小，YAGNI）
- KDF 替换、密钥版本化（个人应用低收益）
- Schema 迁移框架（用现有 idempotent ALTER 即可）

## 改动按层级

### Layer 1 — 阻塞性 bug 修复（Iter 1）

| ID | 文件 | 改动 |
|---|---|---|
| B1 | `public/script.js:1786-1787` | 删 `renderSyncStatus()` 与 `renderLlmSyncStatus()` 调用与上方注释（commit af38af4 漏删） |
| B2 | `models/LlmUsageModel.js:108-126` + `test/llm-usage.test.js:50-60` | `getLast7Days` 时区一致化：用 `utils/dateRange.localDateNDaysAgo` 构造桶 key；测试同样用 `todayLocal()`；与 query 的 `DATE(timestamp, 'localtime')` 对齐 |

### Layer 2 — 存储瘦身 + DB pragma（Iter 2-A）

| ID | 改动 |
|---|---|
| S1 | `db.js`: 新增 pragma — `synchronous = NORMAL`、`cache_size = -64000`（64 MB）、`mmap_size = 30000000`、`temp_store = MEMORY`、`wal_autocheckpoint = 200`、`journal_size_limit = 10485760`（10 MB 上限） |
| S2 | `models/LlmUsageModel.js`、`models/ApiUsageModel.js`、`models/ActivityLogModel.js`：把 `INSERT` 后立即 `DELETE … NOT IN (SELECT … LIMIT N)` 改为"达到阈值才修剪"模式（计数器 + 每 50 次 insert 修剪一次） |
| S3 | `services/DataCleanupService.js`：新增 `cleanupLlmUsage()` / `cleanupApiUsage()` / `cleanupNewsItems()`；写入 `runFullCleanup()` 每日触发；保留期参数走 `config/dataRetention.js`（已存在，校验/补） |
| S4 | `db.js`：开机一次性 `db.pragma('wal_checkpoint(TRUNCATE)')` —— 把当前 4MB WAL 截掉 |

### Layer 3 — 后端性能（Iter 2-B）

| ID | 改动 |
|---|---|
| P1 | `models/LlmUsageModel.js:getLlmStats` + `models/ApiUsageModel.js`：把"取全量再 JS filter 168 小时"换为单条 `SELECT strftime('%Y-%m-%dT%H', timestamp) bucket, COUNT(*) GROUP BY bucket WHERE timestamp >= ?` |
| P2 | `server.js`：装 `compression` 中间件（已不在依赖中，要 npm install） |
| P3 | `server.js:70`：`express.static(public, { etag: true, maxAge: '1h', lastModified: true })` —— `maxAge` 给 1h 而非 1d，开发体验/缓存折中 |
| P4 | `routes/emails.js`：GET `/emails` 默认 `limit=50`（schema 已支持，只是没默认值）—— 但 dashboard 仍可显式不限以保持兼容；只对未提供 limit 的调用生效 |
| P5 | `services/NewsService.js:fetchAndEvaluate`：循环外一次性把 `today` + 已存在的 `sourceId` 拉成 Set，避免每条 `getNewsBySourceId` 单查 |
| P6 | `services/NewsService.js:evaluateWithLLM` + `services/EmailFilterService.js:filterEmail`：axios 请求加 `timeout: 15000`；NewsService 评估循环改为 Promise.allSettled 配并发上限 3 |
| P7 | `services/EmailFilterService.js`：模块加载时编译 `IMPORTANT_KEYWORDS` / `UNIMPORTANT_KEYWORDS` 为 RegExp（`new RegExp('\\b(' + kws.join('|') + ')\\b', 'i')`），替换 `.some(k => str.includes(k))` |
| P8 | `services/EmailFilterService.js`：3 个 `logLlmCall` 合并为单一收尾点（在 try 块末尾），降可读性风险 |

### Layer 4 — 前端 perf 与 UX（Iter 3）

| ID | 改动 |
|---|---|
| F1 | `public/script.js`：activity-log 轮询 5s → 30s（debug 后真有需要可以再降） |
| F2 | `public/script.js`：60s 多 fetch 错峰（emails / events / news / usage / sync）；用单个 setInterval + 模运算分散 |
| F3 | `public/script.js:189`：clock 1000ms → 30000ms（顶栏只显示分钟级），去掉每秒重绘 |
| F4 | `public/script.js:961`：每任务一个 `setInterval` 改为单全局 tick 扫所有 `[data-countdown]` |
| F5 | `public/index.html`：`<script defer src="script.js">`（HTML 解析不阻塞） |
| F6 | `public/script.js:renderProjects`：循环外预算 `tasksByProject = Map<projectId, Task[]>`，避免 O(projects × tasks) |
| F7 | command palette 拦截 hover bug：定位是 `.command-palette` 默认 `display:flex` + `.hidden` 没生效，还是 z-index 覆盖 board；最小修复（无效遮罩 → `pointer-events: none` 当 `.hidden` 时） |
| F8 | （顺手）`public/script.js`：把 `setupDropZone` 在 `renderTasks` 里反复 attach 改为事件委托到 `document` |

### Layer 5 — 测试与自动化（Iter 3 同批）

| ID | 改动 |
|---|---|
| T1 | 新增 `test/playwright-smoke.test.js`（用 node:test + 内嵌 playwright 启动），断言 `http://localhost:3000` 加载完无 console.error；把它放到 `npm run test:e2e` 单独 script，不进 `npm test` 默认（依赖 chromium） |
| T2 | `test/llm-usage.test.js`：补 `getLast7Days` 跨日 / 空数据 case |
| T3 | `test/models.test.js` 或新文件：补 `NewsModel` 基础 CRUD + 选 daily 多样性测试 |

### Layer 6 — 文档与进程清理（Iter 4）

| ID | 改动 |
|---|---|
| D1 | `README.md`：补一行说"WAL 上限已设 10MB；如需手动 checkpoint 看 db.js" |
| D2 | `CLAUDE.md`：在"Database"段补 pragma 现状 |

## 执行流程

按 iteration 分批；每个 fix 走独立分支：

```
main
 ├── docs/perf-overhaul-spec-and-plan       (本次 commit；spec + plan)
 ├── fix/dashboard-render-and-test          (B1+B2，最优先)
 ├── perf/db-pragmas-and-storage            (S1-S4)
 ├── perf/backend-stats-and-cleanup         (P1, S3)
 ├── perf/llm-pipeline-resilience           (P5, P6, P7, P8)
 ├── perf/server-static-compression         (P2, P3, P4)
 ├── perf/frontend-renders-and-polling      (F1-F4, F6, F8)
 ├── perf/frontend-load-and-palette         (F5, F7)
 └── test/playwright-smoke-and-coverage     (T1, T2, T3)
```

每个分支：`git checkout -b … main` → 改 → `npm test` → 关键改动 webapp-testing 验证 → commit → push → 单独 PR 标 `auto-perf-overhaul`。

最后一轮 review：合并完检查回归 + 写 wake-up summary。

## 验证标准

每条改动必须满足：
- `npm test` 全绿
- 触前端的改动：playwright smoke pass + 视觉无回归
- DB pragma 改动：开机后 `aether.db-wal` < 10MB，老 WAL 被 checkpoint 截掉
- 性能类改动：相关接口 manual curl `time` 量化对比，差异写 PR 描述

## 风险与回滚

- 每个分支独立，回滚 = 删/不合并该分支
- `pragma` 改动如果导致写性能退化，单独回滚 `synchronous = NORMAL` 即可（这是最有可能的"过激"配置）
- LlmUsage prune 改成阈值后，旧逻辑的"严格 1000 行"会松到 ≤ 1050，无业务影响
- `compression` 中间件极小概率与某个 endpoint 的二进制响应冲突 —— 当前没有，安全
- `defer script.js`：必须确认其他 `<script>` 不依赖在 `script.js` 之前的 inline 行为（已检查 `index.html` 无 inline JS）

## 不在本次 spec 内（明确 punted）

- Outlook 同步指数退避 / 多页 fetch（个人 Mac 单账户，目前手感够用）
- 引入 EventEmitter 替代 ReminderService 自定义 listeners（清晰度问题，非 perf）
- `crypto.scryptSync` 替换 `sha256` 派生（个人应用，威胁模型不匹配）
- FTS5 / 索引重建（5 tasks / 236 emails 体量不需要）
- 严格 schema 版本表（idempotent ALTER 够用）
