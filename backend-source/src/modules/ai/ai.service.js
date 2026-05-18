import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import {
  HOME_DEEPSEEK_KEY_FIELD,
  HR_DEEPSEEK_KEY_FIELD,
  maskAiKey,
  resolveHomeDeepSeekApiKeyFromConfig,
  resolveHrDeepSeekApiKeyFromConfig,
  syncProcessDeepSeekKeysFromConfig
} from "../../config/aiKeys.js";
import { normalizeRole } from "../../middlewares/auth.js";
import { createJsonStore } from "./jsonStore.js";

const DEEPSEEK_KEY_COMPAT_ENV_NAMES = ["DEEPSEEK_HOME_API_KEY", "DEEPSEEK_HR_API_KEY", "DEEPSEEK_API_KEY"];
const HOME_DEEPSEEK_KEY_PAYLOAD_FIELDS = [
  HOME_DEEPSEEK_KEY_FIELD,
  "homeApiKey",
  "homeDeepseekApiKey",
  "homeDeepSeekKey",
  "home_deepseek_api_key",
  "home_deepseek_key",
  "deepseekHomeApiKey",
  "deepseekHomeKey"
];
const HR_DEEPSEEK_KEY_PAYLOAD_FIELDS = [
  HR_DEEPSEEK_KEY_FIELD,
  "hrApiKey",
  "hrDeepseekApiKey",
  "hrDeepSeekKey",
  "hr_deepseek_api_key",
  "hr_deepseek_key",
  "deepseekHrApiKey",
  "deepseekHrKey"
];
const MODEL_ALIASES = new Map([
  ["deepseek-v4-flash", "deepseek-v4-flash"],
  ["deepseek-v4-pro", "deepseek-v4-pro"],
  ["deepseek-fourth-flash", "deepseek-v4-flash"],
  ["deepseek-fourth-pro", "deepseek-v4-pro"],
  ["deepseek-chat", "deepseek-v4-flash"],
  ["deepseek-reasoner", "deepseek-v4-pro"],
  ["flash", "deepseek-v4-flash"],
  ["pro", "deepseek-v4-pro"]
]);

const DOCUMENT_STATUSES = new Set(["active", "archived", "draft"]);
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_FALLBACK_MODEL = "deepseek-v4-pro";
const DEFAULT_KNOWLEDGE_SCOPES = ["tasks", "comments", "schedule", "documents"];
const GENERIC_WORKSPACE_SCOPES = new Set(["global", "workspace", "home", "self"]);
const SCOPE_KIND_VALUES = new Set([
  ...GENERIC_WORKSPACE_SCOPES,
  "project",
  "projects",
  "department",
  "departments",
  "dept",
  "team",
  "teams",
  "user",
  "users",
  "personal"
]);
const SCOPE_TARGET_ID_FIELDS = ["scopeTargetId", "sourceScope", "sourceScopeId", "targetId", "projectId", "departmentId", "userId"];
const SCOPE_TARGET_NAME_FIELDS = [
  "scopeTargetName",
  "sourceScopeName",
  "targetName",
  "projectName",
  "departmentName",
  "userName"
];
const SECRET_FIELD_NAMES = new Set([
  "apikey",
  "deepseekapikey",
  "deepseekkey",
  "homedeepseekapikey",
  "hrdeepseekapikey",
  "deepseekhomeapikey",
  "deepseekhrapikey",
  "deepseekhomekey",
  "deepseekhrkey",
  "authorization",
  "token",
  "secret"
]);
const ALLOWED_CONFIG_SECRET_FIELD_NAMES = new Set([...HOME_DEEPSEEK_KEY_PAYLOAD_FIELDS, ...HR_DEEPSEEK_KEY_PAYLOAD_FIELDS]);
const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\b(?:api[_-]?key|deepseek[_-]?api[_-]?key|authorization|token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi
];
const DEFAULT_DOCUMENTS = { documents: [], deletedDocuments: [] };
const DEFAULT_LOGS = { logs: [] };
const WEB_SEARCH_AVAILABLE = false;
const AI_KEY_NOT_CONFIGURED_CODE = "AI_KEY_NOT_CONFIGURED";
const AI_DISABLED_CODE = "AI_DISABLED";
const AI_UPSTREAM_UNAVAILABLE_CODE = "AI_UPSTREAM_UNAVAILABLE";
const AI_PROBE_READY_CODE = "AI_PROBE_READY";
const DEFAULT_CONFIG = {
  enabled: true,
  defaultModel: normalizeModel(env.ai?.defaultModel, DEFAULT_MODEL),
  fallbackModel: normalizeModel(env.ai?.fallbackModel, DEFAULT_FALLBACK_MODEL),
  webSearchEnabled: false,
  knowledgeScopes: DEFAULT_KNOWLEDGE_SCOPES,
  maxContextMessages: 8,
  maxMessageChars: 2000,
  temperature: 0.3,
  systemPrompt: "You are the MIX workspace AI assistant. Keep answers concise, actionable, and grounded in workspace data.",
  [HOME_DEEPSEEK_KEY_FIELD]: "",
  [HR_DEEPSEEK_KEY_FIELD]: ""
};

const configStore = createJsonStore("config.json", DEFAULT_CONFIG);
const logStore = createJsonStore("usage-logs.json", DEFAULT_LOGS);
const documentStore = createJsonStore("documents.json", DEFAULT_DOCUMENTS);

function buildHttpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function trimText(value, maxLength = 2000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeDocumentStatus(value, fallback = "active") {
  const text = trimText(value, 32).toLowerCase();
  if (!text) return fallback;
  if (["enabled", "enable", "active", "open", "on", "true", "1", "yes"].includes(text)) {
    return "active";
  }
  if (["disabled", "disable", "archived", "archive", "closed", "off", "false", "0", "no"].includes(text)) {
    return "archived";
  }
  return DOCUMENT_STATUSES.has(text) ? text : fallback;
}

function normalizePositiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeDecimal(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeModel(value, fallback = DEFAULT_MODEL) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return fallback;
  return MODEL_ALIASES.get(clean) || fallback;
}

function normalizeScopes(value = DEFAULT_KNOWLEDGE_SCOPES) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const scopes = source.map((item) => trimText(item, 48)).filter(Boolean);
  return scopes.length ? [...new Set(scopes)].slice(0, 12) : DEFAULT_KNOWLEDGE_SCOPES;
}

function splitScopeValues(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return source.map((item) => trimText(item, 64).toLowerCase()).filter(Boolean);
}

function firstPresentValue(payload = {}, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  }
  return "";
}

function hasAnyOwnProperty(payload = {}, keys = []) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

function actorScopeValues(auth = {}) {
  return [
    auth.department,
    auth.departmentId,
    auth.departmentUid,
    auth.department_uid,
    auth.departments,
    auth.departmentIds,
    auth.departmentUids,
    auth.projectId,
    auth.projectUid,
    auth.project_uid,
    auth.projects,
    auth.projectIds,
    auth.projectUids
  ].flatMap((value) => splitScopeValues(value));
}

function redactSecrets(value, maxLength = 2000) {
  let text = trimText(value, maxLength);
  for (const pattern of SECRET_VALUE_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  return text;
}

function safeFailureReason(value, fallback = "AI service unavailable", maxLength = 180) {
  const clean = redactSecrets(value || fallback, maxLength);
  return clean || fallback;
}

function containsSecretValue(value) {
  if (typeof value !== "string") return false;
  return SECRET_VALUE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function resolveHomeDeepSeekApiKey(config = {}) {
  return resolveHomeDeepSeekApiKeyFromConfig(config);
}

function resolveHrDeepSeekApiKey(config = {}) {
  return resolveHrDeepSeekApiKeyFromConfig(config);
}

function isHrDeepSeekConfigured(config = {}) {
  return Boolean(resolveHrDeepSeekApiKey(config));
}

function isHomeDeepSeekConfigured(config = {}) {
  return Boolean(resolveHomeDeepSeekApiKey(config));
}

function isAiConfigurationError(error) {
  return error?.code === AI_KEY_NOT_CONFIGURED_CODE || error?.code === AI_DISABLED_CODE;
}

function buildAiUpstreamError(error, fallbackMessage = "AI service is temporarily unavailable", statusCode = 503) {
  const failureReason = safeFailureReason(error?.message, "", 180);
  const message = failureReason ? `${fallbackMessage}: ${failureReason}` : fallbackMessage;
  return buildHttpError(statusCode, message, AI_UPSTREAM_UNAVAILABLE_CODE);
}

function publicConfig(config = {}) {
  const storedWebSearchEnabled = normalizeBoolean(config.webSearchEnabled, false);
  const homeKey = resolveHomeDeepSeekApiKey(config);
  const hrKey = resolveHrDeepSeekApiKey(config);
  const homeConfigured = Boolean(homeKey);
  const hrConfigured = Boolean(hrKey);
  return {
    enabled: normalizeBoolean(config.enabled, true),
    provider: "deepseek",
    configured: homeConfigured,
    isConfigured: homeConfigured,
    apiKeyConfigured: homeConfigured,
    hasApiKey: homeConfigured,
    homeConfigured,
    hrConfigured,
    homeApiKeyConfigured: homeConfigured,
    hrApiKeyConfigured: hrConfigured,
    homeMasked: maskAiKey(homeKey),
    hrMasked: maskAiKey(hrKey),
    homeApiKeyMasked: maskAiKey(homeKey),
    hrApiKeyMasked: maskAiKey(hrKey),
    masked: {
      home: maskAiKey(homeKey),
      hr: maskAiKey(hrKey)
    },
    keyStatus: {
      homeConfigured,
      hrConfigured
    },
    defaultModel: normalizeModel(config.defaultModel, DEFAULT_CONFIG.defaultModel),
    modelId: normalizeModel(config.defaultModel, DEFAULT_CONFIG.defaultModel),
    fallbackModel: normalizeModel(config.fallbackModel, DEFAULT_CONFIG.fallbackModel),
    webSearchEnabled: WEB_SEARCH_AVAILABLE && storedWebSearchEnabled,
    allowWebSearch: WEB_SEARCH_AVAILABLE && storedWebSearchEnabled,
    storedWebSearchEnabled,
    webSearchRequested: storedWebSearchEnabled,
    knowledgeScopes: normalizeScopes(config.knowledgeScopes),
    maxContextMessages: normalizePositiveInt(config.maxContextMessages, DEFAULT_CONFIG.maxContextMessages, 1, 20),
    maxMessageChars: normalizePositiveInt(config.maxMessageChars, DEFAULT_CONFIG.maxMessageChars, 200, 8000),
    maxContext: normalizePositiveInt(config.maxMessageChars, DEFAULT_CONFIG.maxMessageChars, 200, 8000),
    temperature: normalizeDecimal(config.temperature, DEFAULT_CONFIG.temperature, 0, 1),
    systemPrompt: redactSecrets(config.systemPrompt || DEFAULT_CONFIG.systemPrompt, 1200),
    openingTemplate: redactSecrets(config.systemPrompt || DEFAULT_CONFIG.systemPrompt, 1200),
    availableModels: listModels()
  };
}

function buildAvailabilityResponse(config = {}, options = {}) {
  const publicState = publicConfig(config);
  const scope = trimText(options.scope || "home", 32).toLowerCase() === "hr" ? "hr" : "home";
  const configured = scope === "hr" ? publicState.hrApiKeyConfigured : publicState.homeApiKeyConfigured;
  const service = scope === "hr" ? "assignment-advice" : "home-assistant";
  const enabled = normalizeBoolean(config.enabled, true);
  const ready = enabled && configured;
  return {
    ok: ready,
    status: ready ? "ready" : enabled ? "key_not_configured" : "disabled",
    code: ready ? AI_PROBE_READY_CODE : enabled ? AI_KEY_NOT_CONFIGURED_CODE : AI_DISABLED_CODE,
    provider: "deepseek",
    service,
    scope,
    enabled,
    configured,
    apiKeyConfigured: configured,
    homeApiKeyConfigured: publicState.homeApiKeyConfigured,
    hrApiKeyConfigured: publicState.hrApiKeyConfigured,
    model: publicState.modelId,
    modelId: publicState.modelId,
    message: ready
      ? `Backend AI proxy is available for ${service}.`
      : !enabled
        ? "AI chat is disabled."
      : `DeepSeek ${scope === "hr" ? "HR" : "home"} API key is not configured.`
  };
}

function actorId(auth = {}) {
  return trimText(auth.sub || auth.id || auth.userId || auth.userUid || auth.username || "anonymous", 128);
}

function actorName(auth = {}) {
  return trimText(auth.name || auth.username || auth.sub || "anonymous", 128);
}

function cleanConversationId(value) {
  const clean = redactSecrets(value, 96);
  if (!clean) return `conv_${randomUUID()}`;
  return clean.replace(/[^\w.-]/g, "_").slice(0, 96) || `conv_${randomUUID()}`;
}

function makeMessageId() {
  return `msg_${randomUUID()}`;
}

function latestUserMessage(payload = {}) {
  const direct = trimText(payload.message || payload.question || payload.query);
  if (direct) return direct;

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index] || {};
    if (String(item.role || "user") !== "user") continue;
    const content = trimText(item.content || item.message || item.text);
    if (content) return content;
  }
  return "";
}

