import { isMySQLReady, mysqlPool } from "../db/mysql.js";
import { canExport } from "../middlewares/auth.js";
import { createTask, normalizeWorkspaceDateForSql } from "./workspace.service.js";

const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for schedule API";
const DEFAULT_VIEW_CONFIG = {
  defaultView: "timeline",
  dayWidth: 28,
  rowHeight: 34
};
const OPEN_LINKED_TASK_STATUSES = new Set(["active", "todo", "open"]);
const CLOSED_LINKED_TASK_STATUSES = new Set(["archived", "done", "completed"]);

function assertMySQLReady() {
  if (!isMySQLReady()) {
    throw buildMySQLUnavailableError();
  }
}

function buildMySQLUnavailableError() {
  const error = new Error(MYSQL_UNAVAILABLE_MESSAGE);
  error.statusCode = 503;
  return error;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function actorId(auth = {}) {
  return String(auth.sub || auth.id || auth.userId || "").trim();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateSlash(dateValue) {
  const value = normalizeWorkspaceDateForSql(dateValue);
  return value ? value.replaceAll("-", "/") : "";
}

function toDateTimeSlash(dateValue) {
  if (!dateValue) return "";
  if (dateValue instanceof Date) {
    return [
      `${dateValue.getFullYear()}/${pad2(dateValue.getMonth() + 1)}/${pad2(dateValue.getDate())}`,
      `${pad2(dateValue.getHours())}:${pad2(dateValue.getMinutes())}`
    ].join(" ");
  }

  return String(dateValue).replaceAll("-", "/").slice(0, 16);
}

function toDateSql(dateValue) {
  return normalizeWorkspaceDateForSql(dateValue) ?? null;
}

function compareSqlDates(left, right) {
  if (!left || !right) return 0;
  return String(left).localeCompare(String(right));
}

function makeUid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function dateStamp(date = new Date()) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeProgress(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(100, Math.round(next)));
}

function normalizeStatus(value, fallback = "todo") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function linkedTaskArchivedFlagFromScheduleStatus(status) {
  const clean = String(status || "").trim().toLowerCase();
  if (OPEN_LINKED_TASK_STATUSES.has(clean)) return 0;
  if (CLOSED_LINKED_TASK_STATUSES.has(clean)) return 1;
  return null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function frontendPayloadOf(payload = {}) {
  return isPlainObject(payload.payload) ? payload.payload : {};
}

function fieldValue(source = {}, aliases = []) {
  for (const alias of aliases) {
    if (source[alias] !== undefined) return source[alias];
  }
  return undefined;
}

function compatibleField(payload = {}, aliases = []) {
  const rootValue = fieldValue(payload, aliases);
  if (rootValue !== undefined) return rootValue;
  return fieldValue(frontendPayloadOf(payload), aliases);
}

function normalizePayloadObject(payload = {}, currentPayload = {}) {
  return {
    ...(isPlainObject(currentPayload) ? currentPayload : {}),
    ...frontendPayloadOf(payload),
    ...(isPlainObject(payload.payload) ? {} : {})
  };
}

function isFrontendLocalId(value, prefix = "") {
  const clean = String(value || "").trim();
  if (!clean) return false;
  if (/^local[-_]/i.test(clean)) return true;
  if (/^si[-_]client[-_]/i.test(clean)) return true;
  return prefix ? new RegExp(`^${prefix}[-_]local[-_]`, "i").test(clean) : /[-_]local[-_]/i.test(clean);
}

function resolveClientScheduleItemUid(payload = {}) {
  const clean = String(payload.itemId || payload.itemUid || payload.scheduleItemId || payload.id || "").trim();
  return clean && !isFrontendLocalId(clean, "si") ? clean : "";
}

function isTaskLikeScheduleItemId(value) {
  const clean = String(value || "").trim();
  return /^task[-_]/i.test(clean);
}

function taskUidCandidatesFromItemId(itemId, payload = {}) {
  const clean = String(itemId || "").trim();
  const candidates = [
    compatibleField(payload, ["taskUid", "task_uid", "taskId", "task_id"])
  ];

  if (isTaskLikeScheduleItemId(clean)) {
    candidates.push(clean);
    candidates.push(clean.replace(/^task[-_]/i, ""));
  }

  return Array.from(
    new Set(
      candidates
        .map((candidate) => String(candidate || "").trim())
        .filter(Boolean)
    )
  );
}

function scheduleItemLinkRequired(taskUid) {
  return conflict(`Schedule item linked to taskUid ${taskUid} does not exist; create a schedule item before updating it`);
}

function uniqueCleanValues(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function clientItemIdCandidatesFromPayload(itemId = "", payload = {}) {
  const payloadObject = frontendPayloadOf(payload);
  return uniqueCleanValues([
    itemId,
    payload.clientItemId,
    payload.client_item_id,
    payload.frontendItemId,
    payload.frontend_item_id,
    payload.localItemId,
    payload.local_item_id,
    payload.itemId,
    payload.itemUid,
    payload.scheduleItemId,
    payload.workItemId,
    payload.id,
    payloadObject.clientItemId,
    payloadObject.client_item_id,
    payloadObject.frontendItemId,
    payloadObject.frontend_item_id,
    payloadObject.localItemId,
    payloadObject.local_item_id,
    payloadObject.itemId,
    payloadObject.itemUid,
    payloadObject.scheduleItemId,
    payloadObject.workItemId,
    payloadObject.id
  ]);
}

function localClientItemIdFromPayload(itemId = "", payload = {}) {
  return clientItemIdCandidatesFromPayload(itemId, payload).find((candidate) => isFrontendLocalId(candidate, "si")) || "";
}

function projectIdFromSchedulePayload(payload = {}) {
  return String(compatibleField(payload, ["projectId", "projectUid", "project_id", "project_uid"]) || "").trim();
}

function rowPayloadClientIdCandidates(row = {}) {
  const payload = parseJson(row.payload_json, {});
  return clientItemIdCandidatesFromPayload("", payload);
}

function rowMatchesClientItemId(row = {}, candidates = []) {
  const candidateSet = new Set(candidates.map((candidate) => String(candidate || "").trim()).filter(Boolean));
  if (!candidateSet.size) return false;
  return rowPayloadClientIdCandidates(row).some((candidate) => candidateSet.has(candidate));
}

function scheduleItemPayloadForStorage(normalized = {}, payload = {}, extras = {}) {
  const clientItemId = extras.clientItemId || localClientItemIdFromPayload("", payload);
  const taskUid = String(extras.taskUid || compatibleField(payload, ["taskUid", "task_uid", "taskId", "task_id"]) || "").trim();
  const interaction = String(compatibleField(payload, ["interaction"]) || "").trim();
  return {
    ...(normalized.payload || {}),
    ...(clientItemId ? { clientItemId } : {}),
    ...(taskUid ? { taskUid } : {}),
    ...(interaction ? { interaction } : {}),
    source: normalized.payload?.source || payload.source || "schedule-api"
  };
}

function syncSourceFromPayload(payload = {}, fallback = "schedule") {
  const source = String(compatibleField(payload, ["source"]) || "").trim();
  return source || fallback;
}

function syncInteractionFromPayload(payload = {}) {
  return String(compatibleField(payload, ["interaction"]) || "").trim();
}

function normalizeScheduleSyncContract(sync = {}, item = {}) {
  const source = String(sync.source || "schedule").trim() || "schedule";
  const interaction = String(sync.interaction || "").trim();
  if (source !== "schedule-drag" && !interaction) return sync;
  const itemId = item.itemId || item.scheduleItemId || item.workItemId || item.id || "";
  return {
    ...sync,
    source,
    ...(interaction ? { interaction } : {}),
    scheduleUpdated: sync.scheduleUpdated ?? Boolean(itemId),
    resourceWorkItemUpdated: sync.resourceWorkItemUpdated ?? false,
    taskUpdated: sync.taskUpdated ?? false,
    taskCreated: sync.taskCreated ?? false
  };
}

function buildScheduleItemMutationResponse({ item = {}, task = null, sync = {} } = {}) {
  const itemId = item.itemId || item.scheduleItemId || item.workItemId || item.id || "";
  const taskUid = String(item.taskUid || item.taskUidText || task?.taskUid || task?.taskId || "").trim();
  const taskId = task?.taskId || task?.taskUid || taskUid || item.taskUid || item.taskId || null;
  const stableSync = normalizeScheduleSyncContract(
    Object.keys(sync || {}).length ? sync : { source: "schedule", scheduleUpdated: Boolean(itemId) },
    item
  );

  return {
    item,
    task,
    itemId,
    scheduleItemId: itemId,
    workItemId: itemId,
    taskUid,
    taskId,
    sync: stableSync,
    syncResult: stableSync
  };
}

function normalizeScheduleBundlePayload(payload = {}) {
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item) => {
    const clientItemId = String(item.itemId || item.scheduleItemId || item.id || "").trim();
    const normalized = normalizeCreateItemPayload(item);
    return {
      ...normalized,
      clientItemId,
      itemId: resolveClientScheduleItemUid(item),
      payload: {
        ...normalized.payload,
        ...(clientItemId ? { clientItemId } : {})
      }
    };
  });
  const dependencies = (Array.isArray(payload.dependencies) ? payload.dependencies : []).map((dependency) => {
    const clientDependencyId = String(dependency.dependencyId || dependency.id || "").trim();
    const dependencyId = clientDependencyId && !isFrontendLocalId(clientDependencyId, "dep") ? clientDependencyId : "";
    return {
      dependencyId,
      clientDependencyId,
      fromItemId: String(dependency.fromItemId || dependency.from || dependency.source || dependency.sourceId || "").trim(),
      toItemId: String(dependency.toItemId || dependency.to || dependency.target || dependency.targetId || "").trim(),
      type: String(dependency.type || dependency.dependencyType || dependency.dependency_type || "finish_to_start").trim() || "finish_to_start",
      lagDays: Number(dependency.lagDays ?? dependency.lag_days ?? 0) || 0,
      payload: {
        ...(isPlainObject(dependency.payload) ? dependency.payload : {}),
        ...(clientDependencyId ? { clientDependencyId } : {})
      }
    };
  });
  return {
    hasBundle: items.length > 0 || dependencies.length > 0 || Array.isArray(payload.nodes) || Array.isArray(payload.edges),
    items,
    dependencies,
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    edges: Array.isArray(payload.edges) ? payload.edges : []
  };
}

function normalizeItemType(value) {
  const clean = String(value || "").trim();
  return clean || "schedule";
}

function normalizeModule(value) {
  const clean = String(value || "").trim();
  return clean || "project";
}

function normalizePlanTitle(value) {
  const clean = String(value || "").trim();
  return clean || "项目排期";
}

function normalizeCreateItemPayload(payload = {}) {
  const payloadJson = normalizePayloadObject(payload);
  const title = String(compatibleField(payload, ["title", "name"]) || "").trim();
  if (!title) throw badRequest("title is required");

  const startDate = toDateSql(compatibleField(payload, ["startDate", "start_date"]));
  const endDate = toDateSql(compatibleField(payload, ["endDate", "end_date"]));
  if (startDate && endDate && compareSqlDates(endDate, startDate) < 0) {
    throw badRequest("endDate cannot be earlier than startDate");
  }

  const addToTaskList = normalizeBoolean(compatibleField(payload, ["addToTaskList", "add_to_task_list"]), false);

  return {
    title,
    type: normalizeItemType(compatibleField(payload, ["type", "itemType", "item_type"])),
    module: normalizeModule(compatibleField(payload, ["module", "moduleKey", "module_key"])),
    owner: String(compatibleField(payload, ["owner", "ownerText", "owner_text"]) || "").trim(),
    ownerUserId: String(compatibleField(payload, ["ownerUserId", "ownerUserUid", "owner_user_uid", "assigneeId", "personId"]) || "").trim(),
    startDate,
    endDate,
    status: normalizeStatus(compatibleField(payload, ["status"]), "todo"),
    priority: String(compatibleField(payload, ["priority"]) || "normal").trim() || "normal",
    progress: normalizeProgress(compatibleField(payload, ["progress"]), 0),
    addToTaskList,
    linkTask: normalizeBoolean(compatibleField(payload, ["linkTask", "link_task"]), addToTaskList),
    linkFlow: normalizeBoolean(compatibleField(payload, ["linkFlow", "link_flow"]), false),
    note: String(compatibleField(payload, ["note", "remark", "description"]) || "").trim(),
    dependencyIds: Array.isArray(compatibleField(payload, ["dependencyIds", "dependency_ids"]))
      ? compatibleField(payload, ["dependencyIds", "dependency_ids"])
      : [],
    payload: payloadJson
  };
}

function normalizeUpdateItemPayload(current = {}, payload = {}) {
  const currentPayload = parseJson(current.payload_json, {});
  const titleInput = compatibleField(payload, ["title", "name"]);
  const title = titleInput === undefined ? String(current.title || "").trim() : String(titleInput || "").trim();
  if (!title) throw badRequest("title is required");

  const startInput = compatibleField(payload, ["startDate", "start_date"]);
  const endInput = compatibleField(payload, ["endDate", "end_date"]);
  const startDate = startInput === undefined ? (normalizeWorkspaceDateForSql(current.start_date) ?? null) : toDateSql(startInput);
  const endDate = endInput === undefined ? (normalizeWorkspaceDateForSql(current.end_date) ?? null) : toDateSql(endInput);
  if (startDate && endDate && compareSqlDates(endDate, startDate) < 0) {
    throw badRequest("endDate cannot be earlier than startDate");
  }

  return {
    type: compatibleField(payload, ["type", "itemType", "item_type"]) === undefined ? (current.item_type || "schedule") : normalizeItemType(compatibleField(payload, ["type", "itemType", "item_type"])),
    title,
    module: compatibleField(payload, ["module", "moduleKey", "module_key"]) === undefined ? (current.module_key || "project") : normalizeModule(compatibleField(payload, ["module", "moduleKey", "module_key"])),
    ownerUserId: compatibleField(payload, ["ownerUserId", "ownerUserUid", "owner_user_uid", "assigneeId", "personId"]) === undefined ? (current.owner_user_uid || "") : String(compatibleField(payload, ["ownerUserId", "ownerUserUid", "owner_user_uid", "assigneeId", "personId"]) || "").trim(),
    owner: compatibleField(payload, ["owner", "ownerText", "owner_text"]) === undefined ? (current.owner_text || "") : String(compatibleField(payload, ["owner", "ownerText", "owner_text"]) || "").trim(),
    status: compatibleField(payload, ["status"]) === undefined ? (current.status || "todo") : normalizeStatus(compatibleField(payload, ["status"]), current.status),
    priority: compatibleField(payload, ["priority"]) === undefined ? (current.priority || "normal") : (String(compatibleField(payload, ["priority"]) || "normal").trim() || "normal"),
    progress: compatibleField(payload, ["progress"]) === undefined ? normalizeProgress(current.progress, 0) : normalizeProgress(compatibleField(payload, ["progress"]), 0),
    startDate,
    endDate,
    sortOrder: payload.sortOrder === undefined && payload.sort_order === undefined
      ? Number(current.sort_order || 0)
      : Number(payload.sortOrder ?? payload.sort_order ?? current.sort_order ?? 0),
    linkTask: compatibleField(payload, ["linkTask", "link_task"]) === undefined
      ? Number(current.link_task || 0) === 1
      : normalizeBoolean(compatibleField(payload, ["linkTask", "link_task"]), Number(current.link_task || 0) === 1),
    linkFlow: compatibleField(payload, ["linkFlow", "link_flow"]) === undefined
      ? Number(current.link_flow || 0) === 1
      : normalizeBoolean(compatibleField(payload, ["linkFlow", "link_flow"]), Number(current.link_flow || 0) === 1),
    note: compatibleField(payload, ["note", "remark", "description"]) === undefined ? (current.note_text || "") : String(compatibleField(payload, ["note", "remark", "description"]) || "").trim(),
    payload: normalizePayloadObject(payload, currentPayload)
  };
}

function normalizeScheduleCommentPayload(payload = {}) {
  const content = String(payload.content || "").trim();
  if (!content) throw badRequest("content is required");

  return {
    content,
    payload: payload.payload === undefined ? {} : payload.payload,
    tone: String(payload.tone || "").trim()
  };
}

function normalizeScheduleTemplatePayload(payload = {}) {
  const title = String(payload.title || "").trim();
  if (!title) throw badRequest("title is required");

  const template = payload.template && typeof payload.template === "object"
    ? payload.template
    : {
        plan: payload.plan || null,
        items: Array.isArray(payload.items) ? payload.items : [],
        dependencies: Array.isArray(payload.dependencies) ? payload.dependencies : []
      };
  const itemCount = Number(payload.itemCount ?? payload.item_count ?? (Array.isArray(template.items) ? template.items.length : 0));

  return {
    title,
    description: String(payload.description || "").trim(),
    visibility: String(payload.visibility || "private").trim() || "private",
    itemCount: Number.isFinite(itemCount) ? itemCount : 0,
    template,
    payload: payload.payload === undefined ? {} : payload.payload
  };
}

function normalizeViewConfig(defaultView, viewConfig = {}) {
  const merged = {
    ...DEFAULT_VIEW_CONFIG,
    ...viewConfig
  };
  const cleanDefaultView = String(defaultView || merged.defaultView || DEFAULT_VIEW_CONFIG.defaultView).trim();
  const dayWidth = Number(merged.dayWidth);
  const rowHeight = Number(merged.rowHeight);

  return {
    defaultView: cleanDefaultView || DEFAULT_VIEW_CONFIG.defaultView,
    dayWidth: Number.isFinite(dayWidth) && dayWidth > 0 ? dayWidth : DEFAULT_VIEW_CONFIG.dayWidth,
    rowHeight: Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : DEFAULT_VIEW_CONFIG.rowHeight
  };
}

function summarizeItems(items = []) {
  const visibleItems = items.filter((item) => !item.hidden);
  return {
    itemCount: visibleItems.length,
    pendingCount: visibleItems.filter((item) => !["done", "completed", "archived", "deleted"].includes(item.status)).length,
    doneCount: visibleItems.filter((item) => ["done", "completed"].includes(item.status)).length,
    riskCount: visibleItems.filter((item) => ["risk", "blocked"].includes(item.status)).length
  };
}

export function mapScheduleItemRow(row = {}) {
  const payload = parseJson(row.payload_json, {});
  const legacyTaskId = Number(row.legacy_task_id || row.task_legacy_task_id || row.task_row_id || 0);
  const itemId = row.item_uid || String(row.id || "");
  const projectId = row.project_uid || "";
  const ownerUserId = row.owner_user_uid || "";

  return {
    id: itemId,
    itemId,
    scheduleItemId: itemId,
    workItemId: itemId,
    projectId,
    taskId: Number.isFinite(legacyTaskId) && legacyTaskId > 0 ? legacyTaskId : null,
    taskUid: row.task_uid || "",
    taskUidText: row.task_uid || "",
    type: row.item_type || "schedule",
    title: row.title || "",
    module: row.module_key || "project",
    owner: row.owner_text || "",
    ownerUserId,
    assigneeId: ownerUserId,
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    status: row.status || "todo",
    progress: normalizeProgress(row.progress, 0),
    sortOrder: Number(row.sort_order || 0),
    hidden: Number(row.hidden || 0) === 1,
    linkTask: Number(row.link_task || 0) === 1,
    linkFlow: Number(row.link_flow || 0) === 1,
    commentsCount: Number(row.comments_count || 0),
    note: row.note_text || payload.note || "",
    payload
  };
}

function mapScheduleCommentRow(row = {}) {
  const payload = parseJson(row.payload_json, {});

  return {
    id: row.comment_uid || String(row.id || ""),
    commentId: row.comment_uid || String(row.id || ""),
    itemId: row.item_uid || "",
    planId: row.plan_uid || "",
    projectId: row.project_uid || "",
    userId: row.user_uid || "",
    userName: row.user_name || "",
    userDept: row.user_dept || "",
    tone: row.tone || "",
    content: row.content_text || "",
    payload,
    commentedAt: toDateTimeSlash(row.commented_at_text || row.commented_at),
    createdAt: toDateTimeSlash(row.created_at_text || row.created_at)
  };
}

function mapScheduleSnapshotRow(row = {}) {
  return {
    id: row.snapshot_uid || String(row.id || ""),
    snapshotId: row.snapshot_uid || String(row.id || ""),
    planId: row.plan_uid || "",
    projectId: row.project_uid || "",
    title: row.title || "",
    summary: parseJson(row.summary_json, {}),
    snapshot: parseJson(row.snapshot_json, {}),
    createdBy: row.created_by || "",
    createdByName: row.created_by_name || "",
    createdAt: toDateTimeSlash(row.created_at_text || row.created_at)
  };
}

function mapScheduleTemplateRow(row = {}) {
  return {
    id: row.template_uid || String(row.id || ""),
    templateId: row.template_uid || String(row.id || ""),
    title: row.title || "",
    description: row.description || "",
    ownerUserId: row.owner_user_uid || "",
    visibility: row.visibility || "private",
    itemCount: Number(row.item_count || 0),
    template: parseJson(row.template_json, {}),
    payload: parseJson(row.payload_json, {}),
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    createdAt: toDateTimeSlash(row.created_at_text || row.created_at),
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at)
  };
}

