const MANAGEMENT_ACCOUNT_ROLES = ["admin", "manager", "department_admin", "department_manager", "project_manager"];
const MANAGER_ROLES = ["manager", "project_manager", "department_manager", "department_admin", "editor", "readonly"];
const EDITABLE_ROLES = ["manager", "project_manager", "department_manager", "department_admin", "editor"];

export const MANAGER_NAV = [
  { key: "overview", label: "概览" },
  { key: "department", label: "本部门" },
  { key: "members", label: "成员" },
  { key: "member-detail", label: "成员详情" },
  { key: "projects", label: "项目" },
  { key: "project-detail", label: "项目详情" },
  { key: "tasks", label: "任务" },
  { key: "comments", label: "评论" },
  { key: "schedule", label: "排期" },
  { key: "ai", label: "智能使用记录" },
  { key: "permissions", label: "权限" },
  { key: "boards", label: "画板" },
  { key: "templates", label: "模板" },
  { key: "tags", label: "标签" },
  { key: "archives", label: "归档" },
  { key: "accounts", label: "账号" }
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value) {
  return String(value ?? "").trim();
}

function idText(value) {
  return compactText(value);
}

function userName(user = {}) {
  return compactText(user.name || user.username);
}

function allProjects(store = {}) {
  if (Array.isArray(store.allProjects)) return store.allProjects;
  return [...asArray(store.rootProjects), ...asArray(store.projectGroups).flatMap((group) => asArray(group.projects))];
}

function currentUser(store = {}) {
  if (store.currentUser) return store.currentUser;
  return asArray(store.users).find((user) => user.id === store.currentUserId) || asArray(store.users)[0] || null;
}

function projectRole(project = {}, user = {}) {
  const accountRole = String(user.role || "").trim().toLowerCase();
  if (MANAGEMENT_ACCOUNT_ROLES.includes(accountRole)) return "manager";
  const name = userName(user);
  if (!name) return "none";
  return project.memberRoles?.[name] || (asArray(project.members).includes(name) ? "readonly" : "none");
}

function isVisibleProject(project, user, department) {
  const role = projectRole(project, user);
  if (MANAGER_ROLES.includes(role)) return true;
  if (department && project.department === department) return true;
  return department && project.group === department;
}

function templateVisibleToUser(template = {}, user = {}) {
  if (template.locked) return true;
  return template.ownerId === user.id || template.ownerName === userName(user);
}

function userMatches(user = {}, name) {
  const target = compactText(name);
  return !!target && (user.name === target || user.username === target);
}

function boardPermission(board = {}, user = {}) {
  if (user.role === "admin") return "owner";
  if (user.id && board.ownerId === user.id) return "owner";
  if (userName(user) && [board.ownerName, board.createdBy].includes(userName(user))) return "owner";
  const share = asArray(board.sharedWith).find((entry) => {
    if (user.id && [entry.userId, entry.id].includes(user.id)) return true;
    return userName(user) && [entry.userName, entry.name].includes(userName(user));
  });
  return share?.permission === "edit" || share?.permission === "readonly" ? share.permission : "none";
}

function summarizeProject(project, role) {
  const tasks = asArray(project.tasks);
  const activeTasks = tasks.filter((task) => !task.archived);
  const archivedTasks = tasks.filter((task) => task.archived);
  const comments = tasks.flatMap((task) => asArray(task.comments));
  return {
    ...project,
    managerRole: role,
    taskCount: tasks.length,
    activeTaskCount: activeTasks.length,
    archivedTaskCount: archivedTasks.length,
    commentCount: comments.length
  };
}

function summarizeMember(user, projects) {
  const name = userName(user);
  const memberProjects = projects.filter((project) => asArray(project.members).includes(name) || project.memberRoles?.[name]);
  const tasks = memberProjects.flatMap((project) =>
    asArray(project.tasks)
      .filter((task) => [task.owner, task.assignee, task.user, task.createdBy].includes(name))
      .map((task) => ({ ...task, projectId: project.id, projectName: project.name }))
  );
  return {
    ...user,
    projectCount: memberProjects.length,
    taskCount: tasks.length,
    activeTaskCount: tasks.filter((task) => !task.archived).length,
    commentCount: memberProjects.reduce(
      (sum, project) =>
        sum +
        asArray(project.tasks).reduce(
          (taskSum, task) => taskSum + asArray(task.comments).filter((comment) => userMatches(user, comment.user || comment.authorName)).length,
          0
        ),
      0
    ),
    projects: memberProjects,
    tasks
  };
}

