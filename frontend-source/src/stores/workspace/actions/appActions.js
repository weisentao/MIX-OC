import { createInitialState } from "../../../data/seed.js";
import http from "../../../services/http.js";
import workspaceApi from "../../../services/workspaceApi.js";
import { createProjectBoard } from "../../../features/collab-board/boardModel.js";
import { normalizeTaskModuleKey } from "../helpers.js";
import { normalizeCarouselNotices } from "../../../utils/noticeCarousel.js";

const viteEnv = import.meta.env || {};
const visibleTextReplacements = new Map([
  ["\u699b\u6a18\u8a75\u93ba\u6393\u6e6f\u59af\u6fa8", "默认排期模板"],
  ["\u699b\u6a18\u8a75\u6d60\u8bef\u59ec\u52a1\u59af\u6fa8", "默认任务模板"]
]);

function normalizeVisibleText(value) {
  const text = String(value || "");
  return visibleTextReplacements.get(text) || text;
}

function templateRemoteId(template = {}) {
  return template.templateId || template.templateUid || template.id || "";
}

function templateGroupTitle(template = {}) {
  return normalizeVisibleText(template.groupTitle || template.payload?.groupTitle || template.groupName || "");
}

function templateItemContent(template = {}) {
  return template.template ?? template.content ?? template.templateTasks ?? template.templateSchedules ?? template.tasks ?? template.schedule;
}

function isTemplateGroupNode(template = {}) {
  if (template.payload?.isGroup === true || template.isGroup === true) return true;
  if (template.payload?.isGroup === false || template.isGroup === false) return false;
  return Array.isArray(template.children);
}

function normalizeWorkspaceTemplates(templates = [], store) {
  const normalized = [];
  const groupsById = new Map();
  const pendingItems = [];

  (templates || []).forEach((template) => {
    const kind = template.kind === "schedule" ? "schedule" : "task";
    const title = normalizeVisibleText(template.title);
    if (!title) return;
    if (!isTemplateGroupNode(template)) {
      pendingItems.push({ ...template, kind, title });
      return;
    }
    const group = {
      ...template,
      title,
      kind,
      children: template.children || [],
      templateTasks: template.templateTasks || {},
      templateSchedules: template.templateSchedules || {},
      templateIds: template.templateIds || template.templateIdMap || {},
      ownerId: template.ownerId || "",
      ownerName: template.ownerName || ""
    };
    normalized.push(group);
    const id = templateRemoteId(group);
    if (id) groupsById.set(id, group);
  });

  pendingItems.forEach((item) => {
    const kind = item.kind === "schedule" ? "schedule" : "task";
    const parentId = item.parentTemplateId || item.parentTemplateUid || item.groupId || "";
    let group = (parentId && groupsById.get(parentId)) || null;
    if (!group) {
      const title = templateGroupTitle(item) || (kind === "schedule" ? "项目排期模板" : "项目任务模板");
      const id = parentId || `${kind}-templates`;
      group = {
        id,
        title,
        kind,
        children: [],
        templateTasks: {},
        templateSchedules: {},
        templateIds: {},
        ownerId: item.ownerId || "",
        ownerName: item.ownerName || ""
      };
      normalized.push(group);
      if (id) groupsById.set(id, group);
    }
    if (!group.children.includes(item.title)) group.children.push(item.title);
    group.templateIds = group.templateIds || {};
    const remoteId = templateRemoteId(item);
    if (remoteId) group.templateIds[item.title] = remoteId;
    const content = templateItemContent(item);
    if (kind === "schedule") {
      group.templateSchedules = group.templateSchedules || {};
      group.templateSchedules[item.title] = content && typeof content === "object" ? content : { items: [] };
    } else {
      group.templateTasks = group.templateTasks || {};
      group.templateTasks[item.title] = Array.isArray(content) ? content : content?.tasks || content?.items || [];
    }
  });

  return normalized.map((template) => ({
    ...template,
    ownerId: template.ownerId || store.currentUserId || "",
    ownerName: template.ownerName || store.currentUser?.name || store.currentUser?.username || ""
  }));
}

