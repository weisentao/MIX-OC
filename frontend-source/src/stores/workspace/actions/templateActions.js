import { isSharedTemplateSectionName, nowText, uniqueId } from "../helpers.js";
import workspaceApi from "../../../services/workspaceApi.js";
import { backendSyncToast } from "../../../services/apiErrors.js";
import { claimUnownedTemplateGroups } from "../templateOwnership.js";

function syncInBackground(store, label, requestFactory) {
  if (typeof window === "undefined") return;
  Promise.resolve()
    .then(() => requestFactory())
    .catch((error) => {
      console.warn(`[workspaceApi] ${label} failed`, error);
      store.showToast(backendSyncToast(error));
    });
}

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cleanTemplateName(value = "") {
  return String(value || "").trim().replace(/项目|项目/g, "");
}

function findTemplateTasks(store, templateName) {
  const group = (store.templates || []).find((template) => {
    if (template.kind === "schedule") return false;
    if (!(template.children || []).includes(templateName)) return false;
    return Array.isArray(template.templateTasks?.[templateName]);
  });
  return group?.templateTasks?.[templateName] || [];
}

function hasTaskTemplate(store, templateName) {
  return (store.templates || []).some((template) => template.kind !== "schedule" && (template.children || []).includes(templateName));
}

function findScheduleTemplate(store, templateName) {
  for (const [groupIndex, group] of (store.templates || []).entries()) {
    if (group?.kind !== "schedule") continue;
    const childIndex = (group.children || []).indexOf(templateName);
    if (childIndex !== -1) return { group, groupIndex, childIndex };
  }
  return null;
}

function firstEditableScheduleTemplate(store) {
  for (const [groupIndex, group] of (store.templates || []).entries()) {
    if (!group || group.locked || group.kind !== "schedule") continue;
    const templateName = (group.children || [])[0];
    if (templateName) return { group, groupIndex, childIndex: 0, templateName };
  }
  return null;
}

function ensureDefaultScheduleTemplateGroup(store) {
  store.templates = store.templates || [];
  let group = (store.templates || []).find((template) => !template.locked && template.kind === "schedule");
  if (group) return group;
  group = {
    id: uniqueId("template-group"),
    title: "默认排期模板",
    kind: "schedule",
    children: [],
    templateTasks: {},
    templateSchedules: {},
    ownerId: store.currentUser?.id || store.currentUserId || "",
    ownerName: store.currentUser?.name || store.currentUser?.username || ""
  };
  const lockedIndex = store.templates.findIndex((template) => template.locked);
  if (lockedIndex === -1) store.templates.unshift(group);
  else store.templates.splice(lockedIndex, 0, group);
  return group;
}

function scheduleTemplateNameFromProject(store) {
  const projectName = cleanTemplateName(store.activeProjectName || store.activeProject?.name || "当前项目") || "当前";
  return `${projectName}排期模板`;
}

function emptySchedulePlan(templateName = "") {
  return {
    title: templateName || "项目排期",
    items: [],
    dependencies: [],
    viewConfig: {
      defaultView: "timeline",
      dayWidth: 28,
      rowHeight: 34
    },
    startDate: "",
    endDate: "",
    summary: {
      itemCount: 0,
      pendingCount: 0,
      doneCount: 0,
      riskCount: 0
    }
  };
}

function normalizeScheduleTemplatePlan(plan, templateName = "") {
  const source = plan && typeof plan === "object" ? cloneValue(plan) : {};
  return {
    ...emptySchedulePlan(templateName),
    ...source,
    title: source.title || templateName || "项目排期",
    items: Array.isArray(source.items) ? source.items : [],
    dependencies: Array.isArray(source.dependencies) ? source.dependencies : [],
    viewConfig: {
      ...emptySchedulePlan().viewConfig,
      ...(source.viewConfig || {})
    },
    summary: {
      ...emptySchedulePlan().summary,
      ...(source.summary || {})
    }
  };
}

function ensureScheduleTemplateStore(group, templateName) {
  group.templateSchedules = group.templateSchedules || {};
  if (!group.templateSchedules[templateName]) {
    group.templateSchedules[templateName] = normalizeScheduleTemplatePlan(group.schedulePlan || {}, templateName);
  }
  return group.templateSchedules[templateName];
}

