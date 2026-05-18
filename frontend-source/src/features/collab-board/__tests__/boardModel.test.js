import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOARD_HISTORY_DAYS,
  createBoardScope,
  createBoardSnapshot,
  createScopedBoard,
  deleteBoard,
  ensureProjectBoard,
  ensureDefaultBoardForScope,
  getBoardScopeKey,
  getBoardsSharedByUser,
  getBoardsSharedWithUser,
  getBoardsVisibleToUser,
  getBoardRole,
  getUserBoardPermission,
  isBoardEditable,
  listBoardsForScope,
  pruneBoardHistory,
  renameBoard,
  restoreBoardSnapshot
} from "../boardModel.js";

const project = {
  id: 1003,
  name: "新活动，福利，新界面……",
  members: ["严云雪", "张三", "星星星"],
  memberRoles: {
    严云雪: "manager",
    张三: "editor",
    星星星: "readonly"
  }
};

test("automatically creates one project board when a project is opened", () => {
  const boards = [];
  const board = ensureProjectBoard(boards, project, { id: "u-yan", name: "严云雪" }, "2026-05-12T01:00:00.000Z");
  const sameBoard = ensureProjectBoard(boards, project, { id: "u-zhang", name: "张三" }, "2026-05-12T01:02:00.000Z");

  assert.equal(boards.length, 1);
  assert.equal(board.id, "board-project-1003");
  assert.equal(sameBoard.id, "board-project-1003");
  assert.equal(board.scopeType, "project");
  assert.equal(board.projectId, 1003);
  assert.equal(board.title, "新活动，福利，新界面…… 协作画板");
});

test("creates project and module default boards in isolated scopes", () => {
  const boards = [];
  const projectScope = createBoardScope({ scopeType: "project", project });
  const moduleScope = createBoardScope({
    scopeType: "module",
    project,
    module: { key: "aigc", label: "AIGC" }
  });

  const projectBoard = ensureDefaultBoardForScope(boards, projectScope, { id: "u-yan", name: "严云雪" }, "2026-05-12T01:00:00.000Z");
  const moduleBoard = ensureDefaultBoardForScope(boards, moduleScope, { id: "u-yan", name: "严云雪" }, "2026-05-12T01:01:00.000Z");

  assert.equal(getBoardScopeKey(projectScope), "project:1003");
  assert.equal(getBoardScopeKey(moduleScope), "module:1003:aigc");
  assert.equal(projectBoard.id, "board-project-1003");
  assert.equal(moduleBoard.id, "board-module-1003-aigc");
  assert.equal(projectBoard.scopeKey, "project:1003");
  assert.equal(moduleBoard.scopeKey, "module:1003:aigc");
  assert.equal(listBoardsForScope(boards, projectScope).length, 1);
  assert.equal(listBoardsForScope(boards, moduleScope).length, 1);
});

test("allows multiple named boards inside the same scope", () => {
  const boards = [];
  const scope = createBoardScope({
    scopeType: "module",
    project,
    module: { key: "design", label: "美术设计" }
  });
  const mainBoard = ensureDefaultBoardForScope(boards, scope, { id: "u-yan", name: "严云雪" }, "2026-05-12T01:00:00.000Z");
  const zhangBoard = createScopedBoard(scope, { title: "张三美术草稿", ownerId: "u-zhang", ownerName: "张三" }, { id: "u-zhang", name: "张三" }, "2026-05-12T01:02:00.000Z");
  const liBoard = createScopedBoard(scope, { title: "李四美术方案", ownerId: "u-lisi", ownerName: "李四" }, { id: "u-lisi", name: "李四" }, "2026-05-12T01:03:00.000Z");

  boards.push(zhangBoard, liBoard);

  assert.equal(mainBoard.isDefault, true);
  assert.equal(zhangBoard.scopeKey, "module:1003:design");
  assert.equal(liBoard.scopeKey, "module:1003:design");
  assert.notEqual(zhangBoard.id, liBoard.id);
  assert.deepEqual(listBoardsForScope(boards, scope).map((board) => board.title), ["美术设计 主画板", "张三美术草稿", "李四美术方案"]);
});

