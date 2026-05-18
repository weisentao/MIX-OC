import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import express from "express";
import workspaceRoutes from "../src/routes/workspace.routes.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { requestLogger } from "../src/middlewares/requestLogger.js";
import { signAccessToken } from "../src/config/jwt.js";

function requestJson(app, { method, path, auth, body, requestId = "req-workspace-permission" }) {
  const token = signAccessToken(auth);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const data = body === undefined ? "" : JSON.stringify(body);
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: {
            "x-request-id": requestId,
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "content-length": Buffer.byteLength(data)
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
      req.end(data);
    });
  });
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.use(workspaceRoutes);
  app.use(errorHandler);
  return app;
}

test("workspace project creation is not blocked by the global write role gate", async () => {
  const controllerSource = await readFile("src/controllers/workspace.controller.js", "utf8");
  const serviceSource = await readFile("src/services/workspace.service.js", "utf8");
  const managerRoutesSource = await readFile("src/modules/manager/manager.routes.js", "utf8");
  const postProjectStart = controllerSource.indexOf("export async function postProject(");
  const postProjectEnd = controllerSource.indexOf("export async function putProject(", postProjectStart);
  const createProjectStart = serviceSource.indexOf("export async function createProject(");
  const createProjectEnd = serviceSource.indexOf("export async function updateProject(", createProjectStart);
  const managerPostProjectStart = managerRoutesSource.indexOf('router.post("/manager/projects"');
  const managerPostProjectEnd = managerRoutesSource.indexOf('router.get("/manager/projects/:projectId"', managerPostProjectStart);

  assert.notEqual(postProjectStart, -1, "postProject should exist");
  assert.notEqual(postProjectEnd, -1, "putProject should follow postProject");
  assert.notEqual(createProjectStart, -1, "createProject should exist");
  assert.notEqual(createProjectEnd, -1, "updateProject should follow createProject");
  assert.notEqual(managerPostProjectStart, -1, "manager project create route should exist");
  assert.notEqual(managerPostProjectEnd, -1, "manager project detail route should follow create route");

  const postProjectSource = controllerSource.slice(postProjectStart, postProjectEnd);
  const createProjectSource = serviceSource.slice(createProjectStart, createProjectEnd);
  const managerPostProjectSource = managerRoutesSource.slice(managerPostProjectStart, managerPostProjectEnd);
  assert.doesNotMatch(postProjectSource, /assertRoleCan\(req\.auth\s*\|\|\s*\{\},\s*"write"\)/);
  assert.doesNotMatch(managerPostProjectSource, /assertRoleCan\(req\.auth\s*\|\|\s*\{\},\s*"write"\)/);
  assert.match(serviceSource, /async function ensureActorProjectManager\(/);
  assert.match(createProjectSource, /await ensureActorProjectManager\(projectUid,\s*actor\)/);
});

test("employee cannot create workspace tags before DB mutation", async () => {
  const response = await requestJson(makeApp(), {
    method: "POST",
    path: "/workspace/tags",
    auth: { sub: "u-employee", role: "employee" },
    body: { name: "blocked-tag" },
    requestId: "req-tag-create"
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    code: "FORBIDDEN",
    message: "No permission to write",
    requestId: "req-tag-create"
  });
});

test("employee cannot create workspace project groups before DB mutation", async () => {
  const response = await requestJson(makeApp(), {
    method: "POST",
    path: "/workspace/project-groups",
    auth: { sub: "u-employee", role: "employee" },
    body: { title: "blocked group" },
    requestId: "req-group-create"
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    code: "FORBIDDEN",
    message: "No permission to write",
    requestId: "req-group-create"
  });
});

test("workspace service exposes project authorization helpers for list, share, write, and delete boundaries", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");

  assert.match(source, /async function getProjectPermission\(/);
  assert.match(source, /async function requireProjectPermission\(/);
  assert.match(source, /function projectListAccessFilter\(/);
  assert.match(source, /view:\s*\["admin",\s*"owner",\s*"manager",\s*"editor",\s*"readonly"\]/);
  assert.match(source, /edit:\s*\["admin",\s*"owner",\s*"manager",\s*"editor"\]/);
  assert.match(source, /manage:\s*\["admin",\s*"owner",\s*"manager"\]/);
  assert.match(source, /delete:\s*\["admin"\]/);
});

test("workspace task comments use view permission so readonly members can comment", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const start = source.indexOf("export async function addTaskComment(");
  const end = source.indexOf("export async function listAddressBook(", start);
  assert.notEqual(start, -1, "addTaskComment should exist");
  assert.notEqual(end, -1, "listAddressBook should follow addTaskComment");

  const addTaskCommentSource = source.slice(start, end);
  assert.match(addTaskCommentSource, /await requireProjectPermission\(project, auth, "view"\)/);
  assert.doesNotMatch(addTaskCommentSource, /await requireProjectPermission\(project, auth, "edit"\)/);
});

test("workspace list queries are filtered by the current actor unless admin", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const start = source.indexOf("async function fetchProjects(");
  const end = source.indexOf("async function fetchRootAndGroupedProjects(", start);
  const filterStart = source.indexOf("async function projectListAccessFilter(");
  const filterEnd = source.indexOf("async function upsertProjectMemberFromUser(", filterStart);
  assert.notEqual(start, -1, "fetchProjects function should exist");
  assert.notEqual(end, -1, "fetchRootAndGroupedProjects should follow fetchProjects");
  assert.notEqual(filterStart, -1, "projectListAccessFilter function should exist");
  assert.notEqual(filterEnd, -1, "upsertProjectMemberFromUser should follow projectListAccessFilter");

  const fetchProjectsSource = source.slice(start, end);
  const projectListAccessFilterSource = source.slice(filterStart, filterEnd);
  assert.match(fetchProjectsSource, /projectListAccessFilter\(auth\)/);
  assert.match(projectListAccessFilterSource, /p\.created_by = \?/);
  assert.match(projectListAccessFilterSource, /EXISTS \(\s*SELECT 1 FROM shares s/);
  assert.match(projectListAccessFilterSource, /EXISTS \(\s*SELECT 1 FROM project_members pm/);
});
