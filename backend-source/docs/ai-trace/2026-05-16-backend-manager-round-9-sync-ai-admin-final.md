# Backend Manager Round 9 - Sync, AI, Admin Final Verification

Date: 2026-05-16
Owner: backend-manager
Workspace: C:\Users\pveadmin\Desktop\mutou\第一版源代码

## Scope

- Fix frontend/backend sync failures that showed "saved locally, backend sync failed".
- Restore DeepSeek AI availability for home assistant and HR assignment advice.
- Restore admin/manager AI management endpoints.
- Keep UI unchanged; frontend edits were limited to API/state synchronization logic.
- Keep DeepSeek keys backend-only and never expose key material to frontend code or logs.

## Subagent Dispatch

- A / Euler: `frontend-source/src/services/workspaceApi.js` project path validation.
- B / Tesla: `frontend-source/src/stores/workspace/actions/taskActions.js` task sync id guards.
- C / Copernicus: backend DeepSeek split-key configuration and model aliases.
- E / Faraday: browser/log verification for sync and AI behavior.
- F / Avicenna: AI upstream error contract repair.
- G / Volta: HR schedule/task sync id priority repair.
- I / Locke: AI route mount order before broad admin/manager gates.
- J / Averroes: admin assignable role alias normalization.

Long-running subagents without final deliverables were closed and replaced with narrower tasks.

## Changes

- `frontend-source/src/services/workspaceApi.js`
  - Rejects reserved project path values such as `schedule`, `tasks`, `undefined`, and `null`.
  - Rejects task/board/template-like objects before building project-scoped task or board URLs.
  - Prevents malformed calls such as `/workspace/projects/schedule` and `/workspace/projects/tasks`.

- `frontend-source/src/stores/workspace/actions/taskActions.js`
  - Stops background sync when project or task API ids are missing.
  - Prevents local-only tasks from sending update/comment/delete calls that become backend sync failure toasts.
  - Uses backend task ids for follow-up updates after create sync succeeds.

- `backend-source/src/config/env.js`
  - Tracks separate DeepSeek key status for home AI and HR AI.

- `backend-source/src/modules/ai/ai.service.js`
  - Supports `DEEPSEEK_HOME_API_KEY` with legacy `DEEPSEEK_API_KEY` fallback.
  - Supports `deepseek-fourth-flash` and `deepseek-fourth-pro` frontend aliases.
  - Returns stable 503 upstream errors without leaking secrets.
  - Keeps public config key status booleans without returning key material.

- `backend-source/src/modules/hr/hr.service.js`
  - Uses `DEEPSEEK_HR_API_KEY` with legacy `DEEPSEEK_API_KEY` fallback for HR assignment advice.
  - Prioritizes `scheduleItemId`, then `itemId` / `itemUid`, then work item id when patching schedule links.

- `backend-source/src/routes/index.js`
  - Mounts AI routes before broad admin and manager route gates so `/admin/ai/*` and `/manager/ai/*` reach the AI handlers.

- `backend-source/src/modules/admin/admin.service.js`
  - Normalizes frontend-safe role aliases:
    - `super_admin` -> `admin`
    - `project_manager`, `department_manager`, `department_admin` -> `manager`
    - `user`, `editor`, `readonly` -> `employee`
  - Keeps assignable roles constrained to `admin`, `manager`, and `employee`.

## Verification

- Runtime stack:
  - Backend `13001` listening.
  - Frontend `15173` listening.
  - MySQL `3306` listening and connected.

- Frontend sync tests:
  - Command: `C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe --test frontend-source/src/services/__tests__/workspaceApi.test.js frontend-source/src/stores/workspace/actions/__tests__/taskActions.test.js frontend-source/src/services/__tests__/scheduleApi.test.js frontend-source/src/stores/workspace/actions/__tests__/scheduleActions.test.js`
  - Result: `75 pass / 0 fail`.

- Backend admin/AI/HR/manager/frontend contracts:
  - Command: `C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe --test backend-source/test/admin-contract.test.js backend-source/test/manager-contract.test.js backend-source/test/frontend-api-contract.test.js backend-source/test/ai-trace-contract.test.js backend-source/test/hr-contract.test.js`
  - Result: `65 pass / 0 fail`.

- Browser verification:
  - Opened `http://127.0.0.1:15173/#/`.
  - Confirmed no visible `后端同步失败` or `本地保存`.
  - Confirmed no visible `接口暂不可用`, `AI不可用`, or `智能建议服务暂不可用`.
  - Browser console warn/error list was empty in the final check.

- Runtime log verification:
  - After the successful login round, logs showed:
    - `POST /login` -> `200`
    - `GET /workspace/ai/settings` -> `304`
    - `GET /workspace/bootstrap` -> `304`
    - `GET /workspace/projects/999001/schedule` -> `304`
    - `GET /workspace/resources?status=active` -> `200`
    - `GET /workspace/workload?...` -> `200`
    - `POST /workspace/ai/chat` -> `200`

## Notes

- Some old app logs still contain `/workspace/projects/schedule`, `/workspace/projects/tasks`, and `/workspace/schedule/items/task-1` from earlier stale frontend/runtime states. Final verification after login used the corrected project-scoped schedule path.
- The Windows PATH `node.exe` may return `Access is denied`; use `C:\Users\pveadmin\Desktop\mutou\.runtime\node\node-v24.15.0-win-x64\node.exe` for local verification.
- Existing database contents were not reset or cleared.
- DeepSeek keys remain backend-only in environment configuration.
