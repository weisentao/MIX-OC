# 前端后台管理、人力、画板、上传接口对接清单

本清单来自 2026-05-15 对 `frontend-source` 的只读扫描，以及对 `backend-source/src` 路由模块的只读核对。接口状态分为 `frontend-detected`、`backend-module-present`、`root-mounted` 三类；只有同时满足后端模块存在并由主路由挂载，才能进入联调 smoke。2026-05-15 后端经理验收确认：`adminRoutes`、`hrRoutes`、`managerRoutes`、`storageRoutes`、`workspaceRoutes` 均已在 `backend-source/src/routes/index.js` 挂载。

## 扫描来源

前端扫描文件包括 `frontend-source/src/services/adminApi.js`、`frontend-source/src/services/managerApi.js`、`frontend-source/src/services/resourceApi.js`、`frontend-source/src/services/workspaceApi.js`、`frontend-source/src/stores/workspace/actions/boardActions.js`、`frontend-source/src/views/AdminConsoleView.vue`、`frontend-source/src/views/ManagerConsoleView.vue`、`frontend-source/src/views/BoardCenter.vue`、`frontend-source/src/components/boards/CollabBoardOverlay.vue`。后端核对文件包括 `backend-source/src/routes/index.js`、`backend-source/src/routes/workspace.routes.js`、`backend-source/src/modules/admin/admin.routes.js`、`backend-source/src/modules/hr/hr.routes.js`、`backend-source/src/modules/manager/manager.routes.js`、`backend-source/src/modules/storage/storage.routes.js`。

## 全局约定

前端部署文档要求请求基准保持为 `/api`，Vite 本地代理把 `/api/*` rewrite 到后端裸路径。后端 `app.js` 同时挂载 `env.apiPrefix` 和裸 `routes`，因此联调时应优先验证 `/api/<endpoint>`，排查时再直接验证裸路径。除 `/login`、`/health` 等公开接口外，本清单中的管理、人力、画板、上传接口均需要 `Authorization: Bearer <token>`。

## 后台管理接口

后台管理前端入口是 `frontend-source/src/services/adminApi.js`，视图入口是 `frontend-source/src/views/AdminConsoleView.vue`。后端存在 `backend-source/src/modules/admin/admin.routes.js`，并已由 `backend-source/src/routes/index.js` 挂入主路由，状态记录为 `frontend-detected; backend-module-present; root-mounted`。

