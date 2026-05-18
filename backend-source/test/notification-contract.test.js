import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { __private__ } from "../src/modules/notifications/notifications.service.js";

const routesSource = readFileSync(new URL("../src/modules/notifications/notifications.routes.js", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../src/modules/notifications/notifications.service.js", import.meta.url), "utf8");
const notificationEventsSource = readFileSync(new URL("../src/services/notification-events.service.js", import.meta.url), "utf8");
const workspaceServiceSource = readFileSync(new URL("../src/services/workspace.service.js", import.meta.url), "utf8");
const scheduleServiceSource = readFileSync(new URL("../src/services/schedule.service.js", import.meta.url), "utf8");
const hrServiceSource = readFileSync(new URL("../src/modules/hr/hr.service.js", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8");
const mysqlSource = readFileSync(new URL("../src/db/mysql.js", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../src/db/migrations/20260517_002_notifications.sql", import.meta.url), "utf8");

test("bell notification API exposes authenticated list and read contracts", () => {
  assert.match(routesSource, /router\.get\("\/notifications", authRequired, getNotifications\)/);
  assert.match(routesSource, /router\.get\("\/workspace\/notifications", authRequired, getNotifications\)/);
  assert.match(routesSource, /router\.get\("\/notifications\/unread-count", authRequired, getNotificationsUnreadCount\)/);
  assert.match(routesSource, /router\.get\("\/workspace\/notifications\/unread-count", authRequired, getNotificationsUnreadCount\)/);
  assert.match(routesSource, /router\.patch\("\/notifications\/read-all", authRequired, patchNotificationsReadAll\)/);
  assert.match(routesSource, /router\.patch\("\/workspace\/notifications\/read-all", authRequired, patchNotificationsReadAll\)/);
  assert.match(routesSource, /router\.patch\("\/notifications\/:id\/read", authRequired, patchNotificationRead\)/);
  assert.match(routesSource, /router\.patch\("\/workspace\/notifications\/:id\/read", authRequired, patchNotificationRead\)/);
  assert.match(serviceSource, /fetchExplicitNotifications/);
  assert.match(serviceSource, /fetchMentionNotifications/);
});

test("bell notification schema is available in bootstrap schema and migration", () => {
  for (const source of [schemaSource, mysqlSource, migrationSource]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS notifications/);
    assert.match(source, /notification_uid VARCHAR\(64\) NOT NULL/);
    assert.match(source, /recipient_user_uid VARCHAR\(64\) NOT NULL/);
    assert.match(source, /type VARCHAR\(64\) NOT NULL DEFAULT 'general'/);
    assert.match(source, /KEY idx_notifications_recipient_read_created/);
  }
});

test("bell notification rows include visible data for mentions, comments, and assignments", () => {
  const mention = __private__.mapMentionNotification({
    mention_uid: "mention-1",
    comment_uid: "comment-1",
    task_uid: "task-1",
    is_read: 0,
    user_name: "陈凌峰",
    content_text: "请 @我 看一下这个返工点",
    project_uid: "project-1",
    project_name: "示例项目",
    task_title: "检查分镜"
  });
  assert.equal(mention.id, "mention:mention-1");
  assert.equal(mention.type, "mention");
  assert.match(mention.title, /@/);
  assert.equal(mention.projectName, "示例项目");
  assert.equal(mention.taskTitle, "检查分镜");
  assert.equal(mention.isRead, false);

  const comment = __private__.mapExplicitNotification({
    notification_uid: "notice-comment-1",
    type: "comment",
    title: "王老师评论了任务",
    content_text: "模型需要补一版侧面图",
    resource_type: "task_comment",
    resource_uid: "comment-2",
    project_uid: "project-1",
    task_uid: "task-2",
    actor_name: "王老师",
    is_read: 0,
    payload_json: JSON.stringify({ projectName: "角色项目", taskTitle: "角色设定" })
  });
  assert.equal(comment.id, "notification:notice-comment-1");
  assert.equal(comment.type, "comment");
  assert.equal(comment.resourceType, "task_comment");
  assert.equal(comment.resourceId, "comment-2");
  assert.equal(comment.projectName, "角色项目");
  assert.equal(comment.taskTitle, "角色设定");

  const assignment = __private__.mapExplicitNotification({
    notification_uid: "notice-assignment-1",
    type: "task_assignment",
    title: "领导分配了任务",
    content_text: "请负责场景灯光排期",
    resource_type: "task",
    resource_uid: "task-3",
    project_uid: "project-2",
    task_uid: "task-3",
    actor_name: "主管",
    is_read: 0,
    payload_json: JSON.stringify({ projectName: "短片项目", taskTitle: "场景灯光" })
  });
  assert.equal(assignment.type, "task_assignment");
  assert.equal(assignment.resourceType, "task");
  assert.equal(assignment.projectName, "短片项目");
  assert.equal(assignment.taskTitle, "场景灯光");
  assert.equal(assignment.isRead, false);
});

test("comment and HR assignment writes create bell notifications", () => {
  assert.match(workspaceServiceSource, /createTaskCommentNotificationEvents\(\{\s*[\s\S]*commentUid[\s\S]*mentionInputs/);
  assert.match(notificationEventsSource, /extractMentionTokens\(text\)/);
  assert.match(notificationEventsSource, /resolveProjectCommentRecipients\(project, task\)/);
  assert.match(notificationEventsSource, /type:\s*"comment"[\s\S]*resourceType:\s*"task_comment"[\s\S]*resourceId:\s*cleanCommentUid/);
  assert.match(scheduleServiceSource, /createScheduleCommentNotificationEvents\(\{\s*[\s\S]*commentUid[\s\S]*item:\s*current/);
  assert.match(hrServiceSource, /makeNotificationUid\("task_assignment"[\s\S]*assignment\.assigneeId\)/);
  assert.match(hrServiceSource, /createNotification\(\{\s*[\s\S]*type:\s*"task_assignment"[\s\S]*recipientUserId:\s*assignment\.assigneeId/);
  assert.match(hrServiceSource, /resourceType:\s*"task"[\s\S]*resourceId:\s*assignment\.taskUid/);
});

test("bell notification read operations stay scoped to current user", () => {
  assert.match(serviceSource, /WHERE notification_uid = \?[\s\S]*AND recipient_user_uid = \?/);
  assert.match(serviceSource, /UPDATE comment_mentions cm[\s\S]*WHERE cm\.mention_uid = \?[\s\S]*AND \$\{mentionWhere\.sql\}/);
  assert.match(serviceSource, /SELECT COUNT\(\*\) AS count FROM notifications WHERE recipient_user_uid = \? AND is_read = 0/);
  assert.match(serviceSource, /SELECT COUNT\(\*\) AS count FROM comment_mentions cm WHERE \$\{mentionWhere\.sql\} AND cm\.is_read = 0/);
});
