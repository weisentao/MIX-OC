<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import ConsoleShell from "@/features/management-console/components/ConsoleShell.vue";
import ConsoleSection from "@/features/management-console/components/ConsoleSection.vue";
import AiUsageSection from "@/features/management-console/components/AiUsageSection.vue";
import { MANAGER_NAV, buildManagerConsoleModel } from "@/features/management-console/data/managerConsoleData";
import managerApi from "@/services/managerApi";
import { backendSyncToast, isLoginExpiredApiError } from "@/services/apiErrors";
import { handleWorkspaceAuthFailure } from "@/stores/workspace/actions/appActions";

const store = useWorkspaceStore();
const route = useRoute();
const router = useRouter();

const globalSearch = ref("");
const localQuery = ref("");
const activeFilter = ref("all");
const selectedRow = ref(null);
const formOpen = ref(false);
const formMode = ref("create");
const formModel = reactive({});
const tagLibraryOpen = ref(false);

function syncStoredLoginUser() {
  try {
    const user = JSON.parse(localStorage.getItem("xjg_user") || "null");
    if (!user?.id) return;
    const existing = store.getUser?.(user.id);
    if (existing) Object.assign(existing, user);
    else store.users.push(user);
    store.currentUserId = user.id;
    store.ensureCurrentUserTemplateGroups?.();
  } catch {
    localStorage.removeItem("xjg_user");
  }
}

onMounted(async () => {
  if (!store.backendLoaded) await store.loadAppState();
  syncStoredLoginUser();
});

const activeKey = computed(() => String(route.params.section || "overview"));
const model = computed(() => buildManagerConsoleModel(store));
const activeNav = computed(() => MANAGER_NAV.find((item) => item.key === activeKey.value) || MANAGER_NAV[0]);
const page = computed(() => normalizeManagerPage(activeKey.value, model.value[managerDataKey(activeKey.value)], model.value));
const filteredRows = computed(() => filterRows(page.value.rows || []));
const contextItems = computed(() => buildContextItems(activeKey.value, page.value.rows || [], model.value));
const quickFilters = computed(() => page.value.filters.filter((filter) => filter.key !== "all").slice(0, 4));
const selectedDetailLists = computed(() => buildDetailLists(activeKey.value, selectedRow.value));
const currentUser = computed(() => model.value.scope?.user || store.currentUser || {});
const sectionLayout = computed(() => {
  if (activeKey.value === "overview") return "dashboard";
  if (["members", "member-detail", "accounts"].includes(activeKey.value)) return "two-column";
  return "three-column";
});
const showSectionMetrics = computed(() => activeKey.value === "overview");
const dashboardPanels = computed(() => buildManagerDashboardPanels());
const dashboardChartItems = computed(() => buildManagerDashboardChartItems());
const dashboardTrendItems = computed(() => (model.value.projects || []).slice(0, 7).map((row, index) => ({
  key: row.id || index,
  label: row.name || `项目 ${index + 1}`,
  value: row.activeTaskCount || row.taskCount || index + 1,
  tone: row.status || row.managerRole,
  targetSection: "projects",
  targetLabel: "项目"
})));
const userLabel = computed(() => displayUserLabel(currentUser.value, "普通管理"));
const roleLabel = computed(() => roleName(currentUser.value.role || "department_admin"));
const scopeLabel = computed(() => `范围：${model.value.scope?.department || "我的项目"} / 项目 ${model.value.scope?.projectIds?.length || 0}`);
const lastSync = computed(() => `消息 ${model.value.comments?.length || 0}`);
const formTitle = computed(() => `${formMode.value === "edit" ? "编辑" : "新增"}${activeNav.value?.label || "记录"}`);
const formSubmitLabel = computed(() => (formMode.value === "edit" ? "保存修改" : "创建记录"));
const selectedProjectTags = computed(() => (Array.isArray(formModel.tags) ? formModel.tags : []).filter(Boolean));
const availableProjectTags = computed(() =>
  (store.tags || []).filter((tag) => tag?.name && !selectedProjectTags.value.includes(tag.name))
);
const showProjectTagPicker = computed(() => formOpen.value && ["projects", "project-detail", "overview", "department"].includes(activeKey.value));

