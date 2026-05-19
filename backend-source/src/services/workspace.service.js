import { isMySQLReady, mysqlPool } from "../db/mysql.js";
import { createTaskCommentNotificationEvents } from "./notification-events.service.js";
import { listTemplates } from "./template.service.js";
import { resolveDepartmentFilterValues, resolveDepartmentMeta, findDepartmentTaxonomyByKey } from "../utils/department-taxonomy.js";

const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for modular workspace API";
const OPEN_TASK_STATUSES = new Set(["active", "todo", "open"]);
const CLOSED_TASK_STATUSES = new Set(["archived", "done", "completed"]);

function assertMySQLReady() {
  if (!isMySQLReady()) {
    const error = new Error(MYSQL_UNAVAILABLE_MESSAGE);
    error.statusCode = 503;
    throw error;
  }
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function actorId(auth = {}) {
  if (typeof auth === "string") return auth.trim();
  return String(auth.sub || auth.id || auth.userId || auth.userUid || auth.user_uid || auth.username || "").trim();
}

function isAdminAuth(auth = {}) {
  return String(auth?.role || "").trim().toLowerCase() === "admin";
}

function actorNames(auth = {}, user = null) {
  const values = [
    user?.name,
    user?.username,
    auth?.name,
    auth?.username,
    auth?.displayName,
    auth?.display_name
  ];
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function ownerTextNames(project = {}) {
  const ownerText = String(project.owner_text || "").trim();
  if (!ownerText) return [];
  const parts = ownerText.split(/[/:：]/).map((value) => value.trim()).filter(Boolean);
  return Array.from(new Set([ownerText, parts.at(-1)].filter(Boolean)));
}

function permissionRole(permission = "") {
  const clean = String(permission || "").trim().toLowerCase();
  if (["admin", "owner", "manage", "manager"].includes(clean)) return "manager";
  if (["write", "edit", "editor"].includes(clean)) return "editor";
  if (["read", "view", "readonly", "viewer"].includes(clean)) return "readonly";
  return "none";
}

function normalizeProjectMemberRole(role = "") {
  const clean = String(role || "").trim().toLowerCase();
  if (["manager", "editor", "readonly"].includes(clean)) return clean;
  if (["write", "edit"].includes(clean)) return "editor";
  if (["read", "view", "viewer"].includes(clean)) return "readonly";
  return "readonly";
}

function projectRolePriority(role = "") {
  return {
    admin: 0,
    owner: 1,
    manager: 2,
    editor: 3,
    readonly: 4,
    none: 5
  }[role] ?? 5;
}

function strongerProjectRole(current = "none", candidate = "none") {
  return projectRolePriority(candidate) < projectRolePriority(current) ? candidate : current;
}

function canAuthorizeProject(auth = {}) {
  return auth && typeof auth === "object";
}

function stripLeadingWhere(sql = "") {
  return String(sql || "").replace(/^\s*WHERE\s+/i, "").trim();
}

function toDateSlash(dateValue) {
  const value = normalizeWorkspaceDateForSql(dateValue);
  return value ? value.replaceAll("-", "/") : "";
}

function nowText(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateTimeSlash(dateValue) {
  if (!dateValue) return "";
  if (dateValue instanceof Date) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
      `${dateValue.getFullYear()}/${pad(dateValue.getMonth() + 1)}/${pad(dateValue.getDate())}`,
      `${pad(dateValue.getHours())}:${pad(dateValue.getMinutes())}`
    ].join(" ");
  }
  return String(dateValue).replaceAll("-", "/").slice(0, 16);
}

function makeUid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripDangerousScripts(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/\bjavascript\s*:/gi, "")
    .trim();
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeNoticeLinkUrl(value = "") {
  const linkUrl = stripDangerousScripts(value);
  if (!linkUrl) return "";
  if (linkUrl.startsWith("/") && !linkUrl.startsWith("//")) return linkUrl;
  try {
    const parsed = new URL(linkUrl);
    if (["http:", "https:"].includes(parsed.protocol)) return parsed.toString();
  } catch {
    return "";
  }
  return "";
}

function normalizeNoticeLinkTarget(value = "_self") {
  const target = String(value || "_self").trim().toLowerCase();
  return ["_self", "_blank"].includes(target) ? target : "_self";
}

function mapCarouselNotice(row = {}) {
  const payload = parseJson(row.payload_json, {});
  const content = stripDangerousScripts(row.content_text || "");
  return {
    id: row.notice_uid || String(row.id || ""),
    noticeId: row.notice_uid || String(row.id || ""),
    title: stripDangerousScripts(row.title || ""),
    content,
    text: content,
    status: row.status || "active",
    priority: Number(row.priority ?? payload.priority ?? 0),
    interval: Number(payload.interval || 5500),
    linkText: stripDangerousScripts(row.link_text ?? payload.linkText ?? ""),
    linkUrl: normalizeNoticeLinkUrl(row.link_url ?? payload.linkUrl ?? ""),
    linkTarget: normalizeNoticeLinkTarget(row.link_target ?? payload.linkTarget ?? "_self"),
    startAt: toDateTimeSlash(row.start_at),
    endAt: toDateTimeSlash(row.end_at),
    sortOrder: Number(row.sort_order || 0),
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at)
  };
}

function buildInClauseParams(values = []) {
  const cleanValues = values.filter((value) => String(value || "").trim());
  return {
    placeholders: cleanValues.length ? cleanValues.map(() => "?").join(", ") : "?",
    params: cleanValues.length ? cleanValues : [""]
  };
}

function buildDeleteProjectCleanupStatements(projectUid, actor = "", boardUids = []) {
  const boardUidClause = buildInClauseParams(boardUids);
  return [
    {
      sql: "SELECT board_uid FROM boards WHERE project_uid = ? OR (scope_type = 'project' AND scope_uid = ?)",
      params: [projectUid, projectUid]
    },
    {
      sql: `DELETE FROM board_snapshots WHERE board_uid IN (${boardUidClause.placeholders})`,
      params: boardUidClause.params,
      skipWhenNoBoardUids: true
    },
    {
      sql: `DELETE FROM board_history WHERE board_uid IN (${boardUidClause.placeholders})`,
      params: boardUidClause.params,
      skipWhenNoBoardUids: true
    },
    {
      sql: `DELETE FROM board_members WHERE board_uid IN (${boardUidClause.placeholders})`,
      params: boardUidClause.params,
      skipWhenNoBoardUids: true
    },
    {
      sql: `DELETE FROM board_shares WHERE board_uid IN (${boardUidClause.placeholders})`,
      params: boardUidClause.params,
      skipWhenNoBoardUids: true
    },
    {
      sql: `DELETE FROM boards WHERE board_uid IN (${boardUidClause.placeholders})`,
      params: boardUidClause.params,
      skipWhenNoBoardUids: true
    },
    {
      sql: "DELETE FROM notifications WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM hr_assignment_previews WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM schedule_item_comments WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM schedule_dependencies WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM schedule_snapshots WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM schedule_items WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "UPDATE schedule_plans SET status = 'archived', updated_by = ? WHERE project_uid = ? AND status <> 'archived'",
      params: [actor, projectUid]
    },
    {
      sql: "DELETE FROM schedule_plans WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM shares WHERE resource_type = 'project' AND resource_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM task_comments WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM tasks WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM project_members WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM project_tags WHERE project_uid = ?",
      params: [projectUid]
    },
    {
      sql: "UPDATE storage_files SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE scope_type = 'project' AND scope_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM user_roles WHERE scope_type = 'project' AND scope_uid = ?",
      params: [projectUid]
    },
    {
      sql: "DELETE FROM projects WHERE project_uid = ?",
      params: [projectUid],
      resultKey: "projectDelete"
    }
  ];
}

function normalizeGroupStatus(value) {
  const clean = String(value || "").trim();
  return clean || "active";
}

function normalizeProjectStatus(value, archived = 0) {
  if (Number(archived) === 1) return "archived";
  const clean = String(value || "").trim();
  return clean || "active";
}

