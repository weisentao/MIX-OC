import { taskModules } from "../../../data/seed.js";
import workspaceApi from "../../../services/workspaceApi.js";
import { backendSyncToast, isLoginExpiredApiError } from "../../../services/apiErrors.js";
import { handleWorkspaceAuthFailure } from "./appActions.js";
import { idsEqual } from "../helpers.js";
import {
  applyBoardData,
  createBoardScope,
  createBoardSnapshot,
  createScopedBoard,
  deleteBoard,
  ensureDefaultBoardForScope,
  ensureProjectBoard,
  getBoardRole,
  getUserBoardPermission,
  isBoardEditable,
  listBoardsForScope,
  pruneBoardHistory,
  renameBoard,
  restoreBoardSnapshot,
  shareBoard
} from "../../../features/collab-board/boardModel.js";

function syncInBackground(store, label, requestFactory, options = {}) {
  if (typeof window === "undefined") return;
  Promise.resolve()
    .then(() => requestFactory())
    .then((result) => {
      if (typeof options.onSuccess === "function") options.onSuccess(unwrapBoardRecord(result) || result, result);
    })
    .catch((error) => {
      console.warn(`[workspaceApi] ${label} failed`, error);
      if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
      if (options.markBoardSyncFailed) store.boardSaveState = "sync-failed";
      if (typeof options.onError === "function") {
        options.onError(error);
        return;
      }
      store.showToast(backendSyncToast(error));
    });
}

function unwrapBoardRecord(result) {
  if (result?.board && typeof result.board === "object") return result.board;
  if (result?.data?.board && typeof result.data.board === "object") return result.data.board;
  if (result && typeof result === "object" && result.id) return result;
  return null;
}

function mergeBoardRecord(store, record) {
  const normalized = unwrapBoardRecord(record);
  if (!normalized?.id) return null;
  store.boards = store.boards || [];
  const index = store.boards.findIndex((board) => board.id === normalized.id);
  if (index >= 0) {
    store.boards[index] = {
      ...store.boards[index],
      ...normalized,
      sharedWith: normalized.sharedWith || store.boards[index].sharedWith || []
    };
    return store.boards[index];
  }
  store.boards.push(normalized);
  return normalized;
}

function boardVersion(board) {
  const version = Number(board?.latestVersion ?? board?.lastVersion ?? board?.version ?? 0);
  return Number.isFinite(version) && version > 0 ? version : 1;
}

function captureBoardSyncStamp(board) {
  return {
    id: board?.id || "",
    version: boardVersion(board),
    updatedAt: board?.updatedAt || ""
  };
}

function isBoardSyncStale(board, stamp) {
  if (!board || !stamp || board.id !== stamp.id) return true;
  return boardVersion(board) !== stamp.version || (board.updatedAt || "") !== stamp.updatedAt;
}

function finishStaleBoardSync(store) {
  if (store.boardSaveState === "saving") store.boardSaveState = "local";
}

function makeBoardShareError(remoteBoard) {
  const invalidShares = remoteBoard?.shareResult?.invalidShares || remoteBoard?.invalidShares || [];
  const error = new Error("画板分享接收人无效");
  error.response = {
    status: 422,
    data: {
      message: "画板分享接收人无效",
      invalidShares
    }
  };
  return error;
}

function boardConflictDetails(error) {
  const payload = error?.response?.data || error?.data || {};
  const details = payload?.details && typeof payload.details === "object" ? payload.details : payload;
  const latestVersion = Number(details.currentVersion ?? details.latestVersion ?? details.lastVersion ?? details.version ?? 0);
  return {
    boardId: details.boardId || details.id || "",
    version: latestVersion,
    lastVersion: latestVersion
  };
}

async function saveBoardWithConflictRetry(store, board, payload = {}, baseVersion = null) {
  const version = Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0 ? Number(baseVersion) : boardVersion(board);
  const firstAttemptPayload = boardApiPayload(board, payload, { baseVersion: version, store });
  try {
    return await workspaceApi.updateBoard(board.id, firstAttemptPayload);
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    if (status !== 409) throw error;
    const conflict = boardConflictDetails(error);
    const retryVersion = Number(conflict.lastVersion || conflict.version || version) || version;
    return await workspaceApi.syncBoard(board.id, {
      ...boardApiPayload(board, payload, { baseVersion: retryVersion, store }),
      baseVersion: retryVersion,
      lastVersion: retryVersion,
      includeHistory: true
    });
  }
}