function normalizeScopeTarget(payload = {}, scope = "") {
  const explicitTargetId = trimText(firstPresentValue(payload, SCOPE_TARGET_ID_FIELDS), 128);
  const cleanScope = trimText(scope, 128);
  const inferredTargetId =
    explicitTargetId || (cleanScope && !SCOPE_KIND_VALUES.has(cleanScope.toLowerCase()) ? cleanScope : "");

  return {
    scopeTargetId: redactSecrets(inferredTargetId, 128),
    scopeTargetName: redactSecrets(firstPresentValue(payload, SCOPE_TARGET_NAME_FIELDS), 160)
  };
}

function normalizeChatPayload(payload = {}, config = DEFAULT_CONFIG) {
  const message = redactSecrets(
    latestUserMessage(payload),
    normalizePositiveInt(config.maxMessageChars, DEFAULT_CONFIG.maxMessageChars, 200, 8000)
  );
  if (!message) throw buildHttpError(400, "message is required");

  const scope = redactSecrets(payload.scope || "workspace", 64) || "workspace";
  const scopeTarget = normalizeScopeTarget(payload, scope);
  const model = normalizeModel(payload.model, normalizeModel(config.defaultModel, DEFAULT_CONFIG.defaultModel));
  const webSearchRequested = normalizeBoolean(payload.webSearch, false);
  const webSearchUsed = WEB_SEARCH_AVAILABLE && normalizeBoolean(config.webSearchEnabled, false) && webSearchRequested;

  return {
    message,
    scope,
    ...scopeTarget,
    model,
    webSearchRequested,
    webSearchUsed,
    conversationId: cleanConversationId(payload.conversationId)
  };
}

function sanitizeContextMessages(contextOrMessages = [], messagesOrConfig = DEFAULT_CONFIG, maybeConfig = DEFAULT_CONFIG) {
  const hasExplicitMessages = Array.isArray(messagesOrConfig);
  const messages = hasExplicitMessages
    ? messagesOrConfig
    : Array.isArray(contextOrMessages)
      ? contextOrMessages
      : [];
  const config = hasExplicitMessages ? maybeConfig : messagesOrConfig;
  const maxContextMessages = normalizePositiveInt(config.maxContextMessages, DEFAULT_CONFIG.maxContextMessages, 1, 20);
  const maxMessageChars = normalizePositiveInt(config.maxMessageChars, DEFAULT_CONFIG.maxMessageChars, 200, 8000);
  const allowedRoles = new Set(["user", "assistant"]);

  return (Array.isArray(messages) ? messages : [])
    .slice(-maxContextMessages)
    .map((item) => {
      const role = String(item?.role || "").trim().toLowerCase();
      return {
        role: allowedRoles.has(role) ? role : "user",
        content: redactSecrets(item?.content || item?.message || item?.text, maxMessageChars)
      };
    })
    .filter((item) => item.content);
}

