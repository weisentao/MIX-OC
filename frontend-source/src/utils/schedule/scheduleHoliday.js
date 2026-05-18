const DAY_MS = 24 * 60 * 60 * 1000;
const SLASH_DATE_RE = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;

const CHINA_HOLIDAY_PERIODS_2026 = [
  { name: "元旦", startDate: "2026/01/01", endDate: "2026/01/03" },
  { name: "春节", startDate: "2026/02/15", endDate: "2026/02/23" },
  { name: "清明节", startDate: "2026/04/04", endDate: "2026/04/06" },
  { name: "劳动节", startDate: "2026/05/01", endDate: "2026/05/05" },
  { name: "端午节", startDate: "2026/06/19", endDate: "2026/06/21" },
  { name: "中秋节", startDate: "2026/09/25", endDate: "2026/09/27" },
  { name: "国庆节", startDate: "2026/10/01", endDate: "2026/10/07" }
];

function toUtcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function parseHolidayDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toUtcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  const text = String(value || "").trim();
  const match = text.match(SLASH_DATE_RE);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = toUtcDate(year, month, day);

  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date;
}

function formatHolidayDate(value) {
  const date = parseHolidayDate(value);
  if (!date) return "";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}/${month}/${day}`;
}

function daysBetween(startDate, endDate) {
  const start = parseHolidayDate(startDate);
  const end = parseHolidayDate(endDate);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function findHoliday(value) {
  const date = formatHolidayDate(value);
  if (!date) return null;
  return CHINA_HOLIDAY_PERIODS_2026.find((holiday) => daysBetween(holiday.startDate, date) >= 0 && daysBetween(date, holiday.endDate) >= 0) || null;
}

export { CHINA_HOLIDAY_PERIODS_2026 };

export function isChinaWeekend(value) {
  const date = parseHolidayDate(value);
  if (!date) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isChinaLegalHoliday(value) {
  return Boolean(findHoliday(value));
}

export function isChinaRestDay(value) {
  return isChinaWeekend(value) || isChinaLegalHoliday(value);
}

export function getChinaHolidayInfo(value) {
  const date = formatHolidayDate(value);
  const holiday = findHoliday(date);
  const weekend = isChinaWeekend(date);
  const legalHoliday = Boolean(holiday);

  return {
    date,
    name: holiday?.name || "",
    legalHoliday,
    weekend,
    restDay: weekend || legalHoliday
  };
}
