# Schedule API

All endpoints require `Authorization` and use the same project permission model as the existing schedule plan and item APIs.

- Project schedule read endpoints require project `view`.
- Snapshot create requires project `edit`.
- Export requires project `view` plus global `canExport`. `admin` and `manager` can export; `employee` cannot export.
- Template endpoints are workspace scoped and require an authenticated user. Private templates are visible to their owner/creator; workspace/public templates are visible to authenticated users; admins can see all.
- When MySQL is not ready, schedule service methods return HTTP `503` with `MySQL unavailable for schedule API`.
- A `503` from any schedule endpoint is a production launch blocker（上线阻塞）. Do not treat frontend fallback data as a pass condition.

## Plan

### `GET /workspace/projects/:projectId/schedule`

Loads the active MySQL-backed schedule plan for a project. If no active plan exists, the backend creates one from the project dates and returns the stable schedule shape used by the frontend.

Response:

```json
{
  "plan": {
    "id": "sp-...",
    "projectId": 1003,
    "projectUid": "project-...",
    "title": "项目排期",
    "projectName": "Project name",
    "startDate": "2026/05/10",
    "endDate": "2026/06/21",
    "status": "active",
    "viewConfig": {
      "defaultView": "timeline",
      "dayWidth": 28,
      "rowHeight": 34
    },
    "summary": {
      "itemCount": 0,
      "pendingCount": 0,
      "doneCount": 0,
      "riskCount": 0
    }
  },
  "items": [],
  "dependencies": [],
  "snapshots": [],
  "templates": []
}
```

### `POST /workspace/projects/:projectId/schedule`

Updates the active plan metadata, such as title, project date range, and view config.

## Items

### `POST /workspace/projects/:projectId/schedule/items`

Creates a MySQL-backed schedule item. When `addToTaskList` is true, the backend also creates a linked task and stores its `taskUid` on the schedule item.

Request:

```json
{
  "title": "分镜框架 / 风格稿",
  "type": "schedule",
  "module": "design",
  "owner": "后期2部: 张三",
  "startDate": "2026/05/16",
  "endDate": "2026/05/19",
  "status": "todo",
  "progress": 0,
  "addToTaskList": true,
  "linkTask": true,
  "linkFlow": true,
  "note": "按 PDF 复刻的排期环节",
  "dependencyIds": []
}
```

Response: `201`

```json
{
  "item": {
    "id": "si-...",
    "itemId": "si-...",
    "taskId": 1300101,
    "taskUid": "task-...",
    "type": "schedule",
    "title": "分镜框架 / 风格稿",
    "module": "design",
    "owner": "后期2部: 张三",
    "startDate": "2026/05/16",
    "endDate": "2026/05/19",
    "status": "todo",
    "progress": 0,
    "sortOrder": 300,
    "hidden": false,
    "linkTask": true,
    "linkFlow": true,
    "commentsCount": 0,
    "note": "按 PDF 复刻的排期环节"
  },
  "task": {
    "id": 1300101,
    "taskUid": "task-...",
    "taskId": "task-...",
    "title": "分镜框架 / 风格稿"
  }
}
```

### `PUT /workspace/schedule/items/:itemId`

Updates one schedule item. If the item is linked to a task, supported task fields are synchronized back to `tasks`.

### `DELETE /workspace/schedule/items/:itemId`

Soft-deletes one schedule item by marking it hidden/deleted. The linked task is not deleted.

Response:

```json
{
  "ok": true,
  "deletedItemId": "si-...",
  "itemId": "si-...",
  "taskUid": "task-...",
  "taskDeleted": false
}
```

## Item Comments

### `GET /workspace/schedule/items/:itemId/comments`

Lists MySQL-backed comments for a visible schedule item.

### `POST /workspace/schedule/items/:itemId/comments`

Creates a schedule item comment.

Request:

```json
{
  "content": "schedule comment",
  "payload": {
    "source": "schedule-chat"
  }
}
```

### `PUT /workspace/schedule/items/:itemId/comments/:commentId`

Updates a schedule comment. The author, project manager, or admin may mutate it.

### `DELETE /workspace/schedule/items/:itemId/comments/:commentId`

Deletes a schedule comment.

## Snapshots

### `GET /workspace/projects/:projectId/schedule/snapshots`

Lists persisted snapshots for the active schedule plan.

Response:

