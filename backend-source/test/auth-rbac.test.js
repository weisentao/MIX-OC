import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import { signAccessToken } from "../src/config/jwt.js";
import {
  authRequired,
  getRolePermissions,
  hasPermission,
  requirePermission,
  requireRole
} from "../src/middlewares/auth.js";

function requestJson(app, path, auth, requestId = "req-rbac") {
  const token = signAccessToken(auth);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "GET",
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

function makeApp(gate) {
  const app = express();
  app.use((req, res, next) => {
    req.requestId = String(req.headers["x-request-id"] || "");
    if (req.requestId) res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.get("/protected", authRequired, gate, (req, res) => {
    res.json({ ok: true, role: req.auth.role, permissions: req.auth.permissions });
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.statusCode || 500;
    const body = {
      code: status === 403 ? "FORBIDDEN" : "REQUEST_FAILED",
      message: err.message
    };
    if (req.requestId) body.requestId = req.requestId;
    return res.status(status).json(body);
  });
  return app;
}

test("role permission matrix exposes reusable domain permissions", () => {
  assert.equal(hasPermission({ role: "admin" }, "admin.manage"), true);
  assert.equal(hasPermission({ role: "admin" }, "storage.write"), true);
  assert.equal(hasPermission({ role: "admin" }, "resource.forceAssign"), true);
  assert.equal(hasPermission({ role: "manager" }, "workspace.write"), true);
  assert.equal(hasPermission({ role: "manager" }, "workspace.delete"), false);
  assert.equal(hasPermission({ role: "manager" }, "resource.forceAssign"), false);
  assert.equal(hasPermission({ role: "department_admin" }, "workspace.write"), true);
  assert.equal(hasPermission({ role: "department_manager" }, "workspace.write"), true);
  assert.equal(hasPermission({ role: "project_manager" }, "workspace.write"), true);
  assert.equal(hasPermission({ role: "employee" }, "workspace.read"), true);
  assert.equal(hasPermission({ role: "employee" }, "storage.write"), true);
  assert.equal(hasPermission({ role: "employee" }, "hr.read"), false);
  assert.equal(hasPermission({ role: "employee" }, "hr.manage"), false);
  assert.equal(hasPermission({ role: "user" }, "workspace.read"), true);
  assert.equal(hasPermission({ permissions: ["workspace.delete"] }, "workspace.delete"), true);

  assert.deepEqual(getRolePermissions({ role: "manager" }), [
    "workspace.read",
    "workspace.write",
    "workspace.export",
    "storage.read",
    "storage.write",
    "hr.read"
  ]);
});

test("requireRole admits frontend manager aliases without 403", async () => {
  for (const role of ["department_admin", "department_manager", "project_manager"]) {
    const response = await requestJson(
      makeApp(requireRole(["admin", "manager"])),
      "/protected",
      { sub: `u-${role}`, role },
      `req-${role}`
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.role, "manager");
  }
});

test("assignment advice accepts scoped write or HR read permissions and denies read-only users", async () => {
  const gate = requirePermission(["workspace.write", "hr.read", "hr.manage"]);
  const managerResponse = await requestJson(
    makeApp(gate),
    "/protected",
    { sub: "u-manager-advice", role: "manager" },
    "req-assignment-advice-manager"
  );
  const employeeResponse = await requestJson(
    makeApp(gate),
    "/protected",
    { sub: "u-employee-advice", role: "employee" },
    "req-assignment-advice-employee"
  );

  assert.equal(managerResponse.status, 200);
  assert.equal(employeeResponse.status, 403);
  assert.equal(employeeResponse.body.message, "无权限执行该操作");
});

test("resource force assign requires explicit permission without export fallback", async () => {
  const gate = requirePermission("resource.forceAssign");
  const response = await requestJson(
    makeApp(gate),
    "/protected",
    { sub: "u-force", role: "employee", permissions: ["resource.forceAssign"] },
    "req-force-assign"
  );
  const exportOnlyResponse = await requestJson(
    makeApp(gate),
    "/protected",
    { sub: "u-export-only", role: "manager" },
    "req-force-assign-export-deny"
  );

  assert.equal(response.status, 200);
  assert.equal(exportOnlyResponse.status, 403);
  assert.deepEqual(exportOnlyResponse.body, {
    code: "FORBIDDEN",
    message: "无权限执行该操作",
    requestId: "req-force-assign-export-deny"
  });
});

test("requireRole allows configured roles and preserves normalized auth role", async () => {
  const response = await requestJson(
    makeApp(requireRole(["admin", "manager"])),
    "/protected",
    { sub: "u-manager", role: "MANAGER" },
    "req-role-allow"
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    role: "manager",
    permissions: [
      "workspace.read",
      "workspace.write",
      "workspace.export",
      "storage.read",
      "storage.write",
      "hr.read"
    ]
  });
});

test("requireRole returns uniform 403 body for denied roles", async () => {
  const response = await requestJson(
    makeApp(requireRole("admin")),
    "/protected",
    { sub: "u-employee", role: "employee" },
    "req-role-deny"
  );

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    code: "FORBIDDEN",
    message: "无权限访问",
    requestId: "req-role-deny"
  });
});

test("requirePermission allows role-derived and token-derived permissions", async () => {
  const managerResponse = await requestJson(
    makeApp(requirePermission("storage.write")),
    "/protected",
    { sub: "u-manager", role: "manager" },
    "req-permission-role"
  );
  const employeeWriteResponse = await requestJson(
    makeApp(requirePermission("storage.write")),
    "/protected",
    { sub: "u-employee-write", role: "employee" },
    "req-permission-employee-write"
  );
  const tokenPermissionResponse = await requestJson(
    makeApp(requirePermission("workspace.delete")),
    "/protected",
    { sub: "u-delegated", role: "employee", permissions: ["workspace.delete"] },
    "req-permission-token"
  );

  assert.equal(managerResponse.status, 200);
  assert.equal(employeeWriteResponse.status, 200);
  assert.equal(tokenPermissionResponse.status, 200);
});

test("requirePermission returns uniform 403 body for missing permission", async () => {
  const response = await requestJson(
    makeApp(requirePermission("workspace.delete")),
    "/protected",
    { sub: "u-manager", role: "manager" },
    "req-permission-deny"
  );

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    code: "FORBIDDEN",
    message: "无权限执行该操作",
    requestId: "req-permission-deny"
  });
});
