#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

dotenv.config();

export const RESULT_CODES = Object.freeze({
  AUTH_FAILURE: "AUTH_FAILURE",
  KEY_NOT_CONFIGURED: "KEY_NOT_CONFIGURED",
  NETWORK_FAILURE: "NETWORK_FAILURE",
  SUPPLIER_FAILURE: "SUPPLIER_FAILURE",
  NORMAL_RESPONSE: "NORMAL_RESPONSE",
  UNKNOWN_FAILURE: "UNKNOWN_FAILURE"
});

const RESULT_LABELS = Object.freeze({
  [RESULT_CODES.AUTH_FAILURE]: "auth failure",
  [RESULT_CODES.KEY_NOT_CONFIGURED]: "key not configured",
  [RESULT_CODES.NETWORK_FAILURE]: "network failure",
  [RESULT_CODES.SUPPLIER_FAILURE]: "supplier failure",
  [RESULT_CODES.NORMAL_RESPONSE]: "normal response",
  [RESULT_CODES.UNKNOWN_FAILURE]: "unknown failure"
});

const KEY_ENV_PRIORITY = Object.freeze(["DEEPSEEK_HOME_API_KEY", "DEEPSEEK_HR_API_KEY", "DEEPSEEK_API_KEY"]);
const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 13001}`;
const API_PREFIX = process.env.SMOKE_API_PREFIX || "/api";
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";
const REQUIRED_CODES = splitCsv(process.env.SMOKE_AI_REQUIRE_CODES);
const RUN_ID = `SMOKE_AI_${Date.now()}`;

const state = {
  failed: false,
  token: "",
  probes: [],
  observedCodes: new Set(),
  settingsConfigured: false,
  homeConfigured: false,
  hrConfigured: false
};

function trimText(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function splitCsv(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function redactSecrets(text) {
  let clean = trimText(text, 400);
  clean = clean.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted]");
  clean = clean.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi, "Bearer [redacted]");
  clean = clean.replace(
    /\b(?:api[_-]?key|deepseek[_-]?api[_-]?key|authorization|token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi,
    "[redacted]"
  );
  return clean;
}

function responseMessage(response = {}) {
  if (response.networkError) return redactSecrets(response.error || "network error");
  if (typeof response.body === "object" && response.body) {
    return redactSecrets(response.body.message || response.body.error || response.body.code || "");
  }
  return redactSecrets(response.raw || "");
}

function isKeyNotConfiguredMessage(message = "") {
  return /DeepSeek(?: home| HR)? API key is not configured/i.test(message);
}

function formatResult(code) {
  return `${code}(${RESULT_LABELS[code] || "unknown"})`;
}

function logInfo(message) {
  console.log(`[INFO] ${message}`);
}

function logPass(message) {
  console.log(`[PASS] ${message}`);
}

function logWarn(message) {
  console.warn(`[WARN] ${message}`);
}

function logFail(message) {
  state.failed = true;
  console.error(`[FAIL] ${message}`);
}

function apiUrl(path, baseUrl = BASE_URL) {
  return `${baseUrl}${API_PREFIX}${path}`;
}

function markObserved(code) {
  if (code) state.observedCodes.add(code);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${state.token}`
  };
}

export function resolveDeepSeekKeySource(environment = process.env) {
  for (const name of KEY_ENV_PRIORITY) {
    if (trimText(environment[name])) return name;
  }
  return "";
}

export function isNetworkFailureReason(message = "") {
  const clean = trimText(message, 400).toLowerCase();
  return [
    "timeout",
    "timed out",
    "network",
    "econnrefused",
    "enotfound",
    "eai_again",
    "fetch failed",
    "socket hang up",
    "aborted",
    "aborterror"
  ].some((needle) => clean.includes(needle));
}

export function classifyUnauthorizedResponse(response = {}) {
  if (response.networkError) return RESULT_CODES.NETWORK_FAILURE;
  if (response.status === 401) return RESULT_CODES.AUTH_FAILURE;
  if (response.status >= 500) return RESULT_CODES.SUPPLIER_FAILURE;
  return RESULT_CODES.UNKNOWN_FAILURE;
}

