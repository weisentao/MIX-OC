import { normalizeAdminNoticePayload } from "../../services/adminApi.js";

function cleanText(value) {
  return String(value ?? "").trim();
}

export function toNoticeInputDateTime(value) {
  const text = cleanText(value);
  if (!text) return "";
  const normalized = text.replaceAll("/", "-").replace(" ", "T").slice(0, 16);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? normalized : text;
}

export function normalizeNoticeStatus(value, enabled = true) {
  const text = cleanText(value).toLowerCase();
  if (enabled === false || ["muted", "disabled", "inactive", "off", "false", "停用", "已停用"].includes(text)) return "disabled";
  return "active";
}

export function createNoticeDraftId() {
  return `notice-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeLocalNoticePayload(payload = {}, existingId = "", options = {}) {
  const payloadId = options.ignorePayloadId ? "" : cleanText(payload.id);
  const payloadNoticeId = options.ignorePayloadId ? "" : cleanText(payload.noticeId ?? payload.notice_id ?? payload.noticeUid ?? payload.notice_uid);
  const noticeId = cleanText(existingId) || payloadNoticeId || payloadId || createNoticeDraftId();
  const notice = normalizeAdminNoticePayload(
    {
      ...payload,
      status: normalizeNoticeStatus(payload.status, payload.enabled),
      linkText: payload.linkText ?? payload.link_text,
      linkUrl: payload.linkUrl ?? payload.link_url,
      linkTarget: payload.linkTarget ?? payload.link_target ?? payload.openTarget ?? payload.open_target,
      startAt: toNoticeInputDateTime(payload.startAt ?? payload.start_at),
      endAt: toNoticeInputDateTime(payload.endAt ?? payload.end_at)
    },
    { omitNoticeId: true }
  );

  return {
    ...notice,
    id: noticeId,
    noticeId,
    openTarget: notice.linkTarget,
    updatedAt: cleanText(payload.updatedAt ?? payload.updated_at) || new Date().toLocaleString("zh-CN", { hour12: false })
  };
}

export function noticeIdsEqual(left, right) {
  const leftId = cleanText(left);
  const rightId = cleanText(right);
  return Boolean(leftId || rightId) && leftId === rightId;
}

export function upsertNotice(notices = [], notice = {}) {
  const noticeId = cleanText(notice.noticeId || notice.id) || createNoticeDraftId();
  const nextNotice = { ...notice, id: noticeId, noticeId };
  const index = notices.findIndex((item) => noticeIdsEqual(item.id, noticeId) || noticeIdsEqual(item.noticeId, noticeId));
  if (index < 0) return [nextNotice, ...notices];
  return notices.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextNotice } : item));
}

export function removeNoticeById(notices = [], noticeId = "") {
  return notices.filter((item) => !noticeIdsEqual(item.id, noticeId) && !noticeIdsEqual(item.noticeId, noticeId));
}

export function applyNoticeResponseToNotices(notices = [], response = {}, fallback = {}) {
  const responseBody = response?.data && typeof response.data === "object" ? response.data : response || {};
  const nextId = cleanText(responseBody.noticeId || responseBody.id || fallback.noticeId || fallback.id);
  const notice = normalizeLocalNoticePayload({ ...fallback, ...responseBody }, nextId);
  const fallbackId = cleanText(fallback.noticeId || fallback.id);
  const withoutDraft = fallbackId && !noticeIdsEqual(fallbackId, notice.id) ? removeNoticeById(notices, fallbackId) : notices;
  return {
    notice,
    notices: upsertNotice(withoutDraft, notice)
  };
}
