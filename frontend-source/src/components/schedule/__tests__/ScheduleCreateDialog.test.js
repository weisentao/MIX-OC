import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function readDialogSource() {
  return readFile(resolve(__dirname, "../ScheduleCreateDialog.vue"), "utf8");
}

describe("ScheduleCreateDialog department module compatibility", () => {
  it("keeps create mode limited to the new department entry points", async () => {
    const source = await readDialogSource();
    const createOptions = source.match(/const scheduleDepartmentOptions = \[[\s\S]*?\];/)?.[0] || "";

    ["project", "design", "threeD", "post"].forEach((key) => {
      assert.match(createOptions, new RegExp(`key:\\s*"${key}"`));
    });
    ["aigc", "motion", "delivery"].forEach((key) => {
      assert.doesNotMatch(createOptions, new RegExp(`key:\\s*"${key}"`));
    });
  });

  it("preserves legacy modules when editing instead of remapping them", async () => {
    const source = await readDialogSource();

    assert.match(source, /form\.module = props\.item\.module \|\| "project"/);
    assert.doesNotMatch(source, /form\.module = normalizeDepartmentModule\(props\.item\.module\)/);
    assert.doesNotMatch(source, /aigc:\s*"design"/);
    assert.doesNotMatch(source, /motion:\s*"post"/);
    assert.doesNotMatch(source, /delivery:\s*"post"/);
    assert.match(source, /const scheduleDepartmentSelectionOptions = computed/);
    assert.match(source, /label:\s*`当前旧部门/);
    assert.match(source, /v-for="module in scheduleDepartmentSelectionOptions"/);
  });
});
