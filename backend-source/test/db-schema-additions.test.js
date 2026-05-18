import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  ADMIN_HR_STORAGE_AUDIT_MIGRATION,
  NOTIFICATIONS_MIGRATION,
  SCHEDULE_MIGRATION,
  splitSqlStatements
} from "../src/db/feature-schema.js";

const migrationPath = `src/db/migrations/${ADMIN_HR_STORAGE_AUDIT_MIGRATION}`;

const requiredTables = [
  "admin_system_configs",
  "admin_audit_logs",
  "admin_archives",
  "hr_positions",
  "hr_employee_profiles",
  "hr_attendance_records",
  "hr_leave_requests",
  "hr_recruitment_jobs",
  "hr_recruitment_candidates",
  "hr_performance_reviews",
  "hr_payroll_records",
  "hr_assignment_previews",
  "storage_files"
];

const requiredIndexes = [
  "KEY idx_admin_audit_logs_actor_created (actor_user_uid, created_at)",
  "KEY idx_admin_audit_logs_resource (resource_type, resource_uid)",
  "KEY idx_admin_archives_status_archived (status, archived_at)",
  "KEY idx_hr_employee_profiles_department (department_uid, employment_status)",
  "KEY idx_hr_attendance_date_status (work_date, status)",
  "KEY idx_hr_leave_user_status (user_uid, status)",
  "KEY idx_hr_recruitment_jobs_department (department_uid, status)",
  "KEY idx_hr_candidates_job_stage (job_uid, stage)",
  "KEY idx_hr_performance_period_status (period, status)",
  "KEY idx_hr_payroll_month_status (payroll_month, status)",
  "KEY idx_storage_files_scope (scope_type, scope_uid, kind, status)"
];

test("admin HR storage audit migration is additive and idempotent", async () => {
  const migration = await readFile(migrationPath, "utf8");

  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"), `missing ${table}`);
  }

  for (const index of requiredIndexes) {
    assert.match(migration, new RegExp(index.replace(/[()]/g, "\\$&")));
  }

  assert.match(migration, /status VARCHAR\(16\) NOT NULL DEFAULT 'active'/);
  assert.match(migration, /deleted_at DATETIME NULL/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});

test("canonical schema includes admin HR storage audit tables", async () => {
  const schema = await readFile("src/db/schema.sql", "utf8");

  for (const table of requiredTables) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"), `schema missing ${table}`);
  }
});

test("runtime ensure helper executes each schema statement", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const statements = splitSqlStatements(migration);

  assert.equal(statements.length, requiredTables.length);
  assert.ok(statements.every((statement) => /^CREATE TABLE IF NOT EXISTS/i.test(statement.replace(/^--[^\n]*\n/gm, "").trim())));
});

test("production prepare and check include new additive tables", async () => {
  const prepareScript = await readFile("scripts/prepare-production-db.mjs", "utf8");
  const checkScript = await readFile("scripts/check-production-mysql.mjs", "utf8");

  assert.match(prepareScript, new RegExp(`executeMigration\\(conn, "${ADMIN_HR_STORAGE_AUDIT_MIGRATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\)`));

  for (const table of requiredTables) {
    assert.match(checkScript, new RegExp(`"${table}"`), `production check missing ${table}`);
  }
});

test("runtime startup migration chain includes schedule migration before admin/hr/storage migration", async () => {
  const mysqlBootstrap = await readFile("src/db/mysql.js", "utf8");

  assert.match(mysqlBootstrap, /import\s+\{[^}]*ensureAdminHrStorageAuditSchema[^}]*ensureNotificationsSchema[^}]*ensureScheduleSchema[^}]*\}\s+from\s+"\.\/feature-schema\.js";/);

  const scheduleCall = mysqlBootstrap.indexOf("await ensureScheduleSchema(mysqlPool);");
  const adminCall = mysqlBootstrap.indexOf("await ensureAdminHrStorageAuditSchema(mysqlPool);");
  const notificationsCall = mysqlBootstrap.indexOf("await ensureNotificationsSchema(mysqlPool);");
  assert.ok(scheduleCall >= 0, "ensureScheduleSchema(mysqlPool) should be called during startup bootstrap");
  assert.ok(adminCall >= 0, "ensureAdminHrStorageAuditSchema(mysqlPool) should be called during startup bootstrap");
  assert.ok(notificationsCall >= 0, "ensureNotificationsSchema(mysqlPool) should be called during startup bootstrap");
  assert.ok(scheduleCall < adminCall, "schedule migration must run before admin/hr/storage migration chain");
  assert.ok(adminCall < notificationsCall, "notifications migration must run after core workspace/admin tables");
});

test("schedule migration file stays additive and idempotent for startup retries", async () => {
  const migration = await readFile(`src/db/migrations/${SCHEDULE_MIGRATION}`, "utf8");
  const statements = splitSqlStatements(migration);

  assert.ok(statements.length > 0);
  assert.ok(statements.every((statement) => /^CREATE TABLE IF NOT EXISTS/i.test(statement.replace(/^--[^\n]*\n/gm, "").trim())));
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});

test("notifications migration is additive and included in startup helpers", async () => {
  const migration = await readFile(`src/db/migrations/${NOTIFICATIONS_MIGRATION}`, "utf8");
  const featureSchema = await readFile("src/db/feature-schema.js", "utf8");
  const statements = splitSqlStatements(migration);

  assert.equal(statements.length, 1);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notifications\b/i);
  assert.match(migration, /UNIQUE KEY uniq_notifications_notification_uid \(notification_uid\)/);
  assert.match(migration, /KEY idx_notifications_recipient_read_created \(recipient_user_uid, is_read, created_at\)/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
  assert.match(featureSchema, /export async function ensureNotificationsSchema/);
  assert.match(featureSchema, new RegExp(NOTIFICATIONS_MIGRATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
