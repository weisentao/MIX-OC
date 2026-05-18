# 后台管理接口契约

维护位置：`backend-source/docs/admin-manager-api-contract.md`

核对时间：2026-05-16。本文面向后端实现和前后端联调。前端默认 `baseURL=/api`，下方路径不重复写 `/api`；本地排查时可按项目现有根路由兼容策略访问。

## 1. 接口分层

后台管理分两套入口：

| 入口 | 使用对象 | 权限边界 |
| --- | --- | --- |
| `/admin/**` | 超级后台、系统管理员 | 全局读取和管理，仅 `admin/super_admin` 可访问。 |
| `/manager/**` | 普通管理、项目经理、项目管理、部门组长 | 只允许访问当前用户授权的部门、项目和成员范围。 |

项目内的“管理”角色（`project_manager`、`department_admin`、`department_manager`）都按普通管理处理；写入、删除、导出等操作必须由后端重新校验资源范围，不能只信前端按钮是否展示。
角色归一化口径：`admin` 与 `super_admin` 统一视为超级后台角色，可访问 `/admin/**` 和全局 AI 治理能力；`project_manager`、`department_manager`、`department_admin` 统一视为普通管理角色，只能访问授权范围内的 `/manager/**`。

## 2. 通用规则

所有业务接口除登录和健康检查外都必须带：

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

列表接口建议统一兼容：

| Query | 说明 |
| --- | --- |
| `page`、`pageSize`、`limit` | 分页；`limit` 可作为 `pageSize` 别名。 |
| `keyword`、`q`、`search` | 搜索关键字。 |
| `status`、`role`、`department`、`departmentId`、`projectId`、`userId` | 常用筛选项。 |
| `from`、`to`、`startDate`、`endDate` | 时间范围。 |
| `sortBy`、`sortOrder` | 排序；`sortOrder` 只接受 `asc/desc`。 |

列表响应建议：

```json
{
  "rows": [],
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0,
    "hasNext": false
  },
  "stats": []
}
```

错误响应必须是 JSON，不返回 HTML、不重定向：

```json
{
  "code": "FORBIDDEN",
  "message": "权限不足",
  "details": {}
}
```

常用状态码：`400` 参数错误，`401` 未登录，`403` 越权，`404` 不存在，`409` 冲突，`422` 业务校验失败，`500` 服务异常，`503` 依赖不可用。

## 3. 权限模型

| 角色 | 读取范围 | 写入范围 | 删除/归档 |
| --- | --- | --- | --- |
| `admin/super_admin` | 全局 | 全局 | 可软删，可按业务允许硬删。 |
| `manager` | 自己负责、参与、部门可见或授权项目 | 授权项目和部门管理字段 | 默认软归档。 |
| `department_admin/department_manager` | 本部门成员、本部门项目、授权项目 | 本部门与授权项目 | 默认软归档。 |
| `project_manager` 或项目成员角色 `manager` | 指定项目 | 项目内容、项目成员角色 | 默认软归档。 |
| 项目成员角色 `editor` | 指定项目 | 任务、评论、画板、模板、标签等内容字段 | 不允许硬删项目。 |
| 项目成员角色 `readonly` | 指定项目 | 无写权限 | 无删除权限。 |
| `employee/user` | 自己可见数据 | 无管理写权限 | 无删除权限。 |

建议后端在响应中返回当前视图范围：

```json
{
  "scope": {
    "type": "project",
    "departmentIds": [],
    "projectIds": ["project-001"],
    "userIds": []
  },
  "capabilities": {
    "canRead": true,
    "canWrite": true,
    "canDelete": false,
    "canHardDelete": false,
    "canExport": true,
    "canManagePermission": false
  }
}
```

## 4. Admin 端接口

