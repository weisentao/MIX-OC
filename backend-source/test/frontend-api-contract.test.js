import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const frontendRoot = new URL("../../frontend-source/", import.meta.url);
const backendRoot = new URL("../", import.meta.url);

const readFrontend = (path) => readFileSync(new URL(path, frontendRoot), "utf8");
const readBackend = (path) => readFileSync(new URL(path, backendRoot), "utf8");

const routeSources = [
  "src/routes/auth.routes.js",
  "src/routes/appState.routes.js",
  "src/routes/workspace.routes.js",
  "src/routes/schedule.routes.js",
  "src/routes/template.routes.js",
  "src/modules/admin/admin.routes.js",
  "src/modules/ai/ai.routes.js",
  "src/modules/hr/hr.routes.js",
  "src/modules/manager/manager.routes.js"
].map(readBackend).join("\n");

const docSources = [
  "docs/auth-api.md",
  "docs/api-workspace.md",
  "docs/board-api.md",
  "docs/schedule-api.md",
  "docs/admin-manager-api-contract.md",
  "docs/ai-assistant-api-contract.md",
  "docs/frontend-api-contract.md"
].map(readBackend).join("\n");

const frontendContracts = [
  {
    file: "src/services/auth.js",
    paths: [
      ["post", "/login", ["username", "password"]],
      ["post", "/register", ["username", "password", "name", "phone"]],
      ["get", "/security-question", ["username"]],
      ["post", "/forgot-password", ["username", "phone", "newPassword"]],
      ["post", "/change-password", ["oldPassword", "newPassword"]],
      ["get", "/me", []]
    ]
  },
  {
    file: "src/services/workspaceApi.js",
    paths: [
      ["get", "/workspace/bootstrap", []],
      ["get", "/workspace/project-groups", []],
      ["post", "/workspace/project-groups", ["title", "suffix", "status", "sortOrder"]],
      ["put", "/workspace/project-groups/:id", ["title", "suffix", "status", "sortOrder"]],
      ["delete", "/workspace/project-groups/:id", []],
      ["get", "/workspace/projects", []],
      ["post", "/workspace/projects", ["name", "groupId", "owner", "members", "memberRoles", "tags", "syncSchedule"]],
      ["put", "/workspace/projects/:id", ["name", "groupId", "owner", "members", "memberRoles", "tags", "syncSchedule"]],
      ["delete", "/workspace/projects/:id", []],
      ["get", "/workspace/projects/:projectId/tasks", []],
      ["post", "/workspace/projects/:projectId/tasks", ["title", "type", "module", "owner", "startDate", "endDate", "status"]],
      ["put", "/workspace/tasks/:taskId", ["title", "type", "module", "owner", "startDate", "endDate", "status"]],
      ["delete", "/workspace/tasks/:taskId", []],
      ["post", "/workspace/tasks/:taskId/comments", ["text"]],
      ["get", "/workspace/tags", []],
      ["post", "/workspace/tags", ["name", "color", "scope", "status", "sortOrder"]],
      ["delete", "/workspace/tags/:name", []],
      ["get", "/workspace/boards", ["projectId"]],
      ["post", "/workspace/boards", ["projectId", "scopeType", "title", "ownerId", "ownerName", "elements", "appState", "files"]],
      ["get", "/workspace/boards/:boardId", []],
      ["patch", "/workspace/boards/:boardId", ["title", "elements", "appState", "files"]],
      ["delete", "/workspace/boards/:boardId", []],
      ["put", "/workspace/boards/:boardId/shares", ["entries"]],
      ["get", "/workspace/boards/:boardId/history", []],
      ["post", "/workspace/boards/:boardId/sync", ["save", "includeHistory", "baseVersion", "lastVersion", "elements", "appState", "files"]]
    ]
  },
  {
    file: "src/services/scheduleApi.js",
    paths: [
      ["get", "/workspace/projects/:projectId/schedule", []],
      ["post", "/workspace/projects/:projectId/schedule/items", ["title", "type", "module", "owner", "startDate", "endDate", "status", "progress", "addToTaskList", "linkTask", "linkFlow", "note", "dependencyIds"]],
      ["put", "/workspace/schedule/items/:itemId", ["title", "module", "owner", "startDate", "endDate", "status", "progress", "note", "linkTask", "linkFlow"]],
      ["delete", "/workspace/schedule/items/:itemId", []],
      ["get", "/workspace/projects/:projectId/schedule/snapshots", []],
      ["post", "/workspace/projects/:projectId/schedule/snapshots", ["title", "snapshot"]],
      ["get", "/workspace/schedule/templates", []],
      ["post", "/workspace/schedule/templates", ["title", "description", "visibility", "template", "payload"]],
      ["post", "/workspace/projects/:projectId/schedule/export", ["format"]],
      ["get", "/workspace/schedule/items/:itemId/comments", []],
      ["post", "/workspace/schedule/items/:itemId/comments", ["content", "payload"]]
    ]
  },
  {
    file: "src/stores/workspace/actions/appActions.js",
    paths: [
      ["get", "/appState/main", []],
      ["put", "/appState/main", []]
    ]
  },
  {
    file: "src/services/aiApi.js",
    paths: [
      ["get", "/workspace/ai/settings", []],
      ["post", "/workspace/ai/chat", []]
    ]
  },
  {
    file: "src/services/resourceApi.js",
    paths: [
      ["get", "/workspace/resources", []],
      ["get", "/workspace/workload", []],
      ["post", "/workspace/assignments/preview", []],
      ["post", "/workspace/assignments/confirm", []],
      ["post", "/workspace/assignments/force-confirm", []],
      ["post", "/workspace/resources/ai/assignment-advice", []],
      ["patch", "/workspace/resources/work-items/:workItemId/schedule", []]
    ]
  },
  {
    file: "src/services/adminApi.js",
    paths: [
      ["get", "/admin/dashboard", []],
      ["get", "/admin/users", []],
      ["post", "/admin/users", []],
      ["get", "/admin/users/:userId", []],
      ["patch", "/admin/users/:userId", []],
      ["delete", "/admin/users/:userId", []],
      ["get", "/admin/permissions", []],
      ["patch", "/admin/permissions", []],
      ["get", "/admin/projects", []],
      ["post", "/admin/projects", []],
      ["get", "/admin/projects/:projectId", []],
      ["patch", "/admin/projects/:projectId", []],
      ["post", "/admin/projects/:projectId/archive", []],
      ["delete", "/admin/projects/:projectId", []],
      ["get", "/admin/tasks", []],
      ["post", "/admin/tasks", []],
      ["patch", "/admin/tasks/:taskId", []],
      ["delete", "/admin/tasks/:taskId", []],
      ["get", "/admin/comments/risk", []],
      ["post", "/admin/comments/:commentId/resolve", []],
      ["get", "/admin/schedules", []],
      ["get", "/admin/boards", []],
      ["patch", "/admin/boards/:boardId", []],
      ["delete", "/admin/boards/:boardId", []],
      ["get", "/admin/templates", []],
      ["post", "/admin/templates", []],
      ["patch", "/admin/templates/:templateId", []],
      ["delete", "/admin/templates/:templateId", []],
      ["get", "/admin/tags", []],
      ["post", "/admin/tags", []],
      ["delete", "/admin/tags/:tagId", []],
      ["get", "/admin/notices", []],
      ["post", "/admin/notices", []],
      ["patch", "/admin/notices/:noticeId", []],
      ["get", "/admin/departments", []],
      ["post", "/admin/departments", []],
      ["patch", "/admin/departments/:departmentId", []],
      ["delete", "/admin/departments/:departmentId", []],
      ["get", "/admin/archives", []],
      ["post", "/admin/archives/:archiveId/restore", []],
      ["delete", "/admin/archives/:archiveId", []],
      ["get", "/admin/ai/config", []],
      ["patch", "/admin/ai/config", []],
      ["get", "/admin/ai/models", []],
      ["get", "/admin/ai/usage-logs", []],
      ["get", "/admin/ai/documents", []],
      ["post", "/admin/ai/documents", []],
      ["patch", "/admin/ai/documents/:documentId", []],
      ["delete", "/admin/ai/documents/:documentId", []],
      ["get", "/admin/system/status", []],
      ["get", "/admin/audit-logs", []]
    ]
  },
  {
    file: "src/services/managerApi.js",
    paths: [
      ["get", "/manager/overview", []],
      ["get", "/manager/departments/:departmentId", []],
      ["get", "/manager/members", []],
      ["get", "/manager/members/:userId", []],
      ["patch", "/manager/members/:userId", []],
      ["post", "/manager/members/:userId/reset-password", []],
      ["get", "/manager/projects", []],
      ["post", "/manager/projects", []],
      ["get", "/manager/projects/:projectId", []],
      ["patch", "/manager/projects/:projectId", []],
      ["post", "/manager/projects/:projectId/archive", []],
      ["delete", "/manager/projects/:projectId", []],
      ["get", "/manager/projects/:projectId/tasks", []],
      ["post", "/manager/projects/:projectId/tasks", []],
      ["patch", "/manager/tasks/:taskId", []],
      ["delete", "/manager/tasks/:taskId", []],
      ["get", "/manager/projects/:projectId/comments", []],
      ["post", "/manager/comments/:commentId/resolve", []],
      ["get", "/manager/projects/:projectId/schedule", []],
      ["post", "/manager/projects/:projectId/schedule/export", []],
      ["get", "/manager/projects/:projectId/members", []],
      ["patch", "/manager/projects/:projectId/members/:userId", []],
      ["get", "/manager/projects/:projectId/boards", []],
      ["post", "/manager/projects/:projectId/boards", []],
      ["patch", "/manager/projects/:projectId/boards/:boardId", []],
      ["get", "/manager/projects/:projectId/templates", []],
      ["post", "/manager/projects/:projectId/templates", []],
      ["get", "/manager/projects/:projectId/tags-archives", []],
      ["post", "/manager/projects/:projectId/tags", []],
      ["post", "/manager/projects/:projectId/tags/:tagId/archive", []],
      ["get", "/manager/accounts", []],
      ["get", "/manager/ai/logs", []],
      ["get", "/workspace/ai/logs", []],
      ["get", "/manager/ai/config", []],
      ["get", "/workspace/ai/settings", []]
    ]
  }
];

