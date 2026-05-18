import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Readable } from "node:stream";
import { STORAGE_METADATA_TABLE_SQL } from "../src/modules/storage/storage.schema.js";
import { parseMultipartFormData } from "../src/modules/storage/multipart.js";
import { createStorageService, __private__ } from "../src/modules/storage/storage.service.js";

async function makeTempStorageRoot() {
  const root = path.join(os.tmpdir(), `xjg-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

test("storage table ensure SQL records restorable metadata with indexes", () => {
  assert.match(STORAGE_METADATA_TABLE_SQL, /CREATE TABLE IF NOT EXISTS storage_files/i);
  assert.match(STORAGE_METADATA_TABLE_SQL, /storage_uid VARCHAR\(64\) NOT NULL/i);
  assert.match(STORAGE_METADATA_TABLE_SQL, /relative_path VARCHAR\(512\) NOT NULL/i);
  assert.match(STORAGE_METADATA_TABLE_SQL, /metadata_json LONGTEXT NULL/i);
  assert.match(STORAGE_METADATA_TABLE_SQL, /UNIQUE KEY uniq_storage_files_storage_uid/i);
  assert.match(STORAGE_METADATA_TABLE_SQL, /KEY idx_storage_files_scope/i);
  assert.match(STORAGE_METADATA_TABLE_SQL, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/i);
});

test("stored paths stay inside the single backup root and sanitize original names", async () => {
  const root = await makeTempStorageRoot();
  try {
    const planned = __private__.buildStoredFilePlan({
      root,
      kind: "image",
      originalName: "..\\..\\evil avatar.png",
      mimeType: "image/png",
      now: new Date("2026-05-15T08:00:00.000Z"),
      storageId: "sf_test_path"
    });

    assert.equal(planned.safeOriginalName, "evil_avatar.png");
    assert.equal(planned.relativePath, "files/images/2026/05/15/sf_test_path.png");
    assert.ok(planned.absolutePath.startsWith(`${path.resolve(root)}${path.sep}`));
    assert.throws(
      () => __private__.assertInsideRoot(root, path.resolve(root, "..", "escape.txt")),
      (error) => error.statusCode === 400 && /Invalid storage path/.test(error.message)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("upload validation enforces MIME whitelist, size limits, and file signatures", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const valid = __private__.validateUploadInput({
    kind: "image",
    originalName: "avatar.png",
    mimeType: "image/png",
    size: png.length,
    buffer: png
  });
  assert.equal(valid.kind, "image");
  assert.equal(valid.extension, ".png");

  assert.throws(
    () =>
      __private__.validateUploadInput({
        kind: "attachment",
        originalName: "virus.exe",
        mimeType: "application/x-msdownload",
        size: 10,
        buffer: Buffer.from("MZ")
      }),
    (error) => error.statusCode === 415 && /not allowed/.test(error.message)
  );

  assert.throws(
    () =>
      __private__.validateUploadInput({
        kind: "image",
        originalName: "fake.png",
        mimeType: "image/png",
        size: png.length,
        buffer: Buffer.from("not-a-png")
      }),
    (error) => error.statusCode === 415 && /does not match/.test(error.message)
  );

  assert.throws(
    () =>
      __private__.validateUploadInput({
        kind: "chat_text",
        originalName: "huge.txt",
        mimeType: "text/plain",
        size: 3 * 1024 * 1024,
        buffer: Buffer.alloc(1)
      }),
    (error) => error.statusCode === 413 && /too large/.test(error.message)
  );
});

test("file fallback stores chat text, sidecar metadata, lists it, and deletes safely", async () => {
  const root = await makeTempStorageRoot();
  try {
    const service = createStorageService({ root, mysql: null });
    const record = await service.createChatText({
      content: "hello from chat",
      payload: {
        scopeType: "project",
        scopeId: "project-001",
        conversationId: "conv-001",
        messageId: "msg-001",
        metadata: { source: "unit-test" }
      },
      auth: { sub: "u-001", username: "alice" },
      now: new Date("2026-05-15T08:30:00.000Z")
    });

    assert.equal(record.kind, "chat_text");
    assert.equal(record.storage, "file");
    assert.equal(record.scopeType, "project");
    assert.equal(record.conversationId, "conv-001");
    assert.equal(record.url, `/api/storage/files/${encodeURIComponent(record.storageId)}/preview`);
    assert.equal(record.apiPreviewUrl, `/api/storage/files/${encodeURIComponent(record.storageId)}/preview`);
    assert.equal(record.apiDownloadUrl, `/api/storage/files/${encodeURIComponent(record.storageId)}/download`);
    assert.equal(record.downloadUrl, `/storage/files/${encodeURIComponent(record.storageId)}/download`);
    assert.equal(record.previewUrl, `/storage/files/${encodeURIComponent(record.storageId)}/preview`);
    assert.equal(await readFile(path.join(root, record.relativePath), "utf8"), "hello from chat");

    const sidecar = JSON.parse(await readFile(path.join(root, "metadata", "items", `${record.storageId}.json`), "utf8"));
    assert.equal(sidecar.storageId, record.storageId);
    assert.equal(sidecar.safeOriginalName, "chat-msg-001.txt");

    const listed = await service.listItems({ kind: "chat_text", scopeType: "project", scopeId: "project-001" });
    assert.deepEqual(listed.items.map((item) => item.storageId), [record.storageId]);

    const download = await service.getDownload(record.storageId);
    assert.equal(download.mimeType, "text/plain; charset=utf-8");
    assert.equal(download.fileName, "chat-msg-001.txt");
    assert.equal(download.buffer.toString("utf8"), "hello from chat");

    const preview = await service.getPreview(record.storageId);
    assert.equal(preview.mimeType, "text/plain; charset=utf-8");
    assert.equal(preview.fileName, "chat-msg-001.txt");
    assert.equal(preview.sizeBytes, Buffer.byteLength("hello from chat"));
    preview.stream.destroy();

    const deleted = await service.deleteItem(record.storageId, { auth: { sub: "u-001" } });
    assert.equal(deleted.ok, true);
    await assert.rejects(() => stat(path.join(root, record.relativePath)), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("video preview supports byte range parsing for 206 responses", async () => {
  const root = await makeTempStorageRoot();
  try {
    const service = createStorageService({ root, mysql: null });
    const buffer = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(32, 1)]);
    const record = await service.createFileFromUpload({
      file: {
        originalName: "clip.mp4",
        mimeType: "video/mp4",
        size: buffer.length,
        buffer
      },
      fields: { kind: "video" },
      auth: { sub: "u-video", username: "video-owner" },
      now: new Date("2026-05-15T10:00:00.000Z")
    });

    const preview = await service.getPreview(record.storageId, {
      auth: { sub: "u-video", permissions: ["storage.read"] },
      range: "bytes=4-11"
    });
    assert.deepEqual(preview.range, { start: 4, end: 11 });
    assert.equal(preview.sizeBytes, buffer.length);
    preview.stream.destroy();

    assert.deepEqual(__private__.parseRangeHeader("bytes=-8", buffer.length), { start: buffer.length - 8, end: buffer.length - 1 });
    assert.equal(__private__.parseRangeHeader("items=0-1", buffer.length), null);
    await assert.rejects(
      () =>
        service.getPreview(record.storageId, {
          auth: { sub: "u-video", permissions: ["storage.read"] },
          range: `bytes=${buffer.length}-`
        }),
      (error) => error.statusCode === 416 && /range/.test(error.message)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("personal storage read stays owner-only while delete remains owner or storage.delete", async () => {
  const root = await makeTempStorageRoot();
  try {
    const service = createStorageService({ root, mysql: null });
    const record = await service.createChatText({
      content: "private note",
      payload: {
        scopeType: "profile",
        scopeId: "u-owner"
      },
      auth: { sub: "u-owner", username: "owner" },
      now: new Date("2026-05-15T09:00:00.000Z")
    });

    const ownerList = await service.listItems({}, { auth: { sub: "u-owner", permissions: ["storage.read"] } });
    assert.deepEqual(ownerList.items.map((item) => item.storageId), [record.storageId]);

    const otherList = await service.listItems({}, { auth: { sub: "u-other", permissions: ["storage.read"] } });
    assert.deepEqual(otherList.items, []);

    await assert.rejects(
      () => service.getItem(record.storageId, { auth: { sub: "u-other", permissions: ["storage.read"] } }),
      (error) => error.statusCode === 403 && /No permission/.test(error.message)
    );

    await assert.rejects(
      () =>
        service.deleteItem(record.storageId, {
          auth: { sub: "u-manager", role: "manager", permissions: ["storage.read", "storage.write"] }
        }),
      (error) => error.statusCode === 403 && /No permission/.test(error.message)
    );

    const adminDeleted = await service.deleteItem(record.storageId, {
      auth: { sub: "u-admin", role: "admin", permissions: ["storage.delete"] }
    });
    assert.equal(adminDeleted.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project-scope storage can be read by authorized collaborators", async () => {
  const root = await makeTempStorageRoot();
  try {
    const service = createStorageService({
      root,
      mysql: null,
      scopeAccess: async (record, auth = {}) =>
        record.scopeType === "project" && record.scopeId === "project-shared" && auth.sub === "u-collab"
    });
    const sharedRecord = await service.createChatText({
      content: "shared project note",
      payload: {
        scopeType: "project",
        scopeId: "project-shared",
        conversationId: "project-shared",
        messageId: "msg-shared"
      },
      auth: { sub: "u-owner", username: "owner" },
      now: new Date("2026-05-15T09:10:00.000Z")
    });
    const personalRecord = await service.createChatText({
      content: "private profile note",
      payload: {
        scopeType: "profile",
        scopeId: "u-owner",
        messageId: "msg-private"
      },
      auth: { sub: "u-owner", username: "owner" },
      now: new Date("2026-05-15T09:11:00.000Z")
    });

    const collaboratorAuth = { sub: "u-collab", permissions: ["storage.read", "workspace.read"] };
    const collaboratorList = await service.listItems({}, { auth: collaboratorAuth });
    assert.deepEqual(collaboratorList.items.map((item) => item.storageId), [sharedRecord.storageId]);

    const sharedItem = await service.getItem(sharedRecord.storageId, { auth: collaboratorAuth });
    assert.equal(sharedItem.storageId, sharedRecord.storageId);

    const preview = await service.getPreview(sharedRecord.storageId, { auth: collaboratorAuth });
    assert.equal(preview.fileName, "chat-msg-shared.txt");
    preview.stream.destroy();

    await assert.rejects(
      () => service.getItem(personalRecord.storageId, { auth: collaboratorAuth }),
      (error) => error.statusCode === 403 && /No permission/.test(error.message)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("multipart parser accepts a file part and text metadata fields", async () => {
  const boundary = "xjg-boundary";
  const body = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="kind"',
      "",
      "image",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="avatar.png"',
      "Content-Type: image/png",
      "",
      "\x89PNG\r\n\x1a\n",
      `--${boundary}--`,
      ""
    ].join("\r\n"),
    "binary"
  );

  const parsed = await parseMultipartFormData(Readable.from([body]), `multipart/form-data; boundary=${boundary}`, {
    maxBytes: 1024
  });

  assert.equal(parsed.fields.kind, "image");
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].fieldName, "file");
  assert.equal(parsed.files[0].originalName, "avatar.png");
  assert.equal(parsed.files[0].mimeType, "image/png");
  assert.equal(parsed.files[0].buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});
