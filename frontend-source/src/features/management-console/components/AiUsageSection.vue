<script setup>
import { computed, onMounted, shallowRef } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import { aiErrorMessage } from "@/services/apiErrors";
import managerApi from "@/services/managerApi";

const MODEL_LABELS = {
  "deepseek-fourth-flash": "深度求索第四代极速版",
  "deepseek-fourth-pro": "深度求索第四代专业版",
  "deepseek-chat": "深度求索对话版（兼容旧标识）",
  "deepseek-reasoner": "深度求索推理版（兼容旧标识）",
  "深度求索-fourth-极速版": "深度求索第四代极速版",
  "深度求索-fourth-专业版": "深度求索第四代专业版"
};

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({})
  },
  scope: {
    type: Object,
    default: () => ({})
  },
  search: {
    type: String,
    default: ""
  }
});

const loading = shallowRef(false);
const loaded = shallowRef(false);
const errorMessage = shallowRef("");
const remoteRows = shallowRef(null);
const remoteConfig = shallowRef(null);

const scopeText = computed(() => {
  const department = props.scope?.department || "我的项目";
  const projectCount = Array.isArray(props.scope?.projectIds) ? props.scope.projectIds.length : 0;
  return `${department} / 项目 ${projectCount}`;
});

const requestParams = computed(() => ({
  projectId: Array.isArray(props.scope?.projectIds) ? props.scope.projectIds : undefined,
  department: props.scope?.department || undefined,
  userId: props.scope?.user?.id || props.scope?.userId || undefined
}));

const rows = computed(() => {
  if (remoteRows.value) return filterRowsByScope(remoteRows.value);
  if (loaded.value) return [];
  return filterRowsByScope(normalizeRows(props.initialData?.rows || []));
});

const filteredRows = computed(() => {
  const keyword = normalizeText(props.search);
  if (!keyword) return rows.value;
  return rows.value.filter((row) => normalizeText(Object.values(row).join(" ")).includes(keyword));
});

const configSummary = computed(() => normalizeConfig(remoteConfig.value || props.initialData?.config || {}));

const summaryCards = computed(() => [
  { key: "todayQuestions", label: "今日提问", value: todayQuestionCount.value },
  { key: "networkStatus", label: "联网状态", value: configSummary.value.networkStatus },
  { key: "model", label: "模型", value: configSummary.value.model }
]);

const todayQuestionCount = computed(() => {
  const today = dateKey(new Date());
  const count = rows.value.filter((row) => dateKey(row.askedAt) === today).length;
  const fallback = Number(props.initialData?.summary?.todayQuestions?.value);
  return loaded.value ? count : count || (Number.isFinite(fallback) ? fallback : 0);
});

const accessLabel = computed(() => (loaded.value && !errorMessage.value ? "已按当前权限范围读取" : "只读范围"));

async function loadAiUsage() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [usageResponse, configResponse] = await Promise.all([
      managerApi.listAiUsage(requestParams.value),
      managerApi.getAiConfig(requestParams.value)
    ]);
    remoteRows.value = normalizeRows(usageResponse);
    remoteConfig.value = normalizeConfigResponse(configResponse);
  } catch (error) {
    console.warn("[manager-ai] 读取智能使用记录失败", error);
    remoteRows.value = [];
    remoteConfig.value = null;
    errorMessage.value = aiErrorMessage(error, "智能使用记录暂时加载失败，请稍后重试。");
  } finally {
    loaded.value = true;
    loading.value = false;
  }
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.logs)) return value.logs;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.rows)) return value.data.rows;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.logs)) return value.data.logs;
  return [];
}

function normalizeRows(value) {
  return rowsOf(value).map((row, index) => normalizeAiRow(row, index));
}

function normalizeAiRow(row = {}, index = 0) {
  const askedAt = row.askedAt || row.createdAt || row.time || row.questionTime || row.requestTime || "";
  const prompt = row.questionSummary || row.summary || row.promptSummary || row.question || row.prompt || row.content || "";
  return {
    id: row.id || row.logId || row.traceId || `ai-usage-${index}`,
    asker: row.asker || row.askerName || row.userName || row.user || row.actorName || "未知提问人",
    askedAt,
    askedAtLabel: formatTime(askedAt),
    questionSummary: String(prompt || "未提供问题摘要").trim().slice(0, 160),
    model: displayModelName(row.model || row.modelName || row.modelId),
    networkStatus: normalizeNetworkStatus(row.networkEnabled ?? row.webSearchEnabled ?? row.online ?? row.networkStatus),
    status: normalizeStatus(row.status || row.state),
    userId: row.userId || row.askerId || row.actorId || row.createdBy || "",
    projectId: row.projectId || row.projectUid || row.project_uid || "",
    department: row.department || row.dept || "",
    projectName: row.projectName || row.project || ""
  };
}

function filterRowsByScope(sourceRows = []) {
  const projectIds = new Set((props.scope?.projectIds || []).map((id) => String(id)));
  const userId = String(props.scope?.user?.id || props.scope?.userId || "");
  const userName = String(props.scope?.user?.name || props.scope?.user?.username || "");
  const department = String(props.scope?.department || "");
  const allowDepartmentScope = ["manager", "department_admin", "department_manager", "admin"].includes(
    String(props.scope?.user?.role || props.scope?.role || "").toLowerCase()
  );
  return sourceRows.filter((row) => {
    if (row.projectId && projectIds.has(String(row.projectId))) return true;
    if (row.userId && userId && String(row.userId) === userId) return true;
    if (row.asker && userName && row.asker === userName) return true;
    if (allowDepartmentScope && row.department && department && row.department === department) return true;
    return false;
  });
}

