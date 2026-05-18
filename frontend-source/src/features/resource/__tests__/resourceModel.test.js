import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentAdviceFallbackMessage,
  applyAssignmentResult,
  applyAssignmentWorkspaceSync,
  buildAssignmentLinkFields,
  buildAssignmentApiPayload,
  buildLocalResourceSnapshot,
  canUseResourceView,
  createAssignmentPreview,
  formatResourceApiFeedback,
  getDefaultResourceView,
  resolveResourceRole
} from "../resourceModel.js";
import { createResourceApi } from "../../../services/resourceApi.js";

function createClient() {
  const calls = [];
  return {
    calls,
    get(url) {
      calls.push(["get", url]);
      return Promise.resolve({ ok: true });
    },
    post(url, payload) {
      calls.push(["post", url, payload]);
      return Promise.resolve({ ok: true });
    },
    patch(url, payload) {
      calls.push(["patch", url, payload]);
      return Promise.resolve({ ok: true });
    }
  };
}

function createStoreLike(overrides = {}) {
  const users = [
    { id: "u-admin", name: "管理员", role: "admin", department: "项目管理部" },
    { id: "u-manager", name: "设计负责人", role: "department_manager", department: "美术设计部" },
    { id: "u-employee", name: "安娜", role: "employee", department: "美术设计部" },
    { id: "u-other", name: "后期同学 A", role: "user", department: "后期合成部" }
  ];
  const rootProjects = [
    {
      id: 1001,
      name: "品牌片 A",
      group: "客户项目",
      status: "active",
      members: ["设计负责人", "安娜", "后期同学 A"],
      memberRoles: { "设计负责人": "manager", "安娜": "editor", "后期同学 A": "readonly" },
      startDate: "2026/05/10",
      endDate: "2026/05/24",
      tasks: [
        {
          id: 1,
          title: "主视觉设计",
          module: "design",
          owner: "美术设计部: 安娜",
          startDate: "2026/05/10",
          endDate: "2026/05/14",
          scheduleStatus: "doing",
          progress: 60,
          archived: false
        },
        {
          id: 2,
          title: "成片精修",
          module: "post",
          owner: "后期合成部: 后期同学 A",
          startDate: "2026/05/12",
          endDate: "2026/05/20",
          scheduleStatus: "todo",
          progress: 20,
          archived: false
        }
      ]
    }
  ];
  return {
    users,
    currentUserId: "u-admin",
    currentUser: users[0],
    rootProjects,
    projectGroups: [],
    allProjects: rootProjects,
    activeProjectId: 1001,
    isManagementUser: false,
    ...overrides
  };
}

describe("resourceModel permissions", () => {
  it("resolves company, department, project and self roles from user/store data", () => {
    const store = createStoreLike();

    assert.equal(resolveResourceRole({ role: "super_admin" }, store).scope, "company");
    assert.equal(resolveResourceRole({ role: "admin" }, store).scope, "company");
    assert.equal(resolveResourceRole({ role: "department_admin", department: "美术设计部" }, store).scope, "department");
    assert.equal(resolveResourceRole({ role: "department_manager", department: "美术设计部" }, store).scope, "department");
    assert.equal(resolveResourceRole({ role: "project_manager" }, store).scope, "project");
    assert.equal(resolveResourceRole({ role: "employee", id: "u-employee" }, store).scope, "self");
    assert.equal(resolveResourceRole({ role: "user", id: "u-employee" }, { ...store, isManagementUser: true }).scope, "project");
  });

  it("maps permissions to default views and checks scoped view access", () => {
    const company = resolveResourceRole({ role: "admin", id: "u-admin" }, createStoreLike());
    const department = resolveResourceRole({ role: "department_manager", id: "u-manager", department: "美术设计部" }, createStoreLike());
    const self = resolveResourceRole({ role: "employee", id: "u-employee", department: "美术设计部" }, createStoreLike());

    assert.equal(getDefaultResourceView(company), "company");
    assert.equal(getDefaultResourceView(department), "department");
    assert.equal(getDefaultResourceView(self), "self");
    assert.equal(canUseResourceView(company, "company"), true);
    assert.equal(canUseResourceView(department, "company"), false);
    assert.equal(canUseResourceView(department, "department", { department: "美术设计部" }), true);
    assert.equal(canUseResourceView(department, "department", { department: "后期合成部" }), false);
    assert.equal(canUseResourceView(self, "self", { personId: "u-employee" }), true);
    assert.equal(canUseResourceView(self, "self", { personId: "u-other" }), false);
  });
});

