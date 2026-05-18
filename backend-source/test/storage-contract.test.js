import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function readStorageContractDoc() {
  return readFile(new URL("../docs/api/frontend-storage-v1-contract.md", import.meta.url), "utf8");
}

test("storage preview routes are mounted for root and workspace aliases", async () => {
  const routes = await readFile(new URL("../src/modules/storage/storage.routes.js", import.meta.url), "utf8");

  assert.match(routes, /router\.get\("\/storage\/files\/:storageId\/preview", authRequired, requirePermission\("storage\.read"\), previewStorageFile\)/);
  assert.match(
    routes,
    /router\.get\("\/workspace\/storage\/files\/:storageId\/preview", authRequired, requirePermission\("storage\.read"\), previewStorageFile\)/
  );
});

test("storage preview controller emits inline capable streaming headers", async () => {
  const controller = await readFile(new URL("../src/modules/storage/storage.controller.js", import.meta.url), "utf8");

  assert.match(controller, /storageService\.getPreview\(req\.params\.storageId/);
  assert.match(controller, /res\.status\(preview\.range \? 206 : 200\)/);
  assert.match(controller, /res\.setHeader\("Content-Range", `bytes \$\{preview\.range\.start\}-\$\{preview\.range\.end\}\/\$\{preview\.sizeBytes\}`\)/);
  assert.match(controller, /res\.setHeader\("Accept-Ranges", "bytes"\)/);
  assert.match(controller, /res\.setHeader\("X-Content-Type-Options", "nosniff"\)/);
});

test("frontend storage-v1 contract documents backup boundaries and frontend metadata usages", async () => {
  const doc = await readStorageContractDoc();

  for (const required of [
    "backend-source/data/storage-v1",
    "backend-source/data/ai-v1",
    "storage_files",
    "schedule_item_comments.content_text",
    "boards.files_json",
    "board_history.files_json",
    "ProfileDialog.vue",
    "WorkspaceView.vue",
    "AppLauncherDialog.vue",
    "ExcalidrawIsland.jsx",
    "ScheduleFloatingChat.vue",
    "profile-avatar",
    "profile-character",
    "profile-signature",
    "home-background",
    "launcher-icon",
    "board-file",
    "schedule-comment",
    "/workspace/storage/upload",
    "/workspace/storage/chat-text",
    "apiPreviewUrl",
    "project/board/schedule/task/chat"
  ]) {
    assert.match(doc, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
