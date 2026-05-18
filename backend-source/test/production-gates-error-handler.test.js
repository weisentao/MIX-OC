import assert from "node:assert/strict";
import { test } from "node:test";
import { buildErrorResponse } from "../src/middlewares/errorHandler.js";

test("production 500 errors without statusCode hide internal messages", () => {
  const result = buildErrorResponse(new Error("database password leaked"), "production", "req-500");

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal Server Error",
    requestId: "req-500"
  });
});

test("production 4xx errors keep business messages", () => {
  const error = new Error("Username already exists");
  error.statusCode = 409;

  const result = buildErrorResponse(error, "production", "req-409");

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, {
    code: "CONFLICT",
    message: "Username already exists",
    requestId: "req-409"
  });
});

test("production 503 errors keep business messages", () => {
  const error = new Error("MySQL unavailable for schedule API");
  error.statusCode = 503;

  const result = buildErrorResponse(error, "production", "req-503");

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    code: "SERVICE_UNAVAILABLE",
    message: "MySQL unavailable for schedule API",
    requestId: "req-503"
  });
});

test("production exposed and logged errors redact secret-looking values", () => {
  const error = new Error(`DeepSeek upstream api_key=sk-${"A".repeat(32)} Authorization: Bearer ${"B".repeat(32)}`);
  error.statusCode = 503;

  const result = buildErrorResponse(error, "production", "req-secret");

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "SERVICE_UNAVAILABLE");
  assert.match(result.body.message, /\[redacted\]/);
  assert.doesNotMatch(result.body.message, /sk-[A-Za-z0-9_-]{16,}/);
  assert.doesNotMatch(result.body.message, /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i);
});

test("business error responses preserve explicit error codes", () => {
  const error = new Error("DeepSeek HR API key is not configured");
  error.statusCode = 503;
  error.code = "HR_AI_KEY_NOT_CONFIGURED";

  const result = buildErrorResponse(error, "production", "req-hr-ai");

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "HR_AI_KEY_NOT_CONFIGURED");
});

test("business error responses preserve structured details payload", () => {
  const error = new Error("Board version conflict");
  error.statusCode = 409;
  error.code = "BOARD_VERSION_CONFLICT";
  error.details = {
    boardId: "board-1",
    expectedVersion: 4,
    currentVersion: 5,
    latestVersion: 5,
    updatedAt: "2026-05-17 10:00:00"
  };

  const result = buildErrorResponse(error, "production", "req-board-conflict");

  assert.equal(result.status, 409);
  assert.equal(result.body.code, "BOARD_VERSION_CONFLICT");
  assert.equal(result.body.message, "Board version conflict");
  assert.deepEqual(result.body.details, error.details);
  assert.equal(result.body.requestId, "req-board-conflict");
});