function boardProjectId(board, store) {
  return board?.projectUid || board?.projectId || store.activeProject?.projectId || store.activeProject?.id || store.activeProjectId;
}

function boardApiPayload(board, payload = {}, options = {}) {
  const version = Number(options.baseVersion ?? boardVersion(board));
  const store = options.store || null;
  return {
    id: board.id,
    boardId: board.id,
    title: board.title || "协作画板",
    projectId: boardProjectId(board, store || {}),
    scopeKey: board.scopeKey,
    scopeType: board.scopeType || "project",
    moduleKey: board.moduleKey || "",
    taskId: board.taskId || null,
    boardKind: board.boardKind || "personal",
    ownerId: board.ownerId || "",
    ownerName: board.ownerName || board.createdBy || "",
    isDefault: board.isDefault === true,
    visibility: board.visibility || "project-members",
    editableRoles: board.editableRoles || ["manager", "editor"],
    readonlyRoles: board.readonlyRoles || ["readonly"],
    sharedWith: board.sharedWith || [],
    elements: payload.elements ?? board.elements ?? [],
    appState: payload.appState ?? board.appState ?? {},
    files: payload.files ?? board.files ?? {},
    baseVersion: version,
    lastVersion: version
  };
}

function normalizeHistoryEntry(item = {}) {
  if (!item?.id) return null;
  return {
    ...item,
    createdBy: item.createdBy || item.createdByName || item.actorUserId || item.payload?.actor || "",
    createdByName: item.createdByName || item.createdBy || item.payload?.actor || item.actorUserId || "",
    elements: Array.isArray(item.elements) ? item.elements : [],
    appState: item.appState && typeof item.appState === "object" ? item.appState : {},
    files: item.files && typeof item.files === "object" ? item.files : {}
  };
}

function mergeBoardHistoryEntries(store, entries = []) {
  if (!Array.isArray(entries) || !entries.length) return;
  const existing = new Map((store.boardHistory || []).map((item) => [item.id, item]));
  entries
    .map((item) => normalizeHistoryEntry(item))
    .filter(Boolean)
    .forEach((item) => existing.set(item.id, item));
  store.boardHistory = pruneBoardHistory([...existing.values()]);
}

function syncProjectBoards(store, projectId, defaultBoard) {
  syncInBackground(store, "listBoards", async () => {
    const response = await workspaceApi.listBoards(projectId);
    const remoteBoards = Array.isArray(response?.boards)
      ? response.boards
      : Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
    remoteBoards.forEach((board) => mergeBoardRecord(store, board));
    if (defaultBoard?.id && !remoteBoards.some((board) => board.id === defaultBoard.id)) {
      const created = await workspaceApi.createBoard(boardApiPayload(defaultBoard));
      mergeBoardRecord(store, created);
    }
  });
}

function syncBoardHistory(store, boardId) {
  syncInBackground(store, "listBoardHistory", async () => {
    const response = await workspaceApi.listBoardHistory(boardId);
    const remoteHistory = Array.isArray(response?.history)
      ? response.history
      : Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
    const existing = new Map((store.boardHistory || []).map((item) => [item.id, item]));
    remoteHistory.forEach((item) => {
      const normalized = normalizeHistoryEntry(item);
      if (normalized?.id) existing.set(normalized.id, normalized);
    });
    store.boardHistory = pruneBoardHistory([...existing.values()]);
  });
}

function projectForBoard(store, board) {
  return (store.allProjects || []).find((project) =>
    idsEqual(project.id, board?.projectId) ||
    idsEqual(project.projectId, board?.projectId) ||
    idsEqual(project.id, board?.projectUid) ||
    idsEqual(project.projectId, board?.projectUid)
  ) || null;
}

function roleForBoard(store, board) {
  return getBoardRole(projectForBoard(store, board), store.currentUser);
}