| 模块 | Method | Path | 说明 |
| --- | --- | --- | --- |
| 总览 | GET | `/admin/dashboard` | 全局统计、图表和风险摘要。 |
| 用户 | GET/POST | `/admin/users` | 用户列表、新增用户。 |
| 用户 | GET/PATCH/DELETE | `/admin/users/:userId` | 用户详情、更新、删除或归档。 |
| 权限 | GET/PATCH | `/admin/permissions` | 全局权限矩阵。 |
| 项目 | GET/POST | `/admin/projects` | 项目列表、新增项目。 |
| 项目 | GET/PATCH/DELETE | `/admin/projects/:projectId` | 项目详情、更新、删除。 |
| 项目 | POST | `/admin/projects/:projectId/archive` | 项目归档。 |
| 任务 | GET/POST | `/admin/tasks` | 全局任务列表、新增任务。 |
| 任务 | PATCH/DELETE | `/admin/tasks/:taskId` | 更新、删除或归档任务。 |
| 风险评论 | GET | `/admin/comments/risk` | 风险评论列表。 |
| 风险评论 | POST | `/admin/comments/:commentId/resolve` | 标记风险已处理。 |
| 排期 | GET | `/admin/schedules` | 全局排期列表和统计。 |
| 画板 | GET | `/admin/boards` | 全局画板列表。 |
| 画板 | PATCH/DELETE | `/admin/boards/:boardId` | 画板管理。 |
| 模板 | GET/POST | `/admin/templates` | 模板列表、新增模板。 |
| 模板 | PATCH/DELETE | `/admin/templates/:templateId` | 模板更新、删除。 |
| 标签 | GET/POST | `/admin/tags` | 标签列表、新增标签。 |
| 标签 | DELETE | `/admin/tags/:tagId` | 删除或归档标签。 |
| 公告 | GET/POST | `/admin/notices` | Announcement list/create; payload fields: title/content/status/priority/linkText/linkUrl/linkTarget/startAt/endAt. |
| 公告 | PATCH/DELETE | `/admin/notices/:noticeId` | Update, enable/disable, or delete announcements. Admin write auth required. |
| 部门 | GET/POST | `/admin/departments` | 部门列表、新增部门。 |
| 部门 | PATCH/DELETE | `/admin/departments/:departmentId` | 部门更新、删除。 |
| 归档 | GET | `/admin/archives` | 归档资源列表。 |
| 归档 | POST | `/admin/archives/:archiveId/restore` | 恢复归档。 |
| 归档 | DELETE | `/admin/archives/:archiveId` | 删除归档资源。 |
| 系统 | GET | `/admin/system/status` | 系统状态。 |
| System Config | GET/PATCH | `/admin/system/config` | Reserved safe configuration endpoint; only `siteName`, `maintenanceMode`, `registrationEnabled`, and `auditRetentionDays` are editable, never secrets. |
| 审计 | GET | `/admin/audit-logs` | 审计日志。 |

Announcement delete route: DELETE `/admin/notices/:noticeId`.

## 5. 普通管理接口

| 模块 | Method | Path | 说明 |
| --- | --- | --- | --- |
| 总览 | GET | `/manager/overview` | 当前权限范围的管理总览。 |
| 部门 | GET | `/manager/departments/:departmentId` | 部门详情和统计。 |
| 成员 | GET | `/manager/members` | 授权范围内成员列表。 |
| 成员 | GET/PATCH | `/manager/members/:userId` | 成员详情、更新授权字段。 |
| 成员 | POST | `/manager/members/:userId/reset-password` | 重置成员密码，需管理权限。 |
| 项目 | GET/POST | `/manager/projects` | 授权项目列表、新增项目。 |
| 项目 | GET/PATCH | `/manager/projects/:projectId` | 项目详情、更新项目。 |
| 项目 | POST | `/manager/projects/:projectId/archive` | 项目归档。 |
| 项目 | DELETE | `/manager/projects/:projectId` | 默认软删除或归档。 |
| 任务 | GET/POST | `/manager/projects/:projectId/tasks` | 项目任务列表、新增任务。 |
| 任务 | PATCH/DELETE | `/manager/tasks/:taskId` | 更新、删除任务。 |
| 评论 | GET | `/manager/projects/:projectId/comments` | 项目评论。 |
| 评论 | POST | `/manager/comments/:commentId/resolve` | 处理评论。 |
| 排期 | GET | `/manager/projects/:projectId/schedule` | 项目排期。 |
| 排期 | POST | `/manager/projects/:projectId/schedule/export` | 导出排期。 |
| 成员角色 | GET/PATCH | `/manager/projects/:projectId/members/:userId` | 项目成员角色管理。 |
| 画板 | GET/POST/PATCH | `/manager/projects/:projectId/boards` | 项目画板管理。 |
| 模板 | GET/POST | `/manager/projects/:projectId/templates` | 项目模板。 |
| 标签归档 | GET | `/manager/projects/:projectId/tags-archives` | 项目标签和归档。 |
| 标签 | POST | `/manager/projects/:projectId/tags` | Creates a global tag library entry and returns `id/tagId/name`; project binding remains controlled by the project `tags` payload. |
| 标签 | POST | `/manager/projects/:projectId/tags/:tagId/archive` | Records a project tag archive review intent only; it must not hard-delete the global tag and returns `globalDeleteBlocked=true`. |
| 账号 | GET | `/manager/accounts` | 授权范围账号列表。 |

普通管理端不应返回全局未授权数据；未知归属日志、未知归属项目、未知部门数据默认不展示。

## 6. AI 助手后台治理

完整 AI 契约维护在 `backend-source/docs/ai-assistant-api-contract.md`。这里记录后台管理需要对接的边界。

### 6.1 安全边界

