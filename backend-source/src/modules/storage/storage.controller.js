import { parseMultipartFormData } from "./multipart.js";
import { storageService } from "./storage.service.js";
import { STORAGE_METADATA_TABLE_SQL } from "./storage.schema.js";

const MAX_MULTIPART_BYTES = 220 * 1024 * 1024;

function encodeDownloadFileName(fileName = "download") {
  const fallback = String(fileName || "download").replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function encodePreviewFileName(fileName = "preview", disposition = "inline") {
  const fallback = String(fileName || "preview").replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function previewDisposition(download) {
  const mimeType = String(download.mimeType || "").split(";")[0].toLowerCase();
  if (
    download.record.kind === "image" ||
    download.record.kind === "video" ||
    download.record.kind === "chat_text" ||
    mimeType === "application/pdf" ||
    mimeType === "application/json" ||
    mimeType === "text/plain"
  ) {
    return "inline";
  }
  return "attachment";
}

export async function postStorageUpload(req, res, next) {
  try {
    const parsed = await parseMultipartFormData(req, req.headers["content-type"] || "", {
      maxBytes: MAX_MULTIPART_BYTES,
      maxFiles: 1
    });
    const file = parsed.files.find((item) => item.fieldName === "file") || parsed.files[0];
    const created = await storageService.createFileFromUpload({
      file,
      fields: parsed.fields,
      auth: req.auth || {}
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function postStorageChatText(req, res, next) {
  try {
    const created = await storageService.createChatText({
      content: req.body?.content ?? req.body?.text,
      payload: req.body || {},
      auth: req.auth || {}
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function getStorageFiles(req, res, next) {
  try {
    const data = await storageService.listItems(req.query || {}, { auth: req.auth || {} });
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function getStorageFile(req, res, next) {
  try {
    const item = await storageService.getItem(req.params.storageId, { auth: req.auth || {} });
    res.json(item);
  } catch (error) {
    next(error);
  }
}

export async function downloadStorageFile(req, res, next) {
  try {
    const download = await storageService.getDownload(req.params.storageId, { auth: req.auth || {} });
    res.setHeader("Content-Type", download.mimeType);
    res.setHeader("Content-Length", String(download.sizeBytes));
    res.setHeader("Content-Disposition", encodeDownloadFileName(download.fileName));
    res.send(download.buffer);
  } catch (error) {
    next(error);
  }
}

export async function previewStorageFile(req, res, next) {
  try {
    const preview = await storageService.getPreview(req.params.storageId, {
      auth: req.auth || {},
      range: req.headers.range || ""
    });
    const contentLength = preview.range ? preview.range.end - preview.range.start + 1 : preview.sizeBytes;

    res.status(preview.range ? 206 : 200);
    res.setHeader("Content-Type", preview.mimeType);
    res.setHeader("Content-Length", String(contentLength));
    res.setHeader("Content-Disposition", encodePreviewFileName(preview.fileName, previewDisposition(preview)));
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (preview.record.kind === "video") {
      res.setHeader("Accept-Ranges", "bytes");
    }
    if (preview.range) {
      res.setHeader("Content-Range", `bytes ${preview.range.start}-${preview.range.end}/${preview.sizeBytes}`);
    }

    preview.stream.on("error", next);
    preview.stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

export async function deleteStorageFile(req, res, next) {
  try {
    const result = await storageService.deleteItem(req.params.storageId, { auth: req.auth || {} });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getStorageEnsureSql(req, res) {
  res.json({
    table: "storage_files",
    sql: STORAGE_METADATA_TABLE_SQL
  });
}