function authorizedDocumentScopes(scope = "", auth = {}) {
  const cleanScope = trimText(scope, 64).toLowerCase();
  const role = normalizeRole(auth);
  const scopes = new Set(["global", "workspace", "home", "self"]);

  if (cleanScope && scopes.has(cleanScope)) scopes.add(cleanScope);
  if (role === "admin") {
    if (cleanScope) scopes.add(cleanScope);
    actorScopeValues(auth).forEach((item) => scopes.add(item));
    return scopes;
  }

  if (role === "manager") {
    const allowed = new Set([...scopes]);
    actorScopeValues(auth).forEach((item) => allowed.add(item));
    allowed.forEach((item) => scopes.add(item));
    if (cleanScope && allowed.has(cleanScope)) scopes.add(cleanScope);
  }
  return scopes;
}

function authorizedManagerLogScopes(query = {}, auth = {}) {
  const scopes = new Set(actorScopeValues(auth).filter((item) => !GENERIC_WORKSPACE_SCOPES.has(item)));
  const requestedTarget = splitScopeValues(firstPresentValue(query, SCOPE_TARGET_ID_FIELDS)).find(
    (item) => !GENERIC_WORKSPACE_SCOPES.has(item)
  );
  if (requestedTarget) {
    return scopes.has(requestedTarget) ? new Set([requestedTarget]) : new Set();
  }
  const requestedScope = trimText(query.scope, 64).toLowerCase();
  if (requestedScope && SCOPE_KIND_VALUES.has(requestedScope)) {
    return scopes;
  }
  if (requestedScope && !GENERIC_WORKSPACE_SCOPES.has(requestedScope) && scopes.has(requestedScope)) {
    return new Set([requestedScope]);
  }
  return scopes;
}

function logScopeTargetValues(log = {}) {
  return [
    log.scopeTargetId,
    log.sourceScope,
    log.sourceScopeId,
    log.targetId,
    log.projectId,
    log.departmentId
  ]
    .flatMap((value) => splitScopeValues(value))
    .filter((item) => !GENERIC_WORKSPACE_SCOPES.has(item));
}

function managerCanReadLog(log = {}, userId = "", allowedScopes = new Set()) {
  if (log.userId === userId) return true;
  if (logScopeTargetValues(log).some((item) => allowedScopes.has(item))) return true;
  const itemScope = trimText(log.scope, 64).toLowerCase();
  return Boolean(itemScope && !GENERIC_WORKSPACE_SCOPES.has(itemScope) && allowedScopes.has(itemScope));
}

async function activeDocumentSnippets(scope = "", auth = {}, limit = 4) {
  const { documents } = await documentStore.read();
  const allowedScopes = authorizedDocumentScopes(scope, auth);
  return documents
    .filter((item) => normalizeDocumentStatus(item.status) === "active")
    .filter((item) => {
      const documentScope = trimText(item.scope || "global", 64).toLowerCase() || "global";
      return allowedScopes.has(documentScope);
    })
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      scope: item.scope,
      preview: redactSecrets(item.content || item.summary, 240)
    }));
}

function buildSystemPrompt(config, snippets = [], request = {}) {
  const docs = snippets.length
    ? `\n\nReference documents:\n${snippets.map((item, index) => `${index + 1}. ${item.title}: ${item.preview}`).join("\n")}`
    : "";
  const webSearchNote = request.webSearchUsed
    ? "\nUser requested web search, but backend web search is not available; answer from configured workspace context only."
    : "";
  const scopeTargetNote = request.scopeTargetId
    ? `\nCurrent scope target: ${request.scopeTargetName || request.scopeTargetId} (${request.scopeTargetId}).`
    : "";

  return `${redactSecrets(config.systemPrompt || DEFAULT_CONFIG.systemPrompt, 1200)}\nCurrent scope: ${request.scope}.${scopeTargetNote}${webSearchNote}${docs}`;
}

function buildDeepSeekMessages({ config, request, contextMessages, snippets }) {
  return [
    { role: "system", content: buildSystemPrompt(config, snippets, request) },
    ...contextMessages,
    { role: "user", content: request.message }
  ];
}

function stableFallbackAnswer(request = {}, snippets = []) {
  const docNote = snippets.length
    ? `I referenced available workspace material such as "${snippets[0].title}".`
    : "No usable backend knowledge documents are currently available.";
  return [
    "AI service is temporarily unavailable, so this is a local fallback response.",
    docNote,
    `Your question: ${request.message}`,
    "Please clarify goals, deadlines, related projects, or owners so I can help turn this into a task list or draft message."
  ].join("\n");
}

