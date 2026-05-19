let httpClientPromise;

function getHttp() {
  if (!httpClientPromise) {
    httpClientPromise = import("./http.js").then((mod) => mod.default);
  }
  return httpClientPromise;
}

function callClient(client, method, url, payload) {
  if (typeof client?.request === "function") {
    const config = { method, url };
    if (payload !== undefined) config.data = payload;
    return client.request(config);
  }
  if (typeof client?.[method] !== "function") {
    return Promise.reject(new Error(`不支持的 HTTP 方法：${method}`));
  }
  return payload === undefined ? client[method](url) : client[method](url, payload);
}

function request(method, url, payload) {
  return getHttp().then((http) => callClient(http, method, url, payload));
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = cleanText(value).toLowerCase();
  if (!text) return fallback;
  if (["true", "1", "yes", "on", "enabled", "enable", "active", "open", "启用", "已启用", "开启", "已开启"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "disable", "inactive", "closed", "停用", "已停用", "关闭", "未开启"].includes(text)) return false;
  return fallback;
}

function unwrapResponse(response = {}) {
  const body = asObject(response);
  if (body.result && typeof body.result === "object") return body.result;
  if (body.data && typeof body.data === "object") return body.data;
  return body;
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((source, index) => {
      const item = asObject(source);
      const title = cleanText(item.title || item.name || item.label || item.url || `资料 ${index + 1}`);
      if (!title) return null;
      return {
        id: cleanText(item.id || item.uid || `${title}-${index}`),
        title,
        text: cleanText(item.text || item.summary || item.description || item.content),
        type: cleanText(item.type || item.source || item.category || "资料来源"),
        url: cleanText(item.url || item.link || item.href),
        projectId: item.projectId ?? item.project_id ?? null,
        taskId: item.taskId ?? item.task_id ?? null
      };
    })
    .filter(Boolean);
}

const MODEL_DISPLAY_NAMES = {
  "deepseek-v4-flash": "深度求索第四代快速版",
  "deepseek-v4-pro": "深度求索第四代专业版",
  "deepseek-chat": "深度求索对话兼容版",
  "deepseek-reasoner": "深度求索推理兼容版"
};

function displayModelName(value, fallback = "工作助手模型") {
  const clean = cleanText(value);
  return MODEL_DISPLAY_NAMES[clean.toLowerCase()] || clean || fallback;
}

