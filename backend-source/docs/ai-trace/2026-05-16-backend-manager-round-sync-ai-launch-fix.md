# 2026-05-16 Backend Manager Round: Sync, AI, Admin, DB Launch Fix

## Status

Final status: completed and locally verified.

This record intentionally does not contain any DeepSeek plaintext key, Bearer token, password, or secret value. AI key evidence is recorded only as variable names and boolean/configured status.

## Scope

This round fixed the launch blockers reported as:

- Frontend showing local-save / backend-sync-failed for workspace writes.
- Home AI, HR AI, and admin AI pages reporting backend unavailable.
- Admin/manager console write calls hiding backend failures as local success.
- HR assignment/schedule synchronization losing backend link fields.
- Template operations staying local instead of syncing to backend templates.
- Board save/share/version synchronization being vulnerable to stale responses and invalid share false-success.
- Production DB/auth seed scripts risking existing company users, departments, and role classifications.
- Local acceptance checks only proving health endpoints instead of real proxy business flows.

## Changed Areas

Frontend sync/error handling:

- `frontend-source/src/services/apiErrors.js`: added status-aware API/AI error classification for auth, permission, service unavailable, network, and generic sync failures.
- `frontend-source/src/stores/workspace/actions/projectActions.js`: uses status-aware backend sync messages.
- `frontend-source/src/stores/workspace/actions/taskActions.js`: prevents auth/service/network failures from being reported as successful local saves.
- `frontend-source/src/stores/workspace/actions/scheduleActions.js`: fixes schedule chat failure handling, avoids linked task false-success after schedule comment failures, and uses clearer sync errors.
- `frontend-source/src/stores/workspace/actions/boardActions.js`: sends `baseVersion/lastVersion`, ignores stale async board responses, and rolls back invalid share responses.
- `frontend-source/src/stores/workspace/actions/templateActions.js`: completes backend template CRUD/share/move sync and removes duplicate overwritten action keys.
- `frontend-source/src/stores/workspace/actions/appActions.js`: tightens offline/local fallback behavior around auth and service failures.
- `frontend-source/src/views/AdminConsoleView.vue`: admin write helper no longer reports backend failures as frontend-only success.
- `frontend-source/src/views/ManagerConsoleView.vue`: manager write helper no longer reports backend failures as frontend-only success.
- `frontend-source/src/views/HomeDashboard.vue`: home AI errors use status-aware messages.
- `frontend-source/src/features/resource/components/ResourceView.vue`: HR AI and schedule sync errors use status-aware messages; assignment draft keeps backend link fields.
- `frontend-source/src/features/resource/resourceModel.js`: preserves assignment/work item link identifiers for backend sync.
- `frontend-source/src/services/resourceApi.js`: supports schedule patch fallback identifiers.
- `frontend-source/src/services/workspaceApi.js`: exposes backend template CRUD/share APIs.
- `frontend-source/src/features/collab-board/boardModel.js`: fixes local snapshot version alignment.

Backend/API/DB:

- `backend-source/src/modules/ai/ai.service.js`: supports split home/HR DeepSeek key status and compatible model aliases.
- `backend-source/src/modules/hr/hr.service.js`: HR assignment confirmation can recover preview context and HR AI uses HR key path.
- `backend-source/src/middlewares/errorHandler.js`: preserves explicit business error codes for frontend classification.
- `backend-source/src/services/schedule.service.js`: schedule comments align with the intended permission model.
- `backend-source/src/services/template.service.js`: keeps template response compatibility for frontend IDs.
- `backend-source/src/db/mysql.js`: seed behavior is additive and does not overwrite existing real company users.
- `backend-source/src/controllers/auth.controller.js`: auth department lookup handles legacy slash-separated department strings; production DB unavailable still blocks memory auth fallback.
- `backend-source/scripts/prepare-production-db.mjs`: production prepare is additive by default and does not reset real business data without explicit dangerous confirmation.
- `backend-source/scripts/import-company-users.mjs`: company import is additive and preserves existing user classification/roles.
- `backend-source/scripts/check-production-mysql.mjs`: production DB check handles primary department mapping.

Verification and smoke scripts:

