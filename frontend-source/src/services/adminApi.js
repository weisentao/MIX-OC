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

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeNoticeTarget(value) {
  const target = cleanText(value || "_self").toLowerCase();
  if (["blank", "_blank", "new", "new-window"].includes(target)) return "_blank";
  return "_self";
}

function normalizeNoticeStatus(value, enabled) {
  const status = cleanText(value).toLowerCase();
  if (enabled === false) return "disabled";
  if (["disabled", "muted", "archived", "inactive", "停用", "已停用"].includes(status)) return "disabled";
  return "active";
}

function normalizeNoticeEnabled(payload = {}) {
  if (payload.enabled !== undefined) return Boolean(payload.enabled);
  const status = cleanText(payload.status).toLowerCase();
  if (["disabled", "muted", "archived", "inactive", "停用", "已停用"].includes(status)) return false;
  return true;
}

function normalizeNoticeDateTime(value) {
  const text = cleanText(value);
  if (!text) return "";
  const normalized = text.replaceAll("/", "-").replace("T", " ").slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/.test(normalized)) return text;
  if (normalized.length === 10) return `${normalized} 00:00:00`;
  if (normalized.length === 16) return `${normalized}:00`;
  return normalized;
}

export function normalizeAdminNoticePayload(payload = {}, options = {}) {
  const text = cleanText(payload.text || payload.content || payload.contentText);
  const enabled = normalizeNoticeEnabled(payload);
  const linkText = cleanText(payload.linkText);
  const linkUrl = cleanText(payload.linkUrl);
  const linkTarget = normalizeNoticeTarget(payload.linkTarget ?? payload.link_target ?? payload.openTarget ?? payload.open_target);
  const startAt = normalizeNoticeDateTime(payload.startAt ?? payload.start_at);
  const endAt = normalizeNoticeDateTime(payload.endAt ?? payload.end_at);
  const normalized = {};
  if (!options.partial || payload.title !== undefined) normalized.title = cleanText(payload.title);
  if (!options.partial || payload.text !== undefined || payload.content !== undefined || payload.contentText !== undefined) {
    normalized.text = text;
    normalized.content = text;
  }
  if (!options.partial || payload.type !== undefined || payload.noticeType !== undefined) {
    normalized.type = cleanText(payload.type || payload.noticeType || "公告");
  }
  if (!options.partial && !options.omitNoticeId) {
    const noticeId = cleanText(payload.noticeId || payload.id);
    if (noticeId) normalized.noticeId = noticeId;
  }
  Object.assign(normalized, {
    enabled,
    status: normalizeNoticeStatus(payload.status, enabled),
    interval: Math.max(1000, Number(payload.interval) || 5500),
    linkText,
    linkUrl,
    linkTarget,
    payload: {
      ...(payload.payload && typeof payload.payload === "object" ? payload.payload : {}),
      linkText,
      linkUrl,
      linkTarget
    }
  });
  if (!options.partial || payload.priority !== undefined) normalized.priority = Number(payload.priority || 0);
  if (!options.partial || payload.startAt !== undefined || payload.start_at !== undefined) normalized.startAt = startAt;
  if (!options.partial || payload.endAt !== undefined || payload.end_at !== undefined) normalized.endAt = endAt;
  if (payload.sortOrder !== undefined) normalized.sortOrder = Number(payload.sortOrder || 0);
  return normalized;
}

