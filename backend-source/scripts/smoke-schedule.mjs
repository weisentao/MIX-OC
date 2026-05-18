#!/usr/bin/env node

import net from "node:net";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for schedule API";
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";
const RUN_ID = `SCHEDULE_SMOKE_${Date.now()}`;

const state = {
  failed: false,
  adminToken: "",
  projectId: "",
  itemId: "",
  taskUid: "",
  commentId: "",
  samples: {
    getInitial: null,
    postItem: null,
    postComment: null,
    putComment: null,
    deleteComment: null,
    getComments: null,
    getAfterComment: null,
    getAfterCommentDelete: null,
    putItem: null,
    deleteItem: null
  }
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

function readMysqlEnv() {
  return {
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "xjg"
  };
}

function failServiceUnavailable(message) {
  state.failed = true;
  console.error(`[FAIL] service availability - ${message}`);
  console.error(`[NEXT] Start the backend with: npm start`);
  console.error(`[NEXT] Or point the smoke script at a running service: $env:SMOKE_BASE_URL='http://localhost:13001'; npm run smoke:schedule`);
}

function responseMessage(response) {
  return typeof response.body === "object" && response.body
    ? response.body.message || response.body.error || ""
    : response.raw || "";
}

function assertMysqlBackedApiAvailable(label, response) {
  if (response.status === 503 && String(responseMessage(response)).includes(MYSQL_UNAVAILABLE_MESSAGE)) {
    logStep("FAIL", label, "503 MySQL unavailable for schedule API; schedule smoke cannot succeed through fallback");
    console.error("[BLOCKED] Schedule smoke must exercise MySQL-backed /workspace schedule APIs.");
    return false;
  }
  return true;
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

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function summarize(value) {
  return JSON.stringify(value, null, 2);
}

const STABLE_ITEM_FIELDS = [
  "id",
  "itemId",
  "taskId",
  "taskUid",
  "type",
  "title",
  "module",
  "owner",
  "startDate",
  "endDate",
  "status",
  "progress",
  "sortOrder",
  "hidden",
  "linkTask",
  "linkFlow",
  "commentsCount",
  "note"
];

function missingItemFields(item = {}) {
  return STABLE_ITEM_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(item, field));
}

async function checkMysqlReady() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: MYSQL_HOST, port: MYSQL_PORT });
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function expectStep(label, response, predicate, detail = "") {
  if (!assertMysqlBackedApiAvailable(label, response)) return false;

  if (predicate(response)) {
    logStep("PASS", label, detail || `status=${response.status}`);
    return true;
  }

  logStep("FAIL", label, `status=${response.status}, body=${response.raw || "empty"}`);
  return false;
}

async function assertHealth() {
  let response;
  try {
    response = await requestJson("/health");
  } catch (error) {
    failServiceUnavailable(error.message);
    return false;
  }

  return expectStep("GET /health", response, (item) => item.status === 200 && item.body?.ok === true, "status=200");
}

async function loginAdmin() {
  const response = await requestJson("/login", {
    method: "POST",
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
  });

  const ok = await expectStep(`${ADMIN_USER} login`, response, (item) => item.status === 200 && item.body?.token);
  if (!ok) return null;

  state.adminToken = response.body.token;
  return response.body;
}

async function createSmokeProject() {
  const response = await requestJson("/workspace/projects", {
    method: "POST",
    headers: authHeaders(state.adminToken),
    body: JSON.stringify({
      id: Date.now(),
      projectId: `${RUN_ID}_PROJECT`,
      name: RUN_ID,
      owner: "admin",
      members: ["admin"],
      memberRoles: { admin: "manager" },
      tags: [],
      status: "active",
      startDate: "2026/05/10",
      endDate: "2026/06/21",
      sortOrder: Date.now()
    })
  });

  const ok = await expectStep(
    "create smoke project",
    response,
    (item) => item.status === 201 && item.body?.projectId,
    `project=${response.body?.projectId || "missing"}`
  );
  if (!ok) return null;

  state.projectId = response.body.projectId;
  return response.body;
}