async function callDeepSeek(messages, model, config = DEFAULT_CONFIG) {
  const apiKey = resolveHomeDeepSeekApiKey(config);
  if (!apiKey) throw buildHttpError(503, "DeepSeek home API key is not configured", AI_KEY_NOT_CONFIGURED_CODE);

  const baseUrl = String(env.ai.deepseekBaseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const timeoutMs = normalizePositiveInt(env.ai.timeoutMs, 20000, 1000, 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: normalizeDecimal(config.temperature, DEFAULT_CONFIG.temperature, 0, 1),
        stream: false
      }),
      signal: controller.signal
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw buildHttpError(
        response.status >= 500 ? 503 : 502,
        safeFailureReason(data?.error?.message, "AI service is temporarily unavailable"),
        AI_UPSTREAM_UNAVAILABLE_CODE
      );
    }

    const answer = trimText(data?.choices?.[0]?.message?.content, 12000);
    if (!answer) throw buildHttpError(503, "DeepSeek returned an empty answer");

    return {
      answer,
      usage: {
        promptTokens: Number(data?.usage?.prompt_tokens || 0),
        completionTokens: Number(data?.usage?.completion_tokens || 0),
        totalTokens: Number(data?.usage?.total_tokens || 0)
      }
    };
  } catch (error) {
    if (error?.statusCode) throw error;
    throw buildAiUpstreamError(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function appendUsageLog(log) {
  await logStore.write((state) => {
    const logs = Array.isArray(state.logs) ? state.logs : [];
    logs.push(log);
    return { logs: logs.slice(-1000) };
  });
  return log;
}

function paginate(items = [], query = {}) {
  const page = normalizePositiveInt(query.page, 1, 1, 1_000_000);
  const pageSize = normalizePositiveInt(query.pageSize || query.limit, 20, 1, 100);
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    rows: items.slice(offset, offset + pageSize),
    pagination: {
      page,
      pageSize,
      total: items.length
    }
  };
}

function normalizeDocumentPayload(payload = {}, options = {}) {
  const isCreate = options.mode === "create";
  const title = trimText(payload.title || payload.name, 160);
  const content = trimText(payload.content || payload.body || payload.text, 20000);

  if (isCreate && !title) throw buildHttpError(400, "title is required");
  if (isCreate && !content) throw buildHttpError(400, "content is required");

  const normalized = {};
  if (title) normalized.title = title;
  if (content) normalized.content = content;
  if (Object.prototype.hasOwnProperty.call(payload, "scope")) {
    normalized.scope = trimText(payload.scope || "global", 64) || "global";
  } else if (isCreate) {
    normalized.scope = "global";
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, "scopeTargetId") ||
    Object.prototype.hasOwnProperty.call(payload, "targetId") ||
    Object.prototype.hasOwnProperty.call(payload, "projectId") ||
    Object.prototype.hasOwnProperty.call(payload, "departmentId") ||
    Object.prototype.hasOwnProperty.call(payload, "userId")
  ) {
    normalized.scopeTargetId = trimText(
      payload.scopeTargetId || payload.targetId || payload.projectId || payload.departmentId || payload.userId,
      128
    );
  } else if (isCreate) {
    normalized.scopeTargetId = "";
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, "scopeTargetName") ||
    Object.prototype.hasOwnProperty.call(payload, "targetName") ||
    Object.prototype.hasOwnProperty.call(payload, "projectName") ||
    Object.prototype.hasOwnProperty.call(payload, "departmentName") ||
    Object.prototype.hasOwnProperty.call(payload, "userName")
  ) {
    normalized.scopeTargetName = trimText(
      payload.scopeTargetName || payload.targetName || payload.projectName || payload.departmentName || payload.userName,
      160
    );
  } else if (isCreate) {
    normalized.scopeTargetName = "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "summary")) {
    normalized.summary = trimText(payload.summary, 500);
  } else if (isCreate) {
    normalized.summary = content.slice(0, 240);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "category") || Object.prototype.hasOwnProperty.call(payload, "type")) {
    normalized.category = trimText(payload.category || payload.type, 80);
  } else if (isCreate) {
    normalized.category = "business-material";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "source") || Object.prototype.hasOwnProperty.call(payload, "origin")) {
    normalized.source = trimText(payload.source || payload.origin, 120);
  } else if (isCreate) {
    normalized.source = "admin-knowledge-base";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    normalized.status = normalizeDocumentStatus(payload.status);
  } else if (Object.prototype.hasOwnProperty.call(payload, "enabled")) {
    normalized.status = normalizeBoolean(payload.enabled, true) ? "active" : "archived";
  } else if (isCreate) {
    normalized.status = "active";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "tags")) {
    const tags = Array.isArray(payload.tags) ? payload.tags : String(payload.tags || "").split(",");
    normalized.tags = tags.map((item) => trimText(item, 32)).filter(Boolean).slice(0, 20);
  } else if (isCreate) {
    normalized.tags = [];
  }

  if (!isCreate && !Object.keys(normalized).length) throw buildHttpError(400, "No editable document fields");
  return normalized;
}

function normalizeDocumentDeleteMetadata(payload = {}) {
  const deleteReason = redactSecrets(
    payload.reason || payload.deleteReason || payload.deletionReason || payload.auditReason || payload.note,
    500
  );

  return {
    deleteReason,
    deleteReasonRecorded: Boolean(deleteReason)
  };
}

export function listModels() {
  return [
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek v4 Flash",
      aliases: ["deepseek-fourth-flash", "deepseek-chat", "flash"],
      default: true
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek v4 Pro",
      aliases: ["deepseek-fourth-pro", "deepseek-reasoner", "pro"],
      default: false
    }
  ];
}

export async function getWorkspaceAiSettings() {
  const config = await configStore.read();
  return publicConfig(config);
}

export async function getWorkspaceAiAvailability(scope = "home") {
  const config = await configStore.read();
  return buildAvailabilityResponse(config, { scope });
}

