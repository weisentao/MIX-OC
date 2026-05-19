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
  it("renders the required schedule department tree in the requested order", async () => {
    const source = await readDialogSource();
    const createTree = source.match(/const scheduleDepartmentTree = \[[\s\S]*?\];/)?.[0] || "";

    [
      ["project", "项目管理"],
      ["aigc", "AIGC"],
      ["design", "美术设计"],
      ["threeD", "三维动态设计部"],
      ["motion", "动效设计"],
      ["post", "视效包装"]
    ].forEach(([key, label]) => {
      assert.match(createTree, new RegExp(`key:\\s*"${key}"[\\s\\S]*?label:\\s*"${label}"`));
    });

    ["design-1", "design-2", "post-1", "post-2", "post-3"].forEach((key) => {
      assert.match(createTree, new RegExp(`key:\\s*"${key}"`));
    });

    const order = ["project", "aigc", "design", "threeD", "motion", "post"].map((key) => createTree.indexOf(`key: "${key}"`));
    assert.deepEqual([...order].sort((a, b) => a - b), order);

    assert.match(source, /class="schedule-department-tree" role="tree"/);
    assert.match(source, /class="schedule-department-children" role="group"/);
    assert.match(source, /v-for="node in scheduleDepartmentSelectionOptions"/);
    assert.match(source, /v-for="child in node\.children"/);
    assert.match(source, /v-model="form\.module"/);
  });

  it("writes selected tree node keys through the existing schedule module payload field", async () => {
    const source = await readDialogSource();

    assert.match(source, /module:\s*form\.module/);
    assert.doesNotMatch(source, /department:\s*form\.module/);
    assert.doesNotMatch(source, /departmentKey:\s*form\.module/);
    ["design-1", "design-2", "post-1", "post-2", "post-3", "aigc", "motion"].forEach((key) => {
      assert.match(source, new RegExp(`value:\\s*"${key}"`));
    });
  });

  it("preserves legacy modules when editing instead of remapping them", async () => {
    const source = await readDialogSource();

    assert.match(source, /form\.module = props\.item\.module \|\| "project"/);
    assert.doesNotMatch(source, /form\.module = normalizeDepartmentModule\(props\.item\.module\)/);
    assert.doesNotMatch(source, /delivery:\s*"post"/);
    assert.match(source, /const scheduleDepartmentSelectionOptions = computed/);
    assert.match(source, /label:\s*`当前旧部门：/);
    assert.match(source, /v-for="node in scheduleDepartmentSelectionOptions"/);
  });
});
