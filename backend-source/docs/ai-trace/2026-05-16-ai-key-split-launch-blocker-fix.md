# 2026-05-16 AI Key Split Launch Blocker Fix

## Scope
- Backend AI settings now expose separate redacted booleans for home and HR DeepSeek configuration.
- Workspace chat and home-assistant use the home key path; HR assignment advice uses the HR key path. Both keep the legacy key as fallback compatibility.
- Missing AI key configuration now fails fast with HTTP 503 instead of being hidden behind local fallback.
- Supplier/network failures still fall back locally where the existing product contract already expected graceful degradation.

## Files
- `src/modules/ai/ai.service.js`
- `src/modules/hr/hr.service.js`
- `scripts/smoke-ai-deepseek.mjs`
- `test/ai-trace-contract.test.js`
- `test/hr-contract.test.js`
- `test/smoke-ai-deepseek-script.test.js`

## Security Notes
- No DeepSeek key values were written to this document, tests, logs, or script output.
- Responses expose only booleans such as `homeConfigured` and `hrConfigured` plus `keyStatus`.
- Smoke output redacts secret-looking values before printing failure details.

## Validation
- `node --check scripts/smoke-ai-deepseek.mjs`
- `node --check src/modules/ai/ai.service.js`
- `node --check src/modules/hr/hr.service.js`
- `node --test test/ai-trace-contract.test.js test/hr-contract.test.js test/smoke-ai-deepseek-script.test.js`
