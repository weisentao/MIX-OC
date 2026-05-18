import { Router } from "express";
import { authRequired, requireRole, assertRoleCan } from "../../middlewares/auth.js";
import {
  addTaskComment,
  createProject,
  createTag,
  createTask,
  deleteTask,
  listProjectMembers,
  listProjects,
  listProjectTasks,
  listTags,
  updateProject,
  updateTask
} from "../../services/workspace.service.js";
import { createBoard, listBoards, updateBoard } from "../../services/board.service.js";
import {
  createScheduleExport,
  createScheduleTemplate,
  getProjectSchedule,
  listScheduleTemplates
} from "../../services/schedule.service.js";
import { getResourceSnapshot } from "../hr/hr.service.js";
import { writeAuditLog } from "../admin/admin.service.js";

const router = Router();
const MANAGER_ROLES = ["admin", "manager", "department_admin", "department_manager", "project_manager"];

router.use("/manager", authRequired, requireRole(MANAGER_ROLES));

function actorId(auth = {}) {
  return String(auth.sub || auth.id || auth.userUid || auth.user_uid || auth.username || "").trim();
}

function makeOperationId(prefix = "mgr-op") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cleanText(value = "") {
  return String(value ?? "").trim();
}

function managerReviewResult({ action, resourceType, resourceId, payload = {}, extra = {} }) {
  return {
    ok: true,
    pendingAdminReview: true,
    operationId: makeOperationId("mgr-review"),
    action,
    resourceType,
    resourceId,
    auditIntent: {
      action,
      resourceType,
      resourceId
    },
    changes: payload,
    ...extra
  };
}

function normalizeProjectMemberRole(role = "") {
  const clean = cleanText(role).toLowerCase();
  if (["admin", "super_admin", "superadmin", "root"].includes(clean)) {
    throw badRequest("manager cannot grant admin role");
  }
  if (["manager", "editor", "readonly"].includes(clean)) return clean;
  if (["write", "edit"].includes(clean)) return "editor";
  if (["read", "view", "viewer"].includes(clean)) return "readonly";
  if (!clean) return "";
  throw badRequest("project member role is invalid");
}

