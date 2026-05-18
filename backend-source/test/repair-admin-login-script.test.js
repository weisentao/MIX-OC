import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const scriptPath = "scripts/repair-admin-login.mjs";

test("package exposes a focused admin login repair script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts?.["db:repair-admin-login"], "node scripts/repair-admin-login.mjs");
});

test("admin repair script updates only the fixed admin account", async () => {
  const text = await readFile(scriptPath, "utf8");

  assert.match(text, /FIXED_ADMIN_PASSWORD/);
  assert.match(text, /WHERE username = \?/);
  assert.match(text, /\["admin"\]/);
  assert.match(text, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(text, /DELETE\s+FROM/i);
  assert.doesNotMatch(text, /TRUNCATE/i);
  assert.doesNotMatch(text, /DROP\s+TABLE/i);
  assert.doesNotMatch(text, /username\s+LIKE\s+['"]MIX-%/i);
});