function normalizeConfigResponse(value) {
  if (value?.fallback) return null;
  return value?.config || value?.settings || value?.aiConfig || value?.data?.config || value?.data || value || null;
}

function normalizeConfig(value = {}) {
  return {
    model: displayModelName(value.model || value.modelName || value.modelId || value.defaultModel),
    networkStatus: normalizeNetworkStatus(value.networkEnabled ?? value.webSearchEnabled ?? value.online ?? value.networkStatus),
    provider: value.provider || value.vendor || "后台配置",
    scopeNote: value.scopeNote || "当前权限范围内生效"
  };
}

function displayModelName(value) {
  const text = String(value ?? "").trim();
  if (!text) return "按后台配置";
  return MODEL_LABELS[normalizeModelKey(text)] || "按后台配置";
}

function normalizeModelKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\bv\s*4\b/g, "fourth")
    .replace(/第四代/g, "fourth")
    .replace(/[\s_]+/g, "-");
}

function normalizeNetworkStatus(value) {
  if (value === true) return "已开启";
  if (value === false) return "未开启";
  const text = String(value ?? "").trim();
  if (!text) return "按后台配置";
  const map = {
    online: "已联网",
    offline: "未联网",
    enabled: "已开启",
    disabled: "未开启",
    on: "已开启",
    off: "未开启",
    true: "已开启",
    false: "未开启",
    "1": "已开启",
    "0": "未开启"
  };
  return map[text.toLowerCase()] || text;
}

function normalizeStatus(value) {
  const map = {
    success: "成功",
    completed: "成功",
    done: "成功",
    failed: "失败",
    error: "失败",
    pending: "处理中",
    running: "处理中",
    blocked: "已拦截",
    cancelled: "已取消"
  };
  const text = String(value || "").trim();
  return map[text.toLowerCase()] || text || "未知";
}

function statusClass(value) {
  const text = normalizeText(value);
  return {
    "is-success": /成功|completed|success|done/.test(text),
    "is-warning": /处理中|pending|running|拦截|blocked/.test(text),
    "is-danger": /失败|failed|error|取消|cancelled/.test(text)
  };
}

function dateKey(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

onMounted(loadAiUsage);
</script>

<template>
  <section class="manager-ai-section" aria-labelledby="manager-ai-title">
    <header class="manager-ai-header">
      <div class="manager-ai-title-block">
        <span>智能使用记录</span>
        <h2 id="manager-ai-title">智能使用记录</h2>
        <p>仅展示自己权限范围内的智能使用记录和当前生效配置摘要。</p>
      </div>
      <button class="manager-ai-refresh" type="button" :disabled="loading" @click="loadAiUsage">
        <Refresh aria-hidden="true" />
        <span>{{ loading ? "刷新中" : "刷新" }}</span>
      </button>
    </header>

    <div class="manager-ai-summary" aria-label="智能使用摘要">
      <article v-for="card in summaryCards" :key="card.key" class="manager-ai-summary-card">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
      </article>
    </div>

    <section class="manager-ai-config" aria-label="当前生效配置摘要">
      <header class="manager-ai-panel-head">
        <strong>当前生效配置摘要</strong>
        <span>只读</span>
      </header>
      <dl class="manager-ai-config-grid">
        <div>
          <dt>模型</dt>
          <dd>{{ configSummary.model }}</dd>
        </div>
        <div>
          <dt>联网状态</dt>
          <dd>{{ configSummary.networkStatus }}</dd>
        </div>
        <div>
          <dt>权限范围</dt>
          <dd>{{ scopeText }}</dd>
        </div>
      </dl>
    </section>

    <section class="manager-ai-logs" aria-label="智能使用记录">
      <header class="manager-ai-panel-head">
        <strong>智能使用记录</strong>
        <span>{{ accessLabel }}</span>
      </header>

      <div class="manager-ai-table" role="table" aria-label="智能使用记录表">
        <div class="manager-ai-table-row manager-ai-table-head" role="row">
          <span role="columnheader">提问人</span>
          <span role="columnheader">提问时间</span>
          <span role="columnheader">模型</span>
          <span role="columnheader">问题摘要</span>
          <span role="columnheader">状态</span>
        </div>
        <div v-if="loading" class="manager-ai-empty" role="status">正在加载智能使用记录</div>
        <div v-else-if="!filteredRows.length" class="manager-ai-empty">
          {{ errorMessage || "当前权限范围暂无智能使用记录" }}
        </div>
        <template v-else>
          <div
            v-for="row in filteredRows"
            :key="row.id"
            class="manager-ai-table-row manager-ai-table-body"
            role="row"
          >
            <span role="cell">{{ row.asker }}</span>
            <span role="cell">{{ row.askedAtLabel }}</span>
            <span role="cell">{{ row.model }}</span>
            <span role="cell" class="manager-ai-question">{{ row.questionSummary }}</span>
            <span role="cell">
              <i class="manager-ai-status" :class="statusClass(row.status)">{{ row.status }}</i>
            </span>
          </div>
        </template>
      </div>
    </section>
  </section>
</template>