function resolveBootstrapState(remoteState) {
  if (remoteState?.appState && typeof remoteState.appState === "object") {
    return remoteState.appState;
  }
  return remoteState;
}

function todaySlash() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function readStoredLoginUser() {
  if (typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("xjg_user") || "null");
  } catch {
    return null;
  }
}

export function clearStoredLoginSession() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem("xjg_token");
    localStorage.removeItem("xjg_user");
  } catch {
    // Ignore localStorage cleanup failures and keep surfacing the auth error.
  }
}

function getErrorStatus(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  return Number.isFinite(status) ? status : 0;
}

function isAuthFailureError(error) {
  const status = getErrorStatus(error);
  return status === 401;
}

function isPermissionFailureError(error) {
  const status = getErrorStatus(error);
  return status === 403;
}

function isNetworkUnavailableError(error) {
  if (!error) return false;
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) return false;
  if (status >= 400) return false;
  if (status === 0 && error?.response) return true;
  if (error?.request && !error?.response) return true;
  const code = String(error?.code || "").toUpperCase();
  if (["ECONNABORTED", "ECONNREFUSED", "ENETUNREACH", "ETIMEDOUT", "ERR_NETWORK"].includes(code)) {
    return true;
  }
  const message = String(error?.message || "").toLowerCase();
  return [
    "network error",
    "failed to fetch",
    "fetch failed",
    "load failed",
    "offline",
    "timeout",
    "timed out",
    "socket hang up"
  ].some((pattern) => message.includes(pattern));
}

function isLocalWorkspaceFallbackEnabled() {
  const value =
    viteEnv.VITE_ENABLE_LOCAL_WORKSPACE_FALLBACK ??
    (typeof process !== "undefined" ? process?.env?.VITE_ENABLE_LOCAL_WORKSPACE_FALLBACK : undefined);
  return value === true || String(value || "").toLowerCase() === "true";
}

export function resetStoreForAuthFailure(store) {
  const localState = createInitialState();
  const previousToastMessage = store.toastMessage;
  const previousToastVisible = store.toastVisible;
  const previousCelebration = store.celebration;

  Object.assign(store, {
    ...localState,
    toastMessage: previousToastMessage,
    toastVisible: previousToastVisible,
    celebration: previousCelebration || localState.celebration
  });
  if (typeof store.normalizeLoadedState === "function") store.normalizeLoadedState();
}

export function handleWorkspaceAuthFailure(store, error) {
  if (getErrorStatus(error) !== 401) return false;
  clearStoredLoginSession();
  resetStoreForAuthFailure(store);
  if (error && typeof error === "object") {
    error.authRequired = true;
  }
  return true;
}

function throwAuthFailure(store, error) {
  handleWorkspaceAuthFailure(store, error);
  throw error;
}

function normalizeOfflineUser(user = {}) {
  user = user || {};
  const name = String(user.name || user.username || "admin").trim() || "admin";
  const id = String(user.id || user.userId || "u-local-admin");
  return {
    id,
    username: user.username || name,
    name,
    role: user.role || "admin",
    avatar: user.avatar || name.slice(0, 1).toUpperCase(),
    department: user.department || "项目管理部",
    departmentEn: user.departmentEn || "PROJECT MANAGEMENT",
    email: user.email || "",
    mbti: user.mbti || "ENTP",
    job: user.job || "项目管理员",
    phone: user.phone || "",
    registeredAt: user.registeredAt || new Date().toLocaleString("zh-CN", { hour12: false }),
    mood: user.mood || "",
    signature: user.signature || "",
    profileNote: user.profileNote || "本地离线用户",
    status: user.status || "active",
    characterLabel: user.characterLabel || user.job || "项目管理员",
    avatarImage: user.avatarImage || "",
    characterImage: user.characterImage || "",
    signatureImage: user.signatureImage || ""
  };
}

