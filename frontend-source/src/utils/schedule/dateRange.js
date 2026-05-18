import { getChinaHolidayInfo, isChinaLegalHoliday, isChinaWeekend } from "./scheduleHoliday.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SLASH_DATE_RE = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;

function toUtcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

export function parseSlashDate(value) {
  if (value instanceof Date) {
    if (!isValidDate(value)) return null;
    return toUtcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  const text = String(value || "").trim();
  const match = text.match(SLASH_DATE_RE);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = toUtcDate(year, month, day);

  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }

  return date;
}

export function formatSlashDate(value) {
  const date = parseSlashDate(value);
  if (!date) return "";

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}/${month}/${day}`;
}

export function getLocalTodaySlashDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!isValidDate(date)) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function formatShortSlashDate(value) {
  const date = parseSlashDate(value);
  if (!date) return "";

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}`;
}

export function addDays(value, days) {
  const date = parseSlashDate(value);
  if (!date) return null;
  return new Date(date.getTime() + Number(days || 0) * DAY_MS);
}

export function daysBetween(startDate, endDate) {
  const start = parseSlashDate(startDate);
  const end = parseSlashDate(endDate);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function buildVisibleDateRange(anchorDate, dayCount = 21) {
  const anchor = parseSlashDate(anchorDate) || parseSlashDate(new Date());
  const count = Math.max(1, Math.round(Number(dayCount || 21)));
  const before = Math.floor((count - 1) / 2);
  const after = count - 1 - before;

  return {
    startDate: formatSlashDate(addDays(anchor, -before)),
    endDate: formatSlashDate(addDays(anchor, after))
  };
}

export function extendVisibleDateRange(range = {}, direction = "right", dayCount = 14) {
  const visibleRange = clampDateRange(range.startDate, range.endDate);
  if (!visibleRange.startDate || !visibleRange.endDate) return visibleRange;

  const count = Math.max(1, Math.round(Number(dayCount || 14)));
  if (direction === "left") {
    return {
      startDate: formatSlashDate(addDays(visibleRange.startDate, -count)),
      endDate: visibleRange.endDate
    };
  }

  return {
    startDate: visibleRange.startDate,
    endDate: formatSlashDate(addDays(visibleRange.endDate, count))
  };
}

export function extendVisibleDateRangeToDate(range = {}, targetDate, paddingDays = 14) {
  const visibleRange = clampDateRange(range.startDate, range.endDate);
  const target = formatSlashDate(targetDate);
  if (!visibleRange.startDate || !visibleRange.endDate || !target) return visibleRange;

  const padding = Math.max(0, Math.round(Number(paddingDays || 0)));
  if (daysBetween(target, visibleRange.startDate) > 0) {
    return {
      startDate: formatSlashDate(addDays(target, -padding)),
      endDate: visibleRange.endDate
    };
  }
  if (daysBetween(visibleRange.endDate, target) > 0) {
    return {
      startDate: visibleRange.startDate,
      endDate: formatSlashDate(addDays(target, padding))
    };
  }

  return visibleRange;
}

export function getDateScrollLeft(range = {}, targetDate, dayWidth = 28) {
  const visibleRange = clampDateRange(range.startDate, range.endDate);
  const target = formatSlashDate(targetDate);
  const width = Number(dayWidth);
  if (!visibleRange.startDate || !visibleRange.endDate || !target || !Number.isFinite(width) || width <= 0) return 0;
  if (daysBetween(visibleRange.startDate, target) < 0 || daysBetween(target, visibleRange.endDate) < 0) return 0;
  return daysBetween(visibleRange.startDate, target) * width;
}

export function isWeekend(value) {
  return isChinaWeekend(value);
}

export function isHoliday(value) {
  return isChinaLegalHoliday(value);
}

export function getHolidayName(value) {
  return getChinaHolidayInfo(value).name;
}

export function clampDateRange(startDate, endDate) {
  const start = parseSlashDate(startDate);
  const end = parseSlashDate(endDate);

  if (!start && !end) return { startDate: "", endDate: "" };
  if (!start) {
    const onlyEnd = formatSlashDate(end);
    return { startDate: onlyEnd, endDate: onlyEnd };
  }
  if (!end) {
    const onlyStart = formatSlashDate(start);
    return { startDate: onlyStart, endDate: onlyStart };
  }

  const first = start.getTime() <= end.getTime() ? start : end;
  const last = start.getTime() <= end.getTime() ? end : start;
  return {
    startDate: formatSlashDate(first),
    endDate: formatSlashDate(last)
  };
}

export function buildDays(startDate, endDate) {
  const range = clampDateRange(startDate, endDate);
  if (!range.startDate || !range.endDate) return [];

  const total = daysBetween(range.startDate, range.endDate);
  return Array.from({ length: total + 1 }, (_, index) => {
    const date = addDays(range.startDate, index);
    const slashDate = formatSlashDate(date);
    const holidayInfo = getChinaHolidayInfo(slashDate);
    return {
      date: slashDate,
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
      weekDay: date.getUTCDay(),
      isWeekend: holidayInfo.weekend,
      isHoliday: holidayInfo.legalHoliday,
      isRestDay: holidayInfo.restDay,
      holidayName: holidayInfo.name
    };
  });
}

function weekStartDate(value) {
  const date = parseSlashDate(value);
  if (!date) return "";
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return formatSlashDate(addDays(date, offset));
}

function decorateWeekHeader(week) {
  const isSingleDay = week.startDate === week.endDate;
  const rangeLabel = isSingleDay ? week.startDate : `${week.startDate} - ${week.endDate}`;

  return {
    ...week,
    isSingleDay,
    label: isSingleDay ? formatShortSlashDate(week.startDate) : rangeLabel,
    title: rangeLabel
  };
}

export function buildWeeks(days = []) {
  const weeks = [];
  const weekByStart = new Map();

  days.forEach((day) => {
    const weekStart = weekStartDate(day.date);
    if (!weekByStart.has(weekStart)) {
      const week = {
        key: weekStart,
        startDate: day.date,
        endDate: day.date,
        days: []
      };
      weekByStart.set(weekStart, week);
      weeks.push(week);
    }

    const week = weekByStart.get(weekStart);
    week.days.push(day);
    week.endDate = day.date;
  });

  return weeks.map(decorateWeekHeader);
}
