import { isMySQLReady, mysqlPool } from "../db/mysql.js";

const MYSQL_UNAVAILABLE_MESSAGE = "画板服务暂时不可用";
const DEFAULT_BOARD_HISTORY_LIMIT = 50;
const MAX_BOARD_HISTORY_LIMIT = 200;

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

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function boardVersionDetails(board = {}, expectedVersion = null) {
  const latestVersion = Number(board.latest_version || board.latestVersion || board.lastVersion || 0) || 1;
  return {
    boardId: board.board_uid || board.id || board.boardId || "",
    expectedVersion: expectedVersion === null ? null : Number(expectedVersion),
    currentVersion: latestVersion,
    latestVersion: latestVersion,
    updatedAt: board.updated_at_text || board.updatedAt || ""
  };
}

function boardVersionConflictError(board = {}, expectedVersion = null) {
  const error = conflict("画板版本冲突");
  error.code = "BOARD_VERSION_CONFLICT";
  error.details = boardVersionDetails(board, expectedVersion);
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

function normalizePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

function normalizeIncludePayload(value) {
  if (value === undefined || value === null) return true;
  return !["0", "false", "no"].includes(String(value).trim().toLowerCase());
}

function normalizeScopeType(value) {
  return value === "module" ? "module" : "project";
}

function normalizePermission(value) {
  if (value === "edit" || value === "write") return "edit";
  if (value === "readonly" || value === "read") return "readonly";
  return "";
}

function dbPermission(value) {
  return normalizePermission(value) === "edit" ? "edit" : "read";
}

function apiPermission(value) {
  return value === "edit" ? "edit" : "readonly";
}

function markCreateResult(board, created) {
  Object.defineProperty(board, "__created", { value: created, enumerable: false });
  return board;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function extractBoardBatchSavePayload(payload = {}) {
  const source = isPlainObject(payload) ? payload : {};
  const candidates = [source.save, source.update, source.board, source.payload];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) return candidate;
  }
  const saveFields = [
    "title",
    "elements",
    "files",
    "appState",
    "baseVersion",
    "lastVersion",
    "visibility",
    "editableRoles",
    "readonlyRoles",
    "boardKind"
  ];
  const looksLikeSavePayload = saveFields.some((field) => source[field] !== undefined);
  return looksLikeSavePayload ? source : null;
}

function extractBoardBatchHistoryQuery(payload = {}) {
  const source = isPlainObject(payload) ? payload : {};
  const history = isPlainObject(source.history) ? source.history : null;
  if (history) {
    return {
      limit: history.limit,
      page: history.page,
      includePayload: history.includePayload
    };
  }
  if (source.includeHistory === true) {
    return {
      limit: source.historyLimit,
      page: source.historyPage,
      includePayload: source.historyIncludePayload
    };
  }
  return null;
}

function isDuplicateKeyError(error) {
  return error?.code === "ER_DUP_ENTRY" || error?.errno === 1062;
}

function actorId(auth = {}) {
  return String(auth.sub || auth.id || auth.userId || "").trim();
}

function actorName(auth = {}) {
  return String(auth.name || auth.username || auth.sub || "").trim();
}

function projectIdFromBoard(row) {
  const payload = parseJson(row.payload_json, {});
  return Number(payload.projectId || row.project_uid || 0) || row.project_uid || "";
}

function legacyProjectIdFromBoard(row) {
  const payload = parseJson(row.payload_json, {});
  return Number(payload.projectId || row.legacy_project_id || 0) || null;
}