const SQL_DATE_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/;
const SQL_DATE_COMPACT_RE = /^(\d{4})(\d{2})(\d{2})$/;
const CHINESE_DATE_RE = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/;
const ENGLISH_MONTHS = new Map([
  ["jan", 1], ["january", 1],
  ["feb", 2], ["february", 2],
  ["mar", 3], ["march", 3],
  ["apr", 4], ["april", 4],
  ["may", 5],
  ["jun", 6], ["june", 6],
  ["jul", 7], ["july", 7],
  ["aug", 8], ["august", 8],
  ["sep", 9], ["sept", 9], ["september", 9],
  ["oct", 10], ["october", 10],
  ["nov", 11], ["november", 11],
  ["dec", 12], ["december", 12]
]);
const ENGLISH_MONTH_RE = new RegExp(
  `^(?:[a-z]{3,9}\\s+)?(${Array.from(ENGLISH_MONTHS.keys()).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})(?:\\D|$)`,
  "i"
);
const ENGLISH_DAY_MONTH_RE = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${Array.from(ENGLISH_MONTHS.keys()).join("|")})\\.?\\s+(\\d{4})(?:\\D|$)`,
  "i"
);

function formatValidSqlDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalizeWorkspaceDateForSql(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatValidSqlDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const text = String(value).trim();
  if (!text) return null;

  for (const match of [text.match(SQL_DATE_RE), text.match(CHINESE_DATE_RE), text.match(SQL_DATE_COMPACT_RE)]) {
    if (match) return formatValidSqlDate(match[1], match[2], match[3]);
  }

  const englishMonthMatch = text.match(ENGLISH_MONTH_RE);
  if (englishMonthMatch) {
    return formatValidSqlDate(
      englishMonthMatch[3],
      ENGLISH_MONTHS.get(englishMonthMatch[1].toLowerCase()),
      englishMonthMatch[2]
    );
  }

  const englishDayMonthMatch = text.match(ENGLISH_DAY_MONTH_RE);
  if (englishDayMonthMatch) {
    return formatValidSqlDate(
      englishDayMonthMatch[3],
      ENGLISH_MONTHS.get(englishDayMonthMatch[2].toLowerCase()),
      englishDayMonthMatch[1]
    );
  }

  if (/\b\d{4}\b/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return formatValidSqlDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    }
  }

  return null;
}

function normalizeTaskModule(value) {
  const clean = String(value || "").trim();
  return clean || "project";
}

function normalizeTaskType(value) {
  const clean = String(value || "").trim();
  return clean || "流程";
}

function normalizeTaskStatus(value, archived = 0) {
  if (Number(archived) === 1) return "archived";
  const clean = String(value || "").trim();
  return clean || "todo";
}

function taskStatusKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isOpenTaskStatus(value) {
  return OPEN_TASK_STATUSES.has(taskStatusKey(value));
}

function isClosedTaskStatus(value) {
  return CLOSED_TASK_STATUSES.has(taskStatusKey(value));
}

function resolveTaskArchivedForWrite(currentArchived = 0, payload = {}) {
  if (payload.archived !== undefined) return payload.archived ? 1 : 0;
  if (payload.status !== undefined) {
    if (isOpenTaskStatus(payload.status)) return 0;
    if (isClosedTaskStatus(payload.status)) return 1;
  }
  return Number(currentArchived || 0) === 1 ? 1 : 0;
}

function resolveTaskStatusForWrite(currentStatus = "", archived = 0, payload = {}) {
  if (payload.status !== undefined) {
    const clean = String(payload.status || "").trim();
    if (Number(archived || 0) === 1) return "archived";
    if (payload.archived === false && isClosedTaskStatus(clean)) return "todo";
    return clean || "todo";
  }

  if (Number(archived || 0) === 1) return "archived";

  const current = String(currentStatus || "").trim();
  if (payload.archived === false && isClosedTaskStatus(current)) return "todo";
  return current || "todo";
}

function resolveTaskScheduleSyncStatus(payload = {}) {
  if (payload.scheduleStatus !== undefined) {
    return normalizeTaskStatus(payload.scheduleStatus, 0);
  }
  if (payload.status !== undefined) {
    if (payload.archived === undefined) {
      return normalizeTaskStatus(payload.status, 0);
    }
    const archived = resolveTaskArchivedForWrite(0, payload);
    return resolveTaskStatusForWrite("", archived, payload);
  }
  if (payload.archived !== undefined) {
    return payload.archived ? "archived" : "todo";
  }
  return undefined;
}

function parseProjectPayload(row) {
  try {
    return row?.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    return {};
  }
}

function parseTaskPayload(row) {
  try {
    return row?.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    return {};
  }
}

function normalizeTaskProgress(value, fallback = 0) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return fallback;
  return Math.min(Math.max(Math.trunc(progress), 0), 100);
}

function normalizeTaskAttachments(value, fallback = []) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  return Array.isArray(fallback) ? fallback : [];
}

function mapTag(row) {
  return {
    id: row.tag_uid || row.name,
    tagId: row.tag_uid || row.name,
    name: row.name,
    color: row.color || "",
    scope: row.scope || "workspace",
    status: row.status || "active",
    sortOrder: Number(row.sort_order || 0)
  };
}

function mapComment(row) {
  return {
    id: row.comment_uid || String(row.id || ""),
    commentId: row.comment_uid || String(row.id || ""),
    taskId: row.task_uid || "",
    projectId: row.project_uid || "",
    user: row.user_name || "",
    userId: row.user_uid || "",
    dept: row.user_dept || "",
    tone: row.tone || "blue",
    time: row.commented_at_text || row.created_at_text || "",
    text: row.content_text || "",
    mentions: Array.isArray(row.mentions) ? row.mentions : []
  };
}

function mapAddressBookEntry(row) {
  const relationType = String(row.relation_type || row.relationType || "").trim().toLowerCase();
  const departmentName = row.department_name || row.department || "";
  const departmentMeta = resolveDepartmentMeta(departmentName);
  const canonicalRoot = departmentMeta.departmentKey ? findDepartmentTaxonomyByKey(departmentMeta.departmentKey) : null;
  const departmentLabel = canonicalRoot?.label || departmentMeta.displayDepartment || departmentName;
  return {
    id: row.contact_uid || row.user_uid || row.username,
    contactId: row.contact_uid || "",
    userId: row.user_uid || "",
    userUid: row.user_uid || "",
    username: row.username || "",
    name: row.display_name || row.name || "",
    displayName: row.display_name || row.name || "",
    departmentId: row.department_uid || "",
    department: departmentName,
    departmentName: departmentName,
    departmentKey: departmentMeta.departmentKey || "",
    departmentAliasKey: departmentMeta.childDepartmentKey || "",
    displayDepartment: departmentMeta.displayDepartment || departmentName,
    departmentLabel,
    canonicalDepartment: departmentLabel,
    departmentPath: row.department_path || departmentMeta.departmentPath || departmentName,
    departmentEn: row.department_en || "",
    job: row.job || "",
    role: row.role || "employee",
    phone: row.phone || "",
    email: row.email || "",
    relationType: relationType || "coworker",
    status: row.status || "active"
  };
}

function mapContactProfile(row = {}) {
  const base = mapAddressBookEntry(row);
  return {
    ...base,
    ownerUserId: row.owner_user_uid || "",
    mbti: row.mbti || "ENTP",
    mood: row.mood || "",
    signature: row.signature || "",
    profileNote: row.profile_note || row.profileNote || "",
    characterLabel: row.character_label || row.characterLabel || base.job || "",
    avatarImage: row.avatar_image || row.avatarImage || "",
    characterImage: row.character_image || row.characterImage || "",
    signatureImage: row.signature_image || row.signatureImage || ""
  };
}

function mapDepartment(row) {
  const departmentName = row.name || "";
  const departmentMeta = resolveDepartmentMeta(departmentName);
  const canonicalRoot = departmentMeta.departmentKey ? findDepartmentTaxonomyByKey(departmentMeta.departmentKey) : null;
  const displayDepartment = departmentMeta.displayDepartment || departmentName;
  const departmentLabel = canonicalRoot?.label || displayDepartment;
  return {
    id: row.department_uid,
    departmentId: row.department_uid,
    name: departmentName,
    label: departmentLabel,
    departmentKey: departmentMeta.departmentKey || "",
    departmentAliasKey: departmentMeta.childDepartmentKey || "",
    displayDepartment,
    canonicalDepartment: departmentLabel,
    departmentPath: departmentMeta.departmentPath || departmentName,
    nameEn: row.name_en || "",
    parentDepartmentId: row.parent_department_uid || "",
    managerUserId: row.manager_user_uid || "",
    status: row.status || "active",
    sortOrder: Number(row.sort_order || 0),
    taxonomyOrder: departmentMeta.departmentOrder
  };
}

function mapProjectMember(row) {
  const departmentName = row.department || row.department_name || "";
  const departmentMeta = resolveDepartmentMeta(departmentName);
  const memberName = row.member_name || row.name || row.display_name || "";
  return {
    id: row.member_uid || row.user_uid || row.member_name,
    memberId: row.member_uid || "",
    projectId: row.project_uid || "",
    userId: row.user_uid || "",
    userUid: row.user_uid || "",
    username: row.username || "",
    memberName: memberName,
    name: memberName,
    role: row.member_role || "readonly",
    department: departmentName,
    departmentKey: departmentMeta.departmentKey || "",
    displayDepartment: departmentMeta.displayDepartment || departmentName,
    departmentEn: row.department_en || "",
    status: row.status || "active",
    sortOrder: Number(row.sort_order || 0)
  };
}

function toMemberArray(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/[,\n，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
}

function memberEntryKey(entry = {}) {
  const userUid = String(entry.userUid || "").trim().toLowerCase();
  if (userUid) return `uid:${userUid}`;
  return `name:${String(entry.memberName || "").trim().toLowerCase()}`;
}

function normalizeMemberEntry(rawEntry, fallbackRole = "readonly") {
  if (rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry)) {
    const userUid = String(
      rawEntry.userId ||
        rawEntry.userUid ||
        rawEntry.toUserId ||
        rawEntry.toUserUid ||
        rawEntry.username ||
        rawEntry.toUsername ||
        ""
    ).trim();
    const identity = String(
      userUid ||
        rawEntry.name ||
        rawEntry.memberName ||
        ""
    ).trim();
    const memberName = String(rawEntry.name || rawEntry.memberName || identity).trim();
    return {
      identity,
      userUid,
      memberName,
      role: normalizeProjectMemberRole(rawEntry.role || rawEntry.memberRole || fallbackRole),
      strictResolve: Boolean(rawEntry.userId || rawEntry.userUid || rawEntry.toUserId || rawEntry.toUserUid || rawEntry.username || rawEntry.toUsername)
    };
  }

  const clean = String(rawEntry || "").trim();
  return {
    identity: clean,
    userUid: "",
    memberName: clean,
    role: normalizeProjectMemberRole(fallbackRole),
    strictResolve: false
  };
}

function collectMemberEntries(payload = {}, fallbackRole = "readonly") {
  const source = payload.members ?? payload.entries ?? payload.targets ?? payload.users ?? [];
  const rawItems = toMemberArray(source);
  return rawItems
    .map((item) => normalizeMemberEntry(item, fallbackRole))
    .filter((item) => item.identity || item.memberName);
}

function collectGroupedMemberEntries(payload = {}) {
  const source = (payload.groups && typeof payload.groups === "object" && payload.groups) ||
    (payload.memberGroups && typeof payload.memberGroups === "object" && payload.memberGroups) ||
    (payload.roles && typeof payload.roles === "object" && payload.roles) ||
    payload;

  const grouped = [
    ...toMemberArray(source.manager ?? source.manage ?? source.admin).map((item) => normalizeMemberEntry(item, "manager")),
    ...toMemberArray(source.editor ?? source.edit ?? source.write).map((item) => normalizeMemberEntry(item, "editor")),
    ...toMemberArray(source.readonly ?? source.read ?? source.viewer ?? source.view).map((item) => normalizeMemberEntry(item, "readonly"))
  ];

  const deduped = [];
  const seen = new Set();
  for (const entry of grouped) {
    const key = memberEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function mapShare(row) {
  return {
    id: row.share_uid,
    shareId: row.share_uid,
    resourceType: row.resource_type,
    resourceId: row.resource_uid,
    fromUserId: row.from_user_uid || "",
    toUserId: row.to_user_uid || "",
    toUsername: row.to_username || "",
    toName: row.to_name || "",
    permission: row.permission || "read",
    status: row.status || "active",
    sharedAt: row.shared_at_text || "",
    expiresAt: row.expires_at_text || ""
  };
}

function mapTask(row, comments = []) {
  const payload = parseTaskPayload(row);
  return {
    id: Number(row.legacy_task_id || row.id),
    taskId: row.task_uid,
    projectId: row.project_uid,
    title: row.title || "",
    type: row.task_type || normalizeTaskType(payload.type),
    note: row.note_text || payload.note || "暂无备注，可点击备注修改。",
    module: normalizeTaskModule(row.module_key || payload.module),
    owner: row.owner_text || payload.owner || "",
    ownerUserId: row.owner_user_uid || "",
    status: normalizeTaskStatus(row.status, row.archived),
    priority: row.priority || "normal",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    comments,
    unreadComments: Number(payload.unreadComments || 0),
    scheduleStatus: String(payload.scheduleStatus || "").trim(),
    progress: normalizeTaskProgress(payload.progress, 0),
    attachments: normalizeTaskAttachments(payload.attachments),
    expanded: Number(row.expanded || 0) === 1,
    archived: Number(row.archived || 0) === 1,
    time: payload.time || (row.updated_at_text ? row.updated_at_text.replaceAll("-", "/").slice(0, 16) : nowText()),
    sortOrder: Number(row.sort_order || 0)
  };
}

function mapProject(row, tasks = [], members = [], tags = []) {
  const payload = parseProjectPayload(row);
  const memberItems = members.map((member) => mapProjectMember(member));
  const memberRoles = {};
  const memberNames = [];
  memberItems.forEach((member) => {
    const name = member.memberName || member.name || "";
    if (!name) return;
    memberNames.push(name);
    memberRoles[name] = member.role || "readonly";
  });

  return {
    id: Number(row.legacy_project_id || row.id),
    projectId: row.project_uid,
    projectUid: row.project_uid || "",
    legacyProjectId: Number(row.legacy_project_id || row.id),
    groupId: row.group_uid,
    group: payload.group || "",
    name: row.name || "",
    status: normalizeProjectStatus(row.status, row.archived),
    owner: row.owner_text || payload.owner || "",
    members: memberNames,
    memberItems,
    memberObjects: memberItems,
    memberRoles,
    tags: tags.map((tag) => tag.tag_name || tag.name).filter(Boolean),
    syncSchedule: payload.syncSchedule !== false,
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    archived: Number(row.archived || 0) === 1,
    tasks
  };
}

function mapBootstrapUser(row = {}) {
  const departmentName = row.department || "";
  const departmentMeta = resolveDepartmentMeta(departmentName);
  const canonicalRoot = departmentMeta.departmentKey ? findDepartmentTaxonomyByKey(departmentMeta.departmentKey) : null;
  const departmentLabel = canonicalRoot?.label || departmentMeta.displayDepartment || departmentName;
  return {
    id: row.user_uid || String(row.id || ""),
    userId: row.user_uid || String(row.id || ""),
    userUid: row.user_uid || "",
    username: row.username || "",
    name: row.name || row.username || "",
    department: departmentName,
    departmentKey: departmentMeta.departmentKey || "",
    departmentAliasKey: departmentMeta.childDepartmentKey || "",
    displayDepartment: departmentMeta.displayDepartment || departmentName,
    departmentLabel,
    canonicalDepartment: departmentLabel,
    departmentPath: departmentMeta.departmentPath || departmentName,
    role: row.role || "employee",
    status: row.status || "active",
    job: row.job || "",
    phone: row.phone || "",
    email: row.email || "",
    mbti: row.mbti || "ENTP",
    mood: row.mood || "",
    signature: row.signature || "",
    profileNote: row.profile_note || row.profileNote || "",
    characterLabel: row.character_label || row.characterLabel || row.job || "",
    avatarImage: row.avatar_image || row.avatarImage || "",
    characterImage: row.character_image || row.characterImage || "",
    signatureImage: row.signature_image || row.signatureImage || ""
  };
}

async function fetchProjectGroups() {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        group_uid, title, suffix, status, sort_order
      FROM project_groups
      ORDER BY sort_order ASC, id ASC
    `
  );

  return rows.map((row) => ({
    id: row.group_uid,
    title: row.title || "",
    suffix: row.suffix || "",
    status: normalizeGroupStatus(row.status),
    sortOrder: Number(row.sort_order || 0)
  }));
}

