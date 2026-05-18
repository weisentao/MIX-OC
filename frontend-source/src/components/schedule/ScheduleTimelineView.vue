<script setup>
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import {
  buildDays,
  buildVisibleDateRange,
  clampDateRange,
  daysBetween,
  extendVisibleDateRange,
  extendVisibleDateRangeToDate,
  formatSlashDate,
  getDateScrollLeft,
  getLocalTodaySlashDate
} from "@/utils/schedule/dateRange.js";
import { filterScheduleRows, getTimelineWidth } from "@/utils/schedule/timelineLayout.js";
import ScheduleFixedTable from "./ScheduleFixedTable.vue";
import ScheduleTimelineGrid from "./ScheduleTimelineGrid.vue";
import ScheduleTimelineHeader from "./ScheduleTimelineHeader.vue";
import ScheduleTimelineRow from "./ScheduleTimelineRow.vue";

const store = useWorkspaceStore();
const emit = defineEmits(["edit", "delete"]);
const scrollRef = ref(null);
const dragScroll = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startScrollLeft: 0
});
const DEFAULT_VISIBLE_DAYS = 45;
const EDGE_BUFFER_DAYS = 10;
const EXTEND_DAYS = 28;
let pendingScrollLeft = null;
let isAdjustingRange = false;

const items = computed(() => store.schedulePlan?.items || []);
const visibleItems = computed(() => {
  return filterScheduleRows(items.value, store.scheduleUi.rowFilter || store.scheduleUi.visibleType || "all", {
    departmentFilter: store.scheduleUi.departmentFilter || "全部",
    showHiddenItems: store.scheduleUi.showHiddenItems
  });
});

const planRange = computed(() => {
  const plan = store.schedulePlan || {};
  return clampDateRange(plan.startDate, plan.endDate);
});

const range = computed(() => {
  const plan = store.schedulePlan || {};
  const fallback = getInitialVisibleRange(plan);
  return clampDateRange(store.scheduleUi.visibleStartDate || fallback.startDate, store.scheduleUi.visibleEndDate || fallback.endDate);
});

const layout = computed(() => ({
  dayWidth: store.scheduleUi.dayWidth || 28,
  rowHeight: store.scheduleUi.rowHeight || 34
}));

const days = computed(() => buildDays(range.value.startDate, range.value.endDate));
const timelineWidth = computed(() => getTimelineWidth(range.value, layout.value));

const rowFilters = [
  { key: "all", label: "看所有" },
  { key: "schedule", label: "看排期" },
  { key: "task", label: "看任务" }
];

function selectRowFilter(filter) {
  store.setScheduleRowFilter(filter);
}

function todayDate() {
  return getLocalTodaySlashDate();
}

function getInitialVisibleRange(plan = {}) {
  const today = todayDate();
  const todayWindow = buildVisibleDateRange(today, DEFAULT_VISIBLE_DAYS);
  const startCandidates = [todayWindow.startDate, formatSlashDate(plan.startDate)].filter(Boolean).sort();
  const endCandidates = [todayWindow.endDate, formatSlashDate(plan.endDate)].filter(Boolean).sort();

  return clampDateRange(startCandidates[0] || todayWindow.startDate, endCandidates[endCandidates.length - 1] || todayWindow.endDate);
}

function setVisibleRange(nextRange) {
  const cleanRange = clampDateRange(nextRange.startDate, nextRange.endDate);
  if (!cleanRange.startDate || !cleanRange.endDate) return false;
  if (store.scheduleUi.visibleStartDate === cleanRange.startDate && store.scheduleUi.visibleEndDate === cleanRange.endDate) return false;
  store.scheduleUi = {
    ...store.scheduleUi,
    visibleStartDate: cleanRange.startDate,
    visibleEndDate: cleanRange.endDate
  };
  return true;
}

function ensureDefaultVisibleRange() {
  const cleanRange = clampDateRange(store.scheduleUi.visibleStartDate, store.scheduleUi.visibleEndDate);
  if (cleanRange.startDate && cleanRange.endDate) return;
  setVisibleRange(getInitialVisibleRange(store.schedulePlan || {}));
}

function scheduleScrollLeft(scrollLeft) {
  pendingScrollLeft = Math.max(0, Number(scrollLeft || 0));
  nextTick(() => {
    const scroll = scrollRef.value;
    if (scroll && pendingScrollLeft !== null) {
      scroll.scrollLeft = pendingScrollLeft;
      pendingScrollLeft = null;
    }
    isAdjustingRange = false;
  });
}

function maybeExtendVisibleRange() {
  const scroll = scrollRef.value;
  if (!scroll || isAdjustingRange || !range.value.startDate || !range.value.endDate) return;

  const dayWidth = Number(layout.value.dayWidth || 28);
  const edgeBuffer = Math.max(dayWidth, EDGE_BUFFER_DAYS * dayWidth);
  const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);

  if (scroll.scrollLeft <= edgeBuffer) {
    const nextRange = extendVisibleDateRange(range.value, "left", EXTEND_DAYS);
    const addedDays = Math.max(0, daysBetween(nextRange.startDate, range.value.startDate));
    if (!addedDays || !setVisibleRange(nextRange)) return;
    isAdjustingRange = true;
    if (dragScroll.active) dragScroll.startScrollLeft += addedDays * dayWidth;
    scheduleScrollLeft(scroll.scrollLeft + addedDays * dayWidth);
    return;
  }

  if (maxScrollLeft - scroll.scrollLeft <= edgeBuffer) {
    const nextRange = extendVisibleDateRange(range.value, "right", EXTEND_DAYS);
    if (!setVisibleRange(nextRange)) return;
    isAdjustingRange = true;
    scheduleScrollLeft(scroll.scrollLeft);
  }
}