function templateGroupPayload(group = {}) {
  const kind = group.kind === "schedule" ? "schedule" : "task";
  const remoteId = group.templateId || group.templateUid || group.id;
  const content = {
    children: group.children || [],
    templateTasks: group.templateTasks || {},
    templateSchedules: group.templateSchedules || {},
    templateIds: group.templateIds || {}
  };
  return {
    id: remoteId,
    templateId: remoteId,
    title: group.title,
    kind,
    isGroup: true,
    groupKey: kind,
    visibility: group.visibility || "private",
    locked: Boolean(group.locked),
    content,
    template: content,
    payload: {
      kind,
      isGroup: true,
      ownerName: group.ownerName || ""
    }
  };
}

function templateItemPayload(group = {}, templateName = "") {
  const kind = group.kind === "schedule" ? "schedule" : "task";
  const content = kind === "schedule"
    ? normalizeScheduleTemplatePlan(group.templateSchedules?.[templateName], templateName)
    : group.templateTasks?.[templateName] || [];
  const remoteId = group.templateIds?.[templateName] || group.templateIdMap?.[templateName] || "";
  const parentId = group.templateId || group.templateUid || group.id || "";
  return {
    id: remoteId,
    templateId: remoteId,
    title: templateName,
    kind,
    parentTemplateId: parentId,
    groupId: parentId,
    groupKey: kind,
    visibility: group.visibility || "private",
    content,
    template: content,
    taskCount: kind === "schedule" ? Number(content?.items?.length || 0) : Number(content.length || 0),
    payload: {
      kind,
      isGroup: false,
      groupTitle: group.title,
      ownerName: ""
    }
  };
}

function remoteTemplateId(response = {}) {
  const template = response?.template || response?.data?.template || response?.data || response;
  return template?.id || template?.templateId || template?.templateUid || "";
}

function apiErrorStatus(error) {
  return Number(error?.response?.status || error?.status || error?.statusCode || 0);
}

function ensureTemplateItemId(group = {}, templateName = "") {
  if (!group || !templateName) return "";
  group.templateIds = group.templateIds || {};
  if (!group.templateIds[templateName]) group.templateIds[templateName] = uniqueId("template");
  return group.templateIds[templateName];
}

function existingTemplateItemId(group = {}, templateName = "") {
  return group?.templateIds?.[templateName] || group?.templateIdMap?.[templateName] || "";
}

function normalizeTemplateSharePermission(value = "read") {
  const permission = String(value || "").trim().toLowerCase();
  return ["edit", "editor", "write", "editable"].includes(permission) ? "edit" : "read";
}

function templateShareRecipient(input, fallbackPermission = "read") {
  if (typeof input === "string") {
    const clean = input.trim();
    return clean
      ? {
          userId: clean,
          userName: clean,
          permission: normalizeTemplateSharePermission(fallbackPermission)
        }
      : null;
  }
  if (!input || typeof input !== "object") return null;
  const userName = String(input.userName || input.name || input.displayName || input.username || input.userId || input.id || "").trim();
  const userId = String(input.userId || input.id || input.username || userName || "").trim();
  if (!userName && !userId) return null;
  return {
    userId: userId || userName,
    userName: userName || userId,
    permission: normalizeTemplateSharePermission(input.permission || input.role || fallbackPermission),
    department: input.department || "",
    avatar: input.avatar || ""
  };
}

function templateShareKey(recipient = {}) {
  recipient = recipient || {};
  return String(recipient.userId || recipient.userName || "").trim();
}

