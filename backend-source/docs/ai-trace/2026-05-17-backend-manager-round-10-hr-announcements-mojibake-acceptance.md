# 2026-05-17 Backend Manager Round 10 - HR, Announcements, Mojibake Acceptance

## Scope

This round coordinated parallel backend and frontend fixes for launch-blocking issues reported from the running local app:

- Completed tasks can be moved back to unfinished tasks.
- HR assignment advice, apply, and confirm flows must reach the backend and persist.
- Admin AI config can save separate Home and HR DeepSeek keys without exposing plaintext.
- Admin announcements support CRUD, optional link text, link URL, link target, and active carousel consumption.
- Top carousel consumes backend announcements and renders clickable inline notice links.
- Contacts support favorite/unfavorite, and profile email can be edited and synced.
- Schedule row overflow menus render fully outside scroll clipping.
- Visible mojibake in schedule, HR, home assistant, templates, and fallback data is removed.
- Backend trace and contract docs are updated for follow-up agents.

## Agent Dispatch

- Worker A/B fixed completed-task rollback across frontend store and backend schedule/workspace sync.
- Worker C/D fixed scoped DeepSeek key persistence and admin AI config UI.
- Worker E/F/N/J fixed HR assignment preview, apply, confirm, payload aliasing, and schedule/task sync.
- Worker G fixed contacts favorite CRUD and profile email sync.
- Worker H/O handled schedule row overflow menu positioning and portal behavior.
- Worker I/P/R fixed ResourceView/HomeDashboard/resource test mojibake and added regression scans.
- Worker K/L/M implemented admin announcement backend, admin UI, and top/home carousel consumption.
- Browser QA agents validated port health, AI endpoints, schedule menu behavior, and surfaced remaining blockers.

## Backend Changes

- `src/modules/hr/hr.service.js`
  - Normalizes nested ResourceAssignmentDrawer confirm payloads.
  - Preserves schedule/task id priority over drifted work item ids.
  - Keeps DeepSeek HR advice fallback and scoped resource snapshots.
  - Creates schedule/task records for assignment confirmations that do not start with existing linked work items.
- `src/modules/ai/ai.service.js`
  - Allows scoped `homeDeepSeekApiKey` and `hrDeepSeekApiKey` through admin config writes.
  - Continues rejecting unrelated secret fields and never echoes plaintext keys.
- `src/modules/admin/*`, `src/services/workspace.service.js`, `src/controllers/workspace.controller.js`
  - Adds admin notice CRUD and workspace carousel notice reads.
  - Sanitizes scripts and validates notice links.
- `src/db/schema.sql`, `src/db/mysql.js`, `src/db/migrations/20260517_001_announcement_links.sql`
  - Adds announcement link/status/priority/window fields.
- `src/services/template.service.js`
  - Cleans default template labels to avoid mojibake in visible tree nodes.

## Frontend Changes

- `src/stores/workspace/actions/taskActions.js`
  - Removes the block that prevented archived/completed tasks from moving back to active.
- `src/features/resource/components/ResourceView.vue`
  - Fixes mojibake syntax breakages.
  - Applies AI candidates through assignment preview.
  - Closes the AI drawer after candidate apply so the confirm drawer can receive clicks.
  - Syncs returned schedule items/tasks into local workspace state after confirm.
- `src/features/resource/components/ResourceAssignmentDrawer.vue`
  - Emits the currently selected candidate when confirming.
- `src/components/schedule/ScheduleFixedTable.vue`, `src/styles/base.css`
  - Renders row context menus through `Teleport` with measured viewport positioning.
- `src/views/AdminConsoleView.vue`, `src/services/adminApi.js`
  - Adds announcement management with link fields and sync status.
  - Adds Home and HR DeepSeek key fields without local secret storage.
- `src/views/WorkspaceView.vue`
  - Makes backend management navigation use same-page routing instead of an unstable detached entry.
- `src/services/http.js`, `src/services/auth.js`
  - Prevents mock/demo/local tokens from being sent to backend APIs.
  - Persists real backend login/register JWTs before the next business request.
- `src/utils/noticeCarousel.js`, `src/components/layout/NoticeInlineContent.vue`, `src/components/layout/WorkbenchHeader.vue`, `src/views/HomeDashboard.vue`
  - Normalizes backend carousel notices and renders clickable inline notice links.

## Verification

Commands run with the bundled runtime Node because the shell `node` shim resolves to a blocked WindowsApps entry.

Backend targeted contract suite:

```powershell
& 'C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe' --test test/announcement-contract.test.js test/admin-contract.test.js test/workspace-bootstrap-contract.test.js test/hr-contract.test.js test/workspace-task-payload-contract.test.js test/schedule-contract.test.js
```

Result: 84 pass, 0 fail.

Frontend targeted contract suite:

```powershell
& 'C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe' --test src/components/layout/__tests__/reviewUiSource.test.js src/features/resource/__tests__/resourceModel.test.js src/features/resource/__tests__/resourceViewInteractionSource.test.js src/stores/workspace/actions/__tests__/taskActions.test.js src/services/__tests__/adminApi.test.js src/services/__tests__/aiApi.test.js src/services/__tests__/workspaceApi.test.js src/services/__tests__/auth.test.js src/utils/__tests__/noticeCarousel.test.js
```

Result: 116 pass, 0 fail.

Frontend production build:

```powershell
& 'C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe' node_modules/vite/bin/vite.js build
```

Result: build completed successfully. Warnings are existing bundle-size and third-party directive/chunking warnings.

Local service checks:

- `http://127.0.0.1:13001/health` returned HTTP 200.
- `http://127.0.0.1:15173/` returned HTTP 200.

## Current Notes

- Browser QA previously confirmed Home and HR DeepSeek endpoints returned successful backend responses before the final UI fixes.
- Browser QA previously confirmed the schedule row menu was visible and the edit action opened the edit dialog after the portal fix.
- Final browser QA was launched after all tests passed and should be used to verify the live 15173 UI state for announcements, HR confirm persistence, menu visibility, and no Vite overlay.
- The current repository root is not a Git repository, so no git diff or commit was created in this round.