export function sanitizeAdminAiConfigPayload(payload = {}) {
  const supportedKeyFields = new Set([
    "homeApiKey",
    "hrApiKey",
    "homeDeepSeekApiKey",
    "hrDeepSeekApiKey",
    "homeDeepseekApiKey",
    "hrDeepseekApiKey",
    "homeDeepSeekKey",
    "hrDeepSeekKey",
    "home_deepseek_api_key",
    "hr_deepseek_api_key",
    "home_deepseek_key",
    "hr_deepseek_key",
    "deepseekHomeApiKey",
    "deepseekHrApiKey",
    "deepseekHomeKey",
    "deepseekHrKey"
  ]);
  const canonicalKeyFields = new Map([
    ["homeapikey", "homeApiKey"],
    ["homedeepseekapikey", "homeApiKey"],
    ["homedeepseekkey", "homeApiKey"],
    ["deepseekhomeapikey", "homeApiKey"],
    ["hrapikey", "hrApiKey"],
    ["hrdeepseekapikey", "hrApiKey"],
    ["hrdeepseekkey", "hrApiKey"],
    ["deepseekhrapikey", "hrApiKey"]
  ]);
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => supportedKeyFields.has(key) || !isBlockedSecretField(key))
      .map(([key, value]) => {
        if (!supportedKeyFields.has(key)) return [key, value];
        const normalizedKey = String(key ?? "").replace(/[-_\s]/g, "").toLowerCase();
        return [canonicalKeyFields.get(normalizedKey) || key, String(value ?? "").trim()];
      })
      .filter(([key, value]) => !["homeApiKey", "hrApiKey"].includes(key) || value)
  );
}

function isBlockedSecretField(key) {
  const normalized = String(key ?? "").replace(/[-_\s]/g, "").toLowerCase();
  return (
    normalized === "apikey" ||
    normalized === "deepseekapikey" ||
    normalized === "deepseekkey" ||
    normalized === "token" ||
    normalized === "authorization" ||
    normalized === "secret" ||
    normalized.endsWith("apikey") ||
    /deepseek.*key$/.test(normalized) ||
    /(?:^|[^a-z])api(?:[^a-z]|$).*key/.test(normalized)
  );
}

