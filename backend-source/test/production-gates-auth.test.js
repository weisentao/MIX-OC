import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import { isDevTokenAllowed } from "../src/controllers/auth.controller.js";
import { requestLogger } from "../src/middlewares/requestLogger.js";
import authRoutes from "../src/routes/auth.routes.js";

test("dev token is disabled in production", () => {
  assert.equal(isDevTokenAllowed("production"), false);
});

test("dev token remains enabled in development", () => {
  assert.equal(isDevTokenAllowed("development"), true);
});

function requestJson(app, path, options = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: options.method || "GET",
          headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
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
                headers: res.headers,
                body: body ? JSON.parse(body) : null
              });
            });
          });
        }
      );
      req.on("error", (error) => {
        server.close(() => reject(error));
      });
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  });
}

test("GET /dev/token returns no token in production", async () => {
  const app = express();
  app.use(requestLogger);
  app.use(authRoutes);

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const response = await requestJson(app, "/dev/token", {
      headers: { "X-Request-Id": "req-dev-token" }
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.token, undefined);
    assert.deepEqual(response.body, {
      code: "NOT_FOUND",
      message: "Not Found",
      requestId: "req-dev-token"
    });
    assert.equal(response.headers["x-request-id"], "req-dev-token");
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("authRequired 401 responses include code and requestId", async () => {
  const app = express();
  app.use(requestLogger);
  app.use(authRoutes);

  const response = await requestJson(app, "/me", {
    headers: { "X-Request-Id": "req-auth-required" }
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    code: "UNAUTHORIZED",
    message: "Unauthorized",
    requestId: "req-auth-required"
  });
  assert.equal(response.headers["x-request-id"], "req-auth-required");
});

test("PATCH /me returns authRequired contract when unauthenticated", async () => {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.use(authRoutes);

  const response = await requestJson(app, "/me", {
    method: "PATCH",
    headers: { "X-Request-Id": "req-patch-me" },
    body: { email: "hello@example.com" }
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    code: "UNAUTHORIZED",
    message: "Unauthorized",
    requestId: "req-patch-me"
  });
});

test("login validation errors include code and requestId while preserving message", async () => {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.use(authRoutes);

  const response = await requestJson(app, "/login", {
    method: "POST",
    headers: { "X-Request-Id": "req-login-validation" },
    body: { username: "admin" }
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    code: "BAD_REQUEST",
    message: "username and password are required",
    requestId: "req-login-validation"
  });
});

test("security question errors include code and requestId while preserving message", async () => {
  const app = express();
  app.use(requestLogger);
  app.use(authRoutes);

  const response = await requestJson(app, "/security-question", {
    headers: { "X-Request-Id": "req-security-question" }
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    code: "BAD_REQUEST",
    message: "username is required",
    requestId: "req-security-question"
  });
});

test("production auth does not fall back to in-memory users when MySQL is unavailable", async () => {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.use(authRoutes);

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const loginResponse = await requestJson(app, "/login", {
      method: "POST",
      headers: { "X-Request-Id": "req-prod-login-db-down" },
      body: { username: "admin", password: "admin" }
    });
    assert.equal(loginResponse.status, 503);
    assert.deepEqual(loginResponse.body, {
      code: "SERVICE_UNAVAILABLE",
      message: "MySQL unavailable for auth API",
      requestId: "req-prod-login-db-down"
    });

    const registerResponse = await requestJson(app, "/register", {
      method: "POST",
      headers: { "X-Request-Id": "req-prod-register-db-down" },
      body: {
        username: "MIX-prod-db-down",
        password: "123456",
        name: "Prod DB Down",
        phone: "13000000000",
        email: "prod-db-down@example.com",
        securityQuestion: "phone",
        securityAnswer: "13000000000"
      }
    });
    assert.equal(registerResponse.status, 503);
    assert.deepEqual(registerResponse.body, {
      code: "SERVICE_UNAVAILABLE",
      message: "MySQL unavailable for auth API",
      requestId: "req-prod-register-db-down"
    });
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
