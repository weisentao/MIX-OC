import {
  archiveAdminProject,
  createAdminDepartment,
  createAdminNotice,
  createAdminProject,
  createAdminTag,
  createAdminTask,
  createAdminTemplate,
  createAdminUser,
  deleteAdminBoard,
  deleteAdminDepartment,
  deleteAdminNotice,
  deleteAdminProject,
  deleteAdminTag,
  deleteAdminTask,
  deleteAdminTemplate,
  deleteAdminUser,
  deleteArchive,
  getAdminDashboard,
  getAdminProject,
  getAdminUser,
  getSystemConfig,
  getSystemStatus,
  listAdminArchives,
  listAdminBoards,
  listAdminDepartments,
  listAdminNotices,
  listAdminPermissions,
  listAdminProjects,
  listAdminSchedules,
  listAdminTags,
  listAdminTasks,
  listAdminTemplates,
  listAdminUsers,
  listAuditLogs,
  listRiskComments,
  normalizeAuditQuery,
  normalizePagination,
  normalizeSystemConfigPayload,
  resolveRiskComment,
  restoreArchive,
  updateAdminBoard,
  updateAdminDepartment,
  updateAdminNotice,
  updateAdminPermissions,
  updateAdminProject,
  updateAdminTask,
  updateAdminTemplate,
  updateAdminUser,
  updateSystemConfig,
  __private__
} from "./admin.service.js";

function assertAdminAccess(auth = {}) {
  return __private__.assertAdminAccess(auth);
}

function requestMeta(req) {
  return {
    ip: req.ip || req.headers["x-forwarded-for"] || "",
    userAgent: req.headers["user-agent"] || ""
  };
}

export async function getDashboard(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await getAdminDashboard(req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getUsers(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminUsers(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postUser(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.status(201).json(await createAdminUser(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getUser(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await getAdminUser(req.params.userId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchUser(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminUser(req.params.userId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeUser(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminUser(req.params.userId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getPermissions(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminPermissions(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchPermissions(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminPermissions(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getSystem(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await getSystemStatus(req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getConfig(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await getSystemConfig(req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchConfig(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizeSystemConfigPayload(req.body || {});
    res.json(await updateSystemConfig(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getAuditLogs(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizeAuditQuery(req.query || {});
    res.json(await listAuditLogs(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getProjects(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminProjects(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postProject(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.status(201).json(await createAdminProject(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getProject(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await getAdminProject(req.params.projectId, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchProject(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminProject(req.params.projectId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function archiveProject(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await archiveAdminProject(req.params.projectId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeProject(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminProject(req.params.projectId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getTasks(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminTasks(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postTask(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.status(201).json(await createAdminTask(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchTask(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminTask(req.params.taskId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeTask(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminTask(req.params.taskId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getRiskComments(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listRiskComments(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postResolveRiskComment(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await resolveRiskComment(req.params.commentId, req.body || {}, req.auth || {}, requestMeta(req)));
  } catch (error) {
    next(error);
  }
}

export async function getSchedules(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminSchedules(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getBoards(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminBoards(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchBoard(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminBoard(req.params.boardId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeBoard(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminBoard(req.params.boardId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getTemplates(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminTemplates(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postTemplate(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.status(201).json(await createAdminTemplate(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchTemplate(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminTemplate(req.params.templateId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeTemplate(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminTemplate(req.params.templateId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getTags(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminTags(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postTag(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.status(201).json(await createAdminTag(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeTag(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminTag(req.params.tagId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getNotices(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminNotices(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postNotice(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.status(201).json(await createAdminNotice(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchNotice(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminNotice(req.params.noticeId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeNotice(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminNotice(req.params.noticeId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getDepartments(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminDepartments(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postDepartment(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.status(201).json(await createAdminDepartment(req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchDepartment(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await updateAdminDepartment(req.params.departmentId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeDepartment(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteAdminDepartment(req.params.departmentId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getArchives(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    normalizePagination(req.query || {});
    res.json(await listAdminArchives(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function postRestoreArchive(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await restoreArchive(req.params.archiveId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function removeArchive(req, res, next) {
  try {
    assertAdminAccess(req.auth || {});
    res.json(await deleteArchive(req.params.archiveId, req.body || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}
