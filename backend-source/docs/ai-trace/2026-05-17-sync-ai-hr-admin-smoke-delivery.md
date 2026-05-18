# 2026-05-17 sync-ai-hr-admin-smoke 交付汇总

## 目标

本文只汇总 `2026-05-17` 已留档的同步、AI、后台管理、人力资源与本地 smoke 验收信息，作为本轮交付说明。本文不新增业务代码，不改接口行为，不记录任何真实 API key；DeepSeek 相关密钥状态统一记为“已通过环境变量/后台配置注入”。

## 分工

本轮由文档线程做只读归档，业务修复内容来自既有留档：`2026-05-17-backend-manager-round-11-local-launch-acceptance.md`、`2026-05-17-backend-manager-round-12-final-sync-ai-admin-hr-browser-acceptance.md`、`2026-05-17-worker-a-admin-announcements-e2e-fix.md`、`2026-05-17-worker-b-ai-deepseek-config-alias-fix.md` 与 `2026-05-17-pause-handoff-sync-ai-admin-hr.md`。本文只整理这些已知结果，不补做新的代码修复。

## 文件

本次新增文件为 `backend-source/docs/ai-trace/2026-05-17-sync-ai-hr-admin-smoke-delivery.md`。本文只读参考的脚本与契约包括 `backend-source/scripts/local-stack-acceptance.ps1`、`backend-source/scripts/verify-production-ready.mjs`、`backend-source/test/admin-fixed-password-seed.test.js`、`backend-source/test/production-smoke-contract.test.js` 与前述 `ai-trace` 留档文件。

## 接口

本轮已确认的 AI 配置接口仍是 `PATCH /admin/ai/config`，并接受 `homeApiKey`、`hrApiKey` 两个前端别名字段，同时落到后端 canonical scoped 字段。`GET /admin/ai/config`、`GET /workspace/ai/settings`、`POST /workspace/ai/chat`、`POST /workspace/ai/home-assistant` 与 `POST /workspace/resources/ai/assignment-advice` 都只暴露 `configured`、`masked`、`keyStatus` 一类状态字段，不回显明文密钥。Home AI 与 HR AI 的 key 状态在 `2026-05-17` 留档中的统一口径是：已通过环境变量/后台配置注入。

本轮同步与验收直接涉及的运行态接口包括 `POST /api/login`、`GET /api/health`、`GET /health`、`GET /workspace/bootstrap`、项目任务/排期/画板相关工作区接口，以及后台 AI、后台公告、管理台用户与总览接口。留档显示本地代理验收统一通过前端 `15173/api` 转发到后端 `13001/api` 完成。

## 已知修复

同步链路的已知修复集中在“前端本地保存成功但后端同步失败”这一类问题。`2026-05-17` 留档说明本地 `si-local-*` 拖拽不再误把本地 id 当后端 id 去做更新，而是创建真实排期项；任务、排期、画板与工作区动作在缺失后端项目 id 或任务 id 时会阻断错误同步；后端 schedule mutation 返回稳定的 `sync` / `syncResult` 字段；已完成或已归档任务也可以重新拖回进行中或待办列。

AI 链路的已知修复集中在 DeepSeek 双 key、别名兼容与脱敏返回。后台管理页保存首页与人力两套 key 时，后端现在接受 `homeApiKey` / `hrApiKey` 别名，落库存储 scoped 字段，并同步到运行态环境优先级链路。首页 AI、`/workspace/ai/home-assistant` 与人力 `assignment-advice` 各自走对应 key 优先级，接口响应、日志与配置读取都不回显明文。

本轮后续补丁补充了 AI jsonStore 损坏 JSON 容错。配置存储读到空文件、截断文件或非 JSON 文本时，不再让解析异常击穿 AI 配置读取链路，而是按未配置或默认空配置处理；后续保存会重新写入合法 JSON。该补丁只记录状态、脱敏标记和可恢复路径，不记录任何真实 API key。

