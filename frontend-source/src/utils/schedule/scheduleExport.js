import { buildDays, buildWeeks, clampDateRange, daysBetween, formatSlashDate } from "./dateRange.js";
import { getScheduleColorInfo } from "./scheduleColors.js";
import { getScheduleRowKind } from "./timelineLayout.js";

const DEFAULT_DAY_WIDTH = 28;
const DEFAULT_ROW_HEIGHT = 34;
const PDF_COLUMN_WIDTH = 22;
const TASK_BAR_HEIGHT = 8;
const VIEW_MODES = ["timeline", "board", "node"];
const VIEW_MODE_LABELS = {
  timeline: "时间线",
  board: "看板",
  node: "节点"
};

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clonePlain(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return structuredClone(value);
}

function normalizeViewMode(value) {
  return VIEW_MODES.includes(value) ? value : "timeline";
}

function normalizeDateRange(plan = {}, items = [], options = {}) {
  const explicitRange = clampDateRange(options.startDate || plan.startDate, options.endDate || plan.endDate);
  if (explicitRange.startDate && explicitRange.endDate) return explicitRange;

  const dates = items
    .flatMap((item) => [formatSlashDate(item.startDate), formatSlashDate(item.endDate)])
    .filter(Boolean)
    .sort((a, b) => daysBetween(a, b));

  if (!dates.length) return { startDate: "", endDate: "" };
  return clampDateRange(dates[0], dates[dates.length - 1]);
}

function normalizePlan(plan = {}, range = {}) {
  return {
    id: String(plan.id || plan.planId || ""),
    title: String(plan.title || "项目排期"),
    projectName: String(plan.projectName || plan.project?.name || plan.name || "新活动，福利，新界面......"),
    startDate: range.startDate,
    endDate: range.endDate,
    status: String(plan.status || ""),
    summary: clonePlain(plan.summary, {})
  };
}

function itemId(item = {}, index = 0) {
  return String(item.id || item.itemId || item.taskUid || `schedule-export-item-${index + 1}`);
}

function shouldIncludeItem(item = {}, options = {}) {
  const hiddenIds = new Set(options.hideItems || options.hiddenItemIds || []);
  if (hiddenIds.has(item.id) || hiddenIds.has(item.itemId)) return false;
  if (item.hidden || item.isHidden || item.is_hidden) return false;

  const rowKind = getScheduleRowKind(item);
  if (rowKind === "task" && options.includeTasks === false) return false;
  if (rowKind === "schedule" && options.includeSchedules === false) return false;
  return true;
}

function normalizeItem(item = {}, index = 0, range = {}) {
  const dates = clampDateRange(item.startDate || item.start_date, item.endDate || item.end_date);
  const colorInfo = getScheduleColorInfo(item.module || item.departmentCode || item.department_code);
  const rowKind = getScheduleRowKind({
    ...item,
    type: item.type || item.displayType || item.display_type || item.payload?.displayType
  });
  const startOffset = range.startDate && dates.startDate ? daysBetween(range.startDate, dates.startDate) : 0;
  const duration = dates.startDate && dates.endDate ? Math.max(1, daysBetween(dates.startDate, dates.endDate) + 1) : 1;

  return {
    id: itemId(item, index),
    title: String(item.title || item.name || "未命名排期"),
    module: colorInfo.key,
    moduleLabel: colorInfo.label,
    color: colorInfo.color,
    type: rowKind,
    barStyle: rowKind === "task" ? "thin" : "thick",
    startDate: dates.startDate,
    endDate: dates.endDate,
    startOffset,
    duration,
    status: String(item.status || ""),
    progress: Number(item.progress || 0),
    owner: String(item.owner || ""),
    commentsCount: Number(item.commentsCount ?? item.comments_count ?? 0),
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? index)
  };
}

