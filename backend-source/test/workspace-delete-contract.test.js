import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { __private__ } from "../src/services/workspace.service.js";

test("project delete cleanup sequence removes schedule instance rows before project rows", () => {
  const statements = __private__.buildDeleteProjectCleanupStatements("project-001");
  const sqlList = statements.map((statement) => statement.sql.replace(/\s+/g, " ").trim());

  assert.deepEqual(
    sqlList.filter((sql) => /schedule_/i.test(sql)),
    [
      "DELETE FROM schedule_item_comments WHERE project_uid = ?",
      "DELETE FROM schedule_dependencies WHERE project_uid = ?",
      "DELETE FROM schedule_snapshots WHERE project_uid = ?",
      "DELETE FROM schedule_items WHERE project_uid = ?",
      "UPDATE schedule_plans SET status = 'archived', updated_by = ? WHERE project_uid = ? AND status <> 'archived'",
      "DELETE FROM schedule_plans WHERE project_uid = ?"
    ]
  );

  assert.equal(
    sqlList.findIndex((sql) => /schedule_item_comments/i.test(sql)) <
      sqlList.findIndex((sql) => /DELETE FROM tasks/i.test(sql)),
    true
  );
});

test("project delete cleanup hard deletes project boards and related history", () => {
  const statements = __private__.buildDeleteProjectCleanupStatements("project-001", "worker-4");
  const sqlList = statements.map((statement) => statement.sql.replace(/\s+/g, " ").trim());

  assert.match(sqlList[0], /^SELECT board_uid FROM boards WHERE project_uid = \? OR \(scope_type = 'project' AND scope_uid = \?\)$/);
  assert.ok(sqlList.includes("DELETE FROM board_snapshots WHERE board_uid IN (?)"));
  assert.ok(sqlList.includes("DELETE FROM board_history WHERE board_uid IN (?)"));
  assert.ok(sqlList.includes("DELETE FROM board_members WHERE board_uid IN (?)"));
  assert.ok(sqlList.includes("DELETE FROM board_shares WHERE board_uid IN (?)"));
  assert.ok(sqlList.includes("DELETE FROM boards WHERE board_uid IN (?)"));
  assert.ok(sqlList.includes("DELETE FROM notifications WHERE project_uid = ?"));
  assert.ok(sqlList.includes("DELETE FROM hr_assignment_previews WHERE project_uid = ?"));
  assert.ok(sqlList.findIndex((sql) => /DELETE FROM board_snapshots/i.test(sql)) < sqlList.findIndex((sql) => /DELETE FROM boards/i.test(sql)));
});

test("project delete cleanup removes project scoped roles and storage metadata", () => {
  const statements = __private__.buildDeleteProjectCleanupStatements("project-001", "worker-4");
  const sqlList = statements.map((statement) => statement.sql.replace(/\s+/g, " ").trim());

  assert.ok(sqlList.includes("UPDATE storage_files SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE scope_type = 'project' AND scope_uid = ?"));
  assert.ok(sqlList.includes("DELETE FROM user_roles WHERE scope_type = 'project' AND scope_uid = ?"));

  assert.ok(
    sqlList.findIndex((sql) => /UPDATE storage_files/i.test(sql)) <
      sqlList.findIndex((sql) => /DELETE FROM projects/i.test(sql))
  );
  assert.ok(
    sqlList.findIndex((sql) => /DELETE FROM user_roles/i.test(sql)) <
      sqlList.findIndex((sql) => /DELETE FROM projects/i.test(sql))
  );
});

test("deleteProject wraps cleanup SQL in a MySQL connection transaction", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const start = source.indexOf("export async function deleteProject(projectId, actor = \"\")");
  const end = source.indexOf("export async function listProjectTasks", start);
  assert.notEqual(start, -1, "deleteProject function should exist");
  assert.notEqual(end, -1, "listProjectTasks function should follow deleteProject");

  const deleteProjectSource = source.slice(start, end);
  assert.match(deleteProjectSource, /mysqlPool\.getConnection\(\)/);
  assert.match(deleteProjectSource, /connection\.beginTransaction\(\)/);
  assert.match(deleteProjectSource, /connection\.commit\(\)/);
  assert.match(deleteProjectSource, /catch\s*\([^)]*\)\s*{[\s\S]*connection\.rollback\(\)[\s\S]*throw\s+/);
  assert.match(deleteProjectSource, /finally\s*{[\s\S]*connection\.release\(\)/);
  assert.doesNotMatch(deleteProjectSource, /mysqlPool\.execute\(/);
});

test("deleteProject resolves the target project inside the same transaction", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const start = source.indexOf("export async function deleteProject(projectId, actor = \"\")");
  const end = source.indexOf("export async function listProjectTasks", start);
  assert.notEqual(start, -1, "deleteProject function should exist");
  assert.notEqual(end, -1, "listProjectTasks function should follow deleteProject");

  const deleteProjectSource = source.slice(start, end);
  const beginIndex = deleteProjectSource.indexOf("connection.beginTransaction()");
  const resolveIndex = deleteProjectSource.indexOf("resolveProjectByAnyId(projectId, connection");

  assert.notEqual(resolveIndex, -1, "deleteProject should resolve the project through the transaction connection");
  assert.ok(beginIndex !== -1 && beginIndex < resolveIndex, "deleteProject should begin the transaction before resolving the project");
  assert.match(deleteProjectSource, /resolveProjectByAnyId\(projectId,\s*connection,\s*{\s*forUpdate:\s*true\s*}\)/);
});

test("workspace project task permission user-facing errors are Chinese", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");

  for (const englishMessage of [
    "projectId is required",
    "Project not found",
    "taskId is required",
    "Task not found",
    "User not found",
    "No permission to access project",
    "Unauthorized",
    "title is required",
    "name is required",
    "text is required",
    "user id is required"
  ]) {
    assert.doesNotMatch(source, new RegExp(englishMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const chineseMessage of [
    "\u9879\u76eeID\u4e0d\u80fd\u4e3a\u7a7a",
    "\u9879\u76ee\u4e0d\u5b58\u5728",
    "\u4efb\u52a1ID\u4e0d\u80fd\u4e3a\u7a7a",
    "\u4efb\u52a1\u4e0d\u5b58\u5728",
    "\u7528\u6237\u4e0d\u5b58\u5728",
    "\u6ca1\u6709\u6743\u9650\u8bbf\u95ee\u8be5\u9879\u76ee",
    "\u8bf7\u5148\u767b\u5f55",
    "\u6807\u9898\u4e0d\u80fd\u4e3a\u7a7a",
    "\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a",
    "\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a",
    "\u7528\u6237ID\u4e0d\u80fd\u4e3a\u7a7a"
  ]) {
    assert.match(source, new RegExp(chineseMessage));
  }
});
