import { randomBytes } from "node:crypto";
import { hashPassword } from "../../utils/password.js";
import { isMySQLReady, mysqlPool } from "../../db/mysql.js";
import {
  createProject,
  createTag,
  createTask,
  deleteProject,
  deleteTag,
  deleteTask,
  updateProject,
  updateTask
} from "../../services/workspace.service.js";
import { deleteBoard, updateBoard } from "../../services/board.service.js";
import { normalizeRole } from "../../middlewares/auth.js";

const MYSQL_UNAVAILABLE_MESSAGE = "管理员接口暂时不可用（MySQL 未就绪）";
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

const DEFAULT_ROLES = [
  ["admin", "超级管理员", "拥有后台全部管理权限。"],
  ["manager", "业务管理员", "拥有部门或项目管理权限。"],
  ["employee", "成员", "默认以只读为主的工作台成员。"]
];

const DEFAULT_PERMISSIONS = [
  ["admin.dashboard.read", "仪表盘查看", "查看管理后台统计数据。"],
  ["admin.users.read", "用户查看", "查看用户与账号状态。"],
  ["admin.users.write", "用户编辑", "创建和更新用户。"],
  ["admin.users.delete", "用户删除", "归档或删除用户。"],
  ["admin.permissions.read", "权限查看", "查看角色与权限矩阵。"],
  ["admin.permissions.write", "权限编辑", "更新角色权限分配。"],
  ["admin.system.read", "系统查看", "查看系统状态与配置。"],
  ["admin.system.write", "系统编辑", "更新安全的系统配置项。"],
  ["admin.audit.read", "审计查看", "查看操作审计日志。"],
  ["admin.workspace.write", "工作台编辑", "创建和更新工作台记录。"],
  ["admin.workspace.delete", "工作台删除", "归档或删除工作台记录。"]
];

const DEFAULT_ROLE_PERMISSIONS = {
  admin: DEFAULT_PERMISSIONS.map(([permissionKey]) => permissionKey),
  manager: [
    "admin.dashboard.read",
    "admin.users.read",
    "admin.permissions.read",
    "admin.system.read",
    "admin.audit.read",
    "admin.workspace.write"
  ],
  employee: []
};

const DEFAULT_SYSTEM_CONFIG = {
  siteName: "MIX 协作台",
  maintenanceMode: false,
  registrationEnabled: true,
  auditRetentionDays: 90
};

const EDITABLE_CONFIG_KEYS = new Set(Object.keys(DEFAULT_SYSTEM_CONFIG));
const RISK_WORDS = ["风险", "返工", "延期", "逾期", "版权", "错误", "不确定", "blocked", "risk"];

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

function actorId(auth = {}) {
  return String(auth.sub || auth.id || auth.userId || auth.username || "").trim();
}

function trimText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateTimeSlash(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return [
      `${value.getFullYear()}/${pad2(value.getMonth() + 1)}/${pad2(value.getDate())}`,
      `${pad2(value.getHours())}:${pad2(value.getMinutes())}`
    ].join(" ");
  }
  return String(value).replaceAll("-", "/").slice(0, 16);
}

function toSqlDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.replaceAll("/", "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw badRequest("date must use YYYY-MM-DD format");
  }
  return normalized;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function makeUid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateTemporaryPassword() {
  return `Tmp-${randomBytes(9).toString("base64url")}`;
}

function normalizePositiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeInteger(value, fallback = 0, min = -1_000_000, max = 1_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function searchLike(keyword) {
  return `%${String(keyword || "").trim()}%`;
}

function buildLimitOffsetClause(pagination) {
  return ` LIMIT ${Number(pagination.pageSize)} OFFSET ${Number(pagination.offset)}`;
}

export function normalizePagination(query = {}) {
  const page = normalizePositiveInt(query.page, 1, 1, 1_000_000);
  const pageSize = normalizePositiveInt(query.pageSize || query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

export function normalizeAuditQuery(query = {}) {
  const pagination = normalizePagination(query);
  const from = query.from || query.startDate ? toSqlDate(query.from || query.startDate) : "";
  const to = query.to || query.endDate ? toSqlDate(query.to || query.endDate) : "";
  if (from && to && to < from) {
    throw badRequest("to cannot be earlier than from");
  }
  return {
    ...pagination,
    actorId: trimText(query.actorId || query.actor || query.userId),
    action: trimText(query.action),
    resourceType: trimText(query.resourceType || query.resource),
    from,
    to,
    keyword: trimText(query.keyword || query.q)
  };
}

export function normalizeSystemConfigPayload(payload = {}) {
  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(payload, "siteName")) {
    const siteName = trimText(payload.siteName);
    if (!siteName) throw badRequest("siteName cannot be empty");
    normalized.siteName = siteName.slice(0, 120);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "maintenanceMode")) {
    normalized.maintenanceMode = normalizeBoolean(payload.maintenanceMode, false);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "registrationEnabled")) {
    normalized.registrationEnabled = normalizeBoolean(payload.registrationEnabled, true);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "auditRetentionDays")) {
    normalized.auditRetentionDays = normalizePositiveInt(payload.auditRetentionDays, DEFAULT_SYSTEM_CONFIG.auditRetentionDays, 7, 3650);
  }

  for (const key of Object.keys(normalized)) {
    if (!EDITABLE_CONFIG_KEYS.has(key)) {
      delete normalized[key];
    }
  }

  if (!Object.keys(normalized).length) {
    throw badRequest("No editable config fields");
  }
  return normalized;
}

function normalizeUserPayload(payload = {}, options = {}) {
  const isCreate = options.mode === "create";
  const username = trimText(payload.username);
  const name = trimText(payload.name || payload.displayName);
  if (isCreate && !username) throw badRequest("username is required");
  if (isCreate && !name) throw badRequest("name is required");

  const role = normalizeAdminAssignableRole(payload.role || (isCreate ? "employee" : undefined));
  const explicitPassword = trimText(payload.password || payload.initialPassword);
  const password = explicitPassword || (isCreate ? generateTemporaryPassword() : "");
  const generatedPassword = Boolean(isCreate && !explicitPassword);
  if (isCreate && !password) throw badRequest("password is required");
  if (password && password.length < 6) throw badRequest("password must be at least 6 characters");

  return {
    username,
    name,
    role,
    status: normalizeStatus(payload.status, "active"),
    phone: trimText(payload.phone).slice(0, 32),
    email: trimText(payload.email).slice(0, 128),
    department: trimText(payload.department, "项目管理部").slice(0, 64),
    departmentEn: trimText(payload.departmentEn || payload.department_en || payload.department, "PROJECT MANAGEMENT").slice(0, 128),
    job: trimText(payload.job || payload.position, "成员").slice(0, 64),
    mbti: trimText(payload.mbti, "ENTP").toUpperCase().slice(0, 16),
    profileNote: trimText(payload.profileNote || payload.profile_note).slice(0, 255),
    characterLabel: trimText(payload.characterLabel || payload.character_label || payload.job || "成员").slice(0, 64),
    password,
    generatedPassword,
    mustChangePassword: generatedPassword || normalizeBoolean(payload.mustChangePassword || payload.must_change_password, false)
  };
}

function normalizeAdminAssignableRole(value) {
  if (value === undefined) return undefined;
  const role = trimText(value, "employee").toLowerCase();
  const frontendSafeAliases = {
    super_admin: "admin",
    user: "employee",
    editor: "employee",
    readonly: "employee",
    department_admin: "manager",
    department_manager: "manager",
    project_manager: "manager"
  };
  const normalizedRole = frontendSafeAliases[role] || role;
  if (["admin", "manager", "employee"].includes(normalizedRole)) return normalizedRole;
  throw badRequest("角色不合法");
}

function adminWorkspaceAuth(auth = {}) {
  return {
    ...auth,
    sub: actorId(auth),
    role: "admin"
  };
}

function normalizeStatus(value, fallback = "active") {
  const status = trimText(value, fallback).toLowerCase();
  if (["active", "archived", "disabled", "pending", "healthy"].includes(status)) {
    return status === "healthy" ? "active" : status;
  }
  return status || fallback;
}

function assertAdminAccess(auth = {}) {
  if (normalizeRole(auth) !== "admin") {
    throw forbidden("需要管理员权限");
  }
  return { role: "admin" };
}

export function mapAdminUserRow(row = {}) {
  return {
    id: row.user_uid || String(row.id || ""),
    numericId: Number(row.id || 0),
    username: row.username || "",
    name: row.name || "",
    role: row.role || "employee",
    status: row.status || "active",
    phone: row.phone || "",
    email: row.email || "",
    department: row.department || "",
    departmentEn: row.department_en || "",
    job: row.job || "",
    mbti: row.mbti || "",
    profileNote: row.profile_note || "",
    characterLabel: row.character_label || "",
    registeredAt: toDateTimeSlash(row.registered_at || row.created_at),
    lastLoginAt: toDateTimeSlash(row.last_login_at_text || row.last_login_at),
    projectCount: Number(row.project_count || 0)
  };
}

