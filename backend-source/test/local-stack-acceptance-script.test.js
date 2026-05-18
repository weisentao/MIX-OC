import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const scriptPath = new URL("../scripts/local-stack-acceptance.ps1", import.meta.url);

test("local stack acceptance script exists and targets fixed ports", async () => {
  const text = await readFile(scriptPath, "utf8");

  assert.match(text, /3306/);
  assert.match(text, /13001/);
  assert.match(text, /15173/);
  assert.match(text, /portable-mysql\.ps1/);
  assert.match(text, /start-production\.mjs/);
  assert.match(text, /npm\.cmd/);
});

test("local stack acceptance script verifies health and frontend proxy", async () => {
  const text = await readFile(scriptPath, "utf8");

  assert.match(text, /\/health/);
  assert.match(text, /\/api\/health/);
  assert.match(text, /\$BackendHost = "127\.0\.0\.1"/);
  assert.match(text, /\$FrontendHost = "127\.0\.0\.1"/);
  assert.match(text, /\$BackendPort = 13001/);
  assert.match(text, /\$FrontendPort = 15173/);
  assert.match(text, /Frontend root OK/);
});

test("local stack acceptance script runs real proxy and production smoke gates", async () => {
  const text = await readFile(scriptPath, "utf8");

  assert.match(text, /smoke-local-proxy-acceptance\.mjs/);
  assert.match(text, /verify-production-ready\.mjs/);
  assert.match(text, /frontend proxy business smoke/);
  assert.match(text, /backend production-ready gate/);
  assert.match(text, /SMOKE_BASE_URL/);
  assert.match(text, /SMOKE_API_PREFIX/);
  assert.match(text, /15173/);
  assert.match(text, /13001/);
});

test("local stack acceptance script stays non-destructive", async () => {
  const text = await readFile(scriptPath, "utf8");

  assert.doesNotMatch(text, /Remove-Item/i);
  assert.doesNotMatch(text, /Stop-Process/i);
  assert.doesNotMatch(text, /taskkill/i);
  assert.doesNotMatch(text, /truncate/i);
  assert.doesNotMatch(text, /drop\s+database/i);
});
