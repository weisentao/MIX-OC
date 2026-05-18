import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const readBackendDoc = (name) => readFileSync(new URL(`../docs/${name}`, import.meta.url), "utf8");
const readBackendSource = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const readFrontendFile = (path) => readFileSync(new URL(`../../frontend-source/${path}`, import.meta.url), "utf8");

let aiServiceModule;
let aiDataDir;
const originalAiDataDir = process.env.AI_DATA_DIR;
const originalDeepseekApiKey = process.env.DEEPSEEK_API_KEY;
const originalDeepseekHomeApiKey = process.env.DEEPSEEK_HOME_API_KEY;
const originalDeepseekHrApiKey = process.env.DEEPSEEK_HR_API_KEY;

async function loadIsolatedAiService() {
  if (!aiServiceModule) {
    aiDataDir = await mkdtemp(join(tmpdir(), "xjg-ai-contract-"));
    process.env.AI_DATA_DIR = aiDataDir;
    process.env.DEEPSEEK_API_KEY = "";
    process.env.DEEPSEEK_HOME_API_KEY = "";
    process.env.DEEPSEEK_HR_API_KEY = "";

    const serviceUrl = new URL("../src/modules/ai/ai.service.js", import.meta.url);
    serviceUrl.searchParams.set("contractTest", Date.now().toString(36));
    aiServiceModule = await import(serviceUrl.href);
  }

  await aiServiceModule.__private__.stores.logStore.write(() => ({ logs: [] }));
  await aiServiceModule.__private__.stores.documentStore.write(() => ({ documents: [] }));
  return aiServiceModule;
}

after(async () => {
  if (originalAiDataDir === undefined) {
    delete process.env.AI_DATA_DIR;
  } else {
    process.env.AI_DATA_DIR = originalAiDataDir;
  }

  if (originalDeepseekApiKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = originalDeepseekApiKey;
  }
  if (originalDeepseekHomeApiKey === undefined) {
    delete process.env.DEEPSEEK_HOME_API_KEY;
  } else {
    process.env.DEEPSEEK_HOME_API_KEY = originalDeepseekHomeApiKey;
  }
  if (originalDeepseekHrApiKey === undefined) {
    delete process.env.DEEPSEEK_HR_API_KEY;
  } else {
    process.env.DEEPSEEK_HR_API_KEY = originalDeepseekHrApiKey;
  }

  if (aiDataDir) {
    await rm(aiDataDir, { recursive: true, force: true });
  }
});

function assertIncludesAll(text, values) {
  for (const value of values) {
    assert.ok(text.includes(value), `missing ${value}`);
  }
}

function firstExistingBackendDoc(names) {
  for (const name of names) {
    const url = new URL(`../docs/${name}`, import.meta.url);
    if (existsSync(url)) {
      return { name, text: readFileSync(url, "utf8") };
    }
  }
  assert.fail(`missing one of backend docs: ${names.join(", ")}`);
}

test("AI trace docs keep required backend operation provenance fields", () => {
  const readme = readBackendDoc("ai-trace/README.md");
  const record = readBackendDoc("ai-trace/2026-05-15-agent-08-trace-and-contracts.md");

  assertIncludesAll(readme, ["目标", "分工", "文件", "接口", "验证", "风险", "root-mounted"]);
  assertIncludesAll(record, ["## 目标", "## 分工", "## 文件", "## 接口", "## 验证", "## 风险"]);
});

test("frontend integration doc covers scanned admin HR board and upload endpoints", () => {
  const doc = readBackendDoc("api/frontend-admin-hr-board-upload-integration.md");

  assertIncludesAll(doc, [
    "frontend-source/src/services/adminApi.js",
    "frontend-source/src/services/managerApi.js",
    "frontend-source/src/services/resourceApi.js",
    "frontend-source/src/services/workspaceApi.js",
    "/admin/dashboard",
    "/admin/users/:userId",
    "/workspace/resources",
    "/workspace/assignments/force-confirm",
    "/manager/overview",
    "/workspace/boards/:boardId/history",
    "/workspace/storage/upload",
    "root-mounted",
    "frontend-not-wired"
  ]);
});

test("frontend integration doc tracks representative frontend service requests", () => {
  const doc = readBackendDoc("api/frontend-admin-hr-board-upload-integration.md");
  const adminApi = readFrontendFile("src/services/adminApi.js");
  const managerApi = readFrontendFile("src/services/managerApi.js");
  const resourceApi = readFrontendFile("src/services/resourceApi.js");
  const workspaceApi = readFrontendFile("src/services/workspaceApi.js");

  assert.match(adminApi, /\/admin\/comments\/risk/);
  assert.match(managerApi, /\/manager\/projects\/\$\{encodePath\(projectId\)\}\/boards/);
  assert.match(resourceApi, /\/workspace\/workload/);
  assert.match(workspaceApi, /requirePathValue\("boardId", boardId\)/);
  assert.match(workspaceApi, /\/workspace\/boards\/\$\{id\}\/shares/);

  assertIncludesAll(doc, [
    "/admin/comments/risk",
    "/manager/projects/:projectId/boards",
    "/workspace/workload",
    "/workspace/boards/:boardId/shares"
  ]);
});