export function mapScheduleDependencyRow(row = {}) {
  return {
    id: row.dependency_uid || String(row.id || ""),
    dependencyId: row.dependency_uid || String(row.id || ""),
    fromItemId: row.from_item_uid || "",
    toItemId: row.to_item_uid || "",
    type: row.dependency_type || "finish_to_start",
    lagDays: Number(row.lag_days || 0)
  };
}

export function mapSchedulePlanRow(row = {}, items = []) {
  const viewConfig = normalizeViewConfig(row.default_view, parseJson(row.view_config_json, {}));
  const projectId = Number(row.legacy_project_id || row.project_row_id || 0);

  return {
    id: row.plan_uid || String(row.id || ""),
    projectId: Number.isFinite(projectId) && projectId > 0 ? projectId : row.project_uid,
    projectUid: row.project_uid || "",
    title: normalizePlanTitle(row.title),
    projectName: row.project_name || row.name || "",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    status: row.status || "active",
    viewConfig,
    summary: summarizeItems(items)
  };
}

export function buildScheduleResponse(plan, items = [], dependencies = []) {
  const stableItems = items.filter((item) => !item.hidden).map((item) => ({ ...item }));
  const stablePlan = {
    ...plan,
    summary: summarizeItems(stableItems)
  };

  return {
    plan: stablePlan,
    items: stableItems,
    dependencies,
    snapshots: [],
    templates: []
  };
}