export async function getAdminAiConfig() {
  const config = await configStore.read();
  const homeKey = resolveHomeDeepSeekApiKey(config);
  const hrKey = resolveHrDeepSeekApiKey(config);
  const homeConfigured = Boolean(homeKey);
  const hrConfigured = Boolean(hrKey);
  return {
    ...publicConfig(config),
    provider: "deepseek",
    configured: homeConfigured,
    isConfigured: homeConfigured,
    apiKeyConfigured: homeConfigured,
    hasApiKey: homeConfigured,
    homeConfigured,
    hrConfigured,
    homeApiKeyConfigured: homeConfigured,
    hrApiKeyConfigured: hrConfigured,
    homeMasked: maskAiKey(homeKey),
    hrMasked: maskAiKey(hrKey),
    homeApiKeyMasked: maskAiKey(homeKey),
    hrApiKeyMasked: maskAiKey(hrKey),
    masked: {
      home: maskAiKey(homeKey),
      hr: maskAiKey(hrKey)
    },
    keyStatus: {
      homeConfigured,
      hrConfigured
    }
  };
}

function assertNoSecretFields(payload = {}) {
  const seen = new Set();
  const queue = [{ value: payload, path: "" }];

  while (queue.length) {
    const current = queue.shift();
    if (!current?.value || typeof current.value !== "object" || seen.has(current.value)) continue;
    seen.add(current.value);

    Object.entries(current.value).forEach(([key, value]) => {
      const path = current.path ? `${current.path}.${key}` : key;
      const normalizedKey = key.replace(/[-_\s]/g, "").toLowerCase();
      const isAllowedAdminConfigSecretField = current.path === "" && ALLOWED_CONFIG_SECRET_FIELD_NAMES.has(key);
      if (containsSecretValue(value) && !isAllowedAdminConfigSecretField) {
        throw buildHttpError(400, `Secret value is not allowed: ${path}`);
      }
      if (isSecretFieldName(normalizedKey) && !isAllowedAdminConfigSecretField) {
        throw buildHttpError(400, `Secret field is not allowed: ${path}`);
      }
      if (value && typeof value === "object") queue.push({ value, path });
    });
  }
}

function isSecretFieldName(normalizedKey = "") {
  if (SECRET_FIELD_NAMES.has(normalizedKey)) return true;
  if (/^deepseek(?:home|hr)?apikey$/i.test(normalizedKey)) return true;
  if (/^deepseek(?:home|hr)?key$/i.test(normalizedKey)) return true;
  if (/^(?:deepseek)?(?:home|hr)apikey$/i.test(normalizedKey)) return true;
  if (/^(?:deepseek)?(?:home|hr)key$/i.test(normalizedKey)) return true;
  if (/^deepseek(?:home|hr)?api(?:key)?$/i.test(normalizedKey)) return true;
  if (/^(?:api|deepseek).*(?:key|token|secret)$/i.test(normalizedKey)) return true;
  return false;
}

export async function updateAdminAiConfig(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  assertNoSecretFields(payload);
  const updated = await configStore.write((current) => {
    const next = { ...DEFAULT_CONFIG, ...current };

    if (Object.prototype.hasOwnProperty.call(payload, "enabled")) {
      next.enabled = normalizeBoolean(payload.enabled, true);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "defaultModel")) {
      next.defaultModel = normalizeModel(payload.defaultModel, DEFAULT_CONFIG.defaultModel);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "modelId")) {
      next.defaultModel = normalizeModel(payload.modelId, DEFAULT_CONFIG.defaultModel);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "fallbackModel")) {
      next.fallbackModel = normalizeModel(payload.fallbackModel, DEFAULT_CONFIG.fallbackModel);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "webSearchEnabled")) {
      next.webSearchEnabled = normalizeBoolean(payload.webSearchEnabled, false);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "allowWebSearch")) {
      next.webSearchEnabled = normalizeBoolean(payload.allowWebSearch, false);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "knowledgeScopes")) {
      next.knowledgeScopes = normalizeScopes(payload.knowledgeScopes);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "scopes")) {
      next.knowledgeScopes = normalizeScopes(payload.scopes);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "maxContextMessages")) {
      next.maxContextMessages = normalizePositiveInt(payload.maxContextMessages, DEFAULT_CONFIG.maxContextMessages, 1, 20);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "maxMessageChars")) {
      next.maxMessageChars = normalizePositiveInt(payload.maxMessageChars, DEFAULT_CONFIG.maxMessageChars, 200, 8000);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "maxContext")) {
      next.maxMessageChars = normalizePositiveInt(payload.maxContext, DEFAULT_CONFIG.maxMessageChars, 200, 8000);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "temperature")) {
      next.temperature = normalizeDecimal(payload.temperature, DEFAULT_CONFIG.temperature, 0, 1);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "systemPrompt")) {
      const systemPrompt = trimText(payload.systemPrompt, 1200);
      if (systemPrompt) next.systemPrompt = systemPrompt;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "openingTemplate")) {
      const openingTemplate = trimText(payload.openingTemplate, 1200);
      if (openingTemplate) next.systemPrompt = openingTemplate;
    }
    if (hasAnyOwnProperty(payload, HOME_DEEPSEEK_KEY_PAYLOAD_FIELDS)) {
      next[HOME_DEEPSEEK_KEY_FIELD] = trimText(firstPresentValue(payload, HOME_DEEPSEEK_KEY_PAYLOAD_FIELDS), 4000);
    }
    if (hasAnyOwnProperty(payload, HR_DEEPSEEK_KEY_PAYLOAD_FIELDS)) {
      next[HR_DEEPSEEK_KEY_FIELD] = trimText(firstPresentValue(payload, HR_DEEPSEEK_KEY_PAYLOAD_FIELDS), 4000);
    }

    return next;
  });

  const submittedKeyConfig = {};
  if (hasAnyOwnProperty(payload, HOME_DEEPSEEK_KEY_PAYLOAD_FIELDS)) {
    submittedKeyConfig[HOME_DEEPSEEK_KEY_FIELD] = updated[HOME_DEEPSEEK_KEY_FIELD];
  }
  if (hasAnyOwnProperty(payload, HR_DEEPSEEK_KEY_PAYLOAD_FIELDS)) {
    submittedKeyConfig[HR_DEEPSEEK_KEY_FIELD] = updated[HR_DEEPSEEK_KEY_FIELD];
  }
  syncProcessDeepSeekKeysFromConfig(submittedKeyConfig);
  return getAdminAiConfig(updated);
}

