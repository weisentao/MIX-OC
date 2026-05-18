# 2026-05-17 Worker-A Admin announcements e2e fix

## 目标

Fix the admin announcement create flow so new announcements do not overwrite the selected row, submit cannot be double-clicked while saving, successful creates close/reset the modal, and announcement link fields continue to flow to the top carousel.

## 分工

- Worker-A touched only admin announcement frontend/service tests plus this trace record.
- Backend announcement CRUD, MySQL schema, and workspace carousel reads were inspected and left unchanged because they already use the shared `carousel_notices` table and expose link fields.
- No UI style changes were made.

## 根因

- `AdminConsoleView.vue` normalized notice create payloads with `selectedRow.value?.id`, so when a row was selected and the user clicked “新增公告”, the optimistic local upsert reused that row id and replaced the existing notice.
- The create API payload could carry the local optimistic id as `noticeId`, preventing the backend from always allocating a fresh canonical `notice_uid`.
- The modal submit button had no in-flight guard, so repeated clicks could send duplicate POST requests and keep stale create state visible.

## 文件

- Modified `frontend-source/src/views/AdminConsoleView.vue`: added submit in-flight guard, create-vs-edit id separation, modal close/reset after successful save, and pass-through submit state.
- Modified `frontend-source/src/services/adminApi.js`: added `omitNoticeId` support and made `createNotice` omit local ids by default so the backend creates a new record.
- Modified `frontend-source/src/services/__tests__/adminApi.test.js`: added regression coverage for omitting optimistic ids in create payloads.
- Added `frontend-source/src/features/management-console/__tests__/adminConsoleNoticeSubmit.test.js`: locks the create flow against reusing selected ids and verifies submit disabling contract.

## 验证

- Red tests were observed before implementation:
  - `node-v24.15.0-win-x64\node.exe --test src/services/__tests__/adminApi.test.js`
  - `node-v24.15.0-win-x64\node.exe --test src/features/management-console/__tests__/adminConsoleNoticeSubmit.test.js`
- Passed targeted frontend announcement tests:
  - `node-v24.15.0-win-x64\node.exe --test src/services/__tests__/adminApi.test.js src/features/management-console/__tests__/adminConsoleData.test.js src/features/management-console/__tests__/adminConsoleNoticeSubmit.test.js src/utils/__tests__/noticeCarousel.test.js`
  - Result: 9 passed, 0 failed.
- Passed backend announcement contract:
  - `node-v24.15.0-win-x64\node.exe --test test/announcement-contract.test.js`
  - Result: 5 passed, 0 failed.

## 仍需整合

- Full multi-worker browser QA should verify the live admin notice modal and top carousel after all workers finish merging their changes.
- The system `node.exe` from the Codex app path returned Access denied in this workspace; validation used the project runtime Node at `C:/Users/pveadmin/Desktop/mutou/.runtime/node/node-v24.15.0-win-x64/node.exe`.
