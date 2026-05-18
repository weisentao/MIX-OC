import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const files = [
  "src/db/schema.sql",
  "src/db/mysql.js",
  "src/db/migrations/20260512_001_workspace_tables.sql",
  "src/db/migrations/20260512_002_production_launch_tables.sql",
  "src/db/migrations/20260513_001_schedule_tables.sql"
];

test("sort_order columns can store millisecond sortOrder values", async () => {
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /sort_order INT NOT NULL DEFAULT 0/);
    assert.match(text, /sort_order BIGINT NOT NULL DEFAULT 0/);
  }
});

test("production prepare upgrades existing sort_order columns", async () => {
  const text = await readFile("scripts/prepare-production-db.mjs", "utf8");
  assert.match(text, /ALTER TABLE \$\{quoteIdentifier\(table\)\} MODIFY sort_order BIGINT NOT NULL DEFAULT 0/);
});