function collectComments(projects) {
  return projects.flatMap((project) =>
    asArray(project.tasks).flatMap((task) =>
      asArray(task.comments).map((comment, index) => ({
        ...comment,
        id: comment.id || `${project.id}-${task.id}-${index}`,
        projectId: project.id,
        projectName: project.name,
        taskId: task.id,
        taskTitle: task.title
      }))
    )
  );
}

function collectSchedule(store, projects) {
  const activeProjectId = store.activeProject?.id || store.activeProjectId;
  const projectIds = new Set(projects.map((project) => idText(project.id)));
  const planItems = asArray(store.schedulePlan?.items)
    .filter((item) => !item.projectId || projectIds.has(idText(item.projectId)) || idText(store.schedulePlan?.projectId) === idText(activeProjectId))
    .map((item) => ({ ...item, source: "schedulePlan" }));
  const taskItems = projects.flatMap((project) =>
    asArray(project.tasks)
      .filter((task) => task.type === "排期" || task.scheduleStatus || task.startDate || task.endDate)
      .map((task) => ({ ...task, projectId: project.id, projectName: project.name, source: "task" }))
  );
  return [...planItems, ...taskItems];
}

function collectTags(store, projects) {
  const names = new Map();
  asArray(store.tags).forEach((tag) => names.set(tag.name, { ...tag, count: 0 }));
  projects.forEach((project) => {
    asArray(project.tags).forEach((name) => {
      const current = names.get(name) || { name, count: 0 };
      names.set(name, { ...current, count: current.count + 1 });
    });
  });
  return [...names.values()];
}

