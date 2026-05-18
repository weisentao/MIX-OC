import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  __private__,
  buildAdminDashboard,
  mapAdminAuditLogRow,
  mapAdminPermissionRows,
  mapAdminUserRow,
  normalizeAuditQuery,
  normalizePagination,
  normalizeSystemConfigPayload
} from "../src/modules/admin/admin.service.js";

const adminRoutesSource = readFileSync(
  new URL("../src/modules/admin/admin.routes.js", import.meta.url),
  "utf8"
);
const adminControllerSource = readFileSync(
  new URL("../src/modules/admin/admin.controller.js", import.meta.url),
  "utf8"
);
const adminServiceSource = readFileSync(
  new URL("../src/modules/admin/admin.service.js", import.meta.url),
  "utf8"
);
const aiRoutesSource = readFileSync(
  new URL("../src/modules/ai/ai.routes.js", import.meta.url),
  "utf8"
);
const rootRoutesSource = readFileSync(
  new URL("../src/routes/index.js", import.meta.url),
  "utf8"
);
const aiControllerSource = readFileSync(
  new URL("../src/modules/ai/ai.controller.js", import.meta.url),
  "utf8"
);
const aiServiceSource = readFileSync(
  new URL("../src/modules/ai/ai.service.js", import.meta.url),
  "utf8"
);
const adminManagerContractSource = readFileSync(
  new URL("../docs/admin-manager-api-contract.md", import.meta.url),
  "utf8"
);
const aiContractSource = readFileSync(
  new URL("../docs/ai-assistant-api-contract.md", import.meta.url),
  "utf8"
);
const adminApiSource = readFileSync(
  new URL("../../frontend-source/src/services/adminApi.js", import.meta.url),
  "utf8"
);

let isolatedAiService;
let aiDataDir;
const originalAiDataDir = process.env.AI_DATA_DIR;
const originalHomeKey = process.env.DEEPSEEK_HOME_API_KEY;
const originalHrKey = process.env.DEEPSEEK_HR_API_KEY;
const originalLegacyKey = process.env.DEEPSEEK_API_KEY;

async function loadIsolatedAiService() {
  if (!isolatedAiService) {
    aiDataDir = await mkdtemp(join(tmpdir(), "xjg-admin-ai-config-"));
    process.env.AI_DATA_DIR = aiDataDir;
    process.env.DEEPSEEK_HOME_API_KEY = "";
    process.env.DEEPSEEK_HR_API_KEY = "";
    process.env.DEEPSEEK_API_KEY = "";

    const serviceUrl = new URL("../src/modules/ai/ai.service.js", import.meta.url);
    serviceUrl.searchParams.set("adminAiConfigContract", Date.now().toString(36));
    isolatedAiService = await import(serviceUrl.href);
  }

  await isolatedAiService.__private__.stores.configStore.write((current) => ({
    ...current,
    homeDeepSeekApiKey: "",
    hrDeepSeekApiKey: ""
  }));
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";
  process.env.DEEPSEEK_API_KEY = "";
  return isolatedAiService;
}

after(async () => {
  if (originalAiDataDir === undefined) delete process.env.AI_DATA_DIR;
  else process.env.AI_DATA_DIR = originalAiDataDir;

  if (originalHomeKey === undefined) delete process.env.DEEPSEEK_HOME_API_KEY;
  else process.env.DEEPSEEK_HOME_API_KEY = originalHomeKey;

  if (originalHrKey === undefined) delete process.env.DEEPSEEK_HR_API_KEY;
  else process.env.DEEPSEEK_HR_API_KEY = originalHrKey;

  if (originalLegacyKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalLegacyKey;

  if (aiDataDir) await rm(aiDataDir, { recursive: true, force: true });
});

test("admin routes expose frontend-reserved management endpoints without root integration", () => {
  const endpoints = [
    ["get", "/admin/dashboard"],
    ["get", "/admin/users"],
    ["post", "/admin/users"],
    ["get", "/admin/users/:userId"],
    ["patch", "/admin/users/:userId"],
    ["delete", "/admin/users/:userId"],
    ["get", "/admin/permissions"],
    ["patch", "/admin/permissions"],
    ["get", "/admin/system/status"],
    ["get", "/admin/system/config"],
    ["patch", "/admin/system/config"],
    ["get", "/admin/audit-logs"],
    ["get", "/admin/projects"],
    ["post", "/admin/projects"],
    ["get", "/admin/projects/:projectId"],
    ["patch", "/admin/projects/:projectId"],
    ["post", "/admin/projects/:projectId/archive"],
    ["delete", "/admin/projects/:projectId"],
    ["post", "/admin/tasks"],
    ["delete", "/admin/tasks/:taskId"]
  ];

  for (const [method, path] of endpoints) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(adminRoutesSource, new RegExp(`router\\.${method}\\("${escaped}"`, "i"));
  }
  assert.match(adminRoutesSource, /authRequired/);
  assert.match(adminRoutesSource, /requireAdmin/);
});

