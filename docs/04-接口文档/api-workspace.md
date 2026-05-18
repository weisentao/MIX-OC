# Workspace Modular API

本文档对应 `xjg-api` 新增的模块化业务接口，覆盖项目、任务、评论、标签、画板，并为模板保留只读占位接口。排期接口独立记录在 `docs/schedule-api.md`。

## Base URL

- 直连：`http://localhost:13001`
- 通过前端代理：`/api`

说明：
- 本文档主路径按任务要求列为根路径（如 `/project-groups`）。
- 同时提供 `/workspace/*` 兼容别名（例如 `/workspace/project-groups`），用于减少前端适配成本。

## 统一规则

- 所有本模块接口都需要 `Authorization: Bearer <token>`。
- 未登录统一返回 `401`：

```json
{ "message": "Unauthorized" }
```

- 当 MySQL 不可用时，本模块接口统一返回 `503`：

```json
{ "message": "MySQL unavailable for modular workspace API" }
```

- 生产验收口径：`503` 代表正式库链路阻塞，不是上线通过；需要先恢复 MySQL 并执行生产 smoke。
- 旧接口 `GET/PUT /appState/main` 不受影响，仍可继续使用（包含文件 fallback），但只能作为兼容兜底，不能作为正式上线验收条件。

## 数据结构（贴近前端 store）

### ProjectGroup

```json
{
  "id": "group-uid",
  "title": "王者荣耀爆料",
  "suffix": "2",
  "status": "active",
  "sortOrder": 1,
  "projects": []
}
```

### Project

```json
{
  "id": 1003,
  "projectId": "project-uid",
  "groupId": "group-uid",
  "group": "王者荣耀爆料",
  "name": "新活动，福利，新界面",
  "status": "active",
  "owner": "项目管理: 木头",
  "members": ["严云雪", "张三"],
  "memberRoles": { "严云雪": "manager", "张三": "editor" },
  "tags": ["CF", "非常难"],
  "syncSchedule": true,
  "startDate": "2026/05/08",
  "endDate": "2026/05/08",
  "archived": false,
  "tasks": []
}
```

### Task

```json
{
  "id": 1300101,
  "taskId": "task-uid",
  "projectId": "project-uid",
  "title": "美术确认",
  "type": "流程",
  "note": "确认画面与文案",
  "module": "design",
  "owner": "平面1部: 大头",
  "ownerUserId": "u-zhang",
  "status": "todo",
  "priority": "normal",
  "startDate": "2026/05/08",
  "endDate": "2026/05/08",
  "comments": [],
  "unreadComments": 0,
  "expanded": false,
  "archived": false,
  "time": "2026/05/12 18:30",
  "sortOrder": 1
}
```

### Comment

```json
{
  "id": "comment-uid",
  "commentId": "comment-uid",
  "taskId": "task-uid",
  "projectId": "project-uid",
  "userId": "u-admin",
  "user": "admin",
  "dept": "项目管理",
  "tone": "blue",
  "time": "2026/05/12 18:35",
  "text": "先补一版确认稿",
  "mentions": [
    {
      "userId": "u-chenlingfeng",
      "username": "MIX-chenlingfeng",
      "name": "陈凌峰",
      "displayName": "陈凌峰"
    }
  ]
}
```

### Tag

```json
{
  "name": "CF",
  "color": "red",
  "scope": "workspace",
  "status": "active",
  "sortOrder": 1
}
```

## 接口清单

### 1) Bootstrap

- `GET /workspace/bootstrap`
- 返回：`{ rootProjects, projectGroups, tags }`
- 用途：替代整包 `appState` 的优先加载入口。

### 2) 项目分组

- `GET /project-groups`
- `POST /project-groups`
- `PUT /project-groups/:id`
- `DELETE /project-groups/:id`
- 兼容别名：`/workspace/project-groups`（同读写语义）

`POST/PUT` 请求体示例：