async function fetchProjectMembers(projectUids = []) {
  if (!projectUids.length) return new Map();
  const placeholders = projectUids.map(() => "?").join(", ");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        member_uid,
        project_uid,
        user_uid,
        member_name,
        member_role,
        department,
        department_en,
        status,
        sort_order
      FROM project_members
      WHERE project_uid IN (${placeholders}) AND status = 'active'
      ORDER BY sort_order ASC, id ASC
    `,
    projectUids
  );

  const map = new Map();
  rows.forEach((row) => {
    const key = row.project_uid;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

async function fetchProjectTagRows(projectUids = []) {
  if (!projectUids.length) return new Map();
  const placeholders = projectUids.map(() => "?").join(", ");
  const [rows] = await mysqlPool.execute(
    `
      SELECT project_uid, tag_uid, tag_name, tag_color
      FROM project_tags
      WHERE project_uid IN (${placeholders})
      ORDER BY sort_order ASC, id ASC
    `,
    projectUids
  );

  const map = new Map();
  rows.forEach((row) => {
    const key = row.project_uid;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

async function fetchTaskRowsByProject(projectUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        task_uid,
        project_uid,
        legacy_task_id,
        title,
        task_type,
        module_key,
        owner_user_uid,
        owner_text,
        status,
        priority,
        start_date,
        end_date,
        archived,
        expanded,
        sort_order,
        note_text,
        payload_json,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM tasks
      WHERE project_uid = ?
      ORDER BY sort_order ASC, id ASC
    `,
    [projectUid]
  );
  return rows;
}

async function fetchCommentRowsByTask(taskUids = []) {
  if (!taskUids.length) return new Map();
  const placeholders = taskUids.map(() => "?").join(", ");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        comment_uid,
        task_uid,
        project_uid,
        user_uid,
        user_name,
        user_dept,
        tone,
        content_text,
        DATE_FORMAT(commented_at, '%Y/%m/%d %H:%i') AS commented_at_text,
        DATE_FORMAT(created_at, '%Y/%m/%d %H:%i') AS created_at_text
      FROM task_comments
      WHERE task_uid IN (${placeholders})
      ORDER BY id ASC
    `,
    taskUids
  );

  const map = new Map();
  rows.forEach((row) => {
    const key = row.task_uid;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(mapComment(row));
  });
  return map;
}

async function fetchMentionsByComment(commentUids = []) {
  if (!commentUids.length) return new Map();
  const placeholders = commentUids.map(() => "?").join(", ");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        cm.comment_uid,
        cm.mention_uid,
        cm.mentioned_user_uid,
        cm.mentioned_username,
        cm.is_read,
        u.name AS mentioned_name,
        u.department AS mentioned_department
      FROM comment_mentions cm
      LEFT JOIN users u ON u.user_uid = cm.mentioned_user_uid
      WHERE cm.comment_uid IN (${placeholders})
      ORDER BY cm.id ASC
    `,
    commentUids
  );

  const map = new Map();
  rows.forEach((row) => {
    const key = row.comment_uid;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: row.mention_uid,
      mentionId: row.mention_uid,
      userId: row.mentioned_user_uid || "",
      username: row.mentioned_username || "",
      name: row.mentioned_name || row.mentioned_username || "",
      department: row.mentioned_department || "",
      isRead: Number(row.is_read || 0) === 1
    });
  });
  return map;
}

async function mapCommentRowsWithMentions(rows = []) {
  const mentionsMap = await fetchMentionsByComment(rows.map((row) => row.comment_uid));
  return rows.map((row) => mapComment({ ...row, mentions: mentionsMap.get(row.comment_uid) || [] }));
}

async function mapTaskRowsWithComments(taskRows = []) {
  const commentMap = await fetchCommentRowsByTask(taskRows.map((row) => row.task_uid));
  return taskRows.map((row) => mapTask(row, commentMap.get(row.task_uid) || []));
}

async function fetchProjects(auth = {}) {
  const access = await projectListAccessFilter(auth);
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        p.project_uid,
        p.legacy_project_id,
        p.group_uid,
        p.name,
        p.status,
        p.owner_text,
        p.start_date,
        p.end_date,
        p.archived,
        p.sort_order,
        p.payload_json,
        p.created_by,
        p.updated_by
      FROM projects p
      ${access.sql}
      ORDER BY p.sort_order ASC, p.id ASC
    `,
    access.params
  );

  const projectUids = rows.map((row) => row.project_uid);
  const memberMap = await fetchProjectMembers(projectUids);
  const tagMap = await fetchProjectTagRows(projectUids);

  const tasksMap = new Map();
  for (const projectUid of projectUids) {
    const taskRows = await fetchTaskRowsByProject(projectUid);
    tasksMap.set(projectUid, await mapTaskRowsWithComments(taskRows));
  }

  return rows.map((row) => mapProject(
    row,
    tasksMap.get(row.project_uid) || [],
    memberMap.get(row.project_uid) || [],
    tagMap.get(row.project_uid) || []
  ));
}

async function fetchRootAndGroupedProjects(auth = {}) {
  const groups = await fetchProjectGroups();
  const projects = await fetchProjects(auth);

  const groupsByUid = new Map(groups.map((group) => [group.id, { ...group, projects: [] }]));
  const rootProjects = [];

  projects.forEach((project) => {
    const holder = groupsByUid.get(project.groupId);
    if (holder) {
      project.group = holder.title;
      holder.projects.push(project);
    } else {
      rootProjects.push(project);
    }
  });

  return {
    projectGroups: Array.from(groupsByUid.values()),
    rootProjects
  };
}

async function fetchTags() {
  const [rows] = await mysqlPool.execute(
    `
      SELECT name, color, scope, status, sort_order
      FROM tags
      ORDER BY sort_order ASC, id ASC
    `
  );
  return rows.map(mapTag);
}

async function fetchBootstrapUsers() {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        id, user_uid, username, name, department, role, status, job, phone, email,
        mbti, mood, signature, profile_note, character_label,
        avatar_image, character_image, signature_image
      FROM users
      WHERE status = 'active'
      ORDER BY id ASC
    `
  );
  return rows.map(mapBootstrapUser);
}

async function fetchBootstrapTemplates(auth = {}) {
  const templateState = await listTemplates(auth, {});
  return {
    templates: Array.isArray(templateState?.templates) ? templateState.templates : [],
    templateShareInfo: templateState?.templateShareInfo && typeof templateState.templateShareInfo === "object"
      ? templateState.templateShareInfo
      : {}
  };
}

async function resolveProjectByAnyId(projectId, executor = mysqlPool, options = {}) {
  const clean = String(projectId || "").trim();
  if (!clean) throw badRequest("项目ID不能为空");
  const lockClause = options.forUpdate ? "FOR UPDATE" : "";

  const [rows] = await executor.execute(
    `
      SELECT
        project_uid,
        legacy_project_id,
        group_uid,
        name,
        status,
        owner_text,
        start_date,
        end_date,
        archived,
        sort_order,
        payload_json,
        created_by,
        updated_by
      FROM projects
      WHERE project_uid = ? OR CAST(id AS CHAR) = ? OR CAST(legacy_project_id AS CHAR) = ?
      ORDER BY id ASC
      LIMIT 1
      ${lockClause}
    `,
    [clean, clean, clean]
  );

  if (!rows.length) throw notFound("项目不存在");
  return rows[0];
}

function taskIdCandidatesFromAnyId(taskId = "") {
  const clean = String(taskId || "").trim();
  if (!clean) return [];
  const candidates = [clean];
  if (/^task[-_]/i.test(clean)) {
    candidates.push(clean.replace(/^task[-_]/i, ""));
  }
  return Array.from(new Set(candidates.map((value) => String(value || "").trim()).filter(Boolean)));
}

async function resolveTaskByAnyId(taskId) {
  const candidates = taskIdCandidatesFromAnyId(taskId);
  if (!candidates.length) throw badRequest("任务ID不能为空");
  const placeholders = candidates.map(() => "?").join(", ");

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        task_uid,
        project_uid,
        legacy_task_id,
        title,
        task_type,
        module_key,
        owner_user_uid,
        owner_text,
        status,
        priority,
        start_date,
        end_date,
        archived,
        expanded,
        sort_order,
        note_text,
        payload_json,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM tasks
      WHERE task_uid IN (${placeholders})
        OR CAST(id AS CHAR) IN (${placeholders})
        OR CAST(legacy_task_id AS CHAR) IN (${placeholders})
      ORDER BY id ASC
      LIMIT 1
    `,
    [...candidates, ...candidates, ...candidates]
  );

  if (!rows.length) throw notFound("任务不存在");
  return rows[0];
}

async function replaceProjectTags(projectUid, tags = [], actor = "") {
  await mysqlPool.execute("DELETE FROM project_tags WHERE project_uid = ?", [projectUid]);
  if (!Array.isArray(tags) || !tags.length) return;

  for (let index = 0; index < tags.length; index += 1) {
    const tagName = String(tags[index] || "").trim();
    if (!tagName) continue;
    const [tagRows] = await mysqlPool.execute(
      "SELECT tag_uid, color FROM tags WHERE name = ? LIMIT 1",
      [tagName]
    );
    const tagUid = tagRows[0]?.tag_uid || "";
    const tagColor = tagRows[0]?.color || "";

    await mysqlPool.execute(
      `
        INSERT INTO project_tags (project_uid, tag_uid, tag_name, tag_color, sort_order, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [projectUid, tagUid, tagName, tagColor, index, actor]
    );
  }
}

async function replaceProjectMembers(projectUid, members = [], memberRoles = {}, actor = "") {
  await mysqlPool.execute("DELETE FROM project_members WHERE project_uid = ?", [projectUid]);
  if (!Array.isArray(members) || !members.length) return;

  for (let index = 0; index < members.length; index += 1) {
    const name = String(members[index] || "").trim();
    if (!name) continue;
    const role = normalizeProjectMemberRole(memberRoles?.[name] || (index === 0 ? "manager" : "readonly"));
    await mysqlPool.execute(
      `
        INSERT INTO project_members (
          member_uid, project_uid, user_uid, member_name, member_role,
          department, department_en, status, sort_order, joined_at, payload_json, created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, '', '', 'active', ?, NOW(), NULL, ?, ?)
      `,
      [makeUid("member"), projectUid, "", name, role, index, actor, actor]
    );
  }
}

async function ensureActorProjectManager(projectUid, actor = "") {
  const cleanActor = String(actor || "").trim();
  if (!cleanActor) return;
  const [rows] = await mysqlPool.execute(
    `
      SELECT user_uid, username, name, department, department_en
      FROM users
      WHERE user_uid = ? OR username = ? OR CAST(id AS CHAR) = ?
      LIMIT 1
    `,
    [cleanActor, cleanActor, cleanActor]
  );
  const user = rows[0];
  if (!user?.user_uid) return;
  await upsertProjectMemberFromUser(projectUid, user, "manager", actor);
}

