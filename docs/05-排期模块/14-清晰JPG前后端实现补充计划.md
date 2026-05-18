# 清晰 JPG 前后端实现补充计划

> 本文只记录清晰 JPG 新增要求对实现方案的补充。完整架构仍参考 `04-前端实现方案.md`、`05-后端接口与服务方案.md`、`06-数据库表结构与字段设计.md`、`08-旧排期替换与数据迁移.md`、`10-实施计划.md`。

## 1. 实现目标补充

清晰 JPG 让排期实现目标更明确：新排期不是普通任务列表，也不是仅展示任务的甘特图，而是“项目可视化排期工作台”。

必须新增或强化：

1. 时间线模式作为默认主视图。
2. 看板模式、节点模式作为同一份数据的不同视图。
3. 排期展示和任务展示双层形态。
4. 创建排期时可同步加入任务列表。
5. 排期日期可与任务日期联动。
6. 中国周末和法定节假日日期头标绿。
7. 浮动聊天框绑定到排期项。
8. 快照版本、模板、HTML/PDF 导出成为一组完整能力。

## 2. 前端文件补充规划

### 2.1 入口文件

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `G:\mutou\xm\xjg\src\views\ScheduleView.vue` | 重写主结构 | 作为新排期工作台入口，管理视图模式、筛选、弹窗、聊天框。 |
| `G:\mutou\xm\xjg\src\stores\workspace\actions\scheduleActions.js` | 扩展 | 增加加载排期计划、创建排期项、拖拽保存、评论、模板、快照、导出。 |
| `G:\mutou\xm\xjg\src\services\scheduleApi.js` | 新建或扩展 | 封装 schedule API，避免组件直接调用 axios。 |

### 2.2 新组件目录

建议新增：

```text
G:\mutou\xm\xjg\src\components\schedule\timeline\
  ScheduleHeroHeader.vue
  ScheduleProjectHeader.vue
  ScheduleTimelineToolbar.vue
  ScheduleTimelineWorkspace.vue
  ScheduleFixedTable.vue
  ScheduleTimelineHeader.vue
  ScheduleTimelineGrid.vue
  ScheduleTimelineBars.vue
  ScheduleFloatingChat.vue
  ScheduleCreateDialog.vue
  ScheduleTemplateDialog.vue
  ScheduleSnapshotDialog.vue
  ScheduleExportDialog.vue
  ScheduleViewTabs.vue
  ScheduleZoomControl.vue
  ScheduleMemberAvatars.vue
```

### 2.3 新工具函数

建议新增：

```text
G:\mutou\xm\xjg\src\utils\schedule\
  scheduleDate.js
  scheduleHoliday.js
  scheduleLayout.js
  scheduleExport.js
  scheduleColors.js
```

| 文件 | 职责 |
| --- | --- |
| `scheduleDate.js` | 日期解析、日期范围、周范围、daysBetween。 |
| `scheduleHoliday.js` | 判断周末和中国法定节假日。 |
| `scheduleLayout.js` | dayWidth、rowHeight、bar left/width/top 计算。 |
| `scheduleExport.js` | HTML/PDF 导出前的数据整理。 |
| `scheduleColors.js` | 部门颜色映射。 |

## 3. 前端状态模型补充

`ScheduleView.vue` 或 Pinia store 中建议补齐以下状态：

```js
const scheduleState = {
  mode: 'timeline',              // timeline | kanban | node
  rowFilter: 'all',              // all | schedule | task
  departmentFilter: 'all',       // all | project | aigc | art | threeD | motion | post
  dayWidth: 28,
  rowHeight: 30,
  visibleStartDate: '2026-05-10',
  visibleEndDate: '2026-06-21',
  selectedItemId: null,
  activeChatItemId: null,
  chatPosition: { x: 920, y: 280 },
  chatSize: { width: 390, height: 560 },
  createDialogOpen: false,
  exportDialogOpen: false,
  snapshotDialogOpen: false,
  templateDialogOpen: false
}
```

状态规则：