function dateKey(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeNetworkStatus(value) {
  if (value === true) return "已开启";
  if (value === false) return "未开启";
  const text = compactText(value);
  if (!text) return "按后台配置";
  const map = {
    online: "已联网",
    offline: "未联网",
    enabled: "已开启",
    disabled: "未开启",
    on: "已开启",
    off: "未开启"
  };
  return map[text.toLowerCase()] || text;
}

function displayModelName(value) {
  const text = compactText(value);
  const map = {
    "deepseek-v4-flash": "深度求索第四代极速版",
    "deepseek-v4-pro": "深度求索第四代专业版",
    "deepseek-chat": "深度求索对话版（兼容旧标识）",
    "deepseek-reasoner": "深度求索推理版（兼容旧标识）",
    "DeepSeek V4 Flash": "深度求索第四代极速版",
    "DeepSeek V4 Pro": "深度求索第四代专业版",
    "DeepSeek Chat": "深度求索对话版（兼容旧标识）",
    "DeepSeek Reasoner": "深度求索推理版（兼容旧标识）"
  };
  return map[text] || text || "按后台配置";
}

function aiStoreConfig(store = {}) {
  const source = store.aiConfig || store.ai?.config || store.aiSettings || store.settings?.ai || {};
  return {
    model: displayModelName(source.model || source.modelName || source.modelId || source.defaultModel),
    networkStatus: normalizeNetworkStatus(source.networkEnabled ?? source.webSearchEnabled ?? source.online ?? source.networkStatus),
    provider: source.provider || source.vendor || "",
    scopeNote: "仅查看当前权限范围内的生效配置摘要"
  };
}

function normalizeAiLog(row = {}, index = 0) {
  const askedAt = row.askedAt || row.createdAt || row.time || row.questionTime || row.requestTime || "";
  const prompt = row.questionSummary || row.summary || row.promptSummary || row.question || row.prompt || row.content || "";
  return {
    id: row.id || row.logId || row.traceId || `ai-log-${index}`,
    userId: row.userId || row.askerId || row.actorId || row.createdBy || "",
    asker: row.asker || row.askerName || row.userName || row.user || row.actorName || "未知提问人",
    askedAt,
    questionSummary: compactText(prompt).slice(0, 160) || "未提供问题摘要",
    model: displayModelName(row.model || row.modelName || row.modelId),
    networkStatus: normalizeNetworkStatus(row.networkEnabled ?? row.webSearchEnabled ?? row.online ?? row.networkStatus),
    status: row.status || row.state || "completed",
    projectId: row.projectId || row.projectUid || row.project_uid || "",
    projectName: row.projectName || row.project || "",
    department: row.department || row.dept || ""
  };
}

function collectAiLogs(store = {}, projects = [], user = {}, departmentName = "") {
  const projectIds = new Set(projects.map((project) => String(project.id || project.projectId || project.projectUid || "")));
  const currentName = userName(user);
  const sourceLogs = [
    ...asArray(store.aiUsageLogs),
    ...asArray(store.aiLogs),
    ...asArray(store.ai?.logs),
    ...asArray(store.ai?.usageLogs)
  ];
  return sourceLogs
    .map(normalizeAiLog)
    .filter((row) => {
      if (row.projectId && projectIds.has(String(row.projectId))) return true;
      if (row.userId && user.id && String(row.userId) === String(user.id)) return true;
      if (currentName && row.asker === currentName) return true;
      if (departmentName && row.department === departmentName) return true;
      return false;
    });
}

function buildAiUsageData(store, projects, user, departmentName) {
  const rows = collectAiLogs(store, projects, user, departmentName);
  const config = aiStoreConfig(store);
  const today = dateKey(new Date());
  const todayCount = rows.filter((row) => dateKey(row.askedAt) === today).length;
  return {
    summary: {
      todayQuestions: { label: "今日提问", value: todayCount },
      networkStatus: { label: "联网状态", value: config.networkStatus },
      model: { label: "模型", value: config.model }
    },
    config,
    rows
  };
}

export function buildManagerConsoleModel(store = {}) {
  const user = currentUser(store) || {};
  const departmentName = compactText(user.department);
  const sourceProjects = allProjects(store);
  const scopedProjects = sourceProjects
    .map((project) => ({ project, role: projectRole(project, user) }))
    .filter(({ project, role }) => MANAGER_ROLES.includes(role) || isVisibleProject(project, user, departmentName))
    .map(({ project, role }) => summarizeProject(project, role));
  const projectIds = new Set(
    scopedProjects.flatMap((project) => [project.id, project.projectId, project.projectUid]).filter((id) => id !== undefined && id !== null && id !== "")
  );
  const activeProjects = scopedProjects.filter((project) => project.status !== "archived");
  const archivedProjects = scopedProjects.filter((project) => project.status === "archived");
  const tasks = scopedProjects.flatMap((project) => asArray(project.tasks).map((task) => ({ ...task, projectId: project.id, projectName: project.name })));
  const comments = collectComments(scopedProjects);
  const departmentUsers = asArray(store.users).filter((item) => !departmentName || item.department === departmentName);
  const accountUsers = departmentUsers.filter((item) => item.status !== "archived");
  const archivedUsers = departmentUsers.filter((item) => item.status === "archived");
  const members = departmentUsers.map((member) => summarizeMember(member, scopedProjects));
  const boards = asArray(store.boards)
    .filter((board) => board.status !== "deleted")
    .filter((board) => projectIds.has(idText(board.projectId)) || boardPermission(board, user) !== "none")
    .map((board) => ({ ...board, permission: boardPermission(board, user) }));
  const templates = asArray(store.templates).filter((template) => templateVisibleToUser(template, user));
  const permissions = scopedProjects.map((project) => ({
    projectId: project.id,
    projectName: project.name,
    currentRole: project.managerRole,
    canManage: project.managerRole === "manager",
    canEdit: EDITABLE_ROLES.includes(project.managerRole),
    roles: Object.entries(project.memberRoles || {}).map(([name, role]) => ({ name, role }))
  }));

  return {
    nav: MANAGER_NAV,
    scope: {
      user,
      department: departmentName,
      roles: MANAGER_ROLES,
      projectIds: [...projectIds],
      role: user.role || "manager"
    },
    overview: {
      activeProjects: activeProjects.length,
      archivedProjects: archivedProjects.length,
      members: members.length,
      tasks: tasks.length,
      activeTasks: tasks.filter((task) => !task.archived).length,
      archivedTasks: tasks.filter((task) => task.archived).length,
      comments: comments.length,
      boards: boards.length,
      templates: templates.length
    },
    department: {
      name: departmentName,
      members: departmentUsers,
      projects: scopedProjects
    },
    members,
    memberDetail: members,
    projects: activeProjects,
    projectDetail: scopedProjects,
    tasks,
    comments,
    schedule: collectSchedule(store, scopedProjects),
    ai: buildAiUsageData(store, scopedProjects, user, departmentName),
    permissions,
    boards,
    templates,
    tags: collectTags(store, scopedProjects),
    archives: {
      projects: archivedProjects,
      tasks: tasks.filter((task) => task.archived),
      accounts: archivedUsers
    },
    accounts: accountUsers
  };
}