async function resolveUserByAnyId(value) {
  const clean = String(value || "").trim();
  if (!clean) throw badRequest("用户ID不能为空");

  const [rows] = await mysqlPool.execute(
    `
      SELECT user_uid, username, name, department, department_en, job, status
      FROM users
      WHERE user_uid = ? OR username = ? OR name = ?
      ORDER BY id ASC
      LIMIT 1
    `,
    [clean, clean, clean]
  );

  if (!rows.length) throw notFound("用户不存在");
  return rows[0];
}

async function fetchUserByAuth(auth = {}) {
  const userUid = actorId(auth);
  const username = String(auth.username || "").trim();
  const name = String(auth.name || "").trim();
  const identityClauses = [];
  const params = [];

  if (userUid) {
    identityClauses.push("user_uid = ?");
    params.push(userUid);
  }
  if (username) {
    identityClauses.push("username = ?");
    params.push(username);
  }
  if (name) {
    identityClauses.push("name = ?");
    params.push(name);
  }
  if (!identityClauses.length) return null;

  const [rows] = await mysqlPool.execute(
    `
      SELECT user_uid, username, name, department, department_en, job, status
      FROM users
      WHERE ${identityClauses.join(" OR ")}
      ORDER BY id ASC
      LIMIT 1
    `,
    params
  );
  return rows[0] || null;
}

async function getProjectPermission(project, auth = {}) {
  if (!canAuthorizeProject(auth)) return "none";
  if (isAdminAuth(auth)) return "admin";

  const userUid = actorId(auth);
  const user = await fetchUserByAuth(auth);
  const names = actorNames(auth, user);
  const ownerNames = ownerTextNames(project);
  let permission = "none";

  if (userUid && project.created_by === userUid) {
    permission = strongerProjectRole(permission, "owner");
  }
  if (names.some((name) => ownerNames.includes(name))) {
    permission = strongerProjectRole(permission, "owner");
  }

  const identityClauses = [];
  const params = [project.project_uid];
  if (userUid) {
    identityClauses.push("user_uid = ?");
    params.push(userUid);
  }
  if (names.length) {
    identityClauses.push(`member_name IN (${names.map(() => "?").join(", ")})`);
    params.push(...names);
  }

  if (identityClauses.length) {
    const [memberRows] = await mysqlPool.execute(
      `
        SELECT member_role
        FROM project_members
        WHERE project_uid = ?
          AND status = 'active'
          AND (${identityClauses.join(" OR ")})
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
    if (memberRows[0]?.member_role) {
      permission = strongerProjectRole(permission, normalizeProjectMemberRole(memberRows[0].member_role));
    }
  }

  if (userUid) {
    const [shareRows] = await mysqlPool.execute(
      `
        SELECT permission
        FROM shares
        WHERE resource_type = 'project'
          AND resource_uid = ?
          AND to_user_uid = ?
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at >= NOW())
        ORDER BY id ASC
        LIMIT 1
      `,
      [project.project_uid, userUid]
    );
    if (shareRows[0]?.permission) {
      permission = strongerProjectRole(permission, permissionRole(shareRows[0].permission));
    }
  }

  return permission;
}

async function requireProjectPermission(project, auth = {}, capability = "view") {
  const role = await getProjectPermission(project, auth);
  const allowed = {
    view: ["admin", "owner", "manager", "editor", "readonly"],
    edit: ["admin", "owner", "manager", "editor"],
    manage: ["admin", "owner", "manager"],
    delete: ["admin"]
  };

  if (!allowed[capability]?.includes(role)) {
    throw forbidden("没有权限访问该项目");
  }

  return role;
}

async function projectListAccessFilter(auth = {}) {
  if (isAdminAuth(auth)) {
    return { sql: "", params: [] };
  }

  const userUid = actorId(auth);
  const user = await fetchUserByAuth(auth);
  const names = actorNames(auth, user);
  const clauses = [];
  const params = [];

  if (userUid) {
    clauses.push("p.created_by = ?");
    params.push(userUid);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM shares s
        WHERE s.resource_type = 'project'
          AND s.resource_uid = p.project_uid
          AND s.to_user_uid = ?
          AND s.status = 'active'
          AND (s.expires_at IS NULL OR s.expires_at >= NOW())
      )
    `);
    params.push(userUid);
  }

  if (names.length) {
    clauses.push(`p.owner_text IN (${names.map(() => "?").join(", ")})`);
    params.push(...names);
    clauses.push(names.map(() => "p.owner_text LIKE ? OR p.owner_text LIKE ? OR p.owner_text LIKE ? OR p.owner_text LIKE ?").join(" OR "));
    params.push(...names.flatMap((name) => [`%: ${name}`, `%： ${name}`, `%:${name}`, `%：${name}`]));
    clauses.push(`
      EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_uid = p.project_uid
          AND pm.status = 'active'
          AND pm.member_name IN (${names.map(() => "?").join(", ")})
      )
    `);
    params.push(...names);
  }

  if (userUid) {
    clauses.push(`
      EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_uid = p.project_uid
          AND pm.status = 'active'
          AND pm.user_uid = ?
      )
    `);
    params.push(userUid);
  }

  if (!clauses.length) {
    return { sql: "WHERE 1 = 0", params: [] };
  }

  return {
    sql: `WHERE (${clauses.join(" OR ")})`,
    params
  };
}

async function upsertProjectMemberFromUser(projectUid, user, role = "readonly", actor = "") {
  const memberRole = normalizeProjectMemberRole(role);
  await mysqlPool.execute(
    `
      INSERT INTO project_members (
        member_uid, project_uid, user_uid, member_name, member_role,
        department, department_en, status, sort_order, joined_at, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NULL, ?, ?)
      ON DUPLICATE KEY UPDATE
        member_name = VALUES(member_name),
        member_role = VALUES(member_role),
        department = VALUES(department),
        department_en = VALUES(department_en),
        status = 'active',
        updated_by = VALUES(updated_by)
    `,
    [
      makeUid("member"),
      projectUid,
      user.user_uid,
      user.name || user.username,
      memberRole,
      user.department || "",
      user.department_en || "",
      Date.now(),
      actor,
      actor
    ]
  );
}

async function buildProjectByUid(projectUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        project_uid,
        legacy_project_id,
        group_uid,
        name,
        status,
        owner_text,
        start_date,
        end_date,
        archived,
        sort_order,
        payload_json
      FROM projects
      WHERE project_uid = ?
      LIMIT 1
    `,
    [projectUid]
  );
  if (!rows.length) throw notFound("项目不存在");
  const row = rows[0];

  const membersMap = await fetchProjectMembers([projectUid]);
  const tagMap = await fetchProjectTagRows([projectUid]);
  const taskRows = await fetchTaskRowsByProject(projectUid);
  const tasks = await mapTaskRowsWithComments(taskRows);

  return mapProject(row, tasks, membersMap.get(projectUid) || [], tagMap.get(projectUid) || []);
}

async function buildTaskByUid(taskUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        task_uid,
        project_uid,
        legacy_task_id,
        title,
        task_type,
        module_key,
        owner_user_uid,
        owner_text,
        status,
        priority,
        start_date,
        end_date,
        archived,
        expanded,
        sort_order,
        note_text,
        payload_json,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM tasks
      WHERE task_uid = ?
      LIMIT 1
    `,
    [taskUid]
  );
  if (!rows.length) throw notFound("任务不存在");
  const row = rows[0];
  const commentMap = await fetchCommentRowsByTask([taskUid]);
  return mapTask(row, commentMap.get(taskUid) || []);
}

async function ensureActiveSchedulePlanForTask(projectId, actor = "") {
  const project = await resolveProjectByAnyId(projectId);
  const [activeRows] = await mysqlPool.execute(
    `
      SELECT plan_uid, project_uid
      FROM schedule_plans
      WHERE project_uid = ? AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `,
    [project.project_uid]
  );
  if (activeRows.length) return activeRows[0];

  const planUid = makeUid("sp");
  const viewConfig = JSON.stringify({
    defaultView: "timeline",
    dayWidth: 28,
    rowHeight: 34
  });

  try {
    await mysqlPool.execute(
      `
        INSERT INTO schedule_plans (
          plan_uid,
          project_uid,
          status,
          title,
          start_date,
          end_date,
          default_view,
          view_config_json,
          payload_json,
          created_by,
          updated_by
        )
        VALUES (?, ?, 'active', ?, ?, ?, 'timeline', ?, ?, ?, ?)
      `,
      [
        planUid,
        project.project_uid,
        `${project.name || "Project"} schedule`,
        normalizeWorkspaceDateForSql(project.start_date) ?? null,
        normalizeWorkspaceDateForSql(project.end_date) ?? null,
        viewConfig,
        JSON.stringify({ source: "task-sync" }),
        actor,
        actor
      ]
    );
  } catch (error) {
    if (!["ER_DUP_ENTRY", 1062].includes(error?.code || error?.errno)) throw error;
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT plan_uid, project_uid
      FROM schedule_plans
      WHERE project_uid = ? AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `,
    [project.project_uid]
  );
  if (!rows.length) throw notFound("排期计划不存在");
  return rows[0];
}

async function createScheduleItemFromTask(task = {}, actor = "") {
  const taskUid = String(task.task_uid || task.taskUid || task.taskId || "").trim();
  const projectUid = String(task.project_uid || task.projectId || "").trim();
  if (!taskUid || !projectUid) return 0;

  const [existingRows] = await mysqlPool.execute(
    `
      SELECT item_uid
      FROM schedule_items
      WHERE task_uid = ? AND hidden = 0
      LIMIT 1
    `,
    [taskUid]
  );
  if (existingRows.length) return 0;

  const plan = await ensureActiveSchedulePlanForTask(projectUid, actor);
  const payload = parseTaskPayload(task);
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
      VALUES (?, ?, ?, ?, ?, 'schedule', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?, ?, ?)
    `,
    [
      makeUid("si"),
      plan.plan_uid,
      projectUid,
      taskUid,
      Number(task.legacy_task_id || task.id || 0) || null,
      String(task.title || "").trim() || "未命名任务",
      normalizeTaskModule(task.module_key || task.module),
      String(task.owner_user_uid || task.ownerUserId || "").trim(),
      String(task.owner_text || task.owner || "").trim(),
      resolveTaskScheduleSyncStatus({
        status: task.status,
        archived: Number(task.archived || 0) === 1
      }),
      String(task.priority || "normal").trim() || "normal",
      normalizeTaskProgress(payload.progress, 0),
      normalizeWorkspaceDateForSql(task.start_date) ?? null,
      normalizeWorkspaceDateForSql(task.end_date) ?? null,
      Number(task.sort_order || task.sortOrder || Date.now()),
      String(task.note_text || task.note || "").trim(),
      JSON.stringify({ source: "task-sync", taskUid }),
      actor,
      actor
    ]
  );
  return 1;
}