function resetToToday() {
  const today = todayDate();
  const todayRange = buildVisibleDateRange(today, DEFAULT_VISIBLE_DAYS);
  const nextRange = extendVisibleDateRangeToDate(todayRange, today, EDGE_BUFFER_DAYS);
  setVisibleRange(nextRange);
  const targetLeft = getDateScrollLeft(nextRange, today, layout.value.dayWidth);
  const scroll = scrollRef.value;
  const centeredLeft = scroll ? targetLeft - Math.max(0, scroll.clientWidth - layout.value.dayWidth) / 2 : targetLeft;
  scheduleScrollLeft(centeredLeft);
}

function handleTimelineWheel(event) {
  const scroll = scrollRef.value;
  if (!scroll) return;

  const currentDayWidth = Number(layout.value.dayWidth || 28);
  const direction = Number(event.deltaY || event.deltaX || 0) < 0 ? 1 : -1;
  const rect = scroll.getBoundingClientRect();
  const pointerOffset = Math.max(0, event.clientX - rect.left);
  const anchorDayOffset = (scroll.scrollLeft + pointerOffset) / currentDayWidth;
  const nextDayWidth = store.adjustScheduleZoom(direction * 4);

  if (!Number.isFinite(nextDayWidth) || nextDayWidth <= 0) return;
  scheduleScrollLeft(anchorDayOffset * nextDayWidth - pointerOffset);
}

function itemId(item) {
  return item?.id || item?.itemId || "";
}

function selectItem(item) {
  if (store.selectScheduleItem) {
    store.selectScheduleItem(item);
    return;
  }
  store.scheduleUi.selectedItemId = itemId(item);
  store.scheduleUi.selectedTaskId = item?.taskUid || null;
}

function openChat(item) {
  store.openScheduleChat({
    itemId: itemId(item),
    taskUid: item?.taskUid || "",
    comments: item?.comments || [],
    commentsCount: item?.commentsCount || 0
  });
}

function editItem(item) {
  selectItem(item);
  emit("edit", item);
}

function deleteItem(item) {
  selectItem(item);
  emit("delete", item);
}

function moveItem(payload = {}) {
  const item = payload.item || {};
  selectItem(item);
  const mover = store.moveScheduleRowWithinDepartment;
  if (typeof mover === "function") mover(itemId(item), payload.direction);
}

function startBlankDrag(event) {
  if (event.button !== 0) return;
  if (event.target?.closest?.(".schedule-timeline-bar, button, a, input, textarea, select")) return;
  const scroll = scrollRef.value;
  if (!scroll) return;
  dragScroll.active = true;
  dragScroll.pointerId = event.pointerId;
  dragScroll.startX = event.clientX;
  dragScroll.startScrollLeft = scroll.scrollLeft;
  scroll.setPointerCapture?.(event.pointerId);
}

function moveBlankDrag(event) {
  if (!dragScroll.active || dragScroll.pointerId !== event.pointerId) return;
  const scroll = scrollRef.value;
  if (!scroll) return;
  scroll.scrollLeft = dragScroll.startScrollLeft - (event.clientX - dragScroll.startX);
  maybeExtendVisibleRange();
}

function endBlankDrag(event) {
  if (!dragScroll.active || dragScroll.pointerId !== event.pointerId) return;
  scrollRef.value?.releasePointerCapture?.(event.pointerId);
  dragScroll.active = false;
  dragScroll.pointerId = null;
}

watch(planRange, ensureDefaultVisibleRange, { immediate: true });
</script>

<template>
  <section class="schedule-timeline-shell">
    <div class="schedule-timeline-left">
      <div class="schedule-timeline-left-head">
        <span>部门/排期名称/流程</span>
      </div>
      <div class="schedule-timeline-row-filter" aria-label="排期行过滤">
        <button
          v-for="filter in rowFilters"
          :key="filter.key"
          type="button"
          :class="{ 'is-active': (store.scheduleUi.rowFilter || 'all') === filter.key }"
          @click="selectRowFilter(filter.key)"
        >
          {{ filter.label }}
        </button>
      </div>
      <ScheduleFixedTable
        class="schedule-timeline-left-body"
        :items="visibleItems"
        :layout="layout"
        :selected-item-id="store.scheduleUi.selectedItemId || ''"
        @select="selectItem"
        @edit="editItem"
        @delete="deleteItem"
        @chat="openChat"
        @move="moveItem"
      />
    </div>

    <div
      ref="scrollRef"
      class="schedule-timeline-scroll"
      :class="{ 'is-grabbing': dragScroll.active }"
      @pointerdown="startBlankDrag"
      @pointermove="moveBlankDrag"
      @pointerup="endBlankDrag"
      @pointercancel="endBlankDrag"
      @pointerleave="endBlankDrag"
      @scroll="maybeExtendVisibleRange"
      @wheel.prevent="handleTimelineWheel"
    >
      <div class="schedule-timeline-canvas" :style="{ width: `${timelineWidth}px` }">
        <ScheduleTimelineHeader :days="days" :layout="layout" @today="resetToToday" />
        <div class="schedule-timeline-body" :style="{ minHeight: `${visibleItems.length * layout.rowHeight}px` }">
          <ScheduleTimelineGrid :days="days" :items="visibleItems" :layout="layout" />
          <ScheduleTimelineRow
            v-for="item in visibleItems"
            :key="item.id || item.itemId"
            :item="item"
            :range="range"
            :layout="layout"
          />
        </div>
      </div>
    </div>
  </section>
</template>
