import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleHtmlExport,
  buildSchedulePdfPreviewModel
} from "../../../../utils/schedule/scheduleExport.js";
import { createInitialState } from "../../../../data/seed.js";
import { appActions } from "../appActions.js";
import { coreActions } from "../coreActions.js";
import { projectActions } from "../projectActions.js";
import { scheduleActions } from "../scheduleActions.js";
import { taskActions } from "../taskActions.js";
import { userActions } from "../userActions.js";
import { workspaceGetters } from "../../getters.js";

function createScheduleStore() {
  return {
    activeProject: {
      id: 1003,
      name: "Offline project",
      startDate: "2026/05/10",
      endDate: "2026/05/24",
      tasks: []
    },
    schedulePlan: {
      id: "sp-offline",
      projectId: 1003,
      title: "Offline schedule",
      startDate: "2026/05/10",
      endDate: "2026/05/24",
      summary: {
        itemCount: 2,
        pendingCount: 2,
        doneCount: 0,
        riskCount: 0
      },
      items: [
        {
          id: "si-001",
          itemId: "si-001",
          taskUid: "task-001",
          type: "schedule",
          title: "Design review",
          module: "aigc",
          owner: "PM: admin",
          startDate: "2026/05/10",
          endDate: "2026/05/16",
          status: "todo",
          progress: 20,
          commentsCount: 2
        },
        {
          id: "si-002",
          itemId: "si-002",
          taskUid: "task-002",
          type: "task",
          title: "Asset handoff",
          module: "project",
          owner: "Design: user",
          startDate: "2026/05/17",
          endDate: "2026/05/18",
          status: "doing",
          progress: 55,
          commentsCount: 1
        }
      ],
      dependencies: [{ id: "dep-1", fromItemId: "si-001", toItemId: "si-002", type: "finish_to_start" }],
      snapshots: [],
      templates: []
    },
    scheduleUi: {
      view: "timeline",
      departmentFilter: "全部",
      rowFilter: "all",
      visibleType: "all",
      dayWidth: 28,
      zoomLevel: 3,
      visibleStartDate: "2026/05/10",
      visibleEndDate: "2026/05/24",
      selectedItemId: "",
      selectedTaskId: null,
      chat: {
        visible: false,
        itemId: "",
        taskUid: "",
        targetType: "schedule",
        targetId: "",
        x: 900,
        y: 220,
        width: 386,
        height: 556,
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

function createFlowStore() {
  const project = {
    id: 2001,
    name: "Offline flow project",
    tasks: []
  };
  return {
    activeProject: project,
    currentUser: { name: "admin", department: "Project" },
    activeView: "",
    recentTaskId: null,
    requireTaskEditPermission() {
      return true;
    },
    showToast() {},
    clearRecentTask() {},
    getTask(taskId) {
      return project.tasks.find((task) => task.id === Number(taskId));
    }
  };
}

function createEmptyFlowStore() {
  const store = {
    activeProject: null,
    currentUser: { name: "admin", department: "Project" },
    activeView: "project",
    recentTaskId: null,
    toastMessages: [],
    requireTaskEditPermission() {
      return true;
    },
    showToast(message) {
      this.toastMessages.push(message);
    },
    clearRecentTask() {},
    getTask() {
      return null;
    }
  };
  return store;
}

function createArchiveStore() {
  const store = {
    rootProjects: [
      {
        id: 3001,
        name: "Root active project",
        status: "active",
        group: "Project summary",
        tasks: [{ id: 1, title: "Root task", archived: false }]
      }
    ],
    projectGroups: [
      {
        id: "group-archive",
        title: "Archive regression",
        projects: [
          {
            id: 3002,
            name: "Project to archive",
            status: "active",
            group: "Archive regression",
            tasks: [
              { id: 21, title: "Keep pending task", archived: false },
              { id: 22, title: "Keep done task", archived: true }
            ]
          },
          {
            id: 3003,
            name: "Older archived project",
            status: "archived",
            archivedAt: "2026/04/08 13:20",
            group: "Archive regression",
            tasks: [{ id: 31, title: "Older archived task", archived: false }]
          },
          {
            id: 3004,
            name: "Legacy archived project",
            status: "archived",
            group: "Archive regression",
            tasks: [{ id: 41, title: "Legacy task", archived: false }]
          }
        ]
      }
    ],
    activeProjectId: 3002,
    currentUser: { name: "admin" },
    canManageProject: true,
    toastMessages: [],
    showToast(message) {
      this.toastMessages.push(message);
    }
  };

  Object.defineProperties(store, {
    allProjects: {
      get() {
        return workspaceGetters.allProjects(this);
      }
    },
    activeProjects: {
      get() {
        return workspaceGetters.activeProjects.call(this);
      }
    },
    archivedProjectsList: {
      get() {
        return workspaceGetters.archivedProjectsList.call(this);
      }
    },
    activeProject: {
      get() {
        return workspaceGetters.activeProject.call(this);
      }
    }
  });

  return Object.assign(store, {
    findProjectWithGroup(projectId) {
      const rootProject = (this.rootProjects || []).find((item) => item.id === Number(projectId));
      if (rootProject) return { group: null, project: rootProject, isRoot: true };
      for (const group of this.projectGroups || []) {
        const project = (group.projects || []).find((item) => item.id === Number(projectId));
        if (project) return { group, project };
      }
      return null;
    },
    getNextActiveProjectId() {
      return this.activeProjects[0]?.id || null;
    },
    requireProjectManagePermission() {
      if (this.canManageProject) return true;
      this.showToast("Project manage permission required");
      return false;
    }
  });
}

function createSearchIsolationStore() {
  const project = {
    id: 4101,
    name: "Search isolation project",
    status: "active",
    tasks: [
      { id: 1, title: "Visible flow task", type: "流程", module: "project", archived: false, comments: [] },
      { id: 2, title: "Visible schedule task", type: "排期", module: "project", archived: false, comments: [] }
    ]
  };
  const store = {
    activeView: "project",
    activeFilter: "all",
    taskModuleFilter: "all",
    query: "no-task-should-match-this",
    activeProject: project,
    getTaskModule: coreActions.getTaskModule
  };
  store.taskMatchesFilter = coreActions.taskMatchesFilter.bind(store);
  store.ensureScheduleDefaults = () => {};
  return store;
}

function createMemberInviteStore() {
  const project = {
    id: 5101,
    name: "Collab members project",
    status: "active",
    group: "Collab",
    members: ["Owner"],
    memberRoles: { Owner: "manager" },
    tasks: []
  };
  const toastMessages = [];
  return {
    rootProjects: [project],
    projectGroups: [],
    activeProjectId: project.id,
    currentUser: { id: "u-owner", name: "Owner", role: "employee" },
    users: [
      { id: "u-owner", name: "Owner", role: "employee" },
      { id: "u-a", name: "Alpha", role: "employee" },
      { id: "u-b", name: "Beta", role: "employee" },
      { id: "u-c", name: "Gamma", role: "employee" }
    ],
    canManageProject: true,
    toastMessages,
    getUserByName: coreActions.getUserByName,
    showToast(message) {
      toastMessages.push(message);
    },
    requireProjectManagePermission() {
      return true;
    },
    findProjectWithGroup(projectId) {
      return this.rootProjects.find((item) => item.id === projectId) ? { group: null, project, isRoot: true } : null;
    }
  };
}

function assertScheduleItemsUnchanged(store, originalItems, originalSnapshot) {
  assert.equal(store.schedulePlan.items, originalItems);
  assert.deepEqual(store.schedulePlan.items, originalSnapshot);
}

describe("frontend offline regression contracts", () => {
  it("falls back to a usable local flow workspace when all backend bootstrap APIs fail", () => {
    const store = createInitialState();
    const loaded = appActions.useLocalOfflineWorkspace.call(store, {
      user: {
        id: "u-local-flow-admin",
        name: "Flow Admin",
        role: "admin",
        avatar: "F",
        department: "Project"
      }
    });

    assert.equal(loaded, true);
    assert.equal(store.backendLoaded, false);
    assert.equal(store.backendSource, "local");
    assert.equal(store.currentUserId, "u-local-flow-admin");
    assert.ok(store.rootProjects.length >= 1);
    assert.ok(store.activeProjectId);
    assert.equal(store.activeSection, "flow");
    assert.equal(store.rootProjects[0].members.includes("Flow Admin"), true);
    assert.equal(store.rootProjects[0].memberRoles["Flow Admin"], "manager");
    assert.equal(store.rootProjects[0].tasks.some((task) => !task.archived), true);
  });

  it("keeps schedulePlan.items stable across schedule view, filter, chat, and selection UI state", () => {
    const store = createScheduleStore();
    const originalItems = store.schedulePlan.items;
    const originalDependencies = store.schedulePlan.dependencies;
    const originalSnapshot = structuredClone(originalItems);

    assert.equal(scheduleActions.setScheduleUiView.call(store, "board"), true);
    assert.equal(scheduleActions.selectScheduleItem.call(store, "si-001"), true);
    assert.equal(scheduleActions.setScheduleUiView.call(store, "node"), true);
    assert.equal(scheduleActions.selectScheduleItem.call(store, "si-002"), true);
    assert.equal(scheduleActions.setScheduleUiView.call(store, "timeline"), true);
    assert.equal(store.scheduleUi.selectedItemId, "si-002");
    assert.equal(store.scheduleUi.selectedTaskId, "task-002");
    assert.equal(store.schedulePlan.dependencies, originalDependencies);
    assertScheduleItemsUnchanged(store, originalItems, originalSnapshot);

    assert.equal(scheduleActions.setScheduleDepartmentFilter.call(store, "AIGC"), true);
    assertScheduleItemsUnchanged(store, originalItems, originalSnapshot);

    assert.equal(scheduleActions.setScheduleRowFilter.call(store, "task"), true);
    assertScheduleItemsUnchanged(store, originalItems, originalSnapshot);

    scheduleActions.openScheduleChat.call(store, { itemId: "si-001", taskUid: "task-001" });
    scheduleActions.moveScheduleChat.call(store, { x: 128, y: 96 });
    scheduleActions.resizeScheduleChat.call(store, { width: 420, height: 600 });
    assertScheduleItemsUnchanged(store, originalItems, originalSnapshot);
  });

  it("builds HTML and PDF schedule previews without mutating the source plan data", () => {
    const store = createScheduleStore();
    const originalItems = store.schedulePlan.items;
    const originalDependencies = store.schedulePlan.dependencies;
    const originalItemSnapshot = structuredClone(originalItems);
    const originalDependencySnapshot = structuredClone(originalDependencies);

    buildScheduleHtmlExport(store.schedulePlan, originalItems, originalDependencies, {
      viewMode: "board",
      dayWidth: 36
    });
    buildScheduleHtmlExport(store.schedulePlan, originalItems, originalDependencies, {
      viewMode: "node",
      dayWidth: 18
    });
    buildSchedulePdfPreviewModel(store.schedulePlan, originalItems, originalDependencies, {
      viewMode: "timeline"
    });

    assert.equal(store.schedulePlan.items, originalItems);
    assert.equal(store.schedulePlan.dependencies, originalDependencies);
    assert.deepEqual(originalItems, originalItemSnapshot);
    assert.deepEqual(originalDependencies, originalDependencySnapshot);
  });

  it("blocks flow task dispatch when the project backend id is missing", () => {
    const store = createFlowStore();
    store.activeProject.id = "";
    const toastMessages = [];
    store.showToast = (message) => {
      toastMessages.push(message);
    };

    const created = taskActions.createTask.call(store, {
      title: "Offline flow task",
      type: "流程",
      module: "project",
      startDate: "2026/05/10",
      endDate: "2026/05/11"
    });

    assert.equal(created, false);
    assert.equal(store.activeProject.tasks.length, 0);
    assert.deepEqual(toastMessages, ["任务下发需要先同步项目到后端"]);
  });

  it("shows a clear local fallback message instead of silently failing when no active project exists", () => {
    const store = createEmptyFlowStore();

    const created = taskActions.createTask.call(store, {
      title: "Offline flow task",
      type: "流程",
      module: "project",
      startDate: "2026/05/10",
      endDate: "2026/05/11"
    });

    assert.equal(created, false);
    assert.deepEqual(store.toastMessages, ["请先创建或选择一个项目，再新建流程任务"]);
  });

  it("moves the original project into archive, keeps tasks, and sorts archives by archivedAt desc", () => {
    const store = createArchiveStore();
    const originalProject = store.projectGroups[0].projects.find((project) => project.id === 3002);
    const originalTasks = originalProject.tasks;
    const olderArchivedProject = store.projectGroups[0].projects.find((project) => project.id === 3003);
    const legacyArchivedProject = store.projectGroups[0].projects.find((project) => project.id === 3004);

    const archived = projectActions.archiveActiveProject.call(store);

    assert.equal(archived, true);
    assert.match(originalProject.archivedAt, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    originalProject.archivedAt = "2026/05/12 09:30";
    olderArchivedProject.archivedAt = "2026/05/13 10:20";
    legacyArchivedProject.archivedAt = "2026/05/11 18:45";
    assert.deepEqual(
      store.activeProjects.map((project) => project.id),
      [3001]
    );
    const archivedEntry = store.archivedProjectsList.find((project) => project.id === 3002);
    assert.equal(archivedEntry, originalProject);
    assert.equal(archivedEntry.tasks, originalTasks);
    assert.deepEqual(
      store.archivedProjectsList.map((project) => project.id),
      [3003, 3002, 3004]
    );
  });

  it("restores an archived project without leaving duplicate active or archive entries", () => {
    const store = createArchiveStore();
    const originalProject = store.projectGroups[0].projects.find((project) => project.id === 3002);

    assert.equal(projectActions.archiveActiveProject.call(store), true);
    assert.equal(store.activeProjects.some((project) => project.id === originalProject.id), false);
    assert.equal(store.archivedProjectsList.some((project) => project.id === originalProject.id), true);
    assert.equal(store.archivedProjectsList.find((project) => project.id === originalProject.id), originalProject);

    assert.equal(projectActions.restoreProject.call(store, originalProject.id), true);

    const activeMatches = store.activeProjects.filter((project) => project.id === originalProject.id);
    const archiveMatches = store.archivedProjectsList.filter((project) => project.id === originalProject.id);
    const allMatches = store.allProjects.filter((project) => project.id === originalProject.id);
    assert.equal(activeMatches.length, 1);
    assert.equal(activeMatches[0], originalProject);
    assert.equal(archiveMatches.length, 0);
    assert.equal(allMatches.length, 1);
    assert.equal(originalProject.status, "active");
    assert.equal(store.activeProject, originalProject);
  });

  it("toggles care contacts locally before backend sync", () => {
    const originalWindow = globalThis.window;
    globalThis.window = {};
    const store = {
      currentUser: { id: "u-admin", name: "Admin" },
      users: [
        { id: "u-admin", name: "Admin", role: "admin" },
        { id: "u-user", name: "User", role: "employee", department: "Design", email: "user@example.com", phone: "13800000000", job: "Artist" }
      ],
      contacts: [],
      getUser(userId) {
        return this.users.find((item) => item.id === userId) || null;
      },
      showToast() {}
    };

    const added = userActions.toggleCareContact.call(store, "u-user");
    assert.equal(added, true);
    assert.equal(store.contacts.length, 1);
    assert.equal(userActions.isCareContact.call(store, "u-user"), true);
    assert.equal(store.contacts[0].relationType, "care");

    const removed = userActions.toggleCareContact.call(store, "u-user");
    assert.equal(removed, false);
    assert.equal(store.contacts.length, 0);
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  it("care contact checks ignore non-care relation rows", () => {
    const store = {
      contacts: [
        { id: "u-user", userId: "u-user", relationType: "colleague", status: "active" },
        { id: "u-care", userId: "u-care", relationType: "care", status: "active" }
      ]
    };

    assert.equal(userActions.isCareContact.call(store, "u-user"), false);
    assert.equal(userActions.isCareContact.call(store, "u-care"), true);
  });

  it("matches backend contact rows by contact id and target user id", () => {
    const store = {
      contacts: [
        { id: "contact-1", contactId: "contact-1", userId: "u-care", relationType: "care", status: "active" }
      ]
    };

    assert.equal(userActions.isCareContact.call(store, "u-care"), true);
    assert.equal(userActions.isCareContact.call(store, "contact-1"), true);
  });

  it("resolves users by name for resource care actions without throwing", () => {
    const store = {
      users: [
        { id: "u-admin", name: "Admin", role: "admin" },
        { id: "u-zhumin", name: "朱敏", role: "employee" }
      ]
    };

    assert.equal(coreActions.getUserByName.call(store, "朱敏")?.id, "u-zhumin");
    assert.equal(coreActions.getUserByName.call(store, "missing"), null);
  });

  it("keeps stale global search text from filtering the right-side task panels", () => {
    const store = createSearchIsolationStore();

    assert.deepEqual(
      workspaceGetters.activeTasks.call(store).map((task) => task.id),
      [1, 2]
    );
    assert.deepEqual(
      workspaceGetters.scheduleTasks.call(store).map((task) => task.id),
      [1, 2]
    );
  });

  it("clears legacy global search text when workspace state is normalized", () => {
    const store = {
      query: "persisted-sidebar-search",
      rootProjects: [],
      projectGroups: [],
      users: [],
      contacts: [],
      tags: [],
      carouselNotices: [],
      boards: [],
      boardHistory: [],
      templates: [],
      treesOpen: {},
      currentUserId: "u-admin",
      currentUser: { id: "u-admin", name: "admin" },
      allProjects: [],
      activeProject: null,
      activeProjects: []
    };

    appActions.normalizeLoadedState.call(store);

    assert.equal(store.query, "");
  });

  it("shows the selected task template name in the project title getter", () => {
    const store = {
      rootProjects: [],
      projectGroups: [],
      activeProjectId: null,
      activeView: "template",
      activeTemplateGroupIndex: 0,
      activeTemplateChildIndex: 0,
      templates: [
        {
          title: "项目任务模板",
          kind: "task",
          children: ["王者严云雪必用流程模"],
          templateTasks: {
            "王者严云雪必用流程模": []
          }
        }
      ],
      get allProjects() {
        return workspaceGetters.allProjects(this);
      },
      get activeProject() {
        return workspaceGetters.activeProject.call(this);
      },
      get activeTemplate() {
        return workspaceGetters.activeTemplate.call(this);
      },
      get activeTemplateName() {
        return workspaceGetters.activeTemplateName.call(this);
      }
    };

    assert.equal(workspaceGetters.activeProjectName.call(store), "王者严云雪必用流程模");
  });

  it("adds multiple selected collaboration members in one project update", () => {
    const originalWindow = globalThis.window;
    globalThis.window = {};
    const store = createMemberInviteStore();

    const added = projectActions.inviteMembers.call(store, ["Alpha", "Beta", "Missing", "Alpha", "Owner"]);

    assert.deepEqual(added, ["Alpha", "Beta"]);
    assert.deepEqual(store.rootProjects[0].members, ["Beta", "Alpha", "Owner"]);
    assert.equal(store.rootProjects[0].memberRoles.Alpha, "readonly");
    assert.equal(store.rootProjects[0].memberRoles.Beta, "readonly");
    assert.equal(store.toastMessages.at(-1), "已加入 2 位协同成员");

    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
});
