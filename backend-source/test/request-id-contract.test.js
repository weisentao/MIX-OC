import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  assignRequestId,
  buildRequestLogPayload,
  requestLogger,
  resolveRequestId
} from "../src/middlewares/requestLogger.js";

test("request id prefers the incoming x-request-id header", () => {
  assert.equal(resolveRequestId({ "x-request-id": " req-client-123 " }), "req-client-123");
});

test("request logger attaches request id and echoes it as a response header", () => {
  const req = {
    headers: { "x-request-id": "req-client-456" },
    method: "GET",
    originalUrl: "/api/health"
  };
  const headers = {};
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = (key, value) => {
    headers[key] = value;
  };

  let nextCalled = false;
  requestLogger(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.requestId, "req-client-456");
  assert.equal(headers["X-Request-Id"], "req-client-456");
});

test("request id can be assigned before body parsing", () => {
  const req = {
    headers: { "x-request-id": "req-pre-parser" },
    method: "POST",
    originalUrl: "/api/login"
  };
  const headers = {};
  const res = new EventEmitter();
  res.statusCode = 400;
  res.setHeader = (key, value) => {
    headers[key] = value;
  };

  let nextCalled = false;
  assignRequestId(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.requestId, "req-pre-parser");
  assert.equal(headers["X-Request-Id"], "req-pre-parser");
});

test("request log payload includes request id for production tracing", () => {
  const payload = buildRequestLogPayload(
    {
      requestId: "req-log-789",
      method: "POST",
      originalUrl: "/api/workspace/projects"
    },
    { statusCode: 201 },
    34
  );

  assert.deepEqual(payload, {
    requestId: "req-log-789",
    method: "POST",
    path: "/api/workspace/projects",
    status: 201,
    durationMs: 34
  });
});
