const EMPTY_ARRAY = [];

export const ADMIN_NAV = [
  { key: "dashboard", label: "总览", group: "overview" },
  { key: "users", label: "用户", group: "identity" },
  { key: "permissions", label: "权限", group: "identity" },
  { key: "projects", label: "项目", group: "workspace" },
  { key: "risk", label: "风险", group: "workspace" },
  { key: "schedules", label: "排期", group: "workspace" },
  { key: "boards", label: "画板", group: "assets" },
  { key: "templates", label: "模板", group: "assets" },
  { key: "tags", label: "标签", group: "assets" },
  { key: "notices", label: "公告", group: "operations" },
  { key: "departments", label: "部门", group: "operations" },
  { key: "archives", label: "归档", group: "operations" },
  { key: "ai", label: "智能配置", group: "system" },
  { key: "system", label: "系统", group: "system" }
];

export const ADMIN_STATUS_CHIPS = {
  healthy: { label: "正常", tone: "success" },
  warning: { label: "关注", tone: "warning" },
  danger: { label: "风险", tone: "danger" },
  muted: { label: "空闲", tone: "muted" },
  archived: { label: "归档", tone: "muted" },
  syncing: { label: "同步中", tone: "info" }
};

export const AI_SCOPE_OPTIONS = [
  { key: "tasks", label: "任务", description: "任务标题、负责人、状态与进度" },
  { key: "comments", label: "评论", description: "任务讨论、风险反馈与处理记录" },
  { key: "schedules", label: "排期", description: "计划节点、起止时间与逾期状态" },
  { key: "documents", label: "文档", description: "后台维护的资料库内容" }
];

export const AI_MODEL_OPTIONS = [
  { id: "deepseek-v4-flash", name: "深度求索第四代极速版", provider: "深度求索", contextLimit: 64000, recommended: true },
  { id: "deepseek-v4-pro", name: "深度求索第四代专业版", provider: "深度求索", contextLimit: 64000 },
  { id: "deepseek-chat", name: "深度求索对话版（兼容旧标识）", provider: "深度求索", contextLimit: 64000, deprecated: true },
  { id: "deepseek-reasoner", name: "深度求索推理版（兼容旧标识）", provider: "深度求索", contextLimit: 64000, deprecated: true }
];

export const AI_CONFIG_DEFAULTS = {
  enabled: false,
  modelId: "deepseek-v4-flash",
  defaultModel: "deepseek-v4-flash",
  fallbackModel: "deepseek-v4-pro",
  allowWebSearch: false,
  webSearchEnabled: false,
  knowledgeScopes: ["tasks", "comments", "schedules", "documents"],
  openingTemplate: "你好，我会基于当前工作台资料给出简洁答复，并在不确定时说明依据不足。",
  systemPrompt: "你好同学，我会先查看你有权限看到的任务、评论、排期和资料，再给出简洁可执行的回答。",
  maxContext: 32000,
  maxMessageChars: 2000,
  maxContextMessages: 8,
  temperature: 0.3,
  documentsEnabled: false,
  updatedAt: "等待后端返回"
};

export const AI_DOCUMENTS = [];

export const AI_USAGE_LOGS = [];