export function classifySettingsResponse(response = {}) {
  if (response.networkError) return RESULT_CODES.NETWORK_FAILURE;
  if (response.status === 401) return RESULT_CODES.AUTH_FAILURE;
  if (response.status !== 200) return RESULT_CODES.UNKNOWN_FAILURE;
  const configured = Boolean(response.body?.configured || response.body?.apiKeyConfigured);
  return configured ? RESULT_CODES.NORMAL_RESPONSE : RESULT_CODES.KEY_NOT_CONFIGURED;
}

export function classifyChatResponse(response = {}, options = {}) {
  const failureReason = trimText(options.failureReason || "");
  const configuredHint = Boolean(options.configuredHint);

  if (response.networkError) return RESULT_CODES.NETWORK_FAILURE;
  if (response.status === 401) return RESULT_CODES.AUTH_FAILURE;
  if (response.status === 503 && isKeyNotConfiguredMessage(responseMessage(response))) {
    return RESULT_CODES.KEY_NOT_CONFIGURED;
  }
  if (response.status !== 200) return response.status >= 500 ? RESULT_CODES.SUPPLIER_FAILURE : RESULT_CODES.UNKNOWN_FAILURE;

  const source = trimText(response.body?.source || "").toLowerCase();
  const status = trimText(response.body?.status || "").toLowerCase();
  if (status === "success" && source === "deepseek") return RESULT_CODES.NORMAL_RESPONSE;

  if (status === "fallback" || source === "fallback") {
    if (isKeyNotConfiguredMessage(failureReason) || /\bDEEPSEEK(?:_HOME|_HR)?_API_KEY\b[\s\w-]*\bis not configured\b/i.test(failureReason)) {
      return RESULT_CODES.KEY_NOT_CONFIGURED;
    }
    if (isNetworkFailureReason(failureReason)) return RESULT_CODES.NETWORK_FAILURE;
    if (failureReason) return RESULT_CODES.SUPPLIER_FAILURE;
    return configuredHint ? RESULT_CODES.SUPPLIER_FAILURE : RESULT_CODES.KEY_NOT_CONFIGURED;
  }

  return RESULT_CODES.UNKNOWN_FAILURE;
}

export function classifyAssignmentAdviceResponse(response = {}) {
  if (response.networkError) return RESULT_CODES.NETWORK_FAILURE;
  if (response.status === 401) return RESULT_CODES.AUTH_FAILURE;
  if (response.status === 503 && isKeyNotConfiguredMessage(responseMessage(response))) {
    return RESULT_CODES.KEY_NOT_CONFIGURED;
  }
  if (response.status >= 200 && response.status < 300) return RESULT_CODES.NORMAL_RESPONSE;
  if (response.status >= 500) return RESULT_CODES.SUPPLIER_FAILURE;
  return RESULT_CODES.UNKNOWN_FAILURE;
}

export function classifyAdminAiResponse(response = {}) {
  if (response.networkError) return RESULT_CODES.NETWORK_FAILURE;
  if (response.status === 401 || response.status === 403) return RESULT_CODES.AUTH_FAILURE;
  if (response.status >= 200 && response.status < 300) return RESULT_CODES.NORMAL_RESPONSE;
  if (response.status >= 500) return RESULT_CODES.SUPPLIER_FAILURE;
  return RESULT_CODES.UNKNOWN_FAILURE;
}

function extractLogRows(response = {}) {
  if (response.networkError) return [];
  if (Array.isArray(response.body?.items)) return response.body.items;
  if (Array.isArray(response.body?.rows)) return response.body.rows;
  if (Array.isArray(response.body)) return response.body;
  return [];
}

function findLatestLogByQuestion(logs = [], marker = "") {
  const cleanMarker = trimText(marker, 120);
  return cleanMarker ? logs.find((item) => String(item?.question || "").includes(cleanMarker)) || null : null;
}

function addProbe({ endpoint, phase, classification, response, pass, note = "" }) {
  markObserved(classification);
  const message = `${endpoint} [${phase}] => ${formatResult(classification)}; http=${response?.status || 0}${note ? `; ${note}` : ""}`;
  if (pass) {
    logPass(message);
  } else if (classification === RESULT_CODES.UNKNOWN_FAILURE) {
    logFail(message);
  } else {
    logWarn(message);
    if (response?.networkError) state.failed = true;
  }

  state.probes.push({
    endpoint,
    phase,
    classification,
    status: response?.status || 0,
    note
  });
}