| 方法 | 路径 | 前端函数 | 主要用途 | 后端状态 |
| --- | --- | --- | --- | --- |
| GET | `/admin/dashboard` | `getDashboard` | 后台总览指标 | root-mounted |
| GET | `/admin/users` | `listUsers` | 用户列表 | root-mounted |
| POST | `/admin/users` | `createUser` | 创建用户 | root-mounted |
| GET | `/admin/users/:userId` | `getUser` | 用户详情 | root-mounted |
| PATCH | `/admin/users/:userId` | `updateUser` | 更新用户 | root-mounted |
| DELETE | `/admin/users/:userId` | `deleteUser` | 删除或归档用户 | root-mounted |
| GET | `/admin/permissions` | `listPermissions` | 权限矩阵 | root-mounted |
| PATCH | `/admin/permissions` | `updatePermissions` | 更新权限 | root-mounted |
| GET | `/admin/projects` | `listProjects` | 项目列表 | root-mounted |
| POST | `/admin/projects` | `createProject` | 创建项目 | root-mounted |
| GET | `/admin/projects/:projectId` | `getProject` | 项目详情 | root-mounted |
| PATCH | `/admin/projects/:projectId` | `updateProject` | 更新项目 | root-mounted |
| POST | `/admin/projects/:projectId/archive` | `archiveProject` | 项目归档 | root-mounted |
| DELETE | `/admin/projects/:projectId` | `deleteProject` | 删除项目 | root-mounted |
| GET | `/admin/tasks` | `listTasks` | 任务列表 | root-mounted |
| POST | `/admin/tasks` | `createTask` | 创建任务 | root-mounted |
| PATCH | `/admin/tasks/:taskId` | `updateTask` | 更新任务 | root-mounted |
| DELETE | `/admin/tasks/:taskId` | `deleteTask` | 删除或软删任务 | root-mounted |
| GET | `/admin/comments/risk` | `listRiskComments` | 风险评论 | root-mounted |
| POST | `/admin/comments/:commentId/resolve` | `resolveRiskComment` | 处理风险评论 | root-mounted |
| GET | `/admin/schedules` | `listSchedules` | 排期总览 | root-mounted |
| GET | `/admin/boards` | `listBoards` | 画板总览 | root-mounted |
| PATCH | `/admin/boards/:boardId` | `updateBoard` | 后台更新画板 | root-mounted |
| DELETE | `/admin/boards/:boardId` | `deleteBoard` | 后台删除画板 | root-mounted |
| GET | `/admin/templates` | `listTemplates` | 模板列表 | root-mounted |
| POST | `/admin/templates` | `createTemplate` | 创建模板 | root-mounted |
| PATCH | `/admin/templates/:templateId` | `updateTemplate` | 更新模板 | root-mounted |
| DELETE | `/admin/templates/:templateId` | `deleteTemplate` | 删除模板 | root-mounted |
| GET | `/admin/tags` | `listTags` | 标签列表 | root-mounted |
| POST | `/admin/tags` | `createTag` | 创建标签 | root-mounted |
| DELETE | `/admin/tags/:tagId` | `deleteTag` | 删除标签 | root-mounted |
| GET | `/admin/notices` | `listNotices` | 公告列表 | root-mounted |
| POST | `/admin/notices` | `createNotice` | 创建公告 | root-mounted |
| PATCH | `/admin/notices/:noticeId` | `updateNotice` | 更新公告 | root-mounted |
| DELETE | `/admin/notices/:noticeId` | `deleteNotice` | 删除公告 | root-mounted |
| GET | `/workspace/notices/carousel` | `listCarouselNotices` | 首页顶部 active 公告轮播 | root-mounted |
| GET | `/admin/departments` | `listDepartments` | 部门列表 | root-mounted |
| POST | `/admin/departments` | `createDepartment` | 创建部门 | root-mounted |
| PATCH | `/admin/departments/:departmentId` | `updateDepartment` | 更新部门 | root-mounted |
| DELETE | `/admin/departments/:departmentId` | `deleteDepartment` | 删除部门 | root-mounted |
| GET | `/admin/archives` | `listArchives` | 归档列表 | root-mounted |
| POST | `/admin/archives/:archiveId/restore` | `restoreArchive` | 恢复归档 | root-mounted |
| DELETE | `/admin/archives/:archiveId` | `deleteArchive` | 删除归档 | root-mounted |
| GET | `/admin/system/status` | `getSystemStatus` | 系统状态 | root-mounted |
| GET | `/admin/audit-logs` | `listAuditLogs` | 审计日志 | root-mounted |

## 人力与资源接口

人力相关前端入口分为两组：`resourceApi.js` 已对接 `/workspace/resources`、`/workspace/workload` 和 `/workspace/assignments/**`；`managerApi.js` 使用 `/manager/**` 路径供管理控制台调用。后端 `hr.routes.js` 已提供资源、工时、分配预览和 `/hr/**` CRUD 模块，并已由 `backend-source/src/routes/index.js` 挂载。`/hr/**` CRUD 属于敏感人事管理面，当前统一要求 `hr.manage`；资源分配写入要求 `workspace.write`，强制分配要求 `workspace.export`。后端另有 `backend-source/src/modules/manager/manager.routes.js` 作为普通管理端 facade，对接 `managerApi.js` 预留路径。