function list(value) {
  return Array.isArray(value) ? value : EMPTY_ARRAY;
}

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function firstText(...values) {
  for (const value of values) {
    const current = text(value);
    if (current) return current;
  }
  return "";
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value) {
  if (!value) return 0;
  const parsed = Date.parse(String(value).replace(/-/g, "/"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function shortText(value, max = 48) {
  const content = text(value);
  return content.length > max ? `${content.slice(0, max)}...` : content;
}

function isArchived(record) {
  return record?.status === "archived" || record?.archived === true;
}

function taskStatus(task) {
  if (task?.archived) return "done";
  return text(task?.status, "active");
}

function taskModule(store, task) {
  if (typeof store?.getTaskModule === "function") return store.getTaskModule(task || {});
  return { key: text(task?.module || task?.type, "task"), label: text(task?.type || task?.module, "任务") };
}

function projectTasks(project) {
  return list(project?.tasks);
}

function projectId(project = {}) {
  return firstText(project.id, project.projectUid, project.project_uid, project.projectId, project.project_id, project.uid);
}

function groupName(project = {}) {
  return firstText(project.group, project.groupTitle, project.group_title, project.department, project.groupName, project.group_name, "未分组");
}

function ownerName(project = {}) {
  return firstText(project.owner, project.ownerName, project.owner_name, project.ownerText, project.owner_text, normalizedProjectMembers(project)[0]?.name);
}

function userIdentityValues(user = {}) {
  return [user.id, user.userId, user.userUid, user.user_uid, user.username, user.name].map(text).filter(Boolean);
}

function memberDisplayName(member) {
  if (member && typeof member === "object") return firstText(member.name, member.userName, member.username, member.displayName, member.userId, member.id);
  return text(member);
}

function memberIdentityValues(member) {
  if (member && typeof member === "object") {
    return [member.userId, member.userUid, member.user_uid, member.id, member.uid, member.username, member.userName, member.name, member.displayName]
      .map(text)
      .filter(Boolean);
  }
  return [text(member)].filter(Boolean);
}

function normalizedProjectMembers(project = {}) {
  const byDisplayName = new Map();
  list(project.members).forEach((member, index) => {
    const name = memberDisplayName(member);
    if (!name || byDisplayName.has(name)) return;
    const identities = memberIdentityValues(member);
    byDisplayName.set(name, {
      name,
      identities,
      role: firstText(
        member?.role,
        member?.permission,
        ...identities.map((identity) => project.memberRoles?.[identity]),
        index === 0 ? "manager" : "readonly"
      )
    });
  });

  Object.entries(project.memberRoles || {}).forEach(([identity, role]) => {
    const normalized = text(identity);
    if (!normalized || byDisplayName.has(normalized)) return;
    byDisplayName.set(normalized, {
      name: normalized,
      identities: [normalized],
      role: text(role, "readonly")
    });
  });

  return [...byDisplayName.values()];
}

function projectMemberNames(project = {}) {
  return normalizedProjectMembers(project).map((member) => member.name);
}

function projectMemberRoles(project = {}) {
  return Object.fromEntries(normalizedProjectMembers(project).map((member) => [member.name, text(member.role, "readonly")]));
}

function projectHasUser(project = {}, user = {}) {
  const userIds = new Set(userIdentityValues(user));
  if (!userIds.size) return false;
  return normalizedProjectMembers(project).some((member) => member.identities.some((identity) => userIds.has(identity)));
}

function primaryUserIdentity(user = {}) {
  return userIdentityValues(user)[0] || text(user.name || user.username);
}

function projectComments(project) {
  return projectTasks(project).flatMap((task) => list(task.comments));
}

function getProjects(store) {
  return list(store?.allProjects);
}

function getTasks(projects) {
  return projects.flatMap((project) =>
    projectTasks(project).map((task) => ({
      ...task,
      projectId: projectId(project),
      projectName: project.name,
      projectGroup: groupName(project)
    }))
  );
}

function getCommentEntries(store, projects) {
  if (Array.isArray(store?.adminCommentEntries)) return store.adminCommentEntries;
  return projects.flatMap((project) =>
    projectTasks(project).flatMap((task) =>
      list(task.comments).map((comment, index) => ({
        id: `${project.id}-${task.id}-${comment.time || index}`,
        projectId: project.id,
        projectName: text(project.name, "未命名项目"),
        taskId: task.id,
        taskTitle: text(task.title, "未命名任务"),
        user: text(comment.user, "匿名用户"),
        dept: text(comment.dept),
        time: text(comment.time),
        text: text(comment.text),
        isRisk: /风险|返工|延期|版权|加班|不确定|错误/.test(text(comment.text)),
        matchedRiskWords: []
      }))
    )
  );
}

function groupBy(items, keyFn) {
  return items.reduce((map, item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
}

function topRows(map, mapper, limit = 8) {
  return [...map.entries()]
    .map(([key, rows]) => mapper(key, rows))
    .sort((a, b) => number(b.count) - number(a.count) || text(a.name || a.label).localeCompare(text(b.name || b.label), "zh-Hans"))
    .slice(0, limit);
}

function buildDashboard(store, projects, tasks, comments) {
  const activeProjects = projects.filter((project) => !isArchived(project));
  const archivedProjects = projects.filter(isArchived);
  const activeTasks = tasks.filter((task) => !task.archived);
  const doneTasks = tasks.filter((task) => task.archived);
  const riskComments = comments.filter((comment) => comment.isRisk);
  const stats = store?.adminStats || {};

  return {
    cards: [
      { key: "activeProjects", label: "在做项目", value: number(stats.activeProjects, activeProjects.length), status: "healthy" },
      { key: "activeTasks", label: "待处理任务", value: number(stats.activeTasks, activeTasks.length), status: activeTasks.length ? "warning" : "muted" },
      { key: "riskComments", label: "风险评论", value: riskComments.length, status: riskComments.length ? "danger" : "healthy" },
      { key: "archivedProjects", label: "归档项目", value: number(stats.archivedProjects, archivedProjects.length), status: "archived" }
    ],
    projectHealth: activeProjects.slice(0, 8).map((project) => {
      const rows = projectTasks(project);
      const risky = rows.some((task) => taskModule(store, task).key === "aigc") || list(project.tags).some((tag) => /风险|返工|延期/.test(tag));
      return {
        id: projectId(project),
        name: text(project.name, "未命名项目"),
        group: groupName(project),
        tasks: rows.length,
        comments: projectComments(project).length,
        status: risky ? "danger" : "healthy"
      };
    }),
    recentActivity: comments
      .slice()
      .sort((a, b) => dateValue(b.time) - dateValue(a.time))
      .slice(0, 8)
      .map((comment) => ({
        id: comment.id,
        title: comment.taskTitle,
        subtitle: `${comment.projectName} / ${comment.user}`,
        text: shortText(comment.text, 64),
        time: comment.time,
        status: comment.isRisk ? "danger" : "healthy"
      }))
  };
}

function buildUsers(store, projects) {
  const users = list(store?.users);
  const projectMemberships = groupBy(
    users.flatMap((user) => projects.filter((project) => projectHasUser(project, user)).map((project) => ({ project, user }))),
    (row) => primaryUserIdentity(row.user)
  );
  const rows = users.map((user) => {
    const memberships = projectMemberships.get(primaryUserIdentity(user)) || [];
    return {
      id: user.id,
      name: text(user.name || user.username, "未命名用户"),
      username: text(user.username),
      department: text(user.department, "未分配"),
      role: text(user.role, "user"),
      job: text(user.job),
      email: text(user.email),
      phone: text(user.phone),
      mbti: text(user.mbti),
      status: isArchived(user) ? "archived" : "healthy",
      projectCount: memberships.length,
      registeredAt: text(user.registeredAt)
    };
  });

  return {
    stats: [
      { key: "total", label: "用户总数", value: rows.length },
      { key: "active", label: "启用用户", value: rows.filter((row) => row.status !== "archived").length },
      { key: "archived", label: "离职归档", value: rows.filter((row) => row.status === "archived").length },
      { key: "admins", label: "管理员", value: rows.filter((row) => row.role === "admin").length }
    ],
    rows,
    detailExample: rows[0] || null
  };
}

function buildPermissions(usersPage, projects, boards) {
  const userLookup = new Map(usersPage.rows.flatMap((user) => userIdentityValues(user).map((identity) => [identity, user])));
  const projectRows = projects.flatMap((project) =>
    normalizedProjectMembers(project).map((member) => ({
      id: `${projectId(project)}-${member.name}`,
      user: userLookup.get(member.name)?.name || member.name,
      projectId: projectId(project),
      projectName: text(project.name, "未命名项目"),
      role: text(member.role, "readonly"),
      status: isArchived(project) ? "archived" : "healthy"
    }))
  );
  const boardShares = boards.flatMap((board) =>
    list(board.sharedWith).map((share) => ({
      id: `${board.id}-${share.userId || share.name || share.userName}`,
      user: text(share.name || share.userName || share.userId, "未命名成员"),
      boardId: board.id,
      boardTitle: text(board.title, "未命名画板"),
      role: text(share.role || share.permission, "view"),
      status: board.status === "deleted" ? "archived" : "healthy"
    }))
  );

  return {
    stats: [
      { key: "projectRules", label: "项目权限", value: projectRows.length },
      { key: "boardShares", label: "画板共享", value: boardShares.length },
      { key: "managers", label: "负责人", value: projectRows.filter((row) => row.role === "manager").length },
      { key: "readonly", label: "只读成员", value: projectRows.filter((row) => row.role === "readonly").length }
    ],
    projectRows,
    boardRows: boardShares,
    userMatrix: usersPage.rows.slice(0, 12).map((user) => ({
      id: user.id,
      name: user.name,
      department: user.department,
      projectCount: user.projectCount,
      isAdmin: user.role === "admin"
    }))
  };
}

function buildProjects(projects, tasks, store) {
  const rows = projects.map((project) => {
    const rows = projectTasks(project);
    const done = rows.filter((task) => task.archived).length;
    const risk = rows.some((task) => taskModule(store, task).key === "aigc") || list(project.tags).some((tag) => /风险|返工|延期/.test(tag));
    const members = projectMemberNames(project);
    return {
      id: projectId(project),
      name: text(project.name, "未命名项目"),
      group: groupName(project),
      owner: text(ownerName(project), "未指定"),
      members,
      memberRoles: projectMemberRoles(project),
      memberCount: number(project.memberCount, members.length),
      tags: list(project.tags),
      startDate: text(project.startDate),
      endDate: text(project.endDate),
      taskCount: rows.length,
      doneCount: done,
      progress: rows.length ? Math.round((done / rows.length) * 100) : 0,
      status: isArchived(project) ? "archived" : risk ? "danger" : "healthy"
    };
  });

  return {
    stats: [
      { key: "total", label: "项目总数", value: rows.length },
      { key: "active", label: "进行中", value: rows.filter((row) => row.status !== "archived").length },
      { key: "risk", label: "需关注", value: rows.filter((row) => row.status === "danger").length },
      { key: "tasks", label: "任务总数", value: tasks.length }
    ],
    rows,
    detailExample: rows[0] || null
  };
}

function buildRisk(store, projects, comments) {
  const insight = store?.adminCommentInsights || {};
  const riskComments = list(insight.riskComments).length ? insight.riskComments : comments.filter((comment) => comment.isRisk);
  const riskProjects = projects
    .filter((project) => list(project.tags).some((tag) => /风险|返工|延期/.test(tag)) || projectTasks(project).some((task) => taskModule(store, task).key === "aigc"))
    .map((project) => ({
      id: projectId(project),
      name: text(project.name, "未命名项目"),
      group: groupName(project),
      tags: list(project.tags),
      activeTasks: projectTasks(project).filter((task) => !task.archived).length,
      status: "danger"
    }));

  return {
    stats: [
      { key: "comments", label: "风险评论", value: riskComments.length },
      { key: "projects", label: "风险项目", value: riskProjects.length },
      { key: "words", label: "风险词", value: list(insight.riskWords || store?.adminCommentRiskWords).length },
      { key: "penalty", label: "返工项目", value: projects.filter((project) => list(project.tags).includes("返工")).length }
    ],
    commentRows: riskComments.slice(0, 80),
    projectRows: riskProjects,
    riskWords: list(insight.riskWords || store?.adminCommentRiskWords)
  };
}

function buildSchedules(projects, tasks) {
  const scheduleTasks = tasks.filter((task) => /排期|schedule/i.test(`${task.type || ""} ${task.module || ""}`));
  const rows = projects.map((project) => {
    const scoped = projectTasks(project).filter((task) => /排期|schedule/i.test(`${task.type || ""} ${task.module || ""}`));
    const overdue = scoped.filter((task) => dateValue(task.endDate) && dateValue(task.endDate) < Date.now() && !task.archived).length;
    return {
      id: projectId(project),
      projectName: text(project.name, "未命名项目"),
      startDate: text(project.startDate),
      endDate: text(project.endDate),
      itemCount: scoped.length,
      overdue,
      status: overdue ? "danger" : scoped.length ? "healthy" : "muted"
    };
  });

  return {
    stats: [
      { key: "plans", label: "项目排期", value: rows.filter((row) => row.itemCount).length },
      { key: "items", label: "排期任务", value: scheduleTasks.length },
      { key: "overdue", label: "逾期项", value: rows.reduce((sum, row) => sum + row.overdue, 0) },
      { key: "empty", label: "未建排期", value: rows.filter((row) => !row.itemCount).length }
    ],
    rows,
    detailExample: rows.find((row) => row.itemCount) || rows[0] || null
  };
}

function buildBoards(store, projects) {
  const projectMap = new Map(projects.map((project) => [String(project.id), project]));
  const rows = list(store?.boards).map((board) => {
    const project = projectMap.get(String(board.projectId));
    return {
      id: board.id,
      title: text(board.title, "未命名画板"),
      projectId: board.projectId,
      projectName: text(project?.name, "未绑定项目"),
      owner: text(board.ownerName || board.createdBy, "未指定"),
      shareCount: list(board.sharedWith).length,
      updatedAt: text(board.updatedAt || board.createdAt),
      status: board.status === "deleted" ? "archived" : "healthy"
    };
  });

  return {
    stats: [
      { key: "total", label: "画板总数", value: rows.length },
      { key: "active", label: "可用画板", value: rows.filter((row) => row.status !== "archived").length },
      { key: "shared", label: "共享画板", value: rows.filter((row) => row.shareCount > 0).length },
      { key: "deleted", label: "已删除", value: rows.filter((row) => row.status === "archived").length }
    ],
    rows,
    detailExample: rows[0] || null
  };
}

function buildTemplates(store) {
  const rows = list(store?.templates).map((template) => ({
    id: template.id || template.title,
    title: text(template.title, "未命名模板"),
    kind: text(template.kind, "task"),
    childCount: list(template.children).length,
    taskCount: Object.values(template.templateTasks || {}).reduce((sum, rows) => sum + list(rows).length, 0),
    owner: text(template.ownerName || template.ownerId, "系统"),
    status: template.locked ? "archived" : "healthy"
  }));

  return {
    stats: [
      { key: "total", label: "模板总数", value: rows.length },
      { key: "task", label: "任务模板", value: rows.filter((row) => row.kind !== "schedule").length },
      { key: "schedule", label: "排期模板", value: rows.filter((row) => row.kind === "schedule").length },
      { key: "locked", label: "锁定模板", value: rows.filter((row) => row.status === "archived").length }
    ],
    rows,
    detailExample: rows[0] || null
  };
}

function buildTags(store, projects) {
  const usage = groupBy(
    projects.flatMap((project) => list(project.tags).map((tag) => ({ tag, project }))),
    (row) => row.tag
  );
  const rows = list(store?.tags).map((tag) => {
    const rows = usage.get(tag.name) || [];
    return {
      name: text(tag.name, "未命名标签"),
      color: text(tag.color, "#64748b"),
      count: rows.length,
      projects: rows.map((row) => ({ id: row.project.id, name: text(row.project.name, "未命名项目") })),
      status: rows.length ? "healthy" : "muted"
    };
  });

  return {
    stats: [
      { key: "total", label: "标签总数", value: rows.length },
      { key: "used", label: "已使用", value: rows.filter((row) => row.count > 0).length },
      { key: "unused", label: "未使用", value: rows.filter((row) => row.count === 0).length },
      { key: "links", label: "项目标记", value: rows.reduce((sum, row) => sum + row.count, 0) }
    ],
    rows: rows.sort((a, b) => b.count - a.count),
    topTags: rows.sort((a, b) => b.count - a.count).slice(0, 8)
  };
}

function buildNotices(store) {
  const rows = list(store?.carouselNotices).map((notice) => ({
    id: notice.id,
    title: text(notice.title, "轮播提醒"),
    text: text(notice.text),
    type: text(notice.type, "公告"),
    interval: number(notice.interval, 5500),
    priority: number(notice.priority, 0),
    linkText: text(notice.linkText || notice.payload?.linkText),
    linkUrl: text(notice.linkUrl || notice.payload?.linkUrl),
    linkTarget: text(notice.linkTarget || notice.payload?.linkTarget, "_self"),
    startAt: text(notice.startAt || notice.start_at),
    endAt: text(notice.endAt || notice.end_at),
    enabled: notice.enabled !== false,
    status: notice.enabled === false ? "muted" : "healthy",
    updatedAt: text(notice.updatedAt)
  }));

  return {
    stats: [
      { key: "total", label: "公告总数", value: rows.length },
      { key: "enabled", label: "启用", value: rows.filter((row) => row.enabled).length },
      { key: "disabled", label: "停用", value: rows.filter((row) => !row.enabled).length },
      { key: "avgInterval", label: "平均间隔", value: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.interval, 0) / rows.length) : 0 }
    ],
    rows,
    current: rows.find((row) => row.enabled) || rows[0] || null
  };
}

function buildDepartments(users, projects, tasks) {
  const rows = topRows(
    groupBy(users, (user) => text(user.department, "未分配")),
    (name, departmentUsers) => {
      const names = new Set(departmentUsers.flatMap(userIdentityValues));
      return {
        id: name,
        name,
        count: departmentUsers.length,
        activeUsers: departmentUsers.filter((user) => !isArchived(user)).length,
        projectCount: projects.filter((project) =>
          normalizedProjectMembers(project).some((member) => member.identities.some((identity) => names.has(identity)))
        ).length,
        taskCount: tasks.filter((task) => names.has(task.owner)).length,
        status: departmentUsers.some((user) => !isArchived(user)) ? "healthy" : "archived"
      };
    },
    50
  );

  return {
    stats: [
      { key: "total", label: "部门数", value: rows.length },
      { key: "users", label: "部门用户", value: rows.reduce((sum, row) => sum + row.count, 0) },
      { key: "active", label: "活跃部门", value: rows.filter((row) => row.status !== "archived").length },
      { key: "projects", label: "协作项目", value: rows.reduce((sum, row) => sum + row.projectCount, 0) }
    ],
    rows
  };
}

function buildArchives(projects, users, tasks) {
  const projectRows = projects.filter(isArchived).map((project) => ({
    id: projectId(project),
    name: text(project.name, "未命名项目"),
    group: groupName(project),
    archivedAt: text(project.archivedAt),
    taskCount: projectTasks(project).length,
    status: "archived"
  }));
  const taskRows = tasks.filter((task) => task.archived).map((task) => ({
    id: task.id,
    title: text(task.title, "未命名任务"),
    projectId: task.projectId,
    projectName: text(task.projectName),
    owner: text(task.owner),
    status: "archived"
  }));
  const userRows = users.filter(isArchived).map((user) => ({
    id: user.id,
    name: text(user.name || user.username, "未命名用户"),
    department: text(user.department, "未分配"),
    status: "archived"
  }));

  return {
    stats: [
      { key: "projects", label: "归档项目", value: projectRows.length },
      { key: "tasks", label: "归档任务", value: taskRows.length },
      { key: "users", label: "归档用户", value: userRows.length },
      { key: "total", label: "归档记录", value: projectRows.length + taskRows.length + userRows.length }
    ],
    projectRows,
    taskRows,
    userRows
  };
}

function buildSystem(store, projects, tasks, comments) {
  const source = text(store?.backendSource, "none");
  const loaded = Boolean(store?.backendLoaded);
  const syncRows = [
    { key: "projects", name: "projects", count: projects.length },
    { key: "tasks", name: "tasks", count: tasks.length },
    { key: "comments", name: "comments", count: comments.length },
    { key: "users", name: "users", count: list(store?.users).length },
    { key: "boards", name: "boards", count: list(store?.boards).length },
    { key: "tags", name: "tags", count: list(store?.tags).length }
  ].map((row) => ({
    ...row,
    status: loaded ? "healthy" : source === "none" ? "warning" : "syncing",
    source
  }));

  return {
    status: loaded ? "healthy" : source === "none" ? "warning" : "syncing",
    source,
    loaded,
    syncRows,
    flags: {
      activeSection: text(store?.activeSection),
      activeView: text(store?.activeView),
      activeProjectId: store?.activeProjectId ?? null,
      currentUserId: text(store?.currentUserId)
    }
  };
}

export function buildAdminConsoleModel(store = {}) {
  const projects = getProjects(store);
  const tasks = getTasks(projects);
  const comments = getCommentEntries(store, projects);
  const users = list(store.users);
  const boards = list(store.boards);

  const usersPage = buildUsers(store, projects);

  return {
    nav: ADMIN_NAV,
    statusChips: ADMIN_STATUS_CHIPS,
    dashboard: buildDashboard(store, projects, tasks, comments),
    users: usersPage,
    permissions: buildPermissions(usersPage, projects, boards),
    projects: buildProjects(projects, tasks, store),
    risk: buildRisk(store, projects, comments),
    schedules: buildSchedules(projects, tasks),
    boards: buildBoards(store, projects),
    templates: buildTemplates(store),
    tags: buildTags(store, projects),
    notices: buildNotices(store),
    departments: buildDepartments(users, projects, tasks),
    archives: buildArchives(projects, users, tasks),
    ai: {
      config: AI_CONFIG_DEFAULTS,
      models: AI_MODEL_OPTIONS,
      scopeOptions: AI_SCOPE_OPTIONS,
      documents: AI_DOCUMENTS,
      usageLogs: AI_USAGE_LOGS,
      stats: [
        { key: "enabled", label: "启用状态", value: "等待后端返回", status: "muted" },
        { key: "models", label: "可选模型", value: AI_MODEL_OPTIONS.length, status: "info" },
        { key: "documents", label: "智能资料文档", value: AI_DOCUMENTS.length, status: AI_DOCUMENTS.length ? "healthy" : "muted" },
        { key: "logs", label: "智能使用记录", value: AI_USAGE_LOGS.length, status: AI_USAGE_LOGS.length ? "info" : "muted" }
      ]
    },
    system: buildSystem(store, projects, tasks, comments)
  };
}
