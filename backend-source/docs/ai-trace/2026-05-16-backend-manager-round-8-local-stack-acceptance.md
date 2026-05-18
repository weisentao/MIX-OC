# 2026-05-16 后端经理 Round 8：本地整套服务架设与上线验收

## 本轮目标

在本机完整架设并验收前端、后端、MySQL 与 DeepSeek AI 链路，解决用户反馈的“前端所有任务提示后端同步失败”和“DeepSeek 接入后不能使用”的问题。前端只读，不修改；后端负责修复、启动、验证与溯源。

## 本轮调度

本轮按后端经理模式调度并回收 15 个子代理，分组覆盖：

- 运行态与端口：MySQL `3306`、后端 `13001`、前端 `15173`。
- 同步链路：任务、排期、画板、模板、人力资源与工作区 bootstrap。
- AI 链路：首页 AI、`home-assistant`、人力 `assignment-advice`。
- 鉴权/RBAC：真实 JWT、伪 token、401 根因。
- 安全：DeepSeek key 不进前端、不进日志、不进接口响应。
- 上线门禁：全量测试、生产 smoke、前端契约 smoke。

## 本地架设步骤（可复现）

> 以下命令均为本机复现口径，**使用变量名，不写真实密码/API key/token**。

### 0) 统一变量（PowerShell）

```powershell
$env:XJG_RUNTIME_DIR = 'C:\Users\pveadmin\Desktop\mutou\.runtime'
$env:MYSQL_ROOT_PASSWORD = '<MYSQL_ROOT_PASSWORD>'
$env:ADMIN_INITIAL_PASSWORD = '<ADMIN_INITIAL_PASSWORD>'
$env:DEEPSEEK_API_KEY = '<DEEPSEEK_API_KEY_OR_EMPTY>'
$env:DEEPSEEK_HOME_API_KEY = '<DEEPSEEK_HOME_API_KEY_OR_EMPTY>'
$env:DEEPSEEK_HR_API_KEY = '<DEEPSEEK_HR_API_KEY_OR_EMPTY>'

$BackendRoot = 'C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source'
$FrontendRoot = 'C:\Users\pveadmin\Desktop\mutou\第一版源代码\frontend-source'
$NodeExe = 'C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe'
```

### 1) 启动 MySQL（先数据库）

```powershell
Set-Location $BackendRoot
powershell -ExecutionPolicy Bypass -File .\scripts\portable-mysql.ps1 -Action start
```

预期：`127.0.0.1:3306` 开始监听。

### 2) 启动后端（再 API）

```powershell
Set-Location $BackendRoot
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Process -FilePath $NodeExe -WorkingDirectory $BackendRoot -WindowStyle Hidden -ArgumentList 'scripts/start-production.mjs' -RedirectStandardOutput ".\data\runtime\server-13001-$ts.out.log" -RedirectStandardError ".\data\runtime\server-13001-$ts.err.log"
```

预期：日志出现 `xjg-api started on http://localhost:13001`。

### 3) 启动前端（最后代理）

```powershell
Set-Location $FrontendRoot
Start-Process -FilePath 'npm.cmd' -WorkingDirectory $FrontendRoot -WindowStyle Hidden -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','15173' -RedirectStandardOutput "C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\vite-15173.out.log" -RedirectStandardError "C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\vite-15173.err.log"
```

预期：日志出现 `Local: http://localhost:15173/`。

### 4) 健康检查（按顺序）

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:13001/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:15173/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:15173/
```

预期：后端健康 `200`、前端代理健康 `200` 且 `ready=true`、首页 `200`。

## PID 取证时间与获取方式（单实例确认）

取证时间：`2026-05-16 16:07:15 +08:00`。

执行命令（PowerShell）：

```powershell
Get-NetTCPConnection -LocalPort 13001,15173,3306 -State Listen |
  Sort-Object LocalPort |
  Select-Object LocalAddress,LocalPort,OwningProcess,State