async function getSchedule(projectId, label = "GET schedule") {
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}/schedule`, {
    headers: authHeaders(state.adminToken)
  });

  await expectStep(
    label,
    response,
    (item) =>
      item.status === 200 &&
      item.body?.plan &&
      item.body.plan.status === "active" &&
      Array.isArray(item.body.items) &&
      Array.isArray(item.body.dependencies),
    `plan=${response.body?.plan?.id || "missing"}, items=${response.body?.items?.length ?? "missing"}`
  );
  return response;
}

async function createScheduleItem(projectId) {
  const response = await requestJson(`/workspace/projects/${encodeURIComponent(projectId)}/schedule/items`, {
    method: "POST",
    headers: authHeaders(state.adminToken),
    body: JSON.stringify({
      title: "分镜框架 / 风格稿",
      type: "schedule",
      module: "design",
      owner: "后期2部: 张三",
      startDate: "2026/05/16",
      endDate: "2026/05/19",
      status: "todo",
      progress: 0,
      addToTaskList: true,
      linkTask: true,
      linkFlow: true,
      note: "schedule smoke item",
      dependencyIds: []
    })
  });

  const ok = await expectStep(
    "POST schedule item",
    response,
    (item) =>
      item.status === 201 &&
      item.body?.item?.itemId &&
      item.body.item.title === "分镜框架 / 风格稿" &&
      item.body?.task,
    `item=${response.body?.item?.itemId || "missing"}, task=${response.body?.task?.taskUid || response.body?.task?.taskId || "missing"}`
  );
  if (ok) {
    state.itemId = response.body.item.itemId;
    state.taskUid = response.body.task?.taskUid || response.body.task?.taskId || "";
    state.samples.postItem = response.body;
  }
  return response;
}

async function assertItemVisibleAfterCreate(projectId, itemId) {
  const response = await getSchedule(projectId, "GET schedule after POST");
  const found = response.body?.items?.some((item) => item.itemId === itemId);
  if (found) {
    logStep("PASS", "created item is visible", `item=${itemId}`);
  } else {
    logStep("FAIL", "created item is visible", `item=${itemId}, body=${response.raw || "empty"}`);
  }
  return response;
}

async function createScheduleComment(itemId) {
  const response = await requestJson(`/workspace/schedule/items/${encodeURIComponent(itemId)}/comments`, {
    method: "POST",
    headers: authHeaders(state.adminToken),
    body: JSON.stringify({
      content: "schedule smoke comment",
      payload: {
        runId: RUN_ID,
        source: "smoke-schedule"
      }
    })
  });

  const ok = await expectStep(
    "POST schedule item comment",
    response,
    (item) =>
      item.status === 201 &&
      item.body?.comment?.commentId &&
      item.body.comment.itemId === itemId &&
      item.body.comment.content === "schedule smoke comment",
    `comment=${response.body?.comment?.commentId || "missing"}`
  );
  if (ok) {
    state.commentId = response.body.comment.commentId;
    state.samples.postComment = response.body;
  }
  return response;
}

async function assertScheduleComments(itemId, commentId) {
  const response = await requestJson(`/workspace/schedule/items/${encodeURIComponent(itemId)}/comments`, {
    headers: authHeaders(state.adminToken)
  });

  const ok = await expectStep(
    "GET schedule item comments",
    response,
    (item) =>
      item.status === 200 &&
      Array.isArray(item.body?.comments) &&
      item.body.comments.some((comment) => comment.commentId === commentId && comment.content === "schedule smoke comment"),
    `comments=${response.body?.comments?.length ?? "missing"}`
  );
  if (ok) state.samples.getComments = response.body;
  return response;
}

async function updateScheduleComment(itemId, commentId) {
  const response = await requestJson(
    `/workspace/schedule/items/${encodeURIComponent(itemId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: "PUT",
      headers: authHeaders(state.adminToken),
      body: JSON.stringify({
        content: "schedule smoke comment updated",
        payload: {
          runId: RUN_ID,
          source: "smoke-schedule",
          edited: true
        }
      })
    }
  );

  const ok = await expectStep(
    "PUT schedule item comment",
    response,
    (item) =>
      item.status === 200 &&
      item.body?.comment?.commentId === commentId &&
      item.body.comment.itemId === itemId &&
      item.body.comment.content === "schedule smoke comment updated" &&
      item.body.comment.payload?.edited === true,
    `comment=${response.body?.comment?.commentId || "missing"}`
  );
  if (ok) state.samples.putComment = response.body;
  return response;
}

async function assertScheduleCommentUpdated(itemId, commentId) {
  const response = await requestJson(`/workspace/schedule/items/${encodeURIComponent(itemId)}/comments`, {
    headers: authHeaders(state.adminToken)
  });

  const found = response.body?.comments?.find((comment) => comment.commentId === commentId);
  if (response.status === 200 && found?.content === "schedule smoke comment updated") {
    logStep("PASS", "updated comment is visible", `comment=${commentId}`);
    state.samples.getComments = response.body;
  } else {
    logStep("FAIL", "updated comment is visible", `status=${response.status}, body=${response.raw || "empty"}`);
  }
  return response;
}

