#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { FIXED_ADMIN_PASSWORD, REAL_USER_DEFAULT_PASSWORD, REAL_USER_SEED_ROWS } from "../src/db/mysql.js";
import { hashPassword } from "../src/utils/password.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const migrationDir = path.join(rootDir, "src", "db", "migrations");

const env = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "xjg"
};

function assertDatabaseName(database) {
  if (!/^[A-Za-z0-9_$]+$/.test(database)) {
    throw new Error(`Invalid MYSQL_DATABASE name: ${database}`);
  }
}

function quoteIdentifier(value) {
  assertDatabaseName(value);
  return `\`${value}\``;
}

export function stableUid(prefix, value) {
  const raw = String(value || "").trim();
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("sha1").update(raw, "utf8").digest("hex").slice(0, 12);
  if (!slug) return `${prefix}-${hash}`;
  return /[^\x00-\x7F]/.test(raw) ? `${prefix}-${slug}-${hash}` : `${prefix}-${slug}`;
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeUsers(rows) {
  const byUsername = new Map();

  rows.forEach((row) => {
    const [username, name, department, job, adminCandidate, duplicateNote] = row;
    const cleanUsername = String(username || "").trim();
    if (!cleanUsername) return;

    const next = {
      username: cleanUsername,
      name: String(name || cleanUsername).trim() || cleanUsername,
      departments: new Set([String(department || "").trim()].filter(Boolean)),
      jobs: new Set([String(job || "").trim()].filter(Boolean)),
      manager: Boolean(adminCandidate),
      duplicateNotes: new Set([String(duplicateNote || "").trim()].filter(Boolean))
    };

    const current = byUsername.get(cleanUsername);
    if (!current) {
      byUsername.set(cleanUsername, next);
      return;
    }

    next.departments.forEach((item) => current.departments.add(item));
    next.jobs.forEach((item) => current.jobs.add(item));
    next.duplicateNotes.forEach((item) => current.duplicateNotes.add(item));
    current.manager = current.manager || next.manager;
  });

  return Array.from(byUsername.values()).map((user) => {
    const departments = Array.from(user.departments);
    const jobs = Array.from(user.jobs);
    const duplicateNotes = Array.from(user.duplicateNotes);
    const primaryDepartment = departments[0] || "";

    return {
      username: user.username,
      name: user.name,
      department: departments.join(" / "),
      departments,
      primaryDepartment,
      job: jobs.join(" / "),
      jobs,
      role: user.manager ? "manager" : "employee",
      profileNote: duplicateNotes.join(" / "),
      manager: user.manager
    };
  });
}

async function executeMigration(conn, fileName) {
  const sql = await readFile(path.join(migrationDir, fileName), "utf8");
  for (const statement of splitSqlStatements(sql)) {
    await conn.query(statement);
  }
}

const SORT_ORDER_TABLES = [
  "departments",
  "project_groups",
  "projects",
  "project_members",
  "tasks",
  "schedule_items",
  "tags",
  "project_tags",
  "templates",
  "address_book",
  "carousel_notices"
];

async function ensureSortOrderColumns(conn) {
  for (const table of SORT_ORDER_TABLES) {
    await conn.query(`ALTER TABLE ${quoteIdentifier(table)} MODIFY sort_order BIGINT NOT NULL DEFAULT 0`);
  }
}

async function seedRoles(conn) {
  const roles = [
    ["admin", "Super Administrator", "Fixed super administrator account."],
    ["manager", "Business Administrator", "Department or business administrator."],
    ["employee", "Employee", "Standard employee account."]
  ];

  for (const role of roles) {
    await conn.execute(
      `INSERT INTO roles (role_key, name, description, is_system)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = 1`,
      role
    );
  }
}

async function seedDepartments(conn, users) {
  const names = Array.from(new Set(users.flatMap((user) => user.departments || user.department.split(" / ").filter(Boolean))));

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    await conn.execute(
      `INSERT INTO departments (department_uid, name, name_en, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name_en = VALUES(name_en),
         status = 'active'`,
      [stableUid("dept", name), name, name, index]
    );
  }
}

async function seedUser(conn, user, passwordHash) {
  const userUid = stableUid("u", user.username.replace(/^MIX-/i, ""));
  const primaryDepartment = user.primaryDepartment || user.department.split(" / ")[0] || "unknown";
  const resolvedJob = user.job || primaryDepartment || "Employee";
  const characterLabel = user.role === "manager" ? "Business Administrator" : resolvedJob;

  await conn.execute(
    `INSERT INTO users (
      user_uid, username, password_hash, name, role, status, phone, email,
      department, department_en, job, mbti, mood, signature, profile_note,
      character_label, avatar_image, character_image, signature_image
    ) VALUES (?, ?, ?, ?, ?, 'active', '', '', ?, ?, ?, 'ENTP', '', '', ?, ?, '', '', '')
    ON DUPLICATE KEY UPDATE
      status = 'active',
      name = COALESCE(NULLIF(name, ''), VALUES(name)),
      profile_note = CASE WHEN profile_note = '' THEN VALUES(profile_note) ELSE profile_note END,
      character_label = CASE WHEN character_label = '' THEN VALUES(character_label) ELSE character_label END`,
    [
      userUid,
      user.username,
      passwordHash,
      user.name,
      user.role,
      primaryDepartment,
      primaryDepartment,
      resolvedJob,
      user.profileNote,
      characterLabel
    ]
  );

  await conn.execute(
    `INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
     SELECT ?, ?, 'global', ''
     FROM DUAL
     WHERE NOT EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_uid = ?
         AND scope_type = 'global'
         AND scope_uid = ''
         AND role_key IN ('admin', 'manager', 'employee')
     )`,
    [userUid, user.role, userUid]
  );

  await conn.execute(
    `INSERT INTO address_book (
      contact_uid, user_uid, username, display_name, department_uid, department_name,
      job, phone, email, status, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 'active', 0)
    ON DUPLICATE KEY UPDATE
      status = 'active'`,
    [
      stableUid("contact", user.username),
      userUid,
      user.username,
      user.name,
      stableUid("dept", primaryDepartment),
      primaryDepartment,
      resolvedJob
    ]
  );
}