watch(activeKey, () => {
  activeFilter.value = "all";
  localQuery.value = "";
  selectedRow.value = filteredRows.value[0] || null;
  formOpen.value = false;
  tagLibraryOpen.value = false;
});

watch(
  filteredRows,
  (rows) => {
    if (!rows.length) {
      selectedRow.value = null;
      return;
    }
    const currentKey = selectedRow.value && rowKey(selectedRow.value);
    selectedRow.value = rows.find((row) => rowKey(row) === currentKey) || rows[0];
  },
  { immediate: true }
);

function navigate(sectionKey) {
  router.push({ name: "manager-console", params: { section: sectionKey } });
}

function navigateDashboardChart({ target }) {
  if (!target) return;
  navigate(target);
}

function backToWorkspace() {
  router.push({ name: "workspace" });
}

function numberValue(value) {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function managerDataKey(key) {
  const map = {
    "member-detail": "memberDetail",
    "project-detail": "projectDetail"
  };
  return map[key] || key;
}

function rowKey(row) {
  return row?.id || row?.key || row?.name || row?.title || row?.projectName || row?.taskTitle;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function valueLabel(value, label) {
  return { value, label };
}

function roleName(value) {
  const map = {
    admin: "超级管理员",
    department_admin: "部门管理员",
    department_manager: "部门管理员",
    project_manager: "项目经理",
    manager: "项目管理员",
    editor: "编辑者",
    readonly: "只读成员",
    user: "普通用户",
    member: "成员",
    owner: "拥有者",
    none: "无权限"
  };
  return map[String(value || "").toLowerCase()] || "管理权限";
}

function displayUserLabel(user, fallback) {
  const rawName = String(user?.name || "").trim();
  if (rawName && !/^[a-z0-9_.-]+$/i.test(rawName)) return rawName;
  const rawAccount = String(user?.username || rawName || "").trim().toLowerCase();
  const accountMap = {
    admin: "超级管理员",
    manager: "项目管理员",
    department_admin: "部门管理员",
    department_manager: "部门管理员",
    project_manager: "项目经理",
    editor: "编辑者",
    readonly: "只读成员",
    user: "普通用户"
  };
  return accountMap[rawAccount] || roleName(user?.role || "manager") || fallback;
}

function statusName(value) {
  const map = {
    active: "进行中",
    healthy: "正常",
    warning: "关注",
    danger: "风险",
    archived: "已归档",
    done: "已完成",
    muted: "空闲",
    pending: "待处理"
  };
  return map[String(value || "").toLowerCase()] || "";
}

function filterRows(rows) {
  const sourceRows = asPageRows(rows);
  const search = normalizeText(`${globalSearch.value} ${localQuery.value}`);
  const filter = activeFilter.value;
  return sourceRows.filter((row) => {
    const status = normalizeText(row.status || row.role || row.managerRole || row.currentRole);
    const matchesFilter =
      filter === "all" ||
      status.includes(filter) ||
      (filter === "manage" && /manager|admin/.test(status)) ||
      (filter === "risk" && /danger|risk|风险|逾期/.test(status)) ||
      (filter === "active" && !/archived|done|归档/.test(status));
    if (!matchesFilter) return false;
    if (!search) return true;
    return normalizeText(Object.values(row).flat().join(" ")).includes(search);
  });
}

function commonFilters(rows = []) {
  const sourceRows = asPageRows(rows);
  return [
    { key: "all", label: "全部", count: sourceRows.length },
    { key: "manage", label: "我管理", count: sourceRows.filter((row) => /manager|admin/.test(normalizeText(row.managerRole || row.currentRole || row.role))).length },
    { key: "active", label: "进行中", count: sourceRows.filter((row) => !/archived|done|归档/.test(normalizeText(row.status))).length },
    { key: "risk", label: "风险", count: sourceRows.filter((row) => /danger|risk|风险|逾期/.test(normalizeText(row.status))).length }
  ];
}

function buildContextItems(key, rows = [], fullModel = {}) {
  const sourceRows = asPageRows(rows);
  if (["overview", "projects", "project-detail", "department"].includes(key)) {
    const byGroup = new Map();
    sourceRows.forEach((row) => {
      const group = row.group || row.department || "我的项目";
      byGroup.set(group, (byGroup.get(group) || 0) + 1);
    });
    return [
      { key: "owned", label: "我的负责", count: sourceRows.filter((row) => row.managerRole === "manager").length, filterKey: "manage" },
      { key: "joined", label: "我的参与", count: sourceRows.length, filterKey: "all", active: activeFilter.value === "all" },
      ...[...byGroup.entries()].slice(0, 6).map(([label, count]) => ({ key: label, label, count })),
      { key: "archived", label: "已归档项目", count: fullModel.archives?.projects?.length || 0 }
    ];
  }
  if (["members", "member-detail", "accounts"].includes(key)) {
    const roles = new Map();
    sourceRows.forEach((row) => {
      const role = row.role || "member";
      roles.set(role, (roles.get(role) || 0) + 1);
    });
    return [
      { key: "all", label: "全部成员", count: sourceRows.length, filterKey: "all", active: activeFilter.value === "all" },
      ...[...roles.entries()].slice(0, 6).map(([label, count]) => ({ key: label, label, count })),
      { key: "active", label: "在职成员", count: sourceRows.filter((row) => row.status !== "archived").length, filterKey: "active" }
    ];
  }
  if (key === "permissions") {
    return [
      { key: "manage", label: "我可调权", count: sourceRows.filter((row) => row.canManage).length, filterKey: "manage" },
      { key: "editor", label: "可编辑项目", count: sourceRows.filter((row) => row.canEdit).length },
      { key: "readonly", label: "只读范围", count: sourceRows.filter((row) => row.currentRole === "readonly").length }
    ];
  }
  return [
    { key: "all", label: `全部${activeNav.value?.label || "记录"}`, count: sourceRows.length, filterKey: "all", active: activeFilter.value === "all" },
    { key: "active", label: "进行中", count: sourceRows.filter((row) => !/archived|done|归档/.test(normalizeText(row.status))).length, filterKey: "active" },
    { key: "risk", label: "风险项", count: sourceRows.filter((row) => /danger|risk|风险|逾期/.test(normalizeText(row.status))).length, filterKey: "risk" }
  ];
}

function contextHintFor(key) {
  const hints = {
    overview: "只显示我负责、我参与、本部门可见的项目；不会出现全站超级管理员数据。",
    department: "部门总览聚合本部门成员和项目，组长可在授权范围内调整项目数据。",
    projects: "项目管理员权限等同管理该项目，可编辑项目、任务、成员和标签。",
    "project-detail": "项目详情页围绕单个项目管理任务、成员、排期、画板和模板。",
    members: "成员页仅显示本部门或授权范围内成员，不能授予全局超级管理员权限。",
    permissions: "普通管理端只能分配项目管理员、编辑者、只读成员，边界留给后端二次校验。"
  };
  return hints[key] || "普通管理端所有增删改查都按当前项目或部门范围调用管理端接口。";
}

function normalizeManagerPage(key, value, fullModel) {
  const title = activeNav.value?.label || "总览";
  const rows = pageRows(value);
  const base = {
    title,
    description: "仅展示我的项目、本部门和我负责范围内数据；项目管理员权限可管理该项目。",
    cards: [{ key: "count", label: "记录数", value: rows.length }],
    rows,
    columns: inferColumns(rows),
    filters: commonFilters(rows),
    detailFields: defaultDetailFields(),
    formFields: defaultFormFields(key),
    primaryActionLabel: `新增${title}`,
    rowActions: defaultRowActions(key)
  };

  if (key === "overview") {
    const overview = value || {};
    const overviewRows = fullModel.projects || [];
    return {
      ...base,
      title: "管理端总览",
      description: "仅展示我的项目、本部门和我负责范围内数据。",
      cards: Object.entries(overview).map(([itemKey, itemValue]) => ({ key: itemKey, label: metricLabel(itemKey), value: itemValue })),
      rows: overviewRows,
      columns: projectColumns(),
      filters: commonFilters(overviewRows),
      primaryActionLabel: "新增项目"
    };
  }
  if (key === "department") {
    const deptRows = value?.projects || [];
    return {
      ...base,
      title: "部门总览",
      cards: [
        { key: "members", label: "部门成员", value: value?.members?.length || 0 },
        { key: "projects", label: "部门项目", value: deptRows.length },
        { key: "tasks", label: "部门任务", value: deptRows.reduce((sum, row) => sum + (row.taskCount || 0), 0) }
      ],
      rows: deptRows,
      columns: projectColumns(),
      filters: commonFilters(deptRows)
    };
  }
  if (["members", "member-detail", "accounts"].includes(key)) {
    return {
      ...base,
      title,
      description: "本部门成员资料、项目角色、账号状态和重置记录入口。",
      cards: [
        { key: "members", label: "成员数", value: rows.length },
        { key: "active", label: "在职", value: rows.filter((row) => row.status !== "archived").length },
        { key: "tasks", label: "任务", value: rows.reduce((sum, row) => sum + (row.taskCount || 0), 0) }
      ],
      columns: [
        { key: "name", label: "姓名" },
        { key: "department", label: "部门" },
        { key: "role", label: "角色" },
        { key: "projectCount", label: "项目" },
        { key: "taskCount", label: "任务" },
        { key: "status", label: "状态" }
      ]
    };
  }
  if (["projects", "project-detail"].includes(key)) {
    return {
      ...base,
      title,
      description: "我负责、我参与、本部门可见项目目录。",
      cards: [
        { key: "projects", label: "项目数", value: rows.length },
        { key: "activeTasks", label: "待办任务", value: rows.reduce((sum, row) => sum + (row.activeTaskCount || 0), 0) },
        { key: "managed", label: "可管理", value: rows.filter((row) => row.managerRole === "manager").length }
      ],
      columns: projectColumns(),
      primaryActionLabel: "新增项目"
    };
  }
  if (key === "permissions") {
    return {
      ...base,
      title: "成员权限分配",
      description: "当前范围内只能分配项目管理员、编辑者、只读成员，不能授予超级管理员。",
      cards: [
        { key: "projects", label: "可管理项目", value: rows.filter((row) => row.canManage).length },
        { key: "editable", label: "可编辑项目", value: rows.filter((row) => row.canEdit).length }
      ],
      columns: [
        { key: "projectName", label: "项目" },
        { key: "currentRole", label: "我的角色" },
        { key: "canManage", label: "可调权" },
        { key: "canEdit", label: "可编辑" }
      ],
      primaryActionLabel: "分配权限"
    };
  }
  return base;
}

function asPageRows(value) {
  return Array.isArray(value) ? value : [];
}

function pageRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return [value.projects, value.members, value.tasks, value.accounts].find(Array.isArray) || [];
}

function inferColumns(rows = []) {
  const sample = rows[0] || {};
  return Object.keys(sample)
    .filter((key) => !["members", "tags", "projects", "tasks", "comments", "roles"].includes(key))
    .slice(0, 6)
    .map((key) => ({ key, label: fieldLabel(key) }));
}

function fieldLabel(key) {
  const labels = {
    id: "编号",
    key: "标识",
    name: "名称",
    title: "标题",
    subtitle: "来源",
    text: "内容",
    summary: "摘要",
    description: "说明",
    username: "账号",
    user: "用户",
    userId: "用户编号",
    role: "角色",
    currentRole: "当前角色",
    managerRole: "我的角色",
    status: "状态",
    department: "部门",
    group: "目录",
    email: "邮箱",
    phone: "手机号",
    job: "职位",
    mbti: "性格类型",
    registeredAt: "注册时间",
    projectId: "项目编号",
    projectName: "项目",
    projectCount: "项目数",
    taskId: "任务编号",
    taskTitle: "任务",
    taskCount: "任务数",
    activeTaskCount: "待办数",
    archivedTaskCount: "已完成数",
    doneCount: "完成数",
    commentCount: "评论数",
    owner: "负责人",
    assignee: "执行人",
    startDate: "开始时间",
    endDate: "结束时间",
    updatedAt: "更新时间",
    archivedAt: "归档时间",
    itemCount: "节点数",
    overdue: "逾期",
    progress: "进度",
    source: "数据源",
    count: "数量",
    value: "数值",
    type: "类型",
    interval: "间隔",
    enabled: "启用状态",
    color: "颜色",
    shareCount: "共享数",
    childCount: "子项数",
    kind: "类型",
    boardId: "画板编号",
    boardTitle: "画板",
    permission: "权限",
    canManage: "可调权",
    canEdit: "可编辑"
  };
  return labels[key] || "字段";
}

function projectColumns() {
  return [
    { key: "name", label: "项目" },
    { key: "managerRole", label: "我的角色" },
    { key: "taskCount", label: "任务" },
    { key: "activeTaskCount", label: "待办" },
    { key: "commentCount", label: "评论" },
    { key: "status", label: "状态" }
  ];
}

function metricLabel(key) {
  const labels = {
    activeProjects: "我的项目总数",
    archivedProjects: "归档项目",
    members: "成员",
    tasks: "任务",
    activeTasks: "待完成任务",
    archivedTasks: "已完成任务",
    comments: "评论",
    boards: "画板",
    templates: "模板"
  };
  return labels[key] || "指标";
}

function defaultDetailFields() {
  return [
    { key: "id", label: "编号" },
    { key: "name", label: "名称" },
    { key: "projectName", label: "项目" },
    { key: "managerRole", label: "我的角色" },
    { key: "status", label: "状态" },
    { key: "department", label: "部门" }
  ];
}

function defaultFormFields(key) {
  if (["projects", "project-detail", "overview"].includes(key)) {
    return [
      { key: "name", label: "项目名称" },
      { key: "group", label: "一级目录" },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: [
          valueLabel("active", "进行中"),
          valueLabel("healthy", "正常"),
          valueLabel("warning", "关注"),
          valueLabel("danger", "风险"),
          valueLabel("archived", "已归档")
        ]
      },
      { key: "startDate", label: "开始时间" },
      { key: "endDate", label: "结束时间" }
    ];
  }
  if (["tasks", "schedule"].includes(key)) {
    return [
      { key: "title", label: "任务名称" },
      { key: "projectId", label: "项目编号" },
      { key: "owner", label: "负责人" },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: [
          valueLabel("active", "进行中"),
          valueLabel("warning", "关注"),
          valueLabel("danger", "风险"),
          valueLabel("archived", "已归档")
        ]
      },
      { key: "note", label: "说明", type: "textarea", wide: true }
    ];
  }
  return [
    { key: "name", label: "名称" },
    {
      key: "role",
      label: "角色",
      type: "select",
      options: [
        valueLabel("manager", "项目管理员"),
        valueLabel("editor", "编辑者"),
        valueLabel("readonly", "只读成员")
      ]
    },
    { key: "description", label: "说明", type: "textarea", wide: true }
  ];
}

