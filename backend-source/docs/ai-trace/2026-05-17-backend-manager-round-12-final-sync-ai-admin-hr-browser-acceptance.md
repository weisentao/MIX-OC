# 2026-05-17 后端经理收口：同步、AI、公告、人力、菜单与浏览器验收

## 背景
用户重启电脑后要求继续昨晚暂停任务，并重新拉起 subagent 小队完成上线前验收。目标是修复和验证：前后端同步失败、DeepSeek/AI 不可用、后台公告、搜索隔离、小铃铛通知、人力分配、完成任务回拖、时间轴 sticky/缩放、右键菜单显示不全以及乱码问题。

本轮不记录任何明文 DeepSeek key。

## Subagent 调度
- 总验收 worker：复跑前后端关键测试，发现前端剩余 2 个 UI 契约红点，后端关键批次通过。
- 乱码扫描 worker：扫描生产代码和测试，未发现页面相关明显 mojibake；Vite build 通过。
- 浏览器验收 worker：确认本地后端 `13001`、前端 `15173` 可访问，首页未看到同步失败、AI 不可用或乱码；后台全流因未知管理员密码未继续。
- 首页公告链接 worker：补齐 `HomeDashboard.vue` 和 `WorkbenchHeader.vue` 的公告链接打开能力。
- 排期菜单 worker：补齐 `ScheduleToolbar.vue` 菜单纵向视口裁剪。
- TaskCard 菜单 worker：补齐 `TaskCard.vue` 右键菜单视口裁剪与滚动样式。
- ResourceNodeView 菜单 worker：补齐 `ResourceNodeView.vue` 菜单 Teleport、fixed 定位和视口裁剪。

所有已完成/阻塞子代理均已关闭，当前没有继续运行的 subagent。

## 主要修复内容
- AI / DeepSeek：
  - 后端接受并保存首页和人力两个 scoped DeepSeek key，响应不回显明文。
  - 前端 admin/AI/resource API 过滤密钥形字段，首页 AI 与人力 advice 走后端。
- 后台公告：
  - 新增公告不再复用当前选中行 id。
  - 创建成功后关闭并清空表单，提交中防重复。
  - 服务端生成公告 id 并碰撞重试。
  - 首页和工作台公告支持内联链接点击。
- 同步与排期：
  - 排期拖拽携带 `source: "schedule-drag"` 和 interaction metadata。
  - 本地 `si-local-*` 拖拽改为创建真实排期项，避免 PUT 本地 id。
  - 后端 schedule mutation response 补齐稳定 `sync/syncResult` 字段。
  - 任务更新继续同步 linked schedule items。
- 人力：
  - AI 推荐应用走确认分配链路。
  - 分配确认携带 active project id，失败详情能展示。
  - 人员关心按钮接入 workspace contacts。
  - 时间轴左侧部门/人员列保持 sticky，鼠标滚轮缩放，底部部门标题可见。
- 搜索与通知：
  - 左侧项目搜索只筛选项目树，不再在主区弹出搜索结果大框。
  - 首页搜索、workspace 搜索、人力搜索互相隔离。
  - 小铃铛通知接口和前端展示已覆盖评论/@/分配通知契约。
- 菜单与 UI：
  - ScheduleToolbar、TaskCard、ResourceNodeView 右键/更多菜单限制在视口内，必要时内部滚动。
  - 相关菜单使用 fixed/Teleport，避免被局部容器裁剪。
- 乱码：
  - 扫描 `frontend-source/src`、`backend-source/src`、`backend-source/test`，未发现页面相关明显 mojibake。

## 验证证据
运行时 Node：`C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe`

### 前端关键测试
命令：
```powershell
& "C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe" --test src\services\__tests__\adminApi.test.js src\services\__tests__\aiApi.test.js src\services\__tests__\resourceApi.test.js src\features\management-console\__tests__\adminConsoleNoticeSubmit.test.js src\features\resource\__tests__\resourceTimelineContract.test.js src\features\resource\__tests__\resourceViewInteractionSource.test.js src\stores\workspace\actions\__tests__\scheduleActions.test.js src\components\layout\__tests__\reviewUiSource.test.js
```
结果：`133 pass / 0 fail`。

### 后端关键测试
命令：
```powershell
& "C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe" --test test\admin-contract.test.js test\announcement-contract.test.js test\schedule-contract.test.js test\workspace-task-payload-contract.test.js test\notification-contract.test.js test\ai-key-priority.test.js test\ai-trace-contract.test.js test\hr-contract.test.js test\smoke-ai-deepseek-script.test.js
```
结果：`137 pass / 0 fail`。

### 前端构建
命令：
```powershell
& "C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe" node_modules\vite\bin\vite.js build
```
结果：构建成功，`✓ built in 43.31s`。仅有既有 Rollup 注释、dynamic import 与 chunk size 警告。

### 本地服务与浏览器
- 后端健康：`http://127.0.0.1:13001/api/health` 返回 `200`。
- 前端入口：`http://127.0.0.1:15173/` 返回 `200`。
- Browser 打开：`http://127.0.0.1:15173/#/`，标题 `项目任务清单`。
- 页面检查：未看到 `后端同步失败`、`已本地保存`、`接口暂不可用`、`服务暂不可用`、`AI不可用`、`智能建议接口暂不可用`、`AI key invalid` 或明显 mojibake。

## 尚需人工/上线前确认
- 浏览器后台管理全流需要有效管理员账号密码；本轮 `admin/admin` 调 `/api/login` 返回 `401`，未继续真实公告创建点击流。
- 需要在生产部署后重启后端和前端，使新 AI key / 公告 / 同步代码生效。
- 生产 MySQL schema/migration 与现有公司名单/注册归类数据需上线前备份并确认未被清空。
- 本机 git 根目录识别异常：`git -C C:\Users\pveadmin\Desktop\mutou status` 返回非 git 仓库；交付以文件系统和测试结果为准。