async function requestJson(path, options = {}, baseUrl = BASE_URL) {
  const targetUrl = apiUrl(path, baseUrl);
  const startedAt = Date.now();
  try {
    const response = await fetch(targetUrl, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const raw = await response.text();
    let body = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    return {
      status: response.status,
      body,
      raw,
      durationMs: Date.now() - startedAt,
      networkError: false
    };
  } catch (error) {
    return {
      status: 0,
      body: null,
      raw: "",
      durationMs: Date.now() - startedAt,
      networkError: true,
      error: error?.message || "network error"
    };
  }
}

async function login() {
  const response = await requestJson("/login", {
    method: "POST",
    body: JSON.stringify({
      username: ADMIN_USER,
      password: ADMIN_PASS
    })
  });

  if (response.networkError) {
    logFail(`POST /login network failure: ${responseMessage(response)}`);
    return false;
  }

  if (response.status !== 200 || !response.body?.token) {
    logFail(`POST /login failed: http=${response.status}; ${responseMessage(response) || "no token"}`);
    return false;
  }

  state.token = response.body.token;
  logPass(`POST /login success: user=${ADMIN_USER}`);
  return true;
}

async function probeUnauthorized(endpoint, method = "GET", body = null) {
  const response = await requestJson(endpoint, {
    method,
    body: body === null ? undefined : JSON.stringify(body)
  });
  const classification = classifyUnauthorizedResponse(response);
  addProbe({
    endpoint,
    phase: "unauthorized",
    classification,
    response,
    pass: classification === RESULT_CODES.AUTH_FAILURE,
    note: responseMessage(response)
  });
}

async function probeSettings() {
  const response = await requestJson("/workspace/ai/settings", {
    headers: authHeaders()
  });
  const classification = classifySettingsResponse(response);
  state.settingsConfigured = Boolean(response.body?.configured || response.body?.apiKeyConfigured);
  state.homeConfigured = Boolean(response.body?.homeConfigured || response.body?.homeApiKeyConfigured || response.body?.keyStatus?.homeConfigured);
  state.hrConfigured = Boolean(response.body?.hrConfigured || response.body?.hrApiKeyConfigured || response.body?.keyStatus?.hrConfigured);

  addProbe({
    endpoint: "/workspace/ai/settings",
    phase: "authorized",
    classification,
    response,
    pass: [RESULT_CODES.NORMAL_RESPONSE, RESULT_CODES.KEY_NOT_CONFIGURED].includes(classification),
    note: `homeConfigured=${state.homeConfigured}; hrConfigured=${state.hrConfigured}`
  });
}

async function loadLatestAiLogs() {
  return requestJson("/workspace/ai/logs?page=1&pageSize=50", {
    headers: authHeaders()
  });
}

async function probeChat(endpoint, marker, extraPayload = {}) {
  const response = await requestJson(endpoint, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      scope: "workspace",
      message: marker,
      messages: [{ role: "user", content: marker }],
      ...extraPayload
    })
  });

  let failureReason = "";
  if (!response.networkError && response.status === 200) {
    const logsResponse = await loadLatestAiLogs();
    const rows = extractLogRows(logsResponse);
    const matched = findLatestLogByQuestion(rows, marker);
    failureReason = redactSecrets(matched?.failureReason || "");
  }

  const classification = classifyChatResponse(response, {
    failureReason,
    configuredHint: state.homeConfigured
  });
  addProbe({
    endpoint,
    phase: "authorized",
    classification,
    response,
    pass:
      !response.networkError &&
      [RESULT_CODES.NORMAL_RESPONSE, RESULT_CODES.KEY_NOT_CONFIGURED, RESULT_CODES.NETWORK_FAILURE, RESULT_CODES.SUPPLIER_FAILURE].includes(
        classification
      ),
    note: failureReason ? `failureReason=${failureReason}` : responseMessage(response) || `source=${trimText(response.body?.source || "")}`
  });
}