function defaultRowActions(key) {
  const common = [
    { key: "view", label: "查看", icon: "view" },
    { key: "edit", label: "编辑", icon: "edit" }
  ];
  if (["members", "member-detail", "accounts"].includes(key)) return [...common, { key: "reset", label: "重置", icon: "archive" }];
  if (["overview", "department", "projects", "project-detail"].includes(key)) {
    return [...common, { key: "archive", label: "归档", icon: "archive", tone: "danger" }];
  }
  return common;
}

function buildDetailLists(key, row) {
  if (!row) return [];
  if (["projects", "project-detail", "overview", "department"].includes(key)) {
    return [
      { key: "tasks", title: "任务概览", items: (row.tasks || []).slice(0, 5).map((task) => ({ ...task, label: task.title, meta: statusName(task.status || (task.archived ? "done" : "pending")) })) },
      { key: "members", title: "项目成员", items: (row.members || []).map((name) => ({ label: name, meta: roleName(row.memberRoles?.[name] || "member") })) }
    ];
  }
  if (["members", "member-detail", "accounts"].includes(key)) {
    return [
      { key: "projects", title: "参与项目", items: (row.projects || []).slice(0, 5).map((project) => ({ label: project.name, meta: roleName(project.managerRole || "member") })) },
      { key: "tasks", title: "相关任务", items: (row.tasks || []).slice(0, 5).map((task) => ({ label: task.title, meta: task.projectName })) }
    ];
  }
  return [
    {
      key: "api",
      title: "接口同步",
      items: [
        { label: "读取列表", meta: "管理端列表接口" },
        { label: "更新记录", meta: "管理端编辑接口" }
      ]
    }
  ];
}