function mapProjectRow(row = {}) {
  const payload = parseJson(row.payload_json, {});
  return {
    id: row.project_uid || String(row.id || ""),
    numericId: Number(row.id || 0),
    legacyProjectId: row.legacy_project_id === null || row.legacy_project_id === undefined ? null : Number(row.legacy_project_id),
    name: row.name || "",
    groupId: row.group_uid || "",
    group: payload.group || row.group_title || "",
    owner: row.owner_text || payload.owner || "",
    status: Number(row.archived || 0) === 1 ? "archived" : row.status || "active",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    taskCount: Number(row.task_count || 0),
    doneCount: Number(row.done_count || 0),
    memberCount: Number(row.member_count || 0),
    tags: row.tags ? String(row.tags).split(",").filter(Boolean) : [],
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at),
    createdAt: toDateTimeSlash(row.created_at_text || row.created_at)
  };
}

function mapTaskRow(row = {}) {
  return {
    id: row.task_uid || String(row.id || ""),
    taskId: row.task_uid || "",
    projectId: row.project_uid || "",
    projectName: row.project_name || "",
    title: row.title || "",
    type: row.task_type || "",
    module: row.module_key || "",
    owner: row.owner_text || "",
    status: Number(row.archived || 0) === 1 ? "archived" : row.status || "todo",
    priority: row.priority || "normal",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    note: row.note_text || "",
    commentCount: Number(row.comment_count || 0),
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at)
  };
}

function mapRiskCommentRow(row = {}) {
  return {
    id: row.comment_uid || String(row.id || ""),
    commentId: row.comment_uid || "",
    projectId: row.project_uid || "",
    projectName: row.project_name || "",
    taskId: row.task_uid || row.item_uid || "",
    taskTitle: row.task_title || row.item_title || "",
    user: row.user_name || "",
    userId: row.user_uid || "",
    dept: row.user_dept || "",
    text: row.content_text || "",
    tone: row.tone || "",
    time: toDateTimeSlash(row.commented_at_text || row.created_at),
    isRisk: true,
    matchedRiskWords: riskWordsIn(row.content_text || "")
  };
}

function mapScheduleRow(row = {}) {
  return {
    id: row.plan_uid || row.project_uid || String(row.id || ""),
    planId: row.plan_uid || "",
    projectId: row.project_uid || "",
    projectName: row.project_name || "",
    title: row.title || "项目排期",
    status: row.status || "active",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    itemCount: Number(row.item_count || 0),
    overdue: Number(row.overdue || 0),
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at)
  };
}

function mapBoardRow(row = {}) {
  return {
    id: row.board_uid || String(row.id || ""),
    title: row.title || "",
    projectId: row.project_uid || "",
    projectName: row.project_name || "",
    ownerId: row.owner_user_uid || "",
    status: Number(row.is_archived || 0) === 1 ? "archived" : "healthy",
    shareCount: Number(row.share_count || 0),
    latestVersion: Number(row.latest_version || 0),
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at)
  };
}

function mapTemplateRow(row = {}) {
  return {
    id: row.template_uid || String(row.id || ""),
    title: row.title || "",
    group: row.group_key || "",
    visibility: row.visibility || "private",
    taskCount: Number(row.task_count || row.item_count || 0),
    status: row.status || "healthy",
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at)
  };
}

function mapTagRow(row = {}) {
  return {
    id: row.tag_uid || row.name || String(row.id || ""),
    name: row.name || "",
    color: row.color || "",
    scope: row.scope || "workspace",
    status: row.status || "active",
    count: Number(row.project_count || 0),
    sortOrder: Number(row.sort_order || 0)
  };
}

function mapNoticeRow(row = {}) {
  const payload = parseJson(row.payload_json, {});
  const enabled = Number(row.enabled || 0) === 1;
  const status = normalizeNoticeStatus(row.status, enabled ? "active" : "disabled");
  const content = stripDangerousScripts(row.content_text || "");
  return {
    id: row.notice_uid || String(row.id || ""),
    noticeId: row.notice_uid || String(row.id || ""),
    title: stripDangerousScripts(row.title || ""),
    content,
    text: content,
    type: row.notice_type || "",
    enabled,
    status,
    priority: Number(row.priority ?? payload.priority ?? 0),
    interval: Number(payload.interval || 5500),
    linkText: stripDangerousScripts(row.link_text ?? payload.linkText ?? ""),
    linkUrl: safeNoticeLinkUrl(row.link_url ?? payload.linkUrl ?? ""),
    linkTarget: normalizeNoticeLinkTarget(row.link_target ?? payload.linkTarget ?? "_self"),
    startAt: toDateTimeSlash(row.start_at),
    endAt: toDateTimeSlash(row.end_at),
    sortOrder: Number(row.sort_order || 0),
    updatedAt: toDateTimeSlash(row.updated_at_text || row.updated_at)
  };
}

function normalizeNoticeLookupId(value) {
  const clean = trimText(value);
  if (!clean) return { clause: "notice_uid = ?", params: [""] };
  if (/^\d+$/.test(clean)) {
    return { clause: "(notice_uid = ? OR id = ?)", params: [clean, Number(clean)] };
  }
  return { clause: "notice_uid = ?", params: [clean] };
}

async function getNoticeRowByUid(noticeId) {
  const lookup = normalizeNoticeLookupId(noticeId);
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        id, notice_uid, title, content_text, notice_type, enabled, status, priority,
        link_text, link_url, link_target, start_at, end_at,
        sort_order, payload_json, created_by, updated_by, updated_at,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM carousel_notices
      WHERE ${lookup.clause}
      LIMIT 1
    `,
    lookup.params
  );
  return rows[0] || null;
}

async function createUniqueNoticeUid() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const noticeUid = makeUid("notice");
    if (!(await getNoticeRowByUid(noticeUid))) return noticeUid;
  }
  throw conflict("noticeId collision");
}

function mapDepartmentAdminRow(row = {}) {
  return {
    id: row.department_uid || row.name || String(row.id || ""),
    departmentId: row.department_uid || "",
    name: row.name || "",
    nameEn: row.name_en || "",
    managerUserId: row.manager_user_uid || "",
    status: row.status || "active",
    userCount: Number(row.user_count || 0),
    projectCount: Number(row.project_count || 0),
    taskCount: Number(row.task_count || 0),
    sortOrder: Number(row.sort_order || 0)
  };
}

function toDateSlash(dateValue) {
  if (!dateValue) return "";
  if (dateValue instanceof Date) {
    return `${dateValue.getFullYear()}/${pad2(dateValue.getMonth() + 1)}/${pad2(dateValue.getDate())}`;
  }
  return String(dateValue).replaceAll("-", "/").slice(0, 10);
}

function riskWordsIn(text) {
  const normalized = String(text || "").toLowerCase();
  return RISK_WORDS.filter((word) => normalized.includes(word.toLowerCase()));
}

function hasRiskExpression() {
  return RISK_WORDS.map(() => "content_text LIKE ?").join(" OR ");
}

function riskParams() {
  return RISK_WORDS.map((word) => `%${word}%`);
}

export function mapAdminPermissionRows(roleRows = [], userRoleRows = []) {
  const roleMap = new Map();
  for (const row of roleRows) {
    const roleKey = row.role_key || "";
    if (!roleKey) continue;
    if (!roleMap.has(roleKey)) {
      roleMap.set(roleKey, {
        key: roleKey,
        role: roleKey,
        name: row.role_name || roleKey,
        description: row.role_description || "",
        isSystem: Number(row.is_system ?? 1) === 1,
        permissions: []
      });
    }
    if (row.permission_key) {
      roleMap.get(roleKey).permissions.push({
        key: row.permission_key,
        name: row.permission_name || row.permission_key,
        description: row.permission_description || ""
      });
    }
  }

  return {
    roles: [...roleMap.values()],
    userRoles: userRoleRows.map((row) => ({
      id: [row.user_uid, row.role_key, row.scope_type || "global", row.scope_uid || ""].join("-"),
      userId: row.user_uid || "",
      username: row.username || "",
      name: row.name || "",
      role: row.role_key || "",
      scopeType: row.scope_type || "global",
      scopeId: row.scope_uid || ""
    }))
  };
}

export function mapAdminAuditLogRow(row = {}) {
  return {
    id: row.log_uid || String(row.id || ""),
    actorId: row.actor_user_uid || "",
    actorName: row.actor_name || "",
    actorRole: row.actor_role || "",
    action: row.action || "",
    resourceType: row.resource_type || "",
    resourceId: row.resource_uid || "",
    resourceName: row.resource_name || "",
    ipAddress: row.ip_address || "",
    userAgent: row.user_agent || "",
    summary: row.summary || "",
    before: parseJson(row.before_json, null),
    after: parseJson(row.after_json, null),
    createdAt: toDateTimeSlash(row.created_at)
  };
}

export function buildAdminDashboard(counts = {}) {
  const users = counts.users || {};
  const projects = counts.projects || {};
  const tasks = counts.tasks || {};
  const comments = counts.comments || {};
  const boards = counts.boards || {};
  const schedules = counts.schedules || {};
  const audit = counts.audit || {};

  return {
    cards: [
      {
        key: "activeProjects",
        label: "在做项目",
        value: Number(projects.active || 0),
        status: Number(projects.active || 0) ? "healthy" : "muted"
      },
      {
        key: "activeTasks",
        label: "待处理任务",
        value: Number(tasks.active || 0),
        status: Number(tasks.active || 0) ? "warning" : "muted"
      },
      {
        key: "riskComments",
        label: "风险评论",
        value: Number(comments.risk || 0),
        status: Number(comments.risk || 0) ? "danger" : "healthy"
      },
      {
        key: "archivedProjects",
        label: "归档项目",
        value: Number(projects.archived || 0),
        status: "archived"
      },
      {
        key: "users",
        label: "用户总数",
        value: Number(users.total || 0),
        status: "info"
      },
      {
        key: "auditToday",
        label: "今日操作",
        value: Number(audit.today || 0),
        status: Number(audit.today || 0) ? "syncing" : "muted"
      }
    ],
    summary: {
      users,
      projects,
      tasks,
      comments,
      boards,
      schedules,
      audit
    },
    system: {
      status: "healthy",
      rows: [
        { key: "users", name: "users", count: Number(users.total || 0), status: "healthy" },
        { key: "projects", name: "projects", count: Number(projects.total || 0), status: "healthy" },
        { key: "tasks", name: "tasks", count: Number(tasks.total || 0), status: "healthy" },
        { key: "comments", name: "comments", count: Number(comments.total || 0), status: "healthy" },
        { key: "boards", name: "boards", count: Number(boards.total || 0), status: "healthy" },
        { key: "schedulePlans", name: "schedule_plans", count: Number(schedules.plans || 0), status: "healthy" },
        { key: "scheduleItems", name: "schedule_items", count: Number(schedules.items || 0), status: "healthy" },
        { key: "auditLogs", name: "admin_audit_logs", count: Number(audit.total || 0), status: "healthy" }
      ]
    }
  };
}

async function tableExists(tableName) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT 1 AS ok
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      LIMIT 1
    `,
    [tableName]
  );
  return rows.length > 0;
}

