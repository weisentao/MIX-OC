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
| POST | /workspace/boards/:boardId/sync | save(baseVersion,lastVersion,title,elements,appState,files), includeHistory | covered-by-domain-smoke |

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

## App State Compatibility

Fallback app state paths are called from `src/stores/workspace/actions/appActions.js` only when `/workspace/bootstrap` is unavailable.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /appState/main | none | documented-only |
| PUT | /appState/main | id, backendLoaded | documented-only |

## AI Home And Logs

AI home paths are defined in `src/services/aiApi.js`; manager fallback paths are defined in `src/services/managerApi.js`.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /workspace/ai/settings | none | smoke-live |
| POST | /workspace/ai/chat | scope, message, messages, context | smoke-live |
| GET | /workspace/ai/logs | page, pageSize, keyword, status, scope | covered-by-domain-smoke |
| GET | /manager/ai/config | page, pageSize, keyword, status, scope | covered-by-domain-smoke |
| GET | /manager/ai/logs | page, pageSize, keyword, status, scope | covered-by-domain-smoke |
| GET | /admin/ai/config | none | covered-by-domain-smoke |
| PATCH | /admin/ai/config | enabled, modelId, webSearchEnabled, knowledgeScopes, openingTemplate | covered-by-domain-smoke |
| GET | /admin/ai/models | none | covered-by-domain-smoke |
| GET | /admin/ai/usage-logs | page, pageSize, keyword, status, scope | covered-by-domain-smoke |
| GET | /admin/ai/documents | page, pageSize, keyword, status, scope | covered-by-domain-smoke |
| POST | /admin/ai/documents | title, content, scope, scopeTargetId, scopeTargetName, status | covered-by-domain-smoke |
| PATCH | /admin/ai/documents/:documentId | title, content, scope, scopeTargetId, scopeTargetName, status | covered-by-domain-smoke |
| DELETE | /admin/ai/documents/:documentId | confirm, reason | covered-by-domain-smoke |

## Resource And HR Workspace

Resource paths are defined in `src/services/resourceApi.js` and used by the resource/personnel workspace views.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /workspace/resources | scope, department, includeArchived, status | smoke-live |
| GET | /workspace/workload | startDate, endDate, projectId, userId | smoke-live |
| POST | /workspace/assignments/preview | workItemId, assigneeId, startDate, endDate | covered-by-domain-smoke |
| POST | /workspace/assignments/confirm | previewId | covered-by-domain-smoke |
| POST | /workspace/assignments/force-confirm | previewId, reason | covered-by-domain-smoke |
| POST | /workspace/resources/ai/assignment-advice | taskUid, candidates, context | smoke-live |
| PATCH | /workspace/resources/work-items/:workItemId/schedule | workItemId, startDate, endDate, assigneeId | smoke-live |

## Admin Console

Admin console paths are defined in `src/services/adminApi.js`.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /admin/dashboard | page, pageSize, keyword | covered-by-domain-smoke |
| GET | /admin/users | page, pageSize, keyword, status, role | covered-by-domain-smoke |
| POST | /admin/users | username, name, role, department, status | covered-by-domain-smoke |
| GET | /admin/users/:userId | none | covered-by-domain-smoke |
| PATCH | /admin/users/:userId | name, role, department, status | covered-by-domain-smoke |
| DELETE | /admin/users/:userId | soft, reason | covered-by-domain-smoke |
| GET | /admin/permissions | page, pageSize, keyword | covered-by-domain-smoke |
| PATCH | /admin/permissions | role, permissions | covered-by-domain-smoke |
| GET | /admin/projects | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/projects | name, owner, members, status | covered-by-domain-smoke |
| GET | /admin/projects/:projectId | none | covered-by-domain-smoke |
| PATCH | /admin/projects/:projectId | name, owner, members, status | covered-by-domain-smoke |
| POST | /admin/projects/:projectId/archive | status, reason | covered-by-domain-smoke |
| DELETE | /admin/projects/:projectId | soft, reason | covered-by-domain-smoke |
| GET | /admin/tasks | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/tasks | title, projectId, owner, status | covered-by-domain-smoke |
| PATCH | /admin/tasks/:taskId | title, owner, status | covered-by-domain-smoke |
| DELETE | /admin/tasks/:taskId | soft, reason | covered-by-domain-smoke |
| GET | /admin/comments/risk | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/comments/:commentId/resolve | reason | covered-by-domain-smoke |
| GET | /admin/schedules | page, pageSize, projectId, status | covered-by-domain-smoke |
| GET | /admin/boards | page, pageSize, projectId, status | covered-by-domain-smoke |
| PATCH | /admin/boards/:boardId | title, status, visibility | covered-by-domain-smoke |
| DELETE | /admin/boards/:boardId | soft, reason | covered-by-domain-smoke |
| GET | /admin/templates | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/templates | title, template, visibility, status | covered-by-domain-smoke |
| PATCH | /admin/templates/:templateId | title, template, visibility, status | covered-by-domain-smoke |
| DELETE | /admin/templates/:templateId | soft, reason | covered-by-domain-smoke |
| GET | /admin/tags | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/tags | name, color, status | covered-by-domain-smoke |
| DELETE | /admin/tags/:tagId | soft, reason | covered-by-domain-smoke |
| GET | /admin/notices | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/notices | title, content, status | covered-by-domain-smoke |
| PATCH | /admin/notices/:noticeId | title, content, status | covered-by-domain-smoke |
| DELETE | /admin/notices/:noticeId | reason | covered-by-domain-smoke |
| GET | /workspace/notices/carousel | active announcements | covered-by-domain-smoke |
| GET | /admin/departments | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/departments | name, parentId, status | covered-by-domain-smoke |
| PATCH | /admin/departments/:departmentId | name, parentId, status | covered-by-domain-smoke |
| DELETE | /admin/departments/:departmentId | soft, reason | covered-by-domain-smoke |
| GET | /admin/archives | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /admin/archives/:archiveId/restore | reason | covered-by-domain-smoke |
| DELETE | /admin/archives/:archiveId | reason | covered-by-domain-smoke |
| GET | /admin/system/status | none | covered-by-domain-smoke |
| GET | /admin/audit-logs | page, pageSize, keyword, status | covered-by-domain-smoke |

