# Frontend API Contract Freeze

Source snapshot: frontend wrappers under `N:\mutou\xm\xjg\src\services` as of 2026-05-14. The frontend axios base URL is `/api`, so every path below is called as `/api` + path unless `VITE_API_BASE_URL` overrides it.

This document freezes the current frontend-facing API surface. Do not remove or rename these routes without updating the frontend wrapper and this contract together.

## Auth

All auth paths are defined in `src/services/auth.js`.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| POST | /login | username, password | smoke-live |
| POST | /register | username, password, name, phone, email, department, job, mbti, securityQuestion, securityAnswer | documented-only |
| GET | /security-question | username query | documented-only |
| POST | /forgot-password | username, phone, newPassword | documented-only |
| POST | /change-password | oldPassword, newPassword | documented-only |
| GET | /me | Authorization Bearer token | smoke-live |

## Workspace

Workspace paths are defined in `src/services/workspaceApi.js`.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /workspace/bootstrap | none | smoke-live |
| GET | /workspace/project-groups | none | covered-by-domain-smoke |
| POST | /workspace/project-groups | title, suffix, status, sortOrder | covered-by-domain-smoke |
| PUT | /workspace/project-groups/:id | title, suffix, status, sortOrder | covered-by-domain-smoke |
| DELETE | /workspace/project-groups/:id | none | covered-by-domain-smoke |
| GET | /workspace/projects | none | smoke-live |
| POST | /workspace/projects | name, groupId, owner, members, memberRoles, tags, syncSchedule, startDate, endDate, status, archived, sortOrder | smoke-live |
| PUT | /workspace/projects/:id | name, groupId, owner, members, memberRoles, tags, syncSchedule, startDate, endDate, status, archived, sortOrder | smoke-lifecycle |
| DELETE | /workspace/projects/:id | none | smoke-lifecycle |
| GET | /workspace/projects/:projectId/tasks | none | smoke-lifecycle |
| POST | /workspace/projects/:projectId/tasks | title, type, module, owner, ownerUserId, startDate, endDate, status, priority, note, archived, expanded, unreadComments, sortOrder | smoke-live |
| PUT | /workspace/tasks/:taskId | title, type, module, owner, ownerUserId, startDate, endDate, status, priority, note, archived, expanded, unreadComments, sortOrder | covered-by-domain-smoke |
| DELETE | /workspace/tasks/:taskId | none | covered-by-domain-smoke |
| POST | /workspace/tasks/:taskId/comments | text | smoke-live |
| GET | /workspace/tags | none | covered-by-domain-smoke |
| POST | /workspace/tags | name, color, scope, status, sortOrder | covered-by-domain-smoke |
| DELETE | /workspace/tags/:name | none | covered-by-domain-smoke |

## Boards

Board paths are called through `workspaceApi` and documented in more detail in `docs/board-api.md`.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /workspace/boards | projectId query | smoke-live |
| POST | /workspace/boards | projectId, scopeType, title, ownerId, ownerName, elements, appState, files | smoke-live |
| GET | /workspace/boards/:boardId | none | covered-by-domain-smoke |
| PATCH | /workspace/boards/:boardId | title, elements, appState, files | smoke-live |
| DELETE | /workspace/boards/:boardId | none | smoke-lifecycle |
| PUT | /workspace/boards/:boardId/shares | entries | covered-by-domain-smoke |
| GET | /workspace/boards/:boardId/history | none | smoke-live |

Backend also keeps `PUT /workspace/boards/:boardId` and `POST /workspace/boards/:boardId/shares` aliases, but the current frontend wrapper uses `PATCH` for save and `PUT` for shares.

## Schedule

Schedule paths are defined in `src/services/scheduleApi.js`.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /workspace/projects/:projectId/schedule | none | smoke-live |
| POST | /workspace/projects/:projectId/schedule/items | title, type, module, owner, startDate, endDate, status, progress, addToTaskList, linkTask, linkFlow, note, dependencyIds | smoke-live |
| PUT | /workspace/schedule/items/:itemId | title, module, owner, startDate, endDate, status, progress, note, linkTask, linkFlow | covered-by-domain-smoke |
| DELETE | /workspace/schedule/items/:itemId | none | smoke-lifecycle |
| GET | /workspace/projects/:projectId/schedule/snapshots | none | covered-by-domain-smoke |
| POST | /workspace/projects/:projectId/schedule/snapshots | title, snapshot | smoke-live |
| GET | /workspace/schedule/templates | none | smoke-live |
| POST | /workspace/schedule/templates | title, description, visibility, template, payload | covered-by-domain-smoke |
| POST | /workspace/projects/:projectId/schedule/export | format | smoke-live |
| GET | /workspace/schedule/items/:itemId/comments | none | covered-by-domain-smoke |
| POST | /workspace/schedule/items/:itemId/comments | content, payload | smoke-live |

## Coverage Notes

- Backend route coverage is provided by `src/routes/auth.routes.js`, `src/routes/workspace.routes.js`, and `src/routes/schedule.routes.js`.
- `src/app.js` mounts routes both at `/api` and at the root path for compatibility.
- All workspace, board, and schedule paths require `Authorization: Bearer <token>`.
- MySQL-backed workspace, board, and schedule endpoints must return `503` rather than silently passing production verification on fallback data.
- `smoke-live` means `npm run smoke:frontend-contract` must contain a direct real HTTP check for that path family.
- `smoke-lifecycle` means `npm run smoke:frontend-contract` exercises the path as setup or cleanup around another live assertion.
- `covered-by-domain-smoke` means an existing domain smoke script owns that route in detail.
- `documented-only` means the route is frozen for compatibility but is not part of the destructive/live smoke subset.
