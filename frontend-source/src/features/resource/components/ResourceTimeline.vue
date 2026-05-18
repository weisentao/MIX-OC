<script setup>
import { computed, nextTick, reactive, shallowRef, watch } from "vue";

const props = defineProps({
  people: { type: Array, default: () => [] },
  departments: { type: Array, default: () => [] },
  workItems: { type: Array, default: () => [] },
  availability: { type: Array, default: () => [] },
  selectedPersonId: { type: String, default: "" },
  selectedWorkItemId: { type: String, default: "" },
  mode: { type: String, default: "timeline" },
  activeView: { type: String, default: "superAdmin" },
  canReschedule: { type: Boolean, default: true },
  range: {
    type: Object,
    default: () => ({ startDate: "2026/05/10", endDate: "2026/06/21" })
  }
});

const emit = defineEmits(["selectPerson", "selectWorkItem", "openAssignment", "contextmenu", "rescheduleWorkItem"]);

const DEFAULT_DAY_WIDTH = 28;
const MIN_DAY_WIDTH = 18;
const MAX_DAY_WIDTH = 56;
const FIXED_COLUMN_WIDTH = 210;
const RANGE_PADDING_DAYS = 21;
const RANGE_EDGE_BUFFER_DAYS = 10;
const WHEEL_ZOOM_STEP = 1.12;
const AUTO_PAN_EDGE_PX = 44;
const AUTO_PAN_STEP_PX = 30;
const TIMELINE_PAN_MOVE_THRESHOLD = 3;
const rowHeight = 46;
const dayWidth = shallowRef(DEFAULT_DAY_WIDTH);
const scrollLeft = shallowRef(0);

const visibleRange = reactive({
  startDate: "",
  endDate: ""
});

const dragState = reactive({
  active: false,
  pointerId: null,
  itemId: "",
  interaction: "move",
  startX: 0,
  startScrollLeft: 0,
  previousStartDate: "",
  previousEndDate: "",
  deltaDays: 0,
  hasMoved: false,
  suppressedClickItemId: ""
});

const panState = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startScrollLeft: 0,
  hasMoved: false
});

const collapsedDepartmentIds = reactive(new Set());

let capturedPointerElement = null;
let capturedPanElement = null;
let activeTimelineBody = null;
let activePanTimelineBody = null;

const timelineItemsRangeKey = computed(() => {
  return [...props.workItems, ...props.availability]
    .map((item) => `${workItemStartDateValue(item)}:${workItemEndDateValue(item)}`)
    .join("|");
});

const days = computed(() => buildDays(visibleRange.startDate, visibleRange.endDate));

const months = computed(() => {
  const items = [];
  days.value.forEach((day) => {
    const date = parseSlashDate(day.value);
    if (!date) return;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    let item = items[items.length - 1];
    if (!item || item.key !== key) {
      item = {
        key,
        yearLabel: `${year}年`,
        monthLabel: `${month}月`,
        dayCount: 0,
        width: 0
      };
      items.push(item);
    }
    item.dayCount += 1;
    item.width = item.dayCount * dayWidth.value;
  });
  return items;
});

const timelineWidth = computed(() => days.value.length * dayWidth.value);
const fullTimelineWidth = computed(() => `${FIXED_COLUMN_WIDTH + timelineWidth.value}px`);
const dayCellStyle = computed(() => ({
  width: `${dayWidth.value}px`,
  minWidth: `${dayWidth.value}px`,
  flex: `0 0 ${dayWidth.value}px`
}));

const departmentMap = computed(() => {
  return props.departments.reduce((map, department) => {
    map[department.id] = department;
    return map;
  }, {});
});

const groupedRows = computed(() => {
  const groups = [];
  props.departments.forEach((department) => {
    const people = props.people.filter((person) => person.departmentId === department.id);
    if (people.length) groups.push({ ...department, people });
  });
  return groups;
});

const hasVisibleRows = computed(() => groupedRows.value.length > 0);

function departmentPeopleCountLabel(department) {
  return `${department.people.length} 人`;
}

function isDepartmentCollapsed(departmentId) {
  return collapsedDepartmentIds.has(departmentId);
}

function toggleDepartment(departmentId) {
  if (collapsedDepartmentIds.has(departmentId)) {
    collapsedDepartmentIds.delete(departmentId);
    return;
  }
  collapsedDepartmentIds.add(departmentId);
}

watch(
  () => [props.range.startDate, props.range.endDate, timelineItemsRangeKey.value],
  () => {
    if (!visibleRange.startDate || !visibleRange.endDate) {
      ensureInitialVisibleRange();
      return;
    }

    ensureRangeContains(props.range.startDate, props.range.endDate, {
      padding: RANGE_PADDING_DAYS,
      keepScrollPosition: true
    });
    [...props.workItems, ...props.availability].forEach((item) => {
      ensureRangeContains(workItemStartDateValue(item), workItemEndDateValue(item), {
        padding: RANGE_PADDING_DAYS,
        keepScrollPosition: true
      });
    });
  },
  { immediate: true }
);

