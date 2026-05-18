import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aiErrorMessage } from "../apiErrors.js";

function httpError(status, message = "") {
  return {
    message,
    response: {
      status,
      data: { message }
    }
  };
}

describe("aiErrorMessage", () => {
  it("keeps 401, 403 and 503 distinguishable for AI surfaces", () => {
    const unauthorized = aiErrorMessage(httpError(401, "Unauthorized"));
    const forbidden = aiErrorMessage(httpError(403, "Forbidden"));
    const unavailable = aiErrorMessage(httpError(503, "DeepSeek home API key is not configured"));

    assert.match(unauthorized, /登录|重新登录|未登录/);
    assert.doesNotMatch(unauthorized, /权限不足/);
    assert.doesNotMatch(unauthorized, /接口暂不可用|服务暂不可用/);
    assert.match(forbidden, /权限/);
    assert.doesNotMatch(forbidden, /登录|重新登录/);
    assert.doesNotMatch(forbidden, /接口暂不可用|服务暂不可用/);
    assert.notEqual(unauthorized, forbidden);
    assert.match(unavailable, /DeepSeek|AI|服务/);
    assert.doesNotMatch(unavailable, /登录|权限不足/);
  });

});
