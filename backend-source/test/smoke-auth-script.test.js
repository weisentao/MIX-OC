import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("package exposes real user auth smoke script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts?.["smoke:auth"], "node scripts/smoke-auth.mjs");
  assert.equal(pkg.scripts?.["smoke:auth-flows"], "node scripts/smoke-auth-flows.mjs");
});

test("auth smoke verifies admin and multiple real users without DB writes", async () => {
  const text = await readFile("scripts/smoke-auth.mjs", "utf8");

  assert.match(text, /REAL_USER_DEFAULT_PASSWORD/);
  assert.match(text, /MIX801002/);
  assert.match(text, /MIX-zhengjianxing/);
  assert.match(text, /MIX-chenlingfeng/);
  assert.match(text, /MIX-linxin/);
  assert.match(text, /assertNotAdminRole/);
  assert.match(text, /assertRole\("admin role"[\s\S]*"admin"/);
  assert.match(text, /requestJson\("\/login"/);
  assert.match(text, /requestJson\("\/me"/);
  assert.match(text, /const ADMIN_PASS = process\.env\.SMOKE_ADMIN_PASS \|\| "admin"/);
  assert.doesNotMatch(text, /ADMIN_INITIAL_PASSWORD/);
  assert.doesNotMatch(text, /\bmethod:\s*"POST"[\s\S]*\/register/);
  assert.doesNotMatch(text, /\bmethod:\s*"DELETE"/);
  assert.doesNotMatch(text, /\bmethod:\s*"PUT"/);
  assert.doesNotMatch(text, /mysqlPool\.execute|mysql\.createConnection|UPDATE users|INSERT INTO users|DELETE FROM users/i);
});
