import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("package exposes local proxy acceptance smoke script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts?.["smoke:local-proxy-acceptance"], "node scripts/smoke-local-proxy-acceptance.mjs");
});

test("local proxy acceptance smoke covers proxy auth, contract, and AI gates", async () => {
  const script = await readFile("scripts/smoke-local-proxy-acceptance.mjs", "utf8");

  assert.match(script, /15173/);
  assert.match(script, /127\.0\.0\.1/);
  assert.match(script, /\/api/);
  assert.match(script, /smoke:auth-flows/);
  assert.match(script, /smoke:frontend-contract/);
  assert.match(script, /smoke:ai-deepseek/);
  assert.match(script, /proxy admin dashboard/);
  assert.match(script, /proxy manager overview/);
  assert.match(script, /frontend proxy auth\/register\/reset\/change-password smoke failed/i);
  assert.match(script, /frontend proxy contract smoke failed/i);
  assert.match(script, /frontend proxy DeepSeek AI smoke failed/i);
  assert.match(script, /LOCAL_PROXY_ACCEPTANCE_PASS/);
});

test("local proxy acceptance forwards SMOKE_BASE_URL and SMOKE_API_PREFIX to child smokes", async () => {
  const script = await readFile("scripts/smoke-local-proxy-acceptance.mjs", "utf8");

  assert.match(script, /SMOKE_BASE_URL/);
  assert.match(script, /SMOKE_API_PREFIX/);
  assert.match(script, /FRONTEND_PORT/);
  assert.match(script, /FRONTEND_HOST/);
  assert.match(script, /process\.execPath/);
});

test("local proxy acceptance classifies admin and manager write errors instead of treating them as success", async () => {
  const script = await readFile("scripts/smoke-local-proxy-acceptance.mjs", "utf8");

  assert.match(script, /RESULT_CODES/);
  assert.match(script, /VALIDATION_FAILURE/);
  assert.match(script, /AUTH_FAILURE/);
  assert.match(script, /classifyWriteResponse/);
  assert.match(script, /proxy admin AI config write/);
  assert.match(script, /proxy admin AI config sensitive key rejected/);
  assert.match(script, /proxy manager member role write/);
  assert.match(script, /proxy manager member role invalid admin rejected/);
  assert.match(script, /pendingAdminReview === true/);
  assert.match(script, /response\.status === 400/);
  assert.doesNotMatch(script, /sk-[A-Za-z0-9_-]{16,}/, "must not embed a real DeepSeek key");
});