async function syncScheduleItemsFromTask(taskUid, payload = {}, actor = "", options = {}) {
  const cleanTaskUid = String(taskUid || "").trim();
  const createIfMissing = options?.createIfMissing === true;
  if (!cleanTaskUid) return { scheduleItemsUpdated: 0, scheduleItemCreated: false };

  const fields = [];
  const params = [];
  const assign = (column, value) => {
    fields.push(`${column} = ?`);
    params.push(value);
  };

  if (payload.title !== undefined) assign("title", String(payload.title || "").trim());
  if (payload.module !== undefined) assign("module_key", normalizeTaskModule(payload.module));
  if (payload.owner !== undefined) assign("owner_text", String(payload.owner || "").trim());
  if (payload.ownerUserId !== undefined || payload.ownerUserUid !== undefined || payload.assigneeId !== undefined || payload.personId !== undefined) {
    assign("owner_user_uid", String(payload.ownerUserId || payload.ownerUserUid || payload.assigneeId || payload.personId || "").trim());
  }
  if (payload.startDate !== undefined) assign("start_date", normalizeWorkspaceDateForSql(payload.startDate));
  if (payload.endDate !== undefined) assign("end_date", normalizeWorkspaceDateForSql(payload.endDate));
  if (payload.status !== undefined || payload.scheduleStatus !== undefined || payload.archived !== undefined) {
    assign("status", resolveTaskScheduleSyncStatus(payload));
  }
  if (payload.priority !== undefined) assign("priority", String(payload.priority || "normal").trim() || "normal");
  if (payload.progress !== undefined) assign("progress", normalizeTaskProgress(payload.progress, 0));
  if (payload.note !== undefined) assign("note_text", String(payload.note || "").trim());

  if (!fields.length) {
    if (!createIfMissing) return { scheduleItemsUpdated: 0, scheduleItemCreated: false };
    const task = await resolveTaskByAnyId(cleanTaskUid);
    const created = await createScheduleItemFromTask(task, actor);
    return { scheduleItemsUpdated: 0, scheduleItemCreated: created > 0 };
  }
  fields.push("updated_by = ?");
  params.push(actor);
  params.push(cleanTaskUid);

  const [result] = await mysqlPool.execute(
    `
      UPDATE schedule_items
      SET ${fields.join(", ")}
      WHERE task_uid = ? AND hidden = 0
    `,
    params
  );

  const scheduleItemsUpdated = Number(result.affectedRows || 0);
  if (scheduleItemsUpdated > 0 || !createIfMissing) {
    return { scheduleItemsUpdated, scheduleItemCreated: false };
  }

  const task = await resolveTaskByAnyId(cleanTaskUid);
  const created = await createScheduleItemFromTask(task, actor);
  return { scheduleItemsUpdated, scheduleItemCreated: created > 0 };
}

export async function getBootstrapState(auth = {}) {
  assertMySQLReady();
  const groupsAndRoots = await fetchRootAndGroupedProjects(auth);
  const tags = await fetchTags();
  const templateState = await fetchBootstrapTemplates(auth);
  const carouselNotices = await listWorkspaceCarouselNotices(auth);

  return {
    rootProjects: groupsAndRoots.rootProjects,
    projectGroups: groupsAndRoots.projectGroups,
    tags,
    users: await fetchBootstrapUsers(),
    contacts: await listContacts(auth, { relationType: "care" }),
    currentUserId: actorId(auth),
    templates: templateState.templates,
    templateShareInfo: templateState.templateShareInfo,
    carouselNotices: carouselNotices,
    boardHistory: []
  };
}

export async function listWorkspaceCarouselNotices(auth = {}) {
  assertMySQLReady();
  const [rows] = await mysqlPool.execute(`
    SELECT
      id, notice_uid, title, content_text, status, priority,
      link_text, link_url, link_target, start_at, end_at,
      sort_order, payload_json, updated_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
    FROM carousel_notices
    WHERE enabled = 1
      AND status = 'active'
      AND (start_at IS NULL OR start_at <= NOW())
      AND (end_at IS NULL OR end_at >= NOW())
    ORDER BY priority DESC, sort_order ASC, updated_at DESC
  `);
  return rows.map(mapCarouselNotice);
}

export async function listProjectGroups() {
  assertMySQLReady();
  const groups = await fetchProjectGroups();
  return groups.map((group) => ({ ...group, projects: [] }));
}

export async function createProjectGroup(payload = {}, actor = "") {
  assertMySQLReady();
  const title = String(payload.title || "").trim();
  if (!title) throw badRequest("标题不能为空");

  const groupUid = String(payload.id || payload.groupId || "").trim() || makeUid("group");
  const suffix = String(payload.suffix || "0").trim() || "0";
  const status = normalizeGroupStatus(payload.status);
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? Date.now());

  await mysqlPool.execute(
    `
      INSERT INTO project_groups (group_uid, title, suffix, status, sort_order, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [groupUid, title, suffix, status, sortOrder, actor, actor]
  );

  return {
    id: groupUid,
    title,
    suffix,
    status,
    sortOrder,
    projects: []
  };
}

export async function updateProjectGroup(groupId, payload = {}, actor = "") {
  assertMySQLReady();
  const cleanGroupId = String(groupId || "").trim();
  if (!cleanGroupId) throw badRequest("分组ID不能为空");

  const [currentRows] = await mysqlPool.execute(
    "SELECT group_uid, title, suffix, status, sort_order FROM project_groups WHERE group_uid = ? LIMIT 1",
    [cleanGroupId]
  );
  if (!currentRows.length) throw notFound("项目分组不存在");
  const current = currentRows[0];

  const nextTitle = payload.title === undefined ? current.title : String(payload.title || "").trim();
  const nextSuffix = payload.suffix === undefined ? current.suffix : String(payload.suffix || "").trim();
  const nextStatus = payload.status === undefined ? normalizeGroupStatus(current.status) : normalizeGroupStatus(payload.status);
  const nextSortOrder = payload.sortOrder === undefined && payload.sort_order === undefined
    ? Number(current.sort_order || 0)
    : Number(payload.sortOrder ?? payload.sort_order ?? current.sort_order ?? 0);

  if (!nextTitle) throw badRequest("标题不能为空");

  await mysqlPool.execute(
    `
      UPDATE project_groups
      SET title = ?, suffix = ?, status = ?, sort_order = ?, updated_by = ?
      WHERE group_uid = ?
    `,
    [nextTitle, nextSuffix, nextStatus, nextSortOrder, actor, cleanGroupId]
  );

  return {
    id: cleanGroupId,
    title: nextTitle,
    suffix: nextSuffix,
    status: nextStatus,
    sortOrder: nextSortOrder,
    projects: []
  };
}

export async function deleteProjectGroup(groupId) {
  assertMySQLReady();
  const cleanGroupId = String(groupId || "").trim();
  if (!cleanGroupId) throw badRequest("分组ID不能为空");

  const [result] = await mysqlPool.execute("DELETE FROM project_groups WHERE group_uid = ?", [cleanGroupId]);
  if (!result.affectedRows) throw notFound("项目分组不存在");
  return { ok: true, deletedGroupId: cleanGroupId };
}

export async function listProjects(auth = {}) {
  assertMySQLReady();
  return fetchProjects(auth);
}

export async function createProject(payload = {}, actor = "") {
  assertMySQLReady();
  const name = String(payload.name || "").trim();
  if (!name) throw badRequest("名称不能为空");

  const projectUid = String(payload.projectId || payload.id || "").trim() || makeUid("project");
  const groupUid = String(payload.groupId || "").trim();
  const startDate = normalizeWorkspaceDateForSql(payload.startDate) ?? null;
  const endDate = normalizeWorkspaceDateForSql(payload.endDate) ?? null;
  const status = normalizeProjectStatus(payload.status, payload.archived ? 1 : 0);
  const archived = payload.archived ? 1 : 0;
  const legacyProjectId = Number(payload.id || 0) || null;
  const ownerText = String(payload.owner || "").trim();
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? Date.now());
  const payloadJson = JSON.stringify({
    group: String(payload.group || "").trim(),
    owner: ownerText,
    syncSchedule: payload.syncSchedule !== false
  });

  await mysqlPool.execute(
    `
      INSERT INTO projects (
        project_uid, legacy_project_id, group_uid, name, status, owner_text, start_date, end_date,
        archived, sort_order, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      projectUid,
      legacyProjectId,
      groupUid,
      name,
      status,
      ownerText,
      startDate,
      endDate,
      archived,
      sortOrder,
      payloadJson,
      actor,
      actor
    ]
  );

  await replaceProjectMembers(projectUid, payload.members || [], payload.memberRoles || {}, actor);
  await ensureActorProjectManager(projectUid, actor);
  await replaceProjectTags(projectUid, payload.tags || [], actor);
  if (Array.isArray(payload.tasks)) {
    for (const task of payload.tasks) {
      await createTask(projectUid, task, actor);
    }
  }

  return buildProjectByUid(projectUid);
}

export async function updateProject(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const target = await resolveProjectByAnyId(projectId);
  const mutatesProjectAccess = payload.owner !== undefined || payload.members !== undefined || payload.memberRoles !== undefined;
  await requireProjectPermission(target, auth, mutatesProjectAccess ? "manage" : "edit");
  const projectUid = target.project_uid;
  const previousPayload = parseProjectPayload(target);
  const actor = actorId(auth);

  const name = payload.name === undefined ? target.name : String(payload.name || "").trim();
  if (!name) throw badRequest("名称不能为空");

  const groupUid = payload.groupId === undefined ? (target.group_uid || "") : String(payload.groupId || "").trim();
  const ownerText = payload.owner === undefined ? (target.owner_text || "") : String(payload.owner || "").trim();
  const startDate = payload.startDate === undefined
    ? normalizeWorkspaceDateForSql(target.start_date)
    : normalizeWorkspaceDateForSql(payload.startDate);
  const endDate = payload.endDate === undefined
    ? normalizeWorkspaceDateForSql(target.end_date)
    : normalizeWorkspaceDateForSql(payload.endDate);
  const archived = payload.archived === undefined ? Number(target.archived || 0) : (payload.archived ? 1 : 0);
  const status = payload.status === undefined
    ? normalizeProjectStatus(target.status, archived)
    : normalizeProjectStatus(payload.status, archived);
  const sortOrder = payload.sortOrder === undefined && payload.sort_order === undefined
    ? Number(target.sort_order || 0)
    : Number(payload.sortOrder ?? payload.sort_order ?? target.sort_order ?? 0);
  const legacyProjectId = payload.id === undefined
    ? Number(target.legacy_project_id || 0) || null
    : Number(payload.id || 0) || null;

  const payloadJson = JSON.stringify({
    ...previousPayload,
    group: payload.group === undefined ? previousPayload.group : String(payload.group || "").trim(),
    owner: ownerText,
    syncSchedule: payload.syncSchedule === undefined ? previousPayload.syncSchedule !== false : payload.syncSchedule !== false
  });

  await mysqlPool.execute(
    `
      UPDATE projects
      SET
        legacy_project_id = ?,
        group_uid = ?,
        name = ?,
        status = ?,
        owner_text = ?,
        start_date = ?,
        end_date = ?,
        archived = ?,
        sort_order = ?,
        payload_json = ?,
        updated_by = ?
      WHERE project_uid = ?
    `,
    [
      legacyProjectId,
      groupUid,
      name,
      status,
      ownerText,
      startDate,
      endDate,
      archived,
      sortOrder,
      payloadJson,
      actor,
      projectUid
    ]
  );

  if (payload.members !== undefined || payload.memberRoles !== undefined) {
    await replaceProjectMembers(
      projectUid,
      payload.members !== undefined ? payload.members : [],
      payload.memberRoles !== undefined ? payload.memberRoles : {},
      actor
    );
  }

  if (payload.tags !== undefined) {
    await replaceProjectTags(projectUid, payload.tags || [], actor);
  }

  return buildProjectByUid(projectUid);
}