function mapBoard(row, shares = [], members = []) {
  const payload = parseJson(row.payload_json, {});
  return {
    id: row.board_uid,
    boardId: row.board_uid,
    scopeKey: payload.scopeKey || (row.scope_type === "module" ? `module:${payload.projectId || row.project_uid}:${payload.moduleKey || row.scope_uid}` : `project:${payload.projectId || row.project_uid}`),
    scopeType: normalizeScopeType(row.scope_type),
    projectId: projectIdFromBoard(row),
    projectUid: row.project_uid || "",
    legacyProjectId: legacyProjectIdFromBoard(row),
    moduleKey: payload.moduleKey || (row.scope_type === "module" ? row.scope_uid : ""),
    taskId: payload.taskId || null,
    boardKind: payload.boardKind || "personal",
    ownerId: row.owner_user_uid || payload.ownerId || "",
    ownerName: payload.ownerName || "",
    isDefault: payload.isDefault === true,
    title: row.title || "",
    status: Number(row.is_archived || 0) === 1 ? "deleted" : "active",
    visibility: payload.visibility || "project-members",
    editableRoles: payload.editableRoles || ["manager", "editor"],
    readonlyRoles: payload.readonlyRoles || ["readonly"],
    sharedWith: shares.map((share) => ({
      userId: share.to_user_uid || "",
      userUid: share.to_user_uid || "",
      username: parseJson(share.payload_json, {}).username || "",
      name: parseJson(share.payload_json, {}).name || parseJson(share.payload_json, {}).userName || "",
      userName: parseJson(share.payload_json, {}).userName || parseJson(share.payload_json, {}).name || "",
      permission: apiPermission(share.permission),
      sharedBy: share.from_user_uid || "",
      sharedAt: share.shared_at_text || ""
    })),
    members: members.map((member) => ({
      userId: member.user_uid || "",
      role: member.member_role || "viewer",
      status: member.status || "active"
    })),
    elements: parseJson(row.board_state_json, []),
    appState: parseJson(row.app_state_json, { viewBackgroundColor: "#ffffff" }),
    files: parseJson(row.files_json, {}),
    latestVersion: Number(row.latest_version || 0) || 1,
    lastVersion: Number(row.latest_version || 0) || 1,
    createdBy: row.created_by || "",
    createdAt: row.created_at_text || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at_text || ""
  };
}

async function fetchUserByUid(userUid) {
  const clean = String(userUid || "").trim();
  if (!clean) return null;
  const [rows] = await mysqlPool.execute(
    `
      SELECT user_uid, username, name, role
      FROM users
      WHERE user_uid = ? OR CAST(id AS CHAR) = ? OR username = ? OR name = ?
      LIMIT 1
    `,
    [clean, clean, clean, clean]
  );
  return rows[0] || null;
}

async function resolveProject(projectId) {
  const clean = String(projectId || "").trim();
  if (!clean) throw badRequest("缺少项目ID");
  const [rows] = await mysqlPool.execute(
    `
      SELECT project_uid, legacy_project_id, name
      FROM projects
      WHERE project_uid = ? OR CAST(id AS CHAR) = ? OR CAST(legacy_project_id AS CHAR) = ?
      ORDER BY id ASC
      LIMIT 1
    `,
    [clean, clean, clean]
  );
  if (!rows.length) throw notFound("项目不存在");
  return rows[0];
}

