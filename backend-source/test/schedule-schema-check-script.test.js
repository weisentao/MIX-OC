import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("schedule schema check is exposed as a read-only npm script", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.scripts["db:check:schedule"], "node scripts/check-schedule-schema.mjs");

  const script = await readFile("scripts/check-schedule-schema.mjs", "utf8");
  assert.match(script, /information_schema\.tables/i);
  assert.match(script, /information_schema\.statistics/i);
  assert.doesNotMatch(script, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bTRUNCATE\b|\bCREATE\b|\bALTER\b/i);
});
