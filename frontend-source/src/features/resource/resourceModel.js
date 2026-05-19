const ROLE_SCOPES = {
  super_admin: "company",
  admin: "company",
  manager: "project",
  project_manager: "project",
  department_manager: "department",
  department_admin: "department",
  employee: "self",
  user: "self"
};

const MODULE_DEPARTMENTS = {
  project: "项目管理部",
  aigc: "AIGC",
  design: "美术设计部",
  threeD: "三维动态设计部",
  threed: "三维动态设计部",
  motion: "动效设计部",
  post: "视效包装部",
  delivery: "视效包装部"
};

const FALLBACK_PEOPLE = [
  { id: "resource-design-lead", name: "设计负责人", role: "department_manager", department: "美术设计部", job: "美术组长", capacityDays: 12, avatar: "设" },
  { id: "resource-zhumin", name: "朱敏", role: "project_manager", department: "项目管理部", job: "项目经理", capacityDays: 10, avatar: "朱" },
  { id: "resource-post-a", name: "视效同学 A", role: "employee", department: "视效包装部", job: "视效包装", capacityDays: 10, avatar: "视" },
  { id: "resource-anna", name: "安娜", role: "employee", department: "美术设计部", job: "视觉设计", capacityDays: 10, avatar: "安" }
];

const FALLBACK_PROJECT = {
  id: "resource-project-demo",
  name: "品牌短片人力排布",
  group: "演示项目",
  status: "active",
  startDate: "2026/05/15",
  endDate: "2026/05/24",
  members: ["朱敏", "设计负责人", "安娜", "视效同学 A"],
  memberRoles: { "朱敏": "manager", "设计负责人": "editor", "安娜": "editor", "视效同学 A": "editor" },
  tasks: [
    {
      id: "resource-task-brief",
      title: "需求拆解与排期确认",
      module: "project",
      owner: "项目管理部: 朱敏",
      startDate: "2026/05/15",
      endDate: "2026/05/17",
      scheduleStatus: "done",
      progress: 100,
      archived: false
    },
    {
      id: "resource-task-key-visual",
      title: "主视觉方案设计",
      module: "design",
      owner: "美术设计部: 安娜",
      startDate: "2026/05/16",
      endDate: "2026/05/20",
      scheduleStatus: "doing",
      progress: 65,
      archived: false
    },
    {
      id: "resource-task-style-check",
      title: "风格统筹与风险复核",
      module: "design",
      owner: "美术设计部: 设计负责人",
      startDate: "2026/05/18",
      endDate: "2026/05/22",
      scheduleStatus: "review",
      progress: 75,
      archived: false
    },
    {
      id: "resource-task-final-post",
      title: "成片精修与输出",
      module: "post",
      owner: "视效包装部: 视效同学 A",
      startDate: "2026/05/19",
      endDate: "2026/05/24",
      scheduleStatus: "todo",
      progress: 35,
      archived: false
    }
  ]
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function normalizeId(value) {
  return cleanText(value);
}

function assignIfPresent(target, source = {}, keys = []) {
  keys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) return;
    const value = source[key];
    if (value === undefined || value === null || value === "") return;
    target[key] = value;
  });
  return target;
}

function clonePlain(value) {
  return value && typeof value === "object" ? { ...value } : {};
}

function updateMatchedEntry(list = [], matcher, patch = {}) {
  const index = list.findIndex((entry) => matcher(entry));
  if (index < 0) return false;
  list.splice(index, 1, { ...list[index], ...patch });
  return true;
}

function assignmentIdCandidates(entry = {}) {
  return idCandidates(
    entry.id,
    entry.itemId,
    entry.workItemId,
    entry.scheduleItemId,
    entry.taskUid,
    entry.taskId
  );
}

function taskIdCandidates(entry = {}) {
  return idCandidates(entry.id, entry.taskUid, entry.taskId);
}

function entriesShareId(left = {}, right = {}, idFactory = assignmentIdCandidates) {
  const leftIds = idFactory(left);
  const rightIds = new Set(idFactory(right));
  return leftIds.some((id) => rightIds.has(id));
}

function idCandidates(...values) {
  return values.map((value) => cleanText(value)).filter(Boolean);
}