function buildManagerDashboardPanels() {
  const projects = model.value.projects || [];
  const tasks = (model.value.tasks || []).slice(0, 5).map((task) => ({
    ...task,
    title: task.title,
    subtitle: task.projectName,
    text: task.owner || task.assignee || "未指定",
    status: task.archived ? "done" : task.status || "active"
  }));
  const comments = (model.value.comments || []).slice(0, 5).map((comment) => ({
    ...comment,
    title: comment.taskTitle || comment.projectName,
    subtitle: comment.projectName,
    text: comment.text || comment.time,
    status: /风险|延期|返工|不确定/.test(comment.text || "") ? "danger" : "healthy"
  }));
  const scheduleRows = (model.value.schedule || []).slice(0, 5).map((item) => ({
    ...item,
    title: item.title || item.projectName,
    subtitle: item.projectName || item.source,
    text: item.endDate || item.startDate || "",
    status: item.status || "active"
  }));
  return [
    {
      key: "projects",
      title: "我的项目进度表",
      description: "只包含我负责或我参与的项目",
      rows: projects.slice(0, 5).map((project) => ({
        ...project,
        title: project.name,
        subtitle: roleName(project.managerRole),
        text: `进度 ${project.taskCount ? Math.round(((project.archivedTaskCount || 0) / project.taskCount) * 100) : 0}%`
      }))
    },
    {
      key: "tasks",
      title: "今日任务列表",
      description: "今日到期与我负责的待办",
      rows: tasks
    },
    {
      key: "comments",
      title: "风险评论提醒",
      description: "仅看我的项目和当前部门范围",
      rows: comments
    },
    {
      key: "schedule",
      title: "最近排期变动",
      description: "当前项目排期、快照和确认节点",
      rows: scheduleRows
    }
  ];
}

