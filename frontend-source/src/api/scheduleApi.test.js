import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createScheduleApi } from "./scheduleApi.js";

function createClient() {
  const calls = [];
  return {
    calls,
    get(url) {
      calls.push(["get", url]);
      return Promise.resolve({ comments: [] });
    },
    post(url, payload) {
      calls.push(["post", url, payload]);
      return Promise.resolve({ comment: payload });
    }
  };
}

describe("schedule comments api", () => {
  it("wraps schedule item comment list and create endpoints", async () => {
    const client = createClient();
    const api = createScheduleApi(client);

    await api.listScheduleItemComments(" si-1 ");
    await api.createScheduleItemComment("si-1", {
      content: "同步一下进度",
      payload: { mentions: ["u-1"] }
    });

    assert.deepEqual(client.calls, [
      ["get", "/workspace/schedule/items/si-1/comments"],
      [
        "post",
        "/workspace/schedule/items/si-1/comments",
        {
          content: "同步一下进度",
          payload: { mentions: ["u-1"] }
        }
      ]
    ]);
  });
});
