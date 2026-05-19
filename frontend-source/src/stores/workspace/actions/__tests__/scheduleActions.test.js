import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import scheduleApi from "../../../../services/scheduleApi.js";
import http from "../../../../services/http.js";
import workspaceApi from "../../../../services/workspaceApi.js";
import { createInitialState } from "../../../../data/seed.js";
import { appActions } from "../appActions.js";
import { coreActions } from "../coreActions.js";
import { projectActions } from "../projectActions.js";
import { scheduleActions } from "../scheduleActions.js";

const originalCreateScheduleItem = scheduleApi.createScheduleItem;
const originalUpdateScheduleItem = scheduleApi.updateScheduleItem;
const originalDeleteScheduleItem = scheduleApi.deleteScheduleItem;
const originalGetProjectSchedule = scheduleApi.getProjectSchedule;
const originalListScheduleItemComments = scheduleApi.listScheduleItemComments;
const originalCreateScheduleItemComment = scheduleApi.createScheduleItemComment;
const originalGetBootstrap = workspaceApi.getBootstrap;
const originalListCarouselNotices = workspaceApi.listCarouselNotices;
const originalUpdateTemplate = workspaceApi.updateTemplate;
const originalHttpGet = http.get;
const originalConsoleWarn = console.warn;
const originalLocalStorage = globalThis.localStorage;
const originalFallbackEnv = process.env.VITE_ENABLE_LOCAL_WORKSPACE_FALLBACK;

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

afterEach(() => {
  scheduleApi.createScheduleItem = originalCreateScheduleItem;
  scheduleApi.updateScheduleItem = originalUpdateScheduleItem;
  scheduleApi.deleteScheduleItem = originalDeleteScheduleItem;
  scheduleApi.getProjectSchedule = originalGetProjectSchedule;
  scheduleApi.listScheduleItemComments = originalListScheduleItemComments;
  scheduleApi.createScheduleItemComment = originalCreateScheduleItemComment;
  workspaceApi.getBootstrap = originalGetBootstrap;
  workspaceApi.listCarouselNotices = originalListCarouselNotices;
  workspaceApi.updateTemplate = originalUpdateTemplate;
  http.get = originalHttpGet;
  console.warn = originalConsoleWarn;
  globalThis.localStorage = originalLocalStorage;
  if (originalFallbackEnv === undefined) delete process.env.VITE_ENABLE_LOCAL_WORKSPACE_FALLBACK;
  else process.env.VITE_ENABLE_LOCAL_WORKSPACE_FALLBACK = originalFallbackEnv;
});

function createStore(dayWidth = 28) {
  return {
    activeProject: {
      id: 1003,
      name: "测试项目",
      startDate: "2026/05/10",
      endDate: "2026/05/20",
      tasks: []
    },
    schedulePlan: {
      id: "sp-test",
      projectId: 1003,
      startDate: "2026/05/10",
      endDate: "2026/05/20",
      summary: {
        itemCount: 1,
        pendingCount: 1,
        doneCount: 0,
        riskCount: 0
      },
      items: [
        {
          id: "si-existing",
          itemId: "si-existing",
          projectId: 1003,
          planId: "sp-test",
          type: "schedule",
          title: "已有排期",
          module: "aigc",
          startDate: "2026/05/10",
          endDate: "2026/05/20",
          status: "todo",
          progress: 20
        }
      ],
      dependencies: [],
      snapshots: [],
      templates: []
    },
    scheduleUi: {
      view: "timeline",
      departmentFilter: "全部",
      rowFilter: "all",
      dayWidth,
      zoomLevel: 3,
      visibleStartDate: "2026/05/10",
      visibleEndDate: "2026/05/20",
      selectedItemId: "",
      selectedTaskId: null,
      chat: {
        visible: false,
        itemId: "",
        taskUid: "",
        targetType: "",
        targetId: "",
        x: 920,
        y: 360,
        width: 390,
        height: 560,
        comments: [],
        commentsCount: 0
      }
    },
    requireTaskEditPermission() {
      return true;
    },
    showToast() {}
  };
}

function createWorkspaceStoreForAppState() {
  const store = {
    ...createInitialState(),
    normalizeLoadedState: appActions.normalizeLoadedState,
    getTaskModule(task) {
      return { key: task?.module || "project" };
    }
  };
  Object.defineProperties(store, {
    allProjects: {
      get: () => [...(store.rootProjects || []), ...(store.projectGroups || []).flatMap((group) => group.projects || [])]
    },
    activeProjects: {
      get: () => store.allProjects.filter((project) => project.status !== "archived")
    },
    activeProject: {
      get: () => store.allProjects.find((project) => project.id === store.activeProjectId && project.status !== "archived") || null
    },
    currentUser: {
      get: () => (store.users || []).find((user) => user.id === store.currentUserId) || (store.users || [])[0] || null
    },
    activeTasks: {
      get: () => store.activeProject?.tasks?.filter((task) => !task.archived) || []
    }
  });
  return store;
}

