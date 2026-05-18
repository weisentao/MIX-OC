import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createScheduleRowMovePlan,
  filterScheduleRows,
  getBarPreviewStyle,
  getBarStyle,
  getBarVisualStyle,
  getDateRangeFromDragDelta,
  getScheduleRowKind,
  getTimelineMetrics,
  sortScheduleRowsForTimeline,
  shouldShowWeekHeaderLabel
} from "../timelineLayout.js";

const range = { startDate: "2026/05/10", endDate: "2026/05/20" };
const layout = { dayWidth: 28, rowHeight: 34 };

describe("schedule timeline layout utilities", () => {
  it("positions a bar inside the visible range", () => {
    const style = getBarStyle({ startDate: "2026/05/12", endDate: "2026/05/14" }, range, layout);

    assert.deepEqual(style, {
      left: "0px",
      transform: "translateX(56px)",
      width: "84px",
      "--schedule-bar-left": "56px",
      "--schedule-bar-width": "84px"
    });
  });

  it("clips bars that overflow the left side", () => {
    const style = getBarStyle({ startDate: "2026/05/08", endDate: "2026/05/12" }, range, layout);

    assert.equal(style.transform, "translateX(0px)");
    assert.equal(style.width, "84px");
  });

  it("clips bars that overflow the right side", () => {
    const style = getBarStyle({ startDate: "2026/05/18", endDate: "2026/05/24" }, range, layout);

    assert.equal(style.transform, "translateX(224px)");
    assert.equal(style.width, "84px");
  });

  it("keeps single-day bars at one day wide", () => {
    const style = getBarStyle({ startDate: "2026/05/15", endDate: "2026/05/15" }, range, layout);

    assert.equal(style.width, "28px");
  });

  it("previews drag movement in pixels before dates are committed", () => {
    const preview = getBarPreviewStyle(
      { startDate: "2026/05/12", endDate: "2026/05/14" },
      range,
      layout,
      14,
      "move"
    );

    assert.equal(preview.left, "0px");
    assert.equal(preview.transform, "translateX(70px)");
    assert.equal(preview.width, "84px");
    assert.equal(preview["--schedule-bar-left"], "70px");
    assert.equal(preview["--schedule-bar-width"], "84px");
  });

  it("previews start and end resize width changes while the pointer is moving", () => {
    const item = { startDate: "2026/05/12", endDate: "2026/05/14" };
    const resizeStart = getBarPreviewStyle(item, range, layout, 15, "resize-start");
    const resizeEnd = getBarPreviewStyle(item, range, layout, 15, "resize-end");

    assert.equal(resizeStart.left, "0px");
    assert.equal(resizeStart.transform, "translateX(71px)");
    assert.equal(resizeStart.width, "69px");
    assert.equal(resizeStart["--schedule-bar-left"], "71px");
    assert.equal(resizeStart["--schedule-bar-width"], "69px");

    assert.equal(resizeEnd.left, "0px");
    assert.equal(resizeEnd.transform, "translateX(56px)");
    assert.equal(resizeEnd.width, "99px");
    assert.equal(resizeEnd["--schedule-bar-left"], "56px");
    assert.equal(resizeEnd["--schedule-bar-width"], "99px");
  });

  it("keeps resize previews at least one day wide", () => {
    const shrinkFromStart = getBarPreviewStyle(
      { startDate: "2026/05/12", endDate: "2026/05/14" },
      range,
      layout,
      200,
      "resize-start"
    );
    const shrinkFromEnd = getBarPreviewStyle(
      { startDate: "2026/05/12", endDate: "2026/05/14" },
      range,
      layout,
      -200,
      "resize-end"
    );

    assert.equal(shrinkFromStart.transform, "translateX(112px)");
    assert.equal(shrinkFromStart.width, "28px");
    assert.equal(shrinkFromEnd.transform, "translateX(56px)");
    assert.equal(shrinkFromEnd.width, "28px");
  });

  it("returns hidden metrics when dates are missing", () => {
    assert.deepEqual(getTimelineMetrics({ startDate: "", endDate: "" }, range, layout), {
      hidden: true,
      left: 0,
      width: 0,
      visibleStartDate: "",
      visibleEndDate: ""
    });
  });

  it("filters visible rows by schedule/task without mutating the shared item list", () => {
    const scheduleItem = { id: "si-1", type: "schedule", title: "排期" };
    const taskItem = { id: "task-1", type: "task", title: "任务" };
    const hiddenTask = { id: "task-2", type: "task", title: "隐藏任务", hidden: true };
    const items = [scheduleItem, taskItem, hiddenTask];

    assert.deepEqual(filterScheduleRows(items, "all"), [scheduleItem, taskItem]);
    assert.deepEqual(filterScheduleRows(items, "schedule"), [scheduleItem]);
    assert.deepEqual(filterScheduleRows(items, "task"), [taskItem]);
    assert.deepEqual(filterScheduleRows(items, "task", { showHiddenItems: true }), [taskItem, hiddenTask]);
    assert.equal(items.length, 3);
    assert.equal(filterScheduleRows(items, "schedule")[0], scheduleItem);
  });

  it("sorts all rows by required department order, then explicit row order, then stable input order", () => {
    const items = [
      { id: "post-1", module: "post", title: "后期合成 1" },
      { id: "design-late", module: "design", title: "美术设计 late", sortOrder: 20 },
      { id: "aigc-1", module: "aigc", title: "AIGC 1" },
      { id: "project-2", module: "project", title: "项目管理 stable 2" },
      { id: "design-early", module: "design", title: "美术设计 early", sortOrder: 10 },
      { id: "motion-1", module: "motion", title: "动效设计 1" },
      { id: "threeD-1", module: "threeD", title: "三维动态 1" },
      { id: "project-1", module: "project", title: "项目管理 stable 1" }
    ];

    const sorted = sortScheduleRowsForTimeline(items);

    assert.notEqual(sorted, items);
    assert.deepEqual(sorted.map((item) => item.id), [
      "project-2",
      "project-1",
      "aigc-1",
      "design-early",
      "design-late",
      "threeD-1",
      "motion-1",
      "post-1"
    ]);
  });

  it("returns a same-department move plan and rejects cross-department moves", () => {
    const rows = sortScheduleRowsForTimeline([
      { id: "design-first", module: "design", sortOrder: 10 },
      { id: "project-top", module: "project", sortOrder: 10 },
      { id: "design-second", module: "design", sortOrder: 20 }
    ]);

    const invalid = createScheduleRowMovePlan(rows, "design-first", "up");
    const valid = createScheduleRowMovePlan(rows, "design-first", "down");

    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, "crossDepartment");
    assert.equal(valid.ok, true);
    assert.deepEqual(
      valid.updates.map((update) => [update.id, update.sortOrder]),
      [
        ["design-second", 100],
        ["design-first", 200]
      ]
    );
  });

  it("returns thick schedule bars and readable task lines", () => {
    assert.equal(getScheduleRowKind({ type: "schedule" }), "schedule");
    assert.equal(getScheduleRowKind({ type: "task" }), "task");
    assert.deepEqual(getBarVisualStyle({ type: "schedule" }, layout), {
      height: "18px",
      top: "8px",
      "--schedule-bar-height": "18px",
      "--schedule-bar-top": "8px"
    });
    assert.deepEqual(getBarVisualStyle({ type: "task" }, layout), {
      height: "8px",
      top: "13px",
      "--schedule-bar-height": "8px",
      "--schedule-bar-top": "13px"
    });
  });

  it("hides week header labels only when their block is too narrow", () => {
    assert.equal(shouldShowWeekHeaderLabel({ days: [{}], isSingleDay: true }, layout), false);
    assert.equal(shouldShowWeekHeaderLabel({ days: [{}], isSingleDay: true }, { ...layout, dayWidth: 48 }), true);
    assert.equal(shouldShowWeekHeaderLabel({ days: Array.from({ length: 7 }), isSingleDay: false }, layout), true);
  });

  it("moves and resizes date ranges from horizontal drag deltas", () => {
    assert.deepEqual(getDateRangeFromDragDelta({ startDate: "2026/05/12", endDate: "2026/05/14" }, 29, layout, "move"), {
      startDate: "2026/05/13",
      endDate: "2026/05/15"
    });

    assert.deepEqual(getDateRangeFromDragDelta({ startDate: "2026/05/12", endDate: "2026/05/14" }, -30, layout, "resize-start"), {
      startDate: "2026/05/11",
      endDate: "2026/05/14"
    });

    assert.deepEqual(getDateRangeFromDragDelta({ startDate: "2026/05/12", endDate: "2026/05/14" }, -100, layout, "resize-end"), {
      startDate: "2026/05/12",
      endDate: "2026/05/12"
    });
  });
});
