import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEDULE_MIGRATION = "20260513_001_schedule_tables.sql";
export const ADMIN_HR_STORAGE_AUDIT_MIGRATION = "20260515_001_admin_hr_storage_audit_tables.sql";
export const NOTIFICATIONS_MIGRATION = "20260517_002_notifications.sql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPaths = {
  [SCHEDULE_MIGRATION]: path.join(__dirname, "migrations", SCHEDULE_MIGRATION),
  [ADMIN_HR_STORAGE_AUDIT_MIGRATION]: path.join(__dirname, "migrations", ADMIN_HR_STORAGE_AUDIT_MIGRATION),
  [NOTIFICATIONS_MIGRATION]: path.join(__dirname, "migrations", NOTIFICATIONS_MIGRATION)
};

export function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function loadSchemaMigrationSql(migrationName) {
  const migrationPath = migrationPaths[migrationName];
  if (!migrationPath) {
    throw new Error(`Unknown DB schema migration: ${migrationName}`);
  }
  return readFile(migrationPath, "utf8");
}

async function ensureSchemaMigration(executor, migrationName) {
  const sql = await loadSchemaMigrationSql(migrationName);
  for (const statement of splitSqlStatements(sql)) {
    await executor.execute(statement);
  }
}

export async function loadScheduleSchemaSql() {
  return loadSchemaMigrationSql(SCHEDULE_MIGRATION);
}

export async function ensureScheduleSchema(executor) {
  await ensureSchemaMigration(executor, SCHEDULE_MIGRATION);
}

export async function loadAdminHrStorageAuditSchemaSql() {
  return loadSchemaMigrationSql(ADMIN_HR_STORAGE_AUDIT_MIGRATION);
}

export async function ensureAdminHrStorageAuditSchema(executor) {
  await ensureSchemaMigration(executor, ADMIN_HR_STORAGE_AUDIT_MIGRATION);
}

export async function loadNotificationsSchemaSql() {
  return loadSchemaMigrationSql(NOTIFICATIONS_MIGRATION);
}

export async function ensureNotificationsSchema(executor) {
  await ensureSchemaMigration(executor, NOTIFICATIONS_MIGRATION);
}
