function encodePath(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

function toQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }
    query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

let httpClientPromise;

function getHttp() {
  if (!httpClientPromise) {
    httpClientPromise = import("./http.js").then((mod) => mod.default);
  }
  return httpClientPromise;
}

function request(method, url, payload) {
  return getHttp().then((http) => {
    if (payload === undefined) {
      return http[method](url);
    }
    if (method === "delete") {
      return http.delete(url, { data: payload });
    }
    return http[method](url, payload);
  });
}

function shouldFallbackToWorkspace(error) {
  const status = Number(error?.response?.status || error?.status || error?.statusCode || 0);
  return [404, 405, 501].includes(status);
}

export function createManagerApi(runRequest = request) {
  return {
    getOverview(params = {}) {
      return runRequest("get", `/manager/overview${toQuery(params)}`);
    },
    getDepartment(departmentId, params = {}) {
      return runRequest("get", `/manager/departments/${encodePath(departmentId)}${toQuery(params)}`);
    },
    listMembers(params = {}) {
      return runRequest("get", `/manager/members${toQuery(params)}`);
    },
    getMember(userId) {
      return runRequest("get", `/manager/members/${encodePath(userId)}`);
    },
    updateMember(userId, payload = {}) {
      return runRequest("patch", `/manager/members/${encodePath(userId)}`, payload);
    },
    resetMemberPassword(userId, payload = {}) {
      return runRequest("post", `/manager/members/${encodePath(userId)}/reset-password`, payload);
    },
    listProjects(params = {}) {
      return runRequest("get", `/manager/projects${toQuery(params)}`);
    },
    createProject(payload = {}) {
      return runRequest("post", "/manager/projects", payload);
    },
    getProject(projectId) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}`);
    },
    updateProject(projectId, payload = {}) {
      return runRequest("patch", `/manager/projects/${encodePath(projectId)}`, payload);
    },
    archiveProject(projectId, payload = {}) {
      return runRequest("post", `/manager/projects/${encodePath(projectId)}/archive`, payload);
    },
    deleteProject(projectId, payload = {}) {
      return runRequest("delete", `/manager/projects/${encodePath(projectId)}`, payload);
    },
    listProjectTasks(projectId, params = {}) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}/tasks${toQuery(params)}`);
    },
    createProjectTask(projectId, payload = {}) {
      return runRequest("post", `/manager/projects/${encodePath(projectId)}/tasks`, payload);
    },
    updateTask(taskId, payload = {}) {
      return runRequest("patch", `/manager/tasks/${encodePath(taskId)}`, payload);
    },
    deleteTask(taskId, payload = {}) {
      return runRequest("delete", `/manager/tasks/${encodePath(taskId)}`, payload);
    },
    listProjectComments(projectId, params = {}) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}/comments${toQuery(params)}`);
    },
    resolveComment(commentId, payload = {}) {
      return runRequest("post", `/manager/comments/${encodePath(commentId)}/resolve`, payload);
    },
    getProjectSchedule(projectId, params = {}) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}/schedule${toQuery(params)}`);
    },
    exportProjectSchedule(projectId, payload = {}) {
      return runRequest("post", `/manager/projects/${encodePath(projectId)}/schedule/export`, payload);
    },
    listProjectMembers(projectId, params = {}) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}/members${toQuery(params)}`);
    },
    updateProjectMember(projectId, userId, payload = {}) {
      return runRequest("patch", `/manager/projects/${encodePath(projectId)}/members/${encodePath(userId)}`, payload);
    },
    listProjectBoards(projectId, params = {}) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}/boards${toQuery(params)}`);
    },
    createProjectBoard(projectId, payload = {}) {
      return runRequest("post", `/manager/projects/${encodePath(projectId)}/boards`, payload);
    },
    updateProjectBoard(projectId, boardId, payload = {}) {
      return runRequest("patch", `/manager/projects/${encodePath(projectId)}/boards/${encodePath(boardId)}`, payload);
    },
    listProjectTemplates(projectId, params = {}) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}/templates${toQuery(params)}`);
    },
    createProjectTemplate(projectId, payload = {}) {
      return runRequest("post", `/manager/projects/${encodePath(projectId)}/templates`, payload);
    },
    getProjectTagsArchives(projectId, params = {}) {
      return runRequest("get", `/manager/projects/${encodePath(projectId)}/tags-archives${toQuery(params)}`);
    },
    createTag(projectId, payload = {}) {
      return runRequest("post", `/manager/projects/${encodePath(projectId)}/tags`, payload);
    },
    archiveTag(projectId, tagId, payload = {}) {
      return runRequest("post", `/manager/projects/${encodePath(projectId)}/tags/${encodePath(tagId)}/archive`, payload);
    },
    listAccounts(params = {}) {
      return runRequest("get", `/manager/accounts${toQuery(params)}`);
    },
    listAiUsage(params = {}) {
      return runRequest("get", `/manager/ai/logs${toQuery(params)}`).catch((error) => {
        if (shouldFallbackToWorkspace(error)) {
          return runRequest("get", `/workspace/ai/logs${toQuery(params)}`);
        }
        throw error;
      });
    },
    getAiConfig(params = {}) {
      return runRequest("get", `/manager/ai/config${toQuery(params)}`).catch((error) => {
        if (shouldFallbackToWorkspace(error)) {
          return runRequest("get", `/workspace/ai/settings${toQuery(params)}`).catch(() => ({ config: null, fallback: true }));
        }
        throw error;
      });
    }
  };
}

export const managerApi = createManagerApi();

export default managerApi;
