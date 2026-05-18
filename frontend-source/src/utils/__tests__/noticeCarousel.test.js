import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeCarouselNotices, splitNoticeInlineParts } from "../noticeCarousel.js";

describe("noticeCarousel helpers", () => {
  it("normalizes active notice rows and link field aliases", () => {
    const notices = normalizeCarouselNotices({
      items: [
        {
          noticeId: "notice-1",
          title: "Weekly report",
          content: "同学们这周的报表出来了尽快核对",
          status: "active",
          enabled: 1,
          priority: "9",
          payload: {
            interval: 3200
          },
          link_text: "报表",
          link_url: "/reports/weekly",
          open_target: "_blank"
        }
      ]
    });

    assert.equal(notices.length, 1);
    assert.equal(notices[0].id, "notice-1");
    assert.equal(notices[0].text, "同学们这周的报表出来了尽快核对");
    assert.equal(notices[0].enabled, true);
    assert.equal(notices[0].priority, 9);
    assert.equal(notices[0].interval, 3200);
    assert.equal(notices[0].linkText, "报表");
    assert.equal(notices[0].linkUrl, "/reports/weekly");
    assert.equal(notices[0].linkTarget, "_blank");
  });

  it("splits the configured link text out of the notice copy", () => {
    const parts = splitNoticeInlineParts("同学们这周的报表出来了尽快核对", "报表");

    assert.deepEqual(parts, {
      before: "同学们这周的",
      link: "报表",
      after: "出来了尽快核对",
      matched: true
    });
  });
});
