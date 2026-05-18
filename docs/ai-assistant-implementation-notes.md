# AI 助手前后端协作说明

维护位置：`docs/ai-assistant-implementation-notes.md`

核对时间：2026-05-15。后端主契约见 `backend-source/docs/ai-assistant-api-contract.md`，后台管理补充见 `backend-source/docs/admin-manager-api-contract.md` 的 AI 章节。

## 1. 分工边界

前端只负责展示 AI 入口、收集用户输入、传递当前页面上下文、渲染回答和资料来源。前端不得直连 DeepSeek，不得保存 DeepSeek key，不得把 key 写入任何前端 `.env`、构建产物、本地存储、请求头、请求体或错误上报。

后端负责读取后端侧 DeepSeek 配置、校验登录态、裁剪数据权限、组装提示词、调用 DeepSeek、脱敏日志并返回结构化结果。首页/工作台 AI 优先使用 `DEEPSEEK_HOME_API_KEY`（其次已保存的首页 scoped key、最后兼容回退 `DEEPSEEK_API_KEY`）；人力智能建议优先使用 `DEEPSEEK_HR_API_KEY`（其次已保存的人力 scoped key、最后兼容回退 `DEEPSEEK_API_KEY`）。后端不能信任前端传来的 `projectId`、`taskId`、`documentIds` 或 `retrieval.scope`，必须按 token 重新计算当前用户 scope。

## 2. 当前接入入口

首页搜索和右下角工作助手统一调用：

```http
POST /workspace/ai/chat
```

兼容旧入口：

```http
POST /workspace/ai/home-assistant
```

首页挂载时还会读取：

```http
GET /workspace/ai/settings
```

请求体最小示例：

```json
{
  "message": "帮我看看今天有哪些任务要优先处理",
  "scope": "home",
  "conversationId": "conv-001",
  "context": {
    "entry": "home",
    "searchResults": []
  }
}
```

前端服务文件是 `frontend-source/src/services/aiApi.js`，它只调用后端 `/workspace/ai/chat`，不包含 DeepSeek 域名、key 或 Authorization 供应商头。

## 3. 后台治理

超级后台 AI 配置页依赖：

- `GET /admin/ai/config`
- `PATCH /admin/ai/config`
- `GET /admin/ai/models`
- `GET /admin/ai/usage-logs`
- `GET/POST/PATCH/DELETE /admin/ai/documents`

普通管理 AI 使用页依赖：

- `GET /manager/ai/config`
- `GET /manager/ai/logs`

普通管理端是只读视图，不允许修改模型、联网开关、知识范围或资料文档。

## 4. 模型和 fallback

默认模型为 `deepseek-v4-flash`，可选 `deepseek-v4-pro`。旧 `deepseek-chat`、`deepseek-reasoner` 只做兼容归一化，不作为新页面推荐项。

当前实现为了保证首页不断流，未配置可用首页 key（`DEEPSEEK_HOME_API_KEY` 与兼容回退 `DEEPSEEK_API_KEY` 均不可用）、DeepSeek 调用失败或后台禁用时，`POST /workspace/ai/chat` 会返回 `source: "fallback"`、`status: "fallback"` 的本地兜底答案，并写入日志。日志会记录脱敏后的 `usage`、`retrieval`、`failureReason`。前端看到 fallback 时应显示为“本地整理/待连接”，不要提示用户输入 key。

## 5. 后续文档和检索

后台资料文档当前先存 JSON，字段包括 `title`、`content`、`summary`、`scope`、`status`、`tags`。后续如果接入文件库或向量库，检索结果必须先按用户权限过滤，再进入 DeepSeek prompt。

预留字段建议继续使用 `retrieval`、`citations`、`documents`、`vectorStore`，但当前页面不依赖向量库才能工作。

## 6. 联调验收重点

1. 浏览器请求、响应和构建产物中不能出现 `DEEPSEEK_HOME_API_KEY`、`DEEPSEEK_HR_API_KEY`、`DEEPSEEK_API_KEY` 或任何 DeepSeek key 明文。
2. 首页搜索和浮窗都走 `/api/workspace/ai/chat`。
3. 未配置 key 时聊天能返回 fallback，不白屏、不把错误抛给用户。
4. admin 能保存模型、联网开关、知识范围、回答模板、资料文档。
5. manager 只能查看当前权限范围内的 AI 使用记录。
6. admin 配置接口拒绝任何密钥字段。
7. 日志列表只展示摘要，不展示完整敏感 prompt、JWT、Authorization header 或密码。