后台管理的已知修复主要集中在公告创建流与 AI 配置流。公告新建不再复用当前选中行 id，创建成功后会关闭并清空表单，提交期间带有防重复保护，服务端生成 canonical `notice_uid` 并保留首页/工作台公告链接展示能力。管理后台 AI 配置页保存 scoped key 后，前端与后端之间的字段名已经对齐，不再因为别名不兼容导致“已保存但运行态无效”。

本轮后续补丁补充了 `admin/notice` 单数路径的兼容重定向。历史入口或浏览器收藏访问 `/admin/notice` 时会导向当前后台公告列表入口，避免单复数路径不一致造成空白页或进入错误模块；接口契约仍以 `/admin/notices` 的 GET、POST、PATCH、DELETE 为准。

人力资源链路的已知修复集中在分配确认、关心关系、时间轴与 AI 建议应用。AI 推荐结果已接回确认分配链路，分配时会带当前 active project id，失败详情可以透出到前端；关心关系不再靠隐式联系人存在判断，而是显式使用 `relationType=care`；时间轴左侧部门与人员列恢复 sticky，滚轮缩放与底部部门标题显示恢复正常。

本轮后续补丁补充了 HR schedule patch 的 person id 兼容。排期补丁允许路由参数使用人员 id，同时从 payload 中的稳定工作项 id、任务 id 或链接 id 找回真实排期目标，避免把推荐人员 id 误当 work item id。`ResourcePersonPanel` 与 `ResourceTimeline` 同步收敛 stable keys，列表、时间轴区块和默认可关心人员都使用稳定人员标识，避免刷新、过滤或默认数据回填时出现重复 key、错位选中或关心按钮不可用。

## 验证

`2026-05-17` 留档里的前端关键测试命令如下，使用的是项目 runtime Node，而不是系统 PATH 里的 `node.exe`：

```powershell
& "C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe" --test src\services\__tests__\adminApi.test.js src\services\__tests__\aiApi.test.js src\services\__tests__\resourceApi.test.js src\features\management-console\__tests__\adminConsoleNoticeSubmit.test.js src\features\resource\__tests__\resourceTimelineContract.test.js src\features\resource\__tests__\resourceViewInteractionSource.test.js src\stores\workspace\actions\__tests__\scheduleActions.test.js src\components\layout\__tests__\reviewUiSource.test.js
```

留档结果为 `133 pass / 0 fail`。

后端关键测试命令如下：

```powershell
& "C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe" --test test\admin-contract.test.js test\announcement-contract.test.js test\schedule-contract.test.js test\workspace-task-payload-contract.test.js test\notification-contract.test.js test\ai-key-priority.test.js test\ai-trace-contract.test.js test\hr-contract.test.js test\smoke-ai-deepseek-script.test.js
```

留档结果为 `137 pass / 0 fail`。

前端构建命令如下：

```powershell
& "C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe" node_modules\vite\bin\vite.js build
```

留档结果为构建成功，记录值为 `✓ built in 43.31s`。

本地整套服务验收与上线门禁的既有命令口径如下：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-stack-acceptance.ps1 -Action check
node scripts\verify-production-ready.mjs
```

既有留档结果显示本地整套服务验收通过，最终门禁输出为 `PRODUCTION_READY_CHECK_PASS`。同一批留档还记录了 `schedule smoke`、`board smoke`、`frontend contract smoke` 与 `smoke-ai-deepseek` 通过；DeepSeek smoke 覆盖 `POST /workspace/ai/chat`、`POST /workspace/ai/home-assistant`、`POST /workspace/resources/ai/assignment-advice` 以及后台 AI 端点。

浏览器与健康检查留档口径显示 `http://127.0.0.1:13001/api/health` 返回 `200`，`http://127.0.0.1:15173/` 返回 `200`，浏览器打开 `http://127.0.0.1:15173/#/` 后未看到“后端同步失败”“已本地保存”“接口暂不可用”“服务暂不可用”“AI key invalid”或明显乱码文本。

