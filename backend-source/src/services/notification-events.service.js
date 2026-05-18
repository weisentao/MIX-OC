import { mysqlPool } from "../db/mysql.js";
import { createNotification, makeNotificationUid } from "../modules/notifications/notifications.service.js";

function cleanText(value = "") {
  return String(value || "").trim();
}

function actorUserId(auth = {}) {
  return cleanText(auth.sub || auth.id || auth.userId || auth.userUid || auth.user_uid || auth.username);
}

function actorDisplayName(auth = {}) {
  return cleanText(auth.name || auth.displayName || auth.display_name || auth.username || actorUserId(auth)) || "项目成员";
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function extractMentionTokens(text = "") {
  const tokens = [];
  const pattern = /@([^\s@,，。；;:：!！?？()[\]{}<>《》]+)/g;
  let match = pattern.exec(String(text || ""));
  while (match) {
    tokens.push(match[1]);
    match = pattern.exec(String(text || ""));
  }
  return uniqueValues(tokens);
}

function mentionInputValue(input) {
  if (input && typeof input === "object") {
    return cleanText(input.userId || input.userUid || input.user_uid || input.username || input.name || input.id);
  }
  return cleanText(input);
}

async function resolveUsersByAnyIds(values = []) {
  const cleanValues = uniqueValues(values);
  if (!cleanValues.length) return [];

  const users = [];
  const seen = new Set();
  for (const value of cleanValues) {
    const [rows] = await mysqlPool.execute(
      `
        SELECT user_uid, username, name, department
        FROM users
        WHERE user_uid = ? OR username = ? OR name = ?
        ORDER BY id ASC
        LIMIT 1
      `,
      [value, value, value]
    );
    const user = rows[0];
    if (!user?.user_uid || seen.has(user.user_uid)) continue;
    seen.add(user.user_uid);
    users.push(user);
  }
  return users;
}

async function resolveProjectCommentRecipients(project = {}, task = {}) {
  const recipientIds = new Set(uniqueValues([task.owner_user_uid, project.created_by]));
  const memberNames = [];

  const ownerText = cleanText(project.owner_text);
  if (ownerText) {
    memberNames.push(...ownerText.split(/[/:：]/).map(cleanText));
    memberNames.push(ownerText);
  }

  const projectUid = cleanText(project.project_uid || task.project_uid);
  if (projectUid) {
    const [memberRows] = await mysqlPool.execute(
      `
        SELECT user_uid, member_name
        FROM project_members
        WHERE project_uid = ? AND status = 'active'
      `,
      [projectUid]
    );
    for (const member of memberRows) {
      if (member.user_uid) recipientIds.add(member.user_uid);
      if (member.member_name) memberNames.push(member.member_name);
    }
  }

  const namedUsers = await resolveUsersByAnyIds(memberNames);
  for (const user of namedUsers) {
    recipientIds.add(user.user_uid);
  }

  return uniqueValues([...recipientIds]);
}

export async function createTaskCommentNotificationEvents({
  commentUid = "",
  task = {},
  project = {},
  text = "",
  mentionInputs = [],
  auth = {}
} = {}) {
  const cleanCommentUid = cleanText(commentUid);
  const cleanTaskUid = cleanText(task.task_uid || task.taskUid || task.taskId);
  const cleanProjectUid = cleanText(project.project_uid || task.project_uid || task.projectId);
  if (!cleanCommentUid || !cleanTaskUid) return { mentionedUsers: [], notifiedRecipients: [] };

  const actorId = actorUserId(auth);
  const actorName = actorDisplayName(auth);
  const mentionValues = [
    ...((Array.isArray(mentionInputs) ? mentionInputs : []).map(mentionInputValue)),
    ...extractMentionTokens(text)
  ];
  const mentionedUsers = (await resolveUsersByAnyIds(mentionValues)).filter((user) => user.user_uid !== actorId);

  for (const user of mentionedUsers) {
    await mysqlPool.execute(
      `
        INSERT INTO comment_mentions (
          mention_uid, comment_uid, task_uid, mentioned_user_uid, mentioned_username, is_read
        )
        VALUES (?, ?, ?, ?, ?, 0)
      `,
      [
        makeNotificationUid("mention", cleanCommentUid, user.user_uid),
        cleanCommentUid,
        cleanTaskUid,
        user.user_uid,
        user.username || user.name || ""
      ]
    );
  }

  const mentionedIds = new Set(mentionedUsers.map((user) => user.user_uid));
  const recipients = (await resolveProjectCommentRecipients(project, task))
    .filter((recipientId) => recipientId && recipientId !== actorId && !mentionedIds.has(recipientId));

  for (const recipientId of recipients) {
    await createNotification({
      notificationUid: makeNotificationUid("comment", cleanCommentUid, recipientId),
      type: "comment",
      recipientUserId: recipientId,
      title: `${actorName} 评论了项目任务`,
      text,
      resourceType: "task_comment",
      resourceId: cleanCommentUid,
      projectId: cleanProjectUid,
      taskId: cleanTaskUid,
      actorUserId: actorId,
      actorName,
      payload: {
        commentId: cleanCommentUid,
        projectName: project.name || "",
        taskTitle: task.title || ""
      }
    }, auth);
  }

  return {
    mentionedUsers,
    notifiedRecipients: recipients
  };
}

export async function createScheduleCommentNotificationEvents({
  commentUid = "",
  item = {},
  project = {},
  text = "",
  auth = {}
} = {}) {
  const cleanCommentUid = cleanText(commentUid);
  const cleanItemUid = cleanText(item.item_uid || item.itemId || item.id);
  const cleanProjectUid = cleanText(project.project_uid || item.project_uid || item.projectId);
  if (!cleanCommentUid || !cleanItemUid) return { notifiedRecipients: [] };

  const actorId = actorUserId(auth);
  const actorName = actorDisplayName(auth);
  const recipients = (await resolveProjectCommentRecipients(project, {
    project_uid: cleanProjectUid,
    owner_user_uid: item.owner_user_uid
  })).filter((recipientId) => recipientId && recipientId !== actorId);

  for (const recipientId of recipients) {
    await createNotification({
      notificationUid: makeNotificationUid("schedule_comment", cleanCommentUid, recipientId),
      type: "comment",
      recipientUserId: recipientId,
      title: `${actorName} 评论了项目排期`,
      text,
      resourceType: "schedule_comment",
      resourceId: cleanCommentUid,
      projectId: cleanProjectUid,
      taskId: item.task_uid || "",
      actorUserId: actorId,
      actorName,
      payload: {
        commentId: cleanCommentUid,
        scheduleItemId: cleanItemUid,
        projectName: project.name || "",
        taskTitle: item.title || ""
      }
    }, auth);
  }

  return { notifiedRecipients: recipients };
}

export const __private__ = {
  extractMentionTokens,
  mentionInputValue
};