describe("buildLocalResourceSnapshot", () => {
  it("builds a complete company snapshot from workspace-like data", () => {
    const snapshot = buildLocalResourceSnapshot(createStoreLike());

    assert.equal(snapshot.resourcePermissions.scope, "company");
    assert.equal(snapshot.scope.type, "company");
    assert.deepEqual(snapshot.people.map((person) => person.name), ["管理员", "设计负责人", "安娜", "后期同学 A"]);
    assert.deepEqual(snapshot.workItems.map((item) => item.title), ["主视觉设计", "成片精修"]);
    assert.equal(snapshot.availability.length, snapshot.people.length);
    assert.equal(snapshot.stats.totalPeople, 4);
    assert.equal(snapshot.stats.totalWorkItems, 2);
    assert.equal(snapshot.stats.assignedWorkItems, 2);
    assert.deepEqual(snapshot.dateRange, { startDate: "2026/05/10", endDate: "2026/05/24" });
  });

  it("filters department managers to their own department", () => {
    const store = createStoreLike({
      currentUserId: "u-manager",
      currentUser: { id: "u-manager", name: "设计负责人", role: "department_manager", department: "美术设计部" }
    });

    const snapshot = buildLocalResourceSnapshot(store);

    assert.equal(snapshot.resourcePermissions.scope, "department");
    assert.equal(snapshot.scope.department, "美术设计部");
    assert.deepEqual(snapshot.people.map((person) => person.name), ["设计负责人", "安娜"]);
    assert.deepEqual(snapshot.workItems.map((item) => item.title), ["主视觉设计"]);
  });

  it("filters employees to themselves and their own assignments", () => {
    const store = createStoreLike({
      currentUserId: "u-employee",
      currentUser: { id: "u-employee", name: "安娜", role: "employee", department: "美术设计部" }
    });

    const snapshot = buildLocalResourceSnapshot(store);

    assert.equal(snapshot.resourcePermissions.scope, "self");
    assert.deepEqual(snapshot.people.map((person) => person.name), ["安娜"]);
    assert.deepEqual(snapshot.workItems.map((item) => item.title), ["主视觉设计"]);
  });

  it("uses local fallback people and tasks when store data is sparse", () => {
    const snapshot = buildLocalResourceSnapshot({ currentUser: { id: "u-admin", role: "admin", name: "管理员" } });
    const names = snapshot.people.map((person) => person.name);
    const titles = snapshot.workItems.map((item) => item.title);

    assert.ok(names.includes("设计负责人"));
    assert.ok(names.includes("朱敏"));
    assert.ok(names.includes("后期同学 A"));
    assert.ok(names.includes("安娜"));
    assert.ok(titles.length >= 4);
    assert.equal(snapshot.departments.length > 0, true);
    assert.equal(snapshot.stats.totalPeople >= 4, true);
  });

  it("keeps the current self user visible when sparse store data has no user list", () => {
    const snapshot = buildLocalResourceSnapshot({
      currentUserId: "u-lilei",
      currentUser: { id: "u-lilei", name: "李雷", role: "employee", department: "动效设计部" }
    });

    assert.equal(snapshot.resourcePermissions.scope, "self");
    assert.deepEqual(snapshot.people.map((person) => person.name), ["李雷"]);
  });
});