async function probeAssignmentAdvice(marker) {
  const response = await requestJson("/workspace/resources/ai/assignment-advice", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      taskUid: `${marker}_TASK`,
      candidates: [],
      context: {
        runId: marker
      }
    })
  });
  const classification = classifyAssignmentAdviceResponse(response);

  addProbe({
    endpoint: "/workspace/resources/ai/assignment-advice",
    phase: "authorized",
    classification,
    response,
    pass: [RESULT_CODES.NORMAL_RESPONSE, RESULT_CODES.KEY_NOT_CONFIGURED, RESULT_CODES.SUPPLIER_FAILURE].includes(classification),
    note: responseMessage(response)
  });
}

async function probeAdminAiEndpoint(endpoint, method = "GET", body = null) {
  const response = await requestJson(endpoint, {
    method,
    headers: authHeaders(),
    body: body === null ? undefined : JSON.stringify(body)
  });
  const classification = classifyAdminAiResponse(response);

  addProbe({
    endpoint,
    phase: "authorized-admin",
    classification,
    response,
    pass: classification === RESULT_CODES.NORMAL_RESPONSE,
    note: responseMessage(response)
  });
}

function printSummary() {
  console.log("\n=== AI Smoke Classification Summary ===");
  state.probes.forEach((probe, index) => {
    console.log(
      `${index + 1}. ${probe.endpoint} [${probe.phase}] -> ${formatResult(probe.classification)}; http=${probe.status}${
        probe.note ? `; ${probe.note}` : ""
      }`
    );
  });
  console.log(`Observed: ${Array.from(state.observedCodes).map(formatResult).join(", ") || "none"}`);
}

function checkRequiredCodes() {
  if (!REQUIRED_CODES.length) return;
  const missing = REQUIRED_CODES.filter((code) => !state.observedCodes.has(code));
  if (!missing.length) {
    logPass(`SMOKE_AI_REQUIRE_CODES satisfied: ${REQUIRED_CODES.join(",")}`);
    return;
  }
  state.failed = true;
  logFail(`SMOKE_AI_REQUIRE_CODES missing: ${missing.join(",")}`);
}

async function main() {
  const localKeySource = resolveDeepSeekKeySource();
  logInfo(`target=${apiUrl("")}`);
  logInfo(`runId=${RUN_ID}`);
  logInfo(`supported-codes=${Object.values(RESULT_CODES).join(",")}`);
  logInfo(`local-key-source=${localKeySource || "none"}`);

  await probeUnauthorized("/workspace/ai/settings");
  await probeUnauthorized("/workspace/ai/chat", "POST", { message: `${RUN_ID}_unauth_chat` });
  await probeUnauthorized("/workspace/ai/home-assistant", "POST", { message: `${RUN_ID}_unauth_home` });
  await probeUnauthorized("/workspace/resources/ai/assignment-advice", "POST", {
    taskUid: `${RUN_ID}_unauth_task`,
    candidates: []
  });

  const loginOk = await login();
  if (!loginOk) {
    printSummary();
    process.exitCode = 1;
    return;
  }

  await probeSettings();
  await probeChat("/workspace/ai/chat", `${RUN_ID}_chat`);
  await probeChat("/workspace/ai/home-assistant", `${RUN_ID}_home_assistant`);
  await probeAssignmentAdvice(RUN_ID);
  await probeAdminAiEndpoint("/admin/ai/config");
  await probeAdminAiEndpoint("/admin/ai/models");
  await probeAdminAiEndpoint("/admin/ai/usage-logs");
  await probeAdminAiEndpoint("/admin/ai/documents");

  printSummary();
  checkRequiredCodes();
  if (state.failed) {
    console.error("smoke-ai-deepseek: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("smoke-ai-deepseek: PASSED");
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    const message = redactSecrets(error?.stack || error?.message || "runtime error");
    console.error(`[FAIL] smoke-ai-deepseek runtime error - ${message}`);
    process.exitCode = 1;
  });
}

export const __private__ = {
  KEY_ENV_PRIORITY,
  RESULT_LABELS,
  addProbe,
  extractLogRows,
  findLatestLogByQuestion,
  responseMessage
};
