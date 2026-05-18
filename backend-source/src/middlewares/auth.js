import { verifyAccessToken } from "../config/jwt.js";

export function buildAuthErrorBody(message = "请先登录", code = "UNAUTHORIZED", requestId = "") {
  const body = { code, message };
  if (requestId) body.requestId = requestId;
  return body;
}

const ROLE_MATRIX = {
  admin: {
    canWrite: true,
    canDelete: true,
    canExport: true,
    permissions: [
      "admin.manage",
      "hr.read",
      "hr.manage",
      "storage.read",
      "storage.write",
      "storage.delete",
      "workspace.read",
      "workspace.write",
      "workspace.delete",
      "workspace.export",
      "resource.forceassign"
    ]
  },
  manager: {
    canWrite: true,
    canDelete: false,
    canExport: true,
    permissions: [
      "workspace.read",
      "workspace.write",
      "workspace.export",
      "storage.read",
      "storage.write",
      "hr.read"
    ]
  },
  employee: {
    canWrite: false,
    canDelete: false,
    canExport: false,
    permissions: [
      "workspace.read",
      "storage.read",
      "storage.write"
    ]
  }
};

const ROLE_ALIASES = {
  user: "employee",
  super_admin: "admin",
  department_admin: "manager",
  department_manager: "manager",
  project_manager: "manager"
};

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizePermissionList(value = []) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return unique(values.map((permission) => normalizeText(permission)));
}

function rawRole(auth = {}) {
  return normalizeText(auth.role);
}

export function normalizeRole(auth = {}) {
  const role = rawRole(auth);
  const canonicalRole = ROLE_ALIASES[role] || role;
  return ROLE_MATRIX[canonicalRole] ? canonicalRole : "employee";
}

export function getRoleCapabilities(auth = {}) {
  const role = normalizeRole(auth);
  return {
    role,
    canWrite: ROLE_MATRIX[role].canWrite,
    canDelete: ROLE_MATRIX[role].canDelete,
    canExport: ROLE_MATRIX[role].canExport
  };
}

export function getRolePermissions(auth = {}) {
  const role = normalizeRole(auth);
  return [...ROLE_MATRIX[role].permissions];
}

export function getAuthPermissions(auth = {}) {
  return unique([
    ...getRolePermissions(auth),
    ...normalizePermissionList(auth.permissions),
    ...normalizePermissionList(auth.permission)
  ]);
}

function permissionMatches(granted, required) {
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(".*")) {
    return required.startsWith(granted.slice(0, -1));
  }
  return false;
}

export function hasPermission(auth = {}, permission = "") {
  const required = normalizeText(permission);
  if (!required) return false;
  return getAuthPermissions(auth).some((granted) => permissionMatches(granted, required));
}

export function canWrite(auth = {}) {
  return getRoleCapabilities(auth).canWrite;
}

export function canDelete(auth = {}) {
  return getRoleCapabilities(auth).canDelete;
}

export function canExport(auth = {}) {
  return getRoleCapabilities(auth).canExport;
}

export function assertRoleCan(auth = {}, action = "") {
  const capabilities = getRoleCapabilities(auth);
  const capabilityKey = `can${String(action || "").trim().slice(0, 1).toUpperCase()}${String(action || "").trim().slice(1)}`;
  if (!capabilities[capabilityKey]) {
    const error = new Error("无权限执行该操作");
    error.statusCode = 403;
    throw error;
  }
  return capabilities;
}

function actionFromPermission(permission = "") {
  const clean = normalizeText(permission);
  if (clean === "resource.forceassign") return "force assign";
  return clean.split(".").filter(Boolean).pop() || "access";
}

function forbidden(message = "无权限访问") {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function enrichAuth(auth = {}) {
  const role = normalizeRole(auth);
  return {
    ...auth,
    role,
    permissions: getAuthPermissions(auth)
  };
}

export function requireRole(roles = []) {
  const allowedRoles = normalizePermissionList(roles);
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json(buildAuthErrorBody("请先登录", "UNAUTHORIZED", req.requestId));
    }

    const actualRole = rawRole(req.auth);
    const effectiveRole = normalizeRole(req.auth);
    if (allowedRoles.includes(actualRole) || allowedRoles.includes(effectiveRole)) {
      req.auth = enrichAuth(req.auth);
      return next();
    }

    return next(forbidden("无权限访问"));
  };
}

export function requirePermission(permissions = []) {
  const requiredPermissions = normalizePermissionList(permissions);
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json(buildAuthErrorBody("请先登录", "UNAUTHORIZED", req.requestId));
    }

    const auth = enrichAuth(req.auth);
    if (requiredPermissions.some((permission) => hasPermission(auth, permission))) {
      req.auth = auth;
      return next();
    }

    return next(forbidden("无权限执行该操作"));
  };
}

export function authRequired(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json(buildAuthErrorBody("请先登录", "UNAUTHORIZED", req.requestId));
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = enrichAuth(payload);
    return next();
  } catch (error) {
    return res.status(401).json(buildAuthErrorBody("请先登录", "UNAUTHORIZED", req.requestId));
  }
}
