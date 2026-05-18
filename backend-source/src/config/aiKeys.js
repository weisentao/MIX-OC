import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AI_ROOT = path.resolve(__dirname, "../../data/ai-v1");

export const HOME_DEEPSEEK_KEY_FIELD = "homeDeepSeekApiKey";
export const HR_DEEPSEEK_KEY_FIELD = "hrDeepSeekApiKey";

export function cleanAiKey(value) {
  return String(value ?? "").trim();
}

export function maskAiKey(value) {
  const clean = cleanAiKey(value);
  if (!clean) return "";
  if (clean.length <= 2) return "*".repeat(clean.length);
  if (clean.length <= 8) {
    return `${clean.slice(0, 1)}${"*".repeat(clean.length - 2)}${clean.slice(-1)}`;
  }
  return `${clean.slice(0, 3)}${"*".repeat(clean.length - 6)}${clean.slice(-3)}`;
}

export function resolveAiDataRootFromProcess(envLike = process.env) {
  return path.resolve(cleanAiKey(envLike.AI_DATA_DIR) || DEFAULT_AI_ROOT);
}

export function readStoredAiKeyConfigSync(envLike = process.env) {
  const root = resolveAiDataRootFromProcess(envLike);
  const configPath = path.resolve(root, "config.json");
  if (configPath !== root && !configPath.startsWith(`${root}${path.sep}`)) {
    return {};
  }

  try {
    const text = readFileSync(configPath, "utf8");
    const config = text.trim() ? JSON.parse(text) : {};
    return {
      [HOME_DEEPSEEK_KEY_FIELD]: cleanAiKey(config?.[HOME_DEEPSEEK_KEY_FIELD]),
      [HR_DEEPSEEK_KEY_FIELD]: cleanAiKey(config?.[HR_DEEPSEEK_KEY_FIELD])
    };
  } catch {
    return {};
  }
}

export function hydrateProcessDeepSeekKeysFromStore(envLike = process.env) {
  const stored = readStoredAiKeyConfigSync(envLike);
  if (stored[HOME_DEEPSEEK_KEY_FIELD]) {
    envLike.DEEPSEEK_HOME_API_KEY = stored[HOME_DEEPSEEK_KEY_FIELD];
  }
  if (stored[HR_DEEPSEEK_KEY_FIELD]) {
    envLike.DEEPSEEK_HR_API_KEY = stored[HR_DEEPSEEK_KEY_FIELD];
  }
  return stored;
}

export function syncProcessDeepSeekKeysFromConfig(config = {}, envLike = process.env, options = {}) {
  const overwriteEmpty = Boolean(options.overwriteEmpty);
  if (Object.prototype.hasOwnProperty.call(config, HOME_DEEPSEEK_KEY_FIELD)) {
    const homeKey = cleanAiKey(config[HOME_DEEPSEEK_KEY_FIELD]);
    if (homeKey || overwriteEmpty) envLike.DEEPSEEK_HOME_API_KEY = homeKey;
  }
  if (Object.prototype.hasOwnProperty.call(config, HR_DEEPSEEK_KEY_FIELD)) {
    const hrKey = cleanAiKey(config[HR_DEEPSEEK_KEY_FIELD]);
    if (hrKey || overwriteEmpty) envLike.DEEPSEEK_HR_API_KEY = hrKey;
  }
}

export function resolveHomeDeepSeekApiKeyFromConfig(config = {}, envLike = process.env) {
  return [envLike.DEEPSEEK_HOME_API_KEY, config?.[HOME_DEEPSEEK_KEY_FIELD], envLike.DEEPSEEK_API_KEY]
    .map((value) => cleanAiKey(value))
    .find(Boolean) || "";
}

export function resolveHrDeepSeekApiKeyFromConfig(config = {}, envLike = process.env) {
  return [envLike.DEEPSEEK_HR_API_KEY, config?.[HR_DEEPSEEK_KEY_FIELD], envLike.DEEPSEEK_API_KEY]
    .map((value) => cleanAiKey(value))
    .find(Boolean) || "";
}
