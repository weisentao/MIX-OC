import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyNoticeResponseToNotices,
  normalizeLocalNoticePayload
} from "../noticeAdminModel.js";

describe("notice admin model", () => {
  it("keeps existing notices when a created notice response is merged", () => {
    const existing = [
      {
        id: "notice-existing",
        noticeId: "notice-existing",
        title: "原公告",
        text: "原公告内容",
        enabled: true
      }
    ];
    const draft = normalizeLocalNoticePayload(
      {
        title: "新公告",
        text: "同学们这周的报表出来了尽快核对",
        linkText: "报表",
        linkUrl: "/admin/reports/weekly",
        linkTarget: "_blank"
      },
      "notice-draft-local"
    );

    const { notices, notice } = applyNoticeResponseToNotices(
      existing,
      {
        id: "notice-created",
        noticeId: "notice-created",
        title: "新公告",
        text: "同学们这周的报表出来了尽快核对",
        linkText: "报表",
        linkUrl: "/admin/reports/weekly",
        linkTarget: "_blank",
        enabled: true
      },
      draft
    );

    assert.equal(notices.length, 2);
    assert.deepEqual(
      notices.map((item) => item.id).sort(),
      ["notice-created", "notice-existing"]
    );
    assert.equal(notice.id, "notice-created");
    assert.equal(notices.find((item) => item.id === "notice-existing").text, "原公告内容");
    assert.equal(notices.find((item) => item.id === "notice-created").linkText, "报表");
  });

  it("creates draft ids instead of reusing selected row ids", () => {
    const draft = normalizeLocalNoticePayload(
      {
        id: "notice-selected-row",
        noticeId: "notice-selected-row",
        title: "新增公告",
        text: "新增公告正文"
      },
      "",
      { ignorePayloadId: true }
    );

    assert.notEqual(draft.id, "notice-selected-row");
    assert.match(draft.id, /^notice-draft-/);
    assert.equal(draft.noticeId, draft.id);
  });
});
