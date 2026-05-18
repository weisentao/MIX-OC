#!/usr/bin/env node

import net from "node:net";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for board API";
const SMOKE_PREFIX = "SMOKE_BOARD_";
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";

const state = {
  failed: false,
  adminToken: "",
  memberToken: "",
  projectId: "",
  boardId: ""
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

function blockOnMysql() {
  state.failed = true;
  console.error("有阻塞：MySQL 未连通，不能完成真实画板数据库验收");
}

function responseMessage(response) {
  return typeof response.body === "object" && response.body
    ? response.body.message || response.body.error || ""
    : response.raw || "";
}

function assertMysqlBackedApiAvailable(label, response) {
  if (response.status === 503 && String(responseMessage(response)).includes(MYSQL_UNAVAILABLE_MESSAGE)) {
    logStep("FAIL", label, "503 MySQL unavailable for board API; board smoke cannot succeed through fallback");
    console.error("[BLOCKED] Board smoke must exercise MySQL-backed /workspace/boards APIs.");
    return false;
  }
  return true;
}

function expectApi(label, response, predicate, detail = "") {
  if (!assertMysqlBackedApiAvailable(label, response)) return false;
  if (predicate(response)) {
    logStep("PASS", label, detail || `status=${response.status}`);
    return true;
  }
  logStep("FAIL", label, `status=${response.status}, body=${response.raw || "empty"}`);
  return false;
}

function nowId(label) {
  return `${SMOKE_PREFIX}${label}_${Date.now()}`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
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

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function checkMysqlReady() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: MYSQL_HOST, port: MYSQL_PORT });
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function login(label, username, password) {
  const response = await requestJson("/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  if (response.status !== 200 || !response.body?.token) {
    logStep("FAIL", label, `status=${response.status}, body=${response.raw || "empty"}`);
    return null;
  }
  logStep("PASS", label, `user=${response.body.user?.id || "unknown"}`);
  return response.body;
}

async function cleanup() {
  if (!state.adminToken) return;

  if (state.boardId) {
    const board = await requestJson(`/workspace/boards/${encodeURIComponent(state.boardId)}`, {
      method: "DELETE",
      headers: auth(state.adminToken)
    });
    expectApi("cleanup board", board, (item) => item.status === 200 || item.status === 404, `boardId=${state.boardId}`);
  }

  if (state.projectId) {
    const project = await requestJson(`/workspace/projects/${encodeURIComponent(state.projectId)}`, {
      method: "DELETE",
      headers: auth(state.adminToken)
    });
    if (project.status === 200 || project.status === 404) {
      logStep("PASS", "cleanup project", `projectId=${state.projectId}`);
    } else {
      logStep("FAIL", "cleanup project", `status=${project.status}, body=${project.raw || "empty"}`);
    }
  }
}

async function main() {
  console.log(`Smoke boards target: ${BASE_URL}`);

  const health = await requestJson("/health");
  if (!expectApi("health", health, (item) => item.status === 200 && item.body?.ok === true, "GET /health status=200")) {
    console.error("smoke-boards: FAILED");
    process.exitCode = 1;
    return;
  }

  const mysqlReady = await checkMysqlReady();
  if (!mysqlReady) {
    logStep("FAIL", "mysql readiness", `${MYSQL_HOST}:${MYSQL_PORT} not reachable`);
    blockOnMysql();
    console.error("smoke-boards: FAILED");
    process.exitCode = 1;
    return;
  }
  logStep("PASS", "mysql readiness", `${MYSQL_HOST}:${MYSQL_PORT} reachable`);

  const admin = await login(`${ADMIN_USER} login`, ADMIN_USER, ADMIN_PASS);
  if (!admin?.token) {
    console.error("smoke-boards: FAILED");
    process.exitCode = 1;
    return;
  }
  state.adminToken = admin.token;

  const member = await login("login member", "MIX-linxin", "MIX801002");
  if (!member?.token) {
    console.error("smoke-boards: FAILED");
    process.exitCode = 1;
    return;
  }
  state.memberToken = member.token;

  try {
    const projectUid = nowId("project");
    const project = await requestJson("/workspace/projects", {
      method: "POST",
      headers: auth(state.adminToken),
      body: JSON.stringify({
        id: Date.now(),
        projectId: projectUid,
        name: projectUid,
        owner: admin.user?.name || "admin",
        members: [admin.user?.name || "admin", member.user?.name || "member"],
        memberRoles: {
          [admin.user?.name || "admin"]: "manager",
          [member.user?.name || "member"]: "readonly"
        },
        tags: []
      })
    });
    if (!expectApi("create project board", project, (item) => item.status === 201 && item.body?.projectId)) {
      return;
    }
    state.projectId = project.body.projectId;

    const boardId = nowId("board");
    const board = await requestJson("/workspace/boards", {
      method: "POST",
      headers: auth(state.adminToken),
      body: JSON.stringify({
        id: boardId,
        projectId: state.projectId,
        scopeType: "project",
        title: `${SMOKE_PREFIX}project board`,
        ownerId: admin.user?.id,
        ownerName: admin.user?.name,
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {}
      })
    });
    if (!expectApi("create project board", board, (item) => item.status === 201 && item.body?.id)) {
      return;
    }
    state.boardId = board.body.id;
    logStep("PASS", "create project board", `projectId=${state.projectId}, boardId=${state.boardId}`);

    const saved = await requestJson(`/workspace/boards/${encodeURIComponent(state.boardId)}`, {
      method: "PATCH",
      headers: auth(state.adminToken),
      body: JSON.stringify({
        title: `${SMOKE_PREFIX}project board saved`,
        elements: [{ id: `${SMOKE_PREFIX}rect`, type: "rectangle", version: 1 }],
        appState: { viewBackgroundColor: "#f8fafc" },
        files: {}
      })
    });
    expectApi(
      "save board content",
      saved,
      (item) => item.status === 200 && item.body?.elements?.[0]?.id === `${SMOKE_PREFIX}rect`,
      `version=${saved.body?.lastVersion}`
    );

    const shared = await requestJson(`/workspace/boards/${encodeURIComponent(state.boardId)}/shares`, {
      method: "PUT",
      headers: auth(state.adminToken),
      body: JSON.stringify({
        entries: [{ userId: member.user?.id, userName: member.user?.name, permission: "readonly" }]
      })
    });
    const sharedWithMember = shared.body?.sharedWith?.some(
      (entry) => entry.userId === member.user?.id && entry.permission === "readonly"
    );
    expectApi("share board", shared, (item) => item.status === 200 && sharedWithMember, `member=${member.user?.id}`);

    const memberRead = await requestJson(`/workspace/boards/${encodeURIComponent(state.boardId)}`, {
      headers: auth(state.memberToken)
    });
    expectApi(
      "member read board",
      memberRead,
      (item) => item.status === 200 && item.body?.elements?.[0]?.id === `${SMOKE_PREFIX}rect`,
      `elements=${memberRead.body?.elements?.length}`
    );

    const history = await requestJson(`/workspace/boards/${encodeURIComponent(state.boardId)}/history`, {
      headers: auth(state.adminToken)
    });
    expectApi(
      "history/snapshot check",
      history,
      (item) => item.status === 200 && Array.isArray(item.body) && item.body.length >= 2,
      `items=${history.body?.length}`
    );
  } finally {
    await cleanup();
  }

  if (state.failed) {
    console.error("smoke-boards: FAILED");
    process.exitCode = 1;
    return;
  }

  console.log("smoke-boards: PASSED");
}

main().catch((error) => {
  console.error(`[FAIL] smoke-boards runtime error - ${error.message}`);
  process.exitCode = 1;
});
