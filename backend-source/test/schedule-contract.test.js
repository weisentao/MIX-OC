import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  __private__,
  buildScheduleResponse,
  mapScheduleItemRow,
  mapSchedulePlanRow
} from "../src/services/schedule.service.js";

test("schedule snapshot mapper exposes stable camelCase fields", () => {
  const snapshot = __private__.mapScheduleSnapshotRow({
    snapshot_uid: "ss-001",
    plan_uid: "sp-001",
    project_uid: "project-001",
    title: "Baseline snapshot",
    summary_json: "{\"itemCount\":2}",
    snapshot_json: "{\"plan\":{\"id\":\"sp-001\"},\"items\":[]}",
    created_by: "u-admin",
    created_by_name: "admin",
    created_at: "2026-05-14 10:11:12"
  });

  assert.deepEqual(Object.keys(snapshot), [
    "id",
    "snapshotId",
    "planId",
    "projectId",
    "title",
    "summary",
    "snapshot",
    "createdBy",
    "createdByName",
    "createdAt"
  ]);
  assert.equal(snapshot.id, "ss-001");
  assert.equal(snapshot.snapshotId, "ss-001");
  assert.deepEqual(snapshot.summary, { itemCount: 2 });
  assert.deepEqual(snapshot.snapshot, { plan: { id: "sp-001" }, items: [] });
  assert.equal(snapshot.createdAt, "2026/05/14 10:11");
});

test("schedule template payload normalizes frontend minimum shape", () => {
  const normalized = __private__.normalizeScheduleTemplatePayload({
    title: "  Launch Template  ",
    description: "  Critical path  ",
    visibility: "workspace",
    template: {
      items: [{ title: "Kickoff" }, { title: "Delivery" }]
    },
    payload: { source: "contract" }
  });

  assert.deepEqual(normalized, {
    title: "Launch Template",
    description: "Critical path",
    visibility: "workspace",
    itemCount: 2,
    template: {
      items: [{ title: "Kickoff" }, { title: "Delivery" }]
    },
    payload: { source: "contract" }
  });
});

test("schedule template mapper exposes stable camelCase fields", () => {
  const template = __private__.mapScheduleTemplateRow({
    template_uid: "st-001",
    title: "Launch Template",
    description: "Critical path",
    owner_user_uid: "u-admin",
    visibility: "workspace",
    item_count: 2,
    template_json: "{\"items\":[{\"title\":\"Kickoff\"}]}",
    payload_json: "{\"source\":\"contract\"}",
    created_by: "u-admin",
    updated_by: "u-editor",
    created_at: "2026-05-14 10:11:12",
    updated_at: "2026-05-14 11:12:13"
  });

  assert.deepEqual(Object.keys(template), [
    "id",
    "templateId",
    "title",
    "description",
    "ownerUserId",
    "visibility",
    "itemCount",
    "template",
    "payload",
    "createdBy",
    "updatedBy",
    "createdAt",
    "updatedAt"
  ]);
  assert.equal(template.id, "st-001");
  assert.equal(template.templateId, "st-001");
  assert.equal(template.itemCount, 2);
  assert.deepEqual(template.template, { items: [{ title: "Kickoff" }] });
});

