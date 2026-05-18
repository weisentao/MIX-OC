#!/usr/bin/env node

import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const RUN_ID = `MIX-SMOKE_AUTH_${Date.now()}`;
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";
const FIRST_PASS = `MixSmoke${Date.now()}A`;
const RESET_PASS = `MixSmoke${Date.now()}B`;
const FINAL_PASS = `MixSmoke${Date.now()}C`;
const PHONE = `139${String(Date.now()).slice(-8)}`;

const state = {
  failed: false,
  token: ""
};

function logStep(status, label, detail = "") {
  const text = `[${status}] ${label}${detail ? ` - ${detail}` : ""}`;
  if (status === "FAIL") {
    state.failed = true;
    console.error(text);
  } else if (status === "WARN") {
    console.warn(text);
  } else {
    console.log(text);
  }
}

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "xjg"
  };
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error(`Network error calling ${BASE_URL}${path}: ${error.message}`);
  }

  const raw = await response.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }
  return { status: response.status, body, raw };
}

function messageOf(response) {
  return typeof response.body === "object" && response.body
    ? response.body.message || response.body.error || ""
    : response.raw || "";
}

function expect(label, response, predicate, detail = "") {
  if (predicate(response)) {
    logStep("PASS", label, detail || `status=${response.status}`);
    return true;
  }
  logStep("FAIL", label, `status=${response.status}, body=${response.raw || "empty"}`);
  return false;
}

async function login(username, password, label) {
  const response = await requestJson("/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  const ok = expect(label, response, (item) => item.status === 200 && item.body?.token, `user=${username}`);
  return ok ? response.body : null;
}

async function cleanup() {
  let conn;
  try {
    conn = await mysql.createConnection(mysqlConfig());
    await conn.execute("DELETE FROM users WHERE username = ? AND username LIKE 'MIX-SMOKE_AUTH_%'", [RUN_ID]);
    logStep("PASS", "cleanup smoke auth user", RUN_ID);
  } catch (error) {
    logStep("WARN", "cleanup smoke auth user", error.message);
  } finally {
    if (conn) await conn.end();
  }
}

async function main() {
  console.log(`Smoke auth flows target: ${BASE_URL}`);
  console.log(`Smoke auth flows user: ${RUN_ID}`);
  try {
    const health = await requestJson("/health");
    expect(
      "GET /health mysql ready",
      health,
      (item) => item.status === 200 && item.body?.ok === true && item.body?.ready === true && item.body?.checks?.mysql?.ready === true
    );
    if (state.failed) return;

    const register = await requestJson("/register", {
      method: "POST",
      body: JSON.stringify({
        username: RUN_ID,
        password: FIRST_PASS,
        name: "Smoke Auth User",
        phone: PHONE,
        email: `${RUN_ID.toLowerCase().replaceAll("_", ".")}@example.test`,
        department: "项目管理",
        job: "上线烟测",
        mbti: "ENTP"
      })
    });
    expect("POST /register", register, (item) => item.status === 201 && item.body?.token && item.body?.user?.id);

    await login(RUN_ID, FIRST_PASS, "login registered user");

    const securityQuestion = await requestJson(`/security-question?username=${encodeURIComponent(RUN_ID)}`);
    expect(
      "GET /security-question disabled",
      securityQuestion,
      (item) => item.status === 404 && messageOf(item).includes("Security question is not enabled")
    );

    const reset = await requestJson("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ username: RUN_ID, phone: PHONE, newPassword: RESET_PASS })
    });
    expect("POST /forgot-password", reset, (item) => item.status === 200);

    const afterReset = await login(RUN_ID, RESET_PASS, "login reset password");
    if (afterReset?.token) state.token = afterReset.token;

    const change = await requestJson("/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ oldPassword: RESET_PASS, newPassword: FINAL_PASS })
    });
    expect("POST /change-password", change, (item) => item.status === 200);

    await login(RUN_ID, FINAL_PASS, "login changed password");

    const admin = await login(ADMIN_USER, ADMIN_PASS, `${ADMIN_USER} login`);
    const adminChange = await requestJson("/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${admin?.token || ""}` },
      body: JSON.stringify({ oldPassword: ADMIN_PASS, newPassword: "DoNotChangeAdmin123" })
    });
    expect("admin change-password blocked", adminChange, (item) => item.status === 403);

    const adminReset = await requestJson("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ username: ADMIN_USER, phone: "000", newPassword: "DoNotChangeAdmin123" })
    });
    expect("admin forgot-password blocked", adminReset, (item) => item.status === 403);
  } finally {
    await cleanup();
  }

  if (state.failed) {
    console.error("smoke-auth-flows: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("smoke-auth-flows: PASSED");
}

main().catch(async (error) => {
  state.failed = true;
  console.error(`[FAIL] smoke-auth-flows runtime error - ${error.stack || error.message}`);
  await cleanup();
  console.error("smoke-auth-flows: FAILED");
  process.exitCode = 1;
});