test("renames and soft deletes boards without touching other boards", () => {
  const scope = createBoardScope({ scopeType: "project", project });
  const first = createScopedBoard(scope, { title: "张三草稿", ownerId: "u-zhang", ownerName: "张三" }, { id: "u-zhang", name: "张三" }, "2026-05-12T01:00:00.000Z");
  const second = createScopedBoard(scope, { title: "李四方案", ownerId: "u-lisi", ownerName: "李四" }, { id: "u-lisi", name: "李四" }, "2026-05-12T01:01:00.000Z");

  renameBoard(first, "张三新版草稿", { id: "u-zhang", name: "张三" }, "2026-05-12T01:02:00.000Z");
  deleteBoard(second, { id: "u-lisi", name: "李四" }, "2026-05-12T01:03:00.000Z");

  assert.equal(first.title, "张三新版草稿");
  assert.equal(first.updatedBy, "张三");
  assert.equal(second.status, "deleted");
  assert.equal(second.deletedBy, "李四");
});

test("tracks board sharing permissions and user board lists", () => {
  const scope = createBoardScope({ scopeType: "module", project, module: { key: "aigc", label: "AIGC" } });
  const ownBoard = createScopedBoard(scope, { title: "张三 AIGC 草稿", ownerId: "u-zhang", ownerName: "张三" }, { id: "u-zhang", name: "张三" }, "2026-05-12T01:00:00.000Z");
  const sharedBoard = createScopedBoard(
    scope,
    {
      title: "李四 AIGC 方案",
      ownerId: "u-lisi",
      ownerName: "李四",
      sharedWith: [
        { userId: "u-zhang", userName: "张三", permission: "edit" },
        { userId: "u-star", userName: "星星", permission: "readonly" }
      ]
    },
    { id: "u-lisi", name: "李四" },
    "2026-05-12T01:01:00.000Z"
  );
  const boards = [ownBoard, sharedBoard];

  assert.equal(getUserBoardPermission(ownBoard, { id: "u-zhang", name: "张三" }), "owner");
  assert.equal(getUserBoardPermission(sharedBoard, { id: "u-zhang", name: "张三" }), "edit");
  assert.equal(getUserBoardPermission(sharedBoard, { id: "u-star", name: "星星" }), "readonly");
  assert.deepEqual(getBoardsVisibleToUser(boards, { id: "u-zhang", name: "张三" }).map((board) => board.title), ["张三 AIGC 草稿", "李四 AIGC 方案"]);
  assert.deepEqual(getBoardsSharedWithUser(boards, { id: "u-zhang", name: "张三" }).map((board) => board.title), ["李四 AIGC 方案"]);
  assert.deepEqual(getBoardsSharedByUser(boards, { id: "u-lisi", name: "李四" }).map((board) => board.title), ["李四 AIGC 方案"]);
});

test("maps project roles to board edit permissions", () => {
  assert.equal(getBoardRole(project, { name: "严云雪", role: "user" }), "manager");
  assert.equal(getBoardRole(project, { name: "张三", role: "user" }), "editor");
  assert.equal(getBoardRole(project, { name: "星星星", role: "user" }), "readonly");
  assert.equal(getBoardRole(project, { name: "路人", role: "user" }), "none");
  assert.equal(isBoardEditable("manager"), true);
  assert.equal(isBoardEditable("editor"), true);
  assert.equal(isBoardEditable("readonly"), false);
});

test("prunes board history older than thirty days", () => {
  const history = [
    { id: "old", boardId: "board-project-1003", createdAt: "2026-04-10T00:00:00.000Z" },
    { id: "edge", boardId: "board-project-1003", createdAt: "2026-04-12T01:00:00.000Z" },
    { id: "fresh", boardId: "board-project-1003", createdAt: "2026-05-12T01:00:00.000Z" }
  ];

  assert.equal(BOARD_HISTORY_DAYS, 30);
  assert.deepEqual(pruneBoardHistory(history, "2026-05-12T01:00:00.000Z").map((item) => item.id), ["edge", "fresh"]);
});

test("creates snapshots and restores board data from selected history", () => {
  const board = ensureProjectBoard([], project, { id: "u-yan", name: "严云雪" }, "2026-05-12T01:00:00.000Z");
  board.elements = [{ id: "a", type: "rectangle", version: 1 }];
  board.appState = { viewBackgroundColor: "#ffffff" };
  board.files = {};

  const snapshot = createBoardSnapshot(board, { id: "u-yan", name: "严云雪" }, "2026-05-12T01:03:00.000Z");
  board.elements = [{ id: "b", type: "ellipse", version: 1 }];

  const restored = restoreBoardSnapshot(board, snapshot, { id: "u-zhang", name: "张三" }, "2026-05-12T01:05:00.000Z");

  assert.deepEqual(restored.elements, [{ id: "a", type: "rectangle", version: 1 }]);
  assert.equal(restored.updatedBy, "张三");
  assert.equal(restored.lastVersion, snapshot.version);
});
