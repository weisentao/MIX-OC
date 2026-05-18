import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const moduleRoot = new URL("../src/modules/hr/", import.meta.url);

const readHrFile = (name) => readFileSync(new URL(name, moduleRoot), "utf8");

async function withEmptyAiKeyStore(run) {
  const originalAiDataDir = process.env.AI_DATA_DIR;
  const aiDataDir = await mkdtemp(join(tmpdir(), "xjg-hr-ai-keys-"));

  try {
    process.env.AI_DATA_DIR = aiDataDir;
    await writeFile(
      join(aiDataDir, "config.json"),
      JSON.stringify({
        homeDeepSeekApiKey: "",
        hrDeepSeekApiKey: ""
      }),
      "utf8"
    );
    return await run();
  } finally {
    if (originalAiDataDir === undefined) {
      delete process.env.AI_DATA_DIR;
    } else {
      process.env.AI_DATA_DIR = originalAiDataDir;
    }
    await rm(aiDataDir, { recursive: true, force: true });
  }
}

test("HR routes expose frontend resource endpoints and module CRUD endpoints", () => {
  const source = readHrFile("hr.routes.js");
  const routes = [
    ["get", "/workspace/resources"],
    ["get", "/workspace/workload"],
    ["get", "/workspace/resources/ai/assignment-advice"],
    ["post", "/workspace/resources/ai/assignment-advice"],
    ["patch", "/workspace/resources/work-items/:workItemId/schedule"],
    ["post", "/workspace/assignments/preview"],
    ["post", "/workspace/assignments/confirm"],
    ["post", "/workspace/assignments/force-confirm"],
    ["get", "/hr/employees"],
    ["post", "/hr/employees"],
    ["get", "/hr/employees/:employeeId"],
    ["put", "/hr/employees/:employeeId"],
    ["delete", "/hr/employees/:employeeId"],
    ["get", "/hr/departments"],
    ["post", "/hr/departments"],
    ["get", "/hr/departments/:departmentId"],
    ["put", "/hr/departments/:departmentId"],
    ["delete", "/hr/departments/:departmentId"],
    ["get", "/hr/positions"],
    ["post", "/hr/positions"],
    ["get", "/hr/positions/:positionId"],
    ["put", "/hr/positions/:positionId"],
    ["delete", "/hr/positions/:positionId"],
    ["get", "/hr/attendance"],
    ["post", "/hr/attendance"],
    ["get", "/hr/attendance/:attendanceId"],
    ["put", "/hr/attendance/:attendanceId"],
    ["delete", "/hr/attendance/:attendanceId"],
    ["get", "/hr/leaves"],
    ["post", "/hr/leaves"],
    ["get", "/hr/leaves/:leaveId"],
    ["put", "/hr/leaves/:leaveId"],
    ["delete", "/hr/leaves/:leaveId"],
    ["get", "/hr/recruitment/jobs"],
    ["post", "/hr/recruitment/jobs"],
    ["get", "/hr/recruitment/jobs/:jobId"],
    ["put", "/hr/recruitment/jobs/:jobId"],
    ["delete", "/hr/recruitment/jobs/:jobId"],
    ["get", "/hr/recruitment/candidates"],
    ["post", "/hr/recruitment/candidates"],
    ["get", "/hr/recruitment/candidates/:candidateId"],
    ["put", "/hr/recruitment/candidates/:candidateId"],
    ["delete", "/hr/recruitment/candidates/:candidateId"],
    ["get", "/hr/performance"],
    ["post", "/hr/performance"],
    ["get", "/hr/performance/:reviewId"],
    ["put", "/hr/performance/:reviewId"],
    ["delete", "/hr/performance/:reviewId"],
    ["get", "/hr/payroll"],
    ["post", "/hr/payroll"],
    ["get", "/hr/payroll/:payrollId"],
    ["put", "/hr/payroll/:payrollId"],
    ["delete", "/hr/payroll/:payrollId"]
  ];

  for (const [method, path] of routes) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(source, new RegExp(`router\\.${method}\\("${escapedPath}"`, "i"), `missing ${method.toUpperCase()} ${path}`);
  }
});

