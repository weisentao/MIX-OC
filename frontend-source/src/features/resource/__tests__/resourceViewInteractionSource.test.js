import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("resource assignment interaction source", () => {
  it("keeps applied candidates clickable through to confirmAssignment", async () => {
    const resourceView = await source("../components/ResourceView.vue");
    const assignmentDrawer = await source("../components/ResourceAssignmentDrawer.vue");

    assert.match(assignmentDrawer, /@click="emit\('submitAssignment', selectedCandidate\)"/);
    assert.match(
      resourceView,
      /selectedCandidateId\.value = candidate\.personId;[\s\S]*assignmentOpen\.value = true;[\s\S]*aiAdvisorOpen\.value = false;/
    );
    assert.match(resourceView, /function submitAssignment\(candidatePayload = null\)/);
    assert.match(resourceView, /const candidate = normalizeSubmittedCandidate\(candidatePayload\)/);
    assert.match(resourceView, /function normalizeSubmittedCandidate\(candidatePayload = null\)/);
    assert.match(resourceView, /confirmAssignment\(candidate, \{ forced: false \}\)/);
  });

  it("sends the active project id when confirming a new assignment", async () => {
    const resourceView = await source("../components/ResourceView.vue");

    assert.match(resourceView, /function currentAssignmentProjectId\(\)/);
    assert.match(resourceView, /store\.activeProject\?\.projectId/);
    assert.match(resourceView, /store\.activeProjectId/);
    assert.match(resourceView, /function currentAssignmentProjectUid\(\)/);
    assert.match(resourceView, /function currentAssignmentProjectName\(\)/);
    assert.match(resourceView, /projectUid: currentAssignmentProjectUid\(\)/);
    assert.match(resourceView, /projectName: currentAssignmentProjectName\(\)/);
    assert.match(resourceView, /const draftPayload = buildAssignmentDraftPayload\(\)/);
    assert.match(resourceView, /buildAssignmentApiPayload\(draftPayload,/);
  });

  it("clears stale assignment sync links and preview context when opening a new assignment entry", async () => {
    const resourceView = await source("../components/ResourceView.vue");

    assert.match(resourceView, /function clearAssignmentSyncContext\(\)/);
    assert.match(resourceView, /assignmentPreview\.value = null;/);
    assert.match(resourceView, /assignmentDraft\.workItemId = ""/);
    assert.match(resourceView, /assignmentDraft\.itemId = ""/);
    assert.match(resourceView, /assignmentDraft\.scheduleItemId = ""/);
    assert.match(resourceView, /assignmentDraft\.taskId = ""/);
    assert.match(resourceView, /assignmentDraft\.taskUid = ""/);
    assert.match(
      resourceView,
      /function openAssignment\(payload = \{\}\) \{[\s\S]*clearAssignmentSyncContext\(\);[\s\S]*if \(payload\.workItem\) \{[\s\S]*Object\.assign\(assignmentDraft, buildAssignmentDraftPatchFromWorkItem\(payload\.workItem\)\);/
    );
  });

  it("seeds generic assignment entries from a backend-backed work item before confirm", async () => {
    const resourceView = await source("../components/ResourceView.vue");

    assert.match(resourceView, /function findDefaultAssignmentWorkItem\(\)/);
    assert.match(resourceView, /function applyDefaultAssignmentDraft\(\)/);
    assert.match(resourceView, /if \(!payload\.workItem\) applyDefaultAssignmentDraft\(\);/);
    assert.match(resourceView, /buildAssignmentDraftPatchFromWorkItem\(defaultWorkItem\)/);
    assert.match(resourceView, /item\.projectId \|\| item\.taskId \|\| item\.taskUid \|\| item\.workItemId/);
  });

  it("surfaces backend failure details for confirm and schedule sync flows", async () => {
    const resourceView = await source("../components/ResourceView.vue");

    assert.match(resourceView, /formatResourceApiFeedback/);
    assert.match(resourceView, /store\.showToast\?\.\(formatResourceApiFeedback\(result,/);
    assert.match(resourceView, /store\.showToast\?\.\(formatResourceApiFeedback\(error,/);
    assert.match(resourceView, /const backendSync = await syncResourceBackendSchedule\(item, nextRange, "schedule", options\)/);
    assert.match(resourceView, /if \(!backendSync\.ok\) \{[\s\S]*store\.showToast\?\.\(backendSync\.message\)/);
    assert.match(resourceView, /return \{\s*ok: false,/);
  });

  it("keeps AI apply and confirm payloads aligned with backend assignment contracts", async () => {
    const resourceView = await source("../components/ResourceView.vue");
    const resourceModel = await source("../resourceModel.js");

    assert.match(resourceModel, /"personId"/);
    assert.match(resourceModel, /"userId"/);
    assert.match(resourceModel, /"taskDraft"/);
    assert.match(resourceModel, /"workItem"/);
    assert.match(resourceModel, /"scheduleItem"/);
    assert.match(resourceModel, /"task"/);
    assert.match(resourceView, /function buildAssignmentApiExtras/);
    assert.match(resourceView, /buildAssignmentApiPayload\(draftPayload,\s*buildAssignmentApiExtras\(candidate,/);
    assert.match(resourceView, /personId:\s*candidate\.personId/);
    assert.match(resourceView, /userId:\s*candidate\.personId/);
    assert.match(resourceView, /taskDraft:\s*draftPayload/);
    assert.match(resourceView, /workItem:\s*buildAssignmentWorkItemPayload\(draftPayload\)/);
    assert.match(resourceView, /await refreshResourceSnapshotsAfterAssignment\(\)/);
  });

  it("applies AI suggestion candidates through the same backend confirmation path", async () => {
    const resourceView = await source("../components/ResourceView.vue");
    const advisorDrawer = await source("../components/ResourceAiAdvisorDrawer.vue");

    assert.match(advisorDrawer, /@click="applyCandidate\(candidate\)"/);
    assert.match(resourceView, /async function applyAdvisorCandidate\(candidateOrId\)/);
    assert.match(resourceView, /await resourceApi\.previewAssignment\(/);
    assert.match(resourceView, /return submitAssignment\(candidate\)/);
    assert.doesNotMatch(resourceView, /store\.showToast\?\.\("已切换候选人，预览接口暂不可用"\)/);
  });

  it("wires the person-panel care button through workspace contacts", async () => {
    const resourceView = await source("../components/ResourceView.vue");
    const personPanel = await source("../components/ResourcePersonPanel.vue");

    assert.match(personPanel, /canCare/);
    assert.match(personPanel, /isCare/);
    assert.match(personPanel, /@click="emit\('toggleCare', person\)"/);
    assert.match(personPanel, /\{\{ isCare \? "取消关心" : "关心" \}\}/);
    assert.match(resourceView, /function togglePersonCare\(person = \{\}\)/);
    assert.match(resourceView, /store\.isCareContact/);
    assert.match(resourceView, /store\.toggleCareContact/);
    assert.match(resourceView, /store\.getUser\(person\.userId\)/);
    assert.match(resourceView, /@toggle-care="togglePersonCare"/);
  });

  it("keeps permission 403 distinct from login expiry and avoids stale resource overwrites", async () => {
    const resourceView = await source("../components/ResourceView.vue");

    assert.match(resourceView, /resourceApi\.getResources\(\{\s*status: "active",\s*cacheBust: Date\.now\(\)\s*\}\)/);
    assert.match(resourceView, /cacheBust: Date\.now\(\),[\s\S]*startDate: resourceState\.range\?\.startDate/);
    assert.match(resourceView, /if \(!isAuthApiError\(error\)\) return false;[\s\S]*if \(isLoginExpiredApiError\(error\)\) handleWorkspaceAuthFailure\(store, error\);/);
    assert.match(resourceView, /if \(workItems && \(workItems\.length \|\| !resourceState\.workItems\.length\)\) resourceState\.workItems = workItems\.map\(normalizeWorkItem\);/);
  });

  it("keeps authorized user-only resource scopes from being cleared as empty project scopes", async () => {
    const resourceView = await source("../components/ResourceView.vue");

    assert.match(resourceView, /scopeTypeValue === "project"\s*\?\s*localAuthorizedProjectIds\(\)\s*:\s*scope\.projectIds/);
    assert.doesNotMatch(resourceView, /\["project", "authorized"\]\.includes\(scopeTypeValue\)[\s\S]*localAuthorizedProjectIds\(\)/);
    assert.match(resourceView, /if \(scope\.type === "project"\) \{[\s\S]*if \(!allowedProjects\.size\) \{[\s\S]*clearScopedResourceData\(\);/);
    assert.match(resourceView, /if \(scope\.type === "authorized"\) \{[\s\S]*const allowedUsers = new Set\(scope\.userIds\);[\s\S]*if \(!allowedUsers\.size && !allowedProjects\.size\) \{/);
  });
});
