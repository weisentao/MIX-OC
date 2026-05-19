import { addDays, clampDateRange, daysBetween, formatSlashDate } from "./dateRange.js";
import { getScheduleColorInfo, normalizeScheduleModuleKey } from "./scheduleColors.js";

export const SCHEDULE_DEPARTMENT_ORDER = ["项目管理", "AIGC", "美术设计", "三维动态", "动效设计", "视效包装"];
const SCHEDULE_DEPARTMENT_KEY_ORDER = ["project", "aigc", "design", "threeD", "motion", "post"];

const ROW_ORDER_STEP = 100;

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function roundDayDelta(deltaX, dayWidth) {
  const raw = Number(deltaX || 0) / dayWidth;
  const magnitude = Math.floor(Math.abs(raw) + 0.5);
  return Math.sign(raw) * magnitude;
}

function getItemId(item = {}) {
  return String(item.id || item.itemId || "");
}

function explicitRowOrder(item = {}) {
  const candidates = [
    item.sortOrder,
    item.sort_order,
    item.rowOrder,
    item.row_order,
    item.displayOrder,
    item.display_order,
    item.order,
    item.payload?.sortOrder,
    item.payload?.rowOrder,
    item.payload?.displayOrder
  ];
  for (const candidate of candidates) {
    if (candidate === "" || candidate === null || candidate === undefined) continue;
    const number = Number(candidate);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

export function getScheduleDepartmentRank(moduleValue) {
  const colorInfo = getScheduleColorInfo(moduleValue);
  const index = SCHEDULE_DEPARTMENT_KEY_ORDER.indexOf(colorInfo.key);
  return index >= 0 ? index : SCHEDULE_DEPARTMENT_ORDER.length;
}

export function getScheduleDepartmentKey(item = {}) {
  return getScheduleColorInfo(item.module).key;
}

export function sortScheduleRowsForTimeline(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index, order: explicitRowOrder(item) }))
    .sort((left, right) => {
      const departmentCompare = getScheduleDepartmentRank(left.item.module) - getScheduleDepartmentRank(right.item.module);
      if (departmentCompare !== 0) return departmentCompare;
      if (left.order !== null || right.order !== null) {
        const orderCompare = (left.order ?? left.index * ROW_ORDER_STEP) - (right.order ?? right.index * ROW_ORDER_STEP);
        if (orderCompare !== 0) return orderCompare;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

export function createScheduleRowMovePlan(items = [], itemId = "", direction = "up") {
  const sortedRows = sortScheduleRowsForTimeline(items);
  const movingId = String(itemId || "");
  const currentIndex = sortedRows.findIndex((item) => getItemId(item) === movingId);
  if (currentIndex < 0) return { ok: false, reason: "notFound", updates: [] };

  const offset = direction === "down" ? 1 : -1;
  const targetIndex = currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= sortedRows.length) return { ok: false, reason: "edge", updates: [] };

  const movingItem = sortedRows[currentIndex];
  const targetItem = sortedRows[targetIndex];
  const movingDepartment = getScheduleDepartmentKey(movingItem);
  if (movingDepartment !== getScheduleDepartmentKey(targetItem)) {
    return { ok: false, reason: "crossDepartment", updates: [] };
  }

  const departmentRows = sortedRows.filter((item) => getScheduleDepartmentKey(item) === movingDepartment);
  const currentDepartmentIndex = departmentRows.findIndex((item) => getItemId(item) === movingId);
  const targetDepartmentIndex = currentDepartmentIndex + offset;
  if (targetDepartmentIndex < 0 || targetDepartmentIndex >= departmentRows.length) {
    return { ok: false, reason: "edge", updates: [] };
  }

  const reorderedDepartmentRows = [...departmentRows];
  const [movedItem] = reorderedDepartmentRows.splice(currentDepartmentIndex, 1);
  reorderedDepartmentRows.splice(targetDepartmentIndex, 0, movedItem);

  return {
    ok: true,
    reason: "moved",
    itemId: movingId,
    updates: reorderedDepartmentRows.map((item, index) => ({
      id: getItemId(item),
      item,
      sortOrder: (index + 1) * ROW_ORDER_STEP
    }))
  };
}

export function getTimelineMetrics(item = {}, range = {}, layout = {}) {
  const dayWidth = toPositiveNumber(layout.dayWidth, 28);
  const itemRange = clampDateRange(item.startDate, item.endDate);
  const visibleRange = clampDateRange(range.startDate, range.endDate);

  if (!itemRange.startDate || !itemRange.endDate || !visibleRange.startDate || !visibleRange.endDate) {
    return {
      hidden: true,
      left: 0,
      width: 0,
      visibleStartDate: "",
      visibleEndDate: ""
    };
  }

  if (daysBetween(itemRange.endDate, visibleRange.startDate) > 0 || daysBetween(visibleRange.endDate, itemRange.startDate) > 0) {
    return {
      hidden: true,
      left: 0,
      width: 0,
      visibleStartDate: "",
      visibleEndDate: ""
    };
  }

  const visibleStartDate =
    daysBetween(visibleRange.startDate, itemRange.startDate) < 0 ? visibleRange.startDate : itemRange.startDate;
  const visibleEndDate = daysBetween(itemRange.endDate, visibleRange.endDate) > 0 ? itemRange.endDate : visibleRange.endDate;
  const left = Math.max(0, daysBetween(visibleRange.startDate, visibleStartDate) * dayWidth);
  const width = Math.max(dayWidth, (daysBetween(visibleStartDate, visibleEndDate) + 1) * dayWidth);

  return {
    hidden: false,
    left,
    width,
    visibleStartDate,
    visibleEndDate
  };
}

export function getBarStyle(item = {}, range = {}, layout = {}) {
  const metrics = getTimelineMetrics(item, range, layout);
  if (metrics.hidden) {
    return {
      display: "none",
      left: "0px",
      transform: "translateX(0px)",
      width: "0px",
      "--schedule-bar-left": "0px",
      "--schedule-bar-width": "0px"
    };
  }

  return {
    left: "0px",
    transform: `translateX(${metrics.left}px)`,
    width: `${metrics.width}px`,
    "--schedule-bar-left": `${metrics.left}px`,
    "--schedule-bar-width": `${metrics.width}px`
  };
}

export function getBarPreviewStyle(item = {}, range = {}, layout = {}, deltaX = 0, mode = "move") {
  const metrics = getTimelineMetrics(item, range, layout);
  if (metrics.hidden) return getBarStyle(item, range, layout);

  const dayWidth = toPositiveNumber(layout.dayWidth, 28);
  const delta = Number(deltaX || 0);
  let left = metrics.left;
  let width = metrics.width;

  if (mode === "resize-start") {
    const right = metrics.left + metrics.width;
    left = Math.min(metrics.left + delta, right - dayWidth);
    left = Math.max(0, left);
    width = right - left;
  } else if (mode === "resize-end") {
    width = Math.max(dayWidth, metrics.width + delta);
  } else {
    left = Math.max(0, metrics.left + delta);
  }

  const roundedLeft = Math.round(left);
  const roundedWidth = Math.round(Math.max(dayWidth, width));

  return {
    left: "0px",
    transform: `translateX(${roundedLeft}px)`,
    width: `${roundedWidth}px`,
    "--schedule-bar-left": `${roundedLeft}px`,
    "--schedule-bar-width": `${roundedWidth}px`
  };
}

export function getTimelineWidth(range = {}, layout = {}) {
  const dayWidth = toPositiveNumber(layout.dayWidth, 28);
  const visibleRange = clampDateRange(range.startDate, range.endDate);
  if (!visibleRange.startDate || !visibleRange.endDate) return 0;
  return (daysBetween(visibleRange.startDate, visibleRange.endDate) + 1) * dayWidth;
}

export function shouldShowWeekHeaderLabel(week = {}, layout = {}) {
  const dayWidth = toPositiveNumber(layout.dayWidth, 28);
  const dayCount = Array.isArray(week.days) ? week.days.length : 0;
  const width = dayCount * dayWidth;
  const minReadableWidth = week.isSingleDay ? 44 : 56;

  return width >= minReadableWidth;
}

export function getDateRangeFromDragDelta(item = {}, deltaX = 0, layout = {}, mode = "move") {
  const range = clampDateRange(item.startDate, item.endDate);
  if (!range.startDate || !range.endDate) return range;

  const dayWidth = toPositiveNumber(layout.dayWidth, 28);
  const dayDelta = roundDayDelta(deltaX, dayWidth);
  if (!dayDelta) return range;

  if (mode === "resize-start") {
    let startDate = formatSlashDate(addDays(range.startDate, dayDelta));
    if (daysBetween(startDate, range.endDate) < 0) startDate = range.endDate;
    return { startDate, endDate: range.endDate };
  }

  if (mode === "resize-end") {
    let endDate = formatSlashDate(addDays(range.endDate, dayDelta));
    if (daysBetween(range.startDate, endDate) < 0) endDate = range.startDate;
    return { startDate: range.startDate, endDate };
  }

  return {
    startDate: formatSlashDate(addDays(range.startDate, dayDelta)),
    endDate: formatSlashDate(addDays(range.endDate, dayDelta))
  };
}

export function getRowStyle(index = 0, layout = {}) {
  const rowHeight = toPositiveNumber(layout.rowHeight, 34);
  const top = Math.max(0, Number(index || 0)) * rowHeight;
  return {
    transform: `translateY(${top}px)`,
    height: `${rowHeight}px`,
    "--schedule-row-top": `${top}px`,
    "--schedule-row-height": `${rowHeight}px`
  };
}

export function getScheduleRowKind(item = {}) {
  return String(item.type || item.payload?.displayType || "").toLowerCase() === "task" ? "task" : "schedule";
}

export function filterScheduleRows(items = [], rowFilter = "all", options = {}) {
  const showHiddenItems = Boolean(options.showHiddenItems);
  const filter = ["all", "schedule", "task"].includes(rowFilter) ? rowFilter : "all";
  const departmentFilter = String(options.departmentFilter || "全部").trim();
  const departmentFilterKey = normalizeScheduleModuleKey(departmentFilter);

  const filteredRows = (Array.isArray(items) ? items : []).filter((item) => {
    if (!showHiddenItems && item.hidden) return false;
    if (filter !== "all" && getScheduleRowKind(item) !== filter) return false;
    if (departmentFilter && departmentFilter !== "全部") {
      const colorInfo = getScheduleColorInfo(item.module);
      if (!departmentFilterKey || colorInfo.key !== departmentFilterKey) return false;
    }
    return true;
  });

  return sortScheduleRowsForTimeline(filteredRows);
}

export function getBarVisualStyle(item = {}, layout = {}) {
  const rowHeight = toPositiveNumber(layout.rowHeight, 34);
  if (getScheduleRowKind(item) === "task") {
    const height = 8;
    return {
      height: `${height}px`,
      top: `${Math.round((rowHeight - height) / 2)}px`,
      "--schedule-bar-height": `${height}px`,
      "--schedule-bar-top": `${Math.round((rowHeight - height) / 2)}px`
    };
  }

  const height = 18;
  const top = Math.round((rowHeight - height) / 2);
  return {
    height: `${height}px`,
    top: `${top}px`,
    "--schedule-bar-height": `${height}px`,
    "--schedule-bar-top": `${top}px`
  };
}

export function getBarColorStyle(item = {}) {
  const color = getScheduleColorInfo(item.module).color;
  return {
    "--schedule-item-color": color,
    "--schedule-item-color-soft": `${color}2b`
  };
}
