import {
  chatWithAi,
  createAiDocument,
  deleteAiDocument,
  getAdminAiConfig,
  getWorkspaceAiAvailability,
  getWorkspaceAiSettings,
  listAdminUsageLogs,
  listAiDocuments,
  listManagerUsageLogs,
  listModels,
  listWorkspaceUsageLogs,
  updateAdminAiConfig,
  updateAiDocument
} from "./ai.service.js";

export async function postWorkspaceAiChat(req, res, next) {
  try {
    res.json(await chatWithAi(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaceAiAvailabilityHandler(req, res, next) {
  try {
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(await getWorkspaceAiAvailability(req.query?.scope || "home"));
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaceAiSettingsHandler(req, res, next) {
  try {
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];
    res.json(await getWorkspaceAiSettings(req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaceAiLogs(req, res, next) {
  try {
    res.json(await listWorkspaceUsageLogs(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getManagerAiConfig(req, res, next) {
  try {
    const config = await getWorkspaceAiSettings(req.auth || {});
    res.json({
      ...config,
      provider: "deepseek",
      scopeNote: "当前普通管理权限范围内生效"
    });
  } catch (error) {
    next(error);
  }
}

export async function getManagerAiLogs(req, res, next) {
  try {
    res.json(await listManagerUsageLogs(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getAdminAiConfigHandler(req, res, next) {
  try {
    res.json(await getAdminAiConfig(req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchAdminAiConfig(req, res, next) {
  try {
    res.json(await updateAdminAiConfig(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getAdminAiModels(req, res, next) {
  try {
    res.json({
      items: listModels(),
      models: listModels()
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminAiUsageLogs(req, res, next) {
  try {
    res.json(await listAdminUsageLogs(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getAdminAiDocuments(req, res, next) {
  try {
    res.json(await listAiDocuments(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postAdminAiDocument(req, res, next) {
  try {
    res.status(201).json(await createAiDocument(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchAdminAiDocument(req, res, next) {
  try {
    const documentId = req.params.documentId || req.body?.id || req.query?.id;
    res.json(await updateAiDocument(documentId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminAiDocument(req, res, next) {
  try {
    const documentId = req.params.documentId || req.body?.id || req.query?.id;
    res.json(await deleteAiDocument(documentId, { ...(req.query || {}), ...(req.body || {}) }, req.auth || {}));
  } catch (error) {
    next(error);
  }
}
