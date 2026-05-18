import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ddlFiles = [
  "src/db/schema.sql",
  "src/db/migrations/20260513_001_schedule_tables.sql"
];

const scheduleTables = [
  "schedule_plans",
  "schedule_items",
  "schedule_dependencies",
  "schedule_snapshots",
  "schedule_templates",
  "schedule_template_shares",
  "schedule_item_comments"
];

const requiredIndexes = [
  "KEY idx_schedule_plans_project_status (project_uid, status)",
  "KEY idx_schedule_items_plan_sort (plan_uid, sort_order)",
  "KEY idx_schedule_items_project_uid (project_uid)",
  "KEY idx_schedule_items_task_uid (task_uid)",
  "KEY idx_schedule_items_start_end (start_date, end_date)",
  "KEY idx_schedule_dependencies_plan_uid (plan_uid)",
  "KEY idx_schedule_dependencies_from_item_uid (from_item_uid)",
  "KEY idx_schedule_dependencies_to_item_uid (to_item_uid)",
  "KEY idx_schedule_snapshots_plan_created_at (plan_uid, created_at)",
  "KEY idx_schedule_item_comments_item_commented_at (item_uid, commented_at)"
];

test("schedule DDL creates all required utf8mb4 tables and indexes", async () => {
  for (const file of ddlFiles) {
    const text = await readFile(file, "utf8");

    for (const table of scheduleTables) {
      assert.match(text, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
    }

    for (const index of requiredIndexes) {
      assert.match(text, new RegExp(index.replace(/[()]/g, "\\$&")));
    }

    assert.match(text, /task_uid VARCHAR\(64\) NULL/);
    assert.match(text, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/);
  }
});

test("schedule plans allow only one active plan per project", async () => {
  const migration = await readFile("src/db/migrations/20260513_001_schedule_tables.sql", "utf8");

  assert.match(migration, /active_project_uid VARCHAR\(64\) GENERATED ALWAYS AS/);
  assert.match(migration, /CASE WHEN status = 'active' THEN project_uid ELSE NULL END/);
  assert.match(migration, /UNIQUE KEY uniq_schedule_plans_active_project_uid \(active_project_uid\)/);
  assert.doesNotMatch(migration, /UNIQUE KEY .* \(project_uid, status\)/);
});

test("production prepare can reset schedule tables only behind explicit confirmation", async () => {
  const text = await readFile("scripts/prepare-production-db.mjs", "utf8");

  assert.match(text, /executeMigration\(conn, "20260513_001_schedule_tables\.sql"\)/);
  for (const table of [...scheduleTables].reverse()) {
    assert.match(text, new RegExp(`"${table}"`));
  }
  assert.match(text, /shouldResetBusinessData\(process\.argv\.slice\(2\)\)/);
});