Get-Process -Id (
  Get-NetTCPConnection -LocalPort 13001,15173,3306 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique
) | Select-Object Id,ProcessName,StartTime,Path
```

当次结果（单端口单实例）：

- `127.0.0.1:3306` -> PID `21380`（`mysqld.exe`）。
- `:::13001` -> PID `20916`（`node.exe`，后端）。
- `0.0.0.0:15173` -> PID `26788`（`node.exe`，前端 dev server）。

## 根因与处理

### 1. 本地后端实例冲突

验收中出现过 `13001` 短暂不可用。根因不是业务接口崩溃，而是多个后端进程竞争同一端口，新进程日志出现 `EADDRINUSE: address already in use :::13001`。已清理旧的 `13001` 监听进程，并只保留一个稳定后端实例。

当前稳定实例：

- 后端：`127.0.0.1:13001`，PID `20916`。
- 前端：`127.0.0.1:15173`，PID `26788`。
- MySQL：`127.0.0.1:3306`，PID `21380`。

### 2. HR 管理列表接口 500

`GET /api/hr/employees?limit=5` 在真实 MySQL 下返回 500，错误为 `Incorrect arguments to mysqld_stmt_execute`。根因是 HR 多个列表查询使用 `LIMIT ? OFFSET ?` prepared 参数，在当前 MySQL/mysql2 组合下会触发执行参数异常。

修复方式：

- 保留所有搜索、状态、部门等过滤条件的参数化查询。
- 对 `limit/offset` 先做整数清洗、范围限制，再以内联安全分页 SQL 输出。
- 同类处理覆盖 HR 员工、部门、职位、考勤、请假、招聘、候选人、绩效、薪资列表查询。

### 3. 前置 JSON 解析失败无 requestId

畸形 JSON 请求会在 `express.json()` 阶段失败，原来 `requestLogger` 挂载在 body parser 之后，导致这种失败响应缺少 `X-Request-Id`，日志也不易对齐。

修复方式：

- 新增 `assignRequestId` 中间件。
- 在 `express.json()` 与 `express.urlencoded()` 之前挂载。
- `requestLogger` 保持记录请求完成日志，并兼容已有 `req.requestId`。

### 4. DeepSeek 双业务 Key

用户提供了两把 DeepSeek key，分别用于首页与人力。当前后端已按业务隔离：

- 首页/工作区 AI：优先 `DEEPSEEK_HOME_API_KEY`，回退 `DEEPSEEK_API_KEY`。
- 人力 assignment advice：优先 `DEEPSEEK_HR_API_KEY`，回退 `DEEPSEEK_API_KEY`。
- 配置接口只返回布尔状态，不返回 key 明文。
- 上游错误与日志写入前经过脱敏，不输出 `sk-` 或 `Bearer` 明文。

## 本轮后端改动

- `src/app.js`
  - 在 body parser 前挂载 `assignRequestId`。
- `src/middlewares/requestLogger.js`
  - 拆出 `assignRequestId`，保证解析失败前已有 `X-Request-Id`。
- `src/modules/hr/hr.service.js`
  - 增加 `paginationSql(limit, offset)`。
  - 统一修复 HR 列表分页，避免 MySQL prepared `LIMIT/OFFSET` 参数异常。
- `test/request-id-contract.test.js`
  - 增加“body parser 前可分配 requestId”的契约测试。

## 门禁证据详情（执行时间 / 关键输出 / 日志落点）

### 1) `node --test`

- 执行时间：`2026-05-16 16:10:00 +08:00` 到 `2026-05-16 16:10:03 +08:00`。
- 关键输出摘要：`ℹ tests 223`、`ℹ pass 223`、`ℹ fail 0`。
- 日志落点：`C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\gate-node-test-20260516-161000.log`。

### 2) `node scripts/verify-production-ready.mjs`

- 执行时间：`2026-05-16 16:10:33 +08:00` 到 `2026-05-16 16:12:55 +08:00`。
- 关键输出摘要：`smoke-schedule: PASS`、`smoke-schedule-library: PASSED`、`smoke-boards: PASSED`、`smoke-frontend-contract: PASSED`、`PRODUCTION_READY_CHECK_PASS`。
- 日志落点：`C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\gate-verify-production-20260516-161033.log`。

### 3) `node scripts/smoke-ai-deepseek.mjs`

- 执行时间：`2026-05-16 16:13:23 +08:00` 到 `2026-05-16 16:13:47 +08:00`。
- 关键输出摘要：未授权 4 条均 `AUTH_FAILURE`；授权后 `/workspace/ai/settings`、`/workspace/ai/chat`、`/workspace/ai/home-assistant`、`/workspace/resources/ai/assignment-advice` 均 `NORMAL_RESPONSE`；最终 `smoke-ai-deepseek: PASSED`。
- 日志落点：`C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\gate-smoke-ai-deepseek-20260516-161323.log`。

### 4) 前端代理 smoke（`http://127.0.0.1:15173`）