function mapLinkedTaskRow(row = {}) {
  if (!row.task_uid) return null;
  const id = Number(row.legacy_task_id || row.id || 0);
  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    taskUid: row.task_uid,
    taskId: row.task_uid,
    title: row.title || "",
    type: row.task_type || "排期",
    module: row.module_key || "project",
    owner: row.owner_text || "",
    status: row.status || "todo",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date)
  };
}

function mapLinkedTask(task = null) {
  if (!task) return null;
  return {
    id: Number(task.id || 0) || null,
    taskUid: task.taskUid || task.taskId || "",
    taskId: task.taskUid || task.taskId || "",
    title: task.title || "",
    type: task.type || "排期",
    module: task.module || "project",
    owner: task.owner || "",
    status: task.status || "todo",
    startDate: task.startDate || "",
    endDate: task.endDate || ""
  };
}

async function resolveProjectByAnyId(projectId) {
  const clean = String(projectId || "").trim();
  if (!clean) throw badRequest("projectId is required");

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        id AS project_row_id,
        project_uid,
        legacy_project_id,
        name,
        owner_text,
        start_date,
        end_date,
        archived,
        status
      FROM projects
      WHERE project_uid = ? OR CAST(id AS CHAR) = ? OR CAST(legacy_project_id AS CHAR) = ?
      ORDER BY id ASC
      LIMIT 1
    `,
    [clean, clean, clean]
  );

  if (!rows.length) throw notFound("Project not found");
  return rows[0];
}

async function fetchUserByAuth(auth = {}) {
  const userUid = actorId(auth);
  const username = String(auth.username || "").trim();
  if (!userUid && !username) return null;

  const [rows] = await mysqlPool.execute(
    `
      SELECT user_uid, username, name, role
      FROM users
      WHERE user_uid = ? OR CAST(id AS CHAR) = ? OR username = ?
      LIMIT 1
    `,
    [userUid, userUid, username]
  );
  return rows[0] || null;
}

function assertScheduleItemVisibleForComments(item = {}) {
  if (!item || !item.item_uid || Number(item.hidden || 0) === 1) {
    throw notFound("Schedule item not found");
  }
  return item;
}

function canMutateScheduleComment(comment = {}, auth = {}, projectRole = "none") {
  if (["admin", "manager"].includes(projectRole) || auth.role === "admin") return true;
  const currentActor = actorId(auth);
  return Boolean(currentActor && comment.user_uid && currentActor === comment.user_uid);
}

function requireScheduleCommentMutationPermission(comment = {}, auth = {}, projectRole = "none") {
  if (!canMutateScheduleComment(comment, auth, projectRole)) {
    throw forbidden("No permission to mutate schedule comment");
  }
}

async function getProjectRole(project, auth = {}) {
  if (auth.role === "admin") return "admin";

  const userUid = actorId(auth);
  const user = await fetchUserByAuth(auth);
  const names = Array.from(new Set([user?.name, auth.name, auth.username].filter(Boolean)));
  if (names.includes(project.owner_text)) return "manager";

  const where = ["project_uid = ?", "status = 'active'"];
  const params = [project.project_uid];
  const identityClauses = [];

  if (userUid) {
    identityClauses.push("user_uid = ?");
    params.push(userUid);
  }

  if (names.length) {
    identityClauses.push(`member_name IN (${names.map(() => "?").join(", ")})`);
    params.push(...names);
  }

  if (!identityClauses.length) return "none";
  where.push(`(${identityClauses.join(" OR ")})`);

  const [rows] = await mysqlPool.execute(
    `
      SELECT member_role
      FROM project_members
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE member_role
          WHEN 'manager' THEN 1
          WHEN 'editor' THEN 2
          WHEN 'readonly' THEN 3
          ELSE 4
        END ASC,
        id ASC
      LIMIT 1
    `,
    params
  );

  return rows[0]?.member_role || "none";
}

async function requireProjectPermission(project, auth = {}, capability = "view") {
  const role = await getProjectRole(project, auth);
  const allowed = {
    view: ["admin", "manager", "editor", "readonly"],
    edit: ["admin", "manager", "editor"],
    manage: ["admin", "manager"]
  };

  if (!allowed[capability]?.includes(role)) {
    throw forbidden("No permission to access project schedule");
  }

  return role;
}

function requireScheduleExportPermission(projectRole = "none", auth = {}) {
  const role = String(projectRole || "").trim();
  if (!["admin", "manager", "editor", "readonly"].includes(role)) {
    throw forbidden("No permission to access project schedule");
  }

  if (!canExport(auth)) {
    throw forbidden("No permission to export");
  }
  return role;
}

async function fetchActivePlan(projectUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        sp.id,
        sp.plan_uid,
        sp.project_uid,
        sp.title,
        sp.status,
        sp.start_date,
        sp.end_date,
        sp.default_view,
        sp.view_config_json,
        p.id AS project_row_id,
        p.legacy_project_id,
        p.name AS project_name
      FROM schedule_plans sp
      INNER JOIN projects p ON p.project_uid = sp.project_uid
      WHERE sp.project_uid = ? AND sp.status = 'active'
      ORDER BY sp.id DESC
      LIMIT 1
    `,
    [projectUid]
  );
  return rows[0] || null;
}

