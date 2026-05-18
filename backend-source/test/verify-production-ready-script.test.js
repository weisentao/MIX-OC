import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("verify:production runs schedule checks before board smoke", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.scripts?.["verify:production"], "node scripts/verify-production-ready.mjs");

  const script = await readFile("scripts/verify-production-ready.mjs", "utf8");
  const expectedOrder = [
    "db:check:production",
    "db:check:schedule",
    "smoke:production",
    "smoke:auth",
    "smoke:auth-flows",
    "smoke:workspace",
    "smoke:workspace-taxonomy",
    "smoke:schedule",
    "smoke:schedule-library",
    "smoke:boards",
    "smoke:frontend-contract",
    "smoke:ai-deepseek"
  ];

  let previousIndex = -1;
  for (const stepName of expectedOrder) {
    const index = script.indexOf(`name: "${stepName}"`);
    assert.notEqual(index, -1, `missing verification step ${stepName}`);
    assert.ok(index > previousIndex, `${stepName} must run after the previous production gate`);
    previousIndex = index;
  }
});

test("verify:production reports schedule failures as P0 blockers", async () => {
  const script = await readFile("scripts/verify-production-ready.mjs", "utf8");

  assert.match(script, /P0_BLOCKED: schedule schema check failed/i);
  assert.match(script, /P0_BLOCKED: real company user auth smoke failed/i);
  assert.match(script, /P0_BLOCKED: auth register\/reset\/change-password smoke failed/i);
  assert.match(script, /P0_BLOCKED: workspace project-group\/tag smoke failed/i);
  assert.match(script, /P0_BLOCKED: schedule production smoke failed/i);
  assert.match(script, /P0_BLOCKED: schedule snapshot\/template smoke failed/i);
  assert.match(script, /P0_BLOCKED: frontend API contract smoke failed/i);
  assert.match(script, /P0_BLOCKED: DeepSeek AI smoke failed/i);
});

test("verify:production can run node-backed package scripts without npm on PATH", async () => {
  const script = await readFile("scripts/verify-production-ready.mjs", "utf8");

  assert.match(script, /parseNodeScript/);
  assert.match(script, /packageJson\.scripts/);
  assert.match(script, /process\.execPath/);
  assert.match(script, /directNodeArgs/);
});
