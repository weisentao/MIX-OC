<script setup>
import { computed, onMounted, reactive, shallowRef } from "vue";
import { Delete, DocumentAdd, EditPen, Refresh, Search, SwitchButton } from "@element-plus/icons-vue";
import {
  AI_CONFIG_DEFAULTS,
  AI_MODEL_OPTIONS,
  AI_SCOPE_OPTIONS
} from "@/features/management-console/data/adminConsoleData";
import adminApi from "@/services/adminApi";
import { aiErrorMessage } from "@/services/apiErrors";

const DOCUMENT_SCOPE_OPTIONS = [
  { value: "global", label: "全局可见" },
  { value: "workspace", label: "工作台可见" },
  { value: "home", label: "首页助手可见" },
  { value: "self", label: "本人可见" },
  { value: "department", label: "部门范围" },
  { value: "project", label: "项目范围" }
];
const MODEL_LABELS = {
  "deepseek-fourth-flash": "深度求索第四代极速版",
  "deepseek-fourth-pro": "深度求索第四代专业版",
  "deepseek-chat": "深度求索对话版（兼容旧标识）",
  "deepseek-reasoner": "深度求索推理版（兼容旧标识）",
  "深度求索-fourth-极速版": "深度求索第四代极速版",
  "深度求索-fourth-专业版": "深度求索第四代专业版"
};
const PROVIDER_LABELS = {
  deepseek: "深度求索",
  DeepSeek: "深度求索"
};
const STATUS_LABELS = {
  success: "正常",
  completed: "正常",
  done: "正常",
  fallback: "本地整理",
  failed: "失败",
  error: "失败",
  pending: "处理中",
  running: "处理中",
  blocked: "已拦截",
  cancelled: "已取消"
};
const ACTION_LABELS = {
  chat: "智能问答",
  ask: "智能问答",
  question: "智能问答",
  completion: "智能问答",
  config_check: "配置检查",
  risk_summary: "风险摘要"
};
const SCOPE_LABELS = {
  tasks: "任务",
  comments: "评论",
  schedules: "排期",
  schedule: "排期",
  documents: "文档",
  global: "全局",
  workspace: "工作台",
  home: "首页",
  self: "本人",
  department: "部门",
  project: "项目"
};

const props = defineProps({
  initialConfig: {
    type: Object,
    default: () => AI_CONFIG_DEFAULTS
  },
  initialModels: {
    type: Array,
    default: () => AI_MODEL_OPTIONS
  },
  scopeOptions: {
    type: Array,
    default: () => AI_SCOPE_OPTIONS
  },
  initialDocuments: {
    type: Array,
    default: () => []
  },
  initialUsageLogs: {
    type: Array,
    default: () => []
  }
});

const loading = shallowRef(false);
const saving = shallowRef(false);
const documentSaving = shallowRef(false);
const apiNotice = shallowRef("");
const documentQuery = shallowRef("");
const usageQuery = shallowRef("");
const editingDocumentId = shallowRef("");

const configForm = reactive(createConfig(props.initialConfig));
const documentForm = reactive(createDocumentSeed());
const models = shallowRef(normalizeModels(props.initialModels, { fallbackToDefaults: true }));
const documents = shallowRef(normalizeDocuments(props.initialDocuments));
const usageLogs = shallowRef(normalizeUsageLogs(props.initialUsageLogs));

