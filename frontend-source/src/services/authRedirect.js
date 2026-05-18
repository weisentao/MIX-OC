const SECTION_STORE_KEY = "xjg_post_login_section";
const WORKSPACE_SECTIONS = new Set(["home", "schedule", "flow", "boards", "resource", "optimize"]);

function safeStorage(storage = globalThis.localStorage) {
  return storage && typeof storage.getItem === "function" ? storage : null;
}

function cleanSection(value = "") {
  const section = String(value || "").trim();
  return WORKSPACE_SECTIONS.has(section) ? section : "";
}

function cleanRedirectPath(value = "") {
  const text = String(value || "").trim();
  if (!text || text.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(text)) return "/";
  return text.startsWith("/") ? text : "/";
}

export function rememberWorkspaceSection(section, storage = globalThis.localStorage) {
  const clean = cleanSection(section);
  const targetStorage = safeStorage(storage);
  if (!clean || !targetStorage) return "";
  targetStorage.setItem(SECTION_STORE_KEY, clean);
  return clean;
}

export function readRememberedWorkspaceSection(storage = globalThis.localStorage) {
  const targetStorage = safeStorage(storage);
  return cleanSection(targetStorage?.getItem(SECTION_STORE_KEY));
}

export function buildLoginRedirectQuery(route = {}, options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const redirect = cleanRedirectPath(route.fullPath || route.path || "/");
  const section = cleanSection(route.query?.section) || readRememberedWorkspaceSection(storage);
  return section ? { redirect, section } : { redirect };
}

export function resolvePostLoginTarget(query = {}) {
  const redirect = cleanRedirectPath(query.redirect);
  const section = cleanSection(query.section);
  return {
    path: redirect,
    query: section ? { section } : {}
  };
}

export function consumePostLoginSection(query = {}, storage = globalThis.localStorage) {
  const targetStorage = safeStorage(storage);
  const section = cleanSection(query.section) || readRememberedWorkspaceSection(targetStorage);
  targetStorage?.removeItem(SECTION_STORE_KEY);
  return section;
}
