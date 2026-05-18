import { isMySQLReady, mysqlPool } from "../db/mysql.js";

const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for template API";
const visibleTextReplacements = new Map([
  ["\u699b\u6a18\u8a75\u93ba\u6393\u6e6f\u59af\u6fa8", "默认排期模板"],
  ["\u699b\u6a18\u8a75\u6d60\u8bef\u59ec\u52a1\u59af\u6fa8", "默认任务模板"]
]);

function normalizeVisibleText(value) {
  const text = String(value || "");
  return visibleTextReplacements.get(text) || text;
}

function buildMySQLUnavailableError() {
  const error = new Error(MYSQL_UNAVAILABLE_MESSAGE);
  error.statusCode = 503;
  return error;
}

function assertMySQLReady() {
  if (!isMySQLReady()) throw buildMySQLUnavailableError();
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

function makeUid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function trimText(value, maxLength = 255) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function actorId(auth = {}) {
  return trimText(auth.sub || auth.id || auth.userId || auth.username || "", 64);
}

function actorName(auth = {}) {
  return trimText(auth.name || auth.username || auth.sub || "", 128);
}

function isAdminAuth(auth = {}) {
  return String(auth.role || "").trim().toLowerCase() === "admin";
}

function normalizeKind(value = "task") {
  const clean = String(value || "").trim().toLowerCase();
  return clean === "schedule" ? "schedule" : "task";
}

function normalizeVisibility(value = "private") {
  const clean = String(value || "").trim().toLowerCase();
  if (["private", "workspace", "public", "shared"].includes(clean)) return clean;
  return "private";
}

function normalizePermission(value = "read") {
  const clean = String(value || "").trim().toLowerCase();
  if (["write", "edit", "manage", "owner"].includes(clean)) return "write";
  return "read";
}

function permissionForClient(value = "read") {
  return normalizePermission(value) === "write" ? "edit" : "read";
}

function isTemplateGroup(row = {}) {
  const payload = parseJson(row.payload_json, {});
  if (payload.isGroup === true || payload.nodeType === "group") return true;
  if (payload.isTemplate === true || payload.nodeType === "template") return false;
  return !trimText(row.parent_template_uid);
}

function rowKind(row = {}) {
  const payload = parseJson(row.payload_json, {});
  return normalizeKind(payload.kind || row.kind || row.group_key || "task");
}

function contentForKind(row = {}) {
  const payload = parseJson(row.payload_json, {});
  const content = parseJson(row.content_json, {});
  if (payload.template !== undefined) return payload.template;
  if (payload.content !== undefined) return payload.content;
  return content;
}

function countTemplateItems(kind, content) {
  if (kind === "schedule") {
    if (Array.isArray(content?.items)) return content.items.length;
    return 0;
  }
  if (Array.isArray(content)) return content.length;
  if (Array.isArray(content?.tasks)) return content.tasks.length;
  if (Array.isArray(content?.items)) return content.items.length;
  return 0;
}

function normalizeTemplatePayload(payload = {}, currentRow = null) {
  const currentPayload = currentRow ? parseJson(currentRow.payload_json, {}) : {};
  const title = normalizeVisibleText(trimText(payload.title ?? payload.name ?? currentRow?.title ?? ""));
  if (!title) throw badRequest("template title is required");

  const kind = normalizeKind(payload.kind || currentPayload.kind || currentRow?.group_key || "task");
  const visibility = normalizeVisibility(payload.visibility ?? currentRow?.visibility ?? "private");
  const parentTemplateUid = trimText(
    payload.parentTemplateId || payload.parentTemplateUid || payload.parentId || payload.groupId || currentRow?.parent_template_uid || "",
    64
  );
  const groupKey = trimText(payload.groupKey || payload.group || currentRow?.group_key || kind, 64);
  const content = payload.template ?? payload.content ?? payload.templateTasks ?? payload.templateSchedules ?? payload.tasks ?? payload.schedule ?? (currentRow ? parseJson(currentRow.content_json, {}) : {});
  const nextPayload = {
    ...currentPayload,
    ...(payload.payload && typeof payload.payload === "object" ? payload.payload : {}),
    kind,
    isGroup: payload.isGroup ?? currentPayload.isGroup ?? !parentTemplateUid,
    ownerName: trimText(payload.ownerName ?? currentPayload.ownerName ?? "", 128)
  };
  if (payload.locked !== undefined) nextPayload.locked = Boolean(payload.locked);

  return {
    title,
    kind,
    visibility,
    parentTemplateUid,
    groupKey,
    content,
    payload: nextPayload,
    taskCount: Number(payload.taskCount ?? countTemplateItems(kind, content)) || 0,
    locked: payload.locked === undefined ? Number(currentRow?.is_locked || 0) === 1 : Boolean(payload.locked),
    sortOrder: Number(payload.sortOrder ?? currentRow?.sort_order ?? Date.now()) || 0
  };
}

function mapShareRow(row = {}) {
  const payload = parseJson(row.payload_json, {});
  const permission = permissionForClient(row.permission);
  return {
    id: row.share_uid || "",
    shareId: row.share_uid || "",
    templateId: row.template_uid || "",
    fromUserId: row.from_user_uid || "",
    fromUser: payload.fromUserName || row.from_user_name || row.from_username || row.from_user_uid || "",
    userId: row.to_user_uid || "",
    userName: payload.userName || row.to_user_name || row.to_username || row.to_user_uid || "",
    permission,
    permissionCode: normalizePermission(row.permission),
    status: row.status || "active",
    note: row.note || "",
    sharedAt: row.shared_at_text || ""
  };
}

function mapTemplateRow(row = {}, shares = []) {
  const payload = parseJson(row.payload_json, {});
  const content = contentForKind(row);
  const kind = rowKind(row);
  const ownerId = row.owner_user_uid || "";
  const ownerName = payload.ownerName || row.owner_name || row.owner_username || ownerId;

  return {
    id: row.template_uid || "",
    templateId: row.template_uid || "",
    legacyTemplateId: row.legacy_template_id || "",
    title: normalizeVisibleText(row.title || ""),
    name: normalizeVisibleText(row.title || ""),
    kind,
    groupKey: row.group_key || "",
    parentTemplateId: row.parent_template_uid || "",
    ownerId,
    ownerName,
    visibility: row.visibility || "private",
    locked: Number(row.is_locked || 0) === 1 || payload.locked === true,
    sortOrder: Number(row.sort_order || 0),
    taskCount: Number(row.task_count || countTemplateItems(kind, content) || 0),
    template: content,
    content,
    payload,
    shares: shares.map(mapShareRow),
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    createdAt: row.created_at_text || "",
    updatedAt: row.updated_at_text || ""
  };
}

function canReadTemplateRow(row = {}, auth = {}, sharedTemplateIds = new Set()) {
  if (isAdminAuth(auth)) return true;
  const userUid = actorId(auth);
  if (userUid && (row.owner_user_uid === userUid || row.created_by === userUid)) return true;
  if (["workspace", "public"].includes(String(row.visibility || "").toLowerCase())) return true;
  return sharedTemplateIds.has(row.template_uid);
}

function canManageTemplateRow(row = {}, auth = {}) {
  if (isAdminAuth(auth)) return true;
  const userUid = actorId(auth);
  return Boolean(userUid && (row.owner_user_uid === userUid || row.created_by === userUid));
}

function addDefaultTemplateGroups(groups, auth = {}) {
  const userUid = actorId(auth);
  const name = actorName(auth);
  if (![...groups.values()].some((group) => group.kind === "schedule" && !group.locked)) {
    groups.set("tpl-schedule-default", {
      id: "tpl-schedule-default",
      title: "默认排期模板",
      kind: "schedule",
      children: [],
      templateTasks: {},
      templateSchedules: {},
      ownerId: userUid,
      ownerName: name,
      locked: false
    });
  }
  if (![...groups.values()].some((group) => group.kind !== "schedule" && !group.locked)) {
    groups.set("tpl-task-default", {
      id: "tpl-task-default",
      title: "默认任务模板",
      kind: "task",
      children: [],
      templateTasks: {},
      templateSchedules: {},
      ownerId: userUid,
      ownerName: name,
      locked: false
    });
  }
}

function buildTemplatesResponse(rows = [], sharesByTemplate = new Map(), auth = {}) {
  const items = rows.map((row) => mapTemplateRow(row, sharesByTemplate.get(row.template_uid) || []));
  const groups = new Map();
  const pendingChildren = [];

  for (const row of rows) {
    if (!isTemplateGroup(row)) {
      pendingChildren.push(row);
      continue;
    }
    const mapped = mapTemplateRow(row, sharesByTemplate.get(row.template_uid) || []);
    groups.set(mapped.id, {
      id: mapped.id,
      title: mapped.title,
      kind: mapped.kind,
      children: [],
      templateTasks: {},
      templateSchedules: {},
      ownerId: mapped.ownerId,
      ownerName: mapped.ownerName,
      locked: mapped.locked
    });
  }

  for (const row of pendingChildren) {
    const mapped = mapTemplateRow(row, sharesByTemplate.get(row.template_uid) || []);
    const parentId = mapped.parentTemplateId || mapped.groupKey || `${mapped.kind}-templates`;
    if (!groups.has(parentId)) {
      groups.set(parentId, {
        id: parentId,
        title: normalizeVisibleText(mapped.groupKey) || (mapped.kind === "schedule" ? "默认排期模板" : "默认任务模板"),
        kind: mapped.kind,
        children: [],
        templateTasks: {},
        templateSchedules: {},
        ownerId: mapped.ownerId,
        ownerName: mapped.ownerName,
        locked: false
      });
    }
    const group = groups.get(parentId);
    if (!group.children.includes(mapped.title)) group.children.push(mapped.title);
    group.templateIds = group.templateIds || {};
    group.templateIds[mapped.title] = mapped.id;
    if (mapped.kind === "schedule") {
      group.templateSchedules[mapped.title] = mapped.template || {};
    } else {
      group.templateTasks[mapped.title] = Array.isArray(mapped.template) ? mapped.template : mapped.template?.tasks || mapped.template?.items || [];
    }
  }

  addDefaultTemplateGroups(groups, auth);

  const templateShareInfo = {};
  for (const item of items) {
    const recipients = item.shares
      .filter((share) => String(share.status || "").toLowerCase() === "active")
      .map((share) => ({
        userId: share.userId || "",
        userName: share.userName || share.userId || "",
        permission: permissionForClient(share.permission)
      }));
    const sharedWith = recipients.map((entry) => entry.userName || entry.userId);
    const permissions = recipients.reduce((map, entry) => {
      const key = trimText(entry.userId || entry.userName, 128);
      if (key) map[key] = permissionForClient(entry.permission);
      return map;
    }, {});
    templateShareInfo[item.title] = {
      shared: sharedWith.length > 0,
      sharedWith,
      fromUser: item.shares.find((share) => share.fromUser)?.fromUser || null,
      recipients,
      permissions
    };
  }

  return {
    items,
    templates: [...groups.values()],
    templateShareInfo
  };
}

function accessFilter(auth = {}) {
  if (isAdminAuth(auth)) return { sql: "1 = 1", params: [] };
  const userUid = actorId(auth);
  return {
    sql: `
      (
        t.visibility IN ('workspace', 'public')
        OR t.owner_user_uid = ?
        OR t.created_by = ?
        OR EXISTS (
          SELECT 1
          FROM template_shares ts
          WHERE ts.template_uid = t.template_uid
            AND ts.to_user_uid = ?
            AND ts.status = 'active'
            AND (ts.expires_at IS NULL OR ts.expires_at > NOW())
        )
      )
    `,
    params: [userUid, userUid, userUid]
  };
}

async function fetchShares(templateUids = []) {
  if (!templateUids.length) return new Map();
  const placeholders = templateUids.map(() => "?").join(", ");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        ts.share_uid,
        ts.template_uid,
        ts.from_user_uid,
        from_user.name AS from_user_name,
        from_user.username AS from_username,
        ts.to_user_uid,
        to_user.name AS to_user_name,
        to_user.username AS to_username,
        ts.permission,
        ts.status,
        ts.note,
        ts.payload_json,
        DATE_FORMAT(ts.shared_at, '%Y-%m-%d %H:%i:%s') AS shared_at_text
      FROM template_shares ts
      LEFT JOIN users from_user ON from_user.user_uid = ts.from_user_uid
      LEFT JOIN users to_user ON to_user.user_uid = ts.to_user_uid
      WHERE ts.template_uid IN (${placeholders})
        AND ts.status = 'active'
        AND (ts.expires_at IS NULL OR ts.expires_at > NOW())
      ORDER BY ts.id ASC
    `,
    templateUids
  );
  const byTemplate = new Map();
  for (const row of rows) {
    if (!byTemplate.has(row.template_uid)) byTemplate.set(row.template_uid, []);
    byTemplate.get(row.template_uid).push(row);
  }
  return byTemplate;
}

async function resolveTemplate(templateId) {
  const clean = trimText(templateId, 64);
  if (!clean) throw badRequest("templateId is required");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        t.*,
        owner.name AS owner_name,
        owner.username AS owner_username,
        DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
        DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM templates t
      LEFT JOIN users owner ON owner.user_uid = t.owner_user_uid
      WHERE t.template_uid = ? OR t.legacy_template_id = ? OR CAST(t.id AS CHAR) = ?
      LIMIT 1
    `,
    [clean, clean, clean]
  );
  if (!rows[0]) throw notFound("Template not found");
  return rows[0];
}