test("backend mounts the AI module and reads DeepSeek configuration from env", () => {
  const routesIndex = readBackendSource("routes/index.js");
  const env = readBackendSource("config/env.js");

  assert.match(routesIndex, /aiRoutes/i);
  assert.match(routesIndex, /modules\/ai\/ai\.routes\.js|modules\/ai/i);
  assert.match(routesIndex, /router\.use\([^)]*aiRoutes[^)]*\)/i);

  assert.match(env, /\bdeepseek\b/i);
  assert.match(env, /\bDEEPSEEK_API_KEY\b/);
  assert.match(env, /\bDEEPSEEK_HOME_API_KEY\b/);
  assert.match(env, /\bDEEPSEEK_HR_API_KEY\b/);
  assert.match(env, /process\.env\.DEEPSEEK_API_KEY/);
});

test("backend AI/HR services support business DeepSeek keys with fallback compatibility", () => {
  const aiService = readBackendSource("modules/ai/ai.service.js");
  const hrService = readBackendSource("modules/hr/hr.service.js");
  const aiKeys = readBackendSource("config/aiKeys.js");

  assert.match(aiService, /\bDEEPSEEK_HOME_API_KEY\b/);
  assert.match(aiService, /\bDEEPSEEK_API_KEY\b/);
  assert.match(aiKeys, /\bDEEPSEEK_HR_API_KEY\b/);
  assert.match(aiKeys, /\bDEEPSEEK_API_KEY\b/);
  assert.match(hrService, /resolveHrDeepSeekApiKeyFromConfig\(readStoredAiKeyConfigSync\(\)\)/);
});

test("manager AI routes allow all manager role aliases for config and logs", () => {
  const aiRoutes = readBackendSource("modules/ai/ai.routes.js");

  assertIncludesAll(aiRoutes, [
    '"admin"',
    '"manager"',
    '"project_manager"',
    '"department_manager"',
    '"department_admin"',
    'router.get("/manager/ai/config", authRequired, requireManager, getManagerAiConfig)',
    'router.get("/manager/ai/logs", authRequired, requireManager, getManagerAiLogs)'
  ]);
});

