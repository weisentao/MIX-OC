import { isMySQLReady, mysqlPool } from "../../db/mysql.js";
import { assertRoleCan, getRoleCapabilities, hasPermission, normalizeRole } from "../../middlewares/auth.js";
import { hashPassword } from "../../utils/password.js";
import { createNotification, makeNotificationUid } from "../notifications/notifications.service.js";
import { hrTableStatements } from "./hr.schema.js";
import { env } from "../../config/env.js";
import { readStoredAiKeyConfigSync, resolveHrDeepSeekApiKeyFromConfig } from "../../config/aiKeys.js";
import { resolveDepartmentFilterValues, resolveDepartmentMeta, findDepartmentTaxonomyByKey } from "../../utils/department-taxonomy.js";

const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for HR API";
const HR_AI_KEY_NOT_CONFIGURED_CODE = "HR_AI_KEY_NOT_CONFIGURED";
const HR_DEFAULT_MODEL = "deepseek-v4-flash";
const HR_MODEL_ALIASES = new Map([
  ["deepseek-v4-flash", "deepseek-v4-flash"],
  ["deepseek-v4-pro", "deepseek-v4-pro"],
  ["deepseek-fourth-flash", "deepseek-v4-flash"],
  ["deepseek-fourth-pro", "deepseek-v4-pro"],
  ["deepseek-chat", "deepseek-v4-flash"],
  ["deepseek-reasoner", "deepseek-v4-pro"],
  ["flash", "deepseek-v4-flash"],
  ["pro", "deepseek-v4-pro"]
]);
const DEFAULT_EMPLOYEE_PASSWORD = "MIX801002";
const DEFAULT_RANGE = {
  startDate: "2026-05-01",
  endDate: "2026-05-31"
};

let schemaEnsured = false;

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
  throw error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  throw error;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
}

function codedConflict(code, message = code) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = code;
  throw error;
}

