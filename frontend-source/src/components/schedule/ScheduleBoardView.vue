<script setup>
import { computed, ref } from "vue";
import { ChatDotSquare } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { getScheduleColorInfo } from "@/utils/schedule/scheduleColors.js";
import { filterScheduleRows } from "@/utils/schedule/timelineLayout.js";

const store = useWorkspaceStore();
const draggingItemId = ref("");
const dragOverColumn = ref("");

const columns = [
  { key: "todo", title: "待处理", statuses: ["todo", "pending", "new", "open", "backlog", "待处理"] },
  { key: "doing", title: "进行中", statuses: ["doing", "progress", "in_progress", "review", "active", "进行中"] },
  { key: "done", title: "已完成", statuses: ["done", "completed", "complete", "closed", "已完成"] },
  { key: "risk", title: "风险或延期", statuses: ["risk", "blocked", "delay", "delayed", "overdue", "延期", "风险"] }
];

const selectedItemId = computed(() => store.scheduleUi?.selectedItemId || "");
const visibleItems = computed(() =>
  filterScheduleRows(store.schedulePlan?.items || [], store.scheduleUi?.rowFilter || store.scheduleUi?.visibleType || "all", {
    departmentFilter: store.scheduleUi?.departmentFilter || "全部",
    showHiddenItems: store.scheduleUi?.showHiddenItems
  })
);

const groupedColumns = computed(() =>
  columns.map((column) => ({
    ...column,
    items: sortItemsByDate(visibleItems.value.filter((item) => columnForItem(item).key === column.key))
  }))
);

function itemId(item) {
  return item?.id || item?.itemId || "";
}

function columnForItem(item) {
  const status = String(item?.status || "").trim().toLowerCase();
  if (item?.risk === true) return columns[3];
  return columns.find((column) => column.statuses.some((entry) => String(entry).toLowerCase() === status)) || columns[0];
}

function sortItemsByDate(items) {
  if (store.sortScheduleBoardItemsByDate) return store.sortScheduleBoardItemsByDate(items);
  return [...items].sort((left, right) => {
    const startCompare = String(left.startDate || "").localeCompare(String(right.startDate || ""));
    if (startCompare !== 0) return startCompare;
    return String(left.endDate || "").localeCompare(String(right.endDate || ""));
  });
}

function formatDateRange(item) {
  const start = item?.startDate || "";
  const end = item?.endDate || "";
  if (!start && !end) return "未设置日期";
  if (start === end || !end) return start;
  return `${start} - ${end}`;
}

function selectItem(item) {
  if (store.selectScheduleItem) {
    store.selectScheduleItem(item);
    return;
  }
  store.scheduleUi.selectedItemId = itemId(item);
  store.scheduleUi.selectedTaskId = item?.taskUid || null;
}

function handleDragStart(event, item) {
  draggingItemId.value = itemId(item);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggingItemId.value);
}

function handleDragEnd() {
  draggingItemId.value = "";
  dragOverColumn.value = "";
}

function handleDragEnter(columnKey) {
  dragOverColumn.value = columnKey;
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

async function handleDrop(event, column) {
  event.preventDefault();
  const droppedItemId = event.dataTransfer.getData("text/plain") || draggingItemId.value;
  handleDragEnd();
  if (!droppedItemId) return;
  const item = visibleItems.value.find((entry) => itemId(entry) === droppedItemId);
  if (!item || columnForItem(item).key === column.key) {
    if (item) selectItem(item);
    return;
  }
  if (store.moveScheduleItemToStatus) {
    await store.moveScheduleItemToStatus(droppedItemId, column.key);
  }
}
</script>

<template>
  <section class="schedule-board-view" aria-label="排期看板模式">
    <div v-if="visibleItems.length === 0" class="schedule-empty-state">
      <strong>暂无排期数据</strong>
      <span>新建排期后会在看板中按状态自动分列。</span>
    </div>

    <div v-else class="schedule-board-columns">
      <section
        v-for="column in groupedColumns"
        :key="column.key"
        class="schedule-board-column"
        :class="{ 'is-drop-target': dragOverColumn === column.key }"
        :data-status="column.key"
        @dragenter.prevent="handleDragEnter(column.key)"
        @dragover="handleDragOver"
        @dragleave.self="dragOverColumn = ''"
        @drop="handleDrop($event, column)"
      >
        <header>
          <strong>{{ column.title }}</strong>
          <span>{{ column.items.length }}</span>
        </header>

        <div class="schedule-board-card-list">
          <button
            v-for="item in column.items"
            :key="itemId(item)"
            type="button"
            draggable="true"
            class="schedule-board-card"
            :class="{ 'is-selected': selectedItemId === itemId(item), 'is-dragging': draggingItemId === itemId(item) }"
            :style="{ '--schedule-item-color': getScheduleColorInfo(item.module).color }"
            @dragstart="handleDragStart($event, item)"
            @dragend="handleDragEnd"
            @click="selectItem(item)"
          >
            <span class="schedule-board-card-color"></span>
            <strong>{{ item.title || "未命名排期" }}</strong>
            <dl>
              <div>
                <dt>部门</dt>
                <dd>{{ getScheduleColorInfo(item.module).label }}</dd>
              </div>
              <div>
                <dt>负责人</dt>
                <dd>{{ item.owner || "未分配" }}</dd>
              </div>
              <div>
                <dt>日期</dt>
                <dd>{{ formatDateRange(item) }}</dd>
              </div>
            </dl>
            <footer>
              <span class="schedule-board-progress">
                <i :style="{ width: `${Math.max(0, Math.min(100, Number(item.progress || 0)))}%` }"></i>
              </span>
              <em>{{ Math.max(0, Math.min(100, Number(item.progress || 0))) }}%</em>
              <small><ChatDotSquare aria-hidden="true" />{{ item.commentsCount || 0 }}</small>
            </footer>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