function normalizeTemplateShareInfo(info = {}) {
  const recipientsByKey = new Map();
  const addRecipient = (recipient) => {
    const normalized = templateShareRecipient(recipient);
    const key = templateShareKey(normalized);
    if (!key) return;
    recipientsByKey.set(key, {
      ...(recipientsByKey.get(key) || {}),
      ...normalized
    });
  };

  (info.recipients || info.entries || []).forEach(addRecipient);
  (info.sharedWith || []).forEach((name) => {
    const key = String(name || "").trim();
    if ([...recipientsByKey.values()].some((recipient) => recipient.userName === key || recipient.userId === key)) return;
    const permission = info.permissions?.[key] || info.sharePermissions?.[key] || "read";
    addRecipient({ userId: key, userName: key, permission });
  });

  const recipients = [...recipientsByKey.values()].map((recipient) => {
    const key = templateShareKey(recipient);
    return {
      ...recipient,
      permission: normalizeTemplateSharePermission(info.permissions?.[key] || info.sharePermissions?.[key] || recipient.permission)
    };
  });
  const permissions = recipients.reduce((map, recipient) => {
    map[templateShareKey(recipient)] = normalizeTemplateSharePermission(recipient.permission);
    return map;
  }, {});

  return {
    shared: Boolean(info.shared || recipients.length),
    sharedWith: recipients.map((recipient) => recipient.userName),
    fromUser: info.fromUser || null,
    recipients,
    permissions
  };
}

function templateShareEntries(info = {}) {
  return normalizeTemplateShareInfo(info).recipients.map((recipient) => ({
    userId: recipient.userId,
    userName: recipient.userName,
    permission: normalizeTemplateSharePermission(recipient.permission)
  }));
}

function syncTemplateShareInfo(store, templateName, shareInfo) {
  const found = store.findTemplate(templateName);
  const remoteId = existingTemplateItemId(found?.group, templateName);
  if (remoteId) {
    syncInBackground(store, "shareTemplate", () =>
      workspaceApi.shareTemplate(remoteId, templateShareEntries(shareInfo))
    );
  }
}

function syncTemplateGroup(store, group = {}) {
  if (!group?.title || group.locked) return;
  const remoteId = group.templateId || group.templateUid || "";
  syncInBackground(store, remoteId ? "updateTemplateGroup" : "createTemplateGroup", async () => {
    const result = remoteId
      ? await workspaceApi.updateTemplate(remoteId, templateGroupPayload(group))
      : await workspaceApi.createTemplate(templateGroupPayload(group));
    group.templateId = group.templateId || remoteId || remoteTemplateId(result);
    group.templateUid = group.templateUid || group.templateId;
    return result;
  });
}

function syncTemplateItem(store, group = {}, templateName = "") {
  if (!group || group.locked || !templateName) return;
  group.templateIds = group.templateIds || {};
  const existingId = existingTemplateItemId(group, templateName);
  const hadRemoteId = Boolean(existingId);
  const id = hadRemoteId ? existingId : ensureTemplateItemId(group, templateName);
  group.templateIds[templateName] = id;
  syncInBackground(store, hadRemoteId ? "updateTemplate" : "createTemplate", async () => {
    const payload = templateItemPayload(group, templateName);
    const result = hadRemoteId
      ? await workspaceApi.updateTemplate(id, payload).catch((error) => {
          if (apiErrorStatus(error) !== 404) throw error;
          return workspaceApi.createTemplate(payload);
        })
      : await workspaceApi.createTemplate(payload);
    group.templateIds[templateName] = remoteTemplateId(result) || group.templateIds[templateName];
    return result;
  });
}

function syncDeleteTemplateGroup(store, group = {}) {
  const remoteId = group?.templateId || group?.templateUid || group?.id || "";
  if (remoteId) syncInBackground(store, "deleteTemplateGroup", () => workspaceApi.deleteTemplate(remoteId));
}

function syncDeleteTemplateItem(store, group = {}, templateName = "") {
  const remoteId = existingTemplateItemId(group, templateName);
  if (remoteId) syncInBackground(store, "deleteTemplate", () => workspaceApi.deleteTemplate(remoteId));
}

