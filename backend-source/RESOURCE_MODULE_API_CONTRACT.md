# 人力模块 API 对接契约

> 更新时间：2026-05-15 21:58 +08:00  
> 前端入口：`frontend-source/src/features/resource/components/ResourceView.vue`。后端只需要按本文返回权限、资源快照、负载快照和分配同步结果；前端不会用本地角色放大全量权限。

## 后端必读：AI key 与同步边界

`DEEPSEEK_API_KEY` 只能由后端保存和读取，建议放在后端运行环境变量或后端密钥管理服务中。前端不会、也不允许保存 DeepSeek key，不会把 key 写入 `.env`、构建产物、本地存储、请求头、请求体或响应；前端只调用 `POST /workspace/resources/ai/assignment-advice`，由后端代理 DeepSeek 并返回结构化建议。

`POST /workspace/resources/ai/assignment-advice` 的入参必须能表达四类上下文：任务/流程/排期上下文、候选人集合、权限上下文、时间范围。后端需要按 token 和 scope 重新校验并过滤这些数据，AI 只允许在已授权候选集内给出建议；响应顶层必须包含 `candidates`、`risk`、`summary`、`actions`，便于前端直接渲染候选人推荐、风险提示、摘要和后续动作。

时间条写入事件只认三种：`move`、`resize-start`、`resize-end`。人力模块确认移动或拉伸后，后端必须同步 `resource work item`、`schedule item`、`flow/task`；反向地，创建或修改流程/排期时，也必须创建或更新对应的人力工作项，并稳定返回 `workItemId`、`scheduleItemId/itemId`、`taskUid/taskId`、`projectId` 等关联字段。

## 总规则

人力模块权限以服务端返回为准。`admin` / `super_admin` 即使没有部门，也必须返回公司级：人力接口返回 `scope.type = "company"`，后台权限关系返回 `scopeType = "global"`；前端统一按 `company` 处理，不把 `global` 当成单独资源视角。

排期、流程、人力资源工作项共享开始和结束时间。后端在排期或流程修改 `startDate` / `endDate` 后，需要同步到人力模块对应 `resource work item`；人力拖拽确认后，也需要同步回关联的 `schedule item` 和 `flow/task`。

日期字段统一用 `startDate` / `endDate`，响应建议统一 `YYYY/MM/DD`。请求可兼容 `YYYY-MM-DD`，但返回不能混用字段名。

## 权限与可见数据

| scope | 后端返回 | 前端可见数据 | 可分配 | 可强制分配 |
| --- | --- | --- | --- | --- |
| 公司级 | `scope.type = "company"`；后台 `scopeType = "global"` | 全公司部门、人员、工作项、负载、冲突 | 是 | 是 |
| 部门级 | `scope.type = "department"` + `departmentIds` | 指定部门人员、部门工作项、部门空闲窗口 | 是 | 否，除非后端显式给 `canForceAssign` |
| 项目级 | `scope.type = "project"` 或 `"authorized"` + `projectIds` | 指定项目的工作项，以及这些工作项关联人员 | 是 | 否，除非后端显式给 `canForceAssign` |
| 个人级 | `scope.type = "self"` + `userIds` | 本人资料、本人工作项、本人空闲窗口 | 否 | 否 |

权限字段需兼容两组命名。后端可以返回旧字段 `canViewCompany`、`canViewDepartment`、`canViewProject`、`canAssign`、`canForceAssign`，也可以返回前端字段 `canViewSuperAdminView`、`canViewDepartmentView`、`canViewProjectManagerView`、`canAssignTask`、`canForceAssignOverload`。如果两组同时存在，以后端判权结果为准，不要让前端推断提升权限。

推荐权限片段：

```json
{
  "resourcePermissions": {
    "role": "admin",
    "scope": {
      "type": "company",
      "departmentIds": [],
      "projectIds": [],
      "userIds": []
    },
    "canViewCompany": true,
    "canViewDepartment": true,
    "canViewProject": true,
    "canAssign": true,
    "canForceAssign": true
  }
}
```

admin / super_admin 无部门时后台权限关系也要稳定返回：

```json
{
  "userId": "u-admin",
  "role": "admin",
  "scopeType": "global",
  "scopeId": ""
}
```

## 接口清单