export const adminApi = {
  getDashboard(params = {}) {
    return request("get", `/admin/dashboard${toQuery(params)}`);
  },
  listUsers(params = {}) {
    return request("get", `/admin/users${toQuery(params)}`);
  },
  createUser(payload = {}) {
    return request("post", "/admin/users", payload);
  },
  getUser(userId) {
    return request("get", `/admin/users/${encodePath(userId)}`);
  },
  updateUser(userId, payload = {}) {
    return request("patch", `/admin/users/${encodePath(userId)}`, payload);
  },
  deleteUser(userId, payload = {}) {
    return request("delete", `/admin/users/${encodePath(userId)}`, payload);
  },
  listPermissions(params = {}) {
    return request("get", `/admin/permissions${toQuery(params)}`);
  },
  updatePermissions(payload = {}) {
    return request("patch", "/admin/permissions", payload);
  },
  listProjects(params = {}) {
    return request("get", `/admin/projects${toQuery(params)}`);
  },
  createProject(payload = {}) {
    return request("post", "/admin/projects", payload);
  },
  getProject(projectId) {
    return request("get", `/admin/projects/${encodePath(projectId)}`);
  },
  updateProject(projectId, payload = {}) {
    return request("patch", `/admin/projects/${encodePath(projectId)}`, payload);
  },
  archiveProject(projectId, payload = {}) {
    return request("post", `/admin/projects/${encodePath(projectId)}/archive`, payload);
  },
  deleteProject(projectId, payload = {}) {
    return request("delete", `/admin/projects/${encodePath(projectId)}`, payload);
  },
  listTasks(params = {}) {
    return request("get", `/admin/tasks${toQuery(params)}`);
  },
  createTask(payload = {}) {
    return request("post", "/admin/tasks", payload);
  },
  updateTask(taskId, payload = {}) {
    return request("patch", `/admin/tasks/${encodePath(taskId)}`, payload);
  },
  deleteTask(taskId, payload = {}) {
    return request("delete", `/admin/tasks/${encodePath(taskId)}`, payload);
  },
  listRiskComments(params = {}) {
    return request("get", `/admin/comments/risk${toQuery(params)}`);
  },
  resolveRiskComment(commentId, payload = {}) {
    return request("post", `/admin/comments/${encodePath(commentId)}/resolve`, payload);
  },
  listSchedules(params = {}) {
    return request("get", `/admin/schedules${toQuery(params)}`);
  },
  listBoards(params = {}) {
    return request("get", `/admin/boards${toQuery(params)}`);
  },
  updateBoard(boardId, payload = {}) {
    return request("patch", `/admin/boards/${encodePath(boardId)}`, payload);
  },
  deleteBoard(boardId, payload = {}) {
    return request("delete", `/admin/boards/${encodePath(boardId)}`, payload);
  },
  listTemplates(params = {}) {
    return request("get", `/admin/templates${toQuery(params)}`);
  },
  createTemplate(payload = {}) {
    return request("post", "/admin/templates", payload);
  },
  updateTemplate(templateId, payload = {}) {
    return request("patch", `/admin/templates/${encodePath(templateId)}`, payload);
  },
  deleteTemplate(templateId, payload = {}) {
    return request("delete", `/admin/templates/${encodePath(templateId)}`, payload);
  },
  listTags(params = {}) {
    return request("get", `/admin/tags${toQuery(params)}`);
  },
  createTag(payload = {}) {
    return request("post", "/admin/tags", payload);
  },
  deleteTag(tagId, payload = {}) {
    return request("delete", `/admin/tags/${encodePath(tagId)}`, payload);
  },
  listNotices(params = {}) {
    return request("get", `/admin/notices${toQuery(params)}`);
  },
  createNotice(payload = {}, options = {}) {
    return request("post", "/admin/notices", normalizeAdminNoticePayload(payload, { omitNoticeId: true, ...options }));
  },
  updateNotice(noticeId, payload = {}) {
    return request("patch", `/admin/notices/${encodePath(noticeId)}`, normalizeAdminNoticePayload(payload, { partial: true }));
  },
  deleteNotice(noticeId, payload = {}) {
    return request("delete", `/admin/notices/${encodePath(noticeId)}`, payload);
  },
  listDepartments(params = {}) {
    return request("get", `/admin/departments${toQuery(params)}`);
  },
  createDepartment(payload = {}) {
    return request("post", "/admin/departments", payload);
  },
  updateDepartment(departmentId, payload = {}) {
    return request("patch", `/admin/departments/${encodePath(departmentId)}`, payload);
  },
  deleteDepartment(departmentId, payload = {}) {
    return request("delete", `/admin/departments/${encodePath(departmentId)}`, payload);
  },
  listArchives(params = {}) {
    return request("get", `/admin/archives${toQuery(params)}`);
  },
  restoreArchive(archiveId, payload = {}) {
    return request("post", `/admin/archives/${encodePath(archiveId)}/restore`, payload);
  },
  deleteArchive(archiveId, payload = {}) {
    return request("delete", `/admin/archives/${encodePath(archiveId)}`, payload);
  },
  getAiConfig(params = {}) {
    return request("get", `/admin/ai/config${toQuery(params)}`);
  },
  updateAiConfig(payload = {}) {
    return request("patch", "/admin/ai/config", sanitizeAdminAiConfigPayload(payload));
  },
  listAiModels(params = {}) {
    return request("get", `/admin/ai/models${toQuery(params)}`);
  },
  listAiUsageLogs(params = {}) {
    return request("get", `/admin/ai/usage-logs${toQuery(params)}`);
  },
  listAiDocuments(params = {}) {
    return request("get", `/admin/ai/documents${toQuery(params)}`);
  },
  createAiDocument(payload = {}) {
    return request("post", "/admin/ai/documents", payload);
  },
  updateAiDocument(documentId, payload = {}) {
    return request("patch", `/admin/ai/documents/${encodePath(documentId)}`, payload);
  },
  deleteAiDocument(documentId, payload = {}) {
    return request("delete", `/admin/ai/documents/${encodePath(documentId)}`, payload);
  },
  getSystemStatus(params = {}) {
    return request("get", `/admin/system/status${toQuery(params)}`);
  },
  listAuditLogs(params = {}) {
    return request("get", `/admin/audit-logs${toQuery(params)}`);
  }
};

export default adminApi;
