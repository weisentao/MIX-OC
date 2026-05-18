# 前端文件、图片、聊天文本接入 storage-v1 契约

本文定义前端把文件类数据迁移到后端 storage-v1 时使用的接口、metadata 约定和备份边界。当前后端已经提供 `/workspace/storage/upload` 与 `/workspace/storage/chat-text`，但前端上传点多数仍在本地状态或 MySQL JSON 中保存 base64/文件字典，尚未正式接线。

## 备份边界

`backend-source/data/storage-v1` 是 storage-v1 的唯一文件根目录。图片、视频、附件、聊天文本文件和 sidecar 元数据都必须落在这个目录下，业务代码不能把真实上传文件写入前端目录、源码目录、临时目录或 MySQL JSON 字段。该目录应与 MySQL dump 一起备份；恢复时先恢复文件目录，再恢复或校验 `storage_files` 中的 `storage_uid`、`relative_path`、`checksum_sha256` 和业务 scope 字段。

`backend-source/data/ai-v1` 是 AI 文档、AI 会话配置或 AI 运行态 JSON 的另一备份单元。AI 文档不要混入 `data/storage-v1`，storage 文件也不要写入 `data/ai-v1`。两个目录都需要纳入生产备份，但恢复脚本应把它们作为不同数据域处理，避免文件 ID、保留策略和清理窗口互相影响。

MySQL 当前仍保存业务索引和部分 JSON 边界。`storage_files` 是上传文件和聊天文本的可恢复元数据索引；`schedule_item_comments.content_text` 与 `payload_json` 仍是排期评论的主记录；`boards.files_json`、`boards.board_state_json`、`board_history.files_json` 当前仍保存 Excalidraw 画板 JSON。前端接 storage-v1 后，MySQL 评论或画板 JSON 只应保存 `storageId`、`previewUrl`、`downloadUrl`、原始字段兼容信息和业务关联，不再新增大体积 base64 内容。

## 已提供接口

所有接口已由主路由挂载，并在默认部署下带 `/api` 前缀访问，例如 `/api/workspace/storage/upload`。裸 `/storage/**` 与 `/workspace/storage/**` 是同一套 handler；前端接线时优先使用 workspace 路径，避免后续业务路由再做兼容判断。

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| `POST` | `/workspace/storage/upload` | `storage.write` | multipart 上传图片、视频或附件 |
| `POST` | `/workspace/storage/chat-text` | `storage.write` | 把聊天文本写成 `chat_text` 文件并生成 metadata |
| `GET` | `/workspace/storage/files` | `storage.read` | 按 `kind`、`scopeType`、`scopeId`、`conversationId`、`uploadedBy` 列表查询 |
| `GET` | `/workspace/storage/files/:storageId` | `storage.read` | 读取单个 storage metadata |
| `GET` | `/workspace/storage/files/:storageId/preview` | `storage.read` | 预览图片、视频、PDF、JSON、文本；视频支持 `Range` |
| `GET` | `/workspace/storage/files/:storageId/download` | `storage.read` | 下载原文件 |
| `DELETE` | `/workspace/storage/files/:storageId` | 上传者、`admin` 或 `storage.delete` | 软删除 metadata 并删除文件 |
| `GET` | `/workspace/storage/ensure-sql` | `storage.read` | 返回 `storage_files` 建表 SQL |

`POST /workspace/storage/upload` 使用 `multipart/form-data`，文件字段名为 `file`。后端读取文本字段 `kind`、`scopeType`、`scopeId`、`conversationId`、`messageId`、`metadata` 或 `payload`，其中 `metadata`/`payload` 必须是 JSON object 字符串。`kind` 支持 `image`、`video`、`attachment`，文本接口固定写入 `chat_text`。后端会返回 `storageId`、`kind`、`scopeType`、`scopeId`、`conversationId`、`messageId`、`originalName`、`safeOriginalName`、`mimeType`、`sizeBytes`、`checksumSha256`、`relativePath`、`metadata`、`uploadedBy`、`createdAt`、`url`、`previewUrl`、`apiPreviewUrl`、`downloadUrl` 和 `apiDownloadUrl`。

