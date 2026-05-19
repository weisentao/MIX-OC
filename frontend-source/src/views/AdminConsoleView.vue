<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import ConsoleShell from "@/features/management-console/components/ConsoleShell.vue";
import ConsoleSection from "@/features/management-console/components/ConsoleSection.vue";
import AiConfigSection from "@/features/management-console/components/AiConfigSection.vue";
import { ADMIN_NAV, buildAdminConsoleModel } from "@/features/management-console/data/adminConsoleData";
import {
  applyNoticeResponseToNotices,
  normalizeLocalNoticePayload,
  removeNoticeById,
  toNoticeInputDateTime,
  upsertNotice
} from "@/features/management-console/noticeAdminModel";
import adminApi from "@/services/adminApi";
import { backendSyncToast, isLoginExpiredApiError } from "@/services/apiErrors";
import { handleWorkspaceAuthFailure } from "@/stores/workspace/actions/appActions";
import { normalizeCarouselNotices } from "@/utils/noticeCarousel";

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
const formSyncStatus = ref("");
const formSubmitting = ref(false);
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
  if (activeKey.value === "notices") await loadAdminNotices();
  if (!store.isAdmin) {
    router.replace({ name: "manager-console" });
  }
});

const activeKey = computed(() => String(route.params.section || "dashboard"));
const model = computed(() => buildAdminConsoleModel(store));
const activeNav = computed(() => ADMIN_NAV.find((item) => item.key === activeKey.value) || ADMIN_NAV[0]);
const rawPage = computed(() => model.value[activeKey.value] || model.value.dashboard);
const page = computed(() => normalizeAdminPage(activeKey.value, rawPage.value));
const filteredRows = computed(() => filterRows(page.value.rows || []));
const contextItems = computed(() => buildContextItems(activeKey.value, page.value.rows || [], rawPage.value));
const quickFilters = computed(() => page.value.filters.filter((filter) => filter.key !== "all").slice(0, 4));
const selectedDetailLists = computed(() => buildDetailLists(activeKey.value, selectedRow.value));
const sectionLayout = computed(() => {
  if (activeKey.value === "dashboard") return "dashboard";
  if (activeKey.value === "users") return "two-column";
  if (activeKey.value === "projects") return "three-column";
  return "three-column";
});
const showSectionMetrics = computed(() => activeKey.value === "dashboard");
const dashboardPanels = computed(() => buildDashboardPanels());
const dashboardSystemCards = computed(() => buildDashboardSystemCards());
const dashboardSystemRows = computed(() => model.value.system?.syncRows || []);
const dashboardChartItems = computed(() => buildDashboardChartItems());
const dashboardTrendItems = computed(() => buildDashboardTrendItems());
const queryPlaceholder = computed(() => queryPlaceholderFor(activeKey.value));
const userLabel = computed(() => {
  const user = store.currentUser || {};
  return displayUserLabel(user, "超级管理员");
});
const roleLabel = computed(() => `${roleName(store.currentUser?.role || "admin")} 权限`);
const scopeLabel = computed(() => "超级管理员·全局管理");
const lastSync = computed(() => `刚刚同步 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
const formTitle = computed(() => `${formMode.value === "edit" ? "编辑" : "新增"}${activeNav.value?.label || "记录"}`);
const formSubmitLabel = computed(() => (formMode.value === "edit" ? "保存修改" : "创建记录"));
const selectedProjectTags = computed(() => (Array.isArray(formModel.tags) ? formModel.tags : []).filter(Boolean));
const availableProjectTags = computed(() =>
  (store.tags || []).filter((tag) => tag?.name && !selectedProjectTags.value.includes(tag.name))
);
const showProjectTagPicker = computed(() => formOpen.value && activeKey.value === "projects");

watch(activeKey, () => {
  activeFilter.value = "all";
  localQuery.value = "";
  selectedRow.value = filteredRows.value[0] || null;
  formOpen.value = false;
  formSyncStatus.value = "";
  tagLibraryOpen.value = false;
  if (activeKey.value === "notices") loadAdminNotices();
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
  router.push({ name: "admin-console", params: { section: sectionKey } });
}

function navigateDashboardChart({ target }) {
  if (!target) return;
  navigate(target);
}

function backToWorkspace() {
  router.push({ name: "workspace" });
}

function rowKey(row) {
  return row?.id || row?.key || row?.name || row?.title || row?.projectName || row?.taskTitle;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function sourceLabel(value) {
  const map = {
    local: "本地数据",
    api: "后端接口",
    remote: "后端接口",
    none: "未接入",
    workspace: "工作台数据",
    bootstrap: "启动数据"
  };
  return map[String(value || "local").toLowerCase()] || "本地数据";
}

function roleName(value) {
  const map = {
    admin: "超级管理员",
    manager: "项目管理员",
    employee: "普通员工",
    editor: "编辑者",
    readonly: "只读成员",
    user: "普通用户",
    member: "成员",
    owner: "拥有者"
  };
  return map[String(value || "").toLowerCase()] || "未分配角色";
}

function displayUserLabel(user, fallback) {
  const rawName = String(user?.name || "").trim();
  if (rawName && !/^[a-z0-9_.-]+$/i.test(rawName)) return rawName;
  const rawAccount = String(user?.username || rawName || "").trim().toLowerCase();
  const accountMap = {
    admin: "超级管理员",
    manager: "项目管理员",
    employee: "普通员工",
    editor: "编辑者",
    readonly: "只读成员",
    user: "普通用户"
  };
  return accountMap[rawAccount] || roleName(user?.role || "admin") || fallback;
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
    syncing: "同步中",
    pending: "待处理"
  };
  return map[String(value || "").toLowerCase()] || "";
}

function valueLabel(value, label) {
  return { value, label };
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return toNumber(value).toLocaleString("zh-CN");
}

function compactText(value, max = 22) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3))}...`;
}

function dateShort(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, "").replace(/^2026-/, "");
}