async function optionalCount(tableName, sql, params = []) {
  if (!(await tableExists(tableName))) return 0;
  const [[row]] = await mysqlPool.execute(sql, params);
  return Number(Object.values(row || {})[0] || 0);
}

async function ensureAdminTables() {
  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS admin_system_configs (
      config_key VARCHAR(64) NOT NULL,
      config_value LONGTEXT NOT NULL,
      value_type VARCHAR(16) NOT NULL DEFAULT 'string',
      description VARCHAR(255) NOT NULL DEFAULT '',
      updated_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (config_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      log_uid VARCHAR(64) NOT NULL,
      actor_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      actor_name VARCHAR(128) NOT NULL DEFAULT '',
      actor_role VARCHAR(64) NOT NULL DEFAULT '',
      action VARCHAR(64) NOT NULL,
      resource_type VARCHAR(64) NOT NULL,
      resource_uid VARCHAR(128) NOT NULL DEFAULT '',
      resource_name VARCHAR(255) NOT NULL DEFAULT '',
      ip_address VARCHAR(64) NOT NULL DEFAULT '',
      user_agent VARCHAR(255) NOT NULL DEFAULT '',
      summary VARCHAR(255) NOT NULL DEFAULT '',
      before_json LONGTEXT NULL,
      after_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_admin_audit_logs_uid (log_uid),
      KEY idx_admin_audit_logs_actor_time (actor_user_uid, created_at),
      KEY idx_admin_audit_logs_resource (resource_type, resource_uid),
      KEY idx_admin_audit_logs_action_time (action, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await seedDefaultRolesAndPermissions();
  await seedDefaultSystemConfig();
}

async function seedDefaultRolesAndPermissions() {
  for (const role of DEFAULT_ROLES) {
    await mysqlPool.execute(
      `
        INSERT INTO roles (role_key, name, description, is_system)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = 1
      `,
      role
    );
  }

  for (const permission of DEFAULT_PERMISSIONS) {
    await mysqlPool.execute(
      `
        INSERT INTO permissions (permission_key, name, description)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)
      `,
      permission
    );
  }

  for (const [roleKey, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const permissionKey of permissions) {
      await mysqlPool.execute(
        `
          INSERT IGNORE INTO role_permissions (role_key, permission_key)
          VALUES (?, ?)
        `,
        [roleKey, permissionKey]
      );
    }
  }
}

async function seedDefaultSystemConfig() {
  for (const [key, value] of Object.entries(DEFAULT_SYSTEM_CONFIG)) {
    await mysqlPool.execute(
      `
        INSERT IGNORE INTO admin_system_configs (config_key, config_value, value_type, description)
        VALUES (?, ?, ?, ?)
      `,
      [key, JSON.stringify(value), typeof value, `Default admin config: ${key}`]
    );
  }
}

async function withAdminTables(callback) {
  assertMySQLReady();
  await ensureAdminTables();
  return callback();
}

async function getCounts() {
  const riskSql = hasRiskExpression();
  const [
    [userRow],
    [projectRow],
    [taskRow],
    [commentRow],
    boardTotal,
    boardActive,
    schedulePlans,
    scheduleItems,
    auditTotal,
    auditToday
  ] = await Promise.all([
    mysqlPool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'active') AS active,
        SUM(role = 'admin') AS admins,
        SUM(role IN ('manager', 'department_admin')) AS managers
      FROM users
    `).then(([rows]) => rows),
    mysqlPool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(archived = 0 AND status <> 'archived') AS active,
        SUM(archived = 1 OR status = 'archived') AS archived,
        SUM(payload_json LIKE '%风险%' OR payload_json LIKE '%返工%' OR payload_json LIKE '%延期%') AS risk
      FROM projects
    `).then(([rows]) => rows),
    mysqlPool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(archived = 0 AND status NOT IN ('done', 'archived')) AS active,
        SUM(archived = 1 OR status IN ('done', 'archived')) AS done,
        SUM(archived = 0 AND end_date IS NOT NULL AND end_date < CURRENT_DATE()) AS overdue
      FROM tasks
    `).then(([rows]) => rows),
    mysqlPool.query(
      `
        SELECT
          COUNT(*) AS total,
          SUM(${riskSql}) AS risk
        FROM task_comments
      `,
      riskParams()
    ).then(([rows]) => rows),
    optionalCount("boards", "SELECT COUNT(*) AS count FROM boards"),
    optionalCount("boards", "SELECT COUNT(*) AS count FROM boards WHERE is_archived = 0"),
    optionalCount("schedule_plans", "SELECT COUNT(*) AS count FROM schedule_plans WHERE status <> 'deleted'"),
    optionalCount("schedule_items", "SELECT COUNT(*) AS count FROM schedule_items WHERE hidden = 0"),
    optionalCount("admin_audit_logs", "SELECT COUNT(*) AS count FROM admin_audit_logs"),
    optionalCount("admin_audit_logs", "SELECT COUNT(*) AS count FROM admin_audit_logs WHERE created_at >= CURRENT_DATE()")
  ]);

  return {
    users: {
      total: Number(userRow.total || 0),
      active: Number(userRow.active || 0),
      admins: Number(userRow.admins || 0),
      managers: Number(userRow.managers || 0)
    },
    projects: {
      total: Number(projectRow.total || 0),
      active: Number(projectRow.active || 0),
      archived: Number(projectRow.archived || 0),
      risk: Number(projectRow.risk || 0)
    },
    tasks: {
      total: Number(taskRow.total || 0),
      active: Number(taskRow.active || 0),
      done: Number(taskRow.done || 0),
      overdue: Number(taskRow.overdue || 0)
    },
    comments: {
      total: Number(commentRow.total || 0),
      risk: Number(commentRow.risk || 0)
    },
    boards: {
      total: boardTotal,
      active: boardActive
    },
    schedules: {
      plans: schedulePlans,
      items: scheduleItems
    },
    audit: {
      total: auditTotal,
      today: auditToday
    }
  };
}

export async function getAdminDashboard(auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => buildAdminDashboard(await getCounts()));
}

async function countWithWhere(baseSql, params = []) {
  const [[row]] = await mysqlPool.execute(baseSql, params);
  return Number(row.total || 0);
}

export async function listAdminUsers(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const pagination = normalizePagination(query);
    const where = [];
    const params = [];
    const keyword = trimText(query.keyword || query.q || query.search);
    const role = trimText(query.role);
    const status = trimText(query.status);
    const department = trimText(query.department);

    if (keyword) {
      where.push("(u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)");
      params.push(searchLike(keyword), searchLike(keyword), searchLike(keyword), searchLike(keyword));
    }
    if (role) {
      where.push("u.role = ?");
      params.push(role);
    }
    if (status) {
      where.push("u.status = ?");
      params.push(status);
    }
    if (department) {
      where.push("u.department = ?");
      params.push(department);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await mysqlPool.execute(
      `
        SELECT
          u.id, u.user_uid, u.username, u.name, u.role, u.status, u.phone, u.email,
          u.department, u.department_en, u.job, u.mbti, u.profile_note, u.character_label,
          DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS registered_at,
          DATE_FORMAT(u.last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at_text,
          (
            SELECT COUNT(DISTINCT pm.project_uid)
            FROM project_members pm
            WHERE pm.user_uid = u.user_uid OR pm.member_name = u.name
          ) AS project_count
        FROM users u
        ${whereSql}
        ORDER BY u.updated_at DESC, u.id DESC
        ${buildLimitOffsetClause(pagination)}
      `,
      params
    );
    const total = await countWithWhere(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
    return {
      rows: rows.map(mapAdminUserRow),
      items: rows.map(mapAdminUserRow),
      pagination: { ...pagination, total }
    };
  });
}

export async function getAdminUser(userId, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [rows] = await mysqlPool.execute(
      `
        SELECT
          u.id, u.user_uid, u.username, u.name, u.role, u.status, u.phone, u.email,
          u.department, u.department_en, u.job, u.mbti, u.profile_note, u.character_label,
          DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS registered_at,
          DATE_FORMAT(u.last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at_text,
          (
            SELECT COUNT(DISTINCT pm.project_uid)
            FROM project_members pm
            WHERE pm.user_uid = u.user_uid OR pm.member_name = u.name
          ) AS project_count
        FROM users u
        WHERE u.user_uid = ? OR u.username = ? OR CAST(u.id AS CHAR) = ?
        LIMIT 1
      `,
      [userId, userId, userId]
    );
    if (!rows.length) throw notFound("User not found");
    return { user: mapAdminUserRow(rows[0]) };
  });
}

export async function createAdminUser(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const actor = actorId(auth);
    const user = normalizeUserPayload(payload, { mode: "create" });
    const [existingRows] = await mysqlPool.execute("SELECT id FROM users WHERE username = ? LIMIT 1", [user.username]);
    if (existingRows.length) throw conflict("username already exists");

    const passwordHash = await hashPassword(user.password);
    const tempUid = trimText(payload.id || payload.userId || payload.userUid) || makeUid("u");
    const [result] = await mysqlPool.execute(
      `
        INSERT INTO users (
          user_uid, username, password_hash, name, role, status, phone, email,
          department, department_en, job, mbti, profile_note, character_label
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tempUid,
        user.username,
        passwordHash,
        user.name,
        user.role,
        user.status,
        user.phone,
        user.email,
        user.department,
        user.departmentEn,
        user.job,
        user.mbti,
        user.profileNote,
        user.characterLabel
      ]
    );
    const userUid = String(tempUid).startsWith("u-") ? tempUid : `u-${result.insertId}`;
    if (userUid !== tempUid) {
      await mysqlPool.execute("UPDATE users SET user_uid = ? WHERE id = ?", [userUid, result.insertId]);
    }
    await mysqlPool.execute(
      `
        INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
        VALUES (?, ?, 'global', '')
        ON DUPLICATE KEY UPDATE role_key = VALUES(role_key)
      `,
      [userUid, user.role]
    );
    await writeAuditLog({
      auth,
      action: "create",
      resourceType: "users",
      resourceId: userUid,
      resourceName: user.name,
      after: { ...user, password: undefined, temporaryPassword: undefined },
      summary: "Create admin user"
    });
    const response = await getAdminUser(userUid, { ...auth, sub: actor || actorId(auth) });
    if (user.generatedPassword) {
      response.temporaryPassword = user.password;
      response.mustChangePassword = true;
      response.user = { ...response.user, mustChangePassword: true, passwordResetRequired: true };
    }
    return response;
  });
}

export async function updateAdminUser(userId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [currentRows] = await mysqlPool.execute(
      `
        SELECT
          id, user_uid, username, name, role, status, phone, email, department,
          department_en, job, mbti, profile_note, character_label, created_at, last_login_at
        FROM users
        WHERE user_uid = ? OR username = ? OR CAST(id AS CHAR) = ?
        LIMIT 1
      `,
      [userId, userId, userId]
    );
    if (!currentRows.length) throw notFound("User not found");
    const current = currentRows[0];
    const user = normalizeUserPayload({ ...current, ...payload, username: payload.username ?? current.username }, { mode: "update" });

    const updateFields = [];
    const params = [];
    const pushField = (field, value) => {
      updateFields.push(`${field} = ?`);
      params.push(value);
    };

    if (payload.username !== undefined) pushField("username", user.username);
    if (payload.name !== undefined) pushField("name", user.name);
    if (payload.role !== undefined) pushField("role", user.role);
    if (payload.status !== undefined) pushField("status", user.status);
    if (payload.phone !== undefined) pushField("phone", user.phone);
    if (payload.email !== undefined) pushField("email", user.email);
    if (payload.department !== undefined) pushField("department", user.department);
    if (payload.departmentEn !== undefined || payload.department_en !== undefined) pushField("department_en", user.departmentEn);
    if (payload.job !== undefined || payload.position !== undefined) pushField("job", user.job);
    if (payload.mbti !== undefined) pushField("mbti", user.mbti);
    if (payload.profileNote !== undefined || payload.profile_note !== undefined) pushField("profile_note", user.profileNote);
    if (payload.characterLabel !== undefined || payload.character_label !== undefined) pushField("character_label", user.characterLabel);
    if (user.password) pushField("password_hash", await hashPassword(user.password));

    if (updateFields.length) {
      params.push(current.user_uid);
      await mysqlPool.execute(`UPDATE users SET ${updateFields.join(", ")} WHERE user_uid = ?`, params);
    }
    if (payload.role !== undefined) {
      await mysqlPool.execute(
        `
          INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
          VALUES (?, ?, 'global', '')
          ON DUPLICATE KEY UPDATE role_key = VALUES(role_key)
        `,
        [current.user_uid, user.role]
      );
    }
    await writeAuditLog({
      auth,
      action: "update",
      resourceType: "users",
      resourceId: current.user_uid,
      resourceName: user.name,
      before: mapAdminUserRow(current),
      after: { ...payload, password: undefined },
      summary: "Update admin user"
    });
    return getAdminUser(current.user_uid, auth);
  });
}

