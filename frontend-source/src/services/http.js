import axios from "axios";

const viteEnv = import.meta.env || {};
const NON_BACKEND_TOKEN_PREFIXES = ["local-", "mock-", "demo-"];

export function normalizeApiBaseURL(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text || text === "/") return "/api";
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (!url.pathname || url.pathname === "/") {
        url.pathname = "/api";
        return url.toString().replace(/\/+$/, "");
      }
    } catch {
      return text;
    }
    return text;
  }
  return text.startsWith("/") ? text : `/${text}`;
}

export function isLocalAuthToken(token) {
  return typeof token === "string" && NON_BACKEND_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix));
}

let localAuthUpgradePromise = null;

function readJson(key, fallback) {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function persistBackendSession(result) {
  if (!result?.token || isLocalAuthToken(result.token)) return "";
  globalThis.localStorage?.setItem("xjg_token", result.token);
  if (result.user) globalThis.localStorage?.setItem("xjg_user", JSON.stringify(result.user));
  return result.token;
}

function publicAuthEndpoint(url = "") {
  const path = String(url || "").replace(/^https?:\/\/[^/]+/i, "");
  return /\/(?:login|register|forgot-password|security-question|dev\/token)(?:[/?#]|$)/.test(path);
}

function isBackendDenied(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  return status === 401 || status === 403 || status === 409;
}

function normalizeAuthUpgradeError(error, fallbackStatus = 0) {
  const status = Number(error?.response?.status ?? error?.status ?? error?.statusCode ?? fallbackStatus);
  const response =
    error?.response ||
    (status
      ? {
          status,
          data: { message: error?.message || "登录已过期，请重新登录" }
        }
      : undefined);
  const message = response?.data?.message || error?.message || "登录已过期，请重新登录";
  const normalized = new Error(message);
  normalized.response = response;
  normalized.status = status;
  normalized.statusCode = status;
  normalized.authRequired = status === 401;
  normalized.forbidden = status === 403;
  normalized.permissionDenied = status === 403;
  return normalized;
}

function clearBackendSession() {
  globalThis.localStorage?.removeItem("xjg_token");
  globalThis.localStorage?.removeItem("xjg_user");
}

function notifyAuthRequired(error) {
  if (!error?.authRequired || typeof globalThis.window?.dispatchEvent !== "function") return;
  if (error.authNotified) return;
  error.authNotified = true;
  try {
    globalThis.window.dispatchEvent(
      new CustomEvent("xjg-auth-required", {
        detail: {
          status: error.status,
          message: error.message
        }
      })
    );
  } catch {
  }
}

function localAuthRecord(token) {
  if (token === "local-admin-token") {
    return {
      authUser: { username: "admin", password: "admin", token, userId: "u-admin" },
      user: { id: "u-admin", username: "admin", name: "admin", role: "admin" }
    };
  }

  const authUsers = readJson("xjg_local_auth_users", []);
  const localUsers = readJson("xjg_local_users", []);
  const authUser = Array.isArray(authUsers) ? authUsers.find((item) => item?.token === token) : null;
  const user = authUser && Array.isArray(localUsers) ? localUsers.find((item) => item?.id === authUser.userId) : null;
  return authUser ? { authUser, user } : null;
}

function registerPayloadFromLocal(record) {
  const { authUser = {}, user = {} } = record || {};
  return {
    username: authUser.username || user.username || "",
    password: authUser.password || "",
    name: user.name || authUser.username || "",
    phone: authUser.phone || user.phone || "",
    email: user.email || "",
    department: user.department || "项目管理",
    job: user.job || "项目专员",
    mbti: user.mbti || "ENTP",
    securityQuestion: authUser.securityQuestion || "",
    securityAnswer: authUser.securityAnswer || ""
  };
}

async function upgradeLocalAuthToken(token) {
  if (!isLocalAuthToken(token)) return token || "";
  if (localAuthUpgradePromise) return localAuthUpgradePromise;

  localAuthUpgradePromise = (async () => {
    const record = localAuthRecord(token);
    if (!record?.authUser?.username || !record.authUser.password) return "";

    try {
      return persistBackendSession(
        await http.post(
          "/login",
          { username: record.authUser.username, password: record.authUser.password },
          { skipAuthUpgrade: true }
        )
      );
    } catch (loginError) {
      if (token === "local-admin-token" || !isBackendDenied(loginError)) throw loginError;
    }

    return persistBackendSession(await http.post("/register", registerPayloadFromLocal(record), { skipAuthUpgrade: true }));
  })().finally(() => {
    localAuthUpgradePromise = null;
  });

  return localAuthUpgradePromise;
}

const http = axios.create({
  baseURL: normalizeApiBaseURL(viteEnv.VITE_API_BASE_URL),
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

http.interceptors.request.use(
  async (config) => {
    const token = globalThis.localStorage?.getItem("xjg_token");
    config.headers = config.headers || {};
    let backendToken = token;

    if (token && isLocalAuthToken(token) && config.url && !config.skipAuthUpgrade && !publicAuthEndpoint(config.url)) {
      try {
        backendToken = await upgradeLocalAuthToken(token);
      } catch (error) {
        const normalized = normalizeAuthUpgradeError(error);
        if (normalized.authRequired) clearBackendSession();
        notifyAuthRequired(normalized);
        return Promise.reject(normalized);
      }
      if (!backendToken || isLocalAuthToken(backendToken)) {
        clearBackendSession();
        const normalized = normalizeAuthUpgradeError(new Error("登录已过期，请重新登录"), 401);
        notifyAuthRequired(normalized);
        return Promise.reject(normalized);
      }
    }

    if (backendToken && !isLocalAuthToken(backendToken)) {
      config.headers.Authorization = `Bearer ${backendToken}`;
    } else if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || "请求失败";
    const status = error.response?.status ?? error.status;
    const normalized = {
      ...error,
      message,
      response: error.response,
      status,
      statusCode: error.response?.status ?? error.statusCode,
      authRequired: status === 401,
      forbidden: status === 403,
      permissionDenied: status === 403
    };
    if (normalized.authRequired) {
      clearBackendSession();
      notifyAuthRequired(normalized);
    }
    return Promise.reject(normalized);
  }
);

export default http;