| 方法 | 路径 | 前端函数 | 主要用途 | 后端状态 |
| --- | --- | --- | --- | --- |
| GET | `/workspace/resources` | `resourceApi.getResources` | 人力资源快照 | root-mounted |
| GET | `/workspace/workload` | `resourceApi.getWorkload` | 工作量快照 | root-mounted |
| PATCH | `/workspace/resources/work-items/:workItemId/schedule` | `resourceApi.rescheduleWorkItem` | 拖拽/调整人力工作项排期，并同步排期项与关联任务 | root-mounted |
| POST | `/workspace/assignments/preview` | `resourceApi.previewAssignment` | 分配预览 | root-mounted |
| POST | `/workspace/assignments/confirm` | `resourceApi.confirmAssignment` | 确认分配 | root-mounted |
| POST | `/workspace/assignments/force-confirm` | `resourceApi.forceConfirmAssignment` | 强制确认分配 | root-mounted |
| GET | `/hr/employees` | 未发现直接前端 wrapper | 员工列表 | root-mounted |
| POST | `/hr/employees` | 未发现直接前端 wrapper | 创建员工 | root-mounted |
| GET | `/hr/employees/:employeeId` | 未发现直接前端 wrapper | 员工详情 | root-mounted |
| PUT | `/hr/employees/:employeeId` | 未发现直接前端 wrapper | 更新员工 | root-mounted |
| DELETE | `/hr/employees/:employeeId` | 未发现直接前端 wrapper | 删除员工 | root-mounted |
| GET | `/hr/departments` | 未发现直接前端 wrapper | HR 部门列表 | root-mounted |
| POST | `/hr/departments` | 未发现直接前端 wrapper | 创建 HR 部门 | root-mounted |
| PUT | `/hr/departments/:departmentId` | 未发现直接前端 wrapper | 更新 HR 部门 | root-mounted |
| GET | `/hr/positions` | 未发现直接前端 wrapper | 岗位列表 | root-mounted |
| POST | `/hr/positions` | 未发现直接前端 wrapper | 创建岗位 | root-mounted |
| PUT | `/hr/positions/:positionId` | 未发现直接前端 wrapper | 更新岗位 | root-mounted |
| GET | `/hr/attendance` | 未发现直接前端 wrapper | 考勤列表 | root-mounted |
| POST | `/hr/attendance` | 未发现直接前端 wrapper | 创建考勤 | root-mounted |
| PUT | `/hr/attendance/:attendanceId` | 未发现直接前端 wrapper | 更新考勤 | root-mounted |
| GET | `/hr/leaves` | 未发现直接前端 wrapper | 请假列表 | root-mounted |
| POST | `/hr/leaves` | 未发现直接前端 wrapper | 创建请假 | root-mounted |
| PUT | `/hr/leaves/:leaveId` | 未发现直接前端 wrapper | 更新请假 | root-mounted |
| GET | `/hr/recruitment/jobs` | 未发现直接前端 wrapper | 招聘岗位 | root-mounted |
| POST | `/hr/recruitment/jobs` | 未发现直接前端 wrapper | 创建招聘岗位 | root-mounted |
| PUT | `/hr/recruitment/jobs/:jobId` | 未发现直接前端 wrapper | 更新招聘岗位 | root-mounted |
| GET | `/hr/recruitment/candidates` | 未发现直接前端 wrapper | 候选人列表 | root-mounted |
| POST | `/hr/recruitment/candidates` | 未发现直接前端 wrapper | 创建候选人 | root-mounted |
| PUT | `/hr/recruitment/candidates/:candidateId` | 未发现直接前端 wrapper | 更新候选人 | root-mounted |
| GET | `/hr/performance` | 未发现直接前端 wrapper | 绩效列表 | root-mounted |
| POST | `/hr/performance` | 未发现直接前端 wrapper | 创建绩效 | root-mounted |
| PUT | `/hr/performance/:reviewId` | 未发现直接前端 wrapper | 更新绩效 | root-mounted |
| GET | `/hr/payroll` | 未发现直接前端 wrapper | 薪资列表 | root-mounted |
| POST | `/hr/payroll` | 未发现直接前端 wrapper | 创建薪资 | root-mounted |
| PUT | `/hr/payroll/:payrollId` | 未发现直接前端 wrapper | 更新薪资 | root-mounted |

### Manager 控制台前端调用

`frontend-source/src/services/managerApi.js` 调用 `/manager/overview`、`/manager/departments/:departmentId`、`/manager/members`、`/manager/members/:userId`、`/manager/members/:userId/reset-password`、`/manager/projects`、`/manager/projects/:projectId`、`/manager/projects/:projectId/archive`、`/manager/projects/:projectId/tasks`、`/manager/tasks/:taskId`、`/manager/projects/:projectId/comments`、`/manager/comments/:commentId/resolve`、`/manager/projects/:projectId/schedule`、`/manager/projects/:projectId/schedule/export`、`/manager/projects/:projectId/members`、`/manager/projects/:projectId/members/:userId`、`/manager/projects/:projectId/boards`、`/manager/projects/:projectId/boards/:boardId`、`/manager/projects/:projectId/templates`、`/manager/projects/:projectId/tags-archives`、`/manager/projects/:projectId/tags`、`/manager/projects/:projectId/tags/:tagId/archive`、`/manager/accounts`。后端已新增 `manager.routes.js` facade 并挂载，统一要求 `authRequired` 与 `requireRole(["admin", "manager"])`；部分成员修改、密码重置、成员角色变更接口当前返回待管理员审核的轻量结果，后续如要真实落库需要继续接服务层。

