import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { STORAGE_METADATA_TABLE_SQL } from "./storage.schema.js";
import { env } from "../../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_ROOT = path.resolve(__dirname, "../../../data/storage-v1");
const MAX_LIST_LIMIT = 200;
const MB = 1024 * 1024;
const DEFAULT_MYSQL = Symbol("default-storage-mysql");
const DEFAULT_SCOPE_ACCESS = Symbol("default-storage-scope-access");
let defaultMysqlPromise = null;
let defaultScopeAccessDepsPromise = null;

const KIND_DIRS = {
  image: "images",
  video: "videos",
  chat_text: "chat-text",
  attachment: "attachments"
};

const MIME_EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "text/plain": ".txt",
  "application/json": ".json",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx"
};

const KIND_POLICIES = {
  image: {
    maxBytes: 8 * MB,
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"]
  },
  video: {
    maxBytes: 220 * MB,
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"]
  },
  chat_text: {
    maxBytes: 2 * MB,
    mimeTypes: ["text/plain", "application/json"]
  },
  attachment: {
    maxBytes: 80 * MB,
    mimeTypes: [
      "application/pdf",
      "text/plain",
      "application/json",
      "application/zip",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ]
  }
};

function buildHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeMimeType(mimeType = "") {
  return String(mimeType || "application/octet-stream").split(";")[0].trim().toLowerCase();
}

function normalizeKind(value = "") {
  const clean = String(value || "attachment").trim().toLowerCase().replace(/-/g, "_");
  if (clean === "images") return "image";
  if (clean === "videos") return "video";
  if (clean === "chat" || clean === "chat_texts" || clean === "chat_text") return "chat_text";
  if (clean === "file" || clean === "files" || clean === "generic") return "attachment";
  if (!KIND_DIRS[clean]) throw buildHttpError(400, "Unsupported storage kind");
  return clean;
}

function inferKindFromMimeType(mimeType = "") {
  const clean = normalizeMimeType(mimeType);
  if (clean.startsWith("image/")) return "image";
  if (clean.startsWith("video/")) return "video";
  if (clean === "text/plain" || clean === "application/json") return "chat_text";
  return "attachment";
}

function trimText(value = "", maxLength = 128) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeOriginalName(originalName = "file") {
  const baseName = path.basename(String(originalName || "file").replaceAll("\\", "/"));
  const clean = baseName
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return clean || "file";
}

function extensionForMimeType(mimeType = "") {
  const clean = normalizeMimeType(mimeType);
  return MIME_EXTENSIONS[clean] || ".bin";
}