describe("assignment preview helpers", () => {
  it("previews overload conflicts and applies the chosen assignee without mutating the source snapshot", () => {
    const snapshot = buildLocalResourceSnapshot(createStoreLike());
    const target = snapshot.workItems.find((item) => item.title === "主视觉设计");
    const preview = createAssignmentPreview(snapshot, {
      workItemId: target.id,
      assigneeId: "u-other",
      startDate: "2026/05/13",
      endDate: "2026/05/21"
    });

    assert.equal(preview.allowed, true);
    assert.equal(preview.assignee.name, "后期同学 A");
    assert.equal(preview.conflicts.some((conflict) => conflict.type === "overlap"), true);

    const updated = applyAssignmentResult(snapshot, preview, "u-other");
    const updatedItem = updated.workItems.find((item) => item.id === target.id);

    assert.equal(updatedItem.assigneeId, "u-other");
    assert.equal(updatedItem.assigneeName, "后期同学 A");
    assert.equal(snapshot.workItems.find((item) => item.id === target.id).assigneeName, "安娜");
  });
});

describe("resourceApi", () => {
  it("wraps resource and workload endpoints with query serialization", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await api.getResources({ scope: "department", department: "美术设计部", includeArchived: false });
    await api.getWorkload({ startDate: "2026/05/10", endDate: "2026/05/20" });
    await api.previewAssignment({ workItemId: "task-1", assigneeId: "u-1" });
    await api.confirmAssignment({ previewId: "p-1" });
    await api.analyzeAssignment({ taskUid: "task-1", candidates: [] });
    await api.rescheduleWorkItem({ workItemId: "work-1", interaction: "resize-end", startDate: "2026/05/10", endDate: "2026/05/22" });
    await api.forceConfirmAssignment({ previewId: "p-1", reason: "经理确认" });

    assert.deepEqual(client.calls, [
      ["get", "/workspace/resources?scope=department&department=%E7%BE%8E%E6%9C%AF%E8%AE%BE%E8%AE%A1%E9%83%A8&includeArchived=false"],
      ["get", "/workspace/workload?startDate=2026%2F05%2F10&endDate=2026%2F05%2F20"],
      ["post", "/workspace/assignments/preview", { workItemId: "task-1", assigneeId: "u-1" }],
      ["post", "/workspace/assignments/confirm", { previewId: "p-1" }],
      ["post", "/workspace/resources/ai/assignment-advice", { taskUid: "task-1", candidates: [] }],
      ["patch", "/workspace/resources/work-items/work-1/schedule", { workItemId: "work-1", interaction: "resize-end", startDate: "2026/05/10", endDate: "2026/05/22" }],
      ["post", "/workspace/assignments/force-confirm", { previewId: "p-1", reason: "经理确认" }]
    ]);
  });

  it("re-exports the service API from src/api for view-layer imports", async () => {
    const mod = await import("../../../api/resourceApi.js");

    assert.equal(typeof mod.createResourceApi, "function");
    assert.equal(typeof mod.resourceApi.getResources, "function");
  });
});

describe("assignment sync link helpers", () => {
  it("builds stable backend link fields when opening an existing work item", () => {
    const fields = buildAssignmentLinkFields(
      {
        id: "si-100",
        workItemId: "si-100",
        taskId: "task-200",
        taskUid: "task-200",
        projectId: "project-300"
      },
      {
        itemId: "si-100",
        taskUid: "task-200",
        projectId: "project-300"
      },
      {
        id: "task-200",
        taskUid: "task-200"
      }
    );

    assert.deepEqual(fields, {
      workItemId: "si-100",
      itemId: "si-100",
      scheduleItemId: "si-100",
      taskId: "task-200",
      taskUid: "task-200",
      projectId: "project-300"
    });
  });

  it("prefers schedule and task ids over drifted work item aliases", () => {
    const fields = buildAssignmentLinkFields(
      {
        id: "u-dingtao",
        workItemId: "u-dingtao",
        scheduleItemId: "si-200",
        taskUid: "task-200",
        projectId: "project-200"
      },
      {},
      {}
    );

    assert.deepEqual(fields, {
      workItemId: "si-200",
      itemId: "si-200",
      scheduleItemId: "si-200",
      taskId: "task-200",
      taskUid: "task-200",
      projectId: "project-200"
    });
  });
});