function buildDays(startValue, endValue) {
  const start = parseSlashDate(startValue);
  const end = parseSlashDate(endValue);
  if (!start || !end) return [];
  const result = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    result.push({
      value: formatSlashDate(cursor),
      short: String(cursor.getDate()).padStart(2, "0"),
      isWeekend: [0, 6].includes(cursor.getDay()),
      isMilestone: [10, 13, 17, 24, 31, 6].includes(cursor.getDate())
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function parseSlashDate(value) {
  const parts = String(value || "").replace(/-/g, "/").split("/").map((part) => Number(part));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function cloneDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatSlashDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function daysBetween(startValue, endValue) {
  const start = parseSlashDate(startValue);
  const end = parseSlashDate(endValue);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function addDays(value, amount) {
  const date = parseSlashDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + amount);
  return formatSlashDate(date);
}

function normalizeRangeDates(startValue, endValue) {
  const start = parseSlashDate(startValue);
  const end = parseSlashDate(endValue || startValue);
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function setVisibleRange(startDate, endDate) {
  const range = normalizeRangeDates(startDate, endDate);
  if (!range) return false;
  visibleRange.startDate = formatSlashDate(range.start);
  visibleRange.endDate = formatSlashDate(range.end);
  return true;
}

function workItemStartDateValue(item) {
  const range = item?.dateRange || item?.date_range || item?.range || {};
  return cleanLabel(item?.startDate || item?.start_date || item?.start || range.startDate || range.start_date || range.start || range.from);
}

function workItemEndDateValue(item) {
  const range = item?.dateRange || item?.date_range || item?.range || {};
  return cleanLabel(
    item?.endDate ||
      item?.end_date ||
      item?.end ||
      item?.dueDate ||
      item?.due_date ||
      range.endDate ||
      range.end_date ||
      range.end ||
      range.to ||
      workItemStartDateValue(item)
  );
}

function paddedRange(startValue, endValue, padding = RANGE_PADDING_DAYS) {
  const range = normalizeRangeDates(startValue, endValue);
  if (!range) return null;
  const start = cloneDate(range.start);
  const end = cloneDate(range.end);
  start.setDate(start.getDate() - padding);
  end.setDate(end.getDate() + padding);
  return {
    startDate: formatSlashDate(start),
    endDate: formatSlashDate(end)
  };
}

function dateFromOffset(dayOffset) {
  return addDays(visibleRange.startDate, dayOffset);
}

function emitTimelineContextMenu(payload) {
  emit("contextmenu", payload);
}

function nearestTimelineBody(event) {
  return event.currentTarget?.closest?.(".resource-timeline-body") ||
    event.currentTarget?.querySelector?.(".resource-timeline-body") ||
    event.currentTarget;
}

function timelineBodyFromEvent(event) {
  return event.currentTarget?.closest?.(".resource-timeline-body") ||
    event.target?.closest?.(".resource-timeline-body") ||
    activeTimelineBody;
}

function syncScrollLeftFromElement(element) {
  scrollLeft.value = element?.scrollLeft || 0;
}

function timelineContextFromClient(event) {
  const timelineBody = timelineBodyFromEvent(event);
  const rect = timelineBody?.getBoundingClientRect?.();
  if (!rect || !days.value.length) {
    return { date: "", dayIndex: -1, canvasX: 0, canvasY: 0 };
  }

  const fixedColumn = timelineBody.querySelector?.(".resource-person-cell, .resource-timeline-fixed-head")?.getBoundingClientRect?.().width || FIXED_COLUMN_WIDTH;
  const visibleTimelineX = Math.max(0, event.clientX - rect.left - fixedColumn);
  const maxCanvasX = Math.max(0, timelineWidth.value - 1);
  const canvasX = clampNumber(visibleTimelineX + (timelineBody.scrollLeft || scrollLeft.value), 0, maxCanvasX);
  const dayIndex = Math.min(days.value.length - 1, Math.max(0, Math.floor(canvasX / dayWidth.value)));
  return {
    date: days.value[dayIndex]?.value || "",
    dayIndex,
    canvasX,
    canvasY: event.clientY - rect.top
  };
}

function ensureRangeContains(startValue, endValue, options = {}) {
  const current = normalizeRangeDates(visibleRange.startDate, visibleRange.endDate);
  const target = normalizeRangeDates(startValue, endValue);
  if (!current || !target) return;

  const padding = options.padding ?? RANGE_EDGE_BUFFER_DAYS;
  const nextStart = cloneDate(current.start);
  const nextEnd = cloneDate(current.end);
  let addedLeftDays = 0;
  let changed = false;

  const paddedStart = cloneDate(target.start);
  paddedStart.setDate(paddedStart.getDate() - padding);
  if (paddedStart < nextStart) {
    addedLeftDays = daysBetween(formatSlashDate(paddedStart), formatSlashDate(nextStart));
    nextStart.setTime(paddedStart.getTime());
    changed = true;
  }

  const paddedEnd = cloneDate(target.end);
  paddedEnd.setDate(paddedEnd.getDate() + padding);
  if (paddedEnd > nextEnd) {
    nextEnd.setTime(paddedEnd.getTime());
    changed = true;
  }

  if (!changed) return;

  visibleRange.startDate = formatSlashDate(nextStart);
  visibleRange.endDate = formatSlashDate(nextEnd);
  if (addedLeftDays && options.keepScrollPosition !== false) {
    const addedLeftWidth = addedLeftDays * dayWidth.value;
    const timelineBody = nearestTimelineBody(options.event || {});
    if (timelineBody) {
      timelineBody.scrollLeft += addedLeftWidth;
      syncScrollLeftFromElement(timelineBody);
    } else {
      scrollLeft.value += addedLeftWidth;
    }
    if (dragState.active) dragState.startScrollLeft += addedLeftWidth;
  }
}

function ensureInitialVisibleRange() {
  const ranges = [];
  const propRange = normalizeRangeDates(props.range.startDate, props.range.endDate);
  if (propRange) ranges.push(propRange);

  [...props.workItems, ...props.availability].forEach((item) => {
    const itemRange = normalizeRangeDates(workItemStartDateValue(item), workItemEndDateValue(item));
    if (itemRange) ranges.push(itemRange);
  });

  if (!ranges.length) return;

  const start = ranges.reduce((minDate, range) => (range.start < minDate ? range.start : minDate), ranges[0].start);
  const end = ranges.reduce((maxDate, range) => (range.end > maxDate ? range.end : maxDate), ranges[0].end);
  const next = paddedRange(formatSlashDate(start), formatSlashDate(end));
  if (next) setVisibleRange(next.startDate, next.endDate);
}

function itemBarStyle(item) {
  const startDate = workItemStartDateValue(item);
  const endDate = workItemEndDateValue(item);
  const rawStartOffset = daysBetween(visibleRange.startDate, startDate);
  const rawEndOffset = daysBetween(visibleRange.startDate, endDate || startDate);
  if (!days.value.length || !startDate || !endDate || rawEndOffset < 0 || rawStartOffset > days.value.length - 1) {
    return {
      left: "0px",
      width: "0px",
      visibility: "hidden",
      pointerEvents: "none"
    };
  }

  const startOffset = Math.max(0, rawStartOffset);
  const endOffset = Math.min(days.value.length - 1, rawEndOffset);
  const span = Math.max(1, endOffset - startOffset + 1);
  return {
    left: `${startOffset * dayWidth.value}px`,
    width: `${Math.max(MIN_DAY_WIDTH, span * dayWidth.value - 8)}px`
  };
}

function workItemId(item) {
  return String(item?.id || item?.workItemId || item?.itemId || item?.taskId || "");
}

function timelineItemKey(prefix, item = {}, index = 0) {
  return [
    prefix,
    item.source,
    item.projectId,
    item.scheduleItemId,
    item.itemId,
    item.workItemId,
    item.taskUid,
    item.taskId,
    item.id,
    index
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("-");
}

function cleanLabel(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function valueName(value) {
  if (value && typeof value === "object") {
    return cleanLabel(value.name || value.title || value.projectName || value.project_name);
  }
  return cleanLabel(value);
}

function workItemTitle(item) {
  return cleanLabel(item?.title || item?.name || item?.taskTitle || item?.taskName, "未命名任务");
}

function workItemProjectName(item) {
  const raw = item?.raw || {};
  return cleanLabel(
    valueName(item?.project) ||
      valueName(item?.projectName) ||
      valueName(item?.project_name) ||
      valueName(raw.project) ||
      valueName(raw.projectName) ||
      valueName(raw.project_name),
    "未绑定项目"
  );
}

function workItemStartDate(item) {
  return cleanLabel(workItemStartDateValue(item), "未设置");
}

function workItemEndDate(item) {
  return cleanLabel(workItemEndDateValue(item), "未设置");
}

function workItemInteractionHint() {
  return props.canReschedule ? "可拖拽移动排期，左右拖动调整开始或结束日期，点击选择，右键打开菜单" : "只读，当前权限不可拖拽，点击查看，右键打开菜单";
}

function workItemDragDeltaLabel(item) {
  if (!isDraggingWorkItem(item)) return "";
  const prefix = dragState.interaction === "resize-start" ? "调整开始" : dragState.interaction === "resize-end" ? "调整结束" : "拖拽中";
  if (dragState.deltaDays > 0) return `${prefix}：延后 ${dragState.deltaDays} 天`;
  if (dragState.deltaDays < 0) return `${prefix}：提前 ${Math.abs(dragState.deltaDays)} 天`;
  return `${prefix}：未变更`;
}

function workItemDragDeltaText(item) {
  if (!isDraggingWorkItem(item)) return "";
  if (dragState.deltaDays > 0) return `+${dragState.deltaDays}天`;
  if (dragState.deltaDays < 0) return `${dragState.deltaDays}天`;
  return "0天";
}

function workItemBarLabel(item) {
  return [
    `任务：${workItemTitle(item)}`,
    `项目：${workItemProjectName(item)}`,
    `开始：${workItemStartDate(item)}`,
    `结束：${workItemEndDate(item)}`,
    workItemInteractionHint(),
    workItemDragDeltaLabel(item)
  ].filter(Boolean).join("；");
}

function isDraggingWorkItem(item) {
  return dragState.active && dragState.itemId === workItemId(item);
}

function isMovingWorkItem(item) {
  return isDraggingWorkItem(item) && dragState.interaction === "move";
}

function isResizingWorkItem(item) {
  return isDraggingWorkItem(item) && dragState.interaction !== "move";
}

function workItemBarStyle(item) {
  const style = itemBarStyle(item);
  if (isDraggingWorkItem(item) && dragState.deltaDays) {
    if (dragState.interaction === "move") {
      style.transform = `translateX(${dragState.deltaDays * dayWidth.value}px)`;
    } else {
      const previousStartDate = dragState.previousStartDate || workItemStartDateValue(item);
      const previousEndDate = dragState.previousEndDate || workItemEndDateValue(item) || previousStartDate;
      const previewStartDate = dragState.interaction === "resize-start" ? addDays(previousStartDate, dragState.deltaDays) : previousStartDate;
      const previewEndDate = dragState.interaction === "resize-end" ? addDays(previousEndDate, dragState.deltaDays) : previousEndDate;
      return itemBarStyle({
        ...item,
        startDate: previewStartDate,
        endDate: previewEndDate
      });
    }
  }
  return style;
}

function personItems(personId) {
  return props.workItems.filter((item) => item.personId === personId);
}

function personAvailability(personId) {
  return props.availability.filter((item) => item.personId === personId);
}

function departmentClass(departmentId) {
  const department = departmentMap.value[departmentId] || {};
  return `is-${department.color || "green"}`;
}

function pointerTimelineContext(event) {
  const canvas = event.currentTarget?.closest?.(".resource-row-canvas");
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect || !days.value.length) {
    return { date: "", dayIndex: -1, canvasX: 0, canvasY: 0 };
  }

  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;
  const dayIndex = Math.min(days.value.length - 1, Math.max(0, Math.floor(canvasX / dayWidth.value)));

  return {
    date: days.value[dayIndex]?.value || "",
    dayIndex,
    canvasX,
    canvasY
  };
}

function isTimelineBlankEvent(event) {
  return !event.target?.closest?.(".resource-workload-bar, .resource-workload-handle, .resource-availability-window");
}

function emitWorkItemContextMenu(event, item, person) {
  const timeline = pointerTimelineContext(event);
  emitTimelineContextMenu({
    targetType: "work-item",
    workItem: item,
    workItemId: workItemId(item),
    person,
    personId: person.id,
    date: timeline.date,
    dayIndex: timeline.dayIndex,
    canvasX: timeline.canvasX,
    canvasY: timeline.canvasY,
    clientX: event.clientX,
    clientY: event.clientY
  });
}

function emitDepartmentContextMenu(event, department) {
  const timeline = timelineContextFromClient(event);
  emitTimelineContextMenu({
    targetType: "department",
    department,
    departmentId: department.id,
    date: timeline.date,
    dayIndex: timeline.dayIndex,
    canvasX: timeline.canvasX,
    canvasY: timeline.canvasY,
    clientX: event.clientX,
    clientY: event.clientY
  });
}

function emitPersonContextMenu(event, person, department) {
  const timeline = timelineContextFromClient(event);
  emitTimelineContextMenu({
    targetType: "person",
    department,
    departmentId: department.id,
    person,
    personId: person.id,
    date: timeline.date,
    dayIndex: timeline.dayIndex,
    canvasX: timeline.canvasX,
    canvasY: timeline.canvasY,
    clientX: event.clientX,
    clientY: event.clientY
  });
}

function emitTimelineBlankContextMenu(event, person, department) {
  if (!isTimelineBlankEvent(event)) return;
  const timeline = pointerTimelineContext(event);
  emitTimelineContextMenu({
    targetType: "timeline-blank",
    department,
    departmentId: department.id,
    person,
    personId: person.id,
    date: timeline.date,
    dayIndex: timeline.dayIndex,
    canvasX: timeline.canvasX,
    canvasY: timeline.canvasY,
    clientX: event.clientX,
    clientY: event.clientY
  });
}

function workItemInteractionFromPointer(event) {
  const handle = event.target?.closest?.(".resource-workload-handle");
  if (handle?.classList?.contains("is-left")) return "resize-start";
  if (handle?.classList?.contains("is-right")) return "resize-end";
  return "move";
}

function autoPanTimeline(event) {
  const timelineBody = timelineBodyFromEvent(event);
  const rect = timelineBody?.getBoundingClientRect?.();
  if (!timelineBody || !rect) return;

  const distanceToLeft = event.clientX - rect.left;
  const distanceToRight = rect.right - event.clientX;
  let nextScrollLeft = timelineBody.scrollLeft;
  if (distanceToLeft < AUTO_PAN_EDGE_PX) {
    nextScrollLeft = Math.max(0, timelineBody.scrollLeft - AUTO_PAN_STEP_PX);
  } else if (distanceToRight < AUTO_PAN_EDGE_PX) {
    nextScrollLeft = timelineBody.scrollLeft + AUTO_PAN_STEP_PX;
  }

  if (nextScrollLeft !== timelineBody.scrollLeft) {
    timelineBody.scrollLeft = nextScrollLeft;
    syncScrollLeftFromElement(timelineBody);
  }
}

function dragDeltaFromPointer(event) {
  return Math.round((event.clientX - dragState.startX + scrollLeft.value - dragState.startScrollLeft) / dayWidth.value);
}

function dragPreviewRange(item, deltaDays = dragState.deltaDays) {
  const previousStartDate = dragState.previousStartDate || workItemStartDateValue(item);
  const previousEndDate = dragState.previousEndDate || workItemEndDateValue(item) || previousStartDate;
  if (!previousStartDate || !previousEndDate) return { startDate: "", endDate: "" };

  if (dragState.interaction === "resize-start") {
    return {
      startDate: addDays(previousStartDate, deltaDays),
      endDate: previousEndDate
    };
  }

  if (dragState.interaction === "resize-end") {
    return {
      startDate: previousStartDate,
      endDate: addDays(previousEndDate, deltaDays)
    };
  }

  return {
    startDate: addDays(previousStartDate, deltaDays),
    endDate: addDays(previousEndDate, deltaDays)
  };
}

function normalizeInteractionDelta(item, deltaDays) {
  if (dragState.interaction === "resize-start") {
    const maxDelta = daysBetween(dragState.previousStartDate || workItemStartDateValue(item), dragState.previousEndDate || workItemEndDateValue(item));
    return Math.min(maxDelta, deltaDays);
  }

  if (dragState.interaction === "resize-end") {
    const minDelta = -daysBetween(dragState.previousStartDate || workItemStartDateValue(item), dragState.previousEndDate || workItemEndDateValue(item));
    return Math.max(minDelta, deltaDays);
  }

  return deltaDays;
}

function startWorkItemDrag(event, item) {
  if (!props.canReschedule) return;
  if (event.button !== 0) return;
  const itemId = workItemId(item);
  if (!itemId) return;
  const previousStartDate = workItemStartDateValue(item);
  const previousEndDate = workItemEndDateValue(item) || previousStartDate;
  if (!previousStartDate || !previousEndDate) return;

  dragState.active = true;
  dragState.pointerId = event.pointerId;
  dragState.itemId = itemId;
  dragState.interaction = workItemInteractionFromPointer(event);
  dragState.startX = event.clientX;
  dragState.startScrollLeft = scrollLeft.value;
  dragState.previousStartDate = previousStartDate;
  dragState.previousEndDate = previousEndDate;
  dragState.deltaDays = 0;
  dragState.hasMoved = false;
  capturedPointerElement = event.currentTarget || null;
  activeTimelineBody = timelineBodyFromEvent(event);
  capturedPointerElement?.setPointerCapture?.(event.pointerId);
}

function moveWorkItemDrag(event, item) {
  if (!dragState.active || dragState.pointerId !== event.pointerId) return;

  autoPanTimeline(event);
  const nextDeltaDays = normalizeInteractionDelta(item, dragDeltaFromPointer(event));
  dragState.deltaDays = nextDeltaDays;
  if (nextDeltaDays !== 0) dragState.hasMoved = true;
  const previewRange = dragPreviewRange(item, nextDeltaDays);
  ensureRangeContains(previewRange.startDate, previewRange.endDate, { event });
}

function resetWorkItemDrag() {
  dragState.active = false;
  dragState.pointerId = null;
  dragState.itemId = "";
  dragState.interaction = "move";
  dragState.startX = 0;
  dragState.startScrollLeft = 0;
  dragState.previousStartDate = "";
  dragState.previousEndDate = "";
  dragState.deltaDays = 0;
  dragState.hasMoved = false;
  capturedPointerElement = null;
  activeTimelineBody = null;
}

function suppressNextWorkItemClick(itemId) {
  dragState.suppressedClickItemId = itemId;
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    if (dragState.suppressedClickItemId === itemId) dragState.suppressedClickItemId = "";
  }, 0);
}

function endWorkItemDrag(event, item, person) {
  if (!dragState.active || dragState.pointerId !== event.pointerId || dragState.itemId !== workItemId(item)) return;

  capturedPointerElement?.releasePointerCapture?.(event.pointerId);
  const itemId = dragState.itemId;
  const interaction = dragState.interaction;
  const previousStartDate = dragState.previousStartDate || workItemStartDateValue(item);
  const previousEndDate = dragState.previousEndDate || workItemEndDateValue(item) || previousStartDate;
  const deltaDays = dragState.deltaDays;
  const shouldEmit = dragState.hasMoved && deltaDays !== 0;
  const nextRange = dragPreviewRange(item, deltaDays);
  resetWorkItemDrag();

  if (!shouldEmit) return;

  const startDate = nextRange.startDate;
  const endDate = nextRange.endDate;
  suppressNextWorkItemClick(itemId);

  if (!startDate || !endDate) return;
  emit("rescheduleWorkItem", {
    workItem: item,
    workItemId: itemId,
    person,
    personId: person.id,
    startDate,
    endDate,
    interaction,
    previousStartDate,
    previousEndDate,
    deltaDays
  });
}

function cancelWorkItemDrag(event, item) {
  if (!dragState.active || dragState.pointerId !== event.pointerId || dragState.itemId !== workItemId(item)) return;
  capturedPointerElement?.releasePointerCapture?.(event.pointerId);
  resetWorkItemDrag();
}

function selectWorkItem(item) {
  const itemId = workItemId(item);
  if (dragState.suppressedClickItemId === itemId) {
    dragState.suppressedClickItemId = "";
    return;
  }
  emit("selectWorkItem", item);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function syncTimelineScroll(event) {
  scrollLeft.value = event.currentTarget?.scrollLeft || 0;
}

function startTimelinePan(event) {
  if (event.button !== 0 || dragState.active || !isTimelineBlankEvent(event)) return;
  const timelineBody = timelineBodyFromEvent(event);
  if (!timelineBody) return;

  panState.active = true;
  panState.pointerId = event.pointerId;
  panState.startX = event.clientX;
  panState.startScrollLeft = timelineBody.scrollLeft;
  panState.hasMoved = false;
  capturedPanElement = event.currentTarget || null;
  activePanTimelineBody = timelineBody;
  capturedPanElement?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function moveTimelinePan(event) {
  if (!panState.active || panState.pointerId !== event.pointerId) return;
  const timelineBody = activePanTimelineBody || timelineBodyFromEvent(event);
  if (!timelineBody) return;

  const deltaX = event.clientX - panState.startX;
  if (Math.abs(deltaX) >= TIMELINE_PAN_MOVE_THRESHOLD) panState.hasMoved = true;
  const maxScrollLeft = Math.max(0, timelineBody.scrollWidth - timelineBody.clientWidth);
  timelineBody.scrollLeft = clampNumber(panState.startScrollLeft - deltaX, 0, maxScrollLeft);
  syncScrollLeftFromElement(timelineBody);
  if (panState.hasMoved) event.preventDefault();
}

function resetTimelinePan() {
  panState.active = false;
  panState.pointerId = null;
  panState.startX = 0;
  panState.startScrollLeft = 0;
  panState.hasMoved = false;
  capturedPanElement = null;
  activePanTimelineBody = null;
}

function endTimelinePan(event) {
  if (!panState.active || panState.pointerId !== event.pointerId) return;
  capturedPanElement?.releasePointerCapture?.(event.pointerId);
  const hadMoved = panState.hasMoved;
  resetTimelinePan();
  if (hadMoved) event.preventDefault();
}

function cancelTimelinePan(event) {
  if (!panState.active || panState.pointerId !== event.pointerId) return;
  capturedPanElement?.releasePointerCapture?.(event.pointerId);
  resetTimelinePan();
}

function handleTimelineBlankContextMenu(event, person, department) {
  if (!isTimelineBlankEvent(event)) return;
  event.preventDefault();
  emitTimelineBlankContextMenu(event, person, department);
}

async function zoomTimeline(event) {
  const timelineBody = nearestTimelineBody(event);
  const rect = timelineBody?.getBoundingClientRect?.();
  if (!timelineBody || !rect || !days.value.length) return;

  const previousScrollTop = timelineBody.scrollTop;
  event.preventDefault();
  const oldDayWidth = dayWidth.value;
  const zoomFactor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
  const nextDayWidth = clampNumber(oldDayWidth * zoomFactor, MIN_DAY_WIDTH, MAX_DAY_WIDTH);
  if (nextDayWidth === oldDayWidth) {
    timelineBody.scrollTop = previousScrollTop;
    return;
  }

  const fixedColumn = timelineBody.querySelector?.(".resource-person-cell, .resource-timeline-fixed-head")?.getBoundingClientRect?.().width || FIXED_COLUMN_WIDTH;
  const timelineViewportWidth = Math.max(0, rect.width - fixedColumn);
  const anchorViewportX = clampNumber(event.clientX - rect.left - fixedColumn, 0, timelineViewportWidth);
  const pointerX = anchorViewportX + timelineBody.scrollLeft;
  const anchorDayOffset = Math.max(0, pointerX / oldDayWidth);
  dayWidth.value = nextDayWidth;
  await nextTick();
  const maxScrollLeft = Math.max(0, timelineBody.scrollWidth - timelineBody.clientWidth);
  timelineBody.scrollLeft = clampNumber(anchorDayOffset * nextDayWidth - anchorViewportX, 0, maxScrollLeft);
  timelineBody.scrollTop = previousScrollTop;
  syncScrollLeftFromElement(timelineBody);
}
</script>

<template>
  <section class="resource-timeline" :class="[`is-${mode}`, `is-${activeView}`]" aria-label="人力甘特图">
    <div class="resource-timeline-head">
      <div class="resource-timeline-fixed-head">
        <span>姓名 / 部门 / 项目</span>
      </div>
      <div class="resource-timeline-scale" :style="{ width: `${timelineWidth}px`, transform: `translateX(-${scrollLeft}px)` }">
        <div class="resource-week-row resource-month-row">
          <span
            v-for="month in months"
            :key="month.key"
            class="resource-week-cell resource-month-cell"
            :style="{ width: `${month.width}px` }"
            :title="`${month.yearLabel} ${month.monthLabel}`"
          >
            <strong>{{ month.monthLabel }}</strong>
            <small v-if="month.dayCount > 2">{{ month.yearLabel }}</small>
          </span>
        </div>
        <div class="resource-day-row">
          <span
            v-for="day in days"
            :key="day.value"
            class="resource-day-cell"
            :class="{ 'is-weekend': day.isWeekend, 'is-milestone': day.isMilestone }"
            :style="dayCellStyle"
          >
            {{ day.short }}
          </span>
        </div>
      </div>
    </div>

    <div
      class="resource-timeline-body"
      :class="{ 'is-panning': panState.active }"
      @scroll="syncTimelineScroll"
      @wheel="zoomTimeline"
    >
      <template v-for="department in groupedRows" :key="department.id">
        <button
          type="button"
          class="resource-department-band"
          :class="[departmentClass(department.id), { 'is-collapsed': isDepartmentCollapsed(department.id) }]"
          :aria-expanded="!isDepartmentCollapsed(department.id)"
          @click="toggleDepartment(department.id)"
          @contextmenu.prevent.stop="emitDepartmentContextMenu($event, department)"
        >
          <span class="resource-department-caret" aria-hidden="true">{{ isDepartmentCollapsed(department.id) ? "▸" : "▾" }}</span>
          <strong>{{ department.name }}</strong>
          <span>{{ departmentPeopleCountLabel(department) }}</span>
        </button>

        <template v-if="!isDepartmentCollapsed(department.id)">
          <article
            v-for="person in department.people"
            :key="person.id"
            class="resource-timeline-row"
            :class="{ 'is-selected': selectedPersonId === person.id, 'is-risk': person.load >= 100 }"
            :style="{ minHeight: `${rowHeight}px` }"
          >
            <button
              type="button"
              class="resource-person-cell"
              @click="emit('selectPerson', person.id)"
              @contextmenu.prevent.stop="emitPersonContextMenu($event, person, department)"
            >
              <span class="resource-avatar" :class="`is-${person.tone || department.color || 'green'}`">{{ person.avatar }}</span>
              <span class="resource-person-copy">
                <strong>{{ person.name }}</strong>
                <small>{{ person.roleTitle }} / {{ person.load }}%</small>
              </span>
            </button>

            <div
              class="resource-row-canvas"
              :style="{ width: `${timelineWidth}px` }"
              @pointerdown="startTimelinePan"
              @pointermove="moveTimelinePan"
              @pointerup="endTimelinePan"
              @pointercancel="cancelTimelinePan"
              @contextmenu="handleTimelineBlankContextMenu($event, person, department)"
            >
              <div class="resource-row-grid" aria-hidden="true">
                <span
                  v-for="day in days"
                  :key="`${person.id}-${day.value}`"
                  class="resource-row-day"
                  :class="{ 'is-weekend': day.isWeekend }"
                  :style="dayCellStyle"
                ></span>
              </div>

              <button
                v-for="(windowItem, windowIndex) in personAvailability(person.id)"
                :key="timelineItemKey('availability', windowItem, windowIndex)"
                type="button"
                class="resource-availability-window"
                :style="itemBarStyle(windowItem)"
                @click="emit('openAssignment', { personId: person.id, window: windowItem })"
              >
                {{ windowItem.label || "空闲" }}
              </button>

              <button
                v-for="(item, itemIndex) in personItems(person.id)"
                :key="timelineItemKey('work-item', item, itemIndex)"
                type="button"
                class="resource-workload-bar"
                :class="[
                  `is-${item.status || 'normal'}`,
                  {
                    'is-selected': selectedWorkItemId === item.id,
                    'is-readonly': !canReschedule,
                    'is-dragging': isDraggingWorkItem(item),
                    'is-moving': isMovingWorkItem(item),
                    'is-resizing': isResizingWorkItem(item),
                    'is-resizing-start': isDraggingWorkItem(item) && dragState.interaction === 'resize-start',
                    'is-resizing-end': isDraggingWorkItem(item) && dragState.interaction === 'resize-end',
                    'has-drag-handles': canReschedule
                  }
                ]"
                :style="workItemBarStyle(item)"
                :title="workItemBarLabel(item)"
                :aria-label="workItemBarLabel(item)"
                :aria-disabled="!canReschedule"
                :data-drag-delta-days="isDraggingWorkItem(item) ? dragState.deltaDays : null"
                :data-drag-hint="isDraggingWorkItem(item) ? workItemDragDeltaLabel(item) : null"
                @click.stop="selectWorkItem(item)"
                @contextmenu.prevent.stop="emitWorkItemContextMenu($event, item, person)"
                @pointerdown.stop="startWorkItemDrag($event, item)"
                @pointermove.stop="moveWorkItemDrag($event, item)"
                @pointerup.stop="endWorkItemDrag($event, item, person)"
                @pointercancel.stop="cancelWorkItemDrag($event, item)"
              >
                <span
                  v-if="canReschedule"
                  class="resource-workload-handle is-left"
                  aria-hidden="true"
                  @pointerdown.stop="startWorkItemDrag($event, item)"
                ></span>
                <span class="resource-workload-title">{{ workItemTitle(item) }}</span>
                <span v-if="isDraggingWorkItem(item)" class="resource-workload-drag-hint" aria-hidden="true">{{ workItemDragDeltaText(item) }}</span>
                <span
                  v-if="canReschedule"
                  class="resource-workload-handle is-right"
                  aria-hidden="true"
                  @pointerdown.stop="startWorkItemDrag($event, item)"
                ></span>
              </button>

              <div v-if="!personItems(person.id).length && !personAvailability(person.id).length" class="resource-row-empty-hint">
                暂无排期，可安排任务
              </div>
            </div>
          </article>
        </template>
      </template>

      <div v-if="!hasVisibleRows" class="resource-empty-state">
        <div class="resource-empty-rows" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <strong>没有可见的人力数据</strong>
        <p>当前权限范围或搜索条件下没有人员，清空搜索或切回默认视角。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.resource-workload-bar {
  gap: 5px;
}

.resource-workload-bar.has-drag-handles {
  cursor: grab;
  padding-inline: 5px;
}

.resource-workload-bar.is-dragging {
  z-index: 3;
  cursor: grabbing;
  filter: saturate(1.14);
  box-shadow:
    0 14px 24px rgba(68, 160, 245, 0.26),
    0 0 0 2px rgba(255, 255, 255, 0.72) inset;
}

.resource-workload-title {
  flex: 1 1 auto;
  pointer-events: none;
}

.resource-workload-handle {
  flex: 0 0 4px;
  width: 4px;
  min-width: 4px;
  height: 16px;
  pointer-events: auto;
  touch-action: none;
  border-radius: 999px;
  background:
    linear-gradient(to bottom, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.5));
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  opacity: 0.72;
}

.resource-workload-bar:hover .resource-workload-handle,
.resource-workload-bar:focus-visible .resource-workload-handle,
.resource-workload-bar.is-dragging .resource-workload-handle {
  opacity: 1;
}

.resource-workload-drag-hint {
  flex: 0 0 auto;
  max-width: 54px;
  padding: 2px 4px;
  pointer-events: none;
  font-size: 11px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.94);
  background: rgba(0, 0, 0, 0.18);
  border-radius: 999px;
}

.resource-workload-bar.is-warning .resource-workload-drag-hint {
  color: #5c4300;
  background: rgba(255, 255, 255, 0.48);
}
</style>