async function resolveUserForShare(entry = {}) {
  const userLookup = trimText(entry.userId || entry.userUid || entry.id || entry.username || entry.userName || entry.name || "", 128);
  if (!userLookup) return null;
  const [rows] = await mysqlPool.execute(
    "SELECT user_uid, username, name FROM users WHERE user_uid = ? OR username = ? OR name = ? OR CAST(id AS CHAR) = ? LIMIT 1",
    [userLookup, userLookup, userLookup, userLookup]
  );
  const user = rows[0] || {};
  return {
    userId: user.user_uid || userLookup,
    userName: trimText(entry.userName || entry.name || user.name || user.username || userLookup, 128)
  };
}

async function buildTemplateDetail(row) {
  const sharesByTemplate = await fetchShares([row.template_uid]);
  return {
    template: mapTemplateRow(row, sharesByTemplate.get(row.template_uid) || [])
  };
}

export async function listTemplates(auth = {}, query = {}) {
  assertMySQLReady();
  const access = accessFilter(auth);
  const params = [...access.params];
  const filters = [access.sql];
  const kind = normalizeKind(query.kind || "");
  if (query.kind) {
    filters.push("(t.group_key = ? OR JSON_EXTRACT(t.payload_json, '$.kind') = ?)");
    params.push(kind, kind);
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        t.*,
        owner.name AS owner_name,
        owner.username AS owner_username,
        DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
        DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM templates t
      LEFT JOIN users owner ON owner.user_uid = t.owner_user_uid
      WHERE ${filters.join(" AND ")}
      ORDER BY t.sort_order ASC, t.updated_at DESC, t.id ASC
    `,
    params
  );

  const sharesByTemplate = await fetchShares(rows.map((row) => row.template_uid));
  return buildTemplatesResponse(rows, sharesByTemplate, auth);
}

export async function getTemplate(templateId, auth = {}) {
  assertMySQLReady();
  const template = await resolveTemplate(templateId);
  const sharesByTemplate = await fetchShares([template.template_uid]);
  const userUid = actorId(auth);
  const sharedTemplateIds = new Set((sharesByTemplate.get(template.template_uid) || []).some((share) => share.to_user_uid === userUid) ? [template.template_uid] : []);
  if (!canReadTemplateRow(template, auth, sharedTemplateIds)) throw forbidden("No permission to read template");
  return buildTemplateDetail(template);
}

export async function createTemplate(payload = {}, auth = {}) {
  assertMySQLReady();
  const normalized = normalizeTemplatePayload(payload);
  const userUid = actorId(auth);
  const templateUid = trimText(payload.templateId || payload.templateUid || payload.id || "", 64) || makeUid("template");

  await mysqlPool.execute(
    `
      INSERT INTO templates (
        template_uid, legacy_template_id, title, group_key, parent_template_uid,
        owner_user_uid, visibility, is_locked, sort_order, task_count,
        content_json, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      templateUid,
      trimText(payload.legacyTemplateId || "", 64),
      normalized.title,
      normalized.groupKey,
      normalized.parentTemplateUid,
      trimText(payload.ownerId || userUid, 64),
      normalized.visibility,
      normalized.locked ? 1 : 0,
      normalized.sortOrder,
      normalized.taskCount,
      stringifyJson(normalized.content, {}),
      stringifyJson(normalized.payload, {}),
      userUid,
      userUid
    ]
  );

  return buildTemplateDetail(await resolveTemplate(templateUid));
}

