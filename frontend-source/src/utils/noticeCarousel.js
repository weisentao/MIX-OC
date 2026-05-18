function cleanText(value) {
  return String(value ?? "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = cleanText(value).toLowerCase();
  if (!text) return fallback;
  if (["true", "1", "yes", "on", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;
  return fallback;
}

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return asObject(value);
}

function unwrapNoticeItems(response) {
  if (Array.isArray(response)) return response;
  const body = asObject(response);
  const nested = [body.data, body.result, body.payload].map(asObject);
  for (const candidate of [body, ...nested]) {
    if (Array.isArray(candidate.items)) return candidate.items;
    if (Array.isArray(candidate.list)) return candidate.list;
    if (Array.isArray(candidate.rows)) return candidate.rows;
    if (Array.isArray(candidate.notices)) return candidate.notices;
    if (Array.isArray(candidate.carouselNotices)) return candidate.carouselNotices;
  }
  return [];
}

function normalizeNoticeItem(item = {}, index = 0) {
  const source = asObject(item);
  const payload = parsePayload(source.payload ?? source.payload_json ?? source.meta);
  const text = cleanText(
    source.text ??
      source.content ??
      source.contentText ??
      source.content_text ??
      payload.text ??
      payload.content ??
      payload.contentText
  );
  const title = cleanText(source.title ?? payload.title);
  const status = cleanText(source.status ?? payload.status) || (normalizeBoolean(source.enabled, true) ? "active" : "muted");
  const linkText = cleanText(source.linkText ?? source.link_text ?? payload.linkText ?? payload.link_text);
  const linkUrl = cleanText(source.linkUrl ?? source.link_url ?? payload.linkUrl ?? payload.link_url);
  const linkTarget = cleanText(
    source.linkTarget ??
      source.link_target ??
      source.openTarget ??
      source.open_target ??
      payload.linkTarget ??
      payload.link_target ??
      payload.openTarget ??
      payload.open_target
  );

  return {
    id: cleanText(source.id ?? source.noticeId ?? source.notice_id ?? source.noticeUid ?? source.notice_uid) || `notice-${index + 1}`,
    noticeId: cleanText(source.noticeId ?? source.notice_id ?? source.noticeUid ?? source.notice_uid) || cleanText(source.id) || `notice-${index + 1}`,
    title: title || text || `公告 ${index + 1}`,
    text: text || title,
    content: text || title,
    type: cleanText(source.type ?? source.noticeType ?? source.notice_type ?? payload.type ?? payload.noticeType),
    enabled: normalizeBoolean(source.enabled ?? payload.enabled, status !== "muted"),
    status,
    interval: Math.max(1000, Number(source.interval ?? payload.interval ?? 5500) || 5500),
    priority: Number(source.priority ?? payload.priority ?? 0) || 0,
    sortOrder: Number(source.sortOrder ?? source.sort_order ?? payload.sortOrder ?? payload.sort_order ?? index) || 0,
    linkText,
    linkUrl,
    linkTarget,
    startAt: cleanText(source.startAt ?? source.start_at ?? payload.startAt ?? payload.start_at),
    endAt: cleanText(source.endAt ?? source.end_at ?? payload.endAt ?? payload.end_at),
    updatedAt: cleanText(source.updatedAt ?? source.updated_at ?? payload.updatedAt ?? payload.updated_at),
    payload
  };
}

export function normalizeCarouselNotices(response) {
  return unwrapNoticeItems(response)
    .map(normalizeNoticeItem)
    .filter((item) => cleanText(item.text || item.title))
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return cleanText(right.updatedAt).localeCompare(cleanText(left.updatedAt));
    });
}

export function splitNoticeInlineParts(text, linkText) {
  const fullText = cleanText(text);
  const targetText = cleanText(linkText);
  if (!targetText || !fullText) {
    return { before: fullText, link: targetText, after: "", matched: false };
  }
  const index = fullText.indexOf(targetText);
  if (index === -1) {
    return { before: fullText, link: targetText, after: "", matched: false };
  }
  return {
    before: fullText.slice(0, index),
    link: targetText,
    after: fullText.slice(index + targetText.length),
    matched: true
  };
}

export function normalizeNoticeLinkTarget(value) {
  const text = cleanText(value).toLowerCase();
  return ["_blank", "blank", "new"].includes(text) ? "_blank" : "_self";
}

export function resolveNoticeHref(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (typeof window === "undefined") return text;
  try {
    return new URL(text, window.location.href).toString();
  } catch {
    return text;
  }
}

export function openNoticeLink(notice = {}) {
  const href = resolveNoticeHref(notice.linkUrl);
  if (!href || typeof window === "undefined") return false;
  if (normalizeNoticeLinkTarget(notice.linkTarget) === "_blank") {
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
  }
  window.location.assign(href);
  return true;
}