export async function deleteAdminUser(userId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [rows] = await mysqlPool.execute(
      "SELECT user_uid, username, name, role FROM users WHERE user_uid = ? OR username = ? OR CAST(id AS CHAR) = ? LIMIT 1",
      [userId, userId, userId]
    );
    if (!rows.length) throw notFound("User not found");
    const user = rows[0];
    if (user.role === "admin" && user.username === "admin") {
      throw forbidden("Fixed admin account cannot be deleted");
    }
    const hard = normalizeBoolean(payload.hard, false);
    if (hard) {
      await mysqlPool.execute("DELETE FROM user_roles WHERE user_uid = ?", [user.user_uid]);
      await mysqlPool.execute("DELETE FROM users WHERE user_uid = ?", [user.user_uid]);
    } else {
      await mysqlPool.execute("UPDATE users SET status = 'archived' WHERE user_uid = ?", [user.user_uid]);
    }
    await writeAuditLog({
      auth,
      action: hard ? "delete" : "archive",
      resourceType: "users",
      resourceId: user.user_uid,
      resourceName: user.name,
      summary: hard ? "Delete admin user" : "Archive admin user"
    });
    return { ok: true, deletedUserId: user.user_uid, archived: !hard };
  });
}

export async function listAdminPermissions(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [roleRows] = await mysqlPool.execute(`
      SELECT
        r.role_key,
        r.name AS role_name,
        r.description AS role_description,
        r.is_system,
        p.permission_key,
        p.name AS permission_name,
        p.description AS permission_description
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_key = r.role_key
      LEFT JOIN permissions p ON p.permission_key = rp.permission_key
      ORDER BY r.id ASC, p.permission_key ASC
    `);
    const pagination = normalizePagination(query);
    const [userRoleRows] = await mysqlPool.execute(
      `
        SELECT ur.user_uid, u.username, u.name, ur.role_key, ur.scope_type, ur.scope_uid
        FROM user_roles ur
        LEFT JOIN users u ON u.user_uid = ur.user_uid
        ORDER BY ur.id DESC
        ${buildLimitOffsetClause(pagination)}
      `
    );
    const mapped = mapAdminPermissionRows(roleRows, userRoleRows);
    return {
      ...mapped,
      projectRows: mapped.userRoles.filter((row) => row.scopeType === "project"),
      rows: mapped.userRoles,
      pagination: {
        ...pagination,
        total: await countWithWhere("SELECT COUNT(*) AS total FROM user_roles")
      }
    };
  });
}

function normalizePermissionPayload(payload = {}) {
  const assignments = Array.isArray(payload.assignments)
    ? payload.assignments
    : Array.isArray(payload.userRoles)
      ? payload.userRoles
      : [];
  const rolePermissions = Array.isArray(payload.rolePermissions) ? payload.rolePermissions : [];
  if (!assignments.length && !rolePermissions.length) {
    throw badRequest("未提供权限变更内容");
  }
  return { assignments, rolePermissions };
}

export async function updateAdminPermissions(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const { assignments, rolePermissions } = normalizePermissionPayload(payload);
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      for (const assignment of assignments) {
        const userId = trimText(assignment.userId || assignment.userUid);
        const role = normalizeAdminAssignableRole(assignment.role || assignment.roleKey);
        const scopeType = trimText(assignment.scopeType, "global");
        const scopeId = trimText(assignment.scopeId || assignment.scopeUid);
        if (!userId || !role) throw badRequest("userId 和 role 为必填项");
        await connection.execute(
          `
            INSERT INTO user_roles (user_uid, role_key, scope_type, scope_uid)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE role_key = VALUES(role_key)
          `,
          [userId, role, scopeType, scopeId]
        );
        if (scopeType === "global") {
          await connection.execute("UPDATE users SET role = ? WHERE user_uid = ?", [role, userId]);
        }
      }
      for (const entry of rolePermissions) {
        const role = normalizeAdminAssignableRole(entry.role || entry.roleKey);
        const permissions = Array.isArray(entry.permissions) ? entry.permissions.map(trimText).filter(Boolean) : [];
        if (!role) throw badRequest("role 为必填项");
        await connection.execute("DELETE FROM role_permissions WHERE role_key = ?", [role]);
        for (const permission of permissions) {
          await connection.execute(
            "INSERT IGNORE INTO role_permissions (role_key, permission_key) VALUES (?, ?)",
            [role, permission]
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    await writeAuditLog({
      auth,
      action: "update",
      resourceType: "permissions",
      summary: "更新管理后台权限",
      after: { assignments, rolePermissions }
    });
    return listAdminPermissions({}, auth);
  });
}

export async function getSystemStatus(auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const counts = await getCounts();
    const config = await getSystemConfig(auth);
    return {
      status: "healthy",
      mysql: { ready: true },
      config: config.config,
      counts,
      rows: buildAdminDashboard(counts).system.rows
    };
  });
}