export async function updateTemplate(templateId, payload = {}, auth = {}) {
  assertMySQLReady();
  const current = await resolveTemplate(templateId);
  if (!canManageTemplateRow(current, auth)) throw forbidden("No permission to update template");
  const normalized = normalizeTemplatePayload(payload, current);

  await mysqlPool.execute(
    `
      UPDATE templates
      SET
        title = ?,
        group_key = ?,
        parent_template_uid = ?,
        visibility = ?,
        is_locked = ?,
        sort_order = ?,
        task_count = ?,
        content_json = ?,
        payload_json = ?,
        updated_by = ?
      WHERE template_uid = ?
    `,
    [
      normalized.title,
      normalized.groupKey,
      normalized.parentTemplateUid,
      normalized.visibility,
      normalized.locked ? 1 : 0,
      normalized.sortOrder,
      normalized.taskCount,
      stringifyJson(normalized.content, {}),
      stringifyJson(normalized.payload, {}),
      actorId(auth),
      current.template_uid
    ]
  );

  return buildTemplateDetail(await resolveTemplate(current.template_uid));
}

export async function deleteTemplate(templateId, auth = {}) {
  assertMySQLReady();
  const current = await resolveTemplate(templateId);
  if (!canManageTemplateRow(current, auth)) throw forbidden("No permission to delete template");

  const [childRows] = await mysqlPool.execute("SELECT template_uid FROM templates WHERE parent_template_uid = ?", [current.template_uid]);
  const templateUids = [current.template_uid, ...childRows.map((row) => row.template_uid)];
  const placeholders = templateUids.map(() => "?").join(", ");
  await mysqlPool.execute(`UPDATE template_shares SET status = 'revoked' WHERE template_uid IN (${placeholders})`, templateUids);
  const [result] = await mysqlPool.execute(`DELETE FROM templates WHERE template_uid IN (${placeholders})`, templateUids);
  if (!result.affectedRows) throw notFound("Template not found");
  return { ok: true, deletedTemplateId: current.template_uid };
}

