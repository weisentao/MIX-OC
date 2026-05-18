import { isMySQLReady, mysqlPool } from "../../db/mysql.js";
import { createHash } from "node:crypto";

const MYSQL_UNAVAILABLE_MESSAGE = "MySQL unavailable for notifications API";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

function actorId(auth = {}) {
  return String(auth.sub || auth.id || auth.userId || auth.userUid || auth.user_uid || "").trim();
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function normalizeLimit(value) {
  const limit = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function normalizeUnreadOnly(value) {
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
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

function toDateTimeText(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const pad = (part) => String(part).padStart(2, "0");
    return `${value.getFullYear()}/${pad(value.getMonth() + 1)}/${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
  return String(value).replaceAll("-", "/").slice(0, 16);
}

function makeUid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeNotificationUid(...parts) {
  const prefix = cleanText(parts[0]) || "notification";
  const digest = createHash("sha1")
    .update(parts.map(cleanText).join(":"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix.slice(0, 32)}-${digest}`.slice(0, 64);
}

async function ensureNotificationTable() {
  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      notification_uid VARCHAR(64) NOT NULL,
      recipient_user_uid VARCHAR(64) NOT NULL,
      type VARCHAR(64) NOT NULL DEFAULT 'general',
      title VARCHAR(255) NOT NULL DEFAULT '',
      content_text TEXT NULL,
      resource_type VARCHAR(64) NOT NULL DEFAULT '',
      resource_uid VARCHAR(64) NOT NULL DEFAULT '',
      project_uid VARCHAR(64) NOT NULL DEFAULT '',
      task_uid VARCHAR(64) NOT NULL DEFAULT '',
      actor_user_uid VARCHAR(64) NOT NULL DEFAULT '',
      actor_name VARCHAR(128) NOT NULL DEFAULT '',
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      read_at DATETIME NULL,
      payload_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_notifications_notification_uid (notification_uid),
      KEY idx_notifications_recipient_read_created (recipient_user_uid, is_read, created_at),
      KEY idx_notifications_project_uid (project_uid),
      KEY idx_notifications_task_uid (task_uid),
      KEY idx_notifications_resource (resource_type, resource_uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function createNotification(payload = {}, auth = {}) {
  assertMySQLReady();
  await ensureNotificationTable();
  const recipientUserId = cleanText(payload.recipientUserId || payload.recipientUserUid || payload.recipient_user_uid);
  if (!recipientUserId) return null;
  const notificationUid = cleanText(payload.notificationId || payload.notificationUid || payload.notification_uid) || makeUid("notification");
  const type = cleanText(payload.type, "general") || "general";
  const title = cleanText(payload.title);
  const content = cleanText(payload.text || payload.content || payload.contentText);
  const projectId = cleanText(payload.projectId || payload.projectUid || payload.project_uid);
  const taskId = cleanText(payload.taskId || payload.taskUid || payload.task_uid);
  const resourceType = cleanText(payload.resourceType || payload.resource_type);
  const resourceId = cleanText(payload.resourceId || payload.resourceUid || payload.resource_uid);
  const actorUserId = cleanText(payload.actorUserId || payload.actorUserUid || payload.actor_user_uid || actorId(auth));
  const actorName = cleanText(payload.actorName || payload.actor_name || auth.name || auth.username);
  const payloadJson = payload.payload && typeof payload.payload === "object" ? payload.payload : {};

  await mysqlPool.execute(
    `
      INSERT INTO notifications (
        notification_uid, recipient_user_uid, type, title, content_text,
        resource_type, resource_uid, project_uid, task_uid,
        actor_user_uid, actor_name, is_read, payload_json, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        content_text = VALUES(content_text),
        resource_type = VALUES(resource_type),
        resource_uid = VALUES(resource_uid),
        project_uid = VALUES(project_uid),
        task_uid = VALUES(task_uid),
        actor_user_uid = VALUES(actor_user_uid),
        actor_name = VALUES(actor_name),
        payload_json = VALUES(payload_json)
    `,
    [
      notificationUid,
      recipientUserId,
      type,
      title,
      content,
      resourceType,
      resourceId,
      projectId,
      taskId,
      actorUserId,
      actorName,
      JSON.stringify(payloadJson),
      actorUserId
    ]
  );

  return mapExplicitNotification({
    notification_uid: notificationUid,
    recipient_user_uid: recipientUserId,
    type,
    title,
    content_text: content,
    resource_type: resourceType,
    resource_uid: resourceId,
    project_uid: projectId,
    task_uid: taskId,
    actor_user_uid: actorUserId,
    actor_name: actorName,
    is_read: 0,
    payload_json: payloadJson
  });
}

async function resolveCurrentUser(auth = {}) {
  const userUid = actorId(auth);
  const username = cleanText(auth.username);
  const name = cleanText(auth.name || auth.displayName || auth.display_name);
  const clauses = [];
  const params = [];

  if (userUid) {
    clauses.push("user_uid = ?");
    params.push(userUid);
  }
  if (username) {
    clauses.push("username = ?");
    params.push(username);
  }
  if (name) {
    clauses.push("name = ?");
    params.push(name);
  }
  if (!clauses.length) {
    return { userUid, username, name, names: [name].filter(Boolean) };
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT user_uid, username, name, department
      FROM users
      WHERE ${clauses.join(" OR ")}
      ORDER BY id ASC
      LIMIT 1
    `,
    params
  );
  const user = rows[0] || {};
  const resolvedUserUid = cleanText(user.user_uid || userUid);
  const resolvedUsername = cleanText(user.username || username);
  const resolvedName = cleanText(user.name || name);

  return {
    userUid: resolvedUserUid,
    username: resolvedUsername,
    name: resolvedName,
    names: Array.from(new Set([resolvedName, resolvedUsername, name, username].map(cleanText).filter(Boolean)))
  };
}

function buildMentionWhere(identity = {}) {
  const clauses = [];
  const params = [];
  if (identity.userUid) {
    clauses.push("cm.mentioned_user_uid = ?");
    params.push(identity.userUid);
  }
  if (identity.username) {
    clauses.push("cm.mentioned_username = ?");
    params.push(identity.username);
  }
  if (identity.name) {
    clauses.push("cm.mentioned_username = ?");
    params.push(identity.name);
  }
  if (!clauses.length) {
    return { sql: "1 = 0", params: [] };
  }
  return { sql: `(${clauses.join(" OR ")})`, params };
}

function notificationIdentityPrefix(source, id) {
  return `${source}:${id}`;
}

function normalizeNotificationId(notificationId = "") {
  const clean = cleanText(notificationId);
  if (clean.startsWith("notification:")) return { source: "notification", id: clean.slice("notification:".length) };
  if (clean.startsWith("mention:")) return { source: "mention", id: clean.slice("mention:".length) };
  return { source: "", id: clean };
}

function mapExplicitNotification(row = {}) {
  const payload = parseJson(row.payload_json, {});
  const notificationId = cleanText(row.notification_uid);
  return {
    id: notificationIdentityPrefix("notification", notificationId),
    notificationId,
    source: "notification",
    type: row.type || "general",
    title: row.title || "通知",
    text: row.content_text || "",
    content: row.content_text || "",
    projectId: row.project_uid || "",
    projectName: row.project_name || payload.projectName || "",
    taskId: row.task_uid || "",
    taskTitle: row.task_title || payload.taskTitle || "",
    resourceType: row.resource_type || "",
    resourceId: row.resource_uid || "",
    actorUserId: row.actor_user_uid || "",
    actorName: row.actor_name || "",
    isRead: Number(row.is_read || 0) === 1,
    createdAt: row.created_at_text || toDateTimeText(row.created_at),
    readAt: row.read_at_text || toDateTimeText(row.read_at),
    payload
  };
}

function mapMentionNotification(row = {}) {
  const mentionId = cleanText(row.mention_uid);
  const actorName = row.user_name || "有人";
  const taskTitle = row.task_title || "任务";
  const projectName = row.project_name || "";
  return {
    id: notificationIdentityPrefix("mention", mentionId),
    notificationId: mentionId,
    source: "mention",
    type: "mention",
    title: `${actorName} @了你`,
    text: row.content_text || "",
    content: row.content_text || "",
    projectId: row.project_uid || "",
    projectName,
    taskId: row.task_uid || "",
    taskTitle,
    resourceType: "task_comment",
    resourceId: row.comment_uid || "",
    actorUserId: row.user_uid || "",
    actorName,
    isRead: Number(row.is_read || 0) === 1,
    createdAt: row.commented_at_text || row.created_at_text || toDateTimeText(row.created_at),
    readAt: "",
    payload: {
      commentId: row.comment_uid || "",
      projectName,
      taskTitle
    }
  };
}

async function fetchExplicitNotifications(identity = {}, options = {}) {
  if (!identity.userUid) return [];
  const where = ["n.recipient_user_uid = ?"];
  const params = [identity.userUid];
  if (options.unreadOnly) where.push("n.is_read = 0");

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        n.notification_uid,
        n.recipient_user_uid,
        n.type,
        n.title,
        n.content_text,
        n.resource_type,
        n.resource_uid,
        n.project_uid,
        n.task_uid,
        n.actor_user_uid,
        n.actor_name,
        n.is_read,
        n.payload_json,
        DATE_FORMAT(n.created_at, '%Y/%m/%d %H:%i') AS created_at_text,
        DATE_FORMAT(n.read_at, '%Y/%m/%d %H:%i') AS read_at_text,
        p.name AS project_name,
        t.title AS task_title
      FROM notifications n
      LEFT JOIN projects p ON p.project_uid = n.project_uid
      LEFT JOIN tasks t ON t.task_uid = n.task_uid
      WHERE ${where.join(" AND ")}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${options.limit}
    `,
    params
  );
  return rows.map(mapExplicitNotification);
}

async function fetchMentionNotifications(identity = {}, options = {}) {
  const mentionWhere = buildMentionWhere(identity);
  const where = [mentionWhere.sql];
  const params = [...mentionWhere.params];
  if (options.unreadOnly) where.push("cm.is_read = 0");

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        cm.mention_uid,
        cm.comment_uid,
        cm.task_uid,
        cm.mentioned_user_uid,
        cm.mentioned_username,
        cm.is_read,
        cm.created_at,
        DATE_FORMAT(cm.created_at, '%Y/%m/%d %H:%i') AS created_at_text,
        tc.project_uid,
        tc.user_uid,
        tc.user_name,
        tc.content_text,
        DATE_FORMAT(tc.commented_at, '%Y/%m/%d %H:%i') AS commented_at_text,
        p.name AS project_name,
        t.title AS task_title
      FROM comment_mentions cm
      LEFT JOIN task_comments tc ON tc.comment_uid = cm.comment_uid
      LEFT JOIN projects p ON p.project_uid = tc.project_uid
      LEFT JOIN tasks t ON t.task_uid = cm.task_uid
      WHERE ${where.join(" AND ")}
      ORDER BY cm.created_at DESC, cm.id DESC
      LIMIT ${options.limit}
    `,
    params
  );
  return rows.map(mapMentionNotification);
}

export async function listNotifications(query = {}, auth = {}) {
  assertMySQLReady();
  await ensureNotificationTable();
  const identity = await resolveCurrentUser(auth);
  const options = {
    limit: normalizeLimit(query.limit),
    unreadOnly: normalizeUnreadOnly(query.unreadOnly || query.unread || query.onlyUnread)
  };

  const [explicitNotifications, mentionNotifications] = await Promise.all([
    fetchExplicitNotifications(identity, options),
    fetchMentionNotifications(identity, options)
  ]);

  const notifications = [...explicitNotifications, ...mentionNotifications]
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, options.limit);

  return { notifications };
}

export async function getUnreadCount(auth = {}) {
  assertMySQLReady();
  await ensureNotificationTable();
  const identity = await resolveCurrentUser(auth);
  const mentionWhere = buildMentionWhere(identity);

  const [[explicitRow]] = identity.userUid
    ? await mysqlPool.execute(
        "SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_uid = ? AND is_read = 0",
        [identity.userUid]
      )
    : [[{ count: 0 }]];

  const [[mentionRow]] = await mysqlPool.execute(
    `SELECT COUNT(*) AS count FROM comment_mentions cm WHERE ${mentionWhere.sql} AND cm.is_read = 0`,
    mentionWhere.params
  );

  return {
    unreadCount: Number(explicitRow.count || 0) + Number(mentionRow.count || 0)
  };
}

async function markExplicitNotificationRead(notificationUid, identity = {}) {
  if (!identity.userUid) return 0;
  const [result] = await mysqlPool.execute(
    `
      UPDATE notifications
      SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE notification_uid = ?
        AND recipient_user_uid = ?
        AND is_read = 0
    `,
    [notificationUid, identity.userUid]
  );
  return Number(result.affectedRows || 0);
}

async function markMentionNotificationRead(mentionUid, identity = {}) {
  const mentionWhere = buildMentionWhere(identity);
  const [result] = await mysqlPool.execute(
    `
      UPDATE comment_mentions cm
      SET cm.is_read = 1
      WHERE cm.mention_uid = ?
        AND ${mentionWhere.sql}
        AND cm.is_read = 0
    `,
    [mentionUid, ...mentionWhere.params]
  );
  return Number(result.affectedRows || 0);
}

export async function markNotificationRead(notificationId, auth = {}) {
  assertMySQLReady();
  await ensureNotificationTable();
  const normalized = normalizeNotificationId(notificationId);
  if (!normalized.id) throw badRequest("notificationId is required");

  const identity = await resolveCurrentUser(auth);
  let affectedRows = 0;
  if (!normalized.source || normalized.source === "notification") {
    affectedRows += await markExplicitNotificationRead(normalized.id, identity);
  }
  if (!affectedRows && (!normalized.source || normalized.source === "mention")) {
    affectedRows += await markMentionNotificationRead(normalized.id, identity);
  }
  if (!affectedRows) throw notFound("Notification not found");

  return { ok: true, notificationId: notificationIdentityPrefix(normalized.source || "notification", normalized.id) };
}

export async function markAllNotificationsRead(auth = {}) {
  assertMySQLReady();
  await ensureNotificationTable();
  const identity = await resolveCurrentUser(auth);
  const mentionWhere = buildMentionWhere(identity);
  let affectedRows = 0;

  if (identity.userUid) {
    const [explicitResult] = await mysqlPool.execute(
      `
        UPDATE notifications
        SET is_read = 1, read_at = COALESCE(read_at, NOW())
        WHERE recipient_user_uid = ? AND is_read = 0
      `,
      [identity.userUid]
    );
    affectedRows += Number(explicitResult.affectedRows || 0);
  }

  const [mentionResult] = await mysqlPool.execute(
    `UPDATE comment_mentions cm SET cm.is_read = 1 WHERE ${mentionWhere.sql} AND cm.is_read = 0`,
    mentionWhere.params
  );
  affectedRows += Number(mentionResult.affectedRows || 0);

  return { ok: true, readCount: affectedRows };
}

export const __private__ = {
  mapExplicitNotification,
  mapMentionNotification,
  normalizeNotificationId
};
