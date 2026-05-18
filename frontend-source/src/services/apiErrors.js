export function apiStatus(error) {
  return Number(error?.response?.status || error?.status || error?.statusCode || 0);
}

export function isAuthApiError(error) {
  const status = apiStatus(error);
  return status === 401 || status === 403;
}

export function isLoginExpiredApiError(error) {
  return apiStatus(error) === 401;
}

export function isForbiddenApiError(error) {
  return apiStatus(error) === 403;
}

export function isServiceUnavailableError(error) {
  return apiStatus(error) === 503;
}

export function isNetworkApiError(error) {
  if (error?.response) return false;
  const code = String(error?.code || "").toUpperCase();
  if (["ECONNABORTED", "ECONNREFUSED", "ENETUNREACH", "ETIMEDOUT", "ERR_NETWORK"].includes(code)) return true;
  return /network|failed to fetch|fetch failed|offline|timeout|timed out|aborted|socket hang up/i.test(String(error?.message || ""));
}

function responseMessage(error) {
  return String(error?.response?.data?.message || error?.response?.data?.error || error?.message || "").trim();
}

const ENGLISH_FEEDBACK_TRANSLATIONS = new Map([
  ["AI service is temporarily unavailable", "AI 服务暂不可用，请稍后重试。"],
  ["AI service is temporarily unavailable.", "AI 服务暂不可用，请稍后重试。"],
  ["AI chat is disabled", "AI 聊天已停用，请联系管理员确认配置。"],
  ["AI chat is disabled.", "AI 聊天已停用，请联系管理员确认配置。"],
  ["DeepSeek home API key is not configured", "AI 服务未配置，请联系管理员确认 DeepSeek 密钥。"],
  ["DeepSeek HR API key is not configured", "HR AI 服务未配置，请联系管理员确认 DeepSeek 密钥。"],
  ["DeepSeek returned an empty answer", "AI 服务返回空响应，请稍后重试。"],
  ["HR assignment advice service is temporarily unavailable", "HR 分配建议服务暂不可用，请稍后重试。"]
]);

function localizedFeedbackMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "";
  return ENGLISH_FEEDBACK_TRANSLATIONS.get(text) || text;
}

export function backendSyncToast(error) {
  if (isLoginExpiredApiError(error)) return "登录已失效，请重新登录后再同步";
  if (isForbiddenApiError(error)) return "当前账号权限不足，本次同步未完成";
  if (isServiceUnavailableError(error)) return "后端或数据库不可用，请确认服务与数据库已启动";
  if (isNetworkApiError(error)) return "后端服务未连接，请确认后端已启动后再同步";
  if (apiStatus(error) >= 500) return "后端服务异常，同步未完成";
  return "已本地保存，后端同步失败";
}

export function aiErrorMessage(error, fallback = "智能建议接口暂不可用") {
  const status = apiStatus(error);
  if (status === 401) return "未登录或登录已失效，请重新登录后再使用智能建议。";
  if (status === 403) return "当前账号无权访问该 AI 功能，请联系管理员确认权限。";
  if (status === 503) return localizedFeedbackMessage(responseMessage(error)) || "后端 AI 服务暂不可用，请确认 DeepSeek 密钥和后端服务。";
  if (isNetworkApiError(error)) return "无法连接后端 AI 服务，请确认后端已启动。";
  return localizedFeedbackMessage(responseMessage(error)) || fallback;
}
