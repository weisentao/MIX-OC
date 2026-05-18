import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("runtime auth seed preserves existing real users on startup", async () => {
  const text = await readFile("src/db/mysql.js", "utf8");

  assert.match(
    text,
    /for \(const user of realUsers\)\s*\{[\s\S]*forcePasswordReset:\s*false[\s\S]*updateExisting:\s*false[\s\S]*\}/
  );
});

test("runtime auth seed does not delete existing real users during startup", async () => {
  const text = await readFile("src/db/mysql.js", "utf8");

  assert.doesNotMatch(text, /await cleanupLegacyVirtualUsers\(\)/);
});
