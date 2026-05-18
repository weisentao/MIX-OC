import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getChinaHolidayInfo,
  isChinaLegalHoliday,
  isChinaRestDay,
  isChinaWeekend
} from "../scheduleHoliday.js";

describe("schedule China holiday utilities", () => {
  it("detects Saturday and Sunday automatically", () => {
    assert.equal(isChinaWeekend("2026/05/16"), true);
    assert.equal(isChinaWeekend("2026/05/17"), true);
    assert.equal(isChinaWeekend("2026/05/18"), false);
  });

  it("detects configured 2026 legal holiday periods", () => {
    assert.equal(isChinaLegalHoliday("2026/05/01"), true);
    assert.equal(isChinaLegalHoliday("2026/05/05"), true);
    assert.equal(isChinaLegalHoliday("2026/06/19"), true);
    assert.equal(isChinaLegalHoliday("2026/09/25"), true);
    assert.equal(isChinaLegalHoliday("2026/10/07"), true);
    assert.equal(isChinaLegalHoliday("2026/05/06"), false);
  });

  it("treats either weekends or legal holidays as green rest days", () => {
    assert.equal(isChinaRestDay("2026/05/16"), true);
    assert.equal(isChinaRestDay("2026/05/04"), true);
    assert.equal(isChinaRestDay("2026/05/06"), false);
  });

  it("returns holiday labels for date headers", () => {
    assert.deepEqual(getChinaHolidayInfo("2026/02/17"), {
      date: "2026/02/17",
      name: "春节",
      legalHoliday: true,
      weekend: false,
      restDay: true
    });
  });
});
