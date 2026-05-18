import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_COMPANY_GROUP,
  DEFAULT_COMPANY_USER_PASSWORD,
  DEFAULT_COMPANY_USER_SOURCE,
  buildCompanyUserImportPlan,
  normalizeCompanyUsers,
  parseCompanyUserRecords,
  parseCompanyUsersMarkdown
} from "../scripts/import-company-users.mjs";

const sampleMarkdown = `
| 部门 | 账号 | 姓名 | 备注/花名 | 电脑标志 | 用户角色 |
|---|---|---|---|---|---|
| 视效包装二部 | MIX-zhengjianxing | 郑建兴 | 阿兴 | 有 | 管理员 |
| 美术设计一部 | MIX-yuanye | 袁也 |  | 有 | 管理员 |
| 美术设计二部 | MIX-yuanye | 袁也 |  | 有 | 管理员 |
| 三维动态设计部 | MIX-dingtao | 丁涛 |  | 无 | 普通用户 |
`;

test("parseCompanyUsersMarkdown parses company users, dedupes accounts, and preserves permission flags", () => {
  const users = parseCompanyUsersMarkdown(sampleMarkdown);

  assert.equal(users.length, 3);
  assert.equal(DEFAULT_COMPANY_USER_PASSWORD, "MIX801002");
  assert.equal(DEFAULT_COMPANY_GROUP, "MIX项目管理");

  const managerCandidate = users.find((user) => user.username === "MIX-zhengjianxing");
  assert.equal(managerCandidate.name, "郑建兴");
  assert.equal(managerCandidate.department, "视效包装二部");
  assert.equal(managerCandidate.job, "阿兴");
  assert.equal(managerCandidate.initialPassword, "MIX801002");
  assert.equal(managerCandidate.role, "manager");
  assert.equal(managerCandidate.managerCandidate, true);
  assert.equal(managerCandidate.adminGranted, false);
  assert.match(managerCandidate.profileNote, /权限预留/);
  assert.deepEqual(managerCandidate.computerFlags, ["有"]);
  assert.deepEqual(managerCandidate.sourceRoles, ["管理员"]);

  const duplicate = users.find((user) => user.username === "MIX-yuanye");
  assert.equal(duplicate.department, "美术设计一部 / 美术设计二部");
  assert.equal(duplicate.recordCount, 2);
  assert.match(duplicate.profileNote, /重复账号部门/);
  assert.equal(duplicate.payload.duplicateAccount, true);

  const employee = users.find((user) => user.username === "MIX-dingtao");
  assert.equal(employee.role, "employee");
  assert.equal(employee.managerCandidate, false);
});

test("real company markdown has expected production import shape", async () => {
  const markdown = await readFile(DEFAULT_COMPANY_USER_SOURCE, "utf8");
  const records = parseCompanyUserRecords(markdown);
  const users = normalizeCompanyUsers(records);

  assert.equal(records.length, 72);
  assert.equal(users.length, 71);
  assert.equal(users.filter((user) => user.role === "manager").length, 23);
  assert.equal(users.filter((user) => user.role === "employee").length, 48);
  assert.equal(new Set(records.map((record) => record.department)).size, 7);
  assert.equal(users.some((user) => user.role === "admin"), false);

  const duplicate = users.find((user) => user.username === "MIX-yuanye");
  assert.equal(duplicate.department, "美术设计一部 / 美术设计二部");
  assert.equal(duplicate.recordCount, 2);
});

test("buildCompanyUserImportPlan is additive and preserves existing org account classification", () => {
  const plan = buildCompanyUserImportPlan(parseCompanyUsersMarkdown(sampleMarkdown));
  const sqlText = plan.statements.map((statement) => statement.sql).join("\n");
  const roleParams = plan.statements.flatMap((statement) => statement.params || []);
  const duplicate = plan.users.find((user) => user.username === "MIX-yuanye");
  const duplicateUserStatement = plan.statements.find(
    (statement) => /INSERT INTO users/i.test(statement.sql) && statement.params?.[1] === duplicate.username
  );
  const duplicateAddressBookStatement = plan.statements.find(
    (statement) => /INSERT INTO address_book/i.test(statement.sql) && statement.params?.[2] === duplicate.username
  );

  assert.equal(plan.users.length, 3);
  assert.equal(plan.summary.managers, 2);
  assert.equal(plan.summary.employees, 1);
  assert.ok(plan.statements.some((statement) => /INSERT INTO departments/i.test(statement.sql)));
  assert.ok(plan.statements.some((statement) => /INSERT INTO users/i.test(statement.sql)));
  assert.ok(plan.statements.some((statement) => /INSERT INTO address_book/i.test(statement.sql)));
  assert.ok(plan.statements.some((statement) => /INSERT INTO user_roles/i.test(statement.sql)));
  assert.match(sqlText, /ON DUPLICATE KEY UPDATE/i);
  assert.match(sqlText, /company-member/);
  assert.match(sqlText, /WHERE NOT EXISTS/i);
  assert.ok(roleParams.includes("manager"));
  assert.ok(roleParams.includes("employee"));
  assert.equal(duplicateUserStatement.params[5], duplicate.primaryDepartment);
  assert.equal(duplicateUserStatement.params[6], duplicate.primaryDepartment);
  assert.equal(duplicateAddressBookStatement.params[4], duplicate.departmentUid);
  assert.equal(duplicateAddressBookStatement.params[5], duplicate.primaryDepartment);
  assert.doesNotMatch(sqlText, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sqlText, /\bDELETE\s+FROM\s+(projects|tasks|task_comments|boards|schedule_|templates|app_states|project_)/i);
  assert.doesNotMatch(sqlText, /\bDELETE\s+FROM\s+user_roles/i);
  assert.doesNotMatch(sqlText, /\bDELETE\s+FROM\s+users/i);
  assert.doesNotMatch(sqlText, /\bDELETE\s+FROM\s+address_book/i);
  assert.doesNotMatch(sqlText, /password_hash\s*=\s*VALUES\(password_hash\)/i);
  assert.doesNotMatch(sqlText, /\brole\s*=\s*VALUES\(role\)/i);
  assert.doesNotMatch(sqlText, /department\s*=\s*VALUES\(department\)/i);
  assert.doesNotMatch(sqlText, /role_key\s*=\s*['"]admin['"]/i);
});

test("import script documents the real markdown source and npm command", async () => {
  const script = await readFile("scripts/import-company-users.mjs", "utf8");
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(path.basename(DEFAULT_COMPANY_USER_SOURCE), "用户列表.md");
  assert.match(script, /文档/);
  assert.match(script, /用户列表\.md/);
  assert.equal(pkg.scripts?.["db:import:company-users"], "node scripts/import-company-users.mjs");
});

test("import-company-users module can be imported without running the real DB import", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "import './scripts/import-company-users.mjs'; console.log('import-ok');"],
    { cwd: process.cwd(), encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /import-ok/);
});