async function assertCommentCountAfterPost(projectId, itemId) {
  const response = await getSchedule(projectId, "GET schedule after comment");
  const found = response.body?.items?.find((item) => item.itemId === itemId);
  if (found?.commentsCount === 1) {
    logStep("PASS", "schedule commentsCount increments", `item=${itemId}, commentsCount=${found.commentsCount}`);
    state.samples.getAfterComment = response.body;
  } else {
    logStep("FAIL", "schedule commentsCount increments", `item=${itemId}, body=${response.raw || "empty"}`);
  }
  return response;
}

async function deleteScheduleComment(itemId, commentId) {
  const response = await requestJson(
    `/workspace/schedule/items/${encodeURIComponent(itemId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: "DELETE",
      headers: authHeaders(state.adminToken)
    }
  );

  const ok = await expectStep(
    "DELETE schedule item comment",
    response,
    (item) =>
      item.status === 200 &&
      item.body?.ok === true &&
      item.body.commentId === commentId &&
      item.body.deletedCommentId === commentId &&
      item.body.itemId === itemId,
    `comment=${response.body?.commentId || "missing"}`
  );
  if (ok) state.samples.deleteComment = response.body;
  return response;
}

async function assertCommentCountAfterDelete(projectId, itemId) {
  const response = await getSchedule(projectId, "GET schedule after comment DELETE");
  const found = response.body?.items?.find((item) => item.itemId === itemId);
  if (found?.commentsCount === 0) {
    logStep("PASS", "schedule commentsCount decrements", `item=${itemId}, commentsCount=${found.commentsCount}`);
    state.samples.getAfterCommentDelete = response.body;
  } else {
    logStep("FAIL", "schedule commentsCount decrements", `item=${itemId}, body=${response.raw || "empty"}`);
  }
  return response;
}

async function updateScheduleItem(itemId) {
  const response = await requestJson(`/workspace/schedule/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    headers: authHeaders(state.adminToken),
    body: JSON.stringify({
      title: "分镜框架 / 风格稿 - 已更新",
      startDate: "2026/05/17",
      endDate: "2026/05/20",
      status: "doing",
      progress: 35
    })
  });

  const ok = await expectStep(
    "PUT schedule item",
    response,
    (item) =>
      item.status === 200 &&
      item.body?.item?.title === "分镜框架 / 风格稿 - 已更新" &&
      item.body.item.status === "doing" &&
      item.body.item.progress === 35 &&
      item.body.item.startDate === "2026/05/17" &&
      item.body.item.endDate === "2026/05/20" &&
      missingItemFields(item.body.item).length === 0,
    `item=${response.body?.item?.itemId || "missing"}`
  );
  if (response.status === 200 && response.body?.item) {
    const missing = missingItemFields(response.body.item);
    if (missing.length) {
      logStep("FAIL", "PUT response item fields complete", `missing=${missing.join(",")}`);
    } else {
      logStep("PASS", "PUT response item fields complete", STABLE_ITEM_FIELDS.join(","));
    }
  }
  if (ok) state.samples.putItem = response.body;
  return response;
}

