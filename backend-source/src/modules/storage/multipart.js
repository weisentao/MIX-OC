import { Buffer } from "node:buffer";

function buildHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBoundary(contentType = "") {
  const match = String(contentType).match(/multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] || match?.[2] || "").trim();
  if (!boundary) throw buildHttpError(415, "multipart/form-data boundary is required");
  return boundary;
}

async function readBody(stream, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw buildHttpError(413, "Upload body is too large");
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, total);
}

function parseContentDisposition(value = "") {
  const result = {};
  const parts = String(value).split(";").map((part) => part.trim());
  result.type = parts.shift()?.toLowerCase() || "";

  for (const part of parts) {
    const equalIndex = part.indexOf("=");
    if (equalIndex === -1) continue;
    const key = part.slice(0, equalIndex).trim().toLowerCase();
    let fieldValue = part.slice(equalIndex + 1).trim();
    if (fieldValue.startsWith('"') && fieldValue.endsWith('"')) {
      fieldValue = fieldValue.slice(1, -1).replace(/\\"/g, '"');
    }
    result[key] = fieldValue;
  }

  return result;
}

function appendField(fields, name, value) {
  if (fields[name] === undefined) {
    fields[name] = value;
    return;
  }
  if (Array.isArray(fields[name])) {
    fields[name].push(value);
    return;
  }
  fields[name] = [fields[name], value];
}

export async function parseMultipartFormData(stream, contentType = "", options = {}) {
  const boundary = parseBoundary(contentType);
  const maxBytes = Number(options.maxBytes || 220 * 1024 * 1024);
  const maxFiles = Number(options.maxFiles || 8);
  const body = await readBody(stream, maxBytes);
  const marker = `--${boundary}`;
  const raw = body.toString("latin1");
  const rawParts = raw.split(marker).slice(1);
  const fields = {};
  const files = [];

  for (const rawPart of rawParts) {
    if (rawPart.startsWith("--")) break;
    let part = rawPart;
    if (part.startsWith("\r\n")) part = part.slice(2);
    if (part.endsWith("\r\n")) part = part.slice(0, -2);
    if (!part.trim()) continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) throw buildHttpError(400, "Malformed multipart part");

    const headerText = part.slice(0, headerEnd);
    const contentText = part.slice(headerEnd + 4);
    const headers = {};
    for (const line of headerText.split("\r\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      headers[line.slice(0, colonIndex).trim().toLowerCase()] = line.slice(colonIndex + 1).trim();
    }

    const disposition = parseContentDisposition(headers["content-disposition"]);
    const fieldName = disposition.name || "";
    if (!fieldName) continue;

    const content = Buffer.from(contentText, "latin1");
    if (disposition.filename !== undefined) {
      if (files.length >= maxFiles) throw buildHttpError(413, "Too many uploaded files");
      files.push({
        fieldName,
        originalName: disposition.filename || "file",
        mimeType: headers["content-type"] || "application/octet-stream",
        buffer: content,
        size: content.length
      });
    } else {
      appendField(fields, fieldName, content.toString("utf8"));
    }
  }

  return { fields, files };
}
