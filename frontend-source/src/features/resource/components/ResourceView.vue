<script setup>
import { computed, onMounted, reactive, shallowRef, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import resourceApi from "@/services/resourceApi";
import { backendSyncToast, isAuthApiError, isLoginExpiredApiError } from "@/services/apiErrors";
import { handleWorkspaceAuthFailure } from "@/stores/workspace/actions/appActions";
import workspaceApi from "@/services/workspaceApi";
import ResourceAssignmentDrawer from "./ResourceAssignmentDrawer.vue";
import ResourceAiAdvisorDrawer from "./ResourceAiAdvisorDrawer.vue";
import ResourceNodeView from "./ResourceNodeView.vue";
import ResourceOverloadConfirmDialog from "./ResourceOverloadConfirmDialog.vue";
import ResourcePersonPanel from "./ResourcePersonPanel.vue";
import ResourceSidebar from "./ResourceSidebar.vue";
import ResourceTimeline from "./ResourceTimeline.vue";
import ResourceToolbar from "./ResourceToolbar.vue";
import {
  applyAssignmentWorkspaceSync,
  assignmentAdviceFallbackMessage,
  buildAssignmentApiPayload,
  buildAssignmentLinkFields,
  buildLocalResourceSnapshot,
  formatResourceApiFeedback
} from "../resourceModel.js";

const store = useWorkspaceStore();

const activeView = shallowRef("superAdmin");
const mode = shallowRef("timeline");
const selectedDepartmentId = shallowRef("");
const selectedPersonId = shallowRef("");
const selectedWorkItemId = shallowRef("");
const sidebarSearchQuery = shallowRef("");
const toolbarQuery = shallowRef("");
const statsFilter = shallowRef("all");
const assignmentOpen = shallowRef(false);
const loading = shallowRef(false);
const loadError = shallowRef("");
const hasRemotePermissions = shallowRef(false);
const offlineResourceMode = shallowRef(false);
const completion = shallowRef(null);
const overloadCandidate = shallowRef(null);
const overloadOpen = shallowRef(false);
const assignmentPreview = shallowRef(null);
const aiAdvisorOpen = shallowRef(false);
const aiAdvisorLoading = shallowRef(false);
const aiAdvisorError = shallowRef("");
const aiAdvisorAdvice = shallowRef(null);
const contextMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  item: null,
  person: null,
  date: "",
  targetType: "",
  payload: null
});
const timelineViewport = reactive({
  zoomLevel: 1,
  commandRevision: 0,
  focusDate: "",
  lastAction: "",
  lastSyncCheckedAt: ""
});

let aiAdvisorRequestId = 0;

const TIMELINE_MIN_WINDOW_DAYS = 7;
const TIMELINE_MAX_WINDOW_DAYS = 90;
const TIMELINE_DEFAULT_WINDOW_DAYS = 42;
const visibleTextReplacements = new Map([
  ["\u74d2\u5470\u9a87\u7ba1\uff27\u60ca", "超级管理员"],
  ["\u74d2\u5470\u9a87\u7ba1\uff27\u60ca\u7459\u55da\ue75d", "超级管理员视角"],
  ["\u93b4\u610d\u61b3", "人员"],
  ["\u6d93\u5db6\u7f13\u7481\u8669\u6237\u7f01\u5c7e\u62f7\u934a\u72b1\u6362\u936b", "不建议继续承担任务"],
  ["\u6d93\u5db6\u7f13\u7481", "不建议"],
  ["\u9350\u832c\u735a\u6f6e", "冲突高"]
]);

function normalizeVisibleText(value) {
  const text = String(value || "");
  return visibleTextReplacements.get(text) || text;
}

const assignmentDraft = reactive({
  title: "活动页资源分配",
  project: "上线活动长图",
  startDate: "2026/05/18",
  endDate: "2026/05/23",
  departmentId: "design",
  skillText: "UI / 图标 / 活动页",
  priority: "高"
});

const resourceState = reactive(createFallbackResourceState());

const views = computed(() => buildVisibleViews(resourceState.permissions));
const scopeType = computed(() => resourceState.permissions?.scope?.type || "self");
const isTimelineBlankContextMenu = computed(() => contextMenu.targetType === "timeline-blank");
const isDepartmentContextMenu = computed(() => contextMenu.targetType === "department");
const isPersonContextMenu = computed(() => contextMenu.targetType === "person");
const contextMenuStyle = computed(() => {
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const menuHeight = isTimelineBlankContextMenu.value ? 276 : isDepartmentContextMenu.value || isPersonContextMenu.value ? 236 : 220;
  return {
    left: `${Math.min(contextMenu.x, Math.max(12, viewportWidth - 232))}px`,
    top: `${Math.min(contextMenu.y, Math.max(12, viewportHeight - menuHeight))}px`
  };
});
const contextMenuAriaLabel = computed(() => {
  if (isTimelineBlankContextMenu.value) return "资源时间轴空白操作";
  if (isDepartmentContextMenu.value) return "部门资源操作";
  if (isPersonContextMenu.value) return "人员资源操作";
  return "资源时间轴操作";
});
const contextMenuTitle = computed(() => {
  if (isTimelineBlankContextMenu.value) return "时间轴空白区域";
  if (isDepartmentContextMenu.value) return contextMenu.payload?.department?.name || "部门节点";
  if (isPersonContextMenu.value) return contextMenu.person?.name || "人员节点";
  return contextMenu.item?.title || "未命名任务";
});
const contextMenuSubtitle = computed(() => {
  if (isDepartmentContextMenu.value) {
    const peopleCount = visiblePeople.value.filter((person) => person.departmentId === contextMenu.payload?.departmentId).length;
    return `${peopleCount} 人 · ${contextMenu.payload?.department?.name || "部门"}`;
  }
  if (isPersonContextMenu.value) {
    return `${normalizeVisibleText(contextMenu.person?.roleTitle) || "人员"} · 当前负载 ${contextMenu.person?.load ?? "-"}%`;
  }
  if (!isTimelineBlankContextMenu.value) {
    return `${contextMenu.item?.startDate || "-"} - ${contextMenu.item?.endDate || "-"}`;
  }
  const dateText = contextMenu.date ? `定位日期：${contextMenu.date}` : "定位日期：未指定";
  return `${dateText} · 当前范围：${resourceState.range?.startDate || "-"} - ${resourceState.range?.endDate || "-"}`;
});

const activeDepartment = computed(() => {
  return resourceState.departments.find((department) => department.id === selectedDepartmentId.value) || resourceState.departments[0] || null;
});

const selectedPerson = computed(() => {
  return visiblePeople.value.find((person) => person.id === selectedPersonId.value) || visiblePeople.value[0] || null;
});

const scopeVisiblePeople = computed(() => {
  return resourceState.people.filter((person) => {
    if (scopeType.value === "self" && !isSelfPerson(person)) return false;
    if (activeView.value === "department" && selectedDepartmentId.value && person.departmentId !== selectedDepartmentId.value) return false;
    if (mode.value === "department" && selectedDepartmentId.value && person.departmentId !== selectedDepartmentId.value) return false;
    if (mode.value === "person" && selectedPersonId.value && person.id !== selectedPersonId.value) return false;
    if (mode.value === "conflict" && person.load < 85) return false;
    return true;
  });
});

const baseVisiblePeople = computed(() => {
  const query = normalizeText(toolbarQuery.value);
  return scopeVisiblePeople.value.filter((person) => {
    if (!query) return true;
    return personMatchesQuery(person, query);
  });
});

const visiblePeople = computed(() => {
  if (statsFilter.value === "overload") return baseVisiblePeople.value.filter((person) => person.load >= 100);
  if (statsFilter.value === "available") return baseVisiblePeople.value.filter((person) => person.load < 85);
  if (statsFilter.value === "unassigned" && visibleUnassignedPersonIds.value.size) {
    return baseVisiblePeople.value.filter((person) => visibleUnassignedPersonIds.value.has(person.id));
  }
  return baseVisiblePeople.value;
});

const visibleDepartments = computed(() => {
  const ids = new Set(visiblePeople.value.map((person) => person.departmentId));
  return resourceState.departments.filter((department) => ids.has(department.id));
});

const sidebarScopePeople = computed(() => {
  return resourceState.people.filter((person) => {
    if (scopeType.value === "self" && !isSelfPerson(person)) return false;
    return true;
  });
});

const sidebarVisiblePeople = computed(() => {
  const query = normalizeText(sidebarSearchQuery.value);
  if (!query) return sidebarScopePeople.value;
  return sidebarScopePeople.value.filter((person) => personMatchesQuery(person, query));
});

const sidebarVisibleDepartments = computed(() => {
  const query = normalizeText(sidebarSearchQuery.value);
  const visiblePersonDepartmentIds = new Set(sidebarVisiblePeople.value.map((person) => person.departmentId));
  return resourceState.departments.filter((department) => {
    if (visiblePersonDepartmentIds.has(department.id)) return true;
    return Boolean(query && departmentMatchesQuery(department, query));
  });
});

const baseVisibleWorkItems = computed(() => {
  const visiblePersonIds = new Set(baseVisiblePeople.value.map((person) => person.id));
  const query = normalizeText(toolbarQuery.value);
  const completionCandidate = completion.value ? completionToWorkItem(completion.value) : null;
  const completionItem = completionCandidate &&
    !resourceState.workItems.some((item) => item.id === completionCandidate.id) &&
    workItemMatchesCurrentScope(completionCandidate)
    ? [completionCandidate]
    : [];
  return [...resourceState.workItems, ...completionItem].filter((item) => {
    if (!visiblePersonIds.has(item.personId)) return false;
    if (mode.value === "conflict" && !["danger", "warning", "new"].includes(item.status)) return false;
    if (!query) return true;
    return [item.title, item.project, item.status].some((value) => normalizeText(value).includes(query));
  });
});

const visibleUnassignedWorkItems = computed(() => {
  return resourceState.workItems.filter((item) => {
    if (!isUnassignedWorkItem(item)) return false;
    if (!workItemMatchesCurrentScope(item)) return false;
    if (!workItemMatchesCurrentView(item, baseVisiblePeople.value)) return false;
    if (mode.value === "conflict" && !["danger", "warning", "new"].includes(item.status)) return false;
    if (!queryMatchesWorkItem(item, toolbarQuery.value)) return false;
    return true;
  });
});

const visibleUnassignedPersonIds = computed(() => {
  const basePeopleIds = new Set(baseVisiblePeople.value.map((person) => person.id));
  return new Set(visibleUnassignedWorkItems.value.map((item) => item.personId).filter((personId) => basePeopleIds.has(personId)));
});

const visibleWorkItems = computed(() => {
  if (statsFilter.value === "unassigned") return visibleUnassignedWorkItems.value;
  const visiblePersonIds = new Set(visiblePeople.value.map((person) => person.id));
  return baseVisibleWorkItems.value.filter((item) => visiblePersonIds.has(item.personId));
});

const visibleAvailability = computed(() => {
  const visiblePersonIds = new Set(visiblePeople.value.map((person) => person.id));
  return resourceState.availability.filter((item) => visiblePersonIds.has(item.personId));
});

const selectedPersonWorkItems = computed(() => {
  return visibleWorkItems.value.filter((item) => item.personId === selectedPerson.value?.id);
});

const candidates = computed(() => {
  return resourceState.candidates.filter((candidate) => {
    if (scopeType.value === "department") return candidate.departmentId === selectedDepartmentId.value || candidate.departmentId === assignmentDraft.departmentId;
    if (scopeType.value === "self") return false;
    return true;
  });
});

const selectedCandidateId = shallowRef("");

const bestCandidate = computed(() => {
  return chooseBestCandidate(candidates.value, {
    draft: assignmentDraft,
    availability: visibleAvailability.value,
    workItems: visibleWorkItems.value
  });
});

const selectedCandidate = computed(() => {
  return candidates.value.find((candidate) => candidate.personId === selectedCandidateId.value) || bestCandidate.value || candidates.value[0] || null;
});

const alternativeCandidate = computed(() => {
  return chooseBestCandidate(
    candidates.value.filter((candidate) => candidate.personId !== overloadCandidate.value?.personId && candidate.loadAfter < 100),
    {
      draft: assignmentDraft,
      availability: visibleAvailability.value,
      workItems: visibleWorkItems.value
    }
  );
});

const stats = computed(() => {
  const people = baseVisiblePeople.value;
  const availablePeople = people.filter((person) => person.load < 85);
  const overloadPeople = people.filter((person) => person.load >= 100);
  const unassigned = visibleUnassignedWorkItems.value;
  return {
    totalPeople: people.length,
    availableCount: availablePeople.length,
    overloadCount: overloadPeople.length,
    unassignedCount: unassigned.length,
    scopeLabel: scopeLabel(scopeType.value),
    idleTitle: scopeType.value === "department" ? "本部门空闲提醒" : "今日空闲提醒"
  };
});

const panelSuggestions = computed(() => {
  if (!selectedPerson.value) return [];
  if (selectedPerson.value.load >= 100) {
    const alternativeNames = rankedCandidates(candidates.value, {
      draft: assignmentDraft,
      availability: visibleAvailability.value,
      workItems: visibleWorkItems.value
    })
      .filter((candidate) => candidate.personId !== selectedPerson.value?.id)
      .slice(0, 2)
      .map((candidate) => candidate.name)
      .filter(Boolean)
      .join("、");
    return ["不建议继续承担任务", "可安排半天复核", alternativeNames ? `建议改给${alternativeNames}` : "智能推荐当前更适合候选人"];
  }
  if (selectedPerson.value.load >= 85) return ["可承接短任务", "需关注负载", "安排前确认优先级"];
  return ["可接新活", `适合 ${assignmentDraft.skillText || "当前任务"} 任务`, "建议安排连续时间窗口"];
});

const nodeRecommendation = computed(() => ({
  text: completion.value
    ? `${completion.value.taskTitle} 已给 ${completion.value.personName}，任务已进入项目排期，请检查交付状态。`
    : bestCandidate.value
      ? `高负载人员只保留复核，执行任务优先给 ${bestCandidate.value.name}，系统已匹配评分。`
      : "高负载人员只保留复核，执行任务按负载、冲突和技能匹配重新分配。"
}));

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function personMatchesQuery(person = {}, queryValue = "") {
  const query = normalizeText(queryValue);
  if (!query) return true;
  return [person.name, person.departmentName, person.roleTitle, person.skills?.join(" ")].some((value) => normalizeText(value).includes(query));
}

