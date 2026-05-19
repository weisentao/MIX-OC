import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { __private__ } from "../src/services/template.service.js";

test("template response includes recipients + permission in templateShareInfo", () => {
  const response = __private__.buildTemplatesResponse(
    [
      {
        template_uid: "tg-task",
        title: "task-group",
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
        title: "template-a",
        group_key: "task",
        parent_template_uid: "tg-task",
        owner_user_uid: "u-owner",
        owner_name: "Owner",
        visibility: "private",
        is_locked: 0,
        sort_order: 2,
        task_count: 1,
        content_json: "{\"tasks\":[{\"title\":\"Kickoff\"}]}",
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
            share_uid: "share-1",
            template_uid: "tpl-task",
            from_user_uid: "u-owner",
            from_user_name: "Owner",
            to_user_uid: "u-reader",
            to_user_name: "Reader",
            permission: "read",
            status: "active",
            payload_json: "{\"userName\":\"Reader\",\"fromUserName\":\"Owner\"}"
          },
          {
            share_uid: "share-2",
            template_uid: "tpl-task",
            from_user_uid: "u-owner",
            from_user_name: "Owner",
            to_user_uid: "u-editor",
            to_user_name: "Editor",
            permission: "write",
            status: "active",
            payload_json: "{\"userName\":\"Editor\",\"fromUserName\":\"Owner\"}"
          }
        ]
      ]
    ]),
    { sub: "u-owner", name: "Owner" }
  );

  assert.deepEqual(response.templateShareInfo["template-a"], {
    shared: true,
    sharedWith: ["Reader", "Editor"],
    fromUser: "Owner",
    recipients: [
      { userId: "u-reader", userName: "Reader", permission: "read" },
      { userId: "u-editor", userName: "Editor", permission: "edit" }
    ],
    permissions: {
      "u-reader": "read",
      "u-editor": "edit"
    }
  });

  // New keyed contract: same share info also available by template_uid/templateId.
  assert.deepEqual(response.templateShareInfo["tpl-task"], response.templateShareInfo["template-a"]);
});

test("template share info supports id and title keyed lookup to avoid title collision", () => {
  const keyed = __private__.buildTemplateShareInfoLookup({
    id: "tpl-unique-001",
    templateId: "tpl-unique-001",
    legacyTemplateId: "legacy-001",
    title: "same-name-template",
    name: "same-name-template",
    shares: [
      { userId: "u-editor", userName: "Editor", permission: "write", status: "active", fromUser: "Owner" }
    ]
  });

  assert.deepEqual(keyed["tpl-unique-001"], keyed["same-name-template"]);
  assert.deepEqual(keyed["legacy-001"], keyed["same-name-template"]);
  assert.deepEqual(keyed["tpl-unique-001"], {
    shared: true,
    sharedWith: ["Editor"],
    fromUser: "Owner",
    recipients: [{ userId: "u-editor", userName: "Editor", permission: "edit" }],
    permissions: { "u-editor": "edit" }
  });
});

test("edit/write shared user can edit template content but cannot manage shares by default", () => {
  const row = {
    owner_user_uid: "u-owner",
    created_by: "u-owner"
  };
  const editorAuth = { sub: "u-editor", role: "employee" };

  assert.equal(__private__.canEditTemplateRow(row, editorAuth, "write"), true);
  assert.equal(__private__.canEditTemplateRow(row, editorAuth, "edit"), true);
  assert.equal(__private__.canManageTemplateRow(row, editorAuth, "write"), false);
  assert.equal(__private__.canManageTemplateRow(row, editorAuth, "manage"), true);
});

test("normalizeShareEntries supports entries/recipients/sharedWith+permissions and returns deduped final entries", () => {
  const entries = __private__.normalizeShareEntries({
    entries: [{ userId: "u-a", userName: "User A", permission: "edit" }],
    recipients: [{ userId: "u-b", userName: "User B", permission: "write" }],
    sharedWith: ["u-c"],
    permissions: { "u-c": "read" }
  });

  assert.deepEqual(entries, [
    { userId: "u-a", userName: "User A", permission: "write", note: "" },
    { userId: "u-b", userName: "User B", permission: "write", note: "" },
    { userId: "u-c", userName: "u-c", permission: "read", note: "" }
  ]);
});