function moveTemplateLocal(source, target, templateName, childIndex) {
  const movedTasks = source.templateTasks?.[templateName];
  const movedSchedule = source.templateSchedules?.[templateName];
  const movedId = existingTemplateItemId(source, templateName);
  source.children.splice(childIndex, 1);
  if (source.templateTasks?.[templateName]) delete source.templateTasks[templateName];
  if (source.templateSchedules?.[templateName]) delete source.templateSchedules[templateName];
  if (source.templateIds?.[templateName]) delete source.templateIds[templateName];
  if (source.templateIdMap?.[templateName]) delete source.templateIdMap[templateName];
  target.children = target.children || [];
  target.templateTasks = target.templateTasks || {};
  target.templateSchedules = target.templateSchedules || {};
  target.templateIds = target.templateIds || {};
  if (movedTasks !== undefined) target.templateTasks[templateName] = movedTasks;
  if (movedSchedule !== undefined) target.templateSchedules[templateName] = movedSchedule;
  if (movedId) target.templateIds[templateName] = movedId;
  target.children.unshift(templateName);
}

function copyTemplateTasksForProject(store, templateName) {
  const usedIds = new Set((store.allProjects || []).flatMap((project) => (project.tasks || []).map((task) => Number(task.id))));
  const templateTasks = findTemplateTasks(store, templateName);
  let nextId = Date.now();

  return templateTasks.map((task) => {
    do {
      nextId += 1;
    } while (usedIds.has(nextId));
    usedIds.add(nextId);

    return {
      ...cloneValue(task),
      id: nextId,
      archived: false,
      expanded: false,
      unreadComments: 0,
      sourceTemplateTaskId: task.id
    };
  });
}

