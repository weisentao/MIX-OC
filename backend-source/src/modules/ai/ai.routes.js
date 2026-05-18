import { Router } from "express";
import { authRequired, requireRole } from "../../middlewares/auth.js";
import {
  deleteAdminAiDocument,
  getAdminAiConfigHandler,
  getAdminAiDocuments,
  getAdminAiModels,
  getAdminAiUsageLogs,
  getManagerAiConfig,
  getManagerAiLogs,
  getWorkspaceAiAvailabilityHandler,
  getWorkspaceAiLogs,
  getWorkspaceAiSettingsHandler,
  patchAdminAiConfig,
  patchAdminAiDocument,
  postAdminAiDocument,
  postWorkspaceAiChat
} from "./ai.controller.js";
import { assertAdminAccess } from "./ai.service.js";

const router = Router();
const requireManager = requireRole(["admin", "manager", "department_admin", "department_manager", "project_manager"]);

function requireAdmin(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    next();
  } catch (error) {
    next(error);
  }
}

router.post("/workspace/ai/chat", authRequired, postWorkspaceAiChat);
router.post("/workspace/ai/home-assistant", authRequired, postWorkspaceAiChat);
router.get("/workspace/ai/chat", authRequired, getWorkspaceAiAvailabilityHandler);
router.get("/workspace/ai/home-assistant", authRequired, getWorkspaceAiAvailabilityHandler);
router.get("/workspace/ai/settings", authRequired, getWorkspaceAiSettingsHandler);
router.get("/workspace/ai/logs", authRequired, getWorkspaceAiLogs);
router.get("/manager/ai/config", authRequired, requireManager, getManagerAiConfig);
router.get("/manager/ai/logs", authRequired, requireManager, getManagerAiLogs);

router.get("/admin/ai/config", authRequired, requireAdmin, getAdminAiConfigHandler);
router.patch("/admin/ai/config", authRequired, requireAdmin, patchAdminAiConfig);
router.get("/admin/ai/models", authRequired, requireAdmin, getAdminAiModels);
router.get("/admin/ai/usage-logs", authRequired, requireAdmin, getAdminAiUsageLogs);
router.get("/admin/ai/documents", authRequired, requireAdmin, getAdminAiDocuments);
router.post("/admin/ai/documents", authRequired, requireAdmin, postAdminAiDocument);
router.patch("/admin/ai/documents", authRequired, requireAdmin, patchAdminAiDocument);
router.delete("/admin/ai/documents", authRequired, requireAdmin, deleteAdminAiDocument);
router.patch("/admin/ai/documents/:documentId", authRequired, requireAdmin, patchAdminAiDocument);
router.delete("/admin/ai/documents/:documentId", authRequired, requireAdmin, deleteAdminAiDocument);

export { requireAdmin };
export default router;