async function insertDefaultPlan(project, actor = "", payload = {}) {
  const planUid = String(payload.planId || payload.planUid || payload.id || "").trim() || makeUid("sp");
  const viewConfig = normalizeViewConfig(payload.defaultView, payload.viewConfig || {});
  const startDate = toDateSql(payload.startDate) ?? normalizeWorkspaceDateForSql(project.start_date) ?? null;
  const endDate = toDateSql(payload.endDate) ?? normalizeWorkspaceDateForSql(project.end_date) ?? null;
  const payloadJson = isPlainObject(payload.payload) ? payload.payload : {};

  await mysqlPool.execute(
    `
      INSERT INTO schedule_plans (
        plan_uid,
        project_uid,
        title,
        status,
        start_date,
        end_date,
        default_view,
        view_config_json,
        payload_json,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      planUid,
      project.project_uid,
      normalizePlanTitle(payload.title),
      startDate,
      endDate,
      viewConfig.defaultView,
      JSON.stringify({
        dayWidth: viewConfig.dayWidth,
        rowHeight: viewConfig.rowHeight
      }),
      JSON.stringify({
        ...payloadJson,
        source: payloadJson.source || "schedule-api"
      }),
      actor,
      actor
    ]
  );

  return fetchActivePlan(project.project_uid);
}

async function ensureActivePlan(project, actor = "", payload = {}) {
  const existing = await fetchActivePlan(project.project_uid);
  if (existing) return existing;

  try {
    return await insertDefaultPlan(project, actor, payload);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return fetchActivePlan(project.project_uid);
    throw error;
  }
}

async function updateActivePlan(project, payload = {}, actor = "") {
  const plan = await ensureActivePlan(project, actor, payload);
  const currentConfig = normalizeViewConfig(plan.default_view, parseJson(plan.view_config_json, {}));
  const viewConfig = normalizeViewConfig(
    payload.defaultView || payload.viewConfig?.defaultView || currentConfig.defaultView,
    {
      ...currentConfig,
      ...(payload.viewConfig || {})
    }
  );
  const startDate = payload.startDate === undefined ? (normalizeWorkspaceDateForSql(plan.start_date) ?? null) : toDateSql(payload.startDate);
  const endDate = payload.endDate === undefined ? (normalizeWorkspaceDateForSql(plan.end_date) ?? null) : toDateSql(payload.endDate);

  await mysqlPool.execute(
    `
      UPDATE schedule_plans
      SET
        title = ?,
        start_date = ?,
        end_date = ?,
        default_view = ?,
        view_config_json = ?,
        updated_by = ?
      WHERE plan_uid = ?
    `,
    [
      payload.title === undefined ? normalizePlanTitle(plan.title) : normalizePlanTitle(payload.title),
      startDate,
      endDate,
      viewConfig.defaultView,
      JSON.stringify({
        dayWidth: viewConfig.dayWidth,
        rowHeight: viewConfig.rowHeight
      }),
      actor,
      plan.plan_uid
    ]
  );

  return fetchActivePlan(project.project_uid);
}

async function fetchScheduleItems(planUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        si.*,
        t.id AS task_row_id,
        t.legacy_task_id AS task_legacy_task_id,
        COALESCE(comment_counts.comments_count, 0) AS comments_count
      FROM schedule_items si
      LEFT JOIN tasks t ON t.task_uid = si.task_uid
      LEFT JOIN (
        SELECT item_uid, COUNT(*) AS comments_count
        FROM schedule_item_comments
        GROUP BY item_uid
      ) comment_counts ON comment_counts.item_uid = si.item_uid
      WHERE si.plan_uid = ? AND si.hidden = 0
      ORDER BY si.sort_order ASC, si.id ASC
    `,
    [planUid]
  );

  return rows.map(mapScheduleItemRow);
}