async function clearBusinessData(conn) {
  const tables = [
    "app_states",
    "board_snapshots",
    "board_history",
    "board_shares",
    "board_members",
    "boards",
    "schedule_item_comments",
    "schedule_template_shares",
    "schedule_templates",
    "schedule_snapshots",
    "schedule_dependencies",
    "schedule_items",
    "schedule_plans",
    "shares",
    "notifications",
    "template_shares",
    "templates",
    "comment_mentions",
    "task_comments",
    "tasks",
    "project_tags",
    "project_members",
    "projects",
    "project_groups",
    "tags",
    "carousel_notices"
  ];

  for (const table of tables) {
    await conn.query(`DELETE FROM ${quoteIdentifier(table)}`);
  }
}

export function shouldResetBusinessData(args = []) {
  const flags = new Set(args);
  return flags.has("--reset-business-data") && flags.has("--confirm-reset-business-data");
}

async function seedAdmin(conn) {
  const passwordHash = await hashPassword(FIXED_ADMIN_PASSWORD);
  const departmentName = "项目管理部";
  const departmentUid = stableUid("dept", departmentName);
  await conn.execute(
    `INSERT INTO users (
      user_uid, username, password_hash, name, role, status, phone, email,
      department, department_en, job, mbti, mood, signature, profile_note,
      character_label, avatar_image, character_image, signature_image
    ) VALUES ('u-admin', 'admin', ?, 'admin', 'admin', 'active', '', '',
      ?, 'PROJECT MANAGEMENT', 'Super Administrator', 'ENTP',
      '', '', 'Fixed super administrator account.', 'Super Administrator', '', '', '')
    ON DUPLICATE KEY UPDATE
      password_hash = VALUES(password_hash),
      name = 'admin',
      role = 'admin',
      status = 'active',
      department = VALUES(department),
      department_en = VALUES(department_en),
      profile_note = VALUES(profile_note),
      character_label = VALUES(character_label)`,
    [passwordHash, departmentName]
  );

  await conn.execute(
    `INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
     VALUES ('u-admin', 'admin', 'global', '')
     ON DUPLICATE KEY UPDATE role_key = 'admin'`
  );

  await conn.execute(
    `INSERT INTO address_book (
      contact_uid, user_uid, username, display_name, department_uid, department_name,
      job, phone, email, status, sort_order
    ) VALUES ('contact-admin', 'u-admin', 'admin', 'admin', ?, ?, 'Super Administrator', '', '', 'active', 0)
    ON DUPLICATE KEY UPDATE
      username = VALUES(username),
      display_name = VALUES(display_name),
      department_uid = VALUES(department_uid),
      department_name = VALUES(department_name),
      job = VALUES(job),
      status = 'active'`,
    [departmentUid, departmentName]
  );
}

async function main() {
  assertDatabaseName(env.database);

  const serverConn = await mysql.createConnection({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password
  });

  await serverConn.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(env.database)}
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await serverConn.end();

  const conn = await mysql.createConnection(env);
  await executeMigration(conn, "20260512_001_workspace_tables.sql");
  await executeMigration(conn, "20260512_002_production_launch_tables.sql");
  await executeMigration(conn, "20260513_001_schedule_tables.sql");
  await executeMigration(conn, "20260515_001_admin_hr_storage_audit_tables.sql");
  await executeMigration(conn, "20260517_002_notifications.sql");
  await ensureSortOrderColumns(conn);

  if (shouldResetBusinessData(process.argv.slice(2))) {
    await clearBusinessData(conn);
  }
  await seedRoles(conn);

  const users = normalizeUsers(REAL_USER_SEED_ROWS);
  await seedDepartments(conn, users);
  await seedAdmin(conn);

  const userPasswordHash = await hashPassword(REAL_USER_DEFAULT_PASSWORD);
  for (const user of users) {
    await seedUser(conn, user, userPasswordHash);
  }

  const [[counts]] = await conn.query(
    `SELECT
      COUNT(*) AS totalUsers,
      SUM(role = 'admin') AS superAdmins,
      SUM(role = 'manager') AS managers,
      SUM(role = 'employee') AS employees
     FROM users`
  );
  const [[businessCounts]] = await conn.query(
    `SELECT
      (SELECT COUNT(*) FROM app_states) AS appStates,
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM tasks) AS tasks,
      (SELECT COUNT(*) FROM task_comments) AS taskComments,
      (SELECT COUNT(*) FROM boards) AS boards,
      (SELECT COUNT(*) FROM templates) AS templates`
  );

  console.log(JSON.stringify({
    ok: true,
    database: env.database,
    resetBusinessData: shouldResetBusinessData(process.argv.slice(2)),
    users: Number(counts.totalUsers),
    superAdmins: Number(counts.superAdmins),
    managers: Number(counts.managers),
    employees: Number(counts.employees),
    businessCounts
  }, null, 2));

  await conn.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error.message,
      code: error.code || ""
    }, null, 2));
    process.exitCode = 1;
  });
}