function routeLiteral(path) {
  return path.replace(/:[^/]+/g, (_, offset) => {
    const name = path.slice(offset + 1).split("/")[0];
    return `:${name}`;
  });
}

function assertFrontendUsesContract({ file, paths }) {
  const source = readFrontend(file);
  for (const [method, path] of paths) {
    const staticPrefix = path.split("/:")[0];
    assert.match(source, new RegExp(method, "i"), `${file} should call ${method.toUpperCase()} ${path}`);
    assert.match(source, new RegExp(staticPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} should contain ${path}`);
  }
}

function assertBackendRoutesContract(paths) {
  for (const [method, path] of paths) {
    const route = routeLiteral(path);
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(routeSources, new RegExp(`router\\.${method}\\("${escapedRoute}"`, "i"), `missing backend route ${method.toUpperCase()} ${path}`);
  }
}

function assertDocsFreezeContract(paths) {
  for (const [method, path, fields] of paths) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const methodCell = `${method.toUpperCase()}(?:/[A-Z]+)*`;
    assert.match(docSources, new RegExp(`${methodCell}\\s*(?:\\|\\s*)?\`?${escapedPath}\`?`, "i"), `missing docs entry ${method.toUpperCase()} ${path}`);
    for (const field of fields) {
      assert.match(docSources, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `missing docs field ${field} for ${path}`);
    }
  }
}

test("frontend API wrappers are frozen against backend routes and docs", () => {
  for (const contract of frontendContracts) {
    assertFrontendUsesContract(contract);
    assertBackendRoutesContract(contract.paths);
    assertDocsFreezeContract(contract.paths);
  }
});
