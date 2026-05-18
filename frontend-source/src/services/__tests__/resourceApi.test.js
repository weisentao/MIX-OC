import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createResourceApi } from "../resourceApi.js";

function createClient() {
  const calls = [];
  return {
    calls,
    get(url) {
      calls.push(["get", url]);
      return Promise.resolve({ ok: true });
    },
    post(url, payload) {
      calls.push(["post", url, payload]);
      return Promise.resolve({ ok: true });
    },
    patch(url, payload) {
      calls.push(["patch", url, payload]);
      return Promise.resolve({ ok: true });
    }
  };
}

describe("resourceApi", () => {
  it("wraps resource, workload, assignment, and advice endpoints", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await api.getResources({ department: "美术设计部", includeArchived: false });
    await api.getWorkload({ startDate: "2026/05/10", endDate: "2026/05/20" });
    await api.previewAssignment({ workItemId: "task-1", assigneeId: "u-1" });
    await api.confirmAssignment({ previewId: "p-1" });
    await api.forceConfirmAssignment({ previewId: "p-1", reason: "经理确认" });
    await api.analyzeAssignment({ taskUid: "task-1", candidates: [] });

    assert.deepEqual(client.calls, [
      ["get", "/workspace/resources?department=%E7%BE%8E%E6%9C%AF%E8%AE%BE%E8%AE%A1%E9%83%A8&includeArchived=false"],
      ["get", "/workspace/workload?startDate=2026%2F05%2F10&endDate=2026%2F05%2F20"],
      ["post", "/workspace/assignments/preview", { workItemId: "task-1", assigneeId: "u-1" }],
      ["post", "/workspace/assignments/confirm", { previewId: "p-1" }],
      ["post", "/workspace/assignments/force-confirm", { previewId: "p-1", reason: "经理确认" }],
      ["post", "/workspace/resources/ai/assignment-advice", { taskUid: "task-1", candidates: [] }]
    ]);
  });

  it("strips credential-shaped fields from assignment advice requests", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await api.analyzeAssignment({
      taskUid: "task-safe",
      homeDeepSeekApiKey: "sk-HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH",
      hrDeepSeekApiKey: "sk-RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
      apiKey: "generic-credential",
      nested: {
        token: "nested-token",
        title: "safe nested context"
      }
    });

    assert.deepEqual(client.calls, [
      [
        "post",
        "/workspace/resources/ai/assignment-advice",
          {
          taskUid: "task-safe",
          nested: {
            title: "safe nested context"
          }
        }
      ]
    ]);
    assert.doesNotMatch(JSON.stringify(client.calls), /sk-[A-Za-z0-9_-]{16,}|api[_-]?key|token|credential/i);
  });

  it("prefers stable schedule and task link ids over a drifted workItemId when patching schedule", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await api.rescheduleWorkItem({
      workItemId: "u-dingtao",
      scheduleItemId: "si-2",
      taskUid: "task-2",
      startDate: "2026/05/11",
      endDate: "2026/05/12"
    });

    assert.deepEqual(client.calls, [
      [
        "patch",
        "/workspace/resources/work-items/si-2/schedule",
        {
          workItemId: "u-dingtao",
          scheduleItemId: "si-2",
          taskUid: "task-2",
          startDate: "2026/05/11",
          endDate: "2026/05/12"
        }
      ]
    ]);
  });

  it("uses task identifiers when schedule item identifiers are unavailable", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await api.rescheduleWorkItem({
      workItemId: "u-dingtao",
      taskUid: "task-9",
      startDate: "2026/05/11",
      endDate: "2026/05/12"
    });

    assert.deepEqual(client.calls, [
      [
        "patch",
        "/workspace/resources/work-items/task-9/schedule",
        {
          workItemId: "u-dingtao",
          taskUid: "task-9",
          startDate: "2026/05/11",
          endDate: "2026/05/12"
        }
      ]
    ]);
  });

  it("falls back to workItemId only after stable schedule and task identifiers", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await api.rescheduleWorkItem({
      workItemId: "wi-legacy",
      startDate: "2026/05/11",
      endDate: "2026/05/12"
    });

    assert.deepEqual(client.calls, [
      [
        "patch",
        "/workspace/resources/work-items/wi-legacy/schedule",
        {
          workItemId: "wi-legacy",
          startDate: "2026/05/11",
          endDate: "2026/05/12"
        }
      ]
    ]);
  });

  it("rejects empty schedule sync ids before building a malformed URL", async () => {
    const client = createClient();
    const api = createResourceApi(client);

    await assert.rejects(() => api.rescheduleWorkItem({ workItemId: "   ", scheduleItemId: "", taskUid: "" }), /workItemId is required/);
    assert.deepEqual(client.calls, []);
  });

  it("passes axios-style request clients a config object", async () => {
    const calls = [];
    const api = createResourceApi({
      request(config) {
        calls.push(config);
        return Promise.resolve({ ok: true });
      }
    });

    await api.rescheduleWorkItem({ scheduleItemId: "si-10", startDate: "2026/05/10" });

    assert.deepEqual(calls, [
      {
        method: "patch",
        url: "/workspace/resources/work-items/si-10/schedule",
        data: { scheduleItemId: "si-10", startDate: "2026/05/10" }
      }
    ]);
  });
});
