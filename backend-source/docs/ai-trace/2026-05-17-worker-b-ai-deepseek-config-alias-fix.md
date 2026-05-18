# 2026-05-17 Worker-B AI / DeepSeek config alias fix

## 目标

Fix the backend AI admin configuration path so the management console can save separate Home and HR DeepSeek keys, keep responses/logs redacted, and let Home AI / HR advice pick the correct runtime scope without a restart.

## 分工

- Worker-B touched only AI/admin config scope: `src/modules/ai/**`, AI/admin tests, and this trace record.
- HR module was read-only for diagnosis because `/workspace/resources/ai/assignment-advice` is implemented there and already reads `DEEPSEEK_HR_API_KEY` from process env.
- Frontend was read-only. The management console sends `homeApiKey` and `hrApiKey`; backend now accepts those aliases without frontend edits.

## 文件

- Modified `src/modules/ai/ai.service.js`: added safe payload aliases `homeApiKey` / `hrApiKey`, maps them to canonical JSON fields `homeDeepSeekApiKey` / `hrDeepSeekApiKey`, keeps generic secret fields rejected, and continues to sync `DEEPSEEK_HOME_API_KEY` / `DEEPSEEK_HR_API_KEY` in process env.
- Modified `test/ai-trace-contract.test.js`: added regression coverage for frontend aliases, scoped chat after alias save, plaintext redaction, scope fields, and runtime key selection.
- Modified `test/admin-contract.test.js`: added admin contract coverage that alias saves are persisted under canonical scoped fields and never echoed plaintext.
- No real DeepSeek key, bearer token, password, or user-provided secret was written to source, docs, tests, or frontend files.

## 接口

- `PATCH /admin/ai/config` now accepts these scoped key input fields:
  - Canonical: `homeDeepSeekApiKey`, `hrDeepSeekApiKey`.
  - Frontend aliases: `homeApiKey`, `hrApiKey`.
- `GET /admin/ai/config`, `PATCH /admin/ai/config`, and `GET /workspace/ai/settings` still return only status/masked fields such as `configured`, `apiKeyConfigured`, `homeApiKeyConfigured`, `hrApiKeyConfigured`, `homeMasked`, `hrMasked`, and `keyStatus`.
- `POST /workspace/ai/chat` and `/workspace/ai/home-assistant` continue to use Home key precedence: saved `homeDeepSeekApiKey` → `DEEPSEEK_HOME_API_KEY` → `DEEPSEEK_API_KEY`.
- `/workspace/resources/ai/assignment-advice` continues to use HR key precedence through process env after admin save: saved `hrDeepSeekApiKey` syncs to `DEEPSEEK_HR_API_KEY`, then HR falls back to `DEEPSEEK_API_KEY`.

## 验证

- Passed syntax checks:
  - `node --check src/modules/ai/ai.service.js`
  - `node --check test/ai-trace-contract.test.js`
  - `node --check test/admin-contract.test.js`
- Passed targeted AI/admin contract tests:
  - `node --test --test-reporter=spec test\ai-trace-contract.test.js test\admin-contract.test.js`
  - Result: 50 passed, 0 failed.
- Broader probe including `test/hr-contract.test.js` showed 62 passed / 3 failed. The failures were in existing HR contract areas outside Worker-B write scope: nested assignment payload alias normalization, force assignment preview selection, and a string-contract expectation for `aiError`.

## 风险

- The backend still stores scoped keys in the existing AI JSON config store; deployment should protect `AI_DATA_DIR` like a secret store.
- Full HR contract suite remains blocked by unrelated HR failures outside this task scope; Worker-B did not modify HR files.
- If another worker changes frontend AI form field names again, backend should either add a scoped alias or the frontend service should keep normalizing to `homeApiKey` / `hrApiKey`.