const selectedModel = computed(() => models.value.find((item) => item.id === configForm.modelId) || models.value[0] || {});
const enabledScopeLabels = computed(() =>
  props.scopeOptions
    .filter((scope) => configForm.knowledgeScopes.includes(scope.key))
    .map((scope) => scope.label)
);
const scopeSummary = computed(() => enabledScopeLabels.value.join("、") || "未选择");
const filteredDocuments = computed(() => {
  const keyword = normalizeText(documentQuery.value);
  return documents.value.filter((item) => {
    if (!keyword) return true;
    return normalizeText(`${item.title} ${item.category} ${item.summary} ${item.source}`).includes(keyword);
  });
});
const filteredUsageLogs = computed(() => {
  const keyword = normalizeText(usageQuery.value);
  return usageLogs.value.filter((item) => {
    if (!keyword) return true;
    return normalizeText(`${item.user} ${item.action} ${item.modelName} ${item.scopeLabel} ${item.status} ${item.time}`).includes(keyword);
  });
});
const documentFormTitle = computed(() => (editingDocumentId.value ? "编辑智能资料文档" : "新增智能资料文档"));
const documentSubmitLabel = computed(() => (editingDocumentId.value ? "保存文档" : "新增文档"));
const homeKeyStatusText = computed(() => formatKeyStatus(configForm.homeApiKeyConfigured, configForm.homeApiKeyMasked));
const hrKeyStatusText = computed(() => formatKeyStatus(configForm.hrApiKeyConfigured, configForm.hrApiKeyMasked));
const metrics = computed(() => [
  { key: "enabled", label: "启用状态", value: configForm.enabled ? "已启用" : "已停用", tone: configForm.enabled ? "mint" : "muted" },
  { key: "model", label: "当前模型", value: selectedModel.value.name || "未选择", tone: "mint" },
  { key: "scope", label: "知识范围", value: `${configForm.knowledgeScopes.length} 项`, tone: "leaf" },
  { key: "documents", label: "智能资料文档", value: documents.value.length, tone: documents.value.length ? "yellow" : "muted" },
  { key: "logs", label: "智能使用记录", value: usageLogs.value.length, tone: usageLogs.value.length ? "coral" : "muted" }
]);

onMounted(() => {
  loadRemoteData();
});

function createConfig(source = {}) {
  const defaultModel = source.defaultModel || source.modelId || source.model || AI_CONFIG_DEFAULTS.defaultModel || AI_CONFIG_DEFAULTS.modelId;
  const allowWebSearch = source.webSearchEnabled ?? source.allowWebSearch ?? AI_CONFIG_DEFAULTS.webSearchEnabled ?? AI_CONFIG_DEFAULTS.allowWebSearch;
  const openingTemplate = source.systemPrompt || source.openingTemplate || AI_CONFIG_DEFAULTS.systemPrompt || AI_CONFIG_DEFAULTS.openingTemplate;
  const homeKeyState = normalizeKeyState(source, "home");
  const hrKeyState = normalizeKeyState(source, "hr");
  return {
    ...AI_CONFIG_DEFAULTS,
    ...source,
    modelId: defaultModel,
    defaultModel,
    allowWebSearch: normalizeBoolean(allowWebSearch),
    webSearchEnabled: normalizeBoolean(allowWebSearch),
    openingTemplate,
    systemPrompt: openingTemplate,
    knowledgeScopes: normalizeScopes(source.knowledgeScopes || source.scopes || AI_CONFIG_DEFAULTS.knowledgeScopes),
    maxContext: normalizeNumber(source.maxContext ?? source.maxMessageChars ?? source.max_context, AI_CONFIG_DEFAULTS.maxContext),
    maxMessageChars: normalizeNumber(source.maxMessageChars ?? source.maxContext, AI_CONFIG_DEFAULTS.maxMessageChars),
    maxContextMessages: normalizeNumber(source.maxContextMessages, AI_CONFIG_DEFAULTS.maxContextMessages),
    temperature: normalizeNumber(source.temperature, AI_CONFIG_DEFAULTS.temperature),
    homeApiKey: "",
    hrApiKey: "",
    homeApiKeyConfigured: homeKeyState.configured,
    hrApiKeyConfigured: hrKeyState.configured,
    homeApiKeyMasked: homeKeyState.masked,
    hrApiKeyMasked: hrKeyState.masked
  };
}

function applyConfig(source = {}) {
  Object.assign(configForm, createConfig(source));
}

function createDocumentSeed(source = {}) {
  return {
    title: source.title || "",
    category: source.category || "业务资料",
    source: source.source || "后台资料库",
    summary: source.summary || "",
    content: source.content || source.body || source.text || "",
    scope: normalizeDocumentScope(source.scope),
    scopeTargetId: source.scopeTargetId || source.targetId || source.projectId || source.departmentId || source.userId || "",
    scopeTargetName: source.scopeTargetName || source.targetName || source.projectName || source.departmentName || source.userName || "",
    status: normalizeDocumentStatus(source.status || (normalizeBoolean(source.enabled, true) ? "active" : "archived"))
  };
}