export async function deleteProject(projectId, actor = "") {
  assertMySQLReady();
  const connection = await mysqlPool.getConnection();
  const auth = canAuthorizeProject(actor) ? actor : {};
  const actorValue = actorId(actor);

  try {
    await connection.beginTransaction();

    const target = await resolveProjectByAnyId(projectId, connection, { forUpdate: true });
    if (!isAdminAuth(auth)) throw forbidden("没有权限访问该项目");
    const projectUid = target.project_uid;

    const [commentRows] = await connection.execute("SELECT comment_uid FROM task_comments WHERE project_uid = ?", [projectUid]);
    if (commentRows.length) {
      const placeholders = commentRows.map(() => "?").join(", ");
      await connection.execute(
        `DELETE FROM comment_mentions WHERE comment_uid IN (${placeholders})`,
        commentRows.map((row) => row.comment_uid)
      );
    }
    const [boardRows] = await connection.execute(
      "SELECT board_uid FROM boards WHERE project_uid = ? OR (scope_type = 'project' AND scope_uid = ?)",
      [projectUid, projectUid]
    );
    const boardUids = boardRows.map((row) => row.board_uid);
    const cleanupStatements = buildDeleteProjectCleanupStatements(projectUid, actorValue, boardUids).slice(1);
    let projectDeleteResult = null;
    for (const statement of cleanupStatements) {
      if (statement.skipWhenNoBoardUids && !boardUids.length) continue;
      const [result] = await connection.execute(statement.sql, statement.params);
      if (statement.resultKey === "projectDelete") projectDeleteResult = result;
    }

    if (!projectDeleteResult?.affectedRows) throw notFound("项目不存在");

    await connection.commit();
    return { ok: true, deletedProjectId: projectUid };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listProjectTasks(projectId, auth = {}) {
  assertMySQLReady();
  const target = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(target, auth, "view");
  const taskRows = await fetchTaskRowsByProject(target.project_uid);
  return mapTaskRowsWithComments(taskRows);
}

export async function createTask(projectId, payload = {}, auth = "") {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  if (canAuthorizeProject(auth)) {
    await requireProjectPermission(project, auth, "edit");
  }
  const actor = actorId(auth);
  const title = String(payload.title || "").trim();
  if (!title) throw badRequest("标题不能为空");

  const taskUid = String(payload.taskId || payload.id || "").trim() || makeUid("task");
  const legacyTaskId = Number(payload.id || 0) || null;
  const taskType = normalizeTaskType(payload.type);
  const moduleKey = normalizeTaskModule(payload.module);
  const ownerText = String(payload.owner || "").trim();
  const ownerUserId = String(payload.ownerUserId || "").trim();
  const status = normalizeTaskStatus(payload.status, payload.archived ? 1 : 0);
  const priority = String(payload.priority || "normal").trim() || "normal";
  const startDate = normalizeWorkspaceDateForSql(payload.startDate) ?? null;
  const endDate = normalizeWorkspaceDateForSql(payload.endDate) ?? null;
  const archived = payload.archived ? 1 : 0;
  const expanded = payload.expanded ? 1 : 0;
  const noteText = String(payload.note || "").trim() || "暂无备注，可点击备注修改。";
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? Date.now());
  const payloadJson = JSON.stringify({
    time: payload.time || nowText(),
    unreadComments: Number(payload.unreadComments || 0),
    scheduleStatus: String(payload.scheduleStatus || "").trim(),
    progress: normalizeTaskProgress(payload.progress, 0),
    attachments: normalizeTaskAttachments(payload.attachments)
  });

  await mysqlPool.execute(
    `
      INSERT INTO tasks (
        task_uid, project_uid, legacy_task_id, title, task_type, module_key, owner_user_uid, owner_text,
        status, priority, start_date, end_date, archived, expanded, sort_order, note_text, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      taskUid,
      project.project_uid,
      legacyTaskId,
      title,
      taskType,
      moduleKey,
      ownerUserId,
      ownerText,
      status,
      priority,
      startDate,
      endDate,
      archived,
      expanded,
      sortOrder,
      noteText,
      payloadJson,
      actor,
      actor
    ]
  );

  await syncScheduleItemsFromTask(taskUid, payload, actor, { createIfMissing: true });
  return buildTaskByUid(taskUid);
}

export async function updateTask(taskId, payload = {}, auth = {}) {
  assertMySQLReady();
  const target = await resolveTaskByAnyId(taskId);
  const project = await resolveProjectByAnyId(target.project_uid);
  await requireProjectPermission(project, auth, "edit");
  const actor = actorId(auth);
  const currentPayload = parseTaskPayload(target);

  const title = payload.title === undefined ? target.title : String(payload.title || "").trim();
  if (!title) throw badRequest("标题不能为空");

  const taskType = payload.type === undefined ? (target.task_type || "流程") : normalizeTaskType(payload.type);
  const moduleKey = payload.module === undefined ? (target.module_key || "project") : normalizeTaskModule(payload.module);
  const ownerText = payload.owner === undefined ? (target.owner_text || "") : String(payload.owner || "").trim();
  const ownerUserId = payload.ownerUserId === undefined ? (target.owner_user_uid || "") : String(payload.ownerUserId || "").trim();
  const archived = resolveTaskArchivedForWrite(target.archived, payload);
  const status = resolveTaskStatusForWrite(target.status, archived, payload);
  const priority = payload.priority === undefined ? (target.priority || "normal") : String(payload.priority || "normal").trim();
  const startDate = payload.startDate === undefined
    ? normalizeWorkspaceDateForSql(target.start_date)
    : normalizeWorkspaceDateForSql(payload.startDate);
  const endDate = payload.endDate === undefined
    ? normalizeWorkspaceDateForSql(target.end_date)
    : normalizeWorkspaceDateForSql(payload.endDate);
  const expanded = payload.expanded === undefined ? Number(target.expanded || 0) : (payload.expanded ? 1 : 0);
  const noteText = payload.note === undefined
    ? (target.note_text || "暂无备注，可点击备注修改。")
    : (String(payload.note || "").trim() || "暂无备注，可点击备注修改。");
  const sortOrder = payload.sortOrder === undefined && payload.sort_order === undefined
    ? Number(target.sort_order || 0)
    : Number(payload.sortOrder ?? payload.sort_order ?? target.sort_order ?? 0);
  const legacyTaskId = payload.id === undefined
    ? Number(target.legacy_task_id || 0) || null
    : Number(payload.id || 0) || null;

  const payloadJson = JSON.stringify({
    ...currentPayload,
    time: payload.time === undefined ? (currentPayload.time || nowText()) : String(payload.time || "").trim(),
    unreadComments: payload.unreadComments === undefined
      ? Number(currentPayload.unreadComments || 0)
      : Number(payload.unreadComments || 0),
    scheduleStatus: payload.scheduleStatus === undefined
      ? String(currentPayload.scheduleStatus || "").trim()
      : String(payload.scheduleStatus || "").trim(),
    progress: payload.progress === undefined
      ? normalizeTaskProgress(currentPayload.progress, 0)
      : normalizeTaskProgress(payload.progress, 0),
    attachments: payload.attachments === undefined
      ? normalizeTaskAttachments(currentPayload.attachments)
      : normalizeTaskAttachments(payload.attachments)
  });

  await mysqlPool.execute(
    `
      UPDATE tasks
      SET
        legacy_task_id = ?,
        title = ?,
        task_type = ?,
        module_key = ?,
        owner_user_uid = ?,
        owner_text = ?,
        status = ?,
        priority = ?,
        start_date = ?,
        end_date = ?,
        archived = ?,
        expanded = ?,
        sort_order = ?,
        note_text = ?,
        payload_json = ?,
        updated_by = ?
      WHERE task_uid = ?
    `,
    [
      legacyTaskId,
      title,
      taskType,
      moduleKey,
      ownerUserId,
      ownerText,
      status,
      priority,
      startDate,
      endDate,
      archived,
      expanded,
      sortOrder,
      noteText,
      payloadJson,
      actor,
      target.task_uid
    ]
  );

  const sync = await syncScheduleItemsFromTask(target.task_uid, payload, actor);
  if (sync.scheduleItemsUpdated === 0) {
    const syncCreate = await syncScheduleItemsFromTask(target.task_uid, payload, actor, { createIfMissing: true });
    sync.scheduleItemsUpdated = Number(syncCreate.scheduleItemsUpdated || 0);
    sync.scheduleItemCreated = Boolean(syncCreate.scheduleItemCreated);
  }
  const task = await buildTaskByUid(target.task_uid);
  return {
    ...task,
    sync,
    syncResult: {
      source: "task",
      taskUpdated: true,
      scheduleItemsUpdated: sync.scheduleItemsUpdated
    }
  };
}

export async function deleteTask(taskId, auth = {}) {
  assertMySQLReady();
  const target = await resolveTaskByAnyId(taskId);
  const project = await resolveProjectByAnyId(target.project_uid);
  await requireProjectPermission(project, auth, "edit");
  const actor = actorId(auth);
  const taskUid = target.task_uid;

  await mysqlPool.execute(
    `
      UPDATE schedule_items
      SET hidden = 1, status = 'deleted', updated_by = ?
      WHERE task_uid = ? AND hidden = 0
    `,
    [actor, taskUid]
  );
  await mysqlPool.execute("DELETE FROM comment_mentions WHERE task_uid = ?", [taskUid]);
  await mysqlPool.execute("DELETE FROM task_comments WHERE task_uid = ?", [taskUid]);
  const [result] = await mysqlPool.execute("DELETE FROM tasks WHERE task_uid = ?", [taskUid]);
  if (!result.affectedRows) throw notFound("任务不存在");
  return { ok: true, deletedTaskId: taskUid };
}

export async function listTaskComments(taskId, auth = {}) {
  assertMySQLReady();
  const target = await resolveTaskByAnyId(taskId);
  const project = await resolveProjectByAnyId(target.project_uid);
  await requireProjectPermission(project, auth, "view");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        comment_uid,
        task_uid,
        project_uid,
        user_uid,
        user_name,
        user_dept,
        tone,
        content_text,
        DATE_FORMAT(commented_at, '%Y/%m/%d %H:%i') AS commented_at_text,
        DATE_FORMAT(created_at, '%Y/%m/%d %H:%i') AS created_at_text
      FROM task_comments
      WHERE task_uid = ?
      ORDER BY id ASC
    `,
    [target.task_uid]
  );
  return mapCommentRowsWithMentions(rows);
}

export async function searchTaskComments(query = {}, auth = {}) {
  assertMySQLReady();
  const keyword = String(query.q || query.keyword || "").trim();
  const projectId = String(query.projectId || query.project_id || "").trim();
  const taskId = String(query.taskId || query.task_id || "").trim();
  const mentionedUser = String(query.mentionedUserId || query.mentionedUsername || "").trim();
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);

  const where = [];
  const params = [];
  const accessWhere = [];
  const accessParams = [];

  if (keyword) {
    where.push("(tc.content_text LIKE ? OR tc.user_name LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (projectId) {
    const project = await resolveProjectByAnyId(projectId);
    await requireProjectPermission(project, auth, "view");
    where.push("tc.project_uid = ?");
    params.push(project.project_uid);
  }
  if (taskId) {
    const task = await resolveTaskByAnyId(taskId);
    const project = await resolveProjectByAnyId(task.project_uid);
    await requireProjectPermission(project, auth, "view");
    where.push("tc.task_uid = ?");
    params.push(task.task_uid);
  }
  if (!projectId && !taskId && !isAdminAuth(auth)) {
    const access = await projectListAccessFilter(auth);
    const accessSql = stripLeadingWhere(access.sql);
    accessWhere.push(`EXISTS (
      SELECT 1 FROM projects p
      WHERE ${accessSql ? `(${accessSql}) AND` : ""} p.project_uid = tc.project_uid
    )`);
    accessParams.push(...access.params);
  }
  if (mentionedUser) {
    where.push(`EXISTS (
      SELECT 1 FROM comment_mentions cm
      WHERE cm.comment_uid = tc.comment_uid
        AND (cm.mentioned_user_uid = ? OR cm.mentioned_username = ?)
    )`);
    params.push(mentionedUser, mentionedUser);
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        tc.comment_uid,
        tc.task_uid,
        tc.project_uid,
        tc.user_uid,
        tc.user_name,
        tc.user_dept,
        tc.tone,
        tc.content_text,
        DATE_FORMAT(tc.commented_at, '%Y/%m/%d %H:%i') AS commented_at_text,
        DATE_FORMAT(tc.created_at, '%Y/%m/%d %H:%i') AS created_at_text,
        t.title AS task_title,
        p.name AS project_name
      FROM task_comments tc
      LEFT JOIN tasks t ON t.task_uid = tc.task_uid
      LEFT JOIN projects p ON p.project_uid = tc.project_uid
      ${where.length || accessWhere.length ? `WHERE ${[...where, ...accessWhere].join(" AND ")}` : ""}
      ORDER BY tc.id DESC
      LIMIT ${limit}
    `,
    [...params, ...accessParams]
  );

  const comments = await mapCommentRowsWithMentions(rows);
  return comments.map((comment, index) => ({
    ...comment,
    taskTitle: rows[index]?.task_title || "",
    projectName: rows[index]?.project_name || ""
  }));
}

export async function addTaskComment(taskId, payload = {}, auth = {}) {
  assertMySQLReady();
  const target = await resolveTaskByAnyId(taskId);
  const project = await resolveProjectByAnyId(target.project_uid);
  await requireProjectPermission(project, auth, "view");
  const text = String(payload.text || "").trim();
  if (!text) throw badRequest("内容不能为空");

  const userName = String(payload.user || auth.name || auth.username || "").trim() || "unknown";
  const userDept = String(payload.dept || "").trim();
  const tone = String(payload.tone || "blue").trim() || "blue";
  const userUid = String(auth.sub || "").trim();
  const commentUid = makeUid("comment");
  const commentedAt = new Date();
  const mentionInputs = Array.isArray(payload.mentions)
    ? payload.mentions
    : Array.isArray(payload.mentionUserIds)
      ? payload.mentionUserIds
      : [];

  await mysqlPool.execute(
    `
      INSERT INTO task_comments (
        comment_uid, task_uid, project_uid, user_uid, user_name, user_dept,
        tone, content_text, commented_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [commentUid, target.task_uid, target.project_uid, userUid, userName, userDept, tone, text, commentedAt]
  );

  await createTaskCommentNotificationEvents({
    commentUid,
    task: target,
    project,
    text,
    mentionInputs,
    auth: { ...auth, sub: userUid, name: userName }
  });

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        comment_uid,
        user_name,
        user_dept,
        tone,
        content_text,
        DATE_FORMAT(commented_at, '%Y/%m/%d %H:%i') AS commented_at_text,
        DATE_FORMAT(created_at, '%Y/%m/%d %H:%i') AS created_at_text
      FROM task_comments
      WHERE comment_uid = ?
      LIMIT 1
    `,
    [commentUid]
  );

  if (rows.length) {
    const comments = await mapCommentRowsWithMentions(rows);
    return comments[0];
  }

  return {
    id: commentUid,
    commentId: commentUid,
    taskId: target.task_uid,
    projectId: target.project_uid,
    user: userName,
    userId: userUid,
    dept: userDept,
    tone,
    time: nowText(commentedAt),
    text,
    mentions: []
  };
}

export async function listAddressBook(query = {}) {
  assertMySQLReady();
  const keyword = String(query.q || query.keyword || "").trim();
  const departmentId = String(query.departmentId || query.department_id || query.department || "").trim();
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 200);
  const where = ["ab.status = 'active'"];
  const params = [];

  if (keyword) {
    where.push("(ab.display_name LIKE ? OR ab.username LIKE ? OR ab.department_name LIKE ? OR u.name LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (departmentId) {
    const aliases = resolveDepartmentFilterValues(departmentId);
    const placeholders = aliases.map(() => "?").join(", ");
    where.push(`(ab.department_uid = ? OR ab.department_name IN (${placeholders}) OR u.department IN (${placeholders}))`);
    params.push(departmentId, ...aliases, ...aliases);
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        ab.contact_uid,
        ab.user_uid,
        ab.username,
        ab.display_name,
        ab.department_uid,
        ab.department_name,
        ab.job,
        ab.phone,
        ab.email,
        ab.status,
        u.name,
        u.department
      FROM address_book ab
      LEFT JOIN users u ON u.user_uid = ab.user_uid
      WHERE ${where.join(" AND ")}
      ORDER BY ab.sort_order ASC, ab.id ASC
      LIMIT ${limit}
    `,
    params
  );

  return rows.map(mapAddressBookEntry);
}

export async function listDepartments() {
  assertMySQLReady();
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        department_uid,
        name,
        name_en,
        parent_department_uid,
        manager_user_uid,
        status,
        sort_order
      FROM departments
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `
  );
  const mapped = rows.map(mapDepartment);
  const pickedByRoot = new Map();
  const uncategorized = [];

  for (const item of mapped) {
    if (!item.departmentKey) {
      uncategorized.push(item);
      continue;
    }
    const existing = pickedByRoot.get(item.departmentKey);
    if (!existing) {
      pickedByRoot.set(item.departmentKey, item);
      continue;
    }
    const existingIsRootName = String(existing.name || "").trim() === String(existing.displayDepartment || "").trim();
    const currentIsRootName = String(item.name || "").trim() === String(item.displayDepartment || "").trim();
    if (!existingIsRootName && currentIsRootName) {
      pickedByRoot.set(item.departmentKey, item);
      continue;
    }
    if (Number(item.sortOrder || Number.MAX_SAFE_INTEGER) < Number(existing.sortOrder || Number.MAX_SAFE_INTEGER)) {
      pickedByRoot.set(item.departmentKey, item);
    }
  }

  const canonical = [...pickedByRoot.values()].sort(
    (a, b) =>
      Number(a.taxonomyOrder ?? Number.MAX_SAFE_INTEGER) - Number(b.taxonomyOrder ?? Number.MAX_SAFE_INTEGER) ||
      Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
  );
  const rest = uncategorized.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

  return [...canonical, ...rest].map((item) => {
    const { taxonomyOrder, ...data } = item;
    return data;
  });
}

export async function listContacts(auth = {}, query = {}) {
  assertMySQLReady();
  const ownerUserUid = String(query.ownerUserId || auth.sub || "").trim();
  const relationType = String(query.relationType || query.relation_type || "").trim().toLowerCase();
  const keyword = String(query.q || query.keyword || query.search || "").trim();
  const departmentId = String(query.departmentId || query.department_id || query.department || "").trim();
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 200);
  const offset = Math.max(Number(query.offset || 0), 0);
  const params = [];
  const where = ["c.status = 'active'"];
  if (ownerUserUid) {
    where.push("c.owner_user_uid = ?");
    params.push(ownerUserUid);
  }
  if (relationType) {
    where.push("LOWER(c.relation_type) = ?");
    params.push(relationType);
  }
  if (departmentId) {
    const aliases = resolveDepartmentFilterValues(departmentId);
    const placeholders = aliases.map(() => "?").join(", ");
    where.push(`(ab.department_uid = ? OR ab.department_name IN (${placeholders}) OR u.department IN (${placeholders}))`);
    params.push(departmentId, ...aliases, ...aliases);
  }
  if (keyword) {
    where.push(`(
      c.display_name LIKE ? OR
      u.name LIKE ? OR
      u.username LIKE ? OR
      ab.department_name LIKE ? OR
      u.department LIKE ? OR
      ab.job LIKE ? OR
      u.job LIKE ? OR
      ab.phone LIKE ? OR
      u.phone LIKE ? OR
      ab.email LIKE ? OR
      u.email LIKE ?
    )`);
    const wildcard = `%${keyword}%`;
    params.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        c.contact_uid,
        c.target_user_uid AS user_uid,
        c.relation_type,
        c.owner_user_uid,
        u.username,
        u.role,
        u.department_en,
        COALESCE(NULLIF(c.display_name, ''), u.name) AS display_name,
        ab.department_uid,
        COALESCE(NULLIF(ab.department_name, ''), u.department) AS department_name,
        COALESCE(NULLIF(ab.job, ''), u.job) AS job,
        COALESCE(NULLIF(ab.phone, ''), u.phone) AS phone,
        COALESCE(NULLIF(ab.email, ''), u.email) AS email,
        c.status
      FROM contacts c
      LEFT JOIN users u ON u.user_uid = c.target_user_uid
      LEFT JOIN address_book ab ON ab.user_uid = c.target_user_uid
      WHERE ${where.join(" AND ")}
      ORDER BY department_name ASC, display_name ASC, c.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  return rows.map(mapAddressBookEntry);
}

export async function addContact(auth = {}, payload = {}) {
  assertMySQLReady();
  const ownerUserUid = actorId(auth);
  const targetValue = String(payload.targetUserId || payload.targetUserUid || payload.userId || payload.username || "").trim();
  const relationType = String(payload.relationType || "care").trim().toLowerCase() || "care";
  const displayName = String(payload.displayName || "").trim().slice(0, 128);

  if (!ownerUserUid) throw forbidden("请先登录");
  if (!targetValue) throw badRequest("目标用户不能为空");

  const targetUser = await resolveUserByAnyId(targetValue);
  if (targetUser.user_uid === ownerUserUid) throw badRequest("不能添加自己为联系人");

  await mysqlPool.execute(
    `
      INSERT INTO contacts (
        contact_uid, owner_user_uid, target_user_uid, display_name, relation_type, status, payload_json
      ) VALUES (?, ?, ?, ?, ?, 'active', NULL)
      ON DUPLICATE KEY UPDATE
        display_name = VALUES(display_name),
        relation_type = VALUES(relation_type),
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
    `,
    [makeUid("contact"), ownerUserUid, targetUser.user_uid, displayName || targetUser.name || "", relationType]
  );

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        c.contact_uid,
        c.target_user_uid AS user_uid,
        c.relation_type,
        u.username,
        COALESCE(NULLIF(c.display_name, ''), u.name) AS display_name,
        ab.department_uid,
        COALESCE(NULLIF(ab.department_name, ''), u.department) AS department_name,
        COALESCE(NULLIF(ab.job, ''), u.job) AS job,
        COALESCE(NULLIF(ab.phone, ''), u.phone) AS phone,
        COALESCE(NULLIF(ab.email, ''), u.email) AS email,
        c.status
      FROM contacts c
      LEFT JOIN users u ON u.user_uid = c.target_user_uid
      LEFT JOIN address_book ab ON ab.user_uid = c.target_user_uid
      WHERE c.owner_user_uid = ? AND c.target_user_uid = ? AND c.status = 'active'
      ORDER BY c.id DESC
      LIMIT 1
    `,
    [ownerUserUid, targetUser.user_uid]
  );

  return mapAddressBookEntry(rows[0] || {});
}

