import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const routerSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");

describe("admin notice route compatibility", () => {
  it("redirects /admin/notice to the notices section before the generic admin route", () => {
    const noticeRouteIndex = routerSource.indexOf('path: "/admin/notice"');
    const adminRouteIndex = routerSource.indexOf('path: "/admin/:section?"');

    assert.ok(noticeRouteIndex >= 0);
    assert.ok(adminRouteIndex >= 0);
    assert.ok(noticeRouteIndex < adminRouteIndex);
    assert.match(routerSource, /redirect:\s*\{\s*name:\s*"admin-console",\s*params:\s*\{\s*section:\s*"notices"\s*\}\s*\}/);
  });
});
