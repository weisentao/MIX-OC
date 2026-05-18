import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHealthPayload } from "../src/controllers/health.controller.js";

test("health payload distinguishes live from ready when MySQL is available", () => {
  const payload = buildHealthPayload({
    nodeEnv: "production",
    mysqlReady: true,
    now: () => new Date("2026-05-14T12:00:00.000Z")
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.live, true);
  assert.equal(payload.ready, true);
  assert.equal(payload.checks.mysql.ready, true);
});

test("health payload reports not ready when MySQL is unavailable", () => {
  const payload = buildHealthPayload({
    nodeEnv: "production",
    mysqlReady: false,
    now: () => new Date("2026-05-14T12:00:00.000Z")
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.live, true);
  assert.equal(payload.ready, false);
  assert.equal(payload.checks.mysql.ready, false);
});
