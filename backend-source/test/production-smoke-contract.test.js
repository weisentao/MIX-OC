import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readScript = (name) => readFile(`scripts/${name}`, "utf8");

function assertNoFallbackSuccess(script, name) {
  assert.doesNotMatch(script, /\/appState\/main/i, `${name} must not call appState fallback`);
  assert.doesNotMatch(script, /data[\\/].*\.json/i, `${name} must not read local data json as smoke evidence`);
  assert.doesNotMatch(script, /fallback.*PASS|PASS.*fallback/i, `${name} must not treat fallback as pass`);
}

test("production smoke scripts explicitly reject fallback success", async () => {
  const scripts = {
    "smoke-production-db.mjs": await readScript("smoke-production-db.mjs"),
    "smoke-schedule.mjs": await readScript("smoke-schedule.mjs"),
    "smoke-boards.mjs": await readScript("smoke-boards.mjs"),
    "smoke-workspace-taxonomy.mjs": await readScript("smoke-workspace-taxonomy.mjs"),
    "smoke-schedule-library.mjs": await readScript("smoke-schedule-library.mjs")
  };

  for (const [name, script] of Object.entries(scripts)) {
    assertNoFallbackSuccess(script, name);
    assert.match(script, /MySQL/i, `${name} must name MySQL as the smoke backend`);
    assert.match(script, /503/i, `${name} must fail MySQL-backed API 503 responses`);
    assert.match(script, /workspace/i, `${name} must exercise workspace API routes`);
  }
});

test("core production smoke proves workspace API write-read-delete lifecycle", async () => {
  const script = await readScript("smoke-production-db.mjs");

  assert.match(script, /assertMysqlReady/);
  assert.match(script, /\/workspace\/bootstrap/);
  assert.match(script, /\/workspace\/projects/);
  assert.match(script, /\/workspace\/projects\/\$\{encodeURIComponent\(projectId\)\}\/tasks/);
  assert.match(script, /\/workspace\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/comments/);
  assert.match(script, /\/workspace\/comments\/search/);
  assert.match(script, /\/workspace\/address-book/);
  assert.match(script, /\/workspace\/departments/);
  assert.match(script, /\/workspace\/projects\/\$\{encodeURIComponent\(projectId\)\}\/shares/);
  assert.match(script, /DELETE/);
  assert.match(script, /createdProjectId/);
});

test("board and schedule smokes block when API returns MySQL unavailable", async () => {
  const schedule = await readScript("smoke-schedule.mjs");
  const boards = await readScript("smoke-boards.mjs");

  assert.match(schedule, /MySQL unavailable for schedule API/);
  assert.match(schedule, /assertMysqlBackedApiAvailable/);
  assert.match(boards, /MySQL unavailable for board API/);
  assert.match(boards, /assertMysqlBackedApiAvailable/);
});

