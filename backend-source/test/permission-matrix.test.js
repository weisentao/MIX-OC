import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertRoleCan,
  canDelete,
  canExport,
  canWrite,
  getRoleCapabilities,
  normalizeRole
} from "../src/middlewares/auth.js";

test("permission matrix normalizes known and unknown auth roles", () => {
  assert.equal(normalizeRole({ role: "admin" }), "admin");
  assert.equal(normalizeRole({ role: "manager" }), "manager");
  assert.equal(normalizeRole({ role: "employee" }), "employee");
  assert.equal(normalizeRole({ role: "ADMIN" }), "admin");
  assert.equal(normalizeRole({}), "employee");
  assert.equal(normalizeRole({ role: "contractor" }), "employee");
});

test("admin can write, delete, and export", () => {
  const auth = { role: "admin" };

  assert.equal(canWrite(auth), true);
  assert.equal(canDelete(auth), true);
  assert.equal(canExport(auth), true);
  assert.deepEqual(getRoleCapabilities(auth), {
    role: "admin",
    canWrite: true,
    canDelete: true,
    canExport: true
  });
});

test("manager can write and export but cannot perform destructive delete by default", () => {
  const auth = { role: "manager" };

  assert.equal(canWrite(auth), true);
  assert.equal(canDelete(auth), false);
  assert.equal(canExport(auth), true);
  assert.deepEqual(getRoleCapabilities(auth), {
    role: "manager",
    canWrite: true,
    canDelete: false,
    canExport: true
  });
});

test("employee is read-first and cannot write, delete, or export by global role alone", () => {
  const auth = { role: "employee" };

  assert.equal(canWrite(auth), false);
  assert.equal(canDelete(auth), false);
  assert.equal(canExport(auth), false);
  assert.deepEqual(getRoleCapabilities(auth), {
    role: "employee",
    canWrite: false,
    canDelete: false,
    canExport: false
  });
});

test("assertRoleCan returns capabilities for allowed actions and throws 403 for denied actions", () => {
  assert.deepEqual(assertRoleCan({ role: "manager" }, "write"), {
    role: "manager",
    canWrite: true,
    canDelete: false,
    canExport: true
  });

  assert.throws(
    () => assertRoleCan({ role: "manager" }, "delete"),
    (error) => error.statusCode === 403 && /No permission to delete/.test(error.message)
  );

  assert.throws(
    () => assertRoleCan({ role: "employee" }, "export"),
    (error) => error.statusCode === 403 && /No permission to export/.test(error.message)
  );
});