export async function getSystemConfig(auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [rows] = await mysqlPool.execute(
      `
        SELECT config_key, config_value, value_type, description, updated_by, updated_at
        FROM admin_system_configs
        ORDER BY config_key ASC
      `
    );
    const config = { ...DEFAULT_SYSTEM_CONFIG };
    const items = rows.map((row) => {
      const value = parseJson(row.config_value, row.config_value);
      config[row.config_key] = value;
      return {
        key: row.config_key,
        value,
        valueType: row.value_type || typeof value,
        description: row.description || "",
        updatedBy: row.updated_by || "",
        updatedAt: toDateTimeSlash(row.updated_at)
      };
    });
    return { config, items };
  });
}

export async function updateSystemConfig(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const normalized = normalizeSystemConfigPayload(payload);
    const actor = actorId(auth);
    for (const [key, value] of Object.entries(normalized)) {
      await mysqlPool.execute(
        `
          INSERT INTO admin_system_configs (config_key, config_value, value_type, description, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            config_value = VALUES(config_value),
            value_type = VALUES(value_type),
            updated_by = VALUES(updated_by)
        `,
        [key, JSON.stringify(value), typeof value, `Admin config: ${key}`, actor]
      );
    }
    await writeAuditLog({
      auth,
      action: "update",
      resourceType: "system_config",
      summary: "Update system config",
      after: normalized
    });
    return getSystemConfig(auth);
  });
}

export async function listAuditLogs(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const filters = normalizeAuditQuery(query);
    const where = [];
    const params = [];

    if (filters.actorId) {
      where.push("actor_user_uid = ?");
      params.push(filters.actorId);
    }
    if (filters.action) {
      where.push("action = ?");
      params.push(filters.action);
    }
    if (filters.resourceType) {
      where.push("resource_type = ?");
      params.push(filters.resourceType);
    }
    if (filters.from) {
      where.push("created_at >= ?");
      params.push(`${filters.from} 00:00:00`);
    }
    if (filters.to) {
      where.push("created_at <= ?");
      params.push(`${filters.to} 23:59:59`);
    }
    if (filters.keyword) {
      where.push("(summary LIKE ? OR resource_name LIKE ? OR actor_name LIKE ?)");
      params.push(searchLike(filters.keyword), searchLike(filters.keyword), searchLike(filters.keyword));
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await mysqlPool.execute(
      `
        SELECT
          id, log_uid, actor_user_uid, actor_name, actor_role, action, resource_type,
          resource_uid, resource_name, ip_address, user_agent, summary, before_json,
          after_json, created_at
        FROM admin_audit_logs
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        ${buildLimitOffsetClause(filters)}
      `,
      params
    );
    const total = await countWithWhere(`SELECT COUNT(*) AS total FROM admin_audit_logs ${whereSql}`, params);
    return {
      rows: rows.map(mapAdminAuditLogRow),
      items: rows.map(mapAdminAuditLogRow),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        offset: filters.offset,
        total
      }
    };
  });
}