> 本轮沿用既有验收证据，不在文档中重复记录敏感请求体/真实 token。

- 证据时间（已有留档）：`2026-05-16 15:35:13 +08:00` 至 `2026-05-16 15:35:31 +08:00`（详见 `verify-*.json/txt` 时间戳）。
- 关键输出摘要：
  - `POST /api/login` -> `200`
  - `GET /api/health` -> `200` 且 `ready=true`
  - `GET /api/workspace/bootstrap` -> `200`
  - `GET /api/hr/employees?limit=5` -> `200`
  - `GET /` -> `200`
- 日志落点：
  - 响应留档：`C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\verify-login-headers.txt`
  - 响应留档：`C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\verify-health-headers.txt`
  - 响应体留档：`C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\verify-health-body.json`
  - 服务访问日志：`C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime\server-13001-final-20260516-155046.out.log`

## 当前本地服务

- 前端入口：`http://127.0.0.1:15173/`
- 后端健康：`http://127.0.0.1:13001/api/health`
- 前端代理健康：`http://127.0.0.1:15173/api/health`
- MySQL：`127.0.0.1:3306`

## 登录验收提示

- 登录入口：`POST http://127.0.0.1:15173/api/login`（前端代理）或 `POST http://127.0.0.1:13001/api/login`（后端直连）。
- 管理员账号：`admin`。
- 管理员密码来源：后端 `.env` 的 `ADMIN_INITIAL_PASSWORD`（不得使用前端示例 `admin/admin` 作为验收口径）。
- 每次验收必须重新登录，拿到当次真实 JWT 后再访问业务接口。
- 禁止复用旧 token、伪 token、手工拼接 token。

## 备份台账（交接/迁移必备）

| 路径 | 用途 | 是否必备 | 敏感级别 | 恢复顺序 |
| --- | --- | --- | --- | --- |
| `C:\Users\pveadmin\Desktop\mutou\.runtime\mysql-data` | MySQL 业务库物理数据目录 | 必备 | 高 | 1 |
| `C:\Users\pveadmin\Desktop\mutou\.runtime\mysql-xjg.ini` | MySQL 实例配置（端口/数据目录/字符集） | 必备 | 中 | 0（先于 MySQL 启动恢复） |
| `C:\Users\pveadmin\Desktop\mutou\.runtime\logs` | MySQL 运行错误日志目录（含 `mysql-xjg.err`） | 建议 | 中 | 6 |
| `C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\storage-v1` | 上传文件与聊天文本存储根 | 必备 | 高 | 3 |
| `C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\ai-v1` | AI 相关落盘数据/缓存 | 必备 | 中 | 4 |
| `C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\src\logs` | 后端结构化应用日志（`app.log`/`error.log`） | 建议 | 中 | 7 |
| `C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source\data\runtime` | 验收/启动/runtime 工具日志与证据落点 | 必备 | 中 | 5 |
| `C:\Users\pveadmin\Desktop\mutou\第一版源代码\.codex-logs` | agent 调试与辅助运行日志 | 建议 | 中 | 8 |