function createOfflineFlowProject(user) {
  const date = todaySlash();
  const owner = `${user.department || "项目管理部"}: ${user.name}`;
  return {
    id: 900001,
    name: "离线流程项目",
    group: "本地离线工作区",
    status: "active",
    tags: ["本地"],
    owner,
    members: [user.name],
    memberRoles: { [user.name]: "manager" },
    startDate: date,
    endDate: date,
    syncSchedule: false,
    tasks: [
      {
        id: 90000101,
        title: "离线流程检查",
        type: "流程",
        note: "后端未开启时使用本地流程数据，可新建、展开、完成和拖回任务。",
        module: "project",
        owner,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        startDate: date,
        endDate: date,
        comments: [],
        unreadComments: 0,
        expanded: false,
        archived: false
      }
    ]
  };
}

function applyLocalOfflineWorkspace(store, options = {}) {
  const localState = createInitialState();
  const previousToastMessage = store.toastMessage;
  const previousToastVisible = store.toastVisible;
  const previousCelebration = store.celebration;
  const user = normalizeOfflineUser(options.user || readStoredLoginUser() || store.currentUser);
  const project = createOfflineFlowProject(user);
  const board = createProjectBoard(project, user);

  Object.assign(store, {
    ...localState,
    activeSection: "flow",
    activeView: "project",
    activeProjectId: project.id,
    activeFilter: "all",
    taskModuleFilter: "all",
    backendLoaded: false,
    backendSource: "local",
    currentUserId: user.id,
    users: [user],
    contacts: [],
    rootProjects: [project],
    projectGroups: [],
    boards: [board],
    boardHistory: [],
    toastMessage: previousToastMessage,
    toastVisible: previousToastVisible,
    celebration: previousCelebration || localState.celebration
  });
  if (typeof store.normalizeLoadedState === "function") store.normalizeLoadedState();
  return false;
}