前端只允许持久化返回的 API 字段，不允许依赖 `relativePath` 拼接磁盘文件路径。`previewUrl` 是裸路由兼容路径，`apiPreviewUrl` 与 `apiDownloadUrl` 是默认前端 API client 应优先使用的 `/api` 地址；`url` 现在与 `apiPreviewUrl` 对齐，避免前端裸 `/storage` 绕过 `/api`。如果仍需兼容旧读侧，可把 `previewUrl` 视为回退字段，不要让业务组件猜测后端磁盘布局。

## metadata 约定

storage service 目前提供通用 `scopeType`、`scopeId`、`conversationId`、`messageId` 和 `metadata` 字段，不在路由层强制 profile/home/launcher/board-file 专用 schema。前端接线时按下表写入稳定 metadata，后端保持透传、索引 scope 字段，并由调用方把返回的 `storageId` 回写到对应用户字段、画板 JSON 或评论 payload。

| 前端上传点 | 当前前端状态 | storage 请求 | metadata |
| --- | --- | --- | --- |
| `ProfileDialog.vue` 头像 | `avatarImage` 本地/base64 | `kind=image`，`scopeType=profile`，`scopeId=<userId>` | `{ "usage": "profile-avatar", "field": "avatarImage", "userId": "<userId>" }` |
| `ProfileDialog.vue` 人物图 | `characterImage` 本地/base64 | `kind=image`，`scopeType=profile`，`scopeId=<userId>` | `{ "usage": "profile-character", "field": "characterImage", "userId": "<userId>" }` |
| `ProfileDialog.vue` 手写签名 | `signatureImage` 本地/base64 | `kind=image`，`scopeType=profile`，`scopeId=<userId>` | `{ "usage": "profile-signature", "field": "signatureImage", "userId": "<userId>" }` |
| `WorkspaceView.vue` 首页背景 | `homeBackgroundImage` 本地/base64 | `kind=image`，`scopeType=home`，`scopeId=<userId>` | `{ "usage": "home-background", "field": "homeBackgroundImage", "userId": "<userId>" }` |
| `AppLauncherDialog.vue` 图标 | launcher items 本地图标 | `kind=image`，`scopeType=launcher`，`scopeId=<appId>` | `{ "usage": "launcher-icon", "field": "icon", "appId": "<appId>" }` |
| `ExcalidrawIsland.jsx` files | `boards.files_json` / history JSON | `kind=image` 或 `attachment`，`scopeType=board-file`，`scopeId=<boardId>` | `{ "usage": "board-file", "boardId": "<boardId>", "fileId": "<excalidrawFileId>" }` |
| `ScheduleFloatingChat.vue` 评论文本 | `schedule_item_comments.content_text` | `/workspace/storage/chat-text`，`scopeType=schedule-comment`，`scopeId=<itemId>`，`conversationId=<projectId或planId>`，`messageId=<commentId>` | `{ "usage": "schedule-comment", "projectId": "<projectId>", "itemId": "<itemId>", "commentId": "<commentId>" }` |

头像、人物图、签名、首页背景和 launcher 图标接线后，用户或 launcher 业务记录应保存 `storageId` 与 `apiPreviewUrl`，必要时短期保留 `previewUrl` 与旧 base64 字段用于回滚。画板接线后，`files_json` 中每个 Excalidraw file entry 应保存 `storageId`、`apiPreviewUrl`、`mimeType`、`sizeBytes` 和原 `fileId`；大文件内容迁移完成后不再写入 data URL。排期评论接线后，评论正文仍以 MySQL `content_text` 作为可检索主文本，`chat_text` 文件用于统一备份和附件式下载，`payload_json.storageId` 可作为关联。