export function assertAdminAccess(auth = {}) {
  if (normalizeRole(auth) !== "admin") {
    throw buildHttpError(403, "Admin permission required");
  }
  return true;
}

export async function chatWithAi(payload = {}, auth = {}) {
  const startedAt = Date.now();
  const config = { ...DEFAULT_CONFIG, ...(await configStore.read()) };
  const request = normalizeChatPayload(payload, config);
  const contextMessages = sanitizeContextMessages(payload.context, payload.messages, config);
  const snippets = await activeDocumentSnippets(request.scope, auth);
  const messages = buildDeepSeekMessages({ config, request, contextMessages, snippets });
  const messageId = makeMessageId();
  const createdAt = nowIso();
  if (!normalizeBoolean(config.enabled, true)) {
    throw buildHttpError(503, "AI chat is disabled", AI_DISABLED_CODE);
  }

  let deepSeekResult;
  try {
    deepSeekResult = await callDeepSeek(messages, request.model, config);
  } catch (error) {
    if (isAiConfigurationError(error)) {
      throw error;
    }
    const failureReason = safeFailureReason(error?.message, "AI service is temporarily unavailable", 180);
    const latencyMs = Date.now() - startedAt;
    await appendUsageLog({
      id: `log_${randomUUID()}`,
      userId: actorId(auth),
      username: actorName(auth),
      role: normalizeRole(auth),
      question: redactSecrets(request.message, 2000),
      answerPreview: "",
      model: request.model,
      webSearchUsed: request.webSearchUsed,
      scope: request.scope,
      scopeTargetId: request.scopeTargetId,
      scopeTargetName: request.scopeTargetName,
      sourceScope: request.scopeTargetId,
      sourceScopeName: request.scopeTargetName,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      retrieval: {
        requestedScope: request.scope,
        scopeTargetId: request.scopeTargetId,
        scopeTargetName: request.scopeTargetName,
        documentCount: snippets.length,
        documentIds: snippets.map((item) => item.id)
      },
      status: "error",
      source: "deepseek",
      failureReason,
      createdAt,
      latencyMs
    });
    throw buildAiUpstreamError(error);
  }

  const answer = deepSeekResult.answer;
  const usage = deepSeekResult.usage;

  const latencyMs = Date.now() - startedAt;
  await appendUsageLog({
    id: `log_${randomUUID()}`,
    userId: actorId(auth),
    username: actorName(auth),
    role: normalizeRole(auth),
    question: redactSecrets(request.message, 2000),
    answerPreview: redactSecrets(answer, 240),
    model: request.model,
    webSearchUsed: request.webSearchUsed,
    scope: request.scope,
    scopeTargetId: request.scopeTargetId,
    scopeTargetName: request.scopeTargetName,
    sourceScope: request.scopeTargetId,
    sourceScopeName: request.scopeTargetName,
    usage,
    retrieval: {
      requestedScope: request.scope,
      scopeTargetId: request.scopeTargetId,
      scopeTargetName: request.scopeTargetName,
      documentCount: snippets.length,
      documentIds: snippets.map((item) => item.id)
    },
    status: "success",
    source: "deepseek",
    failureReason: "",
    createdAt,
    latencyMs
  });

  return {
    answer,
    sources: [
      { type: "deepseek", name: "DeepSeek" },
      ...snippets.map((item) => ({ type: "document", id: item.id, name: item.title, scope: item.scope }))
    ],
    usage,
    conversationId: request.conversationId,
    messageId,
    model: request.model,
    webSearchUsed: request.webSearchUsed,
    scope: request.scope,
    scopeTargetId: request.scopeTargetId,
    scopeTargetName: request.scopeTargetName,
    sourceScope: request.scopeTargetId,
    sourceScopeName: request.scopeTargetName,
    status: "success",
    source: "deepseek",
    createdAt
  };
}

