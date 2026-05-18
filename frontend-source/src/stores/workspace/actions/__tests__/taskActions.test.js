import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import workspaceApi from "../../../../services/workspaceApi.js";
import { backendSyncToast } from "../../../../services/apiErrors.js";
import { taskActions } from "../taskActions.js";
import { idsEqual } from "../../helpers.js";

const originalCreateTask = workspaceApi.createTask;
const originalUpdateTask = workspaceApi.updateTask;
const originalDeleteTask = workspaceApi.deleteTask;
const originalAddTaskComment = workspaceApi.addTaskComment;
const originalConsoleWarn = console.warn;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { message } };
  return error;
}

async function flushBackgroundSync() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  workspaceApi.createTask = originalCreateTask;
  workspaceApi.updateTask = originalUpdateTask;
  workspaceApi.deleteTask = originalDeleteTask;
  workspaceApi.addTaskComment = originalAddTaskComment;
  console.warn = originalConsoleWarn;
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
});

function createMockStore() {
  const project = { id: 1003, projectId: "project-uid-1003", tasks: [] };
  const store = {
    activeProject: project,
    currentUser: { name: "娴嬭瘯鐢ㄦ埛", department: "椤圭洰绠＄悊" },
    activeView: "",
    recentTaskId: null,
    canComment: true,
    requireTaskEditPermission() {
      return true;
    },
    showToast() {},
    clearRecentTask() {},
    celebrate() {},
    taskMatchesFilter() {
      return true;
    },
    getTask(taskId) {
      return this.activeProject?.tasks.find((task) => idsEqual(task.id, taskId));
    }
  };
  store.restoreTask = taskActions.restoreTask.bind(store);
  store.completeTask = taskActions.completeTask.bind(store);
  store.moveTaskWithinModule = taskActions.moveTaskWithinModule.bind(store);
  return store;
}

