import http, { isLocalAuthToken, persistBackendSession } from "./http.js";

const AUTH_STORE_KEY = "xjg_local_auth_users";
const USER_STORE_KEY = "xjg_local_users";
const DEFAULT_ADMIN_USER = {
  id: "u-admin",
  username: "admin",
  name: "admin",
  role: "admin",
  avatar: "A",
  department: "项目管理部",
  departmentEn: "项目管理部",
  email: "",
  mbti: "ENTP",
  job: "超级管理员",
  phone: "",
  registeredAt: "2026-05-09 15:20:05",
  mood: "",
  signature: "",
  profileNote: "本地离线管理员账号",
  status: "active",
  characterLabel: "超级管理员",
  avatarImage: "",
  characterImage: "",
  signatureImage: ""
};
const DEFAULT_ADMIN_AUTH = {
  id: "admin",
  username: "admin",
  password: "admin",
  userId: DEFAULT_ADMIN_USER.id,
  token: "local-admin-token",
  phone: "",
  securityQuestion: "",
  securityAnswer: ""
};

function isLocalAuthFallbackEnabled() {
  const viteEnv = import.meta.env || {};
  const processEnv = globalThis.process?.env || {};
  return (
    viteEnv.VITE_ENABLE_LOCAL_AUTH_FALLBACK === "true" ||
    processEnv.VITE_ENABLE_LOCAL_AUTH_FALLBACK === "true"
  );
}

function isBackendAuthDenied(error) {
  const status = Number(error?.response?.status);
  return status === 401 || status === 403;
}

function canUseLocalFallback(error) {
  return isLocalAuthFallbackEnabled() && !isBackendAuthDenied(error);
}

function toErrorMessage(error, fallback) {
  const message = error?.response?.data?.message || error?.message || fallback;
  return String(message || fallback);
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function localUsers() {
  const storedUsers = readJson(USER_STORE_KEY, []);
  const users = Array.isArray(storedUsers) ? storedUsers : [];
  return users.some((user) => user.id === DEFAULT_ADMIN_USER.id) ? users : [DEFAULT_ADMIN_USER, ...users];
}

function localAuthUsers() {
  const storedAuthUsers = readJson(AUTH_STORE_KEY, []);
  const users = Array.isArray(storedAuthUsers) ? storedAuthUsers : [];
  return users.some((user) => user.username === DEFAULT_ADMIN_AUTH.username) ? users : [DEFAULT_ADMIN_AUTH, ...users];
}

function saveLocalAuthUser(nextAuthUser) {
  const storedAuthUsers = readJson(AUTH_STORE_KEY, []);
  const index = storedAuthUsers.findIndex((user) => user.username === nextAuthUser.username);
  if (index === -1) {
    storedAuthUsers.push(nextAuthUser);
  } else {
    storedAuthUsers[index] = { ...storedAuthUsers[index], ...nextAuthUser };
  }
  writeJson(AUTH_STORE_KEY, storedAuthUsers);
}

function findLocalUser(userId) {
  return localUsers().find((user) => user.id === userId) || null;
}

function createLocalRegisteredUser(payload) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  const name = String(payload.name || "").trim();

  if (!/^MIX-[A-Za-z0-9_-]+$/.test(username)) {
    throw new Error("用户名必须以 MIX- 开头，例如 MIX-zhumin");
  }
  if (!password || !name || !payload.phone || !payload.email || !payload.securityQuestion || !payload.securityAnswer) {
    throw new Error("请完整填写注册信息");
  }
  if (localAuthUsers().some((user) => user.username === username)) {
    throw new Error("该用户名已存在");
  }

  const id = `u-local-${Date.now()}`;
  const user = {
    id,
    name,
    role: "user",
    avatar: name.slice(0, 1).toUpperCase(),
    department: payload.department || "项目管理",
    departmentEn: payload.department === "三维视觉部" ? "三维视觉部" : "项目管理部",
    email: payload.email,
    mbti: payload.mbti || "ENTP",
    job: payload.job || "项目专员",
    phone: payload.phone,
    registeredAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    mood: "今天也要把任务说清楚",
    signature: "所有协作都从清单和评论开始。",
    profileNote: payload.job || "项目专员",
    status: "active",
    characterLabel: payload.job || "项目专员",
    avatarImage: "",
    characterImage: "",
    signatureImage: ""
  };
  const token = `local-${id}-token`;
  const storedUsers = readJson(USER_STORE_KEY, []);
  const storedAuthUsers = readJson(AUTH_STORE_KEY, []);
  writeJson(USER_STORE_KEY, [...storedUsers, user]);
  writeJson(AUTH_STORE_KEY, [
    ...storedAuthUsers,
    {
      id: username,
      username,
      password,
      userId: id,
      token,
      phone: payload.phone,
      securityQuestion: payload.securityQuestion,
      securityAnswer: String(payload.securityAnswer || "").trim()
    }
  ]);
  return { token, user };
}

function mirrorRegisteredUser(payload, result) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  const user = result?.user;
  if (!username || !password || !user?.id) return result;
  saveLocalAuthUser({
    id: username,
    username,
    password,
    userId: user.id,
    token: result.token || `local-${user.id}-token`,
    phone: payload.phone,
    securityQuestion: payload.securityQuestion,
    securityAnswer: String(payload.securityAnswer || "").trim()
  });
  return result;
}

