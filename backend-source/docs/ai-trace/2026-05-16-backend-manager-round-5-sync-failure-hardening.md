# 2026-05-16 后端经理 Round 5：排期/流程/人力同步失败加固

## 目标
- 处理前端右下角 `已本地保存，后端同步失败` 的后端侧根因和兼容缺口。
- 严格只读 `frontend-source`，只修改 `backend-source`。
- 将排期、流程、人力、AI 旧入口按上线契约补齐，避免前端请求因字段/方法/旧路径不兼容进入本地失败分支。

## 分工与排查
- Fermat：只读扫描前端 toast 触发点，确认失败来自 `scheduleApi`、`workspaceApi.updateTask`、`resourceApi.rescheduleWorkItem` 请求 reject。
- Newton：只读审计后端排期/流程缺口，指出 POST schedule 整包保存、PATCH 别名、payload 兼容、任务反向同步不足。
- Hilbert：只读审计日志，确认近期真实失败主要是 401 未带 token、404 本地/不存在 id、`/workspace/ai/home-assistant` 404。
- Avicenna/Tesla：实现型子任务因 429/安全拦截未落地；后端经理本地完成补丁与验收。

## 修改文件
- `src/services/schedule.service.js`
  - 兼容前端字段别名：camelCase/snake_case、`payload.note`、`payload.addToTaskList`、`YYYY/MM/DD` 日期。
  - schedule item 响应新增稳定别名：`scheduleItemId`、`workItemId`、`projectId`、`ownerUserId`、`assigneeId`、`taskUidText`、`payload`。
  - 创建排期项时不复用 `si-local-*`、`si-client-*` 等前端临时 id，返回后端稳定 id。
  - `POST /workspace/projects/:projectId/schedule` 对 `items` 做整包 upsert 兼容，并保留 bundle helper 供后续依赖落库完善。
  - 更新排期项时同步保存 `payload_json`，避免前端自定义字段丢失。
- `src/routes/schedule.routes.js`
  - 新增 `PATCH /workspace/schedule/items/:itemId`，等价复用 `putScheduleItem`。
- `src/services/workspace.service.js`
  - `PUT /workspace/tasks/:taskId` 更新流程任务后反向同步关联 `schedule_items`。
  - 响应增加 `sync` / `syncResult`，标明 `scheduleItemsUpdated`。
- `src/modules/hr/hr.service.js`
  - `PATCH /workspace/resources/work-items/:workItemId/schedule` 响应补 `workItem` 和 `sync` 稳定对象。
  - `sync`/`syncResult` 现在包含 `source`、`interaction`、`resourceWorkItemUpdated`、`scheduleUpdated`、`taskUpdated`。
- `src/modules/ai/ai.routes.js`
  - 新增旧前端兼容别名 `POST /workspace/ai/home-assistant`，复用 `postWorkspaceAiChat`。
- `test/schedule-contract.test.js`
  - 增加/更新排期 payload、临时 id、响应别名、PATCH 路由、整包 payload 契约断言。
- `test/hr-contract.test.js`
  - 增加人力同步响应 `sync` 契约断言。
- `test/workspace-task-payload-contract.test.js`
  - 增加流程任务反向同步排期项契约断言。
- `test/ai-trace-contract.test.js`
  - 增加 `/workspace/ai/home-assistant` 旧路由别名断言。

## 验证
- `node --check src\\services\\schedule.service.js; node --check src\\services\\workspace.service.js; node --check src\\modules\\hr\\hr.service.js; node --check src\\modules\\ai\\ai.routes.js`：通过。
- `node --test test\\schedule-contract.test.js test\\hr-contract.test.js test\\workspace-task-payload-contract.test.js test\\ai-trace-contract.test.js`：51 pass / 0 fail。
- `node --test`：192 pass / 0 fail。
- `node scripts\\verify-production-ready.mjs`：未通过，阻塞原因不是代码测试失败，而是当前环境 `127.0.0.1:3306` 无 MySQL listener，`db:check:production` 返回 `FAIL_ECONNREFUSED`。

## 当前 P0 风险
- 当前机器 MySQL 没启动或 `.env` 指向的 `MYSQL_HOST=127.0.0.1`、`MYSQL_PORT=3306` 不可达，生产门禁仍是 P0_BLOCKED。
- 前端若未带 token，会继续收到 401；本轮没有放宽认证，因为上线安全不能把 workspace 写接口改成匿名。
- 前端若继续发送完全不存在的本地 `workItemId` 且无可解析 `taskId/itemId`，后端仍会 404；这是正确数据边界，但前端应优先用后端返回的稳定 id。

## 下一步建议
1. 启动 MySQL 或修正 `.env` 的 `MYSQL_HOST/MYSQL_PORT`。
2. 重新执行 `node scripts\\verify-production-ready.mjs`。
3. 用有效登录 token 在前端复测排期新增/拖拽、流程任务改日期、人力拖拽同步、首页 AI 助手。