function makeStorageId() {
  return `sf_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

function toDateParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return { year, month, day };
}

function toIsoString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function assertInsideRoot(root, targetPath) {
  const rootPath = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== rootPath && !resolvedTarget.startsWith(`${rootPath}${path.sep}`)) {
    throw buildHttpError(400, "Invalid storage path");
  }
  return resolvedTarget;
}

function buildStoredFilePlan({ root = DEFAULT_STORAGE_ROOT, kind, originalName, mimeType, now = new Date(), storageId }) {
  const normalizedKind = normalizeKind(kind);
  const safeOriginalName = sanitizeOriginalName(originalName);
  const extension = extensionForMimeType(mimeType);
  const { year, month, day } = toDateParts(now);
  const fileName = `${storageId || makeStorageId()}${extension}`;
  const relativePath = ["files", KIND_DIRS[normalizedKind], year, month, day, fileName].join("/");
  const absolutePath = assertInsideRoot(root, path.join(root, ...relativePath.split("/")));

  return {
    kind: normalizedKind,
    safeOriginalName,
    extension,
    relativePath,
    absolutePath,
    directoryPath: path.dirname(absolutePath)
  };
}

function startsWithHex(buffer, hex) {
  return buffer.subarray(0, hex.length / 2).toString("hex").toLowerCase() === hex.toLowerCase();
}

function isTextBuffer(buffer) {
  return !buffer.includes(0);
}

function hasValidSignature(mimeType, buffer) {
  const clean = normalizeMimeType(mimeType);
  if (!buffer?.length) return false;
  if (clean === "image/png") return startsWithHex(buffer, "89504e470d0a1a0a");
  if (clean === "image/jpeg") return startsWithHex(buffer, "ffd8ff");
  if (clean === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (clean === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (clean === "video/mp4" || clean === "video/quicktime") return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  if (clean === "video/webm") return startsWithHex(buffer, "1a45dfa3");
  if (clean === "application/pdf") return buffer.subarray(0, 4).toString("ascii") === "%PDF";
  if (clean === "application/zip") return startsWithHex(buffer, "504b0304") || startsWithHex(buffer, "504b0506") || startsWithHex(buffer, "504b0708");
  if (clean.includes("officedocument")) return startsWithHex(buffer, "504b0304");
  if (clean === "application/msword" || clean === "application/vnd.ms-excel" || clean === "application/vnd.ms-powerpoint") {
    return startsWithHex(buffer, "d0cf11e0a1b11ae1");
  }
  if (clean === "text/plain") return isTextBuffer(buffer);
  if (clean === "application/json") {
    if (!isTextBuffer(buffer)) return false;
    try {
      JSON.parse(buffer.toString("utf8"));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function validateUploadInput({ kind, originalName, mimeType, size, buffer }) {
  const normalizedKind = normalizeKind(kind || inferKindFromMimeType(mimeType));
  const normalizedMimeType = normalizeMimeType(mimeType);
  const policy = KIND_POLICIES[normalizedKind];
  const byteSize = Number(size ?? buffer?.length ?? 0);

  if (!policy.mimeTypes.includes(normalizedMimeType)) {
    throw buildHttpError(415, `${normalizedMimeType} is not allowed for ${normalizedKind}`);
  }
  if (!byteSize) throw buildHttpError(400, "Uploaded file is empty");
  if (byteSize > policy.maxBytes) throw buildHttpError(413, `${sanitizeOriginalName(originalName)} is too large`);
  if (buffer && !hasValidSignature(normalizedMimeType, buffer)) {
    throw buildHttpError(415, `${sanitizeOriginalName(originalName)} does not match declared MIME type`);
  }

  return {
    kind: normalizedKind,
    mimeType: normalizedMimeType,
    size: byteSize,
    extension: extensionForMimeType(normalizedMimeType),
    maxBytes: policy.maxBytes
  };
}

function getActor(auth = {}) {
  return {
    uploadedBy: trimText(auth.sub || auth.id || auth.userId || auth.username || "", 64),
    uploadedByName: trimText(auth.name || auth.username || auth.sub || "", 128)
  };
}

function buildDownloadUrl(storageId) {
  return `/storage/files/${encodeURIComponent(storageId)}/download`;
}

function buildApiDownloadUrl(storageId) {
  return `/api/storage/files/${encodeURIComponent(storageId)}/download`;
}

function buildApiPreviewUrl(storageId) {
  return `/api/storage/files/${encodeURIComponent(storageId)}/preview`;
}

function buildPreviewUrl(storageId) {
  return `/storage/files/${encodeURIComponent(storageId)}/preview`;
}

function buildStorageUrls(storageId) {
  const apiPreviewUrl = buildApiPreviewUrl(storageId);
  const previewUrl = buildPreviewUrl(storageId);
  return {
    url: apiPreviewUrl,
    apiPreviewUrl,
    apiDownloadUrl: buildApiDownloadUrl(storageId),
    downloadUrl: buildDownloadUrl(storageId),
    previewUrl
  };
}

function mapStorageRow(row = {}) {
  const metadata = normalizeMetadata(row.metadata_json);
  const storageId = row.storage_uid || row.storageId || "";
  return {
    storageId,
    id: storageId,
    kind: row.kind || "attachment",
    scopeType: row.scope_type || row.scopeType || "",
    scopeId: row.scope_uid || row.scopeId || "",
    conversationId: row.conversation_uid || row.conversationId || "",
    messageId: row.message_uid || row.messageId || "",
    originalName: row.original_name || row.originalName || "",
    safeOriginalName: row.safe_original_name || row.safeOriginalName || "",
    mimeType: row.mime_type || row.mimeType || "",
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? 0),
    checksumSha256: row.checksum_sha256 || row.checksumSha256 || "",
    relativePath: row.relative_path || row.relativePath || "",
    metadata,
    status: row.status || "active",
    uploadedBy: row.uploaded_by || row.uploadedBy || "",
    uploadedByName: row.uploaded_by_name || row.uploadedByName || "",
    createdAt: row.created_at ? toIsoString(row.created_at) : row.createdAt || "",
    updatedAt: row.updated_at ? toIsoString(row.updated_at) : row.updatedAt || "",
    storage: row.storage || "mysql",
    ...buildStorageUrls(storageId)
  };
}

function buildRecord({ file, fields, root, now = new Date(), storageId = makeStorageId() }) {
  const requestedKind = fields.kind || inferKindFromMimeType(file.mimeType);
  const validated = validateUploadInput({
    kind: requestedKind,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    buffer: file.buffer
  });
  const plan = buildStoredFilePlan({
    root,
    kind: validated.kind,
    originalName: file.originalName,
    mimeType: validated.mimeType,
    now,
    storageId
  });
  const checksumSha256 = createHash("sha256").update(file.buffer).digest("hex");
  const actor = getActor(fields.auth || {});
  const createdAt = toIsoString(now);

  return {
    storageId,
    id: storageId,
    kind: validated.kind,
    scopeType: trimText(fields.scopeType || fields.scope_type || fields.resourceType || fields.resource_type || "", 32),
    scopeId: trimText(fields.scopeId || fields.scope_uid || fields.resourceId || fields.resource_uid || "", 128),
    conversationId: trimText(fields.conversationId || fields.conversation_uid || fields.chatId || fields.chat_id || "", 128),
    messageId: trimText(fields.messageId || fields.message_uid || "", 128),
    originalName: String(file.originalName || "file").slice(0, 255),
    safeOriginalName: plan.safeOriginalName,
    mimeType: validated.mimeType,
    sizeBytes: validated.size,
    checksumSha256,
    relativePath: plan.relativePath,
    absolutePath: plan.absolutePath,
    directoryPath: plan.directoryPath,
    metadata: normalizeMetadata(fields.metadata || fields.payload),
    status: "active",
    uploadedBy: actor.uploadedBy,
    uploadedByName: actor.uploadedByName,
    createdAt,
    updatedAt: createdAt,
    storage: "file",
    ...buildStorageUrls(storageId)
  };
}

function removeLocalOnlyFields(record) {
  const { absolutePath, directoryPath, ...publicRecord } = record;
  return publicRecord;
}

function metadataItemsDir(root) {
  return path.join(root, "metadata", "items");
}

function sidecarPath(root, storageId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(storageId || ""))) {
    throw buildHttpError(400, "Invalid storage id");
  }
  return assertInsideRoot(root, path.join(metadataItemsDir(root), `${storageId}.json`));
}

async function writeSidecarRecord(root, record) {
  const target = sidecarPath(root, record.storageId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(removeLocalOnlyFields(record), null, 2)}\n`, "utf8");
}

