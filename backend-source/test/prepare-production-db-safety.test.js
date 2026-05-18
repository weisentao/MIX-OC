import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const scriptPath = "scripts/prepare-production-db.mjs";

async function loadPrepareModule() {
  const text = await readFile(scriptPath, "utf8");
  assert.match(text, /export function shouldResetBusinessData/);
  assert.match(text, /import\.meta\.url/);
  assert.match(text, /pathToFileURL\(process\.argv\[1\]\)\.href/);

  return import(`${pathToFileURL(scriptPath).href}?test=${Date.now()}`);
}

test("prepare production db does not reset business data by default", async () => {
  const { shouldResetBusinessData } = await loadPrepareModule();

  assert.equal(shouldResetBusinessData([]), false);
});

test("prepare production db does not reset business data with only the reset flag", async () => {
  const { shouldResetBusinessData } = await loadPrepareModule();

  assert.equal(shouldResetBusinessData(["--reset-business-data"]), false);
});

test("prepare production db resets business data only with both dangerous confirmations", async () => {
  const { shouldResetBusinessData } = await loadPrepareModule();

  assert.equal(
    shouldResetBusinessData(["--reset-business-data", "--confirm-reset-business-data"]),
    true
  );
});

test("prepare production db gates clearBusinessData behind the reset helper", async () => {
  const text = await readFile(scriptPath, "utf8");

  assert.doesNotMatch(text, /\n\s*await clearBusinessData\(conn\);\n\s*await seedRoles/);
  assert.match(text, /if \(shouldResetBusinessData\(process\.argv\.slice\(2\)\)\) \{\s*await clearBusinessData\(conn\);/s);
});

test("prepare production db does not delete individual real users in normal mode", async () => {
  const text = await readFile(scriptPath, "utf8");

  assert.doesNotMatch(text, /DELETE\s+FROM\s+users\s+WHERE\s+username\s*=\s*['"]MIX-yanyunxue['"]/i);
});

test("prepare production db preserves existing real-user fields and primary role assignments", async () => {
  const text = await readFile(scriptPath, "utf8");
  const seedUserStart = text.indexOf("async function seedUser");
  const seedUserEnd = text.indexOf("async function clearBusinessData");
  assert.ok(seedUserStart >= 0 && seedUserEnd > seedUserStart, "seedUser should exist");

  const seedUserSource = text.slice(seedUserStart, seedUserEnd);

  assert.match(seedUserSource, /user\.primaryDepartment/);
  assert.match(seedUserSource, /WHERE NOT EXISTS\s*\(\s*SELECT 1 FROM user_roles/is);
  assert.doesNotMatch(seedUserSource, /password_hash\s*=\s*VALUES\(password_hash\)/i);
  assert.doesNotMatch(seedUserSource, /\brole\s*=\s*VALUES\(role\)/i);
  assert.doesNotMatch(seedUserSource, /department\s*=\s*VALUES\(department\)/i);
  assert.doesNotMatch(seedUserSource, /display_name\s*=\s*VALUES\(display_name\)/i);
  assert.doesNotMatch(seedUserSource, /department_name\s*=\s*VALUES\(department_name\)/i);
});

test("prepare production db preserves existing department identity and order", async () => {
  const text = await readFile(scriptPath, "utf8");
  const seedDepartmentStart = text.indexOf("async function seedDepartments");
  const seedDepartmentEnd = text.indexOf("async function seedUser");
  assert.ok(seedDepartmentStart >= 0 && seedDepartmentEnd > seedDepartmentStart, "seedDepartments should exist");

  const seedDepartmentSource = text.slice(seedDepartmentStart, seedDepartmentEnd);

  assert.doesNotMatch(seedDepartmentSource, /department_uid\s*=\s*VALUES\(department_uid\)/i);
  assert.doesNotMatch(seedDepartmentSource, /sort_order\s*=\s*VALUES\(sort_order\)/i);
});

test("prepare production db gives distinct stable uids to Chinese departments", async () => {
  const { stableUid } = await loadPrepareModule();

  const packageOne = stableUid("dept", "视效包装一部");
  const designTwo = stableUid("dept", "美术设计二部");

  assert.match(packageOne, /^dept-[a-f0-9]{12}$/);
  assert.match(designTwo, /^dept-[a-f0-9]{12}$/);
  assert.notEqual(packageOne, designTwo);
});