function buildManagerDashboardChartItems() {
  const overview = model.value.overview || {};
  const items = [
    { key: "activeProjects", label: "在做项目", value: overview.activeProjects, tone: "healthy", targetSection: "projects", targetLabel: "项目" },
    { key: "archivedProjects", label: "归档项目", value: overview.archivedProjects, tone: "muted", targetSection: "archives", targetLabel: "归档" },
    { key: "members", label: "成员", value: overview.members, tone: "info", targetSection: "members", targetLabel: "成员" },
    { key: "activeTasks", label: "待办任务", value: overview.activeTasks, tone: "warning", targetSection: "tasks", targetLabel: "任务" },
    { key: "archivedTasks", label: "完成任务", value: overview.archivedTasks, tone: "healthy", targetSection: "tasks", targetLabel: "任务" },
    { key: "comments", label: "评论", value: overview.comments, tone: "info", targetSection: "comments", targetLabel: "评论" },
    { key: "boards", label: "画板", value: overview.boards, tone: "syncing", targetSection: "boards", targetLabel: "画板" },
    { key: "templates", label: "模板", value: overview.templates, tone: "muted", targetSection: "templates", targetLabel: "模板" }
  ];
  return items.map((item) => ({
    ...item,
    value: numberValue(item.value)
  }));
}