function departmentMatchesQuery(department = {}, queryValue = "") {
  const query = normalizeText(queryValue);
  if (!query) return true;
  return [department.name, department.id].some((value) => normalizeText(value).includes(query));
}

function queryMatchesWorkItem(item = {}, queryValue = "") {
  const query = normalizeText(queryValue);
  if (!query) return true;
  return [item.title, item.project, item.status, item.assigneeName, item.departmentName, item.assigneeDepartment].some((value) => normalizeText(value).includes(query));
}

function toSkillTokens(value) {
  return String(value || "")
    .split(/[\/,，、\s]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function uniqueTextList(items = []) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function dateToTime(value) {
  const normalized = normalizeDateValue(value);
  if (!normalized) return 0;
  const [year, month, day] = normalized.split("/").map((part) => Number(part));
  return new Date(year, month - 1, day).getTime();
}

function rangesOverlap(left = {}, right = {}) {
  const leftStart = dateToTime(left.startDate);
  const leftEnd = dateToTime(left.endDate || left.startDate);
  const rightStart = dateToTime(right.startDate);
  const rightEnd = dateToTime(right.endDate || right.startDate);
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function countScheduleConflicts(personId, draft = {}, workItems = []) {
  return workItems.filter((item) => item.personId === personId && rangesOverlap(item, draft)).length;
}

function candidateSkillScore(candidate = {}, draft = {}) {
  const wantedSkills = toSkillTokens(draft.skillText);
  if (!wantedSkills.length) return 0;
  const candidateSkills = toSkillTokens([
    candidate.reason,
    ...(candidate.reasons || []),
    ...(candidate.skills || []),
    candidate.roleTitle,
    candidate.departmentName
  ].join(" "));
  return wantedSkills.filter((skill) => candidateSkills.some((candidateSkill) => candidateSkill.includes(skill) || skill.includes(candidateSkill))).length;
}

function candidateAvailabilityScore(candidate = {}, draft = {}, availability = []) {
  const windows = availability.filter((item) => item.personId === candidate.personId);
  if (!windows.length) return 0;
  return windows.some((item) => rangesOverlap(item, draft)) ? 2 : 1;
}

function scoreCandidate(candidate = {}, context = {}) {
  const draft = context.draft || {};
  const workloadScore = Math.max(0, 120 - Number(candidate.loadAfter ?? candidate.loadBefore ?? 0));
  const conflictPenalty = Number(candidate.conflictCount || 0) * 35 + countScheduleConflicts(candidate.personId, draft, context.workItems || []) * 20;
  const skillScore = candidateSkillScore(candidate, draft) * 18;
  const availabilityScore = candidateAvailabilityScore(candidate, draft, context.availability || []) * 12;
  const departmentScore = candidate.departmentId && candidate.departmentId === draft.departmentId ? 8 : 0;
  return workloadScore + skillScore + availabilityScore + departmentScore - conflictPenalty;
}

function rankedCandidates(candidateList = [], context = {}) {
  return [...candidateList]
    .filter((candidate) => candidate?.personId)
    .sort((left, right) => {
      const scoreDiff = scoreCandidate(right, context) - scoreCandidate(left, context);
      if (scoreDiff) return scoreDiff;
      const loadDiff = Number(left.loadAfter ?? 0) - Number(right.loadAfter ?? 0);
      if (loadDiff) return loadDiff;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
}

function chooseBestCandidate(candidateList = [], context = {}) {
  return rankedCandidates(candidateList, context)[0] || null;
}

function isUnassignedWorkItem(item = {}) {
  return !item.personId || item.status === "pending";
}

function workItemMatchesCurrentView(item = {}, people = []) {
  if (!item.personId) return true;
  return people.some((person) => person.id === item.personId);
}

function isSelfPerson(person) {
  const current = store.currentUser || {};
  const scopedUserIds = new Set(resourceState.permissions?.scope?.userIds || []);
  return scopedUserIds.has(person.id) || person.id === current.id || person.name === current.name || person.isSelf;
}

function scopeLabel(scope) {
  return {
    company: "公司范围",
    project: "项目范围",
    authorized: "授权范围",
    department: "部门范围",
    self: "个人范围"
  }[scope] || "资源视图";
}

function buildVisibleViews(permissions) {
  const scope = permissions?.scope?.type || "self";
  const result = [];
  if (permissions?.canViewSuperAdminView) result.push({ key: "superAdmin", label: "超级管理员视角", description: "全公司" });
  if (permissions?.canViewProjectManagerView) result.push({ key: "project", label: "项目经理视角", description: "授权项目" });
  if (permissions?.canViewDepartmentView) result.push({ key: "department", label: "部门管理视角", description: scope === "department" ? "本部门" : "部门" });
  result.push({ key: "person", label: scope === "self" ? "个人视角" : "人员视角", description: scope === "self" ? "本人" : "人员详情" });
  if (scope !== "self" && permissions?.canViewFreePool) result.push({ key: "freePool", label: scope === "department" ? "本部门可接池" : "可接池", description: "可接活" });
  if (scope !== "self" && permissions?.canAssignTask) result.push({ key: "completed", label: scope === "department" ? "部门交付动态" : "分配完成动态", description: "写入结果" });
  return result;
}

function chooseDefaultView(permissions) {
  const scope = permissions?.scope?.type || "self";
  if (scope === "company" && permissions.canViewSuperAdminView) return "superAdmin";
  if (["project", "authorized"].includes(scope) && permissions.canViewProjectManagerView) return "project";
  if (scope === "department" && permissions.canViewDepartmentView) return "department";
  return "person";
}

function inferPermissions(currentUser = {}) {
  const localSnapshot = buildLocalResourceSnapshot(store, { user: currentUser, includeFallback: false });
  const localPermissions = localSnapshot.resourcePermissions || localSnapshot.permissions || {};
  const localScope = localSnapshot.scope || {};
  const scopeTypeValue = localScope.type || localPermissions.scope || "self";
  const userId = localPermissions.userId || currentUser.id || currentUser.userId || store.currentUser?.id || "self";
  return normalizePermissions(
    {
      ...localPermissions,
      scope: {
        type: scopeTypeValue,
        departmentIds: toStringArray([localScope.department, localPermissions.department, currentUser.department, currentUser.departmentId]),
        projectIds: toStringArray(localScope.authorizedProjectIds || localScope.projectIds || localPermissions.projectIds),
        userIds: scopeTypeValue === "self" ? [userId].filter(Boolean) : []
      }
    },
    {
      type: scopeTypeValue,
      departmentIds: toStringArray([localScope.department, localPermissions.department, currentUser.department, currentUser.departmentId]),
      projectIds: toStringArray(localScope.authorizedProjectIds || localScope.projectIds || localPermissions.projectIds),
      userIds: scopeTypeValue === "self" ? [userId].filter(Boolean) : []
    }
  );
}

function createPermissions(scopeTypeValue) {
  return {
    canViewSuperAdminView: scopeTypeValue === "company",
    canViewProjectManagerView: ["company", "project", "authorized"].includes(scopeTypeValue),
    canViewDepartmentView: scopeTypeValue !== "self",
    canViewOtherPersonView: scopeTypeValue !== "self",
    canViewFreePool: scopeTypeValue !== "self",
    canViewConflictRisk: scopeTypeValue !== "self",
    canCreateAssignmentPreview: scopeTypeValue !== "self",
    canAssignTask: scopeTypeValue !== "self",
    canAnalyzeAssignment: scopeTypeValue !== "self",
    canUseAiAdvisor: scopeTypeValue !== "self",
    canApplyCandidate: scopeTypeValue !== "self",
    canTransferConflictTask: ["company", "project", "authorized", "department"].includes(scopeTypeValue),
    canForceAssignOverload: ["company", "project", "authorized"].includes(scopeTypeValue),
    canExportReport: scopeTypeValue !== "self",
    scope: {
      type: scopeTypeValue,
      departmentIds: [],
      projectIds: [],
      userIds: scopeTypeValue === "self" ? [store.currentUser?.id || "self"] : []
    }
  };
}

async function loadResourceState() {
  loading.value = true;
  loadError.value = "";
  offlineResourceMode.value = false;
  try {
    const resources = await resourceApi.getResources({ status: "active", cacheBust: Date.now() });
    applyRemoteResourceState(resources);
    if (!hasRemotePermissionPayload(resources)) {
      hasRemotePermissions.value = false;
      resourceState.permissions = inferPermissions(store.currentUser || {});
    }
    try {
      const workload = await resourceApi.getWorkload(buildWorkloadQuery());
      applyRemoteWorkloadState(workload);
    } catch {
      loadError.value = "已加载资源基础数据，但 /workspace/workload 暂不可用。";
    }
    applyLocalWorkspaceSnapshot();
    applyScopeToResourceState();
  } catch (error) {
    if (handleResourceAuthFailure(error)) {
      return;
    }
    loadError.value =
      inferPermissions(store.currentUser || {}).scope.type === "company"
        ? "离线模式：已按 admin 全局权限展示本地演示数据，等待后端 /workspace/resources 接入。"
        : "离线模式：仅展示当前权限范围内的本地演示数据，等待后端 /workspace/resources 接入。";
    offlineResourceMode.value = true;
    resourceState.permissions = inferPermissions(store.currentUser || {});
    applyLocalWorkspaceSnapshot();
    applyScopeToResourceState();
    alignSelfScopeData();
  } finally {
    loading.value = false;
    ensureAllowedView();
  }
}

function handleResourceAuthFailure(error, fallbackMessage = "登录已失效或权限不足，请重新登录后再操作。") {
  if (!isAuthApiError(error)) return false;
  if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
  hasRemotePermissions.value = false;
  offlineResourceMode.value = false;
  loadError.value = backendSyncToast(error) || fallbackMessage;
  store.showToast?.(loadError.value);
  return true;
}

function applyRemoteResourceState(payload = {}) {
  const data = unwrapPayload(payload);
  const resourcePayload = isPlainObject(data.resources) ? data.resources : data;
  const permissionPayload = resourcePayload.resourcePermissions || resourcePayload.permissions;
  if (permissionPayload || resourcePayload.scope) {
    resourceState.permissions = normalizePermissions(permissionPayload || {}, resourcePayload.scope);
    hasRemotePermissions.value = Boolean(permissionPayload || resourcePayload.scope);
  }
  const departments = firstArray(resourcePayload.departments, resourcePayload.departmentTree);
  const people = firstArray(resourcePayload.people, resourcePayload.users, resourcePayload.resources);
  const workItems = firstArray(resourcePayload.workItems, resourcePayload.tasks, resourcePayload.assignments);
  const availability = firstArray(resourcePayload.availability, resourcePayload.freeWindows, resourcePayload.idleWindows);
  const candidates = firstArray(resourcePayload.candidates, resourcePayload.recommendations);
  if (departments) resourceState.departments = departments.map(normalizeDepartment);
  if (people) resourceState.people = people.map(normalizePerson);
  if (workItems && (workItems.length || !resourceState.workItems.length)) resourceState.workItems = workItems.map(normalizeWorkItem);
  if (availability) resourceState.availability = availability.map(normalizeAvailability);
  if (candidates) resourceState.candidates = candidates.map((candidate) => normalizeCandidate(candidate));
  applyRange(resourcePayload.range || resourcePayload.dateRange);
}

function applyRemoteWorkloadState(payload = {}) {
  const data = unwrapPayload(payload);
  const workloadPayload = isPlainObject(data.workload) ? data.workload : data;
  const workItems = firstArray(workloadPayload.workItems, workloadPayload.tasks, workloadPayload.assignments);
  const availability = firstArray(workloadPayload.availability, workloadPayload.freeWindows, workloadPayload.idleWindows);
  const candidates = firstArray(workloadPayload.candidates, workloadPayload.recommendations);
  const peopleWorkload = firstArray(workloadPayload.people, workloadPayload.workloads, workloadPayload.personWorkloads, workloadPayload.resources);
  if (workItems && (workItems.length || !resourceState.workItems.length)) resourceState.workItems = workItems.map(normalizeWorkItem);
  if (availability) resourceState.availability = availability.map(normalizeAvailability);
  if (candidates) resourceState.candidates = candidates.map((candidate) => normalizeCandidate(candidate));
  if (peopleWorkload?.length) mergePeopleWorkload(peopleWorkload);
  applyRange(workloadPayload.range || workloadPayload.dateRange);
}

function unwrapPayload(payload = {}) {
  if (!isPlainObject(payload)) return {};
  return isPlainObject(payload.data) ? payload.data : payload;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value));
}

function normalizeScopeType(scopeValue) {
  const rawType = isPlainObject(scopeValue) ? scopeValue.type : scopeValue;
  const scope = String(rawType || "self").trim().toLowerCase();
  if (scope === "global") return "company";
  if (["admin", "superadmin", "super_admin", "administrator", "owner"].includes(scope)) return "company";
  if (["company", "department", "project", "authorized", "self"].includes(scope)) return scope;
  return "self";
}

function isAdminPermission(value = {}) {
  const currentUser = store.currentUser || {};
  const role = normalizeText(
    value.role ||
      value.userRole ||
      value.currentUserRole ||
      value.permissionRole ||
      value.identity ||
      currentUser.role ||
      currentUser.userRole
  );
  return (
    ["admin", "superadmin", "super_admin", "administrator", "owner"].includes(role) ||
    value.isAdmin === true ||
    value.admin === true ||
    value.isSuperAdmin === true ||
    value.canViewCompany === true ||
    value.canViewSuperAdminView === true
  );
}

function normalizeScope(scopeValue = {}, permissionValue = {}, scopeTypeValue = "self") {
  const scope = isPlainObject(scopeValue) ? scopeValue : {};
  const departmentIds =
    scope.departmentIds ||
    permissionValue.departmentIds ||
    (scope.departmentId ? [scope.departmentId] : scope.department ? [scope.department] : permissionValue.departmentId ? [permissionValue.departmentId] : permissionValue.department ? [permissionValue.department] : []);
  const projectIds =
    scope.projectIds ||
    permissionValue.projectIds ||
    (scope.projectId ? [scope.projectId] : scope.project ? [scope.project] : permissionValue.projectId ? [permissionValue.projectId] : permissionValue.project ? [permissionValue.project] : []);
  const userIds = scope.userIds || permissionValue.userIds || (scope.userId ? [scope.userId] : permissionValue.userId ? [permissionValue.userId] : []);
  return {
    type: scopeTypeValue,
    departmentIds: toStringArray(departmentIds),
    projectIds: toStringArray(projectIds),
    userIds: toStringArray(userIds)
  };
}

function normalizePermissions(value = {}, scopeValue = null) {
  const hasAdminPermission = isAdminPermission(value);
  const sourceScope = hasAdminPermission ? { type: "company" } : scopeValue ?? value?.scope ?? value?.scopeType ?? "self";
  const scopeTypeValue = normalizeScopeType(sourceScope);
  const hasGlobalAccess = hasAdminPermission || scopeTypeValue === "company";
  const base = createPermissions(scopeTypeValue);
  const scope = normalizeScope(sourceScope, value, scopeTypeValue);
  const projectIds = scope.projectIds.length
    ? scope.projectIds
    : scopeTypeValue === "project"
      ? localAuthorizedProjectIds()
      : scope.projectIds;
  return {
    ...base,
    ...value,
    canViewSuperAdminView: hasGlobalAccess || Boolean(value.canViewSuperAdminView ?? value.canViewCompany ?? base.canViewSuperAdminView),
    canViewProjectManagerView: hasGlobalAccess || Boolean(value.canViewProjectManagerView ?? value.canViewProject ?? base.canViewProjectManagerView),
    canViewDepartmentView: hasGlobalAccess || Boolean(value.canViewDepartmentView ?? value.canViewDepartment ?? base.canViewDepartmentView),
    canViewOtherPersonView: hasGlobalAccess || Boolean(value.canViewOtherPersonView ?? base.canViewOtherPersonView),
    canViewFreePool: hasGlobalAccess || Boolean(value.canViewFreePool ?? base.canViewFreePool),
    canViewConflictRisk: hasGlobalAccess || Boolean(value.canViewConflictRisk ?? base.canViewConflictRisk),
    canCreateAssignmentPreview: hasGlobalAccess || Boolean(value.canCreateAssignmentPreview ?? value.canAssign ?? base.canCreateAssignmentPreview),
    canAssignTask: hasGlobalAccess || Boolean(value.canAssignTask ?? value.canAssign ?? base.canAssignTask),
    canAnalyzeAssignment: hasGlobalAccess || Boolean(value.canAnalyzeAssignment ?? value.canUseAiAdvisor ?? value.canCreateAssignmentPreview ?? value.canAssign ?? base.canAnalyzeAssignment),
    canUseAiAdvisor: hasGlobalAccess || Boolean(value.canUseAiAdvisor ?? value.canAnalyzeAssignment ?? value.canCreateAssignmentPreview ?? value.canAssign ?? base.canUseAiAdvisor),
    canApplyCandidate: hasGlobalAccess || Boolean(value.canApplyCandidate ?? value.canAssignTask ?? value.canAssign ?? base.canApplyCandidate),
    canTransferConflictTask: hasGlobalAccess || Boolean(value.canTransferConflictTask ?? base.canTransferConflictTask),
    canForceAssignOverload: hasGlobalAccess || Boolean(value.canForceAssignOverload ?? value.canForceAssign ?? base.canForceAssignOverload),
    canExportReport: hasGlobalAccess || Boolean(value.canExportReport ?? base.canExportReport),
    scope: {
      ...base.scope,
      ...scope,
      type: hasGlobalAccess ? "company" : scope.type,
      projectIds
    }
  };
}

function toStringArray(value) {
  return (Array.isArray(value) ? value : [value])
    .filter((entry) => entry !== undefined && entry !== null && entry !== "")
    .map((entry) => String(entry));
}

function localAuthorizedProjectIds() {
  const snapshot = buildLocalResourceSnapshot(store, { user: store.currentUser, includeFallback: false });
  const scope = snapshot.scope || {};
  return toStringArray(scope.authorizedProjectIds || scope.projectIds);
}

function hasRemotePermissionPayload(payload = {}) {
  const data = unwrapPayload(payload);
  const resourcePayload = isPlainObject(data.resources) ? data.resources : data;
  return Boolean(resourcePayload.resourcePermissions || resourcePayload.permissions || resourcePayload.scope);
}

function buildWorkloadQuery() {
  const scope = resourceState.permissions?.scope || {};
  return {
    cacheBust: Date.now(),
    startDate: resourceState.range?.startDate,
    endDate: resourceState.range?.endDate,
    scope: scope.type,
    departmentIds: scope.departmentIds,
    projectIds: scope.projectIds,
    userIds: scope.userIds
  };
}

function currentAssignmentProjectId() {
  return String(
    assignmentDraft.projectId ||
      resourceState.permissions?.scope?.projectIds?.[0] ||
      store.activeProject?.projectId ||
      store.activeProject?.projectUid ||
      store.activeProject?.project_uid ||
      store.activeProject?.id ||
      store.activeProjectId ||
      ""
  );
}

function currentAssignmentProjectUid() {
  return String(
    assignmentDraft.projectUid ||
      store.activeProject?.projectUid ||
      store.activeProject?.project_uid ||
      currentAssignmentProjectId() ||
      ""
  );
}

function currentAssignmentProjectName() {
  return String(
    assignmentDraft.projectName ||
      assignmentDraft.project ||
      store.activeProject?.name ||
      store.activeProject?.title ||
      ""
  );
}

function buildAssignmentDraftPayload() {
  return {
    ...assignmentDraft,
    projectId: currentAssignmentProjectId(),
    projectUid: currentAssignmentProjectUid(),
    projectName: currentAssignmentProjectName()
  };
}

function buildAssignmentWorkItemPayload(draftPayload = {}) {
  return {
    workItemId: draftPayload.workItemId,
    itemId: draftPayload.itemId,
    scheduleItemId: draftPayload.scheduleItemId,
    taskId: draftPayload.taskId,
    taskUid: draftPayload.taskUid,
    projectId: draftPayload.projectId,
    projectUid: draftPayload.projectUid,
    projectName: draftPayload.projectName,
    title: draftPayload.title,
    project: draftPayload.project,
    startDate: draftPayload.startDate,
    endDate: draftPayload.endDate
  };
}

function buildAssignmentApiExtras(candidate, draftPayload, options = {}) {
  return {
    previewId: assignmentPreview.value?.id || "",
    scope: resourceState.permissions.scope,
    assigneeId: candidate.personId,
    assigneeName: candidate.name,
    personId: candidate.personId,
    userId: candidate.personId,
    candidate,
    candidates: candidates.value,
    taskDraft: draftPayload,
    workItem: buildAssignmentWorkItemPayload(draftPayload),
    scheduleItem: {
      itemId: draftPayload.itemId || draftPayload.scheduleItemId,
      scheduleItemId: draftPayload.scheduleItemId || draftPayload.itemId,
      taskId: draftPayload.taskId,
      taskUid: draftPayload.taskUid,
      projectId: draftPayload.projectId
    },
    task: {
      taskId: draftPayload.taskId,
      taskUid: draftPayload.taskUid,
      projectId: draftPayload.projectId
    },
    forceReason: options.reason || ""
  };
}

function clearAssignmentSyncContext() {
  assignmentPreview.value = null;
  assignmentDraft.workItemId = "";
  assignmentDraft.itemId = "";
  assignmentDraft.scheduleItemId = "";
  assignmentDraft.taskId = "";
  assignmentDraft.taskUid = "";
}

function normalizeDepartment(department = {}) {
  return {
    id: String(department.id || department.departmentId || department.name || ""),
    name: department.name || department.label || "未命名部门",
  };
}

function normalizePerson(person = {}) {
  const rawDepartmentId = String(person.departmentId || person.department_id || person.departmentUid || person.department_uid || "").trim();
  const rawDepartmentName = String(person.departmentName || person.department_name || person.department || "").trim();
  const department = resourceState.departments.find((item) =>
    item.id === rawDepartmentId ||
    item.id === rawDepartmentName ||
    item.name === rawDepartmentId ||
    item.name === rawDepartmentName
  );
  const departmentId = department?.id || rawDepartmentId || rawDepartmentName || "unassigned";
  return {
    id: String(person.id || person.userId || person.name || ""),
    userId: String(person.userId || person.user_id || person.id || ""),
    name: person.name || person.username || "未命名",
    avatar: person.avatar || String(person.name || "人").slice(0, 1),
    departmentId,
    departmentName: department?.name || rawDepartmentName || "未分组",
    roleTitle: normalizeVisibleText(person.roleTitle || person.job || person.title || "人员"),
    load: Number(person.load ?? person.loadPercent ?? person.workload ?? person.workloadPercent ?? person.load_after ?? 0),
    skills: person.skills || [],
    tone: person.tone || person.color || "green",
    recommendation: person.recommendation || ""
  };
}

function normalizeWorkItem(item = {}) {
  const raw = item.raw || {};
  const rawAssigneeName =
    item.assigneeName ||
    item.assignee_name ||
    item.assignee ||
    item.ownerName ||
    item.owner ||
    raw.assigneeName ||
    raw.assignee_name ||
    raw.assignee ||
    raw.ownerName ||
    raw.owner ||
    "";
  const matchedPerson = resourceState.people.find((person) => {
    const assigneeText = normalizeText(rawAssigneeName);
    if (!assigneeText) return false;
    const personName = normalizeText(person.name);
    return personName === assigneeText || assigneeText.includes(personName);
  });
  const personId = item.personId || item.assigneeId || item.assignee_id || item.userId || item.user_id || item.ownerId || item.owner_id || matchedPerson?.id || "";
  const range = item.dateRange || item.date_range || item.range || {};
  const projectValue = item.project || item.projectName || item.project_name || raw.project || raw.projectName || raw.project_name || {};
  const projectName = typeof projectValue === "string" ? projectValue : projectValue.name || item.projectName || item.project_name || "项目";
  return {
    id: String(item.id || item.itemId || item.workItemId || item.assignmentId || item.taskId || item.title || ""),
    itemId: String(item.itemId || item.item_id || raw.itemId || raw.item_id || item.id || ""),
    workItemId: String(item.workItemId || item.work_item_id || raw.workItemId || raw.work_item_id || item.id || ""),
    scheduleItemId: String(item.scheduleItemId || item.schedule_item_id || raw.scheduleItemId || raw.schedule_item_id || item.itemId || item.item_id || raw.itemId || raw.item_id || ""),
    taskId: String(item.taskId || item.task_id || raw.taskId || raw.task_id || raw.id || ""),
    taskUid: String(item.taskUid || item.task_uid || raw.taskUid || raw.task_uid || raw.taskId || raw.task_id || ""),
    source: item.source || raw.source || "",
    personId: String(personId),
    assigneeName: rawAssigneeName || matchedPerson?.name || "",
    title: item.title || raw.title || "未命名任务",
    projectId: String(item.projectId || item.project_id || projectValue.id || ""),
    project: projectName,
    projectName,
    departmentId: String(item.departmentId || item.department_id || item.department || raw.departmentId || raw.department_id || ""),
    departmentName: item.departmentName || item.department_name || item.department || raw.departmentName || raw.department_name || "",
    assigneeDepartment: item.assigneeDepartment || item.assignee_department || raw.assigneeDepartment || raw.assignee_department || "",
    module: item.module || raw.module || "",
    startDate: item.startDate || item.start_date || item.start || range.startDate || range.start_date || range.start || range.from || "2026/05/18",
    endDate: item.endDate || item.end_date || item.end || item.dueDate || item.due_date || range.endDate || range.end_date || range.end || range.to || item.startDate || "2026/05/23",
    status: item.status || "normal",
    raw
  };
}

function normalizeAvailability(item = {}) {
  return {
    id: String(item.id || `${item.personId || item.userId || item.assigneeId}-${item.startDate}`),
    personId: String(item.personId || item.userId || item.assigneeId || ""),
    startDate: item.startDate || "2026/05/18",
    endDate: item.endDate || item.startDate || "2026/05/23",
    label: item.label || "空闲"
  };
}

function normalizeCandidate(candidate = {}) {
  const personId = String(candidate.personId || candidate.assigneeId || candidate.userId || candidate.id || "");
  const person = resourceState.people.find((item) => item.id === personId || item.name === candidate.name);
  const rawDepartmentId = String(candidate.departmentId || candidate.department_id || candidate.department || "").trim();
  const department = resourceState.departments.find((item) =>
    item.id === rawDepartmentId ||
    item.name === rawDepartmentId ||
    item.id === candidate.departmentName ||
    item.name === candidate.departmentName
  );
  return {
    personId,
    name: candidate.name || person?.name || "候选人",
    avatar: candidate.avatar || person?.avatar || String(candidate.name || person?.name || "人").slice(0, 1),
    departmentId: department?.id || rawDepartmentId || person?.departmentId || "",
    departmentName: department?.name || candidate.departmentName || person?.departmentName || "部门",
    loadAfter: Number(candidate.loadAfter ?? candidate.load ?? 0),
    conflictCount: Number(candidate.conflictCount || 0),
    reason: normalizeVisibleText(candidate.reason || "技能匹配"),
    skills: toStringArray(candidate.skills || person?.skills),
    conflictTasks: toStringArray(candidate.conflictTasks),
    tone: candidate.tone || "green"
  };
}

function resolveCareTargetUserId(person = null) {
  if (!person) return "";
  const byId = typeof store.getUser === "function" ? store.getUser(person.id) : null;
  if (byId?.id) return byId.id;
  const byUserId = typeof store.getUser === "function" ? store.getUser(person.userId) : null;
  if (byUserId?.id) return byUserId.id;
  const byName = typeof store.getUserByName === "function" ? store.getUserByName(person.name) : null;
  if (byName?.id) return byName.id;
  const fallback = (store.users || []).find((user) => user?.id === person.id || user?.id === person.userId || user?.name === person.name);
  return String(fallback?.id || "");
}

function canTogglePersonCare(person = null) {
  const targetUserId = resolveCareTargetUserId(person);
  if (!targetUserId) return false;
  return Boolean(store.currentUser?.id) && store.currentUser.id !== targetUserId && typeof store.toggleCareContact === "function";
}

function firstCareablePerson() {
  return resourceState.people.find((person) => canTogglePersonCare(person)) || resourceState.people[0] || null;
}

function isPersonCare(person = null) {
  const targetUserId = resolveCareTargetUserId(person);
  if (!targetUserId || typeof store.isCareContact !== "function") return false;
  return store.isCareContact(targetUserId);
}

function mergePeopleWorkload(entries = []) {
  entries.forEach((entry) => {
    const personId = String(entry.personId || entry.userId || entry.assigneeId || entry.id || "");
    const person = resourceState.people.find((item) => item.id === personId || item.name === entry.name);
    if (!person) return;
    person.load = Number(entry.load ?? entry.workload ?? entry.utilization ?? person.load ?? 0);
    person.recommendation = normalizeVisibleText(entry.recommendation || person.recommendation);
  });
}

function applyRange(range = {}) {
  if (!range) return;
  const startDate = range.startDate || range.start || range.from;
  const endDate = range.endDate || range.end || range.to;
  if (startDate) resourceState.range.startDate = startDate;
  if (endDate) resourceState.range.endDate = endDate;
}

function applyLocalWorkspaceSnapshot() {
  const snapshot = buildLocalResourceSnapshot(store, { user: store.currentUser, includeFallback: false });
  const localDepartments = firstArray(snapshot.departments)?.map(normalizeDepartment).filter((department) => department.id) || [];
  if (localDepartments.length) resourceState.departments = mergeByKey(resourceState.departments, localDepartments, departmentMergeKey);

  const localPeople = firstArray(snapshot.people)?.map(normalizePerson).filter((person) => person.id) || [];
  if (localPeople.length) resourceState.people = mergeByKey(resourceState.people, localPeople, personMergeKey);

  const localWorkItems = firstArray(snapshot.workItems)?.map(normalizeWorkItem).filter((item) => item.id) || [];
  if (localWorkItems.length) resourceState.workItems = mergeByKey(resourceState.workItems, localWorkItems, workItemMergeKey);

  applyRange(snapshot.dateRange || snapshot.range);
}

function mergeByKey(currentItems = [], nextItems = [], keyFactory) {
  const merged = [...currentItems];
  nextItems.forEach((item) => {
    const key = keyFactory(item);
    if (!key) return;
    const index = merged.findIndex((entry) => keyFactory(entry) === key);
    if (index >= 0) merged.splice(index, 1, { ...merged[index], ...item });
    else merged.push(item);
  });
  return merged;
}

function departmentMergeKey(department = {}) {
  return normalizeText(department.id || department.name);
}

function personMergeKey(person = {}) {
  return normalizeText(person.id || person.name);
}

function workItemMergeKey(item = {}) {
  return [item.source || "resource", item.projectId || "", item.id || item.workItemId || item.itemId || item.taskId || item.title].map(normalizeText).join("|");
}

function applyScopeToResourceState() {
  const scope = resourceState.permissions?.scope || { type: "self" };
  if (scope.type === "company") return;
  if (scope.type === "department") {
    const allowedDepartments = new Set(scope.departmentIds);
    if (!allowedDepartments.size) {
      clearScopedResourceData();
      return;
    }
    const scopedPeople = resourceState.people.filter((person) => allowedDepartments.has(person.departmentId) || allowedDepartments.has(person.departmentName));
    const scopedPeopleIds = new Set(scopedPeople.map((person) => person.id));
    resourceState.people = scopedPeople;
    resourceState.departments = resourceState.departments.filter((department) => allowedDepartments.has(department.id) || allowedDepartments.has(department.name));
    resourceState.workItems = resourceState.workItems.filter(
      (item) =>
        scopedPeopleIds.has(item.personId) ||
        (!item.personId && (allowedDepartments.has(item.departmentId) || allowedDepartments.has(item.departmentName) || allowedDepartments.has(item.assigneeDepartment)))
    );
    resourceState.availability = resourceState.availability.filter((item) => scopedPeopleIds.has(item.personId));
    resourceState.candidates = resourceState.candidates.filter((candidate) => allowedDepartments.has(candidate.departmentId) || allowedDepartments.has(candidate.departmentName));
    return;
  }
  if (scope.type === "project") {
    const allowedUsers = new Set(scope.userIds);
    const allowedNames = new Set();
    const allowedProjects = new Set(scope.projectIds);
    if (!allowedProjects.size) {
      clearScopedResourceData();
      return;
    }
    resourceState.workItems = resourceState.workItems.filter((item) => allowedProjects.has(String(item.projectId)));
    resourceState.workItems.forEach((item) => {
      if (item.personId) allowedUsers.add(item.personId);
      if (item.assigneeName) allowedNames.add(item.assigneeName);
    });
    if (!allowedUsers.size && !allowedNames.size) {
      if (resourceState.workItems.some(isUnassignedWorkItem)) {
        resourceState.people = [];
        resourceState.availability = [];
        resourceState.candidates = [];
        return;
      }
      clearScopedResourceData();
      return;
    }
    resourceState.people = resourceState.people.filter((person) => allowedUsers.has(person.id) || allowedNames.has(person.name));
    const scopedPeopleIds = new Set(resourceState.people.map((person) => person.id));
    const scopedPeopleNames = new Set(resourceState.people.map((person) => person.name));
    resourceState.workItems = resourceState.workItems.filter((item) => !item.personId || scopedPeopleIds.has(item.personId) || scopedPeopleNames.has(item.assigneeName));
    resourceState.availability = resourceState.availability.filter((item) => scopedPeopleIds.has(item.personId));
    resourceState.candidates = resourceState.candidates.filter((candidate) => scopedPeopleIds.has(candidate.personId) || scopedPeopleNames.has(candidate.name));
    return;
  }
  if (scope.type === "authorized") {
    const allowedUsers = new Set(scope.userIds);
    const allowedProjects = new Set(scope.projectIds);
    const allowedNames = new Set();

    if (!allowedUsers.size && !allowedProjects.size) {
      clearScopedResourceData();
      return;
    }

    if (allowedProjects.size) {
      resourceState.workItems = resourceState.workItems.filter((item) => allowedProjects.has(String(item.projectId)));
      resourceState.workItems.forEach((item) => {
        if (item.personId) allowedUsers.add(item.personId);
        if (item.assigneeName) allowedNames.add(item.assigneeName);
      });
    }

    const scopedPeople = resourceState.people.filter((person) => allowedUsers.has(person.id) || allowedUsers.has(person.userId) || allowedNames.has(person.name));
    const scopedPeopleIds = new Set(scopedPeople.map((person) => person.id));
    const scopedPeopleUserIds = new Set(scopedPeople.map((person) => person.userId).filter(Boolean));
    const scopedPeopleNames = new Set(scopedPeople.map((person) => person.name));
    resourceState.people = scopedPeople;
    resourceState.workItems = resourceState.workItems.filter(
      (item) =>
        !item.personId ||
        scopedPeopleIds.has(item.personId) ||
        scopedPeopleUserIds.has(item.personId) ||
        scopedPeopleNames.has(item.assigneeName)
    );
    resourceState.availability = resourceState.availability.filter((item) => scopedPeopleIds.has(item.personId) || scopedPeopleUserIds.has(item.personId));
    resourceState.candidates = resourceState.candidates.filter((candidate) => scopedPeopleIds.has(candidate.personId) || scopedPeopleUserIds.has(candidate.personId) || scopedPeopleNames.has(candidate.name));
    return;
  }
  alignSelfScopeData();
}

function clearScopedResourceData() {
  resourceState.departments = [];
  resourceState.people = [];
  resourceState.workItems = [];
  resourceState.availability = [];
  resourceState.candidates = [];
}

function workItemMatchesCurrentScope(item = {}) {
  const scope = resourceState.permissions?.scope || { type: "self" };
  if (scope.type === "company") return true;
  if (scope.type === "department") {
    const person = resourceState.people.find((entry) => entry.id === item.personId || entry.name === item.assigneeName);
    const allowedDepartments = new Set(scope.departmentIds || []);
    return Boolean(
      (person && (allowedDepartments.has(person.departmentId) || allowedDepartments.has(person.departmentName))) ||
        allowedDepartments.has(item.departmentId) ||
        allowedDepartments.has(item.assigneeDepartment)
    );
  }
  if (["project", "authorized"].includes(scope.type)) {
    return new Set(scope.projectIds || []).has(String(item.projectId));
  }
  return isSelfPerson({ id: item.personId, name: item.assigneeName });
}

function ensureAllowedView() {
  alignSelfScopeData();
  const allowedViews = buildVisibleViews(resourceState.permissions).map((view) => view.key);
  if (!allowedViews.includes(activeView.value)) {
    activeView.value = chooseDefaultView(resourceState.permissions);
    applyModeForView(activeView.value);
  }
  if (!selectedDepartmentId.value || !resourceState.departments.some((department) => department.id === selectedDepartmentId.value)) {
    selectedDepartmentId.value = resourceState.permissions?.scope?.departmentIds?.[0] || resourceState.departments[0]?.id || "";
  }
  if (!selectedPersonId.value || !resourceState.people.some((person) => person.id === selectedPersonId.value)) {
    const defaultPerson = scopeType.value === "self" ? resourceState.people.find(isSelfPerson) || resourceState.people[0] : firstCareablePerson();
    selectedPersonId.value = defaultPerson?.id || "";
  }
  if (scopeType.value === "self") {
    activeView.value = "person";
    mode.value = "person";
    const currentUserPerson = resourceState.people.find(isSelfPerson) || resourceState.people[0];
    selectedPersonId.value = currentUserPerson?.id || "";
  }
  if (!selectedCandidateId.value) selectedCandidateId.value = bestCandidate.value?.personId || "";
}

function alignSelfScopeData() {
  if ((resourceState.permissions?.scope?.type || "self") !== "self") return;
  const current = store.currentUser || {};
  const currentId = current.id || current.userId || "self";
  const currentName = current.name || current.username || "我";
  let person = resourceState.people.find(isSelfPerson);

  if (!person) {
    let department = resourceState.departments.find((item) => item.name === current.department);
    if (!department) {
      department = {
        id: "self-department",
        name: current.department || "我的部门",
      };
      resourceState.departments = [department];
    }
    person = {
      id: currentId,
      name: currentName,
      avatar: current.avatar || currentName.slice(0, 1),
      departmentId: department.id,
      departmentName: department.name,
      roleTitle: normalizeVisibleText(current.job || current.characterLabel || "人员"),
      skills: [],
      tone: "green",
      recommendation: "仅展示我的任务和空闲窗口。",
    };
    resourceState.people = [person];
  } else {
    person.id = currentId;
    person.name = currentName;
    person.avatar = current.avatar || person.avatar || currentName.slice(0, 1);
    person.departmentName = current.department || person.departmentName;
    person.roleTitle = current.job || current.characterLabel || person.roleTitle;
    person.isSelf = true;
    resourceState.people = [person];
  }

  if (!resourceState.workItems.some((item) => item.personId === person.id)) {
    resourceState.workItems = [
      {
        id: "self-task-1",
        personId: person.id,
        title: "我的当前任务",
        project: "个人任务",
        endDate: "2026/05/23",
        status: "normal"
      },
      {
        id: "self-task-2",
        personId: person.id,
        title: "我的个人安排",
        project: "个人任务",
        endDate: "2026/06/02",
        status: "warning"
      }
    ];
  }

  if (!resourceState.availability.some((item) => item.personId === person.id)) {
    resourceState.availability = [
      {
        id: "self-available-1",
        personId: person.id,
        startDate: "2026/06/03",
        endDate: "2026/06/06",
        label: "我的空闲窗口"
      }
    ];
  }
}

function selectView(view) {
  const allowed = views.value.some((entry) => entry.key === view);
  if (!allowed) return;
  activeView.value = view;
  applyModeForView(view);
}

function applyModeForView(view) {
  if (["superAdmin", "project"].includes(view)) mode.value = "timeline";
  if (view === "department") mode.value = "department";
  if (view === "person") mode.value = "person";
  if (view === "freePool") mode.value = "timeline";
  if (view === "completed") mode.value = "conflict";
}

function setMode(nextMode) {
  if (scopeType.value === "self" && nextMode !== "person") return;
  mode.value = nextMode;
  if (nextMode === "node") activeView.value = activeView.value === "person" ? chooseDefaultView(resourceState.permissions) : activeView.value;
}

function setStatsFilter(nextFilter) {
  const normalizedFilter = ["all", "overload", "available", "unassigned"].includes(nextFilter) ? nextFilter : "all";
  statsFilter.value = normalizedFilter;
  if (normalizedFilter !== "all" && scopeType.value !== "self" && mode.value === "person") {
    activeView.value = chooseDefaultView(resourceState.permissions);
    mode.value = normalizedFilter === "overload" ? "conflict" : "timeline";
  }
  reconcileVisibleSelection();
}

function reconcileVisibleSelection() {
  if (selectedPersonId.value && !visiblePeople.value.some((person) => person.id === selectedPersonId.value)) {
    selectedPersonId.value = visiblePeople.value[0]?.id || "";
  }
  if (selectedWorkItemId.value && !visibleWorkItems.value.some((item) => item.id === selectedWorkItemId.value)) {
    selectedWorkItemId.value = "";
  }
}

function selectDepartment(departmentId) {
  selectedDepartmentId.value = departmentId;
  const person = resourceState.people.find((item) => item.departmentId === departmentId);
  if (person) selectedPersonId.value = person.id;
  if (activeView.value === "person") activeView.value = resourceState.permissions.canViewDepartmentView ? "department" : "person";
  if (mode.value === "person") mode.value = "department";
}

function selectPerson(personId) {
  const person = resourceState.people.find((item) => item.id === personId);
  if (!person) return;
  if (scopeType.value === "self" && !isSelfPerson(person)) return;
  selectedPersonId.value = person.id;
  selectedDepartmentId.value = person.departmentId;
  activeView.value = "person";
  mode.value = "person";
}

function selectWorkItem(item) {
  selectedWorkItemId.value = item?.id || "";
  if (item?.personId) selectPerson(item.personId);
}

function openTimelineContextMenu(payload = {}) {
  const targetType = normalizeContextTargetType(payload);
  const person = payload.person || findPersonFromContextPayload(payload);
  const department = payload.department || findDepartmentFromContextPayload(payload, person);
  if (targetType === "work-item" && !payload.workItem) return;

  if (payload.workItem) {
    selectedWorkItemId.value = payload.workItemId || payload.workItem.id || "";
  } else if (targetType !== "work-item") {
    selectedWorkItemId.value = "";
  }
  if (person?.id) selectedPersonId.value = person.id;
  if (department?.id || person?.departmentId) selectedDepartmentId.value = department?.id || person.departmentId;

  contextMenu.open = true;
  contextMenu.x = payload.clientX || 0;
  contextMenu.y = payload.clientY || 0;
  contextMenu.item = payload.workItem || null;
  contextMenu.person = person || null;
  contextMenu.date = normalizeDateValue(payload.date || payload.startDate || payload.workItem?.startDate || "") || "";
  contextMenu.targetType = targetType;
  contextMenu.payload = {
    ...payload,
    person,
    department,
    personId: payload.personId || person?.id || "",
    departmentId: payload.departmentId || department?.id || person?.departmentId || ""
  };
}

function closeContextMenu() {
  contextMenu.open = false;
}

async function handleContextMenuAction(action) {
  const item = contextMenu.item;
  const person = contextMenu.person;
  const payload = contextMenu.payload || {};
  const targetType = contextMenu.targetType;
  closeContextMenu();
  if (targetType === "timeline-blank") {
    await handleTimelineBlankContextAction(action, payload);
    return;
  }
  if (targetType === "department") {
    handleDepartmentContextAction(action, payload);
    return;
  }
  if (targetType === "person") {
    handlePersonContextAction(action, person);
    return;
  }
  if (!item) return;
  if (action === "detail") {
    selectWorkItem(item);
    return;
  }
  if (action === "person" && person?.id) {
    selectPerson(person.id);
    return;
  }
  if (action === "assignment" && person?.id) {
    openAssignment({ personId: person.id, workItem: item });
    return;
  }
  if (action === "sync") {
    syncResourceScheduleChange(item, { startDate: item.startDate, endDate: item.endDate }, { silent: false });
  }
}

function normalizeContextTargetType(payload = {}) {
  const rawType = String(payload.targetType || payload.type || payload.contextType || "").trim();
  if (["timeline-blank", "blank", "timelineBlank", "timeline_blank"].includes(rawType)) return "timeline-blank";
  if (rawType === "department") return "department";
  if (rawType === "person") return "person";
  if (payload.workItem || payload.workItemId) return "work-item";
  if (payload.department || payload.departmentId) return "department";
  if (payload.person || payload.personId) return "person";
  return "timeline-blank";
}

function findPersonFromContextPayload(payload = {}) {
  const personId = payload.personId || payload.userId || payload.assigneeId;
  if (!personId) return null;
  return resourceState.people.find((person) => person.id === personId) || null;
}

function findDepartmentFromContextPayload(payload = {}, person = null) {
  const departmentId = payload.departmentId || person?.departmentId || payload.department?.id;
  if (!departmentId) return null;
  return resourceState.departments.find((department) => department.id === departmentId || department.name === departmentId) || null;
}

async function handleTimelineBlankContextAction(action, payload = {}) {
  if (action === "today") {
    focusTimelineToday(payload.date);
    return;
  }
  if (action === "zoom-in") {
    zoomTimelineRange("in", payload.date);
    return;
  }
  if (action === "zoom-out") {
    zoomTimelineRange("out", payload.date);
    return;
  }
  if (action === "assignment") {
    await openAiAdvisor({ reason: "timeline-blank" });
    if (resourceState.permissions.canCreateAssignmentPreview) assignmentOpen.value = true;
    return;
  }
  if (action === "sync-check") {
    timelineViewport.lastAction = "sync-check";
    timelineViewport.lastSyncCheckedAt = new Date().toISOString();
    timelineViewport.commandRevision += 1;
    store.showToast?.("已检查时间轴同步状态，当前没有需要处理的变更");
  }
}

function handleDepartmentContextAction(action, payload = {}) {
  const departmentId = payload.departmentId || payload.department?.id || "";
  if (action === "department" && departmentId) {
    selectDepartment(departmentId);
    return;
  }
  if (action === "assignment") {
    if (departmentId) assignmentDraft.departmentId = departmentId;
    openAssignment({ departmentId });
    return;
  }
  if (action === "ai-advice") {
    if (departmentId) assignmentDraft.departmentId = departmentId;
    openAiAdvisor({ reason: "department-context" });
    return;
  }
  if (action === "sync-check") {
    timelineViewport.lastAction = "department-sync-check";
    timelineViewport.lastSyncCheckedAt = new Date().toISOString();
    timelineViewport.commandRevision += 1;
    store.showToast?.("已检查部门资源与排期同步状态");
  }
}

function handlePersonContextAction(action, person = null) {
  if (!person?.id) return;
  if (action === "person") {
    selectPerson(person.id);
    return;
  }
  if (action === "assignment") {
    openAssignment({ personId: person.id });
    return;
  }
  if (action === "ai-advice") {
    selectedPersonId.value = person.id;
    selectedDepartmentId.value = person.departmentId || selectedDepartmentId.value;
    openAiAdvisor({ reason: "person-context" });
    return;
  }
  if (action === "sync-check") {
    timelineViewport.lastAction = "person-sync-check";
    timelineViewport.lastSyncCheckedAt = new Date().toISOString();
    timelineViewport.commandRevision += 1;
    store.showToast?.("已检查人员资源与排期同步状态");
  }
}

function focusTimelineToday(fallbackDate = "") {
  const focusDate = normalizeDateValue(fallbackDate) || formatDateValue(new Date());
  updateTimelineRangeAround(focusDate, timelineRangeWindowDays());
  timelineViewport.focusDate = focusDate;
  timelineViewport.lastAction = "today";
  timelineViewport.commandRevision += 1;
}

function zoomTimelineRange(direction, focusDate = "") {
  const currentWindow = timelineRangeWindowDays();
  const nextWindow = direction === "in"
    ? Math.max(TIMELINE_MIN_WINDOW_DAYS, Math.round(currentWindow * 0.75))
    : Math.min(TIMELINE_MAX_WINDOW_DAYS, Math.round(currentWindow * 1.35));
  const normalizedFocusDate = normalizeDateValue(focusDate) || timelineRangeCenterDate() || formatDateValue(new Date());
  updateTimelineRangeAround(normalizedFocusDate, nextWindow);
  timelineViewport.zoomLevel = Math.max(0.5, Math.min(3, Number((TIMELINE_DEFAULT_WINDOW_DAYS / nextWindow).toFixed(2))));
  timelineViewport.focusDate = normalizedFocusDate;
  timelineViewport.lastAction = direction === "in" ? "zoom-in" : "zoom-out";
  timelineViewport.commandRevision += 1;
}

function timelineRangeWindowDays() {
  const start = parseDateValue(resourceState.range?.startDate);
  const end = parseDateValue(resourceState.range?.endDate);
  if (!start || !end) return TIMELINE_DEFAULT_WINDOW_DAYS;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function timelineRangeCenterDate() {
  const start = parseDateValue(resourceState.range?.startDate);
  const end = parseDateValue(resourceState.range?.endDate);
  if (!start || !end) return "";
  return formatDateValue(new Date((start.getTime() + end.getTime()) / 2));
}

function updateTimelineRangeAround(centerDateValue, windowDays) {
  const center = parseDateValue(centerDateValue);
  if (!center) return;
  const boundedWindowDays = Math.max(TIMELINE_MIN_WINDOW_DAYS, Math.min(TIMELINE_MAX_WINDOW_DAYS, windowDays || TIMELINE_DEFAULT_WINDOW_DAYS));
  const leftDays = Math.floor((boundedWindowDays - 1) / 2);
  const rightDays = boundedWindowDays - 1 - leftDays;
  resourceState.range.startDate = formatDateValue(addDaysToDate(center, -leftDays));
  resourceState.range.endDate = formatDateValue(addDaysToDate(center, rightDays));
}

async function rescheduleWorkItem(payload = {}) {
  if (!resourceState.permissions.canAssignTask && !resourceState.permissions.canTransferConflictTask) {
    store.showToast?.("当前权限只能查看资源时间线，不能调整任务");
    store.showToast?.("当前权限只能查看资源时间线，不能调整任务");
  }
  closeContextMenu();
  const item = payload.workItem || {};
  const nextRange = normalizeDateRange(payload.startDate, payload.endDate);
  if (!item.id || !nextRange.startDate || !nextRange.endDate) return;

  const previous = normalizeWorkItem(item);
  const previousSelectedWorkItemId = selectedWorkItemId.value;
  upsertWorkItem({
    ...previous,
    startDate: nextRange.startDate,
    endDate: nextRange.endDate
  });
  selectedWorkItemId.value = previous.id;

  const syncResult = await syncResourceScheduleChange(previous, nextRange, {
    silent: true,
    interaction: payload.interaction,
    previousStartDate: payload.previousStartDate,
    previousEndDate: payload.previousEndDate,
    deltaDays: payload.deltaDays
  });
  applyLocalWorkspaceSnapshot();
  applyScopeToResourceState();
  ensureAllowedView();
  if (!syncResult.ok) {
    upsertWorkItem(previous);
    selectedWorkItemId.value = previousSelectedWorkItemId;
    store.showToast?.(syncResult.message);
    return;
  }
  store.showToast?.(syncResult.synced ? "已同步任务日期到后端和资源时间线" : "已更新资源时间线，等待后端排期同步接口");
  store.showToast?.(syncResult.synced ? "已同步任务日期到后端和资源时间线" : "已更新资源时间线，等待后端排期同步接口");
}

async function syncResourceScheduleChange(item = {}, range = {}, options = {}) {
  const nextRange = normalizeDateRange(range.startDate, range.endDate);
  if (!nextRange.startDate || !nextRange.endDate) {
    return { ok: false, synced: false, message: "任务时间无效，未能同步到排期" };
  }
  const scheduleItem = findLinkedScheduleItem(item);
  if (scheduleItem && typeof store.updateScheduleItemDates === "function") {
    await store.updateScheduleItemDates(scheduleItem.id || scheduleItem.itemId, nextRange);
    const backendSync = await syncResourceBackendSchedule(item, nextRange, "schedule", options);
    if (!backendSync.ok) {
      if (!options.silent) store.showToast?.(backendSync.message);
      return { ok: false, synced: false, message: backendSync.message };
    }
    if (!options.silent) store.showToast?.("已同步排期项日期和资源时间线");
    if (!options.silent) store.showToast?.("已同步排期项日期和资源时间线");
  }

  const task = findLinkedTask(item);
  if (task) {
    task.startDate = nextRange.startDate;
    task.endDate = nextRange.endDate;
    syncTaskDatesInBackground(task, nextRange);
    const backendSync = await syncResourceBackendSchedule(item, nextRange, "task", options);
    if (!backendSync.ok) {
      if (!options.silent) store.showToast?.(backendSync.message);
      return { ok: false, synced: false, message: backendSync.message };
    }
    if (!options.silent) store.showToast?.("已同步任务日期和资源时间线");
    if (!options.silent) store.showToast?.("已同步任务日期和资源时间线");
  }

  const backendSync = await syncResourceBackendSchedule(item, nextRange, "resource", options);
  if (!backendSync.ok) {
    if (!options.silent) store.showToast?.(backendSync.message);
    return { ok: false, synced: false, message: backendSync.message };
  }
  if (!options.silent) store.showToast?.("已保存资源时间线调整，等待后端确认工作流接入");
  if (!options.silent) store.showToast?.("已保存资源时间线调整，等待后端确认工作流接入");
}

function normalizeDateRange(startDate, endDate) {
  const start = normalizeDateValue(startDate);
  const end = normalizeDateValue(endDate || start);
  if (!start || !end) return { startDate: "", endDate: "" };
  return start.localeCompare(end) <= 0 ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
}

function normalizeDateValue(value) {
  const text = String(value || "").trim().replace(/-/g, "/");
  const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function parseDateValue(value) {
  const normalized = normalizeDateValue(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("/").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function formatDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysToDate(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function idCandidates(...values) {
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function sameId(left, right) {
  const leftIds = idCandidates(...left);
  const rightIds = new Set(idCandidates(...right));
  return leftIds.some((id) => rightIds.has(id));
}

function findLinkedScheduleItem(item = {}) {
  const scheduleItems = Array.isArray(store.schedulePlan?.items) ? store.schedulePlan.items : [];
  return scheduleItems.find((entry) =>
    sameId(
      [entry.id, entry.itemId, entry.workItemId],
      [item.id, item.itemId, item.workItemId]
    ) ||
    sameId(
      [entry.taskUid, entry.payload?.taskUid, entry.payload?.taskId, entry.payload?.backendTaskId],
      [item.taskUid, item.taskId]
    )
  ) || null;
}

function findLinkedTask(item = {}) {
  const taskIds = idCandidates(item.taskUid, item.taskId, item.raw?.id, item.raw?.taskId, item.raw?.taskUid);
  for (const taskId of taskIds) {
    const task = store.getTask?.(taskId);
    if (task) return task;
  }
  const allTasks = (store.allProjects || []).flatMap((project) => project.tasks || []);
  return allTasks.find((task) => {
    if (sameId([task.id, task.taskUid, task.taskId], [item.id, item.taskUid, item.taskId])) return true;
    return normalizeText(task.title) === normalizeText(item.title) && normalizeText(task.startDate) === normalizeText(item.startDate);
  }) || null;
}

function projectIdForTask(task = {}) {
  return store.allProjects?.find((project) => (project.tasks || []).some((entry) => entry.id === task.id))?.id || store.activeProject?.id || null;
}

function syncTaskDatesInBackground(task, range) {
  if (typeof window === "undefined") return;
  Promise.resolve()
    .then(() =>
      workspaceApi.updateTask(task.id, {
        projectId: projectIdForTask(task),
        startDate: range.startDate,
        endDate: range.endDate
      })
    )
    .catch((error) => {
      console.warn("[workspaceApi] resourceTaskDateSync failed", error);
      store.showToast?.("已本地保存，但后端同步失败");
    });
}

function buildAssignmentAnalysisPayload() {
  return {
    assignment: buildAssignmentDraftPayload(),
    scope: resourceState.permissions.scope,
    permissions: resourceState.permissions,
    selectedPerson: selectedPerson.value,
    selectedPersonWorkItems: selectedPersonWorkItems.value,
    candidates: candidates.value,
    selectedCandidateId: selectedCandidateId.value,
    availability: visibleAvailability.value,
    workItems: visibleWorkItems.value,
    range: resourceState.range
  };
}

function buildAssignmentDraftPatchFromWorkItem(item = {}) {
  if (!item || typeof item !== "object") return {};
  const linkedScheduleItem = findLinkedScheduleItem(item) || {};
  const linkedTask = findLinkedTask(item) || {};
  const linkFields = buildAssignmentLinkFields(item, linkedScheduleItem, linkedTask);
  return {
    title: item.title || linkedTask.title || assignmentDraft.title,
    project: item.project || item.projectName || linkedTask.project || assignmentDraft.project,
    projectId: item.projectId || item.project_id || item.projectUid || item.project_uid || item.raw?.projectId || item.raw?.project_id || linkFields.projectId || projectIdForTask(linkedTask) || assignmentDraft.projectId || "",
    projectUid: item.projectUid || item.project_uid || item.projectId || item.project_id || item.raw?.projectUid || item.raw?.project_uid || linkFields.projectId || projectIdForTask(linkedTask) || assignmentDraft.projectUid || "",
    projectName: item.projectName || item.project_name || item.project || linkedTask.project || assignmentDraft.projectName || assignmentDraft.project,
    startDate: item.startDate || linkedScheduleItem.startDate || linkedTask.startDate || assignmentDraft.startDate,
    endDate: item.endDate || linkedScheduleItem.endDate || linkedTask.endDate || assignmentDraft.endDate,
    departmentId: item.departmentId || item.assigneeDepartment || assignmentDraft.departmentId,
    workItemId: linkFields.workItemId,
    itemId: linkFields.itemId,
    scheduleItemId: linkFields.scheduleItemId,
    taskId: linkFields.taskId,
    taskUid: linkFields.taskUid
  };
}

function defaultAssignmentProjectContext(defaultWorkItem = {}) {
  const activeProject = store.activeProject || {};
  const activeProjectId = activeProject.projectId || activeProject.projectUid || activeProject.project_uid || activeProject.id || store.activeProjectId || "";
  const workItemProjectId =
    defaultWorkItem.projectId ||
    defaultWorkItem.project_id ||
    defaultWorkItem.projectUid ||
    defaultWorkItem.project_uid ||
    defaultWorkItem.raw?.projectId ||
    defaultWorkItem.raw?.project_id ||
    "";
  const projectId = workItemProjectId || activeProjectId || resourceState.permissions?.scope?.projectIds?.[0] || "";
  if (!projectId) return {};
  const projectName =
    defaultWorkItem.projectName ||
    defaultWorkItem.project_name ||
    defaultWorkItem.project ||
    activeProject.name ||
    activeProject.title ||
    assignmentDraft.projectName ||
    assignmentDraft.project;
  return {
    projectId,
    projectUid: defaultWorkItem.projectUid || defaultWorkItem.project_uid || activeProject.projectUid || activeProject.project_uid || projectId,
    projectName,
    project: projectName || assignmentDraft.project
  };
}

function findDefaultAssignmentWorkItem() {
  const selected = resourceState.workItems.find((item) => item.id === selectedWorkItemId.value || item.workItemId === selectedWorkItemId.value || item.itemId === selectedWorkItemId.value);
  const candidates = [selected, ...visibleUnassignedWorkItems.value, ...visibleWorkItems.value, ...resourceState.workItems].filter(Boolean);
  return candidates.find((item) => item.projectId || item.projectUid || item.raw?.projectId || item.raw?.project_uid) ||
    candidates.find((item) => item.projectId || item.taskId || item.taskUid || item.workItemId) ||
    null;
}

function applyDefaultAssignmentDraft() {
  const defaultWorkItem = findDefaultAssignmentWorkItem();
  const workItemPatch = defaultWorkItem ? buildAssignmentDraftPatchFromWorkItem(defaultWorkItem) : {};
  const projectContext = defaultAssignmentProjectContext(defaultWorkItem || {});
  if (!projectContext.projectId && !workItemPatch.projectId) return false;
  Object.assign(assignmentDraft, {
    ...workItemPatch,
    ...projectContext,
    title: assignmentDraft.title || workItemPatch.title,
    startDate: assignmentDraft.startDate || workItemPatch.startDate,
    endDate: assignmentDraft.endDate || workItemPatch.endDate,
    workItemId: "",
    itemId: "",
    scheduleItemId: "",
    taskId: "",
    taskUid: ""
  });
  return true;
}

function normalizeAiAdvisorAdvice(payload = {}) {
  const data = unwrapPayload(payload);
  const advice = isPlainObject(data.advice) ? data.advice : isPlainObject(data.analysis) ? data.analysis : data;
  const recommended = advice.recommendedCandidate || advice.recommended_candidate || advice.candidate || bestCandidate.value;
  const recommendedCandidate = typeof recommended === "string"
    ? candidates.value.find((candidate) => candidate.personId === recommended || candidate.name === recommended) || bestCandidate.value
    : normalizeAdvisorCandidate(recommended || bestCandidate.value);
  return {
    ...advice,
    recommendedCandidate,
    scheduleAdvice: uniqueTextList(toStringArray(advice.scheduleAdvice || advice.schedule_advice)),
    communicationAdvice: uniqueTextList(toStringArray(advice.communicationAdvice || advice.communication_advice)),
    risks: uniqueTextList(toStringArray(advice.risks)),
    syncNotes: uniqueTextList(toStringArray(advice.syncNotes || advice.sync_notes)),
    source: advice.source || data.source || "remote"
  };
}

function normalizeAdvisorCandidate(candidate = {}) {
  if (!candidate) return null;
  const matchedCandidate = candidates.value.find((item) => item.personId === candidate.personId || item.personId === candidate.id || item.name === candidate.name);
  return matchedCandidate || normalizeCandidate(candidate);
}

function buildLocalAssignmentAdvice() {
  const ranked = rankedCandidates(candidates.value, {
    draft: assignmentDraft,
    availability: visibleAvailability.value,
    workItems: visibleWorkItems.value
  });
  const recommendedCandidate = ranked[0] || null;
  const taskRange = `${assignmentDraft.startDate} - ${assignmentDraft.endDate}`;
  const conflictCount = recommendedCandidate
    ? Number(recommendedCandidate.conflictCount || 0) + countScheduleConflicts(recommendedCandidate.personId, assignmentDraft, visibleWorkItems.value)
    : 0;
  const skillMatches = recommendedCandidate ? candidateSkillScore(recommendedCandidate, assignmentDraft) : 0;
  const windowMatches = recommendedCandidate
    ? visibleAvailability.value.filter((item) => item.personId === recommendedCandidate.personId && rangesOverlap(item, assignmentDraft))
    : [];
  const risks = [];
  const fallbackReasons = recommendedCandidate
    ? uniqueTextList([
        ...toStringArray(recommendedCandidate.reasons),
        recommendedCandidate.reason,
        `${recommendedCandidate.name} 预计负载 ${recommendedCandidate.loadAfter}%`,
        conflictCount ? `存在 ${conflictCount} 个时间段任务冲突` : "当前时间段未发现任务冲突",
        skillMatches ? `匹配 ${skillMatches} 个技能关键词` : "技能匹配不足，建议安排复核",
        windowMatches.length ? "存在空闲窗口匹配" : "未找到完全重合空闲窗口"
      ])
    : ["当前没有可用候选人，需要等待智能推荐或扩展权限范围"];
  if (!recommendedCandidate) risks.push("候选人列表为空，无法生成可靠推荐");
  if (recommendedCandidate?.loadAfter >= 100) risks.push(`${recommendedCandidate.name} 分配后负载将达到 ${recommendedCandidate.loadAfter}%`);
  if (conflictCount > 0) risks.push(`${recommendedCandidate?.name || "候选人"} 有 ${conflictCount} 个冲突需要确认`);
  if (recommendedCandidate && !skillMatches) risks.push(`${recommendedCandidate.name} 与 ${assignmentDraft.skillText || "任务技能"} 的文本匹配较弱`);
  if (!windowMatches.length && recommendedCandidate) risks.push(`${recommendedCandidate.name} 在 ${taskRange} 没有完全匹配的空闲窗口`);
  return {
    source: "local-fallback",
    recommendedCandidate,
    candidateRanking: ranked.map((candidate) => ({
      personId: candidate.personId,
      name: candidate.name,
      score: Math.round(scoreCandidate(candidate, {
        draft: assignmentDraft,
        availability: visibleAvailability.value,
        workItems: visibleWorkItems.value
      })),
      loadAfter: candidate.loadAfter,
      conflictCount: candidate.conflictCount,
      reasons: uniqueTextList([candidate.reason, ...toStringArray(candidate.reasons)])
    })),
    reasons: fallbackReasons,
    scheduleAdvice: uniqueTextList([
      recommendedCandidate ? `建议将《${assignmentDraft.title}》安排给 ${recommendedCandidate.name}，时间为 ${taskRange}` : `建议先补充 ${taskRange} 的候选人信息`,
      windowMatches.length ? "候选人存在可用窗口" : "安排前需要与候选人确认可用时间",
      conflictCount ? "如需保留原时间，请先调整优先级或走超负荷确认" : "可按当前时间同步到后端排期"
    ]),
    communicationAdvice: uniqueTextList([
      recommendedCandidate ? `通知 ${recommendedCandidate.name} 确认 ${assignmentDraft.title} 的交付范围和截止时间` : "通知项目经理补充候选人范围",
      "同步项目经理确认优先级，判断交付节点是否需要调整",
      "如果智能建议不可用，本地建议仅作为临时参考"
    ]),
    risks: risks.length ? uniqueTextList(risks) : ["未发现明显负载或时间冲突风险"],
    syncNotes: uniqueTextList([
      "智能建议仅在前端展示，不携带 DeepSeek 密钥",
      "确认分配后仍会走原有预览/确认接口",
      "拖拽调整任务后会同步任务和资源时间线"
    ])
  };
}

async function syncResourceBackendSchedule(item = {}, range = {}, source = "resource", options = {}) {
  try {
    await resourceApi.rescheduleWorkItem?.({
      workItemId: item.workItemId || item.scheduleItemId || item.itemId || item.id,
      itemId: item.itemId,
      scheduleItemId: item.scheduleItemId || item.itemId,
      taskId: item.taskId,
      taskUid: item.taskUid,
      projectId: item.projectId,
      source,
      startDate: range.startDate,
      endDate: range.endDate,
      interaction: options.interaction,
      previousStartDate: options.previousStartDate,
      previousEndDate: options.previousEndDate,
      deltaDays: options.deltaDays,
      scope: resourceState.permissions.scope
    });
    return { ok: true, message: "" };
  } catch (error) {
    if (handleResourceAuthFailure(error, "登录已失效或权限不足，无法同步日期。")) {
      return {
        ok: false,
        message: backendSyncToast(error)
      };
    }
    return {
      ok: false,
      message: formatResourceApiFeedback(error, "后端排期同步失败")
    };
  }
}

function openAssignment(payload = {}) {
  if (!resourceState.permissions.canCreateAssignmentPreview) return;
  clearAssignmentSyncContext();
  if (payload.workItem) {
    Object.assign(assignmentDraft, buildAssignmentDraftPatchFromWorkItem(payload.workItem));
  }
  if (!payload.workItem) applyDefaultAssignmentDraft();
  if (payload.personId) selectedCandidateId.value = payload.personId;
  if (payload.id) selectedCandidateId.value = payload.id;
  if (!selectedCandidateId.value || !candidates.value.some((candidate) => candidate.personId === selectedCandidateId.value)) {
    selectedCandidateId.value = bestCandidate.value?.personId || "";
  }
  completion.value = null;
  assignmentOpen.value = true;
  openAiAdvisor({ reason: payload.workItem ? "work-item-assignment" : "assignment" });
}

function handleRequestAlternative(person = {}) {
  if (!resourceState.permissions.canCreateAssignmentPreview) return;
  if (person.id) selectedPersonId.value = person.id;
  const alternative = chooseBestCandidate(
    candidates.value.filter((candidate) => candidate.personId !== person.id && candidate.loadAfter < 100),
    {
      draft: assignmentDraft,
      availability: visibleAvailability.value,
      workItems: visibleWorkItems.value
    }
  );
  selectedCandidateId.value = alternative?.personId || bestCandidate.value?.personId || "";
  completion.value = null;
  openAiAdvisor({ reason: "alternative-person" });
}

function togglePersonCare(person = {}) {
  const targetUserId = resolveCareTargetUserId(person);
  if (!targetUserId || !canTogglePersonCare(person)) return false;
  return store.toggleCareContact(targetUserId);
}

function updateAssignmentDraft(nextDraft) {
  Object.assign(assignmentDraft, nextDraft);
}

async function openAiAdvisor(options = {}) {
  if (!resourceState.permissions.canCreateAssignmentPreview) return;
  aiAdvisorOpen.value = true;
  await analyzeAssignmentAdvice(options);
}

async function analyzeAssignmentAdvice(options = {}) {
  const requestId = ++aiAdvisorRequestId;
  aiAdvisorLoading.value = true;
  aiAdvisorError.value = "";
  try {
    if (typeof resourceApi.analyzeAssignment !== "function") {
      throw new Error("resourceApi.analyzeAssignment is unavailable");
    }
    const result = await resourceApi.analyzeAssignment({
      ...buildAssignmentAnalysisPayload(),
      reason: options.reason || "assignment"
    });
    if (requestId !== aiAdvisorRequestId) return;
    aiAdvisorAdvice.value = normalizeAiAdvisorAdvice(result);
  } catch (error) {
    if (requestId !== aiAdvisorRequestId) return;
    aiAdvisorAdvice.value = buildLocalAssignmentAdvice();
    aiAdvisorError.value = assignmentAdviceFallbackMessage(error);
  } finally {
    if (requestId === aiAdvisorRequestId) aiAdvisorLoading.value = false;
  }
}

function closeAiAdvisor() {
  aiAdvisorOpen.value = false;
}

function selectAdvisorCandidate(candidateOrId) {
  const candidateId = typeof candidateOrId === "string"
    ? candidateOrId
    : candidateOrId?.personId || candidateOrId?.id || "";
  if (!candidateId) return;
  if (candidates.value.some((candidate) => candidate.personId === candidateId)) {
    selectedCandidateId.value = candidateId;
  }
}

function handleAdvisorOpenAssignment(payload = {}) {
  if (!resourceState.permissions.canCreateAssignmentPreview) return;
  if (payload.draft) updateAssignmentDraft(payload.draft);
  selectAdvisorCandidate(payload.person || payload.candidate || payload.recommendedCandidate);
  if (!selectedCandidateId.value || !candidates.value.some((candidate) => candidate.personId === selectedCandidateId.value)) {
    selectedCandidateId.value = bestCandidate.value?.personId || "";
  }
  completion.value = null;
  assignmentOpen.value = true;
  aiAdvisorOpen.value = false;
}

async function searchCandidates() {
  if (!resourceState.permissions.canCreateAssignmentPreview) return;
  aiAdvisorOpen.value = true;
  aiAdvisorLoading.value = true;
  try {
    const result = await resourceApi.previewAssignment(
      buildAssignmentApiPayload(buildAssignmentDraftPayload(), {
        scope: resourceState.permissions.scope,
        candidates: candidates.value,
        skillTags: assignmentDraft.skillText.split(/[\/,，、\s]+/).filter(Boolean)
      })
    );
    const preview = normalizeAssignmentPreview(result, selectedCandidate.value);
    assignmentPreview.value = preview;
    if (Array.isArray(preview.candidates) && preview.candidates.length) {
      resourceState.candidates = preview.candidates.map(normalizeCandidate);
      applyScopeToResourceState();
    }
  } catch (error) {
    if (handleResourceAuthFailure(error, "登录已失效或权限不足，无法生成智能推荐。")) {
      return;
    }
    store.showToast?.("已按本地候选人生成智能推荐");
    selectedCandidateId.value = bestCandidate.value?.personId || "";
    await analyzeAssignmentAdvice({ reason: "candidate-search" });
  }
}

async function applyAdvisorCandidate(candidateOrId) {
  if (!resourceState.permissions.canCreateAssignmentPreview) return;
  const candidateId = typeof candidateOrId === "string"
    ? candidateOrId
    : candidateOrId?.personId || candidateOrId?.id || "";
  if (!candidateId) return;
  const candidate = candidates.value.find((entry) => entry.personId === candidateId) || normalizeCandidate(candidateOrId || {});
  if (!candidate?.personId) return;

  selectedCandidateId.value = candidate.personId;
  completion.value = null;
  assignmentOpen.value = true;
  aiAdvisorOpen.value = false;
  aiAdvisorLoading.value = true;
  let previewAllowed = true;
  try {
    const result = await resourceApi.previewAssignment(
      buildAssignmentApiPayload(buildAssignmentDraftPayload(), {
        scope: resourceState.permissions.scope,
        assigneeId: candidate.personId,
        assigneeName: candidate.name,
        candidate,
        candidates: candidates.value,
        skillTags: assignmentDraft.skillText.split(/[\/,，、\s]+/).filter(Boolean)
      })
    );
    assignmentPreview.value = normalizeAssignmentPreview(result, candidate);
    if (Array.isArray(assignmentPreview.value?.candidates) && assignmentPreview.value.candidates.length) {
      resourceState.candidates = assignmentPreview.value.candidates.map(normalizeCandidate);
      applyScopeToResourceState();
    }
  } catch (error) {
    if (handleResourceAuthFailure(error, "登录已失效或权限不足，无法预览分配。")) {
      previewAllowed = false;
    }
    assignmentPreview.value = null;
    if (previewAllowed) store.showToast?.(formatResourceApiFeedback(error, "分配预览失败，请检查提交后再确认"));
    aiAdvisorLoading.value = false;
  }
  if (!previewAllowed) return false;
  return submitAssignment(candidate);
}

function submitAssignment(candidatePayload = null) {
  const candidate = normalizeSubmittedCandidate(candidatePayload);
  if (!candidate || !resourceState.permissions.canAssignTask) return;
  if (candidate.personId) selectedCandidateId.value = candidate.personId;
  if (candidate.loadAfter >= 100 || candidate.conflictCount > 0) {
    overloadCandidate.value = candidate;
    overloadOpen.value = true;
    return;
  }
  confirmAssignment(candidate, { forced: false });
}

function normalizeSubmittedCandidate(candidatePayload = null) {
  const candidateId = typeof candidatePayload === "string"
    ? candidatePayload
    : candidatePayload?.personId || candidatePayload?.id || selectedCandidateId.value;
  return candidates.value.find((candidate) => candidate.personId === candidateId) || selectedCandidate.value;
}

function useAlternativeCandidate() {
  const alternative = alternativeCandidate.value;
  if (!alternative) return;
  overloadOpen.value = false;
  overloadCandidate.value = null;
  selectedCandidateId.value = alternative.personId;
  confirmAssignment(alternative, { forced: false });
}

function forceAssignment(payload = {}) {
  if (!overloadCandidate.value || !resourceState.permissions.canForceAssignOverload) return;
  confirmAssignment(overloadCandidate.value, { forced: true, reason: payload.reason });
  overloadOpen.value = false;
  overloadCandidate.value = null;
}

async function confirmAssignment(candidate, options = {}) {
  const draftPayload = buildAssignmentDraftPayload();
  const payload = buildAssignmentApiPayload(draftPayload, buildAssignmentApiExtras(candidate, draftPayload, options));
  let item = null;
  let usedRemoteResult = false;
  let usedOfflineFallback = false;
  try {
    const result = options.forced
      ? await resourceApi.forceConfirmAssignment(payload)
      : await resourceApi.confirmAssignment(payload);
    if (isRejectedApiResult(result)) {
      store.showToast?.(formatResourceApiFeedback(result, options.forced ? "强制分配确认失败，未写入时间线" : "分配确认失败，未写入时间线"));
    }
    const assignment = normalizeAssignmentConfirmation(result, candidate, options);
    usedRemoteResult = applyAssignmentConfirmationResult(result, assignment);
    item = assignment.item;
  } catch (error) {
    if (handleResourceAuthFailure(error, options.forced ? "登录已失效或权限不足，无法强制分配。" : "登录已失效或权限不足，无法确认分配。")) {
    }
    if (!offlineResourceMode.value) {
      store.showToast?.(formatResourceApiFeedback(error, options.forced ? "强制分配确认失败，未写入时间线" : "分配确认失败，未写入时间线"));
    }
    usedOfflineFallback = true;
  }
  if (!item) item = createLocalAssignmentItem(candidate, options);
  if (!usedRemoteResult) upsertWorkItem(item);
  completion.value = {
    ...item,
    taskTitle: item.title,
    personName: candidate.name,
    forced: options.forced,
    reason: options.reason || ""
  };
  selectedPersonId.value = candidate.personId;
  selectedWorkItemId.value = item.id;
  activeView.value = "completed";
  mode.value = "timeline";
  assignmentOpen.value = true;
  store.showToast?.(
    usedOfflineFallback
      ? (options.forced ? "离线模式：强制分配已写入本地时间线，后端恢复后需要同步" : "离线模式：分配已写入本地时间线，后端恢复后需要同步")
      : (options.forced ? "强制分配已记录" : "分配完成，已写入时间线")
  );
  await refreshResourceSnapshotsAfterAssignment();
}

async function refreshResourceSnapshotsAfterAssignment() {
  applyLocalWorkspaceSnapshot();
  applyScopeToResourceState();
}

function createLocalAssignmentItem(candidate, options = {}) {
  return {
    id: `assignment-${Date.now()}`,
    personId: candidate.personId,
    assigneeName: candidate.name,
    title: assignmentDraft.title,
    project: assignmentDraft.project,
    projectId: assignmentDraft.projectId || resourceState.permissions?.scope?.projectIds?.[0] || "",
    startDate: assignmentDraft.startDate,
    endDate: assignmentDraft.endDate,
    status: options.forced ? "danger" : "new"
  };
}

function isRejectedApiResult(payload = {}) {
  const data = unwrapPayload(payload);
  return data.ok === false || data.success === false || data.allowed === false;
}

function normalizeAssignmentPreview(payload = {}, candidate = null) {
  const data = unwrapPayload(payload);
  const preview = isPlainObject(data.preview) ? data.preview : data;
  return {
    ...preview,
    id: preview.previewId || preview.id || data.previewId || "",
    candidates: firstArray(preview.candidates, data.candidates) || [],
    candidate: preview.candidate || candidate
  };
}

function normalizeAssignmentConfirmation(payload = {}, candidate, options = {}) {
  const data = unwrapPayload(payload);
  const assignment = data.assignment || data.workItem || data.item || data.task || data;
  const item = normalizeWorkItem({
    ...createLocalAssignmentItem(candidate, options),
    ...assignment,
    personId: assignment.personId || assignment.assigneeId || candidate.personId,
    assigneeId: assignment.assigneeId || assignment.personId || candidate.personId,
    title: assignment.title || assignment.taskTitle || assignmentDraft.title,
    project: assignment.project || assignment.projectName || assignmentDraft.project,
    startDate: assignment.startDate || assignmentDraft.startDate,
    endDate: assignment.endDate || assignmentDraft.endDate,
    status: assignment.status || (options.forced ? "danger" : "new")
  });
  return {
    item,
    completion: data.completion || data.result || {},
    resources: data.resources,
    workload: data.workload,
    scheduleItem: data.scheduleItem,
    task: data.task
  };
}

function applyAssignmentConfirmationResult(payload = {}, assignment = {}) {
  const data = unwrapPayload(payload);
  let applied = false;
  const workspaceSync = applyAssignmentWorkspaceSync(store, {
    scheduleItem: assignment.scheduleItem || data.scheduleItem,
    task: assignment.task || data.task
  });
  if (workspaceSync.scheduleItemApplied || workspaceSync.taskApplied) {
    if (store.scheduleUi && typeof store.scheduleUi === "object") {
      store.scheduleUi = {
        ...store.scheduleUi,
        localRevision: Number(store.scheduleUi.localRevision || 0) + 1
      };
    }
    applied = true;
  }
  if (assignment.resources) {
    applyRemoteResourceState(assignment.resources);
    applied = true;
  }
  if (assignment.workload) {
    applyRemoteWorkloadState(assignment.workload);
    applied = true;
  }
  if (data.resourcePermissions || data.resources || data.people || data.workItems || data.availability) {
    applyRemoteResourceState(data);
    applied = true;
  }
  if (data.workload || data.workloads || data.personWorkloads) {
    applyRemoteWorkloadState(data.workload || data);
    applied = true;
  }
  if (assignment.item?.id) {
    upsertWorkItem(assignment.item);
    applied = true;
  }
  if (applied) applyScopeToResourceState();
  return applied;
}

function upsertWorkItem(item = {}) {
  const normalizedItem = normalizeWorkItem(item);
  const index = resourceState.workItems.findIndex((entry) => entry.id === normalizedItem.id);
  if (index >= 0) {
    resourceState.workItems = resourceState.workItems.map((entry, entryIndex) => (entryIndex === index ? normalizedItem : entry));
    return;
  }
  resourceState.workItems = [...resourceState.workItems, normalizedItem];
}

function completionToWorkItem(item) {
  return {
    id: item.id,
    personId: item.personId,
    title: item.taskTitle || item.title,
    project: item.project,
    projectId: item.projectId || "",
    startDate: item.startDate,
    endDate: item.endDate,
    status: item.forced ? "danger" : "new"
  };
}

function clearCompletion() {
  completion.value = null;
}

function resetCompletion() {
  completion.value = null;
  selectedWorkItemId.value = "";
  clearAssignmentSyncContext();
}

function createFallbackResourceState() {
  const departments = [
    { id: "pm", name: "项目管理", color: "green" },
    { id: "pm", name: "项目管理", color: "green" },
    { id: "design", name: "美术设计", color: "pink" },
    { id: "threeD", name: "三维动画", color: "blue" },
    { id: "threeD", name: "三维动画", color: "blue" },
    { id: "post", name: "后期合成", color: "orange" }
  ];
  const people = [
    { id: "pm-luosen", name: "罗森", avatar: "罗", departmentId: "pm", departmentName: "项目管理", roleTitle: "项目经理", load: 72, skills: ["项目管理", "协同沟通"], tone: "green" },
    { id: "pm-xumian", name: "徐眠", avatar: "徐", departmentId: "pm", departmentName: "项目管理", roleTitle: "超级管理员", load: 68, skills: ["管理"], tone: "green" },
    { id: "design-zhumin", name: "朱敏", avatar: "朱", departmentId: "design", departmentName: "美术设计", roleTitle: "主美 / 复核", load: 118, skills: ["主美", "复核"], tone: "pink", recommendation: "不建议增加执行任务，请保留复核时间。" },
    { id: "design-ui-a", name: "界面设计 A", avatar: "界", departmentId: "design", departmentName: "美术设计", roleTitle: "界面 / 活动页", load: 76, skills: ["界面设计", "活动页"], tone: "green", recommendation: "连续 3 天可安排，适合承接活动页资源工作。" },
    { id: "design-icon-b", name: "图标设计 B", avatar: "图", departmentId: "design", departmentName: "美术设计", roleTitle: "原画 / 图标", load: 64, skills: ["图标", "原画"], tone: "green" },
    { id: "design-anqi", name: "安琪", avatar: "安", departmentId: "design", departmentName: "美术设计", roleTitle: "合成 / 包装", load: 44, skills: ["合成"], tone: "green" },
    { id: "design-lili", name: "莉莉", avatar: "莉", departmentId: "design", departmentName: "美术设计", roleTitle: "主视觉 / 海报", load: 92, skills: ["主视觉"], tone: "yellow" },
    { id: "aigc-xiaoyu", name: "小宇", avatar: "宇", departmentId: "aigc", departmentName: "AIGC", roleTitle: "生成 / 复核", load: 104, skills: ["AIGC"], tone: "purple" },
    { id: "aigc-wuming", name: "吴明", avatar: "吴", departmentId: "aigc", departmentName: "AIGC", roleTitle: "质量检查", load: 58, skills: ["质量检查"], tone: "purple" },
    { id: "threeD-damu", name: "大牧", avatar: "牧", departmentId: "threeD", departmentName: "三维动画", roleTitle: "绑定 / 动画", load: 88, skills: ["绑定"], tone: "blue" },
    { id: "threeD-xiaobai", name: "小白", avatar: "白", departmentId: "threeD", departmentName: "三维动画", roleTitle: "场景 / 渲染", load: 67, skills: ["渲染"], tone: "blue" },
    { id: "post-anqi", name: "后期安琪", avatar: "安", departmentId: "post", departmentName: "后期合成", roleTitle: "合成 / 包装", load: 62, skills: ["合成"], tone: "orange" }
  ];
  const permissions = inferPermissions(store.currentUser || {});
  if (permissions.scope.type === "self") {
    return {
      permissions,
      departments: [],
      people: [],
      workItems: [],
      availability: [],
      candidates: [],
      range: {
        startDate: "2026/05/10",
        endDate: "2026/06/21"
      }
    };
  }
  return {
    permissions,
    departments,
    people,
    workItems: [
      { id: "w-1", personId: "pm-luosen", title: "需求协调", project: "上线活动长图", startDate: "2026/05/12", endDate: "2026/05/18", status: "normal" },
      { id: "w-1", personId: "pm-luosen", title: "需求协调", project: "上线活动长图", startDate: "2026/05/12", endDate: "2026/05/18", status: "normal" },
      { id: "w-2", personId: "pm-luosen", title: "交付跟进", project: "上线活动长图", startDate: "2026/05/29", endDate: "2026/06/05", status: "normal" },
      { id: "w-3", personId: "design-zhumin", title: "主视觉复核", project: "上线活动长图", startDate: "2026/05/13", endDate: "2026/05/21", status: "danger" },
      { id: "w-4", personId: "design-zhumin", title: "角色调整", project: "品牌短片", startDate: "2026/05/23", endDate: "2026/05/29", status: "danger" },
      { id: "w-5", personId: "design-zhumin", title: "素材复核", project: "上线活动长图", startDate: "2026/06/04", endDate: "2026/06/14", status: "danger" },
      { id: "w-6", personId: "design-ui-a", title: "活动 UI", project: "活动页", startDate: "2026/05/15", endDate: "2026/05/18", status: "normal" },
      { id: "w-7", personId: "design-ui-a", title: "动效优化", project: "活动页", startDate: "2026/05/26", endDate: "2026/06/02", status: "normal" },
      { id: "w-8", personId: "design-ui-a", title: "资源切图", project: "活动页", startDate: "2026/06/08", endDate: "2026/06/13", status: "normal" },
      { id: "w-9", personId: "design-icon-b", title: "图标资源", project: "图标包", startDate: "2026/05/18", endDate: "2026/05/23", status: "normal" },
      { id: "w-10", personId: "design-icon-b", title: "图标包", project: "图标包", startDate: "2026/06/06", endDate: "2026/06/12", status: "normal" },
      { id: "w-11", personId: "design-lili", title: "KV 设计", project: "品牌", startDate: "2026/05/18", endDate: "2026/05/22", status: "warning" },
      { id: "w-12", personId: "design-lili", title: "海报延展", project: "品牌", startDate: "2026/05/30", endDate: "2026/06/08", status: "warning" },
      { id: "w-13", personId: "aigc-xiaoyu", title: "素材生成", project: "AIGC", startDate: "2026/05/15", endDate: "2026/05/22", status: "danger" },
      { id: "w-14", personId: "aigc-xiaoyu", title: "效果复核", project: "AIGC", startDate: "2026/05/29", endDate: "2026/06/06", status: "danger" },
      { id: "w-15", personId: "aigc-wuming", title: "提示词库", project: "AIGC", startDate: "2026/05/16", endDate: "2026/05/19", status: "normal" },
      { id: "w-16", personId: "threeD-damu", title: "骨骼绑定", project: "三维动画", startDate: "2026/05/14", endDate: "2026/05/23", status: "warning" },
      { id: "w-17", personId: "threeD-xiaobai", title: "场景搭建", project: "三维动画", startDate: "2026/05/15", endDate: "2026/05/18", status: "normal" },
      { id: "w-18", personId: "post-anqi", title: "片头合成", project: "后期合成", startDate: "2026/05/12", endDate: "2026/05/18", status: "normal" }
    ],
    availability: [
      { id: "a-1", personId: "design-ui-a", startDate: "2026/05/18", endDate: "2026/05/23", label: "可接活" },
      { id: "a-1", personId: "design-ui-a", startDate: "2026/05/18", endDate: "2026/05/23", label: "可接活" },
      { id: "a-2", personId: "design-icon-b", startDate: "2026/05/24", endDate: "2026/05/31", label: "可支援" },
      { id: "a-3", personId: "design-anqi", startDate: "2026/05/18", endDate: "2026/06/02", label: "空闲" },
      { id: "a-4", personId: "aigc-wuming", startDate: "2026/05/24", endDate: "2026/05/26", label: "可复核" },
      { id: "a-5", personId: "threeD-xiaobai", startDate: "2026/05/25", endDate: "2026/05/31", label: "可接单" }
    ],
    candidates: [
      {
        personId: "design-ui-a",
        name: "UI 设计 A",
        name: "UI 设计 A",
        departmentId: "design",
        departmentName: "美术设计",
        departmentName: "美术设计",
        loadAfter: 76,
        conflictCount: 0,
        reason: "连续 3 天空闲 · UI 匹配",
        reason: "连续 3 天空闲 · UI 匹配",
        reasons: ["连续 3 天可安排", "技能匹配 UI / 活动页", "同时间无冲突"],
        tone: "green"
      },
      {
        personId: "design-icon-b",
        name: "图标设计 B",
        name: "图标设计 B",
        departmentId: "design",
        departmentName: "美术设计",
        departmentName: "美术设计",
        loadAfter: 72,
        conflictCount: 0,
        reason: "图标匹配 · 可支援",
        reason: "图标匹配 · 可支援",
        reasons: ["负载 64%", "适合图标资源切图", "可作为备选"],
        tone: "blue"
      },
      {
        personId: "design-anqi",
        name: "安琪",
        name: "安琪",
        avatar: "安",
        departmentName: "美术设计",
        departmentName: "美术设计",
        loadAfter: 62,
        conflictCount: 0,
        reason: "负载低 · 技能部分匹配",
        reason: "负载低 · 技能部分匹配",
        reasons: ["负载低", "可承接合成类资源", "需要 UI 复核"],
        tone: "orange"
      },
      {
        personId: "design-zhumin",
        name: "朱敏",
        name: "朱敏",
        avatar: "朱",
        departmentName: "美术设计",
        departmentName: "美术设计",
        loadAfter: 132,
        conflictCount: 3,
        reason: "冲突高 · 不建议",
        reason: "冲突高 · 不建议",
        reasons: ["当前 118%", "已有 3 个高优任务", "需要二次确认"],
        conflictTasks: ["主视觉复核", "角色调整", "素材复核"]
      }
    ],
    range: {
      startDate: "2026/05/10",
      endDate: "2026/06/21"
    }
  };
}

watch(
  () => store.currentUser?.id,
  () => {
    if (!hasRemotePermissions.value) {
      resourceState.permissions = inferPermissions(store.currentUser || {});
    }
    applyLocalWorkspaceSnapshot();
    applyScopeToResourceState();
    ensureAllowedView();
  }
);

watch(
  () => [
    store.activeProjectId,
    store.scheduleUi?.localRevision,
    store.activeProject?.tasks?.length,
    store.schedulePlan?.items?.length
  ],
  () => {
    if (!offlineResourceMode.value && hasRemotePermissions.value) return;
    applyLocalWorkspaceSnapshot();
    applyScopeToResourceState();
    ensureAllowedView();
  },
  { deep: false }
);

watch(candidates, (next) => {
  if (!next.some((candidate) => candidate.personId === selectedCandidateId.value)) {
    selectedCandidateId.value = bestCandidate.value?.personId || "";
  }
});

onMounted(loadResourceState);
</script>

<template>
  <section class="resource-workbench animate__animated animate__fadeIn" aria-label="资源模块">
    <ResourceSidebar
      :views="views"
      :active-view="activeView"
      :departments="sidebarVisibleDepartments"
      :people="sidebarVisiblePeople"
      :selected-department-id="selectedDepartmentId"
      :selected-person-id="selectedPersonId"
      :permissions="resourceState.permissions"
      :stats="stats"
      :search-query="sidebarSearchQuery"
      @select-view="selectView"
      @select-department="selectDepartment"
      @select-person="selectPerson"
      @contextmenu="openTimelineContextMenu"
      @update-search="sidebarSearchQuery = $event"
    />

    <main class="resource-main">
      <ResourceToolbar
        :active-view="activeView"
        :mode="mode"
        :query="toolbarQuery"
        :permissions="resourceState.permissions"
        :stats="stats"
        :active-stats-filter="statsFilter"
        :selected-person="selectedPerson"
        :active-department="activeDepartment"
        :completion="completion"
        @set-mode="setMode"
        @set-stats-filter="setStatsFilter"
        @update-query="toolbarQuery = $event"
        @open-assignment="openAssignment"
        @clear-completion="clearCompletion"
      />

      <p v-if="loadError" class="resource-load-note">{{ loadError }}</p>
      <p v-if="loading" class="resource-loading-note">正在加载资源数据...</p>
      <p v-if="loading" class="resource-loading-note">正在加载资源数据...</p>
      <div class="resource-content-grid" :class="{ 'has-panel': Boolean(selectedPerson) && mode !== 'node' }">
        <ResourceNodeView
          v-if="mode === 'node'"
          :people="visiblePeople"
          :work-items="visibleWorkItems"
          :selected-person-id="selectedPersonId"
          :recommendation="nodeRecommendation"
          :permissions="resourceState.permissions"
          @select-person="selectPerson"
          @select-work-item="selectWorkItem"
          @open-assignment="openAssignment"
          @contextmenu="openTimelineContextMenu"
          @reschedule-work-item="rescheduleWorkItem"
        />
        <ResourceTimeline
          v-else
          :people="visiblePeople"
          :departments="visibleDepartments"
          :work-items="visibleWorkItems"
          :availability="visibleAvailability"
          :selected-person-id="selectedPersonId"
          :selected-work-item-id="selectedWorkItemId"
          :active-view="activeView"
          :mode="mode"
          :range="resourceState.range"
          :viewport-command="timelineViewport"
          :timeline-viewport="timelineViewport"
          :can-reschedule="resourceState.permissions.canAssignTask || resourceState.permissions.canTransferConflictTask"
          @select-person="selectPerson"
          @select-work-item="selectWorkItem"
          @open-assignment="openAssignment"
          @contextmenu="openTimelineContextMenu"
          @reschedule-work-item="rescheduleWorkItem"
        />

        <ResourcePersonPanel
          v-if="selectedPerson && mode !== 'node'"
          :person="selectedPerson"
          :work-items="visibleWorkItems"
          :availability="visibleAvailability"
          :suggestions="panelSuggestions"
          :can-assign="resourceState.permissions.canCreateAssignmentPreview"
          :can-care="canTogglePersonCare(selectedPerson)"
          :is-care="isPersonCare(selectedPerson)"
          :completion="completion"
          @close="selectedPersonId = ''"
          @open-assignment="openAssignment"
          @request-alternative="handleRequestAlternative"
          @toggle-care="togglePersonCare"
        />
      </div>
    </main>

    <ResourceAssignmentDrawer
      :open="assignmentOpen"
      :draft="assignmentDraft"
      :departments="visibleDepartments"
      :candidates="candidates"
      :selected-candidate-id="selectedCandidateId"
      :completion="completion"
      :permissions="resourceState.permissions"
      @close="assignmentOpen = false"
      @update-draft="updateAssignmentDraft"
      @search-candidates="searchCandidates"
      @select-candidate="selectedCandidateId = $event"
      @submit-assignment="submitAssignment"
      @reset-completion="resetCompletion"
    />

    <ResourceAiAdvisorDrawer
      :open="aiAdvisorOpen"
      :loading="aiAdvisorLoading"
      :error="aiAdvisorError"
      :advice="aiAdvisorAdvice"
      :draft="assignmentDraft"
      :candidates="candidates"
      :selected-person="selectedPerson"
      :work-items="visibleWorkItems"
      :permissions="resourceState.permissions"
      @close="closeAiAdvisor"
      @refresh="analyzeAssignmentAdvice"
      @apply-candidate="applyAdvisorCandidate"
      @open-assignment="handleAdvisorOpenAssignment"
    />

    <ResourceOverloadConfirmDialog
      :open="overloadOpen"
      :candidate="overloadCandidate"
      :assignment="assignmentDraft"
      :alternative="alternativeCandidate"
      :can-force="resourceState.permissions.canForceAssignOverload"
      @cancel="overloadOpen = false"
      @use-alternative="useAlternativeCandidate"
      @force="forceAssignment"
    />

    <div v-if="contextMenu.open" class="resource-context-scrim" @click="closeContextMenu"></div>
    <div
      v-if="contextMenu.open"
      class="resource-context-menu"
      :style="contextMenuStyle"
      role="menu"
      :aria-label="contextMenuAriaLabel"
      @contextmenu.prevent
    >
      <div class="resource-context-menu-head">
        <strong>{{ contextMenuTitle }}</strong>
        <span>{{ contextMenuSubtitle }}</span>
      </div>
      <template v-if="isTimelineBlankContextMenu">
        <button type="button" role="menuitem" @click="handleContextMenuAction('today')">回到今天</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('today')">回到今天</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('zoom-in')">放大时间线</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('zoom-out')">缩小时间线</button>
        <button type="button" role="menuitem" :disabled="!resourceState.permissions.canCreateAssignmentPreview" @click="handleContextMenuAction('assignment')">打开分配推荐</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('sync-check')">检查资源同步</button>
      </template>
      <template v-else-if="isDepartmentContextMenu">
        <button type="button" role="menuitem" @click="handleContextMenuAction('department')">查看部门资源</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('department')">查看部门资源</button>
        <button type="button" role="menuitem" :disabled="!resourceState.permissions.canCreateAssignmentPreview" @click="handleContextMenuAction('assignment')">按部门新建任务</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('ai-advice')">生成部门建议</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('sync-check')">检查部门同步</button>
      </template>
      <template v-else-if="isPersonContextMenu">
        <button type="button" role="menuitem" @click="handleContextMenuAction('person')">查看人员详情</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('person')">查看人员详情</button>
        <button type="button" role="menuitem" :disabled="!resourceState.permissions.canCreateAssignmentPreview" @click="handleContextMenuAction('assignment')">安排人员任务</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('ai-advice')">生成人员建议</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('sync-check')">检查人员同步</button>
      </template>
      <template v-else>
        <button type="button" role="menuitem" @click="handleContextMenuAction('detail')">查看任务详情</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('detail')">查看任务详情</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('person')">查看人员详情</button>
        <button type="button" role="menuitem" :disabled="!resourceState.permissions.canCreateAssignmentPreview" @click="handleContextMenuAction('assignment')">打开分配推荐</button>
        <button type="button" role="menuitem" @click="handleContextMenuAction('sync')">同步任务 / 排期</button>
      </template>
    </div>
  </section>
</template>