async function safeAudit(auth = {}, entry = {}) {
  try {
    return await writeAuditLog({
      auth,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      resourceName: entry.resourceName || "",
      before: entry.before || null,
      after: entry.after || null,
      summary: entry.summary || `Manager ${entry.action || "operation"}`
    });
  } catch {
    return null;
  }
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function projectNumericId(project = {}) {
  const value = Number(project.id || project.legacyProjectId || 0);
  return Number.isFinite(value) ? value : 0;
}

function taskRows(projects = []) {
  return projects.flatMap((project) =>
    rowsOf(project.tasks).map((task) => ({
      ...task,
      projectId: task.projectId || project.projectId || project.id,
      projectName: task.projectName || project.name
    }))
  );
}

function commentRows(projects = []) {
  return taskRows(projects).flatMap((task) =>
    rowsOf(task.comments).map((comment) => ({
      ...comment,
      projectId: comment.projectId || task.projectId,
      projectName: comment.projectName || task.projectName,
      taskId: comment.taskId || task.taskId || task.id,
      taskTitle: comment.taskTitle || task.title
    }))
  );
}

function archivedRows(projects = []) {
  const tasks = taskRows(projects);
  return {
    projects: projects.filter((project) => project.archived || project.status === "archived"),
    tasks: tasks.filter((task) => task.archived || task.status === "archived"),
    accounts: []
  };
}

function filterByProject(rows = [], projectId = "") {
  const clean = String(projectId || "").trim();
  if (!clean) return rows;
  return rows.filter((row) =>
    [row.projectId, row.projectUid, row.project_uid].some((value) => String(value || "").trim() === clean)
  );
}

async function getProjectsForManager(auth = {}) {
  return rowsOf(await listProjects(auth));
}

async function getManagerModel(auth = {}, query = {}) {
  const [projects, resources, boards, templates, tags] = await Promise.all([
    getProjectsForManager(auth),
    getResourceSnapshot(query, auth),
    listBoards(auth, query),
    listScheduleTemplates(auth),
    listTags()
  ]);
  const tasks = taskRows(projects);
  const comments = commentRows(projects);
  const people = rowsOf(resources.people);
  const activeProjects = projects.filter((project) => project.status !== "archived" && !project.archived);
  const archives = archivedRows(projects);

  return {
    scope: resources.scope || resources.resourcePermissions?.scope || {},
    overview: {
      activeProjects: activeProjects.length,
      archivedProjects: archives.projects.length,
      members: people.length,
      tasks: tasks.length,
      activeTasks: tasks.filter((task) => !task.archived && task.status !== "archived").length,
      archivedTasks: archives.tasks.length,
      comments: comments.length,
      boards: rowsOf(boards).length,
      templates: rowsOf(templates).length,
      tags: rowsOf(tags).length
    },
    department: {
      name: resources.scope?.department || auth.department || "",
      members: people,
      projects
    },
    members: people,
    memberDetail: people,
    projects: activeProjects,
    projectDetail: projects,
    tasks,
    comments,
    schedule: tasks.filter((task) => task.type === "排期" || task.startDate || task.endDate),
    permissions: projects.map((project) => ({
      projectId: project.projectId || project.id,
      projectName: project.name,
      currentRole: project.managerRole || "manager",
      canManage: true,
      canEdit: true,
      roles: Object.entries(project.memberRoles || {}).map(([name, role]) => ({ name, role }))
    })),
    boards: rowsOf(boards),
    templates: rowsOf(templates),
    tags: rowsOf(tags),
    archives,
    accounts: people
  };
}

async function sendManagerModel(req, res, selector = (model) => model) {
  const model = await getManagerModel(req.auth || {}, req.query || {});
  res.json(selector(model));
}

router.get("/manager/overview", async (req, res, next) => {
  try {
    await sendManagerModel(req, res, (model) => model);
  } catch (error) {
    next(error);
  }
});

router.get("/manager/departments/:departmentId", async (req, res, next) => {
  try {
    await sendManagerModel(req, res, (model) => ({
      ...model.department,
      id: req.params.departmentId,
      departmentId: req.params.departmentId
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/manager/members", async (req, res, next) => {
  try {
    await sendManagerModel(req, res, (model) => model.members);
  } catch (error) {
    next(error);
  }
});

router.get("/manager/members/:userId", async (req, res, next) => {
  try {
    await sendManagerModel(req, res, (model) =>
      model.members.find((member) => String(member.id || member.userId || member.username) === String(req.params.userId)) || null
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/manager/members/:userId", async (req, res, next) => {
  try {
    const result = managerReviewResult({
      action: "member.update.request",
      resourceType: "users",
      resourceId: req.params.userId,
      payload: req.body || {},
      extra: { id: req.params.userId }
    });
    result.auditLogId = await safeAudit(req.auth || {}, {
      action: "request_update",
      resourceType: "manager.users",
      resourceId: req.params.userId,
      after: req.body || {},
      summary: "Manager requested member update"
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/manager/members/:userId/reset-password", async (req, res, next) => {
  try {
    const result = managerReviewResult({
      action: "member.password_reset.request",
      resourceType: "users",
      resourceId: req.params.userId,
      payload: { reason: req.body?.reason || "" },
      extra: { id: req.params.userId, queued: true, reason: req.body?.reason || "" }
    });
    result.auditLogId = await safeAudit(req.auth || {}, {
      action: "request_password_reset",
      resourceType: "manager.users",
      resourceId: req.params.userId,
      after: { reason: req.body?.reason || "" },
      summary: "Manager requested password reset"
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects", async (req, res, next) => {
  try {
    res.json(await getProjectsForManager(req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects", async (req, res, next) => {
  try {
    res.status(201).json(await createProject(req.body || {}, actorId(req.auth || {})));
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId", async (req, res, next) => {
  try {
    const projects = await getProjectsForManager(req.auth || {});
    const project = projects.find((item) =>
      [item.id, item.projectId, item.legacyProjectId].some((value) => String(value || "").trim() === String(req.params.projectId))
    );
    res.json(project || null);
  } catch (error) {
    next(error);
  }
});

router.patch("/manager/projects/:projectId", async (req, res, next) => {
  try {
    res.json(await updateProject(req.params.projectId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects/:projectId/archive", async (req, res, next) => {
  try {
    res.json(await updateProject(req.params.projectId, { ...(req.body || {}), archived: true, status: "archived" }, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.delete("/manager/projects/:projectId", async (req, res, next) => {
  try {
    res.json(await updateProject(req.params.projectId, { ...(req.body || {}), archived: true, status: "archived" }, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId/tasks", async (req, res, next) => {
  try {
    res.json(await listProjectTasks(req.params.projectId, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects/:projectId/tasks", async (req, res, next) => {
  try {
    res.status(201).json(await createTask(req.params.projectId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.patch("/manager/tasks/:taskId", async (req, res, next) => {
  try {
    res.json(await updateTask(req.params.taskId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.delete("/manager/tasks/:taskId", async (req, res, next) => {
  try {
    if (req.body?.soft !== false) {
      res.json(await updateTask(req.params.taskId, { archived: true, status: "archived" }, req.auth || {}));
      return;
    }
    res.json(await deleteTask(req.params.taskId, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId/comments", async (req, res, next) => {
  try {
    const tasks = await listProjectTasks(req.params.projectId, req.auth || {});
    res.json(commentRows([{ projectId: req.params.projectId, tasks }]));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/comments/:commentId/resolve", async (req, res, next) => {
  try {
    const result = managerReviewResult({
      action: "comment.resolve.request",
      resourceType: "comments",
      resourceId: req.params.commentId,
      payload: req.body || {},
      extra: { id: req.params.commentId, resolved: false }
    });
    result.auditLogId = await safeAudit(req.auth || {}, {
      action: "request_resolve",
      resourceType: "manager.comments",
      resourceId: req.params.commentId,
      after: req.body || {},
      summary: "Manager requested comment resolve"
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId/schedule", async (req, res, next) => {
  try {
    res.json(await getProjectSchedule(req.params.projectId, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects/:projectId/schedule/export", async (req, res, next) => {
  try {
    res.status(201).json(await createScheduleExport(req.params.projectId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId/members", async (req, res, next) => {
  try {
    res.json(await listProjectMembers(req.params.projectId, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.patch("/manager/projects/:projectId/members/:userId", async (req, res, next) => {
  try {
    const role = normalizeProjectMemberRole(req.body?.role || req.body?.memberRole || req.body?.permission);
    const changes = { ...(req.body || {}), role: role || req.body?.role };
    const result = managerReviewResult({
      action: "project_member.role_update.request",
      resourceType: "project_members",
      resourceId: `${req.params.projectId}:${req.params.userId}`,
      payload: changes,
      extra: {
        projectId: req.params.projectId,
        userId: req.params.userId,
        role
      }
    });
    result.auditLogId = await safeAudit(req.auth || {}, {
      action: "request_member_role_update",
      resourceType: "manager.project_members",
      resourceId: `${req.params.projectId}:${req.params.userId}`,
      after: changes,
      summary: "Manager requested project member role update"
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId/boards", async (req, res, next) => {
  try {
    res.json(filterByProject(rowsOf(await listBoards(req.auth || {}, req.query || {})), req.params.projectId));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects/:projectId/boards", async (req, res, next) => {
  try {
    res.status(201).json(await createBoard({ ...(req.body || {}), projectId: req.params.projectId }, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.patch("/manager/projects/:projectId/boards/:boardId", async (req, res, next) => {
  try {
    res.json(await updateBoard(req.params.boardId, { ...(req.body || {}), projectId: req.params.projectId }, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId/templates", async (req, res, next) => {
  try {
    res.json(rowsOf(await listScheduleTemplates(req.auth || {})));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects/:projectId/templates", async (req, res, next) => {
  try {
    res.status(201).json(await createScheduleTemplate({ ...(req.body || {}), projectId: req.params.projectId }, req.auth || {}));
  } catch (error) {
    next(error);
  }
});

router.get("/manager/projects/:projectId/tags-archives", async (req, res, next) => {
  try {
    const projects = await getProjectsForManager(req.auth || {});
    const tags = rowsOf(await listTags());
    res.json({ tags, archives: archivedRows(projects), projectId: req.params.projectId });
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects/:projectId/tags", async (req, res, next) => {
  try {
    assertRoleCan(req.auth || {}, "write");
    res.status(201).json(await createTag(req.body || {}, actorId(req.auth || {})));
  } catch (error) {
    next(error);
  }
});

router.post("/manager/projects/:projectId/tags/:tagId/archive", async (req, res, next) => {
  try {
    const result = managerReviewResult({
      action: "project_tag.archive.request",
      resourceType: "project_tags",
      resourceId: `${req.params.projectId}:${req.params.tagId}`,
      payload: req.body || {},
      extra: {
        projectId: req.params.projectId,
        tagId: req.params.tagId,
        archived: false,
        globalDeleteBlocked: true
      }
    });
    result.auditLogId = await safeAudit(req.auth || {}, {
      action: "request_project_tag_archive",
      resourceType: "manager.project_tags",
      resourceId: `${req.params.projectId}:${req.params.tagId}`,
      after: req.body || {},
      summary: "Manager requested project tag archive without global deletion"
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/manager/accounts", async (req, res, next) => {
  try {
    const resources = await getResourceSnapshot(req.query || {}, req.auth || {});
    res.json(rowsOf(resources.people));
  } catch (error) {
    next(error);
  }
});

export default router;