1. `mode` 切换只改变展示组件，不改变 `schedule_items`。
2. `rowFilter` 控制粗排期条、细任务线、全部行的显示。
3. `departmentFilter` 控制部门筛选，不改变日期范围。
4. `dayWidth` 由 `+ / -` 改变，不能改变真实日期。
5. `activeChatItemId` 指向当前聊天框绑定的排期项。

## 4. 数据结构补充

### 4.1 schedule_items 字段补充

清晰 JPG 显示同一行中可能有粗条和细线，因此排期项需要能表示展示类型。

建议字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint | 排期项 ID。 |
| `schedule_id` | bigint | 所属排期计划。 |
| `project_id` | bigint | 所属项目。 |
| `source_task_id` | bigint nullable | 如果由任务联动创建，记录任务 ID。 |
| `title` | varchar(255) | 排期名称，如 `分镜框架/风格稿`。 |
| `department_code` | varchar(50) | 部门编码。 |
| `display_type` | enum | `schedule` 或 `task`。 |
| `bar_style` | enum | `thick` 或 `thin`。 |
| `start_date` | date | 开始日期。 |
| `end_date` | date | 结束日期。 |
| `sync_with_task` | tinyint | 是否与任务日期联动。 |
| `status` | varchar(50) | 进行中、已完成、风险、延期等。 |
| `sort_order` | int | 左表排序。 |
| `is_hidden` | tinyint | 导出或视图中是否隐藏。 |
| `created_by` | bigint | 创建人。 |
| `updated_by` | bigint | 更新人。 |

### 4.2 schedule_view_settings

用于保存用户视图偏好，保证下次打开仍然是上次的时间轴范围、缩放和筛选。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint | 主键。 |
| `user_id` | bigint | 用户 ID。 |
| `project_id` | bigint | 项目 ID。 |
| `schedule_id` | bigint | 排期 ID。 |
| `mode` | varchar(20) | timeline、kanban、node。 |
| `row_filter` | varchar(20) | all、schedule、task。 |
| `department_filter` | varchar(50) | 部门筛选。 |
| `day_width` | int | 当前缩放后的日列宽。 |
| `visible_start_date` | date | 可视区域起始日期。 |
| `visible_end_date` | date | 可视区域结束日期。 |

### 4.3 schedule_holidays

用于标记中国周末和法定节假日。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `date` | date | 日期。 |
| `type` | varchar(20) | weekend、holiday、workday。 |
| `name` | varchar(100) | 节假日名称。 |
| `is_green` | tinyint | 是否在日期头标绿。 |

周末可前端实时计算，法定节假日建议后端提供表或配置，避免每年硬编码在组件里。

### 4.4 schedule_comments

当前后端已有任务评论能力时，可以扩展评论目标类型；如果现有结构不好扩展，则新增表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint | 评论 ID。 |
| `target_type` | varchar(30) | `schedule_item`。 |
| `target_id` | bigint | 排期项 ID。 |
| `department_code` | varchar(50) | 评论所属部门。 |
| `content` | text | 评论内容。 |
| `created_by` | bigint | 评论人。 |
| `created_at` | datetime | 评论时间。 |
| `visibility` | varchar(20) | normal、private、export_hidden。 |

## 5. 后端接口补充

### 5.1 排期计划

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/projects/:projectId/schedules/active` | 获取项目当前排期计划、排期项、视图设置。 |
| `POST` | `/api/workspaces/:workspaceId/projects/:projectId/schedules` | 创建排期计划。 |
| `PATCH` | `/api/workspaces/:workspaceId/schedules/:scheduleId` | 更新排期计划名称、日期范围、状态。 |

### 5.2 排期项

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/workspaces/:workspaceId/schedules/:scheduleId/items` | 创建排期项，对应创建弹窗。 |
| `PATCH` | `/api/workspaces/:workspaceId/schedules/:scheduleId/items/:itemId` | 修改标题、部门、日期、状态、联动设置。 |
| `PATCH` | `/api/workspaces/:workspaceId/schedules/:scheduleId/items/:itemId/dates` | 拖动条形后只更新日期。 |
| `DELETE` | `/api/workspaces/:workspaceId/schedules/:scheduleId/items/:itemId` | 删除排期项。 |

