import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const serviceSource = () => readFile("src/services/board.service.js", "utf8");
const controllerSource = () => readFile("src/controllers/board.controller.js", "utf8");
const routesSource = () => readFile("src/routes/workspace.routes.js", "utf8");

function sliceFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} should exist`);
  const end = nextSignature ? source.indexOf(nextSignature, start) : source.length;
  assert.notEqual(end, -1, `${nextSignature} should follow ${signature}`);
  return source.slice(start, end);
}

test("createBoard is idempotent for duplicate board_uid when actor can open existing board", async () => {
  const source = await serviceSource();
  const createBoardSource = sliceFunction(
    source,
    "export async function createBoard(payload = {}, auth = {})",
    "export async function updateBoard"
  );
  const controller = await controllerSource();

  assert.match(createBoardSource, /const boardUid = String\(payload\.id \|\| payload\.boardId \|\| ""\)\.trim\(\) \|\| makeUid\("board"\)/);
  assert.match(createBoardSource, /const existingBoard = await findBoardByUid\(boardUid\)/);
  assert.match(createBoardSource, /await assertCanOpenBoard\(existingBoard, auth\)/);
  assert.match(createBoardSource, /return markCreateResult\(await buildBoard\(existingBoard\.board_uid\), false\)/);
  assert.match(createBoardSource, /catch\s*\(error\)\s*{[\s\S]*isDuplicateKeyError\(error\)[\s\S]*await assertCanOpenBoard\(duplicateBoard, auth\)[\s\S]*return markCreateResult\(await buildBoard\(duplicateBoard\.board_uid\), false\)/);
  assert.match(controller, /res\.status\(created\.__created === false \? 200 : 201\)\.json\(created\)/);
});

test("archived boards are hidden from read, update, share, and history APIs", async () => {
  const source = await serviceSource();

  for (const [signature, nextSignature] of [
    ["export async function getBoard(boardId, auth = {})", "export async function createBoard"],
    ["export async function updateBoard(boardId, payload = {}, auth = {})", "export async function deleteBoard"],
    ["export async function shareBoard(boardId, entries = [], auth = {})", "export async function getBoardHistory"],
    ["export async function getBoardHistory(boardId, auth = {}, query = {})", "export async function exportBoard"]
  ]) {
    const fnSource = sliceFunction(source, signature, nextSignature);
    assert.match(fnSource, /const board = await resolveBoard\(boardId\)|const row = await resolveBoard\(boardId\)/);
    assert.match(fnSource, /assertBoardActive\((board|row)\)/, `${signature} should reject archived boards`);
  }

  const assertActiveSource = sliceFunction(source, "function assertBoardActive(board)", "async function fetchShares");
  assert.match(assertActiveSource, /Number\(board\?\.is_archived \|\| 0\) === 1/);
  assert.match(assertActiveSource, /throw notFound\("画板不存在"\)/);
});

test("deleteBoard archives board_members and board_shares in the board transaction", async () => {
  const source = await serviceSource();
  const deleteBoardSource = sliceFunction(
    source,
    "export async function deleteBoard(boardId, auth = {})",
    "export async function shareBoard"
  );

  assert.match(deleteBoardSource, /mysqlPool\.getConnection\(\)/);
  assert.match(deleteBoardSource, /connection\.beginTransaction\(\)/);
  assert.match(deleteBoardSource, /UPDATE board_members SET status = 'archived' WHERE board_uid = \?/);
  assert.match(deleteBoardSource, /UPDATE board_shares SET status = 'archived' WHERE board_uid = \?/);
  assert.match(deleteBoardSource, /UPDATE boards[\s\S]*SET is_archived = 1, updated_by = \?[\s\S]*WHERE board_uid = \? AND is_archived = 0/);
  assert.match(deleteBoardSource, /connection\.commit\(\)/);
  assert.match(deleteBoardSource, /catch\s*\(error\)\s*{[\s\S]*connection\.rollback\(\)[\s\S]*throw error/);
  assert.match(deleteBoardSource, /finally\s*{[\s\S]*connection\.release\(\)/);
});

test("updateBoard uses a transaction and atomic latest_version compare-and-swap", async () => {
  const source = await serviceSource();
  const updateBoardSource = sliceFunction(
    source,
    "export async function updateBoard(boardId, payload = {}, auth = {})",
    "export async function deleteBoard"
  );

  assert.match(source, /function conflict\(message\)\s*{[\s\S]*error\.statusCode = 409[\s\S]*return error/);
  assert.match(updateBoardSource, /payload\.baseVersion === undefined \|\| payload\.baseVersion === null \? payload\.lastVersion : payload\.baseVersion/);
  assert.match(updateBoardSource, /const expectedVersion = hasRequestedBaseVersion \? baseVersion : Number\(board\.latest_version \|\| 0\)/);
  assert.match(updateBoardSource, /const nextVersion = expectedVersion \+ 1/);
  assert.match(updateBoardSource, /mysqlPool\.getConnection\(\)/);
  assert.match(updateBoardSource, /connection\.beginTransaction\(\)/);
  assert.match(updateBoardSource, /latest_version = latest_version \+ 1/);
  assert.match(updateBoardSource, /WHERE board_uid = \? AND latest_version = \?/);
  assert.match(updateBoardSource, /if \(updateResult\.affectedRows === 0\) \{[\s\S]*const latestBoard = await resolveBoard\(board\.board_uid\);[\s\S]*throw boardVersionConflictError\(latestBoard, expectedVersion\)/);
  assert.match(updateBoardSource, /await insertBoardSnapshot\([\s\S]*"save",[\s\S]*connection[\s\S]*\)/);
  assert.match(updateBoardSource, /connection\.commit\(\)/);
  assert.match(updateBoardSource, /catch\s*\(error\)\s*{[\s\S]*connection\.rollback\(\)[\s\S]*throw error/);
  assert.match(updateBoardSource, /finally\s*{[\s\S]*connection\.release\(\)/);
});

test("board version conflict helper exposes stable details for frontend retry", async () => {
  const source = await serviceSource();
  const detailsSource = sliceFunction(source, "function boardVersionDetails(board = {}, expectedVersion = null)", "function boardVersionConflictError");
  const conflictSource = sliceFunction(source, "function boardVersionConflictError(board = {}, expectedVersion = null)", "function makeUid");

  assert.match(detailsSource, /expectedVersion:/);
  assert.match(detailsSource, /currentVersion:/);
  assert.match(detailsSource, /latestVersion:/);
  assert.match(detailsSource, /updatedAt:/);
  assert.match(conflictSource, /error\.code = "BOARD_VERSION_CONFLICT"/);
  assert.match(conflictSource, /error\.details = boardVersionDetails\(board, expectedVersion\)/);
});

test("board snapshots can be written through an existing transaction executor", async () => {
  const source = await serviceSource();
  const insertSnapshotSource = sliceFunction(
    source,
    "async function insertBoardSnapshot(boardUid, version, auth, payload, actionType = \"save\", executor = mysqlPool)",
    "async function validateBoardShareEntries"
  );
  const mapBoardSource = sliceFunction(source, "function mapBoard(row, shares = [], members = [])", "async function fetchUserByUid");

  assert.match(insertSnapshotSource, /executor = mysqlPool/);
  assert.equal((insertSnapshotSource.match(/await executor\.execute/g) || []).length, 2);
  assert.match(mapBoardSource, /latestVersion:\s*Number\(row\.latest_version \|\| 0\) \|\| 1/);
  assert.match(mapBoardSource, /lastVersion:\s*Number\(row\.latest_version \|\| 0\) \|\| 1/);
});

test("board JSON export route is wired for root and workspace paths", async () => {
  const service = await serviceSource();
  const controller = await controllerSource();
  const routes = await routesSource();

  assert.match(service, /export async function exportBoard\(boardId, query = {}, auth = {}\)/);
  assert.match(service, /if \(format !== "json"\) throw badRequest\("仅支持导出 JSON 格式的画板"\)/);
  assert.match(controller, /export async function getBoardExport\(req, res, next\)/);
  assert.match(routes, /router\.get\("\/boards\/:boardId\/export", authRequired, getBoardExport\)/);
  assert.match(routes, /router\.get\("\/workspace\/boards\/:boardId\/export", authRequired, getBoardExport\)/);
});

test("board sync batch route and controller are wired for root and workspace aliases", async () => {
  const source = await serviceSource();
  const controller = await controllerSource();
  const routes = await routesSource();
  const syncSource = sliceFunction(source, "export async function syncBoardBatch(boardId, payload = {}, auth = {})", "export async function deleteBoard");

  assert.match(syncSource, /const savePayload = extractBoardBatchSavePayload\(payload\)/);
  assert.match(syncSource, /const includeHistory = Boolean\(/);
  assert.match(syncSource, /if \(savePayload\) \{[\s\S]*savedBoard = await updateBoard\(board\.board_uid, savePayload, auth\)/);
  assert.match(syncSource, /if \(includeHistory\) \{[\s\S]*history = await getBoardHistory\(board\.board_uid, auth, historyQuery \|\| {}\)/);
  assert.match(controller, /export async function postBoardSync\(req, res, next\)/);
  assert.match(controller, /syncBoardBatch\(req\.params\.boardId, req\.body \|\| {}, req\.auth \|\| {}\)/);
  assert.match(routes, /router\.post\("\/boards\/:boardId\/sync", authRequired, postBoardSync\)/);
  assert.match(routes, /router\.post\("\/workspace\/boards\/:boardId\/sync", authRequired, postBoardSync\)/);
});

test("board mapper preserves stable project id aliases for frontend numeric fallbacks", async () => {
  const source = await serviceSource();
  const mapBoardSource = sliceFunction(source, "function mapBoard(row, shares = [], members = [])", "async function fetchUserByUid");

  assert.match(mapBoardSource, /id:\s*row\.board_uid/);
  assert.match(mapBoardSource, /projectId:\s*projectIdFromBoard\(row\)/);
  assert.match(mapBoardSource, /projectUid:\s*row\.project_uid \|\| ""/);
  assert.match(mapBoardSource, /legacyProjectId:\s*legacyProjectIdFromBoard\(row\)/);
});

test("shareBoard validates entries before transactional revoke and insert", async () => {
  const source = await serviceSource();
  const fetchUserSource = sliceFunction(source, "async function fetchUserByUid(userUid)", "async function resolveProject");
  const manageSource = sliceFunction(source, "async function assertCanManageBoard(board, auth)", "async function insertBoardMember");
  const validateSharesSource = sliceFunction(source, "async function validateBoardShareEntries(entries = [])", "export async function listBoards");
  const shareBoardSource = sliceFunction(
    source,
    "export async function shareBoard(boardId, entries = [], auth = {})",
    "export async function getBoardHistory"
  );

  assert.match(fetchUserSource, /WHERE user_uid = \? OR CAST\(id AS CHAR\) = \? OR username = \? OR name = \?/);
  assert.match(validateSharesSource, /entry\.userId \|\| entry\.userUid \|\| entry\.id \|\| entry\.userName \|\| entry\.name \|\| entry\.username/);
  assert.match(validateSharesSource, /invalidShares\.push/);
  assert.match(manageSource, /permission !== "owner" && projectRole !== "manager"/);
  assert.match(manageSource, /throw forbidden\("无权限管理画板"\)/);
  assert.match(shareBoardSource, /await assertCanManageBoard\(board, auth\)/);
  assert.match(shareBoardSource, /const \{ invalidShares, validShares \} = await validateBoardShareEntries\(entries\)/);
  assert.match(shareBoardSource, /if \(invalidShares\.length\) \{[\s\S]*shareResult:\s*{[\s\S]*ok: false[\s\S]*invalidShares/);
  assert.ok(
    shareBoardSource.indexOf("validateBoardShareEntries(entries)") <
      shareBoardSource.indexOf("UPDATE board_shares SET status = 'revoked' WHERE board_uid = ?"),
    "shareBoard should validate before revoking existing shares"
  );
  assert.match(shareBoardSource, /mysqlPool\.getConnection\(\)/);
  assert.match(shareBoardSource, /connection\.beginTransaction\(\)/);
  assert.match(shareBoardSource, /await connection\.execute\("UPDATE board_shares SET status = 'revoked' WHERE board_uid = \?"/);
  assert.match(shareBoardSource, /for \(const \{ entry, permission, user \} of validShares\)/);
  assert.match(shareBoardSource, /await insertBoardMember\(board\.board_uid, user\.user_uid, permission === "edit" \? "editor" : "viewer", connection\)/);
  assert.match(shareBoardSource, /connection\.commit\(\)/);
  assert.match(shareBoardSource, /catch\s*\(error\)\s*{[\s\S]*connection\.rollback\(\)[\s\S]*throw error/);
  assert.match(shareBoardSource, /shareResult:\s*{/);
  assert.match(shareBoardSource, /sharedWith:\s*boardWithShares\.sharedWith/);
});

test("getBoardHistory supports pagination and metadata-only responses", async () => {
  const service = await serviceSource();
  const controller = await controllerSource();
  const routes = await routesSource();
  const openSource = sliceFunction(service, "async function assertCanOpenBoard(board, auth)", "async function assertCanEditBoard");
  const historySource = sliceFunction(
    service,
    "export async function getBoardHistory(boardId, auth = {}, query = {})",
    "export async function exportBoard"
  );

  assert.match(service, /const DEFAULT_BOARD_HISTORY_LIMIT = 50/);
  assert.match(service, /const MAX_BOARD_HISTORY_LIMIT = 200/);
  assert.match(openSource, /if \(permission === "none"\) throw forbidden\("无权限打开画板"\)/);
  assert.match(historySource, /await assertCanOpenBoard\(board, auth\)/);
  assert.match(historySource, /const limit = normalizePositiveInteger\(query\.limit, DEFAULT_BOARD_HISTORY_LIMIT, MAX_BOARD_HISTORY_LIMIT\)/);
  assert.match(historySource, /const page = normalizePositiveInteger\(query\.page, 1\)/);
  assert.match(historySource, /const offset = \(page - 1\) \* limit/);
  assert.match(historySource, /const includePayload = normalizeIncludePayload\(query\.includePayload\)/);
  assert.match(historySource, /const payloadColumns = includePayload \? ", elements_json, files_json, app_state_json, payload_json" : ""/);
  assert.match(historySource, /LIMIT \? OFFSET \?/);
  assert.match(historySource, /\[board\.board_uid, limit, offset\]/);
  assert.match(historySource, /if \(includePayload\) \{[\s\S]*item\.elements = parseJson\(row\.elements_json, \[\]\)[\s\S]*item\.payload = parseJson\(row\.payload_json, {}\)/);
  assert.match(controller, /getBoardHistory\(req\.params\.boardId, req\.auth \|\| {}, req\.query \|\| {}\)/);
  assert.match(routes, /router\.get\("\/boards\/:boardId\/history", authRequired, getBoardHistoryById\)/);
  assert.match(routes, /router\.get\("\/workspace\/boards\/:boardId\/history", authRequired, getBoardHistoryById\)/);
});
