import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFallbackSchedule,
  normalizeScheduleDependency,
  normalizeScheduleItem,
  normalizeSchedulePlan,
  taskToScheduleItem
} from "../scheduleNormalize.js";

describe("schedule data normalization", () => {
  it("normalizes backend item fields into frontend camelCase", () => {
    const item = normalizeScheduleItem({
      item_id: "si-1",
      plan_id: "sp-1",
      project_id: "1003",
      task_uid: "t-8",
      start_date: "2026-05-10",
      end_date: "2026-05-12",
      sort_order: "20",
      link_task: 1,
      link_flow: 0,
      dependency_ids: ["si-0"],
      comments_count: "3",
      payload: { source: "api" }
    });

    assert.equal(item.id, "si-1");
    assert.equal(item.itemId, "si-1");
    assert.equal(item.planId, "sp-1");
    assert.equal(item.projectId, 1003);
    assert.equal(item.taskUid, "t-8");
    assert.equal(item.startDate, "2026/05/10");
    assert.equal(item.endDate, "2026/05/12");
    assert.equal(item.sortOrder, 20);
    assert.equal(item.linkTask, true);
    assert.equal(item.linkFlow, false);
    assert.deepEqual(item.dependencyIds, ["si-0"]);
    assert.equal(item.commentsCount, 3);
    assert.deepEqual(item.payload, { source: "api" });
  });

  it("preserves string project ids and backend schedule aliases", () => {
    const item = normalizeScheduleItem({
      id: "task-task-1",
      projectId: "project-uid-001",
      scheduleItemId: "si-real-001",
      workItemId: "wi-real-001",
      title: "String project task"
    });
    const plan = normalizeSchedulePlan({
      id: "sp-string",
      projectId: "project-uid-001"
    });
    const schedule = buildFallbackSchedule({
      project: { id: "project-uid-001", name: "String project" },
      tasks: [{ id: "task-1", title: "Fallback task" }]
    });

    assert.equal(item.projectId, "project-uid-001");
    assert.equal(item.scheduleItemId, "si-real-001");
    assert.equal(item.workItemId, "wi-real-001");
    assert.equal(plan.projectId, "project-uid-001");
    assert.equal(schedule.plan.projectId, "project-uid-001");
    assert.equal(schedule.items[0].projectId, "project-uid-001");
  });

  it("creates schedule items from existing tasks for fallback", () => {
    const item = taskToScheduleItem(
      {
        id: 1300101,
        title: "Style frame",
        type: "flow",
        module: "design",
        owner: "Design: Ann",
        startDate: "2026/05/16",
        endDate: "2026/05/19",
        scheduleStatus: "doing",
        progress: 40,
        archived: false
      },
      1003,
      "sp-fallback-1003",
      2
    );

    assert.equal(item.id, "task-1300101");
    assert.equal(item.taskUid, "1300101");
    assert.equal(item.type, "task");
    assert.equal(item.title, "Style frame");
    assert.equal(item.planId, "sp-fallback-1003");
    assert.equal(item.sortOrder, 300);
    assert.equal(item.linkTask, true);
    assert.equal(item.linkFlow, true);
  });

  it("copies task comments, status, commentsCount, and list order into schedule fallback items", () => {
    const item = taskToScheduleItem(
      {
        id: 1300102,
        title: "Motion pass",
        module: "motion",
        startDate: "2026/05/16",
        endDate: "2026/05/18",
        status: "review",
        order: 42,
        commentsCount: 9,
        comments: [
          {
            id: "task-c-1",
            user: "Producer",
            time: "2026/05/15 09:00",
            text: "Task chat must follow schedule"
          }
        ]
      },
      1003,
      "sp-fallback-1003",
      0
    );

    assert.equal(item.status, "review");
    assert.equal(item.sortOrder, 42);
    assert.equal(item.commentsCount, 9);
    assert.equal(item.comments.length, 1);
    assert.equal(item.comments[0].content, "Task chat must follow schedule");
    assert.equal(item.comments[0].payload.taskUid, "1300102");
    assert.equal(item.payload.source, "taskFallback");
  });

  it("normalizes full schedule responses", () => {
    const plan = normalizeSchedulePlan({
      id: "sp-001",
      project_id: 1003,
      title: "Project schedule",
      start_date: "2026/05/10",
      end_date: "2026/06/21",
      view_config: { day_width: 28, row_height: 34 },
      summary: { item_count: 2 }
    });

    assert.equal(plan.id, "sp-001");
    assert.equal(plan.projectId, 1003);
    assert.equal(plan.startDate, "2026/05/10");
    assert.equal(plan.viewConfig.dayWidth, 28);
    assert.equal(plan.summary.itemCount, 2);
  });

  it("normalizes dependencies and builds a fallback plan from tasks", () => {
    const dependency = normalizeScheduleDependency({
      id: "sd-1",
      from_item_id: "si-1",
      to_item_id: "si-2",
      type: "finish_to_start",
      lag_days: "1"
    });
    const schedule = buildFallbackSchedule({
      project: { id: 1003, name: "Demo", startDate: "2026/05/10", endDate: "2026/05/20" },
      tasks: [{ id: 1, title: "Task A", startDate: "2026/05/11", endDate: "2026/05/12" }]
    });

    assert.deepEqual(dependency, {
      id: "sd-1",
      fromItemId: "si-1",
      toItemId: "si-2",
      type: "finish_to_start",
      lagDays: 1,
      payload: {}
    });
    assert.equal(schedule.plan.projectId, 1003);
    assert.equal(schedule.plan.id, "sp-fallback-1003");
    assert.equal(schedule.items.length, 1);
    assert.deepEqual(schedule.dependencies, []);
  });

  it("keeps task list order and task comment metadata when building fallback schedule", () => {
    const schedule = buildFallbackSchedule({
      project: { id: 1003, name: "Demo" },
      tasks: [
        {
          id: 1,
          title: "Second in custom order",
          startDate: "2026/05/13",
          endDate: "2026/05/14",
          scheduleStatus: "doing",
          sortOrder: 200,
          comments: [{ id: "c-1", user: "A", time: "2026/05/15 10:00", text: "Keep me" }]
        },
        {
          id: 2,
          title: "First in custom order",
          startDate: "2026/05/11",
          endDate: "2026/05/12",
          scheduleStatus: "todo",
          sortOrder: 100,
          comments: []
        }
      ]
    });

    assert.deepEqual(
      schedule.items.map((item) => item.taskUid),
      ["1", "2"]
    );
    assert.deepEqual(
      schedule.items.map((item) => item.sortOrder),
      [200, 100]
    );
    assert.equal(schedule.items[0].status, "doing");
    assert.equal(schedule.items[0].comments[0].content, "Keep me");
  });
});
