import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import workspaceApi from "../../../../services/workspaceApi.js";
import { workspaceGetters } from "../../getters.js";
import { taskActions } from "../taskActions.js";
import { templateActions } from "../templateActions.js";

const originalCreateProject = workspaceApi.createProject;
const originalCreateTask = workspaceApi.createTask;
const originalCreateTemplate = workspaceApi.createTemplate;
const originalDeleteTemplate = workspaceApi.deleteTemplate;
const originalShareTemplate = workspaceApi.shareTemplate;
const originalUnshareTemplate = workspaceApi.unshareTemplate;
const originalUpdateTemplate = workspaceApi.updateTemplate;
const originalWindow = globalThis.window;
const originalDateNow = Date.now;

afterEach(() => {
  workspaceApi.createProject = originalCreateProject;
  workspaceApi.createTask = originalCreateTask;
  workspaceApi.createTemplate = originalCreateTemplate;
  workspaceApi.deleteTemplate = originalDeleteTemplate;
  workspaceApi.shareTemplate = originalShareTemplate;
  workspaceApi.unshareTemplate = originalUnshareTemplate;
  workspaceApi.updateTemplate = originalUpdateTemplate;
  Date.now = originalDateNow;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

const RESET_WHEN_GENERATED = new Set(["id", "archived", "expanded", "unreadComments"]);

function assertGeneratedTaskMatchesTemplate(generatedTask, templateTask) {
  assert.notEqual(generatedTask, templateTask);
  for (const [field, value] of Object.entries(templateTask)) {
    if (RESET_WHEN_GENERATED.has(field)) continue;
    assert.deepEqual(generatedTask[field], value, `preserves template task field: ${field}`);
  }
  assert.notEqual(generatedTask.id, templateTask.id);
  assert.equal(generatedTask.sourceTemplateTaskId, templateTask.id);
  assert.equal(generatedTask.archived, false);
  assert.equal(generatedTask.expanded, false);
  assert.equal(generatedTask.unreadComments, 0);
}

function flushBackgroundSync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function readTemplateActionsSource() {
  return fs.readFile(new URL("../templateActions.js", import.meta.url), "utf8");
}

function findTemplateInStore(name) {
  for (const [groupIndex, group] of (this.templates || []).entries()) {
    const childIndex = (group.children || []).indexOf(name);
    if (childIndex !== -1) return { group, groupIndex, childIndex };
  }
  return null;
}

function createTemplateMockStore() {
  const currentTemplate = { children: ["个人任务模板"], templateTasks: { "个人任务模板": [] }, ownerId: "user-a" };
  const store = {
    activeProject: null,
    activeView: "template",
    activeTemplateGroupIndex: 0,
    activeTemplateChildIndex: 0,
    templates: [currentTemplate],
    currentUser: { id: "user-a", name: "测试用户", department: "项目管理" },
    currentUserId: "user-a",
    recentTaskId: null,
    allProjects: [],
    requireTaskEditPermission() {
      return true;
    },
    showToast() {},
    clearRecentTask() {},
    getTask(taskId) {
      return this.activeTemplateTasks.find((task) => task.id === Number(taskId));
    },
    get activeTemplate() {
      return currentTemplate;
    },
    get activeTemplateName() {
      return currentTemplate.children[0];
    },
    get activeTemplateTasks() {
      return currentTemplate.templateTasks["个人任务模板"];
    }
  };
  store.createTask = taskActions.createTask.bind(store);
  store.updateTaskTitle = taskActions.updateTaskTitle.bind(store);
  store.updateTaskNote = taskActions.updateTaskNote.bind(store);
  store.deleteTask = taskActions.deleteTask.bind(store);
  return store;
}

function createTemplateProjectMockStore(options = {}) {
  const templateName = options.templateName || "默认任务模板";
  const templateTask = {
    id: 1001,
    title: "前期沟通",
    type: "流程",
    module: "project",
    group: "项目管理",
    note: "确认客户需求",
    startDate: "2026/05/10",
    endDate: "2026/05/11",
    owner: "项目管理: 测试用户",
    priority: "high",
    progress: 40,
    scheduleStatus: "pending",
    archived: true,
    expanded: true,
    unreadComments: 3,
    comments: [{ user: "测试用户", text: "模板评论" }]
  };
  const templateTasks = options.templateTasks || [templateTask];
  const store = {
    rootProjects: [...(options.rootProjects || [])],
    projectGroups: [],
    templates: [
      {
        id: "template-group-1",
        title: "项目任务模板",
        children: [templateName],
        templateTasks: {
          [templateName]: templateTasks
        }
      }
    ],
    currentUser: { id: "user-a", name: "测试用户", department: "项目管理" },
    currentUserId: "user-a",
    activeProjectId: null,
    activeSection: "flow",
    activeView: "template",
    activeFilter: "all",
    query: "",
    toasts: [],
    showToast(message) {
      this.toasts.push(message);
    },
    collapseTemplateOpen() {},
    findTemplate: findTemplateInStore,
    get activeTemplate() {
      return this.templates[Number(this.activeTemplateGroupIndex)] || null;
    },
    get activeTemplateName() {
      const template = this.activeTemplate;
      if (!template || this.activeTemplateChildIndex === null || this.activeTemplateChildIndex === undefined) return "";
      return (template.children || [])[Number(this.activeTemplateChildIndex)] || "";
    },
    get allProjects() {
      return [...this.rootProjects, ...this.projectGroups.flatMap((group) => group.projects || [])];
    },
    get activeProject() {
      return this.allProjects.find((project) => project.id === this.activeProjectId && project.status !== "archived") || null;
    }
  };
  store.useTemplateToCreateProject = templateActions.useTemplateToCreateProject.bind(store);
  return { store, templateName, templateTask: templateTasks[0], templateTasks };
}

function createScheduleTemplateProjectMockStore() {
  const { store, templateName } = createTemplateProjectMockStore();
  store.templates = [
    {
      id: "schedule-template-group",
      title: "schedule templates",
      kind: "schedule",
      children: [templateName],
      templateTasks: {
        [templateName]: [{ id: 2001, title: "schedule item", archived: false }]
      }
    }
  ];
  return { store, templateName };
}

function createScheduleTemplateMockStore() {
  const templateName = "项目排期模板A";
  const schedulePlan = {
    id: "plan-template-source",
    projectId: 3001,
    title: "来源排期",
    startDate: "2026/05/10",
    endDate: "2026/05/28",
    viewConfig: { defaultView: "timeline", dayWidth: 36, rowHeight: 40 },
    summary: { itemCount: 1, pendingCount: 1, doneCount: 0, riskCount: 0 },
    items: [
      {
        id: "si-template-001",
        title: "模板排期环节",
        startDate: "2026/05/10",
        endDate: "2026/05/15",
        payload: { note: "保存完整 payload" },
        comments: [{ content: "排期聊天" }]
      }
    ],
    dependencies: [{ id: "dep-template-001", fromItemId: "si-template-001", toItemId: "si-template-002" }]
  };
  const store = {
    rootProjects: [{ id: 4001, name: "当前项目", status: "active", tasks: [] }],
    projectGroups: [],
    templates: [
      {
        id: "schedule-template-group",
        title: "项目排期模板",
        kind: "schedule",
        children: [templateName],
        templateTasks: {
          [templateName]: [{ id: 999, title: "legacy task should stay isolated" }]
        },
        templateSchedules: {
          [templateName]: schedulePlan
        }
      }
    ],
    schedulePlan: { items: [], dependencies: [], viewConfig: {}, summary: {} },
    scheduleUi: {},
    currentUser: { id: "user-a", name: "测试用户", department: "项目管理" },
    currentUserId: "user-a",
    activeProjectId: 4001,
    activeSection: "flow",
    activeView: "template",
    activeTemplateGroupIndex: null,
    activeTemplateChildIndex: null,
    activeFilter: "all",
    query: "",
    toasts: [],
    showToast(message) {
      this.toasts.push(message);
    },
    collapseTemplateOpen() {},
    findTemplate: findTemplateInStore,
    get activeTemplate() {
      return this.templates[Number(this.activeTemplateGroupIndex)] || null;
    },
    get activeTemplateName() {
      const template = this.activeTemplate;
      if (!template || this.activeTemplateChildIndex === null || this.activeTemplateChildIndex === undefined) return "";
      return (template.children || [])[Number(this.activeTemplateChildIndex)] || "";
    },
    get allProjects() {
      return [...this.rootProjects, ...this.projectGroups.flatMap((group) => group.projects || [])];
    },
    get activeProject() {
      return this.allProjects.find((project) => project.id === this.activeProjectId && project.status !== "archived") || null;
    }
  };
  store.switchToTemplateView = templateActions.switchToTemplateView.bind(store);
  store.addTemplateToGroup = templateActions.addTemplateToGroup.bind(store);
  store.saveScheduleTemplate = templateActions.saveScheduleTemplate.bind(store);
  store.saveCurrentScheduleAsTemplate = templateActions.saveCurrentScheduleAsTemplate.bind(store);
  store.applyScheduleTemplateToActiveProject = templateActions.applyScheduleTemplateToActiveProject.bind(store);
  store.applyFirstScheduleTemplateToActiveProject = templateActions.applyFirstScheduleTemplateToActiveProject.bind(store);
  return { store, templateName, schedulePlan };
}

describe("template task actions", () => {
  it("defines template mutation action keys only once", async () => {
    const source = await readTemplateActionsSource();

    for (const actionName of ["deleteTemplateGroup", "renameTemplate", "deleteTemplate", "shareTemplate", "unshareTemplate", "moveTemplate"]) {
      const matches = source.match(new RegExp(`^\\s*${actionName}\\s*\\(`, "gm")) || [];
      assert.equal(matches.length, 1, `${actionName} should be defined once`);
    }
  });

  it("allows the current user to add, edit, and delete tasks inside their own template", () => {
    const store = createTemplateMockStore();

    const created = store.createTask({
      title: "模板里的自定义任务",
      type: "流程",
      module: "aigc",
      note: "初始备注",
      startDate: "2026/05/10",
      endDate: "2026/05/11"
    });

    assert.equal(created, true);
    assert.equal(store.activeTemplateTasks.length, 1);
    assert.equal(store.activeTemplateTasks[0].title, "模板里的自定义任务");
    assert.equal(store.activeView, "template");

    const taskId = store.activeTemplateTasks[0].id;
    assert.equal(store.updateTaskTitle(taskId, "修改后的模板任务"), true);
    assert.equal(store.updateTaskNote(taskId, "修改后的备注"), true);
    assert.equal(store.activeTemplateTasks[0].title, "修改后的模板任务");
    assert.equal(store.activeTemplateTasks[0].note, "修改后的备注");

    store.deleteTask(taskId);
    assert.equal(store.activeTemplateTasks.length, 0);
  });

  it("copies template tasks into the new active project when generating from a template", () => {
    const { store, templateName, templateTask } = createTemplateProjectMockStore();

    store.useTemplateToCreateProject(templateName);

    assert.equal(store.activeView, "project");
    assert.equal(store.activeProjectId, store.rootProjects[0].id);
    assert.ok(store.activeProject.tasks.length > 0);
    assert.equal(store.activeProject.tasks.length, 1);

    const newTask = store.activeProject.tasks[0];
    assertGeneratedTaskMatchesTemplate(newTask, templateTask);

    newTask.comments[0].text = "项目评论修改";
    assert.equal(templateTask.comments[0].text, "模板评论");
  });
  it("does not create projects from schedule templates", () => {
    const { store, templateName } = createScheduleTemplateProjectMockStore();

    const created = store.useTemplateToCreateProject(templateName);

    assert.equal(created, false);
    assert.equal(store.rootProjects.length, 0);
    assert.equal(store.activeView, "template");
    assert.equal(store.toasts.length, 1);
  });

  it("syncs generated template project tasks through the createProject payload", async () => {
    const fixedNow = 1_800_000_000_000;
    const existingTaskIds = [fixedNow + 1, fixedNow + 2];
    Date.now = () => fixedNow;
    const templateTasks = [
      {
        id: 2001,
        title: "AI 方案初稿",
        type: "流程",
        module: "aigc",
        group: "内容生成",
        note: "保留 AIGC 模块任务字段",
        startDate: "2026/05/12",
        endDate: "2026/05/13",
        owner: "AIGC: 测试用户",
        priority: "high",
        progress: 20,
        scheduleStatus: "pending",
        archived: true,
        expanded: true,
        unreadComments: 5,
        comments: [{ user: "测试用户", text: "AI 模块评论" }],
        attachments: [{ name: "brief.pdf", url: "/brief.pdf" }]
      },
      {
        id: 2002,
        title: "交付验收清单",
        type: "流程",
        module: "delivery",
        group: "交付管理",
        note: "保留交付模块任务字段",
        startDate: "2026/05/14",
        endDate: "2026/05/15",
        owner: "交付: 测试用户",
        priority: "normal",
        progress: 60,
        scheduleStatus: "risk",
        archived: false,
        expanded: true,
        unreadComments: 2,
        comments: [{ user: "测试用户", text: "交付模块评论" }],
        checklist: [{ title: "验收材料", done: false }]
      }
    ];
    const { store, templateName } = createTemplateProjectMockStore({
      templateTasks,
      rootProjects: [
        {
          id: 9001,
          name: "已有项目",
          status: "active",
          tasks: existingTaskIds.map((id) => ({ id, title: `已占用任务 ${id}` }))
        }
      ]
    });
    const createProjectPayloads = [];
    let createTaskCallCount = 0;
    globalThis.window = {};
    workspaceApi.createProject = async (payload) => {
      createProjectPayloads.push(payload);
      return { projectId: payload.id };
    };
    workspaceApi.createTask = async () => {
      createTaskCallCount += 1;
    };

    assert.equal(store.useTemplateToCreateProject(templateName), true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(store.activeProject.tasks.length > 0);
    assert.equal(store.activeProject.tasks.length, templateTasks.length);
    assert.deepEqual(store.activeProject.tasks.map((task) => task.module), ["aigc", "delivery"]);
    assert.deepEqual(store.activeProject.tasks.map((task) => task.id), [fixedNow + 3, fixedNow + 4]);
    assert.equal(new Set(store.activeProject.tasks.map((task) => task.id)).size, templateTasks.length);
    for (const occupiedId of existingTaskIds) {
      assert.equal(store.activeProject.tasks.some((task) => task.id === occupiedId), false);
    }
    templateTasks.forEach((templateTask, index) => {
      assertGeneratedTaskMatchesTemplate(store.activeProject.tasks[index], templateTask);
    });

    assert.equal(createProjectPayloads.length, 1);
    assert.ok(Object.hasOwn(createProjectPayloads[0], "tasks"));
    assert.deepEqual(createProjectPayloads[0].tasks, store.activeProject.tasks);
    assert.equal(createProjectPayloads[0].tasks.length, templateTasks.length);
    templateTasks.forEach((templateTask, index) => {
      assertGeneratedTaskMatchesTemplate(createProjectPayloads[0].tasks[index], templateTask);
    });
    assert.equal(createTaskCallCount, 0);
  });

  it("opens schedule templates in schedule state without creating templateTasks", () => {
    const { store, templateName, schedulePlan } = createScheduleTemplateMockStore();

    store.switchToTemplateView(0, 0);

    assert.equal(store.activeSection, "schedule");
    assert.equal(store.activeView, "schedule-template");
    assert.equal(store.activeTemplateGroupIndex, 0);
    assert.equal(store.activeTemplateChildIndex, 0);
    assert.deepEqual(store.schedulePlan.items, schedulePlan.items);
    assert.equal(store.rootProjects.length, 1);
    assert.equal(store.templates[0].templateTasks[templateName][0].title, "legacy task should stay isolated");

    store.addTemplateToGroup(0, "新增排期模板");

    assert.equal(store.activeSection, "schedule");
    assert.equal(store.activeView, "schedule-template");
    assert.equal(store.activeTemplateGroupIndex, 0);
    assert.equal(store.activeTemplateChildIndex, 1);
    assert.equal(store.templates[0].templateTasks["新增排期模板"], undefined);
    assert.ok(store.templates[0].templateSchedules["新增排期模板"]);
    assert.deepEqual(store.schedulePlan.items, []);
  });

  it("does not materialize schedule templates through the task-template getter", () => {
    const { store, templateName } = createScheduleTemplateMockStore();
    store.activeTemplateGroupIndex = 0;
    store.activeTemplateChildIndex = 0;

    const tasks = workspaceGetters.activeTemplateTasks.call(store);

    assert.deepEqual(tasks, []);
    assert.equal(store.templates[0].templateTasks[templateName][0].title, "legacy task should stay isolated");
    assert.equal(store.templates[0].templateTasks["missing schedule task bucket"], undefined);
  });

  it("saves and applies schedule templates as deep-copied schedulePlan data", () => {
    const { store, templateName, schedulePlan } = createScheduleTemplateMockStore();
    store.schedulePlan = schedulePlan;

    assert.equal(store.saveScheduleTemplate(templateName), true);
    const saved = store.templates[0].templateSchedules[templateName];
    assert.notEqual(saved, schedulePlan);
    assert.notEqual(saved.items, schedulePlan.items);
    assert.notEqual(saved.items[0], schedulePlan.items[0]);
    assert.notEqual(saved.items[0].payload, schedulePlan.items[0].payload);
    assert.notEqual(saved.items[0].comments, schedulePlan.items[0].comments);
    assert.notEqual(saved.dependencies, schedulePlan.dependencies);
    assert.notEqual(saved.dependencies[0], schedulePlan.dependencies[0]);
    assert.deepEqual(saved.items, schedulePlan.items);
    assert.equal(store.templates[0].templateTasks[templateName][0].title, "legacy task should stay isolated");

    schedulePlan.items[0].payload.note = "mutated source after save";
    assert.equal(saved.items[0].payload.note, "保存完整 payload");

    store.schedulePlan = { items: [], dependencies: [], viewConfig: {}, summary: {} };
    assert.equal(store.applyScheduleTemplateToActiveProject(templateName), true);
    assert.notEqual(store.schedulePlan.items, saved.items);
    assert.notEqual(store.schedulePlan.items[0], saved.items[0]);
    assert.notEqual(store.schedulePlan.items[0].payload, saved.items[0].payload);
    assert.notEqual(store.schedulePlan.items[0].comments, saved.items[0].comments);
    assert.deepEqual(store.schedulePlan.items, saved.items);
    assert.deepEqual(store.schedulePlan.dependencies, saved.dependencies);
    assert.deepEqual(store.schedulePlan.viewConfig, saved.viewConfig);
    assert.deepEqual(store.schedulePlan.summary, saved.summary);
    assert.equal(store.schedulePlan.projectId, 4001);

    store.schedulePlan.items[0].payload.note = "mutated after apply";
    assert.equal(saved.items[0].payload.note, "保存完整 payload");
  });

  it("saves the current schedule into a default schedule template and imports the first one", () => {
    const { store, schedulePlan } = createScheduleTemplateMockStore();
    store.templates = [];
    store.schedulePlan = schedulePlan;

    const templateName = store.saveCurrentScheduleAsTemplate();

    assert.equal(templateName, "当前排期模板");
    assert.equal(store.templates[0].kind, "schedule");
    assert.deepEqual(store.templates[0].templateSchedules[templateName].items, schedulePlan.items);

    store.schedulePlan = { items: [], dependencies: [], viewConfig: {}, summary: {} };
    assert.equal(store.applyFirstScheduleTemplateToActiveProject(), true);
    assert.deepEqual(store.schedulePlan.items, schedulePlan.items);
    assert.equal(store.schedulePlan.projectId, 4001);
  });

  it("syncs template group and child CRUD through workspace template APIs", async () => {
    const calls = [];
    globalThis.window = {};
    workspaceApi.createTemplate = async (payload) => {
      calls.push(["createTemplate", payload]);
      return { template: { id: payload.id || payload.templateId } };
    };
    workspaceApi.updateTemplate = async (templateId, payload) => {
      calls.push(["updateTemplate", templateId, payload]);
      return { template: { id: templateId, ...payload } };
    };
    workspaceApi.deleteTemplate = async (templateId) => {
      calls.push(["deleteTemplate", templateId]);
      return { ok: true };
    };
    const store = {
      templates: [],
      templateShareInfo: {},
      currentUser: { id: "user-a", name: "测试用户" },
      currentUserId: "user-a",
      toasts: [],
      showToast(message) {
        this.toasts.push(message);
      },
      collapseTemplateOpen() {},
      switchToTemplateView(groupIndex, childIndex) {
        this.activeTemplateGroupIndex = groupIndex;
        this.activeTemplateChildIndex = childIndex;
      },
      findTemplate: findTemplateInStore
    };
    store.addTemplateGroup = templateActions.addTemplateGroup.bind(store);
    store.addTemplateToGroup = templateActions.addTemplateToGroup.bind(store);
    store.renameTemplateGroup = templateActions.renameTemplateGroup.bind(store);
    store.deleteTemplateGroup = templateActions.deleteTemplateGroup.bind(store);
    store.renameTemplate = templateActions.renameTemplate.bind(store);
    store.deleteTemplate = templateActions.deleteTemplate.bind(store);

    assert.equal(store.addTemplateGroup("Task templates"), true);
    await flushBackgroundSync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "createTemplate");
    assert.equal(calls[0][1].id, store.templates[0].id);
    assert.equal(calls[0][1].title, "Task templates");
    assert.equal(calls[0][1].kind, "task");
    assert.equal(calls[0][1].isGroup, true);

    assert.equal(store.addTemplateToGroup(0, "Launch template"), true);
    await flushBackgroundSync();

    const childId = store.templates[0].templateIds["Launch template"];
    assert.ok(childId);
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0], "createTemplate");
    assert.equal(calls[1][1].id, childId);
    assert.equal(calls[1][1].title, "Launch template");
    assert.equal(calls[1][1].kind, "task");
    assert.equal(calls[1][1].parentTemplateId, store.templates[0].id);
    assert.deepEqual(calls[1][1].template, []);

    const groupId = store.templates[0].templateId;
    assert.equal(store.renameTemplateGroup(0, "Renamed templates"), true);
    await flushBackgroundSync();

    assert.equal(calls.length, 3);
    assert.equal(calls[2][0], "updateTemplate");
    assert.equal(calls[2][1], groupId);
    assert.equal(calls[2][2].title, "Renamed templates");
    assert.equal(calls[2][2].isGroup, true);

    assert.equal(store.renameTemplate("Launch template", "Project launch"), true);
    await flushBackgroundSync();

    assert.equal(store.templates[0].templateIds["Project launch"], childId);
    assert.equal(store.templates[0].templateIds["Launch template"], undefined);
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[3], [
      "updateTemplate",
      childId,
      {
        id: childId,
        templateId: childId,
        title: "Project launch",
        kind: "task",
        parentTemplateId: store.templates[0].id,
        groupId: store.templates[0].id,
        groupKey: "task",
        visibility: "private",
        content: [],
        template: [],
        taskCount: 0,
        payload: {
          kind: "task",
          isGroup: false,
          groupTitle: "Renamed templates",
          ownerName: ""
        }
      }
    ]);

    store.deleteTemplate("Project launch");
    await flushBackgroundSync();

    assert.equal(calls.length, 5);
    assert.deepEqual(calls[4], ["deleteTemplate", childId]);

    store.deleteTemplateGroup(0);
    await flushBackgroundSync();

    assert.equal(calls.length, 6);
    assert.deepEqual(calls[5], ["deleteTemplate", groupId]);
  });

  it("syncs template sharing and schedule template saves through workspace template APIs", async () => {
    const calls = [];
    globalThis.window = {};
    workspaceApi.updateTemplate = async (templateId, payload) => {
      calls.push(["updateTemplate", templateId, payload]);
      return { template: { id: templateId, ...payload } };
    };
    workspaceApi.shareTemplate = async (templateId, entries) => {
      calls.push(["shareTemplate", templateId, entries]);
      return { template: { id: templateId } };
    };
    workspaceApi.unshareTemplate = async (templateId, userId) => {
      calls.push(["unshareTemplate", templateId, userId]);
      return { template: { id: templateId } };
    };
    const schedulePlan = {
      title: "Schedule source",
      items: [{ id: "si-1", title: "Milestone" }],
      dependencies: [],
      viewConfig: { defaultView: "timeline", dayWidth: 32, rowHeight: 38 },
      summary: { itemCount: 1 }
    };
    const store = {
      templates: [
        {
          id: "schedule-group-1",
          title: "Schedule templates",
          kind: "schedule",
          children: ["Schedule template"],
          templateIds: { "Schedule template": "schedule-template-1" },
          templateSchedules: { "Schedule template": { items: [] } },
          templateTasks: {}
        }
      ],
      templateShareInfo: {},
      currentUser: { id: "user-a", name: "测试用户" },
      currentUserId: "user-a",
      showToast() {},
      findTemplate: findTemplateInStore
    };
    store.saveScheduleTemplate = templateActions.saveScheduleTemplate.bind(store);
    store.shareTemplate = templateActions.shareTemplate.bind(store);
    store.unshareTemplate = templateActions.unshareTemplate.bind(store);

    assert.equal(store.saveScheduleTemplate("Schedule template", schedulePlan), true);
    await flushBackgroundSync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "updateTemplate");
    assert.equal(calls[0][1], "schedule-template-1");
    assert.equal(calls[0][2].title, "Schedule template");
    assert.equal(calls[0][2].kind, "schedule");
    assert.equal(calls[0][2].parentTemplateId, "schedule-group-1");
    assert.deepEqual(calls[0][2].template.items, schedulePlan.items);

    assert.equal(store.shareTemplate("Schedule template", "user-b"), true);
    await flushBackgroundSync();

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], [
      "shareTemplate",
      "schedule-template-1",
      [{ userId: "user-b", userName: "user-b", permission: "read" }]
    ]);

    assert.equal(store.unshareTemplate("Schedule template", "user-b"), true);
    await flushBackgroundSync();

    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2], ["unshareTemplate", "schedule-template-1", "user-b"]);
  });

  it("syncs template sharing permissions for editable and readonly recipients", async () => {
    const calls = [];
    globalThis.window = {};
    workspaceApi.shareTemplate = async (templateId, entries) => {
      calls.push(["shareTemplate", templateId, entries]);
      return { template: { id: templateId } };
    };
    const store = {
      templates: [
        {
          id: "task-group-1",
          title: "Task templates",
          kind: "task",
          children: ["Task template"],
          templateIds: { "Task template": "task-template-1" },
          templateTasks: { "Task template": [] }
        }
      ],
      templateShareInfo: {},
      showToast() {},
      findTemplate: findTemplateInStore
    };
    store.shareTemplate = templateActions.shareTemplate.bind(store);

    assert.equal(store.shareTemplate("Task template", { userId: "user-b", userName: "User B", permission: "edit" }), true);
    await flushBackgroundSync();

    assert.deepEqual(store.templateShareInfo["Task template"].sharedWith, ["User B"]);
    assert.deepEqual(store.templateShareInfo["Task template"].permissions, { "user-b": "edit" });
    assert.deepEqual(calls[0], [
      "shareTemplate",
      "task-template-1",
      [{ userId: "user-b", userName: "User B", permission: "edit" }]
    ]);

    assert.equal(store.shareTemplate("Task template", { userId: "user-c", userName: "User C", permission: "read" }), true);
    await flushBackgroundSync();

    assert.deepEqual(store.templateShareInfo["Task template"].sharedWith, ["User B", "User C"]);
    assert.deepEqual(store.templateShareInfo["Task template"].permissions, { "user-b": "edit", "user-c": "read" });
    assert.deepEqual(calls[1], [
      "shareTemplate",
      "task-template-1",
      [
        { userId: "user-b", userName: "User B", permission: "edit" },
        { userId: "user-c", userName: "User C", permission: "read" }
      ]
    ]);
  });

  it("syncs moving a template between groups by updating the child and both groups", async () => {
    const calls = [];
    globalThis.window = {};
    workspaceApi.updateTemplate = async (templateId, payload) => {
      calls.push(["updateTemplate", templateId, payload]);
      return { template: { id: templateId, ...payload } };
    };
    const store = {
      templates: [
        {
          id: "group-a",
          templateId: "group-a",
          title: "Group A",
          kind: "task",
          children: ["Moved template"],
          templateIds: { "Moved template": "template-a" },
          templateTasks: { "Moved template": [{ id: 1, title: "Task" }] },
          templateSchedules: {}
        },
        {
          id: "group-b",
          templateId: "group-b",
          title: "Group B",
          kind: "task",
          children: [],
          templateIds: {},
          templateTasks: {},
          templateSchedules: {}
        }
      ],
      query: "moved",
      showToast() {},
      findTemplate: findTemplateInStore
    };
    store.moveTemplate = templateActions.moveTemplate.bind(store);

    assert.equal(store.moveTemplate("Moved template", 1), true);
    await flushBackgroundSync();

    assert.deepEqual(store.templates[0].children, []);
    assert.deepEqual(store.templates[1].children, ["Moved template"]);
    assert.deepEqual(store.templates[1].templateTasks["Moved template"], [{ id: 1, title: "Task" }]);
    assert.equal(store.templates[1].templateIds["Moved template"], "template-a");
    assert.equal(store.templates[0].templateTasks["Moved template"], undefined);
    assert.equal(store.templates[0].templateIds["Moved template"], undefined);
    assert.equal(store.query, "");
    assert.equal(calls.length, 3);
    assert.equal(calls[0][0], "updateTemplate");
    assert.equal(calls[0][1], "template-a");
    assert.equal(calls[0][2].parentTemplateId, "group-b");
    assert.deepEqual(calls.slice(1).map((call) => call[1]), ["group-a", "group-b"]);
  });

  it("syncs saving the current schedule as a new schedule template", async () => {
    const { store, schedulePlan } = createScheduleTemplateMockStore();
    const createPayloads = [];
    globalThis.window = {};
    workspaceApi.createTemplate = async (payload) => {
      createPayloads.push(payload);
      return { template: { id: payload.id || payload.templateId } };
    };
    store.templates = [];
    store.schedulePlan = schedulePlan;

    const templateName = store.saveCurrentScheduleAsTemplate();
    await flushBackgroundSync();

    assert.equal(templateName, "当前排期模板");
    assert.equal(createPayloads.length, 2);
    assert.equal(createPayloads[0].id, store.templates[0].id);
    assert.equal(createPayloads[0].kind, "schedule");
    assert.equal(createPayloads[0].isGroup, true);
    assert.equal(createPayloads[1].title, templateName);
    assert.equal(createPayloads[1].kind, "schedule");
    assert.equal(createPayloads[1].parentTemplateId, store.templates[0].id);
    assert.deepEqual(createPayloads[1].template.items, schedulePlan.items);
  });
});
