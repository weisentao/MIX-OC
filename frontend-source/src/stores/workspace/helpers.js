export function cleanProjectName(name = "") {
  return String(name).replace("??", "");
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
  return String(title).trim() === "???????" || String(title).trim() === "???????";
}
