#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { hashPassword } from "../src/utils/password.js";

dotenv.config();

export const DEFAULT_COMPANY_USER_PASSWORD = "MIX801002";
export const DEFAULT_COMPANY_GROUP = "MIX项目管理";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDefaultCompanyUserSource() {
  if (process.env.COMPANY_USER_SOURCE) {
    return path.resolve(process.env.COMPANY_USER_SOURCE);
  }

  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "文档", "用户列表.md"),
    path.resolve(__dirname, "..", "..", "..", "mutou", "文档", "用户列表.md"),
    path.resolve(__dirname, "..", "..", "文档", "用户列表.md")
  ];

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

export const DEFAULT_COMPANY_USER_SOURCE = resolveDefaultCompanyUserSource();

const env = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "xjg"
};

function stableAsciiUid(prefix, value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^mix-/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallback = createHash("sha1").update(String(value || "")).digest("hex").slice(0, 12);
  return `${prefix}-${slug || fallback}`;
}

function stableTextUid(prefix, value) {
  const hash = createHash("sha1").update(String(value || ""), "utf8").digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function hasManagerFlag(computerFlag, roleText) {
  const normalized = `${computerFlag || ""} ${roleText || ""}`.trim();
  return /有电脑|管理员|admin|manager|yes|true|1|✅|🖥/i.test(normalized);
}

function mergeListValue(list, value) {
  const clean = String(value || "").trim();
  if (clean && !list.includes(clean)) list.push(clean);
}

function buildProfileNote(user) {
  const notes = [`用户组：${DEFAULT_COMPANY_GROUP}`];
  if (user.managerCandidate) notes.push("权限预留：电脑标识/管理员来源，未授予系统 admin");
  if (user.nickname) notes.push(`备注/花名：${user.nickname}`);
  if (user.departments.length > 1) notes.push(`重复账号部门：${user.departments.join(" / ")}`);
  return notes.join("；").slice(0, 255);
}

export function parseCompanyUserRecords(markdown) {
  const records = [];
  const lines = String(markdown || "").split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim().startsWith("|") || !/MIX-/i.test(line)) continue;
    const [department, username, name, nickname, computerFlag, sourceRole] = splitMarkdownRow(line);
    const cleanUsername = String(username || "").trim();
    if (!/^MIX-[A-Za-z0-9_-]+$/i.test(cleanUsername)) continue;

    records.push({
      department: String(department || "").trim(),
      username: cleanUsername,
      name: String(name || cleanUsername).trim() || cleanUsername,
      nickname: String(nickname || "").trim(),
      computerFlag: String(computerFlag || "").trim(),
      sourceRole: String(sourceRole || "").trim(),
      managerCandidate: hasManagerFlag(computerFlag, sourceRole)
    });
  }

  return records;
}

export function normalizeCompanyUsers(records) {
  const byUsername = new Map();

  for (const record of records) {
    const current = byUsername.get(record.username) || {
      username: record.username,
      userUid: stableAsciiUid("u", record.username),
      name: record.name || record.username,
      departments: [],
      nicknames: [],
      sourceRoles: [],
      computerFlags: [],
      managerCandidate: false,
      recordCount: 0
    };

    current.name = current.name || record.name || record.username;
    current.recordCount += 1;
    current.managerCandidate = current.managerCandidate || Boolean(record.managerCandidate);
    mergeListValue(current.departments, record.department);
    mergeListValue(current.nicknames, record.nickname);
    mergeListValue(current.sourceRoles, record.sourceRole);
    mergeListValue(current.computerFlags, record.computerFlag);
    byUsername.set(record.username, current);
  }

  return Array.from(byUsername.values()).map((user) => {
    const primaryDepartment = user.departments[0] || DEFAULT_COMPANY_GROUP;
    const department = user.departments.join(" / ") || DEFAULT_COMPANY_GROUP;
    const nickname = user.nicknames.join(" / ");
    const role = user.managerCandidate ? "manager" : "employee";
    const normalized = {
      username: user.username,
      userUid: user.userUid,
      name: user.name,
      department,
      departments: user.departments,
      primaryDepartment,
      departmentUid: stableTextUid("dept", primaryDepartment),
      nickname,
      sourceRoles: user.sourceRoles,
      computerFlags: user.computerFlags,
      role,
      managerCandidate: user.managerCandidate,
      adminGranted: false,
      group: DEFAULT_COMPANY_GROUP,
      job: nickname || primaryDepartment,
      initialPassword: DEFAULT_COMPANY_USER_PASSWORD,
      recordCount: user.recordCount
    };
    normalized.profileNote = buildProfileNote(normalized);
    normalized.payload = {
      source: DEFAULT_COMPANY_USER_SOURCE,
      group: DEFAULT_COMPANY_GROUP,
      managerCandidate: normalized.managerCandidate,
      adminGranted: false,
      computerFlags: normalized.computerFlags,
      sourceRoles: normalized.sourceRoles,
      departments: normalized.departments,
      duplicateAccount: normalized.recordCount > 1
    };
    return normalized;
  });
}

export function parseCompanyUsersMarkdown(markdown) {
  return normalizeCompanyUsers(parseCompanyUserRecords(markdown));
}

