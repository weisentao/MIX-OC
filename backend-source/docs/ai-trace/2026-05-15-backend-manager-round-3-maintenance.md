# 2026-05-15 后端经理第三轮维护溯源

## 本轮用户要求

本轮身份为后端 Trace/Docs 执行 agent，工作目录限定在 `C:\Users\pveadmin\Desktop\mutou\第一版源代码\backend-source`。任务目标不是接管代码最终修复，而是先创建可供后续整合的溯源文档，记录第三轮维护背景、约束、分工、已发现问题、文件数据备份策略、待验证命令和上线边界。用户明确说明即使等不到代码最终 diff，也要先写文档框架，后续由主线程整合。

修改范围被严格限制为 `backend-source/docs/ai-trace/2026-05-15-backend-manager-round-3-maintenance.md`，可选范围为 `backend-source/docs/api/frontend-admin-hr-board-upload-integration.md` 与 `backend-source/docs/admin-manager-api-contract.md`。本次 Trace/Docs 执行只新增本文件，不触碰前端源码，不回滚任何其他 agent 或人工改动。

## 前端冻结边界

`frontend-source` 在本轮继续保持只读。所有与后台管理、人力资源、画板、模板、文件预览、聊天文本和工作区同步相关的判断，只能从接口契约、现有前端调用路径和后端路由行为推导，不能修改前端页面、store、service、样式或构建配置。

如果后续发现接口名称、payload 字段或响应结构与前端预期不一致，应优先在后端兼容层、文档契约或验收记录中补齐说明。确需前端团队处理的问题必须记录为上线边界或后续联调事项，不能在本轮后端维护中直接改动 `frontend-source`。

## 子 agent 分工记录

本轮建议按领域拆分，避免多个执行线程同时覆盖同一文件。后端代码修复 agent 聚焦真实接口缺口和 P0 阻塞项，优先处理会导致前端现有调用 404、500 或数据丢失的问题。契约与文档 agent 负责把接口、权限、存储路径和上线限制同步到 `docs/**`，确保后续验收可以追踪到变更原因。验证 agent 负责在代码 diff 收敛后执行目标测试、全量测试和生产就绪脚本，并记录真实退出码与失败原因。

后台管理与普通管理端 agent 应复核 `/admin/**` 与 `/manager/**` 的权限、成员管理、密码重置、项目成员权限、通知、任务和统计接口是否真实落库。HR agent 应复核排期、资源分配、工作项同步和强制分配权限。画板 agent 应复核默认画板幂等、归档隔离、保存冲突、导出与分享可见性。模板 agent 应复核共享模板后端化和 `/templates/**`、`/workspace/templates/**` 双路径兼容。存储 agent 应复核上传、下载、预览、Range、inline 响应、安全头和读取权限边界。

## 已发现 P0/P1

P0 级问题定义为前端已存在调用或核心业务路径会被后端缺口直接阻断，或者会造成数据写入后不可恢复。本轮沿用前两轮已暴露的高风险方向继续追踪：HR 排期同步接口必须覆盖 `PATCH /workspace/resources/work-items/:workItemId/schedule`，工作区任务的 `scheduleStatus`、`progress`、`attachments` 等前端 payload 字段必须能稳定保存并返回，后台管理和普通管理端已暴露给前端的 facade 不能只返回占位成功却丢失关键业务状态。若第三轮代码 diff 继续涉及这些路径，验证时必须把它们作为第一优先级。

P1 级问题定义为不一定阻断首屏，但会影响上线可用性、安全边界或后续数据迁移。当前需要继续关注共享模板后端化是否完整、画板归档后是否仍可被读取或保存、默认画板是否重复创建、画板保存冲突是否返回明确 `409`、文件预览是否支持图片和视频直接访问、视频 `Range` 是否返回 `206`、存储读取权限是否不会越权放大到未授权项目成员。所有 P1 在上线前至少需要有契约测试或人工 HTTP smoke 覆盖。

## 文件数据备份目录策略

真实上传文件、图片、视频、附件和后续聊天文本备份统一落到 `backend-source/data/storage-v1`。这个目录是本轮以及后续迁移的稳定数据根，不应在业务代码中分散写入临时目录、源码目录或前端目录。接口返回可以暴露 `url`、`downloadUrl`、`apiDownloadUrl`、`previewUrl` 等稳定访问字段，但文件实体仍应通过后端 storage service 管理，避免前端直接依赖磁盘布局。

上线、迁移或排障时应把 `backend-source/data/storage-v1` 作为备份单元处理。备份策略应保留原始文件、元数据记录和可追溯 storage id 的对应关系；如果后续引入对象存储，也应先从该目录做一次离线校验和迁移映射，再切换下载和预览 URL。任何清理脚本都不能默认删除该目录，除非已经确认备份完成且用户明确授权。

## 待验证命令

代码 diff 收敛后，先执行语法级检查，覆盖本轮实际改动的后端源文件，例如 `node --check src/modules/**/**/*.js` 或按变更文件逐个执行 `node --check <file>`。随后执行目标契约测试，优先覆盖后台管理、普通管理端、HR、模板、画板、存储和工作区任务 payload，例如 `node --test test/admin-contract.test.js test/hr-contract.test.js test/template-contract.test.js test/board-contract.test.js test/storage-service.test.js test/storage-contract.test.js test/workspace-task-payload-contract.test.js test/docs-contract.test.js`。

目标测试通过后再执行全量后端测试 `node --test`。生产就绪验证需要在具备 `npm`、生产等价 MySQL、运行中后端服务、有效管理员 token 和必要环境变量的机器上执行 `npm run verify:production`；如果当前 PowerShell 环境仍无法识别 `npm`，可以记录为环境阻塞，不应把脚本未运行误写成生产验证通过。真实 HTTP smoke 应至少覆盖登录后访问 `/admin/**`、`/manager/**`、`/hr/**`、`/workspace/templates/**`、`/workspace/boards/**`、`/storage/**` 与 `/workspace/storage/**` 的核心读写路径。

## 上线边界

本轮不负责前端接线，因此任何需要改动 `frontend-source` 才能显现的功能，只能作为联调边界记录。后端可以提供兼容字段和 alias 路由，但不能承诺前端界面已经切到新接口。模板共享、项目成员读取附件、聊天文本预览、普通管理端真实落库、后台成员权限细粒度控制等事项，如果代码或测试尚未收敛，应在上线清单中标注为受限能力。

正式上线前必须满足三个条件：后端目标契约测试与全量测试有新鲜输出；生产等价环境的数据库、文件目录和权限配置已经验证；`backend-source/data/storage-v1` 已纳入备份和恢复流程。若任一条件缺失，只能进入内测或灰度联调，不能标记为生产完成。

## 后续整合占位

等待主线程合并最终代码 diff 后，需要补充本轮实际改动文件列表、实际执行命令、测试通过数量、失败数量、环境阻塞原因和遗留风险。如果后续修改了 `docs/api/frontend-admin-hr-board-upload-integration.md` 或 `docs/admin-manager-api-contract.md`，也应在本节补充对应契约变化，避免 Trace 文档与 API 文档脱节。