async function deleteScheduleItem(itemId) {
  const response = await requestJson(`/workspace/schedule/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: authHeaders(state.adminToken)
  });

  const ok = await expectStep(
    "DELETE schedule item",
    response,
    (item) => item.status === 200 && item.body?.ok === true && item.body?.taskDeleted === false,
    `item=${response.body?.itemId || response.body?.deletedItemId || "missing"}, taskDeleted=${response.body?.taskDeleted}`
  );
  if (ok) state.samples.deleteItem = response.body;
  return response;
}

async function assertItemHiddenAfterDelete(projectId, itemId) {
  const response = await getSchedule(projectId, "GET schedule after DELETE");
  const found = response.body?.items?.some((item) => item.itemId === itemId);
  if (!found) {
    logStep("PASS", "deleted item hidden from schedule", `item=${itemId}, items=${response.body?.items?.length ?? "missing"}`);
  } else {
    logStep("FAIL", "deleted item hidden from schedule", `item=${itemId}, body=${response.raw || "empty"}`);
  }
  return response;
}

async function cleanupProject() {
  if (!state.adminToken || !state.projectId) return;

  let conn;
  try {
    const env = readMysqlEnv();
    conn = await mysql.createConnection({
      host: env.host,
      port: env.port,
      user: env.user,
      password: env.password,
      database: env.database,
      charset: "utf8mb4",
      connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT || 5000)
    });
    await conn.execute("DELETE FROM schedule_item_comments WHERE project_uid = ? AND project_uid LIKE 'SCHEDULE_SMOKE_%'", [state.projectId]);
    await conn.execute("DELETE FROM schedule_dependencies WHERE project_uid = ? AND project_uid LIKE 'SCHEDULE_SMOKE_%'", [state.projectId]);
    await conn.execute("DELETE FROM schedule_items WHERE project_uid = ? AND project_uid LIKE 'SCHEDULE_SMOKE_%'", [state.projectId]);
    await conn.execute("DELETE FROM schedule_snapshots WHERE project_uid = ? AND project_uid LIKE 'SCHEDULE_SMOKE_%'", [state.projectId]);
    await conn.execute("DELETE FROM schedule_plans WHERE project_uid = ? AND project_uid LIKE 'SCHEDULE_SMOKE_%'", [state.projectId]);
    logStep("PASS", "cleanup schedule rows", `project=${state.projectId}`);
  } catch (error) {
    logStep("WARN", "cleanup schedule rows", error.message);
  } finally {
    if (conn) await conn.end();
  }

  const response = await requestJson(`/workspace/projects/${encodeURIComponent(state.projectId)}`, {
    method: "DELETE",
    headers: authHeaders(state.adminToken)
  });

  await expectStep("cleanup project", response, (item) => item.status === 200 || item.status === 404, `project=${state.projectId}`);
}

function printSamples() {
  console.log("\n[SAMPLES] GET schedule response");
  console.log(summarize(state.samples.getInitial));
  console.log("\n[SAMPLES] POST item response");
  console.log(summarize(state.samples.postItem));
  console.log("\n[SAMPLES] POST comment response");
  console.log(summarize(state.samples.postComment));
  console.log("\n[SAMPLES] GET comments response");
  console.log(summarize(state.samples.getComments));
  console.log("\n[SAMPLES] GET schedule after comment response");
  console.log(summarize(state.samples.getAfterComment));
  console.log("\n[SAMPLES] PUT comment response");
  console.log(summarize(state.samples.putComment));
  console.log("\n[SAMPLES] DELETE comment response");
  console.log(summarize(state.samples.deleteComment));
  console.log("\n[SAMPLES] GET schedule after comment DELETE response");
  console.log(summarize(state.samples.getAfterCommentDelete));
  console.log("\n[SAMPLES] PUT item response");
  console.log(summarize(state.samples.putItem));
  console.log("\n[SAMPLES] DELETE item response");
  console.log(summarize(state.samples.deleteItem));
}

async function main() {
  console.log(`Smoke schedule target: ${BASE_URL}`);
  console.log(`Smoke schedule run id: ${RUN_ID}`);

  const healthOk = await assertHealth();
  if (!healthOk) {
    console.error("smoke-schedule: FAILED");
    process.exitCode = 1;
    return;
  }

  const mysqlReady = await checkMysqlReady();
  if (!mysqlReady) {
    logStep("FAIL", "mysql readiness", `${MYSQL_HOST}:${MYSQL_PORT} not reachable`);
    console.error("[BLOCKED] Schedule smoke requires MySQL because it verifies real DB writes.");
    console.error("[NEXT] Start MySQL or fix MYSQL_HOST/MYSQL_PORT, then run npm run db:check:production and npm run smoke:schedule again.");
    console.error("smoke-schedule: FAILED");
    process.exitCode = 1;
    return;
  }
  logStep("PASS", "mysql readiness", `${MYSQL_HOST}:${MYSQL_PORT} reachable`);

  const admin = await loginAdmin();
  if (!admin?.token) {
    console.error("smoke-schedule: FAILED");
    process.exitCode = 1;
    return;
  }

  try {
    const project = await createSmokeProject();
    if (!project?.projectId) return;

    const initial = await getSchedule(project.projectId, "GET schedule initializes plan");
    state.samples.getInitial = initial.body;

    const created = await createScheduleItem(project.projectId);
    if (!created.body?.item?.itemId) return;

    await assertItemVisibleAfterCreate(project.projectId, state.itemId);
    const comment = await createScheduleComment(state.itemId);
    if (!comment.body?.comment?.commentId) return;
    await assertScheduleComments(state.itemId, state.commentId);
    await assertCommentCountAfterPost(project.projectId, state.itemId);
    await updateScheduleComment(state.itemId, state.commentId);
    await assertScheduleCommentUpdated(state.itemId, state.commentId);
    await deleteScheduleComment(state.itemId, state.commentId);
    await assertCommentCountAfterDelete(project.projectId, state.itemId);
    await updateScheduleItem(state.itemId);
    await deleteScheduleItem(state.itemId);
    await assertItemHiddenAfterDelete(project.projectId, state.itemId);
  } finally {
    await cleanupProject();
  }

  printSamples();

  if (state.failed) {
    console.error("smoke-schedule: FAILED");
    process.exitCode = 1;
    return;
  }

  console.log("smoke-schedule: PASS");
}

main().catch(async (error) => {
  state.failed = true;
  console.error(`[FAIL] unexpected error - ${error.stack || error.message}`);
  await cleanupProject();
  console.error("smoke-schedule: FAILED");
  process.exitCode = 1;
});