function normalizeShareEntries(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.entries)) return payload.entries;
  if (Array.isArray(payload.recipients)) return payload.recipients;
  if (Array.isArray(payload.sharedWith)) return payload.sharedWith;
  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.userIds)) return payload.userIds.map((userId) => ({ userId }));
  if (payload.userId || payload.userUid || payload.username) return [payload];
  return [];
}

function nowText(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeSqlDate(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function templateTasksFromContent(content) {
  if (Array.isArray(content)) return content;
  if (Array.isArray(content?.tasks)) return content.tasks;
  if (Array.isArray(content?.items)) return content.items;
  return [];
}

function normalizeTaskArchivedForTemplate(item = {}) {
  if (item.archived !== undefined) return item.archived ? 1 : 0;
  const status = String(item.status || "").trim().toLowerCase();
  return ["archived", "done", "completed"].includes(status) ? 1 : 0;
}

function normalizeTaskStatusForTemplate(item = {}, archived = 0) {
  const clean = String(item.status || "").trim().toLowerCase();
  if (archived === 1) return clean || "archived";
  return clean || "todo";
}

async function createProjectFromTaskTemplate(connection, template = {}, payload = {}, auth = {}) {
  const actor = actorId(auth);
  const projectUid = trimText(payload.projectId || payload.id || payload.projectUid || "", 64) || makeUid("project");
  const projectName = normalizeVisibleText(
    trimText(
      payload.projectName ||
      payload.name ||
      `${template.title || "模板"}项目`
    )
  );
  if (!projectName) throw badRequest("project name is required when applying template");
  const groupUid = trimText(payload.groupId || payload.groupUid || "", 64);
  const ownerText = trimText(payload.owner || payload.ownerText || template.ownerName || actorName(auth), 255);
  const startDate = normalizeSqlDate(payload.startDate);
  const endDate = normalizeSqlDate(payload.endDate);
  const projectStatus = trimText(payload.status || "", 16) || "active";
  const projectArchived = payload.archived ? 1 : 0;
  const sortOrder = Number(payload.sortOrder ?? Date.now()) || 0;
  const projectPayloadJson = stringifyJson(
    {
      fromTemplateId: template.id || "",
      fromTemplateTitle: template.title || "",
      fromTemplateKind: template.kind || "task",
      syncSchedule: payload.syncSchedule !== false
    },
    {}
  );

  await connection.execute(
    `
      INSERT INTO projects (
        project_uid, legacy_project_id, group_uid, name, status, owner_text, start_date, end_date,
        archived, sort_order, payload_json, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      projectUid,
      Number(payload.legacyProjectId || payload.legacy_project_id || 0) || null,
      groupUid,
      projectName,
      projectStatus,
      ownerText,
      startDate,
      endDate,
      projectArchived,
      sortOrder,
      projectPayloadJson,
      actor,
      actor
    ]
  );

  const tasks = templateTasksFromContent(template.template || template.content || {});
  const createdTasks = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const rawTask = tasks[index] && typeof tasks[index] === "object" ? tasks[index] : {};
    const title = normalizeVisibleText(trimText(rawTask.title || rawTask.name || `模板任务${index + 1}`));
    if (!title) continue;
    const archived = normalizeTaskArchivedForTemplate(rawTask);
    const status = normalizeTaskStatusForTemplate(rawTask, archived);
    const taskUid = trimText(rawTask.taskId || rawTask.taskUid || rawTask.id || "", 64) || makeUid("task");
    const taskPayloadJson = stringifyJson(
      {
        time: trimText(rawTask.time || nowText(), 32),
        unreadComments: Number(rawTask.unreadComments || 0) || 0,
        scheduleStatus: trimText(rawTask.scheduleStatus || "", 32),
        progress: Number(rawTask.progress || 0) || 0,
        attachments: Array.isArray(rawTask.attachments) ? rawTask.attachments : []
      },
      {}
    );
    await connection.execute(
      `
        INSERT INTO tasks (
          task_uid, project_uid, legacy_task_id, title, task_type, module_key, owner_user_uid, owner_text,
          status, priority, start_date, end_date, archived, expanded, sort_order, note_text, payload_json, created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        taskUid,
        projectUid,
        Number(rawTask.legacyTaskId || rawTask.legacy_task_id || rawTask.id || 0) || null,
        title,
        trimText(rawTask.type || rawTask.taskType || "", 64) || "流程",
        trimText(rawTask.module || rawTask.moduleKey || "", 32) || "project",
        trimText(rawTask.ownerUserId || rawTask.owner_user_uid || "", 64),
        trimText(rawTask.owner || rawTask.ownerText || "", 255),
        status,
        trimText(rawTask.priority || "", 16) || "normal",
        normalizeSqlDate(rawTask.startDate || rawTask.start_date),
        normalizeSqlDate(rawTask.endDate || rawTask.end_date),
        archived,
        rawTask.expanded ? 1 : 0,
        Number(rawTask.sortOrder ?? rawTask.sort_order ?? index) || index,
        trimText(rawTask.note || rawTask.noteText || "暂无备注，可点击备注修改。", 65535),
        taskPayloadJson,
        actor,
        actor
      ]
    );
    createdTasks.push({
      id: taskUid,
      taskId: taskUid,
      title,
      status,
      archived: archived === 1
    });
  }

  return {
    id: projectUid,
    projectId: projectUid,
    name: projectName,
    taskCount: createdTasks.length,
    tasks: createdTasks
  };
}

export async function shareTemplate(templateId, payload = {}, auth = {}) {
  assertMySQLReady();
  const current = await resolveTemplate(templateId);
  if (!canManageTemplateRow(current, auth)) throw forbidden("No permission to share template");

  await mysqlPool.execute("UPDATE template_shares SET status = 'revoked' WHERE template_uid = ?", [current.template_uid]);
  const entries = normalizeShareEntries(payload);
  for (const entry of entries) {
    const normalizedEntry = typeof entry === "string" ? { userId: entry } : entry || {};
    const user = await resolveUserForShare(normalizedEntry);
    if (!user?.userId) continue;
    await mysqlPool.execute(
      `
        INSERT INTO template_shares (
          share_uid, template_uid, from_user_uid, to_user_uid, permission, status, note, payload_json
        )
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        ON DUPLICATE KEY UPDATE
          from_user_uid = VALUES(from_user_uid),
          permission = VALUES(permission),
          status = 'active',
          note = VALUES(note),
          payload_json = VALUES(payload_json),
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        makeUid("template-share"),
        current.template_uid,
        actorId(auth),
        user.userId,
        normalizePermission(normalizedEntry.permission),
        trimText(normalizedEntry.note || "", 255),
        stringifyJson(
          {
            userName: user.userName,
            fromUserName: actorName(auth)
          },
          {}
        )
      ]
    );
  }

  return buildTemplateDetail(await resolveTemplate(current.template_uid));
}

export async function unshareTemplate(templateId, userId, auth = {}) {
  assertMySQLReady();
  const current = await resolveTemplate(templateId);
  if (!canManageTemplateRow(current, auth)) throw forbidden("No permission to share template");
  const cleanUserId = trimText(userId, 64);
  if (!cleanUserId) throw badRequest("userId is required");
  const [users] = await mysqlPool.execute(
    "SELECT user_uid FROM users WHERE user_uid = ? OR username = ? OR name = ? OR CAST(id AS CHAR) = ? LIMIT 1",
    [cleanUserId, cleanUserId, cleanUserId, cleanUserId]
  );
  const targetUserId = users[0]?.user_uid || cleanUserId;
  await mysqlPool.execute(
    `
      UPDATE template_shares
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE template_uid = ? AND to_user_uid = ?
    `,
    [current.template_uid, targetUserId]
  );
  return buildTemplateDetail(await resolveTemplate(current.template_uid));
}

export async function copyTemplate(templateId, payload = {}, auth = {}) {
  assertMySQLReady();
  const current = await resolveTemplate(templateId);
  const sharesByTemplate = await fetchShares([current.template_uid]);
  const userUid = actorId(auth);
  const sharedTemplateIds = new Set((sharesByTemplate.get(current.template_uid) || []).some((share) => share.to_user_uid === userUid) ? [current.template_uid] : []);
  if (!canReadTemplateRow(current, auth, sharedTemplateIds)) throw forbidden("No permission to read template");

  const sourcePayload = parseJson(current.payload_json, {});
  const templateUid = trimText(payload.templateId || payload.id || "", 64) || makeUid("template");
  const title = trimText(payload.title || `${current.title} 副本`);
  const nextPayload = {
    ...sourcePayload,
    copiedFromTemplateId: current.template_uid,
    ownerName: actorName(auth) || sourcePayload.ownerName || ""
  };

  await mysqlPool.execute(
    `
      INSERT INTO templates (
        template_uid, legacy_template_id, title, group_key, parent_template_uid,
        owner_user_uid, visibility, is_locked, sort_order, task_count,
        content_json, payload_json, created_by, updated_by
      )
      VALUES (?, '', ?, ?, ?, ?, 'private', 0, ?, ?, ?, ?, ?, ?)
    `,
    [
      templateUid,
      title,
      current.group_key,
      trimText(payload.parentTemplateId || current.parent_template_uid || "", 64),
      userUid,
      Number(payload.sortOrder || Date.now()) || 0,
      Number(current.task_count || 0),
      stringifyJson(contentForKind(current), {}),
      stringifyJson(nextPayload, {}),
      userUid,
      userUid
    ]
  );

  return buildTemplateDetail(await resolveTemplate(templateUid));
}

export async function applyTemplate(templateId, payload = {}, auth = {}) {
  assertMySQLReady();
  const current = await resolveTemplate(templateId);
  const sharesByTemplate = await fetchShares([current.template_uid]);
  const userUid = actorId(auth);
  const sharedTemplateIds = new Set((sharesByTemplate.get(current.template_uid) || []).some((share) => share.to_user_uid === userUid) ? [current.template_uid] : []);
  if (!canReadTemplateRow(current, auth, sharedTemplateIds)) throw forbidden("No permission to read template");
  const template = mapTemplateRow(current, sharesByTemplate.get(current.template_uid) || []);
  let createdProject = null;
  if (template.kind === "task" && payload.createProject !== false) {
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      createdProject = await createProjectFromTaskTemplate(connection, template, payload, auth);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  return {
    ok: true,
    template,
    applied: {
      templateId: template.id,
      title: template.title,
      kind: template.kind,
      projectId: createdProject?.id || payload.projectId || null,
      templateTasks: template.kind === "task" ? template.template?.tasks || template.template?.items || template.template || [] : [],
      templateSchedules: template.kind === "schedule" ? template.template || {} : {},
      payload: template.payload,
      project: createdProject
    }
  };
}

export const __private__ = {
  buildMySQLUnavailableError,
  buildTemplatesResponse,
  canManageTemplateRow,
  canReadTemplateRow,
  mapShareRow,
  mapTemplateRow,
  normalizeShareEntries,
  normalizeTemplatePayload
};
