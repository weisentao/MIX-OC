import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import {
  getLegacyProjectSchedule,
  getScheduleItemComments,
  getSchedule,
  getScheduleSnapshots,
  getScheduleTemplates,
  postScheduleItemComment,
  postSchedule,
  postScheduleExport,
  postScheduleItem,
  postScheduleSnapshot,
  postScheduleTemplate,
  putScheduleItemComment,
  putScheduleItem,
  removeScheduleItemComment,
  removeScheduleItem
} from "../controllers/schedule.controller.js";

const router = Router();

router.get("/workspace/projects/schedule", authRequired, getLegacyProjectSchedule);
router.get("/workspace/projects/:projectId/schedule", authRequired, getSchedule);
router.post("/workspace/projects/:projectId/schedule", authRequired, postSchedule);
router.get("/workspace/projects/:projectId/schedule/snapshots", authRequired, getScheduleSnapshots);
router.post("/workspace/projects/:projectId/schedule/snapshots", authRequired, postScheduleSnapshot);
router.post("/workspace/projects/:projectId/schedule/export", authRequired, postScheduleExport);
router.get("/workspace/schedule/templates", authRequired, getScheduleTemplates);
router.post("/workspace/schedule/templates", authRequired, postScheduleTemplate);
router.post("/workspace/projects/:projectId/schedule/items", authRequired, postScheduleItem);
router.get("/workspace/schedule/items/:itemId/comments", authRequired, getScheduleItemComments);
router.post("/workspace/schedule/items/:itemId/comments", authRequired, postScheduleItemComment);
router.put("/workspace/schedule/items/:itemId/comments/:commentId", authRequired, putScheduleItemComment);
router.delete("/workspace/schedule/items/:itemId/comments/:commentId", authRequired, removeScheduleItemComment);
router.put("/workspace/schedule/items/:itemId", authRequired, putScheduleItem);
router.patch("/workspace/schedule/items/:itemId", authRequired, putScheduleItem);
router.delete("/workspace/schedule/items/:itemId", authRequired, removeScheduleItem);

export default router;
