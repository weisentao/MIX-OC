#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const STATUS = {
  PASS: "PASS",
  FAIL_ENV_INVALID: "FAIL_ENV_INVALID",
  FAIL_ECONNREFUSED: "FAIL_ECONNREFUSED",
  FAIL_ACCESS_DENIED: "FAIL_ACCESS_DENIED",
  FAIL_UNKNOWN_DB: "FAIL_UNKNOWN_DB",
  FAIL_SCHEMA_MISSING: "FAIL_SCHEMA_MISSING",
  FAIL_SEED_MISSING: "FAIL_SEED_MISSING",
  FAIL_MYSQL_UNREACHABLE: "FAIL_MYSQL_UNREACHABLE",
  FAIL_MYSQL_ERROR: "FAIL_MYSQL_ERROR"
};

const EXPECTED_DATABASE = "xjg";
const EXPECTED_REAL_USERS = 71;
const MIN_REAL_USERS = 70;
const MIN_DEPARTMENTS = 7;

const DEFAULT_JWT_SECRETS = new Set([
  "change-this-to-a-long-random-secret",
  "your-jwt-secret",
  "secret",
  "changeme",
  "replace-with-a-long-random-secret",
  "replace-with-a-long-random-secret-before-production"
]);

const CORE_TABLES = [
  "users",
  "departments",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "project_groups",
  "projects",
  "project_members",
  "tasks",
  "task_comments",
  "comment_mentions",
  "notifications",
  "tags",
  "project_tags",
  "templates",
  "template_shares",
  "boards",
  "board_members",
  "board_shares",
  "board_history",
  "board_snapshots",
  "carousel_notices",
  "app_states",
  "address_book",
  "contacts",
  "shares",
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

function readEnv() {
  const rawPort = process.env.MYSQL_PORT || "";
  const rawConnectTimeout = process.env.MYSQL_CONNECT_TIMEOUT || "";
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    jwtSecret: process.env.JWT_SECRET || "",
    host: process.env.MYSQL_HOST || "",
    port: Number(rawPort),
    rawPort,
    user: process.env.MYSQL_USER || "",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "",
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    connectTimeout: Number(rawConnectTimeout || 5000),
    rawConnectTimeout
  };
}

function validateEnv(env) {
  const issues = [];
  const warnings = [];

  if (!env.jwtSecret) {
    issues.push({ key: "JWT_SECRET", message: "missing" });
  } else if (DEFAULT_JWT_SECRETS.has(env.jwtSecret)) {
    issues.push({ key: "JWT_SECRET", message: "uses a default insecure value" });
  }

  if (!env.host) {
    issues.push({ key: "MYSQL_HOST", message: "missing" });
  }

  if (!env.rawPort) {
    issues.push({ key: "MYSQL_PORT", message: "missing" });
  } else if (!Number.isInteger(env.port) || env.port <= 0 || env.port > 65535) {
    issues.push({ key: "MYSQL_PORT", message: `invalid value '${env.rawPort}'` });
  }

  if (!env.database) {
    issues.push({ key: "MYSQL_DATABASE", message: "missing" });
  } else if (env.database !== EXPECTED_DATABASE) {
    issues.push({ key: "MYSQL_DATABASE", message: `must be '${EXPECTED_DATABASE}', actual='${env.database}'` });
  }

  if (!env.user) {
    issues.push({ key: "MYSQL_USER", message: "missing" });
  }

  if (!env.password) {
    issues.push({ key: "MYSQL_PASSWORD", message: "missing" });
  }

  if (
    env.rawConnectTimeout &&
    (!Number.isInteger(env.connectTimeout) || env.connectTimeout <= 0)
  ) {
    issues.push({ key: "MYSQL_CONNECT_TIMEOUT", message: `invalid value '${env.rawConnectTimeout}'` });
  }

  if (env.user === "root") {
    warnings.push({ key: "MYSQL_USER", message: "root works for local debugging, but production should use a dedicated app user" });
  }

  return { issues, warnings };
}

