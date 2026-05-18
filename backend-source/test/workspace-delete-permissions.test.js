import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import workspaceRoutes from "../src/routes/workspace.routes.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { requestLogger } from "../src/middlewares/requestLogger.js";
import { signAccessToken } from "../src/config/jwt.js";

function requestDelete(app, path, auth, requestId = "req-delete-permission") {
  const token = signAccessToken(auth);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "DELETE",
          headers: {
            "x-request-id": requestId,
            authorization: `Bearer ${token}`
          }
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            server.close(() => {
              resolve({
                status: res.statusCode,
                body: body ? JSON.parse(body) : null
              });
            });
          });
        }
      );
      req.on("error", (error) => {
        server.close(() => reject(error));
      });
      req.end();
    });
  });
}

function makeApp() {
  const app = express();
  app.use(requestLogger);
  app.use(workspaceRoutes);
  app.use(errorHandler);
  return app;
}

test("manager cannot delete workspace projects before DB mutation and keeps requestId error format", async () => {
  const response = await requestDelete(makeApp(), "/workspace/projects/project-001", { sub: "u-manager", role: "manager" }, "req-project-delete");

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    code: "FORBIDDEN",
    message: "无权限执行该操作",
    requestId: "req-project-delete"
  });
});

test("employee cannot delete workspace project groups before DB mutation and keeps requestId error format", async () => {
  const response = await requestDelete(makeApp(), "/workspace/project-groups/group-001", { sub: "u-employee", role: "employee" }, "req-group-delete");

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    code: "FORBIDDEN",
    message: "无权限执行该操作",
    requestId: "req-group-delete"
  });
});

test("manager cannot delete workspace tags before DB mutation and keeps requestId error format", async () => {
  const response = await requestDelete(makeApp(), "/workspace/tags/red", { sub: "u-manager", role: "manager" }, "req-tag-delete");

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    code: "FORBIDDEN",
    message: "无权限执行该操作",
    requestId: "req-tag-delete"
  });
});

test("admin passes delete permission gate and reaches workspace project delete service", async () => {
  const response = await requestDelete(makeApp(), "/workspace/projects/project-001", { sub: "u-admin", role: "admin" }, "req-admin-project-delete");

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    code: "SERVICE_UNAVAILABLE",
    message: "数据库服务暂不可用，请稍后重试",
    requestId: "req-admin-project-delete"
  });
});
