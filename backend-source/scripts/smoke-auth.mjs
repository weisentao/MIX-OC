#!/usr/bin/env node

import { REAL_USER_DEFAULT_PASSWORD } from "../src/db/mysql.js";

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";
const DOCUMENTED_REAL_PASS = "MIX801002";
const REAL_USERS = (process.env.SMOKE_REAL_USERS || "MIX-zhengjianxing,MIX-chenlingfeng,MIX-linxin")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const REAL_PASS = process.env.SMOKE_REAL_PASS || REAL_USER_DEFAULT_PASSWORD;

const state = {
  failed: false
};

function logStep(status, label, detail = "") {
  const text = `[${status}] ${label}${detail ? ` - ${detail}` : ""}`;
  if (status === "FAIL") {
    state.failed = true;
    console.error(text);
  } else {
    console.log(text);
  }
}

async function requestJson(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, options);
  } catch (error) {
    throw new Error(`Network error calling ${url}: ${error.message}`);
  }

  const raw = await res.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }
  return { status: res.status, body, raw };
}

async function login(username, password, label) {
  const response = await requestJson("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (response.status !== 200 || !response.body?.token) {
    const message = typeof response.body === "object" ? response.body?.message : response.raw;
    logStep("FAIL", `${label} login`, `status=${response.status}, message=${message || "unknown"}`);
    return null;
  }

  logStep("PASS", `${label} login`, `status=200, role=${response.body.user?.role || "missing"}`);
  return response.body;
}

function assertRole(label, loginResult, expectedRole) {
  const role = loginResult?.user?.role;
  if (role === expectedRole) {
    logStep("PASS", label, `role=${role}`);
    return;
  }
  logStep("FAIL", label, `expected=${expectedRole}, actual=${role || "missing"}`);
}

function assertNotAdminRole(label, loginResult) {
  const role = loginResult?.user?.role;
  if (role && role !== "admin") {
    logStep("PASS", label, `role=${role}`);
    return;
  }
  logStep("FAIL", label, `real imported user must not be admin, actual=${role || "missing"}`);
}

async function checkMe(token, label, expectedUsername = "") {
  const response = await requestJson("/me", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status !== 200 || !response.body?.id) {
    const message = typeof response.body === "object" ? response.body?.message : response.raw;
    logStep("FAIL", `${label} /me`, `status=${response.status}, message=${message || "unknown"}`);
    return;
  }

  if (expectedUsername && response.body.username && response.body.username !== expectedUsername) {
    logStep("FAIL", `${label} /me username`, `expected=${expectedUsername}, actual=${response.body.username}`);
    return;
  }

  logStep("PASS", `${label} /me`, `id=${response.body.id}, role=${response.body.role || "missing"}`);
}

async function main() {
  console.log(`Smoke auth target: ${BASE_URL}`);
  if (REAL_USER_DEFAULT_PASSWORD !== DOCUMENTED_REAL_PASS) {
    logStep("FAIL", "real user default password", `expected=${DOCUMENTED_REAL_PASS}, actual=${REAL_USER_DEFAULT_PASSWORD}`);
  }

  const health = await requestJson("/health");
  if (health.status === 200 && health.body?.ok === true) {
    logStep("PASS", "GET /health", "status=200");
  } else {
    logStep("FAIL", "GET /health", `status=${health.status}`);
  }

  const admin = await login(ADMIN_USER, ADMIN_PASS, `${ADMIN_USER} login`);
  if (admin?.token) {
    assertRole("admin role", admin, "admin");
    await checkMe(admin.token, "admin token", ADMIN_USER);
  }

  for (const username of REAL_USERS) {
    const realUser = await login(username, REAL_PASS, `${username}/${REAL_PASS}`);
    if (realUser?.token) {
      assertNotAdminRole(`${username} imported user role`, realUser);
      await checkMe(realUser.token, `${username} token`, username);
    }
  }

  if (state.failed) {
    console.error("smoke-auth: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("smoke-auth: PASSED");
}

main().catch((error) => {
  console.error(`[FAIL] smoke-auth runtime error - ${error.message}`);
  process.exitCode = 1;
});
