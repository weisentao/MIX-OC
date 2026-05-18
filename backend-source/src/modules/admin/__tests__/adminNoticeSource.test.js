import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const serviceSource = readFileSync(new URL("../admin.service.js", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("../admin.routes.js", import.meta.url), "utf8");
const createNoticeBlock = serviceSource.match(
  /export async function createAdminNotice[\s\S]*?export async function updateAdminNotice/
)?.[0] || "";
const mapNoticeRowBlock = serviceSource.match(
  /function mapNoticeRow[\s\S]*?function normalizeNoticeLookupId/
)?.[0] || "";
const listAdminNoticesBlock = serviceSource.match(
  /export async function listAdminNotices[\s\S]*?function normalizeNoticeStatus/
)?.[0] || "";
const updateNoticeBlock = serviceSource.match(
  /export async function updateAdminNotice[\s\S]*?export async function deleteAdminNotice/
)?.[0] || "";

describe("admin notice API contract", () => {
  it("uses POST for notice creation and PATCH for notice edits", () => {
    assert.match(routesSource, /router\.post\("\/admin\/notices",\s*postNotice\)/);
    assert.match(routesSource, /router\.patch\("\/admin\/notices\/:noticeId",\s*patchNotice\)/);
    assert.doesNotMatch(routesSource, /router\.put\("\/admin\/notices/);
  });

  it("server-generates notice ids on create so stale client ids cannot overwrite or collide", () => {
    assert.match(createNoticeBlock, /const noticeUid = makeUid\("notice"\)/);
    assert.doesNotMatch(createNoticeBlock, /payload\.(?:noticeId|id)/);
    assert.doesNotMatch(createNoticeBlock, /ON DUPLICATE KEY UPDATE/i);
  });

  it("keeps notice link and carousel fields in admin rows", () => {
    for (const field of ["link_text", "link_url", "link_target", "start_at", "end_at", "priority", "sort_order", "payload_json"]) {
      assert.match(listAdminNoticesBlock, new RegExp(field));
      assert.match(mapNoticeRowBlock, new RegExp(field));
    }
    assert.match(mapNoticeRowBlock, /linkText:/);
    assert.match(mapNoticeRowBlock, /linkUrl:/);
    assert.match(mapNoticeRowBlock, /linkTarget:/);
  });

  it("updates notice link and carousel fields without replacing existing rows", () => {
    assert.match(updateNoticeBlock, /UPDATE carousel_notices SET/);
    assert.doesNotMatch(updateNoticeBlock, /INSERT INTO carousel_notices/i);
    for (const field of ["link_text", "link_url", "link_target", "start_at", "end_at", "priority", "sort_order", "payload_json"]) {
      assert.match(updateNoticeBlock, new RegExp(`${field} = \\?`));
    }
  });
});
