# Board API

This document covers the first-release database-backed collaboration board API. The same handlers are exposed under both root paths and workspace paths:

- `/boards...`
- `/workspace/boards...`

The frontend currently calls the `/workspace/boards...` variants through `workspaceApi`.

## API List

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/boards` | List boards visible to the current user. Optional `?projectId=` filters by project. |
| `POST` | `/boards` | Create a board for a project or module scope. |
| `GET` | `/boards/:boardId` | Read one board, including content and sharing metadata. |
| `PATCH` | `/boards/:boardId` | Save board content or metadata. |
| `PUT` | `/boards/:boardId` | Same as `PATCH`, kept for clients that use PUT updates. |
| `DELETE` | `/boards/:boardId` | Soft-delete/archive a board. |
| `PUT` | `/boards/:boardId/shares` | Replace board sharing entries. |
| `POST` | `/boards/:boardId/shares` | Same as `PUT /shares`, kept for clients that post share updates. |
| `GET` | `/boards/:boardId/export?format=json` | Export the current board as JSON. |
| `GET` | `/boards/:boardId/history` | List saved board versions/history. |
| `POST` | `/boards/:boardId/sync` | Batch board sync alias for save + board + history payloads. |

Workspace-prefixed equivalents:

- `GET /workspace/boards`
- `POST /workspace/boards`
- `GET /workspace/boards/:boardId`
- `PATCH /workspace/boards/:boardId`
- `PUT /workspace/boards/:boardId`
- `DELETE /workspace/boards/:boardId`
- `PUT /workspace/boards/:boardId/shares`
- `POST /workspace/boards/:boardId/shares`
- `GET /workspace/boards/:boardId/export?format=json`
- `GET /workspace/boards/:boardId/history`
- `POST /workspace/boards/:boardId/sync`

## Examples

### List Boards

Request:

```http
GET /workspace/boards?projectId=project-1001
Authorization: Bearer <token>
```

Response:

```json
[
  {
    "id": "SMOKE_BOARD_board_001",
    "boardId": "SMOKE_BOARD_board_001",
    "scopeKey": "project:project-1001",
    "scopeType": "project",
    "projectId": "project-1001",
    "projectUid": "project-1001",
    "moduleKey": "",
    "boardKind": "personal",
    "ownerId": "u-admin",
    "ownerName": "admin",
    "isDefault": false,
    "title": "Project board",
    "status": "active",
    "visibility": "project-members",
    "editableRoles": ["manager", "editor"],
    "readonlyRoles": ["readonly"],
    "sharedWith": [],
    "elements": [],
    "appState": { "viewBackgroundColor": "#ffffff" },
    "files": {},
    "lastVersion": 1
  }
]
```

### Create Board

Request:

```http
POST /workspace/boards
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "id": "SMOKE_BOARD_board_001",
  "projectId": "project-1001",
  "scopeType": "project",
  "title": "Project board",
  "ownerId": "u-admin",
  "ownerName": "admin",
  "elements": [],
  "appState": { "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

Response: `201 Created`

If a board with the requested `id` / `boardId` already exists and the current user can open it, the operation is idempotent and returns `200 OK` with the existing board. This avoids backend sync retries for default boards failing with duplicate-key `500` errors. Archived boards are not returned through the idempotent path.

```json
{
  "id": "SMOKE_BOARD_board_001",
  "scopeType": "project",
  "projectId": "project-1001",
  "title": "Project board",
  "ownerId": "u-admin",
  "ownerName": "admin",
  "elements": [],
  "appState": { "viewBackgroundColor": "#ffffff" },
  "files": {},
  "lastVersion": 1
}
```

### Save Board Content

Request:

```http
PATCH /workspace/boards/SMOKE_BOARD_board_001
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "title": "Project board saved",
  "elements": [{ "id": "SMOKE_BOARD_rect_001", "type": "rectangle", "version": 1 }],
  "appState": { "viewBackgroundColor": "#f8fafc" },
  "files": {}
}
```

Optional optimistic concurrency fields:

- `baseVersion`: when present, must be greater than or equal to the current `lastVersion`.
- `lastVersion`: accepted as a compatibility alias when `baseVersion` is not present.

If the supplied version is stale, the API returns `409 Conflict` and does not save a new history record.

Conflict responses now include stable details for client retry:

```json
{
  "code": "BOARD_VERSION_CONFLICT",
  "message": "Board version conflict",
  "details": {
    "boardId": "SMOKE_BOARD_board_001",
    "expectedVersion": 4,
    "currentVersion": 5,
    "latestVersion": 5,
    "updatedAt": "2026-05-17 10:00:00"
  }
}
```

Response: `200 OK`

```json
{
  "id": "SMOKE_BOARD_board_001",
  "title": "Project board saved",
  "elements": [{ "id": "SMOKE_BOARD_rect_001", "type": "rectangle", "version": 1 }],
  "appState": { "viewBackgroundColor": "#f8fafc" },
  "files": {},
  "lastVersion": 2
}
```

### Share Board

Request:

```http
PUT /workspace/boards/SMOKE_BOARD_board_001/shares
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "entries": [
    { "userId": "u-linxin", "userName": "林鑫", "permission": "readonly" },
    { "userId": "u-editor", "userName": "Editor", "permission": "edit" }
  ]
}
```

Response: `200 OK`

```json
{
  "id": "SMOKE_BOARD_board_001",
  "sharedWith": [
    { "userId": "u-linxin", "userName": "林鑫", "permission": "readonly" },
    { "userId": "u-editor", "userName": "Editor", "permission": "edit" }
  ]
}
```

### Export Board

Request:

```http
GET /workspace/boards/SMOKE_BOARD_board_001/export?format=json
Authorization: Bearer <token>
```

Response: `200 OK`

```json
{
  "format": "json",
  "board": {
    "id": "SMOKE_BOARD_board_001",
    "title": "Project board saved",
    "elements": []
  },
  "exportedAt": "2026-05-15T00:00:00.000Z"
}
```

### Read Board As Shared Member

Request:

```http
GET /workspace/boards/SMOKE_BOARD_board_001
Authorization: Bearer <member-token>
```

Response: `200 OK` when the member is project member or has a board share. Non-members without a share receive `403`.

### History

Request:

```http
GET /workspace/boards/SMOKE_BOARD_board_001/history
Authorization: Bearer <token>
```

Response:

```json
[
  {
    "id": "board-history-...",
    "boardId": "SMOKE_BOARD_board_001",
    "version": 2,
    "actorUserId": "u-admin",
    "actionType": "save",
    "changeSummary": "save board",
    "elements": [{ "id": "SMOKE_BOARD_rect_001", "type": "rectangle", "version": 1 }],
    "files": {},
    "appState": { "viewBackgroundColor": "#f8fafc" },
    "createdAt": "2026-05-13 10:00:00"
  }
]
```

### Batch Sync

Request:

```http
POST /workspace/boards/SMOKE_BOARD_board_001/sync
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "save": {
    "title": "Project board saved",
    "elements": [{ "id": "SMOKE_BOARD_rect_001", "type": "rectangle", "version": 2 }],
    "appState": { "viewBackgroundColor": "#f8fafc" },
    "files": {},
    "baseVersion": 5,
    "lastVersion": 5
  },
  "includeHistory": true
}
```

Response:

```json
{
  "ok": true,
  "boardId": "SMOKE_BOARD_board_001",
  "updated": true,
  "historyIncluded": true,
  "serverTime": "2026-05-17T10:00:00.000Z",
  "board": {
    "id": "SMOKE_BOARD_board_001",
    "lastVersion": 6
  },
  "sharedWith": [],
  "permissions": {
    "editableRoles": ["manager", "editor"],
    "readonlyRoles": ["readonly"]
  },
  "history": []
}
```

## Permission Rules

- `owner`: board owner or system admin. Can read, edit, delete, share, and view history.
- `edit`: explicit board share with `edit`, or project role `manager` / `editor`. Can read and save board content.
- `readonly`: explicit board share with `readonly`, or project role `readonly`. Can read board content and history, but cannot save.
- Project members can read project boards according to their project role.
- Non-members without explicit board sharing are rejected with `403`.
- Archived/deleted boards are hidden from `GET`, `PATCH`/`PUT`, share updates, history, and export; these operations return `404` to avoid exposing internal archive state.
- `DELETE` archives the board and synchronously marks `board_members` and `board_shares` as `archived`; history and snapshots are retained.

## MySQL Availability

All board endpoints require MySQL. If MySQL is not ready, the API returns:

```json
{
  "message": "MySQL unavailable for board API"
}
```

with HTTP `503`.

For production launch, this is a blocking state. `/appState/main` fallback must not be treated as a formal board database pass.

## Phase 2

Realtime collaboration is not included in the first release. Phase 2 should cover:

- WebSocket transport.
- Conflict merging.
- Cursor synchronization.
- Online member presence.
- `POST /workspace/boards/:boardId/history/:historyId/restore` for restoring a retained history entry.
