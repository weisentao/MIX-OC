# 2026-05-15 Backend Manager Round 4 Frontend Contract Alignment

## Scope

本轮继续按“后端经理”模式推进。`frontend-source` 只读，所有实现、验证和文档落在 `backend-source`。目标是接住前端新增的后台管理、人力、画板、共享模板、AI、文件/聊天文本存储相关契约，避免现有前端调用出现后端 404、500、字段 undefined 或权限误判。

## Subagent Dispatch

本轮并行派发 6 个只读/执行小弟：后台管理与人力契约侦察、画板与共享模板契约侦察、后端路由架构审计、MySQL/存储目录审计、生产验证侦察、安全/RBAC 审计。线程池满后关闭只读小弟，再派发两个 worker：Worker A 负责 HR/RBAC，Worker B 负责 workspace/bootstrap 与 board/template 兼容。经理主线程负责生产脚本、文档、验收与冲突整合。

## Backend Changes

- HR 新增 `POST /workspace/resources/ai/assignment-advice`，由本地资源快照和工作负载生成稳定 `{ candidates, risk, summary, actions, scope }`，不接外部 AI，避免前端刷新建议时报 404。
- HR scope 收紧，manager/authorized 空 scope 不再读全量 active 人员；query 只能在授权范围内收窄，降低部门/项目越权风险。
- 强制分配权限改为支持 `resource.forceAssign`，并兼容既有 `workspace.export`；`forceReason` 仍必填，错误语义稳定为 force assign。
- `/manager` 显式允许 `department_admin`、`department_manager`、`project_manager` 等前端角色别名，避免前端可进页面但后端 403。
- `/workspace/bootstrap` 增补 `users`、`currentUserId`、`templates`、`templateShareInfo`、`carouselNotices`、`boardHistory`，所有集合默认返回空值而非 undefined。
- workspace 任务评论权限放宽到 view/comment 级别，readonly 项目成员可评论，但非成员仍被项目权限拦住。
- board mapper 增补稳定 `id/projectId/projectUid/legacyProjectId`，画板分享支持 `userId/userUid/id/userName/name/username` 多字段解析，并返回 `shareResult` 与规范化 `sharedWith`。
- 生产验证脚本 `scripts/verify-production-ready.mjs` 在当前 PowerShell 缺少 `npm` 时可直接解析 package script 并用 `process.execPath` 运行 node 脚本，仍保留原来的 gate 名称输出。
- `scripts/prepare-production-db.mjs` 移除正常 prepare 中对单个真实用户 `MIX-yanyunxue` 的无条件删除，保持非破坏性口径。
- `.env`、`.env.example`、`.env.production.example`、`src/config/env.js` 的 JWT 默认/示例收敛为 `24h`，满足生产环境不超过 24h 的校验。
- `src/config/env.js` 增加 AI 的 `apiKeyConfigured` 脱敏状态；AI key 仍只从后端 `DEEPSEEK_API_KEY` 读取，不进入前端或响应明文。
- `.gitignore` 增加 `data/runtime/**` 与 `data/ai-v1/**`，并保留 `.gitkeep`；真实上传文件仍统一在 `data/storage-v1`。

## Data And Backup Policy

真实图片、视频、附件、聊天文本和 storage sidecar 继续统一落到 `backend-source/data/storage-v1`。生产备份不再只备 MySQL，必须把 `data/storage-v1` 与 `mysqldump` 作为同一恢复单元。AI 聊天配置/日志类 JSON 使用 `backend-source/data/ai-v1`，运行日志使用 `backend-source/data/runtime`，两者为运行态数据目录，已从源码跟踪中排除，只保留占位文件。

## Verification Evidence

已执行语法检查：`node --check` 覆盖 HR、manager、auth、workspace、board、env、production scripts、AI module 相关文件，退出码 0。

已执行目标契约测试：`node --test test/hr-contract.test.js test/manager-contract.test.js test/auth-rbac.test.js test/permission-matrix.test.js test/workspace-bootstrap-contract.test.js test/workspace-permissions.test.js test/board-contract.test.js test/verify-production-ready-script.test.js test/prepare-production-db-safety.test.js test/docs-contract.test.js test/template-contract.test.js test/frontend-api-contract.test.js`，结果 63 pass、0 fail。

已执行补失败后的全量测试：`node --test`，结果 186 pass、0 fail。测试输出仍有 Node `DEP0169 url.parse()` deprecation warning，属于既有依赖警告，不影响当前断言。

已重启生产后端到 `http://localhost:13001`，`GET /health` 返回 `ok=true`、`env=production`、`ready=true`、`mysql.ready=true`。Redis 未启动时仍只记录 reserved integration warning，服务按阶段一策略继续运行。

已执行生产总闸：`node scripts/verify-production-ready.mjs`，结果 `PRODUCTION_READY_CHECK_PASS`。该脚本依次通过 `db:check:production`、`db:check:schedule`、`smoke:production`、`smoke:auth`、`smoke:auth-flows`、`smoke:workspace`、`smoke:workspace-taxonomy`、`smoke:schedule`、`smoke:schedule-library`、`smoke:boards`、`smoke:frontend-contract`。

## Remaining Boundaries

本轮不修改前端，因此模板前端是否切换到后端 `/workspace/templates` 仍需前端团队联调确认。上传前端正式接线后应优先走 `/workspace/storage/upload` 与 `/workspace/storage/chat-text`，不要把文件写到前端目录。AI 模块已提供后端接口与配置目录，但生产真正启用 DeepSeek 还需要部署侧设置 `DEEPSEEK_API_KEY`；未设置时应展示未配置状态，而不是前端直连供应商。
