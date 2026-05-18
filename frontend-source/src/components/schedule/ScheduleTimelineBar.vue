<script setup>
import { computed, reactive } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import {
  getBarColorStyle,
  getBarPreviewStyle,
  getBarStyle,
  getBarVisualStyle,
  getDateRangeFromDragDelta,
  getScheduleRowKind
} from "@/utils/schedule/timelineLayout.js";

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  range: {
    type: Object,
    default: () => ({ startDate: "", endDate: "" })
  },
  layout: {
    type: Object,
    default: () => ({ dayWidth: 28, rowHeight: 34 })
  }
});

const store = useWorkspaceStore();
const dragState = reactive({
  active: false,
  pointerId: null,
  captureTarget: null,
  startX: 0,
  deltaX: 0,
  mode: "move",
  previewRange: null,
  moved: false
});

const itemId = computed(() => props.item.id || props.item.itemId);
const selected = computed(() => store.scheduleUi.selectedItemId === itemId.value);
const syncStatus = computed(() => props.item.payload?.syncStatus || "");
const rowKind = computed(() => getScheduleRowKind(props.item));
const statusText = computed(() => {
  const value = String(props.item.status || "todo").toLowerCase();
  if (["done", "completed", "complete"].includes(value)) return "已完成";
  if (["risk", "blocked", "delay", "delayed", "overdue"].includes(value)) return "风险延期";
  if (["doing", "progress", "in_progress", "review", "active"].includes(value)) return "进行中";
  if (["todo", "pending", "planned", "new"].includes(value)) return "待排期";
  return "待处理";
});
const style = computed(() => ({
  ...(dragState.active
    ? getBarPreviewStyle(props.item, props.range, props.layout, dragState.deltaX, dragState.mode)
    : getBarStyle(props.item, props.range, props.layout)),
  ...getBarVisualStyle(props.item, props.layout),
  ...getBarColorStyle(props.item)
}));

function selectItem() {
  if (store.selectScheduleItem) {
    store.selectScheduleItem(props.item);
    return;
  }
  store.scheduleUi.selectedItemId = itemId.value;
  store.scheduleUi.selectedTaskId = props.item.taskUid || null;
}

function openChat() {
  store.openScheduleChat({
    itemId: itemId.value,
    taskUid: props.item.taskUid || "",
    commentsCount: props.item.commentsCount || 0
  });
}

function startDrag(event, mode) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  dragState.active = true;
  dragState.pointerId = event.pointerId;
  dragState.captureTarget = event.currentTarget;
  dragState.startX = event.clientX;
  dragState.deltaX = 0;
  dragState.mode = mode;
  dragState.previewRange = null;
  dragState.moved = false;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  selectItem();
}

function moveDrag(event) {
  if (!dragState.active || dragState.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const deltaX = event.clientX - dragState.startX;
  dragState.deltaX = deltaX;
  dragState.previewRange = getDateRangeFromDragDelta(props.item, deltaX, props.layout, dragState.mode);
  if (Math.abs(deltaX) >= 3) dragState.moved = true;
}

function resetDragState() {
  dragState.active = false;
  dragState.pointerId = null;
  dragState.captureTarget = null;
  dragState.startX = 0;
  dragState.deltaX = 0;
  dragState.mode = "move";
  dragState.previewRange = null;
  dragState.moved = false;
}

async function endDrag(event) {
  if (!dragState.active || dragState.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  dragState.captureTarget?.releasePointerCapture?.(event.pointerId);
  const deltaX = event.clientX - dragState.startX;
  const mode = dragState.mode;
  const nextRange = dragState.previewRange || getDateRangeFromDragDelta(props.item, deltaX, props.layout, mode);
  const shouldUpdate = Math.abs(deltaX) >= Math.max(4, Number(props.layout.dayWidth || 28) / 3);
  resetDragState();
  if (!shouldUpdate) return;
  await store.updateScheduleItemDates(itemId.value, nextRange);
}
</script>

<template>
  <button
    class="schedule-timeline-bar"
    :class="{ 'is-selected': selected, 'is-dragging': dragState.active }"
    :data-status="item.status || 'todo'"
    :data-sync-status="syncStatus"
    :data-kind="rowKind"
    :data-module="item.module || 'project'"
    :style="style"
    type="button"
    :title="syncStatus ? '后端同步异常，已保留本地排期' : item.title"
    @click="selectItem"
    @dblclick.prevent="openChat"
    @pointermove="moveDrag"
    @pointerup="endDrag"
    @pointercancel="endDrag"
  >
    <span
      class="schedule-timeline-bar-handle is-start"
      aria-hidden="true"
      @pointerdown="startDrag($event, 'resize-start')"
    ></span>
    <span class="schedule-timeline-bar-drag-zone" aria-hidden="true" @pointerdown="startDrag($event, 'move')"></span>
    <span class="schedule-timeline-bar-title">{{ item.title || "未命名排期" }}</span>
    <span class="schedule-timeline-bar-meta">{{ statusText }} · {{ item.progress || 0 }}%</span>
    <span
      class="schedule-timeline-bar-handle is-end"
      aria-hidden="true"
      @pointerdown="startDrag($event, 'resize-end')"
    ></span>
    <span
      v-if="selected"
      class="schedule-timeline-control-dot is-start"
      aria-hidden="true"
      @pointerdown="startDrag($event, 'resize-start')"
    ></span>
    <span
      v-if="selected"
      class="schedule-timeline-control-dot is-middle"
      aria-hidden="true"
      @pointerdown="startDrag($event, 'move')"
    ></span>
    <span
      v-if="selected"
      class="schedule-timeline-control-dot is-end"
      aria-hidden="true"
      @pointerdown="startDrag($event, 'resize-end')"
    ></span>
    <i :style="{ width: `${Math.max(0, Math.min(100, Number(item.progress || 0)))}%` }"></i>
  </button>
</template>

<style scoped>
.schedule-timeline-bar {
  overflow: visible;
  transition:
    box-shadow 120ms ease,
    opacity 120ms ease;
  will-change: left, transform, width;
}

.schedule-timeline-bar.is-dragging {
  z-index: 8;
  opacity: 0.92;
  box-shadow:
    0 0 0 3px rgba(21, 63, 39, 0.18),
    0 8px 18px rgba(32, 43, 61, 0.16);
  transition:
    box-shadow 120ms ease,
    opacity 120ms ease;
}

.schedule-timeline-control-dot {
  position: absolute;
  top: 50%;
  z-index: 7;
  width: 12px;
  height: 12px;
  border: 2px solid #667085;
  border-radius: 50%;
  background: #ffffff;
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.82),
    0 1px 4px rgba(16, 24, 40, 0.2);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.92);
  transition:
    opacity 120ms ease,
    transform 120ms ease,
    border-color 120ms ease;
}

.schedule-timeline-bar.is-selected .schedule-timeline-control-dot {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.schedule-timeline-bar.is-dragging .schedule-timeline-control-dot {
  transition: opacity 80ms ease;
}

.schedule-timeline-control-dot.is-start {
  left: 0;
  cursor: ew-resize;
}

.schedule-timeline-control-dot.is-middle {
  left: 50%;
  cursor: grab;
}

.schedule-timeline-control-dot.is-end {
  left: 100%;
  cursor: ew-resize;
}

.schedule-timeline-control-dot:hover {
  border-color: #475467;
}

.schedule-timeline-control-dot::before {
  content: "";
  position: absolute;
  inset: -8px;
}
</style>
