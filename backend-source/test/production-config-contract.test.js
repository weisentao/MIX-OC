import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("package exposes an explicit production start script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const script = await readFile("scripts/start-production.mjs", "utf8");

  assert.equal(pkg.scripts?.["start:production"], "node scripts/start-production.mjs");
  assert.match(script, /NODE_ENV\s*=\s*"production"/);
  assert.match(script, /\.\.\/src\/server\.js/);
});

test("production env contract requires CORS origin and keeps admin password fixed", async () => {
  const envConfig = await readFile("src/config/env.js", "utf8");
  const envExample = await readFile(".env.example", "utf8");
  const prodExample = await readFile(".env.production.example", "utf8");

  assert.doesNotMatch(envConfig, /ADMIN_INITIAL_PASSWORD/);
  assert.doesNotMatch(envConfig, /must not be the default admin password/i);
  assert.match(envConfig, /CORS_ORIGIN must be configured in production/);
  assert.match(envConfig, /REQUEST_BODY_LIMIT \|\| \(isProduction\(\) \? "10mb" : "80mb"\)/);
  assert.match(envConfig, /MYSQL_CONNECT_TIMEOUT/);

  for (const text of [envExample, prodExample]) {
    assert.match(text, /admin\/admin/);
    assert.doesNotMatch(text, /^ADMIN_INITIAL_PASSWORD=/m);
    assert.match(text, /CORS_ORIGIN/);
    assert.match(text, /MYSQL_CONNECT_TIMEOUT=5000/);
  }
});
