import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("database registration synchronizes roles, address book, and department lookup", async () => {
  const source = await readFile("src/controllers/auth.controller.js", "utf8");
  const registerStart = source.indexOf("async function registerWithDb");
  const registerEnd = source.indexOf("async function registerWithMemory");
  assert.ok(registerStart >= 0 && registerEnd > registerStart, "registerWithDb should exist");

  const registerSource = source.slice(registerStart, registerEnd);

  assert.match(registerSource, /INSERT INTO users/i);
  assert.match(registerSource, /INSERT INTO user_roles/i);
  assert.match(registerSource, /INSERT INTO address_book/i);
  assert.match(source, /async function ensureRegistrationDepartment/i);
  assert.match(source, /SELECT[\s\S]*FROM departments[\s\S]*WHERE[\s\S]*name = \?/i);
  assert.match(registerSource, /ensureRegistrationDepartment\(conn,\s*value\.cleanDepartment,\s*departmentEn\)/);
  assert.match(registerSource, /ON DUPLICATE KEY UPDATE[\s\S]*display_name = VALUES\(display_name\)/i);
  assert.doesNotMatch(registerSource, /DELETE\s+FROM/i);
});

test("auth lookups resolve department uid from the primary department when legacy rows contain multiple departments", async () => {
  const source = await readFile("src/controllers/auth.controller.js", "utf8");

  assert.match(source, /SUBSTRING_INDEX\(u\.department,\s*' \/ ',\s*1\)/i);
});

test("registration can claim preseeded company accounts without downgrading their role", async () => {
  const source = await readFile("src/controllers/auth.controller.js", "utf8");
  const claimStart = source.indexOf("async function claimSeedUserRegistration");
  const claimEnd = source.indexOf("async function registerWithDb");
  assert.ok(claimStart >= 0 && claimEnd > claimStart, "claimSeedUserRegistration should exist");
  const claimSource = source.slice(claimStart, claimEnd);

  assert.match(claimSource, /role:\s*safeUser\.role \|\| existingRole/);
  assert.doesNotMatch(claimSource, /UPDATE users SET[\s\S]*role\s*=\s*\?/i);

  const registerStart = source.indexOf("async function registerWithDb");
  const registerEnd = source.indexOf("async function registerWithMemory");
  assert.ok(registerStart >= 0 && registerEnd > registerStart, "registerWithDb should exist");
  const registerSource = source.slice(registerStart, registerEnd);

  assert.match(registerSource, /isClaimableSeedUser\(exists\)/);
  assert.match(registerSource, /claimSeedUserRegistration/);
});

test("profile patch and care contact CRUD routes stay wired into auth and workspace services", async () => {
  const authSource = await readFile("src/routes/auth.routes.js", "utf8");
  const workspaceRoutesSource = await readFile("src/routes/workspace.routes.js", "utf8");
  const authControllerSource = await readFile("src/controllers/auth.controller.js", "utf8");
  const workspaceServiceSource = await readFile("src/services/workspace.service.js", "utf8");

  assert.match(authSource, /router\.patch\("\/me", authRequired, patchMe\)/);
  assert.match(authControllerSource, /export async function patchMe\(req, res\)/);
  assert.match(authControllerSource, /UPDATE address_book[\s\S]*SET email = \?, phone = \?/i);
  assert.match(workspaceRoutesSource, /router\.post\("\/workspace\/contacts", authRequired, postContact\)/);
  assert.match(workspaceRoutesSource, /router\.delete\("\/workspace\/contacts\/:contactId", authRequired, deleteContact\)/);
  assert.match(workspaceRoutesSource, /router\.get\("\/workspace\/contacts\/:contactId", authRequired, getContactById\)/);
  assert.match(workspaceServiceSource, /export async function addContact\(auth = \{\}, payload = \{\}\)/);
  assert.match(workspaceServiceSource, /export async function getContact\(auth = \{\}, value = "", query = \{\}\)/);
  assert.match(workspaceServiceSource, /export async function removeContact\(auth = \{\}, value = ""\)/);
  assert.match(workspaceServiceSource, /INSERT INTO contacts/i);
  assert.match(workspaceServiceSource, /String\(payload\.relationType \|\| "care"\)\.trim\(\)\.toLowerCase\(\) \|\| "care"/);
  assert.match(workspaceServiceSource, /query\.q \|\| query\.keyword \|\| query\.search/);
  assert.match(workspaceServiceSource, /query\.departmentId \|\| query\.department_id \|\| query\.department/);
  assert.match(workspaceServiceSource, /profileNote:/);
  assert.match(workspaceServiceSource, /UPDATE contacts[\s\S]*status = 'archived'/i);
});