补充约束：

- 仅备份 `mysql-data` 不够：会丢失 `storage-v1`/`ai-v1` 文件侧业务对象，导致数据库记录与文件实体不一致。
- 仅备份 `storage-v1` 不够：缺少 MySQL 主数据与关系数据，无法恢复任务/用户/权限/排期主链路。
- 迁移恢复建议顺序：`mysql-xjg.ini` -> `mysql-data` -> 后端代码与 `.env`（密文注入）-> `storage-v1` -> `ai-v1` -> `data/runtime` -> `.runtime/logs` -> `src/logs` -> `.codex-logs`。

## 路径差异说明（当前验收口径）

- 当前机器的 MySQL 数据路径以 `C:\Users\pveadmin\Desktop\mutou\.runtime\mysql-data` 为准。
- 文档或历史记录中若出现 `N:\...`，属于历史/示例路径，不作为本次（`2026-05-16`）本地验收路径。

## 注意事项

- Redis 当前仍是 reserved integration，未启动只产生 warning，不阻塞本阶段生产门禁。
- 前端同步失败如果再次出现，优先检查：
  - `13001` 后端是否只保留一个监听进程。
  - `3306` MySQL 是否监听。
  - 浏览器是否持有真实 JWT，而不是旧 token 或伪 token。
  - 响应头 `X-Request-Id`，用于后端日志精确检索。

## P1 加固：HR 排期同步 smoke 收紧

在 5.5 同步契约复核后发现，`scripts/smoke-frontend-contract.mjs` 旧逻辑会优先使用 `assignment-advice` 返回的候选人 ID 作为 `PATCH /workspace/resources/work-items/:workItemId/schedule` 的 `workItemId`，且把 `404/409` 也当作通过。这会掩盖真实的人力排期同步失败。

本次加固：

- `scripts/smoke-frontend-contract.mjs`：HR 排期同步 smoke 改为使用本轮真实创建的 `scheduleItemId`，缺少真实工作项 ID 时直接失败。
- `scripts/smoke-frontend-contract.mjs`：`PATCH /workspace/resources/work-items/:workItemId/schedule` 现在必须返回 `200` 且 `ok=true`。
- `test/smoke-frontend-contract-script.test.js`：新增静态契约测试，禁止重新引入候选人 ID fallback，禁止将 `404/409` 作为成功。

红绿验证：

- 红灯：新增测试先在旧脚本上失败，失败原因为仍存在 `recommendedCandidateId` 到 work item patch 的 fallback。
- 绿灯：修复后 `node --test test/smoke-frontend-contract-script.test.js` 结果为 `5 pass / 0 fail`。
- 真实 smoke：`node scripts/smoke-frontend-contract.mjs` 结果为 `smoke-frontend-contract: PASSED`，其中 `PATCH /workspace/resources/work-items/si-.../schedule` 返回 `200`。

## 最终复验（P1 加固后）

- 执行时间：`2026-05-16 16:29 +08:00` 到 `2026-05-16 16:30 +08:00`。
- `node --test`：`224 pass / 0 fail`，新增的 HR 同步 smoke 静态契约测试已纳入全量测试。
- `node scripts/smoke-frontend-contract.mjs`：`smoke-frontend-contract: PASSED`，其中 `PATCH /workspace/resources/work-items/si-.../schedule` 返回 `200`。
- `node scripts/verify-production-ready.mjs`：最终输出 `PRODUCTION_READY_CHECK_PASS`。
- 健康检查：`http://127.0.0.1:13001/api/health` 与 `http://127.0.0.1:15173/api/health` 均为 `ready=true`，`mysql.ready=true`。

最终判定：本地验收门禁已通过；后端同步链路不再依赖前端本地 fallback 或 smoke 假绿。
