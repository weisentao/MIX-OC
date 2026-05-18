#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import dotenv from "dotenv";

dotenv.config();

const CONTRACT_DOC = "docs/frontend-api-contract.md";
const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const API_PREFIX = process.env.SMOKE_API_PREFIX || "/api";
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";
const RUN_ID = `SMOKE_FRONTEND_CONTRACT_${Date.now()}`;
const MYSQL_UNAVAILABLE_MESSAGES = [
  "MySQL unavailable for modular workspace API",
  "MySQL unavailable for board API",
  "MySQL unavailable for schedule API"
];

const state = {
  failed: false,
  token: "",
  projectId: "",
  taskId: "",
  boardId: "",
  scheduleItemId: "",
  snapshotId: "",
  templateChecked: false
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

function apiUrl(path) {
  return `${BASE_URL}${API_PREFIX}${path}`;
}

function responseMessage(response) {
  return typeof response.body === "object" && response.body
    ? response.body.message || response.body.error || ""
    : response.raw || "";
}

function isMysqlUnavailable(response) {
  const message = String(responseMessage(response) || "");
  return response.status === 503 && MYSQL_UNAVAILABLE_MESSAGES.some((value) => message.includes(value));
}

function blockMysql(label, response) {
  state.failed = true;
  console.error(`[FAIL] ${label} - status=${response.status}, body=${response.raw || "empty"}`);
  console.error("P0_BLOCKED: frontend contract smoke hit MySQL unavailable");
  console.error("[BLOCKED] Real HTTP contract smoke must not pass via fallback data.");
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error(`Network error calling ${apiUrl(path)}: ${error.message}`);
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

async function expectHttp(label, path, options, predicate, detail = "") {
  const response = await requestJson(path, options);
  if (isMysqlUnavailable(response)) {
    blockMysql(label, response);
    return null;
  }

  if (predicate(response)) {
    logStep("PASS", label, detail || `${options?.method || "GET"} ${path} status=${response.status}`);
    return response;
  }

  logStep("FAIL", label, `status=${response.status}, body=${response.raw || "empty"}`);
  return response;
}

function assertContractDocMentions(text, method, path) {
  const pattern = new RegExp(`\\|\\s*${method}\\s*\\|\\s*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|`, "i");
  if (pattern.test(text)) {
    logStep("PASS", `contract doc includes ${method} ${path}`);
  } else {
    logStep("FAIL", `contract doc includes ${method} ${path}`, CONTRACT_DOC);
  }
}

async function loadContractDoc() {
  const text = await readFile(CONTRACT_DOC, "utf8");
  const required = [
    ["POST", "/login"],
    ["GET", "/me"],
    ["GET", "/workspace/bootstrap"],
    ["POST", "/workspace/projects"],
    ["PUT", "/workspace/tasks/:taskId"],
    ["GET", "/workspace/boards"],
    ["POST", "/workspace/projects/:projectId/schedule/items"],
    ["POST", "/workspace/projects/:projectId/schedule/export"],
    ["GET", "/admin/ai/config"],
    ["PATCH", "/admin/ai/config"],
    ["GET", "/workspace/ai/settings"],
    ["POST", "/workspace/resources/ai/assignment-advice"]
  ];
  for (const [method, path] of required) assertContractDocMentions(text, method, path);
}

async function login() {
  const response = await expectHttp(
    "POST /login",
    "/login",
    {
      method: "POST",
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    },
    (item) => item.status === 200 && item.body?.token
  );
  if (response?.body?.token) state.token = response.body.token;
}

async function checkAuthMe() {
  await expectHttp(
    "GET /me",
    "/me",
    { headers: authHeaders() },
    (item) => item.status === 200 && item.body
  );
}

async function checkWorkspace() {
  await expectHttp(
    "GET /workspace/bootstrap",
    "/workspace/bootstrap",
    { headers: authHeaders() },
    (item) => item.status === 200 && item.body && Array.isArray(item.body.projectGroups) && Array.isArray(item.body.rootProjects)
  );

  const project = await expectHttp(
    "POST /workspace/projects",
    "/workspace/projects",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        id: Date.now(),
        projectId: `${RUN_ID}_PROJECT`,
        name: `${RUN_ID} Project`,
        owner: "admin",
        members: ["admin"],
        memberRoles: { admin: "manager" },
        tags: [],
        status: "active",
        sortOrder: Date.now()
      })
    },
    (item) => item.status === 201 && item.body?.projectId
  );
  state.projectId = project?.body?.projectId || "";

  if (!state.projectId) return;

  await expectHttp(
    "GET /workspace/projects",
    "/workspace/projects",
    { headers: authHeaders() },
    (item) => item.status === 200 && Array.isArray(item.body) && item.body.some((projectRow) => projectRow.projectId === state.projectId)
  );

  const task = await expectHttp(
    `POST /workspace/projects/${state.projectId}/tasks`,
    `/workspace/projects/${encodeURIComponent(state.projectId)}/tasks`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        taskId: `${RUN_ID}_TASK`,
        title: `${RUN_ID} Task`,
        type: "contract-smoke",
        module: "project",
        owner: "admin",
        status: "todo",
        note: `${RUN_ID} task`,
        sortOrder: Date.now()
      })
    },
    (item) => item.status === 201 && item.body?.taskId
  );
  state.taskId = task?.body?.taskId || "";

  if (state.taskId) {
    await expectHttp(
      `PUT /workspace/tasks/${state.taskId}`,
      `/workspace/tasks/${encodeURIComponent(state.taskId)}`,
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          title: `${RUN_ID} Task Updated`,
          type: "contract-smoke",
          module: "project",
          owner: "admin",
          ownerUserId: "u-admin",
          status: "doing",
          priority: "high",
          note: `${RUN_ID} task updated`,
          sortOrder: Date.now()
        })
      },
      (item) => item.status === 200 && item.body?.taskId === state.taskId && item.body?.status === "doing"
    );

    await expectHttp(
      `POST /workspace/tasks/${state.taskId}/comments`,
      `/workspace/tasks/${encodeURIComponent(state.taskId)}/comments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text: `${RUN_ID} comment` })
      },
      (item) => item.status === 201 && item.body?.text === `${RUN_ID} comment`
    );
  }
}

async function checkBoards() {
  if (!state.projectId) return;

  await expectHttp(
    "GET /workspace/boards",
    `/workspace/boards?projectId=${encodeURIComponent(state.projectId)}`,
    { headers: authHeaders() },
    (item) => item.status === 200 && Array.isArray(item.body)
  );

  const board = await expectHttp(
    "POST /workspace/boards",
    "/workspace/boards",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        id: `${RUN_ID}_BOARD`,
        projectId: state.projectId,
        scopeType: "project",
        title: `${RUN_ID} Board`,
        ownerId: "u-admin",
        ownerName: "admin",
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {}
      })
    },
    (item) => item.status === 201 && item.body?.id
  );
  state.boardId = board?.body?.id || "";

  if (!state.boardId) return;

  await expectHttp(
    `PATCH /workspace/boards/${state.boardId}`,
    `/workspace/boards/${encodeURIComponent(state.boardId)}`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        title: `${RUN_ID} Board Saved`,
        elements: [{ id: `${RUN_ID}_RECT`, type: "rectangle", version: 1 }],
        appState: { viewBackgroundColor: "#f8fafc" },
        files: {}
      })
    },
    (item) => item.status === 200 && item.body?.elements?.[0]?.id === `${RUN_ID}_RECT`
  );

  await expectHttp(
    `GET /workspace/boards/${state.boardId}/history`,
    `/workspace/boards/${encodeURIComponent(state.boardId)}/history`,
    { headers: authHeaders() },
    (item) => item.status === 200 && Array.isArray(item.body)
  );
}

async function checkSchedule() {
  if (!state.projectId) return;

  await expectHttp(
    `GET /workspace/projects/${state.projectId}/schedule`,
    `/workspace/projects/${encodeURIComponent(state.projectId)}/schedule`,
    { headers: authHeaders() },
    (item) => item.status === 200 && item.body?.plan && Array.isArray(item.body.items)
  );

  const item = await expectHttp(
    `POST /workspace/projects/${state.projectId}/schedule/items`,
    `/workspace/projects/${encodeURIComponent(state.projectId)}/schedule/items`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        title: `${RUN_ID} Schedule Item`,
        type: "schedule",
        module: "project",
        owner: "admin",
        startDate: "2026/05/16",
        endDate: "2026/05/19",
        status: "todo",
        progress: 0,
        addToTaskList: false,
        linkTask: false,
        linkFlow: false,
        note: `${RUN_ID} schedule item`,
        dependencyIds: []
      })
    },
    (row) => row.status === 201 && row.body?.item?.itemId
  );
  state.scheduleItemId = item?.body?.item?.itemId || "";

  if (state.scheduleItemId) {
    await expectHttp(
      `POST /workspace/schedule/items/${state.scheduleItemId}/comments`,
      `/workspace/schedule/items/${encodeURIComponent(state.scheduleItemId)}/comments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          content: `${RUN_ID} schedule comment`,
          payload: { runId: RUN_ID }
        })
      },
      (row) => row.status === 201 && row.body?.comment?.content === `${RUN_ID} schedule comment`
    );
  }

  const snapshot = await expectHttp(
    `POST /workspace/projects/${state.projectId}/schedule/snapshots`,
    `/workspace/projects/${encodeURIComponent(state.projectId)}/schedule/snapshots`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: `${RUN_ID} Snapshot` })
    },
    (row) => row.status === 201 && row.body?.snapshot?.snapshotId
  );
  state.snapshotId = snapshot?.body?.snapshot?.snapshotId || "";

  const templates = await expectHttp(
    "GET /workspace/schedule/templates",
    "/workspace/schedule/templates",
    { headers: authHeaders() },
    (row) => row.status === 200 && Array.isArray(row.body?.templates)
  );
  state.templateChecked = Boolean(templates);

  await expectHttp(
    `POST /workspace/projects/${state.projectId}/schedule/export`,
    `/workspace/projects/${encodeURIComponent(state.projectId)}/schedule/export`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ format: "html" })
    },
    (row) => row.status === 201 && row.body?.download?.mimeType?.includes("text/html")
  );
}