DeepSeek key 只能保存在后端 AI JSON 配置或后端运行环境变量中。后台管理仅允许提交 `homeDeepSeekApiKey` 和 `hrDeepSeekApiKey` 两个 scoped key 字段；响应只能返回 `configured` 与 `masked` 状态，不能回显明文 key。运行时优先使用已保存 scoped key，其次使用 `DEEPSEEK_HOME_API_KEY` / `DEEPSEEK_HR_API_KEY`，最后回退 `DEEPSEEK_API_KEY`。禁止写入前端 `.env`、构建产物、本地存储、请求头、日志或任何接口响应。

后台页面只能看到：

```json
{
  "configured": false,
  "apiKeyConfigured": false,
  "keySource": "env"
}
```

`PATCH /admin/ai/config` 如果收到 `apiKey`、`deepseekApiKey`、`DEEPSEEK_API_KEY`、`DEEPSEEK_HOME_API_KEY`、`DEEPSEEK_HR_API_KEY`、`authorization`、`token`、`secret` 等字段，必须返回 `400`。`/admin/system/config` is a reserved system configuration endpoint, not an AI config key store. It must not carry provider keys, JWTs, database passwords, or other secrets; only non-secret site/audit switches are accepted.

### 6.2 路由清单

| 能力 | Method | Path | 权限 | 说明 |
| --- | --- | --- | --- | --- |
| 工作台聊天 | POST | `/workspace/ai/chat` | 登录用户 | 首页搜索和右下角助手统一入口。 |
| 旧入口兼容 | POST | `/workspace/ai/home-assistant` | 登录用户 | 兼容旧前端，复用 chat 逻辑。 |
| 工作台设置 | GET | `/workspace/ai/settings` | 登录用户 | 当前用户可见的启用、模型、联网状态摘要。 |
| 个人日志 | GET | `/workspace/ai/logs` | 登录用户 | 当前用户自己的智能使用记录。 |
| Admin 配置 | GET | `/admin/ai/config` | admin/super_admin | 全局配置和脱敏 key 状态。 |
| Admin 更新配置 | PATCH | `/admin/ai/config` | admin/super_admin | 更新非密钥配置。 |
| Admin 模型 | GET | `/admin/ai/models` | admin/super_admin | 返回可选模型。 |
| Admin 使用日志 | GET | `/admin/ai/usage-logs` | admin/super_admin | 全局智能使用记录。 |
| Admin 文档 | GET/POST/PATCH/DELETE | `/admin/ai/documents`、`/admin/ai/documents/:documentId` | admin/super_admin | 智能资料文档 CRUD。 |
| 普通管理配置 | GET | `/manager/ai/config` | manager/project_manager/department_manager/department_admin/admin/super_admin | 只读配置摘要。 |
| 普通管理日志 | GET | `/manager/ai/logs` | manager/project_manager/department_manager/department_admin/admin/super_admin | 只读权限范围内日志。 |

### 6.3 配置字段

```json
{
  "enabled": true,
  "provider": "deepseek",
  "configured": false,
  "apiKeyConfigured": false,
  "keySource": "env",
  "modelId": "deepseek-v4-flash",
  "defaultModel": "deepseek-v4-flash",
  "fallbackModel": "deepseek-v4-pro",
  "webSearchEnabled": false,
  "allowWebSearch": false,
  "knowledgeScopes": ["tasks", "comments", "schedules", "documents"],
  "maxContextMessages": 8,
  "maxMessageChars": 2000,
  "temperature": 0.3,
  "openingTemplate": "你好同学，下面是我整理的答案："
}
```

前端保存配置时只提交这些非密钥字段，不会把整份表单对象、key、token 或供应商 Authorization 传给后端。
联网字段以后端标准字段 `webSearchEnabled` 为准，表示配置层是否允许联网。前端可以兼容旧别名 `allowWebSearch`、`webSearch`、`enableWebSearch`，但提交配置和展示新响应时应优先使用 `webSearchEnabled`；日志和聊天响应使用 `webSearchUsed` 表示本次回答是否实际联网。

### 6.4 模型

当前推荐：

| ID | 前端展示 |
| --- | --- |
| `deepseek-v4-flash` | 深度求索第四代极速版 |
| `deepseek-v4-pro` | 深度求索第四代专业版 |

兼容旧名：`deepseek-chat` 归一化到 flash，`deepseek-reasoner` 归一化到 pro。后端返回空模型数组时，前端展示“暂无模型”，不伪造后端数据。

### 6.5 资料文档

新增文档至少需要 `title` 和 `content`：

```json
{
  "title": "交付规范",
  "category": "流程资料",
  "source": "后台资料库",
  "summary": "给智能问答引用的摘要",
  "content": "完整正文",
  "scope": "global",
  "scopeTargetId": "",
  "scopeTargetName": "",
  "status": "active",
  "tags": []
}
```

