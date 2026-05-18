import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import express from "express";
import routes from "../src/routes/index.js";
import scheduleRoutes from "../src/routes/schedule.routes.js";
import workspaceRoutes from "../src/routes/workspace.routes.js";
import { signAccessToken } from "../src/config/jwt.js";
import { errorHandler, notFoundHandler } from "../src/middlewares/errorHandler.js";

function requestJson(app, { method = "GET", path, auth = { sub: "u-compat", role: "admin" }, body = null, headers = {} }) {
  const token = signAccessToken(auth);
  const payload = body === null ? "" : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            ...headers
          }
        },
        (res) => {
          let responseBody = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            responseBody += chunk;
          });
          res.on("end", () => {
            server.close(() => {
              resolve({
                status: res.statusCode,
                body: responseBody ? JSON.parse(responseBody) : null
              });
            });
          });
        }
      );

      req.on("error", (error) => {
        server.close(() => reject(error));
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(scheduleRoutes);
  app.use(workspaceRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeMountedApp() {
  const app = express();
  app.use(express.json());
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

test("legacy workspace task path returns explicit 400 instead of bare 404 when project id is missing", async () => {
  const response = await requestJson(makeApp(), {
    method: "POST",
    path: "/workspace/projects/tasks",
    body: { title: "Legacy task without project" }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "BAD_REQUEST");
  assert.match(response.body.message, /projectId or projectUid is required/);
});

test("legacy workspace schedule path returns explicit 400 instead of bare 404 when project id is missing", async () => {
  const response = await requestJson(makeApp(), {
    path: "/workspace/projects/schedule"
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "BAD_REQUEST");
  assert.match(response.body.message, /projectId or projectUid is required/);
});

test("legacy task-like schedule item update path is routed instead of bare 404", async () => {
  const response = await requestJson(makeApp(), {
    method: "PUT",
    path: "/workspace/schedule/items/task-1",
    body: { title: "Legacy task update", taskUid: "1" }
  });

  assert.notEqual(response.status, 404);
  assert.equal(response.status, 503);
  assert.equal(response.body.code, "SERVICE_UNAVAILABLE");
  assert.match(response.body.message, /MySQL unavailable for schedule API/);
});

test("mounted router keeps legacy errors clear and real project schedule route reachable", async () => {
  const missingLegacy = await requestJson(makeMountedApp(), {
    path: "/workspace/projects/schedule"
  });
  const realProjectRoute = await requestJson(makeMountedApp(), {
    path: "/workspace/projects/project-compat/schedule"
  });

  assert.equal(missingLegacy.status, 400);
  assert.equal(missingLegacy.body.code, "BAD_REQUEST");
  assert.match(missingLegacy.body.message, /projectId or projectUid is required/);

  assert.notEqual(realProjectRoute.status, 404);
  assert.equal(realProjectRoute.status, 503);
  assert.equal(realProjectRoute.body.code, "SERVICE_UNAVAILABLE");
  assert.match(realProjectRoute.body.message, /MySQL unavailable for schedule API/);
});

test("legacy project compatibility handlers forward supplied project ids to existing services", async () => {
  const workspaceControllerSource = await readFile("src/controllers/workspace.controller.js", "utf8");
  const scheduleControllerSource = await readFile("src/controllers/schedule.controller.js", "utf8");
  const legacyTaskStart = workspaceControllerSource.indexOf("export async function postLegacyProjectTask");
  const legacyTaskEnd = workspaceControllerSource.indexOf("export async function putTask", legacyTaskStart);
  const legacyScheduleStart = scheduleControllerSource.indexOf("export async function getLegacyProjectSchedule");
  const legacyScheduleEnd = scheduleControllerSource.indexOf("export async function postSchedule", legacyScheduleStart);
  const legacyTaskSource = workspaceControllerSource.slice(legacyTaskStart, legacyTaskEnd);
  const legacyScheduleSource = scheduleControllerSource.slice(legacyScheduleStart, legacyScheduleEnd);

  assert.match(legacyTaskSource, /legacyProjectIdFromTaskRequest\(req\)/);
  assert.match(legacyTaskSource, /createTask\(projectId, req\.body \|\| \{\}, req\.auth \|\| \{\}\)/);
  assert.match(legacyScheduleSource, /legacyProjectIdFromScheduleRequest\(req\)/);
  assert.match(legacyScheduleSource, /getProjectSchedule\(projectId, req\.auth \|\| \{\}\)/);
});

test("legacy compatibility routes are registered before parameterized project routes", async () => {
  const workspaceRoutesSource = await readFile("src/routes/workspace.routes.js", "utf8");
  const scheduleRoutesSource = await readFile("src/routes/schedule.routes.js", "utf8");

  assert.match(
    workspaceRoutesSource,
    /router\.post\("\/workspace\/projects\/tasks", authRequired, postLegacyProjectTask\)/
  );
  assert.ok(
    workspaceRoutesSource.indexOf('router.post("/workspace/projects/tasks", authRequired, postLegacyProjectTask)') <
      workspaceRoutesSource.indexOf('router.get("/workspace/projects/:projectId/tasks", authRequired, getProjectTasks)'),
    "legacy task route must be registered before /workspace/projects/:projectId/tasks"
  );

  assert.match(
    scheduleRoutesSource,
    /router\.get\("\/workspace\/projects\/schedule", authRequired, getLegacyProjectSchedule\)/
  );
  assert.ok(
    scheduleRoutesSource.indexOf('router.get("/workspace/projects/schedule", authRequired, getLegacyProjectSchedule)') <
      scheduleRoutesSource.indexOf('router.get("/workspace/projects/:projectId/schedule", authRequired, getSchedule)'),
    "legacy schedule route must be registered before /workspace/projects/:projectId/schedule"
  );
});

test("schedule service resolves task-* item ids through linked task_uid before returning not found", async () => {
  const source = await readFile("src/services/schedule.service.js", "utf8");
  const candidateStart = source.indexOf("function taskUidCandidatesFromItemId");
  const candidateEnd = source.indexOf("function scheduleItemLinkRequired", candidateStart);
  const resolverStart = source.indexOf("async function resolveScheduleItemByAnyId");
  const resolverEnd = source.indexOf("async function resolveExistingScheduleItemForWrite", resolverStart);
  const updateStart = source.indexOf("export async function updateScheduleItem");
  const updateEnd = source.indexOf("export async function listScheduleItemComments", updateStart);
  const candidateSource = source.slice(candidateStart, candidateEnd);
  const resolverSource = source.slice(resolverStart, resolverEnd);
  const updateSource = source.slice(updateStart, updateEnd);

  assert.match(source, /function isTaskLikeScheduleItemId\(/);
  assert.match(candidateSource, /compatibleField\(payload, \["taskUid", "task_uid", "taskId", "task_id"\]\)/);
  assert.match(candidateSource, /replace\(\/\^task\[-_\]\/i, ""\)/);
  assert.match(resolverSource, /WHERE si\.task_uid IN \(\$\{placeholders\}\) AND si\.hidden = 0/);
  assert.match(resolverSource, /throw scheduleItemLinkRequired\(taskUidCandidates\[0\]\)/);
  assert.match(updateSource, /resolveExistingScheduleItemForWrite\(itemId, payload\)/);
});

test("schedule service upserts local client ids instead of failing update sync", async () => {
  const source = await readFile("src/services/schedule.service.js", "utf8");
  const resolverStart = source.indexOf("async function resolveExistingScheduleItemForWrite");
  const resolverEnd = source.indexOf("async function fetchTaskByUid", resolverStart);
  const createStart = source.indexOf("export async function createScheduleItem");
  const updateStart = source.indexOf("export async function updateScheduleItem");
  const commentsStart = source.indexOf("export async function listScheduleItemComments", updateStart);
  const resolverSource = source.slice(resolverStart, resolverEnd);
  const createSource = source.slice(createStart, updateStart);
  const updateSource = source.slice(updateStart, commentsStart);

  assert.notEqual(resolverStart, -1, "write resolver should exist");
  assert.match(source, /function clientItemIdCandidatesFromPayload\(/);
  assert.match(resolverSource, /payload_json LIKE \?/);
  assert.match(resolverSource, /return null/);
  assert.match(updateSource, /if \(!current\) \{/);
  assert.match(updateSource, /return createScheduleItem\(projectId, \{/);
  assert.match(createSource, /clientItemId/);
  assert.match(createSource, /buildScheduleItemMutationResponse/);
  assert.match(updateSource, /buildScheduleItemMutationResponse/);
});
