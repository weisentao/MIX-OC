export function cleanProjectName(name = "") {
  return String(name).replace("??", "");
}

const DEPARTMENT_KEY_LABEL_MAP = {
  project: "\u9879\u76ee\u7ba1\u7406",
  aigc: "AIGC",
  design: "\u7f8e\u672f\u8bbe\u8ba1",
  "design-1": "\u7f8e\u672f\u8bbe\u8ba1\u4e00\u90e8",
  "design-2": "\u7f8e\u672f\u8bbe\u8ba1\u4e8c\u90e8",
  threeD: "\u4e09\u7ef4\u52a8\u6001",
  motion: "\u52a8\u6548\u8bbe\u8ba1",
  post: "\u89c6\u6548\u5305\u88c5",
  "post-1": "\u89c6\u6548\u5305\u88c5\u4e00\u90e8",
  "post-2": "\u89c6\u6548\u5305\u88c5\u4e8c\u90e8",
  "post-3": "\u89c6\u6548\u5305\u88c5\u4e09\u90e8"
};

const DEPARTMENT_ALIAS_KEY_MAP = {
  project: "project",
  pm: "project",
  "\u9879\u76ee\u7ba1\u7406": "project",
  "\u9879\u76ee\u7ba1\u7406\u90e8": "project",
  aigc: "aigc",
  ai: "aigc",
  "\u7f8e\u672f\u8bbe\u8ba1": "design",
  "\u7f8e\u672f\u8bbe\u8ba1\u90e8": "design",
  "\u8bbe\u8ba1": "design",
  "design-1": "design-1",
  "\u7f8e\u672f\u8bbe\u8ba1\u4e00\u90e8": "design-1",
  "\u7f8e\u672f\u8bbe\u8ba11\u90e8": "design-1",
  "\u7f8e\u672f\u8bbe\u8ba1\u7b2c\u4e00\u90e8": "design-1",
  "design-2": "design-2",
  "\u7f8e\u672f\u8bbe\u8ba1\u4e8c\u90e8": "design-2",
  "\u7f8e\u672f\u8bbe\u8ba12\u90e8": "design-2",
  "\u7f8e\u672f\u8bbe\u8ba1\u7b2c\u4e8c\u90e8": "design-2",
  threed: "threeD",
  "3d": "threeD",
  "\u4e09\u7ef4": "threeD",
  "\u4e09\u7ef4\u8bbe\u8ba1": "threeD",
  "\u4e09\u7ef4\u52a8\u6001": "threeD",
  "\u4e09\u7ef4\u52a8\u6001\u8bbe\u8ba1\u90e8": "threeD",
  "\u4e09\u7ef4\u52a8\u753b": "threeD",
  "\u4e09\u7ef4\u52a8\u753b\u8bbe\u8ba1\u90e8": "threeD",
  motion: "motion",
  "\u52a8\u6548\u8bbe\u8ba1": "motion",
  "\u52a8\u6548\u8bbe\u8ba1\u90e8": "motion",
  "\u52a8\u6548": "motion",
  post: "post",
  delivery: "post",
  "\u89c6\u6548\u5305\u88c5": "post",
  "\u89c6\u6548\u5305\u88c5\u90e8": "post",
  "\u540e\u671f\u5408\u6210": "post",
  "\u540e\u671f\u5408\u6210\u90e8": "post",
  "\u540e\u671f\u8bbe\u8ba1": "post",
  "\u540e\u671f\u8bbe\u8ba1\u90e8": "post",
  "post-1": "post-1",
  "\u89c6\u6548\u5305\u88c5\u4e00\u90e8": "post-1",
  "\u89c6\u65481\u90e8": "post-1",
  "\u89c6\u6548\u4e00\u90e8": "post-1",
  "\u540e\u671f\u5408\u6210\u4e00\u90e8": "post-1",
  "\u540e\u671f\u8bbe\u8ba1\u4e00\u90e8": "post-1",
  "post-2": "post-2",
  "\u89c6\u6548\u5305\u88c5\u4e8c\u90e8": "post-2",
  "\u89c6\u65482\u90e8": "post-2",
  "\u89c6\u6548\u4e8c\u90e8": "post-2",
  "\u540e\u671f\u5408\u6210\u4e8c\u90e8": "post-2",
  "\u540e\u671f\u8bbe\u8ba1\u4e8c\u90e8": "post-2",
  "post-3": "post-3",
  "\u89c6\u6548\u5305\u88c5\u4e09\u90e8": "post-3",
  "\u89c6\u65483\u90e8": "post-3",
  "\u89c6\u6548\u4e09\u90e8": "post-3",
  "\u540e\u671f\u5408\u6210\u4e09\u90e8": "post-3",
  "\u540e\u671f\u8bbe\u8ba1\u4e09\u90e8": "post-3"
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function compactDepartmentText(value) {
  return cleanText(value).replace(/[\s\-_:/\\|>]+/g, "").toLowerCase();
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function firstNonEmptyValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return undefined;
}

function normalizeLegacyDepartmentText(value) {
  return cleanText(value)
    .replace(/\u540e\u671f\u5408\u6210/g, "\u89c6\u6548\u5305\u88c5")
    .replace(/\u540e\u671f\u8bbe\u8ba1/g, "\u89c6\u6548\u5305\u88c5")
    .replace(/\u4e09\u7ef4\u52a8\u753b/g, "\u4e09\u7ef4\u52a8\u6001");
}

function departmentKeyFromAlias(value) {
  const direct = cleanText(value);
  if (!direct) return "";
  if (DEPARTMENT_KEY_LABEL_MAP[direct]) return direct;
  const compact = compactDepartmentText(direct);
  if (!compact) return "";
  return DEPARTMENT_ALIAS_KEY_MAP[compact] || DEPARTMENT_ALIAS_KEY_MAP[direct.toLowerCase()] || "";
}

function normalizeDepartmentLabel(value = "", fallback = "") {
  const text = normalizeLegacyDepartmentText(value);
  const key = departmentKeyFromAlias(text);
  if (key && DEPARTMENT_KEY_LABEL_MAP[key]) return DEPARTMENT_KEY_LABEL_MAP[key];
  if (text) return text;
  const fallbackKey = departmentKeyFromAlias(fallback);
  if (fallbackKey && DEPARTMENT_KEY_LABEL_MAP[fallbackKey]) return DEPARTMENT_KEY_LABEL_MAP[fallbackKey];
  return normalizeLegacyDepartmentText(fallback);
}

function normalizeDepartmentPathValue(pathValue, fallbackLabel = "") {
  let parts = [];
  if (Array.isArray(pathValue)) {
    parts = pathValue;
  } else {
    const text = cleanText(pathValue);
    if (text) parts = text.split(/[>\\/|]+/);
  }
  const normalized = parts
    .map((part) => normalizeDepartmentLabel(part))
    .filter(Boolean);
  if (normalized.length) return normalized;
  const fallback = normalizeDepartmentLabel(fallbackLabel);
  return fallback ? [fallback] : [];
}

export function lower(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeId(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

export function idsEqual(left, right) {
  const leftId = normalizeId(left);
  const rightId = normalizeId(right);
  return Boolean(leftId || rightId) && leftId === rightId;
}

export function parseTags(value) {
  return String(value || "")
    .split(/[#?,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

export function normalizeTaskModuleKey(key) {
  if (key === "ai") return "aigc";
  return key || "project";
}

export function normalizeProjectRole(role, fallback = "readonly") {
  const normalized = lower(role).replace(/\s+/g, "");
  if (["manager", "admin", "owner", "projectmanager", "project_manager"].includes(normalized)) return "manager";
  if (["editor", "edit", "writer", "write", "contributor"].includes(normalized)) return "editor";
  if (["readonly", "read", "viewer", "read_only"].includes(normalized)) return "readonly";
  return normalizeProjectRole(fallback, "readonly");
}

export function normalizeTemplateSharePermission(permission, fallback = "read") {
  const normalized = lower(permission).replace(/\s+/g, "");
  if (["edit", "editor", "write", "editable"].includes(normalized)) return "edit";
  if (["read", "readonly", "viewer", "read_only"].includes(normalized)) return "read";
  return normalizeTemplateSharePermission(fallback, "read");
}

export function normalizeBoardSharePermission(permission, fallback = "readonly") {
  const normalized = lower(permission).replace(/\s+/g, "");
  if (["edit", "editor", "write", "editable"].includes(normalized)) return "edit";
  if (["read", "readonly", "viewer", "read_only"].includes(normalized)) return "readonly";
  return normalizeBoardSharePermission(fallback, "readonly");
}

export function normalizeDepartmentFields(source = {}, fallback = {}) {
  const sourceObject = source && typeof source === "object" ? source : { department: source };
  const fallbackObject = fallback && typeof fallback === "object" ? fallback : { department: fallback };

  const rawDepartment = firstNonEmptyText(
    sourceObject.department,
    sourceObject.displayDepartment,
    sourceObject.display_department,
    sourceObject.departmentLabel,
    sourceObject.department_label,
    sourceObject.departmentName,
    sourceObject.department_name,
    fallbackObject.department,
    fallbackObject.displayDepartment,
    fallbackObject.departmentLabel,
    fallbackObject.departmentName
  );
  const rawDepartmentKey = firstNonEmptyText(
    sourceObject.departmentKey,
    sourceObject.department_key,
    sourceObject.departmentId,
    sourceObject.department_id,
    fallbackObject.departmentKey,
    fallbackObject.department_key,
    fallbackObject.departmentId,
    fallbackObject.department_id
  );
  const key = departmentKeyFromAlias(rawDepartmentKey || rawDepartment || fallbackObject.departmentKey || fallbackObject.department);
  const displayDepartment = normalizeDepartmentLabel(
    firstNonEmptyText(sourceObject.displayDepartment, sourceObject.display_department, sourceObject.departmentLabel, sourceObject.department_label, rawDepartment),
    key || fallbackObject.department || fallbackObject.displayDepartment
  );
  const departmentPath = normalizeDepartmentPathValue(
    firstNonEmptyValue(sourceObject.departmentPath, sourceObject.department_path, fallbackObject.departmentPath, fallbackObject.department_path),
    displayDepartment
  );

  return {
    department: displayDepartment,
    displayDepartment,
    departmentLabel: displayDepartment,
    departmentKey: key,
    departmentPath
  };
}

export function normalizeDepartmentOwner(value = "") {
  const text = cleanText(value);
  if (!text) return "";
  const matched = text.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
  if (!matched) return normalizeDepartmentLabel(text);
  const department = normalizeDepartmentLabel(matched[1]);
  const owner = cleanText(matched[2]);
  return owner ? `${department}: ${owner}` : department;
}

export function normalizeDate(value) {
  const text = String(value || "").trim().replaceAll("-", "/");
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}/${isoMatch[2].padStart(2, "0")}/${isoMatch[3].padStart(2, "0")}`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

export function isSharedTemplateSectionName(title = "") {
  const normalizedTitle = String(title).trim();
  return normalizedTitle === "共享给我的模板" || normalizedTitle === "共享给我的模版";
}