async function checkAiAndResources() {
  const adminConfigResponse = await expectHttp(
    "GET /admin/ai/config",
    "/admin/ai/config",
    { headers: authHeaders() },
    (row) => row.status === 200 && typeof row.body === "object" && row.body
  );

  const configBody = adminConfigResponse?.body && typeof adminConfigResponse.body === "object"
    ? adminConfigResponse.body
    : null;

  if (configBody) {
    await expectHttp(
      "PATCH /admin/ai/config",
      "/admin/ai/config",
      {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          enabled: typeof configBody.enabled === "boolean" ? configBody.enabled : true,
          modelId:
            typeof configBody.modelId === "string" && configBody.modelId
              ? configBody.modelId
              : typeof configBody.defaultModel === "string" && configBody.defaultModel
                ? configBody.defaultModel
                : "deepseek-v4-flash",
          webSearchEnabled: Boolean(configBody.webSearchEnabled),
          knowledgeScopes:
            Array.isArray(configBody.knowledgeScopes) && configBody.knowledgeScopes.length
              ? configBody.knowledgeScopes
              : ["tasks", "comments"],
          openingTemplate:
            typeof configBody.openingTemplate === "string" && configBody.openingTemplate
              ? configBody.openingTemplate
              : `${RUN_ID} smoke opening template`
        })
      },
      (row) => row.status === 200 && typeof row.body === "object" && row.body
    );
  }

  await expectHttp(
    "GET /workspace/ai/settings",
    "/workspace/ai/settings",
    { headers: authHeaders() },
    (row) => row.status === 200 && typeof row.body === "object" && row.body
  );

  await expectHttp(
    "POST /workspace/ai/chat",
    "/workspace/ai/chat",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        scope: "home",
        message: `${RUN_ID} smoke ai message`,
        messages: [{ role: "user", content: `${RUN_ID} smoke ai context` }]
      })
    },
    (row) => row.status === 200 && typeof row.body === "object" && typeof row.body?.answer === "string"
  );

  await expectHttp(
    "GET /workspace/resources",
    "/workspace/resources?status=active",
    { headers: authHeaders() },
    (row) => row.status === 200 && typeof row.body === "object" && Array.isArray(row.body?.people)
  );

  await expectHttp(
    "GET /workspace/workload",
    "/workspace/workload",
    { headers: authHeaders() },
    (row) => row.status === 200 && typeof row.body === "object"
  );

  await expectHttp(
    "POST /workspace/resources/ai/assignment-advice",
    "/workspace/resources/ai/assignment-advice",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        taskUid: state.taskId || `${RUN_ID}_TASK_FALLBACK`,
        candidates: []
      })
    },
    (row) => row.status === 200 && typeof row.body === "object"
  );

  const workItemId = state.scheduleItemId || state.taskId || "";
  if (!workItemId) {
    logStep("FAIL", "PATCH /workspace/resources/work-items/:workItemId/schedule", "missing smoke schedule/task work item id");
    return;
  }

  await expectHttp(
    "PATCH /workspace/resources/work-items/:workItemId/schedule",
    `/workspace/resources/work-items/${encodeURIComponent(workItemId)}/schedule`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        workItemId,
        startDate: "2026/05/16",
        endDate: "2026/05/17"
      })
    },
    (row) => row.status === 200 && typeof row.body === "object" && row.body?.ok === true
  );
}