test("schedule export record includes downloadable html metadata", () => {
  const record = __private__.buildScheduleExportRecord(
    {
      project_uid: "project-001",
      plan_uid: "sp-001",
      title: "Launch Plan"
    },
    {
      format: "html",
      html: "<!doctype html><html><body>Launch Plan</body></html>"
    },
    "ss-export"
  );

  assert.equal(record.export.exportId, "ss-export");
  assert.equal(record.export.snapshotId, "ss-export");
  assert.equal(record.export.projectId, "project-001");
  assert.equal(record.export.planId, "sp-001");
  assert.equal(record.export.format, "html");
  assert.equal(record.download.mimeType, "text/html; charset=utf-8");
  assert.equal(record.download.contentType, "text/html; charset=utf-8");
  assert.equal(record.download.encoding, "utf8");
  assert.equal(record.download.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(record.download.headers["Content-Disposition"], /^attachment; filename="schedule-project-001-\d{8}\.html"$/);
  assert.match(record.download.fileName, /^schedule-project-001-\d{8}\.html$/);
  assert.match(record.download.content, /Launch Plan/);
  assert.equal(
    Buffer.from(record.download.base64, "base64").toString("utf8"),
    "<!doctype html><html><body>Launch Plan</body></html>"
  );
});

test("schedule export record makes pdf fallback explicit as html-only", () => {
  const record = __private__.buildScheduleExportRecord(
    {
      project_uid: "project-001",
      plan_uid: "sp-001",
      title: "Launch Plan"
    },
    {
      format: "pdf",
      html: "<!doctype html><html><body>Launch Plan</body></html>"
    },
    "ss-export-pdf"
  );

  assert.equal(record.export.format, "pdf");
  assert.equal(record.export.requestedFormat, "pdf");
  assert.equal(record.export.effectiveFormat, "html");
  assert.equal(record.export.htmlOnly, true);
  assert.equal(record.download.requestedFormat, "pdf");
  assert.equal(record.download.effectiveFormat, "html");
  assert.equal(record.download.htmlOnly, true);
  assert.equal(record.download.mimeType, "text/html; charset=utf-8");
  assert.match(record.download.fileName, /^schedule-project-001-\d{8}\.html$/);
  assert.match(record.download.content, /^<!doctype html>/i);
});

test("schedule export permission requires project view and global export capability", () => {
  assert.equal(
    __private__.requireScheduleExportPermission("readonly", { role: "manager" }),
    "readonly"
  );
  assert.equal(
    __private__.requireScheduleExportPermission("admin", { role: "admin" }),
    "admin"
  );

  assert.throws(
    () => __private__.requireScheduleExportPermission("readonly", { role: "employee" }),
    (error) => error.statusCode === 403 && /No permission to export/.test(error.message)
  );
  assert.throws(
    () => __private__.requireScheduleExportPermission("none", { role: "manager" }),
    (error) => error.statusCode === 403 && /No permission to access project schedule/.test(error.message)
  );
});

test("schedule export service gates export before creating export payload", () => {
  const source = readFileSync(new URL("../src/services/schedule.service.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function createScheduleExport");
  const end = source.indexOf("export async function createScheduleItem", start);
  const body = source.slice(start, end);

  const projectViewGate = body.indexOf('const projectRole = await requireProjectPermission(project, auth, "view")');
  const globalExportGate = body.indexOf("requireScheduleExportPermission(projectRole, auth)");
  const exportPayload = body.indexOf("buildScheduleExportRecord");

  assert.notEqual(projectViewGate, -1, "schedule export must keep project view gate");
  assert.notEqual(globalExportGate, -1, "schedule export must require global canExport gate");
  assert.notEqual(exportPayload, -1, "schedule export must still build the same export response payload");
  assert.ok(globalExportGate > projectViewGate, "global export gate must run after project view gate");
  assert.ok(globalExportGate < exportPayload, "global export gate must run before export payload creation");
});

test("schedule response keeps a stable camelCase empty shape", () => {
  const plan = mapSchedulePlanRow(
    {
      plan_uid: "sp-001",
      project_uid: "project-uid",
      legacy_project_id: 1003,
      project_name: "项目名称",
      title: "项目排期",
      status: "active",
      start_date: "2026-05-10",
      end_date: "2026-06-21",
      default_view: "timeline",
      view_config_json: "{\"dayWidth\":28,\"rowHeight\":34}"
    },
    []
  );

  assert.deepEqual(buildScheduleResponse(plan), {
    plan: {
      id: "sp-001",
      projectId: 1003,
      projectUid: "project-uid",
      title: "项目排期",
      projectName: "项目名称",
      startDate: "2026/05/10",
      endDate: "2026/06/21",
      status: "active",
      viewConfig: {
        defaultView: "timeline",
        dayWidth: 28,
        rowHeight: 34
      },
      summary: {
        itemCount: 0,
        pendingCount: 0,
        doneCount: 0,
        riskCount: 0
      }
    },
    items: [],
    dependencies: [],
    snapshots: [],
    templates: []
  });
});

test("schedule item mapper exposes stable ids and camelCase fields", () => {
  const item = mapScheduleItemRow({
    item_uid: "si-001",
    task_uid: "task-uid",
    legacy_task_id: 1300101,
    item_type: "schedule",
    title: "分镜框架 / 风格稿",
    module_key: "design",
    owner_text: "后期2部: 张三",
    start_date: "2026-05-16",
    end_date: "2026-05-19",
    status: "todo",
    progress: 0,
    sort_order: 300,
    hidden: 0,
    link_task: 1,
    link_flow: 1,
    owner_user_uid: "u-owner",
    project_uid: "project-001",
    payload_json: "{\"note\":\"payload note\",\"frontendItemId\":\"si-local-1\"}",
    comments_count: 0,
    note_text: "按 PDF 复刻的排期环节"
  });

  assert.equal(item.id, "si-001");
  assert.equal(item.itemId, "si-001");
  assert.equal(item.taskId, 1300101);
  assert.equal(item.taskUid, "task-uid");
  assert.equal(item.startDate, "2026/05/16");
  assert.equal(item.endDate, "2026/05/19");
  assert.equal(item.hidden, false);
  assert.equal(item.linkTask, true);
  assert.equal(item.linkFlow, true);
  assert.equal(item.note, "按 PDF 复刻的排期环节");
});

test("delete schedule item statement only marks schedule item hidden", () => {
  const { sql, params } = __private__.buildSoftDeleteItemStatement("si-001", "u-1");

  assert.match(sql, /UPDATE schedule_items/i);
  assert.match(sql, /hidden = 1/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+tasks/i);
  assert.deepEqual(params, ["u-1", "si-001"]);
});

test("create dialog payload normalizes stable schedule item fields", () => {
  const normalized = __private__.normalizeCreateItemPayload({
    title: " 分镜框架 / 风格稿 ",
    type: "schedule",
    module: "design",
    owner: "后期2部: 张三",
    startDate: "2026/05/16",
    endDate: "2026-05-19",
    status: "todo",
    progress: 0,
    addToTaskList: true,
    linkTask: true,
    linkFlow: true,
    note: "schedule smoke item",
    dependencyIds: [],
    payload: {}
  });

  assert.deepEqual(normalized, {
    title: "分镜框架 / 风格稿",
    type: "schedule",
    module: "design",
    owner: "后期2部: 张三",
    ownerUserId: "",
    startDate: "2026-05-16",
    endDate: "2026-05-19",
    status: "todo",
    priority: "normal",
    progress: 0,
    addToTaskList: true,
    linkTask: true,
    linkFlow: true,
    note: "schedule smoke item",
    dependencyIds: [],
    payload: {}
  });
});

test("create payload accepts nested payload aliases and preserves unknown payload fields", () => {
  const normalized = __private__.normalizeCreateItemPayload({
    title: "Frontend nested item",
    start_date: "2026/05/16",
    end_date: "2026/05/19",
    payload: {
      note: "nested note",
      addToTaskList: true,
      customFrontendOnly: "kept"
    }
  });

  assert.equal(normalized.startDate, "2026-05-16");
  assert.equal(normalized.endDate, "2026-05-19");
  assert.equal(normalized.note, "nested note");
  assert.equal(normalized.addToTaskList, true);
  assert.deepEqual(normalized.payload, {
    note: "nested note",
    addToTaskList: true,
    customFrontendOnly: "kept"
  });
});

test("schedule item mapper exposes stable frontend aliases and payload", () => {
  const item = mapScheduleItemRow({
    item_uid: "si-frontend",
    plan_uid: "sp-frontend",
    project_uid: "project-frontend",
    task_uid: "task-frontend",
    legacy_task_id: 1300104,
    owner_user_uid: "u-owner",
    item_type: "schedule",
    title: "Frontend item",
    start_date: "2026/05/16",
    end_date: "2026/05/19",
    payload_json: "{\"customFrontendOnly\":\"kept\",\"note\":\"payload note\"}"
  });

  assert.equal(item.id, "si-frontend");
  assert.equal(item.itemId, "si-frontend");
  assert.equal(item.scheduleItemId, "si-frontend");
  assert.equal(item.workItemId, "si-frontend");
  assert.equal(item.projectId, "project-frontend");
  assert.equal(item.ownerUserId, "u-owner");
  assert.equal(item.taskUid, "task-frontend");
  assert.equal(item.taskId, 1300104);
  assert.deepEqual(item.payload, {
    customFrontendOnly: "kept",
    note: "payload note"
  });
  assert.equal(item.note, "payload note");
});

test("local schedule item ids are not reused as backend ids", () => {
  assert.equal(__private__.resolveClientScheduleItemUid({ id: "si-local-abc" }), "");
  assert.equal(__private__.resolveClientScheduleItemUid({ itemId: "si-client-abc" }), "");
  assert.equal(__private__.resolveClientScheduleItemUid({ itemId: "si-backend" }), "si-backend");
});

test("schedule item mutations preserve local client ids and return sync aliases", () => {
  assert.equal(typeof __private__.buildScheduleItemMutationResponse, "function");

  const response = __private__.buildScheduleItemMutationResponse({
    item: {
      itemId: "si-backend",
      scheduleItemId: "si-backend",
      taskUid: "task-backend",
      taskId: 1300105,
      payload: {
        clientItemId: "si-local-abc"
      }
    },
    task: {
      id: 1300105,
      taskUid: "task-backend",
      taskId: "task-backend"
    },
    sync: {
      source: "schedule",
      created: true,
      taskUpdated: false,
      clientItemId: "si-local-abc"
    }
  });

  assert.equal(response.itemId, "si-backend");
  assert.equal(response.scheduleItemId, "si-backend");
  assert.equal(response.taskUid, "task-backend");
  assert.equal(response.taskId, "task-backend");
  assert.deepEqual(response.sync, {
    source: "schedule",
    created: true,
    taskUpdated: false,
    clientItemId: "si-local-abc"
  });
  assert.deepEqual(response.syncResult, response.sync);
});

test("schedule drag mutation response exposes stable sync flags and interaction", () => {
  const response = __private__.buildScheduleItemMutationResponse({
    item: {
      itemId: "si-drag",
      scheduleItemId: "si-drag",
      taskUid: "task-drag",
      payload: {
        clientItemId: "si-local-drag"
      }
    },
    task: {
      taskUid: "task-drag",
      taskId: "task-drag"
    },
    sync: {
      source: "schedule-drag",
      interaction: "resize-start",
      clientItemId: "si-local-drag"
    }
  });

  assert.equal(response.sync.source, "schedule-drag");
  assert.equal(response.sync.interaction, "resize-start");
  assert.equal(response.sync.scheduleUpdated, true);
  assert.equal(response.sync.resourceWorkItemUpdated, false);
  assert.equal(response.sync.taskUpdated, false);
  assert.equal(response.sync.taskCreated, false);
  assert.equal(response.sync.clientItemId, "si-local-drag");
  assert.deepEqual(response.syncResult, response.sync);
});

test("schedule drag update service passes interaction metadata into mutation response", async () => {
  const source = readFileSync(new URL("../src/services/schedule.service.js", import.meta.url), "utf8");
  const updateStart = source.indexOf("export async function updateScheduleItem(");
  const commentsStart = source.indexOf("export async function listScheduleItemComments", updateStart);
  const updateSource = source.slice(updateStart, commentsStart);

  assert.match(source, /function normalizeScheduleSyncContract\(/);
  assert.match(updateSource, /source:\s*syncSourceFromPayload\(payload,\s*"schedule"\)/);
  assert.match(updateSource, /interaction:\s*syncInteractionFromPayload\(payload\)/);
  assert.match(updateSource, /resourceWorkItemUpdated:\s*false/);
});

test("full schedule save payload normalizes items and dependencies", () => {
  const normalized = __private__.normalizeScheduleBundlePayload({
    title: "Bundle plan",
    items: [
      {
        id: "si-local-1",
        title: "Local item",
        start_date: "2026/05/16",
        end_date: "2026/05/19",
        payload: { note: "bundle note", addToTaskList: false, custom: "kept" }
      }
    ],
    dependencies: [
      {
        id: "dep-local-1",
        source: "si-local-1",
        target: "si-backend-2",
        type: "finish_to_start",
        lag_days: 2,
        payload: { custom: "edge" }
      }
    ]
  });

  assert.equal(normalized.hasBundle, true);
  assert.equal(normalized.items[0].clientItemId, "si-local-1");
  assert.equal(normalized.items[0].itemId, "");
  assert.equal(normalized.items[0].startDate, "2026-05-16");
  assert.equal(normalized.items[0].note, "bundle note");
  assert.deepEqual(normalized.items[0].payload, {
    note: "bundle note",
    addToTaskList: false,
    custom: "kept",
    clientItemId: "si-local-1"
  });
  assert.deepEqual(normalized.dependencies[0], {
    dependencyId: "",
    clientDependencyId: "dep-local-1",
    fromItemId: "si-local-1",
    toItemId: "si-backend-2",
    type: "finish_to_start",
    lagDays: 2,
    payload: { custom: "edge", clientDependencyId: "dep-local-1" }
  });
});

test("schedule routes expose PATCH item alias and full plan POST", () => {
  const source = readFileSync(new URL("../src/routes/schedule.routes.js", import.meta.url), "utf8");

  assert.match(source, /router\.post\("\/workspace\/projects\/:projectId\/schedule", authRequired, postSchedule\)/);
  assert.match(source, /router\.put\("\/workspace\/schedule\/items\/:itemId", authRequired, putScheduleItem\)/);
  assert.match(source, /router\.patch\("\/workspace\/schedule\/items\/:itemId", authRequired, putScheduleItem\)/);
});

test("created item response exposes the exact fields AG1 dialog consumes", () => {
  const item = mapScheduleItemRow({
    item_uid: "si-dialog",
    task_uid: "task-dialog",
    legacy_task_id: 1300102,
    item_type: "schedule",
    title: "分镜框架 / 风格稿",
    module_key: "design",
    owner_text: "后期2部: 张三",
    start_date: "2026-05-16",
    end_date: "2026/05/19",
    status: "todo",
    progress: 0,
    sort_order: 1778674500000,
    hidden: 0,
    link_task: 1,
    link_flow: 1,
    comments_count: 0,
    note_text: "schedule smoke item"
  });

  for (const key of [
    "id",
    "itemId",
    "scheduleItemId",
    "workItemId",
    "projectId",
    "taskId",
    "taskUid",
    "taskUidText",
    "type",
    "title",
    "module",
    "owner",
    "ownerUserId",
    "assigneeId",
    "startDate",
    "endDate",
    "status",
    "progress",
    "sortOrder",
    "hidden",
    "linkTask",
    "linkFlow",
    "commentsCount",
    "note",
    "payload"
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(item, key), `missing ${key}`);
  }
  assert.equal(item.startDate, "2026/05/16");
  assert.equal(item.endDate, "2026/05/19");
});

test("create dialog payload rejects empty title before DB writes", () => {
  assert.throws(
    () => __private__.normalizeCreateItemPayload({ title: " ", startDate: "2026/05/16", endDate: "2026/05/19" }),
    (error) => error.statusCode === 400 && /title is required/.test(error.message)
  );
});

test("create dialog payload rejects endDate earlier than startDate", () => {
  assert.throws(
    () =>
      __private__.normalizeCreateItemPayload({
        title: "分镜框架 / 风格稿",
        startDate: "2026/05/20",
        endDate: "2026/05/16"
      }),
    (error) => error.statusCode === 400 && /endDate cannot be earlier than startDate/.test(error.message)
  );
});

test("schedule service reports MySQL unavailable as 503", () => {
  const error = __private__.buildMySQLUnavailableError();
  assert.equal(error.statusCode, 503);
  assert.equal(error.message, "MySQL unavailable for schedule API");
});

test("linked task response preserves mysql DATE day without UTC offset", () => {
  const task = __private__.mapLinkedTaskForResponse({
    id: 1778677910671,
    task_uid: "task-date",
    legacy_task_id: 1778677910671,
    title: "分镜框架 / 风格稿",
    task_type: "排期",
    module_key: "design",
    owner_text: "后期2部: 张三",
    status: "todo",
    start_date: new Date("2026-05-16T00:00:00.000Z"),
    end_date: new Date("2026-05-19T00:00:00.000Z")
  });

  assert.equal(task.startDate, "2026/05/16");
  assert.equal(task.endDate, "2026/05/19");
});

test("update dialog payload normalizes supported fields", () => {
  const normalized = __private__.normalizeUpdateItemPayload(
    {
      title: "旧标题",
      item_type: "schedule",
      module_key: "project",
      owner_text: "",
      owner_user_uid: "",
      status: "todo",
      priority: "normal",
      progress: 0,
      start_date: "2026-05-16",
      end_date: "2026-05-19",
      sort_order: 300,
      link_task: 1,
      link_flow: 1,
      note_text: "old note"
    },
    {
      title: " 分镜框架 / 风格稿 - 已更新 ",
      module: "design",
      owner: "后期2部: 张三",
      startDate: "2026/05/17",
      endDate: "2026-05-20",
      status: "doing",
      progress: 35,
      note: "updated note",
      linkTask: false,
      linkFlow: true
    }
  );

  assert.deepEqual(normalized, {
    type: "schedule",
    title: "分镜框架 / 风格稿 - 已更新",
    module: "design",
    ownerUserId: "",
    owner: "后期2部: 张三",
    status: "doing",
    priority: "normal",
    progress: 35,
    startDate: "2026-05-17",
    endDate: "2026-05-20",
    sortOrder: 300,
    linkTask: false,
    linkFlow: true,
    note: "updated note",
    payload: {}
  });
});

test("schedule update payload preserves active rollback statuses", () => {
  const normalized = __private__.normalizeUpdateItemPayload(
    {
      title: "Old title",
      item_type: "schedule",
      module_key: "project",
      owner_text: "",
      owner_user_uid: "",
      status: "completed",
      priority: "normal",
      progress: 100,
      start_date: "2026-05-16",
      end_date: "2026-05-19",
      sort_order: 300,
      link_task: 1,
      link_flow: 1,
      note_text: "old note"
    },
    {
      status: "active",
      progress: 10
    }
  );

  assert.equal(normalized.status, "active");
  assert.equal(normalized.progress, 10);
});

test("linked task mapper reports reopened archived rows as active status", () => {
  const task = __private__.mapLinkedTaskForResponse({
    id: 1778677910671,
    task_uid: "task-reopened",
    legacy_task_id: 1778677910671,
    title: "Reopened",
    task_type: "排期",
    module_key: "design",
    owner_text: "owner",
    status: "active",
    archived: 0,
    start_date: "2026-05-16",
    end_date: "2026-05-19"
  });

  assert.equal(task.status, "active");
});

test("schedule item updates clear linked task archive flag for open statuses", async () => {
  const source = readFileSync("src/services/schedule.service.js", "utf8");
  const updateLinkedStart = source.indexOf("async function updateLinkedTaskFromItem");
  const projectScheduleStart = source.indexOf("export async function getProjectSchedule", updateLinkedStart);
  const updateLinkedSource = source.slice(updateLinkedStart, projectScheduleStart);

  assert.match(source, /function linkedTaskArchivedFlagFromScheduleStatus\(/);
  assert.match(updateLinkedSource, /const nextTaskArchived = linkedTaskArchivedFlagFromScheduleStatus\(item\.status\)/);
  assert.match(updateLinkedSource, /archived = CASE WHEN \? IS NULL THEN archived ELSE \? END/);
});

test("update item response exposes the exact fields AG1 update consumes", () => {
  const item = mapScheduleItemRow({
    item_uid: "si-update",
    task_uid: "task-update",
    legacy_task_id: 1300103,
    item_type: "schedule",
    title: "分镜框架 / 风格稿 - 已更新",
    module_key: "design",
    owner_text: "后期2部: 张三",
    start_date: "2026-05-17",
    end_date: "2026-05-20",
    status: "doing",
    progress: 35,
    sort_order: 1778674500001,
    hidden: 0,
    link_task: 1,
    link_flow: 1,
    comments_count: 0,
    note_text: "updated note"
  });

  for (const key of [
    "id",
    "itemId",
    "scheduleItemId",
    "workItemId",
    "projectId",
    "taskId",
    "taskUid",
    "taskUidText",
    "type",
    "title",
    "module",
    "owner",
    "ownerUserId",
    "assigneeId",
    "startDate",
    "endDate",
    "status",
    "progress",
    "sortOrder",
    "hidden",
    "linkTask",
    "linkFlow",
    "commentsCount",
    "note",
    "payload"
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(item, key), `missing ${key}`);
  }
  assert.equal(item.title, "分镜框架 / 风格稿 - 已更新");
  assert.equal(item.status, "doing");
  assert.equal(item.progress, 35);
});

test("update dialog payload rejects empty title", () => {
  assert.throws(
    () => __private__.normalizeUpdateItemPayload({ title: "旧标题", start_date: "2026-05-16" }, { title: " " }),
    (error) => error.statusCode === 400 && /title is required/.test(error.message)
  );
});

test("update dialog payload rejects endDate earlier than startDate", () => {
  assert.throws(
    () =>
      __private__.normalizeUpdateItemPayload(
        { title: "旧标题", start_date: "2026-05-16", end_date: "2026-05-19" },
        { startDate: "2026/05/21", endDate: "2026/05/20" }
      ),
    (error) => error.statusCode === 400 && /endDate cannot be earlier than startDate/.test(error.message)
  );
});

test("delete response remains soft-delete only and stable for AG1", () => {
  const response = __private__.buildDeleteItemResponse({
    item_uid: "si-delete",
    task_uid: "task-delete"
  });

  assert.deepEqual(response, {
    ok: true,
    deletedItemId: "si-delete",
    itemId: "si-delete",
    taskUid: "task-delete",
    taskDeleted: false
  });
});

test("schedule response filters hidden items after delete", () => {
  const plan = mapSchedulePlanRow({ plan_uid: "sp-delete", project_uid: "project-uid", status: "active" }, []);
  const visible = mapScheduleItemRow({
    item_uid: "si-visible",
    title: "visible",
    hidden: 0
  });
  const hidden = mapScheduleItemRow({
    item_uid: "si-hidden",
    title: "hidden",
    hidden: 1
  });

  const response = buildScheduleResponse(plan, [visible, hidden]);
  assert.deepEqual(response.items.map((item) => item.itemId), ["si-visible"]);
});

test("schedule comment payload trims content and keeps optional payload", () => {
  const normalized = __private__.normalizeScheduleCommentPayload({
    content: "  schedule comment  ",
    payload: { source: "contract", selectedRange: ["2026/05/16", "2026/05/19"] }
  });

  assert.deepEqual(normalized, {
    content: "schedule comment",
    payload: { source: "contract", selectedRange: ["2026/05/16", "2026/05/19"] },
    tone: ""
  });
});

test("schedule comment payload rejects empty content before DB writes", () => {
  assert.throws(
    () => __private__.normalizeScheduleCommentPayload({ content: "   " }),
    (error) => error.statusCode === 400 && /content is required/.test(error.message)
  );
});

test("schedule comment mapper exposes stable camelCase fields", () => {
  const comment = __private__.mapScheduleCommentRow({
    comment_uid: "sic-001",
    item_uid: "si-001",
    plan_uid: "sp-001",
    project_uid: "project-001",
    user_uid: "u-admin",
    user_name: "admin",
    user_dept: "backend",
    tone: "normal",
    content_text: "schedule comment",
    payload_json: "{\"source\":\"contract\"}",
    commented_at: "2026-05-13 10:11:12",
    created_at: "2026-05-13 10:11:12"
  });

  assert.deepEqual(Object.keys(comment), [
    "id",
    "commentId",
    "itemId",
    "planId",
    "projectId",
    "userId",
    "userName",
    "userDept",
    "tone",
    "content",
    "payload",
    "commentedAt",
    "createdAt"
  ]);
  assert.equal(comment.id, "sic-001");
  assert.equal(comment.commentId, "sic-001");
  assert.equal(comment.itemId, "si-001");
  assert.equal(comment.content, "schedule comment");
  assert.deepEqual(comment.payload, { source: "contract" });
  assert.equal(comment.commentedAt, "2026/05/13 10:11");
});

test("hidden schedule item cannot be used as a comment target", () => {
  assert.throws(
    () => __private__.assertScheduleItemVisibleForComments({ item_uid: "si-hidden", hidden: 1 }),
    (error) => error.statusCode === 404 && /Schedule item not found/.test(error.message)
  );
});

test("schedule item mapper reflects accurate commentsCount", () => {
  const item = mapScheduleItemRow({
    item_uid: "si-comments",
    title: "commented item",
    comments_count: 2
  });

  assert.equal(item.commentsCount, 2);
});

test("schedule comment update payload requires non-empty content", () => {
  assert.deepEqual(
    __private__.normalizeScheduleCommentPayload({
      content: "  updated comment  ",
      payload: { edited: true }
    }),
    {
      content: "updated comment",
      payload: { edited: true },
      tone: ""
    }
  );

  assert.throws(
    () => __private__.normalizeScheduleCommentPayload({ content: "" }),
    (error) => error.statusCode === 400 && /content is required/.test(error.message)
  );
});

test("schedule comment mutation permissions allow author and managers only", () => {
  assert.equal(
    __private__.canMutateScheduleComment(
      { user_uid: "u-author" },
      { sub: "u-author", role: "employee" },
      "readonly"
    ),
    true
  );
  assert.equal(
    __private__.canMutateScheduleComment(
      { user_uid: "u-author" },
      { sub: "u-other", role: "employee" },
      "editor"
    ),
    false
  );
  assert.equal(
    __private__.canMutateScheduleComment(
      { user_uid: "u-author" },
      { sub: "u-manager", role: "employee" },
      "manager"
    ),
    true
  );
  assert.equal(
    __private__.canMutateScheduleComment(
      { user_uid: "u-author" },
      { sub: "u-admin", role: "admin" },
      "admin"
    ),
    true
  );
});

test("delete schedule comment response is stable and hard-delete oriented", () => {
  assert.deepEqual(__private__.buildDeleteCommentResponse({ comment_uid: "sic-delete", item_uid: "si-001" }), {
    ok: true,
    deletedCommentId: "sic-delete",
    commentId: "sic-delete",
    itemId: "si-001"
  });
});