`scope` 可为 `global/workspace/home/self/department/project`。当选择部门、项目或本人范围时，前端会提交 `scopeTargetId` 和 `scopeTargetName`，后端要保存这两个字段，并在检索召回时用当前登录人的真实权限做二次校验。
资料文档的新增、编辑、列表和详情响应都必须支持并返回 `scopeTargetId`、`scopeTargetName`。后台管理页用这两个字段回显部门、项目或本人范围选择器；如果目标对象已删除或当前用户无权查看，后端应过滤该文档或返回脱敏空值，不能泄漏未授权对象名。
`status` 规范值为 `active`、`archived`、`draft`。前端兼容旧的 `enabled/disabled`，但后端响应建议统一返回规范值。When deleting a document, the frontend may send `reason`/`deleteReason` in body or query. The backend redacts and stores this in document JSON store deletion metadata, and returns `deleteReasonRecorded`; this is lightweight operation metadata, not a full `admin_audit_logs` entry.

后续接入文件库或向量库时，召回结果必须先按当前用户 scope 过滤，再进入 DeepSeek 提示词。

### 6.6 使用日志

日志列表统一兼容 `rows/items/pagination`。单条日志至少包含：

```json
{
  "id": "log_xxx",
  "userId": "u-001",
  "username": "张三",
  "role": "manager",
  "question": "问题摘要",
  "answerPreview": "回答摘要",
  "model": "deepseek-v4-flash",
  "webSearchUsed": false,
  "scope": "home",
  "scopeTargetId": "",
  "scopeTargetName": "",
  "status": "success",
  "source": "deepseek",
  "latencyMs": 820,
  "usage": {
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0
  },
  "retrieval": {
    "requestedScope": "home",
    "documentCount": 0,
    "documentIds": []
  },
  "failureReason": "",
  "createdAt": "2026-05-16T00:00:00.000Z"
}
```

分页和筛选请求参数统一兼容 `page/pageSize/limit/keyword/q/status/scope`。`limit` 是 `pageSize` 的旧别名；`keyword` 和 `q` 是同义搜索词；`status` 常见值为 `success/fallback/failed/error`；`scope` 常见值为 `global/workspace/home/self/department/project`，不能绕过登录人的权限边界。
聊天请求、日志写入和日志响应都支持 `scopeTargetId`、`scopeTargetName`。后端写日志时应保存权限归一化后的真实目标对象，前端传入的名称只作为显示意图，不能作为授权依据。
日志不得保存 DeepSeek key、JWT、Authorization header、密码、完整敏感 prompt 或供应商原始错误。失败原因必须脱敏。
普通管理日志过滤规则：admin 可看全局；普通管理只能看本人日志，或明确授权的项目/部门 scope 日志；`workspace/global/home/self` 这类泛 scope 不能用来暴露其他人的日志。

### 6.7 Chat fallback

首页场景未配置可用 key（`DEEPSEEK_HOME_API_KEY` 与 `DEEPSEEK_API_KEY` 均为空）、供应商失败或后台停用时，聊天接口返回本地兜底：

```json
{
  "answer": "本地兜底回答",
  "status": "fallback",
  "source": "fallback",
  "usage": {
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0
  }
}
```

前端显示为“本地整理，待连接”，不要求用户输入 key。

## 7. 联调 Checklist

1. 未带 token 请求 `/api/admin/**`、`/api/manager/**`、`/api/workspace/ai/**` 返回 401 JSON。
2. manager 请求 `/api/admin/**` 返回 403 JSON。
3. 项目经理、项目管理、部门组长可访问 `/api/manager/ai/config` 和 `/api/manager/ai/logs`。
4. Admin 能保存智能配置、联网开关、知识范围、回答模板和智能资料文档。
5. Admin 不能通过接口提交或读取 DeepSeek key 明文。
6. 普通管理只能够看到当前权限范围内的智能使用记录。
7. 首页场景未配置 `DEEPSEEK_HOME_API_KEY` 且 `DEEPSEEK_API_KEY` 时，聊天接口返回明确未配置错误或兜底响应，且不泄露密钥。
8. 人力场景未配置 `DEEPSEEK_HR_API_KEY` 且 `DEEPSEEK_API_KEY` 时，`/workspace/resources/ai/assignment-advice` 返回 503 与 `HR_AI_KEY_NOT_CONFIGURED`。
9. 前端源码、构建产物、请求和响应中不能出现真实 DeepSeek key。
10. Document CRUD supports create, edit, enable/disable, and delete; delete still requires admin authorization and records redacted deletion-reason metadata when supplied.
11. 所有日志和审计记录必须脱敏。