function forbidden(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function makeUid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function actorId(auth = {}) {
  return String(auth.sub || auth.id || auth.userId || "").trim();
}

function cleanString(value, fallback = "") {
  const clean = String(value ?? "").trim();
  return clean || fallback;
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanMoney(value, fallback = 0) {
  return Math.round(cleanNumber(value, fallback) * 100) / 100;
}

function cleanDate(value, fallback = null) {
  if (value === undefined) return fallback;
  const clean = String(value || "").trim();
  if (!clean) return null;
  return clean.replaceAll("/", "-").slice(0, 10);
}

function cleanSchedulePatchDate(value, fallback = null) {
  if (value === undefined) return fallback;
  const clean = cleanDate(value, fallback);
  if (clean === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) badRequest("日期格式不合法");
  const date = new Date(`${clean}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== clean) badRequest("日期格式不合法");
  return clean;
}

function cleanDateTime(value) {
  const clean = String(value || "").trim();
  if (!clean) return null;
  return clean.replaceAll("/", "-").slice(0, 19);
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

function toJson(value, fallback = {}) {
  if (value === undefined) return JSON.stringify(fallback);
  return JSON.stringify(value ?? fallback);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateSlash(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}/${pad2(value.getMonth() + 1)}/${pad2(value.getDate())}`;
  }
  return String(value).replaceAll("-", "/").slice(0, 10);
}

function toDateTimeSlash(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return `${toDateSlash(value)} ${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  return String(value).replaceAll("-", "/").slice(0, 16);
}

function mergeDefined(...objects) {
  const merged = {};
  for (const object of objects) {
    if (!object || typeof object !== "object") continue;
    for (const [key, value] of Object.entries(object)) {
      if (value !== undefined && value !== null && value !== "") merged[key] = value;
    }
  }
  return merged;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstCleanString(...values) {
  for (const value of values) {
    const clean = cleanString(value);
    if (clean) return clean;
  }
  return "";
}

function firstArrayValue(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value, fallback = "active") {
  return cleanString(value, fallback);
}

function normalizeListQuery(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 200);
  const offset = Math.max(Number(query.offset || 0), 0);
  const keyword = cleanString(query.q || query.keyword || query.search);
  const status = cleanString(query.status);
  const departmentId = cleanString(query.departmentId || query.department_id || query.department);
  const userId = cleanString(query.userId || query.user_uid || query.employeeId || query.employee_id);
  return { limit, offset, keyword, status, departmentId, userId };
}

function includeLimitOffset(params, limit, offset) {
  return params;
}

function paginationSql(limit, offset) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
  const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
  return `LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}

function assertWritable(auth = {}) {
  assertRoleCan(auth, "write");
}

function assertDeletable(auth = {}) {
  assertRoleCan(auth, "delete");
}

export async function ensureHrSchema() {
  assertMySQLReady();
  if (schemaEnsured) return { ok: true, ensured: false };
  for (const statement of hrTableStatements) {
    await mysqlPool.execute(statement);
  }
  schemaEnsured = true;
  return { ok: true, ensured: true };
}

async function ensureHrSchemaReady() {
  await ensureHrSchema();
}

async function resolveUserByAnyId(userId) {
  const clean = cleanString(userId);
  if (!clean) badRequest("employeeId or userId is required");
  const [rows] = await mysqlPool.execute(
    `
      SELECT id, user_uid, username, name, role, status, phone, email,
             department, department_en, job, mbti, profile_note, character_label
      FROM users
      WHERE user_uid = ? OR CAST(id AS CHAR) = ? OR username = ?
      LIMIT 1
    `,
    [clean, clean, clean]
  );
  if (!rows.length) notFound("Employee not found");
  return rows[0];
}

async function fetchAuthContext(auth = {}) {
  const userUid = actorId(auth);
  const username = cleanString(auth.username);
  if (!userUid && !username) return { ...auth };
  const [rows] = await mysqlPool.execute(
    `
      SELECT user_uid, username, name, role, department, job
      FROM users
      WHERE user_uid = ? OR username = ?
      LIMIT 1
    `,
    [userUid, username]
  );
  const user = rows[0];
  if (!user) return { ...auth };
  return {
    ...auth,
    sub: auth.sub || user.user_uid,
    username: auth.username || user.username,
    name: auth.name || user.name,
    role: auth.role || user.role,
    department: auth.department || user.department,
    job: auth.job || user.job
  };
}

async function findDepartmentByNameOrUid(departmentValue) {
  const clean = cleanString(departmentValue);
  if (!clean) return null;
  const [rows] = await mysqlPool.execute(
    `
      SELECT department_uid, name
      FROM departments
      WHERE department_uid = ? OR name = ?
      LIMIT 1
    `,
    [clean, clean]
  );
  return rows[0] || null;
}

async function findPositionByTitleOrUid(positionValue) {
  const clean = cleanString(positionValue);
  if (!clean) return null;
  const [rows] = await mysqlPool.execute(
    `
      SELECT position_uid, title
      FROM hr_positions
      WHERE position_uid = ? OR title = ?
      LIMIT 1
    `,
    [clean, clean]
  );
  return rows[0] || null;
}

async function fetchEmployeeByUserUid(userUid) {
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        u.id AS row_id,
        u.user_uid,
        u.username,
        u.name,
        u.role,
        u.status,
        u.phone,
        u.email,
        u.department,
        u.department_en,
        u.job,
        u.mbti,
        u.profile_note,
        u.character_label,
        DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS registered_at,
        ep.profile_uid,
        ep.employee_no,
        ep.department_uid AS profile_department_uid,
        ep.department_name AS profile_department_name,
        ep.position_uid,
        ep.direct_manager_uid,
        ep.hire_date,
        ep.employment_type,
        ep.employment_status,
        ep.work_location,
        ep.skills_json,
        ep.emergency_contact_json,
        ep.payload_json
      FROM users u
      LEFT JOIN hr_employee_profiles ep ON ep.user_uid = u.user_uid
      WHERE u.user_uid = ?
      LIMIT 1
    `,
    [userUid]
  );
  if (!rows.length) notFound("Employee not found");
  return mapEmployee(rows[0]);
}

function mapEmployee(row = {}) {
  const profilePayload = parseJson(row.payload_json, {});
  const skills = parseJson(row.skills_json, profilePayload.skills || []);
  const departmentId = row.profile_department_uid || profilePayload.departmentId || "";
  const departmentName = row.profile_department_name || row.department || "";
  const departmentMeta = resolveDepartmentMeta(departmentName);
  const canonicalRoot = departmentMeta.departmentKey ? findDepartmentTaxonomyByKey(departmentMeta.departmentKey) : null;
  const departmentLabel = canonicalRoot?.label || departmentMeta.displayDepartment || departmentName;
  return {
    id: row.user_uid || String(row.row_id || row.id || ""),
    employeeId: row.user_uid || String(row.row_id || row.id || ""),
    userId: row.user_uid || String(row.row_id || row.id || ""),
    username: row.username || "",
    name: row.name || "",
    role: row.role || "employee",
    status: row.employment_status || row.status || "active",
    accountStatus: row.status || "active",
    phone: row.phone || "",
    email: row.email || "",
    departmentId,
    department: departmentName,
    departmentName,
    departmentKey: departmentMeta.departmentKey || "",
    departmentAliasKey: departmentMeta.childDepartmentKey || "",
    displayDepartment: departmentMeta.displayDepartment || departmentName,
    departmentLabel,
    canonicalDepartment: departmentLabel,
    departmentPath: departmentMeta.departmentPath || departmentName,
    departmentEn: row.department_en || "",
    positionId: row.position_uid || "",
    job: row.job || "",
    roleTitle: row.job || "",
    managerId: row.direct_manager_uid || "",
    employeeNo: row.employee_no || "",
    hireDate: toDateSlash(row.hire_date),
    employmentType: row.employment_type || "full_time",
    workLocation: row.work_location || "",
    mbti: row.mbti || "",
    skills: Array.isArray(skills) ? skills : [],
    emergencyContact: parseJson(row.emergency_contact_json, {}),
    profileNote: row.profile_note || "",
    characterLabel: row.character_label || row.job || "",
    registeredAt: toDateTimeSlash(row.registered_at)
  };
}

function mapDepartment(row = {}) {
  const departmentName = row.name || "";
  const departmentMeta = resolveDepartmentMeta(departmentName);
  const canonicalRoot = departmentMeta.departmentKey ? findDepartmentTaxonomyByKey(departmentMeta.departmentKey) : null;
  const displayDepartment = departmentMeta.displayDepartment || departmentName;
  const departmentLabel = canonicalRoot?.label || displayDepartment;
  return {
    id: row.department_uid || String(row.id || ""),
    departmentId: row.department_uid || String(row.id || ""),
    name: departmentName,
    label: departmentLabel,
    departmentKey: departmentMeta.departmentKey || "",
    departmentAliasKey: departmentMeta.childDepartmentKey || "",
    displayDepartment,
    canonicalDepartment: departmentLabel,
    departmentPath: departmentMeta.departmentPath || departmentName,
    nameEn: row.name_en || "",
    parentDepartmentId: row.parent_department_uid || "",
    managerId: row.manager_user_uid || "",
    status: row.status || "active",
    sortOrder: Number(row.sort_order || 0),
    taxonomyOrder: departmentMeta.departmentOrder,
    memberCount: Number(row.member_count || 0),
    positionCount: Number(row.position_count || 0),
    payload: parseJson(row.payload_json, {})
  };
}

function mapPosition(row = {}) {
  return {
    id: row.position_uid || String(row.id || ""),
    positionId: row.position_uid || String(row.id || ""),
    title: row.title || "",
    name: row.title || "",
    departmentId: row.department_uid || "",
    departmentName: row.department_name || "",
    level: row.level_name || "",
    description: row.description || "",
    status: row.status || "active",
    sortOrder: Number(row.sort_order || 0),
    employeeCount: Number(row.employee_count || 0),
    payload: parseJson(row.payload_json, {})
  };
}

function mapAttendance(row = {}) {
  return {
    id: row.attendance_uid || String(row.id || ""),
    attendanceId: row.attendance_uid || String(row.id || ""),
    employeeId: row.user_uid || "",
    userId: row.user_uid || "",
    employeeName: row.employee_name || "",
    username: row.username || "",
    departmentName: row.department || row.department_name || "",
    workDate: toDateSlash(row.work_date),
    checkInAt: toDateTimeSlash(row.check_in_at),
    checkOutAt: toDateTimeSlash(row.check_out_at),
    status: row.status || "present",
    hours: Number(row.hours || 0),
    note: row.note_text || "",
    payload: parseJson(row.payload_json, {})
  };
}

function mapLeave(row = {}) {
  return {
    id: row.leave_uid || String(row.id || ""),
    leaveId: row.leave_uid || String(row.id || ""),
    employeeId: row.user_uid || "",
    userId: row.user_uid || "",
    employeeName: row.employee_name || "",
    leaveType: row.leave_type || "annual",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    days: Number(row.days || 0),
    reason: row.reason_text || "",
    status: row.status || "pending",
    approverId: row.approver_uid || "",
    approvedAt: toDateTimeSlash(row.approved_at),
    payload: parseJson(row.payload_json, {})
  };
}

function mapRecruitmentJob(row = {}) {
  return {
    id: row.job_uid || String(row.id || ""),
    jobId: row.job_uid || String(row.id || ""),
    title: row.title || "",
    departmentId: row.department_uid || "",
    departmentName: row.department_name || "",
    positionId: row.position_uid || "",
    headcount: Number(row.headcount || 0),
    status: row.status || "open",
    priority: row.priority || "normal",
    ownerId: row.owner_user_uid || "",
    openedAt: toDateSlash(row.opened_at),
    closedAt: toDateSlash(row.closed_at),
    description: row.description_text || "",
    requirements: row.requirements_text || "",
    candidateCount: Number(row.candidate_count || 0),
    payload: parseJson(row.payload_json, {})
  };
}

function mapRecruitmentCandidate(row = {}) {
  return {
    id: row.candidate_uid || String(row.id || ""),
    candidateId: row.candidate_uid || String(row.id || ""),
    jobId: row.job_uid || "",
    jobTitle: row.job_title || "",
    name: row.name || "",
    phone: row.phone || "",
    email: row.email || "",
    stage: row.stage || "screening",
    source: row.source || "",
    ownerId: row.owner_user_uid || "",
    expectedSalary: Number(row.expected_salary || 0),
    resumeUrl: row.resume_url || "",
    note: row.note_text || "",
    payload: parseJson(row.payload_json, {})
  };
}

function mapPerformanceReview(row = {}) {
  return {
    id: row.review_uid || String(row.id || ""),
    reviewId: row.review_uid || String(row.id || ""),
    employeeId: row.user_uid || "",
    userId: row.user_uid || "",
    employeeName: row.employee_name || "",
    period: row.period || "",
    reviewerId: row.reviewer_uid || "",
    reviewerName: row.reviewer_name || "",
    score: Number(row.score || 0),
    grade: row.grade || "",
    status: row.status || "draft",
    goals: parseJson(row.goals_json, []),
    comments: row.comments_text || "",
    payload: parseJson(row.payload_json, {})
  };
}

function mapPayrollRecord(row = {}) {
  return {
    id: row.payroll_uid || String(row.id || ""),
    payrollId: row.payroll_uid || String(row.id || ""),
    employeeId: row.user_uid || "",
    userId: row.user_uid || "",
    employeeName: row.employee_name || "",
    payrollMonth: toDateSlash(row.payroll_month),
    baseSalary: Number(row.base_salary || 0),
    bonus: Number(row.bonus || 0),
    deduction: Number(row.deduction || 0),
    socialSecurity: Number(row.social_security || 0),
    tax: Number(row.tax || 0),
    netSalary: Number(row.net_salary || 0),
    status: row.status || "draft",
    note: row.note_text || "",
    payload: parseJson(row.payload_json, {})
  };
}

async function normalizeEmployeePayload(payload = {}) {
  const name = cleanString(payload.name || payload.displayName);
  const username = cleanString(payload.username);
  const email = cleanString(payload.email);
  const phone = cleanString(payload.phone);
  const departmentInput = cleanString(payload.departmentId || payload.departmentName || payload.department);
  const positionInput = cleanString(payload.positionId || payload.positionTitle || payload.job || payload.roleTitle);
  const department = await findDepartmentByNameOrUid(departmentInput);
  const position = await findPositionByTitleOrUid(positionInput);
  return {
    username,
    name,
    role: cleanString(payload.role, "employee"),
    status: normalizeStatus(payload.accountStatus || payload.status, "active"),
    phone,
    email,
    departmentUid: department?.department_uid || (departmentInput && departmentInput !== payload.department ? departmentInput : ""),
    departmentName: department?.name || cleanString(payload.departmentName || payload.department),
    departmentEn: cleanString(payload.departmentEn || payload.department_en || payload.departmentName || payload.department),
    job: position?.title || cleanString(payload.job || payload.roleTitle || payload.positionTitle, "成员"),
    positionUid: position?.position_uid || cleanString(payload.positionId || payload.positionUid),
    employeeNo: cleanString(payload.employeeNo || payload.employee_no),
    directManagerUid: cleanString(payload.managerId || payload.directManagerUid || payload.direct_manager_uid),
    hireDate: cleanDate(payload.hireDate || payload.hire_date),
    employmentType: cleanString(payload.employmentType || payload.employment_type, "full_time"),
    employmentStatus: normalizeStatus(payload.employmentStatus || payload.status, "active"),
    workLocation: cleanString(payload.workLocation || payload.work_location),
    skills: Array.isArray(payload.skills) ? payload.skills : [],
    emergencyContact: payload.emergencyContact || payload.emergency_contact || {},
    profilePayload: payload.payload || {}
  };
}

export async function listEmployees(query = {}) {
  await ensureHrSchemaReady();
  const { limit, offset, keyword, status, departmentId } = normalizeListQuery(query);
  const where = ["1 = 1"];
  const params = [];
  if (keyword) {
    where.push("(u.name LIKE ? OR u.username LIKE ? OR u.department LIKE ? OR u.job LIKE ? OR ep.employee_no LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where.push("(u.status = ? OR ep.employment_status = ?)");
    params.push(status, status);
  }
  if (departmentId) {
    const aliases = resolveDepartmentFilterValues(departmentId);
    const placeholders = aliases.map(() => "?").join(", ");
    where.push(`(u.department IN (${placeholders}) OR ep.department_uid = ? OR ep.department_name IN (${placeholders}))`);
    params.push(...aliases, departmentId, ...aliases);
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        u.id AS row_id, u.user_uid, u.username, u.name, u.role, u.status, u.phone, u.email,
        u.department, u.department_en, u.job, u.mbti, u.profile_note, u.character_label,
        DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS registered_at,
        ep.profile_uid, ep.employee_no, ep.department_uid AS profile_department_uid,
        ep.department_name AS profile_department_name, ep.position_uid, ep.direct_manager_uid,
        ep.hire_date, ep.employment_type, ep.employment_status, ep.work_location,
        ep.skills_json, ep.emergency_contact_json, ep.payload_json
      FROM users u
      LEFT JOIN hr_employee_profiles ep ON ep.user_uid = u.user_uid
      WHERE ${where.join(" AND ")}
      ORDER BY u.department ASC, u.name ASC, u.id ASC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapEmployee);
}

export async function getEmployee(employeeId) {
  await ensureHrSchemaReady();
  const user = await resolveUserByAnyId(employeeId);
  return fetchEmployeeByUserUid(user.user_uid);
}

export async function createEmployee(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = await normalizeEmployeePayload(payload);
  if (!normalized.username) badRequest("username is required");
  if (!normalized.name) badRequest("name is required");

  const [existing] = await mysqlPool.execute("SELECT user_uid FROM users WHERE username = ? LIMIT 1", [normalized.username]);
  if (existing.length) conflict("Employee username already exists");

  const userUid = cleanString(payload.userId || payload.userUid || payload.id) || makeUid("u");
  const passwordHash = await hashPassword(cleanString(payload.initialPassword || payload.password, DEFAULT_EMPLOYEE_PASSWORD));
  await mysqlPool.execute(
    `
      INSERT INTO users (
        user_uid, username, password_hash, name, role, status, phone, email,
        department, department_en, job, mbti, profile_note, character_label,
        avatar_image, character_image, signature_image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '')
    `,
    [
      userUid,
      normalized.username,
      passwordHash,
      normalized.name,
      normalized.role,
      normalized.status,
      normalized.phone,
      normalized.email,
      normalized.departmentName || "Unassigned Department",
      normalized.departmentEn || normalized.departmentName || "",
      normalized.job,
      cleanString(payload.mbti, "ENTP"),
      cleanString(payload.profileNote || payload.note),
      cleanString(payload.characterLabel || normalized.job)
    ]
  );

  await upsertEmployeeProfile(userUid, normalized, actorId(auth));
  return fetchEmployeeByUserUid(userUid);
}

async function upsertEmployeeProfile(userUid, normalized, actor) {
  await mysqlPool.execute(
    `
      INSERT INTO hr_employee_profiles (
        profile_uid, user_uid, employee_no, department_uid, department_name,
        position_uid, direct_manager_uid, hire_date, employment_type, employment_status,
        work_location, skills_json, emergency_contact_json, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        employee_no = VALUES(employee_no),
        department_uid = VALUES(department_uid),
        department_name = VALUES(department_name),
        position_uid = VALUES(position_uid),
        direct_manager_uid = VALUES(direct_manager_uid),
        hire_date = VALUES(hire_date),
        employment_type = VALUES(employment_type),
        employment_status = VALUES(employment_status),
        work_location = VALUES(work_location),
        skills_json = VALUES(skills_json),
        emergency_contact_json = VALUES(emergency_contact_json),
        payload_json = VALUES(payload_json),
        updated_by = VALUES(updated_by)
    `,
    [
      makeUid("hep"),
      userUid,
      normalized.employeeNo,
      normalized.departmentUid,
      normalized.departmentName,
      normalized.positionUid,
      normalized.directManagerUid,
      normalized.hireDate,
      normalized.employmentType,
      normalized.employmentStatus,
      normalized.workLocation,
      toJson(normalized.skills, []),
      toJson(normalized.emergencyContact, {}),
      toJson(normalized.profilePayload, {}),
      actor,
      actor
    ]
  );
}

export async function updateEmployee(employeeId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const user = await resolveUserByAnyId(employeeId);
  const currentEmployee = await fetchEmployeeByUserUid(user.user_uid);
  const normalized = await normalizeEmployeePayload({
    name: currentEmployee.name,
    role: currentEmployee.role,
    accountStatus: currentEmployee.accountStatus,
    phone: currentEmployee.phone,
    email: currentEmployee.email,
    departmentId: currentEmployee.departmentId,
    departmentName: currentEmployee.departmentName,
    departmentEn: currentEmployee.departmentEn,
    positionId: currentEmployee.positionId,
    job: currentEmployee.job,
    employeeNo: currentEmployee.employeeNo,
    managerId: currentEmployee.managerId,
    hireDate: currentEmployee.hireDate,
    employmentType: currentEmployee.employmentType,
    employmentStatus: currentEmployee.status,
    workLocation: currentEmployee.workLocation,
    skills: currentEmployee.skills,
    emergencyContact: currentEmployee.emergencyContact,
    profileNote: currentEmployee.profileNote,
    characterLabel: currentEmployee.characterLabel,
    mbti: currentEmployee.mbti,
    ...payload
  });

  await mysqlPool.execute(
    `
      UPDATE users
      SET
        name = COALESCE(NULLIF(?, ''), name),
        role = COALESCE(NULLIF(?, ''), role),
        status = COALESCE(NULLIF(?, ''), status),
        phone = ?,
        email = ?,
        department = COALESCE(NULLIF(?, ''), department),
        department_en = COALESCE(NULLIF(?, ''), department_en),
        job = COALESCE(NULLIF(?, ''), job),
        mbti = COALESCE(NULLIF(?, ''), mbti),
        profile_note = COALESCE(NULLIF(?, ''), profile_note),
        character_label = COALESCE(NULLIF(?, ''), character_label)
      WHERE user_uid = ?
    `,
    [
      normalized.name,
      normalized.role,
      normalized.status,
      normalized.phone,
      normalized.email,
      normalized.departmentName,
      normalized.departmentEn,
      normalized.job,
      cleanString(payload.mbti),
      cleanString(payload.profileNote || payload.note),
      cleanString(payload.characterLabel || normalized.job),
      user.user_uid
    ]
  );

  await upsertEmployeeProfile(user.user_uid, normalized, actorId(auth));
  return fetchEmployeeByUserUid(user.user_uid);
}

export async function deleteEmployee(employeeId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const user = await resolveUserByAnyId(employeeId);
  const [result] = await mysqlPool.execute(
    `
      UPDATE users
      SET status = 'inactive'
      WHERE user_uid = ?
    `,
    [user.user_uid]
  );
  if (!result.affectedRows) notFound("Employee not found");
  await mysqlPool.execute(
    `
      UPDATE hr_employee_profiles
      SET employment_status = 'inactive', updated_by = ?
      WHERE user_uid = ?
    `,
    [actorId(auth), user.user_uid]
  );
  return { ok: true, deletedEmployeeId: user.user_uid, employeeId: user.user_uid, softDeleted: true };
}

export async function listDepartments(query = {}) {
  await ensureHrSchemaReady();
  const { keyword, status, limit, offset } = normalizeListQuery(query);
  const where = ["1 = 1"];
  const params = [];
  if (keyword) {
    where.push("(d.name LIKE ? OR d.name_en LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where.push("d.status = ?");
    params.push(status);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        d.department_uid, d.name, d.name_en, d.parent_department_uid,
        d.manager_user_uid, d.status, d.sort_order, d.payload_json,
        COUNT(DISTINCT u.user_uid) AS member_count,
        COUNT(DISTINCT p.position_uid) AS position_count
      FROM departments d
      LEFT JOIN users u ON u.department = d.name AND u.status = 'active'
      LEFT JOIN hr_positions p ON p.department_uid = d.department_uid AND p.status = 'active'
      WHERE ${where.join(" AND ")}
      GROUP BY d.id
      ORDER BY d.sort_order ASC, d.id ASC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
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

export async function getDepartment(departmentId) {
  await ensureHrSchemaReady();
  const current = await findDepartmentByNameOrUid(departmentId);
  if (!current) notFound("Department not found");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        d.department_uid, d.name, d.name_en, d.parent_department_uid,
        d.manager_user_uid, d.status, d.sort_order, d.payload_json,
        COUNT(DISTINCT u.user_uid) AS member_count,
        COUNT(DISTINCT p.position_uid) AS position_count
      FROM departments d
      LEFT JOIN users u ON u.department = d.name AND u.status = 'active'
      LEFT JOIN hr_positions p ON p.department_uid = d.department_uid AND p.status = 'active'
      WHERE d.department_uid = ?
      GROUP BY d.id
      LIMIT 1
    `,
    [current.department_uid]
  );
  if (!rows.length) notFound("Department not found");
  return mapDepartment(rows[0]);
}

function normalizeDepartmentPayload(payload = {}) {
  const name = cleanString(payload.name || payload.label || payload.departmentName);
  if (!name) badRequest("department name is required");
  return {
    departmentUid: cleanString(payload.departmentId || payload.departmentUid || payload.id) || makeUid("dept"),
    name,
    nameEn: cleanString(payload.nameEn || payload.name_en || payload.name),
    parentDepartmentUid: cleanString(payload.parentDepartmentId || payload.parent_department_uid),
    managerUserUid: cleanString(payload.managerId || payload.managerUserUid || payload.manager_user_uid),
    status: normalizeStatus(payload.status, "active"),
    sortOrder: cleanNumber(payload.sortOrder ?? payload.sort_order, Date.now()),
    payload: payload.payload || {}
  };
}

export async function createDepartment(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeDepartmentPayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO departments (
        department_uid, name, name_en, parent_department_uid, manager_user_uid,
        status, sort_order, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalized.departmentUid,
      normalized.name,
      normalized.nameEn,
      normalized.parentDepartmentUid,
      normalized.managerUserUid,
      normalized.status,
      normalized.sortOrder,
      toJson(normalized.payload, {})
    ]
  );
  const [rows] = await mysqlPool.execute("SELECT * FROM departments WHERE department_uid = ? LIMIT 1", [normalized.departmentUid]);
  return mapDepartment(rows[0]);
}

export async function updateDepartment(departmentId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const current = await findDepartmentByNameOrUid(departmentId);
  if (!current) notFound("Department not found");
  const normalized = normalizeDepartmentPayload({ ...payload, departmentId: current.department_uid });
  const [result] = await mysqlPool.execute(
    `
      UPDATE departments
      SET name = ?, name_en = ?, parent_department_uid = ?, manager_user_uid = ?,
          status = ?, sort_order = ?, payload_json = ?
      WHERE department_uid = ?
    `,
    [
      normalized.name,
      normalized.nameEn,
      normalized.parentDepartmentUid,
      normalized.managerUserUid,
      normalized.status,
      normalized.sortOrder,
      toJson(normalized.payload, {}),
      current.department_uid
    ]
  );
  if (!result.affectedRows) notFound("Department not found");
  const [rows] = await mysqlPool.execute("SELECT * FROM departments WHERE department_uid = ? LIMIT 1", [current.department_uid]);
  return mapDepartment(rows[0]);
}

export async function deleteDepartment(departmentId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const current = await findDepartmentByNameOrUid(departmentId);
  if (!current) notFound("Department not found");
  const [result] = await mysqlPool.execute(
    `
      UPDATE departments
      SET status = 'inactive'
      WHERE department_uid = ?
    `,
    [current.department_uid]
  );
  if (!result.affectedRows) notFound("Department not found");
  return { ok: true, deletedDepartmentId: current.department_uid, departmentId: current.department_uid, softDeleted: true };
}

export async function listPositions(query = {}) {
  await ensureHrSchemaReady();
  const { keyword, status, departmentId, limit, offset } = normalizeListQuery(query);
  const where = ["1 = 1"];
  const params = [];
  if (keyword) {
    where.push("(p.title LIKE ? OR p.department_name LIKE ? OR p.level_name LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where.push("p.status = ?");
    params.push(status);
  }
  if (departmentId) {
    where.push("(p.department_uid = ? OR p.department_name = ?)");
    params.push(departmentId, departmentId);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        p.*,
        COUNT(DISTINCT ep.user_uid) AS employee_count
      FROM hr_positions p
      LEFT JOIN hr_employee_profiles ep ON ep.position_uid = p.position_uid AND ep.employment_status = 'active'
      WHERE ${where.join(" AND ")}
      GROUP BY p.id
      ORDER BY p.sort_order ASC, p.id ASC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapPosition);
}

export async function getPosition(positionId) {
  await ensureHrSchemaReady();
  const current = await findPositionByTitleOrUid(positionId);
  if (!current) notFound("Position not found");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        p.*,
        COUNT(DISTINCT ep.user_uid) AS employee_count
      FROM hr_positions p
      LEFT JOIN hr_employee_profiles ep ON ep.position_uid = p.position_uid AND ep.employment_status = 'active'
      WHERE p.position_uid = ?
      GROUP BY p.id
      LIMIT 1
    `,
    [current.position_uid]
  );
  if (!rows.length) notFound("Position not found");
  return mapPosition(rows[0]);
}

function normalizePositionPayload(payload = {}) {
  const title = cleanString(payload.title || payload.name);
  if (!title) badRequest("position title is required");
  return {
    positionUid: cleanString(payload.positionId || payload.positionUid || payload.id) || makeUid("pos"),
    title,
    departmentUid: cleanString(payload.departmentId || payload.departmentUid),
    departmentName: cleanString(payload.departmentName || payload.department),
    levelName: cleanString(payload.level || payload.levelName || payload.level_name),
    description: cleanString(payload.description),
    status: normalizeStatus(payload.status, "active"),
    sortOrder: cleanNumber(payload.sortOrder ?? payload.sort_order, Date.now()),
    payload: payload.payload || {}
  };
}

export async function createPosition(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizePositionPayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO hr_positions (
        position_uid, title, department_uid, department_name, level_name,
        description, status, sort_order, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalized.positionUid,
      normalized.title,
      normalized.departmentUid,
      normalized.departmentName,
      normalized.levelName,
      normalized.description,
      normalized.status,
      normalized.sortOrder,
      toJson(normalized.payload, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  const [rows] = await mysqlPool.execute("SELECT * FROM hr_positions WHERE position_uid = ? LIMIT 1", [normalized.positionUid]);
  return mapPosition(rows[0]);
}

export async function updatePosition(positionId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const current = await findPositionByTitleOrUid(positionId);
  if (!current) notFound("Position not found");
  const normalized = normalizePositionPayload({ ...payload, positionId: current.position_uid });
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_positions
      SET title = ?, department_uid = ?, department_name = ?, level_name = ?,
          description = ?, status = ?, sort_order = ?, payload_json = ?, updated_by = ?
      WHERE position_uid = ?
    `,
    [
      normalized.title,
      normalized.departmentUid,
      normalized.departmentName,
      normalized.levelName,
      normalized.description,
      normalized.status,
      normalized.sortOrder,
      toJson(normalized.payload, {}),
      actorId(auth),
      current.position_uid
    ]
  );
  if (!result.affectedRows) notFound("Position not found");
  const [rows] = await mysqlPool.execute("SELECT * FROM hr_positions WHERE position_uid = ? LIMIT 1", [current.position_uid]);
  return mapPosition(rows[0]);
}

export async function deletePosition(positionId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const current = await findPositionByTitleOrUid(positionId);
  if (!current) notFound("Position not found");
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_positions
      SET status = 'inactive', updated_by = ?
      WHERE position_uid = ?
    `,
    [actorId(auth), current.position_uid]
  );
  if (!result.affectedRows) notFound("Position not found");
  return { ok: true, deletedPositionId: current.position_uid, positionId: current.position_uid, softDeleted: true };
}

export async function listAttendanceRecords(query = {}) {
  await ensureHrSchemaReady();
  const { userId, status, limit, offset } = normalizeListQuery(query);
  const startDate = cleanDate(query.startDate || query.start_date, null);
  const endDate = cleanDate(query.endDate || query.end_date, null);
  const where = ["1 = 1"];
  const params = [];
  if (userId) {
    where.push("a.user_uid = ?");
    params.push(userId);
  }
  if (status) {
    where.push("a.status = ?");
    params.push(status);
  }
  if (startDate) {
    where.push("a.work_date >= ?");
    params.push(startDate);
  }
  if (endDate) {
    where.push("a.work_date <= ?");
    params.push(endDate);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT a.*, u.name AS employee_name, u.username, u.department
      FROM hr_attendance_records a
      LEFT JOIN users u ON u.user_uid = a.user_uid
      WHERE ${where.join(" AND ")}
      ORDER BY a.work_date DESC, a.id DESC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapAttendance);
}

export async function getAttendanceRecord(attendanceId) {
  await ensureHrSchemaReady();
  const [rows] = await mysqlPool.execute(
    `
      SELECT a.*, u.name AS employee_name, u.username, u.department
      FROM hr_attendance_records a
      LEFT JOIN users u ON u.user_uid = a.user_uid
      WHERE a.attendance_uid = ?
      LIMIT 1
    `,
    [attendanceId]
  );
  if (!rows.length) notFound("Attendance record not found");
  return mapAttendance(rows[0]);
}

function normalizeAttendancePayload(payload = {}) {
  const userUid = cleanString(payload.userId || payload.employeeId || payload.user_uid);
  if (!userUid) badRequest("employeeId is required");
  const workDate = cleanDate(payload.workDate || payload.work_date, null);
  if (!workDate) badRequest("workDate is required");
  return {
    attendanceUid: cleanString(payload.attendanceId || payload.attendanceUid || payload.id) || makeUid("att"),
    userUid,
    workDate,
    checkInAt: cleanDateTime(payload.checkInAt || payload.check_in_at),
    checkOutAt: cleanDateTime(payload.checkOutAt || payload.check_out_at),
    status: cleanString(payload.status, "present"),
    hours: cleanNumber(payload.hours, 0),
    note: cleanString(payload.note || payload.noteText),
    payload: payload.payload || {}
  };
}

export async function createAttendanceRecord(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeAttendancePayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO hr_attendance_records (
        attendance_uid, user_uid, work_date, check_in_at, check_out_at,
        status, hours, note_text, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        check_in_at = VALUES(check_in_at),
        check_out_at = VALUES(check_out_at),
        status = VALUES(status),
        hours = VALUES(hours),
        note_text = VALUES(note_text),
        payload_json = VALUES(payload_json),
        updated_by = VALUES(updated_by)
    `,
    [
      normalized.attendanceUid,
      normalized.userUid,
      normalized.workDate,
      normalized.checkInAt,
      normalized.checkOutAt,
      normalized.status,
      normalized.hours,
      normalized.note,
      toJson(normalized.payload, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  return listAttendanceRecords({ userId: normalized.userUid, startDate: normalized.workDate, endDate: normalized.workDate, limit: 1 }).then((items) => items[0]);
}

export async function updateAttendanceRecord(attendanceId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeAttendancePayload(payload);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_attendance_records
      SET user_uid = ?, work_date = ?, check_in_at = ?, check_out_at = ?,
          status = ?, hours = ?, note_text = ?, payload_json = ?, updated_by = ?
      WHERE attendance_uid = ?
    `,
    [
      normalized.userUid,
      normalized.workDate,
      normalized.checkInAt,
      normalized.checkOutAt,
      normalized.status,
      normalized.hours,
      normalized.note,
      toJson(normalized.payload, {}),
      actorId(auth),
      attendanceId
    ]
  );
  if (!result.affectedRows) notFound("Attendance record not found");
  const [rows] = await mysqlPool.execute(
    "SELECT a.*, u.name AS employee_name, u.username, u.department FROM hr_attendance_records a LEFT JOIN users u ON u.user_uid = a.user_uid WHERE a.attendance_uid = ? LIMIT 1",
    [attendanceId]
  );
  return mapAttendance(rows[0]);
}

export async function deleteAttendanceRecord(attendanceId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_attendance_records
      SET status = 'void', updated_by = ?
      WHERE attendance_uid = ?
    `,
    [actorId(auth), attendanceId]
  );
  if (!result.affectedRows) notFound("Attendance record not found");
  return { ok: true, deletedAttendanceId: attendanceId, attendanceId, softDeleted: true };
}

export async function listLeaveRequests(query = {}) {
  await ensureHrSchemaReady();
  const { userId, status, limit, offset } = normalizeListQuery(query);
  const where = ["1 = 1"];
  const params = [];
  if (userId) {
    where.push("l.user_uid = ?");
    params.push(userId);
  }
  if (status) {
    where.push("l.status = ?");
    params.push(status);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT l.*, u.name AS employee_name
      FROM hr_leave_requests l
      LEFT JOIN users u ON u.user_uid = l.user_uid
      WHERE ${where.join(" AND ")}
      ORDER BY l.start_date DESC, l.id DESC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapLeave);
}

export async function getLeaveRequest(leaveId) {
  await ensureHrSchemaReady();
  const [rows] = await mysqlPool.execute(
    `
      SELECT l.*, u.name AS employee_name
      FROM hr_leave_requests l
      LEFT JOIN users u ON u.user_uid = l.user_uid
      WHERE l.leave_uid = ?
      LIMIT 1
    `,
    [leaveId]
  );
  if (!rows.length) notFound("Leave request not found");
  return mapLeave(rows[0]);
}

function normalizeLeavePayload(payload = {}) {
  const userUid = cleanString(payload.userId || payload.employeeId || payload.user_uid);
  if (!userUid) badRequest("employeeId is required");
  const startDate = cleanDate(payload.startDate || payload.start_date, null);
  const endDate = cleanDate(payload.endDate || payload.end_date || payload.startDate, null);
  if (!startDate || !endDate) badRequest("startDate and endDate are required");
  return {
    leaveUid: cleanString(payload.leaveId || payload.leaveUid || payload.id) || makeUid("leave"),
    userUid,
    leaveType: cleanString(payload.leaveType || payload.leave_type, "annual"),
    startDate,
    endDate,
    days: cleanNumber(payload.days, 1),
    reason: cleanString(payload.reason || payload.reasonText),
    status: cleanString(payload.status, "pending"),
    approverUid: cleanString(payload.approverId || payload.approverUid || payload.approver_uid),
    approvedAt: cleanDateTime(payload.approvedAt || payload.approved_at),
    payload: payload.payload || {}
  };
}

export async function createLeaveRequest(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeLeavePayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO hr_leave_requests (
        leave_uid, user_uid, leave_type, start_date, end_date, days,
        reason_text, status, approver_uid, approved_at, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalized.leaveUid,
      normalized.userUid,
      normalized.leaveType,
      normalized.startDate,
      normalized.endDate,
      normalized.days,
      normalized.reason,
      normalized.status,
      normalized.approverUid,
      normalized.approvedAt,
      toJson(normalized.payload, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  const [rows] = await mysqlPool.execute(
    "SELECT l.*, u.name AS employee_name FROM hr_leave_requests l LEFT JOIN users u ON u.user_uid = l.user_uid WHERE l.leave_uid = ? LIMIT 1",
    [normalized.leaveUid]
  );
  return mapLeave(rows[0]);
}

export async function updateLeaveRequest(leaveId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeLeavePayload(payload);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_leave_requests
      SET user_uid = ?, leave_type = ?, start_date = ?, end_date = ?, days = ?,
          reason_text = ?, status = ?, approver_uid = ?, approved_at = ?,
          payload_json = ?, updated_by = ?
      WHERE leave_uid = ?
    `,
    [
      normalized.userUid,
      normalized.leaveType,
      normalized.startDate,
      normalized.endDate,
      normalized.days,
      normalized.reason,
      normalized.status,
      normalized.approverUid,
      normalized.approvedAt,
      toJson(normalized.payload, {}),
      actorId(auth),
      leaveId
    ]
  );
  if (!result.affectedRows) notFound("Leave request not found");
  const [rows] = await mysqlPool.execute(
    "SELECT l.*, u.name AS employee_name FROM hr_leave_requests l LEFT JOIN users u ON u.user_uid = l.user_uid WHERE l.leave_uid = ? LIMIT 1",
    [leaveId]
  );
  return mapLeave(rows[0]);
}

export async function deleteLeaveRequest(leaveId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_leave_requests
      SET status = 'cancelled', updated_by = ?
      WHERE leave_uid = ?
    `,
    [actorId(auth), leaveId]
  );
  if (!result.affectedRows) notFound("Leave request not found");
  return { ok: true, deletedLeaveId: leaveId, leaveId, softDeleted: true };
}

export async function listRecruitmentJobs(query = {}) {
  await ensureHrSchemaReady();
  const { keyword, status, departmentId, limit, offset } = normalizeListQuery(query);
  const where = ["1 = 1"];
  const params = [];
  if (keyword) {
    where.push("(j.title LIKE ? OR j.department_name LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where.push("j.status = ?");
    params.push(status);
  }
  if (departmentId) {
    where.push("(j.department_uid = ? OR j.department_name = ?)");
    params.push(departmentId, departmentId);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT j.*, COUNT(c.candidate_uid) AS candidate_count
      FROM hr_recruitment_jobs j
      LEFT JOIN hr_recruitment_candidates c ON c.job_uid = j.job_uid
      WHERE ${where.join(" AND ")}
      GROUP BY j.id
      ORDER BY j.created_at DESC, j.id DESC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapRecruitmentJob);
}

export async function getRecruitmentJob(jobId) {
  await ensureHrSchemaReady();
  const [rows] = await mysqlPool.execute(
    `
      SELECT j.*, COUNT(c.candidate_uid) AS candidate_count
      FROM hr_recruitment_jobs j
      LEFT JOIN hr_recruitment_candidates c ON c.job_uid = j.job_uid
      WHERE j.job_uid = ?
      GROUP BY j.id
      LIMIT 1
    `,
    [jobId]
  );
  if (!rows.length) notFound("Recruitment job not found");
  return mapRecruitmentJob(rows[0]);
}

function normalizeRecruitmentJobPayload(payload = {}) {
  const title = cleanString(payload.title || payload.name);
  if (!title) badRequest("job title is required");
  return {
    jobUid: cleanString(payload.jobId || payload.jobUid || payload.id) || makeUid("rjob"),
    title,
    departmentUid: cleanString(payload.departmentId || payload.departmentUid),
    departmentName: cleanString(payload.departmentName || payload.department),
    positionUid: cleanString(payload.positionId || payload.positionUid),
    headcount: Math.max(1, cleanNumber(payload.headcount, 1)),
    status: cleanString(payload.status, "open"),
    priority: cleanString(payload.priority, "normal"),
    ownerUserUid: cleanString(payload.ownerId || payload.ownerUserUid || payload.owner_user_uid),
    openedAt: cleanDate(payload.openedAt || payload.opened_at, null),
    closedAt: cleanDate(payload.closedAt || payload.closed_at, null),
    description: cleanString(payload.description),
    requirements: cleanString(payload.requirements),
    payload: payload.payload || {}
  };
}

export async function createRecruitmentJob(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeRecruitmentJobPayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO hr_recruitment_jobs (
        job_uid, title, department_uid, department_name, position_uid, headcount,
        status, priority, owner_user_uid, opened_at, closed_at, description_text,
        requirements_text, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalized.jobUid,
      normalized.title,
      normalized.departmentUid,
      normalized.departmentName,
      normalized.positionUid,
      normalized.headcount,
      normalized.status,
      normalized.priority,
      normalized.ownerUserUid,
      normalized.openedAt,
      normalized.closedAt,
      normalized.description,
      normalized.requirements,
      toJson(normalized.payload, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  return listRecruitmentJobs({ jobId: normalized.jobUid, limit: 1 }).then(async () => {
    const [rows] = await mysqlPool.execute("SELECT * FROM hr_recruitment_jobs WHERE job_uid = ? LIMIT 1", [normalized.jobUid]);
    return mapRecruitmentJob(rows[0]);
  });
}

export async function updateRecruitmentJob(jobId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeRecruitmentJobPayload({ ...payload, jobId });
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_recruitment_jobs
      SET title = ?, department_uid = ?, department_name = ?, position_uid = ?, headcount = ?,
          status = ?, priority = ?, owner_user_uid = ?, opened_at = ?, closed_at = ?,
          description_text = ?, requirements_text = ?, payload_json = ?, updated_by = ?
      WHERE job_uid = ?
    `,
    [
      normalized.title,
      normalized.departmentUid,
      normalized.departmentName,
      normalized.positionUid,
      normalized.headcount,
      normalized.status,
      normalized.priority,
      normalized.ownerUserUid,
      normalized.openedAt,
      normalized.closedAt,
      normalized.description,
      normalized.requirements,
      toJson(normalized.payload, {}),
      actorId(auth),
      jobId
    ]
  );
  if (!result.affectedRows) notFound("Recruitment job not found");
  const [rows] = await mysqlPool.execute("SELECT * FROM hr_recruitment_jobs WHERE job_uid = ? LIMIT 1", [jobId]);
  return mapRecruitmentJob(rows[0]);
}

export async function deleteRecruitmentJob(jobId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_recruitment_jobs
      SET status = 'closed', closed_at = COALESCE(closed_at, CURRENT_DATE), updated_by = ?
      WHERE job_uid = ?
    `,
    [actorId(auth), jobId]
  );
  if (!result.affectedRows) notFound("Recruitment job not found");
  return { ok: true, deletedJobId: jobId, jobId, softDeleted: true };
}

export async function listRecruitmentCandidates(query = {}) {
  await ensureHrSchemaReady();
  const { keyword, status, limit, offset } = normalizeListQuery(query);
  const jobId = cleanString(query.jobId || query.job_uid);
  const where = ["1 = 1"];
  const params = [];
  if (keyword) {
    where.push("(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where.push("c.stage = ?");
    params.push(status);
  }
  if (jobId) {
    where.push("c.job_uid = ?");
    params.push(jobId);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT c.*, j.title AS job_title
      FROM hr_recruitment_candidates c
      LEFT JOIN hr_recruitment_jobs j ON j.job_uid = c.job_uid
      WHERE ${where.join(" AND ")}
      ORDER BY c.updated_at DESC, c.id DESC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapRecruitmentCandidate);
}

export async function getRecruitmentCandidate(candidateId) {
  await ensureHrSchemaReady();
  const [rows] = await mysqlPool.execute(
    `
      SELECT c.*, j.title AS job_title
      FROM hr_recruitment_candidates c
      LEFT JOIN hr_recruitment_jobs j ON j.job_uid = c.job_uid
      WHERE c.candidate_uid = ?
      LIMIT 1
    `,
    [candidateId]
  );
  if (!rows.length) notFound("Recruitment candidate not found");
  return mapRecruitmentCandidate(rows[0]);
}

function normalizeRecruitmentCandidatePayload(payload = {}) {
  const name = cleanString(payload.name);
  if (!name) badRequest("candidate name is required");
  return {
    candidateUid: cleanString(payload.candidateId || payload.candidateUid || payload.id) || makeUid("cand"),
    jobUid: cleanString(payload.jobId || payload.jobUid || payload.job_uid),
    name,
    phone: cleanString(payload.phone),
    email: cleanString(payload.email),
    stage: cleanString(payload.stage || payload.status, "screening"),
    source: cleanString(payload.source),
    ownerUserUid: cleanString(payload.ownerId || payload.ownerUserUid || payload.owner_user_uid),
    expectedSalary: cleanMoney(payload.expectedSalary || payload.expected_salary, 0),
    resumeUrl: cleanString(payload.resumeUrl || payload.resume_url),
    note: cleanString(payload.note || payload.noteText),
    payload: payload.payload || {}
  };
}

export async function createRecruitmentCandidate(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeRecruitmentCandidatePayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO hr_recruitment_candidates (
        candidate_uid, job_uid, name, phone, email, stage, source, owner_user_uid,
        expected_salary, resume_url, note_text, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalized.candidateUid,
      normalized.jobUid,
      normalized.name,
      normalized.phone,
      normalized.email,
      normalized.stage,
      normalized.source,
      normalized.ownerUserUid,
      normalized.expectedSalary,
      normalized.resumeUrl,
      normalized.note,
      toJson(normalized.payload, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  const [rows] = await mysqlPool.execute(
    "SELECT c.*, j.title AS job_title FROM hr_recruitment_candidates c LEFT JOIN hr_recruitment_jobs j ON j.job_uid = c.job_uid WHERE c.candidate_uid = ? LIMIT 1",
    [normalized.candidateUid]
  );
  return mapRecruitmentCandidate(rows[0]);
}

export async function updateRecruitmentCandidate(candidateId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizeRecruitmentCandidatePayload({ ...payload, candidateId });
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_recruitment_candidates
      SET job_uid = ?, name = ?, phone = ?, email = ?, stage = ?, source = ?,
          owner_user_uid = ?, expected_salary = ?, resume_url = ?, note_text = ?,
          payload_json = ?, updated_by = ?
      WHERE candidate_uid = ?
    `,
    [
      normalized.jobUid,
      normalized.name,
      normalized.phone,
      normalized.email,
      normalized.stage,
      normalized.source,
      normalized.ownerUserUid,
      normalized.expectedSalary,
      normalized.resumeUrl,
      normalized.note,
      toJson(normalized.payload, {}),
      actorId(auth),
      candidateId
    ]
  );
  if (!result.affectedRows) notFound("Recruitment candidate not found");
  const [rows] = await mysqlPool.execute(
    "SELECT c.*, j.title AS job_title FROM hr_recruitment_candidates c LEFT JOIN hr_recruitment_jobs j ON j.job_uid = c.job_uid WHERE c.candidate_uid = ? LIMIT 1",
    [candidateId]
  );
  return mapRecruitmentCandidate(rows[0]);
}

export async function deleteRecruitmentCandidate(candidateId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_recruitment_candidates
      SET stage = 'rejected', updated_by = ?
      WHERE candidate_uid = ?
    `,
    [actorId(auth), candidateId]
  );
  if (!result.affectedRows) notFound("Recruitment candidate not found");
  return { ok: true, deletedCandidateId: candidateId, candidateId, softDeleted: true };
}

export async function listPerformanceReviews(query = {}) {
  await ensureHrSchemaReady();
  const { userId, status, limit, offset } = normalizeListQuery(query);
  const period = cleanString(query.period);
  const where = ["1 = 1"];
  const params = [];
  if (userId) {
    where.push("r.user_uid = ?");
    params.push(userId);
  }
  if (status) {
    where.push("r.status = ?");
    params.push(status);
  }
  if (period) {
    where.push("r.period = ?");
    params.push(period);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT r.*, u.name AS employee_name, reviewer.name AS reviewer_name
      FROM hr_performance_reviews r
      LEFT JOIN users u ON u.user_uid = r.user_uid
      LEFT JOIN users reviewer ON reviewer.user_uid = r.reviewer_uid
      WHERE ${where.join(" AND ")}
      ORDER BY r.period DESC, r.id DESC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapPerformanceReview);
}

export async function getPerformanceReview(reviewId) {
  await ensureHrSchemaReady();
  const [rows] = await mysqlPool.execute(
    `
      SELECT r.*, u.name AS employee_name, reviewer.name AS reviewer_name
      FROM hr_performance_reviews r
      LEFT JOIN users u ON u.user_uid = r.user_uid
      LEFT JOIN users reviewer ON reviewer.user_uid = r.reviewer_uid
      WHERE r.review_uid = ?
      LIMIT 1
    `,
    [reviewId]
  );
  if (!rows.length) notFound("Performance review not found");
  return mapPerformanceReview(rows[0]);
}

function normalizePerformancePayload(payload = {}) {
  const userUid = cleanString(payload.userId || payload.employeeId || payload.user_uid);
  const period = cleanString(payload.period);
  if (!userUid) badRequest("employeeId is required");
  if (!period) badRequest("period is required");
  return {
    reviewUid: cleanString(payload.reviewId || payload.reviewUid || payload.id) || makeUid("perf"),
    userUid,
    period,
    reviewerUid: cleanString(payload.reviewerId || payload.reviewerUid || payload.reviewer_uid),
    score: cleanNumber(payload.score, 0),
    grade: cleanString(payload.grade),
    status: cleanString(payload.status, "draft"),
    goals: Array.isArray(payload.goals) ? payload.goals : [],
    comments: cleanString(payload.comments || payload.comment),
    payload: payload.payload || {}
  };
}

export async function createPerformanceReview(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizePerformancePayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO hr_performance_reviews (
        review_uid, user_uid, period, reviewer_uid, score, grade, status,
        goals_json, comments_text, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        reviewer_uid = VALUES(reviewer_uid),
        score = VALUES(score),
        grade = VALUES(grade),
        status = VALUES(status),
        goals_json = VALUES(goals_json),
        comments_text = VALUES(comments_text),
        payload_json = VALUES(payload_json),
        updated_by = VALUES(updated_by)
    `,
    [
      normalized.reviewUid,
      normalized.userUid,
      normalized.period,
      normalized.reviewerUid,
      normalized.score,
      normalized.grade,
      normalized.status,
      toJson(normalized.goals, []),
      normalized.comments,
      toJson(normalized.payload, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  const [rows] = await mysqlPool.execute(
    "SELECT r.*, u.name AS employee_name, reviewer.name AS reviewer_name FROM hr_performance_reviews r LEFT JOIN users u ON u.user_uid = r.user_uid LEFT JOIN users reviewer ON reviewer.user_uid = r.reviewer_uid WHERE r.user_uid = ? AND r.period = ? LIMIT 1",
    [normalized.userUid, normalized.period]
  );
  return mapPerformanceReview(rows[0]);
}

export async function updatePerformanceReview(reviewId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizePerformancePayload(payload);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_performance_reviews
      SET user_uid = ?, period = ?, reviewer_uid = ?, score = ?, grade = ?, status = ?,
          goals_json = ?, comments_text = ?, payload_json = ?, updated_by = ?
      WHERE review_uid = ?
    `,
    [
      normalized.userUid,
      normalized.period,
      normalized.reviewerUid,
      normalized.score,
      normalized.grade,
      normalized.status,
      toJson(normalized.goals, []),
      normalized.comments,
      toJson(normalized.payload, {}),
      actorId(auth),
      reviewId
    ]
  );
  if (!result.affectedRows) notFound("Performance review not found");
  const [rows] = await mysqlPool.execute(
    "SELECT r.*, u.name AS employee_name, reviewer.name AS reviewer_name FROM hr_performance_reviews r LEFT JOIN users u ON u.user_uid = r.user_uid LEFT JOIN users reviewer ON reviewer.user_uid = r.reviewer_uid WHERE r.review_uid = ? LIMIT 1",
    [reviewId]
  );
  return mapPerformanceReview(rows[0]);
}

export async function deletePerformanceReview(reviewId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_performance_reviews
      SET status = 'archived', updated_by = ?
      WHERE review_uid = ?
    `,
    [actorId(auth), reviewId]
  );
  if (!result.affectedRows) notFound("Performance review not found");
  return { ok: true, deletedReviewId: reviewId, reviewId, softDeleted: true };
}

export async function listPayrollRecords(query = {}) {
  await ensureHrSchemaReady();
  const { userId, status, limit, offset } = normalizeListQuery(query);
  const month = cleanDate(query.month || query.payrollMonth || query.payroll_month, null);
  const where = ["1 = 1"];
  const params = [];
  if (userId) {
    where.push("p.user_uid = ?");
    params.push(userId);
  }
  if (status) {
    where.push("p.status = ?");
    params.push(status);
  }
  if (month) {
    where.push("p.payroll_month = ?");
    params.push(month);
  }
  const [rows] = await mysqlPool.execute(
    `
      SELECT p.*, u.name AS employee_name
      FROM hr_payroll_records p
      LEFT JOIN users u ON u.user_uid = p.user_uid
      WHERE ${where.join(" AND ")}
      ORDER BY p.payroll_month DESC, p.id DESC
      ${paginationSql(limit, offset)}
    `,
    includeLimitOffset(params, limit, offset)
  );
  return rows.map(mapPayrollRecord);
}

export async function getPayrollRecord(payrollId) {
  await ensureHrSchemaReady();
  const [rows] = await mysqlPool.execute(
    `
      SELECT p.*, u.name AS employee_name
      FROM hr_payroll_records p
      LEFT JOIN users u ON u.user_uid = p.user_uid
      WHERE p.payroll_uid = ?
      LIMIT 1
    `,
    [payrollId]
  );
  if (!rows.length) notFound("Payroll record not found");
  return mapPayrollRecord(rows[0]);
}

function normalizePayrollPayload(payload = {}) {
  const userUid = cleanString(payload.userId || payload.employeeId || payload.user_uid);
  const payrollMonth = cleanDate(payload.payrollMonth || payload.month || payload.payroll_month, null);
  if (!userUid) badRequest("employeeId is required");
  if (!payrollMonth) badRequest("payrollMonth is required");
  const baseSalary = cleanMoney(payload.baseSalary || payload.base_salary, 0);
  const bonus = cleanMoney(payload.bonus, 0);
  const deduction = cleanMoney(payload.deduction, 0);
  const socialSecurity = cleanMoney(payload.socialSecurity || payload.social_security, 0);
  const tax = cleanMoney(payload.tax, 0);
  const netSalary = payload.netSalary === undefined && payload.net_salary === undefined
    ? cleanMoney(baseSalary + bonus - deduction - socialSecurity - tax, 0)
    : cleanMoney(payload.netSalary || payload.net_salary, 0);
  return {
    payrollUid: cleanString(payload.payrollId || payload.payrollUid || payload.id) || makeUid("pay"),
    userUid,
    payrollMonth,
    baseSalary,
    bonus,
    deduction,
    socialSecurity,
    tax,
    netSalary,
    status: cleanString(payload.status, "draft"),
    note: cleanString(payload.note || payload.noteText),
    payload: payload.payload || {}
  };
}

export async function createPayrollRecord(payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizePayrollPayload(payload);
  await mysqlPool.execute(
    `
      INSERT INTO hr_payroll_records (
        payroll_uid, user_uid, payroll_month, base_salary, bonus, deduction,
        social_security, tax, net_salary, status, note_text, payload_json,
        created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        base_salary = VALUES(base_salary),
        bonus = VALUES(bonus),
        deduction = VALUES(deduction),
        social_security = VALUES(social_security),
        tax = VALUES(tax),
        net_salary = VALUES(net_salary),
        status = VALUES(status),
        note_text = VALUES(note_text),
        payload_json = VALUES(payload_json),
        updated_by = VALUES(updated_by)
    `,
    [
      normalized.payrollUid,
      normalized.userUid,
      normalized.payrollMonth,
      normalized.baseSalary,
      normalized.bonus,
      normalized.deduction,
      normalized.socialSecurity,
      normalized.tax,
      normalized.netSalary,
      normalized.status,
      normalized.note,
      toJson(normalized.payload, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  const [rows] = await mysqlPool.execute(
    "SELECT p.*, u.name AS employee_name FROM hr_payroll_records p LEFT JOIN users u ON u.user_uid = p.user_uid WHERE p.user_uid = ? AND p.payroll_month = ? LIMIT 1",
    [normalized.userUid, normalized.payrollMonth]
  );
  return mapPayrollRecord(rows[0]);
}

export async function updatePayrollRecord(payrollId, payload = {}, auth = {}) {
  await ensureHrSchemaReady();
  assertWritable(auth);
  const normalized = normalizePayrollPayload(payload);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_payroll_records
      SET user_uid = ?, payroll_month = ?, base_salary = ?, bonus = ?, deduction = ?,
          social_security = ?, tax = ?, net_salary = ?, status = ?, note_text = ?,
          payload_json = ?, updated_by = ?
      WHERE payroll_uid = ?
    `,
    [
      normalized.userUid,
      normalized.payrollMonth,
      normalized.baseSalary,
      normalized.bonus,
      normalized.deduction,
      normalized.socialSecurity,
      normalized.tax,
      normalized.netSalary,
      normalized.status,
      normalized.note,
      toJson(normalized.payload, {}),
      actorId(auth),
      payrollId
    ]
  );
  if (!result.affectedRows) notFound("Payroll record not found");
  const [rows] = await mysqlPool.execute(
    "SELECT p.*, u.name AS employee_name FROM hr_payroll_records p LEFT JOIN users u ON u.user_uid = p.user_uid WHERE p.payroll_uid = ? LIMIT 1",
    [payrollId]
  );
  return mapPayrollRecord(rows[0]);
}

export async function deletePayrollRecord(payrollId, auth = {}) {
  await ensureHrSchemaReady();
  assertDeletable(auth);
  const [result] = await mysqlPool.execute(
    `
      UPDATE hr_payroll_records
      SET status = 'void', updated_by = ?
      WHERE payroll_uid = ?
    `,
    [actorId(auth), payrollId]
  );
  if (!result.affectedRows) notFound("Payroll record not found");
  return { ok: true, deletedPayrollId: payrollId, payrollId, softDeleted: true };
}

function splitScopeList(value) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function companyScope() {
  return { type: "company", departmentIds: [], projectIds: [], userIds: [] };
}

function selfScope(auth = {}) {
  const userId = actorId(auth);
  return { type: "self", departmentIds: [], projectIds: [], userIds: userId ? [userId] : [] };
}

function resolveRequestedScope(query = {}) {
  return {
    departmentId: cleanString(query.department || query.departmentId || query.department_id),
    projectId: cleanString(query.projectId || query.projectUid || query.project_id || query.project_uid)
  };
}

function resolveAuthorizedManagerScope(auth = {}) {
  const departmentIds = [
    cleanString(auth.department),
    cleanString(auth.departmentId || auth.departmentUid || auth.department_uid),
    ...splitScopeList(auth.departmentIds || auth.departmentUids || auth.departments)
  ].filter(Boolean);
  const projectIds = [
    cleanString(auth.projectId || auth.projectUid || auth.project_id || auth.project_uid),
    ...splitScopeList(auth.projectIds || auth.projectUids || auth.projects)
  ].filter(Boolean);
  return {
    departmentIds: Array.from(new Set(departmentIds)),
    projectIds: Array.from(new Set(projectIds)),
    userIds: actorId(auth) ? [actorId(auth)] : []
  };
}

function canNarrowToDepartment(requested = "", authorized = {}) {
  const clean = cleanString(requested);
  return Boolean(clean && authorized.departmentIds.includes(clean));
}

function canNarrowToProject(requested = "", authorized = {}) {
  const clean = cleanString(requested);
  return Boolean(clean && authorized.projectIds.includes(clean));
}

function authorizedScope(auth = {}) {
  const authorized = resolveAuthorizedManagerScope(auth);
  if (authorized.departmentIds[0]) {
    return { type: "department", departmentIds: [authorized.departmentIds[0]], projectIds: [], userIds: authorized.userIds };
  }
  if (authorized.projectIds[0]) {
    return { type: "project", departmentIds: [], projectIds: [authorized.projectIds[0]], userIds: authorized.userIds };
  }
  return { type: "authorized", departmentIds: [], projectIds: [], userIds: authorized.userIds };
}

function resolveScope(auth = {}, query = {}) {
  const role = normalizeRole(auth);
  const requested = resolveRequestedScope(query);
  if (role === "admin" || hasPermission(auth, "hr.manage")) {
    if (requested.departmentId) return { type: "department", departmentIds: [requested.departmentId], projectIds: [], userIds: [] };
    if (requested.projectId) return { type: "project", departmentIds: [], projectIds: [requested.projectId], userIds: [] };
    return companyScope();
  }
  if (role === "manager" || hasPermission(auth, "hr.read") || hasPermission(auth, "workspace.write")) {
    const authorized = resolveAuthorizedManagerScope(auth);
    if (canNarrowToDepartment(requested.departmentId, authorized)) {
      return { type: "department", departmentIds: [requested.departmentId], projectIds: [], userIds: authorized.userIds };
    }
    if (canNarrowToProject(requested.projectId, authorized)) {
      return { type: "project", departmentIds: [], projectIds: [requested.projectId], userIds: authorized.userIds };
    }
    return authorizedScope(auth);
  }
  return selfScope(auth);
}

function buildResourcePermissions(auth = {}, query = {}) {
  const scope = resolveScope(auth, query);
  return {
    canViewSuperAdminView: scope.type === "company",
    canViewProjectManagerView: ["company", "project", "authorized"].includes(scope.type),
    canViewDepartmentView: scope.type !== "self",
    canViewOtherPersonView: scope.type !== "self",
    canViewFreePool: scope.type !== "self",
    canViewConflictRisk: scope.type !== "self",
    canCreateAssignmentPreview: scope.type !== "self",
    canAssignTask: scope.type !== "self",
    canTransferConflictTask: scope.type !== "self",
    canForceAssignOverload: scope.type !== "self" && hasPermission(auth, "resource.forceassign"),
    canExportReport: scope.type !== "self",
    scope,
    ...getRoleCapabilities(auth)
  };
}

function mapResourcePerson(row = {}) {
  const skills = parseJson(row.skills_json, []);
  const load = Math.min(130, Math.round(Number(row.scheduled_days || 0) * 20));
  const departmentName = row.profile_department_name || row.department || "";
  const departmentMeta = resolveDepartmentMeta(departmentName);
  const canonicalRoot = departmentMeta.departmentKey ? findDepartmentTaxonomyByKey(departmentMeta.departmentKey) : null;
  const departmentLabel = canonicalRoot?.label || departmentMeta.displayDepartment || departmentName;
  const departmentId = row.profile_department_uid || departmentName || "";
  return {
    id: row.user_uid,
    userId: row.user_uid,
    name: row.name || row.username,
    username: row.username,
    avatar: String(row.name || row.username || "P").slice(0, 1),
    departmentId,
    department: row.department || "",
    departmentName: departmentName,
    departmentKey: departmentMeta.departmentKey || "",
    departmentAliasKey: departmentMeta.childDepartmentKey || "",
    displayDepartment: departmentMeta.displayDepartment || departmentName,
    departmentLabel,
    canonicalDepartment: departmentLabel,
    departmentPath: departmentMeta.departmentPath || departmentName,
    roleTitle: row.job || "成员",
    job: row.job || "成员",
    load,
    skills: Array.isArray(skills) ? skills : [],
    tone: load >= 100 ? "red" : load >= 85 ? "orange" : "green",
    recommendation: load >= 100 ? "当前已过载，建议改派。" : load >= 85 ? "可承接短期任务，建议先检查冲突。" : "可承接新任务。"
  };
}

function mapResourceWorkItem(row = {}) {
  const itemUid = row.item_uid || "";
  const taskUid = row.task_uid || "";
  const stableId = itemUid || taskUid || String(row.id || "");
  const ownerUserId = row.resolved_owner_user_uid || row.owner_user_uid || "";
  const assigneeName = row.resolved_owner_name || row.owner_text || row.assignee_name || "";
  return {
    id: stableId,
    itemId: itemUid || stableId,
    workItemId: stableId,
    scheduleItemId: itemUid,
    taskId: taskUid || row.legacy_task_id || "",
    taskUid,
    personId: ownerUserId,
    assigneeId: ownerUserId,
    ownerUserId,
    title: row.title || "",
    project: row.project_name || "项目",
    projectId: row.project_uid || "",
    assigneeName,
    owner: row.owner_text || assigneeName,
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date || row.start_date),
    status: row.status === "blocked" ? "danger" : row.status === "done" ? "done" : "normal"
  };
}

function mapSchedulePatchItem(row = null) {
  if (!row) {
    return {
      id: "",
      itemId: "",
      taskId: "",
      taskUid: "",
      title: "",
      projectId: "",
      ownerUserId: "",
      assigneeId: "",
      owner: "",
      assigneeName: "",
      startDate: "",
      endDate: "",
      status: ""
    };
  }
  return {
    id: row.item_uid || String(row.id || ""),
    itemId: row.item_uid || String(row.id || ""),
    taskId: row.task_uid || row.legacy_task_id || "",
    taskUid: row.task_uid || "",
    title: row.title || "",
    projectId: row.project_uid || "",
    ownerUserId: row.owner_user_uid || "",
    assigneeId: row.owner_user_uid || "",
    owner: row.owner_text || "",
    assigneeName: row.owner_text || "",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    status: row.status || ""
  };
}

function mapSchedulePatchTask(row = null) {
  if (!row) {
    return {
      id: "",
      taskId: "",
      taskUid: "",
      title: "",
      projectId: "",
      ownerUserId: "",
      assigneeId: "",
      owner: "",
      assigneeName: "",
      startDate: "",
      endDate: "",
      status: ""
    };
  }
  return {
    id: row.task_uid || String(row.id || ""),
    taskId: row.task_uid || String(row.legacy_task_id || ""),
    taskUid: row.task_uid || "",
    title: row.title || "",
    projectId: row.project_uid || "",
    ownerUserId: row.owner_user_uid || "",
    assigneeId: row.owner_user_uid || "",
    owner: row.owner_text || "",
    assigneeName: row.owner_text || "",
    startDate: toDateSlash(row.start_date),
    endDate: toDateSlash(row.end_date),
    status: row.status || ""
  };
}

function buildAvailability(people = [], workItems = [], range = {}) {
  const busyPeople = new Set(workItems.map((item) => item.personId).filter(Boolean));
  return people
    .filter((person) => !busyPeople.has(person.id) || Number(person.load || 0) < 85)
    .map((person) => ({
      id: `available-${person.id}`,
      personId: person.id,
      startDate: toDateSlash(range.endDate || DEFAULT_RANGE.endDate),
      endDate: toDateSlash(range.endDate || DEFAULT_RANGE.endDate),
      label: Number(person.load || 0) < 85 ? "可分配" : "可承接短期任务"
    }));
}

function assignmentSkillTags(payload = {}) {
  const normalized = normalizeAssignmentConfirmPayload(payload);
  const explicitSkills = Array.isArray(normalized.skillTags)
    ? normalized.skillTags
    : Array.isArray(normalized.skills)
      ? normalized.skills
      : Array.isArray(normalized.assignment?.skillTags)
        ? normalized.assignment.skillTags
        : Array.isArray(normalized.assignment?.skills)
          ? normalized.assignment.skills
          : [];
  const skillText = cleanString(normalized.skillText || normalized.requiredSkills || normalized.assignment?.skillText || normalized.assignment?.requiredSkills);
  return [
    ...explicitSkills,
    ...skillText.split(/[,;閵嗕緤绱漒s]+/)
  ]
    .map((item) => cleanString(item).toLowerCase())
    .filter(Boolean);
}

function buildCandidateList(people = [], payload = {}) {
  const skillTags = assignmentSkillTags(payload);
  const normalized = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  const payloadCandidates = cleanArray(normalized.candidates || normalized.assignment?.candidates).map((candidate) => normalizeAssignmentCandidate(candidate));
  const personCandidates = people
    .map((person) => {
      const personSkills = cleanArray(person.skills).map((item) => String(item).toLowerCase());
      const skillScore = skillTags.length
        ? skillTags.filter((skill) => personSkills.includes(skill)).length
        : 0;
      const loadAfter = Math.min(130, Number(person.load || 0) + 20);
      const conflictCount = loadAfter >= 100 ? 1 : 0;
      return {
        personId: person.id,
        userId: person.id,
        name: person.name,
        avatar: person.avatar,
        departmentId: person.departmentId,
        departmentName: person.departmentName,
        loadBefore: Number(person.load || 0),
        loadAfter,
        conflictCount,
        reason: skillScore > 0 ? "技能匹配且当前工作负载可承接" : "当前工作负载可承接",
        reasons: [
          skillScore > 0 ? `匹配到 ${skillScore} 个技能标签` : "候选人当前可分配",
          loadAfter >= 100 ? "存在过载风险" : "排期风险较低"
        ],
        conflictTasks: [],
        tone: conflictCount ? "orange" : "green"
      };
    })
    .filter((candidate) => candidate.personId);
  return uniqueCandidates([...payloadCandidates, ...personCandidates])
    .sort((left, right) => left.conflictCount - right.conflictCount || left.loadAfter - right.loadAfter)
    .slice(0, 8);
}

function normalizeAssignmentCandidate(candidate = {}) {
  const user = objectOrEmpty(candidate.user);
  const personId = firstCleanString(candidate.personId, candidate.person_id, candidate.userId, candidate.user_id, candidate.assigneeId, candidate.assignee_id, candidate.id, user.userId, user.user_id, user.id);
  const name = firstCleanString(candidate.name, candidate.personName, candidate.person_name, candidate.username, candidate.displayName, user.name, user.username, personId);
  const loadBefore = cleanNumber(candidate.loadBefore ?? candidate.load_before ?? candidate.load ?? candidate.workload ?? candidate.utilization, 0);
  const loadAfter = cleanNumber(candidate.loadAfter ?? candidate.load_after ?? candidate.nextLoad ?? candidate.next_load ?? candidate.load ?? candidate.workload ?? loadBefore, loadBefore);
  return {
    personId,
    userId: firstCleanString(candidate.userId, candidate.user_id, personId),
    name,
    avatar: cleanString(candidate.avatar || name.slice(0, 1)),
    departmentId: firstCleanString(candidate.departmentId, candidate.department_id, candidate.departmentUid, candidate.department_uid, candidate.department),
    departmentName: firstCleanString(candidate.departmentName, candidate.department_name, candidate.department),
    loadBefore,
    loadAfter,
    conflictCount: cleanNumber(candidate.conflictCount ?? candidate.conflict_count ?? candidate.conflicts, 0),
    reason: cleanString(candidate.reason || candidate.recommendation || candidate.summary, "来自指派请求的候选人"),
    reasons: cleanArray(candidate.reasons).map((item) => cleanString(item)).filter(Boolean),
    conflictTasks: cleanArray(candidate.conflictTasks || candidate.conflict_tasks).map((item) => cleanString(item)).filter(Boolean),
    skills: cleanArray(candidate.skills),
    tone: cleanString(candidate.tone || candidate.color || (loadAfter >= 100 ? "orange" : "green"))
  };
}

function uniqueCandidates(candidates = []) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    const key = cleanString(candidate.personId || candidate.userId || candidate.name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function uniqueWorkItemAccessTokens(values = []) {
  return Array.from(new Set(values.map((value) => cleanString(value)).filter(Boolean)));
}

function personAccessNames(peopleRows = []) {
  return uniqueWorkItemAccessTokens(
    peopleRows.flatMap((row) => [row.name, row.username])
  );
}

function ownerTextAccessClause(names = [], column = "rw.owner_text") {
  const cleanNames = uniqueWorkItemAccessTokens(names);
  if (!cleanNames.length) return { sql: "", params: [] };
  return {
    sql: cleanNames
      .map(() => `(${column} = ? OR ${column} LIKE ? OR ${column} LIKE ? OR ${column} LIKE ? OR ${column} LIKE ?)`)
      .join(" OR "),
    params: cleanNames.flatMap((name) => [name, `%: ${name}`, `%:${name}`, `%：${name}`, `%： ${name}`])
  };
}

function buildWorkItemAccessFilter({ scope = {}, peopleRows = [] } = {}) {
  if (scope.type === "company") return { sql: "1 = 1", params: [] };

  const clauses = [];
  const params = [];
  const projectIds = uniqueWorkItemAccessTokens(scope.projectIds);
  const peopleIds = uniqueWorkItemAccessTokens([
    ...peopleRows.map((row) => row.user_uid),
    ...scope.userIds
  ]);
  const names = personAccessNames(peopleRows);

  if (projectIds.length) {
    clauses.push(`rw.project_uid IN (${projectIds.map(() => "?").join(", ")})`);
    params.push(...projectIds);
  }

  if (peopleIds.length) {
    clauses.push(`(rw.owner_user_uid IN (${peopleIds.map(() => "?").join(", ")}) OR owner.user_uid IN (${peopleIds.map(() => "?").join(", ")}))`);
    params.push(...peopleIds, ...peopleIds);
  }

  const ownerTextFilter = ownerTextAccessClause(names);
  if (ownerTextFilter.sql) {
    clauses.push(`(${ownerTextFilter.sql})`);
    params.push(...ownerTextFilter.params);
  }

  const departments = uniqueWorkItemAccessTokens([
    ...scope.departmentIds,
    ...peopleRows.flatMap((row) => [row.department, row.profile_department_name])
  ]);
  if (departments.length) {
    clauses.push(
      departments
        .map(() => "(rw.owner_text LIKE ? OR rw.project_owner_text LIKE ?)")
        .join(" OR ")
    );
    params.push(...departments.flatMap((department) => [`${department}%`, `${department}%`]));
  }

  if (!clauses.length) return { sql: "1 = 0", params: [] };
  return {
    sql: `(${clauses.join(" OR ")})`,
    params
  };
}

async function getResourceRows(query = {}, auth = {}) {
  const scope = resolveScope(auth, query);
  const where = ["u.status = 'active'"];
  const params = [];
  const status = cleanString(query.status);
  const keyword = cleanString(query.q || query.keyword || query.search);

  if (status) {
    where.push("(ep.employment_status = ? OR ep.employment_status IS NULL)");
    params.push(status);
  }
  if (scope.type === "self" && scope.userIds[0]) {
    where.push("u.user_uid = ?");
    params.push(scope.userIds[0]);
  } else if (scope.type === "authorized") {
    if (!scope.userIds[0]) return { people: [], workItems: [] };
    where.push("u.user_uid = ?");
    params.push(scope.userIds[0]);
  } else if (scope.type === "project") {
    if (!scope.projectIds[0]) return { people: [], workItems: [] };
    where.push("u.user_uid IN (SELECT DISTINCT owner_user_uid FROM schedule_items WHERE hidden = 0 AND project_uid = ? AND owner_user_uid <> '')");
    params.push(scope.projectIds[0]);
  } else if (scope.departmentIds[0]) {
    const dept = scope.departmentIds[0];
    const aliases = resolveDepartmentFilterValues(dept);
    const placeholders = aliases.map(() => "?").join(", ");
    where.push(`(u.department IN (${placeholders}) OR ep.department_uid = ? OR ep.department_name IN (${placeholders}))`);
    params.push(...aliases, dept, ...aliases);
  }
  if (keyword) {
    where.push("(u.name LIKE ? OR u.username LIKE ? OR u.department LIKE ? OR u.job LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const [peopleRows] = await mysqlPool.execute(
    `
      SELECT
        u.user_uid, u.username, u.name, u.role, u.department, u.job,
        ep.department_uid AS profile_department_uid,
        ep.department_name AS profile_department_name,
        ep.skills_json,
        COUNT(DISTINCT si.item_uid) AS scheduled_days
      FROM users u
      LEFT JOIN hr_employee_profiles ep ON ep.user_uid = u.user_uid
      LEFT JOIN schedule_items si ON si.owner_user_uid = u.user_uid AND si.hidden = 0
      WHERE ${where.join(" AND ")}
      GROUP BY u.user_uid
      ORDER BY u.department ASC, u.name ASC
    `,
    params
  );

  const peopleIds = peopleRows.map((row) => row.user_uid).filter(Boolean);
  if (!peopleIds.length) return { people: [], workItems: [] };
  const accessFilter = buildWorkItemAccessFilter({ scope, peopleRows });
  const [workRows] = await mysqlPool.execute(
    `
      SELECT
        rw.item_uid, rw.task_uid, rw.project_uid, rw.owner_user_uid, rw.owner_text,
        owner.user_uid AS resolved_owner_user_uid,
        owner.name AS resolved_owner_name,
        rw.title, rw.status, rw.start_date, rw.end_date, rw.project_name
      FROM (
        SELECT
          si.item_uid,
          COALESCE(NULLIF(si.task_uid, ''), NULLIF(t.task_uid, ''), '') AS task_uid,
          si.project_uid,
          COALESCE(NULLIF(si.owner_user_uid, ''), NULLIF(t.owner_user_uid, ''), '') AS owner_user_uid,
          COALESCE(NULLIF(si.owner_text, ''), NULLIF(t.owner_text, ''), NULLIF(p.owner_text, ''), '') AS owner_text,
          p.owner_text AS project_owner_text,
          si.title,
          si.status,
          si.start_date,
          si.end_date,
          p.name AS project_name,
          si.id AS sort_id
        FROM schedule_items si
        LEFT JOIN tasks t ON t.task_uid = si.task_uid
        LEFT JOIN projects p ON p.project_uid = si.project_uid
        WHERE si.hidden = 0
        UNION ALL
        SELECT
          '' AS item_uid,
          t.task_uid,
          t.project_uid,
          t.owner_user_uid,
          COALESCE(NULLIF(t.owner_text, ''), NULLIF(p.owner_text, ''), '') AS owner_text,
          p.owner_text AS project_owner_text,
          t.title,
          t.status,
          t.start_date,
          t.end_date,
          p.name AS project_name,
          t.id AS sort_id
        FROM tasks t
        LEFT JOIN projects p ON p.project_uid = t.project_uid
        WHERE t.archived = 0
          AND NOT EXISTS (
            SELECT 1 FROM schedule_items linked_si
            WHERE linked_si.hidden = 0 AND linked_si.task_uid = t.task_uid
          )
      ) rw
      LEFT JOIN users owner ON owner.status = 'active'
        AND (
          owner.user_uid = rw.owner_user_uid
          OR (
            rw.owner_user_uid = ''
            AND (
              rw.owner_text = owner.name
              OR rw.owner_text = owner.username
              OR rw.owner_text LIKE CONCAT('%: ', owner.name)
              OR rw.owner_text LIKE CONCAT('%:', owner.name)
              OR rw.owner_text LIKE CONCAT('%：', owner.name)
              OR rw.owner_text LIKE CONCAT('%： ', owner.name)
              OR rw.owner_text LIKE CONCAT('%: ', owner.username)
              OR rw.owner_text LIKE CONCAT('%:', owner.username)
              OR rw.owner_text LIKE CONCAT('%：', owner.username)
              OR rw.owner_text LIKE CONCAT('%： ', owner.username)
            )
          )
        )
      WHERE ${accessFilter.sql}
      ORDER BY rw.start_date ASC, rw.sort_id ASC
      LIMIT 500
    `,
    accessFilter.params
  );
  return {
    people: peopleRows.map(mapResourcePerson),
    workItems: workRows.map(mapResourceWorkItem)
  };
}

async function getResourceDepartments() {
  const [rows] = await mysqlPool.execute(
    `
      SELECT d.department_uid, d.name, d.name_en, d.status, d.sort_order, d.payload_json,
             COUNT(DISTINCT u.user_uid) AS member_count
      FROM departments d
      LEFT JOIN users u ON u.department = d.name AND u.status = 'active'
      WHERE d.status = 'active'
      GROUP BY d.id
      ORDER BY d.sort_order ASC, d.id ASC
    `
  );
  return rows.map((row) => ({
    ...mapDepartment(row),
    color: parseJson(row.payload_json, {}).color || "green"
  }));
}

export async function getResourceSnapshot(query = {}, auth = {}) {
  await ensureHrSchemaReady();
  const authContext = await fetchAuthContext(auth);
  const permissions = buildResourcePermissions(authContext, query);
  const range = {
    startDate: cleanDate(query.startDate || query.start_date, DEFAULT_RANGE.startDate),
    endDate: cleanDate(query.endDate || query.end_date, DEFAULT_RANGE.endDate)
  };
  const departments = await getResourceDepartments();
  const { people, workItems } = await getResourceRows(query, authContext);
  const availability = buildAvailability(people, workItems, range);
  const candidates = buildCandidateList(people, {});
  return {
    resourcePermissions: permissions,
    permissions,
    scope: permissions.scope,
    departments,
    people,
    workItems,
    availability,
    candidates,
    range: {
      startDate: toDateSlash(range.startDate),
      endDate: toDateSlash(range.endDate)
    },
    stats: {
      totalPeople: people.length,
      totalWorkItems: workItems.length,
      assignedWorkItems: workItems.filter((item) => item.personId).length,
      availableCount: people.filter((person) => Number(person.load || 0) < 85).length,
      overloadCount: people.filter((person) => Number(person.load || 0) >= 100).length
    }
  };
}

export async function getWorkloadSnapshot(query = {}, auth = {}) {
  const snapshot = await getResourceSnapshot(query, auth);
  return {
    workload: {
      people: snapshot.people,
      workItems: snapshot.workItems,
      availability: snapshot.availability,
      candidates: snapshot.candidates,
      range: snapshot.range
    }
  };
}

function buildAssignmentRisk(candidates = [], workItems = []) {
  const overloaded = candidates.filter((candidate) => Number(candidate.loadAfter || 0) >= 100).length;
  const conflicts = candidates.reduce((total, candidate) => total + Number(candidate.conflictCount || 0), 0);
  const level = overloaded > 0 || conflicts > 0 ? "medium" : "low";
  return {
    level,
    overloaded,
    conflicts,
    totalWorkItems: workItems.length
  };
}

function buildAssignmentActions(candidates = [], risk = {}) {
  const primary = candidates[0] || null;
  const actions = [];
  if (primary) {
    actions.push({
      type: "selectCandidate",
      candidateId: primary.personId,
      label: `分配给 ${primary.name}`
    });
  }
  if (risk.level !== "low") {
    actions.push({
      type: "reviewSchedule",
      label: "分配前先检查负载"
    });
  }
  actions.push({
    type: "createPreview",
    label: "创建指派预览"
  });
  return actions;
}

function assignmentAssigneeToken(value) {
  if (!value || typeof value !== "object") return cleanString(value);
  return cleanString(
    value.personId ||
      value.person_id ||
      value.userId ||
      value.user_id ||
      value.assigneeId ||
      value.assignee_id ||
      value.id ||
      value.username ||
      value.name
  );
}

function normalizeAssignmentDateAliases(...sources) {
  const normalized = {};
  for (const source of sources) {
    const date = objectOrEmpty(source?.date);
    const dates = objectOrEmpty(source?.dates);
    const range = objectOrEmpty(source?.range);
    const schedule = objectOrEmpty(source?.schedule);
    if (!normalized.startDate) {
      normalized.startDate = firstCleanString(
        source?.startDate,
        source?.start_date,
        typeof source?.date === "object" ? "" : source?.date,
        date.startDate,
        date.start_date,
        date.start,
        date.from,
        dates.startDate,
        dates.start_date,
        dates.start,
        range.startDate,
        range.start_date,
        range.start,
        schedule.startDate,
        schedule.start_date,
        schedule.start
      );
    }
    if (!normalized.endDate) {
      normalized.endDate = firstCleanString(
        source?.endDate,
        source?.end_date,
        source?.dueDate,
        source?.due_date,
        date.endDate,
        date.end_date,
        date.end,
        date.to,
        date.dueDate,
        dates.endDate,
        dates.end_date,
        dates.end,
        range.endDate,
        range.end_date,
        range.end,
        schedule.endDate,
        schedule.end_date,
        schedule.end
      );
    }
  }
  return normalized;
}

function normalizeAssignmentConfirmPayload(payload = {}) {
  const candidate = objectOrEmpty(payload.candidate);
  const resource = objectOrEmpty(payload.resource);
  const resourceUser = objectOrEmpty(resource.user);
  const user = objectOrEmpty(payload.user);
  const workItem = objectOrEmpty(payload.workItem || payload.work_item);
  const taskDraft = objectOrEmpty(payload.taskDraft || payload.task_draft);
  const task = objectOrEmpty(payload.task);
  const project = objectOrEmpty(payload.project);
  const draftProject = objectOrEmpty(taskDraft.project || taskDraft.projectDraft || taskDraft.project_draft);
  const dateAliases = normalizeAssignmentDateAliases(taskDraft, payload, workItem, task);

  const normalized = mergeDefined(payload, {
    assigneeId: firstCleanString(
      payload.assigneeId,
      payload.assignee_id,
      payload.personId,
      payload.person_id,
      payload.userId,
      payload.user_id,
      assignmentAssigneeToken(candidate),
      assignmentAssigneeToken(resource),
      assignmentAssigneeToken(resourceUser),
      assignmentAssigneeToken(user)
    ),
    assigneeName: firstCleanString(
      payload.assigneeName,
      payload.assignee_name,
      payload.personName,
      payload.person_name,
      candidate.name,
      candidate.username,
      resource.name,
      resource.username,
      resourceUser.name,
      resourceUser.username,
      user.name,
      user.username
    ),
    workItemId: firstCleanString(payload.workItemId, payload.work_item_id, workItem.workItemId, workItem.work_item_id, workItem.id),
    itemId: firstCleanString(payload.itemId, payload.item_id, workItem.itemId, workItem.item_id, workItem.scheduleItemId, workItem.schedule_item_id),
    scheduleItemId: firstCleanString(
      payload.scheduleItemId,
      payload.schedule_item_id,
      workItem.scheduleItemId,
      workItem.schedule_item_id,
      workItem.itemId,
      workItem.item_id
    ),
    taskUid: firstCleanString(payload.taskUid, payload.task_uid, taskDraft.taskUid, taskDraft.task_uid, task.taskUid, task.task_uid, workItem.taskUid, workItem.task_uid),
    taskId: firstCleanString(payload.taskId, payload.task_id, taskDraft.taskId, taskDraft.task_id, task.id, task.taskId, task.task_id, workItem.taskId, workItem.task_id),
    projectId: firstCleanString(
      payload.projectId,
      payload.projectUid,
      payload.project_id,
      payload.project_uid,
      draftProject.projectId,
      draftProject.projectUid,
      draftProject.project_id,
      draftProject.project_uid,
      draftProject.id,
      taskDraft.projectId,
      taskDraft.projectUid,
      taskDraft.project_id,
      taskDraft.project_uid,
      workItem.projectId,
      workItem.projectUid,
      workItem.project_id,
      workItem.project_uid,
      task.projectId,
      task.projectUid,
      task.project_id,
      task.project_uid,
      project.projectId,
      project.projectUid,
      project.project_id,
      project.project_uid,
      project.id
    ),
    project: firstCleanString(
      typeof payload.project === "object" ? "" : payload.project,
      payload.projectName,
      payload.project_name,
      draftProject.name,
      draftProject.title,
      taskDraft.projectName,
      taskDraft.project_name,
      workItem.project,
      workItem.projectName,
      workItem.project_name,
      task.project,
      task.projectName,
      task.project_name,
      project.name,
      project.title
    ),
    projectName: firstCleanString(
      payload.projectName,
      payload.project_name,
      typeof payload.project === "object" ? "" : payload.project,
      draftProject.name,
      draftProject.title,
      taskDraft.projectName,
      taskDraft.project_name,
      workItem.projectName,
      workItem.project_name,
      workItem.project,
      task.projectName,
      task.project_name,
      task.project,
      project.name,
      project.title
    ),
    title: firstCleanString(payload.title, payload.taskTitle, payload.task_title, taskDraft.title, taskDraft.taskTitle, taskDraft.task_title, task.title, workItem.title),
    startDate: dateAliases.startDate,
    endDate: dateAliases.endDate,
    departmentId: firstCleanString(
      payload.departmentId,
      payload.department_id,
      taskDraft.departmentId,
      taskDraft.department_id,
      workItem.departmentId,
      workItem.department_id,
      candidate.departmentId,
      candidate.department_id,
      resource.departmentId,
      resource.department_id
    ),
    priority: firstCleanString(payload.priority, taskDraft.priority, workItem.priority, task.priority),
    skillTags: firstArrayValue(payload.skillTags, payload.skill_tags, payload.skills, taskDraft.skillTags, taskDraft.skill_tags, taskDraft.skills, candidate.skills, resource.skills),
    candidates: firstArrayValue(payload.candidates, payload.assignment?.candidates)
  });

  if (!normalized.skillText) normalized.skillText = firstCleanString(taskDraft.skillText, taskDraft.skill_text, payload.skillsText, payload.skills_text);
  Object.defineProperty(normalized, "__assignmentConfirmNormalized", {
    value: true,
    enumerable: false,
    configurable: true
  });
  return normalized;
}

function selectedAssignmentAssigneeId(payload = {}) {
  const normalized = normalizeAssignmentConfirmPayload(payload);
  for (const key of [
    "assigneeId",
    "assignee_id",
    "personId",
    "person_id",
    "userId",
    "user_id",
    "assignee",
    "person",
    "user"
  ]) {
    const token = assignmentAssigneeToken(normalized[key]);
    if (token) return token;
  }
  return "";
}

function candidateMatchesAssignee(candidate = {}, assigneeId = "") {
  const clean = cleanString(assigneeId);
  if (!clean) return false;
  return [
    candidate.personId,
    candidate.userId,
    candidate.id,
    candidate.assigneeId,
    candidate.name,
    candidate.username
  ]
    .map((value) => cleanString(value))
    .filter(Boolean)
    .includes(clean);
}

function selectAssignmentCandidate(candidates = [], payload = {}) {
  const requestedAssigneeId = selectedAssignmentAssigneeId(payload);
  if (!requestedAssigneeId) {
    return {
      requestedAssigneeId,
      selected: candidates[0] || null,
      requestedCandidateMissing: false
    };
  }
  const selected = candidates.find((candidate) => candidateMatchesAssignee(candidate, requestedAssigneeId)) || null;
  return {
    requestedAssigneeId,
    selected,
    requestedCandidateMissing: !selected
  };
}

function resolveHrDeepSeekApiKey() {
  return resolveHrDeepSeekApiKeyFromConfig(readStoredAiKeyConfigSync());
}

function buildHrAiKeyNotConfiguredError() {
  const error = new Error("未配置 DeepSeek HR API Key");
  error.statusCode = 503;
  error.code = HR_AI_KEY_NOT_CONFIGURED_CODE;
  return error;
}

function requireHrDeepSeekApiKey() {
  const apiKey = resolveHrDeepSeekApiKey();
  if (!apiKey) {
    throw buildHrAiKeyNotConfiguredError();
  }
  return apiKey;
}

export function getAssignmentAdviceAvailability() {
  const configured = Boolean(resolveHrDeepSeekApiKey());
  return {
    ok: configured,
    status: configured ? "ready" : "key_not_configured",
    code: configured ? "AI_PROBE_READY" : HR_AI_KEY_NOT_CONFIGURED_CODE,
    provider: "deepseek",
    service: "assignment-advice",
    scope: "hr",
    configured,
    apiKeyConfigured: configured,
    hrApiKeyConfigured: configured,
    message: configured
      ? "后端 AI 代理可用于人力指派建议。"
      : "未配置 DeepSeek HR API Key。"
  };
}

function normalizeHrModel(value, fallback = HR_DEFAULT_MODEL) {
  const clean = cleanString(value).toLowerCase();
  if (!clean) return fallback;
  return HR_MODEL_ALIASES.get(clean) || fallback;
}

function isHrAiConfigurationError(error) {
  return error?.code === HR_AI_KEY_NOT_CONFIGURED_CODE;
}

async function callHrDeepSeek(messages = [], model = HR_DEFAULT_MODEL) {
  const apiKey = requireHrDeepSeekApiKey();

  const baseUrl = cleanString(env.ai?.deepseekBaseUrl, "https://api.deepseek.com").replace(/\/+$/, "");
  const timeoutMs = Math.min(Math.max(cleanNumber(env.ai?.timeoutMs, 20000), 1000), 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizeHrModel(model),
        messages,
        temperature: 0.2,
        stream: false
      }),
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const error = new Error("HR 指派建议服务暂时不可用");
      error.statusCode = response.status >= 500 ? 503 : 502;
      throw error;
    }
    const answer = cleanString(data?.choices?.[0]?.message?.content);
    if (!answer) {
      const error = new Error("HR 指派建议服务暂时不可用");
      error.statusCode = 503;
      throw error;
    }

    return {
      answer,
      usage: {
        promptTokens: Number(data?.usage?.prompt_tokens || 0),
        completionTokens: Number(data?.usage?.completion_tokens || 0),
        totalTokens: Number(data?.usage?.total_tokens || 0)
      }
    };
  } catch (error) {
    if (error?.statusCode) throw error;
    const serviceError = new Error("HR 指派建议服务暂时不可用");
    serviceError.statusCode = 503;
    throw serviceError;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAssignmentAdvice(payload = {}, auth = {}) {
  requireHrDeepSeekApiKey();
  const normalizedPayload = normalizeAssignmentConfirmPayload(payload);
  const [resources, workloadSnapshot] = await Promise.all([
    getResourceSnapshot(payload.scope || payload, auth),
    getWorkloadSnapshot(payload.scope || payload, auth)
  ]);
  const candidates = buildCandidateList(resources.people, normalizedPayload);
  const workload = workloadSnapshot.workload || {};
  const risk = buildAssignmentRisk(candidates, workload.workItems || resources.workItems || []);
  const recommendedCandidate = candidates[0] || null;
  const recommendedCandidateId = recommendedCandidate?.personId || "";
  const fallback = candidates.length === 0;
  let source = "local";
  let aiError = null;
  let localFallbackReason = fallback ? "NO_ASSIGNMENT_CANDIDATES" : "";
  let advice = fallback
    ? "当前范围内没有可分配候选人，请先调整范围或工作负载后再确认。"
    : `建议分配给 ${recommendedCandidate?.name || recommendedCandidateId}，依据是当前工作负载与排期风险。`;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    const aiResult = await callHrDeepSeek(
      [
        {
          role: "system",
          content: "你是 HR 指派助手。请基于候选人与风险快照给出简洁指派建议。"
        },
        {
          role: "user",
          content: JSON.stringify({
            title: cleanString(normalizedPayload.title || normalizedPayload.taskTitle),
            preferredAssignee: selectedAssignmentAssigneeId(normalizedPayload),
            recommendedCandidateId,
            fallback,
            candidates: candidates.slice(0, 5).map((candidate) => ({
              personId: candidate.personId,
              name: candidate.name,
              loadBefore: candidate.loadBefore,
              loadAfter: candidate.loadAfter,
              conflictCount: candidate.conflictCount,
              reasons: candidate.reasons
            })),
            risk,
            scope: resources.scope
          })
        }
      ],
      normalizeHrModel(normalizedPayload.model)
    );
    source = "deepseek";
    advice = aiResult.answer;
    usage = aiResult.usage;
  } catch (error) {
    aiError = {
      code: error?.code || (isHrAiConfigurationError(error) ? HR_AI_KEY_NOT_CONFIGURED_CODE : "HR_AI_UNAVAILABLE"),
      statusCode: error?.statusCode || 503,
      message: error?.message || "HR 指派建议服务暂时不可用"
    };
    localFallbackReason = aiError.code;
    if (!isHrAiConfigurationError(error)) {
      source = "local";
    }
  }
  const syncNotes = [
    "确认指派会同步 HR 预览、排期项与任务负责人。",
    fallback ? "暂无可选候选人，请先调整范围后再确认。" : "建议先预览再确认，保证候选人与排期状态一致。"
  ];
  return {
    recommendedCandidate,
    recommendedCandidateId,
    source,
    status: fallback ? "empty" : "ready",
    fallback,
    aiError,
    localFallbackReason,
    advice,
    usage,
    syncNotes,
    candidates,
    risk,
    summary: {
      candidateCount: candidates.length,
      recommendedCandidateId,
      scopeType: resources.scope?.type || "self",
      range: resources.range
    },
    actions: buildAssignmentActions(candidates, risk),
    scope: resources.scope
  };
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function firstDefined(payload = {}, keys = []) {
  for (const key of keys) {
    if (hasOwn(payload, key)) return payload[key];
  }
  return undefined;
}

function rowDateDash(value) {
  return cleanDate(toDateSlash(value), null);
}

function normalizeSchedulePatchPayload(current = {}, payload = {}) {
  const startInput = firstDefined(payload, ["startDate", "start_date"]);
  const endInput = firstDefined(payload, ["endDate", "end_date"]);
  const startDate = cleanSchedulePatchDate(startInput, rowDateDash(current.start_date));
  const endDate = cleanSchedulePatchDate(endInput, rowDateDash(current.end_date || current.start_date));
  if (startDate && endDate && endDate < startDate) throw badRequest("结束日期不能早于开始日期");

  const ownerUserInput = firstDefined(payload, ["ownerUserId", "ownerUserUid", "owner_user_uid", "assigneeId", "assignee_id", "personId", "person_id", "userId", "user_id"]);
  const ownerTextInput = firstDefined(payload, ["owner", "ownerText", "owner_text", "assigneeName", "assignee_name"]);
  const titleInput = firstDefined(payload, ["title", "taskTitle"]);
  const projectInput = firstDefined(payload, ["projectId", "projectUid", "project_uid"]);

  return {
    startDate,
    endDate,
    ownerUserId: ownerUserInput === undefined ? cleanString(current.owner_user_uid) : cleanString(ownerUserInput),
    owner: ownerTextInput === undefined ? cleanString(current.owner_text) : cleanString(ownerTextInput),
    title: titleInput === undefined ? cleanString(current.title) : cleanString(titleInput, cleanString(current.title)),
    projectId: projectInput === undefined ? cleanString(current.project_uid) : cleanString(projectInput),
    forceReason: cleanString(payload.forceReason || payload.force_reason || payload.reason)
  };
}

function assignmentReason(payload = {}) {
  return cleanString(payload.forceReason || payload.force_reason || payload.reason);
}

function assignmentWorkItemId(payload = {}) {
  const normalized = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  return cleanString(
    normalized.scheduleItemId ||
      normalized.schedule_item_id ||
      normalized.itemId ||
      normalized.item_id ||
      normalized.taskUid ||
      normalized.task_uid ||
      normalized.taskId ||
      normalized.task_id ||
      normalized.workItemId ||
      normalized.work_item_id
  );
}

function normalizeAssignmentSyncPayload(payload = {}, assignment = {}) {
  const normalized = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  return {
    workItemId: cleanString(payload.scheduleItemId || payload.schedule_item_id || payload.itemId || payload.item_id || payload.taskUid || payload.task_uid || payload.taskId || payload.task_id || payload.workItemId || payload.work_item_id || normalized.scheduleItemId || normalized.schedule_item_id || normalized.itemId || normalized.item_id || normalized.taskUid || normalized.task_uid || normalized.taskId || normalized.task_id || normalized.workItemId || normalized.work_item_id || assignment.scheduleItemId || assignment.taskUid || assignment.workItemId),
    itemId: cleanString(payload.itemId || payload.item_id || payload.scheduleItemId || payload.schedule_item_id || normalized.itemId || normalized.item_id || normalized.scheduleItemId || normalized.schedule_item_id || assignment.scheduleItemId),
    scheduleItemId: cleanString(payload.scheduleItemId || payload.schedule_item_id || normalized.scheduleItemId || normalized.schedule_item_id || payload.itemId || payload.item_id || normalized.itemId || normalized.item_id || assignment.scheduleItemId),
    taskId: cleanString(payload.taskId || payload.task_id || payload.taskUid || payload.task_uid || normalized.taskId || normalized.task_id || normalized.taskUid || normalized.task_uid || assignment.taskUid),
    taskUid: cleanString(payload.taskUid || payload.task_uid || normalized.taskUid || normalized.task_uid || payload.taskId || payload.task_id || normalized.taskId || normalized.task_id || assignment.taskUid),
    assigneeId: cleanString(normalized.assigneeId || normalized.assignee_id || normalized.personId || normalized.person_id || normalized.userId || normalized.user_id || assignment.assigneeId),
    personId: cleanString(normalized.personId || normalized.person_id || normalized.assigneeId || normalized.assignee_id || normalized.userId || normalized.user_id || assignment.assigneeId),
    userId: cleanString(normalized.userId || normalized.user_id || normalized.assigneeId || normalized.assignee_id || normalized.personId || normalized.person_id || assignment.assigneeId),
    assigneeName: cleanString(normalized.assigneeName || normalized.assignee_name || assignment.assigneeName),
    startDate: cleanString(normalized.startDate || normalized.start_date || assignment.startDate),
    endDate: cleanString(normalized.endDate || normalized.end_date || assignment.endDate),
    projectId: cleanString(normalized.projectId || normalized.projectUid || normalized.project_id || normalized.project_uid || assignment.projectId),
    title: cleanString(normalized.title || normalized.taskTitle || normalized.task_title || assignment.title),
    forceReason: assignmentReason(normalized)
  };
}

function assignmentScopeProjectIds(payload = {}, auth = {}) {
  const normalized = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  const scope = normalized.scope && typeof normalized.scope === "object" ? normalized.scope : {};
  const scopeProjectIds = Array.isArray(scope.projectIds)
    ? scope.projectIds
    : splitScopeList(scope.projectIds || scope.projectUids || scope.authorizedProjectIds || scope.projects);
  return Array.from(
    new Set(
      [
        cleanString(normalized.projectId || normalized.projectUid || normalized.project_id || normalized.project_uid),
        ...scopeProjectIds.map((value) => cleanString(value)),
        cleanString(auth.projectId || auth.projectUid || auth.project_id || auth.project_uid),
        ...splitScopeList(auth.projectIds || auth.projectUids || auth.projects)
      ].filter(Boolean)
    )
  );
}

async function findAssignmentProjectByAnyId(projectId, executor = mysqlPool) {
  const clean = cleanString(projectId);
  if (!clean) return null;
  const [rows] = await executor.execute(
    `
      SELECT project_uid, name, start_date, end_date
      FROM projects
      WHERE project_uid = ? OR CAST(id AS CHAR) = ? OR CAST(legacy_project_id AS CHAR) = ?
      ORDER BY archived ASC, id ASC
      LIMIT 1
    `,
    [clean, clean, clean]
  );
  return rows[0] || null;
}

async function findAssignmentProjectByName(projectName, executor = mysqlPool) {
  const clean = cleanString(projectName);
  if (!clean) return null;
  const [rows] = await executor.execute(
    `
      SELECT project_uid, name, start_date, end_date
      FROM projects
      WHERE name = ?
      ORDER BY archived ASC, id ASC
      LIMIT 1
    `,
    [clean]
  );
  return rows[0] || null;
}

async function resolveAssignmentProject(payload = {}, auth = {}, executor = mysqlPool) {
  const normalizedPayload = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  const projectIds = assignmentScopeProjectIds(payload, auth);
  for (const projectId of projectIds) {
    const project = await findAssignmentProjectByAnyId(projectId, executor);
    if (project) return project;
  }

  const projectName = cleanString(normalizedPayload.project || normalizedPayload.projectName);
  if (projectName) {
    const project = await findAssignmentProjectByName(projectName, executor);
    if (project) return project;
  }

  if (projectIds.length || projectName) notFound("项目不存在");
  badRequest("projectId 或 projectUid 为必填项");
}

async function resolveAssignmentProjectContext(payload = {}, auth = {}, executor = mysqlPool) {
  const normalizedPayload = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  const project = await resolveAssignmentProject(payload, auth, executor);
  return {
    projectId: project.project_uid,
    projectUid: project.project_uid,
    project: project.name || cleanString(normalizedPayload.project || normalizedPayload.projectName),
    projectName: project.name || cleanString(normalizedPayload.project || normalizedPayload.projectName)
  };
}

async function ensureAssignmentSchedulePlan(project = {}, payload = {}, auth = {}, executor = mysqlPool) {
  const [rows] = await executor.execute(
    `
      SELECT plan_uid, project_uid, title, start_date, end_date
      FROM schedule_plans
      WHERE project_uid = ? AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `,
    [project.project_uid]
  );
  if (rows[0]) return rows[0];

  const actor = actorId(auth);
  const title = cleanString(payload.planTitle || payload.plan_title || `${project.name || "项目"}排期`, "项目排期");
  const startDate = cleanDate(payload.startDate || payload.start_date, cleanDate(project.start_date, null));
  const endDate = cleanDate(payload.endDate || payload.end_date, cleanDate(project.end_date, null));

  try {
    await executor.execute(
      `
        INSERT INTO schedule_plans (
          plan_uid, project_uid, title, start_date, end_date, created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [makeUid("sp"), project.project_uid, title, startDate, endDate, actor, actor]
    );
  } catch (error) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
  }

  const [createdRows] = await executor.execute(
    `
      SELECT plan_uid, project_uid, title, start_date, end_date
      FROM schedule_plans
      WHERE project_uid = ? AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `,
    [project.project_uid]
  );
  if (!createdRows[0]) conflict("创建后未找到可用排期计划");
  return createdRows[0];
}

function normalizeAssignmentCreatePayload(payload = {}, assignment = {}, project = {}) {
  const normalizedPayload = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  const assigneeId = cleanString(normalizedPayload.assigneeId || normalizedPayload.personId || normalizedPayload.userId || assignment.assigneeId || assignment.personId);
  const assigneeName = cleanString(normalizedPayload.assigneeName || normalizedPayload.assignee_name || assignment.assigneeName, assigneeId);
  const title = cleanString(normalizedPayload.title || normalizedPayload.taskTitle || normalizedPayload.task_title || assignment.title, "新任务");
  const startDate = cleanDate(normalizedPayload.startDate || normalizedPayload.start_date || assignment.startDate, DEFAULT_RANGE.startDate);
  const endDate = cleanDate(
    normalizedPayload.endDate || normalizedPayload.end_date || assignment.endDate,
    normalizedPayload.startDate || assignment.startDate || DEFAULT_RANGE.endDate
  );
  if (startDate && endDate && endDate < startDate) throw badRequest("结束日期不能早于开始日期");

  return {
    title,
    module: cleanString(normalizedPayload.module || normalizedPayload.moduleKey || normalizedPayload.module_key, "project"),
    ownerUserId: assigneeId,
    owner: assigneeName,
    status: cleanString(normalizedPayload.status, "todo"),
    priority: cleanString(normalizedPayload.priority, "normal"),
    progress: 0,
    startDate,
    endDate,
    note: cleanString(normalizedPayload.note || normalizedPayload.description || assignmentReason(normalizedPayload), ""),
    projectId: cleanString(normalizedPayload.projectId || normalizedPayload.projectUid || project.project_uid || assignment.projectId),
    projectName: cleanString(normalizedPayload.project || normalizedPayload.projectName || project.name || assignment.project),
    assigneeId,
    assigneeName
  };
}

function assignmentRefreshQuery(payload = {}, scheduleSync = {}) {
  const scope = payload.scope && typeof payload.scope === "object" ? payload.scope : {};
  return mergeDefined(
    {
      startDate: cleanString(payload.startDate || payload.start_date),
      endDate: cleanString(payload.endDate || payload.end_date),
      departmentId: cleanString(payload.departmentId || payload.department_id || scope.departmentId || scope.departmentIds?.[0]),
      projectId: cleanString(
        payload.projectId ||
          payload.projectUid ||
          payload.project_id ||
          payload.project_uid ||
          scope.projectId ||
          scope.projectIds?.[0] ||
          scheduleSync.scheduleItem?.projectId ||
          scheduleSync.task?.projectId
      )
    }
  );
}

function normalizeAssignmentPreviewContext(row = null) {
  if (!row) return {};
  const stored = parseJson(row.payload_json, {});
  const request = stored.request || stored.payload || {};
  const preview = stored.preview || {};
  return mergeDefined(
    request,
    {
      previewId: row.preview_uid,
      title: row.title,
      projectId: row.project_uid,
      project: row.project_name,
      assigneeId: row.assignee_user_uid,
      assigneeName: row.assignee_name,
      startDate: toDateSlash(row.start_date),
      endDate: toDateSlash(row.end_date)
    },
    preview
  );
}

async function findAssignmentPreviewContext(previewId, executor = mysqlPool) {
  const clean = cleanString(previewId);
  if (!clean) return {};
  const [rows] = await executor.execute(
    `
      SELECT
        preview_uid, title, project_uid, project_name, assignee_user_uid,
        assignee_name, start_date, end_date, payload_json
      FROM hr_assignment_previews
      WHERE preview_uid = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [clean]
  );
  return normalizeAssignmentPreviewContext(rows[0] || null);
}

async function findSchedulePatchItemById(workItemId, executor = mysqlPool) {
  const clean = cleanString(workItemId);
  if (!clean) return null;
  const [rows] = await executor.execute(
    `
      SELECT
        item_uid, task_uid, legacy_task_id, project_uid, title, owner_user_uid,
        owner_text, status, start_date, end_date, hidden
      FROM schedule_items
      WHERE item_uid = ? OR CAST(id AS CHAR) = ?
      ORDER BY id ASC
      LIMIT 1
    `,
    [clean, clean]
  );
  return rows[0] || null;
}

async function findSchedulePatchTaskById(taskId, executor = mysqlPool) {
  const clean = cleanString(taskId);
  if (!clean) return null;
  const [rows] = await executor.execute(
    `
      SELECT
        id, task_uid, legacy_task_id, project_uid, title, owner_user_uid,
        owner_text, status, start_date, end_date, archived
      FROM tasks
      WHERE task_uid = ? OR CAST(id AS CHAR) = ? OR CAST(legacy_task_id AS CHAR) = ?
      ORDER BY id ASC
      LIMIT 1
    `,
    [clean, clean, clean]
  );
  return rows[0] || null;
}

async function findSchedulePatchTaskByUid(taskUid, executor = mysqlPool) {
  const clean = cleanString(taskUid);
  if (!clean) return null;
  const [rows] = await executor.execute(
    `
      SELECT
        id, task_uid, legacy_task_id, project_uid, title, owner_user_uid,
        owner_text, status, start_date, end_date, archived
      FROM tasks
      WHERE task_uid = ?
      LIMIT 1
    `,
    [clean]
  );
  return rows[0] || null;
}

async function findSchedulePatchItemByTaskUid(taskUid, executor = mysqlPool) {
  const clean = cleanString(taskUid);
  if (!clean) return null;
  const [rows] = await executor.execute(
    `
      SELECT
        item_uid, task_uid, legacy_task_id, project_uid, title, owner_user_uid,
        owner_text, status, start_date, end_date, hidden
      FROM schedule_items
      WHERE task_uid = ? AND hidden = 0
      ORDER BY id ASC
      LIMIT 1
    `,
    [clean]
  );
  return rows[0] || null;
}

function stableSchedulePatchItemLookupId(payload = {}, fallback = "") {
  return firstCleanString(payload.scheduleItemId, payload.schedule_item_id, payload.itemId, payload.item_id, payload.itemUid, payload.item_uid, fallback);
}

function stableSchedulePatchTaskLookupId(payload = {}, fallback = "") {
  return firstCleanString(payload.taskUid, payload.task_uid, payload.taskId, payload.task_id, fallback);
}

async function updateSchedulePatchItem(itemUid, normalized, actor, executor) {
  const [result] = await executor.execute(
    `
      UPDATE schedule_items
      SET
        start_date = ?,
        end_date = ?,
        owner_user_uid = ?,
        owner_text = ?,
        title = ?,
        project_uid = ?,
        updated_by = ?
      WHERE item_uid = ?
    `,
    [
      normalized.startDate,
      normalized.endDate,
      normalized.ownerUserId,
      normalized.owner,
      normalized.title,
      normalized.projectId,
      actor,
      itemUid
    ]
  );
  return Number(result.affectedRows || 0);
}

async function updateSchedulePatchTask(taskUid, normalized, actor, executor) {
  const [result] = await executor.execute(
    `
      UPDATE tasks
      SET
        start_date = ?,
        end_date = ?,
        owner_user_uid = ?,
        owner_text = ?,
        title = ?,
        project_uid = ?,
        updated_by = ?
      WHERE task_uid = ?
    `,
    [
      normalized.startDate,
      normalized.endDate,
      normalized.ownerUserId,
      normalized.owner,
      normalized.title,
      normalized.projectId,
      actor,
      taskUid
    ]
  );
  return Number(result.affectedRows || 0);
}

async function updateSchedulePatchItemsByTaskUid(taskUid, normalized, actor, executor) {
  const [result] = await executor.execute(
    `
      UPDATE schedule_items
      SET
        start_date = ?,
        end_date = ?,
        owner_user_uid = ?,
        owner_text = ?,
        title = ?,
        project_uid = ?,
        updated_by = ?
      WHERE task_uid = ? AND hidden = 0
    `,
    [
      normalized.startDate,
      normalized.endDate,
      normalized.ownerUserId,
      normalized.owner,
      normalized.title,
      normalized.projectId,
      actor,
      taskUid
    ]
  );
  return Number(result.affectedRows || 0);
}

export async function updateWorkspaceWorkItemSchedule(workItemId, payload = {}, auth = {}) {
  const cleanWorkItemId = cleanString(workItemId || payload.workItemId || payload.itemId || payload.taskId);
  if (!cleanWorkItemId) throw badRequest("workItemId 为必填项");

  const dateProbe = {
    start_date: cleanDate(payload.startDate || payload.start_date, null),
    end_date: cleanDate(payload.endDate || payload.end_date || payload.startDate || payload.start_date, null)
  };
  normalizeSchedulePatchPayload(dateProbe, payload);
  assertMySQLReady();

  const actor = actorId(auth);
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const itemLookupId = stableSchedulePatchItemLookupId(payload, cleanWorkItemId);
    const taskLookupId = stableSchedulePatchTaskLookupId(payload, cleanWorkItemId);
    const currentItem = await findSchedulePatchItemById(itemLookupId, connection);

    let source = "scheduleItem";
    let currentTask = null;
    let normalized = null;
    let scheduleItemsUpdated = 0;
    let taskUpdated = false;
    let linkedScheduleItemsUpdated = 0;
    let updatedItem = null;
    let updatedTask = null;

    if (currentItem) {
      normalized = normalizeSchedulePatchPayload(currentItem, payload);
      scheduleItemsUpdated = await updateSchedulePatchItem(currentItem.item_uid, normalized, actor, connection);
      if (currentItem.task_uid) {
        currentTask = await findSchedulePatchTaskByUid(currentItem.task_uid, connection);
        if (currentTask) {
          taskUpdated = (await updateSchedulePatchTask(currentTask.task_uid, normalized, actor, connection)) > 0;
        }
      }
      updatedItem = await findSchedulePatchItemById(currentItem.item_uid, connection);
      updatedTask = currentItem.task_uid ? await findSchedulePatchTaskByUid(currentItem.task_uid, connection) : null;
    } else {
      source = "task";
      currentTask = await findSchedulePatchTaskById(taskLookupId, connection);
      if (!currentTask) throw notFound("未找到工作项");
      normalized = normalizeSchedulePatchPayload(currentTask, payload);
      taskUpdated = (await updateSchedulePatchTask(currentTask.task_uid, normalized, actor, connection)) > 0;
      linkedScheduleItemsUpdated = await updateSchedulePatchItemsByTaskUid(currentTask.task_uid, normalized, actor, connection);
      updatedTask = await findSchedulePatchTaskByUid(currentTask.task_uid, connection);
      updatedItem = await findSchedulePatchItemByTaskUid(currentTask.task_uid, connection);
    }

    await connection.commit();
    const scheduleUpdated = scheduleItemsUpdated > 0 || linkedScheduleItemsUpdated > 0;
    const resourceWorkItemUpdated = scheduleUpdated || taskUpdated;
    return {
      ok: true,
      workItemId: cleanWorkItemId,
      scheduleItem: mapSchedulePatchItem(updatedItem),
      task: mapSchedulePatchTask(updatedTask),
      workItem: mapSchedulePatchItem(updatedItem)?.id ? mapSchedulePatchItem(updatedItem) : mapSchedulePatchTask(updatedTask),
      sync: {
        source,
        interaction: cleanString(payload.interaction || payload.action || ""),
        resourceWorkItemUpdated,
        scheduleUpdated,
        taskUpdated,
        scheduleItemsUpdated,
        linkedScheduleItemsUpdated
      },
      syncResult: {
        source,
        interaction: cleanString(payload.interaction || payload.action || ""),
        scheduleItemsUpdated,
        taskUpdated,
        linkedScheduleItemsUpdated,
        resourceWorkItemUpdated,
        scheduleUpdated,
        forceReason: normalized?.forceReason || ""
      }
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function previewAssignment(payload = {}, auth = {}) {
  const previewPayload = normalizeAssignmentConfirmPayload(payload);
  await ensureHrSchemaReady();
  assertWritable(auth);
  const snapshot = await getResourceSnapshot(previewPayload.scope || {}, auth);
  const candidates = buildCandidateList(snapshot.people, previewPayload);
  const previewUid = cleanString(previewPayload.previewId || previewPayload.id) || makeUid("preview");
  const { requestedAssigneeId, selected, requestedCandidateMissing } = selectAssignmentCandidate(candidates, payload);
  const allowed = Boolean(selected) && !requestedCandidateMissing;
  const preview = {
    id: previewUid,
    previewId: previewUid,
    allowed,
    status: allowed ? "ready" : requestedCandidateMissing ? "assignee_not_in_candidates" : "no_candidates",
    reason: requestedCandidateMissing ? "ASSIGNEE_NOT_IN_CANDIDATES" : selected ? "" : "NO_ASSIGNMENT_CANDIDATES",
    requestedAssigneeId,
    candidate: selected,
    candidates,
    conflicts: allowed && selected?.conflictCount ? selected.conflictTasks : [],
    title: cleanString(previewPayload.title || previewPayload.taskTitle, "新任务"),
    startDate: toDateSlash(cleanDate(previewPayload.startDate, DEFAULT_RANGE.startDate)),
    endDate: toDateSlash(cleanDate(previewPayload.endDate, previewPayload.startDate || DEFAULT_RANGE.endDate))
  };
  await mysqlPool.execute(
    `
      INSERT INTO hr_assignment_previews (
        preview_uid, title, project_uid, project_name, assignee_user_uid,
        assignee_name, start_date, end_date, status, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preview', ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        project_uid = VALUES(project_uid),
        project_name = VALUES(project_name),
        assignee_user_uid = VALUES(assignee_user_uid),
        assignee_name = VALUES(assignee_name),
        start_date = VALUES(start_date),
        end_date = VALUES(end_date),
        payload_json = VALUES(payload_json),
        updated_by = VALUES(updated_by)
    `,
    [
      previewUid,
      preview.title,
      cleanString(previewPayload.projectId || previewPayload.projectUid),
      cleanString(previewPayload.project || previewPayload.projectName),
      allowed ? selected?.personId || "" : "",
      allowed ? selected?.name || cleanString(previewPayload.assigneeName) : "",
      cleanDate(previewPayload.startDate, DEFAULT_RANGE.startDate),
      cleanDate(previewPayload.endDate, previewPayload.startDate || DEFAULT_RANGE.endDate),
      toJson({ request: previewPayload, preview }, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  return { preview };
}

async function insertAssignmentRecord(payload = {}, auth = {}, forced = false) {
  const normalizedPayload = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  const assigneeId = cleanString(normalizedPayload.assigneeId || normalizedPayload.personId || normalizedPayload.userId);
  if (!assigneeId) throw badRequest("assigneeId 为必填项");
  const workItemId = assignmentWorkItemId(normalizedPayload);
  const scheduleItemId = cleanString(normalizedPayload.scheduleItemId || normalizedPayload.schedule_item_id || normalizedPayload.itemId || normalizedPayload.item_id);
  const taskUid = cleanString(normalizedPayload.taskUid || normalizedPayload.task_uid || normalizedPayload.taskId || normalizedPayload.task_id);
  const title = cleanString(normalizedPayload.title || normalizedPayload.taskTitle, "新任务");
  const previewUid = cleanString(normalizedPayload.previewId) || makeUid("preview");
  const startDate = cleanDate(normalizedPayload.startDate, DEFAULT_RANGE.startDate);
  const endDate = cleanDate(normalizedPayload.endDate, normalizedPayload.startDate || DEFAULT_RANGE.endDate);
  await mysqlPool.execute(
    `
      INSERT INTO hr_assignment_previews (
        preview_uid, title, project_uid, project_name, assignee_user_uid,
        assignee_name, start_date, end_date, status, force_reason, payload_json,
        created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        project_uid = VALUES(project_uid),
        project_name = VALUES(project_name),
        assignee_user_uid = VALUES(assignee_user_uid),
        assignee_name = VALUES(assignee_name),
        start_date = VALUES(start_date),
        end_date = VALUES(end_date),
        status = VALUES(status),
        force_reason = VALUES(force_reason),
        payload_json = VALUES(payload_json),
        updated_by = VALUES(updated_by)
    `,
    [
      previewUid,
      title,
      cleanString(normalizedPayload.projectId || normalizedPayload.projectUid),
      cleanString(normalizedPayload.project || normalizedPayload.projectName),
      assigneeId,
      cleanString(normalizedPayload.assigneeName),
      startDate,
      endDate,
      forced ? "force_confirmed" : "confirmed",
      cleanString(normalizedPayload.forceReason || normalizedPayload.reason),
      toJson({ request: normalizedPayload, forced }, {}),
      actorId(auth),
      actorId(auth)
    ]
  );
  return {
    id: `assignment-${previewUid}`,
    assignmentId: `assignment-${previewUid}`,
    workItemId,
    itemId: scheduleItemId || workItemId,
    scheduleItemId,
    taskId: taskUid,
    taskUid,
    personId: assigneeId,
    assigneeId,
    assigneeName: cleanString(normalizedPayload.assigneeName),
    title,
    project: cleanString(normalizedPayload.project || normalizedPayload.projectName),
    projectId: cleanString(normalizedPayload.projectId || normalizedPayload.projectUid),
    startDate: toDateSlash(startDate),
    endDate: toDateSlash(endDate),
    status: forced ? "danger" : "new"
  };
}

async function syncAssignmentWorkItem(payload = {}, assignment = {}, auth = {}) {
  const workItemId = assignmentWorkItemId(payload) || assignment.workItemId || assignment.scheduleItemId || assignment.taskUid;
  if (!workItemId) {
    codedConflict("RESOURCE_SYNC_LINK_MISSING", "RESOURCE_SYNC_LINK_MISSING");
  }
  return updateWorkspaceWorkItemSchedule(workItemId, normalizeAssignmentSyncPayload(payload, assignment), auth);
}

async function createAssignmentWorkItem(payload = {}, assignment = {}, auth = {}) {
  const normalizedPayload = payload?.__assignmentConfirmNormalized ? payload : normalizeAssignmentConfirmPayload(payload);
  assertMySQLReady();
  const actor = actorId(auth);
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const project = await resolveAssignmentProject(normalizedPayload, auth, connection);
    const plan = await ensureAssignmentSchedulePlan(project, normalizedPayload, auth, connection);
    const normalized = normalizeAssignmentCreatePayload(normalizedPayload, assignment, project);
    const previewId = cleanString(normalizedPayload.previewId || normalizedPayload.id || assignment.assignmentId);
    const taskUid = cleanString(normalizedPayload.taskUid || normalizedPayload.task_uid || normalizedPayload.taskId || normalizedPayload.task_id || assignment.taskUid) || makeUid("task");
    const legacyTaskId = Number(cleanString(normalizedPayload.legacyTaskId || normalizedPayload.legacy_task_id || assignment.taskId)) || Date.now();
    const itemUid = cleanString(normalizedPayload.scheduleItemId || normalizedPayload.schedule_item_id || normalizedPayload.itemId || normalizedPayload.item_id || assignment.scheduleItemId) || makeUid("si");
    const sortOrder = Number(normalizedPayload.sortOrder ?? normalizedPayload.sort_order ?? Date.now());
    const taskPayload = toJson(
      {
        source: "hr-assignment",
        previewId,
        forceReason: assignmentReason(normalizedPayload),
        scheduleStatus: normalized.status,
        progress: 0,
        attachments: []
      },
      {}
    );
    const itemPayload = toJson(
      {
        source: "hr-assignment",
        previewId,
        taskUid,
        forceReason: assignmentReason(normalizedPayload)
      },
      {}
    );

    await connection.execute(
      `
        INSERT INTO tasks (
          task_uid, project_uid, legacy_task_id, title, task_type, module_key, owner_user_uid, owner_text,
          status, priority, start_date, end_date, archived, expanded, sort_order, note_text, payload_json, created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)
      `,
      [
        taskUid,
        project.project_uid,
        legacyTaskId,
        normalized.title,
        "schedule",
        normalized.module,
        normalized.ownerUserId,
        normalized.owner,
        normalized.status,
        normalized.priority,
        normalized.startDate,
        normalized.endDate,
        Number.isFinite(sortOrder) ? sortOrder : Date.now(),
        normalized.note,
        taskPayload,
        actor,
        actor
      ]
    );

    await connection.execute(
      `
        INSERT INTO schedule_items (
          item_uid, plan_uid, project_uid, task_uid, legacy_task_id, item_type, title, module_key, owner_user_uid, owner_text,
          status, priority, progress, start_date, end_date, sort_order, hidden, link_task, link_flow, note_text, payload_json,
          created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, 'schedule', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?, ?, ?)
      `,
      [
        itemUid,
        plan.plan_uid,
        project.project_uid,
        taskUid,
        legacyTaskId,
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
        normalized.note,
        itemPayload,
        actor,
        actor
      ]
    );

    const previewUid = cleanString(normalizedPayload.previewId || normalizedPayload.id);
    if (previewUid) {
      await connection.execute(
        `
          UPDATE hr_assignment_previews
          SET
            project_uid = ?,
            project_name = ?,
            assignee_user_uid = ?,
            assignee_name = ?,
            start_date = ?,
            end_date = ?,
            updated_by = ?
          WHERE preview_uid = ?
        `,
        [
          project.project_uid,
          normalized.projectName,
          normalized.assigneeId,
          normalized.assigneeName,
          normalized.startDate,
          normalized.endDate,
          actor,
          previewUid
        ]
      );
    }

    await connection.commit();

    const scheduleItem = await findSchedulePatchItemById(itemUid);
    const task = await findSchedulePatchTaskByUid(taskUid);
    const interaction = cleanString(normalizedPayload.interaction || normalizedPayload.action || "confirm-assignment");
    return {
      ok: true,
      workItemId: itemUid,
      scheduleItem: mapSchedulePatchItem(scheduleItem),
      task: mapSchedulePatchTask(task),
      workItem: mapSchedulePatchItem(scheduleItem),
      sync: {
        source: "create",
        interaction,
        resourceWorkItemUpdated: true,
        scheduleUpdated: true,
        taskUpdated: true,
        scheduleItemsUpdated: 1,
        linkedScheduleItemsUpdated: 0
      },
      syncResult: {
        source: "create",
        interaction,
        scheduleItemsUpdated: 1,
        taskUpdated: true,
        linkedScheduleItemsUpdated: 0,
        resourceWorkItemUpdated: true,
        scheduleUpdated: true,
        forceReason: assignmentReason(normalizedPayload),
        taskCreated: true,
        scheduleCreated: true
      }
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureAssignmentWorkItem(payload = {}, assignment = {}, auth = {}) {
  const workItemId = assignmentWorkItemId(payload) || assignment.workItemId || assignment.scheduleItemId || assignment.taskUid;
  if (workItemId) return syncAssignmentWorkItem(payload, assignment, auth);
  return createAssignmentWorkItem(payload, assignment, auth);
}

function assertAssignmentSyncLink(payload = {}, assignment = {}) {
  const workItemId = assignmentWorkItemId(payload) || assignment.workItemId || assignment.scheduleItemId || assignment.taskUid;
  if (!workItemId) {
    codedConflict("RESOURCE_SYNC_LINK_MISSING", "RESOURCE_SYNC_LINK_MISSING");
  }
  return workItemId;
}

export async function confirmAssignment(payload = {}, auth = {}, options = {}) {
  const requestPayload = normalizeAssignmentConfirmPayload(payload);
  if (options.forced && !assignmentReason(requestPayload)) throw badRequest("强制指派时必须填写 forceReason");
  await ensureHrSchemaReady();
  assertWritable(auth);
  if (options.forced && !hasPermission(auth, "resource.forceassign")) {
    throw forbidden("无权执行强制指派");
  }
  const previewContext = await findAssignmentPreviewContext(requestPayload.previewId || requestPayload.id);
  let confirmPayload = normalizeAssignmentConfirmPayload(mergeDefined(previewContext, requestPayload));
  const snapshot = await getResourceSnapshot(confirmPayload.scope || {}, auth);
  const candidates = buildCandidateList(snapshot.people, confirmPayload);
  const { requestedAssigneeId, requestedCandidateMissing } = selectAssignmentCandidate(candidates, confirmPayload);
  if (requestedAssigneeId && requestedCandidateMissing) {
    throw forbidden("指派对象不在可选候选人列表中");
  }
  if (!assignmentWorkItemId(confirmPayload)) {
    confirmPayload = mergeDefined(confirmPayload, await resolveAssignmentProjectContext(confirmPayload, auth));
  }
  const assignment = await insertAssignmentRecord(confirmPayload, auth, Boolean(options.forced));
  const scheduleSync = await ensureAssignmentWorkItem(confirmPayload, assignment, auth);
  if (!assignment.workItemId && scheduleSync.scheduleItem?.id) assignment.workItemId = scheduleSync.scheduleItem.id;
  if (!assignment.scheduleItemId && scheduleSync.scheduleItem?.id) assignment.scheduleItemId = scheduleSync.scheduleItem.id;
  if (!assignment.itemId && scheduleSync.scheduleItem?.id) assignment.itemId = scheduleSync.scheduleItem.id;
  if (!assignment.taskUid && scheduleSync.task?.taskUid) assignment.taskUid = scheduleSync.task.taskUid;
  if (!assignment.taskId && (scheduleSync.task?.taskUid || scheduleSync.task?.taskId)) assignment.taskId = scheduleSync.task.taskUid || scheduleSync.task.taskId;
  if (!assignment.projectId && (scheduleSync.scheduleItem?.projectId || scheduleSync.task?.projectId)) {
    assignment.projectId = scheduleSync.scheduleItem?.projectId || scheduleSync.task?.projectId;
  }
  const scheduleUpdated = Number(scheduleSync.syncResult?.scheduleItemsUpdated || 0) > 0 || Number(scheduleSync.syncResult?.linkedScheduleItemsUpdated || 0) > 0;
  const taskUpdated = Boolean(scheduleSync.syncResult?.taskUpdated);
  const resourceWorkItemUpdated = scheduleUpdated || taskUpdated;
  const refreshQuery = assignmentRefreshQuery(confirmPayload, scheduleSync);
  await createNotification({
    notificationUid: makeNotificationUid("task_assignment", assignment.taskUid || assignment.taskId || assignment.scheduleItemId || assignment.id, assignment.assigneeId),
    type: "task_assignment",
    recipientUserId: assignment.assigneeId,
    title: "领导分配了任务",
    text: assignment.title,
    resourceType: "task",
    resourceId: assignment.taskUid || assignment.taskId || assignment.scheduleItemId,
    projectId: assignment.projectId,
    taskId: assignment.taskUid || assignment.taskId,
    actorUserId: actorId(auth),
    actorName: cleanString(auth.name || auth.username || "领导"),
    payload: {
      projectName: assignment.project,
      taskTitle: assignment.title,
      forced: Boolean(options.forced),
      reason: assignmentReason(requestPayload)
    }
  }, auth);
  return {
    assignment,
    workItem: scheduleSync.scheduleItem?.id ? scheduleSync.scheduleItem : assignment,
    scheduleItem: scheduleSync.scheduleItem,
    task: scheduleSync.task,
    sync: {
      scheduleUpdated,
      taskUpdated,
      resourceWorkItemUpdated
    },
    syncResult: scheduleSync.syncResult || scheduleSync,
    completion: {
      ok: resourceWorkItemUpdated,
      forced: Boolean(options.forced),
      reason: assignmentReason(requestPayload)
    },
    resources: await getResourceSnapshot(refreshQuery, auth),
    workload: await getWorkloadSnapshot(refreshQuery, auth)
  };
}

export const __private__ = {
  MYSQL_UNAVAILABLE_MESSAGE,
  buildCandidateList,
  buildResourcePermissions,
  candidateMatchesAssignee,
  cleanDate,
  callHrDeepSeek,
  isHrAiConfigurationError,
  mapEmployee,
  mapPayrollRecord,
  mapResourcePerson,
  buildWorkItemAccessFilter,
  normalizeHrModel,
  normalizeAssignmentConfirmPayload,
  normalizePayrollPayload,
  assignmentWorkItemId,
  resolveHrDeepSeekApiKey,
  selectAssignmentCandidate,
  resolveScope
};
