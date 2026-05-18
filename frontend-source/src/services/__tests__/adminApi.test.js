import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAdminNoticePayload, sanitizeAdminAiConfigPayload } from "../adminApi.js";

describe("adminApi", () => {
  it("keeps unsupported secret fields out of AI config updates", () => {
    assert.deepEqual(
      sanitizeAdminAiConfigPayload({
        enabled: true,
        modelId: "deepseek-v4-flash",
        homeApiKey: "home-placeholder",
        hrApiKey: "hr-placeholder",
        homeDeepSeekApiKey: "home-canonical-placeholder",
        hrDeepSeekApiKey: "hr-canonical-placeholder",
        DEEPSEEK_HOME_API_KEY: "placeholder",
        DEEPSEEK_HR_API_KEY: "placeholder",
        apiKey: "placeholder",
        deepseekApiKey: "placeholder",
        token: "placeholder",
        secret: "placeholder"
      }),
      {
        enabled: true,
        modelId: "deepseek-v4-flash",
        homeApiKey: "home-canonical-placeholder",
        hrApiKey: "hr-canonical-placeholder"
      }
    );
  });

  it("normalizes scoped AI key aliases before admin config updates", () => {
    assert.deepEqual(
      sanitizeAdminAiConfigPayload({
        home_deepseek_api_key: "  home-snake-placeholder  ",
        deepseekHrApiKey: "  hr-camel-placeholder  ",
        deepseek_home_api_key: "blocked-env-shaped-placeholder",
        deepseekApiKey: "blocked-generic-placeholder"
      }),
      {
        homeApiKey: "home-snake-placeholder",
        hrApiKey: "hr-camel-placeholder"
      }
    );
  });

  it("normalizes notice payload link fields and soft status", () => {
    assert.deepEqual(
      normalizeAdminNoticePayload({
        title: "  版本更新  ",
        text: "  请查看本周运营报表  ",
        linkText: "  报表  ",
        linkUrl: "  /admin/reports/weekly  ",
        openTarget: "blank",
        status: "disabled",
        interval: "4200",
        type: "  公告  ",
        priority: "9",
        startAt: "2026-05-17T08:30",
        endAt: "2026/05/18 18:45"
      }),
      {
        title: "版本更新",
        text: "请查看本周运营报表",
        content: "请查看本周运营报表",
        type: "公告",
        enabled: false,
        status: "disabled",
        interval: 4200,
        priority: 9,
        linkText: "报表",
        linkUrl: "/admin/reports/weekly",
        linkTarget: "_blank",
        startAt: "2026-05-17 08:30:00",
        endAt: "2026-05-18 18:45:00",
        payload: {
          linkText: "报表",
          linkUrl: "/admin/reports/weekly",
          linkTarget: "_blank"
        }
      }
    );
  });

  it("keeps notice status-only updates as safe soft unpublish patches", () => {
    assert.deepEqual(normalizeAdminNoticePayload({ enabled: false }, { partial: true }), {
      enabled: false,
      status: "disabled",
      interval: 5500,
      linkText: "",
      linkUrl: "",
      linkTarget: "_self",
      payload: {
        linkText: "",
        linkUrl: "",
        linkTarget: "_self"
      }
    });
  });

  it("can omit local optimistic ids from notice create payloads", () => {
    const payload = normalizeAdminNoticePayload(
      {
        id: "notice-existing-row",
        title: "新增公告",
        text: "新增内容"
      },
      { omitNoticeId: true }
    );

    assert.equal(payload.noticeId, undefined);
    assert.equal(payload.title, "新增公告");
    assert.equal(payload.content, "新增内容");
  });
});

