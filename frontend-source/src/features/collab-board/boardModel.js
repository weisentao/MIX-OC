export const BOARD_HISTORY_DAYS = 30;

export function boardIdForProject(projectId) {
  return `board-project-${projectId}`;
}

function cloneJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function cleanTitle(name, fallback = "未命名项目") {
  return String(name || fallback).trim() || fallback;
}

function slug(value) {
  return (
    String(value || "board")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]+/g, "")
      .slice(0, 48) || "board"
  );
}

export function createBoardScope({ scopeType = "project", project, module = null }) {
  const projectId = Number(project?.id || 0);
  const moduleKey = scopeType === "module" ? String(module?.key || "project") : "";
  const moduleLabel = scopeType === "module" ? cleanTitle(module?.label || moduleKey, "未命名分支") : "";
  return {
    scopeType,
    projectId,
    moduleKey,
    scopeKey: scopeType === "module" ? `module:${projectId}:${moduleKey}` : `project:${projectId}`,
    label: scopeType === "module" ? moduleLabel : cleanTitle(project?.name),
    projectName: cleanTitle(project?.name)
  };
}

export function getBoardScopeKey(scopeOrBoard) {
  if (scopeOrBoard?.scopeKey) return scopeOrBoard.scopeKey;
  if (scopeOrBoard?.scopeType === "module") {
    return `module:${Number(scopeOrBoard.projectId || 0)}:${scopeOrBoard.moduleKey || "project"}`;
  }
  return `project:${Number(scopeOrBoard?.projectId || scopeOrBoard?.id || 0)}`;
}

export function boardIdForScope(scope, suffix = "main") {
  const scopeKey = getBoardScopeKey(scope);
  if (scopeKey.startsWith("project:") && suffix === "main") return boardIdForProject(scope.projectId);
  if (scopeKey.startsWith("module:") && suffix === "main") return `board-module-${scope.projectId}-${scope.moduleKey}`;
  return `board-${scopeKey.replace(/:/g, "-")}-${slug(suffix)}`;
}

