#!/usr/bin/env node

import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for modular workspace API";
const EXPECTED_DATABASE = "xjg";
const RUN_ID = `SMOKE_PROD_${Date.now()}`;
const COMMENT_TEXT = `${RUN_ID} comment with mention`;
const TARGET_USER = "MIX-chenlingfeng";
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";

const state = {
  failed: false,
  adminToken: "",
  createdProjectId: "",
  createdTaskId: "",
  deleteProbeTaskId: "",
  createdCommentId: "",
  createdShareId: ""
};

function readMysqlEnv() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || EXPECTED_DATABASE
  };
}

function stage(label) {
  console.log(`\n${label}`);
}

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

function failBlockingMysql(message, detail = "") {
  state.failed = true;
  console.error(`[FAIL] mysql readiness - ${message}${detail ? ` - ${detail}` : ""}`);
  console.error("[BLOCKED] 当前不是正式可上线状态：等待 MySQL 环境。");
  console.error("[BLOCKED] Production DB smoke stops before workspace API checks to avoid repeated 503 responses.");
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, options);
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

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function bearerHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function bodyMessage(response) {
  return typeof response.body === "object" && response.body
    ? response.body.message || response.body.error
    : response.raw;
}

function assertMysqlAvailable(response, label) {
  if (response.status === 503 && String(bodyMessage(response) || "").includes(MYSQL_UNAVAILABLE_MESSAGE)) {
    logStep("FAIL", label, "MySQL unavailable; production DB smoke cannot pass until MySQL is running");
    return false;
  }
  return true;
}

async function expectOk(label, response, predicate, detail = "") {
  if (!assertMysqlAvailable(response, label)) return false;
  if (predicate(response)) {
    logStep("PASS", label, detail || `status=${response.status}`);
    return true;
  }
  logStep("FAIL", label, `status=${response.status}, body=${response.raw || "empty"}`);
  return false;
}

async function assertMysqlReady() {
  const env = readMysqlEnv();
  if (env.database !== EXPECTED_DATABASE) {
    failBlockingMysql(`MYSQL_DATABASE must be ${EXPECTED_DATABASE}`, `actual=${env.database}`);
    return false;
  }
  if (!Number.isInteger(env.port) || env.port <= 0) {
    failBlockingMysql("MYSQL_PORT must be a valid positive integer", `actual=${process.env.MYSQL_PORT || ""}`);
    return false;
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
      connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT || 5000)
    });
    await conn.query("SELECT 1 AS ok");
    logStep("PASS", "mysql connection", `${env.user}@${env.host}:${env.port}/${env.database}`);
    return true;
  } catch (error) {
    const code = error?.code || "UNKNOWN";
    const message = error?.message || "Unknown MySQL error";
    failBlockingMysql(message, `code=${code}, target=${env.user}@${env.host}:${env.port}/${env.database}`);
    console.error("[NEXT] Start MySQL or fix MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD, then run npm run db:prepare:production and npm run smoke:production again.");
    return false;
  } finally {
    if (conn) await conn.end();
  }
}

async function assertHealth() {
  const health = await requestJson("/health");
  await expectOk("GET /health", health, (item) => item.status === 200 && item.body?.ok === true, "status=200");
}

async function login(username, password) {
  const response = await requestJson("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (response.status !== 200 || !response.body?.token) {
    logStep("FAIL", `${username} login`, `status=${response.status}, body=${response.raw || "empty"}`);
    return null;
  }

  logStep("PASS", `${username} login`, `role=${response.body.user?.role || "unknown"}`);
  return response.body;
}

async function assertRole(label, loginResult, expectedRole) {
  const role = loginResult?.user?.role;
  if (role === expectedRole) {
    logStep("PASS", label, `role=${role}`);
    return;
  }
  logStep("FAIL", label, `expected=${expectedRole}, actual=${role || "missing"}`);
}

async function assertWorkspaceBootstrapDbPath(token) {
  const response = await requestJson("/workspace/bootstrap", {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "workspace bootstrap uses modular DB API",
    response,
    (item) => item.status === 200 && item.body && Array.isArray(item.body.projectGroups) && Array.isArray(item.body.rootProjects)
  );
}

async function createProject(token) {
  const response = await requestJson("/workspace/projects", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      projectId: `${RUN_ID}_PROJECT`,
      name: `${RUN_ID} Project`,
      owner: "admin",
      members: ["admin"],
      memberRoles: { admin: "manager" },
      tags: [],
      status: "active",
      sortOrder: Date.now()
    })
  });

  const ok = await expectOk("create project", response, (item) => item.status === 201 && item.body?.projectId);
  if (ok) state.createdProjectId = response.body.projectId;
  return ok ? response.body : null;
}

