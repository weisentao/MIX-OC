function encodePath(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

function toQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

function requirePathValue(name, value) {
  const text = String(value ?? "").trim();
  if (!text) return Promise.reject(new Error(`${name} is required`));
  return Promise.resolve(encodePath(text));
}

function isNotFoundError(error) {
  return Number(error?.response?.status || error?.status || error?.statusCode || 0) === 404;
}

let httpClientPromise;

function getHttp() {
  if (!httpClientPromise) {
    httpClientPromise = import("./http.js").then((mod) => mod.default);
  }
  return httpClientPromise;
}

function runRequest(client, method, url, payload) {
  if (payload === undefined) return client[method](url);
  return client[method](url, payload);
}

function request(method, url, payload) {
  return getHttp().then((http) => runRequest(http, method, url, payload));
}

function callNotificationRoute(call, method, url, payload) {
  return Promise.resolve()
    .then(() => call(method, url, payload))
    .catch((error) => {
      if (!isNotFoundError(error) || url.startsWith("/workspace/notifications")) throw error;
      return call(method, `/workspace${url}`, payload);
    });
}

export function createNotificationApi(clientOrRequest = request) {
  const call = typeof clientOrRequest === "function"
    ? clientOrRequest
    : (method, url, payload) => runRequest(clientOrRequest, method, url, payload);

  return {
    listNotifications(params = {}) {
      return callNotificationRoute(call, "get", `/notifications${toQuery(params)}`);
    },
    getUnreadCount() {
      return callNotificationRoute(call, "get", "/notifications/unread-count");
    },
    markNotificationRead(notificationId) {
      return requirePathValue("notificationId", notificationId).then((id) =>
        callNotificationRoute(call, "patch", `/notifications/${id}/read`, {})
      );
    },
    markAllNotificationsRead() {
      return callNotificationRoute(call, "patch", "/notifications/read-all", {});
    }
  };
}

export const notificationApi = createNotificationApi(request);

export default notificationApi;
