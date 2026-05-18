import { scheduleColumns } from "../../../data/seed.js";
import scheduleApi from "../../../services/scheduleApi.js";
import { clampDateRange } from "../../../utils/schedule/dateRange.js";
import { createScheduleRowMovePlan } from "../../../utils/schedule/timelineLayout.js";
import { buildFallbackSchedule, mergeScheduleWithProjectTasks, normalizeScheduleItem, normalizeScheduleResponse } from "../../../utils/schedule/scheduleNormalize.js";
import workspaceApi from "../../../services/workspaceApi.js";
import { backendSyncToast, isAuthApiError, isLoginExpiredApiError } from "../../../services/apiErrors.js";
import { handleWorkspaceAuthFailure } from "./appActions.js";
import { idsEqual, normalizeTaskModuleKey, nowText } from "../helpers.js";

const BACKEND_SYNC_FAIL_TOAST = "已本地保存，后端同步失败";
const DELETE_SYNC_FAIL_TOAST = "删除同步失败，已恢复本地排期";
const SCHEDULE_DEPARTMENT_FILTERS = ["全部", "项目管理", "AIGC", "美术设计", "三维动画", "动效设计", "后期合成"];
const SCHEDULE_ROW_FILTERS = ["all", "schedule", "task"];
const SCHEDULE_ZOOM_LEVELS = [18, 22, 28, 36, 48];
const SCHEDULE_CHAT_DEFAULTS = {
  visible: false,
  targetType: "schedule",
  targetId: "",
  itemId: "",
  taskUid: "",
  comments: [],
  commentsCount: 0,
  x: 900,
  y: 220,
  width: 386,
  height: 556,
  pinned: false
};
const SCHEDULE_CHAT_MIN_WIDTH = 300;
const SCHEDULE_CHAT_MIN_HEIGHT = 360;
const SCHEDULE_CHAT_MAX_WIDTH = 560;
const SCHEDULE_CHAT_MAX_HEIGHT = 720;
let scheduleLoadRequestSeq = 0;

function getScheduleLocalRevision(store) {
  const revision = Number(store.scheduleUi?.localRevision || 0);
  return Number.isFinite(revision) ? revision : 0;
}

function bumpScheduleLocalRevision(store) {
  const localRevision = getScheduleLocalRevision(store) + 1;
  store.scheduleUi = {
    ...store.scheduleUi,
    localRevision
  };
  return localRevision;
}

function beginScheduleLoad(store, projectId = "") {
  const requestId = ++scheduleLoadRequestSeq;
  const localRevision = getScheduleLocalRevision(store);
  store.scheduleUi = {
    ...store.scheduleUi,
    loading: true,
    error: "",
    loadRequestId: requestId,
    loadingProjectId: projectId
  };
  return { requestId, localRevision };
}

function canApplyScheduleLoad(store, request) {
  return store.scheduleUi?.loadRequestId === request.requestId && getScheduleLocalRevision(store) === request.localRevision;
}

function finishIgnoredScheduleLoad(store, request, error = "") {
  if (store.scheduleUi?.loadRequestId !== request.requestId) return;
  store.scheduleUi = {
    ...store.scheduleUi,
    loading: false,
    loadingProjectId: "",
    error: error || store.scheduleUi?.error || ""
  };
}

function isPersistedScheduleItemId(itemId) {
  const id = String(itemId || "");
  return id.startsWith("si-") && !id.startsWith("si-local-");
}

function isFallbackTaskScheduleItem(item = {}, itemId = "") {
  const id = String(itemId || item.id || item.itemId || "");
  return id.startsWith("task-") || item.type === "task" || item.payload?.source === "taskFallback";
}

function isLocalScheduleItemId(itemId) {
  const id = String(itemId || "");
  return !id || id.startsWith("si-local-") || id.startsWith("task-");
}

function firstNonEmptyId(...values) {
  return values
    .map((value) => String(value ?? "").trim())
    .find(Boolean) || "";
}

function cleanIdValue(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text) return "";
  return typeof value === "number" ? value : text;
}

function isReservedProjectPathId(value) {
  return ["schedule", "undefined", "null"].includes(String(value ?? "").trim().toLowerCase());
}

function firstProjectApiId(...values) {
  for (const value of values) {
    const id = cleanIdValue(value);
    if (id !== "" && !isReservedProjectPathId(id)) return id;
  }
  return "";
}

function projectApiId(project = {}, fallback = {}) {
  return firstProjectApiId(
    project.projectId,
    project.projectUid,
    project.project_uid,
    project.project_id,
    project.uid,
    fallback.projectId,
    fallback.projectUid,
    fallback.project_uid,
    fallback.project_id,
    fallback.uid,
    project.id
  );
}

function scheduleProjectWithApiId(project = {}, projectId = "") {
  const id = cleanIdValue(projectId);
  if (id === "" || project.id) return project;
  return {
    ...project,
    id,
    projectId: project.projectId || id
  };
}

function taskApiId(task = {}) {
  return firstNonEmptyId(task.taskId, task.taskUid, task.backendTaskId, task.id);
}

function persistedScheduleItemId(item = {}) {
  return [item.scheduleItemId, item.schedule_item_id, item.itemUid, item.item_uid, item.itemId, item.id, item.workItemId, item.work_item_id]
    .map((value) => String(value || "").trim())
    .find((id) => isPersistedScheduleItemId(id)) || "";
}

function scheduleProjectCandidates(store, payload = {}, options = {}) {
  const payloadCandidates = [payload.projectId, payload.projectUid, payload.project_id, payload.project_uid];
  return options.preferActiveProjectId
    ? [store.activeProjectId, ...payloadCandidates, store.schedulePlan?.projectId, store.schedulePlan?.projectUid]
    : [...payloadCandidates, store.schedulePlan?.projectId, store.schedulePlan?.projectUid, store.activeProjectId];
}

function resolveActiveProjectForSchedule(store, payload = {}, options = {}) {
  if (store.activeProject && projectApiId(store.activeProject, payload)) return store.activeProject;
  const projectId = firstProjectApiId(...scheduleProjectCandidates(store, payload, options));
  if (projectId === "") return null;
  const projects = Array.isArray(store.allProjects)
    ? store.allProjects
    : [
        ...(store.rootProjects || []),
        ...(store.projectGroups || []).flatMap((group) => group.projects || [])
      ];
  const project = projects.find((item) =>
    idsEqual(item.id, projectId) ||
    idsEqual(item.projectId, projectId) ||
    idsEqual(item.projectUid, projectId) ||
    idsEqual(item.project_uid, projectId) ||
    idsEqual(item.uid, projectId)
  );
  if (project) return project;
  if (options.requireKnownProject) return null;
  return {
    id: projectId,
    projectId,
    startDate: store.schedulePlan?.startDate || payload.startDate || "",
    endDate: store.schedulePlan?.endDate || payload.endDate || "",
    tasks: []
  };
}

