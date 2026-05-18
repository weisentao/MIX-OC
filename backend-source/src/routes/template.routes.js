import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import {
  getTemplateById,
  getTemplates,
  patchTemplate,
  postTemplate,
  postTemplateApply,
  postTemplateCopy,
  putTemplateShares,
  removeTemplate,
  removeTemplateShare
} from "../controllers/template.controller.js";

const router = Router();

function registerTemplateRoutes(prefix = "") {
  router.get(`${prefix}/templates`, authRequired, getTemplates);
  router.post(`${prefix}/templates`, authRequired, postTemplate);
  router.get(`${prefix}/templates/:templateId`, authRequired, getTemplateById);
  router.patch(`${prefix}/templates/:templateId`, authRequired, patchTemplate);
  router.delete(`${prefix}/templates/:templateId`, authRequired, removeTemplate);
  router.put(`${prefix}/templates/:templateId/shares`, authRequired, putTemplateShares);
  router.post(`${prefix}/templates/:templateId/shares`, authRequired, putTemplateShares);
  router.delete(`${prefix}/templates/:templateId/shares/:userId`, authRequired, removeTemplateShare);
  router.post(`${prefix}/templates/:templateId/copy`, authRequired, postTemplateCopy);
  router.post(`${prefix}/templates/:templateId/apply`, authRequired, postTemplateApply);
}

registerTemplateRoutes("");
registerTemplateRoutes("/workspace");

export default router;
