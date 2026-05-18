import { Router } from "express";
import { authRequired } from "../../middlewares/auth.js";
import {
  getNotifications,
  getNotificationsUnreadCount,
  patchNotificationRead,
  patchNotificationsReadAll
} from "./notifications.controller.js";

const router = Router();

router.get("/notifications", authRequired, getNotifications);
router.get("/workspace/notifications", authRequired, getNotifications);
router.get("/notifications/unread-count", authRequired, getNotificationsUnreadCount);
router.get("/workspace/notifications/unread-count", authRequired, getNotificationsUnreadCount);
router.patch("/notifications/read-all", authRequired, patchNotificationsReadAll);
router.patch("/workspace/notifications/read-all", authRequired, patchNotificationsReadAll);
router.patch("/notifications/:id/read", authRequired, patchNotificationRead);
router.patch("/workspace/notifications/:id/read", authRequired, patchNotificationRead);

export default router;