function applyDocumentForm(source = {}) {
  Object.assign(documentForm, createDocumentSeed(source));
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function firstPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on", "enabled", "开启", "已开启"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "关闭", "未开启"].includes(text)) return false;
  return fallback;
}

function normalizeKeyState(source = {}, scope) {
  const status = source.keyStatus || {};
  const maskedSource = firstPresentValue(
    source[`${scope}ApiKeyMasked`],
    source[`${scope}Masked`],
    source[`${scope}MaskedApiKey`],
    source[`${scope}KeyMasked`],
    source[`${scope}MaskedKey`],
    source.masked?.[`${scope}ApiKey`],
    source.masked?.[scope],
    source.masked?.[`${scope}Key`],
    source[`${scope}ApiKey`]
  );
  const masked = safeMaskedKey(maskedSource);
  const configuredValue = firstPresentValue(
    source[`${scope}Configured`],
    source[`${scope}ApiKeyConfigured`],
    status[`${scope}Configured`],
    status[`${scope}ApiKeyConfigured`]
  );
  return {
    configured: normalizeBoolean(configuredValue, Boolean(masked || maskedSource)),
    masked
  };
}

function safeMaskedKey(value) {
  const text = String(value ?? "").trim();
  if (!text || /\bsk-[A-Za-z0-9_-]{16,}\b/.test(text)) return "";
  if (/[*•●]/.test(text) || /…/.test(text)) return text.slice(0, 64);
  return "";
}

function formatKeyStatus(configured, masked) {
  if (masked) return `已配置 · ${masked}`;
  return configured ? "已配置（留空不变）" : "未配置";
}

function normalizeDocumentStatus(value, fallback = "active") {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["enabled", "enable", "active", "open", "on", "true", "1", "启用", "已启用", "开启", "已开启"].includes(text)) {
    return "active";
  }
  if (["disabled", "disable", "archived", "archive", "closed", "off", "false", "0", "停用", "已停用", "关闭", "未开启"].includes(text)) {
    return "archived";
  }
  if (text === "draft") return "draft";
  return fallback;
}

function normalizeDocumentScope(value, fallback = "global") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  const matched = DOCUMENT_SCOPE_OPTIONS.find((item) => item.value === lower || item.label === text);
  return matched?.value || lower;
}

function documentScopeLabel(value) {
  const scope = normalizeDocumentScope(value);
  return DOCUMENT_SCOPE_OPTIONS.find((item) => item.value === scope)?.label || SCOPE_LABELS[scope] || value || "全局可见";
}

function formatDocumentScope(item = {}) {
  const label = documentScopeLabel(item.scope);
  const target = String(item.scopeTargetName || item.scopeTargetId || "").trim();
  return target ? `${label}：${target}` : label;
}

function normalizeScopes(value) {
  const allowed = new Set(props.scopeOptions.map((item) => item.key));
  const scopes = Array.isArray(value) ? value : String(value || "").split(",");
  return scopes.map((item) => String(item).trim()).filter((item) => allowed.has(item));
}

function displayModelName(value) {
  const text = String(value ?? "").trim();
  if (!text) return "按后台配置";
  return MODEL_LABELS[normalizeModelKey(text)] || "按后台配置";
}

function displayProviderName(value) {
  const text = String(value ?? "").trim();
  if (!text) return "按后台配置";
  return PROVIDER_LABELS[text] || PROVIDER_LABELS[text.toLowerCase()] || "按后台配置";
}

function normalizeModelKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\bv\s*4\b/g, "fourth")
    .replace(/第四代/g, "fourth")
    .replace(/[\s_]+/g, "-");
}

function displayActionLabel(value) {
  const text = String(value ?? "").trim();
  return ACTION_LABELS[text] || ACTION_LABELS[text.toLowerCase()] || text || "智能问答";
}

function displayStatusLabel(value) {
  const text = String(value ?? "").trim();
  return STATUS_LABELS[text] || STATUS_LABELS[text.toLowerCase()] || text || "正常";
}

