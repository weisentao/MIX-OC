import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http, { normalizeApiBaseURL } from "../http.js";
import { createWorkspaceApi } from "../workspaceApi.js";

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
    delete(url, payload) {
      calls.push(payload ? ["delete", url, payload.data] : ["delete", url]);
      return Promise.resolve({ ok: true });
    }
  };
  return client;
}

describe("workspaceApi template endpoints", () => {
  it("wraps active carousel notice reads under workspace routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.listCarouselNotices();

    assert.deepEqual(client.calls, [["get", "/workspace/notices/carousel"]]);
  });

  it("normalizes API baseURL without dropping the /api proxy prefix", () => {
    assert.equal(normalizeApiBaseURL(""), "/api");
    assert.equal(normalizeApiBaseURL("  "), "/api");
    assert.equal(normalizeApiBaseURL("/"), "/api");
    assert.equal(normalizeApiBaseURL("api"), "/api");
    assert.equal(normalizeApiBaseURL("/api/"), "/api");
    assert.equal(normalizeApiBaseURL("http://127.0.0.1:13001/"), "http://127.0.0.1:13001/api");
    assert.equal(normalizeApiBaseURL("http://127.0.0.1:13001/api/"), "http://127.0.0.1:13001/api");
  });

  it("preserves backend response status when normalizing HTTP errors", async () => {
    const responseHandler = http.interceptors.response.handlers.find((handler) => handler.rejected)?.rejected;
    assert.equal(typeof responseHandler, "function");
    const error = new Error("Request failed");
    Object.defineProperty(error, "response", {
      value: { status: 503, data: { message: "database unavailable" } },
      enumerable: false
    });

    await assert.rejects(
      () => responseHandler(error),
      (actual) => {
        assert.equal(actual.message, "database unavailable");
        assert.equal(actual.status, 503);
        assert.equal(actual.response.status, 503);
        return true;
      }
    );
  });

  it("wraps template CRUD and share endpoints under workspace routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.listTemplates("kind=task");
    await api.createTemplate({ title: "Template" });
    await api.updateTemplate(" template 1 ", { title: "Updated" });
    await api.deleteTemplate("template 1");
    await api.shareTemplate("template 1", [{ userId: "user b" }]);
    await api.unshareTemplate("template 1", "user b");

    assert.deepEqual(client.calls, [
      ["get", "/workspace/templates?kind=task"],
      ["post", "/workspace/templates", { title: "Template" }],
      ["patch", "/workspace/templates/template%201", { title: "Updated" }],
      ["delete", "/workspace/templates/template%201"],
      ["put", "/workspace/templates/template%201/shares", { entries: [{ userId: "user b" }] }],
      ["delete", "/workspace/templates/template%201/shares/user%20b"]
    ]);
  });

  it("supports axios-style request clients", async () => {
    const calls = [];
    const api = createWorkspaceApi({
      request(config) {
        calls.push(config);
        return Promise.resolve({ ok: true });
      }
    });

    await api.updateTemplate("template-a", { title: "Updated" });

    assert.deepEqual(calls, [
      {
        method: "patch",
        url: "/workspace/templates/template-a",
        data: { title: "Updated" }
      }
    ]);
  });

  it("wraps contacts CRUD and profile update under workspace routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.listContacts();
    await api.createContact({ targetUserId: "user-a", relationType: "care" });
    await api.deleteContact("user-a");
    await api.updateProfile({ email: "new@example.com" });

    assert.deepEqual(client.calls, [
      ["get", "/workspace/contacts"],
      ["post", "/workspace/contacts", { targetUserId: "user-a", relationType: "care" }],
      ["delete", "/workspace/contacts/user-a"],
      ["patch", "/workspace/profile", { email: "new@example.com" }]
    ]);
  });

  it("wraps project member endpoints under workspace project member routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.listProjectMembers(" project-1 ");
    await api.addProjectMembers("project-1", { members: ["Alpha"] });
    await api.removeProjectMembers("project-1", { members: ["Alpha"] });
    await api.setProjectMemberGroups("project-1", { groups: { manager: ["Owner"], readonly: ["Alpha"] } });

    assert.deepEqual(client.calls, [
      ["get", "/workspace/projects/project-1/members"],
      ["post", "/workspace/projects/project-1/members", { members: ["Alpha"] }],
      ["delete", "/workspace/projects/project-1/members", { members: ["Alpha"] }],
      ["put", "/workspace/projects/project-1/members/groups", { groups: { manager: ["Owner"], readonly: ["Alpha"] } }]
    ]);
  });

  it("rejects empty path ids before calling task and project routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await assert.rejects(() => api.createTask("", { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.createTask({ id: "" }, { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.updateTask("", { title: "Task" }), /缺少taskId/);
    await assert.rejects(() => api.updateBoard("", { title: "Board" }), /缺少boardId/);

    assert.deepEqual(client.calls, []);
  });

  it("wraps board batch sync under workspace routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.syncBoard(" board 1 ", {
      save: {
        title: "Board title",
        baseVersion: 3,
        lastVersion: 3
      },
      includeHistory: true
    });

    assert.deepEqual(client.calls, [
      [
        "post",
        "/workspace/boards/board%201/sync",
        {
          save: {
            title: "Board title",
            baseVersion: 3,
            lastVersion: 3
          },
          includeHistory: true
        }
      ]
    ]);
  });

  it("sends explicit mention recipients with task comments", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.addTaskComment(" task 1 ", "请看 @张三", [{ userId: "u-zhangsan", name: "张三" }]);

    assert.deepEqual(client.calls, [
      [
        "post",
        "/workspace/tasks/task%201/comments",
        {
          text: "请看 @张三",
          mentions: [{ userId: "u-zhangsan", name: "张三" }]
        }
      ]
    ]);
  });

  it("does not allow blank path segments to collapse into legacy workspace routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.createTask({ projectId: " project 1 " }, { title: "Task" });
    await assert.rejects(() => api.listTasks({ projectId: "" }), /缺少项目ID/);
    await assert.rejects(() => api.createTask({ projectUid: "" }, { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.createTask({ taskUid: "task-1" }, { title: "Task" }), /缺少项目ID/);

    assert.deepEqual(client.calls, [
      ["post", "/workspace/projects/project%201/tasks", { title: "Task" }]
    ]);
  });

  it("rejects reserved project path ids before calling task routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await assert.rejects(() => api.listTasks("schedule"), /缺少项目ID/);
    await assert.rejects(() => api.listTasks("tasks"), /缺少项目ID/);
    await assert.rejects(() => api.createTask({ projectId: "undefined" }, { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.createTask({ projectUid: "null" }, { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.listBoards("schedule"), /缺少项目ID/);
    await assert.rejects(() => api.listBoards("tasks"), /缺少项目ID/);

    assert.deepEqual(client.calls, []);
  });

  it("rejects blank project query objects instead of sending empty query parameters", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await api.listBoards({ id: " project 1 " });
    await assert.rejects(() => api.listBoards({ id: "" }), /缺少项目ID/);

    assert.deepEqual(client.calls, [
      ["get", "/workspace/boards?projectId=project%201"]
    ]);
  });

  it("rejects non-project objects before calling project scoped task and board routes", async () => {
    const client = createClient();
    const api = createWorkspaceApi(client);

    await assert.rejects(() => api.listTasks({ id: "tasks", title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.createTask({ id: "task-1", taskUid: "task-1" }, { title: "Task" }), /缺少项目ID/);
    await assert.rejects(() => api.listBoards({ id: "board-1", boardId: "board-1" }), /缺少项目ID/);

    assert.deepEqual(client.calls, []);
  });
});