function departmentStatements(users) {
  const names = Array.from(new Set(users.flatMap((user) => user.departments))).filter(Boolean);
  const statements = [
    {
      sql: `INSERT INTO roles (role_key, name, description, is_system)
        VALUES ('company-member', ?, ?, 0)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          is_system = VALUES(is_system)`,
      params: [DEFAULT_COMPANY_GROUP, "Imported company user group membership"]
    }
  ];

  return statements.concat(names.map((name, index) => ({
    sql: `INSERT INTO departments (department_uid, name, name_en, status, sort_order, payload_json)
      VALUES (?, ?, ?, 'active', ?, ?)
      ON DUPLICATE KEY UPDATE
        name_en = VALUES(name_en),
        status = 'active',
        payload_json = VALUES(payload_json)`,
    params: [
      stableTextUid("dept", name),
      name,
      name,
      index,
      JSON.stringify({ source: DEFAULT_COMPANY_USER_SOURCE, group: DEFAULT_COMPANY_GROUP })
    ]
  })));
}

function userStatements(users, passwordHash) {
  const statements = [];

  for (const user of users) {
    statements.push({
      sql: `INSERT INTO users (
          user_uid, username, password_hash, name, role, status, phone, email,
          department, department_en, job, mbti, mood, signature, profile_note,
          character_label, avatar_image, character_image, signature_image
        ) VALUES (?, ?, ?, ?, ?, 'active', '', '', ?, ?, ?, 'ENTP', '', '', ?, ?, '', '', '')
        ON DUPLICATE KEY UPDATE
          status = 'active',
          name = COALESCE(NULLIF(name, ''), VALUES(name)),
          profile_note = CASE WHEN profile_note = '' THEN VALUES(profile_note) ELSE profile_note END,
          character_label = CASE WHEN character_label = '' THEN VALUES(character_label) ELSE character_label END`,
      params: [
        user.userUid,
        user.username,
        passwordHash,
        user.name,
        user.role,
        user.primaryDepartment,
        user.primaryDepartment,
        user.job,
        user.profileNote,
        user.managerCandidate ? "管理员候选" : "普通成员"
      ]
    });

    statements.push({
      sql: `INSERT INTO address_book (
          contact_uid, user_uid, username, display_name, department_uid, department_name,
          job, phone, email, status, sort_order, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 'active', 0, ?)
        ON DUPLICATE KEY UPDATE
          status = 'active',
          payload_json = VALUES(payload_json)`,
      params: [
        stableAsciiUid("contact", user.username),
        user.userUid,
        user.username,
        user.name,
        user.departmentUid,
        user.primaryDepartment,
        user.job,
        JSON.stringify(user.payload)
      ]
    });

    statements.push({
      sql: `INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
        SELECT ?, ?, 'global', ''
        FROM DUAL
        WHERE NOT EXISTS (
          SELECT 1
          FROM user_roles
          WHERE user_uid = ?
            AND scope_type = 'global'
            AND scope_uid = ''
            AND role_key IN ('admin', 'manager', 'employee')
        )`,
      params: [user.userUid, user.role, user.userUid]
    });

    statements.push({
      sql: `INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
        VALUES (?, 'company-member', 'company', ?)
        ON DUPLICATE KEY UPDATE role_key = 'company-member'`,
      params: [user.userUid, DEFAULT_COMPANY_GROUP]
    });
  }

  return statements;
}

export function buildCompanyUserImportPlan(users, options = {}) {
  const passwordHash = options.passwordHash || "$2b$10$TEST_COMPANY_USER_PASSWORD_HASH";
  return {
    users,
    summary: summarizeCompanyUsers(users),
    statements: [
      ...departmentStatements(users),
      ...userStatements(users, passwordHash)
    ]
  };
}

export function summarizeCompanyUsers(users) {
  return {
    users: users.length,
    managers: users.filter((user) => user.role === "manager").length,
    employees: users.filter((user) => user.role === "employee").length,
    departments: new Set(users.flatMap((user) => user.departments)).size,
    duplicateAccounts: users.filter((user) => user.recordCount > 1).map((user) => user.username)
  };
}

function parseArgs(argv) {
  return {
    sourcePath: argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length)
      || argv.find((arg) => arg.startsWith("--file="))?.slice("--file=".length)
      || DEFAULT_COMPANY_USER_SOURCE
  };
}

async function main() {
  const { sourcePath } = parseArgs(process.argv.slice(2));
  const markdown = await readFile(sourcePath, "utf8");
  const records = parseCompanyUserRecords(markdown);
  const users = normalizeCompanyUsers(records);
  const passwordHash = await hashPassword(DEFAULT_COMPANY_USER_PASSWORD);
  const plan = buildCompanyUserImportPlan(users, { passwordHash });
  const conn = await mysql.createConnection(env);

  try {
    await conn.beginTransaction();
    for (const statement of plan.statements) {
      await conn.execute(statement.sql, statement.params);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }

  console.log(JSON.stringify({
    ok: true,
    source: sourcePath,
    records: records.length,
    ...plan.summary,
    group: DEFAULT_COMPANY_GROUP,
    defaultPassword: DEFAULT_COMPANY_USER_PASSWORD,
    adminGranted: false
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error.message,
      code: error.code || ""
    }, null, 2));
    process.exitCode = 1;
  });
}
