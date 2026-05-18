# 2026-05-15 agent 08 后端溯源与验证记录

## 目标

本轮目标是为后端 AI 操作建立可持续的溯源目录，记录本轮后端改造的文档模板和事实清单，只读扫描前端新增的后台管理、人力/资源、画板、上传相关接口，并在低风险范围内补充轻量契约测试。范围限制为 `backend-source/docs/ai-trace/**`、`backend-source/docs/api/**`、`backend-source/test/*contract*.test.js`，未修改 `frontend-source`。2026-05-15 后端经理验收追加确认：后续业务 agent 已补齐 admin、HR、manager、storage 的根路由挂载，本记录保留原扫描过程，并在后续段落标记最终状态避免误判。

## 分工

agent 08 负责溯源文档、前端接口只读扫描、接口对接清单和文档契约验证。后端业务实现、根路由挂载、数据库迁移执行、前端服务改造不在本轮职责内。并行 agent 或主线程可能正在修改 `backend-source/src/**`，本轮只读取这些文件来确认现状，不回滚也不覆盖。后续经理验收由主线程负责更新旧结论：已确认 `adminRoutes`、`hrRoutes`、`managerRoutes`、`storageRoutes` 在 `backend-source/src/routes/index.js` 中被挂载。

## 文件

本轮新增 `backend-source/docs/ai-trace/README.md`，用于定义后续 AI 后端操作记录规则。本轮新增 `backend-source/docs/ai-trace/2026-05-15-agent-08-trace-and-contracts.md`，记录本次目标、分工、文件、接口、验证和风险。本轮新增 `backend-source/docs/api/frontend-admin-hr-board-upload-integration.md`，沉淀前端到后端接口对接清单。本轮计划新增或更新 `backend-source/test/*contract*.test.js` 中的轻量契约测试，仅校验文档结构和代表性接口覆盖，不触碰业务运行逻辑。

只读扫描文件包括 `frontend-source/src/services/adminApi.js`、`frontend-source/src/services/managerApi.js`、`frontend-source/src/services/resourceApi.js`、`frontend-source/src/services/workspaceApi.js`、`frontend-source/src/stores/workspace/actions/boardActions.js`、`frontend-source/src/views/AdminConsoleView.vue`、`frontend-source/src/views/ManagerConsoleView.vue`、`frontend-source/src/views/BoardCenter.vue`、`frontend-source/src/components/boards/CollabBoardOverlay.vue`、`backend-source/src/routes/index.js`、`backend-source/src/modules/admin/admin.routes.js`、`backend-source/src/modules/hr/hr.routes.js`、`backend-source/src/modules/storage/storage.routes.js`。

## 接口

前端后台管理入口集中在 `adminApi.js`，覆盖 `/admin/dashboard`、用户、权限、项目、任务、风险评论、排期、画板、模板、标签、公告、部门、归档、系统状态和审计日志接口。后端存在 `backend-source/src/modules/admin/admin.routes.js` 模块；后续验收确认该模块已由 `backend-source/src/routes/index.js` 挂载，最终状态为 `frontend-detected` + `backend-module-present` + `root-mounted`。

前端人力/资源入口分为 `resourceApi.js` 和 `managerApi.js`。`resourceApi.js` 调用 `/workspace/resources`、`/workspace/workload`、`/workspace/assignments/preview|confirm|force-confirm`；后端 `hr.routes.js` 存在对应路由并已挂载。`managerApi.js` 调用 `/manager/**` 管理端接口；后续业务 agent 已新增 `backend-source/src/modules/manager/manager.routes.js` facade，并在主路由挂载，最终状态为 `root-mounted`。

前端画板入口集中在 `workspaceApi.js` 和 `boardActions.js`，调用 `/workspace/boards`、`/workspace/boards/:boardId`、`/workspace/boards/:boardId/shares`、`/workspace/boards/:boardId/history`。后端 `workspace.routes.js` 已被 `src/routes/index.js` 挂载，本轮判断为当前最接近可联调的新增接口。

上传相关后端存在 `storage.routes.js`，提供 `/storage/**` 与 `/workspace/storage/**` 双路径；前端本轮未发现正式 storage service 调用，只发现头像、背景、启动器图标等组件使用本地 `FileReader`。后续验收确认 storage routes 已挂载，上传接口记录为后端已预留且 `root-mounted`，前端尚未接线。

## 验证

本轮执行只读扫描命令：`rg --files frontend-source`、`rg -n "/api/|axios\\.|fetch\\(|request\\(" frontend-source`、`Select-String` 精确读取前端 service 请求字符串、后端 route 文件和主路由入口。扫描确认前端 `VITE_API_BASE_URL` 通过 `/api` 代理到后端，且新增管理、人力/资源、画板、上传接口分散在上述 service 和 route 文件。

本轮执行轻量文档契约测试：`node --test test/ai-trace-contract.test.js`，结果 3 项通过。该测试验证 `docs/ai-trace` 记录结构、`docs/api` 接口清单存在代表性接口、以及清单显式标记 `root-mounted` 状态；测试不连接 MySQL，不启动 HTTP 服务，不修改前端。

本轮追加执行全量后端 contract 测试：`Get-ChildItem test -Filter '*contract*.test.js' | ForEach-Object { $_.FullName } | node --test`，早期结果为 147 项中 143 项通过、4 项失败。后续业务 agent 已修复前端契约路径、HR 部门详情契约和用户导入文档路径问题。2026-05-15 后端经理验收执行 `node --test`，结果 149 项通过、0 项失败；仍有 Node `DEP0169 url.parse()` deprecation warning，属于既有警告，不阻塞本轮后端对接。

## 风险

早期最大风险是后端模块存在不等于主应用已挂载；后续验收确认 `admin.routes.js`、`hr.routes.js`、`manager.routes.js`、`storage.routes.js` 已出现在 `src/routes/index.js`，root mount 缺口已消除。剩余风险是上传接口尚无前端正式调用，不能作为“已完成上传联调”验收；manager facade 中部分成员管理类接口当前为待管理员审核的轻量返回；所有数据库型接口仍需在生产 MySQL 可用、迁移完成、鉴权 token 有效的条件下做 smoke 验证。