```json
{
  "title": "王者荣耀爆料",
  "suffix": "2",
  "status": "active",
  "sortOrder": 10
}
```

### 3) 项目

- `GET /projects`
- `POST /projects`
- `PUT /projects/:id`
- `DELETE /projects/:id`
- 兼容别名：`/workspace/projects`（含 `/:id`）

`POST/PUT` 请求体示例：

```json
{
  "id": 1003,
  "name": "新活动，福利，新界面",
  "groupId": "group-uid",
  "group": "王者荣耀爆料",
  "owner": "项目管理: 木头",
  "members": ["严云雪", "张三"],
  "memberRoles": { "严云雪": "manager", "张三": "editor" },
  "tags": ["CF", "非常难"],
  "syncSchedule": true,
  "startDate": "2026/05/08",
  "endDate": "2026/05/08",
  "status": "active",
  "archived": false,
  "sortOrder": 100
}
```

### 4) 任务

- `GET /projects/:projectId/tasks`
- `POST /projects/:projectId/tasks`
- `PUT /tasks/:taskId`
- `DELETE /tasks/:taskId`
- 兼容别名：
  - `/workspace/projects/:projectId/tasks`
  - `/workspace/tasks/:taskId`

`POST/PUT` 请求体示例：

```json
{
  "id": 1300101,
  "title": "美术确认",
  "type": "流程",
  "note": "确认文案和画面",
  "module": "design",
  "owner": "平面1部: 大头",
  "ownerUserId": "u-zhang",
  "status": "todo",
  "priority": "normal",
  "startDate": "2026/05/08",
  "endDate": "2026/05/08",
  "archived": false,
  "expanded": false,
  "unreadComments": 0,
  "sortOrder": 200
}
```

### 5) 评论

- `GET /tasks/:taskId/comments`
- `POST /tasks/:taskId/comments`
- `GET /comments/search`
- 兼容别名：
  - `GET /workspace/tasks/:taskId/comments`
  - `POST /workspace/tasks/:taskId/comments`
  - `GET /workspace/comments/search`

请求体示例：

```json
{
  "text": "先补一版确认稿",
  "user": "admin",
  "dept": "项目管理",
  "tone": "blue",
  "mentions": ["MIX-chenlingfeng"]
}
```

返回示例：

```json
{
  "id": "comment-uid",
  "commentId": "comment-uid",
  "taskId": "task-uid",
  "projectId": "project-uid",
  "userId": "u-admin",
  "user": "admin",
  "dept": "项目管理",
  "tone": "blue",
  "time": "2026/05/12 18:35",
  "text": "先补一版确认稿",
  "mentions": [
    {
      "userId": "u-chenlingfeng",
      "username": "MIX-chenlingfeng",
      "name": "陈凌峰",
      "displayName": "陈凌峰"
    }
  ]
}
```

评论搜索参数：

- `q` / `keyword`：按评论正文模糊搜索。
- `projectId`：限定项目。
- `taskId`：限定任务。
- `mentionedUserId` / `mentionedUsername`：限定被 @ 的真实用户。
- `limit`：返回数量，范围 `1..100`，默认 `20`。

`@` 成员规则：

- 请求体可传 `mentions` 或 `mentionUserIds` 数组。
- 数组项可以是用户名（如 `MIX-chenlingfeng`）、`user_uid`、真实姓名，或包含 `username/userId/id/name` 的对象。
- 后端会用 `users` 表解析真实用户，并写入 `comment_mentions`。
- 找不到真实用户时返回业务错误，不会写入虚拟 @ 记录。
- 删除任务或项目时，会同步删除 smoke/业务链路下对应的 `comment_mentions` 与 `task_comments`。

### 6) 通讯录

- `GET /address-book`
- `GET /departments`
- `GET /contacts`
- 兼容别名：
  - `GET /workspace/address-book`
  - `GET /workspace/departments`
  - `GET /workspace/contacts`

`GET /address-book` 查询参数：