export async function writeAuditLog({
  auth = {},
  action,
  resourceType,
  resourceId = "",
  resourceName = "",
  before = null,
  after = null,
  summary = "",
  requestMeta = {}
} = {}) {
  if (!isMySQLReady()) return null;
  await ensureAdminTables();
  const logUid = makeUid("audit");
  await mysqlPool.execute(
    `
      INSERT INTO admin_audit_logs (
        log_uid, actor_user_uid, actor_name, actor_role, action, resource_type,
        resource_uid, resource_name, ip_address, user_agent, summary, before_json, after_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      logUid,
      actorId(auth),
      auth.name || auth.username || "",
      auth.role || "",
      trimText(action, "unknown"),
      trimText(resourceType, "unknown"),
      trimText(resourceId),
      trimText(resourceName),
      trimText(requestMeta.ip),
      trimText(requestMeta.userAgent).slice(0, 255),
      trimText(summary).slice(0, 255),
      before === null || before === undefined ? null : JSON.stringify(before),
      after === null || after === undefined ? null : JSON.stringify(after)
    ]
  );
  return logUid;
}

async function listRows({ sql, countSql, params = [], mapper, query = {} }) {
  const pagination = normalizePagination(query);
  const [rows] = await mysqlPool.execute(`${sql}${buildLimitOffsetClause(pagination)}`, params);
  const total = countSql ? await countWithWhere(countSql, params) : rows.length;
  return {
    rows: rows.map(mapper),
    items: rows.map(mapper),
    pagination: { ...pagination, total }
  };
}

export async function listAdminProjects(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => listRows({
    query,
    mapper: mapProjectRow,
    params: query.keyword || query.q ? [searchLike(query.keyword || query.q), searchLike(query.keyword || query.q)] : [],
    countSql: query.keyword || query.q
      ? "SELECT COUNT(*) AS total FROM projects p WHERE p.name LIKE ? OR p.owner_text LIKE ?"
      : "SELECT COUNT(*) AS total FROM projects p",
      sql: `
        SELECT
          p.*,
          pg.title AS group_title,
          DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
          DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_uid = p.project_uid) AS task_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_uid = p.project_uid AND (t.archived = 1 OR t.status IN ('done', 'archived'))
          ) AS done_count,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_uid = p.project_uid) AS member_count,
          (
            SELECT GROUP_CONCAT(DISTINCT pt.tag_name ORDER BY pt.sort_order ASC SEPARATOR ',')
            FROM project_tags pt
            WHERE pt.project_uid = p.project_uid
          ) AS tags
        FROM projects p
        LEFT JOIN project_groups pg ON pg.group_uid = p.group_uid
      ${query.keyword || query.q ? "WHERE p.name LIKE ? OR p.owner_text LIKE ?" : ""}
      ORDER BY p.updated_at DESC, p.id DESC
    `
  }));
}

export async function getAdminProject(projectId, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [rows] = await mysqlPool.execute(
      `
        SELECT
          p.*,
          pg.title AS group_title,
          DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
          DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_uid = p.project_uid) AS task_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_uid = p.project_uid AND (t.archived = 1 OR t.status IN ('done', 'archived'))
          ) AS done_count,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_uid = p.project_uid) AS member_count,
          (
            SELECT GROUP_CONCAT(DISTINCT pt.tag_name ORDER BY pt.sort_order ASC SEPARATOR ',')
            FROM project_tags pt
            WHERE pt.project_uid = p.project_uid
          ) AS tags
        FROM projects p
        LEFT JOIN project_groups pg ON pg.group_uid = p.group_uid
        WHERE p.project_uid = ? OR CAST(p.legacy_project_id AS CHAR) = ? OR CAST(p.id AS CHAR) = ?
        LIMIT 1
      `,
      [projectId, projectId, projectId]
    );
    if (!rows.length) throw notFound("Project not found");
    return { project: mapProjectRow(rows[0]) };
  });
}

export async function createAdminProject(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const created = await createProject(payload, actorId(auth));
  await writeAuditLog({
    auth,
    action: "create",
    resourceType: "projects",
    resourceId: created.projectId || created.id,
    resourceName: created.name,
    after: payload,
    summary: "Create admin project"
  });
  return created;
}

export async function updateAdminProject(projectId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const updated = await updateProject(projectId, payload, adminWorkspaceAuth(auth));
  await writeAuditLog({
    auth,
    action: "update",
    resourceType: "projects",
    resourceId: projectId,
    resourceName: updated.name,
    after: payload,
    summary: "Update admin project"
  });
  return updated;
}

export async function archiveAdminProject(projectId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return updateAdminProject(projectId, { ...payload, archived: true, status: "archived" }, auth);
}

export async function deleteAdminProject(projectId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const result = await deleteProject(projectId, adminWorkspaceAuth(auth));
  await writeAuditLog({
    auth,
    action: normalizeBoolean(payload.soft, false) ? "archive" : "delete",
    resourceType: "projects",
    resourceId: projectId,
    summary: "Delete admin project"
  });
  return result;
}

export async function listAdminTasks(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const keyword = trimText(query.keyword || query.q);
    const params = keyword ? [searchLike(keyword), searchLike(keyword), searchLike(keyword)] : [];
    return listRows({
      query,
      mapper: mapTaskRow,
      params,
      countSql: keyword
        ? "SELECT COUNT(*) AS total FROM tasks t LEFT JOIN projects p ON p.project_uid = t.project_uid WHERE t.title LIKE ? OR t.owner_text LIKE ? OR p.name LIKE ?"
        : "SELECT COUNT(*) AS total FROM tasks t",
      sql: `
        SELECT
          t.*,
          p.name AS project_name,
          DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text,
          (SELECT COUNT(*) FROM task_comments c WHERE c.task_uid = t.task_uid) AS comment_count
        FROM tasks t
        LEFT JOIN projects p ON p.project_uid = t.project_uid
        ${keyword ? "WHERE t.title LIKE ? OR t.owner_text LIKE ? OR p.name LIKE ?" : ""}
        ORDER BY t.updated_at DESC, t.id DESC
      `
    });
  });
}

export async function createAdminTask(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const projectId = trimText(payload.projectId || payload.projectUid);
  if (!projectId) throw badRequest("projectId is required");
  const created = await createTask(projectId, payload, adminWorkspaceAuth(auth));
  await writeAuditLog({
    auth,
    action: "create",
    resourceType: "tasks",
    resourceId: created.taskId || created.id,
    resourceName: created.title,
    after: payload,
    summary: "Create admin task"
  });
  return created;
}

export async function updateAdminTask(taskId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const updated = await updateTask(taskId, payload, adminWorkspaceAuth(auth));
  await writeAuditLog({
    auth,
    action: "update",
    resourceType: "tasks",
    resourceId: taskId,
    resourceName: updated.title,
    after: payload,
    summary: "Update admin task"
  });
  return updated;
}

export async function deleteAdminTask(taskId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  if (normalizeBoolean(payload.soft, false)) {
    return updateAdminTask(taskId, { archived: true, status: "archived" }, auth);
  }
  const result = await deleteTask(taskId, adminWorkspaceAuth(auth));
  await writeAuditLog({
    auth,
    action: "delete",
    resourceType: "tasks",
    resourceId: taskId,
    summary: "Delete admin task"
  });
  return result;
}

export async function listRiskComments(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const params = riskParams();
    return listRows({
      query,
      mapper: mapRiskCommentRow,
      params,
      countSql: `SELECT COUNT(*) AS total FROM task_comments WHERE ${hasRiskExpression()}`,
      sql: `
        SELECT
          c.*,
          t.title AS task_title,
          p.name AS project_name,
          DATE_FORMAT(c.commented_at, '%Y-%m-%d %H:%i:%s') AS commented_at_text
        FROM task_comments c
        LEFT JOIN tasks t ON t.task_uid = c.task_uid
        LEFT JOIN projects p ON p.project_uid = c.project_uid
        WHERE ${hasRiskExpression()}
        ORDER BY c.created_at DESC, c.id DESC
      `
    });
  });
}

export async function resolveRiskComment(commentId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    await writeAuditLog({
      auth,
      action: "resolve",
      resourceType: "comments",
      resourceId: commentId,
      after: payload,
      summary: "Resolve risk comment"
    });
    return { ok: true, commentId, status: "resolved" };
  });
}

export async function listAdminSchedules(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    if (!(await tableExists("schedule_plans"))) {
      return { rows: [], items: [], pagination: { ...normalizePagination(query), total: 0 } };
    }
    return listRows({
      query,
      mapper: mapScheduleRow,
      countSql: "SELECT COUNT(*) AS total FROM schedule_plans",
      sql: `
        SELECT
          sp.*,
          p.name AS project_name,
          DATE_FORMAT(sp.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text,
          (SELECT COUNT(*) FROM schedule_items si WHERE si.plan_uid = sp.plan_uid) AS item_count,
          (
            SELECT COUNT(*)
            FROM schedule_items si
            WHERE si.plan_uid = sp.plan_uid
              AND si.hidden = 0
              AND si.end_date IS NOT NULL
              AND si.end_date < CURRENT_DATE()
          ) AS overdue
        FROM schedule_plans sp
        LEFT JOIN projects p ON p.project_uid = sp.project_uid
        ORDER BY sp.updated_at DESC, sp.id DESC
      `
    });
  });
}

export async function listAdminBoards(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    if (!(await tableExists("boards"))) {
      return { rows: [], items: [], pagination: { ...normalizePagination(query), total: 0 } };
    }
    return listRows({
      query,
      mapper: mapBoardRow,
      countSql: "SELECT COUNT(*) AS total FROM boards",
      sql: `
        SELECT
          b.*,
          p.name AS project_name,
          DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text,
          (
            SELECT COUNT(*)
            FROM board_shares bs
            WHERE bs.board_uid = b.board_uid AND bs.status = 'active'
          ) AS share_count
        FROM boards b
        LEFT JOIN projects p ON p.project_uid = b.project_uid
        ORDER BY b.updated_at DESC, b.id DESC
      `
    });
  });
}

export async function updateAdminBoard(boardId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const updated = await updateBoard(boardId, payload, auth);
  await writeAuditLog({
    auth,
    action: "update",
    resourceType: "boards",
    resourceId: boardId,
    resourceName: updated.title,
    after: payload,
    summary: "Update admin board"
  });
  return updated;
}

export async function deleteAdminBoard(boardId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const result = await deleteBoard(boardId, auth);
  await writeAuditLog({
    auth,
    action: "delete",
    resourceType: "boards",
    resourceId: boardId,
    after: payload,
    summary: "Delete admin board"
  });
  return result;
}

export async function listAdminTemplates(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const scheduleTemplateSelect = (await tableExists("schedule_templates"))
      ? `
          SELECT template_uid, title, '' AS group_key, visibility, item_count AS task_count, updated_at
          FROM schedule_templates
        `
      : `
          SELECT '' AS template_uid, '' AS title, '' AS group_key, '' AS visibility, 0 AS task_count, NOW() AS updated_at
          WHERE 1 = 0
        `;
    return listRows({
      query,
      mapper: mapTemplateRow,
      countSql: `
        SELECT
          (SELECT COUNT(*) FROM templates) +
          (SELECT COUNT(*) FROM (${scheduleTemplateSelect}) schedule_template_count) AS total
      `,
      sql: `
        SELECT template_uid, title, group_key, visibility, task_count, updated_at FROM templates
        UNION ALL
        ${scheduleTemplateSelect}
        ORDER BY updated_at DESC
      `
    });
  });
}

export async function createAdminTemplate(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const title = trimText(payload.title);
    if (!title) throw badRequest("title is required");
    const templateUid = trimText(payload.templateId || payload.id) || makeUid("template");
    await mysqlPool.execute(
      `
        INSERT INTO templates (
          template_uid, title, group_key, owner_user_uid, visibility, task_count,
          content_json, payload_json, created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        templateUid,
        title,
        trimText(payload.group || payload.groupKey),
        actorId(auth),
        trimText(payload.visibility, "private"),
        Number(payload.taskCount || 0),
        JSON.stringify(payload.content || payload.template || {}),
        JSON.stringify(payload.payload || {}),
        actorId(auth),
        actorId(auth)
      ]
    );
    await writeAuditLog({
      auth,
      action: "create",
      resourceType: "templates",
      resourceId: templateUid,
      resourceName: title,
      after: payload,
      summary: "Create admin template"
    });
    return { id: templateUid, templateId: templateUid, title };
  });
}

export async function updateAdminTemplate(templateId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const fields = [];
    const params = [];
    if (payload.title !== undefined) {
      const title = trimText(payload.title);
      if (!title) throw badRequest("title is required");
      fields.push("title = ?");
      params.push(title);
    }
    if (payload.group !== undefined || payload.groupKey !== undefined) {
      fields.push("group_key = ?");
      params.push(trimText(payload.group || payload.groupKey));
    }
    if (payload.visibility !== undefined) {
      fields.push("visibility = ?");
      params.push(trimText(payload.visibility, "private"));
    }
    if (payload.content !== undefined || payload.template !== undefined) {
      fields.push("content_json = ?");
      params.push(JSON.stringify(payload.content || payload.template || {}));
    }
    if (!fields.length) throw badRequest("No template fields supplied");
    fields.push("updated_by = ?");
    params.push(actorId(auth));
    params.push(templateId);
    const [result] = await mysqlPool.execute(`UPDATE templates SET ${fields.join(", ")} WHERE template_uid = ?`, params);
    if (!result.affectedRows) throw notFound("Template not found");
    await writeAuditLog({
      auth,
      action: "update",
      resourceType: "templates",
      resourceId: templateId,
      after: payload,
      summary: "Update admin template"
    });
    return { ok: true, templateId };
  });
}

export async function deleteAdminTemplate(templateId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [result] = await mysqlPool.execute("DELETE FROM templates WHERE template_uid = ?", [templateId]);
    if (!result.affectedRows) throw notFound("Template not found");
    await writeAuditLog({
      auth,
      action: "delete",
      resourceType: "templates",
      resourceId: templateId,
      after: payload,
      summary: "Delete admin template"
    });
    return { ok: true, deletedTemplateId: templateId };
  });
}

export async function listAdminTags(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => listRows({
    query,
    mapper: mapTagRow,
    countSql: "SELECT COUNT(*) AS total FROM tags",
    sql: `
      SELECT
        t.*,
        (
          SELECT COUNT(DISTINCT pt.project_uid)
          FROM project_tags pt
          WHERE pt.tag_uid = t.tag_uid OR pt.tag_name = t.name
        ) AS project_count
      FROM tags t
      ORDER BY t.sort_order ASC, t.id DESC
    `
  }));
}

export async function createAdminTag(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const created = await createTag(payload, actorId(auth));
  await writeAuditLog({
    auth,
    action: "create",
    resourceType: "tags",
    resourceName: created.name,
    after: payload,
    summary: "Create admin tag"
  });
  return created;
}

export async function deleteAdminTag(tagId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const result = await deleteTag(tagId);
  await writeAuditLog({
    auth,
    action: "delete",
    resourceType: "tags",
    resourceId: tagId,
    after: payload,
    summary: "Delete admin tag"
  });
  return result;
}

