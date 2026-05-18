import { Router } from "express";
import { authRequired, requirePermission } from "../middlewares/auth.js";
import { patchMe } from "../controllers/auth.controller.js";
import {
  getAddressBook,
  getCarouselNotices,
  getCommentSearch,
  getContactById,
  getContacts,
  getDepartments,
  getProjectGroups,
  getProjectMembers,
  getProjectShares,
  getProjects,
  getProjectTasks,
  getTags,
  getTaskComments,
  getWorkspaceBootstrap,
  deleteContact,
  postLegacyProjectTask,
  postContact,
  postProject,
  postProjectGroup,
  postProjectMembers,
  postProjectShare,
  postProjectTask,
  postTag,
  postTaskComment,
  putProjectMemberGroups,
  putProject,
  putProjectGroup,
  putTask,
  deleteProjectMembers,
  removeProject,
  removeProjectGroup,
  removeTag,
  removeTask
} from "../controllers/workspace.controller.js";
import {
  getBoardExport,
  getBoardById,
  getBoardHistoryById,
  getBoards,
  patchBoard,
  postBoardSync,
  postBoard,
  putBoardShares,
  removeBoard
} from "../controllers/board.controller.js";

const router = Router();
const requireWorkspaceRead = requirePermission("workspace.read");

router.get("/workspace/bootstrap", authRequired, requireWorkspaceRead, getWorkspaceBootstrap);
router.get("/workspace/notices/carousel", authRequired, requireWorkspaceRead, getCarouselNotices);
router.get("/notices/carousel", authRequired, requireWorkspaceRead, getCarouselNotices);

router.get("/comments/search", authRequired, getCommentSearch);
router.get("/workspace/comments/search", authRequired, getCommentSearch);

router.get("/address-book", authRequired, getAddressBook);
router.get("/departments", authRequired, getDepartments);
router.get("/contacts", authRequired, getContacts);
router.get("/contacts/:contactId", authRequired, getContactById);
router.post("/contacts", authRequired, postContact);
router.delete("/contacts/:contactId", authRequired, deleteContact);
router.get("/workspace/address-book", authRequired, getAddressBook);
router.get("/workspace/departments", authRequired, getDepartments);
router.get("/workspace/contacts", authRequired, getContacts);
router.get("/workspace/contacts/:contactId", authRequired, getContactById);
router.post("/workspace/contacts", authRequired, postContact);
router.delete("/workspace/contacts/:contactId", authRequired, deleteContact);
router.patch("/workspace/profile", authRequired, patchMe);

router.get("/project-groups", authRequired, getProjectGroups);
router.post("/project-groups", authRequired, postProjectGroup);
router.put("/project-groups/:id", authRequired, putProjectGroup);
router.delete("/project-groups/:id", authRequired, removeProjectGroup);
router.get("/workspace/project-groups", authRequired, getProjectGroups);
router.post("/workspace/project-groups", authRequired, postProjectGroup);
router.put("/workspace/project-groups/:id", authRequired, putProjectGroup);
router.delete("/workspace/project-groups/:id", authRequired, removeProjectGroup);

router.get("/projects", authRequired, getProjects);
router.post("/projects", authRequired, postProject);
router.put("/projects/:id", authRequired, putProject);
router.delete("/projects/:id", authRequired, removeProject);
router.get("/projects/:projectId/tasks", authRequired, getProjectTasks);
router.post("/projects/:projectId/tasks", authRequired, postProjectTask);
router.get("/projects/:projectId/members", authRequired, getProjectMembers);
router.post("/projects/:projectId/members", authRequired, postProjectMembers);
router.delete("/projects/:projectId/members", authRequired, deleteProjectMembers);
router.put("/projects/:projectId/members/groups", authRequired, putProjectMemberGroups);
router.get("/projects/:projectId/shares", authRequired, getProjectShares);
router.post("/projects/:projectId/shares", authRequired, postProjectShare);
router.get("/workspace/projects", authRequired, getProjects);
router.post("/workspace/projects", authRequired, postProject);
router.put("/workspace/projects/:id", authRequired, putProject);
router.delete("/workspace/projects/:id", authRequired, removeProject);
router.post("/workspace/projects/tasks", authRequired, postLegacyProjectTask);
router.get("/workspace/projects/:projectId/tasks", authRequired, getProjectTasks);
router.post("/workspace/projects/:projectId/tasks", authRequired, postProjectTask);
router.get("/workspace/projects/:projectId/members", authRequired, getProjectMembers);
router.post("/workspace/projects/:projectId/members", authRequired, postProjectMembers);
router.delete("/workspace/projects/:projectId/members", authRequired, deleteProjectMembers);
router.put("/workspace/projects/:projectId/members/groups", authRequired, putProjectMemberGroups);
router.get("/workspace/projects/:projectId/shares", authRequired, getProjectShares);
router.post("/workspace/projects/:projectId/shares", authRequired, postProjectShare);

router.put("/tasks/:taskId", authRequired, putTask);
router.patch("/tasks/:taskId", authRequired, putTask);
router.delete("/tasks/:taskId", authRequired, removeTask);
router.get("/tasks/:taskId/comments", authRequired, getTaskComments);
router.post("/tasks/:taskId/comments", authRequired, postTaskComment);
router.put("/workspace/tasks/:taskId", authRequired, putTask);
router.patch("/workspace/tasks/:taskId", authRequired, putTask);
router.delete("/workspace/tasks/:taskId", authRequired, removeTask);
router.get("/workspace/tasks/:taskId/comments", authRequired, getTaskComments);
router.post("/workspace/tasks/:taskId/comments", authRequired, postTaskComment);

router.get("/tags", authRequired, getTags);
router.post("/tags", authRequired, postTag);
router.delete("/tags/:name", authRequired, removeTag);
router.get("/workspace/tags", authRequired, getTags);
router.post("/workspace/tags", authRequired, postTag);
router.delete("/workspace/tags/:name", authRequired, removeTag);

router.get("/boards", authRequired, getBoards);
router.post("/boards", authRequired, postBoard);
router.get("/boards/:boardId/export", authRequired, getBoardExport);
router.get("/boards/:boardId", authRequired, getBoardById);
router.patch("/boards/:boardId", authRequired, patchBoard);
router.put("/boards/:boardId", authRequired, patchBoard);
router.delete("/boards/:boardId", authRequired, removeBoard);
router.put("/boards/:boardId/shares", authRequired, putBoardShares);
router.post("/boards/:boardId/shares", authRequired, putBoardShares);
router.get("/boards/:boardId/history", authRequired, getBoardHistoryById);
router.post("/boards/:boardId/sync", authRequired, postBoardSync);
router.get("/workspace/boards", authRequired, getBoards);
router.post("/workspace/boards", authRequired, postBoard);
router.get("/workspace/boards/:boardId/export", authRequired, getBoardExport);
router.get("/workspace/boards/:boardId", authRequired, getBoardById);
router.patch("/workspace/boards/:boardId", authRequired, patchBoard);
router.put("/workspace/boards/:boardId", authRequired, patchBoard);
router.delete("/workspace/boards/:boardId", authRequired, removeBoard);
router.put("/workspace/boards/:boardId/shares", authRequired, putBoardShares);
router.post("/workspace/boards/:boardId/shares", authRequired, putBoardShares);
router.get("/workspace/boards/:boardId/history", authRequired, getBoardHistoryById);
router.post("/workspace/boards/:boardId/sync", authRequired, postBoardSync);

export default router;