创建排期项请求示例：

```json
{
  "title": "分镜框架/风格稿",
  "departmentCode": "art",
  "displayType": "schedule",
  "startDate": "2026-05-16",
  "endDate": "2026-05-19",
  "addToTaskList": true,
  "syncWithTask": true
}
```

### 5.3 评论聊天

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/schedule-items/:itemId/comments` | 获取排期项评论。 |
| `POST` | `/api/workspaces/:workspaceId/schedule-items/:itemId/comments` | 新增评论。 |
| `PATCH` | `/api/workspaces/:workspaceId/schedule-comments/:commentId` | 修改评论可见性或内容。 |
| `DELETE` | `/api/workspaces/:workspaceId/schedule-comments/:commentId` | 删除评论。 |

### 5.4 模板和快照

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/schedule-templates` | 获取模板库。 |
| `POST` | `/api/workspaces/:workspaceId/schedules/:scheduleId/templates` | 保存当前排期为模板。 |
| `POST` | `/api/workspaces/:workspaceId/schedules/:scheduleId/import-template` | 导入模板。 |
| `GET` | `/api/workspaces/:workspaceId/schedules/:scheduleId/snapshots` | 获取快照历史。 |
| `POST` | `/api/workspaces/:workspaceId/schedules/:scheduleId/snapshots` | 保存快照。 |
| `GET` | `/api/workspaces/:workspaceId/schedule-snapshots/:snapshotId/diff` | 对比快照和当前计划。 |