function normalizeAiAssistantResponse(response) {
  const body = unwrapResponse(response);
  const sources = normalizeSources(body.sources || body.citations || body.references || body.documents);
  const isFallback = cleanText(body.source).toLowerCase() === "fallback";
  const rawModel = cleanText(body.modelName || body.model_name || body.model || body.modelId);
  return {
    answer: cleanText(body.answer || body.content || body.text || body.summary || body.message),
    modelName: displayModelName(rawModel),
    modelId: rawModel,
    rawModel,
    online: isFallback ? false : Boolean(body.online || body.networkEnabled || body.webSearchUsed),
    sources,
    status: cleanText(body.status || body.source),
    raw: response
  };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeAiSettingsResponse(response) {
  const body = unwrapResponse(response);
  const config = asObject(body.config || body.settings || body.ai || body.current);
  const model = cleanText(
    firstDefined(
      body.modelName,
      body.model_name,
      body.model,
      body.modelId,
      body.defaultModel,
      config.modelName,
      config.model_name,
      config.model,
      config.modelId,
      config.defaultModel
    )
  );
  const enabledValue = firstDefined(body.enabled, body.aiEnabled, body.enableAi, config.enabled, config.aiEnabled, config.enableAi);
  const configuredValue = firstDefined(
    body.configured,
    body.isConfigured,
    body.apiKeyConfigured,
    body.hasApiKey,
    body.homeConfigured,
    body.homeApiKeyConfigured,
    body.keyStatus?.homeConfigured,
    config.configured,
    config.isConfigured,
    config.apiKeyConfigured,
    config.hasApiKey,
    config.homeConfigured,
    config.homeApiKeyConfigured,
    config.keyStatus?.homeConfigured
  );
  const webSearchValue = firstDefined(
    body.webSearch,
    body.webSearchEnabled,
    body.allowWebSearch,
    body.networkEnabled,
    config.webSearch,
    config.webSearchEnabled,
    config.allowWebSearch,
    config.networkEnabled
  );
  const homeConfiguredValue = firstDefined(
    body.homeConfigured,
    body.homeApiKeyConfigured,
    body.keyStatus?.homeConfigured,
    config.homeConfigured,
    config.homeApiKeyConfigured,
    config.keyStatus?.homeConfigured,
    configuredValue
  );
  const hrConfiguredValue = firstDefined(
    body.hrConfigured,
    body.hrApiKeyConfigured,
    body.keyStatus?.hrConfigured,
    config.hrConfigured,
    config.hrApiKeyConfigured,
    config.keyStatus?.hrConfigured,
    false
  );
  const homeConfigured = normalizeBoolean(homeConfiguredValue, false);
  const hrConfigured = normalizeBoolean(hrConfiguredValue, false);
  return {
    enabled: normalizeBoolean(enabledValue, false),
    configured: normalizeBoolean(configuredValue, false),
    model: displayModelName(model, "按后台配置"),
    modelId: model,
    rawModel: model,
    webSearch: normalizeBoolean(webSearchValue, false),
    keyStatus: {
      homeConfigured,
      hrConfigured
    },
    raw: removeCredentialStatusAliases(response)
  };
}

function removeCredentialStatusAliases(value) {
  if (Array.isArray(value)) return value.map(removeCredentialStatusAliases);
  if (!value || typeof value !== "object") return value;
  const blockedKeys = new Set([
    "apikey",
    "api_key",
    "deepseekapikey",
    ["deepseek", "api", "key"].join("_"),
    "deepseekkey",
    "deepseek_key",
    "homedeepseekapikey",
    "home_deepseek_api_key",
    "hrdeepseekapikey",
    "hr_deepseek_api_key",
    "deepseekhomeapikey",
    "deepseekhrapikey",
    "homeapikey",
    "home_api_key",
    "hrapikey",
    "hr_api_key",
    "authorization",
    "token",
    "secret"
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        const normalizedKey = String(key ?? "").replace(/[-_\s]/g, "").toLowerCase();
        return !blockedKeys.has(normalizedKey) && !isCredentialAlias(normalizedKey);
      })
      .map(([key, item]) => [key, removeCredentialStatusAliases(item)])
  );
}

function isCredentialAlias(normalizedKey = "") {
  return (
    /^deepseek(?:home|hr)?apikey$/i.test(normalizedKey) ||
    /^deepseek(?:home|hr)?key$/i.test(normalizedKey) ||
    /^(?:deepseek)?(?:home|hr)apikey$/i.test(normalizedKey) ||
    /^(?:deepseek)?(?:home|hr)key$/i.test(normalizedKey) ||
    /^(?:api|deepseek).*(?:key|token|secret)$/i.test(normalizedKey)
  );
}

function buildContextMessages(context = {}) {
  const results = Array.isArray(context.searchResults) ? context.searchResults.slice(0, 6) : [];
  const summaries = results
    .map((item, index) => {
      const title = cleanText(item.title || item.name || item.taskTitle || `资料 ${index + 1}`);
      const text = cleanText(item.text || item.summary || item.description || item.projectName || "");
      return title ? `${index + 1}. ${title}${text ? `：${text}` : ""}` : "";
    })
    .filter(Boolean);

  if (!summaries.length) return [];
  return [
    {
      role: "system",
      content: `首页当前站内搜索命中的资料如下，只能作为用户可见数据参考：\n${summaries.join("\n")}`
    }
  ];
}

function buildChatPayload(payload = {}) {
  const message = cleanText(payload.message || payload.question || payload.query);
  return {
    ...payload,
    message,
    messages: Array.isArray(payload.messages) ? payload.messages : buildContextMessages(payload.context),
  };
}

export function createAiApi(client = null) {
  const run = client ? (method, url, payload) => callClient(client, method, url, payload) : request;

  return {
    async getHomeAiSettings() {
      const response = await run("get", "/workspace/ai/settings");
      return normalizeAiSettingsResponse(response);
    },

    async chat(payload = {}) {
      const response = await run("post", "/workspace/ai/chat", buildChatPayload(payload));
      return normalizeAiAssistantResponse(response);
    },

    async askHomeAssistant(payload = {}) {
      const response = await run("post", "/workspace/ai/home-assistant", {
        scope: "home",
        ...buildChatPayload(payload),
      });
      return normalizeAiAssistantResponse(response);
    }
  };
}

export const aiApi = createAiApi();

export default aiApi;
