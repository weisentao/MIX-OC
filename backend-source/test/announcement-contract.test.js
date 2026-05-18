import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { __private__ } from "../src/modules/admin/admin.service.js";

const adminRoutesSource = readFileSync(new URL("../src/modules/admin/admin.routes.js", import.meta.url), "utf8");
const adminControllerSource = readFileSync(new URL("../src/modules/admin/admin.controller.js", import.meta.url), "utf8");
const adminServiceSource = readFileSync(new URL("../src/modules/admin/admin.service.js", import.meta.url), "utf8");
const workspaceRoutesSource = readFileSync(new URL("../src/routes/workspace.routes.js", import.meta.url), "utf8");
const workspaceControllerSource = readFileSync(new URL("../src/controllers/workspace.controller.js", import.meta.url), "utf8");
const workspaceServiceSource = readFileSync(new URL("../src/services/workspace.service.js", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8");
const mysqlSource = readFileSync(new URL("../src/db/mysql.js", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../src/db/migrations/20260517_001_announcement_links.sql", import.meta.url),
  "utf8"
);
const adminManagerContractSource = readFileSync(
  new URL("../docs/admin-manager-api-contract.md", import.meta.url),
  "utf8"
);
const frontendContractSource = readFileSync(new URL("../docs/frontend-api-contract.md", import.meta.url), "utf8");

test("admin announcements expose full CRUD and carousel fields", () => {
  assert.match(adminRoutesSource, /router\.get\("\/admin\/notices", getNotices\)/);
  assert.match(adminRoutesSource, /router\.post\("\/admin\/notices", postNotice\)/);
  assert.match(adminRoutesSource, /router\.patch\("\/admin\/notices\/:noticeId", patchNotice\)/);
  assert.match(adminRoutesSource, /router\.delete\("\/admin\/notices\/:noticeId", removeNotice\)/);

  assert.match(adminControllerSource, /deleteAdminNotice/);
  assert.match(adminControllerSource, /export async function removeNotice/);
  assert.match(adminServiceSource, /export async function deleteAdminNotice/);

  for (const [column, typePattern] of [
    ["status", "VARCHAR"],
    ["priority", "INT"],
    ["link_text", "VARCHAR"],
    ["link_url", "VARCHAR"],
    ["link_target", "VARCHAR"],
    ["start_at", "DATETIME"],
    ["end_at", "DATETIME"]
  ]) {
    assert.match(schemaSource, new RegExp(`${column} ${typePattern}`), `schema should include ${column}`);
    assert.match(mysqlSource, new RegExp(`${column} ${typePattern}`), `mysql bootstrap should include ${column}`);
    assert.match(migrationSource, new RegExp(`${column} ${typePattern}`), `migration should include ${column}`);
  }
});

test("admin announcement writes return canonical rows for follow-up edits", () => {
  assert.match(adminControllerSource, /res\.status\(201\)\.json\(await createAdminNotice/);
  assert.match(adminServiceSource, /const noticeUid = await createUniqueNoticeUid\(\)/);
  assert.match(adminServiceSource, /return mapNoticeRow\(\s*await getNoticeRowByUid\(noticeUid\)\s*\)/);
  assert.match(adminServiceSource, /return mapNoticeRow\(\s*await getNoticeRowByUid\(cleanNoticeId\)\s*\)/);
  assert.match(adminServiceSource, /function normalizeNoticeLookupId/);

  const row = __private__.mapNoticeRow({
    id: 12,
    notice_uid: "notice-12",
    title: "Windowed",
    content_text: "Visible only this week",
    notice_type: "公告",
    enabled: 1,
    status: "active",
    priority: 8,
    link_text: "详情",
    link_url: "/workspace/projects",
    link_target: "_self",
    start_at: "2026-05-17 08:00:00",
    end_at: "2026-05-18 18:30:00"
  });

  assert.equal(row.id, "notice-12");
  assert.equal(row.noticeId, "notice-12");
  assert.equal(row.priority, 8);
  assert.equal(row.startAt, "2026/05/17 08:00");
  assert.equal(row.endAt, "2026/05/18 18:30");
});

test("admin announcement ids are generated server side with collision retry", () => {
  assert.match(adminServiceSource, /async function createUniqueNoticeUid/);
  assert.match(adminServiceSource, /getNoticeRowByUid\(noticeUid\)/);
  assert.match(adminServiceSource, /makeUid\("notice"\)/);
  assert.doesNotMatch(adminServiceSource, /const noticeUid = trimText\(payload\.noticeId/);
});

test("workspace announcement carousel is workspace-read gated and active only", () => {
  assert.match(workspaceRoutesSource, /requireWorkspaceRead = requirePermission\("workspace\.read"\)/);
  assert.match(workspaceRoutesSource, /router\.get\("\/workspace\/notices\/carousel", authRequired, requireWorkspaceRead, getCarouselNotices\)/);
  assert.match(workspaceRoutesSource, /router\.get\("\/notices\/carousel", authRequired, requireWorkspaceRead, getCarouselNotices\)/);

  assert.match(workspaceControllerSource, /listWorkspaceCarouselNotices/);
  assert.match(workspaceControllerSource, /export async function getCarouselNotices/);
  assert.match(workspaceServiceSource, /export async function listWorkspaceCarouselNotices/);
  assert.match(workspaceServiceSource, /enabled = 1/);
  assert.match(workspaceServiceSource, /status = 'active'/);
  assert.match(workspaceServiceSource, /start_at IS NULL OR start_at <= NOW\(\)/);
  assert.match(workspaceServiceSource, /end_at IS NULL OR end_at >= NOW\(\)/);
  assert.match(workspaceServiceSource, /ORDER BY priority DESC, sort_order ASC, updated_at DESC/);
});

test("announcement helpers sanitize scripts and validate safe links", () => {
  const row = __private__.mapNoticeRow({
    notice_uid: "notice-1",
    title: "<script>alert(1)</script> Release",
    content_text: "Hello <SCRIPT>bad()</SCRIPT><b>team</b>",
    status: "active",
    priority: 7,
    link_text: "Open<script>x()</script>",
    link_url: "https://example.com/path",
    link_target: "_blank",
    enabled: 1
  });

  assert.equal(row.id, "notice-1");
  assert.equal(row.title, "Release");
  assert.equal(row.content, "Hello <b>team</b>");
  assert.equal(row.text, "Hello <b>team</b>");
  assert.equal(row.status, "active");
  assert.equal(row.priority, 7);
  assert.equal(row.linkText, "Open");
  assert.equal(row.linkUrl, "https://example.com/path");
  assert.equal(row.linkTarget, "_blank");
  assert.doesNotMatch(JSON.stringify(row), /<script|<\/script|javascript:/i);

  assert.equal(
    __private__.normalizeNoticePayload({ title: "x", content: "y", openTarget: "_blank" }).linkTarget,
    "_blank"
  );
  assert.equal(__private__.normalizeNoticeLinkUrl("/workspace/projects"), "/workspace/projects");
  assert.equal(__private__.normalizeNoticeLinkUrl("https://example.com/a"), "https://example.com/a");
  assert.throws(() => __private__.normalizeNoticeLinkUrl("javascript:alert(1)"), /linkUrl must be/);
  assert.throws(() => __private__.normalizeNoticePayload({ title: "x", content: "y", linkUrl: "ftp://bad" }), /linkUrl must be/);
});

test("announcement API docs describe admin write and workspace read contracts", () => {
  assert.match(adminManagerContractSource, /DELETE\s+`?\/admin\/notices\/:noticeId`?/);
  assert.match(adminManagerContractSource, /title\/content\/status\/priority\/linkText\/linkUrl\/linkTarget\/startAt\/endAt/);
  assert.match(frontendContractSource, /GET \| \/workspace\/notices\/carousel/);
  assert.match(frontendContractSource, /active announcements/);
});
