import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeWorkspaceDateForSql } from "../workspace.service.js";

describe("workspace service date normalization", () => {
  it("normalizes UI and Date string inputs before writing DATE columns", () => {
    assert.equal(normalizeWorkspaceDateForSql("2026/05/08"), "2026-05-08");
    assert.equal(normalizeWorkspaceDateForSql("2026-5-8"), "2026-05-08");
    assert.equal(normalizeWorkspaceDateForSql("Fri May 08 2026 00:00:00 GMT+0800"), "2026-05-08");
    assert.equal(normalizeWorkspaceDateForSql(new Date(2026, 4, 8)), "2026-05-08");
    assert.equal(normalizeWorkspaceDateForSql("Fri May 08"), null);
  });
});