export async function listAdminNotices(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    if (!(await tableExists("carousel_notices"))) {
      return { rows: [], items: [], pagination: { ...normalizePagination(query), total: 0 } };
    }
    const filters = [];
    const params = [];
    const keyword = trimText(query.keyword || query.q || query.search);
    const status = trimText(query.status);
    if (keyword) {
      filters.push("(title LIKE ? OR content_text LIKE ? OR link_text LIKE ? OR link_url LIKE ?)");
      params.push(searchLike(keyword), searchLike(keyword), searchLike(keyword), searchLike(keyword));
    }
    if (status && status.toLowerCase() !== "all") {
      filters.push("status = ?");
      params.push(normalizeNoticeStatus(status, "active"));
    }
    const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
    return listRows({
      query,
      mapper: mapNoticeRow,
      params,
      countSql: `SELECT COUNT(*) AS total FROM carousel_notices${where}`,
      sql: `
        SELECT
          id, notice_uid, title, content_text, notice_type, enabled, status, priority,
          link_text, link_url, link_target, start_at, end_at,
          sort_order, payload_json, created_by, updated_by, updated_at,
          DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
        FROM carousel_notices
        ${where}
        ORDER BY priority DESC, sort_order ASC, updated_at DESC
      `
    });
  });
}

function normalizeNoticeStatus(value, fallback = "active") {
  const status = trimText(value, fallback).toLowerCase();
  if (["active", "disabled", "draft", "archived"].includes(status)) return status;
  if (["healthy", "enabled", "published", "online"].includes(status)) return "active";
  if (["muted", "inactive", "off", "offline"].includes(status)) return "disabled";
  return fallback;
}

function normalizeNoticeLinkTarget(value = "_self") {
  const target = trimText(value, "_self").toLowerCase();
  return ["_self", "_blank"].includes(target) ? target : "_self";
}

function normalizeNoticeLinkUrl(value = "") {
  const linkUrl = stripDangerousScripts(value);
  if (!linkUrl) return "";
  if (linkUrl.startsWith("/") && !linkUrl.startsWith("//")) return linkUrl;
  try {
    const parsed = new URL(linkUrl);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    // fall through to a uniform validation error
  }
  throw badRequest("linkUrl must be a site path or http/https URL");
}

function safeNoticeLinkUrl(value = "") {
  try {
    return normalizeNoticeLinkUrl(value);
  } catch {
    return "";
  }
}

function normalizeNoticeDateTime(value) {
  const text = trimText(value);
  if (!text) return null;
  const normalized = text.replaceAll("/", "-").replace("T", " ").slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/.test(normalized)) {
    throw badRequest("notice datetime must use YYYY-MM-DD HH:mm:ss format");
  }
  return normalized.length === 10 ? `${normalized} 00:00:00` : normalized.length === 16 ? `${normalized}:00` : normalized;
}

function normalizeNoticePayload(payload = {}) {
  const title = stripDangerousScripts(trimText(payload.title));
  const text = stripDangerousScripts(trimText(payload.text || payload.content || payload.contentText));
  if (!title) throw badRequest("title is required");
  if (!text) throw badRequest("content is required");
  const status = normalizeNoticeStatus(payload.status, normalizeBoolean(payload.enabled, true) ? "active" : "disabled");
  const enabled = payload.enabled === undefined ? status === "active" : normalizeBoolean(payload.enabled, status === "active");
  const startAt = normalizeNoticeDateTime(payload.startAt ?? payload.start_at);
  const endAt = normalizeNoticeDateTime(payload.endAt ?? payload.end_at);
  if (startAt && endAt && endAt < startAt) throw badRequest("endAt cannot be earlier than startAt");
  const payloadJson = payload.payload && typeof payload.payload === "object" ? { ...payload.payload } : {};
  payloadJson.interval = normalizeInteger(payload.interval ?? payloadJson.interval, 5500, 1000, 3_600_000);
  return {
    title,
    text,
    type: trimText(payload.type || payload.noticeType),
    status,
    enabled: enabled ? 1 : 0,
    priority: normalizeInteger(payload.priority, 0, -1000, 1000),
    linkText: stripDangerousScripts(trimText(payload.linkText ?? payload.link_text)).slice(0, 80),
    linkUrl: normalizeNoticeLinkUrl(payload.linkUrl ?? payload.link_url),
    linkTarget: normalizeNoticeLinkTarget(payload.linkTarget ?? payload.link_target ?? payload.openTarget ?? payload.open_target),
    startAt,
    endAt,
    sortOrder: normalizeInteger(payload.sortOrder ?? payload.sort_order, 0, -9_000_000_000_000, 9_000_000_000_000),
    payload: payloadJson
  };
}

export async function createAdminNotice(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const notice = normalizeNoticePayload(payload);
    const noticeUid = makeUid("notice");
    const finalNoticeUid = (await getNoticeRowByUid(noticeUid)) ? await createUniqueNoticeUid() : noticeUid;
    await mysqlPool.execute(
      `
        INSERT INTO carousel_notices (
          notice_uid, title, content_text, notice_type, enabled, status, priority,
          link_text, link_url, link_target, start_at, end_at, sort_order, payload_json, created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        finalNoticeUid,
        notice.title,
        notice.text,
        notice.type,
        notice.enabled,
        notice.status,
        notice.priority,
        notice.linkText,
        notice.linkUrl,
        notice.linkTarget,
        notice.startAt,
        notice.endAt,
        notice.sortOrder,
        JSON.stringify(notice.payload),
        actorId(auth),
        actorId(auth)
      ]
    );
    await writeAuditLog({
      auth,
      action: "create",
      resourceType: "notices",
      resourceId: finalNoticeUid,
      resourceName: notice.title,
      after: payload,
      summary: "Create admin notice"
    });
    return mapNoticeRow(await getNoticeRowByUid(finalNoticeUid));
  });
}

export async function updateAdminNotice(noticeId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const cleanNoticeId = trimText(noticeId);
    if (!cleanNoticeId) throw badRequest("noticeId is required");
    const lookup = normalizeNoticeLookupId(cleanNoticeId);
    const fields = [];
    const params = [];
    if (payload.title !== undefined) {
      const title = stripDangerousScripts(trimText(payload.title));
      if (!title) throw badRequest("title is required");
      fields.push("title = ?");
      params.push(title);
    }
    if (payload.text !== undefined || payload.content !== undefined || payload.contentText !== undefined) {
      const content = stripDangerousScripts(trimText(payload.text || payload.content || payload.contentText));
      if (!content) throw badRequest("content is required");
      fields.push("content_text = ?");
      params.push(content);
    }
    if (payload.type !== undefined || payload.noticeType !== undefined) {
      fields.push("notice_type = ?");
      params.push(trimText(payload.type || payload.noticeType));
    }
    if (payload.status !== undefined) {
      const status = normalizeNoticeStatus(payload.status, "active");
      fields.push("status = ?");
      params.push(status);
      if (payload.enabled === undefined) {
        fields.push("enabled = ?");
        params.push(status === "active" ? 1 : 0);
      }
    }
    if (payload.enabled !== undefined) {
      const enabled = normalizeBoolean(payload.enabled, true);
      fields.push("enabled = ?");
      params.push(enabled ? 1 : 0);
      if (payload.status === undefined) {
        fields.push("status = ?");
        params.push(enabled ? "active" : "disabled");
      }
    }
    if (payload.priority !== undefined) {
      fields.push("priority = ?");
      params.push(normalizeInteger(payload.priority, 0, -1000, 1000));
    }
    if (payload.linkText !== undefined || payload.link_text !== undefined) {
      fields.push("link_text = ?");
      params.push(stripDangerousScripts(trimText(payload.linkText ?? payload.link_text)).slice(0, 80));
    }
    if (payload.linkUrl !== undefined || payload.link_url !== undefined) {
      fields.push("link_url = ?");
      params.push(normalizeNoticeLinkUrl(payload.linkUrl ?? payload.link_url));
    }
    if (
      payload.linkTarget !== undefined ||
      payload.link_target !== undefined ||
      payload.openTarget !== undefined ||
      payload.open_target !== undefined
    ) {
      fields.push("link_target = ?");
      params.push(normalizeNoticeLinkTarget(payload.linkTarget ?? payload.link_target ?? payload.openTarget ?? payload.open_target));
    }
    if (payload.startAt !== undefined || payload.start_at !== undefined) {
      fields.push("start_at = ?");
      params.push(normalizeNoticeDateTime(payload.startAt ?? payload.start_at));
    }
    if (payload.endAt !== undefined || payload.end_at !== undefined) {
      fields.push("end_at = ?");
      params.push(normalizeNoticeDateTime(payload.endAt ?? payload.end_at));
    }
    const nextStartAt = payload.startAt !== undefined || payload.start_at !== undefined
      ? normalizeNoticeDateTime(payload.startAt ?? payload.start_at)
      : null;
    const nextEndAt = payload.endAt !== undefined || payload.end_at !== undefined
      ? normalizeNoticeDateTime(payload.endAt ?? payload.end_at)
      : null;
    if (nextStartAt && nextEndAt && nextEndAt < nextStartAt) {
      throw badRequest("endAt cannot be earlier than startAt");
    }
    if (payload.sortOrder !== undefined) {
      fields.push("sort_order = ?");
      params.push(normalizeInteger(payload.sortOrder, 0, -9_000_000_000_000, 9_000_000_000_000));
    }
    if (payload.payload !== undefined) {
      const nextPayload = payload.payload && typeof payload.payload === "object" ? { ...payload.payload } : {};
      if (payload.interval !== undefined) {
        nextPayload.interval = normalizeInteger(payload.interval, 5500, 1000, 3_600_000);
      }
      fields.push("payload_json = ?");
      params.push(JSON.stringify(nextPayload));
    }
    if (payload.interval !== undefined && payload.payload === undefined) {
      const existing = await getNoticeRowByUid(cleanNoticeId);
      const existingPayload = parseJson(existing?.payload_json, {});
      fields.push("payload_json = ?");
      params.push(JSON.stringify({
        ...existingPayload,
        interval: normalizeInteger(payload.interval, 5500, 1000, 3_600_000)
      }));
    }
    if (!fields.length) throw badRequest("No notice fields supplied");
    fields.push("updated_by = ?");
    params.push(actorId(auth));
    params.push(...lookup.params);
    const [result] = await mysqlPool.execute(
      `UPDATE carousel_notices SET ${fields.join(", ")} WHERE ${lookup.clause}`,
      params
    );
    if (!result.affectedRows) throw notFound("Notice not found");
    await writeAuditLog({
      auth,
      action: "update",
      resourceType: "notices",
      resourceId: cleanNoticeId,
      after: payload,
      summary: "Update admin notice"
    });
    return mapNoticeRow(await getNoticeRowByUid(cleanNoticeId));
  });
}

export async function deleteAdminNotice(noticeId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const cleanNoticeId = trimText(noticeId);
    if (!cleanNoticeId) throw badRequest("noticeId is required");
    const lookup = normalizeNoticeLookupId(cleanNoticeId);
    const [result] = await mysqlPool.execute(
      `DELETE FROM carousel_notices WHERE ${lookup.clause}`,
      lookup.params
    );
    if (!result.affectedRows) throw notFound("Notice not found");
    await writeAuditLog({
      auth,
      action: "delete",
      resourceType: "notices",
      resourceId: cleanNoticeId,
      after: payload,
      summary: "Delete admin notice"
    });
    return { ok: true, noticeId: cleanNoticeId };
  });
}

export async function listAdminDepartments(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => listRows({
    query,
    mapper: mapDepartmentAdminRow,
    countSql: "SELECT COUNT(*) AS total FROM departments",
    sql: `
      SELECT
        d.*,
        (SELECT COUNT(*) FROM users u WHERE u.department = d.name) AS user_count,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_text LIKE CONCAT('%', d.name, '%')) AS project_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.owner_text LIKE CONCAT('%', d.name, '%')) AS task_count
      FROM departments d
      ORDER BY d.sort_order ASC, d.id ASC
    `
  }));
}

function normalizeDepartmentPayload(payload = {}) {
  const name = trimText(payload.name);
  if (!name) throw badRequest("name is required");
  return {
    name,
    nameEn: trimText(payload.nameEn || payload.name_en),
    parentDepartmentId: trimText(payload.parentDepartmentId || payload.parent_department_uid),
    managerUserId: trimText(payload.managerUserId || payload.manager_user_uid),
    status: normalizeStatus(payload.status, "active"),
    sortOrder: Number(payload.sortOrder || 0),
    payload: payload.payload || {}
  };
}

function normalizeDepartmentPartialPayload(payload = {}) {
  const normalized = {};
  if (payload.name !== undefined) {
    normalized.name = trimText(payload.name);
    if (!normalized.name) throw badRequest("name is required");
  }
  if (payload.nameEn !== undefined || payload.name_en !== undefined) {
    normalized.nameEn = trimText(payload.nameEn || payload.name_en);
  }
  if (payload.parentDepartmentId !== undefined || payload.parent_department_uid !== undefined) {
    normalized.parentDepartmentId = trimText(payload.parentDepartmentId || payload.parent_department_uid);
  }
  if (payload.managerUserId !== undefined || payload.manager_user_uid !== undefined) {
    normalized.managerUserId = trimText(payload.managerUserId || payload.manager_user_uid);
  }
  if (payload.status !== undefined) {
    normalized.status = normalizeStatus(payload.status, "active");
  }
  if (payload.sortOrder !== undefined) {
    normalized.sortOrder = Number(payload.sortOrder || 0);
  }
  if (!Object.keys(normalized).length) {
    throw badRequest("No department fields supplied");
  }
  return normalized;
}

export async function createAdminDepartment(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const department = normalizeDepartmentPayload(payload);
    const departmentUid = trimText(payload.departmentId || payload.id) || makeUid("dept");
    await mysqlPool.execute(
      `
        INSERT INTO departments (
          department_uid, name, name_en, parent_department_uid, manager_user_uid, status, sort_order, payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        departmentUid,
        department.name,
        department.nameEn,
        department.parentDepartmentId,
        department.managerUserId,
        department.status,
        department.sortOrder,
        JSON.stringify(department.payload)
      ]
    );
    await writeAuditLog({
      auth,
      action: "create",
      resourceType: "departments",
      resourceId: departmentUid,
      resourceName: department.name,
      after: payload,
      summary: "Create admin department"
    });
    return { id: departmentUid, departmentId: departmentUid, ...department };
  });
}

