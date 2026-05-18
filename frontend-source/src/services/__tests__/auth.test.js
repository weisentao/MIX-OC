import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import * as axios from "axios";
import { getCurrentUser, login, register, updateCurrentUserProfile } from "../auth.js";
import http from "../http.js";

const originalHttpAdapter = http.defaults.adapter;
const originalPost = http.post;
const originalGet = http.get;
const originalPatch = http.patch;
const originalLocalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;
const originalFallbackEnv = process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK;

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
  delete globalThis.window;
  delete process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK;
});

afterEach(() => {
  http.defaults.adapter = originalHttpAdapter;
  http.post = originalPost;
  http.get = originalGet;
  http.patch = originalPatch;
  globalThis.localStorage = originalLocalStorage;
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
  if (originalCustomEvent === undefined) {
    delete globalThis.CustomEvent;
  } else {
    globalThis.CustomEvent = originalCustomEvent;
  }
  if (originalFallbackEnv === undefined) {
    delete process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK;
  } else {
    process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = originalFallbackEnv;
  }
});

describe("auth offline fallback", () => {
  it("rejects the default local admin account unless offline auth is explicitly enabled", async () => {
    http.post = async () => {
      throw new Error("backend offline");
    };

    await assert.rejects(() => login("admin", "admin"), /Backend unavailable|backend offline|Login failed/i);
  });

  it("allows local admin login only when offline auth fallback is explicitly enabled", async () => {
    process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = "true";
    http.post = async () => {
      throw new Error("backend offline");
    };

    const result = await login("admin", "admin");

    assert.equal(result.token, "local-admin-token");
    assert.equal(result.user.id, "u-admin");
  });

  it("does not fall back to local login after backend 401 or 403", async () => {
    process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = "true";

    for (const status of [401, 403]) {
      http.post = async () => {
        const error = new Error("backend denied");
        error.response = { status, data: { message: `denied ${status}` } };
        throw error;
      };

      await assert.rejects(() => login("admin", "admin"), new RegExp(`denied ${status}`));
    }
  });

  it("rejects the legacy local admin token instead of treating it as a logged-in backend user", async () => {
    http.get = async () => {
      throw new Error("backend offline");
    };
    localStorage.setItem("xjg_token", "local-admin-token");

    await assert.rejects(() => getCurrentUser(), /Login has expired|Backend unavailable|backend offline/i);
  });

  it("returns a local current user only when offline auth fallback is explicitly enabled", async () => {
    process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = "true";
    http.get = async () => {
      throw new Error("backend offline");
    };
    localStorage.setItem("xjg_token", "local-admin-token");

    const user = await getCurrentUser();

    assert.equal(user.id, "u-admin");
  });

  it("upgrades a local admin token before getCurrentUser calls /me", async () => {
    process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = "true";
    localStorage.setItem("xjg_token", "local-admin-token");

    const calls = [];
    http.defaults.adapter = async (config) => {
      calls.push({ url: config.url, method: config.method, authorization: config.headers?.Authorization });
      if (config.url === "/login") {
        return {
          data: { token: "real-admin-jwt", user: { id: "u-admin", username: "admin", role: "admin" } },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
          request: {}
        };
      }
      if (config.url === "/me") {
        return {
          data: { id: "u-admin", username: "admin", role: "admin" },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
          request: {}
        };
      }
      throw new Error(`Unexpected URL ${config.url}`);
    };
    http.post = axios.Axios.prototype.post.bind(http);
    http.get = axios.Axios.prototype.get.bind(http);

    const user = await getCurrentUser();

    assert.equal(user.id, "u-admin");
    assert.deepEqual(calls.map((call) => call.url), ["/login", "/me"]);
    assert.equal(calls[1].authorization, "Bearer real-admin-jwt");
    assert.equal(localStorage.getItem("xjg_token"), "real-admin-jwt");
  });

  it("does not create a local registered user when the backend register API is unavailable", async () => {
    http.post = async () => {
      const error = new Error("Network Error");
      error.request = {};
      throw error;
    };

    await assert.rejects(
      () =>
        register({
          username: "MIX-smoke",
          password: "secret123",
          name: "Smoke",
          phone: "13800000000",
          email: "smoke@example.com",
          securityQuestion: "q",
          securityAnswer: "a"
        }),
      /Backend unavailable|Register failed|Network Error/i
    );
    assert.equal(localStorage.getItem("xjg_local_auth_users"), null);
  });

  it("does not send local tokens in the backend authorization header", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");

    for (const token of ["local-admin-token", "local-u-local-1-token", "mock-admin-token", "mock-yan-token", "demo-admin-token"]) {
      localStorage.setItem("xjg_token", token);

      const config = await requestHandler({ url: "/login", headers: { Authorization: "Bearer stale" } });

      assert.equal(config.headers.Authorization, undefined);
    }
  });

  it("sends non-local tokens in the backend authorization header", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");
    localStorage.setItem("xjg_token", "real-backend-token");

    const config = await requestHandler({ headers: {} });

    assert.equal(config.headers.Authorization, "Bearer real-backend-token");
  });

  it("persists backend login JWTs before the next business request", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");

    http.post = async (url, payload) => {
      assert.equal(url, "/login");
      assert.deepEqual(payload, { username: "MIX-user", password: "secret123" });
      return {
        token: "real-login-jwt",
        user: { id: "u-101", username: "MIX-user", role: "employee" }
      };
    };

    const result = await login("MIX-user", "secret123");
    const config = await requestHandler({ url: "/workspace/bootstrap", headers: {} });

    assert.equal(result.token, "real-login-jwt");
    assert.equal(localStorage.getItem("xjg_token"), "real-login-jwt");
    assert.equal(JSON.parse(localStorage.getItem("xjg_user")).id, "u-101");
    assert.equal(config.headers.Authorization, "Bearer real-login-jwt");
  });

  it("persists backend register JWTs so immediate business requests are authorized", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");

    http.post = async (url, payload) => {
      assert.equal(url, "/register");
      assert.equal(payload.username, "MIX-new-user");
      return {
        token: "real-register-jwt",
        user: { id: "u-202", username: "MIX-new-user", role: "employee" }
      };
    };

    const result = await register({
      username: "MIX-new-user",
      password: "secret123",
      name: "New User",
      phone: "13800000000",
      email: "new@example.com",
      securityQuestion: "q",
      securityAnswer: "a"
    });
    const config = await requestHandler({ url: "/workspace/projects", headers: {} });

    assert.equal(result.token, "real-register-jwt");
    assert.equal(localStorage.getItem("xjg_token"), "real-register-jwt");
    assert.equal(JSON.parse(localStorage.getItem("xjg_user")).username, "MIX-new-user");
    assert.equal(config.headers.Authorization, "Bearer real-register-jwt");
  });

  it("updates current user profile through PATCH /me", async () => {
    http.patch = async (url, payload) => {
      assert.equal(url, "/me");
      assert.deepEqual(payload, { email: "new@example.com" });
      return { id: "u-1", email: "new@example.com" };
    };

    const result = await updateCurrentUserProfile({ email: "new@example.com" });
    assert.equal(result.email, "new@example.com");
  });

  it("upgrades a local admin token through backend login before sending business requests", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");
    localStorage.setItem("xjg_token", "local-admin-token");

    http.post = async (url, payload, config) => {
      assert.equal(url, "/login");
      assert.deepEqual(payload, { username: "admin", password: "admin" });
      assert.equal(config?.skipAuthUpgrade, true);
      return {
        token: "real-admin-jwt",
        user: { id: "u-admin", username: "admin", role: "admin" }
      };
    };

    const config = await requestHandler({ url: "/workspace/ai/settings", headers: {} });

    assert.equal(config.headers.Authorization, "Bearer real-admin-jwt");
    assert.equal(localStorage.getItem("xjg_token"), "real-admin-jwt");
    assert.equal(JSON.parse(localStorage.getItem("xjg_user")).role, "admin");
  });

  it("upgrades a local admin token before fetching the current backend user", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");
    localStorage.setItem("xjg_token", "local-admin-token");

    http.post = async () => ({
      token: "real-admin-jwt",
      user: { id: "u-admin", username: "admin", role: "admin" }
    });

    const config = await requestHandler({ url: "/me", headers: {} });

    assert.equal(config.headers.Authorization, "Bearer real-admin-jwt");
  });

  it("clears session and dispatches re-login event for backend 401 responses", async () => {
    const responseHandler = http.interceptors.response.handlers.find((handler) => handler.rejected)?.rejected;
    assert.equal(typeof responseHandler, "function");

    const events = [];
    globalThis.window = {
      dispatchEvent(event) {
        events.push(event);
      }
    };
    globalThis.CustomEvent = function CustomEvent(type, options) {
      this.type = type;
      this.detail = options?.detail;
    };
    localStorage.setItem("xjg_token", "real-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-1" }));
    const error = new Error("denied 401");
    error.response = { status: 401, data: { message: "denied 401" } };

    await assert.rejects(
      () => responseHandler(error),
      (actual) => {
        assert.equal(actual.status, 401);
        assert.equal(actual.authRequired, true);
        assert.equal(actual.message, "denied 401");
        return true;
      }
    );
    assert.equal(localStorage.getItem("xjg_token"), null);
    assert.equal(localStorage.getItem("xjg_user"), null);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "xjg-auth-required");
    assert.equal(events[0].detail.status, 401);
  });

  it("preserves backend session for permission-only 403 responses", async () => {
    const responseHandler = http.interceptors.response.handlers.find((handler) => handler.rejected)?.rejected;
    assert.equal(typeof responseHandler, "function");

    const events = [];
    globalThis.window = {
      dispatchEvent(event) {
        events.push(event);
      }
    };
    globalThis.CustomEvent = function CustomEvent(type, options) {
      this.type = type;
      this.detail = options?.detail;
    };
    localStorage.setItem("xjg_token", "real-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-1" }));
    const error = new Error("No permission to access");
    error.response = { status: 403, data: { message: "No permission to access" } };

    await assert.rejects(
      () => responseHandler(error),
      (actual) => {
        assert.equal(actual.status, 403);
        assert.equal(actual.authRequired, false);
        assert.equal(actual.permissionDenied, true);
        return true;
      }
    );
    assert.equal(localStorage.getItem("xjg_token"), "real-token");
    assert.deepEqual(JSON.parse(localStorage.getItem("xjg_user")), { id: "u-1" });
    assert.equal(events.length, 0);
  });

  it("rejects business requests when a local admin token cannot be upgraded", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");
    localStorage.setItem("xjg_token", "local-admin-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-admin", username: "admin", role: "admin" }));

    http.post = async () => {
      const error = new Error("admin backend login failed");
      error.response = { status: 401, data: { message: error.message } };
      throw error;
    };

    await assert.rejects(
      () => requestHandler({ url: "/workspace/bootstrap", headers: { Authorization: "Bearer stale" } }),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.response.status, 401);
        assert.match(error.message, /admin backend login failed/i);
        return true;
      }
    );
    assert.equal(localStorage.getItem("xjg_token"), null);
    assert.equal(localStorage.getItem("xjg_user"), null);
  });

  it("stops business requests without clearing session when backend login is unavailable", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");
    localStorage.setItem("xjg_token", "local-admin-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-admin", username: "admin", role: "admin" }));

    http.post = async () => {
      const error = new Error("backend offline");
      error.request = {};
      throw error;
    };

    await assert.rejects(
      () => requestHandler({ url: "/workspace/bootstrap", headers: {} }),
      (error) => {
        assert.equal(error.status, 0);
        assert.equal(error.authRequired, false);
        assert.match(error.message, /backend offline/i);
        return true;
      }
    );
    assert.equal(localStorage.getItem("xjg_token"), "local-admin-token");
    assert.equal(JSON.parse(localStorage.getItem("xjg_user")).id, "u-admin");
  });

  it("rejects business requests when a local user cannot be registered with the backend", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");
    localStorage.setItem("xjg_token", "local-u-local-1-token");
    localStorage.setItem("xjg_user", JSON.stringify({ id: "u-local-1", username: "MIX-offline", role: "user" }));
    localStorage.setItem(
      "xjg_local_auth_users",
      JSON.stringify([
        {
          id: "MIX-offline",
          username: "MIX-offline",
          password: "secret123",
          userId: "u-local-1",
          token: "local-u-local-1-token",
          phone: "13800000000",
          securityQuestion: "q",
          securityAnswer: "a"
        }
      ])
    );
    localStorage.setItem(
      "xjg_local_users",
      JSON.stringify([
        {
          id: "u-local-1",
          username: "MIX-offline",
          name: "Offline User",
          role: "user",
          department: "椤圭洰绠＄悊",
          email: "offline@example.com",
          job: "椤圭洰涓撳憳",
          mbti: "ENTP"
        }
      ])
    );

    http.post = async (url) => {
      const error = new Error(`${url} denied`);
      error.response = { status: url === "/login" ? 401 : 403, data: { message: error.message } };
      throw error;
    };

    await assert.rejects(
      () => requestHandler({ url: "/workspace/bootstrap", headers: {} }),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.response.status, 403);
        assert.match(error.message, /register denied/i);
        return true;
      }
    );
    assert.equal(localStorage.getItem("xjg_token"), "local-u-local-1-token");
    assert.deepEqual(JSON.parse(localStorage.getItem("xjg_user")), { id: "u-local-1", username: "MIX-offline", role: "user" });
  });

  it("registers a local offline user with the backend before injecting a real bearer token", async () => {
    const requestHandler = http.interceptors.request.handlers.find((handler) => handler.fulfilled)?.fulfilled;
    assert.equal(typeof requestHandler, "function");
    localStorage.setItem("xjg_token", "local-u-local-1-token");
    localStorage.setItem(
      "xjg_local_auth_users",
      JSON.stringify([
        {
          id: "MIX-offline",
          username: "MIX-offline",
          password: "secret123",
          userId: "u-local-1",
          token: "local-u-local-1-token",
          phone: "13800000000",
          securityQuestion: "q",
          securityAnswer: "a"
        }
      ])
    );
    localStorage.setItem(
      "xjg_local_users",
      JSON.stringify([
        {
          id: "u-local-1",
          username: "MIX-offline",
          name: "Offline User",
          role: "user",
          department: "椤圭洰绠＄悊",
          email: "offline@example.com",
          job: "椤圭洰涓撳憳",
          mbti: "ENTP"
        }
      ])
    );

    const calls = [];
    http.post = async (url, payload, config) => {
      calls.push({ url, payload, config });
      if (url === "/login") {
        const error = new Error("Account or password is incorrect");
        error.response = { status: 401, data: { message: error.message } };
        throw error;
      }
      assert.equal(url, "/register");
      return {
        token: "real-offline-user-jwt",
        user: { id: "u-900", username: payload.username, role: "employee" }
      };
    };

    const config = await requestHandler({ url: "/workspace/bootstrap", headers: {} });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].config?.skipAuthUpgrade, true);
    assert.equal(calls[1].config?.skipAuthUpgrade, true);
    assert.equal(calls[1].payload.email, "offline@example.com");
    assert.equal(config.headers.Authorization, "Bearer real-offline-user-jwt");
    assert.equal(localStorage.getItem("xjg_token"), "real-offline-user-jwt");
  });
});