```json
{
  "snapshots": [
    {
      "id": "ss-...",
      "snapshotId": "ss-...",
      "planId": "sp-...",
      "projectId": "project-...",
      "title": "Baseline snapshot",
      "summary": {
        "itemCount": 2,
        "pendingCount": 1,
        "doneCount": 1,
        "riskCount": 0
      },
      "snapshot": {
        "plan": {},
        "items": [],
        "dependencies": []
      },
      "createdBy": "u-...",
      "createdByName": "admin",
      "createdAt": "2026/05/14 10:11"
    }
  ]
}
```

### `POST /workspace/projects/:projectId/schedule/snapshots`

Creates a MySQL-backed snapshot in `schedule_snapshots`. If `snapshot` is omitted, the backend captures the current schedule plan, items, and dependencies.

Request:

```json
{
  "title": "Baseline snapshot",
  "snapshot": {
    "plan": {},
    "items": [],
    "dependencies": []
  }
}
```

Response: `201`

```json
{
  "snapshot": {
    "id": "ss-...",
    "snapshotId": "ss-...",
    "planId": "sp-...",
    "projectId": "project-...",
    "title": "Baseline snapshot",
    "summary": {},
    "snapshot": {},
    "createdBy": "u-...",
    "createdByName": "admin",
    "createdAt": "2026/05/14 10:11"
  }
}
```

## Templates

### `GET /workspace/schedule/templates`

Lists schedule templates available to the authenticated user.

Response:

```json
{
  "templates": [
    {
      "id": "st-...",
      "templateId": "st-...",
      "title": "Launch Template",
      "description": "Critical path",
      "ownerUserId": "u-...",
      "visibility": "workspace",
      "itemCount": 2,
      "template": {
        "items": []
      },
      "payload": {},
      "createdBy": "u-...",
      "updatedBy": "u-...",
      "createdAt": "2026/05/14 10:11",
      "updatedAt": "2026/05/14 11:12"
    }
  ]
}
```

### `POST /workspace/schedule/templates`

Creates a MySQL-backed template in `schedule_templates`.

Request:

```json
{
  "title": "Launch Template",
  "description": "Critical path",
  "visibility": "workspace",
  "template": {
    "items": [
      { "title": "Kickoff" }
    ],
    "dependencies": []
  },
  "payload": {
    "source": "schedule"
  }
}
```

Response: `201`

```json
{
  "template": {
    "id": "st-...",
    "templateId": "st-...",
    "title": "Launch Template",
    "description": "Critical path",
    "ownerUserId": "u-...",
    "visibility": "workspace",
    "itemCount": 1,
    "template": {
      "items": [
        { "title": "Kickoff" }
      ],
      "dependencies": []
    },
    "payload": {
      "source": "schedule"
    },
    "createdBy": "u-...",
    "updatedBy": "u-...",
    "createdAt": "2026/05/14 10:11",
    "updatedAt": "2026/05/14 10:11"
  }
}
```

## Export

### `POST /workspace/projects/:projectId/schedule/export`

Creates a minimal downloadable HTML export and persists an export record in MySQL via `schedule_snapshots` with `snapshot.kind = "export"`. The first version does not generate a PDF binary.

Permission: the actor must pass project `view` and global `canExport`. `admin` and `manager` can export; `employee` cannot export even when the employee can view the project.

Format note: `format: "pdf"` is accepted as a request value but still returns HTML. The response includes `requestedFormat`, `effectiveFormat`, and `htmlOnly` so clients can tell whether a real PDF was produced.

Request:

```json
{
  "format": "html"
}
```

Response: `201`

```json
{
  "export": {
    "id": "sex-...",
    "exportId": "sex-...",
    "snapshotId": "sex-...",
    "projectId": "project-...",
    "planId": "sp-...",
    "title": "Project Schedule",
    "format": "html",
    "requestedFormat": "html",
    "effectiveFormat": "html",
    "htmlOnly": true,
    "status": "ready",
    "createdAt": "2026/05/14 10:11"
  },
  "download": {
    "fileName": "schedule-project-20260514.html",
    "mimeType": "text/html; charset=utf-8",
    "contentType": "text/html; charset=utf-8",
    "requestedFormat": "html",
    "effectiveFormat": "html",
    "htmlOnly": true,
    "encoding": "utf8",
    "headers": {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"schedule-project-20260514.html\""
    },
    "content": "<!doctype html>...",
    "base64": "PCFkb2N0eXBlIGh0bWw+..."
  }
}
```
