#!/usr/bin/env node

import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const RUN_ID = `SMOKE_SCHEDULE_LIBRARY_${Date.now()}`;
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";

const ids = {
  projectId: `${RUN_ID}_PROJECT`,
  snapshotId: `${RUN_ID}_SNAPSHOT`,
  templateId: `${RUN_ID}_TEMPLATE`
};

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

function authHeaders() {
  return { Authorization: `Bearer ${state.token}` };
}

function expect(label, response, predicate, detail = "") {
  const raw = String(response.raw || "");
  if (response.status === 503 && raw.includes("MySQL unavailable for schedule API")) {
    logStep("FAIL", label, "503 MySQL unavailable for schedule API");
    return false;
  }
  if (predicate(response)) {
    logStep("PASS", label, detail || `status=${response.status}`);
    return true;
  }
  logStep("FAIL", label, `status=${response.status}, body=${response.raw || "empty"}`);
  return false;
}

async function cleanup() {
  if (state.token) {
    await requestJson(`/workspace/projects/${encodeURIComponent(ids.projectId)}`, {
      method: "DELETE",
      headers: authHeaders()
    }).catch(() => null);
  }

  let conn;
  try {
    conn = await mysql.createConnection(mysqlConfig());
    await conn.execute("DELETE FROM schedule_snapshots WHERE project_uid = ? OR snapshot_uid = ?", [ids.projectId, ids.snapshotId]);
    await conn.execute("DELETE FROM schedule_plans WHERE project_uid = ?", [ids.projectId]);
    await conn.execute(
      "DELETE FROM schedule_templates WHERE template_uid = ? AND template_uid LIKE 'SMOKE_SCHEDULE_LIBRARY_%'",
      [ids.templateId]
    );
    await conn.execute("DELETE FROM project_members WHERE project_uid = ?", [ids.projectId]);
    await conn.execute("DELETE FROM project_tags WHERE project_uid = ?", [ids.projectId]);
    await conn.execute("DELETE FROM projects WHERE project_uid = ? AND project_uid LIKE 'SMOKE_SCHEDULE_LIBRARY_%'", [ids.projectId]);
    logStep("PASS", "cleanup schedule library", RUN_ID);
  } catch (error) {
    logStep("WARN", "cleanup schedule library", error.message);
  } finally {
    if (conn) await conn.end();
  }
}

async function main() {
  console.log(`Smoke schedule library target: ${BASE_URL}`);
  console.log(`Smoke schedule library run id: ${RUN_ID}`);

  try {
    const login = await requestJson("/login", {
      method: "POST",
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    });
    if (!expect(`${ADMIN_USER} login`, login, (item) => item.status === 200 && item.body?.token)) return;
    state.token = login.body.token;

    const project = await requestJson("/workspace/projects", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        id: Date.now(),
        projectId: ids.projectId,
        name: `${RUN_ID} Project`,
        owner: ADMIN_USER,
        members: [ADMIN_USER],
        memberRoles: { [ADMIN_USER]: "manager" },
        tags: [],
        status: "active",
        sortOrder: Date.now()
      })
    });
    expect("POST /workspace/projects", project, (item) => item.status === 201 && item.body?.projectId === ids.projectId);

    const schedule = await requestJson(`/workspace/projects/${encodeURIComponent(ids.projectId)}/schedule`, {
      headers: authHeaders()
    });
    expect("GET project schedule initializes plan", schedule, (item) => item.status === 200 && item.body?.plan && Array.isArray(item.body?.items));

    const snapshot = await requestJson(`/workspace/projects/${encodeURIComponent(ids.projectId)}/schedule/snapshots`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ snapshotId: ids.snapshotId, title: `${RUN_ID} Snapshot` })
    });
    expect("POST schedule snapshot", snapshot, (item) => item.status === 201 && item.body?.snapshot?.snapshotId === ids.snapshotId);

    const snapshots = await requestJson(`/workspace/projects/${encodeURIComponent(ids.projectId)}/schedule/snapshots`, {
      headers: authHeaders()
    });
    expect(
      "GET schedule snapshots contains smoke snapshot",
      snapshots,
      (item) => item.status === 200 && item.body?.snapshots?.some?.((row) => row.snapshotId === ids.snapshotId)
    );

    const template = await requestJson("/workspace/schedule/templates", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        templateId: ids.templateId,
        title: `${RUN_ID} Template`,
        description: "production smoke",
        visibility: "private",
        template: {
          items: [{ title: "Kickoff", startDate: "2026/05/15", endDate: "2026/05/16" }],
          dependencies: []
        },
        payload: { source: "smoke", runId: RUN_ID }
      })
    });
    expect("POST schedule template", template, (item) => item.status === 201 && item.body?.template?.templateId === ids.templateId && item.body?.template?.itemCount === 1);

    const templates = await requestJson("/workspace/schedule/templates", {
      headers: authHeaders()
    });
    expect(
      "GET schedule templates contains smoke template",
      templates,
      (item) => item.status === 200 && item.body?.templates?.some?.((row) => row.templateId === ids.templateId && row.itemCount === 1)
    );
  } finally {
    await cleanup();
  }

  if (state.failed) {
    console.error("smoke-schedule-library: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("smoke-schedule-library: PASSED");
}

main().catch(async (error) => {
  state.failed = true;
  console.error(`[FAIL] smoke-schedule-library runtime error - ${error.stack || error.message}`);
  await cleanup();
  console.error("smoke-schedule-library: FAILED");
  process.exitCode = 1;
});