export async function getContact(auth = {}, value = "", query = {}) {
  assertMySQLReady();
  const ownerUserUid = String(query.ownerUserId || auth.sub || "").trim();
  const contactValue = String(value || "").trim();
  if (!ownerUserUid) throw forbidden("请先登录");
  if (!contactValue) throw badRequest("联系人ID不能为空");

  let targetUserUid = contactValue;
  try {
    const targetUser = await resolveUserByAnyId(contactValue);
    targetUserUid = targetUser.user_uid;
  } catch {
    targetUserUid = contactValue;
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        c.contact_uid,
        c.owner_user_uid,
        c.target_user_uid AS user_uid,
        c.relation_type,
        c.status,
        u.username,
        u.role,
        u.name,
        u.department,
        u.department_en,
        u.job,
        u.mbti,
        u.mood,
        u.signature,
        u.profile_note,
        u.character_label,
        u.avatar_image,
        u.character_image,
        u.signature_image,
        COALESCE(NULLIF(c.display_name, ''), u.name) AS display_name,
        ab.department_uid,
        COALESCE(NULLIF(ab.department_name, ''), u.department) AS department_name,
        COALESCE(NULLIF(ab.job, ''), u.job) AS job,
        COALESCE(NULLIF(ab.phone, ''), u.phone) AS phone,
        COALESCE(NULLIF(ab.email, ''), u.email) AS email
      FROM contacts c
      LEFT JOIN users u ON u.user_uid = c.target_user_uid
      LEFT JOIN address_book ab ON ab.user_uid = c.target_user_uid
      WHERE c.owner_user_uid = ?
        AND c.status = 'active'
        AND (c.contact_uid = ? OR c.target_user_uid = ? OR u.username = ?)
      ORDER BY c.id DESC
      LIMIT 1
    `,
    [ownerUserUid, contactValue, targetUserUid, contactValue]
  );

  if (!rows.length) throw notFound("联系人不存在");
  return mapContactProfile(rows[0]);
}

export async function removeContact(auth = {}, value = "") {
  assertMySQLReady();
  const ownerUserUid = actorId(auth);
  const contactValue = String(value || "").trim();
  if (!ownerUserUid) throw forbidden("请先登录");
  if (!contactValue) throw badRequest("联系人ID不能为空");

  let targetUserUid = contactValue;
  try {
    const targetUser = await resolveUserByAnyId(contactValue);
    targetUserUid = targetUser.user_uid;
  } catch {
    targetUserUid = contactValue;
  }

  await mysqlPool.execute(
    `
      UPDATE contacts
      SET status = 'archived', updated_at = CURRENT_TIMESTAMP
      WHERE owner_user_uid = ? AND (target_user_uid = ? OR contact_uid = ?) AND status = 'active'
    `,
    [ownerUserUid, targetUserUid, contactValue]
  );
  return { success: true };
}

export async function listProjectMembers(projectId, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "view");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        pm.member_uid,
        pm.project_uid,
        pm.user_uid,
        pm.member_name,
        pm.member_role,
        pm.department,
        pm.department_en,
        pm.status,
        pm.sort_order,
        u.username,
        u.name,
        ab.display_name,
        ab.department_name
      FROM project_members pm
      LEFT JOIN users u ON u.user_uid = pm.user_uid
      LEFT JOIN address_book ab ON ab.user_uid = pm.user_uid
      WHERE pm.project_uid = ? AND pm.status = 'active'
      ORDER BY pm.sort_order ASC, pm.id ASC
    `,
    [project.project_uid]
  );
  return rows.map(mapProjectMember);
}