## Manager Console

Manager console paths are defined in `src/services/managerApi.js`.

| Method | Path | Key fields | Smoke policy |
| --- | --- | --- | --- |
| GET | /manager/overview | page, pageSize, keyword | covered-by-domain-smoke |
| GET | /manager/departments/:departmentId | departmentId | covered-by-domain-smoke |
| GET | /manager/members | page, pageSize, keyword, status | covered-by-domain-smoke |
| GET | /manager/members/:userId | none | covered-by-domain-smoke |
| PATCH | /manager/members/:userId | name, role, department, status | covered-by-domain-smoke |
| POST | /manager/members/:userId/reset-password | reason | covered-by-domain-smoke |
| GET | /manager/projects | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /manager/projects | name, owner, members, status | covered-by-domain-smoke |
| GET | /manager/projects/:projectId | none | covered-by-domain-smoke |
| PATCH | /manager/projects/:projectId | name, owner, members, status | covered-by-domain-smoke |
| POST | /manager/projects/:projectId/archive | status, reason | covered-by-domain-smoke |
| DELETE | /manager/projects/:projectId | soft, reason | covered-by-domain-smoke |
| GET | /manager/projects/:projectId/tasks | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /manager/projects/:projectId/tasks | title, owner, status | covered-by-domain-smoke |
| PATCH | /manager/tasks/:taskId | title, owner, status | covered-by-domain-smoke |
| DELETE | /manager/tasks/:taskId | soft, reason | covered-by-domain-smoke |
| GET | /manager/projects/:projectId/comments | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /manager/comments/:commentId/resolve | reason | covered-by-domain-smoke |
| GET | /manager/projects/:projectId/schedule | none | covered-by-domain-smoke |
| POST | /manager/projects/:projectId/schedule/export | format | covered-by-domain-smoke |
| GET | /manager/projects/:projectId/members | page, pageSize, keyword, status | covered-by-domain-smoke |
| PATCH | /manager/projects/:projectId/members/:userId | role, permission | covered-by-domain-smoke |
| GET | /manager/projects/:projectId/boards | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /manager/projects/:projectId/boards | title, elements, appState, files | covered-by-domain-smoke |
| PATCH | /manager/projects/:projectId/boards/:boardId | title, elements, appState, files | covered-by-domain-smoke |
| GET | /manager/projects/:projectId/templates | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /manager/projects/:projectId/templates | title, template, visibility | covered-by-domain-smoke |
| GET | /manager/projects/:projectId/tags-archives | page, pageSize, keyword, status | covered-by-domain-smoke |
| POST | /manager/projects/:projectId/tags | name, color, status | covered-by-domain-smoke |
| POST | /manager/projects/:projectId/tags/:tagId/archive | reason | covered-by-domain-smoke |
| GET | /manager/accounts | page, pageSize, keyword, status | covered-by-domain-smoke |

## Coverage Notes

- Backend route coverage is provided by `src/routes/*.routes.js` plus mounted module routes under `src/modules/*/*.routes.js`.
- `src/app.js` mounts routes both at `/api` and at the root path for compatibility.
- All workspace, board, schedule, admin, manager, AI, HR/resource, template, and app-state paths require `Authorization: Bearer <token>` unless documented as public auth bootstrap.
- MySQL-backed workspace, board, and schedule endpoints must return `503` rather than silently passing production verification on fallback data.
- `smoke-live` means `npm run smoke:frontend-contract` must contain a direct real HTTP check for that path family.
- `smoke-lifecycle` means `npm run smoke:frontend-contract` exercises the path as setup or cleanup around another live assertion.
- `covered-by-domain-smoke` means an existing domain smoke script owns that route in detail.
- `documented-only` means the route is frozen for compatibility and documented, but not part of destructive/live smoke subset.
- `documented-only` means the route is frozen for compatibility but is not part of the destructive/live smoke subset.