## 画板接口

画板前端入口是 `workspaceApi.js` 与 `boardActions.js`，界面入口包括 `BoardCenter.vue` 和 `CollabBoardOverlay.vue`。后端画板路由定义在 `backend-source/src/routes/workspace.routes.js`，且 `workspaceRoutes` 已在 `backend-source/src/routes/index.js` 挂载，因此状态记录为 `frontend-detected; backend-route-present; root-mounted`。

| 方法 | 路径 | 前端函数 | 主要请求字段 | 后端状态 |
| --- | --- | --- | --- | --- |
| GET | `/workspace/boards?projectId=` | `workspaceApi.listBoards` | `projectId` query | root-mounted |
| POST | `/workspace/boards` | `workspaceApi.createBoard` | `projectId`, `scopeKey`, `scopeType`, `moduleKey`, `taskId`, `boardKind`, `ownerId`, `ownerName`, `isDefault`, `title`, `visibility`, `editableRoles`, `readonlyRoles`, `elements`, `appState`, `files` | root-mounted |
| GET | `/workspace/boards/:boardId` | `workspaceApi.getBoard` | `boardId` path | root-mounted |
| PATCH | `/workspace/boards/:boardId` | `workspaceApi.updateBoard` | `title`, `elements`, `appState`, `files`, sharing metadata | root-mounted |
| DELETE | `/workspace/boards/:boardId` | `workspaceApi.deleteBoard` | `boardId` path | root-mounted |
| PUT | `/workspace/boards/:boardId/shares` | `workspaceApi.shareBoard` | `entries` | root-mounted |
| GET | `/workspace/boards/:boardId/export` | 预留后端接口 | `format=json` query | root-mounted |
| GET | `/workspace/boards/:boardId/history` | `workspaceApi.listBoardHistory` | `boardId` path | root-mounted |

后端还保留裸路径 `/boards/**` 与 `PUT /workspace/boards/:boardId`、`POST /workspace/boards/:boardId/shares` 兼容别名。当前前端 wrapper 使用 `/workspace/boards/**`、`PATCH` 保存和 `PUT` 分享。2026-05-15 追加上线加固：重复创建同一默认画板时后端幂等返回现有画板；已归档画板对读取、保存、共享和历史统一返回不可见；删除画板会同步归档成员与分享；保存接口支持可选 `baseVersion` / `lastVersion` 冲突检测，冲突返回 `409`。

## 模板与共享模板接口

模板前端当前主要保存在 Pinia 本地状态，入口包括 `TemplateTree.vue` 与 `templateActions.js`；后端已把原 `/workspace/templates` 占位替换为真实 MySQL-backed API，并在 `backend-source/src/routes/template.routes.js` 中同时提供裸路径 `/templates/**` 与 workspace 路径 `/workspace/templates/**`。`GET /workspace/templates` 返回 `{ items, templates, templateShareInfo }`，其中 `templates` 是前端可直接使用的模板树，包含 `id`、`title`、`kind`、`children`、`templateTasks`、`templateSchedules`、`ownerId`、`ownerName`、`locked`。

| 方法 | 路径 | 前端状态 | 主要用途 | 后端状态 |
| --- | --- | --- | --- | --- |
| GET | `/workspace/templates` | 当前本地 store，后端已预留 | 模板列表、模板树、共享状态 | root-mounted |
| POST | `/workspace/templates` | 当前本地 store，后端已预留 | 创建模板或模板目录 | root-mounted |
| GET | `/workspace/templates/:templateId` | 当前本地 store，后端已预留 | 模板详情 | root-mounted |
| PATCH | `/workspace/templates/:templateId` | 当前本地 store，后端已预留 | 更新模板内容、名称、分组、可见性 | root-mounted |
| DELETE | `/workspace/templates/:templateId` | 当前本地 store，后端已预留 | 删除模板或目录并撤销分享 | root-mounted |
| PUT | `/workspace/templates/:templateId/shares` | 当前本地 store，后端已预留 | 替换模板分享用户 | root-mounted |
| POST | `/workspace/templates/:templateId/shares` | 当前本地 store，后端已预留 | 分享模板兼容别名 | root-mounted |
| DELETE | `/workspace/templates/:templateId/shares/:userId` | 当前本地 store，后端已预留 | 取消单个用户分享 | root-mounted |
| POST | `/workspace/templates/:templateId/copy` | 当前本地 store，后端已预留 | 复制模板到当前用户 | root-mounted |
| POST | `/workspace/templates/:templateId/apply` | 当前本地 store，后端已预留 | 返回可应用的任务/排期模板 payload | root-mounted |

