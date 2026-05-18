import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffScheduleSnapshot } from "../snapshotDiff.js";

describe("schedule snapshot diff", () => {
  it("reports added, removed, and changed schedule items", () => {
    const diff = diffScheduleSnapshot(
      [
        {
          id: "si-1",
          title: "Storyboard",
          module: "design",
          startDate: "2026/05/10",
          endDate: "2026/05/12",
          status: "todo"
        },
        {
          id: "si-removed",
          title: "Old task",
          module: "project",
          startDate: "2026/05/11",
          endDate: "2026/05/11",
          status: "done"
        }
      ],
      [
        {
          id: "si-1",
          title: "Storyboard polish",
          module: "design",
          startDate: "2026/05/11",
          endDate: "2026/05/13",
          status: "doing"
        },
        {
          id: "si-added",
          title: "New task",
          module: "post",
          startDate: "2026/05/14",
          endDate: "2026/05/15",
          status: "todo"
        }
      ]
    );

    assert.deepEqual(diff.summary, { added: 1, removed: 1, changed: 1 });
    assert.deepEqual(diff.added.map((item) => item.id), ["si-added"]);
    assert.deepEqual(diff.removed.map((item) => item.id), ["si-removed"]);
    assert.deepEqual(diff.changed[0].changeTypes, ["dateChanged", "statusChanged", "titleChanged"]);
  });
});
