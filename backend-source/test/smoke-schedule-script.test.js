import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("package exposes smoke:schedule script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.scripts?.["smoke:schedule"], "node scripts/smoke-schedule.mjs");
});

test("schedule smoke script covers real API lifecycle", async () => {
  const text = await readFile("scripts/smoke-schedule.mjs", "utf8");

  assert.match(text, /GET \/health/);
  assert.match(text, /const ADMIN_PASS = process\.env\.SMOKE_ADMIN_PASS \|\| "admin"/);
  assert.doesNotMatch(text, /ADMIN_INITIAL_PASSWORD/);
  assert.match(text, /ADMIN_USER/);
  assert.match(text, /SCHEDULE_SMOKE_/);
  assert.match(text, /\/workspace\/projects\/\$\{encodeURIComponent\(projectId\)\}\/schedule/);
  assert.match(text, /\/workspace\/projects\/\$\{encodeURIComponent\(projectId\)\}\/schedule\/items/);
  assert.match(text, /\/workspace\/schedule\/items\/\$\{encodeURIComponent\(itemId\)\}/);
  assert.match(text, /\/workspace\/schedule\/items\/\$\{encodeURIComponent\(itemId\)\}\/comments/);
  assert.match(text, /\/workspace\/schedule\/items\/\$\{encodeURIComponent\(itemId\)\}\/comments\/\$\{encodeURIComponent\(commentId\)\}/);
  assert.match(text, /addToTaskList:\s*true/);
  assert.match(text, /schedule smoke comment/);
  assert.match(text, /schedule smoke comment updated/);
  assert.match(text, /commentsCount/);
  assert.match(text, /deletedCommentId/);
  assert.match(text, /taskDeleted/);
  assert.match(text, /cleanup project/);
});
