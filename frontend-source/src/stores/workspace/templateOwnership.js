function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTemplateSharePermission(value = "read") {
  const permission = normalizeText(value);
  return ["edit", "editor", "write", "editable", "manage", "owner"].includes(permission) ? "edit" : "read";
}

function userIdentityKeys(user = {}) {
  const keys = [user.id, user.userId, user.username, user.name].map(normalizeText).filter(Boolean);
  return [...new Set(keys)];
}

function templateShareInfoEntry(templateName = "", templateShareInfo = {}) {
  if (!templateName) return null;
  return templateShareInfo?.[templateName] || null;
}

export function templatePermissionForUser(templateName = "", templateShareInfo = {}, user = {}) {
  const info = templateShareInfoEntry(templateName, templateShareInfo);
  if (!info) return null;
  const identityKeys = userIdentityKeys(user);
  if (!identityKeys.length) return null;

  const recipients = Array.isArray(info.recipients) ? info.recipients : [];
  for (const recipient of recipients) {
    const recipientKeys = [recipient?.userId, recipient?.userName].map(normalizeText).filter(Boolean);
    if (recipientKeys.some((key) => identityKeys.includes(key))) {
      return normalizeTemplateSharePermission(recipient?.permission);
    }
  }

  const permissionMap = info.permissions && typeof info.permissions === "object" ? info.permissions : {};
  for (const key of Object.keys(permissionMap)) {
    if (!identityKeys.includes(normalizeText(key))) continue;
    return normalizeTemplateSharePermission(permissionMap[key]);
  }

  const sharedWith = Array.isArray(info.sharedWith) ? info.sharedWith.map(normalizeText).filter(Boolean) : [];
  if (sharedWith.some((key) => identityKeys.includes(key))) return "read";
  return null;
}

function templateSharedToUser(template = {}, user = {}, templateShareInfo = {}) {
  const childNames = Array.isArray(template.children) ? template.children : [];
  if (childNames.some((name) => Boolean(templatePermissionForUser(name, templateShareInfo, user)))) return true;
  return Boolean(templatePermissionForUser(template.title, templateShareInfo, user));
}

export function templateOwnerMatches(template, user = {}) {
  if (template.locked) return true;
  return template.ownerId === user.id || template.ownerName === (user.name || user.username);
}

export function visibleTemplatesForUser(templates = [], user = {}, options = {}) {
  const templateShareInfo = options?.templateShareInfo || {};
  return templates.filter((template) => {
    if (templateOwnerMatches(template, user)) return true;
    return templateSharedToUser(template, user, templateShareInfo);
  });
}

export function claimUnownedTemplateGroups(templates = [], user = {}) {
  if (!user.id && !user.name && !user.username) return false;
  let changed = false;
  templates.forEach((template) => {
    if (template.locked || template.ownerId || template.ownerName) return;
    template.ownerId = user.id || "";
    template.ownerName = user.name || user.username || "";
    changed = true;
  });
  return changed;
}
