import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const SMOKE_POLICIES = new Set(["smoke-live", "smoke-lifecycle", "covered-by-domain-smoke", "documented-only"]);

function parseContractRows(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|/i.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        method: cells[0],
        path: cells[1],
        fields: cells[2] || "",
        smoke: cells[3] || ""
      };
    });
}

function staticSmokeNeedle(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith(":") ? "[^`\"']+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("[^`\"']*/");
}

test("package exposes frontend contract smoke script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts?.["smoke:frontend-contract"], "node scripts/smoke-frontend-contract.mjs");
});

test("frontend contract smoke uses docs contract and blocks MySQL fallback", async () => {
  const text = await readFile("scripts/smoke-frontend-contract.mjs", "utf8");

  assert.match(text, /docs\/frontend-api-contract\.md/);
  assert.match(text, /SMOKE_FRONTEND_CONTRACT_/);
  assert.match(text, /P0_BLOCKED: frontend contract smoke hit MySQL unavailable/i);
  assert.match(text, /MySQL unavailable for modular workspace API/);
  assert.match(text, /MySQL unavailable for board API/);
  assert.match(text, /MySQL unavailable for schedule API/);
  assert.match(text, /\/api/);
  assert.match(text, /\/login/);
  assert.match(text, /\/workspace\/bootstrap/);
  assert.match(text, /\/workspace\/boards/);
  assert.match(text, /\/workspace\/projects\/\$\{encodeURIComponent\(state\.projectId\)\}\/schedule/);
  assert.match(text, /cleanup/);
});

test("frontend contract docs require explicit smoke policy for every API row", async () => {
  const doc = await readFile("docs/frontend-api-contract.md", "utf8");
  const rows = parseContractRows(doc);

  assert.ok(rows.length > 20, "expected frontend API contract rows to be parsed");
  for (const row of rows) {
    assert.ok(
      SMOKE_POLICIES.has(row.smoke),
      `${row.method} ${row.path} must declare one smoke policy: ${Array.from(SMOKE_POLICIES).join(", ")}`
    );
  }
});

test("smoke-live contract rows are present in the real HTTP smoke script", async () => {
  const doc = await readFile("docs/frontend-api-contract.md", "utf8");
  const script = await readFile("scripts/smoke-frontend-contract.mjs", "utf8");
  const rows = parseContractRows(doc).filter((row) => row.smoke === "smoke-live");

  assert.ok(rows.length >= 10, "expected a meaningful live smoke subset");
  for (const row of rows) {
    assert.match(script, new RegExp(staticSmokeNeedle(row.path)), `smoke-live row missing from script: ${row.method} ${row.path}`);
  }
});

test("frontend contract smoke requires real HR schedule sync instead of candidate-id fallback", async () => {
  const script = await readFile("scripts/smoke-frontend-contract.mjs", "utf8");

  assert.doesNotMatch(
    script,
    /recommendedCandidateId[\s\S]*\/workspace\/resources\/work-items/,
    "HR schedule sync smoke must not use a recommended person id as the work item id"
  );
  assert.doesNotMatch(
    script,
    /row\.status\s*===\s*404|row\.status\s*===\s*409/,
    "HR schedule sync smoke must fail on 404/409 instead of treating them as success"
  );
  assert.match(
    script,
    /PATCH \/workspace\/resources\/work-items\/:workItemId\/schedule[\s\S]*row\.status\s*===\s*200/,
    "HR schedule sync smoke must require a 200 response"
  );
});