async function assertProjectList(token, projectId) {
  const response = await requestJson("/workspace/projects", {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "list projects includes smoke project",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((project) => project.projectId === projectId)
  );
}

async function updateProject(token, projectId) {
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({
      name: `${RUN_ID} Project Updated`,
      status: "active",
      members: ["admin"],
      memberRoles: { admin: "manager" },
      tags: []
    })
  });

  await expectOk(
    "update project",
    response,
    (item) => item.status === 200 && item.body?.projectId === projectId && item.body?.name === `${RUN_ID} Project Updated`
  );
}

async function createTask(token, projectId, taskSuffix = "TASK") {
  const taskId = `${RUN_ID}_${taskSuffix}`;
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}/tasks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      taskId,
      title: `${RUN_ID} ${taskSuffix}`,
      type: "production-smoke",
      module: "project",
      owner: "admin",
      ownerUserId: "u-admin",
      status: "todo",
      priority: "normal",
      note: `${RUN_ID} task created by production DB smoke.`,
      sortOrder: Date.now()
    })
  });

  const ok = await expectOk("create task", response, (item) => item.status === 201 && item.body?.taskId);
  if (ok && taskSuffix === "TASK") state.createdTaskId = response.body.taskId;
  if (ok && taskSuffix === "DELETE_PROBE_TASK") state.deleteProbeTaskId = response.body.taskId;
  return ok ? response.body : null;
}

async function assertTaskList(token, projectId, taskId) {
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}/tasks`, {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "list project tasks includes smoke task",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((task) => task.taskId === taskId)
  );
}

async function updateTask(token, taskId) {
  const response = await requestJson(`/workspace/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({
      title: `${RUN_ID} Task Updated`,
      type: "production-smoke",
      module: "project",
      owner: "admin",
      ownerUserId: "u-admin",
      status: "doing",
      priority: "high",
      note: `${RUN_ID} updated task.`,
      sortOrder: Date.now()
    })
  });

  await expectOk(
    "update task",
    response,
    (item) => item.status === 200 && item.body?.taskId === taskId && item.body?.status === "doing"
  );
}

async function deleteTask(token, taskId, label = "delete task") {
  const response = await requestJson(`/workspace/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers: bearerHeaders(token)
  });

  const ok = await expectOk(label, response, (item) => item.status === 200 && item.body?.ok === true);
  if (ok && state.deleteProbeTaskId === taskId) state.deleteProbeTaskId = "";
  if (ok && state.createdTaskId === taskId) state.createdTaskId = "";
}

async function addComment(token, taskId, mentionUsername) {
  const response = await requestJson(`/workspace/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      text: COMMENT_TEXT,
      user: "admin",
      dept: "PROJECT MANAGEMENT",
      tone: "blue",
      mentions: [mentionUsername]
    })
  });

  const ok = await expectOk(
    "add comment with mention",
    response,
    (item) => item.status === 201 && item.body?.id && Array.isArray(item.body?.mentions) && item.body.mentions.length >= 1,
    response.body?.mentions ? `mentions=${response.body.mentions.length}` : ""
  );
  if (ok) state.createdCommentId = response.body.id;
  return ok ? response.body : null;
}