function resetForm(seed = {}) {
  Object.keys(formModel).forEach((key) => delete formModel[key]);
  page.value.formFields.forEach((field) => {
    formModel[field.key] = seed[field.key] ?? "";
  });
  formModel.tags = Array.isArray(seed.tags) ? [...new Set(seed.tags.filter(Boolean))] : [];
  tagLibraryOpen.value = false;
}

function openCreate() {
  formMode.value = "create";
  resetForm({ status: "active", group: store.activeProject?.group || currentUser.value.department || "我的项目" });
  formOpen.value = true;
}

function openEdit(row) {
  formMode.value = "edit";
  resetForm(row);
  selectedRow.value = row;
  formOpen.value = true;
}

function updateFormField({ key, value }) {
  formModel[key] = value;
}

function selectProjectTag(tag) {
  if (!tag?.name || selectedProjectTags.value.includes(tag.name)) return;
  formModel.tags = selectedProjectTags.value.concat(tag.name);
  tagLibraryOpen.value = false;
}

function removeProjectTag(tagName) {
  formModel.tags = selectedProjectTags.value.filter((name) => name !== tagName);
}

function tagColor(tagName) {
  return store.getTag(tagName).color;
}

function tagLabel(tagName) {
  return store.getTag(tagName).name;
}

function projectPayload(payload) {
  return {
    ...payload,
    tags: selectedProjectTags.value
  };
}

