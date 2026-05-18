import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import appStateRoutes from "./appState.routes.js";
import workspaceRoutes from "./workspace.routes.js";
import scheduleRoutes from "./schedule.routes.js";
import templateRoutes from "./template.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import hrRoutes from "../modules/hr/hr.routes.js";
import managerRoutes from "../modules/manager/manager.routes.js";
import notificationsRoutes from "../modules/notifications/notifications.routes.js";
import { storageRoutes } from "../modules/storage/index.js";
import { aiRoutes } from "../modules/ai/index.js";

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(appStateRoutes);
router.use(aiRoutes);
router.use(adminRoutes);
router.use(hrRoutes);
router.use(managerRoutes);
router.use(notificationsRoutes);
router.use(storageRoutes);
router.use(scheduleRoutes);
router.use(templateRoutes);
router.use(workspaceRoutes);

export default router;