| Method | Path | 用途 | 必要状态 |
| --- | --- | --- | --- |
| GET | `/workspace/resources` | 返回人力资源快照、权限、人员、工作项基础信息 | 必须接通 |
| GET | `/workspace/workload` | 返回当前 scope 内负载、空闲窗口、候选人和冲突 | 必须接通 |
| POST | `/workspace/assignments/preview` | 拖拽或选择候选人的分配预览，不写入 | 必须接通 |
| POST | `/workspace/assignments/confirm` | 确认分配，并同步排期、流程、人力工作项 | 必须接通 |
| POST | `/workspace/assignments/force-confirm` | 超载强制确认，需要权限和原因 | 必须接通 |
| POST | `/workspace/resources/ai/assignment-advice` | DeepSeek/AI 人力建议后端代理，只返回结构化推荐 | 必须走后端代理 |
| PATCH | `/workspace/resources/work-items/:id/schedule` | 预留：只同步资源工作项日期/负责人到排期和流程 | 先预留路径 |

## GET /workspace/resources

用于初始化人力模块。响应必须包含权限；如果后端暂时无法计算权限，宁可返回 `self` 或 403，不能返回全量。

请求 query：

| 字段 | 说明 |
| --- | --- |
| `status` | 前端当前传 `active` |
| `startDate` / `endDate` | 可选，用于限制工作项时间范围 |
| `scope` | 可选，后端仍需以 token 判权为准 |

响应字段：

| 字段 | 说明 |
| --- | --- |
| `resourcePermissions` / `permissions` | 权限对象，至少返回一个 |
| `scope` | 可为字符串或对象；对象需含 `type`、`departmentIds`、`projectIds`、`userIds` |
| `departments[]` | `id`、`name`、`color` |
| `people[]` | `id/userId`、`name`、`departmentId`、`departmentName`、`roleTitle/job/title`、`load/workload` |
| `workItems[]` | `id/itemId/workItemId`、`projectId`、`personId` 或 `assigneeId`、`assigneeName`、`title`、`startDate`、`endDate` |
| `range` / `dateRange` | `startDate`、`endDate` |

`workItems[]` 必须保留 `projectId`。项目级和授权级前端会按 `scope.projectIds` 裁剪；没有 `projectId` 的项目工作项会被安全过滤掉。

## GET /workspace/workload

用于补齐负载、空闲窗口、冲突和候选人。query 应兼容：

```json
{
  "startDate": "2026/05/10",
  "endDate": "2026/06/21",
  "scope": "project",
  "departmentIds": ["dept-design"],
  "projectIds": ["project-1001"],
  "userIds": ["u-anna"]
}
```

响应可返回 `workItems`、`availability`、`candidates`、`people` / `workloads` / `personWorkloads`。人员负载字段兼容 `load`、`workload`、`utilization`。

## POST /workspace/resources/ai/assignment-advice

该接口是 DeepSeek/AI 人力建议的唯一前端入口。前端只允许调用后端代理 `POST /workspace/resources/ai/assignment-advice`，不能直连 DeepSeek 或其他 AI 服务；`DEEPSEEK_API_KEY` 只能配置在后端运行环境变量中，不允许写入前端 env、构建产物、本地存储、请求体或响应。

后端代理组装提示词时只能使用前端请求体和后端按 token / scope 补齐的人力、排期、流程、权限范围数据，包括 `people`、`workItems`、`scheduleItems`、`tasks`、`flowItems`、`scope`、`permissions`、`availability`、`conflicts`、`candidates`、`timeRange`。AI 只做总结和推荐，不允许外部检索，不允许推断权限范围外的人员、项目、部门、排期或流程，不允许扩展组织架构，也不能输出未在输入候选集中出现的负责人；越权数据应在调用 AI 前由后端过滤或直接返回 403。

请求体必须覆盖以下语义，不要求字段名完全一致，但需要能被后端归一化为同一结构：任务/流程/排期上下文使用 `taskUid/taskId`、`flowId`、`scheduleItemId/itemId`、`projectId`、`workItemId`、`title`、`startDate`、`endDate` 表达；候选人使用 `candidates[]` 或 `people[]` 表达，并包含 `personId/userId`、`name`、`departmentId`、`loadBefore/loadAfter`、可用性和冲突；权限上下文使用 `scope`、`permissions/resourcePermissions`、`departmentIds`、`projectIds`、`userIds` 表达；时间范围使用 `startDate`、`endDate` 或 `timeRange.startDate/timeRange.endDate` 表达。

请求体建议：

