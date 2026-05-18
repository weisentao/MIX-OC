import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import workspaceApi from "../../../../services/workspaceApi.js";
import { workspaceGetters } from "../../getters.js";
import { coreActions } from "../coreActions.js";
import { projectActions } from "../projectActions.js";
import { templateActions } from "../templateActions.js";
import { userActions } from "../userActions.js";

const originalCreateContact = workspaceApi.createContact;
const originalDeleteContact = workspaceApi.deleteContact;
const originalWindow = globalThis.window;
const originalConsoleWarn = console.warn;

afterEach(() => {
  workspaceApi.createContact = originalCreateContact;
  workspaceApi.deleteContact = originalDeleteContact;
  console.warn = originalConsoleWarn;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function flushBackgroundSync() {
  return new Promise((resolve) => setImmediate(resolve));
}

function attachProjectGetters(store) {
  Object.defineProperties(store, {
    allProjects: {
      configurable: true,
      get() {
        return workspaceGetters.allProjects(store);
      }
    },
    activeProject: {
      configurable: true,
      get() {
        return workspaceGetters.activeProject.call(store);
      }
    },
    activeMembersDetailed: {
      configurable: true,
      get() {
        return workspaceGetters.activeMembersDetailed.call(store);
      }
    }
  });
  store.findProjectWithGroup = coreActions.findProjectWithGroup.bind(store);
  store.getProjectGroup = coreActions.getProjectGroup.bind(store);
  store.getUserByName = coreActions.getUserByName.bind(store);
  return store;
}

function createContactStore() {
  return {
    currentUser: { id: "u-owner", name: "Owner" },
    users: [
      { id: "u-owner", name: "Owner", role: "manager" },
      {
        id: "u-target",
        username: "target",
        name: "Target User",
        role: "employee",
        department: "Design",
        job: "Artist",
        phone: "13800000000",
        email: "target@example.com"
      }
    ],
    contacts: [],
    toasts: [],
    getUser(userId) {
      return this.users.find((user) => user.id === userId) || null;
    },
    showToast(message) {
      this.toasts.push(message);
    }
  };
}

describe("team17 demand flow coverage", () => {
  it("activates a task template without leaking previous project state", () => {
    const group = {
      id: "template-group-1",
      title: "Task templates",
      kind: "task",
      children: ["Launch checklist"],
      templateTasks: {}
    };
    const store = {
      templates: [group],
      activeProjectId: "project-1",
      activeSection: "home",
      activeView: "project",
      activeFilter: "done"
    };

    templateActions.switchToTemplateView.call(store, 0, 0);

    assert.equal(store.activeTemplateGroupIndex, 0);
    assert.equal(store.activeTemplateChildIndex, 0);
    assert.equal(store.activeSection, "flow");
    assert.equal(store.activeView, "template");
    assert.equal(store.activeFilter, "all");
    assert.equal(store.activeProjectId, null);
    assert.deepEqual(group.templateTasks["Launch checklist"], []);
  });

  it("activates a schedule template with saved view config as an isolated copy", () => {
    const savedPlan = {
      title: "Sprint schedule",
      startDate: "2026/05/01",
      endDate: "2026/05/10",
      items: [{ id: "si-1", title: "Kickoff" }],
      dependencies: [],
      viewConfig: { defaultView: "table", dayWidth: 44, rowHeight: 38 },
      summary: { itemCount: 1, pendingCount: 1 }
    };
    const store = {
      templates: [
        {
          id: "schedule-group-1",
          title: "Schedule templates",
          kind: "schedule",
          children: ["Sprint schedule"],
          templateSchedules: { "Sprint schedule": savedPlan },
          templateTasks: {}
        }
      ],
      scheduleUi: { view: "timeline", dayWidth: 28, rowHeight: 34 },
      activeProjectId: "project-1"
    };

    templateActions.switchToTemplateView.call(store, 0, 0);

    assert.equal(store.activeSection, "schedule");
    assert.equal(store.activeView, "schedule-template");
    assert.equal(store.activeFilter, "all");
    assert.equal(store.query, "");
    assert.deepEqual(store.scheduleUi, {
      view: "table",
      dayWidth: 44,
      rowHeight: 38,
      visibleStartDate: "2026/05/01",
      visibleEndDate: "2026/05/10",
      source: "schedule-template"
    });
    assert.deepEqual(store.schedulePlan.items, savedPlan.items);
    assert.notEqual(store.schedulePlan.items, savedPlan.items);

    store.schedulePlan.items[0].title = "Changed locally";
    assert.equal(savedPlan.items[0].title, "Kickoff");
  });

  it("persists the current schedule into an editable template before locked shared sections", () => {
    const store = {
      templates: [{ id: "shared-section", title: "Shared with me", locked: true }],
      currentUser: { id: "u-owner", name: "Owner" },
      currentUserId: "u-owner",
      activeProject: { id: "project-1", name: "Alpha" },
      schedulePlan: {
        title: "Alpha source",
        items: [{ id: "si-1", title: "Design" }],
        dependencies: [],
        viewConfig: { defaultView: "timeline", dayWidth: 32, rowHeight: 36 },
        summary: { itemCount: 1 }
      },
      showToast() {}
    };

    const templateName = templateActions.saveCurrentScheduleAsTemplate.call(store, "Alpha schedule");

    assert.equal(templateName, "Alpha schedule");
    assert.equal(store.templates[0].kind, "schedule");
    assert.equal(store.templates[1].locked, true);
    assert.deepEqual(store.templates[0].children, ["Alpha schedule"]);
    assert.deepEqual(store.templates[0].templateSchedules["Alpha schedule"].items, store.schedulePlan.items);
    assert.notEqual(store.templates[0].templateSchedules["Alpha schedule"].items, store.schedulePlan.items);
  });

  it("refreshes project-scoped members after switching projects", () => {
    const store = attachProjectGetters({
      rootProjects: [
        {
          id: "project-a",
          name: "Project A",
          status: "active",
          members: ["Alice"],
          memberRoles: { Alice: "manager" },
          tasks: []
        },
        {
          id: "project-b",
          name: "Project B",
          status: "active",
          members: ["Bob", "Carol"],
          memberRoles: { Bob: "editor", Carol: "readonly" },
          tasks: []
        }
      ],
      projectGroups: [],
      users: [
        { id: "u-alice", name: "Alice", department: "PM" },
        { id: "u-bob", name: "Bob", department: "Design" },
        { id: "u-carol", name: "Carol", department: "Production" }
      ],
      activeProjectId: "project-a",
      activeSection: "flow",
      activeView: "template",
      showToast() {}
    });

    assert.deepEqual(store.activeMembersDetailed.map((member) => member.name), ["Alice"]);

    coreActions.selectProject.call(store, "project-b");

    assert.equal(store.activeProjectId, "project-b");
    assert.equal(store.activeView, "project");
    assert.deepEqual(
      store.activeMembersDetailed.map((member) => [member.name, member.role, member.department]),
      [
        ["Bob", "editor", "Design"],
        ["Carol", "readonly", "Production"]
      ]
    );
  });

  it("parses comma-separated project members as a batch and assigns default roles", () => {
    const project = {
      id: "project-1",
      name: "Alpha",
      group: "Root",
      status: "active",
      tags: [],
      owner: "",
      members: ["Owner"],
      memberRoles: { Owner: "manager" },
      tasks: []
    };
    const store = attachProjectGetters({
      rootProjects: [project],
      projectGroups: [],
      activeProjectId: "project-1",
      showToast() {}
    });

    const updated = projectActions.updateProjectFromForm.call(store, "project-1", {
      mode: "root",
      groupTitle: "Root",
      name: "Alpha",
      members: "Owner,Designer,Producer",
      tags: "",
      syncSchedule: true
    });

    assert.equal(updated, true);
    assert.deepEqual(project.members, ["Owner", "Designer", "Producer"]);
    assert.equal(project.memberRoles.Owner, "manager");
    assert.equal(project.memberRoles.Designer, "readonly");
    assert.equal(project.memberRoles.Producer, "readonly");
  });

  it("hydrates care contacts with the backend contact id before removal", async () => {
    const calls = [];
    globalThis.window = {};
    workspaceApi.createContact = async (payload) => {
      calls.push(["createContact", payload]);
      return {
        id: "contact-1",
        contactId: "contact-1",
        userId: "u-target",
        name: "Target User",
        relationType: "care",
        status: "active"
      };
    };
    workspaceApi.deleteContact = async (contactId) => {
      calls.push(["deleteContact", contactId]);
      return { success: true };
    };
    const store = createContactStore();

    assert.equal(userActions.toggleCareContact.call(store, "u-target"), true);
    await flushBackgroundSync();
    assert.equal(store.contacts[0].contactId, "contact-1");

    assert.equal(userActions.toggleCareContact.call(store, "u-target"), false);
    await flushBackgroundSync();

    assert.deepEqual(calls, [
      ["createContact", { targetUserId: "u-target", relationType: "care" }],
      ["deleteContact", "contact-1"]
    ]);
    assert.deepEqual(store.contacts, []);
  });

  it("rolls back optimistic care contact creation when backend sync fails", async () => {
    globalThis.window = {};
    console.warn = () => {};
    workspaceApi.createContact = async () => {
      throw new Error("backend unavailable");
    };
    const store = createContactStore();

    assert.equal(userActions.toggleCareContact.call(store, "u-target"), true);
    assert.equal(store.contacts.length, 1);

    await flushBackgroundSync();

    assert.deepEqual(store.contacts, []);
    assert.equal(store.toasts.length, 2);
  });
});