function issueBlocksMysqlConnection(issue) {
  return issue.key.startsWith("MYSQL_");
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function setFailure(result, status, reason, nextSteps = []) {
  result.ok = false;
  result.status = status;
  result.category = status;
  result.reason = reason;
  result.nextSteps = nextSteps;
  return result;
}

function logLine(logger, status, label, detail = "") {
  logger(`[${status}] ${label}${detail ? ` - ${detail}` : ""}`);
}

function mapMysqlError(error, env) {
  const code = error?.code || "";

  if (code === "ECONNREFUSED") {
    return {
      status: STATUS.FAIL_ECONNREFUSED,
      reason: `No MySQL listener is reachable at ${env.host}:${env.port}.`,
      nextSteps: [
        "Run: Get-Service | Where-Object { $_.Name -match 'mysql|mariadb' -or $_.DisplayName -match 'mysql|mariadb' }",
        `Run: Get-NetTCPConnection -LocalPort ${env.port} -State Listen -ErrorAction SilentlyContinue`,
        "Run: Get-Command mysql,mysqld,mariadb,mariadbd -ErrorAction SilentlyContinue",
        "Start the approved MySQL/MySQL80/MariaDB service or fix MYSQL_HOST/MYSQL_PORT, then rerun npm run db:check:production."
      ]
    };
  }

  if (code === "ER_ACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR") {
    return {
      status: STATUS.FAIL_ACCESS_DENIED,
      reason: "MySQL rejected the configured user, password, host, or database permission.",
      nextSteps: [
        "Check MYSQL_USER and MYSQL_PASSWORD.",
        "Grant the application user access to xjg.* from localhost and 127.0.0.1.",
        "Run npm run db:prepare:production after fixing authorization."
      ]
    };
  }

  if (code === "ER_BAD_DB_ERROR") {
    return {
      status: STATUS.FAIL_UNKNOWN_DB,
      reason: `Database '${env.database}' does not exist.`,
      nextSteps: [
        "Create database xjg with utf8mb4.",
        "Or run npm run db:prepare:production with a MySQL user that can CREATE DATABASE."
      ]
    };
  }

  if (code === "ER_NO_SUCH_TABLE") {
    return {
      status: STATUS.FAIL_SCHEMA_MISSING,
      reason: "A required production table is missing.",
      nextSteps: ["Run npm run db:prepare:production."]
    };
  }

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ETIMEDOUT") {
    return {
      status: STATUS.FAIL_MYSQL_UNREACHABLE,
      reason: `MySQL host or network is unreachable: ${error.message}`,
      nextSteps: [
        "Check MYSQL_HOST and MYSQL_PORT.",
        "Check firewall, DNS, and MySQL bind address."
      ]
    };
  }

  return {
    status: STATUS.FAIL_MYSQL_ERROR,
    reason: error?.message || "Unknown MySQL error.",
    nextSteps: ["Check docs/production-mysql-runbook.md for the matching error category."]
  };
}