### 5.5 导出

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/workspaces/:workspaceId/schedules/:scheduleId/export/html` | 生成可交互 HTML。 |
| `POST` | `/api/workspaces/:workspaceId/schedules/:scheduleId/export/pdf` | 生成静态 PDF。 |

导出请求示例：

```json
{
  "startDate": "2026-05-10",
  "endDate": "2026-06-21",
  "mode": "timeline",
  "includeComments": false,
  "hidePrivateComments": true,
  "hideItems": [],
  "includeTasks": true,
  "includeSchedules": true
}
```

## 6. 和任务系统的匹配

清晰 JPG 中有“同时加入到任务列表”和“与任务联动”，这要求排期不是孤立模块。

### 6.1 创建时同步

| 选择 | 行为 |
| --- | --- |
| 不勾选加入任务 | 只创建 `schedule_items`，不创建任务。 |
| 勾选加入任务 | 创建 `schedule_items`，同时创建或关联 `tasks`。 |
| 勾选与任务联动 | 后续修改排期日期时同步修改任务起止日期。 |
| 取消与任务联动 | 排期和任务日期各自独立。 |

### 6.2 拖拽时同步

拖动排期条后：

1. 前端先更新本地条形位置，显示保存中状态。
2. 调用 `PATCH /items/:itemId/dates`。
3. 后端检查权限、日期合法性、任务联动设置。
4. 如果 `sync_with_task = 1`，同步更新关联任务日期。
5. 返回最新 item 和 task 信息。
6. 前端用返回数据覆盖本地乐观更新。

### 6.3 任务和排期的显示差异

| 类型 | 左表显示 | 右侧显示 |
| --- | --- | --- |
| 排期 | 默认显示，粗条。 | 粗色块。 |
| 任务 | `看任务` 或 `看所有` 时显示。 | 细线。 |
| 同步任务 | 可同时有排期粗条和任务细线。 | 保持日期一致或根据联动关系分开。 |

## 7. 中国周末和法定节假日实现

### 7.1 前端计算

周末可直接通过日期计算：

```js
function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}
```

### 7.2 后端/配置法定节假日

法定节假日建议由后端返回：

```json
{
  "date": "2026-05-01",
  "type": "holiday",
  "name": "劳动节",
  "isGreen": true
}
```

前端渲染规则：

```js
const isGreenDay = isWeekend(date) || holidayMap[dateKey]?.isGreen
```

验收时需要确认绿色格子出现在日期头，并和截图一致。

## 8. 导出补充实现

### 8.1 HTML 导出

HTML 导出需要包含：

1. 排期数据快照。
2. 时间轴渲染脚本。
3. CSS 变量和部门颜色。
4. 视图切换逻辑。
5. 横向滚动和 `+ / -` 缩放逻辑。
6. 评论显示策略。

HTML 导出不能依赖登录态接口才能打开。建议把导出所需数据内嵌为 JSON。

### 8.2 PDF 导出

PDF 导出需要：

1. 服务端或前端生成一个专用静态页面。
2. 按导出日期范围展开所有列。
3. 处理宽度超出 A4 横向的分页。
4. 每页重复左侧表头、周头和日期头。
5. 隐藏交互按钮。

如果先做最小可用版本，可以先导出一张横向长 PDF；正式版本再做分页优化。

## 9. 快照和模板补充实现

### 9.1 快照

快照保存内容：

1. `schedule_plan` 基本信息。
2. 所有 `schedule_items`。
3. 排期项和任务关联关系。
4. 评论是否纳入快照按导出/快照设置决定。
5. 创建人和创建时间。

快照对比需要显示：

| 变化 | 展示 |
| --- | --- |
| 新增排期 | 标记新增。 |
| 删除排期 | 标记删除。 |
| 日期改变 | 显示原日期和新日期。 |
| 部门改变 | 显示原部门和新部门。 |
| 标题改变 | 显示原标题和新标题。 |

### 9.2 模板

模板保存内容：

1. 排期项标题。
2. 部门。
3. 相对日期偏移，不建议保存绝对日期。
4. 默认持续天数。
5. 排序。
6. 是否同步任务的默认设置。

导入模板时：

1. 用户选择项目开始日期。
2. 系统按相对日期偏移生成新项目排期。
3. 用户确认后写入 `schedule_items`。

## 10. 测试补充

### 10.1 前端单元测试

建议新增或扩展：

| 测试 | 重点 |
| --- | --- |
| `scheduleDate.test.js` | 周范围、日期数组、daysBetween。 |
| `scheduleHoliday.test.js` | 周末和法定节假日标绿。 |
| `scheduleLayout.test.js` | 条形 left/width/top 计算。 |
| `scheduleViewState.test.js` | mode、filter、zoom 不改变原始数据。 |
| `scheduleExport.test.js` | HTML/PDF 导出参数整理。 |

### 10.2 视觉验收

必须至少截图：

1. 主时间线首屏。
2. 创建排期弹窗。
3. 工具栏和视图切换。
4. 时间轴网格和任务条。
5. 浮动聊天框。
6. HTML 预览。
7. PDF 预览。

截图对照资产在 `G:\mutou\文档\排期\assets\jpg-crops`。

### 10.3 后端接口测试

必须覆盖：

1. 创建排期项并加入任务列表。
2. 创建排期项但不加入任务列表。
3. 拖拽修改日期并同步任务日期。
4. 拖拽修改日期但不联动任务。
5. 评论绑定到 schedule item。
6. 保存快照。
7. 导入模板。
8. 导出 HTML。
9. 导出 PDF。

## 11. 开发顺序补充

建议在原 `10-实施计划.md` 的基础上，把前端 UI 复刻顺序调整为：

1. 先实现静态首屏：Header、项目行、工具栏、左表、时间轴、任务条。
2. 再实现缩放和横向滚动。
3. 再实现创建排期弹窗。
4. 再实现任务条拖拽和日期保存。
5. 再实现浮动聊天框。
6. 再实现视图切换的数据共用。
7. 再实现模板和快照。
8. 最后实现 HTML/PDF 导出。

不要先做复杂后端再做 UI。清晰 JPG 的核心风险是 UI 复刻精度，第一阶段应该先把静态 UI 和数据结构跑通。