test("workspace AI routes accept authenticated workspace users while admin AI remains admin-only", () => {
  const aiRoutes = readBackendSource("modules/ai/ai.routes.js");
  const aiService = readBackendSource("modules/ai/ai.service.js");

  assert.match(aiRoutes, /router\.post\("\/workspace\/ai\/chat", authRequired, postWorkspaceAiChat\)/);
  assert.match(aiRoutes, /router\.post\("\/workspace\/ai\/home-assistant", authRequired, postWorkspaceAiChat\)/);
  assert.match(aiRoutes, /router\.get\("\/workspace\/ai\/chat", authRequired, getWorkspaceAiAvailabilityHandler\)/);
  assert.match(aiRoutes, /router\.get\("\/workspace\/ai\/home-assistant", authRequired, getWorkspaceAiAvailabilityHandler\)/);
  assert.match(aiRoutes, /router\.get\("\/workspace\/ai\/settings", authRequired, getWorkspaceAiSettingsHandler\)/);
  assert.doesNotMatch(aiRoutes, /router\.(?:post|get)\("\/workspace\/ai\/(?:chat|home-assistant|settings)"[^;]*requireAdmin/);
  assert.doesNotMatch(aiRoutes, /router\.(?:post|get)\("\/workspace\/ai\/(?:chat|home-assistant|settings)"[^;]*requireManager/);
  assert.match(aiService, /export function assertAdminAccess\(auth = {}\)[\s\S]*normalizeRole\(auth\) !== "admin"[\s\S]*Admin permission required/);
});

test("workspace AI GET entrypoints return backend proxy availability without upstream calls", async () => {
  const { __private__, getWorkspaceAiAvailability, updateAdminAiConfig } = await loadIsolatedAiService();
  const originalHome = process.env.DEEPSEEK_HOME_API_KEY;
  const originalHr = process.env.DEEPSEEK_HR_API_KEY;
  const originalLegacy = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";
  await __private__.stores.configStore.write((current) => ({
    ...current,
    enabled: true,
    homeDeepSeekApiKey: "",
    hrDeepSeekApiKey: ""
  }));

  try {
    const missing = await getWorkspaceAiAvailability("home");
    assert.equal(missing.scope, "home");
    assert.equal(missing.service, "home-assistant");
    assert.equal(missing.status, "key_not_configured");
    assert.equal(missing.code, "AI_KEY_NOT_CONFIGURED");
    assert.equal(missing.homeApiKeyConfigured, false);
    assert.doesNotMatch(JSON.stringify(missing), /sk-[A-Za-z0-9_-]{16,}/);

    await updateAdminAiConfig(
      { homeApiKey: "home-readiness-alias-key", hrApiKey: "hr-readiness-alias-key" },
      { sub: "admin-key", username: "admin", role: "admin" }
    );

    const home = await getWorkspaceAiAvailability("home");
    const hr = await getWorkspaceAiAvailability("hr");
    assert.equal(home.status, "ready");
    assert.equal(home.code, "AI_PROBE_READY");
    assert.equal(home.service, "home-assistant");
    assert.equal(home.homeApiKeyConfigured, true);
    assert.equal(hr.status, "ready");
    assert.equal(hr.code, "AI_PROBE_READY");
    assert.equal(hr.service, "assignment-advice");
    assert.equal(hr.hrApiKeyConfigured, true);
    assert.doesNotMatch(JSON.stringify(home), /home-readiness-alias-key|hr-readiness-alias-key/);
    assert.doesNotMatch(JSON.stringify(hr), /home-readiness-alias-key|hr-readiness-alias-key/);
  } finally {
    await __private__.stores.configStore.write((current) => ({
      ...current,
      homeDeepSeekApiKey: "",
      hrDeepSeekApiKey: ""
    }));
    process.env.DEEPSEEK_HOME_API_KEY = originalHome || "";
    process.env.DEEPSEEK_HR_API_KEY = originalHr || "";
    process.env.DEEPSEEK_API_KEY = originalLegacy || "";
  }
});

test("admin AI routes keep strict admin-only gates separate from manager AI views", () => {
  const aiRoutes = readBackendSource("modules/ai/ai.routes.js");
  const aiService = readBackendSource("modules/ai/ai.service.js");

  assert.match(aiRoutes, /function requireAdmin\(req, res, next\)[\s\S]*assertAdminAccess\(req\.auth \|\| {}\)/);
  assert.match(aiService, /export function assertAdminAccess\(auth = {}\)[\s\S]*normalizeRole\(auth\) !== "admin"[\s\S]*Admin permission required/);
  assert.match(aiRoutes, /router\.get\("\/admin\/ai\/config", authRequired, requireAdmin, getAdminAiConfigHandler\)/);
  assert.match(aiRoutes, /router\.patch\("\/admin\/ai\/config", authRequired, requireAdmin, patchAdminAiConfig\)/);
  assert.match(aiRoutes, /router\.get\("\/admin\/ai\/usage-logs", authRequired, requireAdmin, getAdminAiUsageLogs\)/);
  assert.doesNotMatch(aiRoutes, /router\.(?:get|patch|post|delete)\("\/admin\/ai\/[^"]*", authRequired, requireManager/);
});

test("manager AI logs are limited to own or explicitly authorized project and department scopes", async () => {
  const { __private__, listManagerUsageLogs } = await loadIsolatedAiService();
  await __private__.stores.logStore.write(() => ({
    logs: [
      { id: "own-workspace", userId: "manager-1", username: "manager", scope: "workspace", status: "success", createdAt: "2026-05-16T08:00:00.000Z" },
      { id: "other-workspace", userId: "employee-1", username: "employee", scope: "workspace", status: "success", createdAt: "2026-05-16T08:01:00.000Z" },
      { id: "other-global", userId: "employee-2", username: "employee", scope: "global", status: "success", createdAt: "2026-05-16T08:02:00.000Z" },
      { id: "authorized-dept", userId: "employee-3", username: "employee", scope: "dept-9", status: "success", createdAt: "2026-05-16T08:03:00.000Z" },
      { id: "authorized-project", userId: "employee-4", username: "employee", scope: "proj-7", status: "success", createdAt: "2026-05-16T08:04:00.000Z" },
      { id: "other-project", userId: "employee-5", username: "employee", scope: "proj-8", status: "success", createdAt: "2026-05-16T08:05:00.000Z" }
    ]
  }));

  const result = await listManagerUsageLogs(
    {},
    {
      sub: "manager-1",
      username: "manager",
      role: "department_manager",
      departmentIds: ["dept-9"],
      projectIds: ["proj-7"]
    }
  );

  assert.deepEqual(
    result.items.map((item) => item.id).sort(),
    ["authorized-dept", "authorized-project", "own-workspace"]
  );
});

test("auth tokens include non-secret manager scope fields for backend AI log filtering", () => {
  const authController = readBackendSource("controllers/auth.controller.js");

  assert.match(authController, /department:\s*user\.department/);
  assert.match(authController, /departmentId:\s*user\.departmentId/);
  assert.match(authController, /department:\s*safeUser\.department/);
});

test("AI chat returns explicit 503 and writes trace fields without secret values when DeepSeek fails", async () => {
  const { __private__, chatWithAi } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  const secretLikeKey = `sk-${"A".repeat(40)}`;
  process.env.DEEPSEEK_HOME_API_KEY = "home-fallback-test-key";
  process.env.DEEPSEEK_API_KEY = "";

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ error: { message: "upstream unavailable" } })
  });

  try {
    await assert.rejects(
      () =>
        chatWithAi(
          {
            message: `please do not log ${secretLikeKey}`,
            scope: "workspace",
            conversationId: "contract-fallback"
          },
          { sub: "user-secret", username: "secret user", role: "employee" }
        ),
      (error) => error.statusCode === 503 && /temporarily unavailable/i.test(error.message)
    );
    const state = await __private__.stores.logStore.read();
    const log = state.logs.at(-1);

    assert.equal(log.status, "error");
    assert.equal(log.source, "deepseek");
    assert.ok(log.usage);
    assert.equal(typeof log.usage.totalTokens, "number");
    assert.equal(log.retrieval.requestedScope, "workspace");
    assert.equal(typeof log.failureReason, "string");
    assert.ok(log.failureReason.length > 0);
    assert.doesNotMatch(JSON.stringify(log), /sk-[A-Za-z0-9_-]{16,}/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI chat writes scope target fields for manager audit filtering when DeepSeek fails", async () => {
  const { __private__, chatWithAi, listManagerUsageLogs } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  process.env.DEEPSEEK_HOME_API_KEY = "home-fallback-scope-key";
  process.env.DEEPSEEK_API_KEY = "";

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ error: { message: "upstream unavailable" } })
  });

  try {
    await assert.rejects(
      () =>
        chatWithAi(
          {
            message: "summarize project risk",
            scope: "project",
            sourceScope: "proj-7",
            sourceScopeName: "Project Seven",
            conversationId: "contract-target"
          },
          { sub: "employee-target", username: "target employee", role: "employee" }
        ),
      (error) => error.statusCode === 503 && /temporarily unavailable/i.test(error.message)
    );
    const state = await __private__.stores.logStore.read();
    const log = state.logs.at(-1);

    assert.equal(log.scope, "project");
    assert.equal(log.scopeTargetId, "proj-7");
    assert.equal(log.scopeTargetName, "Project Seven");
    assert.equal(log.sourceScope, "proj-7");
    assert.equal(log.sourceScopeName, "Project Seven");
    assert.equal(log.retrieval.scopeTargetId, "proj-7");
    assert.equal(log.retrieval.scopeTargetName, "Project Seven");

    const managerResult = await listManagerUsageLogs(
      {},
      {
        sub: "manager-1",
        username: "manager",
        role: "project_manager",
        projectIds: ["proj-7"]
      }
    );

    assert.deepEqual(managerResult.items.map((item) => item.id), [log.id]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI chat keeps payload messages when context is an object and makes server prompt the only system role", async () => {
  const { __private__ } = await loadIsolatedAiService();
  const config = { maxContextMessages: 8, maxMessageChars: 2000 };

  const contextMessages = __private__.sanitizeContextMessages(
    {
      searchResults: [{ title: "client context object" }]
    },
    [
      { role: "system", content: "client supplied search context" },
      { role: "assistant", content: "assistant context" }
    ],
    config
  );
  const messages = __private__.buildDeepSeekMessages({
    config: { systemPrompt: "server prompt" },
    request: { message: "hello", scope: "workspace" },
    contextMessages,
    snippets: []
  });

  assert.deepEqual(
    contextMessages.map((item) => item.content),
    ["client supplied search context", "assistant context"]
  );
  assert.deepEqual(
    messages.filter((item) => item.role === "system").map((item) => item.content),
    ["server prompt\nCurrent scope: workspace."]
  );
  assert.equal(messages[1].role, "user");
  assert.equal(messages[2].role, "assistant");
});

