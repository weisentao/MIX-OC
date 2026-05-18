import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNotificationApi } from "../notificationApi.js";

function createClient() {
  const calls = [];
  const client = {
    calls,
    get(url) {
      calls.push(["get", url]);
      return Promise.resolve({ ok: true });
    },
    patch(url, payload) {
      calls.push(["patch", url, payload]);
      return Promise.resolve({ ok: true });
    }
  };
  return client;
}

describe("notificationApi", () => {
  it("wraps list, unread count, and read endpoints", async () => {
    const client = createClient();
    const api = createNotificationApi(client);

    await api.listNotifications({ unreadOnly: true, limit: 10 });
    await api.getUnreadCount();
    await api.markNotificationRead(" notification 1 ");
    await api.markAllNotificationsRead();

    assert.deepEqual(client.calls, [
      ["get", "/notifications?unreadOnly=true&limit=10"],
      ["get", "/notifications/unread-count"],
      ["patch", "/notifications/notification%201/read", {}],
      ["patch", "/notifications/read-all", {}]
    ]);
  });

  it("rejects blank notification ids before calling read routes", async () => {
    const client = createClient();
    const api = createNotificationApi(client);

    await assert.rejects(() => api.markNotificationRead(" "), /notificationId is required/);

    assert.deepEqual(client.calls, []);
  });

  it("retries bell endpoints under the workspace namespace after a 404", async () => {
    const calls = [];
    const responses = [
      Promise.reject({ response: { status: 404 }, message: "Not Found" }),
      Promise.resolve({ notifications: [] }),
      Promise.reject({ response: { status: 404 }, message: "Not Found" }),
      Promise.resolve({ unreadCount: 3 }),
      Promise.reject({ response: { status: 404 }, message: "Not Found" }),
      Promise.resolve({ ok: true }),
      Promise.reject({ response: { status: 404 }, message: "Not Found" }),
      Promise.resolve({ ok: true })
    ];
    const client = (method, url, payload) => {
      calls.push([method, url, payload]);
      return responses.shift();
    };
    const api = createNotificationApi(client);

    await api.listNotifications({ limit: 5 });
    await api.getUnreadCount();
    await api.markNotificationRead("notification-2");
    await api.markAllNotificationsRead();

    assert.deepEqual(calls, [
      ["get", "/notifications?limit=5", undefined],
      ["get", "/workspace/notifications?limit=5", undefined],
      ["get", "/notifications/unread-count", undefined],
      ["get", "/workspace/notifications/unread-count", undefined],
      ["patch", "/notifications/notification-2/read", {}],
      ["patch", "/workspace/notifications/notification-2/read", {}],
      ["patch", "/notifications/read-all", {}],
      ["patch", "/workspace/notifications/read-all", {}]
    ]);
  });
});