function normalizeItems(items = [], range = {}, options = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => shouldIncludeItem(item, options))
    .map((item, index) => normalizeItem(item, index, range))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function normalizeDependencies(dependencies = []) {
  return (Array.isArray(dependencies) ? dependencies : []).map((dependency, index) => ({
    id: String(dependency.id || `schedule-export-dependency-${index + 1}`),
    fromItemId: String(dependency.fromItemId || dependency.from_item_id || ""),
    toItemId: String(dependency.toItemId || dependency.to_item_id || ""),
    type: String(dependency.type || "finish_to_start"),
    lagDays: Number(dependency.lagDays || dependency.lag_days || 0)
  }));
}

function buildSummary(plan = {}, items = [], range = {}) {
  const scheduleCount = items.filter((item) => item.type === "schedule").length;
  const taskCount = items.filter((item) => item.type === "task").length;

  return {
    title: plan.title,
    projectName: plan.projectName,
    dateRange: range.startDate && range.endDate ? `${range.startDate}-${range.endDate}` : "",
    itemCount: items.length,
    scheduleCount,
    taskCount
  };
}

function buildTimeline(range = {}, columnWidth = DEFAULT_DAY_WIDTH) {
  const days = buildDays(range.startDate, range.endDate);
  return {
    range: clonePlain(range, { startDate: "", endDate: "" }),
    days,
    weeks: buildWeeks(days),
    totalWidth: days.length * columnWidth
  };
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dayLabel(day = {}) {
  return String(day.day || "").padStart(2, "0");
}

function weekLabel(week = {}) {
  return `${week.startDate || ""}-${String(week.endDate || "").slice(5)}`;
}

function buildExportWeekCells(weeks = []) {
  return weeks
    .map((week) => {
      const days = Array.isArray(week.days) ? week.days.length : 1;
      return `<span class="export-week" style="--week-days:${Math.max(1, days)}">${escapeHtml(weekLabel(week))}</span>`;
    })
    .join("");
}

function buildExportDayCells(days = [], className = "export-day") {
  return days
    .map((day) => {
      const restClass = day.isRestDay ? " is-rest-day" : "";
      const title = day.holidayName ? `${day.date} ${day.holidayName}` : day.date;
      return `<span class="${className}${restClass}" title="${escapeHtml(title)}">${escapeHtml(dayLabel(day))}</span>`;
    })
    .join("");
}

function buildExportLeftRows(items = [], rowClass = "export-left-row") {
  return items
    .map((item) => `<div class="${rowClass}" style="--item-color:${escapeHtml(item.color || "#58a9d5")}"><i></i><span>${escapeHtml(item.title)}</span></div>`)
    .join("");
}

function buildExportBars(items = [], rowHeight = DEFAULT_ROW_HEIGHT, barClass = "export-bar") {
  return items
    .map((item, index) => {
      const isTask = item.type === "task";
      const top = index * rowHeight + (isTask ? Math.round((rowHeight - TASK_BAR_HEIGHT) / 2) : Math.max(6, Math.round((rowHeight - 16) / 2)));
      const title = `${item.title} ${item.startDate || ""}-${item.endDate || ""}`.trim();
      return `<div class="${barClass}${isTask ? " is-thin" : ""}" title="${escapeHtml(title)}" style="--start-offset:${Math.max(0, item.startOffset || 0)};--duration:${Math.max(1, item.duration || 1)};top:${top}px;background:${escapeHtml(item.color || "#58a9d5")}"></div>`;
    })
    .join("");
}

function buildInteractiveHtmlDocument(snapshot = {}, controls = {}) {
  const data = {
    interactive: true,
    viewMode: controls.viewMode,
    dayWidth: controls.dayWidth,
    rowHeight: controls.rowHeight,
    items: snapshot.items,
    dependencies: snapshot.dependencies,
    plan: snapshot.plan,
    timeline: snapshot.timeline
  };
  const days = snapshot.timeline?.days || [];
  const weeks = snapshot.timeline?.weeks || [];
  const itemCount = Math.max(1, snapshot.items?.length || 0);
  const safeViewMode = normalizeViewMode(controls.viewMode);
  const safeDayWidth = toPositiveNumber(controls.dayWidth, DEFAULT_DAY_WIDTH);
  const safeRowHeight = toPositiveNumber(controls.rowHeight, DEFAULT_ROW_HEIGHT);
  const canvasWidth = Math.max(760, days.length * safeDayWidth);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(snapshot.plan.title)} 网页导出</title>
  <style>
    :root { --day-width: ${safeDayWidth}px; --row-height: ${safeRowHeight}px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif; color: #22302a; background: #f5f7f8; }
    .export-shell { min-height: 100vh; padding: 24px; }
    .export-toolbar { display: flex; gap: 18px; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .export-title h1 { margin: 0 0 4px; color: #173f2a; font-size: 24px; line-height: 1.2; }
    .export-title span { color: #6d7781; font-size: 13px; }
    .export-controls { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .export-controls button { height: 32px; padding: 0 11px; border: 1px solid #cfd6dd; border-radius: 8px; color: #44515b; background: #ffffff; cursor: pointer; }
    .export-controls button.is-active { color: #1679bd; border-color: #9bd1f3; background: #eef8ff; }
    .export-viewport { overflow: auto; border: 1px solid #cfd5dc; border-radius: 10px; background: #ffffff; box-shadow: 0 14px 36px rgba(26, 43, 58, 0.08); }
    .export-board { display: grid; grid-template-columns: 260px max-content; align-items: start; min-width: 100%; }
    .export-left { position: sticky; left: 0; z-index: 2; border-right: 1px solid #cfd5dc; background: #ffffff; }
    .export-left-head { display: flex; align-items: center; height: 48px; padding: 0 14px; border-bottom: 1px solid #cfd5dc; color: #22302a; font-size: 13px; font-weight: 700; }
    .export-left-row { position: relative; display: grid; grid-template-columns: 10px minmax(0, 1fr); gap: 8px; align-items: center; height: var(--row-height); padding: 0 12px; border-bottom: 1px solid #ffffff; color: #4c5963; font-size: 12px; background: #f2f3f5; }
    .export-left-row:nth-child(odd) { background: #e9eef2; }
    .export-left-row::before { position: absolute; top: 0; bottom: 0; left: 0; width: 5px; background: var(--item-color); content: ""; }
    .export-left-row i { width: 6px; height: 6px; border-radius: 50%; background: var(--item-color); }
    .export-left-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .export-canvas { min-width: ${canvasWidth}px; width: calc(${Math.max(1, days.length)} * var(--day-width)); }
    .export-weeks, .export-days, .export-grid-days { display: flex; }
    .export-week { display: inline-flex; align-items: center; justify-content: center; width: calc(var(--week-days) * var(--day-width)); height: 24px; border-right: 2px solid #cbd2da; color: #7f8a94; font-size: 12px; background: #ffffff; }
    .export-day, .export-grid-day { flex: 0 0 var(--day-width); width: var(--day-width); }
    .export-day { display: inline-flex; align-items: center; justify-content: center; height: 24px; border-top: 1px solid #e1e4e8; border-right: 1px solid #e1e4e8; color: #89929c; font-size: 12px; background: #f1f2f3; }
    .export-day.is-rest-day, .export-grid-day.is-rest-day { background: #77dc86; }
    .export-grid { position: relative; min-height: calc(${itemCount} * var(--row-height)); overflow: hidden; }
    .export-grid-days { position: absolute; inset: 0 auto 0 0; min-height: inherit; }
    .export-grid-day { display: block; min-height: inherit; border-right: 1px solid #e1e4e8; background: repeating-linear-gradient(to bottom, #ffffff 0, #ffffff calc(var(--row-height) - 1px), #f3f5f7 calc(var(--row-height) - 1px), #f3f5f7 var(--row-height)); }
    .export-grid-day.is-rest-day { opacity: 0.45; }
    .export-bar { position: absolute; left: 0; height: 16px; width: calc(var(--duration) * var(--day-width)); transform: translateX(calc(var(--start-offset) * var(--day-width))); border-radius: 5px; box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08); }
    .export-bar.is-thin { height: ${TASK_BAR_HEIGHT}px; border-radius: 3px; opacity: 0.86; }
    .export-empty { padding: 30px; color: #7f8a94; }
    @media print { .export-controls { display: none; } .export-shell { padding: 0; } .export-viewport { border: 0; box-shadow: none; } }
  </style>
</head>
<body data-export-view-mode="${escapeHtml(safeViewMode)}">
  <main class="export-shell">
    <div class="export-toolbar">
      <div class="export-title">
        <h1>${escapeHtml(snapshot.plan.title)}</h1>
        <span>${escapeHtml(snapshot.plan.projectName)} · ${escapeHtml(snapshot.plan.startDate)} - ${escapeHtml(snapshot.plan.endDate)}</span>
      </div>
      <div class="export-controls" aria-label="网页导出控件">
        ${VIEW_MODES.map((mode) => `<button type="button" data-mode="${mode}" class="${mode === safeViewMode ? "is-active" : ""}">${escapeHtml(VIEW_MODE_LABELS[mode] || mode)}</button>`).join("")}
        <button type="button" data-zoom-out aria-label="缩小视图">缩小</button>
        <button type="button" data-zoom-in aria-label="放大视图">放大</button>
        <button type="button" data-current-zoom aria-label="当前缩放：${safeDayWidth}px">${safeDayWidth}px</button>
      </div>
    </div>
    <div id="schedule-export-root" class="export-viewport">
      <div class="export-board">
        <aside class="export-left">
          <div class="export-left-head">部门 / 排期 / 流程</div>
          ${snapshot.items?.length ? buildExportLeftRows(snapshot.items) : '<div class="export-empty">暂无排期项</div>'}
        </aside>
        <section class="export-canvas" aria-label="排期时间线">
          <div class="export-weeks">${buildExportWeekCells(weeks)}</div>
          <div class="export-days">${buildExportDayCells(days)}</div>
          <div class="export-grid">
            <div class="export-grid-days">${buildExportDayCells(days, "export-grid-day")}</div>
            ${buildExportBars(snapshot.items || [], safeRowHeight)}
          </div>
        </section>
      </div>
    </div>
  </main>
  <script type="application/json" id="schedule-export-data">${escapeScriptJson(data)}</script>
  <script>
    (function () {
      var data = JSON.parse(document.getElementById("schedule-export-data").textContent);
      var width = Number(data.dayWidth || ${safeDayWidth});
      window.__SCHEDULE_HTML_EXPORT__ = data;
      function setWidth(nextWidth) {
        width = Math.max(18, Math.min(56, nextWidth));
        document.documentElement.style.setProperty("--day-width", width + "px");
        var label = document.querySelector("[data-current-zoom]");
        if (label) {
          label.textContent = width + "px";
          label.setAttribute("aria-label", "当前缩放：" + width + "px");
        }
      }
      document.querySelectorAll("[data-mode]").forEach(function (button) {
        button.addEventListener("click", function () {
          document.body.dataset.exportViewMode = button.dataset.mode;
          document.querySelectorAll("[data-mode]").forEach(function (item) {
            item.classList.toggle("is-active", item === button);
          });
        });
      });
      var zoomIn = document.querySelector("[data-zoom-in]");
      var zoomOut = document.querySelector("[data-zoom-out]");
      if (zoomIn) zoomIn.addEventListener("click", function () { setWidth(width + 4); });
      if (zoomOut) zoomOut.addEventListener("click", function () { setWidth(width - 4); });
    })();
  </script>
</body>
</html>`;
}

export function buildScheduleHtmlExport(plan = {}, items = [], dependencies = [], options = {}) {
  const range = normalizeDateRange(plan, items, options);
  const snapshotPlan = normalizePlan(plan, range);
  const snapshotItems = normalizeItems(items, range, options);
  const snapshotDependencies = normalizeDependencies(dependencies);
  const viewMode = normalizeViewMode(options.viewMode || options.mode);
  const dayWidth = toPositiveNumber(options.dayWidth, DEFAULT_DAY_WIDTH);
  const rowHeight = toPositiveNumber(options.rowHeight, DEFAULT_ROW_HEIGHT);
  const timeline = {
    ...buildTimeline(range, dayWidth),
    dayWidth
  };
  const snapshot = {
    plan: snapshotPlan,
    items: snapshotItems,
    dependencies: snapshotDependencies,
    timeline
  };
  const controls = {
    viewMode,
    dayWidth,
    rowHeight,
    viewModes: clonePlain(VIEW_MODES, []),
    zoom: true,
    horizontalScroll: true
  };

  return {
    kind: "html",
    version: 1,
    interactive: true,
    viewMode,
    dayWidth,
    rowHeight,
    controls,
    summary: buildSummary(snapshotPlan, snapshotItems, range),
    snapshot,
    html: buildInteractiveHtmlDocument(snapshot, controls)
  };
}

export function buildSchedulePdfPreviewModel(plan = {}, items = [], dependencies = [], options = {}) {
  const range = normalizeDateRange(plan, items, options);
  const snapshotPlan = normalizePlan(plan, range);
  const snapshotItems = normalizeItems(items, range, options);
  const snapshotDependencies = normalizeDependencies(dependencies);
  const timeline = {
    ...buildTimeline(range, PDF_COLUMN_WIDTH),
    columnWidth: PDF_COLUMN_WIDTH
  };
  const page = {
    pageNumber: 1,
    title: snapshotPlan.title,
    range,
    timeline,
    items: snapshotItems,
    dependencies: snapshotDependencies
  };

  return {
    kind: "pdf-preview",
    version: 1,
    interactive: false,
    plan: snapshotPlan,
    summary: buildSummary(snapshotPlan, snapshotItems, range),
    pages: [page],
    print: {
      layout: options.printLayout || "landscape-wide",
      repeatHeaders: true,
      includeAllItems: true
    }
  };
}

export function buildSchedulePdfPrintDocument(plan = {}, items = [], dependencies = [], options = {}) {
  const preview = buildSchedulePdfPreviewModel(plan, items, dependencies, options);
  const page = preview.pages[0] || { items: [], timeline: { days: [], weeks: [], columnWidth: PDF_COLUMN_WIDTH } };
  const days = page.timeline.days || [];
  const weeks = page.timeline.weeks || [];
  const columnWidth = page.timeline.columnWidth || PDF_COLUMN_WIDTH;
  const rowHeight = DEFAULT_ROW_HEIGHT;
  const itemCount = Math.max(1, page.items.length);
  const canvasWidth = Math.max(1040, days.length * columnWidth);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(preview.plan.title)} PDF 打印</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif; color: #202a24; background: #ffffff; }
    .pdf-print-shell { padding: 18px; }
    .pdf-print-title { display: grid; grid-template-columns: 150px 170px 1fr; gap: 12px; align-items: baseline; margin-bottom: 14px; }
    .pdf-print-title h1 { margin: 0; color: #202020; font-size: 22px; line-height: 1.2; }
    .pdf-print-title span { color: #727d87; font-size: 13px; }
    .pdf-print-title strong { color: #202020; font-size: 18px; text-align: center; }
    .pdf-print-board { display: grid; grid-template-columns: 250px max-content; align-items: start; width: max-content; border: 1px solid #cfd5dc; }
    .pdf-print-left { border-right: 1px solid #cfd5dc; background: #ffffff; }
    .pdf-print-left-head { display: flex; align-items: center; height: 48px; padding: 0 12px; border-bottom: 1px solid #cfd5dc; font-size: 12px; font-weight: 700; }
    .pdf-print-row { position: relative; display: grid; grid-template-columns: 10px minmax(0, 1fr); gap: 8px; align-items: center; height: ${rowHeight}px; padding: 0 10px; border-bottom: 1px solid #ffffff; color: #4c5963; font-size: 12px; background: #f2f3f5; }
    .pdf-print-row:nth-child(odd) { background: #e9eef2; }
    .pdf-print-row::before { position: absolute; top: 0; bottom: 0; left: 0; width: 5px; background: var(--item-color); content: ""; }
    .pdf-print-row i { width: 6px; height: 6px; border-radius: 50%; background: var(--item-color); }
    .pdf-print-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pdf-print-canvas { width: ${canvasWidth}px; min-width: ${canvasWidth}px; }
    .pdf-print-weeks, .pdf-print-days, .pdf-print-grid-days { display: flex; }
    .pdf-print-week { display: inline-flex; align-items: center; justify-content: center; width: calc(var(--week-days) * ${columnWidth}px); height: 24px; border-right: 2px solid #cbd2da; color: #7f8a94; font-size: 12px; }
    .pdf-print-day, .pdf-print-grid-day { flex: 0 0 ${columnWidth}px; width: ${columnWidth}px; }
    .pdf-print-day { display: inline-flex; align-items: center; justify-content: center; height: 24px; border-top: 1px solid #e1e4e8; border-right: 1px solid #e1e4e8; color: #89929c; font-size: 11px; background: #f1f2f3; }
    .pdf-print-day.is-rest-day, .pdf-print-grid-day.is-rest-day { background: #77dc86; }
    .pdf-print-grid { position: relative; min-height: ${itemCount * rowHeight}px; overflow: hidden; }
    .pdf-print-grid-days { position: absolute; inset: 0 auto 0 0; min-height: inherit; }
    .pdf-print-grid-day { display: block; min-height: inherit; border-right: 1px solid #e1e4e8; background: repeating-linear-gradient(to bottom, #ffffff 0, #ffffff ${rowHeight - 1}px, #f3f5f7 ${rowHeight - 1}px, #f3f5f7 ${rowHeight}px); }
    .pdf-print-grid-day.is-rest-day { opacity: 0.45; }
    .pdf-print-bar { position: absolute; left: 0; height: 16px; width: calc(var(--duration) * ${columnWidth}px); transform: translateX(calc(var(--start-offset) * ${columnWidth}px)); border-radius: 5px; box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08); }
    .pdf-print-bar.is-thin { height: ${TASK_BAR_HEIGHT}px; border-radius: 3px; opacity: 0.86; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { background: #ffffff; } .pdf-print-shell { padding: 0; } }
  </style>
</head>
<body>
  <main class="pdf-print-shell">
    <div class="pdf-print-title">
      <h1>${escapeHtml(preview.plan.title)}</h1>
      <span>${escapeHtml(preview.plan.startDate)} - ${escapeHtml(preview.plan.endDate)}</span>
      <strong>${escapeHtml(preview.plan.projectName)}</strong>
    </div>
    <section class="pdf-print-board" aria-label="静态排期打印预览">
      <aside class="pdf-print-left">
        <div class="pdf-print-left-head">部门 / 排期 / 流程</div>
        ${page.items.length ? buildExportLeftRows(page.items, "pdf-print-row") : '<div class="pdf-print-row"><span></span><span>暂无排期项</span></div>'}
      </aside>
      <div class="pdf-print-canvas">
        <div class="pdf-print-weeks">${buildExportWeekCells(weeks).replaceAll("export-week", "pdf-print-week")}</div>
        <div class="pdf-print-days">${buildExportDayCells(days, "pdf-print-day")}</div>
        <div class="pdf-print-grid">
          <div class="pdf-print-grid-days">${buildExportDayCells(days, "pdf-print-grid-day")}</div>
          ${buildExportBars(page.items, rowHeight, "pdf-print-bar")}
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}
