import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("team17 workspace routes expose contacts and project member share contracts", async () => {
  const routes = await readFile("src/routes/workspace.routes.js", "utf8");
  const controller = await readFile("src/controllers/workspace.controller.js", "utf8");

  for (const path of [
    `router.get("/workspace/contacts", authRequired, getContacts)`,
    `router.get("/workspace/contacts/:contactId", authRequired, getContactById)`,
    `router.post("/workspace/contacts", authRequired, postContact)`,
    `router.delete("/workspace/contacts/:contactId", authRequired, deleteContact)`,
    `router.get("/workspace/projects/:projectId/members", authRequired, getProjectMembers)`,
    `router.post("/workspace/projects/:projectId/members", authRequired, postProjectMembers)`,
    `router.delete("/workspace/projects/:projectId/members", authRequired, deleteProjectMembers)`,
    `router.put("/workspace/projects/:projectId/members/groups", authRequired, putProjectMemberGroups)`,
    `router.get("/workspace/projects/:projectId/shares", authRequired, getProjectShares)`,
    `router.post("/workspace/projects/:projectId/shares", authRequired, postProjectShare)`
  ]) {
    assert.ok(routes.includes(path), `workspace routes should include ${path}`);
  }

  assert.match(controller, /const created = await addContact\(req\.auth \|\| \{\}, req\.body \|\| \{\}\)/);
  assert.match(controller, /const item = await getContact\(req\.auth \|\| \{\}, req\.params\.contactId \|\| "", req\.query \|\| \{\}\)/);
  assert.match(controller, /res\.status\(201\)\.json\(created\)/);
  assert.match(controller, /const created = await shareProject\(req\.params\.projectId, req\.body \|\| \{\}, req\.auth \|\| \{\}\)/);
  assert.match(controller, /const items = await listProjectMembers\(req\.params\.projectId, req\.auth \|\| \{\}\)/);
  assert.match(controller, /const data = await addProjectMembers\(req\.params\.projectId, req\.body \|\| \{\}, req\.auth \|\| \{\}\)/);
  assert.match(controller, /const data = await removeProjectMembers\(req\.params\.projectId, req\.body \|\| \{\}, req\.auth \|\| \{\}\)/);
  assert.match(controller, /const data = await setProjectMemberGroups\(req\.params\.projectId, req\.body \|\| \{\}, req\.auth \|\| \{\}\)/);
});

test("team17 contact service persists care relation and supports backend contact-id removal", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const start = source.indexOf("export async function addContact(");
  const end = source.indexOf("export async function listProjectMembers(", start);
  assert.notEqual(start, -1, "addContact should exist");
  assert.notEqual(end, -1, "listProjectMembers should follow contact helpers");
  const contactSource = source.slice(start, end);

  assert.match(contactSource, /payload\.relationType \|\| "care"/);
  assert.match(contactSource, /ON DUPLICATE KEY UPDATE/);
  assert.match(contactSource, /if \(targetUser\.user_uid === ownerUserUid\) throw badRequest/);
  assert.match(contactSource, /WHERE owner_user_uid = \? AND \(target_user_uid = \? OR contact_uid = \?\) AND status = 'active'/);
  assert.match(contactSource, /return mapAddressBookEntry\(rows\[0\] \|\| \{\}\)/);
  assert.match(contactSource, /export async function getContact\(auth = \{\}, value = "", query = \{\}\)/);
  assert.match(contactSource, /if \(!rows\.length\) throw notFound\("联系人不存在"\)/);
});

test("team17 contact list contract supports department and keyword search with stable contact profile fields", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const listStart = source.indexOf("export async function listContacts(");
  const listEnd = source.indexOf("export async function addContact(", listStart);
  assert.notEqual(listStart, -1, "listContacts should exist");
  assert.notEqual(listEnd, -1, "addContact should follow listContacts");
  const listSource = source.slice(listStart, listEnd);

  assert.match(listSource, /const keyword = String\(query\.q \|\| query\.keyword \|\| query\.search \|\| ""\)\.trim\(\)/);
  assert.match(listSource, /const departmentId = String\(query\.departmentId \|\| query\.department_id \|\| query\.department \|\| ""\)\.trim\(\)/);
  assert.match(listSource, /const limit = Math\.min\(Math\.max\(Number\(query\.limit \|\| 100\), 1\), 200\)/);
  assert.match(listSource, /const offset = Math\.max\(Number\(query\.offset \|\| 0\), 0\)/);
  assert.match(listSource, /ab\.department_uid = \? OR ab\.department_name = \? OR u\.department = \?/);
  assert.match(listSource, /display_name LIKE \?/);
  assert.match(listSource, /ORDER BY department_name ASC, display_name ASC, c\.id ASC/);
  assert.match(source, /function mapContactProfile\(row = \{\}\)/);
  assert.match(source, /departmentName:/);
  assert.match(source, /departmentPath:/);
  assert.match(source, /profileNote:/);
  assert.match(source, /characterLabel:/);
  assert.match(source, /avatarImage:/);
});

test("team17 project sharing currently accepts one target and upserts project membership", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const start = source.indexOf("export async function shareProject(");
  const end = source.indexOf("export async function listProjectShares(", start);
  assert.notEqual(start, -1, "shareProject should exist");
  assert.notEqual(end, -1, "listProjectShares should follow shareProject");
  const shareSource = source.slice(start, end);

  assert.match(shareSource, /payload\.toUserId \|\| payload\.toUserUid \|\| payload\.username \|\| payload\.toUsername/);
  assert.match(shareSource, /if \(!targetValue\) throw badRequest/);
  assert.match(shareSource, /await upsertProjectMemberFromUser\(project\.project_uid, targetUser, memberRole, fromUserUid\)/);
  assert.doesNotMatch(shareSource, /for\s*\(\s*const\s+.*(?:targets|entries|members)/);
});

test("team17 project member APIs support batch add/remove and grouped role assignment", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");

  assert.match(source, /export async function addProjectMembers\(projectId, payload = \{\}, auth = \{\}\)/);
  assert.match(source, /export async function removeProjectMembers\(projectId, payload = \{\}, auth = \{\}\)/);
  assert.match(source, /export async function setProjectMemberGroups\(projectId, payload = \{\}, auth = \{\}\)/);
  assert.match(source, /collectMemberEntries\(payload/);
  assert.match(source, /collectGroupedMemberEntries\(payload\)/);
  assert.match(source, /throw badRequest\("请至少提供一个成员"\)/);
  assert.match(source, /throw badRequest\("请至少提供一个权限分组成员"\)/);
  assert.match(source, /return \{\s*ok: true,[\s\S]*members: items,[\s\S]*items\s*\}/);
});