async function callApi(label, requestFactory) {
  try {
    await requestFactory?.();
    store.showToast(`${label}已提交后端接口`);
  } catch (error) {
    console.warn(`[manager-console] ${label} failed`, error);
    if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
    store.showToast(backendSyncToast(error));
    throw error;
  }
}

async function handleCrudSubmit() {
  const key = activeKey.value;
  const payload = { ...formModel };
  if (["projects", "project-detail", "overview", "department"].includes(key)) {
    if (formMode.value === "edit" && selectedRow.value?.id) {
      const found = store.findProjectWithGroup?.(selectedRow.value.id);
      if (found?.project) Object.assign(found.project, projectPayload(payload));
      await callApi("项目更新", () => managerApi.updateProject(selectedRow.value.id, projectPayload(payload)));
    } else {
      const project = {
        id: Date.now(),
        members: [currentUser.value.name || currentUser.value.username || "项目经理"],
        memberRoles: { [currentUser.value.name || currentUser.value.username || "项目经理"]: "manager" },
        tasks: [],
        owner: currentUser.value.name || currentUser.value.username || "项目经理",
        ...projectPayload(payload)
      };
      store.rootProjects.unshift(project);
      await callApi("项目创建", () => managerApi.createProject(project));
    }
  } else if (["tasks", "schedule"].includes(key)) {
    const projectId = payload.projectId || store.activeProjectId || selectedRow.value?.projectId;
    await callApi("任务保存", () =>
      formMode.value === "edit" && selectedRow.value?.id
        ? managerApi.updateTask(selectedRow.value.id, payload)
        : managerApi.createProjectTask(projectId, payload)
    );
  } else {
    await callApi("记录保存", () => managerApi.updateMember(selectedRow.value?.id || currentUser.value.id, payload));
  }
  formOpen.value = false;
  tagLibraryOpen.value = false;
}

async function handleRowAction({ action, row }) {
  if (action === "view") {
    selectedRow.value = row;
    return;
  }
  if (action === "edit") {
    openEdit(row);
    return;
  }
  if (action === "reset") {
    await callApi("账号重置", () => managerApi.resetMemberPassword(row.id, { reason: "manager console" }));
    return;
  }
  if (action === "archive") {
    if (["overview", "department", "projects", "project-detail"].includes(activeKey.value) && row.id) {
      const found = store.findProjectWithGroup?.(row.id);
      if (found?.project) {
        found.project.status = "archived";
        found.project.archivedAt = new Date().toLocaleString("zh-CN", { hour12: false });
      }
      await callApi("项目归档", () => managerApi.archiveProject(row.id, { status: "archived" }));
    } else {
      store.showToast("当前管理页暂不支持归档，已阻止误请求。");
    }
  }
}
</script>

