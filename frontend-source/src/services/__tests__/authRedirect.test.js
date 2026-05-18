import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoginRedirectQuery,
  consumePostLoginSection,
  rememberWorkspaceSection,
  resolvePostLoginTarget
} from "../authRedirect.js";

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
    }
  };
}

describe("auth redirect helpers", () => {
  it("preserves the human resources section through login redirects", () => {
    const storage = createMemoryStorage();

    rememberWorkspaceSection("resource", storage);
    const loginQuery = buildLoginRedirectQuery({ name: "workspace", fullPath: "/" }, { storage });
    const target = resolvePostLoginTarget(loginQuery);
    const section = consumePostLoginSection(target.query, storage);

    assert.deepEqual(loginQuery, { redirect: "/", section: "resource" });
    assert.deepEqual(target, { path: "/", query: { section: "resource" } });
    assert.equal(section, "resource");
    assert.equal(storage.getItem("xjg_post_login_section"), null);
  });

  it("does not allow external post-login redirects", () => {
    assert.deepEqual(resolvePostLoginTarget({ redirect: "https://evil.example/login", section: "resource" }), {
      path: "/",
      query: { section: "resource" }
    });
  });
});
