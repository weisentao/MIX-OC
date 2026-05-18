import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readDoc = (name) => readFileSync(new URL(`../docs/${name}`, import.meta.url), "utf8");

const assertIncludesAll = (text, values) => {
  for (const value of values) {
    assert.match(text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
};

test("workspace docs no longer describe board as a placeholder", () => {
  const doc = readDoc("api-workspace.md");

  assert.doesNotMatch(doc, /Board modular API is reserved for next phase/i);
  assert.doesNotMatch(doc, /GET \/boards[\s\S]*预留接口/i);
  assertIncludesAll(doc, [
    "GET /workspace/boards",
    "POST /workspace/boards",
    "PATCH /workspace/boards/:boardId",
    "DELETE /workspace/boards/:boardId",
    "GET /workspace/boards/:boardId/history",
    "MySQL unavailable for board API"
  ]);
});

test("frontend API freeze documents current service wrappers", () => {
  const doc = readDoc("frontend-api-contract.md");

  assertIncludesAll(doc, [
    "N:\\mutou\\xm\\xjg\\src\\services",
    "/api",
    "src/services/auth.js",
    "src/services/workspaceApi.js",
    "src/services/scheduleApi.js",
    "| POST | /login |",
    "| GET | /workspace/bootstrap |",
    "| PATCH | /workspace/boards/:boardId |",
    "| POST | /workspace/projects/:projectId/schedule/export |",
    "Authorization: Bearer <token>",
    "503"
  ]);
});

test("schedule API contract documents frontend paths and MySQL launch blocker", () => {
  const doc = readDoc("schedule-api.md");

  assertIncludesAll(doc, [
    "GET /workspace/projects/:projectId/schedule",
    "POST /workspace/projects/:projectId/schedule/items",
    "PUT /workspace/schedule/items/:itemId",
    "DELETE /workspace/schedule/items/:itemId",
    "GET /workspace/schedule/items/:itemId/comments",
    "POST /workspace/schedule/items/:itemId/comments",
    "PUT /workspace/schedule/items/:itemId/comments/:commentId",
    "DELETE /workspace/schedule/items/:itemId/comments/:commentId",
    "GET /workspace/projects/:projectId/schedule/snapshots",
    "POST /workspace/projects/:projectId/schedule/snapshots",
    "GET /workspace/schedule/templates",
    "POST /workspace/schedule/templates",
    "POST /workspace/projects/:projectId/schedule/export",
    "Export requires project `view` plus global `canExport`",
    "`admin` and `manager` can export; `employee` cannot export",
    "`format: \"pdf\"` is accepted as a request value but still returns HTML",
    "requestedFormat",
    "effectiveFormat",
    "htmlOnly",
    "MySQL unavailable for schedule API",
    "503",
    "上线阻塞"
  ]);
});

test("permission matrix records schedule export canExport gate", () => {
  const doc = readDoc("permission-matrix.md");

  assertIncludesAll(doc, [
    "Schedule export requires project `view` plus global `canExport`",
    "`admin` and `manager` can export",
    "`employee` cannot export"
  ]);
  assert.doesNotMatch(doc, /Schedule export currently follows project `view`/i);
});

test("production readiness gates reject frontend fallback as evidence", () => {
  const doc = readDoc("production-readiness-checklist.md");

  assertIncludesAll(doc, [
    "前端 fallback 不可作为通过依据",
    "workspace smoke",
    "board smoke",
    "schedule smoke",
    "npm run smoke:production",
    "npm run smoke:boards",
    "npm run smoke:schedule"
  ]);
});

test("ops runbook documents page-open API-failing MySQL triage", () => {
  const doc = readDoc("ops-runbook.md");

  assertIncludesAll(doc, [
    "页面能打开但 MySQL-backed API 失败",
    "/workspace/bootstrap",
    "/workspace/boards",
    "/workspace/projects/:projectId/schedule",
    "503",
    "MySQL unavailable",
    "npm run db:check:production",
    "npm run smoke:production",
    "npm run smoke:boards",
    "npm run smoke:schedule"
  ]);
});

test("production MySQL runbook keeps ECONNREFUSED triage read-only", () => {
  const doc = readDoc("production-mysql-runbook.md");

  assertIncludesAll(doc, [
    "ECONNREFUSED is a listener-level failure",
    "Do not run npm run db:prepare:production to fix ECONNREFUSED",
    "Get-Service | Where-Object",
    "Get-NetTCPConnection -LocalPort 3306 -State Listen",
    "Get-Command mysql,mysqld,mariadb,mariadbd"
  ]);
});

test("production MySQL runbook documents project portable MySQL", () => {
  const doc = readDoc("production-mysql-runbook.md");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  assertIncludesAll(doc, [
    "Project Portable MySQL ZIP",
    "N:\\mutou\\.runtime\\mysql\\mysql-8.4.9-winx64",
    "N:\\mutou\\.runtime\\mysql-data",
    "scripts\\portable-mysql.ps1 start",
    "scripts\\portable-mysql.ps1 stop",
    "Do not install MySQL to C:",
    "must not clear business data"
  ]);
  assertIncludesAll(readme, [
    "Project Portable MySQL",
    "N:\\mutou\\.runtime\\mysql\\mysql-8.4.9-winx64",
    "N:\\mutou\\.runtime\\mysql-data",
    "scripts\\portable-mysql.ps1 status"
  ]);
});
