import {
  addProjectMembers,
  addContact,
  addTaskComment,
  createProject,
  createProjectGroup,
  createTag,
  createTask,
  deleteProject,
  deleteProjectGroup,
  deleteTag,
  deleteTask,
  getBootstrapState,
  getContact,
  listAddressBook,
  listContacts,
  listDepartments,
  listProjectGroups,
  listProjectMembers,
  listProjectShares,
  listProjects,
  listProjectTasks,
  listWorkspaceCarouselNotices,
  listTags,
  listTemplatesPlaceholder,
  listTaskComments,
  removeProjectMembers,
  removeContact,
  searchTaskComments,
  setProjectMemberGroups,
  shareProject,
  updateProject,
  updateProjectGroup,
  updateTask
} from "../services/workspace.service.js";
import { listBoards } from "../services/board.service.js";
import { assertRoleCan } from "../middlewares/auth.js";

function actorFromReq(req) {
  return String(req.auth?.sub || req.auth?.id || req.auth?.username || "").trim();
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function legacyProjectIdFromTaskRequest(req) {
  return String(
    req.body?.projectId ||
      req.body?.projectUid ||
      req.query?.projectId ||
      req.query?.projectUid ||
      req.headers?.["x-project-id"] ||
      req.headers?.["x-project-uid"] ||
      ""
  ).trim();
}

export async function getWorkspaceBootstrap(req, res, next) {
  try {
    const data = await getBootstrapState(req.auth || {});
    const boards = await listBoards(req.auth || {});
    res.json({ ...data, boards });
  } catch (error) {
    next(error);
  }
}

export async function getCarouselNotices(req, res, next) {
  try {
    res.json(await listWorkspaceCarouselNotices(req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getProjectGroups(req, res, next) {
  try {
    const items = await listProjectGroups();
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function postProjectGroup(req, res, next) {
  try {
    assertRoleCan(req.auth || {}, "write");
    const created = await createProjectGroup(req.body || {}, actorFromReq(req));
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function putProjectGroup(req, res, next) {
  try {
    assertRoleCan(req.auth || {}, "write");
    const updated = await updateProjectGroup(req.params.id, req.body || {}, actorFromReq(req));
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function removeProjectGroup(req, res, next) {
  try {
    assertRoleCan(req.auth || {}, "delete");
    const result = await deleteProjectGroup(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getProjects(req, res, next) {
  try {
    const items = await listProjects(req.auth || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function postProject(req, res, next) {
  try {
    const created = await createProject(req.body || {}, actorFromReq(req));
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function putProject(req, res, next) {
  try {
    const updated = await updateProject(req.params.id, req.body || {}, req.auth || {});
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function removeProject(req, res, next) {
  try {
    assertRoleCan(req.auth || {}, "delete");
    const result = await deleteProject(req.params.id, req.auth || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getProjectTasks(req, res, next) {
  try {
    const items = await listProjectTasks(req.params.projectId, req.auth || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function postProjectTask(req, res, next) {
  try {
    const created = await createTask(req.params.projectId, req.body || {}, req.auth || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function postLegacyProjectTask(req, res, next) {
  try {
    const projectId = legacyProjectIdFromTaskRequest(req);
    if (!projectId) throw badRequest("projectId or projectUid is required");

    const created = await createTask(projectId, req.body || {}, req.auth || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function putTask(req, res, next) {
  try {
    const updated = await updateTask(req.params.taskId, req.body || {}, req.auth || {});
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function removeTask(req, res, next) {
  try {
    const result = await deleteTask(req.params.taskId, req.auth || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function postTaskComment(req, res, next) {
  try {
    const created = await addTaskComment(req.params.taskId, req.body || {}, req.auth || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function getTaskComments(req, res, next) {
  try {
    const items = await listTaskComments(req.params.taskId, req.auth || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getCommentSearch(req, res, next) {
  try {
    const items = await searchTaskComments(req.query || {}, req.auth || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getAddressBook(req, res, next) {
  try {
    const items = await listAddressBook(req.query || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getDepartments(req, res, next) {
  try {
    const items = await listDepartments();
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getContacts(req, res, next) {
  try {
    const items = await listContacts(req.auth || {}, req.query || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getContactById(req, res, next) {
  try {
    const item = await getContact(req.auth || {}, req.params.contactId || "", req.query || {});
    res.json(item);
  } catch (error) {
    next(error);
  }
}

export async function postContact(req, res, next) {
  try {
    const created = await addContact(req.auth || {}, req.body || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function deleteContact(req, res, next) {
  try {
    const result = await removeContact(req.auth || {}, req.params.contactId || "");
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getProjectMembers(req, res, next) {
  try {
    const items = await listProjectMembers(req.params.projectId, req.auth || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function postProjectMembers(req, res, next) {
  try {
    const data = await addProjectMembers(req.params.projectId, req.body || {}, req.auth || {});
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
}

export async function deleteProjectMembers(req, res, next) {
  try {
    const data = await removeProjectMembers(req.params.projectId, req.body || {}, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function putProjectMemberGroups(req, res, next) {
  try {
    const data = await setProjectMemberGroups(req.params.projectId, req.body || {}, req.auth || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function postProjectShare(req, res, next) {
  try {
    const created = await shareProject(req.params.projectId, req.body || {}, req.auth || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function getProjectShares(req, res, next) {
  try {
    const items = await listProjectShares(req.params.projectId, req.auth || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getTags(req, res, next) {
  try {
    const items = await listTags();
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function postTag(req, res, next) {
  try {
    assertRoleCan(req.auth || {}, "write");
    const created = await createTag(req.body || {}, actorFromReq(req));
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function removeTag(req, res, next) {
  try {
    assertRoleCan(req.auth || {}, "delete");
    const result = await deleteTag(req.params.name);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTemplatesPlaceholder(req, res, next) {
  try {
    const data = await listTemplatesPlaceholder();
    res.json(data);
  } catch (error) {
    next(error);
  }
}