test("share mutation result returns final normalized recipients and permission maps", () => {
  const result = __private__.buildTemplateShareMutationResult({
    id: "tpl-2",
    shares: [
      { userId: "u-a", userName: "User A", permission: "read", status: "active", fromUser: "Owner" },
      { userId: "u-b", userName: "User B", permission: "owner", status: "active", fromUser: "Owner" }
    ]
  });

  assert.deepEqual(result, {
    templateId: "tpl-2",
    templateUid: "tpl-2",
    shared: true,
    sharedWith: ["User A", "User B"],
    fromUser: "Owner",
    recipients: [
      { userId: "u-a", userName: "User A", permission: "read" },
      { userId: "u-b", userName: "User B", permission: "edit" }
    ],
    entries: [
      { userId: "u-a", userName: "User A", permission: "read" },
      { userId: "u-b", userName: "User B", permission: "edit" }
    ],
    permissions: {
      "u-a": "read",
      "u-b": "edit"
    }
  });
});

test("template service create/update/get/list stay persistence-backed", async () => {
  const source = await readFile("src/services/template.service.js", "utf8");
  const createStart = source.indexOf("export async function createTemplate(payload = {}, auth = {})");
  const updateStart = source.indexOf("export async function updateTemplate(templateId, payload = {}, auth = {})");
  const getStart = source.indexOf("export async function getTemplate(templateId, auth = {})");
  const listStart = source.indexOf("export async function listTemplates(auth = {}, query = {})");
  const deleteStart = source.indexOf("export async function deleteTemplate(templateId, auth = {})", updateStart);
  const createBody = source.slice(createStart, updateStart);
  const updateBody = source.slice(updateStart, deleteStart);
  const getBody = source.slice(getStart, createStart);
  const listBody = source.slice(listStart, getStart);

  assert.match(createBody, /INSERT INTO templates/);
  assert.match(createBody, /return buildTemplateDetail\(await resolveTemplate\(templateUid\)\)/);
  assert.match(updateBody, /UPDATE templates/);
  assert.match(updateBody, /content_json = \?,/);
  assert.match(updateBody, /payload_json = \?,/);
  assert.match(updateBody, /return buildTemplateDetail\(await resolveTemplate\(current\.template_uid\)\)/);
  assert.match(getBody, /const template = await resolveTemplate\(templateId\)/);
  assert.match(getBody, /return buildTemplateDetail\(template\)/);
  assert.match(listBody, /FROM templates t/);
  assert.match(listBody, /return buildTemplatesResponse\(rows, sharesByTemplate, auth\)/);
});

test("template share mutation returns final normalized status payload", async () => {
  const source = await readFile("src/services/template.service.js", "utf8");
  const shareStart = source.indexOf("export async function shareTemplate(templateId, payload = {}, auth = {})");
  const unshareStart = source.indexOf("export async function unshareTemplate(templateId, userId, auth = {})", shareStart);
  const copyStart = source.indexOf("export async function copyTemplate(templateId, payload = {}, auth = {})", unshareStart);
  const shareBody = source.slice(shareStart, unshareStart);
  const unshareBody = source.slice(unshareStart, copyStart);

  assert.match(shareBody, /const entries = normalizeShareEntries\(payload\)/);
  assert.match(shareBody, /shareResult: buildTemplateShareMutationResult\(detail\.template\)/);
  assert.match(shareBody, /templateShareInfo: buildTemplateShareInfoLookup\(detail\.template\)/);
  assert.match(unshareBody, /shareResult: buildTemplateShareMutationResult\(detail\.template\)/);
  assert.match(unshareBody, /templateShareInfo: buildTemplateShareInfoLookup\(detail\.template\)/);
});

test("template apply creates project with tasks from task template content", async () => {
  const source = await readFile("src/services/template.service.js", "utf8");
  const helperStart = source.indexOf("async function createProjectFromTaskTemplate(connection, template = {}, payload = {}, auth = {})");
  const shareStart = source.indexOf("export async function shareTemplate(templateId, payload = {}, auth = {})", helperStart);
  const applyStart = source.indexOf("export async function applyTemplate(templateId, payload = {}, auth = {})", shareStart);
  const privateStart = source.indexOf("export const __private__ =", applyStart);
  const helperBody = source.slice(helperStart, shareStart);
  const applyBody = source.slice(applyStart, privateStart);

  assert.match(helperBody, /INSERT INTO projects/);
  assert.match(helperBody, /INSERT INTO tasks/);
  assert.match(helperBody, /const tasks = templateTasksFromContent/);
  assert.match(applyBody, /if \(template\.kind === "task" && payload\.createProject !== false\)/);
  assert.match(applyBody, /createdProject = await createProjectFromTaskTemplate/);
  assert.match(applyBody, /projectId: createdProject\?\.id \|\| payload\.projectId \|\| null/);
  assert.match(applyBody, /project: createdProject/);
});
