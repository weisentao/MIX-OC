# 2026-05-17 Backend Manager Round 11 Local Launch Acceptance

## Scope
- Fixed backend/frontend sync failures reported as "saved locally, backend sync failed" across task flow, schedule, board, HR, admin, and AI paths.
- Validated local launch with MySQL, backend, frontend, production gates, and in-app browser.
- Coordinated subagents for AI config, announcements, task drag-back, board sharing, contact care relation, mojibake cleanup, and smoke validation.

## Root Causes
1. Local services were not all running: MySQL/backend/frontend ports had previously been down, so frontend fell back to local state.
2. Frontend dev startup script used npm shim on Windows and hit "Access denied"; direct runtime Node + Vite worked.
3. AI runtime used stale persisted `data/ai-v1/config.json` keys before `.env` keys, causing DeepSeek `****FFFF invalid` even though `.env` had the user-provided keys.
4. Task flow used local/legacy numeric project ids as backend ids, causing incorrect sync attempts.
5. `boardActions.js` had previously been emptied and needed business action restoration for board sync/share/history.
6. Admin notices created with temporary frontend ids caused later PATCH failures.
7. Contacts care list used implicit contact presence instead of explicit `relationType=care`.
8. User-visible mojibake and test mojibake caused Vue/test failures.

## Key Changes
- AI config:
  - Environment keys now have priority over stored stale keys.
  - Admin config accepts `homeApiKey` and `hrApiKey` aliases, stores canonical scoped fields, and does not echo plaintext.
  - Reading AI settings/chat no longer rewrites process env from stored config; only explicit admin key submissions update runtime env.
- Local stack:
  - `local-stack-acceptance.ps1` starts Vite through runtime Node directly instead of npm shim.
- Task flow:
  - Completed/archived tasks can be dragged back to active/todo.
  - Project API id resolution avoids using task fallback local id as backend project id.
- Boards:
  - Restored board action coverage for list/create/open/update/delete/share/history.
  - Added sync conflict details handling and history merge after sync.
- Announcements:
  - Admin notice CRUD uses canonical backend `notice_uid` on create/update/delete.
  - Workspace carousel reads active notices with link fields.
- Contacts:
  - Care relation is explicit via `relationType=care`; bootstrap and getters filter care contacts correctly.
- Encoding/UI:
  - Fixed visible mojibake in resource/person text and broken task test string.
  - Frontend production build is green.

## Important Files
- `backend-source/src/config/aiKeys.js`
- `backend-source/src/modules/ai/ai.service.js`
- `backend-source/scripts/local-stack-acceptance.ps1`
- `backend-source/src/services/board.service.js`
- `backend-source/src/modules/admin/admin.service.js`
- `backend-source/src/services/workspace.service.js`
- `frontend-source/src/stores/workspace/actions/taskActions.js`
- `frontend-source/src/stores/workspace/actions/boardActions.js`
- `frontend-source/src/stores/workspace/actions/userActions.js`
- `frontend-source/src/views/AdminConsoleView.vue`
- `frontend-source/src/services/adminApi.js`
- `frontend-source/src/features/resource/components/ResourceView.vue`

## Verification Passed
- Frontend task flow targeted test: 17 pass / 0 fail.
- Frontend admin/workspace/board targeted tests: 21 pass / 0 fail.
- Backend AI/admin targeted tests: 51 pass / 0 fail.
- Backend AI/admin/announcement/board/error targeted tests: 72 pass / 0 fail.
- Frontend production build: passed.
- Local stack acceptance: `PRODUCTION_READY_CHECK_PASS`.
- MySQL production check: 39 tables, 73 users, 8 departments, seed roles present.
- Schedule smoke: passed.
- Board smoke: passed.
- Frontend contract smoke through backend and frontend proxy: passed.
- DeepSeek smoke: passed for `/workspace/ai/chat`, `/workspace/ai/home-assistant`, `/workspace/resources/ai/assignment-advice`, and admin AI endpoints.
- Browser plugin DOM verification on `http://127.0.0.1:15173/`:
  - Home, Schedule, Flow, Board, HR pages opened.
  - No visible `后端同步失败`, `接口暂不可用`, `AI key invalid`, or `Authentication Fails` text found.

## Running Services After Verification
- MySQL: `127.0.0.1:3306`, PID 18492.
- Backend: `127.0.0.1:13001`, PID 20696.
- Frontend: `127.0.0.1:15173`, PID 22588.

## Notes / Residual Non-Blocking Items
- Some test-only historical mojibake strings remain in `frontend-source/src/services/__tests__/auth.test.js` and `frontend-source/src/stores/workspace/actions/__tests__/scheduleActions.test.js`; runtime source scan for `frontend-source/src`/`backend-source/src` no longer shows the blocking visible strings found in this round.
- `scheduleActions.js` and `taskActions.js` still have separate project id helper implementations. Current tests and smokes pass, but future cleanup should unify this helper to avoid drift.
- Browser screenshot capture timed out through the plugin, but DOM-based browser checks succeeded and service smoke covered the data/API layer.