describe("assignment api payload helpers", () => {
  it("keeps stable sync link ids when building preview and confirm payloads", () => {
    const payload = buildAssignmentApiPayload(
      {
        title: "活动页资源补齐",
        project: "王者活动首图",
        projectId: "project-1001",
        startDate: "2026/05/18",
        endDate: "2026/05/22",
        departmentId: "design",
        skillText: "UI / 图标",
        priority: "高",
        workItemId: "wi-1001",
        itemId: "si-1001",
        scheduleItemId: "si-1001",
        taskId: "task-1001",
        taskUid: "task-1001"
      },
      {
        scope: "project",
        previewId: "preview-1001",
        assigneeId: "u-linxin",
        assigneeName: "林昕",
        candidate: { personId: "u-linxin", name: "林昕" },
        candidates: [{ personId: "u-linxin", name: "林昕" }],
        skillTags: ["UI", "图标"]
      }
    );

    assert.deepEqual(payload, {
      title: "活动页资源补齐",
      project: "王者活动首图",
      projectId: "project-1001",
      startDate: "2026/05/18",
      endDate: "2026/05/22",
      departmentId: "design",
      skillText: "UI / 图标",
      priority: "高",
      workItemId: "wi-1001",
      itemId: "si-1001",
      scheduleItemId: "si-1001",
      taskId: "task-1001",
      taskUid: "task-1001",
      scope: "project",
      previewId: "preview-1001",
      assigneeId: "u-linxin",
      assigneeName: "林昕",
      candidate: { personId: "u-linxin", name: "林昕" },
      candidates: [{ personId: "u-linxin", name: "林昕" }],
      skillTags: ["UI", "图标"]
    });
  });

  it("keeps backend nested assignment aliases in preview and confirm payloads", () => {
    const payload = buildAssignmentApiPayload(
      {
        title: "活动页资源补齐",
        project: "王者活动首图",
        projectId: "project-1001",
        startDate: "2026/05/18",
        endDate: "2026/05/22",
        departmentId: "design",
        workItemId: "si-1001",
        itemId: "si-1001",
        scheduleItemId: "si-1001",
        taskId: "task-1001",
        taskUid: "task-1001"
      },
      {
        assigneeId: "u-linxin",
        assigneeName: "林昕",
        personId: "u-linxin",
        userId: "u-linxin",
        taskDraft: { title: "活动页资源补齐" },
        workItem: { scheduleItemId: "si-1001", taskUid: "task-1001" },
        scheduleItem: { itemId: "si-1001", taskUid: "task-1001" },
        task: { taskUid: "task-1001" }
      }
    );

    assert.equal(payload.personId, "u-linxin");
    assert.equal(payload.userId, "u-linxin");
    assert.deepEqual(payload.taskDraft, { title: "活动页资源补齐" });
    assert.deepEqual(payload.workItem, { scheduleItemId: "si-1001", taskUid: "task-1001" });
    assert.deepEqual(payload.scheduleItem, { itemId: "si-1001", taskUid: "task-1001" });
    assert.deepEqual(payload.task, { taskUid: "task-1001" });
  });
});