async function fetchExistingTables(conn, database) {
  const [rows] = await conn.execute(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name IN (${placeholders(CORE_TABLES)})`,
    [database, ...CORE_TABLES]
  );
  return new Set(rows.map((row) => row.tableName));
}

async function fetchSeedCounts(conn) {
  const [[userCounts]] = await conn.query(
    `SELECT
      COUNT(*) AS totalUsers,
      SUM(username = 'admin') AS adminUsers,
      SUM(username = 'admin' AND role = 'admin') AS superAdmins,
      SUM(username LIKE 'MIX-%') AS realUsers,
      SUM(role = 'manager') AS managers,
      SUM(role = 'employee') AS employees
     FROM users`
  );

  const [[departmentCounts]] = await conn.query(
    `SELECT
      (SELECT COUNT(*) FROM departments WHERE status = 'active') AS departments,
      (SELECT COUNT(*)
       FROM users u
       LEFT JOIN departments d ON d.name = SUBSTRING_INDEX(u.department, ' / ', 1) AND d.status = 'active'
       WHERE u.status = 'active'
         AND u.username LIKE 'MIX-%'
         AND d.id IS NULL) AS usersMissingDepartment,
      (SELECT COUNT(*)
       FROM address_book ab
       INNER JOIN users u ON u.user_uid = ab.user_uid
       WHERE u.status = 'active'
         AND u.username LIKE 'MIX-%'
         AND ab.status = 'active') AS addressBookRows,
      (SELECT COUNT(DISTINCT ur.user_uid)
       FROM user_roles ur
       INNER JOIN users u ON u.user_uid = ur.user_uid
       WHERE u.status = 'active'
         AND u.username LIKE 'MIX-%'
         AND ur.scope_type = 'global'
         AND ur.scope_uid = ''
         AND ur.role_key IN ('manager', 'employee')) AS userRoleRows`
  );

  const [roleRows] = await conn.query(
    "SELECT role_key FROM roles WHERE role_key IN ('admin', 'manager', 'employee') ORDER BY role_key"
  );

  return {
    totalUsers: Number(userCounts.totalUsers || 0),
    adminUsers: Number(userCounts.adminUsers || 0),
    superAdmins: Number(userCounts.superAdmins || 0),
    realUsers: Number(userCounts.realUsers || 0),
    managers: Number(userCounts.managers || 0),
    employees: Number(userCounts.employees || 0),
    departments: Number(departmentCounts.departments || 0),
    usersMissingDepartment: Number(departmentCounts.usersMissingDepartment || 0),
    addressBookRows: Number(departmentCounts.addressBookRows || 0),
    userRoleRows: Number(departmentCounts.userRoleRows || 0),
    roles: roleRows.map((row) => row.role_key)
  };
}

export function validateSeedCounts(counts) {
  const failures = [];

  if (counts.adminUsers !== 1 || counts.superAdmins !== 1) {
    failures.push(`expected exactly one admin super user, actual adminUsers=${counts.adminUsers}, superAdmins=${counts.superAdmins}`);
  }

  if (counts.realUsers < MIN_REAL_USERS) {
    failures.push(`expected about ${EXPECTED_REAL_USERS} real users, actual=${counts.realUsers}`);
  }

  if (counts.managers <= 0) {
    failures.push("manager users are missing");
  }

  if (counts.employees <= 0) {
    failures.push("employee users are missing");
  }

  if (counts.departments < MIN_DEPARTMENTS) {
    failures.push(`departments are insufficient: expected at least ${MIN_DEPARTMENTS}, actual=${counts.departments}`);
  }

  if (counts.usersMissingDepartment > 0) {
    failures.push(`user department mapping is incomplete: ${counts.usersMissingDepartment} active real users have no matching departments row`);
  }

  if (counts.addressBookRows < Math.min(counts.realUsers, MIN_REAL_USERS)) {
    failures.push(`address_book rows are missing for real users: expected at least ${Math.min(counts.realUsers, MIN_REAL_USERS)}, actual=${counts.addressBookRows}`);
  }

  if (counts.userRoleRows < Math.min(counts.realUsers, MIN_REAL_USERS)) {
    failures.push(`user_roles rows are missing for real users: expected at least ${Math.min(counts.realUsers, MIN_REAL_USERS)}, actual=${counts.userRoleRows}`);
  }

  const requiredRoles = ["admin", "manager", "employee"];
  const missingRoles = requiredRoles.filter((roleKey) => !counts.roles.includes(roleKey));
  if (missingRoles.length > 0) {
    failures.push(`roles table is missing: ${missingRoles.join(", ")}`);
  }

  return failures;
}

export async function runMysqlProductionCheck(options = {}) {
  const logger = options.logger || console.log;
  const errorLogger = options.errorLogger || console.error;
  const env = readEnv();
  const envValidation = validateEnv(env);
  const result = {
    ok: false,
    status: "",
    category: "",
    reason: "",
    nextSteps: [],
    env: {
      host: env.host,
      port: env.rawPort || "",
      user: env.user,
      database: env.database,
      connectionLimit: env.connectionLimit
    },
    envIssues: envValidation.issues,
    envWarnings: envValidation.warnings,
    checks: {},
    missingTables: [],
    counts: null
  };

  logLine(logger, "INFO", "MySQL target", `${env.user || "<missing>"}@${env.host || "<missing>"}:${env.rawPort || "<missing>"}/${env.database || "<missing>"}`);

  envValidation.issues.forEach((issue) => logLine(errorLogger, "FAIL_ENV", issue.key, issue.message));
  envValidation.warnings.forEach((warning) => logLine(logger, "WARN_ENV", warning.key, warning.message));

  const mysqlEnvIssues = envValidation.issues.filter(issueBlocksMysqlConnection);
  if (mysqlEnvIssues.length > 0) {
    setFailure(
      result,
      STATUS.FAIL_ENV_INVALID,
      `MySQL .env is invalid: ${mysqlEnvIssues.map((issue) => `${issue.key} ${issue.message}`).join("; ")}.`,
      ["Fix .env, then run npm run db:check:production again."]
    );
    logLine(errorLogger, "RESULT", result.status, result.reason);
    return result;
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host: env.host,
      port: env.port,
      user: env.user,
      password: env.password,
      database: env.database,
      charset: "utf8mb4",
      connectTimeout: env.connectTimeout
    });
    result.checks.connection = true;
    logLine(logger, STATUS.PASS, "MySQL connection", "server reachable");
  } catch (error) {
    const diagnosis = mapMysqlError(error, env);
    result.errorCode = error?.code || "";
    setFailure(result, diagnosis.status, diagnosis.reason, diagnosis.nextSteps);
    logLine(errorLogger, "RESULT", result.status, `${result.reason} code=${result.errorCode || "n/a"}`);
    result.nextSteps.forEach((step) => logLine(errorLogger, "NEXT", "mysql", step));
    return result;
  }

  try {
    const [[databaseRow]] = await conn.query("SELECT DATABASE() AS databaseName");
    if (databaseRow?.databaseName !== EXPECTED_DATABASE) {
      setFailure(
        result,
        STATUS.FAIL_UNKNOWN_DB,
        `Connected database mismatch: expected=${EXPECTED_DATABASE}, actual=${databaseRow?.databaseName || "null"}.`,
        ["Set MYSQL_DATABASE=xjg and reconnect."]
      );
      logLine(errorLogger, "RESULT", result.status, result.reason);
      return result;
    }
    result.checks.database = true;
    logLine(logger, STATUS.PASS, "database selected", databaseRow.databaseName);

    const existingTables = await fetchExistingTables(conn, env.database);
    result.missingTables = CORE_TABLES.filter((tableName) => !existingTables.has(tableName));
    if (result.missingTables.length > 0) {
      setFailure(
        result,
        STATUS.FAIL_SCHEMA_MISSING,
        `Missing core tables: ${result.missingTables.join(", ")}.`,
        ["Run npm run db:prepare:production.", "Review migration errors before running smoke:production."]
      );
      logLine(errorLogger, "RESULT", result.status, result.reason);
      return result;
    }
    result.checks.schema = true;
    logLine(logger, STATUS.PASS, "core schema", `${CORE_TABLES.length} tables present`);

    const counts = await fetchSeedCounts(conn);
    result.counts = counts;
    logLine(
      logger,
      "INFO",
      "seed counts",
      `total=${counts.totalUsers}, real=${counts.realUsers}/${EXPECTED_REAL_USERS}, admin=${counts.adminUsers}, managers=${counts.managers}, employees=${counts.employees}, departments=${counts.departments}, missingDepartment=${counts.usersMissingDepartment}, addressBook=${counts.addressBookRows}, userRoles=${counts.userRoleRows}, roles=${counts.roles.join(",") || "none"}`
    );

    const seedFailures = validateSeedCounts(counts);
    if (seedFailures.length > 0) {
      setFailure(
        result,
        STATUS.FAIL_SEED_MISSING,
        seedFailures.join("; "),
        ["Run npm run db:prepare:production.", "Confirm the real user source and admin seed policy."]
      );
      logLine(errorLogger, "RESULT", result.status, result.reason);
      return result;
    }
    result.checks.seed = true;
    logLine(logger, STATUS.PASS, "production seed", "admin, real users, manager and employee roles present");

    const blockingEnvIssues = envValidation.issues.filter((issue) => !issueBlocksMysqlConnection(issue));
    if (blockingEnvIssues.length > 0) {
      setFailure(
        result,
        STATUS.FAIL_ENV_INVALID,
        `Production .env is not ready: ${blockingEnvIssues.map((issue) => `${issue.key} ${issue.message}`).join("; ")}.`,
        ["Replace default JWT_SECRET with a long random secret."]
      );
      logLine(errorLogger, "RESULT", result.status, result.reason);
      return result;
    }

    result.ok = true;
    result.status = STATUS.PASS;
    result.category = STATUS.PASS;
    result.reason = "MySQL production readiness check passed.";
    logLine(logger, "RESULT", result.status, result.reason);
    return result;
  } catch (error) {
    const diagnosis = mapMysqlError(error, env);
    result.errorCode = error?.code || "";
    setFailure(result, diagnosis.status, diagnosis.reason, diagnosis.nextSteps);
    logLine(errorLogger, "RESULT", result.status, `${result.reason} code=${result.errorCode || "n/a"}`);
    result.nextSteps.forEach((step) => logLine(errorLogger, "NEXT", "mysql", step));
    return result;
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

export const __testables = {
  mapMysqlError,
  validateEnv,
  validateSeedCounts
};

async function main() {
  const result = await runMysqlProductionCheck();
  if (!result.ok) {
    console.error(`check-production-mysql: ${result.status}`);
    process.exitCode = 1;
    return;
  }
  console.log("check-production-mysql: PASS");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[RESULT] ${STATUS.FAIL_MYSQL_ERROR} - ${error.message}`);
    process.exitCode = 1;
  });
}