async function resolveBoard(boardId) {
  const clean = String(boardId || "").trim();
  if (!clean) throw badRequest("缺少画板ID");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        board_uid, scope_type, scope_uid, project_uid, title, description_text,
        owner_user_uid, is_archived, latest_version, board_state_json, files_json,
        app_state_json, payload_json, created_by, updated_by,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM boards
      WHERE board_uid = ? OR CAST(id AS CHAR) = ?
      LIMIT 1
    `,
    [clean, clean]
  );
  if (!rows.length) throw notFound("画板不存在");
  return rows[0];
}

async function findBoardByUid(boardUid) {
  const clean = String(boardUid || "").trim();
  if (!clean) return null;
  try {
    return await resolveBoard(clean);
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

function assertBoardActive(board) {
  if (Number(board?.is_archived || 0) === 1) {
    throw notFound("画板不存在");
  }
}

async function fetchShares(boardUids = []) {
  if (!boardUids.length) return new Map();
  const placeholders = boardUids.map(() => "?").join(", ");
  const [rows] = await mysqlPool.execute(
    `
      SELECT
        board_uid, from_user_uid, to_user_uid, permission, status, payload_json,
        DATE_FORMAT(shared_at, '%Y-%m-%d %H:%i:%s') AS shared_at_text
      FROM board_shares
      WHERE board_uid IN (${placeholders}) AND status = 'active'
      ORDER BY id ASC
    `,
    boardUids
  );
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.board_uid)) map.set(row.board_uid, []);
    map.get(row.board_uid).push(row);
  });
  return map;
}

async function fetchMembers(boardUids = []) {
  if (!boardUids.length) return new Map();
  const placeholders = boardUids.map(() => "?").join(", ");
  const [rows] = await mysqlPool.execute(
    `
      SELECT board_uid, user_uid, member_role, status
      FROM board_members
      WHERE board_uid IN (${placeholders}) AND status = 'active'
      ORDER BY id ASC
    `,
    boardUids
  );
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.board_uid)) map.set(row.board_uid, []);
    map.get(row.board_uid).push(row);
  });
  return map;
}

async function buildBoards(rows) {
  const boardUids = rows.map((row) => row.board_uid);
  const [shareMap, memberMap] = await Promise.all([fetchShares(boardUids), fetchMembers(boardUids)]);
  return rows.map((row) => mapBoard(row, shareMap.get(row.board_uid) || [], memberMap.get(row.board_uid) || []));
}

async function buildBoard(boardUid) {
  const row = await resolveBoard(boardUid);
  return (await buildBoards([row]))[0];
}

async function getProjectRole(projectUid, auth = {}) {
  if (auth.role === "admin") return "manager";
  const userUid = actorId(auth);
  const user = await fetchUserByUid(userUid);
  const names = [user?.name, auth.name, auth.username].filter(Boolean);
  const [rows] = await mysqlPool.execute(
    `
      SELECT member_role
      FROM project_members
      WHERE project_uid = ?
        AND status = 'active'
        AND (user_uid = ? OR member_name IN (${names.length ? names.map(() => "?").join(", ") : "''"}))
      ORDER BY FIELD(member_role, 'manager', 'editor', 'readonly') ASC, id ASC
      LIMIT 1
    `,
    [projectUid, userUid, ...names]
  );
  return rows[0]?.member_role || "none";
}

async function getBoardPermission(board, auth = {}) {
  const userUid = actorId(auth);
  if (auth.role === "admin") return "owner";
  if (userUid && board.owner_user_uid === userUid) return "owner";
  const [shareRows] = await mysqlPool.execute(
    `
      SELECT permission
      FROM board_shares
      WHERE board_uid = ? AND to_user_uid = ? AND status = 'active'
      LIMIT 1
    `,
    [board.board_uid, userUid]
  );
  const sharePermission = normalizePermission(shareRows[0]?.permission);
  if (sharePermission) return sharePermission;
  const projectRole = await getProjectRole(board.project_uid, auth);
  if (projectRole === "manager" || projectRole === "editor") return "edit";
  if (projectRole === "readonly") return "readonly";
  return "none";
}

async function assertCanOpenBoard(board, auth) {
  const permission = await getBoardPermission(board, auth);
  if (permission === "none") throw forbidden("无权限打开画板");
  return permission;
}

async function assertCanEditBoard(board, auth) {
  const permission = await getBoardPermission(board, auth);
  if (!["owner", "edit"].includes(permission)) throw forbidden("无权限编辑画板");
  return permission;
}

async function assertCanManageBoard(board, auth) {
  const permission = await getBoardPermission(board, auth);
  const projectRole = await getProjectRole(board.project_uid, auth);
  if (permission !== "owner" && projectRole !== "manager") throw forbidden("无权限管理画板");
  return permission;
}

async function insertBoardMember(boardUid, userUid, role = "owner", executor = mysqlPool) {
  if (!userUid) return;
  await executor.execute(
    `
      INSERT INTO board_members (board_uid, user_uid, member_role, status)
      VALUES (?, ?, ?, 'active')
      ON DUPLICATE KEY UPDATE member_role = VALUES(member_role), status = 'active'
    `,
    [boardUid, userUid, role]
  );
}

async function insertBoardSnapshot(boardUid, version, auth, payload, actionType = "save", executor = mysqlPool) {
  const historyUid = makeUid("board-history");
  const snapshotUid = makeUid("board-snapshot");
  const elementsJson = stringifyJson(payload.elements, []);
  const filesJson = stringifyJson(payload.files, {});
  const appStateJson = stringifyJson(payload.appState, {});
  const snapshotJson = stringifyJson(
    {
      boardId: boardUid,
      version,
      elements: payload.elements || [],
      files: payload.files || {},
      appState: payload.appState || {},
      actor: actorName(auth)
    },
    {}
  );

  await executor.execute(
    `
      INSERT INTO board_history (
        history_uid, board_uid, version_no, actor_user_uid, action_type,
        change_summary, elements_json, files_json, app_state_json, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      historyUid,
      boardUid,
      version,
      actorId(auth),
      actionType,
      actionType === "create" ? "create board" : "save board",
      elementsJson,
      filesJson,
      appStateJson,
      snapshotJson
    ]
  );

  await executor.execute(
    `
      INSERT INTO board_snapshots (snapshot_uid, board_uid, version_no, actor_user_uid, snapshot_json)
      VALUES (?, ?, ?, ?, ?)
    `,
    [snapshotUid, boardUid, version, actorId(auth), snapshotJson]
  );
}

