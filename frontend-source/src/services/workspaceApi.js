function encodePath(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

const PROJECT_PATH_KEYS = ["projectId", "projectUid", "project_id", "project_uid", "id", "uid"];
const PROJECT_SPECIFIC_PATH_KEYS = ["projectId", "projectUid", "project_id", "project_uid"];
const NON_PROJECT_OBJECT_KEYS = [
  "taskId",
  "taskUid",
  "task_id",
  "task_uid",
  "backendTaskId",
  "boardId",
  "boardUid",
  "board_id",
  "board_uid",
  "templateId",
  "templateUid",
  "groupId",
  "scheduleItemId",
  "itemId",
  "workItemId"
];

function pathText(value, keys = ["id"]) {
  if (value && typeof value === "object") {
    for (const key of keys) {
      const text = pathText(value[key], keys);
      if (text) return text;
    }
    return "";
  }
  return String(value ?? "").trim();
}

function requirePathValue(name, value, keys = ["id"]) {
  const text = pathText(value, keys);
  if (!text) {
    return Promise.reject(new Error(name === "projectId" ? "缺少项目ID" : `缺少${name}`));
  }
  return Promise.resolve(encodePath(text));
}

function isReservedProjectPath(text) {
  return ["schedule", "tasks", "undefined", "null"].includes(String(text || "").trim().toLowerCase());
}

function hasPathText(value, keys) {
  return keys.some((key) => !!pathText(value?.[key], PROJECT_PATH_KEYS));
}

function isNonProjectObject(value) {
  return value && typeof value === "object" && !hasPathText(value, PROJECT_SPECIFIC_PATH_KEYS) && hasPathText(value, NON_PROJECT_OBJECT_KEYS);
}

function requireProjectPathValue(value) {
  const text = pathText(value, PROJECT_PATH_KEYS);
  if (!text || isReservedProjectPath(text) || isNonProjectObject(value)) {
    return Promise.reject(new Error("缺少项目ID"));
  }
  return Promise.resolve(encodePath(text));
}

let httpClientPromise;

function getHttp() {
  if (!httpClientPromise) {
    httpClientPromise = import("./http.js").then((mod) => mod.default);
  }
  return httpClientPromise;
}

function runRequest(client, method, url, payload) {
  if (typeof client?.request === "function") {
    const config = { method, url };
    if (payload !== undefined) config.data = payload;
    return client.request(config);
  }
  if (method === "delete" && payload !== undefined) {
    return client.delete(url, { data: payload });
  }
  if (payload === undefined) {
    return client[method](url);
  }
  return client[method](url, payload);
}

function request(method, url, payload) {
  return getHttp().then((http) => runRequest(http, method, url, payload));
}

export function createWorkspaceApi(clientOrRequest = request) {
  const call = typeof clientOrRequest === "function"
    ? clientOrRequest
    : (method, url, payload) => runRequest(clientOrRequest, method, url, payload);

  return {
    getBootstrap() {
      return call("get", "/workspace/bootstrap");
    },
    listCarouselNotices() {
      return call("get", "/workspace/notices/carousel");
    },
    listProjectGroups() {
      return call("get", "/workspace/project-groups");
    },
    createProjectGroup(payload = {}) {
      return call("post", "/workspace/project-groups", payload);
    },
    updateProjectGroup(groupId, payload = {}) {
      return requirePathValue("groupId", groupId).then((id) => call("put", `/workspace/project-groups/${id}`, payload));
    },
    deleteProjectGroup(groupId) {
      return requirePathValue("groupId", groupId).then((id) => call("delete", `/workspace/project-groups/${id}`));
    },
    listProjects() {
      return call("get", "/workspace/projects");
    },
    createProject(payload = {}) {
      return call("post", "/workspace/projects", payload);
    },
    updateProject(projectId, payload = {}) {
      return requirePathValue("projectId", projectId).then((id) => call("put", `/workspace/projects/${id}`, payload));
    },
    deleteProject(projectId) {
      return requirePathValue("projectId", projectId).then((id) => call("delete", `/workspace/projects/${id}`));
    },
    listProjectMembers(projectId) {
      return requireProjectPathValue(projectId).then((id) => call("get", `/workspace/projects/${id}/members`));
    },
    addProjectMembers(projectId, payload = {}) {
      return requireProjectPathValue(projectId).then((id) => call("post", `/workspace/projects/${id}/members`, payload));
    },
    removeProjectMembers(projectId, payload = {}) {
      return requireProjectPathValue(projectId).then((id) => call("delete", `/workspace/projects/${id}/members`, payload));
    },
    setProjectMemberGroups(projectId, payload = {}) {
      return requireProjectPathValue(projectId).then((id) => call("put", `/workspace/projects/${id}/members/groups`, payload));
    },
    listTasks(projectId) {
      return requireProjectPathValue(projectId).then((id) => call("get", `/workspace/projects/${id}/tasks`));
    },
    createTask(projectId, payload = {}) {
      return requireProjectPathValue(projectId).then((id) => call("post", `/workspace/projects/${id}/tasks`, payload));
    },
    updateTask(taskId, payload = {}) {
      return requirePathValue("taskId", taskId).then((id) => call("put", `/workspace/tasks/${id}`, payload));
    },
    deleteTask(taskId) {
      return requirePathValue("taskId", taskId).then((id) => call("delete", `/workspace/tasks/${id}`));
    },
    addTaskComment(taskId, text, mentions = []) {
      return requirePathValue("taskId", taskId).then((id) => call("post", `/workspace/tasks/${id}/comments`, { text, mentions }));
    },
    listTags() {
      return call("get", "/workspace/tags");
    },
    createTag(payload = {}) {
      return call("post", "/workspace/tags", payload);
    },
    deleteTag(tagName) {
      return requirePathValue("tagName", tagName).then((id) => call("delete", `/workspace/tags/${id}`));
    },
    listBoards(projectId) {
      if (arguments.length === 0) {
        return call("get", "/workspace/boards");
      }
      return requireProjectPathValue(projectId).then((id) => call("get", `/workspace/boards?projectId=${id}`));
    },
    listContacts() {
      return call("get", "/workspace/contacts");
    },
    createContact(payload = {}) {
      return call("post", "/workspace/contacts", payload);
    },
    deleteContact(contactId) {
      return requirePathValue("contactId", contactId).then((id) => call("delete", `/workspace/contacts/${id}`));
    },
    updateProfile(payload = {}) {
      return call("patch", "/workspace/profile", payload);
    },
    createBoard(payload = {}) {
      return call("post", "/workspace/boards", payload);
    },
    getBoard(boardId) {
      return requirePathValue("boardId", boardId).then((id) => call("get", `/workspace/boards/${id}`));
    },
    updateBoard(boardId, payload = {}) {
      return requirePathValue("boardId", boardId).then((id) => call("patch", `/workspace/boards/${id}`, payload));
    },
    deleteBoard(boardId) {
      return requirePathValue("boardId", boardId).then((id) => call("delete", `/workspace/boards/${id}`));
    },
    shareBoard(boardId, entries = []) {
      return requirePathValue("boardId", boardId).then((id) => call("put", `/workspace/boards/${id}/shares`, { entries }));
    },
    listBoardHistory(boardId) {
      return requirePathValue("boardId", boardId).then((id) => call("get", `/workspace/boards/${id}/history`));
    },
    syncBoard(boardId, payload = {}) {
      return requirePathValue("boardId", boardId).then((id) => call("post", `/workspace/boards/${id}/sync`, payload));
    },
    listTemplates(query = "") {
      const suffix = query ? `?${String(query).replace(/^\?/, "")}` : "";
      return call("get", `/workspace/templates${suffix}`);
    },
    createTemplate(payload = {}) {
      return call("post", "/workspace/templates", payload);
    },
    updateTemplate(templateId, payload = {}) {
      return requirePathValue("templateId", templateId).then((id) => call("patch", `/workspace/templates/${id}`, payload));
    },
    deleteTemplate(templateId) {
      return requirePathValue("templateId", templateId).then((id) => call("delete", `/workspace/templates/${id}`));
    },
    shareTemplate(templateId, entries = []) {
      return requirePathValue("templateId", templateId).then((id) => call("put", `/workspace/templates/${id}/shares`, { entries }));
    },
    unshareTemplate(templateId, userId) {
      return requirePathValue("templateId", templateId).then((templatePath) =>
        requirePathValue("userId", userId).then((userPath) => call("delete", `/workspace/templates/${templatePath}/shares/${userPath}`))
      );
    }
  };
}

export const workspaceApi = createWorkspaceApi(request);

export default workspaceApi;