## 请求示例

上传个人头像时，前端应先拿当前用户 ID，再把业务语义放入 scope 和 metadata。后端根据 MIME 白名单、文件签名和大小限制验证文件，写入 `data/storage-v1/files/images/YYYY/MM/DD/<storageId>.<ext>`，再写入 `storage_files` 和 sidecar metadata。

```http
POST /api/workspace/storage/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=...

file=@avatar.png;type=image/png
kind=image
scopeType=profile
scopeId=user-001
metadata={"usage":"profile-avatar","field":"avatarImage","userId":"user-001"}
```

```json
{
  "storageId": "sf_1778841600000_abcd1234abcd1234",
  "kind": "image",
  "scopeType": "profile",
  "scopeId": "user-001",
  "mimeType": "image/png",
  "sizeBytes": 42192,
  "metadata": {
    "usage": "profile-avatar",
    "field": "avatarImage",
    "userId": "user-001"
  },
  "url": "/api/storage/files/sf_1778841600000_abcd1234abcd1234/preview",
  "apiPreviewUrl": "/api/storage/files/sf_1778841600000_abcd1234abcd1234/preview",
  "previewUrl": "/storage/files/sf_1778841600000_abcd1234abcd1234/preview",
  "downloadUrl": "/storage/files/sf_1778841600000_abcd1234abcd1234/download",
  "apiDownloadUrl": "/api/storage/files/sf_1778841600000_abcd1234abcd1234/download"
}
```

写入排期评论文本时，前端可以在创建评论成功后补写 storage，也可以由后端业务层后续统一串联。当前契约不改变评论 API 的主记录边界，因此 storage 写入失败不能让已经落库的评论消失；调用方应记录失败状态并允许重试。

```http
POST /api/workspace/storage/chat-text
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "请同步当前排期节点进展。",
  "scopeType": "schedule-comment",
  "scopeId": "si-001",
  "conversationId": "project-1001",
  "messageId": "sic-001",
  "metadata": {
    "usage": "schedule-comment",
    "projectId": "project-1001",
    "itemId": "si-001",
    "commentId": "sic-001"
  }
}
```

## 安全和权限

后端只接受 allowlist MIME。图片限制为 `image/png`、`image/jpeg`、`image/webp`、`image/gif` 且最大 8 MiB；视频限制为 `video/mp4`、`video/webm`、`video/quicktime` 且最大 220 MiB；聊天文本最大 2 MiB；普通附件最大 80 MiB。后端会校验文件签名，清理原始文件名，并用 `assertInsideRoot` 保证写入路径不能逃逸 `data/storage-v1`。

上传接口允许普通协作成员调用：具备 `storage.write` 的成员（包括默认 `employee`）至少可以上传工作相关文件。读取、预览和下载仍要求 `storage.read`，并对 `project/board/schedule/task/chat` scope 做二次授权：拥有对应 workspace/storage read 权限的协作成员可预览这些工作协作文件；`profile`、`home`、`launcher` 等个人范围仍按上传者隔离。`admin` 或具备 `storage.delete` 的 token 可以绕过 owner 检查，前端也不能直接分享裸 URL 作为权限替代。

删除接口删除文件并把 metadata 标记为 `deleted`。业务记录引用 storage 文件时，应先解除业务引用或创建替代文件，再调用删除接口，避免头像、画板和评论 payload 指向已删除的 `storageId`。

## 接线顺序

前端接线建议先做非破坏迁移：上传成功后保存 `storageId` 和 `apiPreviewUrl`，旧 `previewUrl` / base64 字段短期保留；读侧优先展示 `apiPreviewUrl`，没有时回退旧字段。第二步为画板 files 和评论 payload 增加 `storageId` 引用，但保留 MySQL `content_text` 和 `files_json` 结构。第三步执行一次迁移任务，把旧 base64 逐步上传到 storage-v1，并在完成备份校验后再清理大体积旧字段。