async function validateBoardShareEntries(entries = []) {
  const rawEntries = Array.isArray(entries) ? entries : entries === undefined || entries === null ? [] : [entries];
  const invalidShares = [];
  const validShares = [];

  for (const rawEntry of rawEntries) {
    const entry = typeof rawEntry === "string" ? { userId: rawEntry } : rawEntry || {};
    const permission = normalizePermission(entry.permission);
    const userLookup = String(entry.userId || entry.userUid || entry.id || entry.userName || entry.name || entry.username || "").trim();
    if (!permission || !userLookup) {
      invalidShares.push({ entry, reason: !permission ? "权限无效" : "缺少用户" });
      continue;
    }
    const user = await fetchUserByUid(userLookup);
    if (!user?.user_uid) {
      invalidShares.push({ entry, reason: "用户不存在" });
      continue;
    }
    validShares.push({ entry, permission, user });
  }

  return { invalidShares, validShares };
}

export async function listBoards(auth = {}, query = {}) {
  assertMySQLReady();
  const projectId = String(query.projectId || "").trim();
  const params = [];
  const filters = ["b.is_archived = 0"];

  if (projectId) {
    const project = await resolveProject(projectId);
    filters.push("b.project_uid = ?");
    params.push(project.project_uid);
  }

  if (auth.role !== "admin") {
    const userUid = actorId(auth);
    const user = await fetchUserByUid(userUid);
    const names = [user?.name, auth.name, auth.username].filter(Boolean);
    filters.push(`
      (
        b.owner_user_uid = ?
        OR EXISTS (
          SELECT 1 FROM board_shares bs
          WHERE bs.board_uid = b.board_uid AND bs.to_user_uid = ? AND bs.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_uid = b.project_uid
            AND pm.status = 'active'
            AND (pm.user_uid = ?${names.length ? ` OR pm.member_name IN (${names.map(() => "?").join(", ")})` : ""})
        )
      )
    `);
    params.push(userUid, userUid, userUid, ...names);
  }

  const [rows] = await mysqlPool.execute(
    `
      SELECT
        b.board_uid, b.scope_type, b.scope_uid, b.project_uid, b.title, b.description_text,
        b.owner_user_uid, b.is_archived, b.latest_version, b.board_state_json, b.files_json,
        b.app_state_json, b.payload_json, b.created_by, b.updated_by,
        DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
        DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
      FROM boards b
      WHERE ${filters.join(" AND ")}
      ORDER BY b.updated_at DESC, b.id DESC
    `,
    params
  );

  return buildBoards(rows);
}

export async function getBoard(boardId, auth = {}) {
  assertMySQLReady();
  const row = await resolveBoard(boardId);
  assertBoardActive(row);
  await assertCanOpenBoard(row, auth);
  return buildBoard(row.board_uid);
}

