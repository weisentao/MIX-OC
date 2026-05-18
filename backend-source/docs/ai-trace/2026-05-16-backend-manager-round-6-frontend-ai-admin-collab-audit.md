# 2026-05-16 后端经理 Round 6：前端 AI 管理后台协作审计

## 目标
本轮记录后端经理对前端 AI、管理后台、协作链路的并行审计派工，边界是只读前端、只改后端允许范围，并把验收、溯源、上线门禁信息留给主 agent 和各 worker 汇总。本文档只记录派工、风险、待验证命令和后续补录位置，不代表任何代码已经上线。

## 前端只读与后端修改约束
`frontend-source` 在本轮是只读输入，所有 explorer 只能读取调用路径、字段契约、失败提示和页面交互，不允许修改前端文件、构建产物或前端依赖。后端 worker 只能在各自派工范围内修改 `backend-source`，不得回滚、覆盖或重排其他 worker 已提交或正在编辑的文件；发现冲突时先记录到本文件或对应 ai-trace 文档，再交由主 agent 合并。

本 worker F 的修改范围限定为 `backend-source/docs/ai-trace` 及必要文档索引。本轮不得修改业务代码、测试代码、前端代码、数据库迁移、环境配置或脚本。

## 六个 explorer 发现
Explorer 1 负责只读扫描前端 AI 入口，关注首页 AI 助手、项目内 AI、历史兼容路径、请求 method、payload 字段和错误 toast。当前发现应归档为“前端存在多个 AI 调用入口，后端需要逐一确认路由挂载、认证要求、错误响应结构和旧路径兼容”，不能仅凭模块文件存在判断生产可用。

Explorer 2 负责只读扫描管理后台入口，关注用户、角色、权限、审计日志、系统设置、数据看板等页面是否调用后端管理路由。当前发现应归档为“管理后台需要核对路由前缀、管理员鉴权、分页/筛选参数、空态响应和 403/404 文案契约”，避免后端返回格式不稳定导致前端进入通用失败分支。

Explorer 3 负责只读扫描协作链路，关注项目成员、评论、消息、通知、共享状态、实时或轮询接口。当前发现应归档为“协作接口需要区分 workspace 级权限、项目级成员权限和资源归属权限”，不能用单一登录态替代细粒度授权。

Explorer 4 负责审计后端路由挂载和模块边界，关注 `src/routes/index.js`、`src/app.js`、模块 routes/controller/service 是否全部接入主 Express 应用。当前发现应归档为“backend-module-present 不等于 root-mounted”，未挂载接口只能记录为模块存在，不能写成生产可用。

Explorer 5 负责审计数据持久化和 MySQL 依赖，关注管理后台、AI 记录、协作数据是否依赖真实 MySQL 表、迁移、索引和外键约束。当前发现应归档为“内存 fallback 或测试 stub 不能替代生产 MySQL 门禁”，任何依赖持久化的上线结论都必须在 MySQL 可连接环境重新验证。

Explorer 6 负责审计运行日志、失败样本和生产门禁，关注 401、403、404、500、ECONNREFUSED、payload validation failure 和历史兼容失败。当前发现应归档为“日志和门禁结果优先级高于静态推断”，如果 `verify-production-ready` 因 MySQL 不可用失败，发布状态必须保持阻塞。

## 六个 worker 任务
Worker A 负责 AI 接口契约修补，范围包括前端只读发现的 AI 旧路径、当前路径、聊天 payload、错误响应和鉴权行为。交付物应包含后端路由或服务补丁、契约测试，以及 ai-trace 中对 `frontend-detected`、`backend-module-present`、`root-mounted` 的状态说明。

Worker B 负责管理后台接口契约修补，范围包括管理员鉴权、用户/角色/权限、审计日志、列表分页、筛选参数和空态响应。交付物应避免放宽安全边界，任何匿名访问或越权兼容都必须标为不可接受方案。

Worker C 负责协作链路契约修补，范围包括成员、评论、通知、共享状态和项目权限。交付物需要说明 workspace 权限、project 权限和资源归属权限的判定顺序，并补充失败响应契约。