async function fetchDependencies(planUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT sd.*
      FROM schedule_dependencies sd
      INNER JOIN schedule_items from_item
        ON from_item.item_uid = sd.from_item_uid AND from_item.hidden = 0
      INNER JOIN schedule_items to_item
        ON to_item.item_uid = sd.to_item_uid AND to_item.hidden = 0
      WHERE sd.plan_uid = ?
      ORDER BY sd.id ASC
    `,
    [planUid]
  );

  return rows.map(mapScheduleDependencyRow);
}

async function fetchSchedulePayload(planRow) {
  const [items, dependencies] = await Promise.all([
    fetchScheduleItems(planRow.plan_uid),
    fetchDependencies(planRow.plan_uid)
  ]);

  const plan = mapSchedulePlanRow(planRow, items);
  return buildScheduleResponse(plan, items, dependencies);
}

function buildScheduleExportHtml(schedule = {}) {
  const plan = schedule.plan || {};
  const items = Array.isArray(schedule.items) ? schedule.items : [];
  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.module)}</td>
      <td>${escapeHtml(item.owner)}</td>
      <td>${escapeHtml(item.startDate)}</td>
      <td>${escapeHtml(item.endDate)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.progress)}%</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(plan.title || "排期导出")}</title>
</head>
<body>
  <h1>${escapeHtml(plan.title || "排期导出")}</h1>
  <p>项目：${escapeHtml(plan.projectName || plan.projectUid || plan.projectId || "")}</p>
  <p>时间范围：${escapeHtml(plan.startDate || "")} - ${escapeHtml(plan.endDate || "")}</p>
  <table>
    <thead>
      <tr><th>标题</th><th>模块</th><th>负责人</th><th>开始</th><th>结束</th><th>状态</th><th>进度</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function buildScheduleExportRecord(plan = {}, payload = {}, exportId = makeUid("sex")) {
  const requestedFormat = String(payload.format || "html").trim().toLowerCase() || "html";
  const effectiveFormat = "html";
  const htmlOnly = true;
  const html = String(payload.html || "");
  const projectId = plan.project_uid || plan.projectUid || String(plan.projectId || "");
  const planId = plan.plan_uid || plan.id || "";
  const fileName = `schedule-${projectId || "project"}-${dateStamp()}.${effectiveFormat}`;
  const mimeType = "text/html; charset=utf-8";
  const disposition = `attachment; filename="${fileName}"`;

  return {
    export: {
      id: exportId,
      exportId,
      snapshotId: exportId,
      projectId,
      planId,
      title: plan.title || "排期导出",
      format: requestedFormat,
      requestedFormat,
      effectiveFormat,
      htmlOnly,
      status: "ready",
      createdAt: toDateTimeSlash(new Date())
    },
    download: {
      fileName,
      mimeType,
      contentType: mimeType,
      requestedFormat,
      effectiveFormat,
      htmlOnly,
      encoding: "utf8",
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": disposition
      },
      content: html,
      base64: Buffer.from(html, "utf8").toString("base64")
    }
  };
}

async function resolveScheduleItemByAnyId(itemId, payload = {}) {
  const clean = String(itemId || "").trim();
  if (!clean) throw badRequest("itemId is required");
  const taskUidCandidates = taskUidCandidatesFromItemId(clean, payload);

  if (taskUidCandidates.length) {
    const placeholders = taskUidCandidates.map(() => "?").join(", ");
    const [linkedRows] = await mysqlPool.execute(
      `
        SELECT
          si.*,
          t.id AS task_row_id,
          t.legacy_task_id AS task_legacy_task_id,
          COALESCE(comment_counts.comments_count, 0) AS comments_count
        FROM schedule_items si
        LEFT JOIN tasks t ON t.task_uid = si.task_uid
        LEFT JOIN (
          SELECT item_uid, COUNT(*) AS comments_count
          FROM schedule_item_comments
          GROUP BY item_uid
        ) comment_counts ON comment_counts.item_uid = si.item_uid
        WHERE si.task_uid IN (${placeholders}) AND si.hidden = 0
        ORDER BY si.id ASC
        LIMIT 1
      `,
      taskUidCandidates
    );

    if (linkedRows.length) return assertScheduleItemVisibleForComments(linkedRows[0]);
    throw scheduleItemLinkRequired(taskUidCandidates[0]);
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        si.*,
        t.id AS task_row_id,
        t.legacy_task_id AS task_legacy_task_id,
        COALESCE(comment_counts.comments_count, 0) AS comments_count
      FROM schedule_items si
      LEFT JOIN tasks t ON t.task_uid = si.task_uid
      LEFT JOIN (
        SELECT item_uid, COUNT(*) AS comments_count
        FROM schedule_item_comments
        GROUP BY item_uid
      ) comment_counts ON comment_counts.item_uid = si.item_uid
      WHERE si.item_uid = ? OR CAST(si.id AS CHAR) = ?
      ORDER BY si.id ASC
      LIMIT 1
    `,
    [clean, clean]
  );

  if (!rows.length) throw notFound("Schedule item not found");
  return assertScheduleItemVisibleForComments(rows[0]);
}

async function resolveExistingScheduleItemForWrite(itemId, payload = {}) {
  const clean = String(itemId || "").trim();
  if (!clean) throw badRequest("itemId is required");
  const taskUidCandidates = taskUidCandidatesFromItemId(clean, payload);

  if (taskUidCandidates.length) {
    const placeholders = taskUidCandidates.map(() => "?").join(", ");
    const [linkedRows] = await mysqlPool.execute(
      `
        SELECT
          si.*,
          t.id AS task_row_id,
          t.legacy_task_id AS task_legacy_task_id,
          COALESCE(comment_counts.comments_count, 0) AS comments_count
        FROM schedule_items si
        LEFT JOIN tasks t ON t.task_uid = si.task_uid
        LEFT JOIN (
          SELECT item_uid, COUNT(*) AS comments_count
          FROM schedule_item_comments
          GROUP BY item_uid
        ) comment_counts ON comment_counts.item_uid = si.item_uid
        WHERE si.task_uid IN (${placeholders}) AND si.hidden = 0
        ORDER BY si.id ASC
        LIMIT 1
      `,
      taskUidCandidates
    );

    if (linkedRows.length) return assertScheduleItemVisibleForComments(linkedRows[0]);
  }

  if (!isFrontendLocalId(clean, "si") && !isTaskLikeScheduleItemId(clean)) {
    const [rows] = await mysqlPool.execute(
      `
        SELECT
          si.*,
          t.id AS task_row_id,
          t.legacy_task_id AS task_legacy_task_id,
          COALESCE(comment_counts.comments_count, 0) AS comments_count
        FROM schedule_items si
        LEFT JOIN tasks t ON t.task_uid = si.task_uid
        LEFT JOIN (
          SELECT item_uid, COUNT(*) AS comments_count
          FROM schedule_item_comments
          GROUP BY item_uid
        ) comment_counts ON comment_counts.item_uid = si.item_uid
        WHERE si.item_uid = ? OR CAST(si.id AS CHAR) = ?
        ORDER BY si.id ASC
        LIMIT 1
      `,
      [clean, clean]
    );

    if (rows.length) return assertScheduleItemVisibleForComments(rows[0]);
  }

  const clientItemIds = clientItemIdCandidatesFromPayload(clean, payload);
  if (!clientItemIds.length) return null;
  const likeClauses = clientItemIds.map(() => "si.payload_json LIKE ?").join(" OR ");
  const [clientRows] = await mysqlPool.execute(
    `
      SELECT
        si.*,
        t.id AS task_row_id,
        t.legacy_task_id AS task_legacy_task_id,
        COALESCE(comment_counts.comments_count, 0) AS comments_count
      FROM schedule_items si
      LEFT JOIN tasks t ON t.task_uid = si.task_uid
      LEFT JOIN (
        SELECT item_uid, COUNT(*) AS comments_count
        FROM schedule_item_comments
        GROUP BY item_uid
      ) comment_counts ON comment_counts.item_uid = si.item_uid
      WHERE si.hidden = 0 AND (${likeClauses})
      ORDER BY si.id ASC
      LIMIT 10
    `,
    clientItemIds.map((candidate) => `%${candidate}%`)
  );

  return clientRows.find((row) => rowMatchesClientItemId(row, clientItemIds)) || null;
}