function canEnterBoard(project, user) {
  return getBoardRole(project, user) !== "none" || user?.role === "admin";
}

function canOpenBoardRecord(store, board) {
  return getUserBoardPermission(board, store.currentUser) !== "none" || roleForBoard(store, board) !== "none";
}

function canEditBoardRecord(store, board) {
  const permission = getUserBoardPermission(board, store.currentUser);
  return permission === "owner" || permission === "edit" || isBoardEditable(roleForBoard(store, board));
}

function canManageBoardRecord(store, board) {
  return getUserBoardPermission(board, store.currentUser) === "owner" || roleForBoard(store, board) === "manager";
}

function scopeFromBoard(store, board) {
  const project = projectForBoard(store, board) || {
    id: board.projectId,
    name: board.projectName || "\u672a\u547d\u540d\u9879\u76ee"
  };
  const module = taskModules.find((item) => item.key === board.moduleKey) || {
    key: board.moduleKey || "project",
    label: board.moduleKey || "项目画板"
  };
  return createBoardScope({
    scopeType: board.scopeType === "module" ? "module" : "project",
    project,
    module
  });
}

export const boardActions = {
  openActiveProjectBoard() {
    return this.openBoardLibrary({ scopeType: "project" });
  },
  openBoardLibrary(payload = {}) {
    const project = this.activeProject;
    if (!project) {
      this.showToast("请先选择项目，再打开协作画板");
      return false;
    }
    if (!canEnterBoard(project, this.currentUser)) {
      this.showToast("你不是该项目成员，无法进入协作画板");
      return false;
    }
    const scope = createBoardScope({
      scopeType: payload.scopeType === "module" ? "module" : "project",
      project,
      module: payload.module || null
    });
    this.boards = this.boards || [];
    this.boardHistory = pruneBoardHistory(this.boardHistory || []);
    const defaultBoard = ensureDefaultBoardForScope(this.boards, scope, this.currentUser);
    this.activeBoardScope = scope;
    this.activeBoardId = defaultBoard.id;
    this.boardOpen = true;
    this.boardLibraryOpen = true;
    this.boardCreateMode = false;
    this.boardSaveState = "saved";
    syncProjectBoards(this, project.projectId || project.id, defaultBoard);
    this.showToast(`${scope.label} 画板库已打开`);
    return true;
  },
  openScopedBoard(boardId) {
    const board = (this.boards || []).find((item) => item.id === boardId && item.status !== "deleted");
    if (!board) {
      this.showToast("没有找到该画板");
      return false;
    }
    if (!canOpenBoardRecord(this, board)) {
      this.showToast("你没有权限打开这个画板");
      return false;
    }
    this.activeProjectId = projectForBoard(this, board)?.id || board.projectId || this.activeProjectId;
    this.activeBoardScope = scopeFromBoard(this, board);
    this.activeBoardId = board.id;
    this.boardOpen = true;
    this.boardLibraryOpen = false;
    this.boardCreateMode = false;
    this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    this.boardSaveState = "saved";
    syncInBackground(this, "getBoard", async () => {
      const remoteBoard = await workspaceApi.getBoard(board.id);
      mergeBoardRecord(this, remoteBoard);
    });
    syncBoardHistory(this, board.id);
    return true;
  },
  createBoardInActiveScope(payload = {}) {
    if (!this.activeBoardScope) return false;
    if (!this.canEditBoard) {
      this.showToast("只读权限可以查看画板，不能新建画板");
      return false;
    }
    const title = String(payload.title || "").trim();
    if (!title) {
      this.showToast("请输入画板名称");
      return false;
    }
    const board = createScopedBoard(
      this.activeBoardScope,
      {
        title,
        boardKind: payload.boardKind || "personal",
        ownerId: payload.ownerId || this.currentUser?.id || "",
        ownerName: payload.ownerName || this.currentUser?.name || ""
      },
      this.currentUser
    );
    this.boards = this.boards || [];
    this.boards.push(board);
    this.activeBoardId = board.id;
    this.boardLibraryOpen = false;
    this.boardCreateMode = false;
    this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    this.boardSaveState = "local";
    syncInBackground(this, "createBoard", () => workspaceApi.createBoard(boardApiPayload(board, {}, { store: this })), {
      markBoardSyncFailed: true,
      onSuccess: (remoteBoard) => {
        mergeBoardRecord(this, remoteBoard);
        this.boardSaveState = "saved";
      }
    });
    this.showToast(`已创建画板：${title}`);
    return true;
  },
  backToBoardLibrary() {
    this.boardLibraryOpen = true;
    this.boardCreateMode = false;
    this.boardSaveState = "idle";
  },
  closeBoard() {
    this.boardOpen = false;
    this.boardLibraryOpen = false;
    this.boardCreateMode = false;
    this.activeBoardId = null;
    this.activeBoardScope = null;
    this.boardSaveState = "idle";
  },
  saveActiveBoard(payload = {}) {
    const board = this.activeBoard;
    if (!board) return false;
    if (!this.canEditBoard) {
      this.showToast("只读权限可以查看画板，不能编辑");
      return false;
    }
    this.boardSaveState = "saving";
    const baseVersion = boardVersion(board);
    const snapshot = createBoardSnapshot(board, this.currentUser);
    this.boardHistory = pruneBoardHistory([...(this.boardHistory || []), snapshot]);
    applyBoardData(board, payload, this.currentUser);
    const stamp = captureBoardSyncStamp(board);
    this.boardSaveState = "local";
    syncInBackground(this, "updateBoard", () => saveBoardWithConflictRetry(this, board, payload, baseVersion), {
      markBoardSyncFailed: true,
      onSuccess: (remoteBoard, result) => {
        if (isBoardSyncStale(board, stamp)) {
          finishStaleBoardSync(this);
          return;
        }
        mergeBoardRecord(this, remoteBoard);
        mergeBoardHistoryEntries(this, result?.history || []);
        this.boardSaveState = "saved";
      }
    });
    return true;
  },
  restoreActiveBoardSnapshot(snapshotId) {
    const board = this.activeBoard;
    if (!board) return false;
    if (!this.canManageBoard) {
      this.showToast("只有画板拥有者或项目管理员可以回滚版本");
      return false;
    }
    const snapshot = (this.boardHistory || []).find((item) => item.id === snapshotId);
    if (!snapshot) {
      this.showToast("没有找到该画板版本");
      return false;
    }
    const baseVersion = boardVersion(board);
    restoreBoardSnapshot(board, snapshot, this.currentUser);
    const stamp = captureBoardSyncStamp(board);
    this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    this.boardSaveState = "local";
    syncInBackground(this, "restoreBoard", () => saveBoardWithConflictRetry(this, board, {}, baseVersion), {
      markBoardSyncFailed: true,
      onSuccess: (remoteBoard, result) => {
        if (isBoardSyncStale(board, stamp)) {
          finishStaleBoardSync(this);
          return;
        }
        mergeBoardRecord(this, remoteBoard);
        mergeBoardHistoryEntries(this, result?.history || []);
        this.boardSaveState = "saved";
      }
    });
    this.showToast(`已回滚到版本 ${snapshot.version}`);
    return true;
  },
  clearActiveBoard() {
    const board = this.activeBoard;
    if (!board) return false;
    if (!this.canManageBoard) {
      this.showToast("只有画板拥有者或项目管理员可以清空画板");
      return false;
    }
    this.saveActiveBoard({ elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} });
    this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    this.showToast("画板已清空");
    return true;
  },
  ensureProjectBoardForCompatibility() {
    if (!this.activeProject) return null;
    return ensureProjectBoard(this.boards || [], this.activeProject, this.currentUser);
  },
  openBoardFromCenter(boardId) {
    const board = (this.boards || []).find((item) => item.id === boardId && item.status !== "deleted");
    if (!board) {
      this.showToast("没有找到这个画板");
      return false;
    }
    if (!canOpenBoardRecord(this, board)) {
      this.showToast("你没有权限打开这个画板");
      return false;
    }
    this.activeProjectId = projectForBoard(this, board)?.id || board.projectId || this.activeProjectId;
    this.activeBoardScope = scopeFromBoard(this, board);
    this.activeBoardId = board.id;
    this.boardOpen = true;
    this.boardLibraryOpen = false;
    this.boardCreateMode = false;
    this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    this.boardSaveState = "saved";
    syncInBackground(this, "getBoard", async () => {
      const remoteBoard = await workspaceApi.getBoard(board.id);
      mergeBoardRecord(this, remoteBoard);
    });
    syncBoardHistory(this, board.id);
    return true;
  },
  renameBoardById(boardId, title) {
    const board = (this.boards || []).find((item) => item.id === boardId && item.status !== "deleted");
    if (!board) return false;
    if (!canManageBoardRecord(this, board)) {
      this.showToast("只有画板拥有者或项目管理员可以重命名");
      return false;
    }
    const baseVersion = boardVersion(board);
    renameBoard(board, title, this.currentUser);
    const stamp = captureBoardSyncStamp(board);
    this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    this.boardSaveState = "local";
    syncInBackground(this, "renameBoard", () => saveBoardWithConflictRetry(this, board, {}, baseVersion), {
      markBoardSyncFailed: true,
      onSuccess: (remoteBoard, result) => {
        if (isBoardSyncStale(board, stamp)) {
          finishStaleBoardSync(this);
          return;
        }
        mergeBoardRecord(this, remoteBoard);
        mergeBoardHistoryEntries(this, result?.history || []);
        this.boardSaveState = "saved";
      }
    });
    this.showToast("画板已重命名");
    return true;
  },
  deleteBoardById(boardId) {
    const board = (this.boards || []).find((item) => item.id === boardId && item.status !== "deleted");
    if (!board) return false;
    if (!canManageBoardRecord(this, board)) {
      this.showToast("只有画板拥有者或项目管理员可以删除");
      return false;
    }
    const scope = scopeFromBoard(this, board);
    const activeInScope = listBoardsForScope(this.boards || [], scope);
    if (activeInScope.length <= 1) {
      this.showToast("至少保留一个画板");
      return false;
    }
    deleteBoard(board, this.currentUser);
    if (this.activeBoardId === boardId) {
      const nextBoard = listBoardsForScope(this.boards || [], scope)[0] || null;
      this.activeBoardId = nextBoard?.id || null;
      this.activeBoardScope = scope;
      this.boardLibraryOpen = true;
      this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    }
    syncInBackground(this, "deleteBoard", () => workspaceApi.deleteBoard(board.id), {
      markBoardSyncFailed: this.activeBoardId === board.id
    });
    this.showToast("画板已删除");
    return true;
  },
  shareBoardById(boardId, entries = []) {
    const board = (this.boards || []).find((item) => item.id === boardId && item.status !== "deleted");
    if (!board) return false;
    if (!canManageBoardRecord(this, board)) {
      this.showToast("只有画板拥有者或项目管理员可以设置共享");
      return false;
    }
    const previousSharedWith = JSON.parse(JSON.stringify(board.sharedWith || []));
    shareBoard(board, entries, this.currentUser);
    this.boardReloadToken = Number(this.boardReloadToken || 0) + 1;
    this.boardSaveState = "local";
    syncInBackground(this, "shareBoard", () => workspaceApi.shareBoard(board.id, board.sharedWith || []), {
      markBoardSyncFailed: true,
      onSuccess: (remoteBoard) => {
        const invalidShares = remoteBoard?.shareResult?.invalidShares || remoteBoard?.invalidShares || [];
        if (remoteBoard?.shareResult?.ok === false || invalidShares.length > 0) {
          board.sharedWith = previousSharedWith;
          this.boardSaveState = "sync-failed";
          this.showToast(backendSyncToast(makeBoardShareError(remoteBoard)));
          return;
        }
        mergeBoardRecord(this, remoteBoard);
        this.boardSaveState = "saved";
        this.showToast("画板共享权限已更新");
      }
    });
    return true;
  },
  canEditBoardRecord(board) {
    return canEditBoardRecord(this, board);
  },
  canManageBoardRecord(board) {
    return canManageBoardRecord(this, board);
  }
};