- `q` / `keyword`：按用户名、姓名、展示名、部门模糊搜索。
- `departmentId` / `department_id`：按部门过滤。
- `limit`：返回数量，范围 `1..200`，默认 `100`。

`GET /contacts` 查询参数：

- `ownerUserId`：查询指定用户的联系人；不传时默认当前登录用户。

通讯录返回示例：

```json
[
  {
    "id": "ab-uid",
    "userId": "u-chenlingfeng",
    "username": "MIX-chenlingfeng",
    "name": "陈凌峰",
    "displayName": "陈凌峰",
    "departmentId": "dept-art",
    "departmentName": "美术部",
    "departmentPath": "项目/美术部",
    "phone": "",
    "email": "",
    "status": "active",
    "sortOrder": 10
  }
]
```

### 7) 项目共享与成员

- `GET /projects/:projectId/members`
- `GET /projects/:projectId/shares`
- `POST /projects/:projectId/shares`
- 兼容别名：
  - `GET /workspace/projects/:projectId/members`
  - `GET /workspace/projects/:projectId/shares`
  - `POST /workspace/projects/:projectId/shares`

`POST /projects/:projectId/shares` 请求体示例：

```json
{
  "username": "MIX-chenlingfeng",
  "permission": "write",
  "memberRole": "editor",
  "note": "共享给项目成员"
}
```

字段说明：

- `username` / `toUsername` / `toUserId` / `toUserUid`：目标真实用户，后端从 `users` 表解析。
- `permission`：共享权限，常用值 `read`、`write`。
- `memberRole`：同步写入 `project_members` 的成员角色，常用值 `readonly`、`editor`、`manager`。
- `expiresAt`：可选，到期日期，格式可用 `YYYY-MM-DD` 或 `YYYY/MM/DD`。

返回示例：

```json
{
  "id": "share-uid",
  "shareId": "share-uid",
  "resourceType": "project",
  "resourceId": "project-uid",
  "fromUserId": "u-admin",
  "toUserId": "u-chenlingfeng",
  "toUsername": "MIX-chenlingfeng",
  "toName": "陈凌峰",
  "permission": "write",
  "status": "active",
  "sharedAt": "2026/05/12 18:40",
  "expiresAt": ""
}
```

### 8) 标签

- `GET /tags`
- `POST /tags`
- `DELETE /tags/:name`
- 兼容别名：`/workspace/tags`

`POST /tags` 请求体示例：

```json
{
  "name": "版本阻塞",
  "color": "yellow",
  "scope": "workspace",
  "status": "active",
  "sortOrder": 300
}
```

### 9) 模板占位

- `GET /templates`
- 兼容别名：`GET /workspace/templates`

当前返回固定结构：

```json
{
  "message": "Template modular API is reserved for next phase.",
  "items": []
}
```

### 10) 画板

画板已经是 MySQL-backed API，不再是 placeholder。完整契约见 `docs/board-api.md`。

- `GET /boards`
- `POST /boards`
- `GET /boards/:boardId`
- `PATCH /boards/:boardId`
- `PUT /boards/:boardId`
- `DELETE /boards/:boardId`
- `PUT /boards/:boardId/shares`
- `POST /boards/:boardId/shares`
- `GET /boards/:boardId/history`
- 兼容别名：
  - `GET /workspace/boards`
  - `POST /workspace/boards`
  - `GET /workspace/boards/:boardId`
  - `PATCH /workspace/boards/:boardId`
  - `PUT /workspace/boards/:boardId`
  - `DELETE /workspace/boards/:boardId`
  - `PUT /workspace/boards/:boardId/shares`
  - `POST /workspace/boards/:boardId/shares`
  - `GET /workspace/boards/:boardId/history`

当 MySQL 不可用时返回 `503`：

```json
{ "message": "MySQL unavailable for board API" }
```

生产上线口径：`503` 是画板链路阻塞；`/appState/main` fallback 或页面可打开不能替代 `npm run smoke:boards`。