export const appActions = {
async loadAppState() {
  const localState = createInitialState();
  try {
    const remoteState = resolveBootstrapState(await workspaceApi.getBootstrap());
    Object.assign(this, {
      ...localState,
      ...remoteState,
      backendLoaded: true,
      backendSource: "workspace",
      toastMessage: this.toastMessage,
      toastVisible: this.toastVisible,
      celebration: this.celebration
    });
    this.normalizeLoadedState();
    await appActions.loadCarouselNotices.call(this);
    return true;
  } catch (bootstrapError) {
    if (isAuthFailureError(bootstrapError)) {
      throwAuthFailure(this, bootstrapError);
    }
    try {
      const remoteState = await http.get("/appState/main");
      Object.assign(this, {
        ...localState,
        ...remoteState,
        backendLoaded: true,
        backendSource: "appState",
        toastMessage: this.toastMessage,
        toastVisible: this.toastVisible,
        celebration: this.celebration
      });
      this.normalizeLoadedState();
      return true;
    } catch (appStateError) {
      if (isAuthFailureError(appStateError)) {
        throwAuthFailure(this, appStateError);
      }
      if (isPermissionFailureError(appStateError)) {
        throw appStateError;
      }
      if (isNetworkUnavailableError(bootstrapError) && isNetworkUnavailableError(appStateError) && isLocalWorkspaceFallbackEnabled()) {
        console.warn("Both bootstrap and appState fallback unavailable, using local offline workspace state.", {
          bootstrapError,
          appStateError
        });
        return applyLocalOfflineWorkspace(this, { user: readStoredLoginUser() });
      }
      throw appStateError;
    }
  }
},
useLocalOfflineWorkspace(options = {}) {
  applyLocalOfflineWorkspace(this, options);
  return true;
},
async loadCarouselNotices() {
  try {
    const response = await workspaceApi.listCarouselNotices();
    this.carouselNotices = normalizeCarouselNotices(response);
    return true;
  } catch {
    return false;
  }
},
normalizeLoadedState() {
  this.query = "";
  this.rootProjects = this.rootProjects || [];
  this.projectGroups = (this.projectGroups || []).map((group) => ({
    ...group,
    projects: group.projects || []
  }));
  this.users = this.users || [];
  this.contacts = this.contacts || [];
  this.tags = this.tags || [];
  this.carouselNotices = normalizeCarouselNotices(this.carouselNotices || []);
  this.boards = this.boards || [];
  this.boardHistory = this.boardHistory || [];
  this.treesOpen = {
    summary: true,
    archive: true,
    scheduleTemplates: true,
    templates: true,
    "shared-templates": true,
    ...(this.treesOpen || {})
  };
  this.templates = normalizeWorkspaceTemplates(this.templates || [], this);
  if (!this.templates.some((template) => !template.locked && template.kind === "schedule")) {
    this.templates.unshift({ id: "tpl-schedule-default", title: "默认排期模板", kind: "schedule", children: [], templateTasks: {}, templateSchedules: {}, ownerId: this.currentUserId || "", ownerName: this.currentUser?.name || this.currentUser?.username || "" });
  }
  if (!this.templates.some((template) => !template.locked && template.kind !== "schedule")) {
    const lockedIndex = this.templates.findIndex((template) => template.locked);
    const group = { id: "tpl-task-default", title: "默认任务模板", kind: "task", children: [], templateTasks: {}, ownerId: this.currentUserId || "", ownerName: this.currentUser?.name || this.currentUser?.username || "" };
    if (lockedIndex === -1) this.templates.push(group);
    else this.templates.splice(lockedIndex, 0, group);
  }
  this.allProjects.forEach((project) => {
    project.status = project.status || "active";
    project.tags = project.tags || [];
    project.members = project.members || [];
    project.memberRoles = project.memberRoles || {};
    project.tasks = project.tasks || [];
    project.members.forEach((name, index) => {
      project.memberRoles[name] = project.memberRoles[name] || (index === 0 ? "manager" : "readonly");
    });
    project.tasks.forEach((task) => {
      task.comments = task.comments || [];
      task.module = normalizeTaskModuleKey(task.module);
      task.unreadComments = Math.max(0, Number(task.unreadComments || 0));
      if (!task.startDate || !task.endDate) {
        const date = String(task.time || "").match(/\d{4}\/\d{2}\/\d{2}/)?.[0] || todaySlash();
        task.startDate = task.startDate || date;
        task.endDate = task.endDate || date;
      }
    });
  });
  if (!this.activeProject && this.activeProjects.length) {
    this.activeProjectId = this.activeProjects[0].id;
  }
  this.taskModuleFilter = this.taskModuleFilter || "all";
},
async saveAppState() {
  const {
    toastMessage,
    toastVisible,
    celebration,
    query,
    draggingTaskId,
    scheduleDraggingTaskId,
    recentTaskId,
    pendingArchiveTaskId,
    backendLoaded,
    ...state
  } = this.$state;
  try {
    await http.put("/appState/main", { ...state, id: "main", backendLoaded });
    return true;
  } catch (error) {
    console.warn("Mock appState save failed.", error);
    return false;
  }
},
setSection(section) {
  this.activeSection = section;
  this.taskModuleFilter = "all";
  if (section === "home") {
    this.activeView = "project";
    this.activeFilter = "all";
  }
  if (section === "flow") {
    this.activeView = this.activeView || "project";
    if (this.activeFilter === "排期") this.activeFilter = "all";
  }
  if (section === "schedule") {
    this.activeView = "project";
  }
  if (section === "boards") {
    this.activeView = "project";
    this.activeFilter = "all";
  }
  if (section === "resource") {
    this.activeView = "project";
    this.activeFilter = "all";
  }
  if (section === "optimize") {
    this.activeView = "project";
    this.activeFilter = "all";
  }
},
};