<template>
  <ConsoleShell
    title="普通管理端"
    subtitle="仅展示我的项目、本部门和我负责范围内数据"
    :nav-items="MANAGER_NAV"
    :active-key="activeKey"
    :user-label="userLabel"
    :role-label="roleLabel"
    :scope-label="scopeLabel"
    :last-sync="lastSync"
    search-placeholder="搜索项目 / 任务 / 成员"
    v-model:search="globalSearch"
    @navigate="navigate"
    @back="backToWorkspace"
  >
    <AiUsageSection
      v-if="activeKey === 'ai'"
      :initial-data="model.ai"
      :scope="model.scope"
      :search="globalSearch"
    />
    <div v-else class="console-section-wrap">
      <ConsoleSection
        :title="page.title"
        :description="page.description"
        :cards="page.cards"
        :rows="filteredRows"
        :columns="page.columns"
        :filters="page.filters"
        :active-filter="activeFilter"
        :layout="sectionLayout"
        :show-metrics="showSectionMetrics"
        :dashboard-panels="dashboardPanels"
        :chart-items="dashboardChartItems"
        :trend-items="dashboardTrendItems"
        :show-filters="activeKey !== 'overview'"
        :query="localQuery"
        :selected-row="selectedRow"
        :detail-title="`${page.title}详情`"
        :detail-fields="page.detailFields"
        :detail-lists="selectedDetailLists"
        :context-title="activeKey === 'projects' ? '项目目录' : `${page.title}目录`"
        :context-subtitle="activeKey === 'projects' ? '我的负责、本部门项目' : '普通管理范围提示'"
        :context-items="contextItems"
        :context-hint="contextHintFor(activeKey)"
        :quick-filters="quickFilters"
        :primary-action-label="page.primaryActionLabel"
        :row-actions="page.rowActions"
        :form-open="formOpen"
        :form-title="formTitle"
        :form-fields="page.formFields"
        :form-model="formModel"
        :form-submit-label="formSubmitLabel"
        scope-note="普通管理仅展示授权范围；项目管理员权限等同管理该项目。"
        empty-text="当前范围暂无数据"
        @create="openCreate"
        @refresh="store.showToast('管理端数据已刷新')"
        @filter="activeFilter = $event"
        @update:query="localQuery = $event"
        @select-row="selectedRow = $event"
        @chart-navigate="navigateDashboardChart"
        @row-action="handleRowAction"
        @update-form-field="updateFormField"
        @submit-form="handleCrudSubmit"
        @close-form="formOpen = false"
      />
      <Teleport to="body">
        <div v-if="showProjectTagPicker" class="console-tag-picker">
          <span>标签</span>
          <div class="console-tag-picker-list">
            <button
              v-for="tagName in selectedProjectTags"
              :key="`manager-selected-${tagName}`"
              class="tag-pill active-tag-pill"
              type="button"
              :data-color="tagColor(tagName)"
              title="移除标签"
              @click="removeProjectTag(tagName)"
            >
              {{ tagLabel(tagName) }}
            </button>
            <button
              class="tag-pill"
              type="button"
              title="从标签库选择标签"
              aria-label="从标签库选择标签"
              @click="tagLibraryOpen = !tagLibraryOpen"
            >
              +
            </button>
            <small v-if="!selectedProjectTags.length">暂无标签</small>
          </div>
          <div v-if="tagLibraryOpen" class="active-tag-popover console-tag-picker-popover">
            <button
              v-for="tag in availableProjectTags"
              :key="`manager-library-${tag.name}`"
              class="tag-pill active-tag-pill"
              type="button"
              :data-color="tag.color"
              @click="selectProjectTag(tag)"
            >
              {{ tag.name }}
            </button>
            <span v-if="!availableProjectTags.length">标签库暂无可添加标签</span>
          </div>
        </div>
      </Teleport>
    </div>
  </ConsoleShell>
</template>

<style scoped>
.console-tag-picker {
  position: fixed;
  z-index: 3001;
  left: 50%;
  bottom: calc(50% - 230px);
  width: min(520px, calc(100vw - 40px));
  transform: translateX(-50%);
  display: grid;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -10px 30px rgba(15, 23, 42, 0.08);
}

.console-tag-picker > span {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.console-tag-picker-list {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-height: 28px;
}

.console-tag-picker .tag-pill {
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: #fff;
  cursor: pointer;
}

.console-tag-picker-popover {
  position: absolute;
  right: 16px;
  bottom: 54px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: min(360px, calc(100vw - 48px));
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16);
}
</style>