export function buildAssignmentLinkFields(item = {}, scheduleItem = {}, task = {}) {
  const raw = item?.raw || {};
  const scheduleItemId = normalizeId(
    item.scheduleItemId ||
      item.schedule_item_id ||
      item.itemId ||
      item.item_id ||
      scheduleItem.scheduleItemId ||
      scheduleItem.itemId ||
      scheduleItem.item_uid ||
      scheduleItem.id ||
      raw.scheduleItemId ||
      raw.schedule_item_id ||
      raw.itemId ||
      raw.item_id
  );
  const taskUid = normalizeId(
    item.taskUid ||
      item.task_uid ||
      scheduleItem.taskUid ||
      scheduleItem.task_uid ||
      scheduleItem.payload?.taskUid ||
      scheduleItem.payload?.taskId ||
      task.taskUid ||
      task.task_uid ||
      task.taskId ||
      task.task_id ||
      raw.taskUid ||
      raw.task_uid
  );
  const taskId = normalizeId(item.taskId || item.task_id || task.id || raw.taskId || raw.task_id || taskUid);
  const workItemId = normalizeId(scheduleItemId || taskUid || taskId || item.workItemId || item.work_item_id || item.id || raw.workItemId || raw.work_item_id);
  return {
    workItemId,
    itemId: scheduleItemId || workItemId,
    scheduleItemId: scheduleItemId || workItemId,
    taskId,
    taskUid: taskUid || taskId,
    projectId: normalizeId(item.projectId || item.project_id || scheduleItem.projectId || scheduleItem.project_uid || task.projectId || task.project_uid || raw.projectId || raw.project_id)
  };
}

export function buildAssignmentApiPayload(draft = {}, extras = {}) {
  const payload = {};
  assignIfPresent(payload, draft, [
    "title",
    "project",
    "projectId",
    "projectUid",
    "projectName",
    "startDate",
    "endDate",
    "departmentId",
    "skillText",
    "priority",
    "workItemId",
    "itemId",
    "scheduleItemId",
    "taskId",
    "taskUid"
  ]);
  assignIfPresent(payload, extras, [
    "scope",
    "previewId",
    "assigneeId",
    "assigneeName",
    "personId",
    "userId",
    "candidate",
    "candidates",
    "taskDraft",
    "workItem",
    "scheduleItem",
    "task",
    "forceReason",
    "reason",
    "interaction",
    "source",
    "skillTags"
  ]);
  return payload;
}

export function applyAssignmentWorkspaceSync(storeLike = {}, payload = {}) {
  const scheduleItem = clonePlain(payload.scheduleItem);
  const task = clonePlain(payload.task);
  const applied = {
    scheduleItemApplied: false,
    taskApplied: false
  };

  if (Array.isArray(storeLike.schedulePlan?.items) && Object.keys(scheduleItem).length) {
    const normalizedScheduleItem = {
      ...scheduleItem,
      id: cleanText(scheduleItem.id || scheduleItem.itemId) || cleanText(scheduleItem.taskUid),
      itemId: cleanText(scheduleItem.itemId || scheduleItem.id) || cleanText(scheduleItem.taskUid)
    };
    applied.scheduleItemApplied = updateMatchedEntry(
      storeLike.schedulePlan.items,
      (entry) => entriesShareId(entry, normalizedScheduleItem),
      normalizedScheduleItem
    );
    if (!applied.scheduleItemApplied && normalizedScheduleItem.id) {
      storeLike.schedulePlan.items.push(normalizedScheduleItem);
      applied.scheduleItemApplied = true;
    }
  }

  if (Object.keys(task).length) {
    const normalizedTask = {
      ...task,
      id: cleanText(task.id || task.taskUid || task.taskId),
      taskUid: cleanText(task.taskUid || task.id || task.taskId),
      taskId: cleanText(task.taskId || task.id || task.taskUid)
    };
    const projectLists = [
      ...(Array.isArray(storeLike.rootProjects) ? [storeLike.rootProjects] : []),
      ...(
        Array.isArray(storeLike.projectGroups)
          ? storeLike.projectGroups
              .map((group) => group?.projects)
              .filter(Array.isArray)
          : []
      ),
      ...(Array.isArray(storeLike.allProjects) ? [storeLike.allProjects] : []),
      ...(storeLike.activeProject ? [[storeLike.activeProject]] : [])
    ];

    for (const projects of projectLists) {
      for (const project of projects) {
        if (!Array.isArray(project?.tasks)) continue;
        const changed = updateMatchedEntry(
          project.tasks,
          (entry) => entriesShareId(entry, normalizedTask, taskIdCandidates),
          normalizedTask
        );
        if (changed) applied.taskApplied = true;
      }
    }
  }

  return applied;
}