function normalizeModels(value, options = {}) {
  const fallbackToDefaults = options.fallbackToDefaults !== false;
  const rows = unwrapList(value, ["models", "items", "rows"]);
  const sourceRows = rows.length ? rows : fallbackToDefaults ? AI_MODEL_OPTIONS : [];
  return sourceRows.map((item) => ({
    id: item.id || item.key || item.modelId || item.name,
    name: displayModelName(item.label || item.title || item.name || item.id || item.modelId),
    provider: displayProviderName(item.provider || item.vendor),
    contextLimit: normalizeNumber(item.contextLimit ?? item.maxContext ?? item.context_limit, 0),
    recommended: normalizeBoolean(item.recommended)
  }));
}

function normalizeDocuments(value) {
  const rows = unwrapList(value, ["documents", "items", "rows"]);
  return rows.map((item, index) => ({
    id: item.id || item.documentId || `doc-${index}`,
    title: item.title || item.name || "未命名资料",
    category: item.category || item.type || "业务资料",
    summary: item.summary || item.description || item.contentPreview || "暂无摘要",
    content: item.content || item.body || item.text || "",
    scope: normalizeDocumentScope(item.scope),
    scopeTargetId: item.scopeTargetId || item.targetId || item.projectId || item.departmentId || item.userId || "",
    scopeTargetName: item.scopeTargetName || item.targetName || item.projectName || item.departmentName || item.userName || "",
    scopeLabel: formatDocumentScope(item),
    source: item.source || item.origin || "后台资料库",
    status: normalizeDocumentStatus(item.status || (normalizeBoolean(item.enabled, true) ? "active" : "archived")),
    updatedAt: item.updatedAt || item.updated_at || item.createdAt || "-"
  }));
}

function normalizeUsageLogs(value) {
  const rows = unwrapList(value, ["logs", "items", "rows", "usageLogs"]);
  return rows.map((item, index) => ({
    id: item.id || item.logId || `log-${index}`,
    user: item.user || item.username || item.operator || "未知用户",
    action: displayActionLabel(item.action || item.scene || item.promptType),
    modelName: displayModelName(item.modelName || item.model || item.modelId),
    scopeLabel: formatScopeLabel(item.scopeLabel || item.scope || item.scopes || item.knowledgeScopes),
    searched: normalizeBoolean(
      item.searched ?? item.allowWebSearch ?? item.webSearch ?? item.webSearchUsed ?? item.webSearchEnabled ?? item.networkEnabled ?? item.online
    ),
    tokens: normalizeNumber(item.tokens ?? item.tokenCount ?? item.usage?.totalTokens, 0),
    duration: normalizeNumber(item.duration ?? item.durationMs ?? item.latencyMs, 0),
    status: displayStatusLabel(item.status),
    time: item.time || item.createdAt || item.created_at || "-"
  }));
}

function unwrapData(response) {
  if (response?.data !== undefined) return response.data;
  return response;
}

function unwrapList(response, keys = []) {
  const data = unwrapData(response);
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function pickDocument(response, fallback = {}) {
  const data = unwrapData(response);
  return data?.document || data?.data?.document || data?.data || data || fallback;
}

function formatScopeLabel(value) {
  if (Array.isArray(value)) {
    return value.map((item) => SCOPE_LABELS[String(item).trim()] || String(item).trim()).filter(Boolean).join("、");
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.includes("、") || /[\u4e00-\u9fa5]/.test(text)) return text;
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => SCOPE_LABELS[item] || item)
    .join("、");
}

function markApiUnavailable(errorOrMessage = "后台 AI 接口请求失败。", suffix = "已保留当前页面状态。") {
  apiNotice.value =
    typeof errorOrMessage === "string"
      ? errorOrMessage
      : `${aiErrorMessage(errorOrMessage, "后台 AI 接口请求失败。")}${suffix ? ` ${suffix}` : ""}`;
}