export async function listWorkspaceUsageLogs(query = {}, auth = {}) {
  const userId = actorId(auth);
  const state = await logStore.read();
  const logs = (Array.isArray(state.logs) ? state.logs : [])
    .filter((item) => item.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return paginate(logs, query);
}

export async function listManagerUsageLogs(query = {}, auth = {}) {
  const role = normalizeRole(auth);
  if (role !== "admin" && role !== "manager") {
    throw buildHttpError(403, "Manager permission required");
  }

  const userId = actorId(auth);
  const keyword = trimText(query.keyword || query.q, 120).toLowerCase();
  const status = trimText(query.status, 32).toLowerCase();
  const allowedScopes = authorizedManagerLogScopes(query, auth);
  const state = await logStore.read();
  const logs = (Array.isArray(state.logs) ? state.logs : [])
    .filter((item) => {
      if (role === "admin") return true;
      return managerCanReadLog(item, userId, allowedScopes);
    })
    .filter((item) => !status || item.status === status)
    .filter((item) => {
      if (!keyword) return true;
      return [item.username, item.question, item.answerPreview, item.scope, item.model].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return paginate(logs, query);
}

export async function listAdminUsageLogs(query = {}, auth = {}) {
  assertAdminAccess(auth);
  const state = await logStore.read();
  const keyword = trimText(query.keyword || query.q, 120).toLowerCase();
  const status = trimText(query.status, 32).toLowerCase();
  const logs = (Array.isArray(state.logs) ? state.logs : [])
    .filter((item) => !status || item.status === status)
    .filter((item) => {
      if (!keyword) return true;
      return [item.username, item.question, item.answerPreview, item.scope, item.model].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return paginate(logs, query);
}

export async function listAiDocuments(query = {}, auth = {}) {
  assertAdminAccess(auth);
  const state = await documentStore.read();
  const keyword = trimText(query.keyword || query.q, 120).toLowerCase();
  const scope = trimText(query.scope, 64).toLowerCase();
  const status = normalizeDocumentStatus(query.status, "");
  const documents = (Array.isArray(state.documents) ? state.documents : [])
    .filter((item) => !scope || String(item.scope || "").toLowerCase() === scope)
    .filter((item) => !status || normalizeDocumentStatus(item.status) === status)
    .filter((item) => {
      if (!keyword) return true;
      return [item.title, item.summary, item.content, item.scope].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );
    })
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .map((item) => ({
      ...item,
      status: normalizeDocumentStatus(item.status),
      contentPreview: trimText(item.content, 500),
      contentLength: String(item.content || "").length
    }));
  return paginate(documents, query);
}

export async function createAiDocument(payload = {}, auth = {}) {
  assertAdminAccess(auth);
  assertNoSecretFields(payload);
  const documentPayload = normalizeDocumentPayload(payload, { mode: "create" });
  const createdAt = nowIso();
  const document = {
    id: `doc_${randomUUID()}`,
    ...documentPayload,
    createdBy: actorId(auth),
    createdByName: actorName(auth),
    createdAt,
    updatedAt: createdAt
  };

  await documentStore.write((state) => ({
    ...state,
    documents: [...(Array.isArray(state.documents) ? state.documents : []), document]
  }));

  return document;
}

export async function updateAiDocument(documentId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  assertNoSecretFields(payload);
  const cleanDocumentId = trimText(documentId, 128);
  if (!cleanDocumentId) throw buildHttpError(400, "document id is required");

  const patch = normalizeDocumentPayload(payload, { mode: "update" });
  let updated = null;
  await documentStore.write((state) => {
    const documents = Array.isArray(state.documents) ? state.documents : [];
    const nextDocuments = documents.map((item) => {
      if (item.id !== cleanDocumentId) return item;
      updated = {
        ...item,
        ...patch,
        updatedBy: actorId(auth),
        updatedByName: actorName(auth),
        updatedAt: nowIso()
      };
      return updated;
    });
    if (!updated) throw buildHttpError(404, "AI document not found");
    return { ...state, documents: nextDocuments };
  });

  return updated;
}

export async function deleteAiDocument(documentId, payload = {}, auth = {}) {
  assertAdminAccess(auth);
  const cleanDocumentId = trimText(documentId, 128);
  if (!cleanDocumentId) throw buildHttpError(400, "document id is required");

  let deleted = null;
  let deletionMetadata = null;
  await documentStore.write((state) => {
    const documents = Array.isArray(state.documents) ? state.documents : [];
    const nextDocuments = documents.filter((item) => {
      if (item.id !== cleanDocumentId) return true;
      deleted = item;
      return false;
    });
    if (!deleted) throw buildHttpError(404, "AI document not found");
    const deletedAt = nowIso();
    deletionMetadata = {
      id: `doc_delete_${randomUUID()}`,
      documentId: cleanDocumentId,
      title: trimText(deleted.title, 160),
      scope: trimText(deleted.scope || "global", 64) || "global",
      scopeTargetId: trimText(deleted.scopeTargetId, 128),
      scopeTargetName: trimText(deleted.scopeTargetName, 160),
      status: normalizeDocumentStatus(deleted.status),
      ...normalizeDocumentDeleteMetadata(payload),
      deletedBy: actorId(auth),
      deletedByName: actorName(auth),
      deletedAt
    };
    const deletedDocuments = Array.isArray(state.deletedDocuments) ? state.deletedDocuments : [];
    return {
      ...state,
      documents: nextDocuments,
      deletedDocuments: [deletionMetadata, ...deletedDocuments].slice(0, 500)
    };
  });

  return {
    ok: true,
    deletedId: cleanDocumentId,
    deletedAt: deletionMetadata?.deletedAt || nowIso(),
    deleteReasonRecorded: Boolean(deletionMetadata?.deleteReasonRecorded)
  };
}

export const __private__ = {
  normalizeChatPayload,
  normalizeModel,
  sanitizeContextMessages,
  stableFallbackAnswer,
  buildDeepSeekMessages,
  normalizeDocumentPayload,
  normalizeDocumentDeleteMetadata,
  normalizeDocumentStatus,
  assertNoSecretFields,
  redactSecrets,
  safeFailureReason,
  stores: {
    configStore,
    logStore,
    documentStore
  }
};
