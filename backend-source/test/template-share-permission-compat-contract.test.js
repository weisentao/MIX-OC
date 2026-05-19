import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { __private__ } from "../src/services/template.service.js";

test("template share entries support batch payload shapes and keep compatibility aliases", () => {
  const { normalizeShareEntries } = __private__;

  assert.deepEqual(normalizeShareEntries([{ userId: "u-array" }]), [
    { userId: "u-array", userName: "u-array", permission: "read", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ entries: [{ userId: "u-entries" }] }), [
    { userId: "u-entries", userName: "u-entries", permission: "read", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ recipients: [{ userId: "u-recipients" }] }), [
    { userId: "u-recipients", userName: "u-recipients", permission: "read", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ sharedWith: ["u-shared"] }), [
    { userId: "u-shared", userName: "u-shared", permission: "read", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ users: [{ userId: "u-users" }] }), [
    { userId: "u-users", userName: "u-users", permission: "read", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ userIds: ["u-1", "u-2"] }), [
    { userId: "u-1", userName: "u-1", permission: "read", note: "" },
    { userId: "u-2", userName: "u-2", permission: "read", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ userId: "u-single", permission: "write" }), [
    { userId: "u-single", userName: "u-single", permission: "write", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ userIds: ["u-keep"], permissions: { "u-keep": "edit" } }), [
    { userId: "u-keep", userName: "u-keep", permission: "write", note: "" }
  ]);
  assert.deepEqual(normalizeShareEntries({ userIds: ["u-dedupe"], entries: [{ userId: "u-dedupe", permission: "read" }] }), [
    { userId: "u-dedupe", userName: "u-dedupe", permission: "read", note: "" }
  ]);
});

test("template share permissions normalize write/edit aliases to unified client permissions", () => {
  const { mapShareRow, buildTemplatesResponse } = __private__;

  const writeAlias = mapShareRow({
    permission: "write",
    to_user_uid: "u-write",
    payload_json: "{\"userName\":\"Writer\"}"
  });
  const editAlias = mapShareRow({
    permission: "edit",
    to_user_uid: "u-edit",
    payload_json: "{\"userName\":\"Editor\"}"
  });
  const readAlias = mapShareRow({
    permission: "read",
    to_user_uid: "u-read",
    payload_json: "{\"userName\":\"Reader\"}"
  });

  assert.equal(writeAlias.permission, "edit");
  assert.equal(writeAlias.permissionCode, "write");
  assert.equal(editAlias.permission, "edit");
  assert.equal(editAlias.permissionCode, "write");
  assert.equal(readAlias.permission, "read");
  assert.equal(readAlias.permissionCode, "read");

  const response = buildTemplatesResponse(
    [
      {
        template_uid: "group-task",
        title: "任务模板目录",
        group_key: "task",
        parent_template_uid: "",
        owner_user_uid: "u-owner",
        owner_name: "Owner",
        visibility: "private",
        is_locked: 0,
        sort_order: 1,
        task_count: 0,
        content_json: "{}",
        payload_json: "{\"kind\":\"task\",\"isGroup\":true}",
        created_by: "u-owner",
        updated_by: "u-owner"
      },
      {
        template_uid: "tpl-task",
        title: "上线任务模板",
        group_key: "task",
        parent_template_uid: "group-task",
        owner_user_uid: "u-owner",
        owner_name: "Owner",
        visibility: "private",
        is_locked: 0,
        sort_order: 2,
        task_count: 0,
        content_json: "{\"tasks\":[]}",
        payload_json: "{\"kind\":\"task\"}",
        created_by: "u-owner",
        updated_by: "u-owner"
      }
    ],
    new Map([
      [
        "tpl-task",
        [
          {
            share_uid: "share-read",
            template_uid: "tpl-task",
            from_user_uid: "u-owner",
            from_user_name: "Owner",
            to_user_uid: "u-read",
            to_user_name: "Reader",
            permission: "read",
            status: "active",
            payload_json: "{\"userName\":\"Reader\",\"fromUserName\":\"Owner\"}"
          },
          {
            share_uid: "share-write",
            template_uid: "tpl-task",
            from_user_uid: "u-owner",
            from_user_name: "Owner",
            to_user_uid: "u-write",
            to_user_name: "Writer",
            permission: "write",
            status: "active",
            payload_json: "{\"userName\":\"Writer\",\"fromUserName\":\"Owner\"}"
          },
          {
            share_uid: "share-edit",
            template_uid: "tpl-task",
            from_user_uid: "u-owner",
            from_user_name: "Owner",
            to_user_uid: "u-edit",
            to_user_name: "Editor",
            permission: "edit",
            status: "active",
            payload_json: "{\"userName\":\"Editor\",\"fromUserName\":\"Owner\"}"
          }
        ]
      ]
    ]),
    { sub: "u-owner", name: "Owner" }
  );

  assert.deepEqual(response.templateShareInfo["上线任务模板"].recipients, [
    { userId: "u-read", userName: "Reader", permission: "read" },
    { userId: "u-write", userName: "Writer", permission: "edit" },
    { userId: "u-edit", userName: "Editor", permission: "edit" }
  ]);
  assert.deepEqual(response.templateShareInfo["上线任务模板"].permissions, {
    "u-read": "read",
    "u-write": "edit",
    "u-edit": "edit"
  });
});

test("template share service persists normalized permissions for batch recipients", async () => {
  const source = await readFile("src/services/template.service.js", "utf8");
  const start = source.indexOf("export async function shareTemplate(templateId, payload = {}, auth = {})");
  const end = source.indexOf("export async function unshareTemplate(templateId, userId, auth = {})", start);
  assert.notEqual(start, -1, "shareTemplate should exist");
  assert.notEqual(end, -1, "unshareTemplate should follow shareTemplate");
  const shareSource = source.slice(start, end);

  assert.match(shareSource, /const entries = normalizeShareEntries\(payload\)/);
  assert.match(shareSource, /for \(const entry of entries\)/);
  assert.match(shareSource, /normalizePermission\(entry\.permission\)/);
  assert.match(shareSource, /permission = VALUES\(permission\)/);
});
