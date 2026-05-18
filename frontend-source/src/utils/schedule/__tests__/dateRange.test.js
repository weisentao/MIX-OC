import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  buildDays,
  buildVisibleDateRange,
  buildWeeks,
  clampDateRange,
  daysBetween,
  extendVisibleDateRange,
  extendVisibleDateRangeToDate,
  formatSlashDate,
  getDateScrollLeft,
  getLocalTodaySlashDate,
  isHoliday,
  isWeekend,
  parseSlashDate
} from "../dateRange.js";

describe("schedule date range utilities", () => {
  it("parses and formats slash dates without timezone drift", () => {
    const parsed = parseSlashDate("2026/05/10");

    assert.equal(formatSlashDate(parsed), "2026/05/10");
    assert.equal(formatSlashDate(addDays(parsed, 2)), "2026/05/12");
  });

  it("returns null for invalid dates", () => {
    assert.equal(parseSlashDate(""), null);
    assert.equal(parseSlashDate("2026/02/30"), null);
    assert.equal(formatSlashDate("bad"), "");
  });

  it("counts day offsets and builds inclusive day ranges across months", () => {
    assert.equal(daysBetween("2026/05/10", "2026/05/10"), 0);
    assert.equal(daysBetween("2026/05/31", "2026/06/02"), 2);
    assert.deepEqual(
      buildDays("2026/05/31", "2026/06/02").map((day) => day.date),
      ["2026/05/31", "2026/06/01", "2026/06/02"]
    );
  });

  it("groups days by calendar week", () => {
    const weeks = buildWeeks(buildDays("2026/05/11", "2026/05/24"));

    assert.equal(weeks.length, 2);
    assert.deepEqual(
      weeks.map((week) => [week.startDate, week.endDate, week.days.length]),
      [
        ["2026/05/11", "2026/05/17", 7],
        ["2026/05/18", "2026/05/24", 7]
      ]
    );
  });

  it("uses a compact label for single-day week header ranges", () => {
    const weeks = buildWeeks(buildDays("2026/05/10", "2026/05/17"));

    assert.equal(weeks[0].startDate, "2026/05/10");
    assert.equal(weeks[0].endDate, "2026/05/10");
    assert.equal(weeks[0].isSingleDay, true);
    assert.equal(weeks[0].label, "05/10");
    assert.equal(weeks[0].title, "2026/05/10");
    assert.equal(weeks[1].label, "2026/05/11 - 2026/05/17");
    assert.equal(weeks[1].title, "2026/05/11 - 2026/05/17");
  });

  it("detects weekends and clamps reversed ranges", () => {
    assert.equal(isWeekend("2026/05/16"), true);
    assert.equal(isWeekend("2026/05/18"), false);
    assert.equal(isHoliday("2026/05/01"), true);
    assert.deepEqual(clampDateRange("2026/06/02", "2026/05/31"), {
      startDate: "2026/05/31",
      endDate: "2026/06/02"
    });
  });

  it("marks timeline days that should render green for China rest days", () => {
    const days = buildDays("2026/05/01", "2026/05/06");

    assert.deepEqual(
      days.map((day) => [day.date, day.isWeekend, day.isHoliday, day.isRestDay, day.holidayName]),
      [
        ["2026/05/01", false, true, true, "劳动节"],
        ["2026/05/02", true, true, true, "劳动节"],
        ["2026/05/03", true, true, true, "劳动节"],
        ["2026/05/04", false, true, true, "劳动节"],
        ["2026/05/05", false, true, true, "劳动节"],
        ["2026/05/06", false, false, false, ""]
      ]
    );
  });

  it("builds a visible window around a date without depending on plan bounds", () => {
    assert.deepEqual(buildVisibleDateRange("2026/05/14", 21), {
      startDate: "2026/05/04",
      endDate: "2026/05/24"
    });
    assert.deepEqual(buildVisibleDateRange("2026/05/14", 1), {
      startDate: "2026/05/14",
      endDate: "2026/05/14"
    });
  });

  it("extends a visible window left and right while keeping the current edge anchored", () => {
    const range = { startDate: "2026/05/10", endDate: "2026/05/20" };

    assert.deepEqual(extendVisibleDateRange(range, "left", 14), {
      startDate: "2026/04/26",
      endDate: "2026/05/20"
    });
    assert.deepEqual(extendVisibleDateRange(range, "right", 14), {
      startDate: "2026/05/10",
      endDate: "2026/06/03"
    });
  });

  it("expands a visible window far enough to include an arbitrary past or future date", () => {
    const range = { startDate: "2026/05/14", endDate: "2026/06/04" };

    assert.deepEqual(extendVisibleDateRangeToDate(range, "2025/12/31", 7), {
      startDate: "2025/12/24",
      endDate: "2026/06/04"
    });
    assert.deepEqual(extendVisibleDateRangeToDate(range, "2027/01/10", 7), {
      startDate: "2026/05/14",
      endDate: "2027/01/17"
    });
  });

  it("calculates the scroll offset for a date inside the visible window", () => {
    assert.equal(getDateScrollLeft({ startDate: "2026/05/04", endDate: "2026/05/24" }, "2026/05/14", 28), 280);
    assert.equal(getDateScrollLeft({ startDate: "2026/05/04", endDate: "2026/05/24" }, "2026/06/14", 28), 0);
  });

  it("formats today's date from the local calendar day", () => {
    assert.equal(getLocalTodaySlashDate(new Date(2026, 4, 14, 1, 30)), "2026/05/14");
  });
});
