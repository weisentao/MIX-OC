import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appActions } from "../actions/appActions.js";
import { workspaceGetters } from "../getters.js";
import { claimUnownedTemplateGroups, templatePermissionForUser, visibleTemplatesForUser } from "../templateOwnership.js";

describe("template visibility", () => {
  it("shows only the current user's private template groups plus shared groups", () => {
    const templates = [
      { title: "用户A的模板", ownerId: "user-a", ownerName: "用户A", children: [] },
      { title: "我的模板", ownerId: "user-b", ownerName: "用户B", children: [] },
      { title: "共享给我的模版", locked: true, children: [] }
    ];

    assert.deepEqual(visibleTemplatesForUser(templates, { id: "user-b", name: "用户B" }).map((template) => template.title), ["我的模板", "共享给我的模版"]);
  });

  it("keeps shared template groups visible for recipients and respects permission levels", () => {
    const templates = [
      {
        title: "任务模板目录",
        ownerId: "owner-1",
        ownerName: "Owner",
        kind: "task",
        children: ["只读模板", "可编辑模板"],
        templateTasks: {
          "只读模板": [],
          "可编辑模板": []
        }
      }
    ];
    const templateShareInfo = {
      "只读模板": {
        shared: true,
        sharedWith: ["User B"],
        recipients: [{ userId: "user-b", userName: "User B", permission: "read" }],
        permissions: { "user-b": "read" }
      },
      "可编辑模板": {
        shared: true,
        sharedWith: ["User B"],
        recipients: [{ userId: "user-b", userName: "User B", permission: "edit" }],
        permissions: { "user-b": "edit" }
      }
    };
    const user = { id: "user-b", name: "User B" };

    const visible = visibleTemplatesForUser(templates, user, { templateShareInfo });
    assert.equal(visible.length, 1);
    assert.equal(visible[0].title, "任务模板目录");
    assert.equal(templatePermissionForUser("只读模板", templateShareInfo, user), "read");
    assert.equal(templatePermissionForUser("可编辑模板", templateShareInfo, user), "edit");
  });

  it("allows editing schedule template view for edit recipients but blocks read recipients", () => {
    const baseStore = {
      activeView: "schedule-template",
      currentUser: { id: "user-b", name: "User B" },
      activeTemplateGroupIndex: 0,
      activeTemplateChildIndex: 0,
      templates: [
        {
          id: "schedule-group",
          title: "项目排期模板",
          kind: "schedule",
          ownerId: "owner-1",
          ownerName: "Owner",
          children: ["排期模板A"],
          templateSchedules: { "排期模板A": { items: [] } }
        }
      ],
      get activeTemplate() {
        return workspaceGetters.activeTemplate.call(this);
      },
      get activeTemplateName() {
        return workspaceGetters.activeTemplateName.call(this);
      }
    };
    const readonlyStore = {
      ...baseStore,
      templateShareInfo: {
        排期模板A: {
          shared: true,
          recipients: [{ userId: "user-b", userName: "User B", permission: "read" }],
          permissions: { "user-b": "read" }
        }
      }
    };
    const editableStore = {
      ...baseStore,
      templateShareInfo: {
        排期模板A: {
          shared: true,
          recipients: [{ userId: "user-b", userName: "User B", permission: "edit" }],
          permissions: { "user-b": "edit" }
        }
      }
    };

    assert.equal(workspaceGetters.templateCanEdit.call(readonlyStore), false);
    assert.equal(workspaceGetters.templateCanEdit.call(editableStore), true);
  });

  it("claims unowned local template groups for the logged-in user", () => {
    const templates = [{ title: "旧无归属模板", kind: "task", children: [], templateTasks: {} }];

    assert.equal(claimUnownedTemplateGroups(templates, { id: "user-b", name: "用户B" }), true);
    assert.equal(templates[0].ownerId, "user-b");
    assert.equal(templates[0].ownerName, "用户B");
  });

  it("shows the selected schedule template name in the project title getter", () => {
    const store = {
      rootProjects: [],
      projectGroups: [],
      activeProjectId: null,
      activeView: "schedule-template",
      activeTemplateGroupIndex: 0,
      activeTemplateChildIndex: 0,
      templates: [
        {
          title: "项目排期模板",
          kind: "schedule",
          children: ["测试创建模板"],
          templateSchedules: {
            "测试创建模板": { items: [] }
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

    assert.equal(workspaceGetters.activeProjectName.call(store), "测试创建模板");
  });

  it("keeps flat schedule template items visible after workspace state normalization", () => {
    const store = {
      query: "",
      rootProjects: [],
      projectGroups: [],
      users: [{ id: "u-admin", name: "admin" }],
      contacts: [],
      tags: [],
      carouselNotices: [],
      boards: [],
      boardHistory: [],
      currentUserId: "u-admin",
      templates: [
        {
          id: "schedule-template-1",
          title: "测试创建模板",
          kind: "schedule",
          parentTemplateId: "schedule-group-1",
          groupTitle: "项目排期模板",
          content: { items: [{ id: "si-1", title: "节点" }], dependencies: [] }
        }
      ],
      treesOpen: {},
      allProjects: [],
      activeProject: null,
      activeProjects: [],
      get currentUser() {
        return this.users[0];
      },
      get visibleTemplates() {
        return workspaceGetters.visibleTemplates.call(this);
      },
      get scheduleTemplateGroups() {
        return workspaceGetters.scheduleTemplateGroups.call(this);
      }
    };

    appActions.normalizeLoadedState.call(store);

    assert.equal(store.scheduleTemplateGroups.length, 1);
    assert.equal(store.scheduleTemplateGroups[0].title, "项目排期模板");
    assert.deepEqual(store.scheduleTemplateGroups[0].children, ["测试创建模板"]);
    assert.deepEqual(store.scheduleTemplateGroups[0].templateSchedules["测试创建模板"].items, [{ id: "si-1", title: "节点" }]);
  });
});