async function assertCommentList(token, taskId) {
  const response = await requestJson(`/workspace/tasks/${encodeURIComponent(taskId)}/comments`, {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "list task comments includes smoke comment",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((comment) => comment.text === COMMENT_TEXT)
  );
}

async function assertCommentSearch(token) {
  const response = await requestJson(`/workspace/comments/search?q=${encodeURIComponent(COMMENT_TEXT)}`, {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "search comments finds smoke comment",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((comment) => comment.text === COMMENT_TEXT)
  );
}

async function assertMentionSearch(token, mentionedUsername) {
  const response = await requestJson(`/workspace/comments/search?mentionedUsername=${encodeURIComponent(mentionedUsername)}&q=${encodeURIComponent(RUN_ID)}`, {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "search comments by mentioned user",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((comment) => comment.text === COMMENT_TEXT)
  );
}

async function assertAddressBook(token, username) {
  const response = await requestJson(`/workspace/address-book?q=${encodeURIComponent(username)}`, {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "query address book",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((contact) => contact.username === username)
  );
}

async function assertDepartments(token) {
  const response = await requestJson("/workspace/departments", {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "query departments",
    response,
    (item) => item.status === 200 && Array.isArray(item.body)
  );
}

async function shareProject(token, projectId, username) {
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}/shares`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      username,
      permission: "write",
      memberRole: "editor",
      note: `${RUN_ID} project share.`
    })
  });

  const ok = await expectOk(
    "share project",
    response,
    (item) => item.status === 201 && item.body?.toUsername === username
  );
  if (ok) state.createdShareId = response.body.shareId || response.body.id || "";
  return ok ? response.body : null;
}

async function assertProjectMembers(token, projectId, username) {
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}/members`, {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "query project members includes shared user",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((member) => member.username === username)
  );
}

async function assertProjectShares(token, projectId, username) {
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}/shares`, {
    headers: bearerHeaders(token)
  });

  await expectOk(
    "query project shares includes shared user",
    response,
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((share) => share.toUsername === username)
  );
}

async function cleanupSmokeData() {
  if (!state.adminToken) return;

  const cleanupFailures = [];

  if (state.deleteProbeTaskId) {
    const response = await requestJson(`/workspace/tasks/${encodeURIComponent(state.deleteProbeTaskId)}`, {
      method: "DELETE",
      headers: bearerHeaders(state.adminToken)
    });
    const ok = await expectOk("cleanup delete probe task", response, (item) => item.status === 200 || item.status === 404, `status=${response.status}`);
    if (ok) {
      logStep("PASS", "cleanup delete probe task", `status=${response.status}`);
      state.deleteProbeTaskId = "";
    } else {
      cleanupFailures.push(`delete probe task status=${response.status}`);
    }
  }

  if (state.createdProjectId) {
    const response = await requestJson(`/workspace/projects/${encodeURIComponent(state.createdProjectId)}`, {
      method: "DELETE",
      headers: bearerHeaders(state.adminToken)
    });
    const ok = await expectOk("cleanup smoke project", response, (item) => item.status === 200 || item.status === 404, `status=${response.status}`);
    if (ok) {
      logStep("PASS", "cleanup smoke project", `status=${response.status}`);
      state.createdProjectId = "";
      state.createdTaskId = "";
      state.createdCommentId = "";
      state.createdShareId = "";
    } else {
      cleanupFailures.push(`delete project status=${response.status}`);
    }
  }

  if (cleanupFailures.length > 0) {
    logStep("WARN", "cleanup incomplete", cleanupFailures.join("; "));
  }
}

async function main() {
  console.log(`Smoke production target: ${BASE_URL}`);
  console.log(`Smoke production prefix: ${RUN_ID}`);

  stage("[1/8] mysql readiness");
  const mysqlReady = await assertMysqlReady();
  if (!mysqlReady) {
    console.error("smoke-production-db: FAILED");
    process.exitCode = 1;
    return;
  }

  try {
    stage("[2/8] health");
    await assertHealth();

    stage("[3/8] auth roles");
    const admin = await login(ADMIN_USER, ADMIN_PASS);
    if (admin) {
      state.adminToken = admin.token;
      await assertRole("super admin role", admin, "admin");
    }

    const manager = await login("MIX-zhengjianxing", "MIX801002");
    if (manager) await assertRole("business admin role", manager, "manager");

    const employee = await login(TARGET_USER, "MIX801002");
    if (employee) await assertRole("employee role", employee, "employee");

    if (!state.adminToken) {
      logStep("FAIL", "admin token", "missing; cannot run workspace API checks");
      return;
    }

    await assertWorkspaceBootstrapDbPath(state.adminToken);

    stage("[4/8] project CRUD");
    const project = await createProject(state.adminToken);
    if (project?.projectId) {
      await assertProjectList(state.adminToken, project.projectId);
      await updateProject(state.adminToken, project.projectId);
    }

    stage("[5/8] task CRUD");
    const task = project?.projectId ? await createTask(state.adminToken, project.projectId) : null;
    if (project?.projectId && task?.taskId) {
      await assertTaskList(state.adminToken, project.projectId, task.taskId);
      await updateTask(state.adminToken, task.taskId);
      const deleteProbeTask = await createTask(state.adminToken, project.projectId, "DELETE_PROBE_TASK");
      if (deleteProbeTask?.taskId) await deleteTask(state.adminToken, deleteProbeTask.taskId, "delete task probe");
    }

    stage("[6/8] comments + mentions");
    if (task?.taskId) {
      await addComment(state.adminToken, task.taskId, TARGET_USER);
      await assertCommentList(state.adminToken, task.taskId);
      await assertCommentSearch(state.adminToken);
      await assertMentionSearch(state.adminToken, TARGET_USER);
    }

    stage("[7/8] address book");
    await assertAddressBook(state.adminToken, TARGET_USER);
    await assertDepartments(state.adminToken);

    stage("[8/8] project sharing");
    if (project?.projectId) {
      await shareProject(state.adminToken, project.projectId, TARGET_USER);
      await assertProjectMembers(state.adminToken, project.projectId, TARGET_USER);
      await assertProjectShares(state.adminToken, project.projectId, TARGET_USER);
    }
  } finally {
    await cleanupSmokeData();
  }

  if (state.failed) {
    console.error("smoke-production-db: FAILED");
    process.exitCode = 1;
    return;
  }

  console.log("smoke-production-db: PASSED");
}

main().catch((error) => {
  console.error(`[FAIL] smoke-production-db runtime error - ${error.message}`);
  process.exitCode = 1;
});
