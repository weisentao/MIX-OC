import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as productionMysqlCheck from "../scripts/check-production-mysql.mjs";

const getTestables = () => {
  assert.ok(productionMysqlCheck.__testables, "check-production-mysql should expose testable helpers");
  return productionMysqlCheck.__testables;
};

test("ECONNREFUSED diagnosis gives copyable local MySQL listener checks", () => {
  const { mapMysqlError } = getTestables();
  const diagnosis = mapMysqlError(
    { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:3306" },
    { host: "127.0.0.1", port: 3306 }
  );

  const nextSteps = diagnosis.nextSteps.join("\n");

  assert.equal(diagnosis.status, "FAIL_ECONNREFUSED");
  assert.match(nextSteps, /Get-Service \| Where-Object/);
  assert.match(nextSteps, /Get-NetTCPConnection -LocalPort 3306 -State Listen/);
  assert.match(nextSteps, /Get-Command mysql,mysqld,mariadb,mariadbd/);
  assert.doesNotMatch(nextSteps, /db:prepare:production/);
});

test("invalid MYSQL_CONNECT_TIMEOUT blocks before opening a MySQL connection", () => {
  const { validateEnv } = getTestables();
  const env = {
    jwtSecret: "a-long-random-production-secret",
    host: "127.0.0.1",
    rawPort: "3306",
    port: 3306,
    user: "xjg_app",
    password: "secret",
    database: "xjg",
    rawConnectTimeout: "not-a-number",
    connectTimeout: Number.NaN
  };

  const validation = validateEnv(env);

  assert.deepEqual(validation.issues, [
    { key: "MYSQL_CONNECT_TIMEOUT", message: "invalid value 'not-a-number'" }
  ]);
});

test(".env.example JWT placeholder is rejected for production", () => {
  const { validateEnv } = getTestables();
  const env = {
    jwtSecret: "replace-with-a-long-random-secret-before-production",
    host: "127.0.0.1",
    rawPort: "3306",
    port: 3306,
    user: "xjg_app",
    password: "secret",
    database: "xjg",
    rawConnectTimeout: "",
    connectTimeout: 5000
  };

  const validation = validateEnv(env);

  assert.ok(
    validation.issues.some((issue) => issue.key === "JWT_SECRET" && issue.message === "uses a default insecure value"),
    "JWT_SECRET placeholder from .env.example must be rejected"
  );
});

test("production DB check no longer requires ADMIN_INITIAL_PASSWORD", () => {
  const { validateEnv } = getTestables();
  const env = {
    nodeEnv: "production",
    jwtSecret: "12345678901234567890123456789012",
    host: "127.0.0.1",
    rawPort: "3306",
    port: 3306,
    user: "xjg_app",
    password: "secret",
    database: "xjg",
    rawConnectTimeout: "",
    connectTimeout: 5000
  };

  const validation = validateEnv(env);

  assert.deepEqual(validation.issues, []);
});

test("production DB check source does not inspect ADMIN_INITIAL_PASSWORD", async () => {
  const text = await readFile("scripts/check-production-mysql.mjs", "utf8");

  assert.doesNotMatch(text, /ADMIN_INITIAL_PASSWORD/);
});

test("seed validation fails when departments are insufficient or users are unmapped", () => {
  const { validateSeedCounts } = getTestables();
  const counts = {
    adminUsers: 1,
    superAdmins: 1,
    realUsers: 71,
    managers: 23,
    employees: 48,
    roles: ["admin", "employee", "manager"],
    departments: 1,
    usersMissingDepartment: 7,
    addressBookRows: 71,
    userRoleRows: 72
  };

  const failures = validateSeedCounts(counts);

  assert.ok(
    failures.some((failure) => failure.includes("departments")),
    "department count should be part of production readiness"
  );
  assert.ok(
    failures.some((failure) => failure.includes("department mapping")),
    "users without matching department records should fail production readiness"
  );
});

test("production MySQL check maps slash-separated legacy departments by primary department", async () => {
  const text = await readFile("scripts/check-production-mysql.mjs", "utf8");

  assert.match(text, /SUBSTRING_INDEX\(u\.department,\s*' \/ ',\s*1\)/i);
});