export function listBoardsForScope(boards, scope) {
  const scopeKey = getBoardScopeKey(scope);
  return (boards || [])
    .filter((board) => board.status !== "deleted" && getBoardScopeKey(board) === scopeKey)
    .sort((a, b) => {
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
}

function isActiveBoard(board) {
  return !!board && board.status !== "deleted";
}

function userMatchesEntry(user, entry = {}) {
  if (!user) return false;
  if (user.id && entry.userId && user.id === entry.userId) return true;
  if (user.name && entry.userName && user.name === entry.userName) return true;
  if (user.name && entry.name && user.name === entry.name) return true;
  return false;
}

function isBoardOwner(board, user) {
  if (!board || !user) return false;
  if (user.role === "admin") return true;
  if (user.id && board.ownerId && user.id === board.ownerId) return true;
  if (user.name && board.ownerName && user.name === board.ownerName) return true;
  if (user.name && board.createdBy && user.name === board.createdBy) return true;
  return false;
}

export function normalizeBoardShare(entries = []) {
  const normalized = new Map();
  (entries || []).forEach((entry) => {
    const permission = entry?.permission === "edit" ? "edit" : entry?.permission === "readonly" ? "readonly" : "";
    if (!permission) return;
    const userId = String(entry.userId || entry.id || "").trim();
    const userName = String(entry.userName || entry.name || "").trim();
    if (!userId && !userName) return;
    normalized.set(userId || userName, { userId, userName, permission });
  });
  return [...normalized.values()];
}

export function getUserBoardPermission(board, user) {
  if (!isActiveBoard(board) || !user) return "none";
  if (isBoardOwner(board, user)) return "owner";
  const share = (board.sharedWith || []).find((entry) => userMatchesEntry(user, entry));
  return share?.permission === "edit" || share?.permission === "readonly" ? share.permission : "none";
}

export function getBoardsVisibleToUser(boards, user) {
  return (boards || []).filter((board) => getUserBoardPermission(board, user) !== "none");
}

export function getBoardsSharedWithUser(boards, user) {
  return (boards || []).filter((board) => {
    const permission = getUserBoardPermission(board, user);
    return permission === "edit" || permission === "readonly";
  });
}

export function getBoardsSharedByUser(boards, user) {
  return (boards || []).filter((board) => isActiveBoard(board) && isBoardOwner(board, user) && (board.sharedWith || []).length > 0);
}

export function getBoardRole(project, user) {
  if (!project || !user) return "none";
  if (user.role === "admin") return "manager";
  const name = user.name;
  if (!name) return "none";
  return project.memberRoles?.[name] || ((project.members || []).includes(name) ? "readonly" : "none");
}

export function isBoardEditable(role) {
  return role === "manager" || role === "editor";
}

export function createScopedBoard(scope, options = {}, user, now = new Date().toISOString()) {
  const isDefault = options.isDefault === true;
  const title = cleanTitle(
    options.title || (scope.scopeType === "module" ? `${scope.label} 主画板` : `${scope.projectName} 协作画板`),
    "未命名画板"
  );
  const idSuffix = isDefault ? "main" : `${slug(options.ownerName || options.ownerId || user?.name)}-${slug(title)}-${Date.parse(now) || Date.now()}`;

  return {
    id: boardIdForScope(scope, idSuffix),
    scopeKey: getBoardScopeKey(scope),
    scopeType: scope.scopeType,
    projectId: Number(scope.projectId),
    taskId: null,
    moduleKey: scope.scopeType === "module" ? scope.moduleKey : "",
    boardKind: options.boardKind || (isDefault ? "main" : "personal"),
    ownerId: options.ownerId || user?.id || "",
    ownerName: options.ownerName || user?.name || "系统",
    isDefault,
    title,
    status: "active",
    visibility: options.visibility || "project-members",
    editableRoles: options.editableRoles || ["manager", "editor"],
    readonlyRoles: options.readonlyRoles || ["readonly"],
    sharedWith: normalizeBoardShare(options.sharedWith || []),
    elements: [],
    appState: {
      viewBackgroundColor: "#ffffff"
    },
    files: {},
    lastVersion: 1,
    createdBy: user?.name || "系统",
    createdAt: now,
    updatedBy: user?.name || "系统",
    updatedAt: now
  };
}

export function createProjectBoard(project, user, now = new Date().toISOString()) {
  return createScopedBoard(createBoardScope({ scopeType: "project", project }), { isDefault: true }, user, now);
}

export function ensureDefaultBoardForScope(boards, scope, user, now = new Date().toISOString()) {
  if (!Array.isArray(boards)) return createScopedBoard(scope, { isDefault: true }, user, now);
  const id = boardIdForScope(scope, "main");
  const existing = boards.find((board) => board.id === id && board.status !== "deleted");
  if (existing) {
    existing.scopeKey = existing.scopeKey || getBoardScopeKey(scope);
    existing.isDefault = existing.isDefault !== false;
    existing.boardKind = existing.boardKind || "main";
    existing.visibility = existing.visibility || "project-members";
    existing.editableRoles = existing.editableRoles || ["manager", "editor"];
    existing.readonlyRoles = existing.readonlyRoles || ["readonly"];
    existing.sharedWith = normalizeBoardShare(existing.sharedWith || []);
    return existing;
  }
  const board = createScopedBoard(scope, { isDefault: true }, user, now);
  boards.push(board);
  return board;
}

export function ensureProjectBoard(boards, project, user, now = new Date().toISOString()) {
  return ensureDefaultBoardForScope(boards, createBoardScope({ scopeType: "project", project }), user, now);
}

export function createBoardSnapshot(board, user, now = new Date().toISOString()) {
  const version = Number(board.lastVersion || 0) || 1;
  return {
    id: `${board.id}-v${version}-${Date.parse(now) || Date.now()}`,
    boardId: board.id,
    version,
    elements: cloneJson(board.elements, []),
    appState: cloneJson(board.appState, {}),
    files: cloneJson(board.files, {}),
    createdBy: user?.name || "系统",
    createdAt: now
  };
}

export function renameBoard(board, title, user, now = new Date().toISOString()) {
  if (!isActiveBoard(board)) return board;
  board.title = cleanTitle(title, board.title || "Untitled board");
  board.updatedBy = user?.name || "系统";
  board.updatedAt = now;
  return board;
}

export function deleteBoard(board, user, now = new Date().toISOString()) {
  if (!isActiveBoard(board)) return board;
  board.status = "deleted";
  board.deletedBy = user?.name || "系统";
  board.deletedAt = now;
  board.updatedBy = user?.name || "系统";
  board.updatedAt = now;
  return board;
}

export function shareBoard(board, entries = [], user, now = new Date().toISOString()) {
  if (!isActiveBoard(board)) return board;
  board.sharedWith = normalizeBoardShare(entries).map((entry) => ({
    ...entry,
    sharedBy: user?.name || "系统",
    sharedAt: now
  }));
  board.updatedBy = user?.name || "系统";
  board.updatedAt = now;
  return board;
}

export function applyBoardData(board, payload, user, now = new Date().toISOString()) {
  const nextVersion = Number(board.lastVersion || 0) + 1;
  board.elements = cloneJson(payload.elements, []);
  board.appState = cloneJson(payload.appState, {});
  board.files = cloneJson(payload.files, {});
  board.lastVersion = nextVersion;
  board.updatedBy = user?.name || "系统";
  board.updatedAt = now;
  return board;
}

export function restoreBoardSnapshot(board, snapshot, user, now = new Date().toISOString()) {
  board.elements = cloneJson(snapshot.elements, []);
  board.appState = cloneJson(snapshot.appState, {});
  board.files = cloneJson(snapshot.files, {});
  board.lastVersion = Number(snapshot.version || board.lastVersion || 1);
  board.updatedBy = user?.name || "系统";
  board.updatedAt = now;
  return board;
}

export function pruneBoardHistory(history, now = new Date().toISOString()) {
  const cutoff = new Date(now).getTime() - BOARD_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return (history || []).filter((snapshot) => new Date(snapshot.createdAt).getTime() >= cutoff);
}
