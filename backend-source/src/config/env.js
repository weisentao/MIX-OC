import dotenv from "dotenv";
import { hydrateProcessDeepSeekKeysFromStore } from "./aiKeys.js";

dotenv.config();
hydrateProcessDeepSeekKeysFromStore();

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasConfiguredValue(...values) {
  return values.some((value) => Boolean(String(value || "").trim()));
}

function isProduction() {
  return (process.env.NODE_ENV || "development") === "production";
}

const DEFAULT_JWT_SECRETS = new Set([
  "change-this-to-a-long-random-secret",
  "your-jwt-secret",
  "secret",
  "changeme",
  "replace-with-a-long-random-secret",
  "replace-with-a-long-random-secret-before-production"
]);

function jwtSecretFromProcess() {
  return Object.prototype.hasOwnProperty.call(process.env, "JWT_SECRET") ? process.env.JWT_SECRET || "" : env.jwt.secret || "";
}

function jwtExpiresInFromProcess() {
  return Object.prototype.hasOwnProperty.call(process.env, "JWT_EXPIRES_IN") ? process.env.JWT_EXPIRES_IN || "" : env.jwt.expiresIn || "";
}

function corsOriginsFromProcess() {
  return Object.prototype.hasOwnProperty.call(process.env, "CORS_ORIGIN")
    ? parseCsv(process.env.CORS_ORIGIN)
    : env.cors.origins;
}

function parseDurationSeconds(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) return NaN;

  const amount = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  const multipliers = {
    ms: 0.001,
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60
  };

  return amount * multipliers[unit];
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX || "/api",
  logLevel: process.env.LOG_LEVEL || "info",
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || (isProduction() ? "10mb" : "80mb"),
  cors: {
    origins: parseCsv(process.env.CORS_ORIGIN),
    credentials: process.env.CORS_CREDENTIALS === "true",
    methods: parseCsv(process.env.CORS_METHODS || "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  },
  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h"
  },
  mysql: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: toNumber(process.env.MYSQL_PORT, 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "xjg",
    connectionLimit: toNumber(process.env.MYSQL_CONNECTION_LIMIT, 10),
    connectTimeout: toNumber(process.env.MYSQL_CONNECT_TIMEOUT || 5000, 5000)
  },
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: toNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || "",
    db: toNumber(process.env.REDIS_DB, 0)
  },
  ai: {
    apiKeyConfigured: hasConfiguredValue(process.env.DEEPSEEK_HOME_API_KEY, process.env.DEEPSEEK_API_KEY),
    homeApiKeyConfigured: hasConfiguredValue(process.env.DEEPSEEK_HOME_API_KEY, process.env.DEEPSEEK_API_KEY),
    hrApiKeyConfigured: hasConfiguredValue(process.env.DEEPSEEK_HR_API_KEY, process.env.DEEPSEEK_API_KEY),
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    defaultModel: process.env.DEEPSEEK_DEFAULT_MODEL || "deepseek-v4-flash",
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL || "deepseek-v4-pro",
    timeoutMs: toNumber(process.env.DEEPSEEK_TIMEOUT_MS || 20000, 20000),
    dataDir: process.env.AI_DATA_DIR || ""
  },
  storage: {
    rootDir: process.env.STORAGE_ROOT || ""
  },
  appState: {
    fallbackDir: process.env.APP_STATE_FALLBACK_DIR || ""
  }
};

export function validateRequiredEnv() {
  const missing = [];
  const nodeEnv = process.env.NODE_ENV || env.nodeEnv;
  const jwtSecret = jwtSecretFromProcess();
  const jwtExpiresIn = jwtExpiresInFromProcess();
  const corsOrigins = corsOriginsFromProcess();

  if (!jwtSecret) missing.push("JWT_SECRET");
  if (missing.length) {
    const detail = missing.join(", ");
    throw new Error(`Missing required environment variables: ${detail}`);
  }

  if (nodeEnv === "production" && DEFAULT_JWT_SECRETS.has(jwtSecret)) {
    throw new Error("JWT_SECRET must not use a default insecure value in production");
  }
  if (nodeEnv === "production" && jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
  const jwtExpiresInSeconds = parseDurationSeconds(jwtExpiresIn);
  if (nodeEnv === "production" && (!Number.isFinite(jwtExpiresInSeconds) || jwtExpiresInSeconds <= 0)) {
    throw new Error("JWT_EXPIRES_IN must be a valid positive duration in production");
  }
  if (nodeEnv === "production" && jwtExpiresInSeconds > 24 * 60 * 60) {
    throw new Error("JWT_EXPIRES_IN must not exceed 24h in production");
  }
  if (nodeEnv === "production" && corsOrigins.length === 0) {
    throw new Error("CORS_ORIGIN must be configured in production");
  }
}