export async function createBoard(payload = {}, auth = {}) {
  assertMySQLReady();
  const boardUid = String(payload.id || payload.boardId || "").trim() || makeUid("board");
  const existingBoard = await findBoardByUid(boardUid);
  if (existingBoard) {
    assertBoardActive(existingBoard);
    await assertCanOpenBoard(existingBoard, auth);
    return markCreateResult(await buildBoard(existingBoard.board_uid), false);
  }

  const project = await resolveProject(payload.projectId || payload.projectUid);
  const projectRole = await getProjectRole(project.project_uid, auth);
  if (auth.role !== "admin" && !["manager", "editor"].includes(projectRole)) {
    throw forbidden("无权限创建画板");
  }

  const scopeType = normalizeScopeType(payload.scopeType);
  const moduleKey = String(payload.moduleKey || "").trim();
  const scopeUid = scopeType === "module" ? moduleKey || "project" : project.project_uid;
  const title = String(payload.title || "").trim() || "协作画板";
  const ownerUserUid = String(payload.ownerId || actorId(auth) || "").trim();
  const payloadJson = stringifyJson(
    {
      scopeKey: payload.scopeKey || (scopeType === "module" ? `module:${payload.projectId || project.legacy_project_id || project.project_uid}:${scopeUid}` : `project:${payload.projectId || project.legacy_project_id || project.project_uid}`),
      projectId: payload.projectId || project.legacy_project_id || project.project_uid,
      moduleKey,
      taskId: payload.taskId || null,
      boardKind: payload.boardKind || "personal",
      ownerId: ownerUserUid,
      ownerName: payload.ownerName || actorName(auth),
      isDefault: payload.isDefault === true,
      visibility: payload.visibility || "project-members",
      editableRoles: payload.editableRoles || ["manager", "editor"],
      readonlyRoles: payload.readonlyRoles || ["readonly"]
    },
    {}
  );

  try {
    await mysqlPool.execute(
      `
        INSERT INTO boards (
          board_uid, scope_type, scope_uid, project_uid, title, description_text,
          owner_user_uid, is_archived, latest_version, board_state_json, files_json,
          app_state_json, payload_json, created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?)
      `,
      [
        boardUid,
        scopeType,
        scopeUid,
        project.project_uid,
        title,
        String(payload.description || "").trim(),
        ownerUserUid,
        stringifyJson(payload.elements, []),
        stringifyJson(payload.files, {}),
        stringifyJson(payload.appState, { viewBackgroundColor: "#ffffff" }),
        payloadJson,
        actorName(auth),
        actorName(auth)
      ]
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const duplicateBoard = await findBoardByUid(boardUid);
      if (duplicateBoard) {
        assertBoardActive(duplicateBoard);
        await assertCanOpenBoard(duplicateBoard, auth);
        return markCreateResult(await buildBoard(duplicateBoard.board_uid), false);
      }
    }
    throw error;
  }

  await insertBoardMember(boardUid, ownerUserUid, "owner");
  await insertBoardSnapshot(boardUid, 1, auth, payload, "create");
  return markCreateResult(await buildBoard(boardUid), true);
}