test("HR routes require explicit HR management permission for CRUD and scoped workspace permissions for assignment writes", () => {
  const source = readHrFile("hr.routes.js");

  assert.match(source, /requirePermission\("hr\.manage"\)/);
  assert.match(source, /requirePermission\("workspace\.write"\)/);
  assert.match(source, /requirePermission\("resource\.forceassign"\)/);
  assert.doesNotMatch(source, /requirePermission\(\[[^\]]*"workspace\.export"[^\]]*\]\)/);
  assert.match(source, /const requireAssignmentAdvice = requirePermission\(\["workspace\.write", "hr\.read", "hr\.manage"\]\)/);
  assert.match(source, /router\.get\("\/workspace\/resources", authRequired, getWorkspaceResources\)/);
  assert.match(source, /router\.get\("\/workspace\/workload", authRequired, getWorkspaceWorkload\)/);
  assert.match(source, /router\.get\("\/workspace\/resources\/ai\/assignment-advice", authRequired, requireAssignmentAdvice, getAssignmentAdviceStatus\)/);
  assert.match(source, /router\.post\("\/workspace\/resources\/ai\/assignment-advice", authRequired, requireAssignmentAdvice, postAssignmentAdvice\)/);
  assert.doesNotMatch(source, /router\.post\("\/workspace\/resources\/ai\/assignment-advice"[^;]*requireHrManage/);
  assert.match(source, /router\.patch\("\/workspace\/resources\/work-items\/:workItemId\/schedule", authRequired, requireWorkspaceWrite, patchWorkspaceWorkItemSchedule\)/);
  assert.match(source, /router\.post\("\/workspace\/assignments\/preview", authRequired, requireWorkspaceWrite, postAssignmentPreview\)/);
  assert.match(source, /router\.post\("\/workspace\/assignments\/force-confirm", authRequired, requireResourceForceAssign, postAssignmentForceConfirm\)/);
  assert.match(source, /router\.get\("\/hr\/employees", authRequired, requireHrManage, getEmployees\)/);
  assert.match(source, /router\.post\("\/hr\/payroll", authRequired, requireHrManage, postPayroll\)/);
});

test("HR assignment advice exposes safe backend availability and reads saved scoped key config", () => {
  const source = readHrFile("hr.service.js");
  const controller = readHrFile("hr.controller.js");

  assert.match(source, /readStoredAiKeyConfigSync/);
  assert.match(source, /resolveHrDeepSeekApiKeyFromConfig\(readStoredAiKeyConfigSync\(\)\)/);
  assert.match(source, /export function getAssignmentAdviceAvailability/);
  assert.match(source, /hrApiKeyConfigured/);
  assert.doesNotMatch(source, /return\s+\[[^\]]*process\.env\.DEEPSEEK_HR_API_KEY[\s\S]*process\.env\.DEEPSEEK_API_KEY[\s\S]*\]\s*\.map/);
  assert.match(controller, /export async function getAssignmentAdviceStatus/);
  assert.match(controller, /res\.json\(getAssignmentAdviceAvailability\(\)\)/);
});