- `backend-source/scripts/local-stack-acceptance.ps1`: now runs real frontend proxy business smoke and backend production gate, not only health checks.
- `backend-source/scripts/smoke-local-proxy-acceptance.mjs`: verifies auth/register, frontend contract, AI, admin, and manager write classifications through `15173/api`; loads backend `.env` for configured admin smoke credentials.
- `backend-source/scripts/verify-production-ready.mjs`: includes schedule, board, frontend contract, and DeepSeek AI gates in release order.
- `backend-source/scripts/smoke-ai-deepseek.mjs`: covers workspace AI, home assistant alias, HR assignment advice, and admin AI endpoints with deterministic classifications.

## Verification Results

Frontend unit/source checks:

- Command: `node --test frontend-source/src/stores/workspace/actions/__tests__/taskActions.test.js frontend-source/src/stores/workspace/actions/__tests__/scheduleActions.test.js frontend-source/src/stores/workspace/actions/__tests__/templateTaskActions.test.js frontend-source/src/stores/workspace/actions/__tests__/boardActionsSource.test.js frontend-source/src/services/__tests__/workspaceApi.test.js`
- Result: pass `70/70`.

Backend DB/auth/safety checks:

- Command: from `backend-source`, `node --test test/import-company-users-script.test.js test/prepare-production-db-safety.test.js test/check-production-mysql-script.test.js test/auth-register-contract.test.js test/mysql-seed-preservation.test.js test/production-gates-error-handler.test.js`
- Result: pass `27/27`.

Backend acceptance script checks:

- Command: from `backend-source`, `node --test test/local-stack-acceptance-script.test.js test/smoke-local-proxy-acceptance-script.test.js test/verify-production-ready-script.test.js test/production-smoke-contract.test.js`
- Result: pass `21/21`.

AI smoke tests:

- Command: from `backend-source`, `node --test test/smoke-ai-deepseek-script.test.js test/ai-trace-contract.test.js`
- Result: pass `25/25`.
- Command: from `backend-source`, `node scripts/smoke-ai-deepseek.mjs`
- Result: `smoke-ai-deepseek: PASSED`.
- Key evidence: unauthorized AI calls classify as `AUTH_FAILURE`; authorized home chat and home assistant return `NORMAL_RESPONSE` with `source=deepseek`; HR assignment advice returns `NORMAL_RESPONSE`; admin AI config/models/logs/documents return `NORMAL_RESPONSE`. `homeConfigured=true` and `hrConfigured=true` were observed without exposing key material.

Local stack and real proxy acceptance:

- Command: from `backend-source`, `powershell -ExecutionPolicy Bypass -File .\\scripts\\local-stack-acceptance.ps1 -Action check`
- Result: PASS.
- Ports verified: MySQL `3306`, backend `13001`, frontend `15173`.
- Frontend proxy business smoke through `http://127.0.0.1:15173/api`: PASS.
- Backend production-ready gate: `PRODUCTION_READY_CHECK_PASS`.
- Real proxy covered: register/login/forgot/change password, workspace bootstrap, project/task CRUD, board create/update/history, schedule item/comment/snapshot/export, template listing, resources/workload, HR AI advice, home AI chat, admin AI config, admin dashboard/users, manager overview/accounts, admin/manager write classification.

Production DB readiness evidence:

- MySQL check target: `xjg_app@127.0.0.1:3306/xjg`.
- Result: PASS.
- Observed seed summary: 73 total users, 72 real users, 7 departments, missingDepartment=0, roles include admin/manager/employee.

## Remaining Risk

- Full frontend build was not run in this round; targeted frontend action/source tests and real proxy smoke passed.
- The board stale-response guard is covered by source contract tests and backend smoke covers board create/update/history; it is not yet covered by a browser-level race test.
- Production prepare/import now preserve existing users and classifications by default; intentionally incorrect existing records are not auto-corrected.

## Handoff Notes

- Use `backend-source/scripts/local-stack-acceptance.ps1 -Action check` as the first local acceptance command before manual QA.
- Do not paste or commit DeepSeek keys. Keep using `DEEPSEEK_HOME_API_KEY`, `DEEPSEEK_HR_API_KEY`, and optionally legacy `DEEPSEEK_API_KEY` as environment variables only.
- If a future frontend screen still shows a local-save fallback, first check the HTTP status in the browser/network panel: 401/403 means login/permission, 503 means backend/DB service, and network errors mean local stack/proxy connectivity.
