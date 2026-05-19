import { tagColors } from "../../../data/seed.js";
import workspaceApi from "../../../services/workspaceApi.js";
import { backendSyncToast, isLoginExpiredApiError } from "../../../services/apiErrors.js";
import { handleWorkspaceAuthFailure } from "./appActions.js";
import { cleanProjectName, idsEqual, uniqueId } from "../helpers.js";

const BACKEND_SYNC_FAIL_TOAST = "已本地保存，后端同步失败";

function syncInBackground(store, label, requestFactory) {
  if (typeof window === "undefined") return;
  Promise.resolve()
    .then(() => requestFactory())
    .catch((error) => {
      console.warn(`[workspaceApi] ${label} failed`, error);
      if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
      store.showToast(backendSyncToast(error));
    });
}

function requireProjectDeletePermission(store) {
  if (store.isAdmin) return true;
  store.showToast("只有超级管理员可以删除项目");
  return false;
}

function confirmPermanentProjectDelete(project) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
  const projectName = project?.name || project?.title || project?.id || "未命名项目";
  return window.confirm(`确认永久删除项目「${projectName}」吗？该操作会删除项目及其任务、排期、评论等关联数据，无法恢复。`);
}

function todaySlash() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function archiveTimestamp() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day} ${hours}:${minutes}`;
}

function projectPayload(project, groupId = null) {
  return {
    id: project.id,
    name: project.name,
    group: project.group,
    groupId: groupId || null,
    status: project.status || "active",
    tags: project.tags || [],
    owner: project.owner || "",
    members: project.members || [],
    memberRoles: project.memberRoles || {},
    startDate: project.startDate || "",
    endDate: project.endDate || "",
    syncSchedule: project.syncSchedule !== false
  };
}

function currentMember(store) {
  const user = store.currentUser || {};
  const name = String(user.name || user.username || "").trim() || "当前用户";
  return {
    name,
    owner: `${user.department || "项目管理"}: ${name}`
  };
}

function blankProject(store, { id = Date.now(), name, group, tags = [], startDate = "", endDate = "", syncSchedule = true } = {}) {
  const member = currentMember(store);
  return {
    id,
    name,
    group,
    status: "active",
    tags,
    owner: member.owner,
    members: [member.name],
    memberRoles: { [member.name]: "manager" },
    startDate,
    endDate,
    syncSchedule,
    tasks: []
  };
}

function splitTagInput(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(/[#、，,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function cleanTagToken(value) {
  return String(value ?? "").replace(/^#+/, "").trim();
}

function findExistingTag(store, input) {
  const rawId = input && typeof input === "object" ? cleanTagToken(input.id || input.tagId) : "";
  const rawName = input && typeof input === "object" ? cleanTagToken(input.name || input.tagName || input.label) : cleanTagToken(input);
  if (!rawId && !rawName) return null;
  return (
    (store.tags || []).find((tag) => {
      const tagId = cleanTagToken(tag?.id || tag?.tagId);
      const tagName = cleanTagToken(tag?.name || tag?.tagName);
      return Boolean((rawId && tagId === rawId) || (rawName && tagName === rawName));
    }) || null
  );
}

function projectTagsFromLibrary(store, value) {
  const names = [];
  const unknown = [];

  splitTagInput(value).forEach((token) => {
    const tag = findExistingTag(store, token);
    if (!tag?.name) {
      unknown.push(cleanTagToken(token));
      return;
    }
    if (!names.includes(tag.name)) names.push(tag.name);
  });

  if (unknown.length) {
    store.showToast("请选择标签库中已有标签");
    return null;
  }
  return names;
}

function cleanMemberText(value) {
  return String(value ?? "").trim();
}

function normalizeMemberRole(role, fallback = "readonly") {
  const normalized = cleanMemberText(role).toLowerCase();
  if (["manager", "admin", "owner", "project_manager", "projectmanager"].includes(normalized)) return "manager";
  if (["editor", "edit", "writer", "write", "contributor"].includes(normalized)) return "editor";
  if (["readonly", "read", "viewer", "read_only"].includes(normalized)) return "readonly";
  return normalizeMemberRole(fallback, "readonly");
}

function memberInputToPayload(input = {}, fallbackRole = "readonly") {
  if (typeof input === "string") {
    const memberName = cleanMemberText(input);
    return {
      userId: "",
      memberName,
      name: memberName,
      role: normalizeMemberRole(fallbackRole)
    };
  }
  if (!input || typeof input !== "object") return null;
  const memberName = cleanMemberText(input.memberName || input.name || input.userName || input.username || input.displayName || "");
  const userId = cleanMemberText(input.userId || input.id || input.memberId || input.uid || "");
  return {
    userId,
    memberName,
    name: memberName,
    role: normalizeMemberRole(input.role || fallbackRole)
  };
}

function ensureProjectMemberUserIds(project = {}) {
  if (!project.memberUserIds || typeof project.memberUserIds !== "object") {
    project.memberUserIds = {};
  }
  return project.memberUserIds;
}

function resolveUserForMember(store, payload = {}) {
  if (!payload) return null;
  if (payload.userId && typeof store.getUser === "function") {
    const byId = store.getUser(payload.userId);
    if (byId) return byId;
  }
  if (payload.memberName && typeof store.getUserByName === "function") {
    const byName = store.getUserByName(payload.memberName);
    if (byName) return byName;
  }
  return null;
}

function findProjectMemberNameByUserId(store, project = {}, userId = "") {
  const targetUserId = cleanMemberText(userId);
  if (!targetUserId) return "";

  const memberUserIds = ensureProjectMemberUserIds(project);
  for (const memberName of Object.keys(memberUserIds)) {
    if (cleanMemberText(memberUserIds[memberName]) === targetUserId && (project.members || []).includes(memberName)) {
      return memberName;
    }
  }

  const byNameLiteral = (project.members || []).find((memberName) => cleanMemberText(memberName) === targetUserId);
  if (byNameLiteral) return byNameLiteral;

  if (typeof store.getUserByName !== "function") return "";
  return (
    (project.members || []).find((memberName) => {
      const user = store.getUserByName(memberName);
      return cleanMemberText(user?.id || user?.userId) === targetUserId;
    }) || ""
  );
}

function resolveProjectMember(store, project = {}, input, fallbackRole = "readonly") {
  const payload = memberInputToPayload(input, fallbackRole);
  if (!payload) return null;
  const user = resolveUserForMember(store, payload);
  const userId = cleanMemberText(payload.userId || user?.id || user?.userId || "");
  const providedName = cleanMemberText(payload.memberName || user?.name || user?.username || "");
  const matchedMemberName = findProjectMemberNameByUserId(store, project, userId);
  const memberName = matchedMemberName || providedName;
  return {
    userId,
    memberName,
    name: memberName,
    role: normalizeMemberRole(payload.role || fallbackRole),
    user
  };
}

function projectMemberSyncEntries(store, project = {}) {
  const memberUserIds = ensureProjectMemberUserIds(project);
  return (project.members || []).map((memberName) => {
    const user = typeof store.getUserByName === "function" ? store.getUserByName(memberName) : null;
    const userId = cleanMemberText(memberUserIds[memberName] || user?.id || user?.userId || "");
    const role = normalizeMemberRole(project.memberRoles?.[memberName], "readonly");
    return {
      userId,
      memberName,
      name: memberName,
      role
    };
  });
}

export const projectActions = {
addProjectGroup(title) {
  if (!title?.trim()) return false;
  const id = uniqueId("group");
  const cleanTitle = title.trim();
  this.projectGroups.push({ id, title: cleanTitle, suffix: "0", projects: [] });
  this.collapseOpen(id);
  this.showToast("一级目录已新增");
  syncInBackground(this, "createProjectGroup", () =>
    workspaceApi.createProjectGroup({
      id,
      title: cleanTitle,
      suffix: "0"
    })
  );
  return true;
},
addProjectToGroup(groupId, name) {
  const group = this.getProjectGroup(groupId);
  if (!group || !name?.trim()) return false;
  const project = blankProject(this, { name: name.trim(), group: group.title });
  group.projects.unshift(project);
  this.activeProjectId = project.id;
  this.collapseOpen(group.id);
  this.showToast("二级项目已新增");
  syncInBackground(this, "createProject", () =>
    workspaceApi.createProject({
      ...projectPayload(project, group.id),
      groupTitle: group.title
    })
  );
  return true;
},
createProjectFromForm(payload) {
  if (payload.mode === "category") {
    return this.addProjectGroup(payload.categoryTitle || payload.name);
  }

  const tags = projectTagsFromLibrary(this, payload.tags);
  if (!tags) return false;
  const groupId = payload.groupId || this.projectGroups[0]?.id;
  const group = this.getProjectGroup(groupId) || this.projectGroups[0];
  const startDate = payload.startDate ? String(payload.startDate).replaceAll("-", "/") : todaySlash();
  const endDate = payload.endDate ? String(payload.endDate).replaceAll("-", "/") : startDate;

  let project;
  if (payload.mode === "root") {
    const rootTitle = payload.groupTitle?.trim() || "项目汇总";
    project = blankProject(this, {
      id: Date.now(),
      name: payload.name.trim(),
      group: rootTitle,
      tags,
      startDate,
      endDate,
      syncSchedule: payload.syncSchedule !== false
    });
    this.rootProjects.unshift(project);
  } else {
    project = blankProject(this, {
      name: payload.name.trim(),
      group: group?.title || "默认分组",
      tags,
      startDate,
      endDate,
      syncSchedule: payload.syncSchedule !== false
    });
    if (group) {
      group.projects.unshift(project);
      this.collapseOpen(group.id);
    }
  }

  this.activeProjectId = project.id;
  project.memberRoles = project.memberRoles || {};
  project.status = project.status || "active";
  project.members.forEach((name, index) => {
    project.memberRoles[name] = project.memberRoles[name] || (index === 0 ? "manager" : "readonly");
  });
  const projectGroupId = payload.mode === "root" ? null : group?.id || null;
  syncInBackground(this, "createProject", () =>
    workspaceApi.createProject({
      ...projectPayload(project, projectGroupId),
      groupTitle: project.group,
      mode: payload.mode || "child",
      sample: payload.sample || "blank"
    })
  );
  this.activeView = "project";
  this.query = "";
  this.showToast("项目已创建");
  return true;
},
updateProjectFromForm(projectId, payload) {
  const found = this.findProjectWithGroup(projectId);
  if (!found) return false;
  const project = found.project;
  const tags = projectTagsFromLibrary(this, payload.tags);
  if (!tags) return false;

  project.name = payload.name?.trim() || project.name;
  project.startDate = payload.startDate ? String(payload.startDate).replaceAll("-", "/") : project.startDate;
  project.endDate = payload.endDate ? String(payload.endDate).replaceAll("-", "/") : project.endDate;
  project.syncSchedule = payload.syncSchedule !== false;
  project.tags = tags;
  project.owner = payload.owner || project.owner;
  project.members = payload.members ? payload.members.split(/[、，,]/).filter(Boolean) : project.members;
  project.memberRoles = project.memberRoles || {};
  project.members.forEach((name, index) => {
    project.memberRoles[name] = project.memberRoles[name] || (index === 0 ? "manager" : "readonly");
  });

  if (payload.mode === "child" && payload.groupId && found.group?.id !== payload.groupId) {
    const targetGroup = this.getProjectGroup(payload.groupId);
    if (targetGroup && found.isRoot) {
      this.rootProjects = this.rootProjects.filter((p) => p.id !== project.id);
    } else if (targetGroup && found.group) {
      found.group.projects = found.group.projects.filter((p) => p.id !== project.id);
    }
    if (targetGroup) {
      project.group = targetGroup.title;
      targetGroup.projects.unshift(project);
      this.collapseOpen(targetGroup.id);
    }
  } else if (payload.mode === "root" && !found.isRoot) {
    found.group.projects = found.group.projects.filter((p) => p.id !== project.id);
    project.group = payload.groupTitle?.trim() || project.group || "项目汇总";
    this.rootProjects.unshift(project);
  } else if (payload.mode === "root") {
    project.group = payload.groupTitle?.trim() || project.group || "项目汇总";
  }

  const latest = this.findProjectWithGroup(projectId);
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(projectId, {
      ...projectPayload(project, latest?.isRoot ? null : latest?.group?.id || null),
      groupTitle: project.group,
      mode: payload.mode || (latest?.isRoot ? "root" : "child")
    })
  );
  this.showToast("项目参数已更新");
  return true;
},
renameProjectGroup(groupId, next) {
  const group = this.getProjectGroup(groupId);
  if (!group || !next?.trim()) return false;
  const nextTitle = next.trim();
  group.title = nextTitle;
  group.projects.forEach((project) => {
    project.group = group.title;
    syncInBackground(this, "updateProject", () =>
      workspaceApi.updateProject(project.id, {
        ...projectPayload(project, group.id),
        groupTitle: group.title
      })
    );
  });
  this.showToast("一级目录已改名");
  syncInBackground(this, "updateProjectGroup", () =>
    workspaceApi.updateProjectGroup(groupId, {
      title: nextTitle
    })
  );
  return true;
},
deleteProjectGroup(groupId) {
  if (!requireProjectDeletePermission(this)) return false;
  const group = this.getProjectGroup(groupId);
  if (!group) return false;
  const projectIds = group.projects.map((project) => project.id);
  this.projectGroups = this.projectGroups.filter((item) => item.id !== groupId);
  if (!this.activeProject) {
    this.activeProjectId = this.getNextActiveProjectId();
  }
  this.showToast("一级目录已删除");
  syncInBackground(this, "deleteProjectGroup", () => workspaceApi.deleteProjectGroup(groupId));
  projectIds.forEach((projectId) => {
    syncInBackground(this, "deleteProject", () => workspaceApi.deleteProject(projectId));
  });
  return true;
},
pinProjectGroup(groupId) {
  if (!this.requireProjectManagePermission()) return false;
  const group = this.getProjectGroup(groupId);
  if (!group) return false;
  this.projectGroups = [group, ...this.projectGroups.filter((item) => item.id !== groupId)];
  this.showToast(`「${group.title}」已置顶`);
  return true;
},
pinProject(projectId) {
  if (!this.requireProjectManagePermission()) return false;
  const found = this.findProjectWithGroup(projectId);
  if (!found) return false;
  const project = found.project;
  if (found.isRoot) {
    this.rootProjects = [project, ...this.rootProjects.filter((item) => !idsEqual(item.id, projectId))];
  } else {
    found.group.projects = [project, ...found.group.projects.filter((item) => !idsEqual(item.id, projectId))];
  }
  this.showToast(`「${cleanProjectName(project.name)}」已置顶`);
  return true;
},
renameProjectNode(projectId, next) {
  if (!this.requireProjectManagePermission()) return false;
  const found = this.findProjectWithGroup(projectId);
  if (!found || !next?.trim()) return false;
  found.project.name = next.trim();
  this.showToast("项目已改名");
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(projectId, {
      ...projectPayload(found.project, found.isRoot ? null : found.group?.id || null),
      groupTitle: found.project.group
    })
  );
  return true;
},
deleteProjectNode(projectId) {
  if (!requireProjectDeletePermission(this)) return false;
  const found = this.findProjectWithGroup(projectId);
  if (!found) return false;
  if (found.isRoot) {
    this.rootProjects = this.rootProjects.filter((item) => !idsEqual(item.id, projectId));
  } else {
    found.group.projects = found.group.projects.filter((item) => !idsEqual(item.id, projectId));
  }
  if (idsEqual(this.activeProjectId, projectId)) {
    this.activeProjectId = this.getNextActiveProjectId();
  }
  this.showToast("项目已删除");
  syncInBackground(this, "deleteProject", () => workspaceApi.deleteProject(projectId));
  return true;
},
moveProject(projectId, targetGroupId) {
  const targetGroup = this.getProjectGroup(targetGroupId);
  const found = this.findProjectWithGroup(projectId);
  if (!targetGroup || !found || found.group?.id === targetGroup.id) return false;
  if (found.isRoot) {
    this.rootProjects = this.rootProjects.filter((project) => !idsEqual(project.id, projectId));
  } else {
    found.group.projects = found.group.projects.filter((project) => !idsEqual(project.id, projectId));
  }
  found.project.group = targetGroup.title;
  targetGroup.projects.unshift(found.project);
  this.query = "";
  this.collapseOpen(targetGroup.id);
  this.showToast(`已归放到「${targetGroup.title}」`);
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(projectId, {
      ...projectPayload(found.project, targetGroup.id),
      groupTitle: targetGroup.title
    })
  );
  return true;
},
jumpToSchedule(projectId = this.activeProjectId) {
  this.activeProjectId = projectId;
  this.activeFilter = "排期";
  this.activeSection = "schedule";
  this.activeView = "project";
  if (!idsEqual(this.schedulePlan?.projectId, projectId)) {
    this.loadScheduleForActiveProject?.({ skipIfLoadingProject: true });
  }
  this.showToast("已跳转到排期视图，只显示排期清单");
},
renameActiveProject(name) {
  if (!this.requireProjectManagePermission()) return false;
  const project = this.activeProject;
  if (!project || !name?.trim()) return false;
  project.name = name.trim();
  const found = this.findProjectWithGroup(project.id);
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(project.id, {
      ...projectPayload(project, found?.isRoot ? null : found?.group?.id || null),
      groupTitle: project.group
    })
  );
  this.showToast("项目已重命名");
  return true;
},
deleteActiveProject() {
  if (!requireProjectDeletePermission(this)) return false;
  const project = this.activeProject;
  if (!project) return false;
  this.rootProjects = this.rootProjects.filter((item) => item.id !== project.id);
  for (const group of this.projectGroups) {
    group.projects = group.projects.filter((item) => item.id !== project.id);
  }
  this.activeProjectId = this.getNextActiveProjectId();
  this.showToast("项目已删除");
  syncInBackground(this, "deleteProject", () => workspaceApi.deleteProject(project.id));
  return true;
},
archiveActiveProject() {
  if (!this.requireProjectManagePermission()) return false;
  const found = this.findProjectWithGroup(this.activeProjectId);
  if (!found?.project) return false;
  const project = found.project;
  const location = found.isRoot
    ? { type: "root", index: this.rootProjects.findIndex((item) => item.id === project.id) }
    : { type: "group", groupId: found.group.id, index: found.group.projects.findIndex((item) => item.id === project.id) };
  project.status = "archived";
  project.archivedAt = archiveTimestamp();
  project.archivedBy = this.currentUser?.name || "admin";
  project.previousLocation = location;
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(project.id, {
      ...projectPayload(project, found.isRoot ? null : found.group?.id || null),
      archivedAt: project.archivedAt,
      archivedBy: project.archivedBy,
      previousLocation: project.previousLocation
    })
  );
  this.activeProjectId = this.getNextActiveProjectId();
  this.showToast("项目已归档冻结，可在已归档项目中恢复");
  return true;
},
restoreProject(projectId) {
  const found = this.findProjectWithGroup(projectId);
  if (!found?.project) return false;
  found.project.status = "active";
  found.project.archivedAt = "";
  found.project.archivedBy = "";
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(found.project.id, {
      ...projectPayload(found.project, found.isRoot ? null : found.group?.id || null),
      archivedAt: "",
      archivedBy: ""
    })
  );
  this.activeProjectId = found.project.id;
  this.showToast("项目已恢复启用");
  return true;
},
permanentlyDeleteProject(projectId) {
  if (!requireProjectDeletePermission(this)) return false;
  const found = this.findProjectWithGroup(projectId);
  if (!found) return false;
  if (!confirmPermanentProjectDelete(found.project)) return false;
  if (found.isRoot) {
    this.rootProjects = this.rootProjects.filter((item) => !idsEqual(item.id, projectId));
  } else {
    found.group.projects = found.group.projects.filter((item) => !idsEqual(item.id, projectId));
  }
  if (idsEqual(this.activeProjectId, projectId)) this.activeProjectId = this.getNextActiveProjectId();
  this.showToast("项目已永久删除，无法恢复");
  syncInBackground(this, "deleteProject", () => workspaceApi.deleteProject(projectId));
  return true;
},
attachTag(tagName) {
  if (!this.requireProjectManagePermission()) return false;
  const project = this.activeProject;
  if (!project || !tagName) return false;
  const tag = findExistingTag(this, tagName);
  if (!tag?.name) {
    this.showToast("请选择标签库中已有标签");
    return false;
  }
  const clean = tag.name;
  let projectChanged = false;
  project.tags = Array.isArray(project.tags) ? project.tags : [];
  if (project.tags.includes(clean)) {
    this.showToast("项目已绑定该标签");
    return false;
  }
  if (!project.tags.includes(clean)) {
    project.tags.push(clean);
    projectChanged = true;
  }
  if (projectChanged) {
    const found = this.findProjectWithGroup(project.id);
    syncInBackground(this, "updateProject", () =>
      workspaceApi.updateProject(project.id, {
        ...projectPayload(project, found?.isRoot ? null : found?.group?.id || null),
        groupTitle: project.group
      })
    );
  }
  this.showToast("标签已添加到项目");
  return true;
},
bindTagToActiveProject(tagName) {
  return this.attachTag(tagName);
},
removeTagFromActiveProject(tagName) {
  const project = this.activeProject;
  if (!project) return false;
  project.tags = project.tags.filter((tag) => tag !== tagName);
  const found = this.findProjectWithGroup(project.id);
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(project.id, {
      ...projectPayload(project, found?.isRoot ? null : found?.group?.id || null),
      groupTitle: project.group
    })
  );
  this.showToast(`已从项目移除标签「${tagName}」`);
  return true;
},
addTag(name, color = tagColors[this.tags.length % tagColors.length]) {
  const clean = String(name || "").trim().replace("#", "");
  if (!clean) return false;
  const existing = this.tags.find((tag) => tag.name === clean);
  if (existing) {
    existing.color = color || existing.color;
    syncInBackground(this, "createTag", () =>
      workspaceApi.createTag({
        name: clean,
        color: existing.color
      })
    );
    this.showToast("标签颜色已更新");
    return true;
  }
  this.tags.push({ name: clean, color });
  syncInBackground(this, "createTag", () =>
    workspaceApi.createTag({
      name: clean,
      color
    })
  );
  syncInBackground(this, "listTags", () => workspaceApi.listTags());
  this.showToast("标签已新增");
  return true;
},
deleteTag(name) {
  this.tags = this.tags.filter((tag) => tag.name !== name);
  this.allProjects.forEach((project) => {
    const before = project.tags.length;
    project.tags = project.tags.filter((tag) => tag !== name);
    if (before !== project.tags.length) {
      const found = this.findProjectWithGroup(project.id);
      syncInBackground(this, "updateProject", () =>
        workspaceApi.updateProject(project.id, {
          ...projectPayload(project, found?.isRoot ? null : found?.group?.id || null),
          groupTitle: project.group
        })
      );
    }
  });
  syncInBackground(this, "deleteTag", () => workspaceApi.deleteTag(name));
  syncInBackground(this, "listTags", () => workspaceApi.listTags());
  this.showToast("标签已删除");
},
inviteMember(name) {
  if (!this.requireProjectManagePermission()) return false;
  const project = this.activeProject;
  if (!project) return false;
  const member = resolveProjectMember(this, project, name, "readonly");
  const clean = cleanMemberText(member?.memberName);
  const user = member?.user || resolveUserForMember(this, member);
  if (!clean && !member?.userId) return false;
  if (!user) {
    this.showToast("请先在通讯录用户池中选择已有用户");
    return false;
  }
  const finalName = cleanMemberText(user?.name || user?.username || clean);
  if (!project.members.includes(finalName)) {
    project.members.unshift(finalName);
  }
  project.memberRoles = project.memberRoles || {};
  project.memberRoles[finalName] = normalizeMemberRole(project.memberRoles[finalName] || member?.role || "readonly");
  if (member?.userId || user?.id || user?.userId) {
    ensureProjectMemberUserIds(project)[finalName] = cleanMemberText(member?.userId || user?.id || user?.userId);
  }
  const found = this.findProjectWithGroup(project.id);
  syncInBackground(this, "updateProject", () =>
    workspaceApi.updateProject(project.id, {
      ...projectPayload(project, found?.isRoot ? null : found?.group?.id || null),
      groupTitle: project.group
    })
  );
  this.showToast(`已邀请 ${finalName}，可查看该项目全部任务清单`);
  return true;
},
inviteMembers(names = []) {
  if (!this.requireProjectManagePermission()) return false;
  const project = this.activeProject || this.findProjectWithGroup(this.activeProjectId)?.project;
  if (!project || !Array.isArray(names)) return false;

  const added = [];
  const addedMembers = [];
  const seen = new Set();
  project.memberRoles = project.memberRoles || {};
  const memberUserIds = ensureProjectMemberUserIds(project);

  names.forEach((input) => {
    const member = resolveProjectMember(this, project, input, "readonly");
    if (!member) return;
    const key = cleanMemberText(member.userId || member.memberName);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const user = member.user || resolveUserForMember(this, member);
    if (!user) return;

    const finalName = cleanMemberText(user?.name || user?.username || member.memberName);
    const existingMemberName = findProjectMemberNameByUserId(this, project, member.userId);
    if (existingMemberName || (project.members || []).includes(finalName)) return;

    project.members.unshift(finalName);
    const nextRole = normalizeMemberRole(member.role, "readonly");
    project.memberRoles[finalName] = normalizeMemberRole(project.memberRoles[finalName] || nextRole, nextRole);
    const userId = cleanMemberText(member.userId || user?.id || user?.userId);
    if (userId) memberUserIds[finalName] = userId;

    added.push(finalName);
    addedMembers.push({
      userId,
      memberName: finalName,
      name: finalName,
      role: project.memberRoles[finalName] || "readonly"
    });
  });

  if (!added.length) {
    this.showToast("请选择未加入项目的协同成员");
    return [];
  }

  syncInBackground(this, "addProjectMembers", () =>
    workspaceApi.addProjectMembers(project.id, {
      members: addedMembers
    })
  );
  this.showToast(`已加入 ${added.length} 位协同成员`);
  return added;
},
setMemberRole(name, role) {
  if (!this.requireProjectManagePermission()) return false;
  const project = this.activeProject;
  if (!project) return false;
  const member = resolveProjectMember(this, project, name, role || "readonly");
  if (!member?.memberName) return false;
  project.memberRoles = project.memberRoles || {};
  const nextRole = normalizeMemberRole(role || member.role, "readonly");
  project.memberRoles[member.memberName] = nextRole;
  if (member.userId) ensureProjectMemberUserIds(project)[member.memberName] = member.userId;
  const memberUpdates = projectMemberSyncEntries(this, project);
  syncInBackground(this, "setProjectMemberGroups", () =>
    workspaceApi.setProjectMemberGroups(project.id, {
      groups: {
        manager: (project.members || []).filter((memberName) => project.memberRoles?.[memberName] === "manager"),
        editor: (project.members || []).filter((memberName) => project.memberRoles?.[memberName] === "editor"),
        readonly: (project.members || []).filter((memberName) => project.memberRoles?.[memberName] !== "manager" && project.memberRoles?.[memberName] !== "editor")
      },
      updates: memberUpdates
    })
  );
  this.showToast(`${member.memberName} 已调整为${this.roleLabel(nextRole)}权限`);
  return true;
},
removeMember(name) {
  if (!this.requireProjectManagePermission()) return false;
  const project = this.activeProject;
  if (!project) return false;
  const member = resolveProjectMember(this, project, name, "readonly");
  if (!member?.memberName) return false;
  const memberName = member.memberName;
  const userId = cleanMemberText(member.userId || ensureProjectMemberUserIds(project)[memberName] || "");
  project.members = project.members.filter((memberItem) => memberItem !== memberName);
  if (project.memberRoles) delete project.memberRoles[memberName];
  if (project.memberUserIds) delete project.memberUserIds[memberName];
  syncInBackground(this, "removeProjectMembers", () =>
    workspaceApi.removeProjectMembers(project.id, {
      members: [{
        userId,
        memberName,
        name: memberName,
        role: normalizeMemberRole(member.role, "readonly")
      }]
    })
  );
  this.showToast(`${memberName} 已移出项目协同`);
  return true;
},
};
