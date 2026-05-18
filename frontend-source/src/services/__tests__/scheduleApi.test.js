import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createScheduleApi } from "../scheduleApi.js";

function createClient() {
  const calls = [];
  const client = {
    calls,
    get(url) {
      calls.push(["get", url]);
      return Promise.resolve({ ok: true });
    },
    post(url, payload) {
      calls.push(["post", url, payload]);
      return Promise.resolve({ ok: true });
    },
    put(url, payload) {
      calls.push(["put", url, payload]);
      return Promise.resolve({ ok: true });
    },
    patch(url, payload) {
      calls.push(["patch", url, payload]);
      return Promise.resolve({ ok: true });
    },
    delete(url) {
      calls.push(["delete", url]);
      return Promise.resolve({ ok: true });
    }
  };
  return client;
}

describe("scheduleApi", () => {
  it("wraps project schedule CRUD endpoints", async () => {
    const client = createClient();
    const api = createScheduleApi(client);

    await api.getProjectSchedule(" project 1 ");
    await api.createScheduleItem(1003, { title: "Task" });
    await api.updateScheduleItem("si-1", { title: "Updated" });
    await api.deleteScheduleItem("si-1");

    assert.deepEqual(client.calls, [
      ["get", "/workspace/projects/project%201/schedule"],
      ["post", "/workspace/projects/1003/schedule/items", { title: "Task" }],
      ["put", "/workspace/schedule/items/si-1", { title: "Updated" }],
      ["delete", "/workspace/schedule/items/si-1"]
    ]);
  });

  it("wraps follow-up schedule endpoints without forcing UI code to know paths", async () => {
    const client = createClient();
    const api = createScheduleApi(client);

    await api.listSnapshots(1003);
    await api.createSnapshot(1003, { title: "Snapshot" });
    await api.listTemplates();
    await api.createTemplate({ title: "Template" });
    await api.exportSchedule(1003, { format: "html" });
    await api.listScheduleItemComments("si-1");
    await api.createScheduleItemComment("si-1", { content: "Comment" });

    assert.deepEqual(client.calls, [
      ["get", "/workspace/projects/1003/schedule/snapshots"],
      ["post", "/workspace/projects/1003/schedule/snapshots", { title: "Snapshot" }],
      ["get", "/workspace/schedule/templates"],
      ["post", "/workspace/schedule/templates", { title: "Template" }],
      ["post", "/workspace/projects/1003/schedule/export", { format: "html" }],
      ["get", "/workspace/schedule/items/si-1/comments"],
      ["post", "/workspace/schedule/items/si-1/comments", { content: "Comment" }]
    ]);
  });

  it("passes axios-style request clients a config object", async () => {
    const calls = [];
    const api = createScheduleApi({
      request(config) {
        calls.push(config);
        return Promise.resolve({ ok: true });
      }
    });

    await api.createScheduleItem(1003, { title: "Task" });

    assert.deepEqual(calls, [
      {
        method: "post",
        url: "/workspace/projects/1003/schedule/items",
        data: { title: "Task" }
      }
    ]);
  });

  it("rejects empty path ids before building malformed URLs", async () => {
    const client = createClient();
    const api = createScheduleApi(client);

    await assert.rejects(() => api.createScheduleItem("", { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.getProjectSchedule({ id: "" }), /缺少项目ID/);
    await assert.rejects(() => api.createScheduleItem({ projectUid: "" }, { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.updateScheduleItem("", { title: "Task" }), /缺少排期项ID/);

    assert.deepEqual(client.calls, []);
  });

  it("does not allow blank project ids to collapse into the legacy schedule route", async () => {
    const client = createClient();
    const api = createScheduleApi(client);

    await api.getProjectSchedule({ projectId: " project 1 " });
    await assert.rejects(() => api.listSnapshots({ projectId: "" }), /缺少项目ID/);
    await assert.rejects(() => api.exportSchedule({ id: "" }, { format: "html" }), /缺少项目ID/);
    await assert.rejects(() => api.getProjectSchedule({ taskUid: "task-1" }), /缺少项目ID/);
    await assert.rejects(() => api.getProjectSchedule("schedule"), /缺少项目ID/);

    assert.deepEqual(client.calls, [
      ["get", "/workspace/projects/project%201/schedule"]
    ]);
  });

  it("rejects local and task fallback item ids before hitting schedule item routes", async () => {
    const client = createClient();
    const api = createScheduleApi(client);

    await assert.rejects(() => api.updateScheduleItem("task-1", { title: "Task" }), /请先保存排期项后再操作/);
    await assert.rejects(() => api.deleteScheduleItem("si-local-1"), /请先保存排期项后再操作/);
    await assert.rejects(() => api.listScheduleItemComments({ id: "task-1" }), /请先保存排期项后再操作/);
    await assert.rejects(() => api.createScheduleItemComment({ itemId: "si-local-1" }, { content: "Comment" }), /请先保存排期项后再操作/);

    assert.deepEqual(client.calls, []);
  });
});