```json
{
  "workItemId": "wi-1001",
  "scheduleItemId": "si-1001",
  "taskUid": "task-1001",
  "flowId": "flow-1001",
  "projectId": "project-1001",
  "title": "活动页资源补齐",
  "startDate": "2026/05/18",
  "endDate": "2026/05/22",
  "timeRange": {
    "startDate": "2026/05/18",
    "endDate": "2026/05/22"
  },
  "scope": {
    "type": "project",
    "projectIds": ["project-1001"]
  },
  "permissions": {
    "canAssign": true,
    "canForceAssign": false
  },
  "people": [],
  "workItems": [],
  "scheduleItems": [],
  "tasks": [],
  "flowItems": [],
  "availability": [],
  "conflicts": [],
  "candidates": [
    {
      "personId": "u-linxin",
      "name": "林鑫",
      "departmentId": "dept-design",
      "departmentName": "美术设计部",
      "loadBefore": 55,
      "loadAfter": 75,
      "skillTags": ["UI", "活动页"]
    }
  ]
}
```

响应必须是结构化 JSON，不要返回只能展示的长文本。前端读取的顶层字段固定为 `candidates`、`risk`、`summary`、`actions`；如需兼容旧字段，可以额外返回 `recommendedCandidate`、`candidateScores`、`scheduleAdvice`、`communicationAdvice`、`risks`、`syncPlan`，但不能缺少这四个顶层字段。

```json
{
  "candidates": [
    {
      "personId": "u-linxin",
      "name": "林鑫",
      "score": 86,
      "rank": 1,
      "reason": "负载可承接，技能标签匹配，当前项目排期冲突最少",
      "loadBefore": 55,
      "loadAfter": 75,
      "risks": []
    }
  ],
  "risk": {
    "level": "medium",
    "items": [
      {
        "code": "WEEKLY_LOAD_ATTENTION",
        "message": "候选人在同周已有两个视觉任务，需要关注返工风险"
      }
    ]
  },
  "summary": {
    "text": "建议分配给林鑫，并保持 2026/05/18 至 2026/05/22 的当前窗口。",
    "startDate": "2026/05/18",
    "endDate": "2026/05/22"
  },
  "actions": [
    {
      "type": "confirm-assignment",
      "label": "确认分配",
      "personId": "u-linxin",
      "workItemId": "wi-1001",
      "scheduleItemId": "si-1001",
      "taskUid": "task-1001"
    },
    {
      "type": "communication",
      "label": "确认素材冻结时间",
      "message": "向项目负责人确认活动页素材冻结时间"
    }
  ],
  "recommendedCandidate": {
    "personId": "u-linxin",
    "name": "林鑫",
    "reason": "负载可承接，技能标签匹配，当前项目排期冲突最少"
  },
  "candidateScores": [
    {
      "personId": "u-linxin",
      "name": "林鑫",
      "score": 86,
      "reasons": ["技能匹配", "排期可用", "负载低于阈值"],
      "risks": []
    }
  ],
  "scheduleAdvice": {
    "startDate": "2026/05/18",
    "endDate": "2026/05/22",
    "summary": "建议保持当前窗口，并在 2026/05/20 前确认素材输入"
  },
  "communicationAdvice": [
    "向项目负责人确认活动页素材冻结时间",
    "与林鑫确认 2026/05/18 上午是否可启动"
  ],
  "risks": [
    {
      "level": "medium",
      "message": "候选人在同周已有两个视觉任务，需要关注返工风险"
    }
  ],
  "syncPlan": {
    "resourceWorkItemId": "wi-1001",
    "scheduleItemId": "si-1001",
    "taskUid": "task-1001",
    "targets": ["resourceWorkItem", "scheduleItem", "flowTask"],
    "requiresConfirm": true
  }
}
```

## POST /workspace/assignments/preview

预览接口只做校验和推荐，不修改排期、流程或人力工作项。请求体：

```json
{
  "workItemId": "wi-1001",
  "scheduleItemId": "si-1001",
  "taskUid": "task-1001",
  "projectId": "project-1001",
  "assigneeId": "u-linxin",
  "assigneeName": "林鑫",
  "startDate": "2026/05/18",
  "endDate": "2026/05/22",
  "skillTags": ["UI", "活动页"],
  "scope": {
    "type": "project",
    "projectIds": ["project-1001"]
  }
}
```

响应：

```json
{
  "preview": {
    "id": "preview-1001",
    "previewId": "preview-1001",
    "allowed": true,
    "requiresForce": false,
    "candidates": [
      {
        "personId": "u-linxin",
        "name": "林鑫",
        "departmentId": "dept-design",
        "departmentName": "美术设计部",
        "loadBefore": 55,
        "loadAfter": 75,
        "conflictCount": 0
      }
    ],
    "conflicts": []
  }
}
```

## POST /workspace/assignments/confirm

确认接口成功后必须同步三类对象：`schedule item`、`flow/task`、`resource work item`。拖拽一个已关联工作项时，后端要根据 `workItemId`、`scheduleItemId`、`taskUid/taskId`、`projectId` 找到所有关联对象，并同步负责人和日期。