function buildConfigPayload() {
  const payload = {
    enabled: Boolean(configForm.enabled),
    modelId: configForm.modelId,
    defaultModel: configForm.modelId,
    fallbackModel: configForm.fallbackModel || AI_CONFIG_DEFAULTS.fallbackModel,
    webSearchEnabled: Boolean(configForm.allowWebSearch),
    knowledgeScopes: [...configForm.knowledgeScopes],
    maxContextMessages: Number(configForm.maxContextMessages || AI_CONFIG_DEFAULTS.maxContextMessages),
    maxMessageChars: Number(configForm.maxMessageChars || configForm.maxContext),
    maxContext: Number(configForm.maxContext),
    temperature: Number(configForm.temperature),
    openingTemplate: configForm.openingTemplate,
    systemPrompt: configForm.openingTemplate
  };
  const homeApiKey = String(configForm.homeApiKey || "").trim();
  const hrApiKey = String(configForm.hrApiKey || "").trim();
  if (homeApiKey) payload.homeApiKey = homeApiKey;
  if (hrApiKey) payload.hrApiKey = hrApiKey;
  return payload;
}

function buildDocumentPayload() {
  return {
    title: documentForm.title.trim(),
    category: documentForm.category.trim(),
    source: documentForm.source.trim(),
    summary: documentForm.summary.trim(),
    content: documentForm.content.trim(),
    scope: normalizeDocumentScope(documentForm.scope),
    scopeTargetId: documentForm.scopeTargetId.trim(),
    scopeTargetName: documentForm.scopeTargetName.trim(),
    status: normalizeDocumentStatus(documentForm.status)
  };
}

async function loadRemoteData() {
  loading.value = true;
  apiNotice.value = "";
  const results = await Promise.allSettled([
    adminApi.getAiConfig(),
    adminApi.listAiModels(),
    adminApi.listAiDocuments(),
    adminApi.listAiUsageLogs()
  ]);

  const [configResult, modelResult, documentResult, usageResult] = results;
  if (configResult.status === "fulfilled") applyConfig(unwrapData(configResult.value)?.config || unwrapData(configResult.value));
  if (modelResult.status === "fulfilled") models.value = normalizeModels(modelResult.value, { fallbackToDefaults: false });
  if (documentResult.status === "fulfilled") documents.value = normalizeDocuments(documentResult.value);
  if (usageResult.status === "fulfilled") usageLogs.value = normalizeUsageLogs(usageResult.value);
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected) markApiUnavailable(rejected.reason);
  loading.value = false;
}

async function saveConfig() {
  saving.value = true;
  try {
    const payload = buildConfigPayload();
    const response = await adminApi.updateAiConfig(payload);
    const responseData = unwrapData(response);
    const responseConfig = responseData?.config || responseData || {};
    applyConfig(mergeSavedKeyState({ ...payload, ...responseConfig }, {
      home: Boolean(payload.homeApiKey),
      hr: Boolean(payload.hrApiKey)
    }));
    apiNotice.value = "智能配置已保存。";
  } catch (error) {
    markApiUnavailable(error, "本次修改已暂存在页面中。");
  } finally {
    saving.value = false;
  }
}

function mergeSavedKeyState(source = {}, submitted = {}) {
  const homeConfigured = Boolean(
    submitted.home ||
      source.homeApiKeyConfigured ||
      source.homeConfigured ||
      source.keyStatus?.homeConfigured ||
      configForm.homeApiKeyConfigured
  );
  const hrConfigured = Boolean(
    submitted.hr ||
      source.hrApiKeyConfigured ||
      source.hrConfigured ||
      source.keyStatus?.hrConfigured ||
      configForm.hrApiKeyConfigured
  );
  return {
    ...source,
    homeApiKeyConfigured: homeConfigured,
    hrApiKeyConfigured: hrConfigured,
    homeApiKeyMasked: source.homeApiKeyMasked || source.homeMasked || configForm.homeApiKeyMasked || "",
    hrApiKeyMasked: source.hrApiKeyMasked || source.hrMasked || configForm.hrApiKeyMasked || "",
    homeApiKey: "",
    hrApiKey: ""
  };
}

function toggleScope(scopeKey) {
  if (configForm.knowledgeScopes.includes(scopeKey)) {
    configForm.knowledgeScopes = configForm.knowledgeScopes.filter((item) => item !== scopeKey);
    return;
  }
  configForm.knowledgeScopes = [...configForm.knowledgeScopes, scopeKey];
}

function editDocument(item) {
  editingDocumentId.value = item.id;
  applyDocumentForm(item);
}

function resetDocumentForm() {
  editingDocumentId.value = "";
  applyDocumentForm();
}