describe("assignment workspace sync helpers", () => {
  it("hydrates schedule items and flow tasks from assignment confirmation data", () => {
    const storeLike = {
      rootProjects: [
        {
          id: "project-1001",
          tasks: [
            {
              id: "task-1001",
              taskUid: "task-1001",
              ownerUserId: "u-old",
              owner: "设计部 安娜",
              startDate: "2026/05/10",
              endDate: "2026/05/12"
            }
          ]
        }
      ],
      projectGroups: [],
      activeProjectId: "project-1001",
      schedulePlan: {
        items: [
          {
            id: "si-local-1",
            itemId: "si-local-1",
            taskUid: "task-1001",
            ownerUserId: "u-old",
            owner: "设计部 安娜",
            startDate: "2026/05/10",
            endDate: "2026/05/12"
          }
        ]
      }
    };

    const applied = applyAssignmentWorkspaceSync(storeLike, {
      scheduleItem: {
        id: "si-1001",
        itemId: "si-1001",
        taskUid: "task-1001",
        ownerUserId: "u-linxin",
        owner: "设计部 林昕",
        startDate: "2026/05/18",
        endDate: "2026/05/22"
      },
      task: {
        id: "task-1001",
        taskUid: "task-1001",
        ownerUserId: "u-linxin",
        owner: "设计部 林昕",
        startDate: "2026/05/18",
        endDate: "2026/05/22"
      }
    });

    assert.deepEqual(applied, { scheduleItemApplied: true, taskApplied: true });
    assert.deepEqual(storeLike.schedulePlan.items[0], {
      id: "si-1001",
      itemId: "si-1001",
      taskUid: "task-1001",
      ownerUserId: "u-linxin",
      owner: "设计部 林昕",
      startDate: "2026/05/18",
      endDate: "2026/05/22"
    });
    assert.equal(storeLike.rootProjects[0].tasks[0].ownerUserId, "u-linxin");
    assert.equal(storeLike.rootProjects[0].tasks[0].owner, "设计部 林昕");
    assert.equal(storeLike.rootProjects[0].tasks[0].startDate, "2026/05/18");
    assert.equal(storeLike.rootProjects[0].tasks[0].endDate, "2026/05/22");
  });
});

describe("resourceApi schedule patch links", () => {
  it("uses scheduleItemId when workItemId is not present", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await api.rescheduleWorkItem({ scheduleItemId: "si-2", taskUid: "task-2", startDate: "2026/05/11", endDate: "2026/05/12" });

    assert.deepEqual(client.calls, [
      ["patch", "/workspace/resources/work-items/si-2/schedule", { scheduleItemId: "si-2", taskUid: "task-2", startDate: "2026/05/11", endDate: "2026/05/12" }]
    ]);
  });
});

describe("assignment advice errors", () => {
  it("distinguishes auth, permission and service-configuration failures", () => {
    const unauthorized = assignmentAdviceFallbackMessage({ response: { status: 401 } });
    const forbidden = assignmentAdviceFallbackMessage({ response: { status: 403 } });
    const notConfigured = assignmentAdviceFallbackMessage({ response: { status: 503, data: { code: "HR_AI_KEY_NOT_CONFIGURED" } } });
    const unavailable = assignmentAdviceFallbackMessage({ response: { status: 503 } });
    const generic = assignmentAdviceFallbackMessage({ response: { status: 500 } });

    assert.notEqual(unauthorized, forbidden);
    assert.notEqual(forbidden, unavailable);
    assert.notEqual(notConfigured, unavailable);
    assert.notEqual(generic, notConfigured);
  });
});

describe("resource assignment failure feedback", () => {
  it("keeps backend message and code visible for rejected results and HTTP errors", () => {
    assert.equal(
      formatResourceApiFeedback(
        { ok: false, message: "Assignee is not available in assignment candidates", code: "ASSIGNEE_NOT_IN_CANDIDATES" },
        "分配确认失败，未写入时间轴"
      ),
      "Assignee is not available in assignment candidates（ASSIGNEE_NOT_IN_CANDIDATES）"
    );

    assert.equal(
      formatResourceApiFeedback(
        {
          message: "Request failed",
          response: {
            data: {
              message: "Work item not found",
              code: "RESOURCE_SYNC_LINK_MISSING"
            }
          }
        },
        "后端排期同步失败"
      ),
      "Work item not found（RESOURCE_SYNC_LINK_MISSING）"
    );

    assert.equal(formatResourceApiFeedback({}, "后端排期同步失败"), "后端排期同步失败");
  });
});