export async function updateBoard(boardId, payload = {}, auth = {}) {
  assertMySQLReady();
  const board = await resolveBoard(boardId);
  assertBoardActive(board);
  await assertCanEditBoard(board, auth);

  const requestedBaseVersion =
    payload.baseVersion === undefined || payload.baseVersion === null ? payload.lastVersion : payload.baseVersion;
  const hasRequestedBaseVersion = requestedBaseVersion !== undefined && requestedBaseVersion !== null && requestedBaseVersion !== "";
  let baseVersion = null;
  if (hasRequestedBaseVersion) {
    baseVersion = Number(requestedBaseVersion);
    if (!Number.isFinite(baseVersion)) throw badRequest("基础版本号必须是数字");
  }

  const currentPayload = parseJson(board.payload_json, {});
  const nextTitle = payload.title === undefined ? board.title : String(payload.title || "").trim();
  if (!nextTitle) throw badRequest("标题不能为空");
  const expectedVersion = hasRequestedBaseVersion ? baseVersion : Number(board.latest_version || 0);
  const nextVersion = expectedVersion + 1;
  const previousElements = parseJson(board.board_state_json, []);
  const previousFiles = parseJson(board.files_json, {});
  const previousAppState = parseJson(board.app_state_json, {});
  const nextElements = payload.elements === undefined ? previousElements : payload.elements;
  const nextFiles = payload.files === undefined ? previousFiles : payload.files;
  const nextAppState = payload.appState === undefined ? previousAppState : payload.appState;
  const nextPayload = {
    ...currentPayload,
    boardKind: payload.boardKind === undefined ? currentPayload.boardKind : payload.boardKind,
    visibility: payload.visibility === undefined ? currentPayload.visibility : payload.visibility,
    editableRoles: payload.editableRoles || currentPayload.editableRoles || ["manager", "editor"],
    readonlyRoles: payload.readonlyRoles || currentPayload.readonlyRoles || ["readonly"]
  };

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [updateResult] = await connection.execute(
      `
        UPDATE boards
        SET
          title = ?,
          latest_version = latest_version + 1,
          board_state_json = ?,
          files_json = ?,
          app_state_json = ?,
          payload_json = ?,
          updated_by = ?
        WHERE board_uid = ? AND latest_version = ? AND is_archived = 0
      `,
      [
        nextTitle,
        stringifyJson(nextElements, []),
        stringifyJson(nextFiles, {}),
        stringifyJson(nextAppState, {}),
        stringifyJson(nextPayload, {}),
        actorName(auth),
        board.board_uid,
        expectedVersion
      ]
    );
    if (updateResult.affectedRows === 0) {
      const latestBoard = await resolveBoard(board.board_uid);
      throw boardVersionConflictError(latestBoard, expectedVersion);
    }

    await insertBoardSnapshot(
      board.board_uid,
      nextVersion,
      auth,
      {
        elements: nextElements,
        files: nextFiles,
        appState: nextAppState
      },
      "save",
      connection
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return buildBoard(board.board_uid);
}

export async function syncBoardBatch(boardId, payload = {}, auth = {}) {
  assertMySQLReady();
  const board = await resolveBoard(boardId);
  assertBoardActive(board);
  await assertCanOpenBoard(board, auth);

  const savePayload = extractBoardBatchSavePayload(payload);
  const includeHistory = Boolean(payload?.includeHistory || payload?.history === true || isPlainObject(payload?.history));
  const historyQuery = extractBoardBatchHistoryQuery(payload);
  const includeBoard =
    payload?.includeBoard === true ||
    payload?.returnBoard === true ||
    payload?.board === true ||
    payload?.withBoard === true ||
    savePayload !== null ||
    includeHistory;
  const includeShares =
    payload?.includeShares === true ||
    payload?.returnShares === true ||
    payload?.shares === true ||
    payload?.withShares === true ||
    includeBoard;
  const includePermissions =
    payload?.includePermissions === true ||
    payload?.returnPermissions === true ||
    payload?.permissions === true ||
    payload?.withPermissions === true ||
    includeBoard;

  let savedBoard = null;
  if (savePayload) {
    savedBoard = await updateBoard(board.board_uid, savePayload, auth);
  }

  let history = null;
  if (includeHistory) {
    history = await getBoardHistory(board.board_uid, auth, historyQuery || {});
  }

  let boardView = savedBoard;
  if (!boardView && (includeBoard || includeShares || includePermissions)) {
    boardView = await getBoard(board.board_uid, auth);
  }

  const response = {
    ok: true,
    boardId: board.board_uid,
    updated: Boolean(savePayload),
    historyIncluded: includeHistory,
    serverTime: new Date().toISOString()
  };

  if (boardView && includeBoard) response.board = boardView;
  if (boardView && includeShares) response.sharedWith = boardView.sharedWith || [];
  if (boardView && includePermissions) {
    response.permissions = {
      editableRoles: boardView.editableRoles || [],
      readonlyRoles: boardView.readonlyRoles || []
    };
  }
  if (history) response.history = history;

  return response;
}

export async function deleteBoard(boardId, auth = {}) {
  assertMySQLReady();
  const board = await resolveBoard(boardId);
  assertBoardActive(board);
  await assertCanManageBoard(board, auth);
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("UPDATE board_members SET status = 'archived' WHERE board_uid = ?", [board.board_uid]);
    await connection.execute("UPDATE board_shares SET status = 'archived' WHERE board_uid = ?", [board.board_uid]);
    await connection.execute(
      `
        UPDATE boards
        SET is_archived = 1, updated_by = ?
        WHERE board_uid = ? AND is_archived = 0
      `,
      [actorName(auth), board.board_uid]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { ok: true, deletedBoardId: board.board_uid };
}

export async function shareBoard(boardId, entries = [], auth = {}) {
  assertMySQLReady();
  const board = await resolveBoard(boardId);
  assertBoardActive(board);
  await assertCanManageBoard(board, auth);
  const { invalidShares, validShares } = await validateBoardShareEntries(entries);
  if (invalidShares.length) {
    const boardWithShares = await buildBoard(board.board_uid);
    return {
      ...boardWithShares,
      sharedWith: boardWithShares.sharedWith,
      shareResult: {
        ok: false,
        invalidShares
      }
    };
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [boardUpdateResult] = await connection.execute(
      "UPDATE boards SET updated_by = ? WHERE board_uid = ? AND is_archived = 0",
      [actorName(auth), board.board_uid]
    );
    if (boardUpdateResult.affectedRows === 0) {
      throw notFound("画板不存在");
    }

    await connection.execute("UPDATE board_shares SET status = 'revoked' WHERE board_uid = ?", [board.board_uid]);

    for (const { entry, permission, user } of validShares) {
      await connection.execute(
        `
          INSERT INTO board_shares (
            share_uid, board_uid, from_user_uid, to_user_uid, permission, status, payload_json
          )
          VALUES (?, ?, ?, ?, ?, 'active', ?)
        `,
        [
          makeUid("board-share"),
          board.board_uid,
          actorId(auth),
          user.user_uid,
          dbPermission(permission),
          stringifyJson(
            {
              userName: entry.userName || entry.name || user.name || user.username || "",
              username: entry.username || user.username || "",
              name: entry.name || entry.userName || user.name || ""
            },
            {}
          )
        ]
      );
      await insertBoardMember(board.board_uid, user.user_uid, permission === "edit" ? "editor" : "viewer", connection);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const boardWithShares = await buildBoard(board.board_uid);
  return {
    ...boardWithShares,
    sharedWith: boardWithShares.sharedWith,
    shareResult: {
      ok: invalidShares.length === 0,
      invalidShares
    }
  };
}

export async function getBoardHistory(boardId, auth = {}, query = {}) {
  assertMySQLReady();
  const board = await resolveBoard(boardId);
  assertBoardActive(board);
  await assertCanOpenBoard(board, auth);
  const limit = normalizePositiveInteger(query.limit, DEFAULT_BOARD_HISTORY_LIMIT, MAX_BOARD_HISTORY_LIMIT);
  const page = normalizePositiveInteger(query.page, 1);
  const offset = (page - 1) * limit;
  const includePayload = normalizeIncludePayload(query.includePayload);
  const payloadColumns = includePayload ? ", elements_json, files_json, app_state_json, payload_json" : "";
  const [rows] = await mysqlPool.query(
    `
      SELECT
        history_uid, board_uid, version_no, actor_user_uid, action_type, change_summary,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text
        ${payloadColumns}
      FROM board_history
      WHERE board_uid = ?
      ORDER BY version_no DESC
      LIMIT ? OFFSET ?
    `,
    [board.board_uid, limit, offset]
  );
  return rows.map((row) => {
    const item = {
      id: row.history_uid,
      boardId: row.board_uid,
      version: Number(row.version_no || 0),
      actorUserId: row.actor_user_uid || "",
      actionType: row.action_type || "save",
      changeSummary: row.change_summary || "",
      createdAt: row.created_at_text || ""
    };
    if (includePayload) {
      item.elements = parseJson(row.elements_json, []);
      item.files = parseJson(row.files_json, {});
      item.appState = parseJson(row.app_state_json, {});
      item.payload = parseJson(row.payload_json, {});
    }
    return item;
  });
}

export async function exportBoard(boardId, query = {}, auth = {}) {
  const format = String(query.format || "json").trim().toLowerCase();
  if (format !== "json") throw badRequest("仅支持导出 JSON 格式的画板");
  const board = await getBoard(boardId, auth);
  return {
    format: "json",
    board,
    exportedAt: new Date().toISOString()
  };
}