async function fetchTaskByUid(taskUid) {
  const clean = String(taskUid || "").trim();
  if (!clean) return null;

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        id,
        task_uid,
        legacy_task_id,
        title,
        task_type,
        module_key,
        owner_text,
        status,
        start_date,
        end_date
      FROM tasks
      WHERE task_uid = ? OR CAST(id AS CHAR) = ? OR CAST(legacy_task_id AS CHAR) = ?
      LIMIT 1
    `,
    [clean, clean, clean]
  );

  return rows[0] ? mapLinkedTaskRow(rows[0]) : null;
}

async function fetchItemResponse(itemUid) {
  const row = await resolveScheduleItemByAnyId(itemUid);
  return mapScheduleItemRow(row);
}

async function resolveScheduleCommentForItem(itemUid, commentId) {
  const clean = String(commentId || "").trim();
  if (!clean) throw badRequest("commentId is required");

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        comment_uid,
        item_uid,
        plan_uid,
        project_uid,
        user_uid,
        user_name,
        user_dept,
        tone,
        content_text,
        payload_json,
        DATE_FORMAT(commented_at, '%Y-%m-%d %H:%i:%s') AS commented_at_text,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text
      FROM schedule_item_comments
      WHERE item_uid = ? AND comment_uid = ?
      LIMIT 1
    `,
    [itemUid, clean]
  );

  if (!rows.length) throw notFound("Schedule comment not found");
  return rows[0];
}

async function createDependencies(plan, itemUid, dependencyIds = [], actor = "") {
  if (!Array.isArray(dependencyIds) || !dependencyIds.length) return;

  for (const dependencyId of dependencyIds) {
    const fromItemUid = String(dependencyId || "").trim();
    if (!fromItemUid || fromItemUid === itemUid) continue;

    const [sourceRows] = await mysqlPool.execute(
      `
        SELECT item_uid
        FROM schedule_items
        WHERE item_uid = ? AND plan_uid = ? AND project_uid = ? AND hidden = 0
        LIMIT 1
      `,
      [fromItemUid, plan.plan_uid, plan.project_uid]
    );
    if (!sourceRows.length) throw badRequest(`Invalid dependency item: ${fromItemUid}`);

    await mysqlPool.execute(
      `
        INSERT INTO schedule_dependencies (
          dependency_uid,
          plan_uid,
          project_uid,
          from_item_uid,
          to_item_uid,
          dependency_type,
          lag_days,
          created_by,
          updated_by
        )
        VALUES (?, ?, ?, ?, ?, 'finish_to_start', 0, ?, ?)
        ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by)
      `,
      [makeUid("sd"), plan.plan_uid, plan.project_uid, fromItemUid, itemUid, actor, actor]
    );
  }
}

async function updateLinkedTaskFromItem(item, actor = "") {
  if (!item.task_uid || Number(item.link_task || 0) !== 1) return fetchTaskByUid(item.task_uid);
  const nextTaskArchived = linkedTaskArchivedFlagFromScheduleStatus(item.status);

  await mysqlPool.execute(
    `
      UPDATE tasks
      SET
        title = ?,
        task_type = '排期',
        module_key = ?,
        owner_text = ?,
        status = ?,
        start_date = ?,
        end_date = ?,
        note_text = ?,
        archived = CASE WHEN ? IS NULL THEN archived ELSE ? END,
        updated_by = ?
      WHERE task_uid = ?
    `,
    [
      item.title || "",
      item.module_key || "project",
      item.owner_text || "",
      item.status || "todo",
      normalizeWorkspaceDateForSql(item.start_date) ?? null,
      normalizeWorkspaceDateForSql(item.end_date) ?? null,
      item.note_text || "",
      nextTaskArchived,
      nextTaskArchived,
      actor,
      item.task_uid
    ]
  );

  return fetchTaskByUid(item.task_uid);
}

export async function getProjectSchedule(projectId, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "view");

  const plan = await ensureActivePlan(project, actorId(auth));
  return fetchSchedulePayload(plan);
}

export async function createOrUpdateSchedulePlan(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "edit");

  const plan = await updateActivePlan(project, payload, actorId(auth));
  const bundle = normalizeScheduleBundlePayload(payload);
  if (bundle.items.length) {
    for (const item of bundle.items) {
      const shouldCreate = !item.itemId;
      if (shouldCreate) {
        await createScheduleItem(project.project_uid, item, auth);
      } else {
        await updateScheduleItem(item.itemId, item, auth);
      }
    }
  }
  return fetchSchedulePayload(plan);
}

export async function listScheduleSnapshots(projectId, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "view");
  const plan = await ensureActivePlan(project, actorId(auth));

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        snapshot_uid,
        plan_uid,
        project_uid,
        title,
        summary_json,
        snapshot_json,
        created_by,
        created_by_name,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text
      FROM schedule_snapshots
      WHERE project_uid = ? AND plan_uid = ?
      ORDER BY created_at DESC, id DESC
    `,
    [project.project_uid, plan.plan_uid]
  );

  return {
    snapshots: rows.map(mapScheduleSnapshotRow)
  };
}

export async function createScheduleSnapshot(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "edit");
  const plan = await ensureActivePlan(project, actorId(auth));
  const schedule = await fetchSchedulePayload(plan);
  const snapshotUid = String(payload.snapshotId || payload.snapshotUid || payload.id || "").trim() || makeUid("ss");
  const title = String(payload.title || "").trim() || `${schedule.plan.title || "Schedule"} snapshot`;
  const user = await fetchUserByAuth(auth);
  const createdByName = user?.name || user?.username || auth.name || auth.username || actorId(auth);

  await mysqlPool.execute(
    `
      INSERT INTO schedule_snapshots (
        snapshot_uid,
        plan_uid,
        project_uid,
        title,
        summary_json,
        snapshot_json,
        created_by,
        created_by_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      snapshotUid,
      plan.plan_uid,
      project.project_uid,
      title,
      JSON.stringify(schedule.plan.summary || {}),
      JSON.stringify(payload.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : schedule),
      actorId(auth),
      createdByName
    ]
  );

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        snapshot_uid,
        plan_uid,
        project_uid,
        title,
        summary_json,
        snapshot_json,
        created_by,
        created_by_name,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text
      FROM schedule_snapshots
      WHERE snapshot_uid = ?
      LIMIT 1
    `,
    [snapshotUid]
  );

  return {
    snapshot: mapScheduleSnapshotRow(rows[0])
  };
}

export async function listScheduleTemplates(auth = {}) {
  assertMySQLReady();
  const userUid = actorId(auth);
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        template_uid,
        title,
        description,
        owner_user_uid,
        visibility,
        item_count,
        template_json,
        payload_json,
        created_by,
        updated_by,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM schedule_templates
      WHERE visibility IN ('workspace', 'public') OR owner_user_uid = ? OR created_by = ? OR ? = 'admin'
      ORDER BY updated_at DESC, id DESC
    `,
    [userUid, userUid, auth.role === "admin" ? "admin" : ""]
  );

  return {
    templates: rows.map(mapScheduleTemplateRow)
  };
}