请求体：

```json
{
  "previewId": "preview-1001",
  "workItemId": "wi-1001",
  "scheduleItemId": "si-1001",
  "taskUid": "task-1001",
  "projectId": "project-1001",
  "assigneeId": "u-linxin",
  "assigneeName": "林鑫",
  "startDate": "2026/05/18",
  "endDate": "2026/05/22",
  "interaction": "move"
}
```

成功响应：

```json
{
  "assignment": {
    "id": "assignment-1001",
    "workItemId": "wi-1001",
    "projectId": "project-1001",
    "personId": "u-linxin",
    "assigneeId": "u-linxin",
    "assigneeName": "林鑫",
    "title": "活动页资源补齐",
    "startDate": "2026/05/18",
    "endDate": "2026/05/22",
    "status": "confirmed"
  },
  "scheduleItem": {
    "id": "si-1001",
    "itemId": "si-1001",
    "taskUid": "task-1001",
    "ownerUserId": "u-linxin",
    "owner": "美术设计部: 林鑫",
    "startDate": "2026/05/18",
    "endDate": "2026/05/22"
  },
  "task": {
    "id": "task-1001",
    "taskUid": "task-1001",
    "owner": "美术设计部: 林鑫",
    "startDate": "2026/05/18",
    "endDate": "2026/05/22"
  },
  "sync": {
    "interaction": "move",
    "scheduleUpdated": true,
    "taskUpdated": true,
    "resourceWorkItemUpdated": true
  }
}
```

失败响应必须明确失败，不要返回空成功壳：

```json
{
  "ok": false,
  "code": "ASSIGNMENT_CONFIRM_FAILED",
  "message": "Cannot assign outside authorized project scope"
}
```

前端只有收到 API 成功，或明确进入离线 fallback 模式时，才会本地写入完成态。

## POST /workspace/assignments/force-confirm

用于超载或冲突强制分配。必须校验 `canForceAssign` / `canForceAssignOverload`，并要求 `forceReason`。

请求体在 confirm 基础上增加：

```json
{
  "forceReason": "客户节点不可移动，已线下确认资源"
}
```

响应结构与 confirm 一致，另加：

```json
{
  "completion": {
    "ok": true,
    "forced": true,
    "reason": "客户节点不可移动，已线下确认资源"
  }
}
```

## PATCH /workspace/resources/work-items/:id/schedule

该路径先预留，用于后续从人力模块直接更新资源工作项时间，并要求后端同步排期和流程。建议请求体：

```json
{
  "projectId": "project-1001",
  "scheduleItemId": "si-1001",
  "taskUid": "task-1001",
  "assigneeId": "u-linxin",
  "assigneeName": "林鑫",
  "startDate": "2026/05/20",
  "endDate": "2026/05/25",
  "interaction": "resize-end",
  "source": "resource-drag"
}
```

建议响应与 confirm 的 `assignment`、`scheduleItem`、`task`、`sync` 保持同形。

## 交互同步字段

拖拽、拉伸或滚轮缩放后，只要确认写入导致日期或负责人变化，前端同步请求都要携带 `interaction`。取值限定为 `move`、`resize-start`、`resize-end`：`move` 表示整体移动工作项，`resize-start` 表示调整开始日期，`resize-end` 表示调整结束日期。滚轮缩放如果只改变视图比例，不触发写入；如果缩放后的拖拽或拉伸落点改变了日期，仍按实际变更动作传这三个值之一。

带 `interaction` 的写入必须同步三类对象：`resource work item`、`schedule item`、`flow/task`。后端需要用 `workItemId`、`scheduleItemId/itemId`、`taskUid/taskId`、`projectId` 定位同一业务项，并在响应 `sync` 中明确 `resourceWorkItemUpdated`、`scheduleUpdated`、`taskUpdated`；任一目标未同步成功时，不能静默返回全成功。

同步事件契约：

| interaction | 前端动作 | 后端必须同步 | 日期处理 |
| --- | --- | --- | --- |
| `move` | 整体拖动时间条或换人分配 | `resource work item`、`schedule item`、`flow/task` 的负责人和日期 | 同时更新 `startDate` 和 `endDate`，保持原时长 |
| `resize-start` | 拉伸左侧边界 | `resource work item`、`schedule item`、`flow/task` 的开始日期 | 更新 `startDate`，保留 `endDate` |
| `resize-end` | 拉伸右侧边界 | `resource work item`、`schedule item`、`flow/task` 的结束日期 | 保留 `startDate`，更新 `endDate` |