test("admin frontend wrapper paths are covered by backend admin and AI routes", () => {
  const routeSources = `${adminRoutesSource}\n${aiRoutesSource}`;
  const endpoints = [
    ["get", "/admin/dashboard"],
    ["get", "/admin/users"],
    ["post", "/admin/users"],
    ["get", "/admin/users/:userId"],
    ["patch", "/admin/users/:userId"],
    ["delete", "/admin/users/:userId"],
    ["get", "/admin/permissions"],
    ["patch", "/admin/permissions"],
    ["get", "/admin/projects"],
    ["post", "/admin/projects"],
    ["get", "/admin/projects/:projectId"],
    ["patch", "/admin/projects/:projectId"],
    ["post", "/admin/projects/:projectId/archive"],
    ["delete", "/admin/projects/:projectId"],
    ["get", "/admin/tasks"],
    ["post", "/admin/tasks"],
    ["patch", "/admin/tasks/:taskId"],
    ["delete", "/admin/tasks/:taskId"],
    ["get", "/admin/comments/risk"],
    ["post", "/admin/comments/:commentId/resolve"],
    ["get", "/admin/schedules"],
    ["get", "/admin/boards"],
    ["patch", "/admin/boards/:boardId"],
    ["delete", "/admin/boards/:boardId"],
    ["get", "/admin/templates"],
    ["post", "/admin/templates"],
    ["patch", "/admin/templates/:templateId"],
    ["delete", "/admin/templates/:templateId"],
    ["get", "/admin/tags"],
    ["post", "/admin/tags"],
    ["delete", "/admin/tags/:tagId"],
    ["get", "/admin/notices"],
    ["post", "/admin/notices"],
    ["patch", "/admin/notices/:noticeId"],
    ["delete", "/admin/notices/:noticeId"],
    ["get", "/admin/departments"],
    ["post", "/admin/departments"],
    ["patch", "/admin/departments/:departmentId"],
    ["delete", "/admin/departments/:departmentId"],
    ["get", "/admin/archives"],
    ["post", "/admin/archives/:archiveId/restore"],
    ["delete", "/admin/archives/:archiveId"],
    ["get", "/admin/ai/config"],
    ["patch", "/admin/ai/config"],
    ["get", "/admin/ai/models"],
    ["get", "/admin/ai/usage-logs"],
    ["get", "/admin/ai/documents"],
    ["post", "/admin/ai/documents"],
    ["patch", "/admin/ai/documents/:documentId"],
    ["delete", "/admin/ai/documents/:documentId"],
    ["get", "/admin/system/status"],
    ["get", "/admin/audit-logs"]
  ];

  for (const [method, path] of endpoints) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(routeSources, new RegExp(`router\\.${method}\\("${escaped}"`, "i"), `missing ${method.toUpperCase()} ${path}`);
  }

  for (const path of [
    "/admin/ai/config",
    "/admin/ai/documents",
    "/admin/system/status",
    "/admin/notices"
  ]) {
    assert.ok(adminApiSource.includes(path), `adminApi should include ${path}`);
  }
});

test("AI routes are mounted before broad admin and manager route gates", () => {
  const aiMountIndex = rootRoutesSource.indexOf("router.use(aiRoutes)");
  const adminMountIndex = rootRoutesSource.indexOf("router.use(adminRoutes)");
  const managerMountIndex = rootRoutesSource.indexOf("router.use(managerRoutes)");

  assert.notEqual(aiMountIndex, -1);
  assert.notEqual(adminMountIndex, -1);
  assert.notEqual(managerMountIndex, -1);
  assert.ok(aiMountIndex < adminMountIndex, "/admin/ai/* must reach the AI admin handlers before /admin middleware");
  assert.ok(aiMountIndex < managerMountIndex, "/manager/ai/* must reach the AI manager handlers before /manager middleware");
});