describe("taskActions", () => {
  it("classifies backend sync failures without treating every error as a local save", () => {
    assert.equal(backendSyncToast(createHttpError(503, "database unavailable")), "后端或数据库不可用，请确认服务与数据库已启动");
    assert.equal(backendSyncToast({ code: "ERR_NETWORK", message: "Network Error" }), "后端服务未连接，请确认后端已启动后再同步");
    assert.equal(backendSyncToast(createHttpError(409, "write conflict")), "已本地保存，后端同步失败");
    assert.equal(backendSyncToast(createHttpError(500, "server error")), "后端服务异常，同步未完成");
  });

  it("clears stored login state when background task sync returns 401", async () => {
    const store = createMockStore();
    const toastMessages = [];
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    globalThis.window = {};
    globalThis.localStorage = createMemoryStorage();
    localStorage.setItem("xjg_token", "expired-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-stale" }));
    console.warn = () => {};
    workspaceApi.createTask = async () => {
      throw createHttpError(401, "Authentication failed");
    };

    const ok = taskActions.createTask.call(store, {
      title: "权限失败任务",
      type: "娴佺▼",
      module: "project",
      startDate: "2026/05/09",
      endDate: "2026/05/09"
    });
    await flushBackgroundSync();

    assert.equal(ok, true);
    assert.equal(localStorage.getItem("xjg_token"), null);
    assert.equal(localStorage.getItem("xjg_user"), null);
    assert.deepEqual(toastMessages, ["清单已创建", "登录已失效，请重新登录后再同步"]);
  });

  it("keeps stored login state when background task sync returns 403", async () => {
    const store = createMockStore();
    const toastMessages = [];
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    globalThis.window = {};
    globalThis.localStorage = createMemoryStorage();
    localStorage.setItem("xjg_token", "backend-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-stale" }));
    console.warn = () => {};
    workspaceApi.createTask = async () => {
      throw createHttpError(403, "No permission to access");
    };

    const ok = taskActions.createTask.call(store, {
      title: "Forbidden task sync",
      type: "流程",
      module: "project",
      startDate: "2026/05/09",
      endDate: "2026/05/09"
    });
    await flushBackgroundSync();

    assert.equal(ok, true);
    assert.equal(localStorage.getItem("xjg_token"), "backend-token");
    assert.equal(localStorage.getItem("xjg_user"), JSON.stringify({ id: "u-stale" }));
    assert.equal(toastMessages.length, 2);
    assert.doesNotMatch(toastMessages[1], /已本地保存，后端同步失败/);
  });

  it("keeps new tasks collapsed by default", () => {
    const store = createMockStore();

    const ok = taskActions.createTask.call(store, {
      title: "尺寸确认",
      type: "流程",
      module: "aigc",
      startDate: "2026/05/09",
      endDate: "2026/05/09"
    });

    assert.equal(ok, true);
    assert.equal(store.activeProject.tasks.length, 1);
    assert.equal(store.activeProject.tasks[0].expanded, false);
  });

  it("preserves selected subdepartment metadata on created tasks and create sync payload", async () => {
    const store = createMockStore();
    const calls = [];
    globalThis.window = {};
    workspaceApi.createTask = async (projectId, payload) => {
      calls.push([projectId, payload]);
      return { task: { taskId: "task-backend-subdepartment", projectId } };
    };

    const ok = taskActions.createTask.call(store, {
      title: "Subdepartment visual package",
      type: "flow",
      module: "post",
      department: "\u89c6\u6548\u5305\u88c5\u4e09\u90e8",
      departmentKey: "post-3",
      departmentLabel: "\u89c6\u6548\u5305\u88c5\u4e09\u90e8",
      startDate: "2026/05/09",
      endDate: "2026/05/09"
    });
    await flushBackgroundSync();

    assert.equal(ok, true);
    const createdTask = store.activeProject.tasks[0];
    assert.equal(createdTask.module, "post");
    assert.equal(createdTask.department, "\u89c6\u6548\u5305\u88c5\u4e09\u90e8");
    assert.equal(createdTask.departmentKey, "post-3");
    assert.equal(createdTask.departmentLabel, "\u89c6\u6548\u5305\u88c5\u4e09\u90e8");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "project-uid-1003");
    assert.equal(calls[0][1].module, "post");
    assert.equal(calls[0][1].department, "\u89c6\u6548\u5305\u88c5\u4e09\u90e8");
    assert.equal(calls[0][1].departmentKey, "post-3");
    assert.equal(calls[0][1].departmentLabel, "\u89c6\u6548\u5305\u88c5\u4e09\u90e8");
  });

  it("uses the backend task uid for follow-up updates after create sync", async () => {
    const store = createMockStore();
    const calls = [];
    globalThis.window = {};
    workspaceApi.createTask = async () => ({
      task: {
        id: 7001,
        taskId: "task-backend-7001",
        projectId: 1003
      }
    });
    workspaceApi.updateTask = async (taskId, payload) => {
      calls.push([taskId, payload.title]);
      return { ok: true };
    };

    const ok = taskActions.createTask.call(store, {
      title: "Backend linked task",
      type: "娴佺▼",
      module: "project",
      startDate: "2026/05/09",
      endDate: "2026/05/09"
    });
    await flushBackgroundSync();

    const localTaskId = store.activeProject.tasks[0].id;
    assert.equal(ok, true);
    assert.equal(store.activeProject.tasks[0].taskId, "task-backend-7001");
    taskActions.updateTaskTitle.call(store, localTaskId, "Updated through backend id");
    await flushBackgroundSync();

    assert.deepEqual(calls, [["task-backend-7001", "Updated through backend id"]]);
  });

  it("rolls back task dispatch when backend create fails", async () => {
    const store = createMockStore();
    const toastMessages = [];
    globalThis.window = {};
    console.warn = () => {};
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    workspaceApi.createTask = async () => {
      throw createHttpError(409, "write conflict");
    };

    const result = taskActions.createTask.call(store, {
      title: "Rollback create",
      type: "娴佺▼",
      module: "project",
      startDate: "2026/05/09",
      endDate: "2026/05/09"
    });
    assert.equal(result, true);
    assert.equal(store.activeProject.tasks.length, 1);

    await flushBackgroundSync();

    assert.deepEqual(store.activeProject.tasks, []);
    assert.equal(toastMessages.includes(backendSyncToast(createHttpError(409, "write conflict"))), true);
  });

  it("allows archived tasks to be dragged back to active tasks", () => {
    const store = createMockStore();
    const task = { id: 1, title: "缇庢湳纭", module: "art", archived: true, expanded: true };
    const beforeTarget = { id: 6, title: "开发检查", module: "dev", archived: false, expanded: false };
    const toastMessages = [];
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    store.activeProject.tasks.push(beforeTarget, task);

    const result = taskActions.handleTaskDrop.call(store, 1, "active", "dev", 6);

    assert.equal(result, "moved");
    assert.deepEqual(store.activeProject.tasks.map((item) => item.id), [1, 6]);
    assert.equal(task.module, "dev");
    assert.equal(task.archived, false);
    assert.equal(task.expanded, false);
    assert.deepEqual(toastMessages, ["已恢复到待完成任务列表"]);
  });

  it("syncs archived tasks as active when dragged back", async () => {
    const store = createMockStore();
    const calls = [];
    globalThis.window = {};
    workspaceApi.updateTask = async (taskId, payload) => {
      calls.push([taskId, payload]);
      return { ok: true };
    };
    const task = { id: 9, taskUid: "task-backend-9", title: "恢复同步", module: "art", archived: true, expanded: true };
    const beforeTarget = { id: 10, title: "恢复位置", module: "art", archived: false, expanded: false };
    store.activeProject.tasks.push(beforeTarget, task);

    const result = taskActions.handleTaskDrop.call(store, 9, "active", "art", 10);
    await flushBackgroundSync();

    assert.equal(result, "moved");
    assert.equal(task.archived, false);
    assert.deepEqual(calls, [
      [
        "task-backend-9",
        {
          module: "art",
          archived: false,
          expanded: false,
          projectId: "project-uid-1003"
        }
      ]
    ]);
  });

  it("falls back to legacy project and task ids when syncing archived tasks dragged back", async () => {
    const store = createMockStore();
    const calls = [];
    globalThis.window = {};
    store.activeProject = {
      id: 1003,
      tasks: []
    };
    workspaceApi.updateTask = async (taskId, payload) => {
      calls.push([taskId, payload]);
      return { ok: true };
    };
    const task = { id: 19, title: "Legacy restore", module: "art", archived: true, expanded: true };
    const beforeTarget = { id: 20, title: "Legacy before target", module: "art", archived: false, expanded: false };
    store.activeProject.tasks.push(beforeTarget, task);

    const result = taskActions.handleTaskDrop.call(store, 19, "active", "art", 20);
    await flushBackgroundSync();

    assert.equal(result, "moved");
    assert.equal(task.archived, false);
    assert.deepEqual(calls, [
      [
        "19",
        {
          module: "art",
          archived: false,
          expanded: false,
          projectId: "1003"
        }
      ]
    ]);
  });

  it("allows archived string-id tasks to be dragged back to active tasks", () => {
    const store = createMockStore();
    const toastMessages = [];
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    const task = { id: "task-legacy-1", title: "String restore", module: "art", archived: true, expanded: true };
    const beforeTarget = { id: "task-legacy-2", title: "String before target", module: "art", archived: false, expanded: false };
    store.activeProject.tasks.push(beforeTarget, task);

    const result = taskActions.handleTaskDrop.call(store, "task-legacy-1", "active", "art", "task-legacy-2");

    assert.equal(result, "moved");
    assert.deepEqual(store.activeProject.tasks.map((item) => item.id), ["task-legacy-1", "task-legacy-2"]);
    assert.equal(task.archived, false);
    assert.equal(task.expanded, false);
    assert.deepEqual(toastMessages, ["已恢复到待完成任务列表"]);
  });

  it("rolls back restoring archived tasks when backend sync fails", async () => {
    const store = createMockStore();
    const toastMessages = [];
    globalThis.window = {};
    console.warn = () => {};
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    workspaceApi.updateTask = async () => {
      throw createHttpError(409, "write conflict");
    };
    const beforeTarget = { id: 30, title: "Stable active task", module: "art", archived: false, expanded: false };
    const task = { id: 31, taskUid: "task-backend-31", title: "Rollback restore", module: "art", archived: true, expanded: true };
    store.activeProject.tasks.push(beforeTarget, task);

    const result = taskActions.handleTaskDrop.call(store, 31, "active", "art", 30);

    assert.equal(result, "moved");
    assert.equal(task.archived, false);
    assert.equal(task.expanded, false);
    assert.deepEqual(store.activeProject.tasks.map((item) => item.id), [31, 30]);

    await flushBackgroundSync();

    assert.equal(task.archived, true);
    assert.equal(task.expanded, true);
    assert.equal(task.module, "art");
    assert.deepEqual(store.activeProject.tasks.map((item) => item.id), [30, 31]);
    assert.equal(
      toastMessages.includes(backendSyncToast(createHttpError(409, "write conflict"))),
      true
    );
  });

  it("restores archived tasks through restoreTask without expanding them", () => {
    const store = createMockStore();
    const task = { id: 5, title: "楠屾敹灏佹澘", module: "art", archived: true, expanded: true };
    store.activeProject.tasks.push(task);

    const result = taskActions.restoreTask.call(store, task, true);

    assert.equal(result, true);
    assert.equal(task.archived, false);
    assert.equal(task.expanded, false);
  });

  it("keeps active tasks droppable into archived list", () => {
    const store = createMockStore();
    const task = { id: 2, title: "开发联调", module: "dev", archived: false, expanded: true };
    store.activeProject.tasks.push(task);

    const result = taskActions.handleTaskDrop.call(store, 2, "archived", "dev");

    assert.equal(result, "archive");
    assert.equal(task.archived, true);
    assert.equal(task.expanded, false);
  });

  it("allows archived tasks to reorder inside the same module", () => {
    const store = createMockStore();
    const first = { id: 3, title: "鍓嶇疆纭", module: "art", archived: true, expanded: false };
    const second = { id: 4, title: "鍚庣疆纭", module: "art", archived: true, expanded: false };
    store.activeProject.tasks.push(first, second);

    const result = taskActions.handleTaskDrop.call(store, 4, "archived", "art", 3);

    assert.equal(result, "moved");
    assert.deepEqual(store.activeProject.tasks.map((task) => task.id), [4, 3]);
    assert.equal(second.archived, true);
  });

  it("keeps projectUid when syncing moved flow tasks", async () => {
    const store = createMockStore();
    const calls = [];
    globalThis.window = {};
    store.activeProject.id = "";
    store.activeProject.projectUid = "project-uid-1003";
    store.activeProject.tasks.push(
      { id: 7, taskUid: "task-backend-7", title: "Backend flow task", module: "art", archived: false, expanded: true },
      { id: 8, taskUid: "task-backend-8", title: "Same module task", module: "art", archived: false, expanded: false }
    );
    workspaceApi.updateTask = async (taskId, payload) => {
      calls.push([taskId, payload]);
      return { ok: true };
    };

    const result = taskActions.moveTaskWithinModule.call(store, 7, "art", "active", 8);
    await flushBackgroundSync();

    assert.equal(result, true);
    assert.deepEqual(calls, [
      [
        "task-backend-7",
        {
          module: "art",
          archived: false,
          expanded: true,
          projectId: "project-uid-1003"
        }
      ]
    ]);
  });

  it("blocks task moves when the project api id is missing", async () => {
    const store = createMockStore();
    const calls = [];
    const toastMessages = [];
    globalThis.window = {};
    console.warn = () => {};
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    store.activeProject = {
      tasks: [
        { id: 7, taskId: "task-backend-7", title: "Backend flow task", module: "art", archived: false, expanded: true },
        { id: 8, taskId: "task-backend-8", title: "Same module task", module: "art", archived: false, expanded: false }
      ]
    };
    workspaceApi.updateTask = async (taskId, payload) => {
      calls.push([taskId, payload]);
      throw createHttpError(409, "write conflict");
    };

    const result = taskActions.moveTaskWithinModule.call(store, 7, "art", "active", 8);
    await flushBackgroundSync();

    assert.equal(result, false);
    assert.deepEqual(calls, []);
    assert.deepEqual(store.activeProject.tasks.map((task) => task.id), [7, 8]);
    assert.equal(toastMessages.includes(backendSyncToast(createHttpError(409, "write conflict"))), false);
  });

  it("skips comment sync when project or task api ids are missing", async () => {
    const store = createMockStore();
    const calls = [];
    const toastMessages = [];
    globalThis.window = {};
    console.warn = () => {};
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    store.activeProject = {
      tasks: [{ id: 11, title: "Local task", module: "art", archived: false, comments: [], syncStatus: "pending" }]
    };
    workspaceApi.addTaskComment = async (taskId, text) => {
      calls.push([taskId, text]);
      throw createHttpError(409, "write conflict");
    };

    const result = taskActions.addComment.call(store, 11, "local note");
    await flushBackgroundSync();

    assert.equal(result, true);
    assert.equal(store.activeProject.tasks[0].comments.length, 1);
    assert.deepEqual(calls, []);
    assert.equal(toastMessages.includes(backendSyncToast(createHttpError(409, "write conflict"))), false);
  });

  it("blocks task delete when project or task api ids are missing", async () => {
    const store = createMockStore();
    const calls = [];
    const toastMessages = [];
    globalThis.window = {};
    console.warn = () => {};
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    store.activeProject = {
      tasks: [{ id: 12, title: "Local task", module: "art", archived: false, comments: [], syncStatus: "pending" }]
    };
    workspaceApi.deleteTask = async (taskId) => {
      calls.push([taskId]);
      throw createHttpError(409, "write conflict");
    };

    const result = taskActions.deleteTask.call(store, 12);
    await flushBackgroundSync();

    assert.equal(result, false);
    assert.deepEqual(store.activeProject.tasks.map((task) => task.id), [12]);
    assert.deepEqual(calls, []);
    assert.equal(toastMessages.includes(backendSyncToast(createHttpError(409, "write conflict"))), false);
  });

  it("rolls back task delete when backend delete fails", async () => {
    const store = createMockStore();
    const toastMessages = [];
    globalThis.window = {};
    console.warn = () => {};
    store.showToast = (message) => {
      toastMessages.push(message);
    };
    store.activeProject.tasks.push({ id: 23, taskId: "task-backend-23", title: "Rollback delete", module: "art", archived: false, comments: [] });
    workspaceApi.deleteTask = async () => {
      throw createHttpError(409, "write conflict");
    };

    const result = taskActions.deleteTask.call(store, 23);
    assert.equal(result, true);
    assert.deepEqual(store.activeProject.tasks, []);

    await flushBackgroundSync();

    assert.deepEqual(store.activeProject.tasks.map((task) => task.id), [23]);
    assert.equal(toastMessages.includes(backendSyncToast(createHttpError(409, "write conflict"))), true);
  });

  it("syncs comments and deletes when project and task api ids exist", async () => {
    const store = createMockStore();
    const calls = [];
    globalThis.window = {};
    store.activeProject.tasks.push(
      { id: 21, taskId: "task-backend-21", title: "Comment task", module: "art", archived: false, comments: [] },
      { id: 22, taskId: "task-backend-22", title: "Delete task", module: "art", archived: false, comments: [] }
    );
    workspaceApi.addTaskComment = async (taskId, text, mentions) => {
      calls.push(["comment", taskId, text, mentions]);
      return { ok: true };
    };
    workspaceApi.deleteTask = async (taskId) => {
      calls.push(["delete", taskId]);
      return { ok: true };
    };

    assert.equal(taskActions.addComment.call(store, 21, "backend note @张三", [{ userId: "u-zhangsan", name: "张三" }]), true);
    assert.equal(taskActions.deleteTask.call(store, 22), true);
    await flushBackgroundSync();

    assert.deepEqual(calls, [
      ["comment", "task-backend-21", "backend note @张三", [{ userId: "u-zhangsan", name: "张三" }]],
      ["delete", "task-backend-22"]
    ]);
  });
});
