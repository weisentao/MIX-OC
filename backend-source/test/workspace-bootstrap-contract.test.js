import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

function sliceFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} should exist`);
  const end = nextSignature ? source.indexOf(nextSignature, start) : source.length;
  assert.notEqual(end, -1, `${nextSignature} should follow ${signature}`);
  return source.slice(start, end);
}

test("workspace bootstrap returns stable frontend contract fields without undefined gaps", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const bootstrapSource = sliceFunction(
    source,
    "export async function getBootstrapState(auth = {})",
    "export async function listProjectGroups"
  );

  for (const field of [
    "users",
    "contacts",
    "currentUserId",
    "templates",
    "templateShareInfo",
    "carouselNotices",
    "boardHistory"
  ]) {
    assert.match(bootstrapSource, new RegExp(`${field}:`), `bootstrap should return ${field}`);
  }

  assert.match(source, /function mapBootstrapUser\(row = {}\)/);
  for (const field of ["id", "userId", "userUid", "username", "name", "department", "role", "status", "job", "phone", "email", "mbti", "profileNote", "characterLabel", "avatarImage", "characterImage", "signatureImage"]) {
    assert.match(source, new RegExp(`${field}:`), `bootstrap users should include ${field}`);
  }

  assert.match(bootstrapSource, /users: await fetchBootstrapUsers\(\)/);
  assert.match(bootstrapSource, /contacts: await listContacts\(auth, \{ relationType: "care" \}\)/);
  assert.match(bootstrapSource, /const templateState = await fetchBootstrapTemplates\(auth\)/);
  assert.match(bootstrapSource, /templates: templateState\.templates/);
  assert.match(bootstrapSource, /templateShareInfo: templateState\.templateShareInfo/);
  assert.match(bootstrapSource, /const carouselNotices = await listWorkspaceCarouselNotices\(auth\)/);
  assert.match(bootstrapSource, /carouselNotices,/);
  assert.match(bootstrapSource, /boardHistory: \[\]/);
});

test("workspace projects keep numeric and uid project id aliases", async () => {
  const source = await readFile("src/services/workspace.service.js", "utf8");
  const mapProjectSource = sliceFunction(source, "function mapProject(row, tasks = [], members = [], tags = [])", "async function fetchProjectGroups");

  assert.match(mapProjectSource, /id:\s*Number\(row\.legacy_project_id \|\| row\.id\)/);
  assert.match(mapProjectSource, /projectId:\s*row\.project_uid/);
  assert.match(mapProjectSource, /projectUid:\s*row\.project_uid \|\| ""/);
  assert.match(mapProjectSource, /legacyProjectId:\s*Number\(row\.legacy_project_id \|\| row\.id\)/);
});
