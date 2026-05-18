import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { __private__ } from "../src/services/workspace.service.js";

test("workspace task status aliases close and reopen archived state consistently", () => {
  assert.equal(__private__.resolveTaskArchivedForWrite(0, { status: "done" }), 1);
  assert.equal(__private__.resolveTaskArchivedForWrite(0, { status: "completed" }), 1);
  assert.equal(__private__.resolveTaskArchivedForWrite(0, { status: "archived" }), 1);
  assert.equal(__private__.resolveTaskArchivedForWrite(1, { status: "active" }), 0);
  assert.equal(__private__.resolveTaskArchivedForWrite(1, { status: "todo" }), 0);
  assert.equal(__private__.resolveTaskArchivedForWrite(1, { status: "open" }), 0);
  assert.equal(__private__.resolveTaskArchivedForWrite(1, { archived: false, status: "completed" }), 0);

  assert.equal(__private__.resolveTaskScheduleSyncStatus({ status: "done" }), "done");
  assert.equal(__private__.resolveTaskScheduleSyncStatus({ status: "completed" }), "completed");
  assert.equal(__private__.resolveTaskScheduleSyncStatus({ archived: true }), "archived");
  assert.equal(__private__.resolveTaskScheduleSyncStatus({ archived: false }), "todo");
});

test("workspace task date normalization accepts frontend display formats", () => {
  const { normalizeWorkspaceDateForSql } = __private__;

  assert.equal(normalizeWorkspaceDateForSql("2026/05/08"), "2026-05-08");
  assert.equal(normalizeWorkspaceDateForSql("2026年5月8日"), "2026-05-08");
  assert.equal(normalizeWorkspaceDateForSql("Fri May 08 2026"), "2026-05-08");
  assert.equal(normalizeWorkspaceDateForSql(new Date(2026, 4, 8)), "2026-05-08");
  assert.equal(normalizeWorkspaceDateForSql("20260508"), "2026-05-08");
  assert.equal(normalizeWorkspaceDateForSql("Fri May 08"), null);
  assert.equal(normalizeWorkspaceDateForSql("2026/02/31"), null);
  assert.equal(normalizeWorkspaceDateForSql(""), null);
  assert.equal(normalizeWorkspaceDateForSql(undefined), undefined);
});

test("workspace task schedule sync writes only SQL-safe dates", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const createScheduleStart = source.indexOf("async function createScheduleItemFromTask(");
  const syncScheduleStart = source.indexOf("async function syncScheduleItemsFromTask(", createScheduleStart);
  const bootstrapStart = source.indexOf("export async function getBootstrapState(", syncScheduleStart);
  const createScheduleSource = source.slice(createScheduleStart, syncScheduleStart);
  const syncScheduleSource = source.slice(syncScheduleStart, bootstrapStart);

  assert.match(createScheduleSource, /normalizeWorkspaceDateForSql\(task\.start_date\)/);
  assert.match(createScheduleSource, /normalizeWorkspaceDateForSql\(task\.end_date\)/);
  assert.match(syncScheduleSource, /normalizeWorkspaceDateForSql\(payload\.startDate\)/);
  assert.match(syncScheduleSource, /normalizeWorkspaceDateForSql\(payload\.endDate\)/);
  assert.doesNotMatch(createScheduleSource, /String\(task\.start_date\)\.slice\(0,\s*10\)/);
  assert.doesNotMatch(syncScheduleSource, /replaceAll\("\/", "-"\)\.slice\(0,\s*10\)/);
});

test("workspace task restore contract reopens completed tasks when archived is false", () => {
  assert.equal(
    __private__.resolveTaskStatusForWrite("done", 0, { archived: false }),
    "todo"
  );
  assert.equal(
    __private__.resolveTaskStatusForWrite("completed", 0, { archived: false }),
    "todo"
  );
  assert.equal(
    __private__.resolveTaskStatusForWrite("archived", 0, { archived: false }),
    "todo"
  );
  assert.equal(
    __private__.resolveTaskScheduleSyncStatus({ archived: false, status: "completed" }),
    "todo"
  );
});

test("workspace task id resolver accepts task-prefixed fallback ids", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const resolverStart = source.indexOf("async function resolveTaskByAnyId(");
  const resolverEnd = source.indexOf("async function replaceProjectTags", resolverStart);
  const resolverSource = source.slice(resolverStart, resolverEnd);

  assert.match(source, /function taskIdCandidatesFromAnyId\(/);
  assert.match(resolverSource, /const candidates = taskIdCandidatesFromAnyId\(taskId\)/);
  assert.match(resolverSource, /task_uid IN \(\$\{placeholders\}\)/);
  assert.match(resolverSource, /CAST\(id AS CHAR\) IN \(\$\{placeholders\}\)/);
  assert.match(resolverSource, /CAST\(legacy_task_id AS CHAR\) IN \(\$\{placeholders\}\)/);
});