describe("schedule UI actions", () => {
  it("keeps a usable local workspace when bootstrap and appState are offline and fallback is enabled", async () => {
    const store = createWorkspaceStoreForAppState();
    process.env.VITE_ENABLE_LOCAL_WORKSPACE_FALLBACK = "true";
    workspaceApi.getBootstrap = async () => {
      throw new Error("bootstrap offline");
    };
    http.get = async () => {
      throw new Error("appState offline");
    };
    console.warn = () => {};

    const loaded = await appActions.loadAppState.call(store);

    assert.equal(loaded, false);
    assert.equal(store.backendSource, "local");
    assert.ok(store.currentUser?.id);
    assert.ok(store.activeProject);
    assert.ok(store.activeTasks.length > 0);
    assert.ok(store.boards.length > 0);
  });

  it("rejects bootstrap 401 errors instead of silently loading a local workspace", async () => {
    const store = createWorkspaceStoreForAppState();
    let appStateRequested = false;
    globalThis.localStorage = createMemoryStorage();
    localStorage.setItem("xjg_token", "expired-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-stale", name: "Stale User" }));
    workspaceApi.getBootstrap = async () => {
      throw createHttpError(401, "Authentication failed");
    };
    http.get = async () => {
      appStateRequested = true;
      return {};
    };

    await assert.rejects(
      () => appActions.loadAppState.call(store),
      (error) => error?.response?.status === 401
    );
    assert.equal(appStateRequested, false);
    assert.equal(store.backendSource, "none");
    assert.equal(store.backendLoaded, false);
    assert.equal(store.currentUserId, "");
    assert.equal(store.activeProject, null);
    assert.equal(localStorage.getItem("xjg_token"), null);
    assert.equal(localStorage.getItem("xjg_user"), null);
  });

  it("rejects appState 403 errors instead of silently loading a local workspace", async () => {
    const store = createWorkspaceStoreForAppState();
    globalThis.localStorage = createMemoryStorage();
    localStorage.setItem("xjg_token", "forbidden-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-stale", name: "Stale User" }));
    workspaceApi.getBootstrap = async () => {
      throw new Error("bootstrap offline");
    };
    http.get = async () => {
      throw createHttpError(403, "Forbidden");
    };

    await assert.rejects(
      () => appActions.loadAppState.call(store),
      (error) => error?.response?.status === 403
    );
    assert.equal(store.backendSource, "none");
    assert.equal(store.backendLoaded, false);
    assert.equal(store.currentUserId, "");
    assert.equal(store.activeProject, null);
    assert.equal(localStorage.getItem("xjg_token"), "forbidden-token");
    assert.equal(localStorage.getItem("xjg_user"), JSON.stringify({ id: "u-stale", name: "Stale User" }));
  });

  it("rejects offline bootstrap failures when local workspace fallback is disabled", async () => {
    const store = createWorkspaceStoreForAppState();
    workspaceApi.getBootstrap = async () => {
      throw new Error("bootstrap offline");
    };
    http.get = async () => {
      throw new Error("appState offline");
    };
    console.warn = () => {};

    await assert.rejects(() => appActions.loadAppState.call(store), /appState offline/);
    assert.equal(store.backendSource, "none");
    assert.equal(store.backendLoaded, false);
    assert.equal(store.currentUserId, "");
    assert.equal(store.activeProject, null);
  });

  it("loads active carousel notices after bootstrap and normalizes inline link fields", async () => {
    const store = createWorkspaceStoreForAppState();
    workspaceApi.getBootstrap = async () => ({
      rootProjects: [],
      projectGroups: [],
      users: [{ id: "u-admin", name: "Admin" }],
      currentUserId: "u-admin",
      carouselNotices: []
    });
    workspaceApi.listCarouselNotices = async () => ([
      {
        noticeId: "notice-weekly-report",
        title: "Weekly report",
        content: "同学们这周的报表出来了尽快核对",
        enabled: true,
        priority: 7,
        linkText: "报表",
        linkUrl: "/reports/weekly",
        linkTarget: "_blank"
      }
    ]);

    const loaded = await appActions.loadAppState.call(store);

    assert.equal(loaded, true);
    assert.equal(store.carouselNotices.length, 1);
    assert.equal(store.carouselNotices[0].id, "notice-weekly-report");
    assert.equal(store.carouselNotices[0].text, "同学们这周的报表出来了尽快核对");
    assert.equal(store.carouselNotices[0].priority, 7);
    assert.equal(store.carouselNotices[0].linkText, "报表");
    assert.equal(store.carouselNotices[0].linkUrl, "/reports/weekly");
    assert.equal(store.carouselNotices[0].linkTarget, "_blank");
  });

  it("keeps the current carousel notices when the active notice API is unavailable", async () => {
    const store = createWorkspaceStoreForAppState();
    store.carouselNotices = [
      {
        id: "notice-local",
        title: "Local notice",
        text: "Keep current notice state",
        enabled: true
      }
    ];
    workspaceApi.listCarouselNotices = async () => {
      throw createHttpError(503, "notice service unavailable");
    };

    const result = await appActions.loadCarouselNotices.call(store);

    assert.equal(result, false);
    assert.deepEqual(store.carouselNotices, [
      {
        id: "notice-local",
        title: "Local notice",
        text: "Keep current notice state",
        enabled: true
      }
    ]);
  });

  it("switches between supported schedule center views", () => {
    const store = createStore();

    assert.equal(scheduleActions.setScheduleUiView.call(store, "board"), true);
    assert.equal(store.scheduleUi.view, "board");
    assert.equal(scheduleActions.setScheduleUiView.call(store, "legacy"), false);
    assert.equal(store.scheduleUi.view, "board");
  });

  it("shares selected schedule item across non-timeline views without replacing plan data", () => {
    const store = createStore();
    store.schedulePlan.dependencies = [{ id: "dep-1", fromItemId: "si-existing", toItemId: "task-existing" }];
    const sharedItems = store.schedulePlan.items;
    const sharedDependencies = store.schedulePlan.dependencies;

    assert.equal(scheduleActions.setScheduleUiView.call(store, "board"), true);
    assert.equal(scheduleActions.selectScheduleItem.call(store, "si-existing", "task-existing"), true);
    assert.equal(store.scheduleUi.selectedItemId, "si-existing");
    assert.equal(store.scheduleUi.selectedTaskId, "task-existing");

    assert.equal(scheduleActions.setScheduleUiView.call(store, "node"), true);
    assert.equal(store.scheduleUi.selectedItemId, "si-existing");
    assert.equal(store.schedulePlan.items, sharedItems);
    assert.equal(store.schedulePlan.dependencies, sharedDependencies);
  });

  it("changes timeline row filters without replacing the shared schedule data", () => {
    const store = createStore();
    store.schedulePlan.items.push({
      id: "task-existing",
      itemId: "task-existing",
      projectId: 1003,
      planId: "sp-test",
      type: "task",
      title: "已有任务",
      module: "design",
      startDate: "2026/05/12",
      endDate: "2026/05/14",
      status: "todo",
      progress: 40
    });
    const sharedItems = store.schedulePlan.items;

    assert.equal(scheduleActions.setScheduleVisibleType.call(store, "task"), true);
    assert.equal(store.scheduleUi.visibleType, "task");
    assert.equal(store.schedulePlan.items, sharedItems);
    assert.equal(scheduleActions.setScheduleUiView.call(store, "board"), true);
    assert.equal(store.schedulePlan.items, sharedItems);
    assert.equal(scheduleActions.setScheduleVisibleType.call(store, "legacy"), false);
    assert.equal(store.scheduleUi.visibleType, "task");
  });

  it("clamps timeline zoom day width between 18 and 56 pixels", () => {
    const store = createStore(28);

    assert.equal(scheduleActions.adjustScheduleZoom.call(store, 100), 56);
    assert.equal(store.scheduleUi.dayWidth, 56);
    assert.equal(store.scheduleUi.zoomLevel, 5);
    assert.equal(scheduleActions.adjustScheduleZoom.call(store, -100), 18);
    assert.equal(store.scheduleUi.dayWidth, 18);
    assert.equal(store.scheduleUi.zoomLevel, 1);
  });

  it("updates schedule filters without mutating schedule items", () => {
    const store = createStore();
    const originalItems = store.schedulePlan.items;
    const allowedDepartmentFilters = [
      ["全部", "全部"],
      ["project", "project"],
      ["design", "design"],
      ["threeD", "threeD"],
      ["post", "post"],
      ["项目管理", "项目管理"],
      ["AIGC", "AIGC"],
      ["美术设计", "美术设计"],
      ["三维动态", "三维动态"],
      ["动效设计", "动效设计"],
      ["视效包装", "视效包装"],
      ["三维动画", "threeD"],
      ["三维动画设计部", "threeD"],
      ["后期合成", "post"],
      ["后期合成部", "post"]
    ];

    for (const [filter, expectedFilter] of allowedDepartmentFilters) {
      assert.equal(scheduleActions.setScheduleDepartmentFilter.call(store, filter), true);
      assert.equal(store.scheduleUi.departmentFilter, expectedFilter);
      assert.equal(store.schedulePlan.items, originalItems);
    }
    assert.equal(scheduleActions.setScheduleRowFilter.call(store, "task"), true);
    assert.equal(store.scheduleUi.rowFilter, "task");
    assert.equal(store.schedulePlan.items, originalItems);
    assert.equal(scheduleActions.setScheduleDepartmentFilter.call(store, "不存在部门"), false);
    assert.equal(scheduleActions.setScheduleRowFilter.call(store, "invalid"), false);
    assert.equal(store.scheduleUi.departmentFilter, "post");
    assert.equal(store.scheduleUi.rowFilter, "task");
    assert.equal(store.schedulePlan.items, originalItems);
  });

  it("sorts board cards by start date and end date", () => {
    const items = [
      { id: "late", title: "late", startDate: "2026/05/20", endDate: "2026/05/21" },
      { id: "same-late", title: "same late", startDate: "2026/05/10", endDate: "2026/05/18" },
      { id: "early", title: "early", startDate: "2026/05/10", endDate: "2026/05/12" }
    ];

    const sorted = scheduleActions.sortScheduleBoardItemsByDate(items);

    assert.notEqual(sorted, items);
    assert.deepEqual(sorted.map((item) => item.id), ["early", "same-late", "late"]);
  });

  it("moves schedule rows only inside the same department and gives feedback when blocked", async () => {
    const store = createStore();
    const toasts = [];
    store.showToast = (message) => toasts.push(message);
    scheduleApi.updateScheduleItem = async (_itemId, item) => ({ item });
    store.schedulePlan.items = [
      { id: "design-first", itemId: "design-first", type: "schedule", title: "美术 1", module: "design", sortOrder: 10 },
      { id: "project-top", itemId: "project-top", type: "schedule", title: "项目 1", module: "project", sortOrder: 10 },
      { id: "design-second", itemId: "design-second", type: "schedule", title: "美术 2", module: "design", sortOrder: 20 }
    ];

    const blocked = await scheduleActions.moveScheduleRowWithinDepartment.call(store, "design-first", "up");
    const moved = await scheduleActions.moveScheduleRowWithinDepartment.call(store, "design-first", "down");

    assert.equal(blocked, false);
    assert.equal(moved, true);
    assert.equal(store.schedulePlan.items.find((item) => item.id === "design-second").sortOrder, 100);
    assert.equal(store.schedulePlan.items.find((item) => item.id === "design-first").sortOrder, 200);
    assert.deepEqual(toasts, ["只能在同部门内部调整顺序", "已调整同部门排序"]);
  });

  it("moves a board card to another status locally and marks sync failure without replacing items", async () => {
    const store = createStore();
    const originalItems = store.schedulePlan.items;
    const originalDependencies = store.schedulePlan.dependencies;
    const toasts = [];
    store.showToast = (message) => toasts.push(message);
    console.warn = () => {};
    scheduleApi.updateScheduleItem = async () => {
      throw new Error("offline");
    };

    const item = await scheduleActions.moveScheduleItemToStatus.call(store, "si-existing", "doing");

    assert.equal(store.schedulePlan.items, originalItems);
    assert.equal(store.schedulePlan.dependencies, originalDependencies);
    assert.equal(item.status, "doing");
    assert.equal(store.schedulePlan.items[0].status, "doing");
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "failed");
    assert.deepEqual(toasts, ["后端服务未连接，请确认后端已启动后再同步"]);
  });

  it("moves node canvas pan without changing schedule items", () => {
    const store = createStore();
    const originalItems = store.schedulePlan.items;
    const originalSnapshot = structuredClone(originalItems);

    const panning = scheduleActions.moveScheduleNodePan.call(store, { dx: 120, dy: -36, isPanning: true });
    const released = scheduleActions.setScheduleNodePan.call(store, { isPanning: false });

    assert.equal(panning.x, 120);
    assert.equal(panning.y, -36);
    assert.equal(panning.isPanning, true);
    assert.equal(released.x, 120);
    assert.equal(released.y, -36);
    assert.equal(released.isPanning, false);
    assert.equal(store.schedulePlan.items, originalItems);
    assert.deepEqual(store.schedulePlan.items, originalSnapshot);
  });

  it("wires node canvas pointer pan into observable canvas state", async () => {
    const nodeView = await readFile(new URL("../../../../components/schedule/ScheduleNodeView.vue", import.meta.url), "utf8");
    const css = await readFile(new URL("../../../../styles/base.css", import.meta.url), "utf8");

    assert.match(nodeView, /class="schedule-node-canvas"/);
    assert.match(nodeView, /@pointerdown="startPan"/);
    assert.match(nodeView, /@pointermove="movePan"/);
    assert.match(nodeView, /@pointerup="endPan"/);
    assert.match(nodeView, /setPointerCapture/);
    assert.match(nodeView, /:data-pan-x="nodePan\.x"/);
    assert.match(nodeView, /:data-pan-y="nodePan\.y"/);
    assert.match(nodeView, /translate3d\(\$\{nodePan\.x\}px,\s*\$\{nodePan\.y\}px,\s*0\)/);
    assert.match(css, /\.schedule-node-canvas\s*\{[^}]*cursor:\s*grab/s);
    assert.match(css, /\.schedule-node-canvas\.is-panning\s*\{[^}]*cursor:\s*grabbing/s);
  });

  it("opens the floating schedule chat with target identifiers and comment metadata", () => {
    const store = createStore();

    const chat = scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      taskUid: "task-chat-001",
      comments: [{ id: "c-1", body: "mock comment" }],
      commentsCount: 1,
      x: 520,
      y: 140,
      width: 386,
      height: 556
    });

    assert.equal(chat.visible, true);
    assert.equal(chat.itemId, "si-existing");
    assert.equal(chat.taskUid, "task-chat-001");
    assert.equal(chat.targetId, "si-existing");
    assert.equal(chat.commentsCount, 1);
    assert.deepEqual(chat.comments, [{ id: "c-1", body: "mock comment" }]);
    assert.equal(chat.x, 520);
    assert.equal(chat.y, 140);
    assert.equal(chat.width, 386);
    assert.equal(chat.height, 556);
    assert.equal(store.scheduleUi.selectedItemId, "si-existing");
    assert.equal(store.scheduleUi.selectedTaskId, "task-chat-001");
  });

  it("moves and resizes the floating schedule chat without changing schedule items", () => {
    const store = createStore();
    scheduleActions.openScheduleChat.call(store, { itemId: "si-existing" });
    const itemsBefore = store.schedulePlan.items;

    const moved = scheduleActions.moveScheduleChat.call(store, { x: -40, y: 88.8 });
    const resized = scheduleActions.resizeScheduleChat.call(store, { width: 120, height: 900 });

    assert.equal(moved.x, 0);
    assert.equal(moved.y, 89);
    assert.equal(resized.width, 300);
    assert.equal(resized.height, 720);
    assert.equal(store.schedulePlan.items, itemsBefore);
  });

  it("closes the floating schedule chat while preserving its last target and geometry", () => {
    const store = createStore();
    scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      x: 640,
      y: 120,
      width: 390,
      height: 540
    });

    const chat = scheduleActions.closeScheduleChat.call(store);

    assert.equal(chat.visible, false);
    assert.equal(chat.itemId, "si-existing");
    assert.equal(chat.x, 640);
    assert.equal(chat.y, 120);
    assert.equal(chat.width, 390);
    assert.equal(chat.height, 540);
  });

  it("loads real schedule comments for persisted items and updates commentsCount", async () => {
    const store = createStore();
    scheduleApi.listScheduleItemComments = async (itemId) => ({
      comments: [
        {
          id: "c-100",
          content: "真实评论",
          userName: "张三",
          commentedAt: "2026/05/14 10:00"
        }
      ],
      commentsCount: 1
    });

    const chat = await scheduleActions.loadScheduleChatComments.call(store, "si-existing");

    assert.equal(chat.commentsSource, "api");
    assert.equal(chat.comments.length, 1);
    assert.equal(chat.comments[0].id, "c-100");
    assert.equal(chat.comments[0].authorName, "张三");
    assert.equal(chat.comments[0].createdAt, "2026/05/14 10:00");
    assert.equal(chat.commentsCount, 1);
    assert.equal(store.schedulePlan.items[0].commentsCount, 1);
  });

  it("loads linked task comments into schedule chat and the exact schedule item", async () => {
    const store = createStore();
    store.activeProject.tasks = [
      {
        id: 88,
        taskUid: "task-linked-88",
        title: "Linked task",
        comments: [
          {
            user: "Flow user",
            dept: "Flow dept",
            time: "2026/05/14 09:30",
            text: "Task comment should appear in schedule chat",
            tone: "pink"
          }
        ]
      },
      {
        id: 99,
        taskUid: "task-other-99",
        title: "Other task",
        comments: [{ user: "Other", time: "2026/05/14 09:31", text: "Do not leak this" }]
      }
    ];
    store.schedulePlan.items[0].taskUid = "task-linked-88";
    store.schedulePlan.items.push({
      id: "si-other",
      itemId: "si-other",
      taskUid: "task-other-99",
      title: "Other item",
      comments: [{ id: "old-other", content: "Other item comment" }],
      commentsCount: 1
    });
    scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      taskUid: "task-linked-88",
      comments: [{ id: "stale", content: "Stale chat should be replaced" }],
      commentsCount: 1
    });
    scheduleApi.listScheduleItemComments = async () => {
      throw new Error("schedule comments backend down");
    };
    console.warn = () => {};

    const chat = await scheduleActions.loadScheduleChatComments.call(store, "si-existing");

    assert.equal(chat.itemId, "si-existing");
    assert.equal(chat.taskUid, "task-linked-88");
    assert.equal(chat.commentsSource, "task");
    assert.equal(chat.commentsSyncStatus, "local");
    assert.equal(chat.comments.length, 1);
    assert.equal(chat.comments[0].content, "Task comment should appear in schedule chat");
    assert.equal(store.schedulePlan.items[0].comments.length, 1);
    assert.equal(store.schedulePlan.items[0].comments[0].content, "Task comment should appear in schedule chat");
    assert.equal(store.schedulePlan.items[0].commentsCount, 1);
    assert.equal(store.schedulePlan.items[1].comments[0].content, "Other item comment");
  });

  it("skips real comment loading for local items and keeps local chat fallback", async () => {
    const store = createStore();
    let called = false;
    scheduleApi.listScheduleItemComments = async () => {
      called = true;
      throw new Error("should not call local item");
    };

    const chat = await scheduleActions.loadScheduleChatComments.call(store, "si-local-1");

    assert.equal(called, false);
    assert.equal(chat.commentsSource, "local");
    assert.equal(chat.commentsSyncStatus, "local");
  });

  it("appends backend comments and increments the current item commentsCount", async () => {
    const store = createStore();
    scheduleApi.createScheduleItemComment = async (itemId, payload) => ({
      comment: {
        id: "c-101",
        itemId,
        content: payload.content,
        payload: payload.payload,
        authorName: "admin",
        createdAt: "2026/05/14 10:10"
      },
      commentsCount: 1
    });
    scheduleActions.openScheduleChat.call(store, { itemId: "si-existing" });

    const comment = await scheduleActions.createScheduleChatComment.call(store, "si-existing", {
      content: "新增真实评论",
      payload: { source: "chat" }
    });

    assert.equal(comment.id, "c-101");
    assert.equal(comment.syncStatus, "synced");
    assert.equal(store.scheduleUi.chat.comments.length, 1);
    assert.equal(store.scheduleUi.chat.commentsCount, 1);
    assert.equal(store.schedulePlan.items[0].commentsCount, 1);
  });

  it("keeps failed schedule chat sends on the exact schedule item without writing task comments", async () => {
    const store = createStore();
    store.activeProject.tasks = [
      {
        id: 88,
        taskUid: "task-linked-88",
        title: "Linked task",
        comments: []
      },
      {
        id: 99,
        taskUid: "task-other-99",
        title: "Other task",
        comments: []
      }
    ];
    store.schedulePlan.items[0].taskUid = "task-linked-88";
    store.schedulePlan.items.push({
      id: "si-other",
      itemId: "si-other",
      taskUid: "task-other-99",
      title: "Other item",
      comments: [],
      commentsCount: 0
    });
    scheduleApi.createScheduleItemComment = async () => {
      throw new Error("schedule comments backend down");
    };
    console.warn = () => {};
    scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      taskUid: "task-linked-88"
    });

    const comment = await scheduleActions.createScheduleChatComment.call(store, "si-existing", {
      content: "Schedule chat should be saved on both sides",
      payload: { taskUid: "task-linked-88" },
      authorName: "Schedule owner"
    });

    assert.equal(comment.syncStatus, "failed");
    assert.equal(store.scheduleUi.chat.comments.length, 1);
    assert.equal(store.scheduleUi.chat.comments[0].content, "Schedule chat should be saved on both sides");
    assert.equal(store.schedulePlan.items[0].comments.length, 1);
    assert.equal(store.schedulePlan.items[0].comments[0].content, "Schedule chat should be saved on both sides");
    assert.equal(store.schedulePlan.items[0].commentsCount, 1);
    assert.equal(store.schedulePlan.items[1].comments.length, 0);
    assert.equal(store.activeProject.tasks[0].comments.length, 0);
    assert.equal(store.activeProject.tasks[1].comments.length, 0);
  });

  it("increments commentsCount from existing item count when backend omits the count", async () => {
    const store = createStore();
    store.schedulePlan.items[0].commentsCount = 7;
    scheduleApi.createScheduleItemComment = async (itemId, payload) => ({
      comment: {
        id: "c-102",
        itemId,
        content: payload.content,
        userName: "admin",
        commentedAt: "2026/05/14 10:12"
      }
    });
    scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      comments: [],
      commentsCount: 7
    });

    await scheduleActions.createScheduleChatComment.call(store, "si-existing", {
      content: "后端未返回计数"
    });

    assert.equal(store.scheduleUi.chat.commentsCount, 8);
    assert.equal(store.schedulePlan.items[0].commentsCount, 8);
  });

  it("keeps local failed comments when backend comment create fails", async () => {
    const store = createStore();
    console.warn = () => {};
    scheduleApi.createScheduleItemComment = async () => {
      throw new Error("comment backend down");
    };
    scheduleActions.openScheduleChat.call(store, { itemId: "si-existing" });

    const comment = await scheduleActions.createScheduleChatComment.call(store, "si-existing", {
      content: "本地失败保留",
      payload: { source: "chat" }
    });

    assert.match(comment.id, /^comment-local-/);
    assert.equal(comment.content, "本地失败保留");
    assert.equal(comment.syncStatus, "failed");
    assert.equal(store.scheduleUi.chat.comments[0].syncStatus, "failed");
    assert.equal(store.scheduleUi.chat.commentsCount, 1);
    assert.equal(store.schedulePlan.items[0].commentsCount, 1);
  });

  it("keeps local failed comment but does not append linked task comments when schedule comment create returns 403", async () => {
    const store = createStore();
    console.warn = () => {};
    store.canComment = false;
    store.activeProject.tasks = [
      {
        id: 88,
        taskUid: "task-linked-88",
        title: "Linked task",
        comments: []
      }
    ];
    store.schedulePlan.items[0].taskUid = "task-linked-88";
    scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      taskUid: "task-linked-88"
    });
    scheduleApi.createScheduleItemComment = async () => {
      throw createHttpError(403, "Forbidden");
    };

    const comment = await scheduleActions.createScheduleChatComment.call(store, "si-existing", {
      content: "Readonly should not create task comments",
      payload: { taskUid: "task-linked-88" },
      authorName: "Readonly member"
    });

    assert.match(comment.id, /^comment-local-/);
    assert.equal(comment.syncStatus, "failed");
    assert.equal(store.scheduleUi.chat.comments.length, 1);
    assert.equal(store.scheduleUi.chat.commentsCount, 1);
    assert.equal(store.scheduleUi.chat.commentsSyncStatus, "failed");
    assert.equal(store.schedulePlan.items[0].comments?.length || 0, 1);
    assert.equal(store.schedulePlan.items[0].commentsCount || 0, 1);
  });

  it("does not append linked task comments when schedule comment create fails", async () => {
    const store = createStore();
    console.warn = () => {};
    store.activeProject.tasks = [
      {
        id: 88,
        taskUid: "task-linked-88",
        title: "Linked task",
        comments: []
      }
    ];
    store.schedulePlan.items[0].taskUid = "task-linked-88";
    scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      taskUid: "task-linked-88"
    });
    scheduleApi.createScheduleItemComment = async () => {
      throw new Error("schedule comments backend down");
    };

    const comment = await scheduleActions.createScheduleChatComment.call(store, "si-existing", {
      content: "Schedule failure should stay only in schedule chat",
      payload: { taskUid: "task-linked-88" },
      authorName: "Schedule owner"
    });

    assert.equal(comment.syncStatus, "failed");
    assert.equal(store.scheduleUi.chat.comments.length, 1);
    assert.equal(store.scheduleUi.chat.commentsSyncStatus, "failed");
    assert.equal(store.schedulePlan.items[0].comments.length, 1);
    assert.equal(store.activeProject.tasks[0].comments.length, 0);
  });

  it("creates a local schedule item, normalizes dates, and selects it immediately", async () => {
    const store = createStore();
    console.warn = () => {};
    scheduleApi.createScheduleItem = async () => {
      throw new Error("backend unavailable");
    };

    const item = await scheduleActions.createScheduleItemFromPayload.call(store, {
      id: "si-created",
      title: "视觉验收",
      module: "design",
      owner: "小木",
      startDate: "2026/05/28",
      endDate: "2026/05/24",
      status: "todo",
      progress: 35,
      note: "本地创建测试",
      addToTaskList: true,
      linkTask: true,
      linkFlow: false
    });

    assert.equal(item.id, "si-created");
    assert.equal(item.startDate, "2026/05/24");
    assert.equal(item.endDate, "2026/05/28");
    assert.equal(item.payload.note, "本地创建测试");
    assert.equal(item.payload.addToTaskList, true);
    assert.equal(store.schedulePlan.items[0].id, "si-created");
    assert.equal(store.scheduleUi.selectedItemId, "si-created");
    assert.equal(store.schedulePlan.summary.itemCount, 2);
    assert.equal(store.schedulePlan.summary.pendingCount, 2);
    assert.equal(store.schedulePlan.summary.doneCount, 0);
    assert.equal(store.schedulePlan.startDate, "2026/05/10");
    assert.equal(store.schedulePlan.endDate, "2026/05/28");
    assert.equal(store.scheduleUi.visibleStartDate, "2026/05/10");
    assert.equal(store.scheduleUi.visibleEndDate, "2026/05/28");
  });

  it("replaces an optimistic local item with the backend item after create succeeds", async () => {
    const store = createStore();
    scheduleApi.createScheduleItem = async (_projectId, item) => ({
      item: {
        ...item,
        id: "si-backend-001",
        itemId: "si-backend-001",
        taskUid: "task-backend-001",
        title: "后端回填排期",
        startDate: "2026/05/16",
        endDate: "2026/05/19"
      },
      task: {
        id: 1778677910671,
        taskUid: "task-backend-001",
        taskId: "task-backend-001",
        title: "后端回填排期",
        type: "排期"
      }
    });

    const item = await scheduleActions.createScheduleItemFromPayload.call(store, {
      title: "本地临时排期",
      module: "design",
      startDate: "2026/05/16",
      endDate: "2026/05/19",
      linkTask: true,
      linkFlow: true
    });

    assert.equal(item.id, "si-backend-001");
    assert.equal(store.schedulePlan.items[0].id, "si-backend-001");
    assert.equal(store.schedulePlan.items[0].itemId, "si-backend-001");
    assert.equal(store.schedulePlan.items[0].taskUid, "task-backend-001");
    assert.equal(store.scheduleUi.selectedItemId, "si-backend-001");
    assert.equal(store.scheduleUi.selectedTaskId, "task-backend-001");
    assert.equal(store.schedulePlan.items.some((entry) => String(entry.id).startsWith("si-local-")), false);
  });

  it("keeps the optimistic local item and marks syncStatus when backend create fails", async () => {
    const store = createStore();
    const toasts = [];
    store.showToast = (message) => toasts.push(message);
    console.warn = () => {};
    scheduleApi.createScheduleItem = async () => {
      throw new Error("create failed");
    };

    const item = await scheduleActions.createScheduleItemFromPayload.call(store, {
      title: "失败保留排期",
      module: "design",
      startDate: "2026/05/18",
      endDate: "2026/05/20"
    });

    assert.match(item.id, /^si-local-/);
    assert.equal(store.schedulePlan.items[0].id, item.id);
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "failed");
    assert.equal(store.scheduleUi.selectedItemId, item.id);
    assert.deepEqual(toasts, ["已本地保存，后端同步失败"]);
  });

  it("does not let a stale offline load overwrite a local schedule create", async () => {
    const store = createStore();
    const toasts = [];
    let releaseLoad;
    console.warn = () => {};
    store.showToast = (message) => toasts.push(message);
    scheduleApi.getProjectSchedule = async () => {
      await new Promise((resolve) => {
        releaseLoad = resolve;
      });
      throw new Error("schedule backend still unavailable");
    };
    scheduleApi.createScheduleItem = async () => {
      throw new Error("create failed");
    };

    const loadPromise = scheduleActions.loadScheduleForActiveProject.call(store);
    const item = await scheduleActions.createScheduleItemFromPayload.call(store, {
      title: "并发离线新建",
      module: "project",
      startDate: "2026/05/21",
      endDate: "2026/05/24"
    });
    releaseLoad();
    await loadPromise;

    assert.equal(store.schedulePlan.items[0].id, item.id);
    assert.equal(store.schedulePlan.items[0].title, "并发离线新建");
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "failed");
    assert.equal(store.scheduleUi.selectedItemId, item.id);
    assert.deepEqual(toasts, ["已本地保存，后端同步失败"]);
  });

  it("hydrates backend schedule loads with active project flow tasks", async () => {
    const store = createStore();
    store.activeProject.tasks = [
      {
        id: 501,
        title: "Flow standby task A",
        module: "project",
        startDate: "2026/05/11",
        endDate: "2026/05/12",
        scheduleStatus: "todo",
        archived: false
      },
      {
        id: 502,
        title: "Flow standby task B",
        module: "design",
        startDate: "2026/05/13",
        endDate: "2026/05/14",
        scheduleStatus: "doing",
        archived: false
      }
    ];
    scheduleApi.getProjectSchedule = async () => ({
      plan: {
        id: "sp-api-empty",
        projectId: 1003,
        startDate: "2026/05/10",
        endDate: "2026/05/20"
      },
      items: []
    });

    const loaded = await scheduleActions.loadScheduleForActiveProject.call(store);

    assert.equal(loaded, true);
    assert.equal(store.schedulePlan.projectId, 1003);
    assert.equal(store.schedulePlan.items.length, store.activeProject.tasks.length);
    assert.deepEqual(
      store.schedulePlan.items.map((item) => item.taskUid),
      ["501", "502"]
    );
    assert.deepEqual(
      store.schedulePlan.items.map((item) => item.title),
      ["Flow standby task A", "Flow standby task B"]
    );
  });

  it("hydrates task status, order, and comments into schedule when backend has no matching item", async () => {
    const store = createStore();
    store.activeProject.tasks = [
      {
        id: 601,
        title: "Ordered task A",
        module: "project",
        startDate: "2026/05/11",
        endDate: "2026/05/12",
        scheduleStatus: "review",
        sortOrder: 700,
        commentsCount: 5,
        comments: [{ id: "task-c-601", user: "Planner", time: "2026/05/15 10:00", text: "Task comment synced to schedule" }]
      },
      {
        id: 602,
        title: "Ordered task B",
        module: "design",
        startDate: "2026/05/13",
        endDate: "2026/05/14",
        status: "doing",
        sortOrder: 300,
        comments: []
      }
    ];
    scheduleApi.getProjectSchedule = async () => ({
      plan: {
        id: "sp-api-empty",
        projectId: 1003,
        startDate: "2026/05/10",
        endDate: "2026/05/20"
      },
      items: []
    });

    await scheduleActions.loadScheduleForActiveProject.call(store);

    assert.deepEqual(
      store.schedulePlan.items.map((item) => [item.taskUid, item.status, item.sortOrder, item.commentsCount]),
      [
        ["601", "review", 700, 5],
        ["602", "doing", 300, 0]
      ]
    );
    assert.equal(store.schedulePlan.items[0].comments[0].content, "Task comment synced to schedule");
    assert.equal(store.schedulePlan.summary.itemCount, 2);
    assert.equal(store.schedulePlan.summary.pendingCount, 2);
  });

  it("keeps string project ids when loading schedules and never calls the empty project schedule URL", async () => {
    const base = createStore();
    const store = {
      ...base,
      rootProjects: [
        {
          id: "project-uid-001",
          name: "String uid project",
          status: "active",
          startDate: "2026/05/10",
          endDate: "2026/05/20",
          tasks: []
        }
      ],
      projectGroups: [],
      activeProjectId: null,
      findProjectWithGroup: (projectId) => {
        const project = store.rootProjects.find((item) => item.id === projectId);
        return project ? { group: null, project, isRoot: true } : null;
      }
    };
    const requestedProjectIds = [];
    store.schedulePlan.projectId = "project-uid-001";
    Object.defineProperty(store, "activeProject", {
      get: () => store.rootProjects.find((project) => project.id === store.activeProjectId && project.status !== "archived") || null
    });
    scheduleApi.getProjectSchedule = async (projectId) => {
      requestedProjectIds.push(projectId);
      return {
        plan: {
          id: "sp-string",
          projectId,
          startDate: "2026/05/10",
          endDate: "2026/05/20"
        },
        items: []
      };
    };

    projectActions.jumpToSchedule.call(store, "project-uid-001");
    const loaded = await scheduleActions.loadScheduleForActiveProject.call(store);

    assert.equal(loaded, true);
    assert.equal(store.activeProjectId, "project-uid-001");
    assert.deepEqual(requestedProjectIds, ["project-uid-001"]);
    assert.equal(store.schedulePlan.projectId, "project-uid-001");
    assert.equal(requestedProjectIds.includes(undefined), false);
    assert.equal(requestedProjectIds.includes(""), false);
  });

  it("resolves activeProjectId to a real project before loading schedules", async () => {
    const base = createStore();
    const store = {
      ...base,
      activeProjectId: 999001,
      rootProjects: [
        {
          id: 999001,
          name: "Resolved active project",
          status: "active",
          startDate: "2026/05/10",
          endDate: "2026/05/20",
          tasks: []
        }
      ],
      projectGroups: []
    };
    Object.defineProperty(store, "allProjects", {
      get: () => [...store.rootProjects, ...store.projectGroups.flatMap((group) => group.projects || [])]
    });
    Object.defineProperty(store, "activeProject", {
      get: () => null
    });
    const requestedProjectIds = [];
    store.schedulePlan.projectId = "";
    scheduleApi.getProjectSchedule = async (projectId) => {
      requestedProjectIds.push(projectId);
      return {
        plan: {
          id: "sp-resolved",
          projectId,
          startDate: "2026/05/10",
          endDate: "2026/05/20"
        },
        items: []
      };
    };

    const loaded = await scheduleActions.loadScheduleForActiveProject.call(store);

    assert.equal(loaded, true);
    assert.deepEqual(requestedProjectIds, [999001]);
    assert.equal(requestedProjectIds.includes("schedule"), false);
    assert.equal(requestedProjectIds.includes(""), false);
    assert.equal(store.schedulePlan.projectId, 999001);
  });

  it("clears the previous project schedule before loading a different active project", async () => {
    const store = createStore();
    let releaseLoad;
    console.warn = () => {};
    store.activeProject = {
      id: 2004,
      name: "Second project",
      startDate: "2026/06/01",
      endDate: "2026/06/10",
      tasks: [
        {
          id: 901,
          title: "Second project flow task",
          module: "aigc",
          startDate: "2026/06/02",
          endDate: "2026/06/03",
          archived: false
        }
      ]
    };
    scheduleApi.getProjectSchedule = async () => {
      await new Promise((resolve) => {
        releaseLoad = resolve;
      });
      throw new Error("schedule backend unavailable");
    };

    const loadPromise = scheduleActions.loadScheduleForActiveProject.call(store);

    assert.equal(store.schedulePlan.projectId, 2004);
    assert.equal(store.schedulePlan.items.some((item) => item.projectId === 1003), false);
    assert.deepEqual(store.schedulePlan.items.map((item) => item.taskUid), ["901"]);

    releaseLoad();
    await loadPromise;

    assert.equal(store.schedulePlan.projectId, 2004);
    assert.deepEqual(store.schedulePlan.items.map((item) => item.taskUid), ["901"]);
  });

  it("loads the newly selected project immediately when selecting from the tree while already in schedule", async () => {
    const base = createStore();
    const calls = [];
    const store = {
      ...base,
      activeSection: "schedule",
      activeProjectId: 1003,
      rootProjects: [],
      projectGroups: [
        {
          id: "group-1",
          title: "Project group",
          projects: [
            {
              id: 1003,
              name: "First project",
              status: "active",
              startDate: "2026/05/10",
              endDate: "2026/05/20",
              tasks: []
            },
            {
              id: 2004,
              name: "Second project",
              status: "active",
              startDate: "2026/06/01",
              endDate: "2026/06/10",
              tasks: [
                {
                  id: 901,
                  title: "Second project flow task",
                  module: "aigc",
                  startDate: "2026/06/02",
                  endDate: "2026/06/03",
                  archived: false
                }
              ]
            }
          ]
        }
      ],
      findProjectWithGroup: coreActions.findProjectWithGroup,
      loadScheduleForActiveProject() {
        calls.push(this.activeProjectId);
        return scheduleActions.loadScheduleForActiveProject.call(this);
      }
    };
    Object.defineProperties(store, {
      allProjects: {
        get: () => [...store.rootProjects, ...store.projectGroups.flatMap((group) => group.projects || [])]
      },
      activeProject: {
        get: () => store.allProjects.find((project) => project.id === store.activeProjectId && project.status !== "archived") || null
      }
    });
    let requestedProjectId = null;
    let releaseLoad;
    console.warn = () => {};
    scheduleApi.getProjectSchedule = async (projectId) => {
      requestedProjectId = projectId;
      await new Promise((resolve) => {
        releaseLoad = resolve;
      });
      throw new Error("schedule backend unavailable");
    };

    const result = coreActions.selectProject.call(store, 2004);

    assert.equal(result, true);
    assert.equal(store.activeProjectId, 2004);
    assert.deepEqual(calls, [2004]);
    assert.equal(requestedProjectId, 2004);
    assert.equal(store.schedulePlan.projectId, 2004);
    assert.equal(store.schedulePlan.items.some((item) => item.projectId === 1003), false);
    assert.deepEqual(store.schedulePlan.items.map((item) => item.taskUid), ["901"]);

    releaseLoad();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(store.schedulePlan.projectId, 2004);
    assert.deepEqual(store.schedulePlan.items.map((item) => item.taskUid), ["901"]);
  });

  it("keeps local schedule creates when a later reload falls back offline", async () => {
    const store = createStore();
    console.warn = () => {};
    scheduleApi.createScheduleItem = async () => {
      throw new Error("create failed");
    };
    scheduleApi.getProjectSchedule = async () => {
      throw new Error("schedule backend unavailable");
    };

    const item = await scheduleActions.createScheduleItemFromPayload.call(store, {
      title: "Local create survives reload fallback",
      module: "project",
      startDate: "2026/05/21",
      endDate: "2026/05/24"
    });

    await scheduleActions.loadScheduleForActiveProject.call(store);

    assert.equal(store.schedulePlan.projectId, 1003);
    assert.equal(store.schedulePlan.items.some((entry) => entry.id === item.id), true);
    assert.equal(
      store.schedulePlan.items.find((entry) => entry.id === item.id).payload.syncStatus,
      "failed"
    );
  });

  it("keeps local schedule chat comments and existing linked task comments when reload falls back offline", async () => {
    const store = createStore();
    console.warn = () => {};
    store.activeProject.tasks = [
      {
        id: 88,
        taskUid: "task-linked-88",
        title: "Linked task",
        startDate: "2026/05/11",
        endDate: "2026/05/12",
        scheduleStatus: "todo",
        comments: [{ id: "task-c-existing", user: "Task user", time: "2026/05/15 09:00", text: "Existing task comment" }]
      }
    ];
    store.schedulePlan.items[0].taskUid = "task-linked-88";
    scheduleApi.createScheduleItemComment = async () => {
      throw new Error("schedule comments backend down");
    };
    scheduleApi.getProjectSchedule = async () => {
      throw new Error("schedule backend unavailable");
    };
    scheduleActions.openScheduleChat.call(store, {
      itemId: "si-existing",
      taskUid: "task-linked-88"
    });

    await scheduleActions.createScheduleChatComment.call(store, "si-existing", {
      content: "Local schedule chat survives reload",
      payload: { taskUid: "task-linked-88" },
      authorName: "Schedule owner"
    });
    await scheduleActions.loadScheduleForActiveProject.call(store);
    const chat = await scheduleActions.loadScheduleChatComments.call(store, "si-existing");

    assert.equal(chat.comments.some((comment) => comment.content === "Existing task comment"), true);
    assert.equal(chat.comments.some((comment) => comment.content === "Local schedule chat survives reload"), true);
    assert.equal(store.schedulePlan.items[0].comments.some((comment) => comment.content === "Local schedule chat survives reload"), true);
    assert.equal(store.activeProject.tasks[0].comments.some((comment) => comment.text === "Existing task comment"), true);
    assert.equal(store.activeProject.tasks[0].comments.some((comment) => comment.text === "Local schedule chat survives reload"), false);
  });

  it("updates a schedule item locally and hydrates it with the backend item after update succeeds", async () => {
    const store = createStore();
    scheduleApi.updateScheduleItem = async (_itemId, item) => ({
      item: {
        ...item,
        id: "si-existing",
        itemId: "si-existing",
        taskUid: "task-updated-001",
        title: "后端确认标题",
        progress: 82,
        note: "后端备注"
      }
    });

    const item = await scheduleActions.updateScheduleItem.call(store, "si-existing", {
      title: "本地编辑标题",
      module: "design",
      owner: "AG1",
      startDate: "2026/05/18",
      endDate: "2026/05/22",
      status: "doing",
      progress: 60,
      note: "本地备注",
      linkTask: true,
      linkFlow: true
    });

    assert.equal(item.id, "si-existing");
    assert.equal(store.schedulePlan.items[0].title, "后端确认标题");
    assert.equal(store.schedulePlan.items[0].progress, 82);
    assert.equal(store.schedulePlan.items[0].taskUid, "task-updated-001");
    assert.equal(store.schedulePlan.items[0].payload.note, "后端备注");
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "synced");
    assert.equal(store.schedulePlan.summary.pendingCount, 1);
  });

  it("creates a real schedule item when updating fallback task rows instead of PUTing task ids", async () => {
    const store = createStore();
    const calls = [];
    const toasts = [];
    store.showToast = (message) => toasts.push(message);
    store.activeProject.tasks = [
      {
        id: "task-1",
        taskUid: "task-1",
        title: "Fallback flow task",
        module: "project",
        startDate: "2026/05/11",
        endDate: "2026/05/12",
        scheduleStatus: "todo",
        comments: []
      }
    ];
    store.schedulePlan.items = [
      {
        id: "task-task-1",
        itemId: "task-task-1",
        projectId: 1003,
        planId: "sp-test",
        type: "task",
        title: "Fallback flow task",
        module: "project",
        startDate: "2026/05/11",
        endDate: "2026/05/12",
        status: "todo",
        progress: 0,
        taskUid: "task-1",
        linkTask: true,
        linkFlow: true,
        payload: { source: "taskFallback" }
      }
    ];
    scheduleApi.updateScheduleItem = async (itemId) => {
      calls.push(["update", itemId]);
      throw new Error("should not update fallback task ids");
    };
    scheduleApi.createScheduleItem = async (projectId, item) => {
      calls.push(["create", projectId, item.id, item.itemId, item.payload?.clientItemId]);
      return {
        item: {
          ...item,
          id: "si-real-001",
          itemId: "si-real-001",
          scheduleItemId: "si-real-001",
          workItemId: "si-real-001",
          projectId,
          taskUid: "task-1",
          title: "Edited fallback task",
          status: "doing"
        }
      };
    };

    const item = await scheduleActions.updateScheduleItem.call(store, "task-task-1", {
      title: "Edited fallback task",
      status: "doing",
      progress: 55
    });

    assert.equal(item.id, "si-real-001");
    assert.equal(store.schedulePlan.items[0].id, "si-real-001");
    assert.equal(store.schedulePlan.items[0].itemId, "si-real-001");
    assert.equal(store.schedulePlan.items[0].taskUid, "task-1");
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "synced");
    assert.deepEqual(calls, [["create", 1003, "", "", "task-task-1"]]);
    assert.equal(toasts.some((message) => String(message).includes("同步失败")), false);
  });

  it("keeps local schedule edits and marks syncStatus when backend update fails", async () => {
    const store = createStore();
    const toasts = [];
    store.showToast = (message) => toasts.push(message);
    console.warn = () => {};
    scheduleApi.updateScheduleItem = async () => {
      throw new Error("update failed");
    };

    const item = await scheduleActions.updateScheduleItem.call(store, "si-existing", {
      title: "失败但保留编辑",
      startDate: "2026/05/12",
      endDate: "2026/05/18",
      status: "review",
      progress: 50,
      note: "失败备注"
    });

    assert.equal(item.title, "失败但保留编辑");
    assert.equal(store.schedulePlan.items[0].title, "失败但保留编辑");
    assert.equal(store.schedulePlan.items[0].payload.note, "失败备注");
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "failed");
    assert.deepEqual(toasts, ["已本地保存，后端同步失败"]);
  });

  it("updates schedule dates locally and syncs linked task dates without replacing unrelated data", async () => {
    const store = createStore();
    const originalItems = store.schedulePlan.items;
    const originalDependencies = store.schedulePlan.dependencies;
    const linkedTask = {
      id: 88,
      title: "linked task",
      startDate: "2026/05/11",
      endDate: "2026/05/16"
    };
    store.activeProject.tasks.push(linkedTask);
    store.schedulePlan.items[0].taskUid = "88";
    scheduleApi.updateScheduleItem = async () => {
      throw new Error("offline");
    };
    console.warn = () => {};

    const item = await scheduleActions.updateScheduleItemDates.call(store, "si-existing", {
      startDate: "2026/05/13",
      endDate: "2026/05/18"
    });

    assert.equal(store.schedulePlan.items, originalItems);
    assert.equal(store.schedulePlan.dependencies, originalDependencies);
    assert.equal(item.startDate, "2026/05/13");
    assert.equal(item.endDate, "2026/05/18");
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "failed");
    assert.equal(linkedTask.startDate, "2026/05/13");
    assert.equal(linkedTask.endDate, "2026/05/18");
  });

  it("creates persisted schedule items for local drag edits instead of PUTing local ids", async () => {
    const store = createStore();
    const calls = [];
    store.schedulePlan.items = [
      {
        id: "si-local-drag",
        itemId: "si-local-drag",
        projectId: 1003,
        planId: "sp-test",
        type: "schedule",
        title: "Local drag item",
        module: "project",
        startDate: "2026/05/10",
        endDate: "2026/05/11",
        status: "todo",
        progress: 10,
        payload: { syncStatus: "failed" }
      }
    ];
    scheduleApi.updateScheduleItem = async (itemId) => {
      calls.push(["update", itemId]);
      throw new Error("should not PUT local ids");
    };
    scheduleApi.createScheduleItem = async (projectId, item) => {
      calls.push([
        "create",
        projectId,
        item.id,
        item.itemId,
        item.scheduleItemId,
        item.workItemId,
        item.payload?.clientItemId,
        item.source,
        item.interaction,
        item.payload?.source,
        item.payload?.interaction
      ]);
      return {
        item: {
          ...item,
          id: "si-real-drag",
          itemId: "si-real-drag",
          scheduleItemId: "si-real-drag",
          workItemId: "si-real-drag",
          projectId
        }
      };
    };

    const item = await scheduleActions.updateScheduleItemDates.call(store, "si-local-drag", {
      startDate: "2026/05/12",
      endDate: "2026/05/18"
    }, "move");

    assert.equal(item.id, "si-real-drag");
    assert.equal(store.schedulePlan.items[0].id, "si-real-drag");
    assert.deepEqual(calls, [
      [
        "create",
        1003,
        "",
        "",
        "",
        "",
        "si-local-drag",
        "schedule-drag",
        "move",
        "schedule-drag",
        "move"
      ]
    ]);
  });

  it("sends schedule drag source and interaction when resizing dates", async () => {
    const store = createStore();
    const calls = [];
    scheduleApi.updateScheduleItem = async (itemId, item) => {
      calls.push([itemId, item]);
      return { item };
    };

    const item = await scheduleActions.updateScheduleItemDates.call(store, "si-existing", {
      startDate: "2026/05/12",
      endDate: "2026/05/23"
    }, "resize-end");

    assert.equal(item.startDate, "2026/05/12");
    assert.equal(item.endDate, "2026/05/23");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "si-existing");
    assert.equal(calls[0][1].source, "schedule-drag");
    assert.equal(calls[0][1].interaction, "resize-end");
    assert.equal(calls[0][1].payload.source, "schedule-drag");
    assert.equal(calls[0][1].payload.interaction, "resize-end");
    assert.equal(calls[0][1].scheduleItemId, "si-existing");
    assert.equal(calls[0][1].itemId, "si-existing");
  });

  it("syncs linked task date changes with schedule drag metadata", async () => {
    const store = createStore();
    const calls = [];
    globalThis.window = {};
    store.activeProject.projectId = "project-uid-1003";
    const linkedTask = {
      id: 88,
      taskUid: "task-backend-88",
      title: "linked task",
      startDate: "2026/05/11",
      endDate: "2026/05/16"
    };
    store.activeProject.tasks.push(linkedTask);
    store.schedulePlan.items[0].taskUid = "task-backend-88";
    scheduleApi.updateScheduleItem = async (_itemId, item) => ({ item });
    workspaceApi.updateTask = async (taskId, payload) => {
      calls.push([taskId, payload]);
      return { ok: true };
    };

    await scheduleActions.updateScheduleItemDates.call(store, "si-existing", {
      startDate: "2026/05/13",
      endDate: "2026/05/18"
    }, "move");
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(calls, [
      [
        "task-backend-88",
        {
          projectId: "project-uid-1003",
          startDate: "2026/05/13",
          endDate: "2026/05/18",
          source: "schedule-drag",
          interaction: "move"
        }
      ]
    ]);
  });

  it("confirms the selected toolbar item locally before backend sync", async () => {
    const store = createStore();
    const toasts = [];
    store.scheduleUi.selectedItemId = "si-existing";
    store.showToast = (message) => toasts.push(message);
    scheduleApi.updateScheduleItem = async (_itemId, item) => ({
      item: {
        ...item,
        id: "si-existing",
        itemId: "si-existing"
      }
    });

    const item = await scheduleActions.confirmSelectedScheduleItem.call(store);

    assert.equal(item.status, "done");
    assert.equal(item.progress, 100);
    assert.equal(store.schedulePlan.items[0].status, "done");
    assert.equal(store.schedulePlan.items[0].progress, 100);
    assert.equal(store.schedulePlan.summary.doneCount, 1);
    assert.equal(toasts.at(-1), "已确认选中排期");
  });

  it("auto-saves new schedule rows into the active schedule template", async () => {
    const store = createStore();
    const calls = [];
    globalThis.window = {};
    store.activeView = "schedule-template";
    store.activeSection = "schedule";
    store.activeTemplateGroupIndex = 0;
    store.activeTemplateChildIndex = 0;
    store.templates = [
      {
        id: "schedule-group-1",
        templateId: "schedule-group-1",
        title: "Schedule templates",
        kind: "schedule",
        children: ["Template A"],
        templateIds: { "Template A": "schedule-template-1" },
        templateSchedules: {
          "Template A": {
            title: "Template A",
            items: [],
            dependencies: [],
            viewConfig: { defaultView: "timeline", dayWidth: 28, rowHeight: 34 },
            summary: {}
          }
        },
        templateTasks: {}
      }
    ];
    store.schedulePlan = {
      title: "Template A",
      items: [],
      dependencies: [],
      viewConfig: { defaultView: "timeline", dayWidth: 28, rowHeight: 34 },
      summary: {}
    };
    Object.defineProperties(store, {
      activeTemplate: {
        configurable: true,
        get() {
          return this.templates[Number(this.activeTemplateGroupIndex)] || null;
        }
      },
      activeTemplateName: {
        configurable: true,
        get() {
          return this.activeTemplate?.children?.[Number(this.activeTemplateChildIndex)] || "";
        }
      }
    });
    store.findTemplate = function findTemplate(name) {
      const childIndex = this.templates[0].children.indexOf(name);
      return childIndex === -1 ? null : { group: this.templates[0], groupIndex: 0, childIndex };
    };
    store.saveScheduleTemplate = function saveScheduleTemplate(templateName, schedulePlan) {
      const found = this.findTemplate(templateName);
      found.group.templateSchedules[templateName] = structuredClone(schedulePlan);
      workspaceApi.updateTemplate(found.group.templateIds[templateName], {
        title: templateName,
        kind: "schedule",
        template: found.group.templateSchedules[templateName]
      });
      return true;
    };
    scheduleApi.createScheduleItem = async () => {
      throw new Error("template rows must not use project schedule APIs");
    };
    workspaceApi.updateTemplate = async (templateId, payload) => {
      calls.push([templateId, payload]);
      return { template: { id: templateId, ...payload } };
    };

    const item = await scheduleActions.createScheduleItemFromPayload.call(store, {
      title: "Template row",
      module: "aigc",
      startDate: "2026/05/12",
      endDate: "2026/05/13"
    });

    assert.equal(item.title, "Template row");
    assert.equal(store.schedulePlan.items.length, 1);
    assert.deepEqual(store.templates[0].templateSchedules["Template A"].items, store.schedulePlan.items);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "schedule-template-1");
    assert.deepEqual(calls[0][1].template.items, store.schedulePlan.items);
  });

  it("shows feedback instead of doing nothing when toolbar confirm has no selected item", async () => {
    const store = createStore();
    const toasts = [];
    store.scheduleUi.selectedItemId = "";
    store.showToast = (message) => toasts.push(message);

    const result = await scheduleActions.confirmSelectedScheduleItem.call(store);

    assert.equal(result, false);
    assert.deepEqual(toasts, ["请先选择一个排期项"]);
  });

  it("creates a local toolbar snapshot without backend access", () => {
    const store = createStore();
    const toasts = [];
    store.showToast = (message) => toasts.push(message);

    const snapshot = scheduleActions.createLocalScheduleSnapshot.call(store, "toolbar");

    assert.match(snapshot.id, /^snapshot-local-/);
    assert.equal(snapshot.source, "local");
    assert.equal(snapshot.itemCount, 1);
    assert.equal(store.schedulePlan.snapshots.length, 1);
    assert.equal(store.schedulePlan.snapshots[0].id, snapshot.id);
    assert.equal(toasts.at(-1), "已创建本地快照");
  });

  it("opens schedule row edit and chat actions through explicit row handlers", async () => {
    const store = createStore();
    const calls = [];
    scheduleApi.deleteScheduleItem = async () => ({ ok: true });
    store.openScheduleEdit = (item) => calls.push(["edit", item.id]);
    store.openScheduleChat = (payload) => calls.push(["chat", payload.itemId]);
    store.deleteScheduleItem = (itemId) => scheduleActions.deleteScheduleItem.call(store, itemId);
    store.confirmScheduleDelete = async (item) => {
      calls.push(["delete", item.id]);
      return store.deleteScheduleItem(item.id);
    };

    assert.equal(scheduleActions.handleScheduleRowAction.call(store, "edit", store.schedulePlan.items[0]), true);
    assert.equal(scheduleActions.handleScheduleRowAction.call(store, "chat", store.schedulePlan.items[0]), true);
    assert.equal(await scheduleActions.handleScheduleRowAction.call(store, "delete", store.schedulePlan.items[0]), true);

    assert.deepEqual(calls, [
      ["edit", "si-existing"],
      ["chat", "si-existing"],
      ["delete", "si-existing"]
    ]);
    assert.equal(store.schedulePlan.items.length, 0);
  });

  it("removes a schedule item locally after backend delete succeeds", async () => {
    const store = createStore();
    scheduleApi.deleteScheduleItem = async () => ({ ok: true });

    const result = await scheduleActions.deleteScheduleItem.call(store, "si-existing");

    assert.equal(result, true);
    assert.equal(store.schedulePlan.items.length, 0);
    assert.equal(store.schedulePlan.summary.itemCount, 0);
  });

  it("does not call backend delete for local-only schedule items", async () => {
    const store = createStore();
    let deleteCalled = false;
    store.schedulePlan.items[0] = {
      ...store.schedulePlan.items[0],
      id: "si-local-1",
      itemId: "si-local-1",
      scheduleItemId: "",
      workItemId: "",
      payload: { source: "local" }
    };
    scheduleApi.deleteScheduleItem = async () => {
      deleteCalled = true;
      throw new Error("should not delete local-only item");
    };

    const result = await scheduleActions.deleteScheduleItem.call(store, "si-local-1");

    assert.equal(result, true);
    assert.equal(deleteCalled, false);
    assert.equal(store.schedulePlan.items.length, 0);
  });

  it("restores a schedule item and marks deleteFailed when backend delete fails", async () => {
    const store = createStore();
    const toasts = [];
    store.showToast = (message) => toasts.push(message);
    console.warn = () => {};
    scheduleApi.deleteScheduleItem = async () => {
      throw new Error("delete failed");
    };

    const result = await scheduleActions.deleteScheduleItem.call(store, "si-existing");

    assert.equal(result, false);
    assert.equal(store.schedulePlan.items.length, 1);
    assert.equal(store.schedulePlan.items[0].id, "si-existing");
    assert.equal(store.schedulePlan.items[0].payload.syncStatus, "deleteFailed");
    assert.deepEqual(toasts, ["删除同步失败，已恢复本地排期"]);
  });
});
