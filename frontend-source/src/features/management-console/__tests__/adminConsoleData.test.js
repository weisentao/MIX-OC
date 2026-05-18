import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdminConsoleModel } from "../data/adminConsoleData.js";

describe("admin console notices", () => {
  it("keeps announcement link fields in the admin notice rows", () => {
    const model = buildAdminConsoleModel({
      users: [],
      allProjects: [],
      boards: [],
      tags: [],
      templates: [],
      carouselNotices: [
        {
          id: "notice-1",
          title: "运营提示",
          text: "查看本周报表",
          type: "公告",
          interval: 4200,
          priority: 9,
          enabled: true,
          linkText: "报表",
          linkUrl: "/admin/reports/weekly",
          linkTarget: "_blank",
          startAt: "2026/05/17 08:30",
          endAt: "2026/05/18 18:45",
          updatedAt: "2026/05/17 10:20"
        }
      ]
    });

    assert.deepEqual(model.notices.rows[0], {
      id: "notice-1",
      title: "运营提示",
      text: "查看本周报表",
      type: "公告",
      interval: 4200,
      priority: 9,
      enabled: true,
      status: "healthy",
      linkText: "报表",
      linkUrl: "/admin/reports/weekly",
      linkTarget: "_blank",
      startAt: "2026/05/17 08:30",
      endAt: "2026/05/18 18:45",
      updatedAt: "2026/05/17 10:20"
    });
  });
});

describe("admin console users and projects", () => {
  it("keeps backend project uid as the project row id for admin delete actions", () => {
    const model = buildAdminConsoleModel({
      users: [],
      allProjects: [
        {
          projectUid: "project-uid-hr-1",
          project_id: "legacy-hr-1",
          name: "人力资源项目",
          groupTitle: "人力资源",
          ownerName: "人力负责人",
          members: [{ userId: "u-hr-1", name: "人力同学" }],
          memberRoles: { "u-hr-1": "manager" },
          tasks: []
        }
      ],
      boards: [],
      tags: [],
      templates: []
    });

    assert.equal(model.projects.rows[0].id, "project-uid-hr-1");
    assert.equal(model.projects.rows[0].group, "人力资源");
    assert.equal(model.projects.rows[0].owner, "人力负责人");
    assert.equal(model.projects.rows[0].memberCount, 1);
    assert.deepEqual(model.projects.rows[0].members, ["人力同学"]);
    assert.deepEqual(model.projects.rows[0].memberRoles, { 人力同学: "manager" });
  });

  it("counts user project membership from names, usernames, ids, and memberRoles", () => {
    const model = buildAdminConsoleModel({
      users: [
        { id: "u-hr-1", username: "hr01", name: "人力同学", department: "人力", role: "user" },
        { id: "u-design-1", username: "design01", name: "设计同学", department: "设计", role: "editor" }
      ],
      allProjects: [
        {
          id: "project-1",
          name: "跨部门项目",
          group: "人力资源",
          members: [{ userId: "u-hr-1", username: "hr01", name: "人力同学" }],
          memberRoles: { design01: "editor" },
          tasks: []
        }
      ],
      boards: [],
      tags: [],
      templates: []
    });

    const hrRow = model.users.rows.find((row) => row.id === "u-hr-1");
    const designRow = model.users.rows.find((row) => row.id === "u-design-1");
    const hrDepartment = model.departments.rows.find((row) => row.name === "人力");
    const designDepartment = model.departments.rows.find((row) => row.name === "设计");
    const designPermission = model.permissions.projectRows.find((row) => row.user === "设计同学");

    assert.equal(hrRow.projectCount, 1);
    assert.equal(designRow.projectCount, 1);
    assert.equal(hrDepartment.projectCount, 1);
    assert.equal(designDepartment.projectCount, 1);
    assert.equal(designPermission.role, "editor");
  });
});