test("workspace tasks preserve frontend sync fields in payload_json", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const mapTaskStart = source.indexOf("function mapTask(");
  const mapTaskEnd = source.indexOf("function mapProject(", mapTaskStart);
  const createTaskStart = source.indexOf("export async function createTask(");
  const updateTaskStart = source.indexOf("export async function updateTask(");
  const deleteTaskStart = source.indexOf("export async function deleteTask(", updateTaskStart);

  assert.notEqual(mapTaskStart, -1, "mapTask should exist");
  assert.notEqual(mapTaskEnd, -1, "mapProject should follow mapTask");
  assert.notEqual(createTaskStart, -1, "createTask should exist");
  assert.notEqual(updateTaskStart, -1, "updateTask should exist");
  assert.notEqual(deleteTaskStart, -1, "deleteTask should follow updateTask");

  const mapTaskSource = source.slice(mapTaskStart, mapTaskEnd);
  const createTaskSource = source.slice(createTaskStart, updateTaskStart);
  const updateTaskSource = source.slice(updateTaskStart, deleteTaskStart);

  for (const field of ["scheduleStatus", "progress", "attachments"]) {
    assert.match(mapTaskSource, new RegExp(`${field}:`), `mapTask should return ${field}`);
    assert.match(createTaskSource, new RegExp(`${field}:`), `createTask should persist ${field}`);
    assert.match(updateTaskSource, new RegExp(`${field}:`), `updateTask should preserve ${field}`);
  }

  assert.match(source, /function normalizeTaskProgress\(/);
  assert.match(source, /function normalizeTaskAttachments\(/);
});

test("workspace task updates sync linked schedule items for flow and schedule consistency", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const updateTaskStart = source.indexOf("export async function updateTask(");
  const deleteTaskStart = source.indexOf("export async function deleteTask(", updateTaskStart);
  const updateTaskSource = source.slice(updateTaskStart, deleteTaskStart);

  assert.match(source, /async function syncScheduleItemsFromTask\(/);
  assert.match(source, /UPDATE schedule_items[\s\S]*WHERE task_uid = \? AND hidden = 0/);
  assert.match(updateTaskSource, /const sync = await syncScheduleItemsFromTask\(target\.task_uid, payload, actor\)/);
  assert.match(updateTaskSource, /syncResult:\s*\{[\s\S]*source: "task"[\s\S]*scheduleItemsUpdated: sync\.scheduleItemsUpdated/);
});

test("workspace task create update and delete double-write linked schedule items", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const createTaskStart = source.indexOf("export async function createTask(");
  const updateTaskStart = source.indexOf("export async function updateTask(");
  const deleteTaskStart = source.indexOf("export async function deleteTask(", updateTaskStart);
  const commentsStart = source.indexOf("export async function listTaskComments", deleteTaskStart);
  const createTaskSource = source.slice(createTaskStart, updateTaskStart);
  const updateTaskSource = source.slice(updateTaskStart, deleteTaskStart);
  const deleteTaskSource = source.slice(deleteTaskStart, commentsStart);

  assert.match(source, /async function createScheduleItemFromTask\(/);
  assert.match(source, /async function ensureActiveSchedulePlanForTask\(/);
  assert.match(createTaskSource, /syncScheduleItemsFromTask\(taskUid,[\s\S]*createIfMissing: true/);
  assert.match(updateTaskSource, /syncScheduleItemsFromTask\(target\.task_uid, payload, actor,[\s\S]*createIfMissing: true/);
  assert.match(deleteTaskSource, /UPDATE schedule_items[\s\S]*hidden = 1[\s\S]*status = 'deleted'[\s\S]*WHERE task_uid = \? AND hidden = 0/);
});

test("workspace project creation persists task template payload tasks", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const createProjectStart = source.indexOf("export async function createProject(");
  const updateProjectStart = source.indexOf("export async function updateProject(", createProjectStart);

  assert.notEqual(createProjectStart, -1, "createProject should exist");
  assert.notEqual(updateProjectStart, -1, "updateProject should follow createProject");

  const createProjectSource = source.slice(createProjectStart, updateProjectStart);

  assert.match(createProjectSource, /Array\.isArray\(payload\.tasks\)/);
  assert.match(createProjectSource, /for\s*\(const\s+task\s+of\s+payload\.tasks\)/);
  assert.match(createProjectSource, /await createTask\(projectUid,\s*task,\s*actor\)/);
});

test("workspace task rollback clears archived state when reopening completed tasks", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const updateTaskStart = source.indexOf("export async function updateTask(");
  const deleteTaskStart = source.indexOf("export async function deleteTask(", updateTaskStart);
  const syncStart = source.indexOf("async function syncScheduleItemsFromTask(");
  const bootstrapStart = source.indexOf("export async function getBootstrapState(", syncStart);
  const privateStart = source.indexOf("export const __private__");
  const updateTaskSource = source.slice(updateTaskStart, deleteTaskStart);
  const syncSource = source.slice(syncStart, bootstrapStart);
  const privateSource = source.slice(privateStart);

  assert.match(source, /function resolveTaskArchivedForWrite\(/);
  assert.match(source, /function resolveTaskStatusForWrite\(/);
  assert.match(updateTaskSource, /resolveTaskArchivedForWrite\(target\.archived, payload\)/);
  assert.match(updateTaskSource, /resolveTaskStatusForWrite\(target\.status, archived, payload\)/);
  assert.match(syncSource, /payload\.archived !== undefined/);
  assert.match(privateSource, /resolveTaskArchivedForWrite/);
  assert.match(privateSource, /resolveTaskStatusForWrite/);
  assert.match(privateSource, /resolveTaskScheduleSyncStatus/);
});

test("workspace task routes expose PATCH aliases for status rollback sync", async () => {
  const source = await readFile("src/routes/workspace.routes.js", "utf8");

  assert.match(source, /router\.patch\("\/tasks\/:taskId", authRequired, putTask\)/);
  assert.match(source, /router\.patch\("\/workspace\/tasks\/:taskId", authRequired, putTask\)/);
});