async function readSidecarRecord(root, storageId) {
  try {
    const text = await readFile(sidecarPath(root, storageId), "utf8");
    return mapStorageRow({ ...JSON.parse(text), storage: "file" });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listSidecarRecords(root) {
  try {
    const dir = metadataItemsDir(root);
    const entries = await readdir(dir, { withFileTypes: true });
    const records = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const text = await readFile(path.join(dir, entry.name), "utf8");
        records.push(mapStorageRow({ ...JSON.parse(text), storage: "file" }));
      } catch {
        continue;
      }
    }
    return records;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function mysqlTableMissing(error) {
  return error?.code === "ER_NO_SUCH_TABLE" || /storage_files/i.test(error?.message || "") && /doesn't exist|not exist/i.test(error?.message || "");
}

function getDefaultMysql() {
  if (!defaultMysqlPromise) {
    defaultMysqlPromise = import("../../db/mysql.js").then(({ isMySQLReady, mysqlPool }) => ({
      pool: mysqlPool,
      isReady: isMySQLReady
    }));
  }
  return defaultMysqlPromise;
}

function canUseMySQL(mysql) {
  if (!mysql?.pool) return false;
  if (typeof mysql.isReady === "function") return mysql.isReady();
  return true;
}

function buildWhereClause(query = {}) {
  const where = ["status = 'active'"];
  const params = [];
  const kind = query.kind ? normalizeKind(query.kind) : "";
  const scopeType = trimText(query.scopeType || query.scope_type || "", 32);
  const scopeId = trimText(query.scopeId || query.scope_uid || "", 128);
  const conversationId = trimText(query.conversationId || query.conversation_uid || "", 128);
  const uploadedBy = trimText(query.uploadedBy || query.uploaded_by || "", 64);

  if (kind) {
    where.push("kind = ?");
    params.push(kind);
  }
  if (scopeType) {
    where.push("scope_type = ?");
    params.push(scopeType);
  }
  if (scopeId) {
    where.push("scope_uid = ?");
    params.push(scopeId);
  }
  if (conversationId) {
    where.push("conversation_uid = ?");
    params.push(conversationId);
  }
  if (uploadedBy) {
    where.push("uploaded_by = ?");
    params.push(uploadedBy);
  }

  return { where, params };
}

function filterRecord(record, query = {}) {
  if (record.status !== "active") return false;
  if (query.kind && record.kind !== normalizeKind(query.kind)) return false;
  if ((query.scopeType || query.scope_type) && record.scopeType !== trimText(query.scopeType || query.scope_type, 32)) return false;
  if ((query.scopeId || query.scope_uid) && record.scopeId !== trimText(query.scopeId || query.scope_uid, 128)) return false;
  if ((query.conversationId || query.conversation_uid) && record.conversationId !== trimText(query.conversationId || query.conversation_uid, 128)) return false;
  if ((query.uploadedBy || query.uploaded_by) && record.uploadedBy !== trimText(query.uploadedBy || query.uploaded_by, 64)) return false;
  return true;
}

function clampLimit(value) {
  const limit = Number(value || 50);
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
}

function clampOffset(value) {
  const offset = Number(value || 0);
  if (!Number.isFinite(offset)) return 0;
  return Math.max(Math.trunc(offset), 0);
}

function assertDeleteAllowed(record, auth = {}) {
  const actor = trimText(auth.sub || auth.id || auth.userId || auth.username || "", 64);
  const role = trimText(auth.role || "", 32).toLowerCase();
  const permissions = Array.isArray(auth.permissions) ? auth.permissions : String(auth.permissions || "").split(",");
  const canDeleteStorage = permissions.map((item) => trimText(item, 64).toLowerCase()).includes("storage.delete");
  if (record.uploadedBy && actor && record.uploadedBy === actor) return;
  if (role === "admin" || canDeleteStorage) return;
  throw buildHttpError(403, "No permission to delete storage file");
}

function shouldEnforceStorageAccess(options = {}) {
  return Object.prototype.hasOwnProperty.call(options, "auth");
}

function canBypassStorageOwner(auth = {}) {
  const role = trimText(auth.role || "", 32).toLowerCase();
  const permissions = Array.isArray(auth.permissions) ? auth.permissions : String(auth.permissions || "").split(",");
  return role === "admin" || permissions.map((item) => trimText(item, 64).toLowerCase()).includes("storage.delete");
}

function storageActorId(auth = {}) {
  return trimText(auth.sub || auth.id || auth.userId || auth.user_uid || auth.username || "", 64);
}

function isStorageOwner(record = {}, auth = {}) {
  const actor = storageActorId(auth);
  return Boolean(actor && record.uploadedBy && record.uploadedBy === actor);
}

function normalizeScopeTypeForAccess(value = "") {
  const clean = trimText(value, 64).toLowerCase().replace(/_/g, "-");
  if (clean === "board-file") return "board";
  if (clean === "schedule-comment" || clean === "schedule-item") return "schedule";
  if (clean === "task-comment") return "task";
  if (clean.startsWith("project-")) return "project";
  if (clean.startsWith("board-")) return "board";
  if (clean.startsWith("schedule-")) return "schedule";
  if (clean.startsWith("task-")) return "task";
  if (clean === "chat" || clean.startsWith("chat-") || clean.endsWith("-chat")) return "chat";
  return clean;
}

function uniqueTexts(values = [], maxLength = 128) {
  return Array.from(
    new Set(
      values
        .map((value) => trimText(value, maxLength))
        .filter(Boolean)
    )
  );
}

function metadataValue(record = {}, ...keys) {
  const metadata = normalizeMetadata(record.metadata);
  for (const key of keys) {
    const value = trimText(metadata?.[key], 128);
    if (value) return value;
  }
  return "";
}

function projectScopeCandidates(record = {}) {
  return uniqueTexts([
    record.scopeId,
    record.conversationId,
    metadataValue(record, "projectId", "projectUid", "scopeId", "scopeUid")
  ]);
}

function boardScopeCandidates(record = {}) {
  return uniqueTexts([
    record.scopeId,
    metadataValue(record, "boardId", "boardUid")
  ]);
}

function scheduleItemCandidates(record = {}) {
  return uniqueTexts([
    record.scopeId,
    metadataValue(record, "itemId", "itemUid", "scheduleItemId", "scheduleItemUid")
  ]);
}

function scheduleProjectCandidates(record = {}) {
  return uniqueTexts([
    record.conversationId,
    metadataValue(record, "projectId", "projectUid", "planId", "planUid")
  ]);
}

function taskScopeCandidates(record = {}) {
  return uniqueTexts([
    record.scopeId,
    metadataValue(record, "taskId", "taskUid")
  ]);
}

function getDefaultScopeAccessDeps() {
  if (!defaultScopeAccessDepsPromise) {
    defaultScopeAccessDepsPromise = Promise.all([
      import("../../services/workspace.service.js"),
      import("../../services/board.service.js"),
      import("../../services/schedule.service.js")
    ]).then(([workspace, board, schedule]) => ({
      workspace,
      board,
      schedule
    }));
  }
  return defaultScopeAccessDepsPromise;
}

async function allowIfAccessible(check) {
  try {
    await check();
    return true;
  } catch (error) {
    if (error?.statusCode === 403 || error?.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function hasProjectScopeReadAccess(record = {}, auth = {}, deps) {
  const candidates = projectScopeCandidates(record);
  for (const candidate of candidates) {
    if (await allowIfAccessible(() => deps.workspace.listProjectMembers(candidate, auth))) {
      return true;
    }
  }
  return false;
}

async function hasBoardScopeReadAccess(record = {}, auth = {}, deps) {
  const candidates = boardScopeCandidates(record);
  for (const candidate of candidates) {
    if (await allowIfAccessible(() => deps.board.getBoard(candidate, auth))) {
      return true;
    }
  }
  return false;
}

async function hasScheduleScopeReadAccess(record = {}, auth = {}, deps) {
  const itemCandidates = scheduleItemCandidates(record);
  for (const candidate of itemCandidates) {
    if (await allowIfAccessible(() => deps.schedule.listScheduleItemComments(candidate, auth))) {
      return true;
    }
  }

  const projectCandidates = scheduleProjectCandidates(record);
  for (const candidate of projectCandidates) {
    if (await allowIfAccessible(() => deps.schedule.getProjectSchedule(candidate, auth))) {
      return true;
    }
  }

  return false;
}

async function hasTaskScopeReadAccess(record = {}, auth = {}, deps) {
  const candidates = taskScopeCandidates(record);
  for (const candidate of candidates) {
    if (await allowIfAccessible(() => deps.workspace.listTaskComments(candidate, auth))) {
      return true;
    }
  }
  return false;
}

async function hasChatScopeReadAccess(record = {}, auth = {}, deps) {
  if (await hasBoardScopeReadAccess(record, auth, deps)) return true;
  if (await hasScheduleScopeReadAccess(record, auth, deps)) return true;
  if (await hasTaskScopeReadAccess(record, auth, deps)) return true;
  if (await hasProjectScopeReadAccess(record, auth, deps)) return true;
  return false;
}

async function defaultScopeReadAccess(record = {}, auth = {}) {
  const scopeType = normalizeScopeTypeForAccess(record.scopeType);
  if (!scopeType) return false;

  const deps = await getDefaultScopeAccessDeps();

  if (scopeType === "project") return hasProjectScopeReadAccess(record, auth, deps);
  if (scopeType === "board") return hasBoardScopeReadAccess(record, auth, deps);
  if (scopeType === "schedule") return hasScheduleScopeReadAccess(record, auth, deps);
  if (scopeType === "task") return hasTaskScopeReadAccess(record, auth, deps);
  if (scopeType === "chat") return hasChatScopeReadAccess(record, auth, deps);

  return false;
}

function buildChatFileName(payload = {}) {
  const messageId = trimText(payload.messageId || payload.message_uid || "", 80);
  return sanitizeOriginalName(payload.originalName || (messageId ? `chat-${messageId}.txt` : `chat-${Date.now()}.txt`));
}

function storageFilePath(root, record = {}) {
  return assertInsideRoot(root, path.join(root, ...String(record.relativePath || "").split("/").filter(Boolean)));
}

function parseRangeHeader(rangeHeader = "", sizeBytes = 0) {
  const header = String(rangeHeader || "").trim();
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  let start;
  let end;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(sizeBytes - suffixLength, 0);
    end = sizeBytes - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : sizeBytes - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= sizeBytes || end < start) return null;
  return {
    start,
    end: Math.min(end, sizeBytes - 1)
  };
}

export function createStorageService(options = {}) {
  const configuredRoot = String(env.storage?.rootDir || "").trim();
  const root = path.resolve(options.root || configuredRoot || DEFAULT_STORAGE_ROOT);
  const mysqlOption = options.mysql === undefined ? DEFAULT_MYSQL : options.mysql;
  const scopeAccessOption = options.scopeAccess === undefined ? DEFAULT_SCOPE_ACCESS : options.scopeAccess;

  async function resolveMysql() {
    if (mysqlOption === DEFAULT_MYSQL) return getDefaultMysql();
    return mysqlOption;
  }

  async function resolveScopeReadAccess(record = {}, auth = {}) {
    if (scopeAccessOption === DEFAULT_SCOPE_ACCESS) {
      return defaultScopeReadAccess(record, auth);
    }
    if (typeof scopeAccessOption === "function") {
      return Boolean(await scopeAccessOption(record, auth));
    }
    return false;
  }

  async function canReadStorageRecord(record = {}, auth = {}) {
    if (canBypassStorageOwner(auth)) return true;
    if (isStorageOwner(record, auth)) return true;
    return resolveScopeReadAccess(record, auth);
  }

  async function assertStorageReadAllowed(record = {}, auth = {}) {
    if (await canReadStorageRecord(record, auth)) return;
    throw buildHttpError(403, "No permission to access storage file");
  }

  async function saveMysqlRecord(record) {
    const mysql = await resolveMysql();
    if (!canUseMySQL(mysql)) return false;
    await mysql.pool.execute(
      `
        INSERT INTO storage_files (
          storage_uid, kind, scope_type, scope_uid, conversation_uid, message_uid,
          original_name, safe_original_name, mime_type, size_bytes, checksum_sha256,
          relative_path, metadata_json, status, uploaded_by, uploaded_by_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `,
      [
        record.storageId,
        record.kind,
        record.scopeType,
        record.scopeId,
        record.conversationId,
        record.messageId,
        record.originalName,
        record.safeOriginalName,
        record.mimeType,
        record.sizeBytes,
        record.checksumSha256,
        record.relativePath,
        JSON.stringify(record.metadata || {}),
        record.uploadedBy,
        record.uploadedByName
      ]
    );
    return true;
  }

  async function persistRecord(record) {
    let savedInMysql = false;
    try {
      savedInMysql = await saveMysqlRecord(record);
    } catch (error) {
      if (!mysqlTableMissing(error)) throw error;
      record.ensureSql = STORAGE_METADATA_TABLE_SQL;
      record.mysqlWarning = "storage_files table is missing; metadata sidecar was written";
    }

    record.storage = savedInMysql ? "mysql" : "file";
    await writeSidecarRecord(root, record);
    return removeLocalOnlyFields(record);
  }

  async function createFileFromUpload({ file, fields = {}, auth = {}, now = new Date() }) {
    if (!file?.buffer) throw buildHttpError(400, "file is required");
    const record = buildRecord({
      file,
      fields: { ...fields, auth },
      root,
      now
    });

    try {
      await mkdir(record.directoryPath, { recursive: true });
      await writeFile(record.absolutePath, file.buffer, { flag: "wx" });
      return await persistRecord(record);
    } catch (error) {
      await rm(record.absolutePath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function createChatText({ content, payload = {}, auth = {}, now = new Date() }) {
    const text = String(content ?? payload.content ?? payload.text ?? "");
    if (!text.trim()) throw buildHttpError(400, "content is required");
    const buffer = Buffer.from(text, "utf8");
    const file = {
      originalName: buildChatFileName(payload),
      mimeType: payload.mimeType || "text/plain; charset=utf-8",
      size: buffer.length,
      buffer
    };
    return createFileFromUpload({
      file,
      fields: {
        ...payload,
        kind: "chat_text",
        metadata: payload.metadata || payload.payload
      },
      auth,
      now
    });
  }

  async function listMysqlItems(query = {}) {
    const mysql = await resolveMysql();
    if (!canUseMySQL(mysql)) return [];
    const limit = Math.min(clampLimit(query.limit) + clampOffset(query.offset), MAX_LIST_LIMIT);
    const { where, params } = buildWhereClause(query);
    const [rows] = await mysql.pool.execute(
      `
        SELECT
          storage_uid, kind, scope_type, scope_uid, conversation_uid, message_uid,
          original_name, safe_original_name, mime_type, size_bytes, checksum_sha256,
          relative_path, metadata_json, status, uploaded_by, uploaded_by_name,
          created_at, updated_at
        FROM storage_files
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `,
      params
    );
    return rows.map((row) => mapStorageRow({ ...row, storage: "mysql" }));
  }

  async function getMysqlItem(storageId) {
    const mysql = await resolveMysql();
    if (!canUseMySQL(mysql)) return null;
    const [rows] = await mysql.pool.execute(
      `
        SELECT
          storage_uid, kind, scope_type, scope_uid, conversation_uid, message_uid,
          original_name, safe_original_name, mime_type, size_bytes, checksum_sha256,
          relative_path, metadata_json, status, uploaded_by, uploaded_by_name,
          created_at, updated_at
        FROM storage_files
        WHERE storage_uid = ? AND status = 'active'
        LIMIT 1
      `,
      [storageId]
    );
    return rows.length ? mapStorageRow({ ...rows[0], storage: "mysql" }) : null;
  }

  async function listItems(query = {}, options = {}) {
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);
    let mysqlItems = [];
    try {
      mysqlItems = await listMysqlItems({ ...query, limit, offset });
    } catch (error) {
      if (!mysqlTableMissing(error)) throw error;
    }

    const sidecarItems = (await listSidecarRecords(root)).filter((record) => filterRecord(record, query));
    const mergedById = new Map();
    for (const item of sidecarItems) mergedById.set(item.storageId, item);
    for (const item of mysqlItems) mergedById.set(item.storageId, item);
    const mergedItems = Array.from(mergedById.values());
    const filtered = [];
    if (shouldEnforceStorageAccess(options)) {
      for (const item of mergedItems) {
        if (await canReadStorageRecord(item, options.auth || {})) {
          filtered.push(item);
        }
      }
    } else {
      filtered.push(...mergedItems);
    }
    const merged = filtered.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

    return {
      items: merged.slice(offset, offset + limit),
      total: merged.length,
      limit,
      offset
    };
  }

  async function getItem(storageId, options = {}) {
    const cleanId = trimText(storageId, 80);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(cleanId)) throw buildHttpError(400, "Invalid storage id");

    try {
      const mysqlRecord = await getMysqlItem(cleanId);
      if (mysqlRecord) {
        if (shouldEnforceStorageAccess(options)) await assertStorageReadAllowed(mysqlRecord, options.auth || {});
        return mysqlRecord;
      }
    } catch (error) {
      if (!mysqlTableMissing(error)) throw error;
    }

    const sidecarRecord = await readSidecarRecord(root, cleanId);
    if (sidecarRecord?.status === "active") {
      if (shouldEnforceStorageAccess(options)) await assertStorageReadAllowed(sidecarRecord, options.auth || {});
      return sidecarRecord;
    }
    throw buildHttpError(404, "Storage file not found");
  }

  async function getDownload(storageId, options = {}) {
    const record = await getItem(storageId, options);
    const absolutePath = storageFilePath(root, record);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw buildHttpError(404, "Storage file not found");
    const buffer = await readFile(absolutePath);
    return {
      record,
      buffer,
      mimeType: record.kind === "chat_text" ? "text/plain; charset=utf-8" : record.mimeType,
      fileName: record.safeOriginalName || `${record.storageId}${extensionForMimeType(record.mimeType)}`,
      sizeBytes: buffer.length
    };
  }

  async function getPreview(storageId, options = {}) {
    const record = await getItem(storageId, options);
    const absolutePath = storageFilePath(root, record);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw buildHttpError(404, "Storage file not found");

    const mimeType = record.kind === "chat_text" ? "text/plain; charset=utf-8" : record.mimeType || "application/octet-stream";
    const fileName = record.safeOriginalName || `${record.storageId}${extensionForMimeType(record.mimeType)}`;
    const range = record.kind === "video" ? parseRangeHeader(options.range || "", fileStat.size) : null;

    if (record.kind === "video" && options.range && !range) {
      throw buildHttpError(416, "Requested range is not satisfiable");
    }

    return {
      record,
      stream: range ? createReadStream(absolutePath, range) : createReadStream(absolutePath),
      mimeType,
      fileName,
      sizeBytes: fileStat.size,
      range
    };
  }

  async function markMysqlDeleted(storageId) {
    const mysql = await resolveMysql();
    if (!canUseMySQL(mysql)) return;
    await mysql.pool.execute(
      "UPDATE storage_files SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE storage_uid = ?",
      [storageId]
    );
  }

  async function deleteItem(storageId, options = {}) {
    const record = await getItem(storageId);
    assertDeleteAllowed(record, options.auth || {});
    const absolutePath = assertInsideRoot(root, path.join(root, ...record.relativePath.split("/")));
    await rm(absolutePath, { force: true });

    try {
      await markMysqlDeleted(record.storageId);
    } catch (error) {
      if (!mysqlTableMissing(error)) throw error;
    }

    await writeSidecarRecord(root, {
      ...record,
      status: "deleted",
      updatedAt: new Date().toISOString()
    });

    return {
      ok: true,
      deletedStorageId: record.storageId,
      storageId: record.storageId
    };
  }

  return {
    root,
    createFileFromUpload,
    createChatText,
    listItems,
    getItem,
    getDownload,
    getPreview,
    deleteItem
  };
}

export const storageService = createStorageService();

export const __private__ = {
  DEFAULT_STORAGE_ROOT,
  KIND_POLICIES,
  assertInsideRoot,
  buildStoredFilePlan,
  sanitizeOriginalName,
  normalizeKind,
  normalizeMimeType,
  validateUploadInput,
  mapStorageRow,
  buildStorageUrls,
  parseRangeHeader
};