本轮后续补丁的最终定向测试结果已经补充归档：后端定向测试 `33 pass / 0 fail`，前端定向测试 `11 pass / 0 fail`，Vite 构建结果记为 `BUILD_OK`。该轮定向覆盖 AI jsonStore 损坏 JSON 容错、HR schedule patch person id 兼容、`admin/notice` 路由重定向，以及 `ResourcePersonPanel` / `ResourceTimeline` stable keys 与默认可关心人员相关回归。

## 服务地址

`2026-05-17` 留档中的本地服务地址分别是 MySQL `127.0.0.1:3306`、后端 `http://127.0.0.1:13001`、后端健康检查 `http://127.0.0.1:13001/api/health`、前端 `http://127.0.0.1:15173/`、前端代理健康检查 `http://127.0.0.1:15173/api/health`。浏览器验收入口使用 `http://127.0.0.1:15173/#/`。

## 账号

脚本与契约层的默认 smoke 口径显示管理员账号为 `admin`。`backend-source/test/admin-fixed-password-seed.test.js` 与 `backend-source/test/production-smoke-contract.test.js` 约束了默认 seed 与 smoke 口径使用 `admin/admin`。但 `2026-05-17-backend-manager-round-12-final-sync-ai-admin-hr-browser-acceptance.md` 同时记录了浏览器侧 `admin/admin` 调 `POST /api/login` 返回 `401`，说明脚本默认口径与当时数据库现态之间存在偏差。

因此，本轮交付对账号的落地口径是：管理员用户名可按 `admin` 记录；密码不要在本文档中继续扩散，实际验收应以当前数据库种子状态或现场可用管理员凭证为准。真实 API key 不记录，DeepSeek Home/HR key 状态统一记为已通过环境变量/后台配置注入。

## 风险与注意事项

本轮文档整理没有重跑任何业务修复，只汇总 `2026-05-17` 已有验收证据，因此所有“通过”结论都应理解为历史留档结果，而不是本次文档线程的新执行结果。若要复验，优先使用 runtime Node 绝对路径；既有留档多次提示系统 PATH 中的 `node.exe` 或 Windows 下 `npm` shim 可能出现 `Access denied`。

如果 MySQL `3306`、后端 `13001` 或前端 `15173` 任一服务未启动，前端仍可能回退到本地状态并再次出现“已本地保存，后端同步失败”类提示。后台管理全流的真实浏览器验收仍依赖有效管理员密码；`2026-05-17` 的最终浏览器记录没有完成后台创建公告的真实点击流，原因正是当次管理员登录返回了 `401`。

`2026-05-17` 留档还保留了两个非阻塞注意点。第一，`scheduleActions.js` 与 `taskActions.js` 仍有各自独立的 project id helper，后续应考虑统一，避免继续漂移。第二，浏览器插件截图在一次验收中发生过超时，但 DOM 检查、健康检查与 service smoke 当时已覆盖关键 API 面。

## 结论

就 `2026-05-17` 已知留档而言，同步、AI、后台管理、人力资源与本地 smoke 的核心问题都已有明确修复和对应验证证据。本文作为交付说明的作用是把分散在多份 `ai-trace` 中的结果收口到一个文件，便于下一轮继续复验或交接。

## 最终验收补记

本轮最终验收确认已修复 `ResourcePersonPanel` 中 `index` 未定义导致的人力页运行时问题。资源相关测试结果为 `39 pass / 0 fail`，Vite 构建结果为通过，记录值为 `✓ built in 44.73s`。

服务已完成重启，后端进程 PID 为 `25172`，前端进程 PID 为 `27096`。本轮记录不包含任何真实 API key。

浏览器干净验收结果如下：人力页面正常显示“人力排期”“全员”“今日空闲”“关心”；页面未出现“后端同步失败”“保存到本地”、`ReferenceError` 或 `Duplicate keys`。访问 `/#/admin/notice` 会重定向到 `/#/admin/notices`，后台公告页显示新增公告、正文、链接与跳转入口，浏览器侧未新增 `error` / `warn`。
