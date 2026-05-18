let httpClientPromise;

function getHttp() {
  if (!httpClientPromise) {
    httpClientPromise = import("./http.js").then((mod) => mod.default);
  }
  return httpClientPromise;
}

function encodeQueryValue(value) {
  return encodeURIComponent(String(value));
}

function toQueryString(query = {}) {
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value
          .filter((entry) => entry !== undefined && entry !== null && entry !== "")
          .map((entry) => `${encodeQueryValue(key)}=${encodeQueryValue(entry)}`)
          .join("&");
      }
      return `${encodeQueryValue(key)}=${encodeQueryValue(value)}`;
    })
    .filter(Boolean);
  return params.length ? `?${params.join("&")}` : "";
}

function callClient(client, method, url, payload) {
  if (typeof client?.request === "function") {
    const config = { method, url };
    if (payload !== undefined) config.data = payload;
    return client.request(config);
  }
  if (typeof client?.[method] !== "function") {
    return Promise.reject(new Error(`Unsupported HTTP method: ${method}`));
  }
  return payload === undefined ? client[method](url) : client[method](url, payload);
}

function request(method, url, payload) {
  return getHttp().then((http) => callClient(http, method, url, payload));
}

function isCredentialField(key = "") {
  const normalizedKey = String(key ?? "").replace(/[-_\s]/g, "").toLowerCase();
  return (
    normalizedKey === "apikey" ||
    normalizedKey === "authorization" ||
    normalizedKey === "token" ||
    normalizedKey === "secret" ||
    /^(?:home|hr)deepseek(?:api)?key$/i.test(normalizedKey) ||
    /^deepseek(?:home|hr)?apikey$/i.test(normalizedKey) ||
    /^deepseek(?:home|hr)?key$/i.test(normalizedKey) ||
    /^(?:deepseek)?(?:home|hr)apikey$/i.test(normalizedKey) ||
    /^(?:deepseek)?(?:home|hr)key$/i.test(normalizedKey) ||
    /^(?:api|deepseek).*(?:key|token|secret)$/i.test(normalizedKey)
  );
}

function stripCredentialFields(value) {
  if (Array.isArray(value)) return value.map(stripCredentialFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isCredentialField(key))
      .map(([key, item]) => [key, stripCredentialFields(item)])
  );
}

export function createResourceApi(client = null) {
  const run = client ? (method, url, payload) => callClient(client, method, url, payload) : request;
  const scheduleSyncId = (payload = {}) =>
    payload.scheduleItemId ||
    payload.schedule_item_id ||
    payload.itemId ||
    payload.item_id ||
    payload.itemUid ||
    payload.item_uid ||
    payload.taskUid ||
    payload.task_uid ||
    payload.taskId ||
    payload.task_id ||
    payload.workItemId ||
    payload.work_item_id ||
    "";

  return {
    getResources(query = {}) {
      return run("get", `/workspace/resources${toQueryString(query)}`);
    },
    getWorkload(query = {}) {
      return run("get", `/workspace/workload${toQueryString(query)}`);
    },
    previewAssignment(payload = {}) {
      return run("post", "/workspace/assignments/preview", payload);
    },
    confirmAssignment(payload = {}) {
      return run("post", "/workspace/assignments/confirm", payload);
    },
    forceConfirmAssignment(payload = {}) {
      return run("post", "/workspace/assignments/force-confirm", payload);
    },
    analyzeAssignment(payload = {}) {
      return run("post", "/workspace/resources/ai/assignment-advice", stripCredentialFields(payload));
    },
    rescheduleWorkItem(payload = {}) {
      const id = scheduleSyncId(payload);
      if (!String(id || "").trim()) return Promise.reject(new Error("workItemId is required"));
      return run("patch", `/workspace/resources/work-items/${encodeQueryValue(id)}/schedule`, payload);
    }
  };
}

export const resourceApi = createResourceApi();

export default resourceApi;
