#!/usr/bin/env node

import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const RUN_ID = `SMOKE_TAXONOMY_${Date.now()}`;
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";

const ids = {
  groupId: `${RUN_ID}_GROUP`,
  projectId: `${RUN_ID}_PROJECT`,
  tagName: `${RUN_ID}_TAG`
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
  if (response.status === 503 && String(response.raw || "").includes("MySQL unavailable for modular workspace API")) {
    logStep("FAIL", label, "503 MySQL unavailable for modular workspace API");
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
    await requestJson(`/workspace/project-groups/${encodeURIComponent(ids.groupId)}`, {
      method: "DELETE",
      headers: authHeaders()
    }).catch(() => null);
    await requestJson(`/workspace/tags/${encodeURIComponent(ids.tagName)}`, {
      method: "DELETE",
      headers: authHeaders()
    }).catch(() => null);
  }

  let conn;
  try {
    conn = await mysql.createConnection(mysqlConfig());
    await conn.execute("DELETE FROM project_tags WHERE project_uid = ? OR tag_name = ?", [ids.projectId, ids.tagName]);
    await conn.execute("DELETE FROM project_members WHERE project_uid = ?", [ids.projectId]);
    await conn.execute("DELETE FROM projects WHERE project_uid = ? AND project_uid LIKE 'SMOKE_TAXONOMY_%'", [ids.projectId]);
    await conn.execute("DELETE FROM project_groups WHERE group_uid = ? AND group_uid LIKE 'SMOKE_TAXONOMY_%'", [ids.groupId]);
    await conn.execute("DELETE FROM tags WHERE name = ? AND name LIKE 'SMOKE_TAXONOMY_%'", [ids.tagName]);
    logStep("PASS", "cleanup workspace taxonomy", RUN_ID);
  } catch (error) {
    logStep("WARN", "cleanup workspace taxonomy", error.message);
  } finally {
    if (conn) await conn.end();
  }
}

async function main() {
  console.log(`Smoke workspace taxonomy target: ${BASE_URL}`);
  console.log(`Smoke workspace taxonomy run id: ${RUN_ID}`);

  try {
    const login = await requestJson("/login", {
      method: "POST",
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    });
    if (!expect(`${ADMIN_USER} login`, login, (item) => item.status === 200 && item.body?.token)) return;
    state.token = login.body.token;

    const tag = await requestJson("/workspace/tags", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: ids.tagName, color: "#0ea5e9", sortOrder: Date.now() })
    });
    expect("POST /workspace/tags", tag, (item) => item.status === 201 && item.body?.name === ids.tagName);

    const tags = await requestJson("/workspace/tags", { headers: authHeaders() });
    expect("GET /workspace/tags contains smoke tag", tags, (item) => item.status === 200 && item.body?.some?.((row) => row.name === ids.tagName));

    const group = await requestJson("/workspace/project-groups", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ id: ids.groupId, title: `${RUN_ID} Group`, suffix: "S", sortOrder: Date.now() })
    });
    expect("POST /workspace/project-groups", group, (item) => item.status === 201 && item.body?.id === ids.groupId);

    const groups = await requestJson("/workspace/project-groups", { headers: authHeaders() });
    expect("GET /workspace/project-groups contains smoke group", groups, (item) => item.status === 200 && item.body?.some?.((row) => row.id === ids.groupId));

    const project = await requestJson("/workspace/projects", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        id: Date.now(),
        projectId: ids.projectId,
        name: `${RUN_ID} Project`,
        groupId: ids.groupId,
        group: `${RUN_ID} Group`,
        owner: ADMIN_USER,
        members: [ADMIN_USER],
        memberRoles: { [ADMIN_USER]: "manager" },
        tags: [ids.tagName],
        status: "active",
        startDate: "2026/05/15",
        endDate: "2026/05/20",
        sortOrder: Date.now()
      })
    });
    expect("POST /workspace/projects grouped tagged", project, (item) => item.status === 201 && item.body?.projectId === ids.projectId);

    const bootstrap = await requestJson("/workspace/bootstrap", { headers: authHeaders() });
    expect(
      "GET /workspace/bootstrap echoes group project tag",
      bootstrap,
      (item) => item.status === 200 &&
        item.body?.projectGroups?.some?.((groupRow) =>
          groupRow.id === ids.groupId &&
          groupRow.projects?.some?.((projectRow) =>
            projectRow.projectId === ids.projectId && projectRow.tags?.includes?.(ids.tagName)
          )
        )
    );

    const updatedGroup = await requestJson(`/workspace/project-groups/${encodeURIComponent(ids.groupId)}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: `${RUN_ID} Group Updated`, suffix: "U", status: "active", sortOrder: Date.now() })
    });
    expect("PUT /workspace/project-groups/:id", updatedGroup, (item) => item.status === 200 && item.body?.title === `${RUN_ID} Group Updated`);
  } finally {
    await cleanup();
  }

  if (state.failed) {
    console.error("smoke-workspace-taxonomy: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("smoke-workspace-taxonomy: PASSED");
}

main().catch(async (error) => {
  state.failed = true;
  console.error(`[FAIL] smoke-workspace-taxonomy runtime error - ${error.stack || error.message}`);
  await cleanup();
  console.error("smoke-workspace-taxonomy: FAILED");
  process.exitCode = 1;
});
