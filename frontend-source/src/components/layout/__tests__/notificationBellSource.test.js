import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../WorkbenchHeader.vue", import.meta.url), "utf8");
const notificationApiSource = readFileSync(new URL("../../../services/notificationApi.js", import.meta.url), "utf8");

describe("workbench notification bell contract", () => {
  it("loads backend notifications and unread counts for the bell menu", () => {
    assert.match(source, /import notificationApi from "@\/services\/notificationApi"/);
    assert.match(source, /notificationApi\.listNotifications\(\{\s*limit:\s*20\s*\}\)/);
    assert.match(source, /notificationApi\.getUnreadCount\(\)/);
    assert.match(source, /notificationUnreadCount/);
    assert.match(source, /class="work-notice-badge"/);
  });

  it("renders displayable mention, comment, and assignment notification fields", () => {
    assert.match(source, /\{\{\s*notification\.title\s*\|\|\s*"通知"\s*\}\}/);
    assert.match(source, /\{\{\s*notification\.text\s*\|\|\s*notification\.content\s*\|\|\s*"暂无内容"\s*\}\}/);
    assert.match(source, /\[notification\.projectName,\s*notification\.taskTitle\]\.filter\(Boolean\)\.join\("\s*\/\s*"\)/);
    assert.match(source, /:class="\{\s*'is-unread': notification\.isRead === false\s*\}"/);
  });

  it("marks one or all backend notifications read through the contract API", () => {
    assert.match(source, /notificationApi\.markNotificationRead\(notification\.id \|\| notification\.notificationId\)/);
    assert.match(source, /notificationApi\.markAllNotificationsRead\(\)/);
    assert.match(notificationApiSource, /listNotifications\(params = \{\}\)/);
    assert.match(notificationApiSource, /markNotificationRead\(notificationId\)/);
    assert.match(notificationApiSource, /markAllNotificationsRead\(\)/);
  });
});