async function submitDocument() {
  const payload = buildDocumentPayload();
  if (!payload.title) {
    apiNotice.value = "请先填写智能资料文档标题。";
    return;
  }
  if (!payload.content) {
    apiNotice.value = "请先填写智能资料文档正文。";
    return;
  }
  documentSaving.value = true;
  try {
    if (editingDocumentId.value) {
      const response = await adminApi.updateAiDocument(editingDocumentId.value, payload);
      const next = normalizeDocuments([pickDocument(response, { id: editingDocumentId.value, ...payload })])[0];
      documents.value = documents.value.map((item) => (item.id === editingDocumentId.value ? next : item));
      apiNotice.value = "智能资料文档已保存。";
    } else {
      const response = await adminApi.createAiDocument(payload);
      const created = normalizeDocuments([pickDocument(response, { id: `doc-local-${Date.now()}`, updatedAt: "刚刚", ...payload })])[0];
      documents.value = [created, ...documents.value];
      apiNotice.value = "智能资料文档已新增。";
    }
    resetDocumentForm();
  } catch (error) {
    markApiUnavailable(error, "智能资料文档未提交成功。");
  } finally {
    documentSaving.value = false;
  }
}

async function toggleDocument(item) {
  const nextStatus = item.status === "archived" ? "active" : "archived";
  const previous = documents.value;
  documents.value = documents.value.map((row) => (row.id === item.id ? { ...row, status: nextStatus } : row));
  try {
    await adminApi.updateAiDocument(item.id, { status: nextStatus });
  } catch (error) {
    documents.value = previous;
    markApiUnavailable(error, "智能资料文档状态未提交成功。");
  }
}

async function deleteDocument(item) {
  const confirmed = typeof window === "undefined" || window.confirm(`确认删除智能资料文档「${item.title}」吗？删除后不可在当前页面恢复。`);
  if (!confirmed) return;
  const previous = documents.value;
  documents.value = documents.value.filter((row) => row.id !== item.id);
  try {
    await adminApi.deleteAiDocument(item.id, { confirm: true, reason: "管理员在智能配置页确认删除" });
    apiNotice.value = "智能资料文档已删除。";
  } catch (error) {
    documents.value = previous;
    markApiUnavailable(error, "智能资料文档删除未提交成功。");
  }
}

function statusLabel(value) {
  if (value === "archived") return "停用";
  if (value === "draft") return "草稿";
  return "启用";
}

function searchLabel(value) {
  return value ? "允许联网" : "未联网";
}
</script>