function maskPhone(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function queryPlaceholderFor(key) {
  if (key === "users") return "搜索姓名 / 账号 / 邮箱";
  if (key === "projects") return "搜索项目 / 目录 / 标签";
  if (key === "notices") return "搜索公告标题 / 正文 / 链接";
  if (key === "dashboard") return "搜索后台事项";
  return "搜索当前列表";
}

function filterRows(rows) {
  const search = normalizeText(`${globalSearch.value} ${localQuery.value}`);
  const filter = activeFilter.value;
  return rows.filter((row) => {
    const status = normalizeText(row.status || row.role || row.managerRole || row.currentRole);
    const filterText = normalizeText(filter);
    const tags = asList(row.tags).map(normalizeText);
    const matchesFilter =
      filterText === "all" ||
      /_all$/.test(filterText) ||
      status.includes(filterText) ||
      (filterText.startsWith("role:") && normalizeText(row.role || row.managerRole || row.currentRole) === filterText.slice(5)) ||
      (filterText.startsWith("department:") && normalizeText(row.department) === filterText.slice(11)) ||
      (filterText.startsWith("group:") && normalizeText(row.group) === filterText.slice(6)) ||
      (filterText.startsWith("owner:") && normalizeText(row.owner) === filterText.slice(6)) ||
      (filterText.startsWith("type:") && normalizeText(row.type) === filterText.slice(5)) ||
      (filterText.startsWith("tag:") && tags.includes(filterText.slice(4))) ||
      (filterText === "active" && !/archived|done|muted|disabled|归档|停用|空闲/.test(status)) ||
      (filterText === "archived" && /archived|done|muted|disabled|归档|停用|空闲/.test(status)) ||
      (filterText === "risk" && /danger|risk|风险|逾期/.test(status));
    if (!matchesFilter) return false;
    if (!search) return true;
    return normalizeText(Object.values(row).flat().join(" ")).includes(search);
  });
}

function commonFilters(rows = []) {
  return [
    { key: "all", label: "全部", count: rows.length },
    { key: "active", label: "进行中", count: rows.filter((row) => !/archived|done|muted|disabled|归档|停用|空闲/.test(normalizeText(row.status))).length },
    { key: "risk", label: "风险", count: rows.filter((row) => /danger|risk|风险|逾期/.test(normalizeText(row.status))).length },
    { key: "archived", label: "归档", count: rows.filter((row) => /archived|done|归档/.test(normalizeText(row.status))).length }
  ];
}

function pageFilters(key, rows = []) {
  if (key === "notices") {
    return [
      { key: "all", label: "全部公告", count: rows.length },
      { key: "active", label: "启用", count: rows.filter((row) => row.status !== "disabled").length },
      { key: "archived", label: "停用", count: rows.filter((row) => row.status === "disabled").length },
      ...topCountFilters(rows, "type", "类型", 1)
    ];
  }
  if (key === "users") {
    return [
      { key: "all", label: `全部用户`, count: rows.length },
      { key: "active", label: "在职用户", count: rows.filter((row) => row.status !== "archived").length },
      { key: "archived", label: "归档用户", count: rows.filter((row) => row.status === "archived").length },
      ...topCountFilters(rows, "department", "部门", 3),
      ...topCountFilters(rows, "role", "角色", 3)
    ];
  }
  if (key === "projects") {
    return [
      { key: "all", label: "状态：全部", count: undefined },
      { key: "risk", label: "风险", count: rows.filter((row) => /danger|risk|风险/.test(normalizeText(row.status))).length },
      { key: "archived", label: "归档清理", count: rows.filter((row) => row.status === "archived").length },
      ...topCountFilters(rows, "owner", "负责人", 1)
    ];
  }
  return commonFilters(rows);
}

function topCountFilters(rows = [], field, label, limit = 2) {
  const prefixMap = {
    department: "department:",
    role: "role:",
    group: "group:",
    owner: "owner:",
    tags: "tag:",
    type: "type:"
  };
  const counts = new Map();
  rows.forEach((row) => {
    const values = field === "tags" ? asList(row.tags) : [row[field]];
    values.forEach((value) => {
      const text = String(value || "").trim();
      if (!text) return;
      counts.set(text, (counts.get(text) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans"))
    .slice(0, limit)
    .map(([value, count]) => ({
      key: `${prefixMap[field] || `${field}:`}${normalizeText(value)}`,
      label: `${label}：${compactText(field === "role" ? roleName(value) : value, field === "department" ? 10 : 8)}`,
      count
    }));
}

function buildContextItems(key, rows = [], source = {}) {
  if (key === "dashboard") {
    return [
      { key: "all", label: "全部后台事项", count: rows.length, filterKey: "all", active: activeFilter.value === "all" },
      { key: "risk", label: "风险评论", count: rows.filter((row) => /danger|risk|风险|逾期/.test(normalizeText(row.status))).length, filterKey: "risk" },
      { key: "active", label: "在做项目", count: model.value.projects?.rows?.filter((row) => row.status !== "archived").length || 0, filterKey: "active" },
      { key: "system", label: "系统审计", count: model.value.system?.syncRows?.length || 0 }
    ];
  }
  if (key === "projects") {
    const groups = new Map();
    rows.forEach((row) => {
      const group = row.group || "未分组项目";
      groups.set(group, (groups.get(group) || 0) + 1);
    });
    return [
      { key: "all", label: "全部项目", count: rows.length, filterKey: "all", active: activeFilter.value === "all" },
      ...[...groups.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans"))
        .slice(0, 7)
        .map(([label, count]) => ({ key: label, label, count, filterKey: `group:${normalizeText(label)}` })),
      { key: "archived", label: "已归档项目", count: model.value.archives?.projectRows?.length || 0, filterKey: "archived" }
    ];
  }
  if (key === "users") {
    const departments = new Map();
    rows.forEach((row) => {
      const department = row.department || "未分配部门";
      departments.set(department, (departments.get(department) || 0) + 1);
    });
    return [
      { key: "all", label: "全部用户", count: rows.length, filterKey: "all", active: activeFilter.value === "all" },
      ...[...departments.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans"))
        .slice(0, 7)
        .map(([label, count]) => ({ key: label, label, count, filterKey: `department:${normalizeText(label)}` })),
      { key: "archived", label: "归档账号", count: rows.filter((row) => row.status === "archived").length, filterKey: "archived" }
    ];
  }
  if (key === "permissions") {
    return [
      { key: "all", label: "全部授权", count: rows.length, filterKey: "all", active: activeFilter.value === "all" },
      { key: "manager", label: "项目管理员", count: rows.filter((row) => row.role === "manager").length },
      { key: "editor", label: "编辑者", count: rows.filter((row) => row.role === "editor").length },
      { key: "readonly", label: "只读成员", count: rows.filter((row) => row.role === "readonly").length }
    ];
  }
  if (key === "risk") {
    return [
      { key: "risk", label: "风险评论", count: rows.length, filterKey: "risk", active: true },
      ...(source.riskWords || []).slice(0, 6).map((word) => ({ key: word, label: word, count: "" }))
    ];
  }
  return [
    { key: "all", label: `全部${activeNav.value?.label || "记录"}`, count: rows.length, filterKey: "all", active: activeFilter.value === "all" },
    { key: "active", label: "进行中", count: rows.filter((row) => !/archived|done|muted|disabled|归档|停用|空闲/.test(normalizeText(row.status))).length, filterKey: "active" },
    { key: "archived", label: "已归档", count: rows.filter((row) => /archived|done|归档/.test(normalizeText(row.status))).length, filterKey: "archived" }
  ];
}

function contextHintFor(key) {
  const hints = {
    dashboard: "超级管理员显示全局项目、任务、评论、用户与系统同步状态；这里只放已接入工作台的数据。",
    users: "用户管理可新增、编辑、归档账号；正式后端接管理员用户系列接口。",
    permissions: "超级管理员可管理全局权限；普通管理端只能管理授权项目内的成员角色。",
    projects: "一级目录与项目列表同步工作台项目；项目成员、标签、起止时间都留有后端字段。",
    risk: "风险页聚合评论关键词、延期和返工信号；点击行可定位到项目任务。",
    schedules: "排期页只显示已接入排期数据，后端可按项目维度返回节点和逾期状态。",
    notices: "公告支持正文、跳转文案、目标地址和打开方式；删除动作按后端契约以 enabled=false 停用。"
  };
  return hints[key] || "当前页可执行创建、更新、归档、删除操作；后端接口可用时会自动同步数据。";
}

function normalizeAdminPage(key, pageData = {}) {
  const title = activeNav.value?.label || "总览";
  const sourceRows = pageData.rows || pageData.recentActivity || pageData.projectHealth || pageData.projectRows || pageData.commentRows || pageData.syncRows || [];
  const base = {
    title,
    description: "全局管理后台，数据来自工作台，操作会尝试同步到管理员接口。",
    cards: pageData.cards || pageData.stats || [],
    rows: sourceRows,
    columns: inferColumns(sourceRows),
    detailFields: defaultDetailFields(),
    formFields: defaultFormFields(key),
    filters: pageFilters(key, sourceRows),
    primaryActionLabel: `新增${title}`,
    rowActions: defaultRowActions(key)
  };

  const config = {
    dashboard: {
      title: "后台总览",
      description: "管理员全局视图，仅展示已实现的后台数据范围。",
      cards: buildDashboardCards(),
      rows: pageData.recentActivity || pageData.projectHealth || [],
      columns: [
        { key: "title", label: "事项" },
        { key: "subtitle", label: "来源" },
        { key: "text", label: "摘要" },
        { key: "time", label: "时间" }
      ],
      primaryActionLabel: "刷新总览",
      rowActions: [{ key: "view", label: "定位", icon: "view" }]
    },
    users: {
      title: "用户管理",
      description: "用户列表、归档状态、角色筛选与右侧详情抽屉。",
      rows: buildUserRows(pageData.rows || []),
      filters: pageFilters("users", buildUserRows(pageData.rows || [])),
      columns: [
        { key: "avatar", label: "头像" },
        { key: "name", label: "姓名" },
        { key: "username", label: "账号" },
        { key: "roleLabel", label: "角色" },
        { key: "status", label: "状态" },
        { key: "department", label: "部门" },
        { key: "job", label: "职位" },
        { key: "email", label: "邮箱" },
        { key: "phoneMasked", label: "手机号" },
        { key: "mbti", label: "性格类型" },
        { key: "registeredAtShort", label: "注册" }
      ],
      detailFields: [
        { key: "username", label: "账号" },
        { key: "department", label: "部门" },
        { key: "job", label: "职位" },
        { key: "email", label: "邮箱" },
        { key: "phoneMasked", label: "手机号" },
        { key: "mbti", label: "性格类型" },
        { key: "registeredAtShort", label: "注册时间" }
      ],
      primaryActionLabel: "新增用户",
      rowActions: [
        { key: "view", label: "主页", icon: "view" },
        { key: "edit", label: "权限", icon: "edit" },
        { key: "archive", label: "归档", icon: "delete", tone: "danger" }
      ]
    },
    permissions: {
      title: "权限管理",
      description: "超级管理员管全局；项目管理员、编辑者、只读成员按项目范围授权。",
      rows: pageData.projectRows || pageData.userMatrix || [],
      columns: [
        { key: "user", label: "成员" },
        { key: "projectName", label: "项目" },
        { key: "role", label: "项目角色" },
        { key: "status", label: "状态" }
      ],
      primaryActionLabel: "新增授权"
    },
    projects: {
      title: "项目管理",
      description: "全站项目目录、成员、任务数、风险状态与项目详情入口。",
      rows: buildProjectRows(pageData.rows || []),
      filters: pageFilters("projects", buildProjectRows(pageData.rows || [])),
      columns: [
        { key: "name", label: "项目名称" },
        { key: "group", label: "一级目录" },
        { key: "status", label: "状态" },
        { key: "tagsLabel", label: "标签" },
        { key: "owner", label: "负责人" },
        { key: "memberCount", label: "成员" },
        { key: "pendingCount", label: "待办" },
        { key: "doneCount", label: "完成" },
        { key: "commentCount", label: "评论" },
        { key: "dateRange", label: "起止时间" },
        { key: "archivedAtShort", label: "归档" }
      ],
      detailFields: [
        { key: "group", label: "一级目录" },
        { key: "owner", label: "负责人" },
        { key: "memberCountLabel", label: "成员数" },
        { key: "pendingLabel", label: "待完成" },
        { key: "doneLabel", label: "已完成" },
        { key: "commentLabel", label: "评论数" },
        { key: "dateRange", label: "起止时间" }
      ],
      primaryActionLabel: "新增项目"
    },
    risk: {
      title: "任务与评论风险",
      description: "风险词、返工、延期与可定位的风险评论。",
      rows: pageData.commentRows || [],
      columns: [
        { key: "projectName", label: "项目" },
        { key: "taskTitle", label: "任务" },
        { key: "user", label: "评论人" },
        { key: "text", label: "评论" },
        { key: "time", label: "时间" }
      ],
      primaryActionLabel: "新增规则"
    },
    schedules: {
      title: "排期管理",
      description: "全站项目排期、逾期项、快照与排期入口。",
      rows: pageData.rows || [],
      columns: [
        { key: "projectName", label: "项目" },
        { key: "startDate", label: "开始" },
        { key: "endDate", label: "结束" },
        { key: "itemCount", label: "节点" },
        { key: "overdue", label: "逾期" },
        { key: "status", label: "状态" }
      ],
      primaryActionLabel: "新增排期"
    },
    notices: {
      title: "公告管理",
      description: "维护工作台顶部公告：正文、跳转文案、目标地址、打开方式和启停状态。",
      rows: buildNoticeRows(pageData.rows || []),
      filters: pageFilters("notices", buildNoticeRows(pageData.rows || [])),
      columns: [
        { key: "title", label: "标题" },
        { key: "text", label: "正文" },
        { key: "type", label: "类型" },
        { key: "linkText", label: "链接文案" },
        { key: "linkUrl", label: "目标地址" },
        { key: "targetLabel", label: "打开方式" },
        { key: "priority", label: "优先级" },
        { key: "windowLabel", label: "时间窗口" },
        { key: "intervalLabel", label: "轮播间隔" },
        { key: "status", label: "状态" },
        { key: "updatedAt", label: "更新时间" }
      ],
      detailFields: [
        { key: "title", label: "标题" },
        { key: "text", label: "公告正文" },
        { key: "linkText", label: "链接文案" },
        { key: "linkUrl", label: "目标地址" },
        { key: "targetLabel", label: "打开方式" },
        { key: "priority", label: "优先级" },
        { key: "windowLabel", label: "时间窗口" },
        { key: "intervalLabel", label: "轮播间隔" },
        { key: "updatedAt", label: "更新时间" }
      ],
      primaryActionLabel: "新增公告",
      rowActions: [
        { key: "view", label: "查看", icon: "view" },
        { key: "edit", label: "编辑", icon: "edit" },
        { key: "toggle", label: "启停", icon: "edit" },
        { key: "delete", label: "删除", icon: "delete", tone: "danger" }
      ]
    }
  };

  return { ...base, ...(config[key] || {}) };
}

function inferColumns(rows = []) {
  const sample = rows[0] || {};
  return Object.keys(sample)
    .filter((key) => !["members", "tags", "projects", "comments", "matchedRiskWords"].includes(key))
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
    startDate: "开始时间",
    endDate: "结束时间",
    updatedAt: "更新时间",
    linkText: "链接文案",
    linkUrl: "目标地址",
    linkTarget: "打开方式",
    targetLabel: "打开方式",
    intervalLabel: "轮播间隔",
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
    canManage: "可管理",
    canEdit: "可编辑"
  };
  return labels[key] || "字段";
}

function defaultDetailFields() {
  return [
    { key: "id", label: "编号" },
    { key: "name", label: "名称" },
    { key: "status", label: "状态" },
    { key: "projectName", label: "项目" },
    { key: "owner", label: "负责人" },
    { key: "updatedAt", label: "更新时间" }
  ];
}

function defaultFormFields(key) {
  if (key === "users") {
    return [
      { key: "name", label: "姓名" },
      { key: "username", label: "账号" },
      {
        key: "role",
        label: "角色",
        type: "select",
        options: [
          valueLabel("admin", "超级管理员"),
          valueLabel("manager", "项目管理员"),
          valueLabel("employee", "普通员工")
        ]
      },
      { key: "department", label: "部门" },
      { key: "job", label: "职位" },
      { key: "email", label: "邮箱", type: "email", wide: true }
    ];
  }
  if (key === "projects") {
    return [
      { key: "name", label: "项目名称" },
      { key: "group", label: "一级目录" },
      { key: "owner", label: "负责人" },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: [
          valueLabel("active", "进行中"),
          valueLabel("healthy", "正常"),
          valueLabel("danger", "风险"),
          valueLabel("archived", "已归档")
        ]
      },
      { key: "startDate", label: "开始时间" },
      { key: "endDate", label: "结束时间" }
    ];
  }
  if (key === "notices") {
    return [
      { key: "title", label: "公告标题" },
      { key: "type", label: "类型" },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: [
          valueLabel("active", "启用"),
          valueLabel("disabled", "停用")
        ]
      },
      {
        key: "linkTarget",
        label: "打开方式",
        type: "select",
        options: [
          valueLabel("_self", "当前页"),
          valueLabel("_blank", "新窗口")
        ]
      },
      { key: "text", label: "公告正文", type: "textarea", wide: true },
      { key: "linkText", label: "链接文案（如：报表）" },
      { key: "linkUrl", label: "目标地址", wide: true },
      { key: "priority", label: "优先级", type: "number" },
      { key: "startAt", label: "开始时间", type: "datetime-local" },
      { key: "endAt", label: "结束时间", type: "datetime-local" },
      { key: "interval", label: "轮播间隔（毫秒）", type: "number" }
    ];
  }
  return [
    { key: "name", label: "名称" },
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
    { key: "description", label: "说明", type: "textarea", wide: true }
  ];
}

function defaultRowActions(key) {
  if (key === "dashboard") return [{ key: "view", label: "定位", icon: "view" }];
  if (key === "projects") {
    return [
      { key: "view", label: "主页", icon: "view" },
      { key: "edit", label: "编辑", icon: "edit" },
      { key: "archive", label: "归档", icon: "delete", tone: "danger" },
      { key: "delete", label: "永久删除", icon: "delete", tone: "danger" }
    ];
  }
  if (key === "users" || key === "notices") {
    return [
      { key: "view", label: "主页", icon: "view" },
      { key: "edit", label: "编辑", icon: "edit" },
      { key: "archive", label: key === "notices" ? "停用" : "归档", icon: "delete", tone: "danger" }
    ];
  }
  return [
    { key: "view", label: "主页", icon: "view" },
    { key: "edit", label: "编辑", icon: "edit" }
  ];
}

function buildDashboardCards() {
  const dashboard = model.value.dashboard || {};
  const projects = model.value.projects?.rows || [];
  const users = model.value.users?.rows || [];
  const systemRows = model.value.system?.syncRows || [];
  const activeProjects = projects.filter((row) => row.status !== "archived").length;
  const archivedProjects = projects.filter((row) => row.status === "archived").length;
  const riskProjects = projects.filter((row) => row.status === "danger").length;
  const pendingTasks = projects.reduce((sum, row) => sum + Math.max(0, toNumber(row.taskCount) - toNumber(row.doneCount)), 0);
  const doneTasks = projects.reduce((sum, row) => sum + toNumber(row.doneCount), 0);
  const comments = systemRows.find((row) => row.key === "comments")?.count ?? 0;
  const riskComments = model.value.risk?.commentRows?.length ?? dashboard.cards?.find((card) => card.key === "riskComments")?.value ?? 0;
  const syncTotal = systemRows.reduce((sum, row) => sum + toNumber(row.count), 0);
  const syncDone = systemRows.filter((row) => /healthy|syncing/.test(String(row.status || ""))).length;

  return [
    { key: "activeProjects", label: "在做项目", value: formatNumber(activeProjects), description: "未归档项目", status: "healthy", icon: "在" },
    { key: "archivedProjects", label: "归档项目", value: formatNumber(archivedProjects), description: "可恢复或永久删除", status: "archived", icon: "归" },
    { key: "riskProjects", label: "危险项目", value: formatNumber(riskProjects), description: "智能生成模块风险任务", status: riskProjects ? "danger" : "healthy", icon: "险" },
    { key: "pendingTasks", label: "待完成任务", value: formatNumber(pendingTasks), description: "未归档任务总量", status: pendingTasks ? "warning" : "muted", icon: "待" },
    { key: "doneTasks", label: "已完成任务", value: formatNumber(doneTasks), description: "已归档完成任务", status: "healthy", icon: "成" },
    { key: "comments", label: "评论总数", value: formatNumber(comments), description: "任务与排期评论", status: "info", icon: "评" },
    { key: "riskComments", label: "风险评论", value: formatNumber(riskComments), description: "命中风险词", status: riskComments ? "danger" : "healthy", icon: "险" },
    { key: "users", label: "用户数", value: formatNumber(users.length), description: `在职 ${users.filter((row) => row.status !== "archived").length} / 归档 ${users.filter((row) => row.status === "archived").length}`, status: "info", icon: "用" },
    { key: "sync", label: "同步状态", value: `${syncDone}/${Math.max(systemRows.length, 1)}`, description: "项目 / 任务 / 评论 / 用户", status: model.value.system?.status || "syncing", icon: "同" },
    { key: "database", label: "同步与数据库", value: store.backendLoaded ? "健康" : "待接入", description: `${formatNumber(syncTotal)} 条同步对象`, status: store.backendLoaded ? "healthy" : "warning", icon: "库" }
  ];
}

function buildDashboardChartItems() {
  const cards = buildDashboardCards();
  const targets = {
    activeProjects: "projects",
    archivedProjects: "archives",
    riskProjects: "risk",
    pendingTasks: "schedules",
    doneTasks: "schedules",
    comments: "risk",
    riskComments: "risk",
    users: "users"
  };
  const targetLabels = {
    projects: "项目",
    archives: "归档",
    risk: "风险",
    schedules: "排期",
    users: "用户"
  };
  return cards
    .filter((card) => !["sync", "database"].includes(card.key))
    .map((card) => ({
      key: card.key,
      label: card.label,
      value: toNumber(card.value),
      tone: card.status,
      targetSection: targets[card.key] || "dashboard",
      targetLabel: targetLabels[targets[card.key]] || "总览"
    }));
}

function buildDashboardTrendItems() {
  const projects = model.value.projects?.rows || [];
  const recent = model.value.dashboard?.recentActivity || [];
  const systemRows = model.value.system?.syncRows || [];
  const buckets = [
    { key: "projects", label: "项目", value: projects.length, tone: "healthy", targetSection: "projects", targetLabel: "项目" },
    { key: "pending", label: "待办", value: projects.reduce((sum, row) => sum + Math.max(0, toNumber(row.taskCount) - toNumber(row.doneCount)), 0), tone: "warning", targetSection: "schedules", targetLabel: "排期" },
    { key: "done", label: "完成", value: projects.reduce((sum, row) => sum + toNumber(row.doneCount), 0), tone: "healthy", targetSection: "schedules", targetLabel: "排期" },
    { key: "comments", label: "评论", value: systemRows.find((row) => row.key === "comments")?.count || recent.length, tone: "info", targetSection: "risk", targetLabel: "风险" },
    { key: "risk", label: "风险", value: model.value.risk?.commentRows?.length || 0, tone: "danger", targetSection: "risk", targetLabel: "风险" },
    { key: "users", label: "用户", value: model.value.users?.rows?.length || 0, tone: "info", targetSection: "users", targetLabel: "用户" },
    { key: "sync", label: "同步", value: systemRows.reduce((sum, row) => sum + toNumber(row.count), 0), tone: model.value.system?.status || "syncing", targetSection: "system", targetLabel: "系统" }
  ];
  return buckets.map((item, index) => ({ ...item, value: Math.max(1, toNumber(item.value) + index) }));
}

function buildUserRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    avatar: String(row.name || row.username || "用").slice(0, 1),
    roleLabel: roleName(row.role),
    status: row.status === "archived" ? "archived" : "在职",
    phoneMasked: maskPhone(row.phone),
    registeredAtShort: dateShort(row.registeredAt),
    projectCountLabel: `${toNumber(row.projectCount)} 个`
  }));
}

function buildProjectRows(rows = []) {
  return rows.map((row) => {
    const sourceProject = (store.allProjects || []).find((project) => String(project.id) === String(row.id));
    const taskCount = toNumber(row.taskCount ?? row.tasks);
    const doneCount = toNumber(row.doneCount);
    const pendingCount = Math.max(0, taskCount - doneCount);
    const commentCount = toNumber(row.commentCount ?? row.comments ?? sourceProject?.tasks?.reduce((sum, task) => sum + asList(task.comments).length, 0));
    const memberCount = asList(row.members).length || toNumber(row.memberCount);
    return {
      ...row,
      status: row.status === "archived" ? "archived" : row.status === "danger" ? "风险" : "进行中",
      tagsLabel: asList(row.tags).slice(0, 2).join("/") || "-",
      memberCount,
      memberCountLabel: `${memberCount} 人`,
      pendingCount,
      pendingLabel: `${pendingCount} 项`,
      doneLabel: `${doneCount} 项`,
      commentCount,
      commentLabel: `${commentCount} 条`,
      dateRange: `${dateShort(row.startDate)} 至 ${dateShort(row.endDate)}`,
      archivedAtShort: dateShort(row.archivedAt),
      progress: `${toNumber(row.progress)}%`
    };
  });
}

function buildNoticeRows(rows = []) {
  return rows.map((row) => {
    const linkTarget = row.linkTarget === "_blank" ? "_blank" : "_self";
    const startAt = toNoticeInputDateTime(row.startAt || "");
    const endAt = toNoticeInputDateTime(row.endAt || "");
    const startLabel = startAt.replace("T", " ");
    const endLabel = endAt.replace("T", " ");
    return {
      ...row,
      status: row.enabled === false || ["muted", "disabled"].includes(row.status) ? "disabled" : "active",
      linkTarget,
      targetLabel: linkTarget === "_blank" ? "新窗口" : "当前页",
      priority: toNumber(row.priority),
      startAt,
      endAt,
      windowLabel: startLabel || endLabel ? `${startLabel || "立即"} 至 ${endLabel || "长期"}` : "长期有效",
      intervalLabel: `${toNumber(row.interval || 5500)} 毫秒`,
      updatedAt: row.updatedAt || "-"
    };
  });
}

function buildDetailLists(key, row) {
  if (!row) return [];
  if (key === "notices") {
    return [
      {
        key: "link",
        title: "超链接设置",
        description: "工作台公告点击后的跳转配置。",
        items: [
          { label: row.linkText || "未设置链接文案", meta: row.linkUrl || "未设置目标地址" },
          { label: row.targetLabel || "当前页", meta: row.linkUrl ? "已配置跳转" : "纯文本公告" }
        ]
      }
    ];
  }
  if (key === "users") {
    const permissions = (model.value.permissions?.projectRows || []).filter((item) => item.user === row.name);
    const relatedComments = (model.value.risk?.commentRows || [])
      .filter((item) => item.user === row.name)
      .slice(0, 3)
      .map((item) => ({ label: item.text || item.taskTitle, meta: item.projectName || item.time }));
    return [
      {
        key: "projects",
        title: "参与项目",
        description: "项目、权限和最近操作聚合。",
        items: permissions.slice(0, 4).map((item) => ({
          ...item,
          label: `${item.projectName} · ${roleName(item.role)}`,
          meta: statusName(item.status)
        }))
      },
      {
        key: "comments",
        title: "最近评论",
        items: relatedComments.length ? relatedComments : [{ label: "暂无风险评论", meta: "评论流" }]
      },
      {
        key: "audit",
        title: "权限记录",
        items: [
          { label: `${roleName(row.role || "user")} 全局权限`, meta: statusName(row.status || "active") },
          { label: "密码重置入口", meta: "用户密码重置接口" }
        ]
      }
    ];
  }
  if (key === "projects") {
    const members = asList(row.members).map((name) => ({ label: name, meta: roleName(row.memberRoles?.[name] || "member") }));
    const recentTasks = (store.allProjects || [])
      .find((project) => String(project.id) === String(row.id))
      ?.tasks?.slice(0, 4)
      .map((task) => ({ label: task.title || "未命名任务", meta: task.archived ? "已完成" : "待完成" })) || [];
    return [
      { key: "members", title: "成员角色", items: members },
      { key: "department", title: "当前部门用户管理", items: [{ label: `${row.group || "项目"} 部门 ${members.length} 人`, meta: "项目可见范围提示" }] },
      { key: "tasks", title: "最近任务", items: recentTasks.length ? recentTasks : [{ label: "暂无最近任务", meta: "任务流" }] }
    ];
  }
  return [
    {
      key: "api",
      title: "接口同步",
      description: "当前页面实体支持创建、更新、归档、删除同步。",
      items: [
        { label: "读取列表", meta: "后台列表接口" },
        { label: "新增记录", meta: "后台新增接口" },
        { label: "更新记录", meta: "后台编辑接口" }
      ]
    }
  ];
}

function buildDashboardPanels() {
  const dashboard = model.value.dashboard || {};
  const projects = model.value.projects?.rows || [];
  const riskRows = (model.value.risk?.commentRows || dashboard.recentActivity || []).slice(0, 5);
  const recentProjects = (dashboard.projectHealth || projects).slice(0, 6).map((row) => ({
    ...row,
    title: row.name,
    subtitle: row.group,
    text: `任务 ${row.tasks ?? row.taskCount ?? 0} / 评论 ${row.comments ?? row.commentCount ?? 0}`
  }));
  return [
    {
      key: "risk",
      title: "风险评论列表",
      description: "支持评论搜索、风险词识别和点击定位任务。",
      rows: riskRows.map((row) => ({
        ...row,
        title: row.taskTitle || row.title,
        subtitle: `${row.projectName || row.subtitle || "未绑定项目"} / ${row.user || ""}`,
        text: row.text || row.time,
        status: row.status || (row.isRisk ? "danger" : "healthy")
      }))
    },
    {
      key: "projects",
      title: "最近项目表",
      description: "全局项目、标签、任务与评论聚合统计",
      rows: recentProjects
    }
  ];
}

function buildDashboardSystemCards() {
  const system = model.value.system || {};
  const source = sourceLabel(system.source);
  return [
    { key: "api", label: "接口健康", value: system.loaded ? "正常" : "待连接", status: system.loaded ? "healthy" : "warning", icon: "接" },
    { key: "mysql", label: "数据库", value: "结构就绪", status: "healthy", icon: "库" },
    { key: "queue", label: "队列同步", value: source, status: system.status || "syncing", icon: "列" },
    { key: "fallback", label: "回退状态", value: system.loaded ? "未启用" : "本地可用", status: system.loaded ? "muted" : "warning", icon: "退" }
  ];
}

function resetForm(seed = {}) {
  Object.keys(formModel).forEach((key) => delete formModel[key]);
  page.value.formFields.forEach((field) => {
    formModel[field.key] = seed[field.key] ?? "";
  });
  formModel.tags = activeKey.value === "projects" && Array.isArray(seed.tags) ? [...new Set(seed.tags.filter(Boolean))] : [];
  tagLibraryOpen.value = false;
}

function openCreate() {
  formMode.value = "create";
  resetForm(defaultSeed(activeKey.value));
  formSyncStatus.value = "";
  formOpen.value = true;
}

function openEdit(row) {
  formMode.value = "edit";
  resetForm(row);
  selectedRow.value = row;
  formSyncStatus.value = "";
  formOpen.value = true;
}

function defaultSeed(key) {
  if (key === "users") return { role: "employee", status: "active", department: store.currentUser?.department || "项目管理" };
  if (key === "projects") return { status: "active", group: store.projectGroups?.[0]?.title || "项目管理" };
  if (key === "notices") return { status: "active", type: "公告", linkTarget: "_self", priority: 0, startAt: "", endAt: "", interval: 5500 };
  return { status: "active" };
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

async function callApi(label, requestFactory) {
  try {
    const response = await requestFactory?.();
    formSyncStatus.value = `${label}已同步`;
    store.showToast(`${label}已提交后端接口`);
    return response;
  } catch (error) {
    console.warn(`[admin-console] ${label} failed`, error);
    if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
    formSyncStatus.value = `${label}同步失败：${backendSyncToast(error)}`;
    store.showToast(backendSyncToast(error));
    throw error;
  }
}

async function loadAdminNotices() {
  try {
    const response = await adminApi.listNotices({ pageSize: 100 });
    store.carouselNotices = normalizeCarouselNotices(response);
    formSyncStatus.value = "公告列表已同步";
    return true;
  } catch (error) {
    console.warn("[admin-console] notices load failed", error);
    if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
    formSyncStatus.value = `公告列表同步失败：${backendSyncToast(error)}`;
    return false;
  }
}

async function handleCrudSubmit() {
  if (formSubmitting.value) return;
  formSubmitting.value = true;
  try {
    const key = activeKey.value;
    const payload = { ...formModel };
    if (key === "users") {
      if (formMode.value === "edit" && selectedRow.value?.id) {
        store.updateUserField?.(selectedRow.value.id, "name", payload.name);
        Object.assign(store.getUser?.(selectedRow.value.id) || {}, payload);
        await callApi("用户更新", () => adminApi.updateUser(selectedRow.value.id, payload));
      } else {
        const user = {
          id: `u-admin-${Date.now()}`,
          avatar: (payload.name || payload.username || "?").slice(0, 1),
          status: "active",
          ...payload
        };
        store.users.unshift(user);
        await callApi("用户创建", () => adminApi.createUser(user));
      }
    } else if (key === "projects") {
      if (formMode.value === "edit" && selectedRow.value?.id) {
        const found = store.findProjectWithGroup?.(selectedRow.value.id);
        if (found?.project) Object.assign(found.project, normalizeProjectPayload(payload));
        await callApi("项目更新", () => adminApi.updateProject(selectedRow.value.id, normalizeProjectPayload(payload)));
      } else {
        const project = normalizeProjectPayload(payload);
        store.rootProjects.unshift({ id: Date.now(), members: [store.currentUser?.name || "管理员"], memberRoles: { [store.currentUser?.name || "管理员"]: "manager" }, tasks: [], ...project });
        await callApi("项目创建", () => adminApi.createProject(project));
      }
    } else if (key === "notices") {
      const notice = normalizeLocalNoticePayload(payload, formMode.value === "edit" ? selectedRow.value?.id : "", {
        ignorePayloadId: formMode.value !== "edit"
      });
      const previousNotices = [...(store.carouselNotices || [])];
      if (formMode.value === "edit" && selectedRow.value?.id) {
        try {
          upsertLocalNotice(notice);
          const response = await callApi("公告更新", () => adminApi.updateNotice(selectedRow.value.id, notice));
          applyNoticeResponse(response, notice);
        } catch (error) {
          store.carouselNotices = previousNotices;
          throw error;
        }
      } else {
        try {
          upsertLocalNotice(notice);
          const response = await callApi("公告创建", () => adminApi.createNotice(notice, { omitNoticeId: true }));
          applyNoticeResponse(response, notice);
        } catch (error) {
          store.carouselNotices = previousNotices;
          throw error;
        }
      }
    } else {
      await callApi("记录保存", () => adminApi.createTask(payload));
    }
    formOpen.value = false;
    formSyncStatus.value = "";
    tagLibraryOpen.value = false;
    resetForm(defaultSeed(key));
  } finally {
    formSubmitting.value = false;
  }
}

function normalizeProjectPayload(payload) {
  return {
    ...payload,
    tags: selectedProjectTags.value
  };
}

function normalizeNoticeStatus(value, enabled = true) {
  const text = String(value ?? "").trim().toLowerCase();
  if (enabled === false || ["muted", "disabled", "inactive", "off", "false", "停用", "已停用"].includes(text)) return "disabled";
  return "active";
}

function upsertLocalNotice(notice) {
  store.carouselNotices = upsertNotice(store.carouselNotices || [], notice);
}

function removeLocalNotice(noticeId) {
  store.carouselNotices = removeNoticeById(store.carouselNotices || [], noticeId);
}

function applyNoticeResponse(response, fallback) {
  const result = applyNoticeResponseToNotices(store.carouselNotices || [], response, fallback);
  store.carouselNotices = result.notices;
  return result.notice;
}

function removeLocalProject(projectId) {
  const targetId = String(projectId || "");
  if (!targetId) return;
  store.rootProjects = (store.rootProjects || []).filter((project) => String(project.id) !== targetId);
  (store.projectGroups || []).forEach((group) => {
    group.projects = (group.projects || []).filter((project) => String(project.id) !== targetId);
  });
  if (String(store.activeProjectId || "") === targetId) {
    store.activeProjectId = store.getNextActiveProjectId?.() || "";
  }
}

function confirmPermanentProjectDelete(row) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
  const projectName = row?.name || row?.title || row?.projectName || row?.id || "未命名项目";
  return window.confirm(`确认永久删除项目「${projectName}」吗？该操作会删除项目及其任务、排期、评论等关联数据，无法恢复。`);
}

function showUnsupportedArchiveNotice() {
  store.showToast("当前后台页暂不支持归档，已阻止误请求。");
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
  if (action === "toggle" && activeKey.value === "notices" && row.id) {
    const enabled = row.enabled === false || row.status === "disabled";
    const next = normalizeLocalNoticePayload({ ...row, enabled, status: enabled ? "active" : "disabled" }, row.id);
    upsertLocalNotice(next);
    const response = await callApi(enabled ? "公告启用" : "公告停用", () => adminApi.updateNotice(row.id, next));
    applyNoticeResponse(response, next);
    return;
  }
  if (action === "delete" && activeKey.value === "notices" && row.id) {
    removeLocalNotice(row.id);
    await callApi("公告删除", () => adminApi.deleteNotice(row.id, { hard: true }));
    return;
  }
  if (action === "delete" && activeKey.value === "projects" && row.id) {
    if (!confirmPermanentProjectDelete(row)) return;
    await callApi("项目永久删除", () => adminApi.deleteProject(row.id, { hard: true }));
    removeLocalProject(row.id);
    if (selectedRow.value?.id === row.id) selectedRow.value = null;
    return;
  }
  if (action === "archive") {
    if (activeKey.value === "users" && row.id) {
      store.archiveUser?.(row.id);
      await callApi("用户归档", () => adminApi.updateUser(row.id, { status: "archived" }));
    } else if (activeKey.value === "projects" && row.id) {
      const found = store.findProjectWithGroup?.(row.id);
      if (found?.project) {
        found.project.status = "archived";
        found.project.archivedAt = new Date().toLocaleString("zh-CN", { hour12: false });
      }
      await callApi("项目归档", () => adminApi.archiveProject(row.id, { status: "archived" }));
    } else if (activeKey.value === "notices" && row.id) {
      const next = normalizeLocalNoticePayload({ ...row, enabled: false, status: "disabled" }, row.id);
      upsertLocalNotice(next);
      const response = await callApi("公告停用", () => adminApi.updateNotice(row.id, next));
      applyNoticeResponse(response, next);
    } else {
      showUnsupportedArchiveNotice();
    }
  }
}
</script>

<template>
  <ConsoleShell
    title="协作后台"
    subtitle="超级管理员全局视图，仅展示已实现的后台数据范围"
    :nav-items="ADMIN_NAV"
    :active-key="activeKey"
    :user-label="userLabel"
    :role-label="roleLabel"
    :scope-label="scopeLabel"
    :last-sync="lastSync"
    search-placeholder="搜索用户 / 项目 / 任务 / 评论"
    v-model:search="globalSearch"
    @navigate="navigate"
    @back="backToWorkspace"
  >
    <AiConfigSection
      v-if="activeKey === 'ai'"
      :initial-config="rawPage.config"
      :initial-models="rawPage.models"
      :scope-options="rawPage.scopeOptions"
      :initial-documents="rawPage.documents"
      :initial-usage-logs="rawPage.usageLogs"
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
        :dashboard-system-cards="dashboardSystemCards"
        :dashboard-system-rows="dashboardSystemRows"
        :chart-items="dashboardChartItems"
        :trend-items="dashboardTrendItems"
        :show-filters="activeKey !== 'dashboard'"
        :query="localQuery"
        :query-placeholder="queryPlaceholder"
        :selected-row="selectedRow"
        :detail-title="`${page.title}详情抽屉`"
        :detail-fields="page.detailFields"
        :detail-lists="selectedDetailLists"
        :context-title="activeKey === 'projects' ? '项目目录树' : `${page.title}目录`"
        :context-subtitle="activeKey === 'projects' ? '一级目录与归档分组' : '按范围与状态快速定位'"
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
        :form-sync-status="formSyncStatus"
        :form-submitting="formSubmitting"
        scope-note="超级管理员可查看全局用户、项目、任务、评论、排期与画板。"
        empty-text="暂无后台数据"
        @create="openCreate"
        @refresh="store.showToast('后台数据已刷新')"
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
              :key="`admin-selected-${tagName}`"
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
              :key="`admin-library-${tag.name}`"
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
