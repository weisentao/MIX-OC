import { Router } from "express";
import { authRequired } from "../../middlewares/auth.js";
import {
  archiveProject,
  getArchives,
  getAuditLogs,
  getBoards,
  getConfig,
  getDashboard,
  getDepartments,
  getNotices,
  getPermissions,
  getProject,
  getProjects,
  getRiskComments,
  getSchedules,
  getSystem,
  getTags,
  getTasks,
  getTemplates,
  getUser,
  getUsers,
  patchBoard,
  patchConfig,
  patchDepartment,
  patchNotice,
  patchPermissions,
  patchProject,
  patchTask,
  patchTemplate,
  patchUser,
  postDepartment,
  postNotice,
  postProject,
  postResolveRiskComment,
  postRestoreArchive,
  postTag,
  postTask,
  postTemplate,
  postUser,
  removeArchive,
  removeBoard,
  removeDepartment,
  removeNotice,
  removeProject,
  removeTag,
  removeTask,
  removeTemplate,
  removeUser
} from "./admin.controller.js";
import { __private__ } from "./admin.service.js";

const router = Router();

function requireAdmin(req, res, next) {
  try {
    __private__.assertAdminAccess(req.auth || {});
    next();
  } catch (error) {
    next(error);
  }
}

router.use("/admin", authRequired, requireAdmin);

router.get("/admin/dashboard", getDashboard);

router.get("/admin/users", getUsers);
router.post("/admin/users", postUser);
router.get("/admin/users/:userId", getUser);
router.patch("/admin/users/:userId", patchUser);
router.delete("/admin/users/:userId", removeUser);

router.get("/admin/permissions", getPermissions);
router.patch("/admin/permissions", patchPermissions);

router.get("/admin/projects", getProjects);
router.post("/admin/projects", postProject);
router.get("/admin/projects/:projectId", getProject);
router.patch("/admin/projects/:projectId", patchProject);
router.post("/admin/projects/:projectId/archive", archiveProject);
router.delete("/admin/projects/:projectId", removeProject);

router.get("/admin/tasks", getTasks);
router.post("/admin/tasks", postTask);
router.patch("/admin/tasks/:taskId", patchTask);
router.delete("/admin/tasks/:taskId", removeTask);

router.get("/admin/comments/risk", getRiskComments);
router.post("/admin/comments/:commentId/resolve", postResolveRiskComment);

router.get("/admin/schedules", getSchedules);

router.get("/admin/boards", getBoards);
router.patch("/admin/boards/:boardId", patchBoard);
router.delete("/admin/boards/:boardId", removeBoard);

router.get("/admin/templates", getTemplates);
router.post("/admin/templates", postTemplate);
router.patch("/admin/templates/:templateId", patchTemplate);
router.delete("/admin/templates/:templateId", removeTemplate);

router.get("/admin/tags", getTags);
router.post("/admin/tags", postTag);
router.delete("/admin/tags/:tagId", removeTag);

router.get("/admin/notices", getNotices);
router.post("/admin/notices", postNotice);
router.patch("/admin/notices/:noticeId", patchNotice);
router.delete("/admin/notices/:noticeId", removeNotice);

router.get("/admin/departments", getDepartments);
router.post("/admin/departments", postDepartment);
router.patch("/admin/departments/:departmentId", patchDepartment);
router.delete("/admin/departments/:departmentId", removeDepartment);

router.get("/admin/archives", getArchives);
router.post("/admin/archives/:archiveId/restore", postRestoreArchive);
router.delete("/admin/archives/:archiveId", removeArchive);

router.get("/admin/system/status", getSystem);
router.get("/admin/system/config", getConfig);
router.patch("/admin/system/config", patchConfig);

router.get("/admin/audit-logs", getAuditLogs);

export { requireAdmin };
export default router;
