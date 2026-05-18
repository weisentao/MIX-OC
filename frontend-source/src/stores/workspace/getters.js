import { taskModules } from "../../data/seed.js";
import { cleanProjectName, idsEqual } from "./helpers.js";
import { getBoardRole, getBoardScopeKey, getBoardsSharedByUser, getBoardsSharedWithUser, getUserBoardPermission, listBoardsForScope } from "../../features/collab-board/boardModel.js";
import { templatePermissionForUser, visibleTemplatesForUser } from "./templateOwnership.js";

const ADMIN_COMMENT_RISK_WORDS = ["错误", "返工", "没拿到", "风险", "加班", "版权", "延期", "不确定", "等客户"];

function toSafeText(value) {
  return String(value ?? "").trim();
}

function shortSummary(text, max = 56) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function archiveTimeValue(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const normalized = String(value).trim().replace(/-/g, "/");
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
  }
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export const workspaceGetters = {
collapsedSet: (state) => new Set(state.collapsedGroups),
collapsedTemplateSet: (state) => new Set(state.collapsedTemplateGroups || []),
allProjects: (state) => [...(state.rootProjects || []), ...(state.projectGroups || []).flatMap((group) => group.projects || [])],
activeProjects() {
  return this.allProjects.filter((project) => project.status !== "archived");
},
archivedProjectsList() {
  return this.allProjects
    .filter((project) => project.status === "archived")
    .slice()
    .sort((a, b) => archiveTimeValue(b.archivedAt) - archiveTimeValue(a.archivedAt));
},
activeProject() {
  return this.allProjects.find((project) =>
    project.status !== "archived" &&
    (
      idsEqual(project.id, this.activeProjectId) ||
      idsEqual(project.projectId, this.activeProjectId) ||
      idsEqual(project.projectUid, this.activeProjectId) ||
      idsEqual(project.project_id, this.activeProjectId) ||
      idsEqual(project.project_uid, this.activeProjectId) ||
      idsEqual(project.uid, this.activeProjectId)
    )
  ) || null;
},
activeProjectName() {
  if (["template", "schedule-template"].includes(this.activeView) && this.activeTemplateName) return cleanProjectName(this.activeTemplateName);
  return this.activeProject ? cleanProjectName(this.activeProject.name) : "未选择项目";
},
currentUser() {
  return (this.users || []).find((user) => user.id === this.currentUserId) || (this.users || [])[0] || null;
},
visibleTemplates() {
  return visibleTemplatesForUser(this.templates || [], this.currentUser || {}, {
    templateShareInfo: this.templateShareInfo || {}
  });
},
scheduleTemplateGroups() {
  return this.visibleTemplates.filter((template) => !template.locked && template.kind === "schedule");
},
taskTemplateGroups() {
  return this.visibleTemplates.filter((template) => !template.locked && template.kind !== "schedule");
},
activeTemplate() {
  return (this.templates || [])[Number(this.activeTemplateGroupIndex)] || null;
},
activeTemplateName() {
  const template = this.activeTemplate;
  if (!template || this.activeTemplateChildIndex === null || this.activeTemplateChildIndex === undefined) return "";
  return (template.children || [])[Number(this.activeTemplateChildIndex)] || "";
},
activeTemplateTasks() {
  const template = this.activeTemplate;
  const name = this.activeTemplateName;
  if (!template || !name) return [];
  if (template.kind === "schedule") return [];
  template.templateTasks = template.templateTasks || {};
  template.templateTasks[name] = template.templateTasks[name] || [];
  return template.templateTasks[name];
},
templateCanEdit() {
  const template = this.activeTemplate;
  if (!["template", "schedule-template"].includes(this.activeView) || !template || template.locked) return false;
  const user = this.currentUser || {};
  const ownerMatched = (!template.ownerId && !template.ownerName) || template.ownerId === user.id || template.ownerName === (user.name || user.username);
  if (ownerMatched) return true;
  const activeName = this.activeTemplateName || "";
  if (!activeName) return false;
  return templatePermissionForUser(activeName, this.templateShareInfo || {}, user) === "edit";
},
isAdmin() {
  const role = String(this.currentUser?.role || "").trim().toLowerCase();
  return ["admin", "super_admin"].includes(role);
},
isManagementUser() {
  if (this.isAdmin) return true;
  const user = this.currentUser || {};
  const role = String(user.role || "").trim().toLowerCase();
  if (["manager", "department_admin", "department_manager", "project_manager"].includes(role)) return true;
  const name = user.name;
  if (!name) return false;
  return this.allProjects.some((project) => {
    const role = project.memberRoles?.[name];
    return role === "manager";
  });
},
activeNotice() {
  const active = (this.carouselNotices || []).filter((item) => item.enabled !== false);
  if (!active.length) return null;
  return active[Math.floor(Date.now() / 5500) % active.length];
},
activeMembersDetailed() {
  const project = this.activeProject;
  if (!project) return [];
  return (project.members || []).map((name, index) => {
    const user = this.getUserByName(name);
    return {
      id: user?.id || `guest-${name}`,
      name,
      avatar: user?.avatar || String(name).slice(0, 1),
      department: user?.department || "临时协同",
      role: project.memberRoles?.[name] || (index === 0 ? "manager" : "readonly"),
      status: user?.status || "active"
    };
  });
},
currentProjectRole() {
  if (this.isAdmin) return "manager";
  const project = this.activeProject;
  const name = this.currentUser?.name;
  if (!project || !name) return "none";
  return project.memberRoles?.[name] || ((project.members || []).includes(name) ? "readonly" : "none");
},
activeBoard() {
  return (this.boards || []).find((board) => board.id === this.activeBoardId && board.status !== "deleted") || null;
},
activeBoardScopeBoards() {
  if (!this.activeBoardScope) return [];
  return listBoardsForScope(this.boards || [], this.activeBoardScope);
},
activeBoardScopeLabel() {
  if (!this.activeBoardScope) return "";
  return this.activeBoardScope.scopeType === "module"
    ? `${this.activeProjectName} · ${this.activeBoardScope.label}`
    : `${this.activeProjectName} · 项目画板`;
},
activeBoardScopeKey() {
  return this.activeBoardScope ? getBoardScopeKey(this.activeBoardScope) : "";
},
activeBoardSnapshots() {
  if (!this.activeBoardId) return [];
  return (this.boardHistory || [])
    .filter((snapshot) => snapshot.boardId === this.activeBoardId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
},
myBoards() {
  const user = this.currentUser;
  if (!user) return [];
  return (this.boards || []).filter((board) => {
    if (board.status === "deleted") return false;
    if (user.id && board.ownerId === user.id) return true;
    if (user.name && (board.ownerName === user.name || board.createdBy === user.name)) return true;
    return false;
  });
},
sharedWithMeBoards() {
  return getBoardsSharedWithUser(this.boards || [], this.currentUser);
},
sharedByMeBoards() {
  return getBoardsSharedByUser(this.boards || [], this.currentUser);
},
canViewProject() {
  return this.currentProjectRole !== "none";
},
canComment() {
  return ["readonly", "editor", "manager"].includes(this.currentProjectRole);
},
canEditTask() {
  if (["template", "schedule-template"].includes(this.activeView)) return this.templateCanEdit;
  return ["editor", "manager"].includes(this.currentProjectRole);
},
canManageProject() {
  if (["template", "schedule-template"].includes(this.activeView)) return this.templateCanEdit;
  return this.currentProjectRole === "manager";
},
canViewBoard() {
  const board = this.activeBoard;
  if (!board) return this.currentProjectRole !== "none";
  const project = this.allProjects.find((item) => idsEqual(item.id, board.projectId));
  return getUserBoardPermission(board, this.currentUser) !== "none" || getBoardRole(project, this.currentUser) !== "none";
},
canEditBoard() {
  const board = this.activeBoard;
  if (!board) return ["editor", "manager"].includes(this.currentProjectRole);
  const permission = getUserBoardPermission(board, this.currentUser);
  if (permission === "owner" || permission === "edit") return true;
  const project = this.allProjects.find((item) => idsEqual(item.id, board.projectId));
  return ["editor", "manager"].includes(getBoardRole(project, this.currentUser));
},
canManageBoard() {
  const board = this.activeBoard;
  if (!board) return this.currentProjectRole === "manager";
  const project = this.allProjects.find((item) => idsEqual(item.id, board.projectId));
  return getUserBoardPermission(board, this.currentUser) === "owner" || getBoardRole(project, this.currentUser) === "manager";
},
activeUsers() {
  return (this.users || []).filter((user) => user.status !== "archived");
},
careContacts() {
  return (this.contacts || []).filter((contact) => {
    if (contact.status === "archived") return false;
    return String(contact.relationType || contact.relation_type || "care").trim().toLowerCase() === "care";
  });
},
archivedUsers() {
  return (this.users || []).filter((user) => user.status === "archived");
},
adminStats() {
  const projects = this.allProjects;
  const tasks = projects.flatMap((project) => project.tasks || []);
  const comments = tasks.flatMap((task) => task.comments || []);
  return {
    dangerProjects: projects.filter((project) => project.status !== "archived" && (project.tasks || []).some((task) => !task.archived && this.getTaskModule(task).key === "aigc")).length,
    archivedProjects: projects.filter((project) => project.status === "archived").length,
    penaltyProjects: projects.filter((project) => project.tags?.includes("返工")).length,
    activeProjects: projects.filter((project) => project.status !== "archived").length,
    activeTasks: tasks.filter((task) => !task.archived).length,
    doneTasks: tasks.filter((task) => task.archived).length,
    comments: comments.length,
    videos: 0,
    images: 0,
    videoSize: "待接入",
    imageSize: "待接入"
  };
},
adminCommentRiskWords() {
  return [...ADMIN_COMMENT_RISK_WORDS];
},
adminCommentEntries() {
  const rows = [];
  this.allProjects.forEach((project) => {
    (project.tasks || []).forEach((task) => {
      (task.comments || []).forEach((comment, index) => {
        const text = toSafeText(comment.text);
        const matchedRiskWords = ADMIN_COMMENT_RISK_WORDS.filter((word) => text.includes(word));
        rows.push({
          id: `${project.id}-${task.id}-${comment.time || "no-time"}-${comment.user || "anonymous"}-${index}`,
          projectId: project.id,
          projectName: toSafeText(project.name) || "未命名项目",
          taskId: Number(task.id),
          taskTitle: toSafeText(task.title) || "未命名任务",
          taskType: toSafeText(task.type),
          moduleLabel: this.getTaskModule(task).label,
          user: toSafeText(comment.user) || "匿名用户",
          dept: toSafeText(comment.dept),
          time: toSafeText(comment.time),
          text,
          matchedRiskWords,
          isRisk: matchedRiskWords.length > 0,
          summary: shortSummary(text)
        });
      });
    });
  });
  return rows;
},
adminCommentInsights() {
  const entries = this.adminCommentEntries;
  const riskComments = entries.filter((entry) => entry.isRisk);
  const userCounter = new Map();
  const taskCounter = new Map();

  entries.forEach((entry) => {
    const userKey = entry.user || "匿名用户";
    userCounter.set(userKey, (userCounter.get(userKey) || 0) + 1);
    const taskKey = `${entry.projectId}-${entry.taskId}`;
    const currentTask = taskCounter.get(taskKey) || {
      key: taskKey,
      projectId: entry.projectId,
      taskId: entry.taskId,
      projectName: entry.projectName,
      taskTitle: entry.taskTitle,
      count: 0
    };
    currentTask.count += 1;
    taskCounter.set(taskKey, currentTask);
  });

  const topUser = [...userCounter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)[0] || { name: "暂无", count: 0 };
  const topTask =
    [...taskCounter.values()].sort((a, b) => b.count - a.count)[0] || {
      key: "none",
      projectId: null,
      taskId: null,
      projectName: "暂无",
      taskTitle: "暂无",
      count: 0
    };

  return {
    totalComments: entries.length,
    riskCommentCount: riskComments.length,
    topCommentUser: topUser,
    topCommentTask: topTask,
    riskComments: riskComments.slice(0, 80),
    riskWords: [...ADMIN_COMMENT_RISK_WORDS]
  };
},
totalProjects() {
  return this.activeProjects.length;
},
summaryCategoryCount() {
  return (this.projectGroups || []).length;
},
activeProjectPeriod() {
  return this.getProjectPeriod(this.activeProject);
},
tagMap: (state) => {
  return (state.tags || []).reduce((map, tag) => {
    map[tag.name] = tag;
    return map;
  }, {});
},
activeTasks() {
  if (this.activeView === "template") return this.activeTemplateTasks.filter((task) => !task.archived && this.taskMatchesFilter(task));
  return this.activeProject?.tasks?.filter((task) => !task.archived && this.taskMatchesFilter(task)) || [];
},
archivedTasks() {
  if (this.activeView === "template") return this.activeTemplateTasks.filter((task) => task.archived && this.taskMatchesFilter(task));
  return this.activeProject?.tasks?.filter((task) => task.archived && this.taskMatchesFilter(task)) || [];
},
dashboard() {
  const project = this.activeProject;
  if (!project) {
    return { active: 0, done: 0, comments: 0, chart: [], table: [] };
  }

  const tasks = project.tasks || [];
  const maxCount = Math.max(1, ...taskModules.map((module) => tasks.filter((task) => this.getTaskModule(task).key === module.key).length));
  return {
    active: tasks.filter((task) => !task.archived).length,
    done: tasks.filter((task) => task.archived).length,
    comments: tasks.reduce((sum, task) => sum + (task.comments || []).length, 0),
    chart: taskModules.map((module) => {
      const count = tasks.filter((task) => this.getTaskModule(task).key === module.key).length;
      return {
        ...module,
        count,
        percent: Math.max(10, Math.round((count / maxCount) * 100))
      };
    }),
    table: tasks.filter((task) => !task.archived).slice(0, 6)
  };
},
scheduleTasks() {
  const project = this.activeProject;
  if (!project) return [];
  this.ensureScheduleDefaults(project);
  return project.tasks || [];
},
selectedScheduleTask() {
  return this.scheduleTasks.find((task) => task.id === this.scheduleSelectedTaskId) || this.scheduleTasks[0] || null;
},
sharedTemplateNames: (state) => {
  return Object.entries(state.templateShareInfo || {})
    .filter(([, info]) => info.shared && info.fromUser !== "我")
    .map(([name]) => name);
}
};
