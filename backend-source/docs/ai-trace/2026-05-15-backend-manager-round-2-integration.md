# 2026-05-15 后端经理第二轮联调溯源

## 背景

本轮接到的新目标是：后台管理和人力模块基本完成后，继续核对前端共享模板、画板、人力拖拽排期、文件预览与工作区数据同步需求。约束保持不变：不修改 `frontend-source`，只把它作为接口契约来源；所有后端改动必须能追溯，真实上传数据仍统一放在 `backend-source/data/storage-v1`，方便后续迁移和备份。

## 分工

先派出 6 个只读侦察 agent 分别检查后台管理、人力资源、画板、共享模板、工作区同步、存储与聊天文本。受线程池限制，RBAC/契约文档由主线程合并检查。随后派出 4 个写代码 worker：HR P0 修复、模板共享后端化、画板上线加固、存储预览兼容。主线程负责补 workspace task 扩展字段、修正验收发现的小坑、补溯源文档和最终测试。

## 关键发现

人力前端已经调用 `PATCH /workspace/resources/work-items/:workItemId/schedule`，后端缺路由，是本轮 P0。模板前端虽然仍主要走本地 store，但 `/workspace/templates` 只是占位，无法支撑共享模板后续正式接线。画板基础 CRUD 已存在，但重复默认画板创建、归档态访问、版本冲突和导出预留存在上线风险。存储已有上传/下载，但缺可给图片、视频、聊天文本直接使用的 preview URL 与 inline/Range 预览能力。workspace task 的 `scheduleStatus`、`progress`、`attachments` 之前只在前端 payload 里，后端未稳定保存和返回。

## 后端改动

HR 模块新增 `PATCH /workspace/resources/work-items/:workItemId/schedule`，挂 `authRequired` 与 `workspace.write` 权限。服务层在同一事务内识别 `schedule_items` 或 `tasks`，更新日期、负责人、标题、项目字段，并尽量同步关联的任务或排期项，返回 `{ ok, workItemId, scheduleItem, task, syncResult }`。验收时发现新增函数存在构造错误未抛出的风险，已补为显式 `throw badRequest` / `throw notFound`。

模板模块新增 `src/services/template.service.js`、`src/controllers/template.controller.js`、`src/routes/template.routes.js`，接入 `templates` 与 `template_shares` 表。现在支持 `/templates/**` 与 `/workspace/templates/**` 两套 alias，覆盖列表、详情、创建、更新、删除、分享、取消分享、复制和应用。`GET /workspace/templates` 返回前端需要的 `items`、`templates`、`templateShareInfo`。

画板服务加固了默认画板重复创建的幂等行为，已归档画板对读取、保存、分享和历史统一不可见，删除时同步归档 `board_members` 与 `board_shares`。保存接口支持可选 `baseVersion` / `lastVersion` 冲突检测，冲突返回 `409`；另外新增 JSON export 路由。验收时发现 `/boards/:boardId/export` 起初放在 `/:boardId` 之后会被吞掉，已调整到详情路由之前。

存储模块新增稳定 URL 字段 `url`、`apiDownloadUrl`、`downloadUrl`、`previewUrl`，并增加 `/storage/files/:storageId/preview` 与 `/workspace/storage/files/:storageId/preview`。预览响应支持 inline、`X-Content-Type-Options: nosniff`，视频支持 `Range` 并返回 `206`。读取权限仍保持上传者、管理员或 `storage.delete` 边界，未扩大到 scope 成员。

workspace task 映射补充 `scheduleStatus`、`progress`、`attachments`，创建和更新时写入 `tasks.payload_json`，列表读取时稳定返回，避免前端流程、排期和资源视图互相覆盖数据。

## 变更文件

核心后端文件包括 `src/modules/hr/hr.routes.js`、`src/modules/hr/hr.controller.js`、`src/modules/hr/hr.service.js`、`src/services/template.service.js`、`src/controllers/template.controller.js`、`src/routes/template.routes.js`、`src/routes/index.js`、`src/routes/workspace.routes.js`、`src/services/board.service.js`、`src/controllers/board.controller.js`、`src/modules/storage/storage.routes.js`、`src/modules/storage/storage.controller.js`、`src/modules/storage/storage.service.js`、`src/services/workspace.service.js`。测试文件包括 `test/hr-contract.test.js`、`test/template-contract.test.js`、`test/board-contract.test.js`、`test/storage-service.test.js`、`test/storage-contract.test.js`、`test/workspace-task-payload-contract.test.js`。文档更新包括 `docs/api/frontend-admin-hr-board-upload-integration.md`、`docs/api-workspace.md`、`docs/board-api.md` 与本文件。

## 验证记录

已执行语法检查：`node --check` 覆盖本轮所有修改的后端源码文件。已执行目标测试：`node --test test/hr-contract.test.js test/template-contract.test.js test/board-contract.test.js test/storage-service.test.js test/storage-contract.test.js test/workspace-task-payload-contract.test.js test/frontend-api-contract.test.js test/docs-contract.test.js`，结果 35 项通过、0 失败。已执行全量 `node --test`，结果 167 项通过、0 失败。尝试执行 `npm run verify:production` 时当前 PowerShell 环境提示 `npm` 命令不存在；继续用 `node scripts/verify-production-ready.mjs` 直接运行脚本，脚本内部仍因调用 `npm run db:check:production` 失败而停止。因此本轮生产验证未通过，阻塞点是当前环境缺少可执行的 `npm`，而不是后端单元/契约测试失败。

## 剩余风险

本轮没有修改前端，因此后台管理页面里非用户/项目页面可能错打 `adminApi.createTask` / `deleteTask` 的问题仍需前端团队修正。manager facade 中部分成员修改、密码重置、项目成员权限接口仍是轻量待审核返回，若要真实落库需要下一轮继续做 service 化。存储读取权限目前仍是上传者隔离；如果评论附件或项目附件需要同项目成员互相访问，必须新增 scope 授权策略后再放开。模板 API 已后端化，但前端尚未正式接线到这些新接口，需要联调时逐步替换本地 store 行为。正式上线前还必须在具备 `npm`、生产 MySQL、有效账号 token 的环境里重新执行 `npm run verify:production` 与真实 HTTP smoke。
