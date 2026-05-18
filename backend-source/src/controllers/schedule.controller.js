import {
  createOrUpdateSchedulePlan,
  createScheduleExport,
  createScheduleItem,
  createScheduleItemComment,
  createScheduleSnapshot,
  createScheduleTemplate,
  deleteScheduleItemComment,
  deleteScheduleItem,
  getProjectSchedule,
  listScheduleSnapshots,
  listScheduleTemplates,
  listScheduleItemComments,
  updateScheduleItemComment,
  updateScheduleItem
} from "../services/schedule.service.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function legacyProjectIdFromScheduleRequest(req) {
  return String(
    req.query?.projectId ||
      req.query?.projectUid ||
      req.body?.projectId ||
      req.body?.projectUid ||
      req.headers?.["x-project-id"] ||
      req.headers?.["x-project-uid"] ||
      ""
  ).trim();
}

export async function getSchedule(req, res, next) {
  try {
    const data = await getProjectSchedule(req.params.projectId, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function getLegacyProjectSchedule(req, res, next) {
  try {
    const projectId = legacyProjectIdFromScheduleRequest(req);
    if (!projectId) throw badRequest("projectId or projectUid is required");

    const data = await getProjectSchedule(projectId, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function postSchedule(req, res, next) {
  try {
    const data = await createOrUpdateSchedulePlan(req.params.projectId, req.body || {}, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function getScheduleSnapshots(req, res, next) {
  try {
    const data = await listScheduleSnapshots(req.params.projectId, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function postScheduleSnapshot(req, res, next) {
  try {
    const data = await createScheduleSnapshot(req.params.projectId, req.body || {}, req.auth || {});
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
}

export async function getScheduleTemplates(req, res, next) {
  try {
    const data = await listScheduleTemplates(req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function postScheduleTemplate(req, res, next) {
  try {
    const data = await createScheduleTemplate(req.body || {}, req.auth || {});
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
}

export async function postScheduleExport(req, res, next) {
  try {
    const data = await createScheduleExport(req.params.projectId, req.body || {}, req.auth || {});
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
}

export async function postScheduleItem(req, res, next) {
  try {
    const data = await createScheduleItem(req.params.projectId, req.body || {}, req.auth || {});
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
}

export async function putScheduleItem(req, res, next) {
  try {
    const data = await updateScheduleItem(req.params.itemId, req.body || {}, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function getScheduleItemComments(req, res, next) {
  try {
    const data = await listScheduleItemComments(req.params.itemId, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function postScheduleItemComment(req, res, next) {
  try {
    const data = await createScheduleItemComment(req.params.itemId, req.body || {}, req.auth || {});
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
}

export async function putScheduleItemComment(req, res, next) {
  try {
    const data = await updateScheduleItemComment(req.params.itemId, req.params.commentId, req.body || {}, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function removeScheduleItemComment(req, res, next) {
  try {
    const data = await deleteScheduleItemComment(req.params.itemId, req.params.commentId, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function removeScheduleItem(req, res, next) {
  try {
    const data = await deleteScheduleItem(req.params.itemId, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}