<template>
  <section class="ai-config-page" aria-label="智能配置">
    <header class="ai-config-header">
      <div>
        <h2>智能配置</h2>
        <p>统一管理后台智能问答的模型、知识范围、资料文档和使用记录。</p>
      </div>
      <div class="ai-config-actions">
        <button class="console-ghost-button" type="button" :disabled="loading" @click="loadRemoteData">
          <Refresh aria-hidden="true" />
          刷新
        </button>
        <button class="console-primary-button" type="button" :disabled="saving" @click="saveConfig">
          {{ saving ? "保存中" : "保存配置" }}
        </button>
      </div>
    </header>

    <p v-if="apiNotice" class="ai-config-notice">{{ apiNotice }}</p>

    <div class="ai-config-metrics">
      <article v-for="item in metrics" :key="item.key" :data-tone="item.tone">
        <small>{{ item.label }}</small>
        <strong>{{ item.value }}</strong>
      </article>
    </div>

    <div class="ai-config-layout">
      <section class="ai-config-card ai-config-card--main">
        <div class="ai-config-card-head">
          <div>
            <strong>模型与开关</strong>
            <span>控制后台智能问答能力是否对管理员开放。</span>
          </div>
        </div>

        <div class="ai-config-form-grid">
          <label class="ai-config-field ai-config-field--wide">
            <span>当前模型</span>
            <select v-model="configForm.modelId">
              <option v-for="model in models" :key="model.id" :value="model.id">
                {{ model.name }} · {{ model.provider }} · 上下文 {{ model.contextLimit || "未标注" }}
              </option>
            </select>
          </label>

          <label class="ai-config-switch">
            <input v-model="configForm.enabled" type="checkbox" />
            <span>
              <strong>启用后台智能问答</strong>
              <small>{{ configForm.enabled ? "当前可用" : "当前停用" }}</small>
            </span>
          </label>

          <label class="ai-config-switch">
            <input v-model="configForm.allowWebSearch" type="checkbox" />
            <span>
              <strong>允许联网搜索</strong>
              <small>{{ configForm.allowWebSearch ? "可检索外部资料" : "仅使用站内资料" }}</small>
            </span>
          </label>

          <label class="ai-config-field">
            <span>最大上下文</span>
            <input v-model.number="configForm.maxContext" type="number" min="1000" step="1000" />
          </label>

          <label class="ai-config-field">
            <span>首页 DeepSeek 密钥</span>
            <input
              v-model.trim="configForm.homeApiKey"
              type="password"
              autocomplete="off"
              placeholder="留空则保持当前配置"
            />
            <em>{{ homeKeyStatusText }}</em>
          </label>

          <label class="ai-config-field">
            <span>人力 DeepSeek 密钥</span>
            <input
              v-model.trim="configForm.hrApiKey"
              type="password"
              autocomplete="off"
              placeholder="留空则保持当前配置"
            />
            <em>{{ hrKeyStatusText }}</em>
          </label>

          <label class="ai-config-field">
            <span>随机度（温度）</span>
            <input v-model.number="configForm.temperature" type="range" min="0" max="1" step="0.05" />
            <em>{{ Number(configForm.temperature).toFixed(2) }}</em>
          </label>
        </div>

        <section class="ai-config-scope">
          <div class="ai-config-card-head ai-config-card-head--compact">
            <div>
              <strong>知识范围</strong>
              <span>当前选择：{{ scopeSummary }}</span>
            </div>
          </div>
          <div class="ai-config-scope-grid">
            <button
              v-for="scope in scopeOptions"
              :key="scope.key"
              type="button"
              :class="{ active: configForm.knowledgeScopes.includes(scope.key) }"
              @click="toggleScope(scope.key)"
            >
              <strong>{{ scope.label }}</strong>
              <small>{{ scope.description }}</small>
            </button>
          </div>
        </section>

        <label class="ai-config-field ai-config-field--wide">
          <span>回答开场模板</span>
          <textarea v-model="configForm.openingTemplate" rows="4"></textarea>
        </label>
      </section>

      <aside class="ai-config-card ai-config-side">
        <div class="ai-config-card-head">
          <div>
            <strong>模型清单</strong>
            <span>来自后端模型接口，失败时显示可选模型清单。</span>
          </div>
        </div>
        <div class="ai-model-list">
          <button
            v-for="model in models"
            :key="model.id"
            type="button"
            :class="{ active: configForm.modelId === model.id }"
            @click="configForm.modelId = model.id"
          >
            <span>
              <strong>{{ model.name }}</strong>
              <small>{{ model.provider }} · 上下文 {{ model.contextLimit || "未标注" }}</small>
            </span>
            <em v-if="model.recommended">推荐</em>
          </button>
        </div>
      </aside>
    </div>

    <section class="ai-config-card">
      <div class="ai-config-card-head">
        <div>
          <strong>智能资料文档</strong>
          <span>维护可被智能问答引用的后台资料，支持新增、编辑、停用与删除。</span>
        </div>
        <label class="ai-config-search">
          <Search aria-hidden="true" />
          <input v-model="documentQuery" type="search" placeholder="搜索智能资料文档" />
        </label>
      </div>

      <form class="ai-document-form" @submit.prevent="submitDocument">
        <label>
          <span>标题</span>
          <input v-model="documentForm.title" type="text" placeholder="填写资料标题" />
        </label>
        <label>
          <span>分类</span>
          <input v-model="documentForm.category" type="text" placeholder="例如流程资料" />
        </label>
        <label>
          <span>来源</span>
          <input v-model="documentForm.source" type="text" placeholder="资料来源" />
        </label>
        <label>
          <span>可见范围</span>
          <select v-model="documentForm.scope">
            <option v-for="scope in DOCUMENT_SCOPE_OPTIONS" :key="scope.value" :value="scope.value">
              {{ scope.label }}
            </option>
          </select>
        </label>
        <label v-if="['department', 'project', 'self'].includes(documentForm.scope)">
          <span>范围对象</span>
          <input v-model="documentForm.scopeTargetId" type="text" placeholder="填写部门编号、项目编号或用户编号" />
        </label>
        <label v-if="['department', 'project', 'self'].includes(documentForm.scope)">
          <span>对象名称</span>
          <input v-model="documentForm.scopeTargetName" type="text" placeholder="填写便于识别的名称" />
        </label>
        <label class="ai-document-form__summary">
          <span>摘要</span>
          <input v-model="documentForm.summary" type="text" placeholder="简要说明文档内容" />
        </label>
        <label class="ai-document-form__content">
          <span>正文</span>
          <textarea v-model="documentForm.content" rows="4" placeholder="填写可被智能问答引用的完整正文"></textarea>
        </label>
        <div class="ai-document-form__actions">
          <span>{{ documentFormTitle }}</span>
          <button class="console-ghost-button" type="button" @click="resetDocumentForm">清空</button>
          <button class="console-primary-button" type="submit" :disabled="documentSaving">
            <DocumentAdd aria-hidden="true" />
            {{ documentSaving ? "提交中" : documentSubmitLabel }}
          </button>
        </div>
      </form>

      <div class="ai-document-table" role="table">
        <div class="ai-document-row ai-document-row--head" role="row">
          <span>资料标题</span>
          <span>分类</span>
          <span>可见范围</span>
          <span>状态</span>
          <span>更新时间</span>
          <span>操作</span>
        </div>
        <div v-for="item in filteredDocuments" :key="item.id" class="ai-document-row" role="row">
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.summary }}</small>
          </span>
          <span>{{ item.category }}</span>
          <span>{{ item.scopeLabel }}</span>
          <span><em class="console-status-pill" :data-tone="item.status === 'archived' ? 'muted' : 'success'">{{ statusLabel(item.status) }}</em></span>
          <span>{{ item.updatedAt }}</span>
          <span class="ai-row-actions">
            <button type="button" title="编辑" aria-label="编辑智能资料文档" @click="editDocument(item)">
              <EditPen aria-hidden="true" />
            </button>
            <button type="button" :title="item.status === 'archived' ? '启用' : '停用'" aria-label="切换智能资料文档状态" @click="toggleDocument(item)">
              <SwitchButton aria-hidden="true" />
            </button>
            <button type="button" title="删除" aria-label="删除智能资料文档" data-tone="danger" @click="deleteDocument(item)">
              <Delete aria-hidden="true" />
            </button>
          </span>
        </div>
        <div v-if="!filteredDocuments.length" class="ai-config-empty">暂无智能资料文档</div>
      </div>
    </section>

    <section class="ai-config-card">
      <div class="ai-config-card-head">
        <div>
          <strong>智能使用记录</strong>
          <span>展示后台智能问答调用记录、知识范围、联网状态和消耗。</span>
        </div>
        <label class="ai-config-search">
          <Search aria-hidden="true" />
          <input v-model="usageQuery" type="search" placeholder="搜索智能使用记录" />
        </label>
      </div>

      <div class="ai-usage-table" role="table">
        <div class="ai-usage-row ai-usage-row--head" role="row">
          <span>时间</span>
          <span>用户</span>
          <span>场景</span>
          <span>模型</span>
          <span>知识范围</span>
          <span>联网</span>
          <span>消耗</span>
          <span>状态</span>
        </div>
        <div v-for="item in filteredUsageLogs" :key="item.id" class="ai-usage-row" role="row">
          <span>{{ item.time }}</span>
          <span>{{ item.user }}</span>
          <span>{{ item.action }}</span>
          <span>{{ item.modelName }}</span>
          <span>{{ item.scopeLabel || "未记录" }}</span>
          <span>{{ searchLabel(item.searched) }}</span>
          <span>{{ item.tokens }} 字 · {{ item.duration }} 毫秒</span>
          <span><em class="console-status-pill" :data-tone="item.status === '正常' ? 'success' : 'warning'">{{ item.status }}</em></span>
        </div>
        <div v-if="!filteredUsageLogs.length" class="ai-config-empty">暂无智能使用记录</div>
      </div>
    </section>
  </section>
</template>
