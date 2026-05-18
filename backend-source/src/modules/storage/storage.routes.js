import { Router } from "express";
import { authRequired, requirePermission } from "../../middlewares/auth.js";
import {
  deleteStorageFile,
  downloadStorageFile,
  getStorageEnsureSql,
  getStorageFile,
  getStorageFiles,
  postStorageChatText,
  postStorageUpload,
  previewStorageFile
} from "./storage.controller.js";

const router = Router();

router.get("/storage/ensure-sql", authRequired, requirePermission("storage.read"), getStorageEnsureSql);
router.post("/storage/upload", authRequired, requirePermission("storage.write"), postStorageUpload);
router.post("/storage/chat-text", authRequired, requirePermission("storage.write"), postStorageChatText);
router.get("/storage/files", authRequired, requirePermission("storage.read"), getStorageFiles);
router.get("/storage/files/:storageId", authRequired, requirePermission("storage.read"), getStorageFile);
router.get("/storage/files/:storageId/download", authRequired, requirePermission("storage.read"), downloadStorageFile);
router.get("/storage/files/:storageId/preview", authRequired, requirePermission("storage.read"), previewStorageFile);
router.delete("/storage/files/:storageId", authRequired, deleteStorageFile);

router.get("/workspace/storage/ensure-sql", authRequired, requirePermission("storage.read"), getStorageEnsureSql);
router.post("/workspace/storage/upload", authRequired, requirePermission("storage.write"), postStorageUpload);
router.post("/workspace/storage/chat-text", authRequired, requirePermission("storage.write"), postStorageChatText);
router.get("/workspace/storage/files", authRequired, requirePermission("storage.read"), getStorageFiles);
router.get("/workspace/storage/files/:storageId", authRequired, requirePermission("storage.read"), getStorageFile);
router.get("/workspace/storage/files/:storageId/download", authRequired, requirePermission("storage.read"), downloadStorageFile);
router.get("/workspace/storage/files/:storageId/preview", authRequired, requirePermission("storage.read"), previewStorageFile);
router.delete("/workspace/storage/files/:storageId", authRequired, deleteStorageFile);

export default router;