test("HR schema initializes dedicated tables with safe idempotent SQL", () => {
  const source = readHrFile("hr.schema.js");
  const expectedTables = [
    "hr_positions",
    "hr_employee_profiles",
    "hr_attendance_records",
    "hr_leave_requests",
    "hr_recruitment_jobs",
    "hr_recruitment_candidates",
    "hr_performance_reviews",
    "hr_payroll_records",
    "hr_assignment_previews"
  ];

  for (const table of expectedTables) {
    assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"), `missing table ${table}`);
  }
  assert.doesNotMatch(source, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(source, /\bTRUNCATE\b/i);
});

test("HR service uses parameterized MySQL calls and exposes expected operations", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const source = readHrFile("hr.service.js");

  for (const name of [
    "ensureHrSchema",
    "listEmployees",
    "createEmployee",
    "updateEmployee",
    "deleteEmployee",
    "listDepartments",
    "getDepartment",
    "createDepartment",
    "deleteDepartment",
    "listPositions",
    "getPosition",
    "deletePosition",
    "createAttendanceRecord",
    "getAttendanceRecord",
    "deleteAttendanceRecord",
    "createLeaveRequest",
    "getLeaveRequest",
    "deleteLeaveRequest",
    "listRecruitmentJobs",
    "getRecruitmentJob",
    "deleteRecruitmentJob",
    "createRecruitmentCandidate",
    "getRecruitmentCandidate",
    "deleteRecruitmentCandidate",
    "listPerformanceReviews",
    "getPerformanceReview",
    "deletePerformanceReview",
    "createPayrollRecord",
    "getPayrollRecord",
    "deletePayrollRecord",
    "getResourceSnapshot",
    "getWorkloadSnapshot",
    "getAssignmentAdvice",
    "previewAssignment",
    "confirmAssignment",
    "updateWorkspaceWorkItemSchedule"
  ]) {
    assert.equal(typeof service[name], "function", `${name} should be exported`);
  }

  assert.match(source, /mysqlPool\.execute\([\s\S]*\?/);
  assert.match(source, /hashPassword/);
  assert.match(source, /DEFAULT_EMPLOYEE_PASSWORD/);
  assert.doesNotMatch(source, /password_hash,\s*name[\s\S]*VALUES\s*\([^)]*''\s*,\s*\?/i);
  assert.doesNotMatch(source, /mysqlPool\.query\([^,)]*\$\{/);
  assert.doesNotMatch(source, /\bDELETE\s+FROM\s+users\b/i);
});

test("HR work item schedule patch keeps response fields stable and validates dates before MySQL", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const source = readHrFile("hr.service.js");

  assert.match(source, /function mapSchedulePatchItem/);
  assert.match(source, /function mapSchedulePatchTask/);
  assert.match(source, /syncResult:\s*\{/);
  assert.match(source, /sync:\s*\{/);
  assert.match(source, /resourceWorkItemUpdated/);
  assert.match(source, /scheduleUpdated/);
  assert.match(source, /interaction/);
  assert.match(source, /workItem:\s*mapSchedulePatchItem/);
  assert.match(source, /scheduleItem:\s*mapSchedulePatchItem/);
  assert.match(source, /task:\s*mapSchedulePatchTask/);
  assert.match(source, /ownerUserId/);
  assert.match(source, /assigneeId/);
  assert.match(source, /assigneeName/);
  assert.match(source, /startDate/);
  assert.match(source, /endDate/);

  await assert.rejects(
    () => service.updateWorkspaceWorkItemSchedule("si-date", { startDate: "2026-02-31" }, { sub: "u-editor" }),
    (error) => error.statusCode === 400 && /Invalid date/.test(error.message)
  );

  await assert.rejects(
    () =>
      service.updateWorkspaceWorkItemSchedule(
        "si-range",
        { startDate: "2026/05/21", endDate: "2026/05/20" },
        { sub: "u-editor" }
      ),
    (error) => error.statusCode === 400 && /endDate cannot be earlier than startDate/.test(error.message)
  );

  await assert.rejects(
    () =>
      service.updateWorkspaceWorkItemSchedule(
        "",
        { scheduleItemId: "   ", taskUid: "", taskId: "" },
        { sub: "u-editor" }
      ),
    (error) => error.statusCode === 400 && /workItemId is required/.test(error.message)
  );
});

test("HR work item schedule patch uses parameterized schedule/task updates and MySQL 503 guard", () => {
  const source = readHrFile("hr.service.js");
  const scheduleItemUpdate = source.slice(source.indexOf("async function updateSchedulePatchItem"), source.indexOf("async function updateSchedulePatchTask"));
  const taskUpdate = source.slice(source.indexOf("async function updateSchedulePatchTask"), source.indexOf("async function updateSchedulePatchItemsByTaskUid"));

  assert.match(source, /assertMySQLReady\(\)/);
  assert.match(scheduleItemUpdate, /UPDATE schedule_items[\s\S]*owner_user_uid = \?[\s\S]*updated_by = \?/);
  assert.match(taskUpdate, /UPDATE tasks[\s\S]*owner_user_uid = \?[\s\S]*updated_by = \?/);
  assert.match(scheduleItemUpdate, /WHERE item_uid = \?/);
  assert.match(taskUpdate, /WHERE task_uid = \?/);
  assert.doesNotMatch(scheduleItemUpdate, /\$\{/);
  assert.doesNotMatch(taskUpdate, /\$\{/);
});

test("HR assignment confirmation requires force reason and syncs schedule/task records", () => {
  const source = readHrFile("hr.service.js");
  const confirmSource = source.slice(source.indexOf("export async function confirmAssignment"), source.indexOf("export const __private__"));
  const syncSource = source.slice(source.indexOf("async function syncAssignmentWorkItem"), source.indexOf("export async function confirmAssignment"));

  assert.match(source, /function normalizeAssignmentSyncPayload/);
  assert.match(source, /function normalizeAssignmentConfirmPayload/);
  assert.match(source, /function normalizeAssignmentPreviewContext/);
  assert.match(source, /async function findAssignmentPreviewContext/);
  assert.match(source, /async function createAssignmentWorkItem/);
  assert.match(source, /async function ensureAssignmentWorkItem/);
  assert.match(source, /function syncAssignmentWorkItem/);
  assert.match(source, /return updateWorkspaceWorkItemSchedule/);
  assert.match(syncSource, /assignment\.scheduleItemId \|\| assignment\.taskUid/);
  assert.match(confirmSource, /const assignment = await insertAssignmentRecord\(confirmPayload/);
  assert.match(confirmSource, /const scheduleSync = await ensureAssignmentWorkItem\(confirmPayload, assignment, auth\)/);
  assert.match(confirmSource, /throw badRequest\("forceReason is required"\)/);
  assert.match(confirmSource, /!hasPermission\(auth, "resource\.forceassign"\)/);
  assert.doesNotMatch(confirmSource, /workspace\.export/);
  assert.match(confirmSource, /throw forbidden\("No permission to force assign"\)/);
  assert.match(confirmSource, /findAssignmentPreviewContext\(requestPayload\.previewId \|\| requestPayload\.id\)/);
  assert.match(confirmSource, /const requestPayload = normalizeAssignmentConfirmPayload\(payload\)/);
  assert.match(confirmSource, /let confirmPayload = normalizeAssignmentConfirmPayload\(mergeDefined\(previewContext, requestPayload\)\)/);
  assert.doesNotMatch(confirmSource, /assertAssignmentSyncLink\(confirmPayload\)/);
  assert.match(syncSource, /if \(workItemId\) return syncAssignmentWorkItem\(payload, assignment, auth\)/);
  assert.match(syncSource, /return createAssignmentWorkItem\(payload, assignment, auth\)/);
  assert.match(confirmSource, /scheduleItem: scheduleSync\.scheduleItem/);
  assert.match(confirmSource, /task: scheduleSync\.task/);
  assert.match(confirmSource, /syncResult: scheduleSync\.syncResult/);
  assert.match(syncSource, /codedConflict\("RESOURCE_SYNC_LINK_MISSING", "RESOURCE_SYNC_LINK_MISSING"\)/);
  assert.match(confirmSource, /completion:\s*\{[\s\S]*ok: resourceWorkItemUpdated/);
});

test("HR assignment confirmation creates a new schedule item when no sync link ids are present", () => {
  const source = readHrFile("hr.service.js");
  const confirmSource = source.slice(source.indexOf("export async function confirmAssignment"), source.indexOf("export const __private__"));
  const syncSource = source.slice(source.indexOf("async function ensureAssignmentWorkItem"), source.indexOf("function assertAssignmentSyncLink"));

  assert.match(confirmSource, /if \(!assignmentWorkItemId\(confirmPayload\)\) \{/);
  assert.match(confirmSource, /confirmPayload = mergeDefined\(confirmPayload, await resolveAssignmentProjectContext\(confirmPayload, auth\)\);/);
  assert.match(syncSource, /if \(workItemId\) return syncAssignmentWorkItem\(payload, assignment, auth\)/);
  assert.match(syncSource, /return createAssignmentWorkItem\(payload, assignment, auth\)/);
});

test("HR assignment confirmation normalizes ResourceAssignmentDrawer nested payload aliases", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const normalized = service.__private__.normalizeAssignmentConfirmPayload({
    candidate: {
      personId: "u-resource-designer",
      name: "资源设计师",
      skills: ["UI", "动效"]
    },
    resource: {
      user: {
        userId: "u-resource-user",
        name: "资源用户"
      }
    },
    user: {
      id: "u-fallback-user",
      username: "fallback"
    },
    workItem: {
      workItemId: "wi-drifted",
      itemId: "si-resource-001",
      scheduleItemId: "si-resource-001",
      taskUid: "task-resource-001",
      projectId: "project-resource-001",
      title: "旧任务标题",
      startDate: "2026/05/18",
      endDate: "2026/05/21"
    },
    taskDraft: {
      title: "抽屉确认任务",
      project: { id: "project-draft-001", name: "抽屉项目" },
      date: { start: "2026/05/20", end: "2026/05/23" },
      skills: ["插画", "UI"],
      priority: "高"
    },
    project: {
      projectUid: "project-top-001",
      name: "顶层项目"
    },
    date: {
      startDate: "2026/05/19",
      endDate: "2026/05/24"
    }
  });

  assert.equal(normalized.assigneeId, "u-resource-designer");
  assert.equal(normalized.assigneeName, "资源设计师");
  assert.equal(normalized.workItemId, "wi-drifted");
  assert.equal(normalized.scheduleItemId, "si-resource-001");
  assert.equal(normalized.taskUid, "task-resource-001");
  assert.equal(normalized.projectId, "project-draft-001");
  assert.equal(normalized.project, "抽屉项目");
  assert.equal(normalized.title, "抽屉确认任务");
  assert.equal(normalized.startDate, "2026/05/20");
  assert.equal(normalized.endDate, "2026/05/23");
  assert.deepEqual(normalized.skillTags, ["插画", "UI"]);
  assert.equal(service.__private__.assignmentWorkItemId(normalized), "si-resource-001");
});

test("HR assignment confirmation normalizes flat and nested selected user aliases", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const normalized = service.__private__.normalizeAssignmentConfirmPayload({
    assigneeId: "u-flat",
    assigneeName: "Flat User",
    personId: "u-flat",
    userId: "u-flat",
    taskDraft: {
      title: "Task from drawer",
      projectId: "project-1",
      startDate: "2026/05/20",
      endDate: "2026/05/21"
    },
    workItem: {
      scheduleItemId: "si-1",
      taskUid: "task-1"
    },
    scheduleItem: {
      itemId: "si-1",
      taskUid: "task-1"
    },
    task: {
      taskUid: "task-1"
    },
    candidates: [
      {
        personId: "u-flat",
        userId: "u-flat",
        name: "Flat User"
      }
    ]
  });

  assert.equal(normalized.assigneeId, "u-flat");
  assert.equal(normalized.personId, "u-flat");
  assert.equal(normalized.userId, "u-flat");
  assert.equal(normalized.scheduleItemId, "si-1");
  assert.equal(normalized.taskUid, "task-1");
  assert.deepEqual(normalized.candidates, [{ personId: "u-flat", userId: "u-flat", name: "Flat User" }]);
  assert.equal(service.__private__.assignmentWorkItemId(normalized), "si-1");
});

test("HR sync link helpers prefer schedule and task ids over drifted workItem ids", () => {
  const source = readHrFile("hr.service.js");
  const syncPayloadSource = source.slice(source.indexOf("function normalizeAssignmentSyncPayload"), source.indexOf("function normalizeAssignmentPreviewContext"));
  const schedulePatchSource = source.slice(source.indexOf("export async function updateWorkspaceWorkItemSchedule"), source.indexOf("export async function previewAssignment"));

  assert.match(syncPayloadSource, /scheduleItemId:\s*cleanString\(payload\.scheduleItemId/);
  assert.match(syncPayloadSource, /taskUid:\s*cleanString\(payload\.taskUid/);
  assert.match(schedulePatchSource, /stableSchedulePatchItemLookupId\(payload,\s*cleanWorkItemId\)/);
  assert.match(schedulePatchSource, /stableSchedulePatchTaskLookupId\(payload,\s*cleanWorkItemId\)/);
  assert.doesNotMatch(schedulePatchSource, /const itemLookupId = cleanString\(payload\.itemId \|\| payload\.itemUid \|\| cleanWorkItemId\)/);
  assert.doesNotMatch(schedulePatchSource, /const taskLookupId = cleanString\(payload\.taskId \|\| payload\.taskUid \|\| cleanWorkItemId\)/);
});

test("HR schedule patch accepts person route ids when stable link ids are in the payload", () => {
  const source = readHrFile("hr.service.js");
  const schedulePatchSource = source.slice(source.indexOf("export async function updateWorkspaceWorkItemSchedule"), source.indexOf("export async function previewAssignment"));

  assert.match(source, /function stableSchedulePatchItemLookupId/);
  assert.match(source, /function stableSchedulePatchTaskLookupId/);
  assert.match(schedulePatchSource, /stableSchedulePatchItemLookupId\(payload,\s*cleanWorkItemId\)/);
  assert.match(schedulePatchSource, /stableSchedulePatchTaskLookupId\(payload,\s*cleanWorkItemId\)/);
  assert.doesNotMatch(schedulePatchSource, /const itemLookupId = cleanString\(payload\.scheduleItemId \|\| payload\.itemId \|\| payload\.itemUid \|\| cleanWorkItemId\)/);
  assert.doesNotMatch(schedulePatchSource, /const taskLookupId = cleanString\(payload\.taskUid \|\| payload\.taskId \|\| cleanWorkItemId\)/);
});

test("HR force assignment permission and preview selection do not use broad export fallbacks", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const source = readHrFile("hr.service.js");
  const privateApi = service.__private__;

  assert.equal(
    privateApi.buildResourcePermissions(
      { role: "manager", permissions: ["workspace.export"], department: "D1" },
      {}
    ).canForceAssignOverload,
    false
  );
  assert.equal(
    privateApi.buildResourcePermissions(
      { role: "manager", permissions: ["resource.forceAssign"], department: "D1" },
      {}
    ).canForceAssignOverload,
    true
  );

  const candidates = [
    { personId: "u-1", userId: "u-1", name: "A" },
    { personId: "u-2", userId: "u-2", name: "B" }
  ];
  assert.deepEqual(privateApi.selectAssignmentCandidate(candidates, { assigneeId: "missing" }), {
    requestedAssigneeId: "missing",
    selected: null,
    requestedCandidateMissing: true
  });
  assert.equal(privateApi.selectAssignmentCandidate(candidates, { assigneeId: "u-2" }).selected.personId, "u-2");

  const payloadCandidates = privateApi.buildCandidateList([], {
    candidates: [
      {
        personId: "u-local",
        name: "Local Candidate",
        loadBefore: 20,
        loadAfter: 40,
        conflictCount: 0
      }
    ]
  });
  assert.equal(payloadCandidates[0].personId, "u-local");
  assert.equal(privateApi.selectAssignmentCandidate(payloadCandidates, { assigneeId: "u-local" }).selected.name, "Local Candidate");

  const previewSource = source.slice(source.indexOf("export async function previewAssignment"), source.indexOf("async function insertAssignmentRecord"));
  assert.match(previewSource, /selectAssignmentCandidate\(candidates, payload\)/);
  assert.match(previewSource, /\ballowed,\n/);
  assert.match(previewSource, /ASSIGNEE_NOT_IN_CANDIDATES/);
  assert.doesNotMatch(previewSource, /candidates\.find[\s\S]{0,160}\|\|\s*candidates\[0\]/);
});

test("HR resource scope and work item payload do not leak authorized manager data", () => {
  const source = readHrFile("hr.service.js");

  assert.match(source, /function resolveRequestedScope/);
  assert.match(source, /function resolveAuthorizedManagerScope/);
  assert.match(source, /function canNarrowToDepartment/);
  assert.match(source, /function canNarrowToProject/);
  assert.match(source, /hasPermission\(auth, "hr\.manage"\)/);
  assert.match(source, /hasPermission\(auth, "hr\.read"\)/);
  assert.match(source, /return companyScope\(\)/);
  assert.match(source, /return authorizedScope/);
  assert.match(source, /scope\.type === "authorized"/);
  assert.match(source, /u\.user_uid = \?/);
  assert.match(source, /scope\.type === "project"/);
  assert.match(source, /scheduleItemId/);
  assert.match(source, /taskUid/);
  assert.match(source, /ownerUserId/);
  assert.match(source, /assigneeName/);
});

test("HR resource rows include owner-text schedule and task work for scoped managers", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const source = readHrFile("hr.service.js");

  const filter = service.__private__.buildWorkItemAccessFilter({
    scope: { type: "department", departmentIds: ["项目管理部"], projectIds: [], userIds: ["u-zhumin"] },
    peopleRows: [
      {
        user_uid: "u-admin",
        username: "admin",
        name: "admin",
        department: "项目管理部",
        profile_department_name: "项目管理部"
      }
    ]
  });

  assert.match(filter.sql, /owner_user_uid IN/);
  assert.match(filter.sql, /owner_text LIKE/);
  assert.ok(filter.params.includes("u-admin"));
  assert.ok(filter.params.includes("%: admin"));
  assert.ok(filter.params.includes("项目管理部%"));
  assert.match(source, /COALESCE\(NULLIF\(si\.owner_text, ''\), NULLIF\(t\.owner_text, ''\), NULLIF\(p\.owner_text, ''\), ''\) AS owner_text/);
  assert.match(source, /FROM tasks t/);
  assert.match(source, /NOT EXISTS \(\s*SELECT 1 FROM schedule_items/);
});

test("HR assignment advice contract supports DeepSeek with local fallback and scoped output", () => {
  const controller = readHrFile("hr.controller.js");
  const service = readHrFile("hr.service.js");

  assert.match(controller, /export async function postAssignmentAdvice/);
  assert.match(controller, /res\.json\(await getAssignmentAdvice\(req\.body \|\| \{\}, req\.auth \|\| \{\}\)\)/);
  assert.match(service, /export async function getAssignmentAdvice/);
  assert.match(service, /getResourceSnapshot\(payload\.scope \|\| payload, auth\)/);
  assert.match(service, /getWorkloadSnapshot\(payload\.scope \|\| payload, auth\)/);
  assert.match(service, /candidates/);
  assert.match(service, /recommendedCandidate/);
  assert.match(service, /recommendedCandidateId/);
  assert.match(service, /source = "deepseek"/);
  assert.match(service, /source = "local"/);
  assert.match(service, /source,\r?\n/);
  assert.doesNotMatch(service, /source:\s*"local",/);
  assert.match(service, /status: fallback \? "empty" : "ready"/);
  assert.match(service, /fallback/);
  assert.match(service, /aiError/);
  assert.match(service, /localFallbackReason/);
  assert.match(service, /advice/);
  assert.match(service, /usage/);
  assert.match(service, /callHrDeepSeek/);
  assert.match(service, /resolveHrDeepSeekApiKey/);
  assert.match(service, /resolveHrDeepSeekApiKeyFromConfig\(readStoredAiKeyConfigSync\(\)\)/);
  assert.match(service, /DeepSeek HR API key is not configured/);
  assert.match(service, /HR_AI_KEY_NOT_CONFIGURED/);
  assert.match(service, /isHrAiConfigurationError/);
  assert.match(service, /HR assignment advice service is temporarily unavailable/);
  assert.match(service, /syncNotes/);
  assert.match(service, /risk/);
  assert.match(service, /summary/);
  assert.match(service, /actions/);
  assert.match(service, /scope/);
  assert.doesNotMatch(service, /openai/i);
});

test("HR DeepSeek runtime key resolution prioritizes HR key then legacy key", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const originalHrKey = process.env.DEEPSEEK_HR_API_KEY;
  const originalLegacyKey = process.env.DEEPSEEK_API_KEY;

  try {
    await withEmptyAiKeyStore(async () => {
      process.env.DEEPSEEK_HR_API_KEY = "hr-priority-key";
      process.env.DEEPSEEK_API_KEY = "legacy-fallback-key";
      assert.equal(service.__private__.resolveHrDeepSeekApiKey(), "hr-priority-key");

      process.env.DEEPSEEK_HR_API_KEY = "";
      assert.equal(service.__private__.resolveHrDeepSeekApiKey(), "legacy-fallback-key");

      process.env.DEEPSEEK_HR_API_KEY = "   ";
      assert.equal(service.__private__.resolveHrDeepSeekApiKey(), "legacy-fallback-key");
    });
  } finally {
    if (originalHrKey === undefined) {
      delete process.env.DEEPSEEK_HR_API_KEY;
    } else {
      process.env.DEEPSEEK_HR_API_KEY = originalHrKey;
    }
    if (originalLegacyKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalLegacyKey;
    }
  }
});

test("HR DeepSeek call returns explicit 503 when HR and legacy keys are both missing", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const originalHrKey = process.env.DEEPSEEK_HR_API_KEY;
  const originalLegacyKey = process.env.DEEPSEEK_API_KEY;

  try {
    await withEmptyAiKeyStore(async () => {
      process.env.DEEPSEEK_HR_API_KEY = "";
      process.env.DEEPSEEK_API_KEY = "";

      await assert.rejects(
        () => service.__private__.callHrDeepSeek([{ role: "user", content: "ping" }]),
        (error) =>
          error.statusCode === 503 &&
          error.code === "HR_AI_KEY_NOT_CONFIGURED" &&
          /DeepSeek HR API key is not configured/.test(error.message)
      );
    });
  } finally {
    if (originalHrKey === undefined) {
      delete process.env.DEEPSEEK_HR_API_KEY;
    } else {
      process.env.DEEPSEEK_HR_API_KEY = originalHrKey;
    }
    if (originalLegacyKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalLegacyKey;
    }
  }
});

test("HR assignment advice returns explicit 503 when HR and legacy keys are both missing", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const originalHrKey = process.env.DEEPSEEK_HR_API_KEY;
  const originalLegacyKey = process.env.DEEPSEEK_API_KEY;

  try {
    await withEmptyAiKeyStore(async () => {
      process.env.DEEPSEEK_HR_API_KEY = "";
      process.env.DEEPSEEK_API_KEY = "";

      await assert.rejects(
        () =>
          service.getAssignmentAdvice(
            {
              title: "Need assignment advice",
              candidates: [
                {
                  personId: "u-1",
                  name: "Candidate A",
                  loadBefore: 20,
                  loadAfter: 40,
                  conflictCount: 0
                }
              ]
            },
            { sub: "u-manager", username: "manager", role: "manager" }
          ),
        (error) =>
          error.statusCode === 503 &&
          error.code === "HR_AI_KEY_NOT_CONFIGURED" &&
          /DeepSeek HR API key is not configured/.test(error.message)
      );
    });
  } finally {
    if (originalHrKey === undefined) {
      delete process.env.DEEPSEEK_HR_API_KEY;
    } else {
      process.env.DEEPSEEK_HR_API_KEY = originalHrKey;
    }
    if (originalLegacyKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalLegacyKey;
    }
  }
});

test("HR DeepSeek model aliases normalize before calling provider", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const originalFetch = globalThis.fetch;
  const originalHrKey = process.env.DEEPSEEK_HR_API_KEY;
  const originalLegacyKey = process.env.DEEPSEEK_API_KEY;
  const seenAuthHeaders = [];
  const seenModels = [];

  globalThis.fetch = async (_url, options = {}) => {
    seenAuthHeaders.push(String(options?.headers?.Authorization || ""));
    seenModels.push(JSON.parse(String(options.body || "{}")).model);
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "hr-ok" } }]
        })
    };
  };

  try {
    process.env.DEEPSEEK_HR_API_KEY = "hr-model-key";
    process.env.DEEPSEEK_API_KEY = "";

    await service.__private__.callHrDeepSeek([{ role: "user", content: "ping" }], "deepseek-fourth-pro");
    await service.__private__.callHrDeepSeek([{ role: "user", content: "ping" }], "deepseek-chat");

    assert.deepEqual(seenModels, ["deepseek-v4-pro", "deepseek-v4-flash"]);
    assert.deepEqual(seenAuthHeaders, ["Bearer hr-model-key", "Bearer hr-model-key"]);
    assert.equal(service.__private__.normalizeHrModel("deepseek-v4-pro"), "deepseek-v4-pro");
    assert.equal(service.__private__.normalizeHrModel("deepseek-reasoner"), "deepseek-v4-pro");
    assert.equal(service.__private__.normalizeHrModel("unknown-model"), "deepseek-v4-flash");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalHrKey === undefined) {
      delete process.env.DEEPSEEK_HR_API_KEY;
    } else {
      process.env.DEEPSEEK_HR_API_KEY = originalHrKey;
    }
    if (originalLegacyKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalLegacyKey;
    }
  }
});

test("HR DeepSeek provider failure returns explicit 503 with readable message", async () => {
  const service = await import("../src/modules/hr/hr.service.js");
  const originalFetch = globalThis.fetch;
  const originalHrKey = process.env.DEEPSEEK_HR_API_KEY;
  const originalLegacyKey = process.env.DEEPSEEK_API_KEY;

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ error: { message: "hr upstream unavailable" } })
  });

  try {
    process.env.DEEPSEEK_HR_API_KEY = "hr-provider-key";
    process.env.DEEPSEEK_API_KEY = "";

    await assert.rejects(
      () => service.__private__.callHrDeepSeek([{ role: "user", content: "provider failure" }]),
      (error) => error.statusCode === 503 && /temporarily unavailable/i.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalHrKey === undefined) {
      delete process.env.DEEPSEEK_HR_API_KEY;
    } else {
      process.env.DEEPSEEK_HR_API_KEY = originalHrKey;
    }
    if (originalLegacyKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalLegacyKey;
    }
  }
});
