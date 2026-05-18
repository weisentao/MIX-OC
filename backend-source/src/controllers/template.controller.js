import {
  applyTemplate,
  copyTemplate,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  shareTemplate,
  unshareTemplate,
  updateTemplate
} from "../services/template.service.js";

export async function getTemplates(req, res, next) {
  try {
    res.json(await listTemplates(req.auth || {}, req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function postTemplate(req, res, next) {
  try {
    res.status(201).json(await createTemplate(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getTemplateById(req, res, next) {
  try {
    res.json(await getTemplate(req.params.templateId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchTemplate(req, res, next) {
  try {
    res.json(await updateTemplate(req.params.templateId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeTemplate(req, res, next) {
  try {
    res.json(await deleteTemplate(req.params.templateId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function putTemplateShares(req, res, next) {
  try {
    res.json(await shareTemplate(req.params.templateId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeTemplateShare(req, res, next) {
  try {
    res.json(await unshareTemplate(req.params.templateId, req.params.userId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postTemplateCopy(req, res, next) {
  try {
    res.status(201).json(await copyTemplate(req.params.templateId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postTemplateApply(req, res, next) {
  try {
    res.json(await applyTemplate(req.params.templateId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}