export function assignmentAdviceFallbackMessage(error = {}) {
  const status = Number(error?.response?.status || error?.status || error?.statusCode || 0);
  const code = normalizeId(error?.response?.data?.code || error?.code);
  if (status === 401) return "智能建议需要重新登录，已使用本地候选人/负载/冲突分析。";
  if (status === 403) return "当前账号缺少智能建议权限，已使用本地候选人/负载/冲突分析。";
  if (status === 503 && code === "HR_AI_KEY_NOT_CONFIGURED") return "人力智能建议服务未配置密钥，已使用本地候选人/负载/冲突分析。";
  if (status === 503) return "人力智能建议服务暂时不可用，已使用本地候选人/负载/冲突分析。";
  return "智能建议接口暂不可用，已使用本地候选人/负载/冲突分析。";
}

export function formatResourceApiFeedback(payload = {}, fallbackMessage = "操作失败") {
  const dataPayload = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const responseData = payload?.response?.data && typeof payload.response.data === "object" ? payload.response.data : {};
  const message = cleanText(
    responseData.message ||
      responseData.error ||
      dataPayload.message ||
      dataPayload.error ||
      payload.message ||
      payload.error ||
      fallbackMessage
  );
  const code = cleanText(responseData.code || dataPayload.code || payload.code);
  return code ? `${message}（${code}）` : message;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueBy(items, keyFactory) {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const key = keyFactory(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

function normalizeDate(value) {
  const text = cleanText(value).replaceAll("-", "/");
  const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
}

function parseDate(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function compareDates(left, right) {
  return normalizeDate(left).localeCompare(normalizeDate(right));
}

function durationDays(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return 0;
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const leftA = parseDate(leftStart);
  const leftB = parseDate(leftEnd);
  const rightA = parseDate(rightStart);
  const rightB = parseDate(rightEnd);
  if (!leftA || !leftB || !rightA || !rightB) return false;
  return leftA.getTime() <= rightB.getTime() && rightA.getTime() <= leftB.getTime();
}

function getCurrentUser(storeLike = {}, explicitUser = null) {
  if (explicitUser) return explicitUser;
  if (storeLike.currentUser) return storeLike.currentUser;
  const users = toArray(storeLike.users);
  if (storeLike.currentUserId) {
    const found = users.find((user) => cleanText(user.id) === cleanText(storeLike.currentUserId));
    if (found) return found;
  }
  return users[0] || null;
}

function isManagementStoreUser(storeLike = {}) {
  const value = storeLike.isManagementUser;
  return typeof value === "function" ? Boolean(value.call(storeLike)) : Boolean(value);
}

function userMatchesManagementProfile(user = {}, storeLike = {}) {
  if (isManagementStoreUser(storeLike)) return true;
  const profile = [user.job, user.department, user.characterLabel, user.profileNote].map(cleanText).join(" ");
  return /项目管理|项目经理|组长|负责人|管理|PMO|manager/i.test(profile);
}

function getProjects(storeLike = {}) {
  const allProjects = toArray(storeLike.allProjects);
  if (allProjects.length) return allProjects;
  const rootProjects = toArray(storeLike.rootProjects);
  const groupProjects = toArray(storeLike.projectGroups).flatMap((group) => toArray(group.projects));
  const activeProject = storeLike.activeProject && !rootProjects.some((project) => project === storeLike.activeProject) ? [storeLike.activeProject] : [];
  return [...rootProjects, ...groupProjects, ...activeProject];
}

function needsFallbackData(storeLike = {}, projects = []) {
  const users = toArray(storeLike.users);
  const taskCount = projects.reduce((sum, project) => sum + toArray(project.tasks).length, 0);
  return users.length < 4 || taskCount < 1;
}

function normalizePerson(user = {}, index = 0) {
  const name = cleanText(user.name || user.username || user.nickname || user.id || `成员${index + 1}`);
  const id = normalizeId(user.id || user.userId || user.uid || `person-${name || index}`);
  return {
    id,
    userId: id,
    name,
    username: cleanText(user.username),
    avatar: cleanText(user.avatar || name.slice(0, 1)),
    role: lower(user.role || "user"),
    department: cleanText(user.department || user.departmentName || "未分组"),
    departmentEn: cleanText(user.departmentEn || user.department_en),
    job: cleanText(user.job || user.title),
    status: cleanText(user.status || "active"),
    capacityDays: Number.isFinite(Number(user.capacityDays || user.capacity_days || user.capacity))
      ? Number(user.capacityDays || user.capacity_days || user.capacity)
      : 10,
    raw: user
  };
}

function personKey(person = {}) {
  return lower(person.name) || lower(person.id);
}

function matchPersonByIdOrName(people = [], value) {
  const target = cleanText(value);
  if (!target) return null;
  const targetLower = lower(target);
  return (
    people.find((person) => lower(person.id) === targetLower || lower(person.userId) === targetLower) ||
    people.find((person) => lower(person.name) === targetLower || lower(person.username) === targetLower) ||
    null
  );
}

function parseOwnerText(owner) {
  const text = cleanText(owner);
  if (!text) return { department: "", name: "" };
  const parts = text.split(/[:：/]/).map(cleanText).filter(Boolean);
  if (parts.length >= 2) return { department: parts[0], name: parts[parts.length - 1] };
  return { department: "", name: parts[0] || text };
}

function moduleDepartment(moduleKey) {
  const key = cleanText(moduleKey);
  return MODULE_DEPARTMENTS[key] || MODULE_DEPARTMENTS[lower(key)] || "";
}

function resolveAssignee(task = {}, people = []) {
  const directId = task.assigneeId || task.assignee_id || task.ownerId || task.owner_id || task.userId || task.user_id;
  const byId = matchPersonByIdOrName(people, directId);
  if (byId) return byId;

  const owner = parseOwnerText(task.assigneeName || task.assignee || task.ownerName || task.owner || task.owner_name);
  const byName = matchPersonByIdOrName(people, owner.name);
  if (byName) return byName;

  return null;
}

function assigneeDepartment(task = {}, assignee = null) {
  const owner = parseOwnerText(task.owner || task.assigneeName || task.assignee || "");
  return assignee?.department || owner.department || moduleDepartment(task.module) || "未分组";
}

function normalizeWorkItem(task = {}, project = {}, index = 0, people = []) {
  const assignee = resolveAssignee(task, people);
  const owner = parseOwnerText(task.owner || task.assigneeName || task.assignee || "");
  const startDate = normalizeDate(task.startDate || task.start_date || task.beginDate || project.startDate);
  const endDate = normalizeDate(task.endDate || task.end_date || task.dueDate || startDate || project.endDate);
  const id = normalizeId(task.workItemId || task.itemId || task.id || `${project.id || "project"}-${index}`);
  const department = assigneeDepartment(task, assignee);
  return {
    id: String(id),
    workItemId: String(id),
    taskId: task.id ?? "",
    projectId: project.id ?? null,
    projectName: cleanText(project.name || "未命名项目"),
    projectGroup: cleanText(project.group || project.groupTitle || ""),
    title: cleanText(task.title || task.name || `任务 ${index + 1}`),
    type: cleanText(task.type || "流程"),
    module: cleanText(task.module || "project"),
    status: cleanText(task.scheduleStatus || task.status || (task.archived ? "done" : "todo")),
    progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : 0,
    startDate,
    endDate,
    durationDays: durationDays(startDate, endDate),
    archived: Boolean(task.archived),
    hidden: Boolean(task.hidden),
    assigneeId: assignee?.id || "",
    assigneeName: assignee?.name || owner.name || "",
    assigneeDepartment: department,
    owner: cleanText(task.owner || (assignee ? `${assignee.department}: ${assignee.name}` : "")),
    source: task.source || "workspace",
    raw: task
  };
}

function normalizeScheduleWorkItems(schedulePlan = {}, activeProject = {}, people = []) {
  return toArray(schedulePlan.items).map((item, index) =>
    normalizeWorkItem(
      {
        ...item,
        id: item.id || item.itemId,
        title: item.title,
        owner: item.owner,
        module: item.module,
        source: "schedule"
      },
      { id: schedulePlan.projectId || activeProject.id, name: schedulePlan.title || activeProject.name, group: activeProject.group },
      index,
      people
    )
  );
}

function buildPeople(storeLike = {}, projects = [], includeFallback = true) {
  const projectMemberNames = projects.flatMap((project) => toArray(project.members));
  const memberPeople = projectMemberNames.map((name) => ({ id: `member-${name}`, name, role: "user", department: "项目成员" }));
  const fallbackPeople = includeFallback ? FALLBACK_PEOPLE : [];
  const currentUser = getCurrentUser(storeLike);
  const currentPeople = currentUser ? [currentUser] : [];
  return uniqueBy([...toArray(storeLike.users), ...currentPeople, ...memberPeople, ...fallbackPeople].map(normalizePerson), personKey).filter(
    (person) => person.status !== "deleted"
  );
}

function buildWorkItems(storeLike = {}, projects = [], people = [], includeArchived = false) {
  const projectItems = projects.flatMap((project) =>
    toArray(project.tasks).map((task, index) => normalizeWorkItem(task, project, index, people))
  );
  const scheduleItems = normalizeScheduleWorkItems(storeLike.schedulePlan, storeLike.activeProject, people);
  const items = uniqueBy([...projectItems, ...scheduleItems], (item) => `${item.source}:${item.projectId}:${item.id}`);
  return items.filter((item) => !item.hidden && (includeArchived || !item.archived));
}

function authorizedProjectIdsFor(user = {}, storeLike = {}, projects = []) {
  const userName = cleanText(user.name || user.username);
  const userId = cleanText(user.id);
  const ids = projects
    .filter((project) => {
      if (!userName && !userId) return false;
      if (toArray(project.members).includes(userName)) return true;
      if (project.memberRoles && Object.hasOwn(project.memberRoles, userName)) return true;
      if (cleanText(project.owner).includes(userName)) return true;
      return cleanText(project.managerId || project.ownerId) === userId;
    })
    .map((project) => project.id);
  if (!ids.length && storeLike.activeProjectId) ids.push(storeLike.activeProjectId);
  return new Set(ids.map((id) => cleanText(id)));
}

function makeScope(permissions, projects = [], storeLike = {}) {
  if (permissions.scope === "project") {
    return {
      type: "project",
      userId: permissions.userId,
      userName: permissions.userName,
      authorizedProjectIds: [...authorizedProjectIdsFor({ id: permissions.userId, name: permissions.userName }, storeLike, projects)]
    };
  }
  return {
    type: permissions.scope,
    userId: permissions.userId,
    userName: permissions.userName,
    department: permissions.department || ""
  };
}

function itemBelongsToPerson(item = {}, person = {}) {
  return cleanText(item.assigneeId) === cleanText(person.id) || cleanText(item.assigneeName) === cleanText(person.name);
}

function filterByPermissions(people = [], workItems = [], permissions = {}, projects = [], storeLike = {}) {
  if (permissions.scope === "company") return { people, workItems };
  if (permissions.scope === "department") {
    const department = cleanText(permissions.department);
    const scopedPeople = people.filter((person) => person.department === department);
    const scopedPersonIds = new Set(scopedPeople.map((person) => person.id));
    const scopedNames = new Set(scopedPeople.map((person) => person.name));
    return {
      people: scopedPeople,
      workItems: workItems.filter(
        (item) =>
          item.assigneeDepartment === department ||
          moduleDepartment(item.module) === department ||
          scopedPersonIds.has(item.assigneeId) ||
          scopedNames.has(item.assigneeName)
      )
    };
  }
  if (permissions.scope === "project") {
    const authorizedProjectIds = authorizedProjectIdsFor({ id: permissions.userId, name: permissions.userName }, storeLike, projects);
    const scopedWorkItems = workItems.filter((item) => authorizedProjectIds.has(cleanText(item.projectId)));
    const scopedPeople = people.filter((person) => {
      if (person.id === permissions.userId) return true;
      return scopedWorkItems.some((item) => itemBelongsToPerson(item, person));
    });
    return { people: scopedPeople, workItems: scopedWorkItems };
  }
  const current = people.find((person) => person.id === permissions.userId || person.name === permissions.userName);
  const scopedPeople = current ? [current] : [];
  return {
    people: scopedPeople,
    workItems: current ? workItems.filter((item) => itemBelongsToPerson(item, current)) : []
  };
}

function rangeFromItems(items = [], projects = []) {
  const dates = [
    ...projects.flatMap((project) => [project.startDate, project.endDate]),
    ...items.flatMap((item) => [item.startDate, item.endDate])
  ]
    .map(normalizeDate)
    .filter(Boolean)
    .sort(compareDates);
  return {
    startDate: dates[0] || "",
    endDate: dates[dates.length - 1] || dates[0] || ""
  };
}

function collectPersonConflicts(person = {}, personItems = []) {
  const conflicts = [];
  for (let leftIndex = 0; leftIndex < personItems.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < personItems.length; rightIndex += 1) {
      const left = personItems[leftIndex];
      const right = personItems[rightIndex];
      if (!rangesOverlap(left.startDate, left.endDate, right.startDate, right.endDate)) continue;
      conflicts.push({
        id: `overlap-${person.id}-${left.id}-${right.id}`,
        type: "overlap",
        severity: "warning",
        personId: person.id,
        personName: person.name,
        department: person.department,
        workItemIds: [left.id, right.id],
        workItemTitles: [left.title, right.title],
        startDate: [left.startDate, right.startDate].sort(compareDates)[1],
        endDate: [left.endDate, right.endDate].sort(compareDates)[0],
        message: `${person.name} 在同一时间段有多个任务`
      });
    }
  }
  return conflicts;
}

function buildAvailability(people = [], workItems = []) {
  const availability = [];
  const conflicts = [];
  people.forEach((person) => {
    const personItems = workItems.filter((item) => itemBelongsToPerson(item, person));
    const workloadDays = personItems.reduce((sum, item) => sum + item.durationDays, 0);
    const capacityDays = Number(person.capacityDays || 10);
    const personConflicts = collectPersonConflicts(person, personItems);
    conflicts.push(...personConflicts);
    availability.push({
      personId: person.id,
      personName: person.name,
      department: person.department,
      assignedWorkItems: personItems.length,
      workloadDays,
      capacityDays,
      availableDays: Math.max(0, capacityDays - workloadDays),
      utilization: capacityDays ? Math.round((workloadDays / capacityDays) * 100) : 0,
      status: workloadDays > capacityDays ? "overloaded" : personItems.length ? "busy" : "available",
      conflicts: personConflicts
    });
  });
  return { availability, conflicts };
}

function buildDepartments(people = [], workItems = [], availability = [], conflicts = []) {
  const names = uniqueBy(
    [
      ...people.map((person) => person.department),
      ...workItems.map((item) => item.assigneeDepartment || moduleDepartment(item.module))
    ]
      .map(cleanText)
      .filter(Boolean),
    (name) => name
  );
  return names.map((name) => {
    const departmentPeople = people.filter((person) => person.department === name);
    const personIds = new Set(departmentPeople.map((person) => person.id));
    const departmentItems = workItems.filter((item) => item.assigneeDepartment === name || personIds.has(item.assigneeId));
    const departmentAvailability = availability.filter((entry) => entry.department === name);
    const workloadDays = departmentAvailability.reduce((sum, entry) => sum + entry.workloadDays, 0);
    const capacityDays = departmentAvailability.reduce((sum, entry) => sum + entry.capacityDays, 0);
    return {
      id: `department-${name}`,
      name,
      peopleCount: departmentPeople.length,
      workItemCount: departmentItems.length,
      assignedWorkItemCount: departmentItems.filter((item) => item.assigneeId || item.assigneeName).length,
      workloadDays,
      capacityDays,
      availableDays: Math.max(0, capacityDays - workloadDays),
      utilization: capacityDays ? Math.round((workloadDays / capacityDays) * 100) : 0,
      conflictCount: conflicts.filter((conflict) => conflict.department === name).length
    };
  });
}

function buildStats(people = [], workItems = [], availability = [], conflicts = [], permissions = {}) {
  const assignedWorkItems = workItems.filter((item) => item.assigneeId || item.assigneeName).length;
  const totalUtilization = availability.reduce((sum, entry) => sum + entry.utilization, 0);
  return {
    scope: permissions.scope || "self",
    totalDepartments: new Set(people.map((person) => person.department)).size,
    totalPeople: people.length,
    totalWorkItems: workItems.length,
    activeWorkItems: workItems.filter((item) => item.status !== "done").length,
    assignedWorkItems,
    unassignedWorkItems: workItems.length - assignedWorkItems,
    overloadedPeople: availability.filter((entry) => entry.status === "overloaded").length,
    conflictCount: conflicts.length,
    averageUtilization: availability.length ? Math.round(totalUtilization / availability.length) : 0
  };
}

function attachPersonRollups(people = [], workItems = [], availability = []) {
  return people.map((person) => {
    const rollup = availability.find((entry) => entry.personId === person.id);
    const personItems = workItems.filter((item) => itemBelongsToPerson(item, person));
    return {
      ...person,
      assignedWorkItems: personItems.length,
      workloadDays: rollup?.workloadDays || 0,
      availableDays: rollup?.availableDays ?? person.capacityDays,
      utilization: rollup?.utilization || 0,
      conflictsCount: rollup?.conflicts?.length || 0,
      currentWorkItems: personItems.map((item) => item.id)
    };
  });
}

function composeSnapshot({ permissions, scope, people, workItems, projects }) {
  const { availability, conflicts } = buildAvailability(people, workItems);
  const rolledPeople = attachPersonRollups(people, workItems, availability);
  const departments = buildDepartments(rolledPeople, workItems, availability, conflicts);
  const stats = buildStats(rolledPeople, workItems, availability, conflicts, permissions);
  return {
    resourcePermissions: permissions,
    permissions,
    scope,
    departments,
    people: rolledPeople,
    workItems,
    availability,
    conflicts,
    stats,
    dateRange: rangeFromItems(workItems, projects)
  };
}

export function resolveResourceRole(user, storeLike = {}) {
  const currentUser = getCurrentUser(storeLike, user) || {};
  const role = lower(currentUser.role || "user");
  let scope = ROLE_SCOPES[role] || "self";
  if (scope === "self" && userMatchesManagementProfile(currentUser, storeLike)) scope = "project";

  const userId = cleanText(currentUser.id || currentUser.userId || storeLike.currentUserId);
  const userName = cleanText(currentUser.name || currentUser.username || "当前用户");
  const department = cleanText(currentUser.department || currentUser.departmentName || "");
  const allowedViews = scope === "company"
    ? ["company", "department", "project", "self"]
    : scope === "department"
      ? ["department", "self"]
      : scope === "project"
        ? ["project", "authorized", "self"]
        : ["self"];

  return {
    role,
    scope,
    userId,
    userName,
    department,
    allowedViews,
    canViewCompany: scope === "company",
    canViewDepartment: ["company", "department"].includes(scope),
    canViewProject: ["company", "department", "project"].includes(scope),
    canViewSelf: true,
    canAssign: ["company", "department", "project"].includes(scope),
    canForceAssign: scope === "company",
    label: scope === "company" ? "公司级" : scope === "department" ? "部门级" : scope === "project" ? "项目授权" : "个人"
  };
}

export function getDefaultResourceView(permissions = {}) {
  if (permissions.scope === "company") return "company";
  if (permissions.scope === "department") return "department";
  if (permissions.scope === "project") return "project";
  return "self";
}

export function canUseResourceView(permissions = {}, viewKey = "", target = {}) {
  const view = cleanText(viewKey);
  if (!view) return false;
  if (permissions.scope === "company") return ["company", "department", "project", "authorized", "self"].includes(view);
  if (permissions.scope === "department") {
    if (view === "self") return !target.personId || cleanText(target.personId) === cleanText(permissions.userId);
    if (view !== "department") return false;
    return !target.department || cleanText(target.department) === cleanText(permissions.department);
  }
  if (permissions.scope === "project") return ["project", "authorized", "self"].includes(view);
  if (view !== "self") return false;
  return !target.personId || cleanText(target.personId) === cleanText(permissions.userId);
}

export function buildLocalResourceSnapshot(storeLike = {}, options = {}) {
  const rawProjects = getProjects(storeLike);
  const includeFallback = options.includeFallback !== false && needsFallbackData(storeLike, rawProjects);
  const projects = includeFallback ? [...rawProjects, FALLBACK_PROJECT] : rawProjects;
  const allPeople = buildPeople(storeLike, projects, includeFallback);
  const allWorkItems = buildWorkItems(storeLike, projects, allPeople, Boolean(options.includeArchived));
  const permissions = resolveResourceRole(options.user || getCurrentUser(storeLike), storeLike);
  const scoped = filterByPermissions(allPeople, allWorkItems, permissions, projects, storeLike);
  const scope = makeScope(permissions, projects, storeLike);

  return composeSnapshot({
    permissions,
    scope,
    people: scoped.people,
    workItems: scoped.workItems,
    projects
  });
}

export function createAssignmentPreview(snapshot = {}, payload = {}) {
  const workItems = toArray(snapshot.workItems);
  const people = toArray(snapshot.people);
  const targetId = cleanText(payload.workItemId || payload.itemId || payload.taskId);
  const workItem = workItems.find((item) => cleanText(item.id) === targetId || cleanText(item.workItemId) === targetId || cleanText(item.taskId) === targetId);
  const assignee = matchPersonByIdOrName(people, payload.assigneeId || payload.assigneeName || payload.assignee);
  if (!workItem || !assignee) {
    return {
      id: `preview-${targetId || "missing"}`,
      allowed: false,
      reason: !workItem ? "work_item_not_found" : "assignee_not_found",
      conflicts: [],
      payload: { ...payload }
    };
  }

  const startDate = normalizeDate(payload.startDate || workItem.startDate);
  const endDate = normalizeDate(payload.endDate || workItem.endDate || startDate);
  const nextItem = {
    ...workItem,
    startDate,
    endDate,
    durationDays: durationDays(startDate, endDate),
    assigneeId: assignee.id,
    assigneeName: assignee.name,
    assigneeDepartment: assignee.department
  };
  const comparableItems = workItems.map((item) => (item.id === workItem.id ? nextItem : item));
  const conflicts = collectPersonConflicts(
    assignee,
    comparableItems.filter((item) => itemBelongsToPerson(item, assignee))
  );

  return {
    id: `preview-${workItem.id}-${assignee.id}`,
    allowed: true,
    requiresForce: conflicts.some((conflict) => conflict.severity === "error"),
    workItem,
    assignee,
    previousAssigneeId: workItem.assigneeId,
    previousAssigneeName: workItem.assigneeName,
    startDate,
    endDate,
    conflicts,
    changes: {
      from: workItem.assigneeName || "未分配",
      to: assignee.name
    },
    payload: { ...payload }
  };
}

export function applyAssignmentResult(snapshot = {}, preview = {}, assigneeId = "") {
  if (!preview?.allowed || !preview.workItem) return snapshot;
  const people = toArray(snapshot.people).map((person) => ({ ...person }));
  const assignee = matchPersonByIdOrName(people, assigneeId || preview.assignee?.id) || preview.assignee;
  if (!assignee) return snapshot;

  const workItems = toArray(snapshot.workItems).map((item) => {
    if (cleanText(item.id) !== cleanText(preview.workItem.id)) return { ...item };
    const startDate = normalizeDate(preview.startDate || item.startDate);
    const endDate = normalizeDate(preview.endDate || item.endDate || startDate);
    return {
      ...item,
      startDate,
      endDate,
      durationDays: durationDays(startDate, endDate),
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      assigneeDepartment: assignee.department,
      owner: `${assignee.department}: ${assignee.name}`
    };
  });

  return composeSnapshot({
    permissions: { ...(snapshot.resourcePermissions || snapshot.permissions || {}) },
    scope: { ...(snapshot.scope || {}) },
    people,
    workItems,
    projects: []
  });
}

export default {
  assignmentAdviceFallbackMessage,
  applyAssignmentWorkspaceSync,
  applyAssignmentResult,
  buildAssignmentLinkFields,
  buildAssignmentApiPayload,
  buildLocalResourceSnapshot,
  canUseResourceView,
  createAssignmentPreview,
  getDefaultResourceView,
  resolveResourceRole
};
