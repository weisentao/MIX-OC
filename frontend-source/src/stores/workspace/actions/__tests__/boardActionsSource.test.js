import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const boardActionsPath = resolve(testDir, "../boardActions.js");
const source = readFileSync(boardActionsPath, "utf8");

describe("boardActions source contracts", () => {
  it("passes a syntax check without importing alias-bound modules", () => {
    const result = spawnSync(process.execPath, ["--check", boardActionsPath], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  it("sends explicit board base and last versions to the backend", () => {
    assert.match(source, /baseVersion:\s*version/);
    assert.match(source, /lastVersion:\s*version/);
    assert.match(source, /boardVersion\(board\)/);
  });

  it("guards async board saves against stale responses", () => {
    assert.match(source, /function\s+captureBoardSyncStamp\s*\(/);
    assert.match(source, /function\s+isBoardSyncStale\s*\(/);
    assert.match(source, /captureBoardSyncStamp\(board\)/);
    assert.match(source, /isBoardSyncStale\(board,\s*stamp\)/);
  });

  it("uses syncBoard retry with history inclusion on version conflicts", () => {
    assert.match(source, /workspaceApi\.syncBoard\(board\.id,\s*{/);
    assert.match(source, /includeHistory:\s*true/);
    assert.match(source, /payload\?\.details\s*&&\s*typeof payload\.details === "object"/);
    assert.match(source, /mergeBoardHistoryEntries\(/);
    assert.match(source, /result\?\.history\s*\|\|\s*\[\]/);
  });

  it("rolls back invalid share responses without merging remote data", () => {
    assert.match(source, /previousSharedWith/);
    assert.match(source, /shareResult\?\.\s*ok\s*===\s*false|shareResult\s*&&\s*shareResult\.ok\s*===\s*false/);
    assert.match(source, /invalidShares/);
    assert.match(source, /makeBoardShareError\(remoteBoard\)/);
  });

  it("keeps shareBoardById literals quoted to avoid runtime ReferenceError", () => {
    assert.match(source, /item\.status\s*!==\s*"deleted"/);
    assert.match(source, /this\.showToast\("只有画板拥有者或项目管理员可以设置共享"\)/);
    assert.match(source, /this\.boardSaveState\s*=\s*"local"/);
    assert.match(source, /syncInBackground\(this,\s*"shareBoard"/);
    assert.match(source, /this\.boardSaveState\s*=\s*"sync-failed"/);
    assert.match(source, /this\.boardSaveState\s*=\s*"saved"/);
    assert.match(source, /this\.showToast\("画板共享权限已更新"\)/);
    assert.doesNotMatch(source, /item\.status\s*!==\s*deleted\b/);
    assert.doesNotMatch(source, /this\.boardSaveState\s*=\s*local\b/);
    assert.doesNotMatch(source, /this\.boardSaveState\s*=\s*sync-failed\b/);
    assert.doesNotMatch(source, /this\.boardSaveState\s*=\s*saved\b/);
  });
});