同步请求建议统一带 `source`、`interaction`、`workItemId`、`scheduleItemId/itemId`、`taskUid/taskId`、`projectId`、`assigneeId`、`assigneeName`、`startDate`、`endDate`。响应的 `sync` 必须回显 `interaction`、`source`、`resourceWorkItemUpdated`、`scheduleUpdated`、`taskUpdated` 和失败原因；只要任一目标写入失败，HTTP 状态或业务 `ok` 都不能表现为全成功。

## 排期/流程同步到人力模块

排期接口和流程接口修改日期时，要同步资源工作项：

| 来源接口 | 触发字段 | 后端同步目标 |
| --- | --- | --- |
| `POST /workspace/projects/:projectId/schedule/items` | `startDate`、`endDate`、`ownerUserId`、`owner`、`linkTask`、`linkFlow` | 创建或更新 resource work item；必要时创建 flow/task 关联 |
| `PUT /workspace/schedule/items/:itemId` | `startDate`、`endDate`、`ownerUserId`、`owner`、`status`、`progress` | 同步 schedule item、flow/task、resource work item |
| `PUT /workspace/tasks/:taskId` | `startDate`、`endDate`、`owner`、`scheduleStatus`、`progress` | 同步 flow/task、关联 schedule item、resource work item |

关联字段建议稳定返回：`workItemId`、`scheduleItemId` / `itemId`、`taskUid` / `taskId`、`projectId`、`linkTask`、`linkFlow`。只要其中任意一组能定位同一工作项，拖拽、排期调整、流程编辑都要同步三处负责人和日期。

创建排期或流程时，如果请求中包含 `ownerUserId/owner`、`startDate`、`endDate`、`projectId`，后端需要同步创建或更新人力侧 `resource work item`。建议创建类接口响应直接带回：

```json
{
  "scheduleItem": {
    "id": "si-1001",
    "itemId": "si-1001",
    "projectId": "project-1001",
    "taskUid": "task-1001",
    "ownerUserId": "u-linxin",
    "owner": "美术设计部: 林鑫",
    "startDate": "2026/05/18",
    "endDate": "2026/05/22"
  },
  "task": {
    "id": "task-1001",
    "taskUid": "task-1001",
    "projectId": "project-1001",
    "owner": "美术设计部: 林鑫",
    "startDate": "2026/05/18",
    "endDate": "2026/05/22"
  },
  "resourceWorkItem": {
    "id": "wi-1001",
    "workItemId": "wi-1001",
    "projectId": "project-1001",
    "scheduleItemId": "si-1001",
    "taskUid": "task-1001",
    "assigneeId": "u-linxin",
    "assigneeName": "林鑫",
    "startDate": "2026/05/18",
    "endDate": "2026/05/22"
  },
  "sync": {
    "source": "schedule-create",
    "resourceWorkItemUpdated": true,
    "scheduleUpdated": true,
    "taskUpdated": true
  }
}
```

如果流程先创建、排期后创建，后端要用 `projectId` + `taskUid/taskId` 或 `projectId` + `scheduleItemId/itemId` 合并到同一个 `resource work item`，不要生成重复人力工作项。无法定位关联对象时返回明确错误，例如 `WORK_ITEM_NOT_FOUND` 或 `RESOURCE_SYNC_LINK_MISSING`，不要只返回创建成功但遗漏人力同步。

## 错误码约定

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `INVALID_DATE_RANGE` | `endDate` 早于 `startDate` |
| 401 | `UNAUTHORIZED` | token 缺失或过期 |
| 403 | `RESOURCE_SCOPE_DENIED` | 请求超出 scope |
| 403 | `FORCE_ASSIGN_DENIED` | 无强制分配权限 |
| 404 | `WORK_ITEM_NOT_FOUND` | 找不到人力、排期或流程工作项 |
| 409 | `RESOURCE_SYNC_LINK_MISSING` | 创建或同步时缺少能关联人力、排期、流程的稳定 ID |
| 409 | `ASSIGNMENT_CONFLICT` | 预览发现冲突且未走 force-confirm |
| 503 | `RESOURCE_API_UNAVAILABLE` | 人力模块依赖不可用 |

## 联调验收

admin / super_admin 无部门时，`GET /workspace/resources` 返回 `scope.type = "company"`，后台权限返回 `scopeType = "global"`。部门级只能看到 `departmentIds` 内人员与工作项。项目级 / 授权级只能看到 `projectIds` 内工作项，以及这些工作项关联人员。个人级只能看到本人。

排期或流程修改 `startDate` / `endDate` 后，再请求 `/workspace/resources` 和 `/workspace/workload`，同一工作项日期必须一致。人力拖拽确认后，`assignment`、`scheduleItem`、`task` 三处负责人和日期必须一致。
