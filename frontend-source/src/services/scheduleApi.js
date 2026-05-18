function encodePath(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

const PROJECT_PATH_KEYS = ["projectId", "projectUid", "project_id", "project_uid", "id", "uid"];
const SCHEDULE_ITEM_PATH_KEYS = ["scheduleItemId", "schedule_item_id", "itemId", "item_id", "itemUid", "item_uid", "id", "workItemId", "work_item_id"];

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

function isReservedProjectPath(text) {
  return ["schedule", "undefined", "null"].includes(String(text || "").trim().toLowerCase());
}

function isFrontendOnlyScheduleItemPath(text) {
  return /^(task[-_]|si[-_]local[-_]|si[-_]client[-_]|local[-_])/i.test(String(text || "").trim());
}

function requirePathValue(name, value, keys = ["id"], validate = null, invalidMessage = "") {
  const text = pathText(value, keys);
  if (!text) {
    return Promise.reject(new Error(name === "projectId" ? "缺少项目ID" : "缺少排期项ID"));
  }
  if (validate && !validate(text)) {
    return Promise.reject(new Error(invalidMessage || (name === "projectId" ? "缺少项目ID" : "缺少排期项ID")));
  }
  return Promise.resolve(encodePath(text));
}

function requireProjectPathValue(value) {
  return requirePathValue("projectId", value, PROJECT_PATH_KEYS, (text) => !isReservedProjectPath(text), "缺少项目ID");
}

function requireScheduleItemPathValue(value) {
  return requirePathValue(
    "itemId",
    value,
    SCHEDULE_ITEM_PATH_KEYS,
    (text) => !isFrontendOnlyScheduleItemPath(text),
    "请先保存排期项后再操作"
  );
}

let httpClientPromise;

function getHttp() {
  if (!httpClientPromise) {
    httpClientPromise = import("./http.js").then((mod) => mod.default);
  }
  return httpClientPromise;
}

function callClient(client, method, url, payload) {
  if (typeof client?.request === "function") {
    const config = { method, url };
    if (payload !== undefined) config.data = payload;
    return client.request(config);
  }
  if (typeof client?.[method] !== "function") {
    return Promise.reject(new Error(`不支持的请求方法：${method}`));
  }
  return payload === undefined ? client[method](url) : client[method](url, payload);
}

function request(method, url, payload) {
  return getHttp().then((http) => callClient(http, method, url, payload));
}

export function createScheduleApi(client = null) {
  const run = client ? (method, url, payload) => callClient(client, method, url, payload) : request;

  return {
    getProjectSchedule(projectId) {
      return requireProjectPathValue(projectId).then((id) => run("get", `/workspace/projects/${id}/schedule`));
    },
    createScheduleItem(projectId, payload = {}) {
      return requireProjectPathValue(projectId).then((id) => run("post", `/workspace/projects/${id}/schedule/items`, payload));
    },
    updateScheduleItem(itemId, payload = {}) {
      return requireScheduleItemPathValue(itemId).then((id) => run("put", `/workspace/schedule/items/${id}`, payload));
    },
    deleteScheduleItem(itemId) {
      return requireScheduleItemPathValue(itemId).then((id) => run("delete", `/workspace/schedule/items/${id}`));
    },
    listSnapshots(projectId) {
      return requireProjectPathValue(projectId).then((id) => run("get", `/workspace/projects/${id}/schedule/snapshots`));
    },
    createSnapshot(projectId, payload = {}) {
      return requireProjectPathValue(projectId).then((id) => run("post", `/workspace/projects/${id}/schedule/snapshots`, payload));
    },
    listTemplates() {
      return run("get", "/workspace/schedule/templates");
    },
    createTemplate(payload = {}) {
      return run("post", "/workspace/schedule/templates", payload);
    },
    exportSchedule(projectId, payload = {}) {
      return requireProjectPathValue(projectId).then((id) => run("post", `/workspace/projects/${id}/schedule/export`, payload));
    },
    listScheduleItemComments(itemId) {
      return requireScheduleItemPathValue(itemId).then((id) => run("get", `/workspace/schedule/items/${id}/comments`));
    },
    createScheduleItemComment(itemId, payload = {}) {
      return requireScheduleItemPathValue(itemId).then((id) => run("post", `/workspace/schedule/items/${id}/comments`, payload));
    }
  };
}

export const scheduleApi = createScheduleApi();

export default scheduleApi;