function zoomLevelFromDayWidth(dayWidth = 28) {
  const width = Number(dayWidth || 28);
  const exactIndex = SCHEDULE_ZOOM_LEVELS.indexOf(width);
  if (exactIndex >= 0) return exactIndex + 1;
  const closestIndex = SCHEDULE_ZOOM_LEVELS.reduce((bestIndex, level, index) => {
    const bestDistance = Math.abs(SCHEDULE_ZOOM_LEVELS[bestIndex] - width);
    const distance = Math.abs(level - width);
    return distance < bestDistance ? index : bestIndex;
  }, 0);
  return closestIndex + 1;
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeScheduleChat(previous = {}, payload = {}) {
  const existing = {
    ...SCHEDULE_CHAT_DEFAULTS,
    ...(previous || {})
  };
  const itemId = String(payload.itemId ?? payload.targetId ?? existing.itemId ?? existing.targetId ?? "");
  const taskUid = String(payload.taskUid ?? existing.taskUid ?? "");
  const comments = Array.isArray(payload.comments) ? payload.comments : Array.isArray(existing.comments) ? existing.comments : [];
  const commentsCount =
    Number.isFinite(Number(payload.commentsCount))
      ? Number(payload.commentsCount)
      : Number.isFinite(Number(existing.commentsCount))
        ? Number(existing.commentsCount)
        : comments.length;

  return {
    ...existing,
    ...payload,
    visible: payload.visible ?? existing.visible,
    targetType: payload.targetType || existing.targetType || "schedule",
    targetId: String(payload.targetId ?? itemId ?? ""),
    itemId,
    taskUid,
    comments,
    commentsCount,
    x: clampNumber(payload.x ?? existing.x, 0, 2400, SCHEDULE_CHAT_DEFAULTS.x),
    y: clampNumber(payload.y ?? existing.y, 0, 1400, SCHEDULE_CHAT_DEFAULTS.y),
    width: clampNumber(payload.width ?? existing.width, SCHEDULE_CHAT_MIN_WIDTH, SCHEDULE_CHAT_MAX_WIDTH, SCHEDULE_CHAT_DEFAULTS.width),
    height: clampNumber(payload.height ?? existing.height, SCHEDULE_CHAT_MIN_HEIGHT, SCHEDULE_CHAT_MAX_HEIGHT, SCHEDULE_CHAT_DEFAULTS.height),
    pinned: Boolean(payload.pinned ?? existing.pinned)
  };
}

function normalizeScheduleComment(source = {}, fallback = {}) {
  const id = source.id || source.commentId || fallback.id || `comment-local-${Date.now()}`;
  const content = source.content ?? source.body ?? source.text ?? fallback.content ?? "";
  return {
    ...source,
    id: String(id),
    itemId: source.itemId || source.item_id || fallback.itemId || "",
    content: String(content),
    body: String(content),
    payload: {
      ...(source.payload || source.meta || {}),
      ...(fallback.payload || {})
    },
    authorName: source.authorName || source.author_name || source.userName || source.user_name || source.user || source.sender || source.author || fallback.authorName || "admin",
    createdAt: source.createdAt || source.created_at || source.commentedAt || source.commented_at || source.time || fallback.createdAt || nowText(),
    syncStatus: source.syncStatus || fallback.syncStatus || "synced",
    mine: source.mine ?? source.self ?? source.isMine ?? fallback.mine ?? false
  };
}

function scheduleCommentKey(comment = {}) {
  return String(
    comment.id ||
      comment.commentId ||
      `${comment.itemId || ""}|${comment.createdAt || comment.time || ""}|${comment.content || comment.body || comment.text || ""}|${comment.authorName || comment.user || ""}`
  );
}

function mergeScheduleComments(...commentLists) {
  const seen = new Set();
  const merged = [];
  commentLists.flat().forEach((comment) => {
    const key = scheduleCommentKey(comment);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(comment);
  });
  return merged;
}

function taskCommentToScheduleComment(comment = {}, index = 0, itemId = "", task = {}) {
  const taskUid = String(task.taskUid || task.taskId || task.id || "");
  return normalizeScheduleComment(comment, {
    id: comment.id || comment.commentId || `task-comment-${taskUid || "local"}-${index}`,
    itemId,
    authorName: comment.user || comment.authorName || comment.author || "",
    createdAt: comment.time || comment.createdAt || "",
    syncStatus: comment.syncStatus || "local",
    payload: {
      taskUid,
      source: "task"
    }
  });
}

function scheduleCommentToTaskComment(comment = {}, fallback = {}) {
  const text = String(comment.text || comment.content || comment.body || fallback.text || "").trim();
  return {
    ...comment,
    id: comment.id || comment.commentId || fallback.id || `comment-local-${Date.now()}`,
    user: comment.user || comment.authorName || comment.author || fallback.user || "admin",
    dept: comment.dept || fallback.dept || "Project member",
    tone: comment.tone || fallback.tone || "pink",
    time: comment.time || comment.createdAt || fallback.time || nowText(),
    text
  };
}

function commentsFromResponse(response) {
  const list = response?.comments || response?.data?.comments || response?.items || response?.data?.items || response?.data || response || [];
  return Array.isArray(list) ? list.map((comment) => normalizeScheduleComment(comment)) : [];
}

function commentFromResponse(response, fallback = {}) {
  const source = response?.comment || response?.data?.comment || response?.data || response || fallback;
  return normalizeScheduleComment(source, fallback);
}

function commentsCountFromResponse(response, comments = [], fallbackCount = undefined) {
  const value = response?.commentsCount ?? response?.comments_count ?? response?.data?.commentsCount ?? response?.data?.comments_count;
  if (Number.isFinite(Number(value))) return Number(value);
  if (Number.isFinite(Number(fallbackCount))) return Number(fallbackCount);
  return comments.length;
}

function updateScheduleItemComments(store, itemId, comments, commentsCount) {
  const items = Array.isArray(store.schedulePlan?.items) ? store.schedulePlan.items : [];
  const index = items.findIndex((item) => item.id === itemId || item.itemId === itemId);
  if (index < 0) return false;
  const hasComments = Array.isArray(comments);
  const nextComments = hasComments ? comments : Array.isArray(items[index].comments) ? items[index].comments : [];
  const nextCommentsCount = Number.isFinite(Number(commentsCount)) ? Number(commentsCount) : 0;
  if (!hasComments && Number(items[index].commentsCount || 0) === nextCommentsCount) return false;
  const nextItem = {
    ...items[index],
    commentsCount: nextCommentsCount
  };
  if (hasComments) nextItem.comments = nextComments;
  items.splice(index, 1, nextItem);
  store.schedulePlan = {
    ...(store.schedulePlan || {}),
    items
  };
  bumpScheduleLocalRevision(store);
  return true;
}

function updateScheduleItemCommentsCount(store, itemId, commentsCount) {
  return updateScheduleItemComments(store, itemId, undefined, commentsCount);
}

function setScheduleChatComments(store, payload = {}) {
  const chat = normalizeScheduleChat(store.scheduleUi?.chat, payload);
  store.scheduleUi = {
    ...store.scheduleUi,
    chat
  };
  if (chat.itemId) {
    if (Array.isArray(payload.comments)) updateScheduleItemComments(store, chat.itemId, chat.comments, chat.commentsCount);
    else updateScheduleItemCommentsCount(store, chat.itemId, chat.commentsCount);
  }
  return chat;
}

function todaySlash() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function summaryFromItems(items = []) {
  return {
    itemCount: items.length,
    pendingCount: items.filter((item) => item.status !== "done").length,
    doneCount: items.filter((item) => item.status === "done").length,
    riskCount: items.filter((item) => item.status === "risk" || item.risk === true).length
  };
}

function compareDate(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function rangeFromScheduleItems(items = [], fallbackStartDate = "", fallbackEndDate = "") {
  const starts = items.map((item) => item.startDate).filter(Boolean).sort(compareDate);
  const ends = items.map((item) => item.endDate).filter(Boolean).sort(compareDate);
  return clampDateRange(starts[0] || fallbackStartDate, ends[ends.length - 1] || fallbackEndDate || starts[0] || fallbackStartDate);
}

function updateScheduleRangeAndSummary(store, fallbackProject = {}) {
  const items = Array.isArray(store.schedulePlan?.items) ? store.schedulePlan.items : [];
  const range = rangeFromScheduleItems(items, store.schedulePlan?.startDate || fallbackProject.startDate, store.schedulePlan?.endDate || fallbackProject.endDate);
  store.schedulePlan = {
    ...(store.schedulePlan || {}),
    summary: summaryFromItems(items),
    startDate: range.startDate,
    endDate: range.endDate
  };
  store.scheduleUi = {
    ...store.scheduleUi,
    visibleStartDate: range.startDate,
    visibleEndDate: range.endDate
  };
  return range;
}

function isScheduleTemplateContext(store) {
  return store.activeView === "schedule-template" || store.scheduleUi?.source === "schedule-template";
}

function nextLocalTaskId(project) {
  const ids = (project?.tasks || []).map((task) => Number(task.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : Date.now();
}

function addLocalTaskFromScheduleItem(project, item) {
  project.tasks = project.tasks || [];
  const taskId = nextLocalTaskId(project);
  const task = {
    id: taskId,
    title: item.title,
    type: "排期",
    note: item.payload?.note || "由排期中心本地创建",
    module: normalizeTaskModuleKey(item.module),
    owner: item.owner || "",
    time: nowText(),
    startDate: item.startDate,
    endDate: item.endDate,
    comments: [],
    unreadComments: 0,
    expanded: false,
    archived: item.status === "done",
    scheduleStatus: item.status,
    progress: item.progress
  };
  project.tasks.unshift(task);
  return task;
}

function mergeBackendTask(item, task) {
  if (!task || typeof task !== "object") return item;
  return {
    ...item,
    taskUid: String(task.taskUid || task.taskId || task.task_uid || task.task_id || item.taskUid || ""),
    payload: {
      ...(item.payload || {}),
      backendTaskId: task.id ?? item.payload?.backendTaskId,
      taskId: task.taskId || task.taskUid || task.task_id || task.task_uid || item.payload?.taskId || ""
    }
  };
}

function normalizeCreatedScheduleItem(response, fallbackItem, projectId) {
  const source = response?.item || response?.data?.item || response?.data || response || {};
  const itemId = firstNonEmptyId(
    source.scheduleItemId,
    source.schedule_item_id,
    source.itemUid,
    source.item_uid,
    source.itemId,
    source.item_id,
    source.id,
    fallbackItem.scheduleItemId,
    fallbackItem.itemId,
    fallbackItem.id
  );
  const workItemId = firstNonEmptyId(source.workItemId, source.work_item_id, itemId, fallbackItem.workItemId);
  const taskUid = firstNonEmptyId(source.taskUid, source.task_uid, source.taskId, source.task_id, fallbackItem.taskUid);
  const normalized = normalizeScheduleItem({
    ...fallbackItem,
    ...source,
    projectId: firstNonEmptyId(source.projectId, source.project_id, source.projectUid, source.project_uid, projectId),
    planId: source.planId || source.plan_id || fallbackItem.planId,
    id: itemId,
    itemId,
    scheduleItemId: itemId,
    workItemId,
    taskUid,
    payload: {
      ...(fallbackItem.payload || {}),
      ...(source.payload || source.meta || {}),
      note: source.note || fallbackItem.payload?.note || "",
      syncStatus: "synced"
    }
  });
  return mergeBackendTask(normalized, response?.task || response?.data?.task);
}

function normalizeBackendScheduleItem(response, fallbackItem, projectId) {
  return normalizeCreatedScheduleItem(response, fallbackItem, projectId);
}

function replaceScheduleItem(store, localId, nextItem) {
  const items = Array.isArray(store.schedulePlan?.items) ? store.schedulePlan.items : [];
  const index = items.findIndex((item) => item.id === localId || item.itemId === localId || item.scheduleItemId === localId || item.workItemId === localId);
  if (index === -1) return false;
  items.splice(index, 1, nextItem);
  store.schedulePlan = {
    ...(store.schedulePlan || {}),
    items
  };
  bumpScheduleLocalRevision(store);
  return true;
}

function findScheduleItemIndex(store, itemId) {
  const items = Array.isArray(store.schedulePlan?.items) ? store.schedulePlan.items : [];
  return items.findIndex((item) => item.id === itemId || item.itemId === itemId || item.scheduleItemId === itemId || item.workItemId === itemId);
}

function findScheduleItem(store, itemId) {
  const items = Array.isArray(store.schedulePlan?.items) ? store.schedulePlan.items : [];
  const targetId = String(itemId || "");
  return items.find((item) => item.id === targetId || item.itemId === targetId || item.scheduleItemId === targetId || item.workItemId === targetId) || null;
}

function markScheduleItemSyncFailed(store, localId) {
  const items = Array.isArray(store.schedulePlan?.items) ? store.schedulePlan.items : [];
  const index = items.findIndex((item) => item.id === localId || item.itemId === localId);
  if (index === -1) return null;
  const item = {
    ...items[index],
    payload: {
      ...(items[index].payload || {}),
      syncStatus: "failed"
    }
  };
  items.splice(index, 1, item);
  store.schedulePlan = {
    ...(store.schedulePlan || {}),
    items
  };
  bumpScheduleLocalRevision(store);
  return item;
}

function markScheduleItemDeleteFailed(item) {
  return {
    ...item,
    payload: {
      ...(item.payload || {}),
      syncStatus: "deleteFailed"
    }
  };
}

function findLinkedTaskByUid(store, taskUid) {
  const targetUid = String(taskUid || "");
  if (!targetUid) return null;
  const tasks = Array.isArray(store.activeProject?.tasks) ? store.activeProject.tasks : [];
  return tasks.find((task) => String(task.id) === targetUid || String(task.taskUid || task.taskId || "") === targetUid) || null;
}

function linkedTaskUid(item = {}, fallbackTaskUid = "") {
  return String(fallbackTaskUid || item.taskUid || item.payload?.taskUid || item.payload?.taskId || item.payload?.backendTaskId || "");
}

function findLinkedTask(store, item = {}, fallbackTaskUid = "") {
  const taskUid = linkedTaskUid(item, fallbackTaskUid);
  if (!taskUid) return null;
  return findLinkedTaskByUid(store, taskUid);
}

function isSameChatTarget(chat = {}, itemId = "") {
  const targetId = String(itemId || "");
  return Boolean(targetId) && (String(chat.itemId || "") === targetId || String(chat.targetId || "") === targetId);
}

function localScheduleChatSource(store, itemId, taskUid = "", options = {}) {
  const targetId = String(itemId || "");
  const item = findScheduleItem(store, targetId);
  const targetTaskUid = linkedTaskUid(item || {}, taskUid);
  const task = findLinkedTask(store, item || {}, targetTaskUid);
  const itemComments = Array.isArray(item?.comments)
    ? item.comments.map((comment) => normalizeScheduleComment(comment, { itemId: targetId, syncStatus: comment.syncStatus || "local" }))
    : [];
  const taskComments = Array.isArray(task?.comments)
    ? task.comments.map((comment, index) => taskCommentToScheduleComment(comment, index, targetId, task))
    : [];
  const chat = store.scheduleUi?.chat || {};
  const chatComments = options.includeChatFallback && !itemComments.length && !taskComments.length && isSameChatTarget(chat, targetId) && Array.isArray(chat.comments)
    ? chat.comments.map((comment) => normalizeScheduleComment(comment, { itemId: targetId, syncStatus: comment.syncStatus || "local" }))
    : [];
  const comments = mergeScheduleComments(itemComments, taskComments, chatComments);
  const counts = [
    comments.length,
    Number(item?.commentsCount),
    Number(task?.commentsCount),
    Number(Array.isArray(task?.comments) ? task.comments.length : NaN)
  ].filter(Number.isFinite);
  return {
    item,
    task,
    taskUid: targetTaskUid,
    comments,
    commentsCount: counts.length ? Math.max(...counts) : 0
  };
}

function appendLinkedTaskComment(store, task, comment) {
  if (!task) return false;
  const apiTaskId = taskApiId(task);
  if (!apiTaskId) return false;
  task.comments = Array.isArray(task.comments) ? task.comments : [];
  const taskComment = scheduleCommentToTaskComment(comment, {
    user: comment.authorName || "admin",
    time: comment.createdAt || nowText()
  });
  if (!taskComment.text) return false;
  const key = scheduleCommentKey(taskComment);
  const exists = task.comments.some((entry) => scheduleCommentKey(entry) === key || (entry.id && taskComment.id && String(entry.id) === String(taskComment.id)));
  if (exists) return false;
  task.comments.push(taskComment);
  task.unreadComments = 0;
  syncInBackground(store, "addTaskComment", () => workspaceApi.addTaskComment(apiTaskId, taskComment.text));
  return true;
}

function syncLinkedTaskDates(store, task, range, meta = {}) {
  if (!task || !range?.startDate || !range?.endDate) return false;
  task.startDate = range.startDate;
  task.endDate = range.endDate;
  const projectId = projectApiId(store.activeProject || {}, task);
  const apiTaskId = taskApiId(task);
  if (!projectId || !apiTaskId) return true;
  syncInBackground(store, "updateTask", () =>
    workspaceApi.updateTask(apiTaskId, {
      projectId,
      startDate: task.startDate,
      endDate: task.endDate,
      ...meta
    })
  );
  return true;
}

function syncInBackground(store, label, requestFactory) {
  if (typeof window === "undefined") return;
  Promise.resolve()
    .then(() => requestFactory())
    .catch((error) => {
      console.warn(`[workspaceApi] ${label} failed`, error);
      if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
      store.showToast(backendSyncToast(error));
    });
}

function applyScheduleState(store, schedule, source = "api") {
  const plan = schedule?.plan || {};
  const items = Array.isArray(schedule?.items) ? schedule.items : [];
  const dependencies = Array.isArray(schedule?.dependencies) ? schedule.dependencies : [];
  const snapshots = Array.isArray(schedule?.snapshots) ? schedule.snapshots : [];
  const templates = Array.isArray(schedule?.templates) ? schedule.templates : [];
  const selectedItemId = String(store.scheduleUi?.selectedItemId || "");
  const selectedItemExists = selectedItemId
    ? items.some((item) => item.id === selectedItemId || item.itemId === selectedItemId)
    : false;

  store.schedulePlan = {
    ...plan,
    items,
    dependencies,
    snapshots,
    templates
  };
  store.scheduleUi = {
    ...store.scheduleUi,
    view: store.scheduleUi?.view || plan.viewConfig?.defaultView || "timeline",
    departmentFilter: store.scheduleUi?.departmentFilter || "全部",
    rowFilter: store.scheduleUi?.rowFilter || "all",
    visibleType: store.scheduleUi?.visibleType || store.scheduleUi?.rowFilter || "all",
    dayWidth: Number(plan.viewConfig?.dayWidth || store.scheduleUi?.dayWidth || 28),
    zoomLevel: zoomLevelFromDayWidth(plan.viewConfig?.dayWidth || store.scheduleUi?.dayWidth || 28),
    rowHeight: Number(plan.viewConfig?.rowHeight || store.scheduleUi?.rowHeight || 34),
    visibleStartDate: plan.startDate || "",
    visibleEndDate: plan.endDate || "",
    selectedItemId: selectedItemExists ? selectedItemId : "",
    selectedTaskId: selectedItemExists ? store.scheduleUi?.selectedTaskId ?? null : null,
    loading: false,
    loadingProjectId: "",
    loadedProjectId: plan.projectId ?? "",
    error: "",
    source
  };
}

export const scheduleActions = {
ensureScheduleDefaults(project = this.activeProject) {
  if (!project) return;
  project.tasks = project.tasks || [];
  project.tasks.forEach((task, index) => {
    if (!task.scheduleStatus) task.scheduleStatus = task.archived ? "done" : scheduleColumns[index % 3].key;
    if (!task.priority) task.priority = ["高", "中", "低"][index % 3];
    task.module = normalizeTaskModuleKey(task.module);
    if (!task.startDate) {
      task.startDate = todaySlash();
      task.endDate = task.endDate || task.startDate;
    }
    if (!task.duration) task.duration = 3 + (index % 4);
    if (!task.attachments) task.attachments = index % 2;
    if (!task.progress) task.progress = task.scheduleStatus === "done" ? 100 : Math.min(88, 22 + index * 9);
  });
},
async loadScheduleForActiveProject(options = {}) {
  const project = resolveActiveProjectForSchedule(this, {}, { preferActiveProjectId: true, requireKnownProject: true });
  if (!project) {
    applyScheduleState(this, buildFallbackSchedule({ project: {}, tasks: [] }), "empty");
    return false;
  }
  const projectId = projectApiId(project, { projectId: this.activeProjectId });
  if (projectId === "") {
    applyScheduleState(this, buildFallbackSchedule({ project, tasks: project.tasks || [] }), "fallback");
    return false;
  }
  const scheduleProject = scheduleProjectWithApiId(project, projectId);
  if (options.skipIfLoadingProject && this.scheduleUi?.loading && idsEqual(this.scheduleUi?.loadingProjectId, projectId)) {
    return false;
  }

  const currentProjectId = this.schedulePlan?.projectId;
  if (currentProjectId !== undefined && currentProjectId !== null && currentProjectId !== "" && !idsEqual(currentProjectId, projectId)) {
    applyScheduleState(this, buildFallbackSchedule({ project: scheduleProject, tasks: project.tasks || [] }), "fallback");
  }

  const loadRequest = beginScheduleLoad(this, projectId);

  try {
    const response = await scheduleApi.getProjectSchedule(projectId);
    const normalized = normalizeScheduleResponse(response, {
      projectId,
      startDate: project.startDate,
      endDate: project.endDate
    });
    const schedule = mergeScheduleWithProjectTasks(normalized, { project: scheduleProject, tasks: project.tasks || [] });
    if (!canApplyScheduleLoad(this, loadRequest)) {
      finishIgnoredScheduleLoad(this, loadRequest);
      return false;
    }
    applyScheduleState(this, schedule, "api");
    return true;
  } catch (error) {
    if (!canApplyScheduleLoad(this, loadRequest)) {
      finishIgnoredScheduleLoad(this, loadRequest, error?.message || "");
      return false;
    }
    const fallbackSource =
      idsEqual(this.schedulePlan?.projectId, projectId)
        ? this.schedulePlan
        : buildFallbackSchedule({ project: scheduleProject, tasks: project.tasks || [] });
    const fallback = mergeScheduleWithProjectTasks(fallbackSource, { project: scheduleProject, tasks: project.tasks || [] });
    applyScheduleState(this, fallback, "fallback");
    this.scheduleUi = {
      ...this.scheduleUi,
      error: error?.message || ""
    };
    return false;
  }
},
setScheduleUiView(view) {
  if (!["timeline", "board", "node"].includes(view)) return false;
  this.scheduleUi.view = view;
  return true;
},
setScheduleDepartmentFilter(filter) {
  if (!SCHEDULE_DEPARTMENT_FILTERS.includes(filter)) return false;
  this.scheduleUi.departmentFilter = filter;
  return true;
},
setScheduleRowFilter(filter) {
  if (!SCHEDULE_ROW_FILTERS.includes(filter)) return false;
  this.scheduleUi.rowFilter = filter;
  this.scheduleUi.visibleType = filter;
  return true;
},
setScheduleVisibleType(type) {
  return this.setScheduleRowFilter
    ? this.setScheduleRowFilter(type)
    : scheduleActions.setScheduleRowFilter.call(this, type);
},
adjustScheduleZoom(delta = 0) {
  const current = Number(this.scheduleUi?.dayWidth || 28);
  const next = Math.min(56, Math.max(18, current + Number(delta || 0)));
  this.scheduleUi.dayWidth = next;
  this.scheduleUi.zoomLevel = zoomLevelFromDayWidth(next);
  this.scheduleUi.zoom = Number((next / 28).toFixed(2));
  return next;
},
sortScheduleBoardItemsByDate(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const startCompare = compareDate(left.startDate, right.startDate);
    if (startCompare !== 0) return startCompare;
    const endCompare = compareDate(left.endDate, right.endDate);
    if (endCompare !== 0) return endCompare;
    return String(left.title || left.id || "").localeCompare(String(right.title || right.id || ""));
  });
},
moveScheduleRowWithinDepartment(itemId, direction = "up") {
  if (!this.requireTaskEditPermission()) return false;
  const items = Array.isArray(this.schedulePlan?.items) ? this.schedulePlan.items : [];
  const movePlan = createScheduleRowMovePlan(items, itemId, direction);
  if (!movePlan.ok) {
    const message =
      movePlan.reason === "crossDepartment" ? "只能在同部门内部调整顺序" : "当前部门内已无法继续移动";
    this.showToast(message);
    return false;
  }

  movePlan.updates.forEach((update) => {
    const index = items.findIndex((item) => item.id === update.id || item.itemId === update.id);
    if (index < 0) return;
    items.splice(index, 1, {
      ...items[index],
      sortOrder: update.sortOrder
    });
  });
  this.schedulePlan = {
    ...(this.schedulePlan || {}),
    items
  };
  this.scheduleUi = {
    ...this.scheduleUi,
    selectedItemId: String(itemId || this.scheduleUi?.selectedItemId || "")
  };
  bumpScheduleLocalRevision(this);

  syncInBackground(this, "updateScheduleRowOrder", () =>
    Promise.all(
      movePlan.updates
        .map((update) => ({
          ...update,
          itemId: persistedScheduleItemId(update.item)
        }))
        .filter((update) => update.itemId)
        .map((update) =>
          scheduleApi.updateScheduleItem(update.itemId, {
            ...update.item,
            sortOrder: update.sortOrder
          })
        )
    )
  );
  this.showToast("已调整同部门排序");
  return true;
},
moveScheduleNodePan(payload = {}) {
  const current = this.scheduleUi?.nodePan || { x: 0, y: 0, isPanning: false };
  const next = {
    x: Number(current.x || 0) + Number(payload.dx || 0),
    y: Number(current.y || 0) + Number(payload.dy || 0),
    isPanning: Boolean(payload.isPanning ?? current.isPanning)
  };
  this.scheduleUi = {
    ...this.scheduleUi,
    nodePan: next
  };
  return next;
},
setScheduleNodePan(payload = {}) {
  const current = this.scheduleUi?.nodePan || { x: 0, y: 0, isPanning: false };
  const next = {
    x: Number(payload.x ?? current.x ?? 0),
    y: Number(payload.y ?? current.y ?? 0),
    isPanning: Boolean(payload.isPanning ?? current.isPanning)
  };
  this.scheduleUi = {
    ...this.scheduleUi,
    nodePan: next
  };
  return next;
},
createLocalScheduleSnapshot(source = "toolbar") {
  const items = Array.isArray(this.schedulePlan?.items) ? this.schedulePlan.items : [];
  const dependencies = Array.isArray(this.schedulePlan?.dependencies) ? this.schedulePlan.dependencies : [];
  const snapshot = {
    id: `snapshot-local-${Date.now()}`,
    snapshotId: `snapshot-local-${Date.now()}`,
    source: "local",
    trigger: source,
    title: "本地快照",
    itemCount: items.length,
    dependencyCount: dependencies.length,
    createdAt: nowText(),
    payload: {
      items: items.map((item) => ({ ...item })),
      dependencies: dependencies.map((dependency) => ({ ...dependency }))
    }
  };
  this.schedulePlan = {
    ...(this.schedulePlan || {}),
    snapshots: [snapshot, ...(this.schedulePlan?.snapshots || [])]
  };
  this.showToast("已创建本地快照");
  return snapshot;
},
openScheduleChat(payload = {}) {
  const targetId = String(payload.itemId ?? payload.targetId ?? this.scheduleUi?.selectedItemId ?? "");
  const localSource = localScheduleChatSource(this, targetId, payload.taskUid ?? "");
  const payloadComments = Array.isArray(payload.comments) ? payload.comments : [];
  const comments = localSource.comments.length ? localSource.comments : payloadComments;
  const payloadCount = Number(payload.commentsCount);
  const commentsCount = Math.max(
    comments.length,
    localSource.commentsCount,
    Number.isFinite(payloadCount) ? payloadCount : 0
  );
  const chat = normalizeScheduleChat(this.scheduleUi?.chat, {
    ...payload,
    itemId: targetId,
    targetId,
    taskUid: payload.taskUid ?? localSource.taskUid,
    comments,
    commentsCount,
    visible: true
  });
  this.scheduleUi = {
    ...this.scheduleUi,
    selectedItemId: chat.itemId || chat.targetId || this.scheduleUi?.selectedItemId || "",
    selectedTaskId: chat.taskUid || this.scheduleUi?.selectedTaskId || null,
    chat
  };
  return chat;
},
closeScheduleChat() {
  const chat = normalizeScheduleChat(this.scheduleUi?.chat, {
    visible: false
  });
  this.scheduleUi = {
    ...this.scheduleUi,
    chat
  };
  return chat;
},
moveScheduleChat(payload = {}) {
  const chat = normalizeScheduleChat(this.scheduleUi?.chat, {
    x: payload.x,
    y: payload.y
  });
  this.scheduleUi = {
    ...this.scheduleUi,
    chat
  };
  return chat;
},
resizeScheduleChat(payload = {}) {
  const chat = normalizeScheduleChat(this.scheduleUi?.chat, {
    width: payload.width,
    height: payload.height
  });
  this.scheduleUi = {
    ...this.scheduleUi,
    chat
  };
  return chat;
},
async loadScheduleChatComments(itemId = this.scheduleUi?.chat?.itemId || this.scheduleUi?.selectedItemId) {
  const targetId = String(itemId || "");
  const localSource = localScheduleChatSource(this, targetId, this.scheduleUi?.chat?.taskUid, { includeChatFallback: true });
  if (!isPersistedScheduleItemId(targetId)) {
    return setScheduleChatComments(this, {
      itemId: targetId,
      targetId,
      taskUid: localSource.taskUid || this.scheduleUi?.chat?.taskUid || "",
      comments: localSource.comments,
      commentsCount: localSource.commentsCount,
      commentsSource: localSource.task && localSource.comments.length ? "task" : "local",
      commentsSyncStatus: "local",
      commentsLoading: false,
      commentsError: ""
    });
  }

  setScheduleChatComments(this, {
    itemId: targetId,
    targetId,
    commentsLoading: true,
    commentsError: ""
  });

  try {
    const response = await scheduleApi.listScheduleItemComments(targetId);
    const apiComments = commentsFromResponse(response).map((comment) => normalizeScheduleComment(comment, { itemId: targetId }));
    const latestLocalSource = localScheduleChatSource(this, targetId, localSource.taskUid);
    const comments = mergeScheduleComments(apiComments, latestLocalSource.comments);
    const commentsCount = Math.max(
      comments.length,
      commentsCountFromResponse(response, apiComments),
      latestLocalSource.commentsCount
    );
    return setScheduleChatComments(this, {
      itemId: targetId,
      targetId,
      taskUid: latestLocalSource.taskUid || localSource.taskUid || this.scheduleUi?.chat?.taskUid || "",
      comments,
      commentsCount,
      commentsSource: apiComments.length || !latestLocalSource.task ? "api" : "task",
      commentsSyncStatus: "synced",
      commentsLoading: false,
      commentsError: ""
    });
  } catch (error) {
    console.warn("[workspaceApi] listScheduleItemComments failed", error);
    const latestLocalSource = localScheduleChatSource(this, targetId, localSource.taskUid, { includeChatFallback: true });
    return setScheduleChatComments(this, {
      itemId: targetId,
      targetId,
      taskUid: latestLocalSource.taskUid || localSource.taskUid || this.scheduleUi?.chat?.taskUid || "",
      comments: latestLocalSource.comments,
      commentsCount: latestLocalSource.commentsCount,
      commentsSource: latestLocalSource.task && latestLocalSource.comments.length ? "task" : "local",
      commentsSyncStatus: latestLocalSource.comments.length ? "local" : "failed",
      commentsLoading: false,
      commentsError: error?.message || "评论加载失败"
    });
  }
},
async createScheduleChatComment(itemId = this.scheduleUi?.chat?.itemId, payload = {}) {
  const targetId = String(itemId || "");
  const content = String(payload.content || "").trim();
  if (!content) return null;
  const localSource = localScheduleChatSource(this, targetId, payload.payload?.taskUid || this.scheduleUi?.chat?.taskUid, { includeChatFallback: true });
  const existing = localSource.comments;
  const existingCommentsCount = Math.max(localSource.commentsCount, Number(this.scheduleUi?.chat?.commentsCount) || 0);
  const nextCommentsCount = Number.isFinite(existingCommentsCount) ? existingCommentsCount + 1 : existing.length + 1;
  const localComment = normalizeScheduleComment(
    {
      id: `comment-local-${Date.now()}`,
      itemId: targetId,
      content,
      payload: payload.payload || {},
      authorName: payload.authorName || "admin",
      mine: true
    },
    { syncStatus: isPersistedScheduleItemId(targetId) ? "pending" : "local" }
  );

  if (!isPersistedScheduleItemId(targetId)) {
    const comments = [...existing, { ...localComment, syncStatus: "local" }];
    setScheduleChatComments(this, {
      itemId: targetId,
      targetId,
      taskUid: localSource.taskUid || this.scheduleUi?.chat?.taskUid || "",
      comments,
      commentsCount: nextCommentsCount,
      commentsSource: "local",
      commentsSyncStatus: "local"
    });
    appendLinkedTaskComment(this, localSource.task, comments[comments.length - 1]);
    return comments[comments.length - 1];
  }

  try {
    const response = await scheduleApi.createScheduleItemComment(targetId, {
      content,
      payload: payload.payload || {}
    });
    const comment = commentFromResponse(response, {
      ...localComment,
      syncStatus: "synced"
    });
    const comments = [...existing, comment];
    const commentsCount = commentsCountFromResponse(response, comments, nextCommentsCount);
    setScheduleChatComments(this, {
      itemId: targetId,
      targetId,
      taskUid: localSource.taskUid || this.scheduleUi?.chat?.taskUid || "",
      comments,
      commentsCount,
      commentsSource: "api",
      commentsSyncStatus: "synced",
      commentsError: ""
    });
    appendLinkedTaskComment(this, localSource.task, comment);
    return comment;
  } catch (error) {
    console.warn("[workspaceApi] createScheduleItemComment failed", error);
    if (isLoginExpiredApiError(error)) {
      if (error && typeof error === "object") {
        error.authRequired = error?.response?.status === 401 || error?.status === 401 || error?.statusCode === 401;
      }
      setScheduleChatComments(this, {
        itemId: targetId,
        targetId,
        taskUid: localSource.taskUid || this.scheduleUi?.chat?.taskUid || "",
        comments: existing,
        commentsCount: existingCommentsCount,
        commentsSource: localSource.task && existing.length ? "task" : "local",
        commentsSyncStatus: "failed",
        commentsLoading: false,
        commentsError: error?.message || "评论发送失败"
      });
      this.showToast(backendSyncToast(error));
      return null;
    }
    const comment = {
      ...localComment,
      syncStatus: "failed"
    };
    const comments = [...existing, comment];
    setScheduleChatComments(this, {
      itemId: targetId,
      targetId,
      taskUid: localSource.taskUid || this.scheduleUi?.chat?.taskUid || "",
      comments,
      commentsCount: nextCommentsCount,
      commentsSource: "local",
      commentsSyncStatus: "failed",
      commentsError: error?.message || "评论发送失败"
    });
    return comment;
  }
},
selectScheduleItem(itemOrId, taskUid = null) {
  const itemId = typeof itemOrId === "object" ? itemOrId?.id || itemOrId?.itemId : itemOrId;
  if (!itemId) return false;
  const item =
    typeof itemOrId === "object"
      ? itemOrId
      : (this.schedulePlan?.items || []).find((entry) => entry.id === itemId || entry.itemId === itemId);
  this.scheduleUi = {
    ...this.scheduleUi,
    selectedItemId: String(itemId),
    selectedTaskId: taskUid ?? item?.taskUid ?? this.scheduleUi?.selectedTaskId ?? null
  };
  return true;
},
selectScheduleTask(taskId) {
  this.scheduleSelectedTaskId = Number(taskId);
  this.scheduleUi.selectedTaskId = Number(taskId);
  this.scheduleUi.selectedItemId = `task-${taskId}`;
},
setScheduleView(view) {
  this.scheduleView = view;
},
toggleScheduleDark() {
  this.scheduleDark = !this.scheduleDark;
},
moveScheduleTask(taskId, nextStatus, beforeTaskId = 0) {
  if (!this.requireTaskEditPermission()) return false;
  const project = this.activeProject;
  const task = this.getTask(taskId);
  if (!project || !task || !nextStatus) return false;
  const projectId = projectApiId(project);
  project.tasks = project.tasks || [];
  const previousStatus = task.scheduleStatus;
  const currentIndex = project.tasks.findIndex((item) => item.id === task.id);
  if (currentIndex < 0) return false;
  const [movingTask] = project.tasks.splice(currentIndex, 1);
  movingTask.scheduleStatus = nextStatus;
  let insertIndex =
    beforeTaskId && Number(beforeTaskId) !== movingTask.id
      ? project.tasks.findIndex((item) => item.id === Number(beforeTaskId) && item.scheduleStatus === nextStatus)
      : -1;
  if (insertIndex === -1) {
    const sameStatusIndexes = project.tasks
      .map((item, index) => (item.scheduleStatus === nextStatus ? index : -1))
      .filter((index) => index >= 0);
    insertIndex = sameStatusIndexes.length ? sameStatusIndexes[sameStatusIndexes.length - 1] + 1 : project.tasks.length;
  }
  movingTask.progress = nextStatus === "done" ? 100 : Math.min(movingTask.progress || 35, nextStatus === "review" ? 82 : 64);
  project.tasks.splice(insertIndex, 0, movingTask);
  this.scheduleSelectedTaskId = movingTask.id;
  const apiTaskId = taskApiId(movingTask);
  if (projectId && apiTaskId) {
    syncInBackground(this, "updateTask", () =>
      workspaceApi.updateTask(apiTaskId, {
        projectId,
        scheduleStatus: movingTask.scheduleStatus,
        progress: movingTask.progress
      })
    );
  }
  this.showToast(
    previousStatus === nextStatus
      ? "已调整排期顺序"
      : `已更新排期状态：${scheduleColumns.find((item) => item.key === nextStatus)?.label || "排期"}`
  );
  return true;
},
sortScheduleTasks() {
  if (!this.requireTaskEditPermission()) return false;
  const project = this.activeProject;
  if (!project) return;
  const projectId = projectApiId(project);
  project.tasks = project.tasks || [];
  project.tasks.sort((a, b) => String(a.endDate || "").localeCompare(String(b.endDate || "")));
  project.tasks.forEach((task) => {
    const apiTaskId = taskApiId(task);
    if (!projectId || !apiTaskId) return;
    syncInBackground(this, "updateTask", () =>
      workspaceApi.updateTask(apiTaskId, {
        projectId,
        startDate: task.startDate,
        endDate: task.endDate
      })
    );
  });
  this.showToast("已按截止时间排序");
},
async createScheduleItemFromPayload(payload = {}) {
  if (!this.requireTaskEditPermission()) return null;
  const templateContext = isScheduleTemplateContext(this);
  const project = resolveActiveProjectForSchedule(this, payload);
  if (!project && !templateContext) return null;
  const projectId = project
    ? projectApiId(project, payload)
    : firstProjectApiId(payload.projectId, payload.projectUid, payload.project_id, payload.project_uid, this.schedulePlan?.projectId, this.schedulePlan?.projectUid, this.activeProjectId);
  if (!projectId && !templateContext) return null;
  const scheduleProject = project ? scheduleProjectWithApiId(project, projectId) : {};

  const existingItems = Array.isArray(this.schedulePlan?.items) ? this.schedulePlan.items : [];
  const localId = payload.id || `si-local-${Date.now()}`;
  const item = normalizeScheduleItem({
    ...payload,
    id: localId,
    projectId: projectId || this.schedulePlan?.projectId || null,
    planId: this.schedulePlan?.id,
    sortOrder: payload.sortOrder || Date.now(),
    payload: {
      ...(payload.payload || {}),
      note: String(payload.note || payload.payload?.note || "").trim(),
      addToTaskList: Boolean(payload.addToTaskList)
    }
  });

  if (payload.addToTaskList && project) {
    const task = addLocalTaskFromScheduleItem(scheduleProject, item);
    item.taskUid = String(task.id);
    item.linkTask = true;
  }

  const nextItems = [item, ...existingItems];
  const nextRange = rangeFromScheduleItems(nextItems, this.schedulePlan?.startDate || scheduleProject.startDate, this.schedulePlan?.endDate || scheduleProject.endDate);
  this.schedulePlan = {
    ...(this.schedulePlan || {}),
    projectId: this.schedulePlan?.projectId || projectId,
    items: nextItems,
    summary: summaryFromItems(nextItems),
    startDate: nextRange.startDate,
    endDate: nextRange.endDate
  };
  this.scheduleUi = {
    ...this.scheduleUi,
    view: "timeline",
    selectedItemId: item.id,
    selectedTaskId: item.taskUid || null,
    visibleStartDate: nextRange.startDate,
    visibleEndDate: nextRange.endDate
  };
  bumpScheduleLocalRevision(this);

  if (templateContext) {
    const templateName = this.activeTemplateName || this.schedulePlan?.title || payload.templateName || "";
    if (typeof this.saveScheduleTemplate === "function") {
      this.saveScheduleTemplate(templateName, this.schedulePlan);
    }
    return item;
  }

  try {
    const response = await scheduleApi.createScheduleItem(projectId, item);
    const backendItem = normalizeCreatedScheduleItem(response, item, projectId);
    if (replaceScheduleItem(this, localId, backendItem)) {
      this.scheduleUi = {
        ...this.scheduleUi,
        selectedItemId: backendItem.id,
        selectedTaskId: backendItem.taskUid || this.scheduleUi.selectedTaskId || null
      };
      updateScheduleRangeAndSummary(this, scheduleProject);
      return backendItem;
    }
    return item;
  } catch (error) {
    console.warn("[workspaceApi] createScheduleItem failed", error);
    if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(this, error);
    const failedItem = markScheduleItemSyncFailed(this, localId) || item;
    this.showToast(backendSyncToast(error));
    return failedItem;
  }
},
async updateScheduleItem(itemId, payload = {}) {
  if (!this.requireTaskEditPermission()) return false;
  const items = this.schedulePlan?.items || [];
  const index = findScheduleItemIndex(this, itemId);
  if (index < 0) return false;

  const previousItem = items[index];
  const nextItem = normalizeScheduleItem({
    ...previousItem,
    ...payload,
    id: previousItem.id,
    itemId: previousItem.itemId,
    payload: {
      ...(previousItem.payload || {}),
      ...(payload.payload || {}),
      note: String(payload.note ?? payload.payload?.note ?? previousItem.payload?.note ?? "").trim()
    }
  });
  if (payload.source !== undefined) nextItem.source = payload.source;
  if (payload.interaction !== undefined) nextItem.interaction = payload.interaction;
  this.schedulePlan.items.splice(index, 1, nextItem);
  updateScheduleRangeAndSummary(this, this.activeProject || {});
  bumpScheduleLocalRevision(this);

  try {
    const scheduleItemId = persistedScheduleItemId(nextItem);
    const project = resolveActiveProjectForSchedule(this, nextItem);
    const projectId = projectApiId(project || {}, {
      projectId: this.schedulePlan?.projectId || nextItem.projectId,
      projectUid: nextItem.projectUid || nextItem.project_uid
    });
    const shouldCreateScheduleItem = !scheduleItemId || isLocalScheduleItemId(scheduleItemId) || isFallbackTaskScheduleItem(nextItem, itemId);
    if (shouldCreateScheduleItem && !projectId) throw new Error("缺少项目编号");
    const response = shouldCreateScheduleItem
      ? await scheduleApi.createScheduleItem(projectId, {
          ...nextItem,
          itemId: "",
          id: "",
          scheduleItemId: "",
          workItemId: "",
          type: "schedule",
          linkTask: true,
          linkFlow: true,
          addToTaskList: false,
          source: nextItem.source,
          interaction: nextItem.interaction,
          payload: {
            ...(nextItem.payload || {}),
            source: nextItem.source || nextItem.payload?.source || "taskLinked",
            ...(nextItem.interaction ? { interaction: nextItem.interaction } : {}),
            clientItemId: nextItem.id || nextItem.itemId || itemId,
            taskUid: nextItem.taskUid || nextItem.payload?.taskUid || ""
          }
        })
      : await scheduleApi.updateScheduleItem(scheduleItemId || itemId, nextItem);
    const backendItem = normalizeBackendScheduleItem(response, nextItem, projectId);
    replaceScheduleItem(this, itemId, backendItem);
    if (this.scheduleUi.selectedItemId === itemId || this.scheduleUi.selectedItemId === nextItem.id) {
      this.scheduleUi = {
        ...this.scheduleUi,
        selectedItemId: backendItem.id,
        selectedTaskId: backendItem.taskUid || this.scheduleUi.selectedTaskId || null
      };
    }
    updateScheduleRangeAndSummary(this, this.activeProject || {});
    return backendItem;
  } catch (error) {
    console.warn("[workspaceApi] updateScheduleItem failed", error);
    if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(this, error);
    const failedItem = markScheduleItemSyncFailed(this, itemId) || nextItem;
    updateScheduleRangeAndSummary(this, this.activeProject || {});
    this.showToast(backendSyncToast(error));
    return failedItem;
  }
},
async updateScheduleItemDates(itemId, range = {}, interaction = "") {
  const items = this.schedulePlan?.items || [];
  const index = items.findIndex((item) => item.id === itemId || item.itemId === itemId);
  if (index < 0) return false;

  const nextRange = clampDateRange(range.startDate, range.endDate);
  if (!nextRange.startDate || !nextRange.endDate) return false;

  const previousItem = items[index];
  const linkedTask = findLinkedTask(this, previousItem);
  const updater = this.updateScheduleItem || scheduleActions.updateScheduleItem;
  const dragMeta = {
    source: "schedule-drag",
    ...(interaction ? { interaction } : {})
  };
  const item = await updater.call(this, itemId, {
    startDate: nextRange.startDate,
    endDate: nextRange.endDate,
    ...dragMeta,
    scheduleItemId: previousItem.scheduleItemId || previousItem.itemId || previousItem.id || itemId,
    itemId: previousItem.itemId || previousItem.id || itemId,
    payload: {
      ...(previousItem.payload || {}),
      source: dragMeta.source,
      ...(dragMeta.interaction ? { interaction: dragMeta.interaction } : {})
    }
  });
  if (item) syncLinkedTaskDates(this, linkedTask || findLinkedTask(this, item), nextRange, dragMeta);
  return item;
},
moveScheduleItemToStatus(itemId, status) {
  if (!status) return false;
  const updater = this.updateScheduleItem || scheduleActions.updateScheduleItem;
  return updater.call(this, itemId, { status });
},
confirmSelectedScheduleItem() {
  const itemId = String(this.scheduleUi?.selectedItemId || "");
  if (!itemId) {
    this.showToast("请先选择一个排期项");
    return false;
  }
  const items = Array.isArray(this.schedulePlan?.items) ? this.schedulePlan.items : [];
  const item = items.find((entry) => entry.id === itemId || entry.itemId === itemId);
  if (!item) {
    this.showToast("请先选择一个排期项");
    return false;
  }
  this.showToast("已确认选中排期");
  const updater = this.updateScheduleItem || scheduleActions.updateScheduleItem;
  return updater.call(this, itemId, {
    status: "done",
    progress: 100
  });
},
handleScheduleRowAction(action, item) {
  const itemId = item?.id || item?.itemId;
  if (!itemId) return false;
  const selector = this.selectScheduleItem || scheduleActions.selectScheduleItem;
  selector.call(this, item);

  if (action === "edit") {
    if (typeof this.openScheduleEdit === "function") this.openScheduleEdit(item);
    return true;
  }

  if (action === "chat") {
    const openChat = this.openScheduleChat || scheduleActions.openScheduleChat;
    openChat.call(this, {
      itemId,
      taskUid: item.taskUid || "",
      comments: item.comments || [],
      commentsCount: item.commentsCount || 0
    });
    return true;
  }

  if (action === "delete") {
    if (typeof this.confirmScheduleDelete === "function") {
      const originalDelete = this.deleteScheduleItem;
      if (typeof originalDelete !== "function") {
        this.deleteScheduleItem = (targetId) => scheduleActions.deleteScheduleItem.call(this, targetId);
      }
      const result = this.confirmScheduleDelete(item);
      if (typeof originalDelete !== "function") delete this.deleteScheduleItem;
      return result;
    }
    const deleter = this.deleteScheduleItem || scheduleActions.deleteScheduleItem;
    return deleter.call(this, itemId);
  }

  return false;
},
async deleteScheduleItem(itemId) {
  if (!this.requireTaskEditPermission()) return false;
  const items = this.schedulePlan?.items || [];
  const index = findScheduleItemIndex(this, itemId);
  if (index < 0) return false;
  const [removedItem] = items.splice(index, 1);
  this.schedulePlan = {
    ...(this.schedulePlan || {}),
    items
  };
  if (this.scheduleUi.selectedItemId === itemId || this.scheduleUi.selectedItemId === removedItem.id) {
    this.scheduleUi = {
      ...this.scheduleUi,
      selectedItemId: "",
      selectedTaskId: null
    };
  }
  updateScheduleRangeAndSummary(this, this.activeProject || {});
  bumpScheduleLocalRevision(this);

  const backendItemId = persistedScheduleItemId(removedItem);
  if (!backendItemId) return true;

  try {
    await scheduleApi.deleteScheduleItem(backendItemId);
    return true;
  } catch (error) {
    console.warn("[workspaceApi] deleteScheduleItem failed", error);
    if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(this, error);
    const restoredItem = markScheduleItemDeleteFailed(removedItem);
    const currentItems = Array.isArray(this.schedulePlan?.items) ? this.schedulePlan.items : [];
    currentItems.splice(Math.min(index, currentItems.length), 0, restoredItem);
    this.schedulePlan = {
      ...(this.schedulePlan || {}),
      items: currentItems
    };
    this.scheduleUi = {
      ...this.scheduleUi,
      selectedItemId: restoredItem.id || restoredItem.itemId,
      selectedTaskId: restoredItem.taskUid || null
    };
    updateScheduleRangeAndSummary(this, this.activeProject || {});
    bumpScheduleLocalRevision(this);
    this.showToast(isAuthApiError(error) ? backendSyncToast(error) : DELETE_SYNC_FAIL_TOAST);
    return false;
  }
}
};
