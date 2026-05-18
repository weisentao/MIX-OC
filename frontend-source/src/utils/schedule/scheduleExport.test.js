import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleHtmlExport,
  buildSchedulePdfPreviewModel,
  buildSchedulePdfPrintDocument
} from "./scheduleExport.js";

const plan = {
  id: "sp-001",
  title: "项目排期",
  projectName: "新活动，福利，新界面......",
  startDate: "2026/05/10",
  endDate: "2026/06/21"
};

const items = [
  {
    id: "si-1",
    title: "需求沟通",
    module: "project",
    type: "schedule",
    startDate: "2026/05/10",
    endDate: "2026/05/16",
    commentsCount: 11
  },
  {
    id: "si-2",
    title: "风格稿AI",
    module: "aigc",
    type: "task",
    startDate: "2026/05/16",
    endDate: "2026/05/16",
    commentsCount: 5
  }
];

const dependencies = [{ id: "dep-1", fromItemId: "si-1", toItemId: "si-2", type: "finish_to_start" }];

describe("schedule export models", () => {
  it("builds an interactive HTML export payload with view mode, day width, and items", () => {
    const htmlExport = buildScheduleHtmlExport(plan, items, dependencies, {
      viewMode: "board",
      dayWidth: 36,
      rowHeight: 34
    });

    assert.equal(htmlExport.kind, "html");
    assert.equal(htmlExport.interactive, true);
    assert.equal(htmlExport.viewMode, "board");
    assert.equal(htmlExport.dayWidth, 36);
    assert.equal(htmlExport.snapshot.items.length, 2);
    assert.equal(htmlExport.snapshot.items[0].id, "si-1");
    assert.match(htmlExport.html, /"viewMode":"board"/);
    assert.match(htmlExport.html, /"dayWidth":36/);
    assert.match(htmlExport.html, /"interactive":true/);
    assert.match(htmlExport.html, /"items":/);
  });

  it("builds a complete HTML document that renders schedule content directly", () => {
    const htmlExport = buildScheduleHtmlExport(plan, items, dependencies, {
      viewMode: "timeline",
      dayWidth: 32,
      rowHeight: 34
    });

    assert.match(htmlExport.html, /^<!doctype html>/i);
    assert.match(htmlExport.html, /id="schedule-export-root"/);
    assert.match(htmlExport.html, /class="export-left-row"/);
    assert.match(htmlExport.html, /class="export-bar/);
    assert.match(htmlExport.html, /<script type="application\/json" id="schedule-export-data">/);
    assert.match(htmlExport.html, /window\.__SCHEDULE_HTML_EXPORT__/);
  });

  it("builds a static PDF preview model without interactive control fields", () => {
    const pdfPreview = buildSchedulePdfPreviewModel(plan, items, dependencies, {
      viewMode: "node",
      dayWidth: 36
    });

    assert.equal(pdfPreview.kind, "pdf-preview");
    assert.equal(pdfPreview.interactive, false);
    assert.equal(Object.hasOwn(pdfPreview, "viewMode"), false);
    assert.equal(Object.hasOwn(pdfPreview, "dayWidth"), false);
    assert.equal(Object.hasOwn(pdfPreview, "controls"), false);
    assert.equal(pdfPreview.pages[0].items.length, 2);
    assert.equal(pdfPreview.pages[0].timeline.days.length, 43);
  });

  it("builds a printable PDF document without HTML interactive controls", () => {
    const pdfDocument = buildSchedulePdfPrintDocument(plan, items, dependencies, {
      viewMode: "node",
      dayWidth: 36
    });

    assert.match(pdfDocument, /^<!doctype html>/i);
    assert.match(pdfDocument, /@media print/);
    assert.match(pdfDocument, /class="pdf-print-row"/);
    assert.doesNotMatch(pdfDocument, /schedule-export-view-switch/);
    assert.doesNotMatch(pdfDocument, /data-mode=/);
    assert.doesNotMatch(pdfDocument, /"viewMode"/);
    assert.doesNotMatch(pdfDocument, /"dayWidth"/);
  });

  it("does not mutate the original items when switching export view modes", () => {
    const before = structuredClone(items);

    buildScheduleHtmlExport(plan, items, dependencies, { viewMode: "timeline", dayWidth: 28 });
    buildScheduleHtmlExport(plan, items, dependencies, { viewMode: "node", dayWidth: 18 });
    buildSchedulePdfPreviewModel(plan, items, dependencies, { viewMode: "board", dayWidth: 48 });

    assert.deepEqual(items, before);
  });
});