function loginLocally(username, password) {
  const authUser = localAuthUsers().find((user) => user.username === username && user.password === password);
  if (!authUser) throw new Error("账号或密码不正确");
  return {
    token: authUser.token,
    user: findLocalUser(authUser.userId)
  };
}

function getLocalCurrentUser() {
  const token = localStorage.getItem("xjg_token");
  const authUser = localAuthUsers().find((user) => user.token === token);
  if (!authUser) throw new Error("登录已过期，请重新登录");
  return findLocalUser(authUser.userId);
}

function getSecurityQuestionLocally() {
  throw new Error("当前未启用密保问题，请使用账号和手机号找回密码。");
}

function resetPasswordLocally({ username, phone, newPassword }) {
  const authUser = localAuthUsers().find((user) => user.username === username);
  if (!authUser) throw new Error("未找到该账号");
  if (!newPassword || String(newPassword).length < 6) throw new Error("新密码至少 6 位");
  if (String(authUser.phone || "") !== String(phone || "").trim()) throw new Error("手机号验证失败");
  saveLocalAuthUser({ ...authUser, password: String(newPassword), token: `local-${authUser.userId}-${Date.now()}` });
  return { message: "密码已重置，请重新登录。" };
}

function resetPasswordByPhoneLocally({ username, phone, newPassword }) {
  return resetPasswordLocally({ username, phone, newPassword });
}

function changePasswordLocally({ oldPassword, newPassword }) {
  const token = localStorage.getItem("xjg_token");
  const authUser = localAuthUsers().find((user) => user.token === token);
  if (!authUser) throw new Error("登录已过期，请重新登录");
  if (authUser.username === "admin") throw new Error("管理员密码为固定密码，无法修改");
  if (String(oldPassword || "") !== String(authUser.password || "")) throw new Error("旧密码不正确");
  if (!newPassword || String(newPassword).length < 6) throw new Error("新密码至少 6 位");
  saveLocalAuthUser({ ...authUser, password: String(newPassword), token: `local-${authUser.userId}-${Date.now()}` });
  return { message: "密码已修改，请重新登录。" };
}

export async function login(username, password) {
  try {
    const result = await http.post("/login", { username, password });
    persistBackendSession(result);
    return result;
  } catch (error) {
    if (!canUseLocalFallback(error)) {
      throw new Error(toErrorMessage(error, "登录失败"));
    }
    try {
      return loginLocally(username, password);
    } catch (localError) {
      if (error.response) throw new Error(toErrorMessage(error, "登录失败"));
      throw localError;
    }
  }
}

export async function register(payload) {
  try {
    const result = await http.post("/register", payload);
    persistBackendSession(result);
    return mirrorRegisteredUser(payload, result);
  } catch (error) {
    if (!canUseLocalFallback(error) || (error.response && error.response.status !== 404 && error.response.status !== 0)) {
      throw new Error(toErrorMessage(error, "注册失败"));
    }
    return createLocalRegisteredUser(payload);
  }
}

export async function getSecurityQuestion(username) {
  try {
    return await http.get(`/security-question?username=${encodeURIComponent(username)}`);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error(toErrorMessage(error, "当前未启用密保问题，请使用手机号找回密码。"));
    }
    if (!canUseLocalFallback(error) || (error.response && error.response.status !== 0)) {
      throw new Error(toErrorMessage(error, "获取密保问题失败"));
    }
    return getSecurityQuestionLocally(username);
  }
}

export async function forgotPassword(payload) {
  try {
    return await http.post("/forgot-password", payload);
  } catch (error) {
    if (!canUseLocalFallback(error) || (error.response && error.response.status !== 404 && error.response.status !== 0)) {
      throw new Error(toErrorMessage(error, "找回密码失败"));
    }
    if (payload?.phone) return resetPasswordByPhoneLocally(payload);
    return resetPasswordLocally(payload);
  }
}

export async function changePassword(payload) {
  try {
    return await http.post("/change-password", payload);
  } catch (error) {
    if (!canUseLocalFallback(error) || (error.response && error.response.status !== 404 && error.response.status !== 0)) {
      throw new Error(toErrorMessage(error, "修改密码失败"));
    }
    return changePasswordLocally(payload);
  }
}

export async function getCurrentUser() {
  try {
    return await http.get("/me");
  } catch (error) {
    const token = localStorage.getItem("xjg_token");
    if (isLocalAuthToken(token) && !isLocalAuthFallbackEnabled()) {
      throw new Error("登录已过期，请重新登录");
    }
    if (!canUseLocalFallback(error) || (error.response && error.response.status !== 404 && error.response.status !== 0)) {
      throw new Error(toErrorMessage(error, "获取当前用户失败"));
    }
    return getLocalCurrentUser();
  }
}

export async function updateCurrentUserProfile(payload) {
  try {
    return await http.patch("/me", payload);
  } catch (error) {
    throw new Error(toErrorMessage(error, "更新个人资料失败"));
  }
}
