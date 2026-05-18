# 2026-05-16 后端经理 Round 7：运行时同步与 DeepSeek 上线闭环

## 本轮目标

用户反馈前端所有任务保存都会提示“后端同步失败”，DeepSeek 首页与人力 AI 也不可用。本轮按上线事故处理，后端经理分派 15 个 `gpt-5.3-codex` 小弟分别排查运行时、MySQL、前端同步文案映射、鉴权、DeepSeek 双 Key、smoke 验证、画板历史性能与最终审查。主线程负责监督、验收、密钥安全落位与溯源记录。

## 根因结论

第一根因是运行时环境未完整启动。`127.0.0.1:3306` 没有 MySQL 监听，`127.0.0.1:13001` 后端也未持续监听，导致前端 `/api` 代理无法落到真实后端，任务、排期、画板、人力等写接口都会进入前端本地 fallback 并提示同步失败。

第二根因是 AI 配置口径不一致。用户提供的是两把业务 Key：首页 DeepSeek 与人力 DeepSeek，但后端历史实现主要读取 `DEEPSEEK_API_KEY`。本轮改为首页/工作区 AI 使用 `DEEPSEEK_HOME_API_KEY`，人力分配建议使用 `DEEPSEEK_HR_API_KEY`，并保留 `DEEPSEEK_API_KEY` 作为兼容 fallback。

第三个收尾问题是画板历史分页 SQL 曾使用模板插值分页，测试要求 `LIMIT ? OFFSET ?` 参数化。已修复为参数化查询。

## 运行时恢复

已安全启动项目便携 MySQL，未执行 `init`、`reset`、`drop`、`truncate` 或任何清空数据动作。当前 MySQL 监听 `127.0.0.1:3306`，后端服务监听 `13001`，前端 Vite 监听 `15173`。

后端使用项目运行时 Node 启动，日志写入 `data/runtime/server-13001.out.log` 与 `data/runtime/server-13001.err.log`。`GET http://127.0.0.1:13001/api/health` 返回 `ok=true`、`ready=true`、`mysql.ready=true`。`GET http://127.0.0.1:15173/api/health` 也通过 Vite 代理返回同样健康结果。

## 本轮后端改动

- `src/config/env.js`：新增 `homeApiKeyConfigured` 与 `hrApiKeyConfigured`，并让 `apiKeyConfigured` 兼容首页 Key 或 legacy Key。
- `src/modules/ai/ai.service.js`：首页、工作区聊天和 `/workspace/ai/home-assistant` 优先读取 `DEEPSEEK_HOME_API_KEY`，fallback 到 `DEEPSEEK_API_KEY`；配置响应只返回布尔状态，不返回 Key 明文。
- `src/modules/hr/hr.service.js`：`/workspace/resources/ai/assignment-advice` 优先读取 `DEEPSEEK_HR_API_KEY`，fallback 到 `DEEPSEEK_API_KEY`；HR AI 上游失败返回中性文案。
- `.env.example` 与 `.env.production.example`：补充 `DEEPSEEK_HOME_API_KEY`、`DEEPSEEK_HR_API_KEY`，保留 `DEEPSEEK_API_KEY` 兼容说明。
- `scripts/smoke-ai-deepseek.mjs`：新增 DeepSeek smoke，覆盖未鉴权、settings、chat、home-assistant、人力 assignment-advice；移除旧“alias key 必须映射到 DEEPSEEK_API_KEY”的错误提示。
- `test/ai-trace-contract.test.js`、`test/hr-contract.test.js`、`test/smoke-ai-deepseek-script.test.js`：补充双业务 Key、fallback、无密钥明文泄露与 smoke 分类测试。
- `src/services/board.service.js`：`getBoardHistory` 分页改为参数化 `LIMIT ? OFFSET ?`。

## 密钥处理

用户给出的两把 DeepSeek Key 只写入本机后端 `.env`，不写入前端、不写入文档、不写入测试、不写入日志、不回显明文。`.gitignore` 已忽略 `.env`。本轮文档仅记录变量名：`DEEPSEEK_HOME_API_KEY`、`DEEPSEEK_HR_API_KEY`、`DEEPSEEK_API_KEY`。

## 验证证据

已执行并通过：

- `node --test`：220 pass、0 fail。
- `node scripts/verify-production-ready.mjs`：`PRODUCTION_READY_CHECK_PASS`。
- `node scripts/smoke-ai-deepseek.mjs`：`smoke-ai-deepseek: PASSED`，未鉴权请求全部归类为 `AUTH_FAILURE`，已鉴权的 settings/chat/home-assistant/assignment-advice 全部归类为 `NORMAL_RESPONSE`。
- `GET http://127.0.0.1:15173/api/health`：通过前端代理返回后端健康状态，`ready=true`、`mysql.ready=true`。

生产门禁覆盖了 MySQL 检查、schedule schema、auth、workspace、taxonomy、schedule、schedule-library、boards、frontend-contract。frontend-contract 重点写入接口包括项目、任务、评论、画板、画板历史、排期、AI settings/chat、人力 resources/workload/assignment-advice。

## 前端同步提示定位

前端“已本地保存，后端同步失败”主要来自任务、项目、排期、画板、模板和人力联动任务更新。高优先级写接口包括：

- `PUT /workspace/tasks/:taskId`
- `POST /workspace/projects/:projectId/tasks`
- `PUT /workspace/schedule/items/:itemId`
- `POST /workspace/projects/:projectId/schedule/items`
- `PATCH /workspace/boards/:boardId`

这些接口已在生产 smoke 与 frontend-contract smoke 中覆盖。之前前端看到全量同步失败，核心原因是后端服务与 MySQL 未同时可用，且如果使用无效 token 也会触发 401 后进入前端 fallback。

## 当前运行状态

- MySQL：`127.0.0.1:3306`，进程 `mysqld`。
- 后端：`http://127.0.0.1:13001`，进程 `node`。
- 前端：`http://127.0.0.1:15173`，进程 `node`。
- Redis 未启动仍只作为 reserved integration warning，不阻塞本阶段生产门禁。

## 后续交接

若再次出现同步失败，优先检查三件事：MySQL `3306` 是否监听、后端 `13001` 是否监听、前端是否拿到真实 JWT。登录密码应使用后端 `.env` 中 `ADMIN_INITIAL_PASSWORD`，不要使用前端页面里的默认 `admin/admin` 作为生产口径。