模板权限边界：`admin` 可读写全量；模板 owner 可改、删、分享；`workspace` / `public` 可见性或被分享给当前用户时可读；未授权访问返回 `403`；MySQL 未就绪返回 `503`，不能作为上线通过状态。

## 上传与存储接口

上传相关前端扫描未发现正式 `storageApi` 或 `/storage/**` 调用。头像、主页背景和启动器图标当前使用本地 `FileReader` 读取图片，画板的 `files` 字段随画板 payload 保存。后端存在 `backend-source/src/modules/storage/storage.routes.js`，并已由 `backend-source/src/routes/index.js` 挂载；状态为 `backend-module-present; frontend-not-wired; root-mounted`。后端统一使用 `backend-source/data/storage-v1` 作为可备份根目录，真实上传文件和 sidecar 元数据已由 `.gitignore` 排除，只保留 `.gitkeep`。storage record 保留既有字段，并新增稳定字段 `url`、`apiDownloadUrl`、`downloadUrl`、`previewUrl`：裸路径用于当前根路由兼容，`apiDownloadUrl` 用于默认 `API_PREFIX=/api` 部署。存储读写走 `storage.read`/`storage.write`，读取、下载和预览目前仍按上传者隔离，删除允许上传者本人、`admin` 或具备 `storage.delete` 的 token；不扩大读取权限。后续如果同一 `scopeType/scopeId` 内需要多人共享读取，应单独接入 scope 授权策略后再放开。

| 方法 | 路径 | 前端状态 | 主要用途 | 后端状态 |
| --- | --- | --- | --- | --- |
| GET | `/storage/ensure-sql` | 未发现调用 | 返回 storage metadata 建表 SQL | root-mounted |
| POST | `/storage/upload` | 未发现调用 | multipart 文件上传 | root-mounted |
| POST | `/storage/chat-text` | 未发现调用 | 聊天文本落盘 | root-mounted |
| GET | `/storage/files` | 未发现调用 | 文件列表 | root-mounted |
| GET | `/storage/files/:storageId` | 未发现调用 | 文件元数据 | root-mounted |
| GET | `/storage/files/:storageId/download` | 未发现调用 | 文件下载 | root-mounted |
| GET | `/storage/files/:storageId/preview` | 未发现调用 | 文件预览；视频支持 `Range` 返回 206 | root-mounted |
| DELETE | `/storage/files/:storageId` | 未发现调用 | 删除文件 | root-mounted |
| GET | `/workspace/storage/ensure-sql` | 未发现调用 | workspace 别名 | root-mounted |
| POST | `/workspace/storage/upload` | 未发现调用 | workspace 上传别名 | root-mounted |
| POST | `/workspace/storage/chat-text` | 未发现调用 | workspace 聊天文本别名 | root-mounted |
| GET | `/workspace/storage/files` | 未发现调用 | workspace 文件列表别名 | root-mounted |
| GET | `/workspace/storage/files/:storageId` | 未发现调用 | workspace 文件元数据别名 | root-mounted |
| GET | `/workspace/storage/files/:storageId/download` | 未发现调用 | workspace 下载别名 | root-mounted |
| GET | `/workspace/storage/files/:storageId/preview` | 未发现调用 | workspace 预览别名；视频支持 `Range` 返回 206 | root-mounted |
| DELETE | `/workspace/storage/files/:storageId` | 未发现调用 | workspace 删除别名 | root-mounted |

## 联调建议

第一步已完成：需要上线的 route module 已挂入 `backend-source/src/routes/index.js`，并通过静态 contract 与全量 `node --test` 验证。第二步用有效 admin token 验证 `/api/admin/dashboard`、`/api/workspace/resources`、`/api/manager/overview`、`/api/workspace/boards`、`/api/workspace/storage/ensure-sql` 是否返回非 404；如果仍是 404，优先排查部署是否加载当前后端代码和 `/api` 前缀配置。第三步在 MySQL 已启动且迁移完成后，分别执行后台管理、HR 资源、manager facade、画板创建保存、上传下载的 smoke 请求。第四步前端若开始接正式上传，请优先使用 `/workspace/storage/upload` 与 `/workspace/storage/chat-text`，保证图片、视频、附件、聊天文本都进入 `backend-source/data/storage-v1` 统一备份根目录。

