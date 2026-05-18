<script setup>
import { computed } from "vue";
import { Delete, EditPen, Plus, Refresh, Search, View } from "@element-plus/icons-vue";

const props = defineProps({
  title: {
    type: String,
    default: ""
  },
  description: {
    type: String,
    default: ""
  },
  cards: {
    type: Array,
    default: () => []
  },
  rows: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    default: () => []
  },
  filters: {
    type: Array,
    default: () => []
  },
  activeFilter: {
    type: String,
    default: "all"
  },
  showFilters: {
    type: Boolean,
    default: true
  },
  query: {
    type: String,
    default: ""
  },
  queryPlaceholder: {
    type: String,
    default: "搜索当前列表"
  },
  selectedRow: {
    type: Object,
    default: null
  },
  detailTitle: {
    type: String,
    default: "详情抽屉"
  },
  detailFields: {
    type: Array,
    default: () => []
  },
  detailLists: {
    type: Array,
    default: () => []
  },
  primaryActionLabel: {
    type: String,
    default: "新增"
  },
  rowActions: {
    type: Array,
    default: () => []
  },
  formOpen: {
    type: Boolean,
    default: false
  },
  formTitle: {
    type: String,
    default: ""
  },
  formFields: {
    type: Array,
    default: () => []
  },
  formModel: {
    type: Object,
    default: () => ({})
  },
  formSubmitLabel: {
    type: String,
    default: "保存"
  },
  formSyncStatus: {
    type: String,
    default: ""
  },
  formSubmitting: {
    type: Boolean,
    default: false
  },
  emptyText: {
    type: String,
    default: "暂无数据"
  },
  scopeNote: {
    type: String,
    default: ""
  },
  contextTitle: {
    type: String,
    default: ""
  },
  contextSubtitle: {
    type: String,
    default: ""
  },
  contextItems: {
    type: Array,
    default: () => []
  },
  contextHintTitle: {
    type: String,
    default: ""
  },
  contextHint: {
    type: String,
    default: ""
  },
  quickFilters: {
    type: Array,
    default: () => []
  },
  layout: {
    type: String,
    default: "three-column"
  },
  showMetrics: {
    type: Boolean,
    default: true
  },
  dashboardPanels: {
    type: Array,
    default: () => []
  },
  dashboardSystemCards: {
    type: Array,
    default: () => []
  },
  dashboardSystemRows: {
    type: Array,
    default: () => []
  },
  chartItems: {
    type: Array,
    default: () => []
  },
  trendItems: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits([
  "create",
  "context",
  "filter",
  "chart-navigate",
  "refresh",
  "row-action",
  "select-row",
  "submit-form",
  "close-form",
  "update:query",
  "update-form-field"
]);

const visibleRowActions = computed(() =>
  props.rowActions.length
    ? props.rowActions
    : [
        { key: "view", label: "查看", icon: "view" },
        { key: "edit", label: "编辑", icon: "edit" },
        { key: "archive", label: "归档", icon: "delete", tone: "danger" }
      ]
);

const hasContextPanel = computed(() => Boolean(props.contextItems.length || props.contextHint || props.quickFilters.length));
const isDashboardLayout = computed(() => props.layout === "dashboard");
const shouldShowContextPanel = computed(() => props.layout === "three-column" && hasContextPanel.value);
const shouldShowDetailDrawer = computed(() => !isDashboardLayout.value);
const shouldShowMetrics = computed(() => props.showMetrics && props.cards.length);
const boardLayoutClass = computed(() => `console-board-layout--${props.layout}`);

const tableTemplate = computed(() => {
  const count = Math.max(props.columns.length, 1);
  const action = visibleRowActions.value.length > 1 ? "minmax(96px, auto)" : "minmax(64px, auto)";
  if (count >= 7) {
    return `minmax(128px, 1.4fr) minmax(78px, .72fr) minmax(68px, .62fr) minmax(70px, .66fr) repeat(${count - 4}, minmax(44px, .46fr)) ${action}`;
  }
  if (count >= 5) {
    return `minmax(124px, 1.42fr) repeat(${count - 1}, minmax(62px, .66fr)) ${action}`;
  }
  return `repeat(${count}, minmax(118px, 1fr)) ${action}`;
});

const displayMap = {
  admin: "超级管理员",
  department_admin: "部门管理员",
  manager: "项目管理员",
  editor: "编辑者",
  readonly: "只读成员",
  dashboard: "总览",
  crud: "管理操作",
  "api ready": "管理就绪",
  user: "普通用户",
  member: "成员",
  owner: "拥有者",
  edit: "可编辑",
  view: "可查看",
  active: "进行中",
  healthy: "正常",
  warning: "关注",
  danger: "风险",
  risk: "风险",
  archived: "已归档",
  done: "已完成",
  muted: "空闲",
  syncing: "同步中",
  pending: "待处理",
  local: "本地数据",
  api: "后端接口",
  scheduleplan: "排期计划",
  task: "任务",
  schedule: "排期",
  deleted: "已删除",
  enabled: "已启用",
  disabled: "已停用",
  total: "总数",
  count: "数量",
  none: "无权限",
  true: "是",
  false: "否"
};

const sourceMap = {
  local: "本地数据",
  api: "在线数据",
  remote: "在线数据",
  scheduleplan: "排期计划",
  task: "任务数据",
  workspace: "工作台数据",
  bootstrap: "初始化数据",
  none: "无数据源"
};

const entityMap = {
  projects: "项目",
  tasks: "任务",
  comments: "评论",
  users: "用户",
  boards: "画板",
  tags: "标签",
  templates: "模板",
  notices: "公告"
};

const fieldLabelMap = {
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
  userid: "用户编号",
  role: "角色",
  currentrole: "当前角色",
  managerrole: "我的角色",
  status: "状态",
  department: "部门",
  group: "目录",
  email: "邮箱",
  phone: "手机号",
  job: "职位",
  mbti: "性格类型",
  registeredat: "注册时间",
  projectid: "项目编号",
  projectname: "项目",
  projectcount: "项目数",
  taskid: "任务编号",
  tasktitle: "任务",
  taskcount: "任务数",
  activetaskcount: "待办数",
  archivedtaskcount: "已完成数",
  donecount: "完成数",
  commentcount: "评论数",
  owner: "负责人",
  startdate: "开始时间",
  enddate: "结束时间",
  updatedat: "更新时间",
  archivedat: "归档时间",
  itemcount: "节点数",
  overdue: "逾期",
  progress: "进度",
  source: "数据源",
  count: "数量",
  value: "数值",
  type: "类型",
  interval: "间隔",
  enabled: "启用状态",
  color: "颜色",
  sharecount: "共享数",
  childcount: "子项数",
  kind: "类型",
  boardid: "画板编号",
  boardtitle: "画板",
  canmanage: "可调权",
  canedit: "可编辑",
  activeprojects: "在做项目",
  archivedprojects: "归档项目",
  activetasks: "待办任务",
  archivedtasks: "已完成任务",
  riskcomments: "风险评论",
  projectrules: "项目权限",
  boardshares: "画板共享",
  managers: "负责人",
  readonly: "只读成员",
  projects: "项目",
  tasks: "任务",
  comments: "评论",
  users: "用户",
  members: "成员",
  boards: "画板",
  templates: "模板",
  tags: "标签",
  notices: "公告",
  departments: "部门",
  archives: "归档",
  accounts: "账号",
  total: "总数",
  active: "进行中",
  risk: "风险",
  plans: "排期项目",
  items: "排期任务",
  links: "项目标记",
  used: "已使用",
  unused: "未使用",
  locked: "锁定模板",
  avginterval: "平均间隔",
  empty: "未建排期"
};

const chartItems = computed(() => (props.chartItems.length ? props.chartItems : props.cards).map((item) => ({
  key: item.key || item.label,
  label: displayValue(item.label || item.name || item.title || "", "label"),
  value: numericValue(item.value ?? item.count),
  tone: item.status || item.tone || "info",
  targetSection: item.targetSection || item.section || item.target || "",
  targetLabel: item.targetLabel || item.targetName || ""
})));

const maxChartValue = computed(() => Math.max(...chartItems.value.map((item) => item.value), 1));

const trendItems = computed(() => {
  if (props.trendItems.length) return props.trendItems;
  return props.rows.slice(0, 7).map((row, index) => ({
    key: rowKey(row, index),
    label: displayValue(row.time || row.name || row.title || `节点 ${index + 1}`, "summary"),
    value: numericValue(row.count ?? row.comments ?? row.taskCount ?? index + 1),
    tone: row.status || "info"
  }));
});

const trendPoints = computed(() => {
  const items = trendItems.value.slice(0, 7);
  if (!items.length) return [];
  const max = Math.max(...items.map((item) => numericValue(item.value)), 1);
  const step = items.length > 1 ? 300 / (items.length - 1) : 300;
  return items.map((item, index) => {
    const value = numericValue(item.value);
    return {
      ...item,
      value,
      x: 10 + index * step,
      y: 108 - (value / max) * 86
    };
  });
});

const trendLinePath = computed(() =>
  trendPoints.value.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")
);

const trendAreaPath = computed(() => {
  if (!trendPoints.value.length) return "";
  const first = trendPoints.value[0];
  const last = trendPoints.value[trendPoints.value.length - 1];
  return `${trendLinePath.value} L ${last.x.toFixed(1)} 116 L ${first.x.toFixed(1)} 116 Z`;
});

function columnKey(column) {
  return typeof column === "string" ? column : column?.key;
}

function columnLabel(column) {
  return fieldLabel(typeof column === "string" ? column : column?.label || column?.key);
}

function rowKey(row, index) {
  return row?.id || row?.key || row?.name || row?.title || index;
}

function cellValue(row, column) {
  const key = columnKey(column);
  const value = row?.[key];
  if (Array.isArray(value)) return value.map((item) => displayValue(item, key)).join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "-";
  return displayValue(value, key);
}

function rowTitle(row) {
  return displayValue(row?.name || row?.title || row?.projectName || row?.taskTitle || row?.user, "name") || "未命名记录";
}

function rowSubtitle(row) {
  return displayValue(row?.subtitle || row?.department || row?.group || row?.projectName || row?.role || "", row?.role ? "role" : "summary");
}

function contextLabel(item) {
  return displayValue(item?.label || item?.name || item?.title || "", "label");
}

function contextCount(item) {
  return item?.count ?? item?.value ?? "";
}

function contextActive(item) {
  return Boolean(item?.active || (item?.filterKey && item.filterKey === props.activeFilter));
}

function statusTone(value) {
  const text = String(value || "").toLowerCase();
  if (/danger|risk|逾期|风险|删除|禁用/.test(text)) return "danger";
  if (/warn|待|pending|warning|确认/.test(text)) return "warning";
  if (/archived|done|muted|disabled|归档|完成|停用|readonly/.test(text)) return "muted";
  if (/manager|admin|active|healthy|进行|在职|正常|editor/.test(text)) return "success";
  return "info";
}

function numericValue(value) {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function barHeight(value) {
  return `${Math.max(14, Math.round((numericValue(value) / maxChartValue.value) * 100))}%`;
}

function chartAriaLabel(item, source) {
  const chartType = source === "line" ? "趋势" : "指标";
  const target = item?.targetLabel || item?.targetSection || "";
  return target ? `查看${item.label}${chartType}，跳转到${target}` : `查看${item.label}${chartType}`;
}

function handleChartNavigate(item, source) {
  if (!item?.targetSection) return;
  emit("chart-navigate", { source, target: item.targetSection, item });
}

function isLiteralDisplayValue(value, key = "") {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const text = String(value ?? "").trim();
  return (
    ["linkurl", "url", "href", "path", "route"].includes(normalizedKey) ||
    /^(?:https?:|mailto:|tel:)/i.test(text) ||
    /^[#/]/.test(text)
  );
}

function displayValue(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => displayValue(item, key)).join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "";
  const text = String(value);
  if (isLiteralDisplayValue(text, key)) return text;
  const lower = text.trim().toLowerCase();
  if (key === "source") return sourceMap[lower] || text.replace(/workspace\/bootstrap/gi, "工作台初始化数据");
  if (key === "name" && entityMap[lower]) return entityMap[lower];
  return displayMap[lower] || localizeKnownEnglish(text);
}

function fieldLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  return fieldLabelMap[lower] || entityMap[lower] || displayMap[lower] || (/^[a-z0-9_.-]+$/i.test(text) ? "字段" : localizeKnownEnglish(text));
}

function localizeKnownEnglish(value) {
  return String(value ?? "")
    .replace(/\bapi ready\b/gi, "接口就绪")
    .replace(/\bcrud\b/gi, "增删改查")
    .replace(/\bdashboard\b/gi, "总览")
    .replace(/\bdepartment_admin\b/gi, "部门管理员")
    .replace(/\breadonly\b/gi, "只读成员")
    .replace(/\beditor\b/gi, "编辑者")
    .replace(/\bmanager\b/gi, "项目管理员")
    .replace(/\badmin\b/gi, "超级管理员")
    .replace(/\bapi\b/gi, "后端接口")
    .replace(/\bscheduleplan\b/gi, "排期计划");
}

function optionLabel(option) {
  return option?.label ?? displayValue(option?.value ?? option);
}

function detailBadges(row) {
  if (!row) return [];
  const badges = [];
  if (row.status) badges.push({ label: displayValue(row.status, "status"), tone: statusTone(row.status) });
  if (row.managerRole) badges.push({ label: displayValue(row.managerRole, "managerRole"), tone: statusTone(row.managerRole) });
  if (row.role && !badges.some((badge) => badge.label === displayValue(row.role, "role"))) {
    badges.push({ label: displayValue(row.role, "role"), tone: statusTone(row.role) });
  }
  if (Array.isArray(row.tags)) {
    row.tags.slice(0, 3).forEach((tag) => badges.push({ label: tag, tone: "info" }));
  }
  return badges.slice(0, 4);
}

function fieldValue(field) {
  if (!props.selectedRow) return "-";
  const value = props.selectedRow[field.key];
  if (Array.isArray(value)) return value.map((item) => displayValue(item, field.key)).join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  return displayValue(value || field.fallback, field.key) || "-";
}

function panelRowTitle(row) {
  return displayValue(row?.title || row?.name || row?.projectName || row?.taskTitle || row?.label, "name") || "未命名记录";
}

function panelRowMeta(row) {
  return displayValue(row?.subtitle || row?.group || row?.owner || row?.user || row?.department || row?.time || "", "summary");
}

function panelRowValue(row) {
  return displayValue(row?.text || row?.summary || row?.description || row?.status || row?.time || "", "summary");
}

function listItemMeta(item) {
  return displayValue(item.meta || item.role || item.status || item.time || "", item.role ? "role" : "status");
}

function actionIcon(action) {
  if (action.icon === "edit") return EditPen;
  if (action.icon === "delete" || action.icon === "archive") return Delete;
  return View;
}

function handleContextItem(item) {
  if (item?.filterKey) emit("filter", item.filterKey);
  emit("context", item);
}
</script>

<template>
  <section class="console-section" :class="[`console-section--${layout}`]">
    <header class="console-section-head">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <div class="console-section-actions">
        <button class="console-icon-button" type="button" title="刷新" aria-label="刷新" @click="emit('refresh')">
          <Refresh aria-hidden="true" />
        </button>
        <button class="console-primary-button" type="button" @click="emit('create')">
          <Plus aria-hidden="true" />
          {{ primaryActionLabel }}
        </button>
      </div>
    </header>

    <div
      class="console-board-layout"
      :class="[boardLayoutClass, { 'has-context-panel': shouldShowContextPanel, 'has-detail-drawer': shouldShowDetailDrawer }]"
    >
      <aside v-if="shouldShowContextPanel" class="console-context-panel" aria-label="页面内目录">
        <div class="console-context-heading">
          <strong>{{ contextTitle || `${title}目录` }}</strong>
          <span>{{ contextSubtitle || description }}</span>
        </div>

        <div v-if="contextItems.length" class="console-context-tree">
          <button
            v-for="item in contextItems"
            :key="item.key || contextLabel(item)"
            type="button"
            :class="{ active: contextActive(item) }"
            :data-tone="item.tone || 'normal'"
            @click="handleContextItem(item)"
          >
            <span class="console-context-caret" aria-hidden="true">›</span>
            <strong>{{ contextLabel(item) }}</strong>
            <small v-if="contextCount(item) !== ''">{{ contextCount(item) }}</small>
          </button>
        </div>

        <section v-if="contextHint" class="console-context-note">
          <strong>{{ contextHintTitle || "范围提示" }}</strong>
          <p>{{ contextHint }}</p>
        </section>

        <div v-if="quickFilters.length" class="console-context-quick" aria-label="快捷筛选">
          <strong>快捷筛选</strong>
          <div>
            <button
              v-for="filter in quickFilters"
              :key="filter.key"
              type="button"
              :class="{ active: activeFilter === filter.key }"
              @click="emit('filter', filter.key)"
            >
              {{ filter.label }}
            </button>
          </div>
        </div>
      </aside>

      <section class="console-main-column">
        <div v-if="showFilters" class="console-filter-row">
          <div class="console-filter-pills" aria-label="筛选">
            <button
              v-for="filter in filters"
              :key="filter.key"
              type="button"
              :class="{ active: activeFilter === filter.key }"
              @click="emit('filter', filter.key)"
            >
              {{ filter.label }}
              <span v-if="filter.count !== undefined">{{ filter.count }}</span>
            </button>
          </div>
          <label class="console-local-search">
            <Search aria-hidden="true" />
            <input
              :value="query"
              type="search"
              :placeholder="queryPlaceholder"
              @input="emit('update:query', $event.target.value)"
            />
          </label>
          <div class="console-filter-actions">
            <button class="console-icon-button" type="button" title="刷新" aria-label="刷新" @click="emit('refresh')">
              <Refresh aria-hidden="true" />
            </button>
            <button class="console-primary-button" type="button" @click="emit('create')">
              <Plus aria-hidden="true" />
              {{ primaryActionLabel }}
            </button>
          </div>
        </div>

        <div v-if="shouldShowMetrics" class="console-metric-strip" :class="{ 'is-dashboard': isDashboardLayout }">
          <article v-for="card in cards" :key="card.key || card.label" :data-tone="card.status || card.tone || 'info'">
            <span class="console-metric-icon" aria-hidden="true">{{ card.icon || String(card.label || "").slice(0, 1) }}</span>
            <div>
              <small>{{ card.label }}</small>
              <strong>{{ card.value }}</strong>
              <em v-if="card.description || card.hint">{{ card.description || card.hint }}</em>
            </div>
          </article>
        </div>

        <div v-if="isDashboardLayout" class="console-dashboard-overview">
          <section class="console-dashboard-chart-panel console-dashboard-chart-panel--bar">
            <div class="console-panel-heading">
              <div>
                <strong>运营指标分布</strong>
                <span>按当前后台数据实时汇总</span>
              </div>
              <em>柱状图</em>
            </div>
            <div class="console-bar-chart" aria-label="运营指标柱状图">
              <button
                v-for="item in chartItems"
                :key="item.key"
                type="button"
                class="console-chart-item"
                :data-tone="item.tone"
                :disabled="!item.targetSection"
                :aria-label="chartAriaLabel(item, 'bar')"
                @click="handleChartNavigate(item, 'bar')"
              >
                <div>
                  <span :style="{ height: barHeight(item.value) }"></span>
                </div>
                <strong>{{ item.value }}</strong>
                <small>{{ item.label }}</small>
              </button>
            </div>
          </section>

          <section class="console-dashboard-chart-panel console-dashboard-chart-panel--line">
            <div class="console-panel-heading">
              <div>
                <strong>近况趋势</strong>
                <span>评论、任务与项目活跃度</span>
              </div>
              <em>折线图</em>
            </div>
            <div class="console-line-chart" aria-label="近况趋势折线图">
              <svg viewBox="0 0 320 128" role="img" aria-label="趋势走势">
                <path v-if="trendAreaPath" class="console-line-chart-area" :d="trendAreaPath"></path>
                <path v-if="trendLinePath" class="console-line-chart-path" :d="trendLinePath"></path>
                <circle
                  v-for="point in trendPoints"
                  :key="point.key || point.label"
                  :cx="point.x"
                  :cy="point.y"
                  r="5"
                  role="button"
                  tabindex="0"
                  :aria-label="chartAriaLabel(point, 'line')"
                  class="console-line-chart-dot"
                  @click="handleChartNavigate(point, 'line')"
                  @keydown.enter.prevent="handleChartNavigate(point, 'line')"
                  @keydown.space.prevent="handleChartNavigate(point, 'line')"
                ></circle>
              </svg>
              <div class="console-line-chart-legend">
                <button
                  v-for="point in trendPoints.slice(0, 5)"
                  :key="`${point.key || point.label}-legend`"
                  type="button"
                  :disabled="!point.targetSection"
                  :aria-label="chartAriaLabel(point, 'line')"
                  @click="handleChartNavigate(point, 'line')"
                >
                  <i aria-hidden="true"></i>
                  {{ point.label }}
                </button>
              </div>
            </div>
          </section>

          <section
            v-for="panel in dashboardPanels"
            :key="panel.key || panel.title"
            class="console-dashboard-panel"
            :data-kind="panel.kind || 'list'"
          >
            <div class="console-panel-heading">
              <div>
                <strong>{{ panel.title }}</strong>
                <span>{{ panel.description }}</span>
              </div>
            </div>
            <div class="console-panel-list">
              <button
                v-for="item in panel.rows || []"
                :key="item.id || item.key || item.name || item.title"
                type="button"
                @click="emit('row-action', { action: panel.action || 'view', row: item })"
              >
                <em :data-tone="statusTone(item.status || item.tone)">{{ displayValue(item.status || item.tone || "active", "status") }}</em>
                <span>
                  <strong>{{ panelRowTitle(item) }}</strong>
                  <small>{{ panelRowMeta(item) }}</small>
                </span>
                <i>{{ panelRowValue(item) }}</i>
              </button>
            </div>
          </section>

          <section v-if="dashboardSystemCards.length || dashboardSystemRows.length" class="console-dashboard-system-panel">
            <div class="console-panel-heading">
              <div>
                <strong>系统状态</strong>
                <span>在线数据、数据库、同步来源与备用状态</span>
              </div>
            </div>
            <div v-if="dashboardSystemCards.length" class="console-system-card-grid">
              <article v-for="item in dashboardSystemCards" :key="item.key || item.label" :data-tone="item.status || item.tone || 'info'">
                <span>{{ item.icon || String(item.label || "").slice(0, 1) }}</span>
                <div>
                  <strong>{{ item.label }}</strong>
                  <small>{{ displayValue(item.description || item.hint || item.value || "", item.key) }}</small>
                  <em>{{ displayValue(item.status || "healthy", "status") }}</em>
                </div>
              </article>
            </div>
            <div v-if="dashboardSystemRows.length" class="console-system-sync-table">
              <div>
                <span>同步对象</span>
                <span>数量</span>
                <span>数据源</span>
                <span>状态</span>
              </div>
              <div v-for="row in dashboardSystemRows" :key="row.key || row.name">
                <span>{{ displayValue(row.name || row.key, "name") }}</span>
                <span>{{ row.count ?? "-" }}</span>
                <span>{{ displayValue(row.source, "source") || "-" }}</span>
                <span>
                  <em class="console-status-pill" :data-tone="statusTone(row.status)">
                    {{ displayValue(row.status, "status") }}
                  </em>
                </span>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="console-table-panel">
          <div class="console-table-title">
            <strong>{{ title }}列表</strong>
            <span>{{ scopeNote || "点击行查看详情；编辑、归档、删除走对应后端接口。" }}</span>
          </div>

          <div class="console-dense-table" role="table" :style="{ '--console-table-template': tableTemplate }">
            <div class="console-table-row console-table-head" role="row">
              <span v-for="column in columns" :key="columnKey(column)" role="columnheader">
                {{ columnLabel(column) }}
              </span>
              <span role="columnheader">操作</span>
            </div>

            <button
              v-for="(row, rowIndex) in rows"
              :key="rowKey(row, rowIndex)"
              class="console-table-row console-table-body-row"
              :class="{ active: selectedRow && rowKey(row, rowIndex) === rowKey(selectedRow, rowIndex) }"
              type="button"
              role="row"
              @click="emit('select-row', row)"
            >
              <span v-for="column in columns" :key="columnKey(column)" role="cell">
                <slot name="cell" :row="row" :column="column" :value="row[columnKey(column)]">
                  <em
                    v-if="['status', 'role', 'managerRole', 'currentRole'].includes(columnKey(column))"
                    class="console-status-pill"
                    :data-tone="statusTone(row[columnKey(column)])"
                  >
                    {{ cellValue(row, column) }}
                  </em>
                  <template v-else>{{ cellValue(row, column) }}</template>
                </slot>
              </span>
              <span class="console-row-actions" role="cell" @click.stop>
                <button
                  v-for="action in visibleRowActions"
                  :key="action.key"
                  type="button"
                  :title="action.label"
                  :aria-label="`${action.label} ${rowTitle(row)}`"
                  :data-tone="action.tone || 'normal'"
                  @click="emit('row-action', { action: action.key, row })"
                >
                  <component :is="actionIcon(action)" aria-hidden="true" />
                  <small>{{ action.label }}</small>
                </button>
              </span>
            </button>

            <div v-if="!rows.length" class="console-table-empty">{{ emptyText }}</div>
          </div>
        </div>
      </section>

      <aside v-if="shouldShowDetailDrawer" class="console-detail-drawer" aria-label="详情抽屉">
        <template v-if="selectedRow">
          <div class="console-detail-hero">
            <span class="console-detail-avatar" aria-hidden="true">{{ rowTitle(selectedRow).slice(0, 1) }}</span>
            <div>
              <small>{{ detailTitle }}</small>
              <strong>{{ rowTitle(selectedRow) }}</strong>
              <em>{{ rowSubtitle(selectedRow) }}</em>
            </div>
          </div>

          <div v-if="detailBadges(selectedRow).length" class="console-detail-tags">
            <span v-for="badge in detailBadges(selectedRow)" :key="badge.label" :data-tone="badge.tone">{{ badge.label }}</span>
          </div>

          <dl class="console-detail-fields">
            <template v-for="field in detailFields" :key="field.key">
              <dt>{{ field.label }}</dt>
              <dd>{{ fieldValue(field) }}</dd>
            </template>
          </dl>

          <section v-for="list in detailLists" :key="list.key || list.title" class="console-detail-list">
            <strong>{{ list.title }}</strong>
            <p v-if="list.description">{{ list.description }}</p>
            <button
              v-for="item in list.items"
              :key="item.id || item.key || item.name || item.title"
              type="button"
              @click="emit('row-action', { action: list.action || 'view', row: item })"
            >
              <span>{{ item.label || item.name || item.title || item.projectName || item.taskTitle }}</span>
              <small>{{ listItemMeta(item) }}</small>
            </button>
          </section>
        </template>

        <div v-else class="console-detail-empty">选择一条记录查看详情</div>
      </aside>
    </div>

    <Teleport to="body">
      <div v-if="formOpen" class="console-crud-modal" @click.self="!formSubmitting && emit('close-form')">
        <form class="console-crud-card" @submit.prevent="!formSubmitting && emit('submit-form')">
          <header>
            <div>
              <small>管理表单</small>
              <strong>{{ formTitle }}</strong>
            </div>
            <button type="button" aria-label="关闭" :disabled="formSubmitting" @click="emit('close-form')">×</button>
          </header>

          <fieldset class="console-crud-grid" :disabled="formSubmitting">
            <label v-for="field in formFields" :key="field.key" :class="{ wide: field.type === 'textarea' || field.wide }">
                <span>{{ field.label }}</span>
                <textarea
                  v-if="field.type === 'textarea'"
                  :value="formModel[field.key] || ''"
                  :placeholder="field.placeholder || field.label"
                  @input="emit('update-form-field', { key: field.key, value: $event.target.value })"
                ></textarea>
                <select
                  v-else-if="field.type === 'select'"
                  :value="formModel[field.key] || ''"
                  @change="emit('update-form-field', { key: field.key, value: $event.target.value })"
                >
                  <option v-for="option in field.options || []" :key="option.value ?? option" :value="option.value ?? option">
                    {{ optionLabel(option) }}
                  </option>
                </select>
                <input
                  v-else-if="field.type === 'checkbox'"
                  type="checkbox"
                  :checked="Boolean(formModel[field.key])"
                  @change="emit('update-form-field', { key: field.key, value: $event.target.checked })"
                />
                <input
                  v-else
                  :type="field.type || 'text'"
                  :value="formModel[field.key] || ''"
                  :placeholder="field.placeholder || field.label"
                  @input="emit('update-form-field', { key: field.key, value: $event.target.value })"
                />
              </label>
          </fieldset>

          <footer>
            <p v-if="formSyncStatus" class="console-crud-sync">{{ formSyncStatus }}</p>
            <button class="console-ghost-button" type="button" :disabled="formSubmitting" @click="emit('close-form')">取消</button>
            <button class="console-primary-button" type="submit" :disabled="formSubmitting">{{ formSubmitLabel }}</button>
          </footer>
        </form>
      </div>
    </Teleport>
  </section>
</template>