export async function createScheduleTemplate(payload = {}, auth = {}) {
  assertMySQLReady();
  const normalized = normalizeScheduleTemplatePayload(payload);
  const userUid = actorId(auth);
  const templateUid = String(payload.templateId || payload.templateUid || payload.id || "").trim() || makeUid("st");

  await mysqlPool.execute(
    `
      INSERT INTO schedule_templates (
        template_uid,
        title,
        description,
        owner_user_uid,
        visibility,
        item_count,
        template_json,
        payload_json,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      templateUid,
      normalized.title,
      normalized.description,
      userUid,
      normalized.visibility,
      normalized.itemCount,
      JSON.stringify(normalized.template),
      JSON.stringify(normalized.payload),
      userUid,
      userUid
    ]
  );

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        template_uid,
        title,
        description,
        owner_user_uid,
        visibility,
        item_count,
        template_json,
        payload_json,
        created_by,
        updated_by,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM schedule_templates
      WHERE template_uid = ?
      LIMIT 1
    `,
    [templateUid]
  );

  return {
    template: mapScheduleTemplateRow(rows[0])
  };
}

export async function createScheduleExport(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  const projectRole = await requireProjectPermission(project, auth, "view");
  requireScheduleExportPermission(projectRole, auth);
  const plan = await ensureActivePlan(project, actorId(auth));
  const schedule = await fetchSchedulePayload(plan);
  const exportUid = String(payload.exportId || payload.snapshotId || payload.id || "").trim() || makeUid("sex");
  const html = buildScheduleExportHtml(schedule);
  const record = buildScheduleExportRecord(plan, { ...payload, html }, exportUid);
  const snapshotPayload = {
    kind: "export",
    export: record.export,
    download: {
      fileName: record.download.fileName,
      mimeType: record.download.mimeType,
      content: record.download.content
    },
    schedule
  };

  await mysqlPool.execute(
    `
      INSERT INTO schedule_snapshots (
        snapshot_uid,
        plan_uid,
        project_uid,
        title,
        summary_json,
        snapshot_json,
        created_by,
        created_by_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      exportUid,
      plan.plan_uid,
      project.project_uid,
      `${schedule.plan.title || "Schedule"} export`,
      JSON.stringify(schedule.plan.summary || {}),
      JSON.stringify(snapshotPayload),
      actorId(auth),
      auth.name || auth.username || actorId(auth)
    ]
  );

  return record;
}

export async function createScheduleItem(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const normalized = normalizeCreateItemPayload(payload);
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "edit");

  const plan = await ensureActivePlan(project, actorId(auth));
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? Date.now());
  const requestedItemUid = String(payload.itemId || payload.itemUid || payload.scheduleItemId || payload.id || payload.clientItemId || "").trim();
  const clientItemId = localClientItemIdFromPayload(requestedItemUid, payload);
  const existingItemCandidate = requestedItemUid || clientItemId || payload.taskUid || payload.taskId;
  const existing = existingItemCandidate
    ? await resolveExistingScheduleItemForWrite(existingItemCandidate, payload)
    : null;
  if (existing && existing.project_uid === project.project_uid) {
    return updateScheduleItem(existing.item_uid, {
      ...payload,
      itemId: existing.item_uid,
      id: existing.item_uid,
      linkTask: payload.linkTask ?? payload.addToTaskList ?? existing.link_task === 1
    }, auth);
  }

  const itemUid = resolveClientScheduleItemUid(payload) || makeUid("si");
  let task = null;
  let taskUid = String(compatibleField(payload, ["taskUid", "task_uid", "taskId", "task_id"]) || "").trim();
  let legacyTaskId = Number(payload.legacyTaskId || 0) || null;

  if (normalized.addToTaskList) {
    const linkedTaskUid = taskUid || makeUid("task");
    const linkedLegacyTaskId = legacyTaskId || Date.now();
    task = await createTask(
      project.project_uid,
      {
        taskId: linkedTaskUid,
        id: linkedLegacyTaskId,
        title: normalized.title,
        type: "排期",
        module: normalized.module,
        owner: normalized.owner,
        status: normalized.status,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        note: normalized.note,
        sortOrder
      },
      actorId(auth)
    );
    taskUid = task.taskUid || task.taskId || "";
    legacyTaskId = Number(task.id || 0) || legacyTaskId;
  }

  await mysqlPool.execute(
    `
      INSERT INTO schedule_items (
        item_uid,
        plan_uid,
        project_uid,
        task_uid,
        legacy_task_id,
        item_type,
        title,
        module_key,
        owner_user_uid,
        owner_text,
        status,
        priority,
        progress,
        start_date,
        end_date,
        sort_order,
        hidden,
        link_task,
        link_flow,
        note_text,
        payload_json,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `,
    [
      itemUid,
      plan.plan_uid,
      project.project_uid,
      taskUid || null,
      legacyTaskId,
      normalized.type,
      normalized.title,
      normalized.module,
      normalized.ownerUserId,
      normalized.owner,
      normalized.status,
      normalized.priority,
      normalized.progress,
      normalized.startDate,
      normalized.endDate,
      Number.isFinite(sortOrder) ? sortOrder : Date.now(),
      normalized.linkTask ? 1 : 0,
      normalized.linkFlow ? 1 : 0,
      normalized.note,
      JSON.stringify(scheduleItemPayloadForStorage(normalized, payload, { clientItemId, taskUid })),
      actorId(auth),
      actorId(auth)
    ]
  );

  await createDependencies(plan, itemUid, normalized.dependencyIds, actorId(auth));

  const item = await fetchItemResponse(itemUid);
  const linkedTask = taskUid ? await fetchTaskByUid(taskUid) : mapLinkedTask(task);

  return buildScheduleItemMutationResponse({
    item,
    task: linkedTask,
    sync: {
      source: syncSourceFromPayload(payload, "schedule"),
      interaction: syncInteractionFromPayload(payload),
      created: true,
      updated: false,
      scheduleUpdated: true,
      resourceWorkItemUpdated: false,
      taskCreated: Boolean(normalized.addToTaskList && taskUid),
      taskUpdated: false,
      clientItemId
    }
  });
}

export async function updateScheduleItem(itemId, payload = {}, auth = {}) {
  assertMySQLReady();
  const current = await resolveExistingScheduleItemForWrite(itemId, payload);
  if (!current) {
    const projectId = projectIdFromSchedulePayload(payload);
    if (projectId) {
      const clientItemId = localClientItemIdFromPayload(itemId, payload);
      return createScheduleItem(projectId, {
        ...payload,
        itemId: "",
        itemUid: "",
        scheduleItemId: "",
        workItemId: "",
        id: "",
        clientItemId,
        payload: {
          ...frontendPayloadOf(payload),
          ...(clientItemId ? { clientItemId } : {})
        }
      }, auth);
    }

    const taskUidCandidates = taskUidCandidatesFromItemId(itemId, payload);
    if (taskUidCandidates.length) throw scheduleItemLinkRequired(taskUidCandidates[0]);
    if (isFrontendLocalId(itemId, "si")) {
      throw badRequest("projectId or projectUid is required to upsert local schedule item");
    }
    throw notFound("Schedule item not found");
  }

  const project = await resolveProjectByAnyId(current.project_uid);
  await requireProjectPermission(project, auth, "edit");
  const normalized = normalizeUpdateItemPayload(current, payload);
  const requestedTaskUid = String(compatibleField(payload, ["taskUid", "task_uid", "taskId", "task_id"]) || "").trim();
  const linkedTask = requestedTaskUid ? await fetchTaskByUid(requestedTaskUid) : null;
  const nextTaskUid = linkedTask?.taskUid || requestedTaskUid || current.task_uid || null;
  const nextLegacyTaskId = Number(linkedTask?.id || payload.legacyTaskId || current.legacy_task_id || 0) || null;
  const clientItemId = localClientItemIdFromPayload(itemId, payload);

  await mysqlPool.execute(
    `
      UPDATE schedule_items
      SET
        task_uid = ?,
        legacy_task_id = ?,
        item_type = ?,
        title = ?,
        module_key = ?,
        owner_user_uid = ?,
        owner_text = ?,
        status = ?,
        priority = ?,
        progress = ?,
        start_date = ?,
        end_date = ?,
        sort_order = ?,
        link_task = ?,
        link_flow = ?,
        note_text = ?,
        payload_json = ?,
        updated_by = ?
      WHERE item_uid = ?
    `,
    [
      nextTaskUid,
      nextLegacyTaskId,
      normalized.type,
      normalized.title,
      normalized.module,
      normalized.ownerUserId,
      normalized.owner,
      normalized.status,
      normalized.priority,
      normalized.progress,
      normalized.startDate,
      normalized.endDate,
      normalized.sortOrder,
      normalized.linkTask ? 1 : 0,
      normalized.linkFlow ? 1 : 0,
      normalized.note,
      JSON.stringify(scheduleItemPayloadForStorage(normalized, payload, {
        clientItemId: clientItemId || parseJson(current.payload_json, {}).clientItemId || "",
        taskUid: nextTaskUid || ""
      })),
      actorId(auth),
      current.item_uid
    ]
  );

  const updated = await resolveScheduleItemByAnyId(current.item_uid);
  const task = await updateLinkedTaskFromItem(updated, actorId(auth));

  return buildScheduleItemMutationResponse({
    item: mapScheduleItemRow(updated),
    task: mapLinkedTask(task),
    sync: {
      source: syncSourceFromPayload(payload, "schedule"),
      interaction: syncInteractionFromPayload(payload),
      created: false,
      updated: true,
      scheduleUpdated: true,
      resourceWorkItemUpdated: false,
      taskUpdated: Boolean(updated.task_uid && Number(updated.link_task || 0) === 1),
      taskCreated: false,
      clientItemId: clientItemId || parseJson(updated.payload_json, {}).clientItemId || ""
    }
  });
}

export async function listScheduleItemComments(itemId, auth = {}) {
  assertMySQLReady();
  const current = await resolveScheduleItemByAnyId(itemId);
  const project = await resolveProjectByAnyId(current.project_uid);
  await requireProjectPermission(project, auth, "view");

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        comment_uid,
        item_uid,
        plan_uid,
        project_uid,
        user_uid,
        user_name,
        user_dept,
        tone,
        content_text,
        payload_json,
        DATE_FORMAT(commented_at, '%Y-%m-%d %H:%i:%s') AS commented_at_text,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text
      FROM schedule_item_comments
      WHERE item_uid = ?
      ORDER BY commented_at ASC, id ASC
    `,
    [current.item_uid]
  );

  return {
    comments: rows.map(mapScheduleCommentRow)
  };
}

export async function createScheduleItemComment(itemId, payload = {}, auth = {}) {
  assertMySQLReady();
  const normalized = normalizeScheduleCommentPayload(payload);
  const current = await resolveScheduleItemByAnyId(itemId);
  const project = await resolveProjectByAnyId(current.project_uid);
  await requireProjectPermission(project, auth, "view");

  const user = await fetchUserByAuth(auth);
  const commentUid = String(payload.commentId || payload.commentUid || payload.id || "").trim() || makeUid("sic");
  const userUid = user?.user_uid || actorId(auth);
  const userName = user?.name || user?.username || auth.name || auth.username || userUid;
  const userDept = user?.department || auth.department || auth.dept || "";

  await mysqlPool.execute(
    `
      INSERT INTO schedule_item_comments (
        comment_uid,
        item_uid,
        plan_uid,
        project_uid,
        user_uid,
        user_name,
        user_dept,
        tone,
        content_text,
        commented_at,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `,
    [
      commentUid,
      current.item_uid,
      current.plan_uid,
      current.project_uid,
      userUid,
      userName,
      userDept,
      normalized.tone,
      normalized.content,
      JSON.stringify(normalized.payload)
    ]
  );

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        comment_uid,
        item_uid,
        plan_uid,
        project_uid,
        user_uid,
        user_name,
        user_dept,
        tone,
        content_text,
        payload_json,
        DATE_FORMAT(commented_at, '%Y-%m-%d %H:%i:%s') AS commented_at_text,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text
      FROM schedule_item_comments
      WHERE comment_uid = ?
      LIMIT 1
    `,
    [commentUid]
  );

  return {
    comment: mapScheduleCommentRow(rows[0])
  };
}

export async function updateScheduleItemComment(itemId, commentId, payload = {}, auth = {}) {
  assertMySQLReady();
  const normalized = normalizeScheduleCommentPayload(payload);
  const current = await resolveScheduleItemByAnyId(itemId);
  const project = await resolveProjectByAnyId(current.project_uid);
  const role = await requireProjectPermission(project, auth, "view");
  const comment = await resolveScheduleCommentForItem(current.item_uid, commentId);
  requireScheduleCommentMutationPermission(comment, auth, role);

  await mysqlPool.execute(
    `
      UPDATE schedule_item_comments
      SET content_text = ?, payload_json = ?
      WHERE item_uid = ? AND comment_uid = ?
    `,
    [
      normalized.content,
      JSON.stringify(normalized.payload),
      current.item_uid,
      comment.comment_uid
    ]
  );

  return {
    comment: mapScheduleCommentRow(await resolveScheduleCommentForItem(current.item_uid, comment.comment_uid))
  };
}

function buildDeleteCommentResponse(comment = {}) {
  return {
    ok: true,
    deletedCommentId: comment.comment_uid || "",
    commentId: comment.comment_uid || "",
    itemId: comment.item_uid || ""
  };
}

export async function deleteScheduleItemComment(itemId, commentId, auth = {}) {
  assertMySQLReady();
  const current = await resolveScheduleItemByAnyId(itemId);
  const project = await resolveProjectByAnyId(current.project_uid);
  const role = await requireProjectPermission(project, auth, "view");
  const comment = await resolveScheduleCommentForItem(current.item_uid, commentId);
  requireScheduleCommentMutationPermission(comment, auth, role);

  const [result] = await mysqlPool.execute(
    `
      DELETE FROM schedule_item_comments
      WHERE item_uid = ? AND comment_uid = ?
    `,
    [current.item_uid, comment.comment_uid]
  );
  if (!result.affectedRows) throw notFound("Schedule comment not found");

  return buildDeleteCommentResponse(comment);
}

function buildDeleteItemResponse(item = {}) {
  return {
    ok: true,
    deletedItemId: item.item_uid || "",
    itemId: item.item_uid || "",
    taskUid: item.task_uid || "",
    taskDeleted: false
  };
}

function buildSoftDeleteItemStatement(itemUid, actor = "") {
  return {
    sql: `
      UPDATE schedule_items
      SET hidden = 1, status = 'deleted', updated_by = ?
      WHERE item_uid = ?
    `,
    params: [actor, itemUid]
  };
}

export async function deleteScheduleItem(itemId, auth = {}) {
  assertMySQLReady();
  const current = await resolveScheduleItemByAnyId(itemId);
  const project = await resolveProjectByAnyId(current.project_uid);
  await requireProjectPermission(project, auth, "edit");

  const statement = buildSoftDeleteItemStatement(current.item_uid, actorId(auth));
  const [result] = await mysqlPool.execute(statement.sql, statement.params);
  if (!result.affectedRows) throw notFound("Schedule item not found");

  return buildDeleteItemResponse(current);
}

export const __private__ = {
  assertScheduleItemVisibleForComments,
  buildScheduleItemMutationResponse,
  buildDeleteItemResponse,
  buildDeleteCommentResponse,
  buildMySQLUnavailableError,
  buildScheduleExportRecord,
  buildSoftDeleteItemStatement,
  canMutateScheduleComment,
  clientItemIdCandidatesFromPayload,
  mapScheduleSnapshotRow,
  mapScheduleCommentRow,
  mapScheduleTemplateRow,
  mapLinkedTaskForResponse: mapLinkedTaskRow,
  normalizeCreateItemPayload,
  normalizeScheduleBundlePayload,
  normalizeScheduleCommentPayload,
  normalizeScheduleTemplatePayload,
  normalizeUpdateItemPayload,
  resolveClientScheduleItemUid,
  requireScheduleExportPermission
};
