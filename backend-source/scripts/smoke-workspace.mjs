#!/usr/bin/env node

import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";
const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for modular workspace API";

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

function bodyMessage(response) {
  return typeof response.body === "object" && response.body
    ? response.body.message || response.body.error
    : response.raw;
}

async function loginAdmin() {
  const response = await requestJson("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
  });

  if (response.status !== 200 || !response.body?.token) {
    logStep("FAIL", "admin login", `status=${response.status}, message=${bodyMessage(response) || "unknown"}`);
    return null;
  }

  logStep("PASS", "admin login", "status=200");
  return response.body.token;
}

async function checkUnauthorized() {
  const response = await requestJson("/workspace/bootstrap");
  if (response.status === 401) {
    logStep("PASS", "unauthorized workspace bootstrap", "status=401");
    return;
  }

  logStep("FAIL", "unauthorized workspace bootstrap", `expected=401, actual=${response.status}`);
}

async function checkBootstrap(token) {
  const response = await requestJson("/workspace/bootstrap", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 503) {
    const message = bodyMessage(response) || "";
    if (message.includes(MYSQL_UNAVAILABLE_MESSAGE)) {
      logStep("FAIL", "workspace bootstrap", `MySQL unavailable: ${message}`);
      return;
    }

    logStep("FAIL", "workspace bootstrap", `status=503 with unclear message: ${message || "empty"}`);
    return;
  }

  if (response.status !== 200 || !response.body) {
    logStep("FAIL", "workspace bootstrap", `status=${response.status}, message=${bodyMessage(response) || "unknown"}`);
    return;
  }

  const hasWorkspaceShape =
    Array.isArray(response.body.projectGroups) &&
    Array.isArray(response.body.rootProjects) &&
    Array.isArray(response.body.tags);

  if (!hasWorkspaceShape) {
    logStep("FAIL", "workspace bootstrap", "missing projectGroups/rootProjects/tags arrays");
    return;
  }

  logStep(
    "PASS",
    "workspace bootstrap",
    `groups=${response.body.projectGroups.length}, rootProjects=${response.body.rootProjects.length}, tags=${response.body.tags.length}`
  );
}

async function checkAppStateFallback(token) {
  const response = await requestJson("/appState/main", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 200 && response.body) {
    logStep("PASS", "legacy /appState/main fallback", "status=200");
    return;
  }

  logStep("FAIL", "legacy /appState/main fallback", `status=${response.status}, message=${bodyMessage(response) || "unknown"}`);
}

async function main() {
  console.log(`Smoke workspace target: ${BASE_URL}`);

  const health = await requestJson("/health");
  if (health.status === 200 && health.body?.ok === true && health.body?.ready === true && health.body?.checks?.mysql?.ready === true) {
    logStep("PASS", "GET /health", "status=200");
  } else {
    logStep("FAIL", "GET /health", `status=${health.status}, mysqlReady=${health.body?.checks?.mysql?.ready ?? "missing"}`);
  }

  await checkUnauthorized();

  const token = await loginAdmin();
  if (token) {
    await checkBootstrap(token);
    await checkAppStateFallback(token);
  }

  if (state.failed) {
    console.error("smoke-workspace: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("smoke-workspace: PASSED");
}

main().catch((error) => {
  console.error(`[FAIL] smoke-workspace runtime error - ${error.message}`);
  process.exitCode = 1;
});