Worker D 负责后端路由挂载与兼容别名核对，范围包括主路由入口、模块 routes 导出、旧前端路径兼容和 method alias。交付物需要区分模块存在、主应用挂载、测试覆盖和生产门禁状态。

Worker E 负责持久化、迁移和 MySQL 生产门禁，范围包括相关表结构、索引、迁移脚本、种子数据和 `db:check:production`。交付物必须明确 MySQL 不可用时哪些验证不能声明通过。

Worker F 负责验收、溯源文档和上线清单，范围仅限 `backend-source/docs/ai-trace` 及必要文档索引。交付物是本文件、待验证命令、P0/P1/P2 风险清单、最终变更清单占位和验证结果占位，不修改代码。

## 接口状态记录口径
`frontend-detected` 表示 explorer 只读前端后确认存在调用入口或交互路径。该状态只说明前端会发起请求，不说明后端存在对应能力。

`backend-module-present` 表示后端仓库内存在 route、controller、service、model、test 或脚本等模块文件。该状态只说明代码结构存在，不说明 Express 主应用已挂载。

`root-mounted` 表示对应路由已接入 `src/routes/index.js`、`src/app.js` 或其他生产入口，并能通过实际命令或测试证明可到达。只有同时满足挂载、鉴权、数据依赖和门禁验证的接口，才能进入上线清单。

## 当前风险分级
P0 风险是生产门禁阻塞项。当前重点包括 MySQL 不可连接导致 `verify-production-ready` 或 `db:check:production` 失败、管理后台越权或匿名写入、协作权限绕过、AI 接口误把内部 prompt 或系统配置暴露给前端、未挂载路由被误写为生产可用。P0 未关闭前不得声明后端生产可上线。

P1 风险是上线前必须评估的功能完整性和兼容性缺口。当前重点包括旧前端路径未兼容、错误响应格式不一致、分页字段或筛选字段不稳定、AI/管理/协作接口没有覆盖前端实际 payload、401/403/404 文案导致前端进入模糊失败分支。P1 可以由主 agent 评估是否降级发布，但必须在清单中写明影响范围。

P2 风险是发布后可跟进但需要记录的质量问题。当前重点包括日志字段不统一、ai-trace 状态未及时补录、测试命令覆盖粒度不足、管理后台空态文案不稳定、协作通知实时性与前端期望不一致。P2 不应阻塞生产门禁，但会影响后续排障效率。

## 待验证命令
以下命令需要在其他 worker 完成补丁后由主 agent 或验收 agent 重新执行。执行结果应写入本文档“验证结果”章节，不能用历史输出代替本轮结论。

```powershell
node --check src\modules\ai\ai.routes.js
node --check src\modules\admin\admin.routes.js
node --check src\modules\collaboration\collaboration.routes.js
node --test test\ai-trace-contract.test.js
node --test test\admin-contract.test.js
node --test test\collaboration-contract.test.js
node --test
node scripts\verify-production-ready.mjs
```

如果某个文件或测试名称与实际落地路径不一致，验收 agent 应在“验证结果”里记录“命令未执行：路径不存在”，再补充实际执行的等价命令，不能删除失败或跳过信息。

## MySQL 不可用时的生产门禁说明
MySQL 不可用时，语法检查、单元测试或契约测试只能证明局部代码路径没有明显语法错误或断言失败，不能证明生产可上线。只要 `node scripts\verify-production-ready.mjs`、`db:check:production` 或等价门禁命令返回 MySQL 连接失败，例如 `ECONNREFUSED 127.0.0.1:3306`，本轮状态必须写为 `P0_BLOCKED`。

可接受的处理方式是启动 MySQL、修正 `.env` 中的 `MYSQL_HOST`、`MYSQL_PORT`、账号、密码和数据库名，确认迁移已执行，再重新跑生产门禁。不可接受的处理方式是跳过数据库检查、改门禁脚本制造通过、把内存 fallback 当生产数据库、或在 ai-trace 中省略失败命令。

## 最终变更清单
待主 agent 或各 worker 完成后补录。补录时按文件路径分组，分别写清新增、修改、只读扫描和未触碰文件；不要复制大段源码。

## 验证结果
待主 agent 或验收 agent 执行本轮命令后补录。每条记录应包含命令、退出状态、通过/失败摘要、失败原因和下一步处理人。