export const templateActions = {
ensureCurrentUserTemplateGroups() {
  return claimUnownedTemplateGroups(this.templates || [], this.currentUser || {});
},
addTemplateGroup(title, kind = "task") {
  if (!title?.trim()) return false;
  if (isSharedTemplateSectionName(title)) {
    this.showToast("共享给我的模板是固定功能页，不能重复创建");
    return false;
  }
  const id = uniqueId("template-group");
  const lockedIndex = this.templates.findIndex((template) => template.locked);
  const nextGroup = {
    id,
    title: title.trim(),
    kind: kind === "schedule" ? "schedule" : "task",
    children: [],
    templateTasks: {},
    templateSchedules: {},
    ownerId: this.currentUser?.id || this.currentUserId || "",
    ownerName: this.currentUser?.name || this.currentUser?.username || ""
  };
  if (lockedIndex === -1) {
    this.templates.push(nextGroup);
  } else {
    this.templates.splice(lockedIndex, 0, nextGroup);
  }
  if (typeof this.collapseTemplateOpen === "function") this.collapseTemplateOpen(id);
  syncTemplateGroup(this, nextGroup);
  this.showToast("模板目录已新增");
  return true;
},
addTemplateToGroup(index, title) {
  const template = this.templates[index];
  if (!template || template.locked || !title?.trim()) return false;
  const cleanTitle = cleanTemplateName(title);
  template.children.push(cleanTitle);
  if (template.kind === "schedule") {
    template.templateSchedules = template.templateSchedules || {};
    template.templateSchedules[cleanTitle] = emptySchedulePlan(cleanTitle);
  } else {
    template.templateTasks = template.templateTasks || {};
    template.templateTasks[cleanTitle] = template.templateTasks[cleanTitle] || [];
  }
  if (typeof this.collapseTemplateOpen === "function") this.collapseTemplateOpen(template.id);
  this.switchToTemplateView(index, template.children.length - 1);
  syncTemplateItem(this, template, cleanTitle);
  this.showToast(cleanTitle !== title.trim() ? "模板名称禁止包含“项目”二字，已自动去除" : "模板已新增（任务列表为空）");
  return true;
},
switchToTemplateView(templateGroupIndex, templateChildIndex = null) {
  this.activeTemplateGroupIndex = templateGroupIndex;
  this.activeTemplateChildIndex = templateChildIndex;
  const template = this.templates[Number(templateGroupIndex)];
  const name = (template?.children || [])[Number(templateChildIndex)];
  if (template?.kind === "schedule") {
    this.activeSection = "schedule";
    this.activeView = "schedule-template";
    this.activeFilter = "all";
    this.query = "";
    this.schedulePlan = normalizeScheduleTemplatePlan(ensureScheduleTemplateStore(template, name), name);
    this.scheduleUi = {
      ...(this.scheduleUi || {}),
      view: this.schedulePlan.viewConfig?.defaultView || this.scheduleUi?.view || "timeline",
      dayWidth: Number(this.schedulePlan.viewConfig?.dayWidth || this.scheduleUi?.dayWidth || 28),
      rowHeight: Number(this.schedulePlan.viewConfig?.rowHeight || this.scheduleUi?.rowHeight || 34),
      visibleStartDate: this.schedulePlan.startDate || "",
      visibleEndDate: this.schedulePlan.endDate || "",
      source: "schedule-template"
    };
    return;
  }
  this.activeSection = "flow";
  this.activeView = "template";
  this.activeFilter = "all";
  this.activeProjectId = null;
  if (template && name) {
    template.templateTasks = template.templateTasks || {};
    template.templateTasks[name] = template.templateTasks[name] || [];
  }
},
saveScheduleTemplate(templateName = this.activeTemplateName, schedulePlan = this.schedulePlan) {
  const found = findScheduleTemplate(this, templateName);
  if (!found) {
    this.showToast("请先选择项目排期模板");
    return false;
  }
  found.group.templateSchedules = found.group.templateSchedules || {};
  found.group.templateSchedules[templateName] = normalizeScheduleTemplatePlan(schedulePlan, templateName);
  syncTemplateItem(this, found.group, templateName);
  this.showToast("排期模板已保存");
  return true;
},
saveCurrentScheduleAsTemplate(templateName = "") {
  const group = ensureDefaultScheduleTemplateGroup(this);
  const cleanName = cleanTemplateName(templateName || scheduleTemplateNameFromProject(this));
  const name = cleanName || "当前排期模板";
  group.children = group.children || [];
  if (!group.children.includes(name)) group.children.unshift(name);
  group.templateSchedules = group.templateSchedules || {};
  group.templateSchedules[name] = normalizeScheduleTemplatePlan(this.schedulePlan, name);
  this.activeTemplateGroupIndex = this.templates.indexOf(group);
  this.activeTemplateChildIndex = group.children.indexOf(name);
  syncTemplateGroup(this, group);
  syncTemplateItem(this, group, name);
  this.showToast(`排期模板“${name}”已保存`);
  return name;
},
applyScheduleTemplateToActiveProject(templateName) {
  const found = findScheduleTemplate(this, templateName);
  if (!found) {
    this.showToast("未找到排期模板");
    return false;
  }
  const nextPlan = normalizeScheduleTemplatePlan(ensureScheduleTemplateStore(found.group, templateName), templateName);
  this.schedulePlan = {
    ...nextPlan,
    projectId: this.activeProject?.id || this.activeProjectId || nextPlan.projectId || null
  };
  this.scheduleUi = {
    ...(this.scheduleUi || {}),
    view: nextPlan.viewConfig?.defaultView || this.scheduleUi?.view || "timeline",
    dayWidth: Number(nextPlan.viewConfig?.dayWidth || this.scheduleUi?.dayWidth || 28),
    rowHeight: Number(nextPlan.viewConfig?.rowHeight || this.scheduleUi?.rowHeight || 34),
    visibleStartDate: nextPlan.startDate || "",
    visibleEndDate: nextPlan.endDate || "",
    source: "schedule-template"
  };
  this.activeSection = "schedule";
  this.activeView = "project";
  this.showToast("排期模板已导入当前项目");
  return true;
},
applyFirstScheduleTemplateToActiveProject() {
  const found = firstEditableScheduleTemplate(this);
  if (!found) {
    this.showToast("暂无可导入的排期模板，请先保存当前排期为模板");
    return false;
  }
  return this.applyScheduleTemplateToActiveProject(found.templateName);
},
useTemplateToCreateProject(templateName) {
  if (!hasTaskTemplate(this, templateName)) {
    this.showToast("排期模板不能生成项目，请选择项目任务模板");
    return false;
  }
  const id = Date.now();
  const user = this.currentUser || {};
  const memberName = String(user.name || user.username || "").trim() || "当前用户";
  const department = String(user.department || "").trim() || "项目管理";
  const tasks = copyTemplateTasksForProject(this, templateName);
  const project = {
    id,
    name: templateName,
    group: "项目汇总",
    status: "active",
    tags: [],
    owner: `${department}: ${memberName} / ${nowText()}`,
    members: [memberName],
    memberRoles: { [memberName]: "manager" },
    tasks,
    fromTemplate: templateName
  };
  this.rootProjects.unshift(project);
  this.activeProjectId = id;
  this.activeSection = "flow";
  this.activeView = "project";
  this.activeFilter = "all";
  this.query = "";
  syncInBackground(this, "createProject", () =>
    workspaceApi.createProject({
      id: project.id,
      name: project.name,
      group: project.group,
      groupId: null,
      groupTitle: project.group,
      status: project.status,
      tags: project.tags,
      owner: project.owner,
      members: project.members,
      memberRoles: project.memberRoles,
      tasks: project.tasks,
      fromTemplate: templateName
    })
  );
  this.showToast(`已根据模板“${templateName}”生成项目`);
  return true;
},
renameTemplateGroup(index, title) {
  const template = this.templates[index];
  if (!template || template.locked || !title?.trim()) return false;
  if (isSharedTemplateSectionName(title)) {
    this.showToast("共享给我的模板是固定功能项，不能作为普通目录名称");
    return false;
  }
  template.title = title.trim();
  syncTemplateGroup(this, template);
  this.showToast("模板目录已改名");
  return true;
},
pinTemplateGroup(index) {
  const template = this.templates[index];
  if (!template || template.locked) return false;
  this.templates.splice(index, 1);
  this.templates.unshift(template);
  this.showToast(`“${template.title}”已置顶`);
  return true;
},
pinTemplate(templateName) {
  const found = this.findTemplate(templateName);
  if (!found || found.group.locked) return false;
  found.group.children.splice(found.childIndex, 1);
  found.group.children.unshift(templateName);
  this.showToast(`“${templateName}”已置顶`);
  return true;
},

deleteTemplateGroup(index) {
  const group = this.templates[index];
  if (!group || group.locked) {
    this.showToast("共享给我的模板是固定功能项，不能删除");
    return;
  }
  (group.children || []).forEach((templateName) => {
    if (this.templateShareInfo?.[templateName]) delete this.templateShareInfo[templateName];
  });
  this.templates.splice(index, 1);
  syncDeleteTemplateGroup(this, group);
  this.showToast("模板目录已删除，共享副本同步删除");
},
renameTemplate(name, next) {
  const found = this.findTemplate(name);
  if (!found || !next?.trim()) return false;
  const cleanName = cleanTemplateName(next);
  const remoteId = existingTemplateItemId(found.group, name);
  if (name !== cleanName && this.templateShareInfo?.[name]) {
    this.templateShareInfo[cleanName] = this.templateShareInfo[name];
    delete this.templateShareInfo[name];
  }
  if (name !== cleanName && found.group.templateIds?.[name]) {
    found.group.templateIds[cleanName] = found.group.templateIds[name];
    delete found.group.templateIds[name];
  }
  if (name !== cleanName && found.group.templateIdMap?.[name]) {
    found.group.templateIds = found.group.templateIds || {};
    found.group.templateIds[cleanName] = found.group.templateIdMap[name];
    delete found.group.templateIdMap[name];
  }
  if (name !== cleanName && found.group.templateTasks?.[name]) {
    found.group.templateTasks[cleanName] = found.group.templateTasks[name];
    delete found.group.templateTasks[name];
  }
  if (name !== cleanName && found.group.templateSchedules?.[name]) {
    found.group.templateSchedules[cleanName] = found.group.templateSchedules[name];
    delete found.group.templateSchedules[name];
  }
  found.group.children[found.childIndex] = cleanName;
  if (remoteId) {
    found.group.templateIds = found.group.templateIds || {};
    found.group.templateIds[cleanName] = remoteId;
  }
  syncTemplateItem(this, found.group, cleanName);
  this.showToast(cleanName !== next.trim() ? "模板名称禁止包含“项目”二字，已自动去除" : "模板已改名");
  return true;
},
deleteTemplate(name) {
  const found = this.findTemplate(name);
  if (!found) return;
  syncDeleteTemplateItem(this, found.group, name);
  if (this.templateShareInfo?.[name]) delete this.templateShareInfo[name];
  if (found.group.templateIds?.[name]) delete found.group.templateIds[name];
  if (found.group.templateIdMap?.[name]) delete found.group.templateIdMap[name];
  if (found.group.templateTasks?.[name]) delete found.group.templateTasks[name];
  if (found.group.templateSchedules?.[name]) delete found.group.templateSchedules[name];
  found.group.children.splice(found.childIndex, 1);
  this.showToast("模板已删除，共享副本同步删除");
},
shareTemplate(templateName, user, permission = "read") {
  if (Array.isArray(user)) {
    const shareInfo = normalizeTemplateShareInfo({
      recipients: user.map((item) => templateShareRecipient(item, permission)).filter(Boolean)
    });
    shareInfo.shared = shareInfo.recipients.length > 0;
    shareInfo.fromUser = "我";
    this.templateShareInfo[templateName] = shareInfo;
    syncTemplateShareInfo(this, templateName, shareInfo);
    this.showToast(shareInfo.shared ? "模板共享权限已更新" : "模板共享已清空");
    return true;
  }
  const recipient = templateShareRecipient(user, permission);
  if (!recipient) return false;
  const shareInfo = normalizeTemplateShareInfo(this.templateShareInfo[templateName] || {});
  shareInfo.shared = true;
  shareInfo.fromUser = "我";
  const key = templateShareKey(recipient);
  const existingIndex = shareInfo.recipients.findIndex((item) => templateShareKey(item) === key);
  if (existingIndex >= 0) shareInfo.recipients.splice(existingIndex, 1, recipient);
  else shareInfo.recipients.push(recipient);
  shareInfo.sharedWith = shareInfo.recipients.map((item) => item.userName);
  shareInfo.permissions = shareInfo.recipients.reduce((map, item) => {
    map[templateShareKey(item)] = normalizeTemplateSharePermission(item.permission);
    return map;
  }, {});
  this.templateShareInfo[templateName] = shareInfo;
  syncTemplateShareInfo(this, templateName, shareInfo);
  this.showToast(`已共享给 ${recipient.userName}，${recipient.permission === "edit" ? "可编辑模板内容" : "不可编辑模板内容"}`);
  return true;
},
unshareTemplate(templateName, userName) {
  const target = templateShareRecipient(userName);
  const shareInfo = normalizeTemplateShareInfo(this.templateShareInfo[templateName]);
  if (!shareInfo?.shared) return false;
  const targetKey = templateShareKey(target);
  shareInfo.recipients = shareInfo.recipients.filter((item) => templateShareKey(item) !== targetKey && item.userName !== userName);
  shareInfo.sharedWith = shareInfo.recipients.map((item) => item.userName);
  shareInfo.permissions = shareInfo.recipients.reduce((map, item) => {
    map[templateShareKey(item)] = normalizeTemplateSharePermission(item.permission);
    return map;
  }, {});
  if (!shareInfo.recipients.length) shareInfo.shared = false;
  this.templateShareInfo[templateName] = shareInfo;
  const found = this.findTemplate(templateName);
  const remoteId = existingTemplateItemId(found?.group, templateName);
  if (remoteId) syncInBackground(this, "unshareTemplate", () => workspaceApi.unshareTemplate(remoteId, targetKey || userName));
  this.showToast(`已取消 ${target?.userName || userName} 的共享权限`);
  return true;
},
moveTemplate(templateName, targetIndex) {
  const target = this.templates[Number(targetIndex)];
  const found = this.findTemplate(templateName);
  if (!target || target.locked || !found || found.group === target) return false;
  const source = found.group;
  moveTemplateLocal(source, target, templateName, found.childIndex);
  this.query = "";
  syncTemplateItem(this, target, templateName);
  syncTemplateGroup(this, source);
  syncTemplateGroup(this, target);
  this.showToast(`模板已归放到“${target.title}”`);
  return true;
},};