test("board smoke routes every board API response through expectApi", async () => {
  const script = await readScript("smoke-boards.mjs");
  const boardResponses = [
    "board",
    "saved",
    "shared",
    "memberRead",
    "history"
  ];

  for (const variableName of boardResponses) {
    assert.match(
      script,
      new RegExp(`expectApi\\([\\s\\S]*?,\\s*${variableName}\\b`),
      `${variableName} response must be guarded by expectApi`
    );
  }

  assert.match(script, /expectApi\("cleanup board",\s*board\b/, "cleanup board DELETE must be guarded by expectApi");
});

test("schedule smoke cleanup API response goes through MySQL 503 gate", async () => {
  const script = await readScript("smoke-schedule.mjs");

  assert.match(
    script,
    /expectStep\("cleanup project",\s*response\b/,
    "cleanup project DELETE must be guarded by expectStep"
  );
});

test("core production smoke cleanup API responses go through MySQL 503 gate", async () => {
  const script = await readScript("smoke-production-db.mjs");

  assert.match(
    script,
    /expectOk\("cleanup delete probe task",\s*response\b/,
    "cleanup delete probe task DELETE must be guarded by expectOk"
  );
  assert.match(
    script,
    /expectOk\("cleanup smoke project",\s*response\b/,
    "cleanup smoke project DELETE must be guarded by expectOk"
  );
});

test("verify production keeps all MySQL smoke gates in release order", async () => {
  const script = await readFile("scripts/verify-production-ready.mjs", "utf8");
  const expectedOrder = [
    "db:check:production",
    "smoke:production",
    "smoke:auth-flows",
    "smoke:workspace",
    "smoke:workspace-taxonomy",
    "smoke:schedule",
    "smoke:schedule-library",
    "smoke:boards"
  ];

  let previousIndex = -1;
  for (const stepName of expectedOrder) {
    const index = script.indexOf(`name: "${stepName}"`);
    assert.notEqual(index, -1, `missing verification step ${stepName}`);
    assert.ok(index > previousIndex, `${stepName} must run after the previous smoke gate`);
    previousIndex = index;
  }
});

test("verify production includes DeepSeek AI smoke after frontend contract gate", async () => {
  const script = await readFile("scripts/verify-production-ready.mjs", "utf8");
  const frontendIndex = script.indexOf('name: "smoke:frontend-contract"');
  const aiIndex = script.indexOf('name: "smoke:ai-deepseek"');

  assert.notEqual(frontendIndex, -1, "missing smoke:frontend-contract gate");
  assert.notEqual(aiIndex, -1, "missing smoke:ai-deepseek gate");
  assert.ok(aiIndex > frontendIndex, "smoke:ai-deepseek must run after smoke:frontend-contract");
  assert.match(script, /P0_BLOCKED: DeepSeek AI smoke failed/i);
});

test("production smoke scripts use fixed admin/admin without env password override", async () => {
  const scripts = {
    "smoke-auth.mjs": await readScript("smoke-auth.mjs"),
    "smoke-production-db.mjs": await readScript("smoke-production-db.mjs"),
    "smoke-schedule.mjs": await readScript("smoke-schedule.mjs"),
    "smoke-boards.mjs": await readScript("smoke-boards.mjs"),
    "smoke-frontend-contract.mjs": await readScript("smoke-frontend-contract.mjs")
  };

  for (const [name, script] of Object.entries(scripts)) {
    assert.match(script, /const ADMIN_PASS = process\.env\.SMOKE_ADMIN_PASS \|\| "admin"/, `${name} must default to admin/admin`);
    assert.doesNotMatch(script, /ADMIN_INITIAL_PASSWORD/, `${name} must not read removed admin password env`);
  }
});

test("additional domain smokes clean only RUN_ID-prefixed records", async () => {
  const auth = await readScript("smoke-auth-flows.mjs");
  const schedule = await readScript("smoke-schedule.mjs");
  const taxonomy = await readScript("smoke-workspace-taxonomy.mjs");
  const scheduleLibrary = await readScript("smoke-schedule-library.mjs");

  assert.match(auth, /username = \? AND username LIKE 'MIX-SMOKE_AUTH_%'/);
  assert.match(schedule, /project_uid = \? AND project_uid LIKE 'SCHEDULE_SMOKE_%'/);
  assert.match(taxonomy, /project_uid = \? AND project_uid LIKE 'SMOKE_TAXONOMY_%'/);
  assert.match(taxonomy, /group_uid = \? AND group_uid LIKE 'SMOKE_TAXONOMY_%'/);
  assert.match(taxonomy, /name = \? AND name LIKE 'SMOKE_TAXONOMY_%'/);
  assert.match(scheduleLibrary, /project_uid = \? AND project_uid LIKE 'SMOKE_SCHEDULE_LIBRARY_%'/);
  assert.match(scheduleLibrary, /template_uid = \? AND template_uid LIKE 'SMOKE_SCHEDULE_LIBRARY_%'/);
  assert.doesNotMatch(scheduleLibrary, /payload_json\s+LIKE/i);
});