async function cleanup() {
  if (!state.token) return;
  logStep("PASS", "cleanup start", RUN_ID);

  if (state.scheduleItemId) {
    await requestJson(`/workspace/schedule/items/${encodeURIComponent(state.scheduleItemId)}`, {
      method: "DELETE",
      headers: authHeaders()
    }).catch(() => null);
  }

  if (state.boardId) {
    await requestJson(`/workspace/boards/${encodeURIComponent(state.boardId)}`, {
      method: "DELETE",
      headers: authHeaders()
    }).catch(() => null);
  }

  if (state.projectId) {
    await requestJson(`/workspace/projects/${encodeURIComponent(state.projectId)}`, {
      method: "DELETE",
      headers: authHeaders()
    }).catch(() => null);
  }

  logStep("PASS", "cleanup complete", RUN_ID);
}

async function main() {
  console.log(`Frontend contract smoke target: ${BASE_URL}${API_PREFIX}`);
  console.log(`Frontend contract smoke run id: ${RUN_ID}`);

  await loadContractDoc();

  await expectHttp(
    "GET /health",
    "/health",
    {},
    (item) => item.status === 200 && item.body?.ok === true
  );

  await login();
  if (!state.token) {
    console.error("smoke-frontend-contract: FAILED");
    process.exitCode = 1;
    return;
  }

  try {
    await checkAuthMe();
    await checkWorkspace();
    await checkBoards();
    await checkSchedule();
    await checkAiAndResources();
  } finally {
    await cleanup();
  }

  if (state.failed) {
    console.error("smoke-frontend-contract: FAILED");
    process.exitCode = 1;
    return;
  }

  console.log("smoke-frontend-contract: PASSED");
}

main().catch(async (error) => {
  state.failed = true;
  console.error(`[FAIL] smoke-frontend-contract runtime error - ${error.stack || error.message}`);
  await cleanup();
  console.error("smoke-frontend-contract: FAILED");
  process.exitCode = 1;
});