test("frontend DeepSeek fourth aliases normalize to backend v4 model ids", async () => {
  const { __private__ } = await loadIsolatedAiService();

  assert.equal(__private__.normalizeModel("deepseek-fourth-flash"), "deepseek-v4-flash");
  assert.equal(__private__.normalizeModel("deepseek-fourth-pro"), "deepseek-v4-pro");
  assert.equal(__private__.normalizeModel("deepseek-chat"), "deepseek-v4-flash");
  assert.equal(__private__.normalizeModel("deepseek-reasoner"), "deepseek-v4-pro");
  assert.equal(__private__.normalizeChatPayload({ message: "hello", model: "deepseek-fourth-pro" }).model, "deepseek-v4-pro");
});

test("workspace AI sends provider-supported DeepSeek model ids", async () => {
  const { chatWithAi } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  const seenModels = [];

  globalThis.fetch = async (_url, options = {}) => {
    seenModels.push(JSON.parse(String(options.body || "{}")).model);
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "deepseek-ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    };
  };

  try {
    process.env.DEEPSEEK_HOME_API_KEY = "home-provider-model-key";
    process.env.DEEPSEEK_API_KEY = "";

    await chatWithAi({ message: "ping", conversationId: "provider-default" }, { sub: "u-home", role: "employee" });
    await chatWithAi(
      { message: "ping", model: "deepseek-reasoner", conversationId: "provider-reasoner" },
      { sub: "u-home", role: "employee" }
    );

    assert.deepEqual(seenModels, ["deepseek-v4-flash", "deepseek-v4-pro"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public AI config reports web search unavailable while preserving stored audit intent", async () => {
  const { __private__, getWorkspaceAiSettings, getAdminAiConfig } = await loadIsolatedAiService();
  await __private__.stores.configStore.write((current) => ({ ...current, webSearchEnabled: true }));

  const workspaceSettings = await getWorkspaceAiSettings();
  const adminConfig = await getAdminAiConfig();

  assert.equal(workspaceSettings.webSearchEnabled, false);
  assert.equal(workspaceSettings.allowWebSearch, false);
  assert.equal(workspaceSettings.storedWebSearchEnabled, true);
  assert.equal(workspaceSettings.webSearchRequested, true);
  assert.equal(adminConfig.webSearchEnabled, false);
  assert.equal(adminConfig.allowWebSearch, false);
  assert.equal(adminConfig.storedWebSearchEnabled, true);
  assert.equal(adminConfig.webSearchRequested, true);
});

test("workspace/admin AI config exposes key status booleans without key material fields", async () => {
  const { getWorkspaceAiSettings, getAdminAiConfig } = await loadIsolatedAiService();
  process.env.DEEPSEEK_HOME_API_KEY = "home-test-key";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";

  const workspaceSettings = await getWorkspaceAiSettings();
  const adminConfig = await getAdminAiConfig();

  assert.equal(workspaceSettings.provider, "deepseek");
  assert.equal(workspaceSettings.configured, true);
  assert.equal(workspaceSettings.isConfigured, true);
  assert.equal(workspaceSettings.apiKeyConfigured, true);
  assert.equal(workspaceSettings.hasApiKey, true);
  assert.equal(workspaceSettings.homeConfigured, true);
  assert.equal(workspaceSettings.hrConfigured, false);
  assert.equal(workspaceSettings.homeApiKeyConfigured, true);
  assert.equal(workspaceSettings.hrApiKeyConfigured, false);
  assert.deepEqual(workspaceSettings.keyStatus, {
    homeConfigured: true,
    hrConfigured: false
  });

  assert.equal(adminConfig.provider, "deepseek");
  assert.equal(adminConfig.configured, true);
  assert.equal(adminConfig.isConfigured, true);
  assert.equal(adminConfig.apiKeyConfigured, true);
  assert.equal(adminConfig.hasApiKey, true);
  assert.equal(adminConfig.homeConfigured, true);
  assert.equal(adminConfig.hrConfigured, false);
  assert.equal(adminConfig.homeApiKeyConfigured, true);
  assert.equal(adminConfig.hrApiKeyConfigured, false);
  assert.deepEqual(adminConfig.keyStatus, {
    homeConfigured: true,
    hrConfigured: false
  });
  assert.equal(Object.prototype.hasOwnProperty.call(adminConfig, "deepseekBaseUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(adminConfig, "keySource"), false);
  assert.doesNotMatch(JSON.stringify(adminConfig), /DEEPSEEK_(?:HOME_|HR_)?API_KEY|sk-[A-Za-z0-9_-]{16,}/);
});

test("workspace AI settings reports configured when home and HR keys are configured", async () => {
  const { getWorkspaceAiSettings } = await loadIsolatedAiService();
  process.env.DEEPSEEK_HOME_API_KEY = "home-configured-test-key";
  process.env.DEEPSEEK_HR_API_KEY = "hr-configured-test-key";
  process.env.DEEPSEEK_API_KEY = "";

  const workspaceSettings = await getWorkspaceAiSettings();

  assert.equal(workspaceSettings.configured, true);
  assert.equal(workspaceSettings.isConfigured, true);
  assert.equal(workspaceSettings.apiKeyConfigured, true);
  assert.equal(workspaceSettings.homeConfigured, true);
  assert.equal(workspaceSettings.hrConfigured, true);
  assert.deepEqual(workspaceSettings.keyStatus, {
    homeConfigured: true,
    hrConfigured: true
  });
  assert.doesNotMatch(JSON.stringify(workspaceSettings), /DEEPSEEK_(?:HOME_|HR_)?API_KEY|sk-[A-Za-z0-9_-]{16,}/);
});

test("workspace AI chat uses HOME key first and falls back to legacy key", async () => {
  const { __private__, chatWithAi } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  const seenAuthHeaders = [];
  await __private__.stores.configStore.write((current) => ({
    ...current,
    homeDeepSeekApiKey: "",
    hrDeepSeekApiKey: ""
  }));

  globalThis.fetch = async (_url, options = {}) => {
    seenAuthHeaders.push(String(options?.headers?.Authorization || ""));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "deepseek-ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    };
  };

  try {
    process.env.DEEPSEEK_HOME_API_KEY = "home-priority-key";
    process.env.DEEPSEEK_API_KEY = "legacy-fallback-key";
    let response = await chatWithAi({ message: "ping", conversationId: "home-key-priority" }, { sub: "u-home", role: "employee" });
    assert.equal(response.source, "deepseek");
    assert.equal(seenAuthHeaders.at(-1), "Bearer home-priority-key");

    process.env.DEEPSEEK_HOME_API_KEY = "";
    response = await chatWithAi({ message: "ping", conversationId: "home-key-fallback" }, { sub: "u-home", role: "employee" });
    assert.equal(response.source, "deepseek");
    assert.equal(seenAuthHeaders.at(-1), "Bearer legacy-fallback-key");

    process.env.DEEPSEEK_HOME_API_KEY = "   ";
    response = await chatWithAi({ message: "ping", conversationId: "home-key-blank-fallback" }, { sub: "u-home", role: "employee" });
    assert.equal(response.source, "deepseek");
    assert.equal(seenAuthHeaders.at(-1), "Bearer legacy-fallback-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin AI config can save separate HOME and HR keys without returning plaintext", async () => {
  const { __private__, getAdminAiConfig, getWorkspaceAiSettings, updateAdminAiConfig } = await loadIsolatedAiService();
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";

  const response = await updateAdminAiConfig(
    {
      homeDeepSeekApiKey: "home-json-configured-key",
      hrDeepSeekApiKey: "hr-json-configured-key"
    },
    { sub: "admin-key", username: "admin", role: "admin" }
  );
  const adminConfig = await getAdminAiConfig();
  const workspaceSettings = await getWorkspaceAiSettings();
  const storedConfig = await __private__.stores.configStore.read();

  assert.equal(response.homeConfigured, true);
  assert.equal(response.hrConfigured, true);
  assert.equal(response.keyStatus.homeConfigured, true);
  assert.equal(response.keyStatus.hrConfigured, true);
  assert.equal(adminConfig.homeMasked, "hom******************key");
  assert.equal(adminConfig.hrMasked, "hr-****************key");
  assert.equal(workspaceSettings.homeConfigured, true);
  assert.equal(workspaceSettings.hrConfigured, true);
  assert.equal(process.env.DEEPSEEK_HR_API_KEY, "hr-json-configured-key");
  assert.equal(storedConfig.homeDeepSeekApiKey, "home-json-configured-key");
  assert.equal(storedConfig.hrDeepSeekApiKey, "hr-json-configured-key");
  assert.doesNotMatch(JSON.stringify(response), /home-json-configured-key|hr-json-configured-key/);
  assert.doesNotMatch(JSON.stringify(adminConfig), /home-json-configured-key|hr-json-configured-key/);
  assert.doesNotMatch(JSON.stringify(workspaceSettings), /home-json-configured-key|hr-json-configured-key/);
});

test("admin AI config accepts frontend HOME/HR key aliases without returning plaintext", async () => {
  const { __private__, getAdminAiConfig, updateAdminAiConfig } = await loadIsolatedAiService();
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";

  const response = await updateAdminAiConfig(
    {
      homeApiKey: "home-frontend-alias-key",
      hrApiKey: "hr-frontend-alias-key"
    },
    { sub: "admin-key", username: "admin", role: "admin" }
  );
  const adminConfig = await getAdminAiConfig();
  const storedConfig = await __private__.stores.configStore.read();

  assert.equal(response.homeConfigured, true);
  assert.equal(response.hrConfigured, true);
  assert.equal(adminConfig.homeApiKeyConfigured, true);
  assert.equal(adminConfig.hrApiKeyConfigured, true);
  assert.equal(process.env.DEEPSEEK_HOME_API_KEY, "home-frontend-alias-key");
  assert.equal(process.env.DEEPSEEK_HR_API_KEY, "hr-frontend-alias-key");
  assert.equal(storedConfig.homeDeepSeekApiKey, "home-frontend-alias-key");
  assert.equal(storedConfig.hrDeepSeekApiKey, "hr-frontend-alias-key");
  assert.doesNotMatch(JSON.stringify(response), /home-frontend-alias-key|hr-frontend-alias-key/);
  assert.doesNotMatch(JSON.stringify(adminConfig), /home-frontend-alias-key|hr-frontend-alias-key/);
});

test("workspace AI chat uses frontend-saved HOME alias with scope fields", async () => {
  const { __private__, chatWithAi, updateAdminAiConfig } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  const seenAuthHeaders = [];
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";
  await __private__.stores.configStore.write((current) => ({
    ...current,
    homeDeepSeekApiKey: "",
    hrDeepSeekApiKey: ""
  }));

  globalThis.fetch = async (_url, options = {}) => {
    seenAuthHeaders.push(String(options?.headers?.Authorization || ""));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "deepseek-ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    };
  };

  try {
    await updateAdminAiConfig(
      { homeApiKey: "home-frontend-chat-key" },
      { sub: "admin-key", username: "admin", role: "admin" }
    );
    const response = await chatWithAi(
      {
        message: "summarize scoped project",
        scope: "project",
        sourceScope: "proj-frontend-alias",
        sourceScopeName: "Frontend Alias Project",
        conversationId: "frontend-alias-chat"
      },
      { sub: "u-home", role: "employee" }
    );

    assert.equal(response.source, "deepseek");
    assert.equal(response.scope, "project");
    assert.equal(response.scopeTargetId, "proj-frontend-alias");
    assert.equal(response.scopeTargetName, "Frontend Alias Project");
    assert.equal(seenAuthHeaders.at(-1), "Bearer home-frontend-chat-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workspace AI chat immediately uses HOME key saved through admin config", async () => {
  const { chatWithAi, updateAdminAiConfig } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  const seenAuthHeaders = [];
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";

  globalThis.fetch = async (_url, options = {}) => {
    seenAuthHeaders.push(String(options?.headers?.Authorization || ""));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "deepseek-ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    };
  };

  try {
    await updateAdminAiConfig(
      { homeDeepSeekApiKey: "home-admin-saved-key" },
      { sub: "admin-key", username: "admin", role: "admin" }
    );
    const response = await chatWithAi(
      { message: "ping", conversationId: "home-admin-configured-key" },
      { sub: "u-home", role: "employee" }
    );

    assert.equal(response.source, "deepseek");
    assert.equal(seenAuthHeaders.at(-1), "Bearer home-admin-saved-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin AI config update without key fields does not overwrite process env keys from stored stale config", async () => {
  const { __private__, chatWithAi, updateAdminAiConfig } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  const seenAuthHeaders = [];
  process.env.DEEPSEEK_HOME_API_KEY = "home-env-runtime-key";
  process.env.DEEPSEEK_HR_API_KEY = "hr-env-runtime-key";
  process.env.DEEPSEEK_API_KEY = "";
  await __private__.stores.configStore.write((current) => ({
    ...current,
    homeDeepSeekApiKey: "home-stale-stored-key",
    hrDeepSeekApiKey: "hr-stale-stored-key"
  }));

  globalThis.fetch = async (_url, options = {}) => {
    seenAuthHeaders.push(String(options?.headers?.Authorization || ""));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "deepseek-ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    };
  };

  try {
    await updateAdminAiConfig(
      { enabled: true, defaultModel: "deepseek-fourth-flash" },
      { sub: "admin-key", username: "admin", role: "admin" }
    );
    const response = await chatWithAi(
      { message: "ping", conversationId: "home-env-priority-after-config-save" },
      { sub: "u-home", role: "employee" }
    );

    assert.equal(response.source, "deepseek");
    assert.equal(process.env.DEEPSEEK_HOME_API_KEY, "home-env-runtime-key");
    assert.equal(process.env.DEEPSEEK_HR_API_KEY, "hr-env-runtime-key");
    assert.equal(seenAuthHeaders.at(-1), "Bearer home-env-runtime-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HR DeepSeek calls immediately use HR key saved through admin config", async () => {
  const { updateAdminAiConfig } = await loadIsolatedAiService();
  const hrServiceUrl = new URL("../src/modules/hr/hr.service.js", import.meta.url);
  hrServiceUrl.searchParams.set("adminKeyConfigTest", Date.now().toString(36));
  const hrService = await import(hrServiceUrl.href);
  const originalFetch = globalThis.fetch;
  const seenAuthHeaders = [];
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";

  globalThis.fetch = async (_url, options = {}) => {
    seenAuthHeaders.push(String(options?.headers?.Authorization || ""));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "hr-ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    };
  };

  try {
    await updateAdminAiConfig(
      { hrDeepSeekApiKey: "hr-admin-saved-key" },
      { sub: "admin-key", username: "admin", role: "admin" }
    );
    const response = await hrService.__private__.callHrDeepSeek([{ role: "user", content: "ping" }]);

    assert.equal(response.answer, "hr-ok");
    assert.equal(seenAuthHeaders.at(-1), "Bearer hr-admin-saved-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workspace AI chat returns explicit 503 when HOME key is not configured", async () => {
  const { __private__, chatWithAi } = await loadIsolatedAiService();
  await __private__.stores.configStore.write((current) => ({
    ...current,
    homeDeepSeekApiKey: "",
    hrDeepSeekApiKey: ""
  }));
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";

  await assert.rejects(
    () =>
      chatWithAi(
        { message: "missing key fallback check", conversationId: "home-key-missing" },
        { sub: "u-home", role: "employee" }
      ),
    (error) => error.statusCode === 503 && /home API key is not configured/.test(error.message)
  );
  const state = await __private__.stores.logStore.read();

  assert.deepEqual(state.logs, []);
});

test("workspace AI returns explicit 503 and redacts upstream failure reasons before logging", async () => {
  const { __private__, chatWithAi } = await loadIsolatedAiService();
  const originalFetch = globalThis.fetch;
  const secretLikeKey = `sk-${"F".repeat(40)}`;
  process.env.DEEPSEEK_HOME_API_KEY = "home-redaction-test-key";
  process.env.DEEPSEEK_API_KEY = "";

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () =>
      JSON.stringify({
        error: {
          message: `upstream rejected api_key=${secretLikeKey} Authorization: Bearer ${"G".repeat(32)}`
        }
      })
  });

  try {
    await assert.rejects(
      () => chatWithAi({ message: "redact upstream failure", conversationId: "upstream-redaction" }, { sub: "u-home", role: "employee" }),
      (error) =>
        error.statusCode === 503 &&
        /\[redacted\]/.test(error.message) &&
        !/sk-[A-Za-z0-9_-]{16,}/.test(error.message)
    );
    const state = await __private__.stores.logStore.read();
    const log = state.logs.at(-1);

    assert.match(log.failureReason, /\[redacted\]/);
    assert.doesNotMatch(log.failureReason, /sk-[A-Za-z0-9_-]{16,}/);
    assert.doesNotMatch(log.failureReason, /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HR assignment advice uses HR key first and falls back to legacy key", async () => {
  const hrServiceSource = readBackendSource("modules/hr/hr.service.js");
  const aiKeysSource = readBackendSource("config/aiKeys.js");

  assert.match(aiKeysSource, /DEEPSEEK_HR_API_KEY/);
  assert.match(aiKeysSource, /DEEPSEEK_API_KEY/);
  assert.match(hrServiceSource, /resolveHrDeepSeekApiKeyFromConfig\(readStoredAiKeyConfigSync\(\)\)/);
  assert.match(hrServiceSource, /chat\/completions/);
  assert.match(hrServiceSource, /Authorization:\s*`Bearer\s*\$\{apiKey\}`/);
});

test("AI admin config documents and chat reject or redact secret-looking values", async () => {
  const { __private__, updateAdminAiConfig, createAiDocument, updateAiDocument, chatWithAi } = await loadIsolatedAiService();
  const auth = { sub: "admin-1", username: "admin", role: "admin" };
  const secretLikeKey = `sk-${"B".repeat(40)}`;
  const originalFetch = globalThis.fetch;

  assert.throws(
    () => __private__.assertNoSecretFields({ nested: { value: `Bearer ${"C".repeat(32)}` } }),
    /Secret value is not allowed: nested\.value/
  );
  await assert.rejects(
    () => updateAdminAiConfig({ systemPrompt: `do not save ${secretLikeKey}` }, auth),
    /Secret value is not allowed: systemPrompt/
  );
  await assert.rejects(
    () => createAiDocument({ title: "Secret doc", content: `api_key=${"D".repeat(32)}` }, auth),
    /Secret value is not allowed: content/
  );
  await assert.rejects(
    () => createAiDocument({ title: "Secret doc", content: "safe", metadata: { token: "hidden" } }, auth),
    /Secret field is not allowed: metadata\.token/
  );
  await __private__.stores.documentStore.write(() => ({
    documents: [{ id: "doc-safe", title: "Safe", content: "safe", status: "active", createdAt: "2026-05-16T00:00:00.000Z" }]
  }));
  await assert.rejects(
    () => updateAiDocument("doc-safe", { summary: `Bearer ${"E".repeat(32)}` }, auth),
    /Secret value is not allowed: summary/
  );

  globalThis.fetch = async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: "safe answer" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      })
  });

  try {
    process.env.DEEPSEEK_HOME_API_KEY = "home-secret-redaction-key";
    process.env.DEEPSEEK_API_KEY = "";
    await chatWithAi({ message: `please inspect ${secretLikeKey}`, conversationId: "secret-redaction" }, { sub: "user-1", role: "employee" });
    const state = await __private__.stores.logStore.read();
    assert.doesNotMatch(JSON.stringify(state.logs.at(-1)), /sk-[A-Za-z0-9_-]{16,}/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizeModel default fallback does not depend on DEFAULT_CONFIG initialization", () => {
  const aiService = readBackendSource("modules/ai/ai.service.js");

  assert.doesNotMatch(aiService, /function\s+normalizeModel\s*\([^)]*fallback\s*=\s*DEFAULT_CONFIG\.defaultModel/);
});

test("backend AI module keeps DeepSeek calls server-side and documented", () => {
  const aiRoutes = readBackendSource("modules/ai/ai.routes.js");
  const aiService = readBackendSource("modules/ai/ai.service.js");
  const aiDoc = firstExistingBackendDoc([
    "ai-assistant-api-contract.md",
    "ai-api.md",
    "api/ai-api.md",
    "api/deepseek-ai-api.md",
    "ai/README.md"
  ]);

  assert.match(aiRoutes, /router\.(?:post|get)\(["'][^"']*\/ai/i);
  assert.match(aiRoutes, /router\.post\("\/workspace\/ai\/home-assistant", authRequired, postWorkspaceAiChat\)/);
  assert.match(aiRoutes, /authRequired/);
  assert.match(aiService, /deepseek/i);
  assert.match(aiService, /DEEPSEEK_API_KEY|env\.deepseek\.apiKey/);
  assert.match(aiService, /https:\/\/api\.deepseek\.com/i);
  assert.doesNotMatch(aiService, /sk-[A-Za-z0-9_-]{32,}/);

  assert.match(aiDoc.text, /AI|DeepSeek/i);
  assert.match(aiDoc.text, /\/ai/i);
  assert.match(aiDoc.text, /DEEPSEEK_API_KEY/);
  assert.match(aiDoc.text, /前端不得直连 DeepSeek|front-?end.*DeepSeek|backend.*DeepSeek/i);
});
