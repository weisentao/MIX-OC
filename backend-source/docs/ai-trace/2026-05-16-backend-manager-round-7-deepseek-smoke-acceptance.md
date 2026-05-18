# 2026-05-16 Backend Manager Round 7：DeepSeek 调用验收与可运行 Smoke

## 目标
- 在后端启动后提供可执行的 AI smoke 验证命令。
- 覆盖 `GET /workspace/ai/settings`、`POST /workspace/ai/chat`、`POST /workspace/ai/home-assistant`、`POST /workspace/resources/ai/assignment-advice`。
- 明确区分并输出：未配置 key、鉴权失败、网络失败、供应商失败、正常响应。
- 兼容 `DEEPSEEK_HR_API_KEY`、`DEEPSEEK_HOME_API_KEY`、`DEEPSEEK_API_KEY` 三种环境变量输入路径（脚本侧识别与提示）。

## 分工
- 17 号后端经理执行：只改 `backend-source/scripts`、`backend-source/test`、`backend-source/docs/ai-trace`。
- 不触达 `frontend-source`，不回滚其他开发者近期改动。

## 修改文件
- `backend-source/scripts/smoke-ai-deepseek.mjs`
  - 新增可运行 smoke 脚本，默认目标 `http://localhost:13001/api`（可由 `SMOKE_BASE_URL`/`SMOKE_API_PREFIX` 覆盖）。
  - 增加分类码：`AUTH_FAILURE`、`KEY_NOT_CONFIGURED`、`NETWORK_FAILURE`、`SUPPLIER_FAILURE`、`NORMAL_RESPONSE`。
  - 对四个目标接口执行 unauthorized + authorized 探测，输出端点级分类摘要。
  - 对 `chat/home-assistant` 通过读取 `/workspace/ai/logs` 最近日志中的 `failureReason` 做细分：
    - `DEEPSEEK_API_KEY is not configured` -> `KEY_NOT_CONFIGURED`
    - 超时/连接失败关键词 -> `NETWORK_FAILURE`
    - 其他 fallback 原因 -> `SUPPLIER_FAILURE`
    - `status=success && source=deepseek` -> `NORMAL_RESPONSE`
  - 增加 key 来源解析优先级：`DEEPSEEK_API_KEY` > `DEEPSEEK_HOME_API_KEY` > `DEEPSEEK_HR_API_KEY`。
  - 支持 `SMOKE_AI_REQUIRE_CODES=CODE1,CODE2` 强制校验本次运行必须观测到的分类集合。
- `backend-source/test/smoke-ai-deepseek-script.test.js`
  - 新增 contract 测试，覆盖脚本挂载、接口覆盖、分类函数行为、key 别名优先级。

## 接口验收口径
- `frontend-detected`: 前端目标接口已在现有契约/烟测使用。
- `backend-module-present`: `ai/hr` 模块内已存在路由和处理逻辑。
- `root-mounted`: 由当前主应用路由统一挂载，可由脚本直接实测。

## 验证命令
- 语法检查：
  - `node --check scripts/smoke-ai-deepseek.mjs`
- 定向测试：
  - `node --test test/smoke-ai-deepseek-script.test.js`
- 可运行 smoke（后端启动后）：
  - `node scripts/smoke-ai-deepseek.mjs`
- 示例：要求本地必须观测到 “鉴权失败 + 未配置 key” 两类：
  - `SMOKE_AI_REQUIRE_CODES=AUTH_FAILURE,KEY_NOT_CONFIGURED node scripts/smoke-ai-deepseek.mjs`

## 风险与说明
- 当前后端 `ai.service` 实际只读取 `DEEPSEEK_API_KEY`；`DEEPSEEK_HOME_API_KEY`/`DEEPSEEK_HR_API_KEY` 由部署或启动层映射到 `DEEPSEEK_API_KEY` 后才能命中真实供应商调用。此轮脚本已兼容识别并提示该前置条件。
- `network` 与 `supplier` 的区分依赖 fallback 日志 `failureReason` 文本；若部署方改写错误文案，需要同步更新关键字规则。
