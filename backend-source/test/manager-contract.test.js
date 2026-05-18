import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routeSource = readFileSync(new URL("../src/modules/manager/manager.routes.js", import.meta.url), "utf8");
const rootRoutesSource = readFileSync(new URL("../src/routes/index.js", import.meta.url), "utf8");
const aiRoutesSource = readFileSync(new URL("../src/modules/ai/ai.routes.js", import.meta.url), "utf8");
const workspaceServiceSource = readFileSync(new URL("../src/services/workspace.service.js", import.meta.url), "utf8");
const adminManagerContractSource = readFileSync(new URL("../docs/admin-manager-api-contract.md", import.meta.url), "utf8");
const managerApiSource = readFileSync(new URL("../../frontend-source/src/services/managerApi.js", import.meta.url), "utf8");

test("manager facade exposes frontend-reserved manager console endpoints", () => {
  const routes = [
    ["get", "/manager/overview"],
    ["get", "/manager/departments/:departmentId"],
    ["get", "/manager/members"],
    ["get", "/manager/members/:userId"],
    ["patch", "/manager/members/:userId"],
    ["post", "/manager/members/:userId/reset-password"],
    ["get", "/manager/projects"],
    ["post", "/manager/projects"],
    ["get", "/manager/projects/:projectId"],
    ["patch", "/manager/projects/:projectId"],
    ["post", "/manager/projects/:projectId/archive"],
    ["delete", "/manager/projects/:projectId"],
    ["get", "/manager/projects/:projectId/tasks"],
    ["post", "/manager/projects/:projectId/tasks"],
    ["patch", "/manager/tasks/:taskId"],
    ["delete", "/manager/tasks/:taskId"],
    ["get", "/manager/projects/:projectId/comments"],
    ["post", "/manager/comments/:commentId/resolve"],
    ["get", "/manager/projects/:projectId/schedule"],
    ["post", "/manager/projects/:projectId/schedule/export"],
    ["get", "/manager/projects/:projectId/members"],
    ["patch", "/manager/projects/:projectId/members/:userId"],
    ["get", "/manager/projects/:projectId/boards"],
    ["post", "/manager/projects/:projectId/boards"],
    ["patch", "/manager/projects/:projectId/boards/:boardId"],
    ["get", "/manager/projects/:projectId/templates"],
    ["post", "/manager/projects/:projectId/templates"],
    ["get", "/manager/projects/:projectId/tags-archives"],
    ["post", "/manager/projects/:projectId/tags"],
    ["post", "/manager/projects/:projectId/tags/:tagId/archive"],
    ["get", "/manager/accounts"],
    ["get", "/manager/ai/config", aiRoutesSource],
    ["get", "/manager/ai/logs", aiRoutesSource]
  ];

  for (const [method, path, source = routeSource] of routes) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(source, new RegExp(`router\\.${method}\\("${escapedPath}"`, "i"), `missing ${method.toUpperCase()} ${path}`);
  }
});

test("manager facade is root mounted and mirrors frontend managerApi paths", () => {
  assert.match(rootRoutesSource, /managerRoutes/);
  assert.match(rootRoutesSource, /router\.use\(managerRoutes\)/);
  assert.match(routeSource, /authRequired/);
  assert.match(routeSource, /requireRole\(MANAGER_ROLES\)/);
  assert.match(routeSource, /"department_admin"/);
  assert.match(routeSource, /"department_manager"/);
  assert.match(routeSource, /"project_manager"/);

  for (const path of [
    "/manager/overview",
    "/manager/members",
    "/manager/projects",
    "/manager/projects/${encodePath(projectId)}/boards",
    "/manager/projects/${encodePath(projectId)}/schedule/export",
    "/manager/accounts",
    "/manager/ai/config",
    "/manager/ai/logs"
  ]) {
    assert.ok(managerApiSource.includes(path), `managerApi should include ${path}`);
  }
});

test("manager facade marks review-only operations with operation ids and audit intent", () => {
  assert.match(routeSource, /function managerReviewResult/);
  assert.match(routeSource, /operationId: makeOperationId\("mgr-review"\)/);
  assert.match(routeSource, /auditIntent/);
  assert.match(routeSource, /pendingAdminReview: true/);
  assert.match(routeSource, /safeAudit/);
});

test("manager facade rejects dangerous global role grants", () => {
  assert.match(routeSource, /manager cannot grant admin role/);
  assert.match(routeSource, /\["admin", "super_admin", "superadmin", "root"\]/);
  assert.match(routeSource, /project member role is invalid/);
});

test("manager project tag archive does not hard-delete global tags", () => {
  assert.doesNotMatch(routeSource, /import\s*\{[^}]*deleteTag/);
  assert.doesNotMatch(routeSource, /deleteTag\(req\.params\.tagId\)/);
  assert.match(routeSource, /globalDeleteBlocked: true/);
  assert.match(routeSource, /project_tag\.archive\.request/);
});

test("manager tag creation is documented as global tag library compatible", () => {
  assert.match(routeSource, /createTag\(req\.body \|\| \{\}, actorId\(req\.auth \|\| \{\}\)\)/);
  assert.match(workspaceServiceSource, /id: row\.tag_uid \|\| row\.name/);
  assert.match(workspaceServiceSource, /tagId: row\.tag_uid \|\| row\.name/);
  assert.match(workspaceServiceSource, /return \{ id: tagUid, tagId: tagUid, name, color, scope, status, sortOrder \}/);
  assert.match(adminManagerContractSource, /global tag library entry/);
  assert.match(adminManagerContractSource, /project binding remains controlled/);
});
