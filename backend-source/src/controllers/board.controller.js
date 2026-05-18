import {
  createBoard,
  deleteBoard,
  exportBoard,
  getBoard,
  getBoardHistory,
  listBoards,
  syncBoardBatch,
  shareBoard,
  updateBoard
} from "../services/board.service.js";

export async function getBoards(req, res, next) {
  try {
    const items = await listBoards(req.auth || {}, req.query || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function postBoard(req, res, next) {
  try {
    const created = await createBoard(req.body || {}, req.auth || {});
    res.status(created.__created === false ? 200 : 201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function getBoardById(req, res, next) {
  try {
    const board = await getBoard(req.params.boardId, req.auth || {});
    res.json(board);
  } catch (error) {
    next(error);
  }
}

export async function patchBoard(req, res, next) {
  try {
    const board = await updateBoard(req.params.boardId, req.body || {}, req.auth || {});
    res.json(board);
  } catch (error) {
    next(error);
  }
}

export async function removeBoard(req, res, next) {
  try {
    const result = await deleteBoard(req.params.boardId, req.auth || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function putBoardShares(req, res, next) {
  try {
    const board = await shareBoard(req.params.boardId, req.body?.entries || req.body?.sharedWith || [], req.auth || {});
    res.json(board);
  } catch (error) {
    next(error);
  }
}

export async function getBoardHistoryById(req, res, next) {
  try {
    const items = await getBoardHistory(req.params.boardId, req.auth || {}, req.query || {});
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getBoardExport(req, res, next) {
  try {
    const result = await exportBoard(req.params.boardId, req.query || {}, req.auth || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function postBoardSync(req, res, next) {
  try {
    const result = await syncBoardBatch(req.params.boardId, req.body || {}, req.auth || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
}