async function resolveMemberTarget(entry = {}) {
  const identity = String(entry.identity || "").trim();
  if (!identity) throw badRequest("成员标识不能为空");

  try {
    const user = await resolveUserByAnyId(identity);
    return {
      user_uid: user.user_uid,
      username: user.username || "",
      name: user.name || user.username || identity,
      department: user.department || "",
      department_en: user.department_en || "",
      foundUser: true
    };
  } catch (error) {
    if (entry.strictResolve) throw error;
    return {
      user_uid: "",
      username: "",
      name: String(entry.memberName || identity).trim() || identity,
      department: "",
      department_en: "",
      foundUser: false
    };
  }
}

async function upsertProjectMemberByEntry(projectUid, entry, actor = "", index = Date.now()) {
  const target = await resolveMemberTarget(entry);
  const memberName = String(target.name || entry.memberName || entry.identity || "").trim();
  if (!memberName) throw badRequest("成员名称不能为空");
  const memberRole = normalizeProjectMemberRole(entry.role);
  const memberUid = makeUid("member");
  const userUid = String(target.user_uid || "").trim();
  const [result] = await mysqlPool.execute(
    `
      INSERT INTO project_members (
        member_uid, project_uid, user_uid, member_name, member_role,
        department, department_en, status, sort_order, joined_at, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NULL, ?, ?)
      ON DUPLICATE KEY UPDATE
        member_name = VALUES(member_name),
        member_role = VALUES(member_role),
        department = VALUES(department),
        department_en = VALUES(department_en),
        status = 'active',
        updated_by = VALUES(updated_by),
        sort_order = VALUES(sort_order)
    `,
    [
      memberUid,
      projectUid,
      userUid,
      memberName,
      memberRole,
      target.department,
      target.department_en,
      index,
      actor,
      actor
    ]
  );

  return {
    memberUid,
    role: memberRole,
    matchedUser: target.foundUser,
    inserted: Boolean(result.insertId),
    memberName
  };
}

export async function addProjectMembers(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "manage");

  const actor = actorId(auth);
  const entries = collectMemberEntries(payload, payload.role || payload.memberRole || "readonly");
  if (!entries.length) throw badRequest("请至少提供一个成员");

  const applied = [];
  for (let index = 0; index < entries.length; index += 1) {
    const result = await upsertProjectMemberByEntry(project.project_uid, entries[index], actor, Date.now() + index);
    applied.push(result);
  }

  const items = await listProjectMembers(project.project_uid, auth);
  return {
    ok: true,
    summary: {
      requested: entries.length,
      applied: applied.length
    },
    members: items,
    items
  };
}

export async function removeProjectMembers(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "manage");

  const entries = collectMemberEntries(payload);
  if (!entries.length) throw badRequest("请至少提供一个成员");

  let affected = 0;
  for (const entry of entries) {
    const target = await resolveMemberTarget(entry);
    const memberName = String(target.name || entry.memberName || entry.identity || "").trim();
    if (!memberName && !target.user_uid) continue;
    const [result] = await mysqlPool.execute(
      `
        UPDATE project_members
        SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE project_uid = ?
          AND status = 'active'
          AND (
            (? <> '' AND user_uid = ?)
            OR member_name = ?
          )
      `,
      [project.project_uid, target.user_uid, target.user_uid, memberName]
    );
    affected += Number(result.affectedRows || 0);
  }

  const items = await listProjectMembers(project.project_uid, auth);
  return {
    ok: true,
    summary: {
      requested: entries.length,
      affected
    },
    members: items,
    items
  };
}

export async function setProjectMemberGroups(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "manage");

  const actor = actorId(auth);
  const entries = collectGroupedMemberEntries(payload);
  if (!entries.length) throw badRequest("请至少提供一个权限分组成员");

  await mysqlPool.execute(
    `
      UPDATE project_members
      SET status = 'archived', updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_uid = ? AND status = 'active'
    `,
    [actor, project.project_uid]
  );

  for (let index = 0; index < entries.length; index += 1) {
    await upsertProjectMemberByEntry(project.project_uid, entries[index], actor, index);
  }

  await ensureActorProjectManager(project.project_uid, actor);
  const items = await listProjectMembers(project.project_uid, auth);
  return {
    ok: true,
    summary: {
      applied: entries.length
    },
    members: items,
    items
  };
}

export async function shareProject(projectId, payload = {}, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "manage");
  const targetValue = String(payload.toUserId || payload.toUserUid || payload.username || payload.toUsername || "").trim();
  if (!targetValue) throw badRequest("接收用户不能为空");

  const targetUser = await resolveUserByAnyId(targetValue);
  const fromUserUid = String(payload.fromUserId || auth.sub || "").trim();
  const permission = ["read", "write"].includes(String(payload.permission || payload.role || "read").trim())
    ? String(payload.permission || payload.role || "read").trim()
    : "read";
  const memberRole = normalizeProjectMemberRole(payload.memberRole || payload.role || (permission === "write" ? "editor" : "readonly"));
  const expiresAt = payload.expiresAt ? String(payload.expiresAt).replaceAll("/", "-").slice(0, 10) : null;
  const shareUid = makeUid("share");

  await mysqlPool.execute(
    `
      UPDATE shares
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE resource_type = 'project'
        AND resource_uid = ?
        AND to_user_uid = ?
        AND status = 'active'
    `,
    [project.project_uid, targetUser.user_uid]
  );

  await mysqlPool.execute(
    `
      INSERT INTO shares (
        share_uid, resource_type, resource_uid, from_user_uid, to_user_uid,
        permission, status, shared_at, expires_at, payload_json
      )
      VALUES (?, 'project', ?, ?, ?, ?, 'active', NOW(), ?, ?)
    `,
    [
      shareUid,
      project.project_uid,
      fromUserUid,
      targetUser.user_uid,
      permission,
      expiresAt,
      JSON.stringify({ memberRole, note: String(payload.note || "").trim() })
    ]
  );

  await upsertProjectMemberFromUser(project.project_uid, targetUser, memberRole, fromUserUid);

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        s.share_uid,
        s.resource_type,
        s.resource_uid,
        s.from_user_uid,
        s.to_user_uid,
        s.permission,
        s.status,
        DATE_FORMAT(s.shared_at, '%Y/%m/%d %H:%i') AS shared_at_text,
        DATE_FORMAT(s.expires_at, '%Y/%m/%d') AS expires_at_text,
        u.username AS to_username,
        u.name AS to_name
      FROM shares s
      LEFT JOIN users u ON u.user_uid = s.to_user_uid
      WHERE s.share_uid = ?
      LIMIT 1
    `,
    [shareUid]
  );

  return rows.length ? mapShare(rows[0]) : {
    id: shareUid,
    shareId: shareUid,
    resourceType: "project",
    resourceId: project.project_uid,
    fromUserId: fromUserUid,
    toUserId: targetUser.user_uid,
    toUsername: targetUser.username,
    toName: targetUser.name,
    permission,
    status: "active",
    sharedAt: nowText(),
    expiresAt: ""
  };
}

export async function listProjectShares(projectId, auth = {}) {
  assertMySQLReady();
  const project = await resolveProjectByAnyId(projectId);
  await requireProjectPermission(project, auth, "manage");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        s.share_uid,
        s.resource_type,
        s.resource_uid,
        s.from_user_uid,
        s.to_user_uid,
        s.permission,
        s.status,
        DATE_FORMAT(s.shared_at, '%Y/%m/%d %H:%i') AS shared_at_text,
        DATE_FORMAT(s.expires_at, '%Y/%m/%d') AS expires_at_text,
        u.username AS to_username,
        u.name AS to_name
      FROM shares s
      LEFT JOIN users u ON u.user_uid = s.to_user_uid
      WHERE s.resource_type = 'project' AND s.resource_uid = ? AND s.status = 'active'
      ORDER BY s.id ASC
    `,
    [project.project_uid]
  );
  return rows.map(mapShare);
}

export async function listTags() {
  assertMySQLReady();
  return fetchTags();
}

export async function createTag(payload = {}, actor = "") {
  assertMySQLReady();
  const name = String(payload.name || "").trim();
  if (!name) throw badRequest("名称不能为空");

  const color = String(payload.color || "blue").trim() || "blue";
  const scope = String(payload.scope || "workspace").trim() || "workspace";
  const status = String(payload.status || "active").trim() || "active";
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? Date.now());
  const tagUid = String(payload.tagId || payload.id || "").trim() || makeUid("tag");

  await mysqlPool.execute(
    `
      INSERT INTO tags (tag_uid, name, color, scope, status, sort_order, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [tagUid, name, color, scope, status, sortOrder, actor, actor]
  );

  return { id: tagUid, tagId: tagUid, name, color, scope, status, sortOrder };
}

export async function deleteTag(name) {
  assertMySQLReady();
  const cleanName = String(name || "").trim();
  if (!cleanName) throw badRequest("标签名称不能为空");

  await mysqlPool.execute("DELETE FROM project_tags WHERE tag_name = ? OR tag_uid = ?", [cleanName, cleanName]);
  const [result] = await mysqlPool.execute("DELETE FROM tags WHERE name = ? OR tag_uid = ?", [cleanName, cleanName]);
  if (!result.affectedRows) throw notFound("标签不存在");
  return { ok: true, deletedTagName: cleanName, deletedTagId: cleanName };
}

export async function listTemplatesPlaceholder() {
  assertMySQLReady();
  return {
    message: "模板模块化接口暂未开放，敬请期待下一阶段。",
    items: []
  };
}

export const __private__ = {
  buildDeleteProjectCleanupStatements,
  normalizeWorkspaceDateForSql,
  resolveTaskArchivedForWrite,
  resolveTaskScheduleSyncStatus,
  resolveTaskStatusForWrite
};