export async function updateAdminDepartment(departmentId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const department = normalizeDepartmentPartialPayload(payload);
    const fields = [];
    const params = [];
    if (department.name !== undefined) {
      fields.push("name = ?");
      params.push(department.name);
    }
    if (department.nameEn !== undefined) {
      fields.push("name_en = ?");
      params.push(department.nameEn);
    }
    if (department.parentDepartmentId !== undefined) {
      fields.push("parent_department_uid = ?");
      params.push(department.parentDepartmentId);
    }
    if (department.managerUserId !== undefined) {
      fields.push("manager_user_uid = ?");
      params.push(department.managerUserId);
    }
    if (department.status !== undefined) {
      fields.push("status = ?");
      params.push(department.status);
    }
    if (department.sortOrder !== undefined) {
      fields.push("sort_order = ?");
      params.push(department.sortOrder);
    }
    params.push(departmentId);
    const [result] = await mysqlPool.execute(`UPDATE departments SET ${fields.join(", ")} WHERE department_uid = ? OR name = ?`, [...params, departmentId]);
    if (!result.affectedRows) throw notFound("Department not found");
    await writeAuditLog({
      auth,
      action: "update",
      resourceType: "departments",
      resourceId: departmentId,
      after: payload,
      summary: "Update admin department"
    });
    return { ok: true, departmentId };
  });
}

export async function deleteAdminDepartment(departmentId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const [result] = await mysqlPool.execute("DELETE FROM departments WHERE department_uid = ? OR name = ?", [departmentId, departmentId]);
    if (!result.affectedRows) throw notFound("Department not found");
    await writeAuditLog({
      auth,
      action: "delete",
      resourceType: "departments",
      resourceId: departmentId,
      after: payload,
      summary: "Delete admin department"
    });
    return { ok: true, deletedDepartmentId: departmentId };
  });
}

export async function listAdminArchives(query = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const pagination = normalizePagination(query);
    const [projectRows] = await mysqlPool.execute(
      `
        SELECT p.*, DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
        FROM projects p
        WHERE p.archived = 1 OR p.status = 'archived'
        ORDER BY p.updated_at DESC
        ${buildLimitOffsetClause(pagination)}
      `
    );
    const [userRows] = await mysqlPool.execute(
      `
        SELECT u.*, DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS registered_at
        FROM users u
        WHERE u.status = 'archived'
        ORDER BY u.updated_at DESC
        ${buildLimitOffsetClause(pagination)}
      `
    );
    return {
      projectRows: projectRows.map(mapProjectRow),
      userRows: userRows.map(mapAdminUserRow),
      rows: [
        ...projectRows.map((row) => ({ ...mapProjectRow(row), resourceType: "project" })),
        ...userRows.map((row) => ({ ...mapAdminUserRow(row), resourceType: "user" }))
      ],
      pagination
    };
  });
}

export async function restoreArchive(archiveId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  return withAdminTables(async () => {
    const resourceType = trimText(payload.resourceType);
    let result;
    if (resourceType === "user") {
      [result] = await mysqlPool.execute("UPDATE users SET status = 'active' WHERE user_uid = ? OR username = ?", [archiveId, archiveId]);
    } else {
      [result] = await mysqlPool.execute("UPDATE projects SET archived = 0, status = 'active' WHERE project_uid = ?", [archiveId]);
    }
    if (!result.affectedRows) throw notFound("Archive not found");
    await writeAuditLog({
      auth,
      action: "restore",
      resourceType: resourceType || "archives",
      resourceId: archiveId,
      after: payload,
      summary: "Restore archive"
    });
    return { ok: true, archiveId, restored: true };
  });
}

export async function deleteArchive(archiveId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const resourceType = trimText(payload.resourceType);
  if (resourceType === "user") {
    return deleteAdminUser(archiveId, { hard: true }, auth);
  }
  return deleteAdminProject(archiveId, payload, auth);
}

export const __private__ = {
  assertAdminAccess,
  ensureAdminTables,
  normalizeUserPayload,
  normalizeAdminAssignableRole,
  normalizeDepartmentPayload,
  normalizeDepartmentPartialPayload,
  normalizeNoticePayload,
  normalizeNoticeLinkUrl,
  normalizeNoticeLookupId,
  mapProjectRow,
  mapTaskRow,
  mapRiskCommentRow,
  mapScheduleRow,
  mapBoardRow,
  mapTemplateRow,
  mapTagRow,
  mapNoticeRow,
  mapDepartmentAdminRow,
  riskWordsIn
};
