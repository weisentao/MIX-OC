# 2026-05-17 暂停交接：同步/AI/公告/人力修复

## 当前状态
用户要求先暂停，准备关机。已停止所有仍在运行的 subagent，没有后台小弟继续写文件。

## 已回收/关闭的 subagent
- 排期同步 worker `019e35f0-05f9-79a3-8b86-6d2f003b9e6a`：DONE 后已关闭。
- 公告提交 worker `019e35f0-6fbc-70e3-be67-f0f52dafcf0c`：DONE 后已关闭。
- AI/DeepSeek worker `019e35dc-9ff5-7d63-918e-694fa7fa8f1c`：DONE 后已关闭。
- 人力交互 worker `019e35dd-60a1-7d61-871a-73af1a2e37a7`：DONE 后已关闭，但父线程还需要用 runtime node 复验。
- 搜索通知 worker `019e35de-0514-77d2-b3a0-8bf901df7244`：DONE 后已关闭。
- 时间轴 UI worker `019e35f2-8071-7330-b3d0-d9ea91da2954`：DONE 后已关闭。
- 乱码/构建 worker `019e35f0-d9a6-77a0-ac4d-9b29f70570d6`：用户要求暂停时仍 running，已 shutdown。
- 浏览器验收 worker `019e35f2-eec9-74b0-8112-ee8485803be4`：用户要求暂停时仍 running，已 shutdown。

## 已报告完成的核心改动
- AI 双 Key 与密钥安全：backend `src/modules/ai/ai.service.js`，frontend `src/services/adminApi.js`、`aiApi.js`、`resourceApi.js`，相关测试通过。注意：文档不能记录明文 key。
- 公告管理：`frontend-source/src/views/AdminConsoleView.vue`、`ConsoleSection.vue`、`backend-source/src/modules/admin/admin.service.js`，新增不覆盖、创建后关闭清空、防重复提交，公告契约测试通过。
- 搜索隔离与通知：`ProjectPanel.vue`、`overrides.css`、相关通知前后端测试通过。
- 人力分配交互：`ResourceView.vue`、`taskActions.js` 及相关测试文件已改；父线程还未用 runtime node 复验。
- 排期同步：`scheduleActions.js`、`schedule.service.js`、相关测试文件已改。修复本地 `si-local-*` 拖拽误 PUT、本地 project id 抢占、后端 sync/syncResult 稳定字段。worker 报告前后端定向测试 52 pass + 49 pass。
- 人力时间轴：`ResourceTimeline.vue`、`resource.css`、`resourceTimelineContract.test.js`，恢复左列 sticky、滚轮缩放、底部部门标题 sticky，构建通过。

## 未完成/下次继续第一优先级
1. 用 runtime node 做父线程复验：
   - `C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe`
   - 前端定向测试：AI/admin/resource/schedule/search/timeline。
   - 后端定向测试：admin-contract、announcement-contract、schedule-contract、workspace-task-payload-contract、notification。
2. 重新派一个短任务扫描乱码，因为乱码 worker 已 shutdown，未交付结果。
3. 重新派一个浏览器验收任务，启动本地前后端后验证：不再出现“已本地保存，后端同步失败”、AI 可用、公告不覆盖、搜索不弹主区域大框、小铃铛有通知、人力应用/确认分配有效、完成任务可拖回待完成、时间轴 sticky/滚轮缩放正常。
4. 写最终溯源文档，不能只停留在暂停交接。

## 本轮环境注意
- 工作目录：`C:\Users\pveadmin\Desktop\mutou\第一版源代码`
- git 根目录可能是 `C:\Users\pveadmin\Desktop\mutou`，但本轮 `git -C` 曾提示不是仓库，需要下次重新确认。
- PATH `node.exe` 可能 Access denied；优先用 runtime node 绝对路径。