test("admin contract documents reserved system config and notice delete", () => {
  assert.match(adminRoutesSource, /router\.get\("\/admin\/system\/config", getConfig\)/);
  assert.match(adminRoutesSource, /router\.patch\("\/admin\/system\/config", patchConfig\)/);
  assert.match(adminRoutesSource, /router\.delete\("\/admin\/notices\/:noticeId", removeNotice\)/);
  assert.match(adminManagerContractSource, /\/admin\/system\/config/);
  assert.match(adminManagerContractSource, /siteName/);
  assert.match(adminManagerContractSource, /maintenanceMode/);
  assert.match(adminManagerContractSource, /auditRetentionDays/);
  assert.match(adminManagerContractSource, /DELETE\s+`?\/admin\/notices\/:noticeId`?/);
  assert.match(adminManagerContractSource, /delete/i);
});

test("admin AI document delete records redacted reason metadata", () => {
  assert.match(aiControllerSource, /deleteAiDocument\(documentId, \{ \.\.\.\(req\.query \|\| \{\}\), \.\.\.\(req\.body \|\| \{\}\) \}, req\.auth/);
  assert.match(aiServiceSource, /function normalizeDocumentDeleteMetadata/);
  assert.match(aiServiceSource, /redactSecrets/);
  assert.match(aiServiceSource, /deletedDocuments/);
  assert.match(aiServiceSource, /deleteReasonRecorded/);
  assert.match(adminManagerContractSource, /deleteReasonRecorded/);
  assert.match(aiContractSource, /deleteReasonRecorded/);
});

test("admin AI config accepts scoped DeepSeek keys and never echoes plaintext", async () => {
  const { getAdminAiConfig, updateAdminAiConfig } = await loadIsolatedAiService();

  const response = await updateAdminAiConfig(
    {
      homeDeepSeekApiKey: `sk-${"H".repeat(32)}`,
      hrDeepSeekApiKey: `sk-${"R".repeat(32)}`
    },
    { sub: "u-admin", username: "admin", role: "admin" }
  );
  const config = await getAdminAiConfig();

  assert.equal(response.homeConfigured, true);
  assert.equal(response.hrConfigured, true);
  assert.equal(response.keyStatus.homeConfigured, true);
  assert.equal(response.keyStatus.hrConfigured, true);
  assert.equal(response.homeMasked, "sk-*****************************HHH");
  assert.equal(response.hrMasked, "sk-*****************************RRR");
  assert.equal(config.homeMasked, "sk-*****************************HHH");
  assert.equal(config.hrMasked, "sk-*****************************RRR");
  assert.doesNotMatch(JSON.stringify(response), /sk-H{32}|sk-R{32}/);
  assert.doesNotMatch(JSON.stringify(config), /sk-H{32}|sk-R{32}/);

  await assert.rejects(
    () =>
      updateAdminAiConfig(
        {
          apiKey: "generic-secret-key"
        },
        { sub: "u-admin", username: "admin", role: "admin" }
      ),
    (error) => error.statusCode === 400 && /Secret field is not allowed: apiKey/.test(error.message)
  );
  await assert.rejects(
    () =>
      updateAdminAiConfig(
        {
          DEEPSEEK_HOME_API_KEY: `sk-${"E".repeat(32)}`
        },
        { sub: "u-admin", username: "admin", role: "admin" }
      ),
    (error) => error.statusCode === 400 && /Secret value is not allowed: DEEPSEEK_HOME_API_KEY/.test(error.message)
  );
  await assert.rejects(
    () =>
      updateAdminAiConfig(
        {
          deepseek_home_api_key: `sk-${"V".repeat(32)}`
        },
        { sub: "u-admin", username: "admin", role: "admin" }
      ),
    (error) => error.statusCode === 400 && /Secret value is not allowed: deepseek_home_api_key/.test(error.message)
  );
});

test("admin AI config accepts frontend key aliases and stores canonical scoped keys", async () => {
  const { __private__, getAdminAiConfig, updateAdminAiConfig } = await loadIsolatedAiService();

  const response = await updateAdminAiConfig(
    {
      homeApiKey: `sk-${"F".repeat(32)}`,
      hrApiKey: `sk-${"A".repeat(32)}`
    },
    { sub: "u-admin", username: "admin", role: "admin" }
  );
  const config = await getAdminAiConfig();
  const storedConfig = await __private__.stores.configStore.read();

  assert.equal(response.homeConfigured, true);
  assert.equal(response.hrConfigured, true);
  assert.equal(config.homeApiKeyConfigured, true);
  assert.equal(config.hrApiKeyConfigured, true);
  assert.equal(storedConfig.homeDeepSeekApiKey, `sk-${"F".repeat(32)}`);
  assert.equal(storedConfig.hrDeepSeekApiKey, `sk-${"A".repeat(32)}`);
  assert.doesNotMatch(JSON.stringify(response), /sk-F{32}|sk-A{32}/);
  assert.doesNotMatch(JSON.stringify(config), /sk-F{32}|sk-A{32}/);
});

test("admin AI config accepts scoped snake/camel key aliases and stores canonical scoped keys", async () => {
  const { __private__, getAdminAiConfig, updateAdminAiConfig } = await loadIsolatedAiService();

  const response = await updateAdminAiConfig(
    {
      home_deepseek_api_key: `sk-${"S".repeat(32)}`,
      deepseekHrApiKey: `sk-${"C".repeat(32)}`
    },
    { sub: "u-admin", username: "admin", role: "admin" }
  );
  const config = await getAdminAiConfig();
  const storedConfig = await __private__.stores.configStore.read();

  assert.equal(response.homeApiKeyConfigured, true);
  assert.equal(response.hrApiKeyConfigured, true);
  assert.equal(config.homeApiKeyConfigured, true);
  assert.equal(config.hrApiKeyConfigured, true);
  assert.equal(storedConfig.homeDeepSeekApiKey, `sk-${"S".repeat(32)}`);
  assert.equal(storedConfig.hrDeepSeekApiKey, `sk-${"C".repeat(32)}`);
  assert.doesNotMatch(JSON.stringify(response), /sk-S{32}|sk-C{32}/);
  assert.doesNotMatch(JSON.stringify(config), /sk-S{32}|sk-C{32}/);
});

test("admin AI config rejects nested or environment-shaped DeepSeek key fields", async () => {
  const { updateAdminAiConfig } = await loadIsolatedAiService();
  const auth = { sub: "u-admin", username: "admin", role: "admin" };

  await assert.rejects(
    () =>
      updateAdminAiConfig(
        {
          settings: {
            homeDeepSeekApiKey: "home-nested-key"
          }
        },
        auth
      ),
    (error) => error.statusCode === 400 && /Secret field is not allowed: settings\.homeDeepSeekApiKey/.test(error.message)
  );

  await assert.rejects(
    () =>
      updateAdminAiConfig(
        {
          keyStatus: {
            DEEPSEEK_HR_API_KEY: "hr-nested-key"
          }
        },
        auth
      ),
    (error) => error.statusCode === 400 && /Secret field is not allowed: keyStatus\.DEEPSEEK_HR_API_KEY/.test(error.message)
  );
});

test("admin controller keeps validation and permission checks before service calls", () => {
  assert.match(adminControllerSource, /assertAdminAccess\(req\.auth/);
  assert.match(adminControllerSource, /normalizePagination\(req\.query/);
  assert.match(adminControllerSource, /normalizeAuditQuery\(req\.query/);
  assert.match(adminControllerSource, /normalizeSystemConfigPayload\(req\.body/);
  assert.match(adminControllerSource, /listAdminNotices/);
});

test("admin pagination clamps unsafe input and returns deterministic offsets", () => {
  assert.deepEqual(normalizePagination({ page: "2", pageSize: "25" }), {
    page: 2,
    pageSize: 25,
    offset: 25
  });
  assert.deepEqual(normalizePagination({ page: "-10", pageSize: "999" }), {
    page: 1,
    pageSize: 100,
    offset: 0
  });
  assert.deepEqual(normalizePagination({ page: "abc", pageSize: "" }), {
    page: 1,
    pageSize: 20,
    offset: 0
  });
});

test("admin audit query normalizes scope, date range, and search filters", () => {
  assert.deepEqual(
    normalizeAuditQuery({
      page: "3",
      pageSize: "10",
      actorId: " u-admin ",
      action: " update ",
      resourceType: " users ",
      from: "2026/05/01",
      to: "2026-05-15",
      keyword: " role "
    }),
    {
      page: 3,
      pageSize: 10,
      offset: 20,
      actorId: "u-admin",
      action: "update",
      resourceType: "users",
      from: "2026-05-01",
      to: "2026-05-15",
      keyword: "role"
    }
  );
});

test("admin system config payload allowlists safe editable keys", () => {
  assert.deepEqual(
    normalizeSystemConfigPayload({
      siteName: " MIX Collaboration ",
      maintenanceMode: "true",
      registrationEnabled: false,
      auditRetentionDays: "45",
      jwtSecret: "should-not-pass"
    }),
    {
      siteName: "MIX Collaboration",
      maintenanceMode: true,
      registrationEnabled: false,
      auditRetentionDays: 45
    }
  );

  assert.throws(
    () => normalizeSystemConfigPayload({ unknown: "value" }),
    (error) => error.statusCode === 400 && /No editable config fields/.test(error.message)
  );
});

test("admin department update payload can validate partial edits", () => {
  assert.deepEqual(__private__.normalizeDepartmentPayload({ name: " Project Management ", status: "active" }), {
    name: "Project Management",
    nameEn: "",
    parentDepartmentId: "",
    managerUserId: "",
    status: "active",
    sortOrder: 0,
    payload: {}
  });
  assert.deepEqual(__private__.normalizeDepartmentPartialPayload({ status: "archived" }), {
    status: "archived"
  });
});

test("admin user payload matches frontend create form without requiring password field", () => {
  const user = __private__.normalizeUserPayload(
    {
      username: "MIX-new",
      name: "New Member",
      role: "user",
      department: "Project Management"
    },
    { mode: "create" }
  );

  assert.equal(user.username, "MIX-new");
  assert.equal(user.name, "New Member");
  assert.equal(user.role, "employee");
  assert.notEqual(user.password, "MIX801002");
  assert.match(user.password, /^Tmp-/);
  assert.equal(user.generatedPassword, true);
  assert.equal(user.mustChangePassword, true);
});

test("admin user role normalizer accepts frontend-safe aliases", () => {
  assert.equal(__private__.normalizeAdminAssignableRole("super_admin"), "admin");
  assert.equal(__private__.normalizeAdminAssignableRole("user"), "employee");
  assert.equal(__private__.normalizeAdminAssignableRole("editor"), "employee");
  assert.equal(__private__.normalizeAdminAssignableRole("readonly"), "employee");
  assert.equal(__private__.normalizeAdminAssignableRole("department_admin"), "manager");
  assert.equal(__private__.normalizeAdminAssignableRole("department_manager"), "manager");
  assert.equal(__private__.normalizeAdminAssignableRole("project_manager"), "manager");
});

test("admin workspace mutations pass full admin auth context", () => {
  assert.match(adminServiceSource, /function adminWorkspaceAuth/);
  assert.match(adminServiceSource, /updateProject\(projectId, payload, adminWorkspaceAuth\(auth\)\)/);
  assert.match(adminServiceSource, /deleteProject\(projectId, adminWorkspaceAuth\(auth\)\)/);
  assert.match(adminServiceSource, /createTask\(projectId, payload, adminWorkspaceAuth\(auth\)\)/);
  assert.match(adminServiceSource, /updateTask\(taskId, payload, adminWorkspaceAuth\(auth\)\)/);
  assert.match(adminServiceSource, /deleteTask\(taskId, adminWorkspaceAuth\(auth\)\)/);
});

test("admin user mapper never exposes password hashes", () => {
  const user = mapAdminUserRow({
    id: 1,
    user_uid: "u-admin",
    username: "admin",
    password_hash: "secret",
    name: "Admin",
    role: "admin",
    status: "active",
    phone: "13800000000",
    email: "admin@example.com",
    department: "Project Management",
    department_en: "PROJECT MANAGEMENT",
    job: "Super Administrator",
    mbti: "ENTP",
    profile_note: "fixed",
    character_label: "Super Administrator",
    registered_at: "2026-05-15 10:30:00",
    last_login_at_text: "2026-05-15 11:00:00",
    project_count: 4
  });

  assert.deepEqual(Object.keys(user), [
    "id",
    "numericId",
    "username",
    "name",
    "role",
    "status",
    "phone",
    "email",
    "department",
    "departmentEn",
    "job",
    "mbti",
    "profileNote",
    "characterLabel",
    "registeredAt",
    "lastLoginAt",
    "projectCount"
  ]);
  assert.equal(user.id, "u-admin");
  assert.equal(user.projectCount, 4);
  assert.equal("passwordHash" in user, false);
  assert.equal("password_hash" in user, false);
});

test("admin permission mapper groups role permissions and user scoped roles", () => {
  const mapped = mapAdminPermissionRows(
    [
      {
        role_key: "admin",
        role_name: "Super Administrator",
        role_description: "Global",
        is_system: 1,
        permission_key: "admin.users.read",
        permission_name: "Users Read",
        permission_description: "Read users"
      },
      {
        role_key: "admin",
        role_name: "Super Administrator",
        role_description: "Global",
        is_system: 1,
        permission_key: "admin.users.write",
        permission_name: "Users Write",
        permission_description: "Write users"
      },
      {
        role_key: "manager",
        role_name: "Project Manager",
        role_description: "Project",
        is_system: 1,
        permission_key: null
      }
    ],
    [
      {
        user_uid: "u-1",
        username: "MIX-a",
        name: "Alice",
        role_key: "manager",
        scope_type: "project",
        scope_uid: "project-1"
      }
    ]
  );

  assert.equal(mapped.roles.length, 2);
  assert.deepEqual(mapped.roles[0].permissions.map((item) => item.key), [
    "admin.users.read",
    "admin.users.write"
  ]);
  assert.deepEqual(mapped.userRoles[0], {
    id: "u-1-manager-project-project-1",
    userId: "u-1",
    username: "MIX-a",
    name: "Alice",
    role: "manager",
    scopeType: "project",
    scopeId: "project-1"
  });
});

test("admin dashboard summarizes core backend records", () => {
  const dashboard = buildAdminDashboard({
    users: { total: 7, active: 6, admins: 1, managers: 2 },
    projects: { total: 5, active: 3, archived: 2, risk: 1 },
    tasks: { total: 20, active: 12, done: 8, overdue: 2 },
    comments: { total: 30, risk: 4 },
    boards: { total: 6, active: 5 },
    schedules: { plans: 4, items: 16 },
    audit: { today: 9 }
  });

  assert.deepEqual(dashboard.cards.map((card) => card.key), [
    "activeProjects",
    "activeTasks",
    "riskComments",
    "archivedProjects",
    "users",
    "auditToday"
  ]);
  assert.equal(dashboard.cards.find((card) => card.key === "riskComments").status, "danger");
  assert.equal(dashboard.system.rows.find((row) => row.key === "scheduleItems").count, 16);
});

test("admin audit log mapper exposes stable camelCase fields", () => {
  const entry = mapAdminAuditLogRow({
    log_uid: "al-1",
    actor_user_uid: "u-admin",
    actor_name: "Admin",
    actor_role: "admin",
    action: "update",
    resource_type: "users",
    resource_uid: "u-2",
    resource_name: "Target User",
    ip_address: "127.0.0.1",
    user_agent: "node-test",
    summary: "Update role",
    before_json: "{\"role\":\"employee\"}",
    after_json: "{\"role\":\"manager\"}",
    created_at: "2026-05-15 12:00:00"
  });

  assert.deepEqual(entry, {
    id: "al-1",
    actorId: "u-admin",
    actorName: "Admin",
    actorRole: "admin",
    action: "update",
    resourceType: "users",
    resourceId: "u-2",
    resourceName: "Target User",
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
    summary: "Update role",
    before: { role: "employee" },
    after: { role: "manager" },
    createdAt: "2026/05/15 12:00"
  });
});

test("admin private helpers enforce admin-only boundary", () => {
  assert.equal(__private__.assertAdminAccess({ role: "admin" }).role, "admin");
  assert.equal(__private__.assertAdminAccess({ role: "super_admin" }).role, "admin");
  assert.throws(
    () => __private__.assertAdminAccess({ role: "manager" }),
    (error) => error.statusCode === 403 && /Admin permission required/.test(error.message)
  );
});
