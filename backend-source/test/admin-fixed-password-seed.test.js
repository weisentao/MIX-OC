import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("runtime seed keeps the fixed admin/admin password independent of env", async () => {
  const text = await readFile("src/db/mysql.js", "utf8");
  const seedStart = text.indexOf('username: "admin"');
  const seedEnd = text.indexOf("for (const user of realUsers)", seedStart);
  assert.ok(seedStart >= 0 && seedEnd > seedStart, "runtime admin seed block should exist");

  const adminSeedSource = text.slice(seedStart, seedEnd);

  assert.match(adminSeedSource, /password:\s*FIXED_ADMIN_PASSWORD/);
  assert.doesNotMatch(adminSeedSource, /adminInitialPassword\(\)/);
  assert.match(text, /export const FIXED_ADMIN_PASSWORD = "admin"/);
});

test("production prepare seeds only admin with fixed admin/admin", async () => {
  const text = await readFile("scripts/prepare-production-db.mjs", "utf8");
  const seedStart = text.indexOf("async function seedAdmin");
  const seedEnd = text.indexOf("async function main", seedStart);
  assert.ok(seedStart >= 0 && seedEnd > seedStart, "prepare seedAdmin block should exist");

  const seedAdminSource = text.slice(seedStart, seedEnd);

  assert.match(seedAdminSource, /hashPassword\(FIXED_ADMIN_PASSWORD\)/);
  assert.doesNotMatch(seedAdminSource, /adminInitialPassword\(\)/);
  assert.match(text, /import \{[^}]*FIXED_ADMIN_PASSWORD/s);
});

test("memory fallback admin seed also uses fixed admin/admin", async () => {
  const text = await readFile("src/controllers/auth.controller.js", "utf8");
  const seedStart = text.indexOf('username: "admin"');
  const seedEnd = text.indexOf("for (const seedUser of realMemorySeedUsers)", seedStart);
  assert.ok(seedStart >= 0 && seedEnd > seedStart, "memory admin seed block should exist");

  const adminSeedSource = text.slice(seedStart, seedEnd);

  assert.match(text, /const adminHash = await hashPassword\(FIXED_ADMIN_PASSWORD\)/);
  assert.match(adminSeedSource, /passwordHash:\s*adminHash/);
  assert.doesNotMatch(adminSeedSource, /adminInitialPassword\(\)/);
  assert.match(text, /import \{[^}]*FIXED_ADMIN_PASSWORD/s);
});
