import { clampDateRange, formatSlashDate } from "./dateRange.js";

const DEFAULT_VIEW_CONFIG = {
  defaultView: "timeline",
  dayWidth: 28,
  rowHeight: 34
};

const DEFAULT_SUMMARY = {
  itemCount: 0,
  pendingCount: 0,
  doneCount: 0,
  riskCount: 0
};

function firstDefined(source, keys, fallback = undefined) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) return source[key];
  }
  return fallback;
}

function normalizeId(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeNullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function normalizeNullableId(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : String(value).trim();
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return fallback;
}

function normalizeDateValue(value) {
  return formatSlashDate(value) || "";
}

function normalizeRange(startDate, endDate) {
  return clampDateRange(normalizeDateValue(startDate), normalizeDateValue(endDate));
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
}

function normalizePayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function isTaskFallbackId(value) {
  return normalizeId(value).startsWith("task-");
}

function isLocalScheduleId(value) {
  return normalizeId(value).startsWith("si-local-");
}

function normalizePersistedItemAlias(value, fallback = "") {
  const id = normalizeId(value);
  if (id && !isTaskFallbackId(id) && !isLocalScheduleId(id)) return id;
  const fallbackId = normalizeId(fallback);
  return fallbackId && !isTaskFallbackId(fallbackId) && !isLocalScheduleId(fallbackId) ? fallbackId : "";
}

function todaySlash() {
  return formatSlashDate(new Date());
}

function summaryFromItems(items = []) {
  return {
    itemCount: items.length,
    pendingCount: items.filter((item) => item.status !== "done").length,
    doneCount: items.filter((item) => item.status === "done").length,
    riskCount: items.filter((item) => item.status === "risk" || item.risk === true).length
  };
}

function addKeyVariant(target, value) {
  const text = normalizeId(value);
  if (!text) return;
  target.add(text);
  if (text.startsWith("task-")) {
    target.add(text.slice(5));
  } else {
    target.add(`task-${text}`);
  }
}

function taskKeyFromTask(task = {}) {
  return normalizeId(firstDefined(task, ["taskUid", "task_uid", "uid", "taskId", "task_id", "id"]));
}

function normalizeTaskComment(comment = {}, index = 0, itemId = "", taskUid = "") {
  const content = String(firstDefined(comment, ["content", "body", "text"], "")).trim();
  const id = normalizeId(firstDefined(comment, ["id", "commentId", "comment_id"]), `task-comment-${taskUid || "local"}-${index}`);

  return {
    ...comment,
    id,
    itemId,
    content,
    body: content,
    authorName: normalizeId(firstDefined(comment, ["authorName", "author_name", "userName", "user_name", "user", "author", "sender"]), ""),
    createdAt: firstDefined(comment, ["createdAt", "created_at", "commentedAt", "commented_at", "time"], ""),
    syncStatus: firstDefined(comment, ["syncStatus", "sync_status"], "local"),
    payload: {
      ...(comment.payload || comment.meta || {}),
      taskUid,
      source: "task"
    }
  };
}

function mergeComments(...commentLists) {
  const seen = new Set();
  const merged = [];
  commentLists.flat().forEach((comment) => {
    const key = normalizeId(comment?.id) || `${comment?.itemId || ""}|${comment?.createdAt || comment?.time || ""}|${comment?.content || comment?.body || comment?.text || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(comment);
  });
  return merged;
}

function taskKeysFromItem(item = {}) {
  const keys = new Set();
  addKeyVariant(keys, firstDefined(item, ["taskUid", "task_uid", "taskId", "task_id"]));
  addKeyVariant(keys, item.payload?.taskUid);
  addKeyVariant(keys, item.payload?.taskId);
  addKeyVariant(keys, item.payload?.backendTaskId);
  addKeyVariant(keys, String(item.id || "").startsWith("task-") ? item.id : "");
  addKeyVariant(keys, String(item.itemId || "").startsWith("task-") ? item.itemId : "");
  return [...keys];
}

function itemKeysFromItem(item = {}) {
  return [item.id, item.itemId].map((value) => normalizeId(value)).filter(Boolean);
}

function rangeFromItems(items = [], fallbackStartDate = "", fallbackEndDate = "") {
  const starts = items.map((item) => item.startDate).filter(Boolean).sort();
  const ends = items.map((item) => item.endDate).filter(Boolean).sort();
  const startDate = fallbackStartDate || starts[0] || todaySlash();
  const endDate = fallbackEndDate || ends[ends.length - 1] || startDate;
  return normalizeRange(startDate, endDate);
}

export function normalizeScheduleItem(payload = {}) {
  const rawId = firstDefined(payload, ["id", "itemId", "item_id"]);
  const planId = normalizeId(firstDefined(payload, ["planId", "plan_id"]));
  const taskUid = normalizeId(firstDefined(payload, ["taskUid", "task_uid", "taskId", "task_id"]));
  const fallbackId = taskUid ? `task-${taskUid}` : "";
  const itemId = normalizeId(rawId, fallbackId);
  const scheduleItemId = normalizePersistedItemAlias(firstDefined(payload, ["scheduleItemId", "schedule_item_id"]), itemId);
  const workItemId = normalizePersistedItemAlias(firstDefined(payload, ["workItemId", "work_item_id"]), scheduleItemId || itemId);
  const range = normalizeRange(firstDefined(payload, ["startDate", "start_date"]), firstDefined(payload, ["endDate", "end_date"]));
  const comments = Array.isArray(payload.comments) ? payload.comments : [];

  return {
    id: itemId,
    itemId,
    scheduleItemId,
    workItemId,
    projectId: normalizeNullableId(firstDefined(payload, ["projectId", "project_id"])),
    planId,
    taskUid,
    type: normalizeId(firstDefined(payload, ["type"]), "schedule"),
    title: normalizeId(firstDefined(payload, ["title", "name"]), "未命名排期"),
    module: normalizeId(firstDefined(payload, ["module", "moduleKey", "module_key"]), "project"),
    owner: normalizeId(firstDefined(payload, ["owner", "assignee"]), ""),
    startDate: range.startDate,
    endDate: range.endDate,
    status: normalizeId(firstDefined(payload, ["status", "scheduleStatus", "schedule_status"]), "todo"),
    progress: Math.max(0, Math.min(100, normalizeNumber(firstDefined(payload, ["progress"]), 0))),
    sortOrder: normalizeNumber(firstDefined(payload, ["sortOrder", "sort_order"]), 0),
    hidden: normalizeBoolean(firstDefined(payload, ["hidden", "is_hidden"]), false),
    linkTask: normalizeBoolean(firstDefined(payload, ["linkTask", "link_task"]), false),
    linkFlow: normalizeBoolean(firstDefined(payload, ["linkFlow", "link_flow"]), false),
    dependencyIds: toArray(firstDefined(payload, ["dependencyIds", "dependency_ids"])).map((item) => String(item)),
    comments,
    commentsCount: normalizeNumber(firstDefined(payload, ["commentsCount", "comments_count"]), comments.length),
    payload: normalizePayload(firstDefined(payload, ["payload", "meta"], {}))
  };
}

export function normalizeScheduleDependency(payload = {}) {
  const id = normalizeId(firstDefined(payload, ["id", "dependencyId", "dependency_id"]));

  return {
    id,
    fromItemId: normalizeId(firstDefined(payload, ["fromItemId", "from_item_id"])),
    toItemId: normalizeId(firstDefined(payload, ["toItemId", "to_item_id"])),
    type: normalizeId(firstDefined(payload, ["type"]), "finish_to_start"),
    lagDays: normalizeNumber(firstDefined(payload, ["lagDays", "lag_days"]), 0),
    payload: normalizePayload(firstDefined(payload, ["payload", "meta"], {}))
  };
}

export function normalizeSchedulePlan(payload = {}) {
  const viewConfig = firstDefined(payload, ["viewConfig", "view_config"], {});
  const summary = firstDefined(payload, ["summary"], {});
  const range = normalizeRange(firstDefined(payload, ["startDate", "start_date"]), firstDefined(payload, ["endDate", "end_date"]));

  return {
    id: normalizeId(firstDefined(payload, ["id", "planId", "plan_id"])),
    projectId: normalizeNullableId(firstDefined(payload, ["projectId", "project_id"])),
    title: normalizeId(firstDefined(payload, ["title", "name"]), "项目排期"),
    startDate: range.startDate,
    endDate: range.endDate,
    status: normalizeId(firstDefined(payload, ["status"]), "active"),
    viewConfig: {
      defaultView: normalizeId(firstDefined(viewConfig, ["defaultView", "default_view"]), DEFAULT_VIEW_CONFIG.defaultView),
      dayWidth: normalizeNumber(firstDefined(viewConfig, ["dayWidth", "day_width"]), DEFAULT_VIEW_CONFIG.dayWidth),
      rowHeight: normalizeNumber(firstDefined(viewConfig, ["rowHeight", "row_height"]), DEFAULT_VIEW_CONFIG.rowHeight)
    },
    summary: {
      itemCount: normalizeNumber(firstDefined(summary, ["itemCount", "item_count"]), DEFAULT_SUMMARY.itemCount),
      pendingCount: normalizeNumber(firstDefined(summary, ["pendingCount", "pending_count"]), DEFAULT_SUMMARY.pendingCount),
      doneCount: normalizeNumber(firstDefined(summary, ["doneCount", "done_count"]), DEFAULT_SUMMARY.doneCount),
      riskCount: normalizeNumber(firstDefined(summary, ["riskCount", "risk_count"]), DEFAULT_SUMMARY.riskCount)
    }
  };
}

export function taskToScheduleItem(task = {}, projectId = null, planId = "", index = 0) {
  const taskUid = normalizeId(firstDefined(task, ["taskUid", "task_uid", "uid", "id"]));
  const range = normalizeRange(firstDefined(task, ["startDate", "start_date"]), firstDefined(task, ["endDate", "end_date"]));
  const startDate = range.startDate || todaySlash();
  const endDate = range.endDate || startDate;
  const status = task.archived ? "done" : normalizeId(firstDefined(task, ["scheduleStatus", "schedule_status", "status"]), "todo");
  const comments = toArray(task.comments).map((comment, commentIndex) => normalizeTaskComment(comment, commentIndex, `task-${taskUid || index + 1}`, taskUid));

  return normalizeScheduleItem({
    id: `task-${taskUid || index + 1}`,
    projectId,
    planId,
    taskUid,
    type: "task",
    title: firstDefined(task, ["title", "name"], "未命名任务"),
    module: firstDefined(task, ["module", "moduleKey", "module_key"], "project"),
    owner: firstDefined(task, ["owner", "assignee"], ""),
    startDate,
    endDate,
    status,
    progress: task.archived ? 100 : firstDefined(task, ["progress"], 0),
    sortOrder: firstDefined(task, ["sortOrder", "sort_order", "order"], (Number(index) + 1) * 100),
    hidden: false,
    linkTask: true,
    linkFlow: true,
    comments,
    commentsCount: firstDefined(task, ["commentsCount", "comments_count"], comments.length),
    payload: {
      source: "taskFallback",
      taskType: task.type || "",
      note: task.note || ""
    }
  });
}

function mergeTaskIntoScheduleItem(item, task = {}, index = 0) {
  const taskItem = taskToScheduleItem(task, item.projectId, item.planId, index);
  const comments = mergeComments(
    Array.isArray(item.comments) ? item.comments : [],
    Array.isArray(taskItem.comments) ? taskItem.comments.map((comment) => ({ ...comment, itemId: item.id || item.itemId })) : []
  );

  return normalizeScheduleItem({
    ...item,
    taskUid: item.taskUid || taskItem.taskUid,
    type: item.type || taskItem.type,
    title: taskItem.title || item.title,
    module: taskItem.module || item.module,
    owner: taskItem.owner || item.owner,
    status: taskItem.status || item.status,
    progress: taskItem.progress || item.progress,
    sortOrder: taskItem.sortOrder,
    linkTask: true,
    linkFlow: item.linkFlow || taskItem.linkFlow,
    comments,
    commentsCount: Math.max(
      comments.length,
      normalizeNumber(item.commentsCount, 0),
      normalizeNumber(task.commentsCount ?? task.comments_count, 0),
      normalizeNumber(taskItem.commentsCount, 0)
    ),
    payload: {
      ...(item.payload || {}),
      taskType: task.type || item.payload?.taskType || "",
      note: task.note || item.payload?.note || "",
      source: item.payload?.source || "taskLinked"
    }
  });
}

export function mergeScheduleWithProjectTasks(schedule = {}, { project = {}, tasks = null } = {}) {
  const sourcePlan = normalizeSchedulePlan(schedule?.plan || schedule || {});
  const projectId = normalizeNullableId(project.id ?? project.projectId ?? sourcePlan.projectId);
  const planId = sourcePlan.id || `sp-fallback-${projectId ?? "local"}`;
  const seenItemKeys = new Set();
  const seenTaskKeys = new Set();
  const items = [];

  toArray(schedule?.items).forEach((rawItem, index) => {
    const item = normalizeScheduleItem({
      ...rawItem,
      projectId: firstDefined(rawItem, ["projectId", "project_id"], projectId),
      planId: firstDefined(rawItem, ["planId", "plan_id"], planId),
      sortOrder: firstDefined(rawItem, ["sortOrder", "sort_order"], (index + 1) * 100)
    });
    const itemKeys = itemKeysFromItem(item);
    const taskKeys = taskKeysFromItem(item);
    if (itemKeys.some((key) => seenItemKeys.has(key)) || taskKeys.some((key) => seenTaskKeys.has(key))) return;
    itemKeys.forEach((key) => seenItemKeys.add(key));
    taskKeys.forEach((key) => seenTaskKeys.add(key));
    items.push(item);
  });

  toArray(tasks ?? project.tasks).forEach((task, index) => {
    const taskKeys = new Set();
    addKeyVariant(taskKeys, taskKeyFromTask(task));
    if ([...taskKeys].some((key) => seenTaskKeys.has(key))) {
      const existingIndex = items.findIndex((item) => taskKeysFromItem(item).some((key) => taskKeys.has(key)));
      if (existingIndex >= 0) items.splice(existingIndex, 1, mergeTaskIntoScheduleItem(items[existingIndex], task, index));
      return;
    }
    const item = taskToScheduleItem(task, projectId, planId, items.length + index);
    itemKeysFromItem(item).forEach((key) => seenItemKeys.add(key));
    taskKeysFromItem(item).forEach((key) => seenTaskKeys.add(key));
    items.push(item);
  });

  const range = rangeFromItems(items, normalizeDateValue(sourcePlan.startDate || project.startDate), normalizeDateValue(sourcePlan.endDate || project.endDate));

  return {
    plan: normalizeSchedulePlan({
      ...sourcePlan,
      id: planId,
      projectId,
      title: sourcePlan.title || project.scheduleTitle || project.name || "项目排期",
      startDate: range.startDate,
      endDate: range.endDate,
      summary: summaryFromItems(items)
    }),
    items,
    dependencies: toArray(schedule?.dependencies).map(normalizeScheduleDependency),
    snapshots: toArray(schedule?.snapshots),
    templates: toArray(schedule?.templates)
  };
}

export function normalizeScheduleResponse(response = {}, fallback = {}) {
  const source = response?.data && typeof response.data === "object" ? response.data : response;
  const rawPlan = source?.plan || source || {};
  const items = toArray(source?.items).map((item, index) =>
    normalizeScheduleItem({
      ...item,
      projectId: firstDefined(item, ["projectId", "project_id"], firstDefined(rawPlan, ["projectId", "project_id"])),
      planId: firstDefined(item, ["planId", "plan_id"], firstDefined(rawPlan, ["id", "planId", "plan_id"])),
      sortOrder: firstDefined(item, ["sortOrder", "sort_order"], (index + 1) * 100)
    })
  );
  const range = rangeFromItems(
    items,
    normalizeDateValue(firstDefined(rawPlan, ["startDate", "start_date"], fallback.startDate)),
    normalizeDateValue(firstDefined(rawPlan, ["endDate", "end_date"], fallback.endDate))
  );
  const plan = normalizeSchedulePlan({
    ...rawPlan,
    projectId: firstDefined(rawPlan, ["projectId", "project_id"], fallback.projectId),
    startDate: range.startDate,
    endDate: range.endDate,
    summary: {
      ...summaryFromItems(items),
      ...firstDefined(rawPlan, ["summary"], {})
    }
  });

  return {
    plan,
    items,
    dependencies: toArray(source?.dependencies).map(normalizeScheduleDependency),
    snapshots: toArray(source?.snapshots),
    templates: toArray(source?.templates)
  };
}

export function buildFallbackSchedule({ project = {}, tasks = null, planId = "" } = {}) {
  const projectId = normalizeNullableId(project.id ?? project.projectId);
  const nextPlanId = planId || `sp-fallback-${projectId ?? "local"}`;
  const items = toArray(tasks || project.tasks).map((task, index) => taskToScheduleItem(task, projectId, nextPlanId, index));
  const range = rangeFromItems(items, normalizeDateValue(project.startDate), normalizeDateValue(project.endDate));
  const summary = summaryFromItems(items);

  return {
    plan: normalizeSchedulePlan({
      id: nextPlanId,
      projectId,
      title: project.scheduleTitle || project.name || "项目排期",
      startDate: range.startDate,
      endDate: range.endDate,
      status: "fallback",
      viewConfig: DEFAULT_VIEW_CONFIG,
      summary
    }),
    items,
    dependencies: [],
    snapshots: [],
    templates: []
  };
}

export function createEmptyScheduleItem(overrides = {}) {
  return normalizeScheduleItem({
    id: "",
    projectId: null,
    planId: "",
    taskUid: "",
    type: "schedule",
    title: "",
    module: "project",
    owner: "",
    startDate: "",
    endDate: "",
    status: "todo",
    progress: 0,
    sortOrder: 0,
    hidden: false,
    linkTask: false,
    linkFlow: false,
    dependencyIds: [],
    commentsCount: 0,
    payload: {},
    ...overrides
  });
}

export function createEmptyScheduleDependency(overrides = {}) {
  return normalizeScheduleDependency({
    id: "",
    fromItemId: "",
    toItemId: "",
    type: "finish_to_start",
    lagDays: 0,
    payload: {},
    ...overrides
  });
}
