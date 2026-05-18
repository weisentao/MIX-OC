import { logger } from "../config/logger.js";
import { randomUUID } from "node:crypto";

export function resolveRequestId(headers = {}) {
  const incoming = String(headers["x-request-id"] || headers["X-Request-Id"] || "").trim();
  return incoming || randomUUID();
}

export function buildRequestLogPayload(req, res, durationMs) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status: res.statusCode,
    durationMs
  };
}

export function assignRequestId(req, res, next) {
  req.requestId = resolveRequestId(req.headers);
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  if (!req.requestId) {
    req.requestId = resolveRequestId(req.headers);
    res.setHeader("X-Request-Id", req.requestId);
  }

  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.info("HTTP request", buildRequestLogPayload(req, res, ms));
  });

  next();
}
