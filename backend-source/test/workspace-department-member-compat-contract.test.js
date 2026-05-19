import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  DEPARTMENT_CANONICAL_KEYS,
  departmentSortValue,
  getDepartmentTaxonomy,
  resolveDepartmentFilterValues,
  resolveDepartmentMeta
} from "../src/utils/department-taxonomy.js";

function sliceFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} should exist`);
  const end = nextSignature ? source.indexOf(nextSignature, start) : source.length;
  assert.notEqual(end, -1, `${nextSignature} should follow ${signature}`);
  return source.slice(start, end);
}

test("workspace department routes and list query keep stable compatibility order", async () => {
  const routes = await readFile("src/routes/workspace.routes.js", "utf8");
  const service = await readFile("src/services/workspace.service.js", "utf8");
  const listSource = sliceFunction(
    service,
    "export async function listDepartments()",
    "export async function listContacts(auth = {}, query = {})"
  );

  assert.ok(routes.includes(`router.get("/departments", authRequired, getDepartments)`));
  assert.ok(routes.includes(`router.get("/workspace/departments", authRequired, getDepartments)`));
  assert.match(listSource, /WHERE status = 'active'/);
  assert.match(listSource, /ORDER BY sort_order ASC, id ASC/);
  assert.match(listSource, /const mapped = rows\.map\(mapDepartment\)/);
  assert.match(listSource, /const pickedByRoot = new Map\(\)/);
  assert.match(listSource, /const canonical = \[\.\.\.pickedByRoot\.values\(\)\]\.sort/);
  assert.match(listSource, /return \[\.\.\.canonical, \.\.\.rest\]\.map/);
  assert.match(service, /function mapDepartment\(row\)/);
  assert.match(service, /departmentKey:/);
  assert.match(service, /departmentAliasKey:/);
  assert.match(service, /displayDepartment:/);
  assert.match(service, /departmentPath:/);
  assert.match(service, /parentDepartmentId:\s*row\.parent_department_uid \|\| ""/);
  assert.match(service, /managerUserId:\s*row\.manager_user_uid \|\| ""/);
});

test("department taxonomy keeps fixed root order and legacy alias mappings", () => {
  assert.deepEqual(DEPARTMENT_CANONICAL_KEYS, [
    "project-management",
    "aigc",
    "art-design",
    "three-dynamic",
    "motion-design",
    "visual-packaging"
  ]);

  const taxonomy = getDepartmentTaxonomy();
  assert.deepEqual(
    taxonomy.map((item) => item.key),
    DEPARTMENT_CANONICAL_KEYS
  );
  const visualPackaging = taxonomy.find((item) => item.key === "visual-packaging");
  assert.deepEqual(
    (visualPackaging?.children || []).map((item) => item.key),
    ["visual-packaging-1", "visual-packaging-2", "visual-packaging-3"]
  );

  const postCompositing = resolveDepartmentMeta("后期合成二部");
  assert.equal(postCompositing.departmentKey, "visual-packaging");
  assert.equal(postCompositing.childDepartmentKey, "visual-packaging-2");
  assert.equal(postCompositing.displayDepartment, "视效包装二部");
  assert.equal(postCompositing.departmentPath, "视效包装/视效包装二部");

  const threeDAnimation = resolveDepartmentMeta("三维动画设计部");
  assert.equal(threeDAnimation.departmentKey, "three-dynamic");
  assert.equal(threeDAnimation.childDepartmentKey, "");
  assert.equal(threeDAnimation.displayDepartment, "三维动态");
  assert.equal(threeDAnimation.departmentPath, "三维动态");

  const postCompositingFilterValues = resolveDepartmentFilterValues("后期合成二部");
  assert.ok(postCompositingFilterValues.includes("后期合成二部"));
  assert.ok(postCompositingFilterValues.includes("视效包装二部"));

  const threeDFilterValues = resolveDepartmentFilterValues("三维动画");
  assert.ok(threeDFilterValues.includes("三维动画"));
  assert.ok(threeDFilterValues.includes("三维动态"));

  assert.equal(departmentSortValue("后期合成二部"), departmentSortValue("视效包装二部"));
  assert.equal(departmentSortValue("三维动画"), departmentSortValue("三维动态"));
});

test("project member normalization prioritizes userId and keeps name fallback compatibility", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const normalizeMemberEntrySource = sliceFunction(
    source,
    "function normalizeMemberEntry(rawEntry, fallbackRole = \"readonly\") {",
    "function collectMemberEntries(payload = {}, fallbackRole = \"readonly\") {"
  );
  const collectMemberEntriesSource = sliceFunction(
    source,
    "function collectMemberEntries(payload = {}, fallbackRole = \"readonly\") {",
    "function collectGroupedMemberEntries(payload = {}) {"
  );

  assert.match(
    normalizeMemberEntrySource,
    /rawEntry\.userId \|\|[\s\S]*rawEntry\.userUid \|\|[\s\S]*rawEntry\.toUserId \|\|[\s\S]*rawEntry\.toUserUid \|\|[\s\S]*rawEntry\.username \|\|[\s\S]*rawEntry\.toUsername \|\|[\s\S]*rawEntry\.name \|\|[\s\S]*rawEntry\.memberName/
  );
  assert.match(
    normalizeMemberEntrySource,
    /const memberName = String\(rawEntry\.name \|\| rawEntry\.memberName \|\| identity\)\.trim\(\)/
  );
  assert.match(
    normalizeMemberEntrySource,
    /strictResolve:\s*Boolean\(rawEntry\.userId \|\| rawEntry\.userUid \|\| rawEntry\.toUserId \|\| rawEntry\.toUserUid \|\| rawEntry\.username \|\| rawEntry\.toUsername\)/
  );
  assert.match(
    normalizeMemberEntrySource,
    /const userUid = String\([\s\S]*rawEntry\.userId \|\|[\s\S]*rawEntry\.toUsername \|\|[\s\S]*""[\s\S]*\)\.trim\(\)/
  );
  assert.match(normalizeMemberEntrySource, /identity = String\(\s*userUid \|\|[\s\S]*rawEntry\.name \|\|[\s\S]*rawEntry\.memberName/);
  assert.match(normalizeMemberEntrySource, /userUid,/);
  assert.doesNotMatch(
    normalizeMemberEntrySource,
    /strictResolve:\s*Boolean\([^)]*rawEntry\.name/
  );

  const userIdOrderIndex = normalizeMemberEntrySource.indexOf("rawEntry.userId");
  const nameOrderIndex = normalizeMemberEntrySource.indexOf("rawEntry.name");
  assert.ok(userIdOrderIndex >= 0 && nameOrderIndex > userIdOrderIndex);

  assert.match(collectMemberEntriesSource, /payload\.members \?\? payload\.entries \?\? payload\.targets \?\? payload\.users \?\? \[\]/);
  assert.match(collectMemberEntriesSource, /filter\(\(item\) => item\.identity \|\| item\.memberName\)/);
});

test("project member payload keeps uid-first object contract while preserving legacy members array", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const mapProjectMemberSource = sliceFunction(
    source,
    "function mapProjectMember(row) {",
    "function toMemberArray(value) {"
  );
  const fetchProjectMembersSource = sliceFunction(
    source,
    "async function fetchProjectMembers(projectUids = []) {",
    "async function fetchProjectTagRows(projectUids = []) {"
  );
  const mapProjectSource = sliceFunction(
    source,
    "function mapProject(row, tasks = [], members = [], tags = []) {",
    "function mapBootstrapUser(row = {}) {"
  );

  for (const field of ["userId", "userUid", "name", "role", "departmentKey", "displayDepartment"]) {
    assert.match(mapProjectMemberSource, new RegExp(`${field}:`), `mapProjectMember should expose ${field}`);
  }
  assert.match(mapProjectMemberSource, /memberName[:,]/, "mapProjectMember should expose memberName");
  assert.match(fetchProjectMembersSource, /SELECT[\s\S]*user_uid[\s\S]*member_name[\s\S]*member_role[\s\S]*department/);
  assert.match(mapProjectSource, /const memberItems = members\.map\(\(member\) => mapProjectMember\(member\)\)/);
  assert.match(mapProjectSource, /members:\s*memberNames,/);
  assert.match(mapProjectSource, /memberItems,/);
  assert.match(mapProjectSource, /memberObjects:\s*memberItems,/);
});
