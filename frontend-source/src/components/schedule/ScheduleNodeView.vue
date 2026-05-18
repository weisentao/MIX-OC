<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { getScheduleColorInfo } from "@/utils/schedule/scheduleColors.js";
import { filterScheduleRows } from "@/utils/schedule/timelineLayout.js";

const store = useWorkspaceStore();
const panStart = ref(null);
const activePointerId = ref(null);

const selectedItemId = computed(() => store.scheduleUi?.selectedItemId || "");
const nodePan = computed(() => store.scheduleUi?.nodePan || { x: 0, y: 0, isPanning: false });
const visibleItems = computed(() =>
  filterScheduleRows(store.schedulePlan?.items || [], store.scheduleUi?.rowFilter || store.scheduleUi?.visibleType || "all", {
    departmentFilter: store.scheduleUi?.departmentFilter || "全部",
    showHiddenItems: store.scheduleUi?.showHiddenItems
  })
);
const dependencies = computed(() => store.schedulePlan?.dependencies || []);

const nodeRows = computed(() => {
  const rows = dependencies.value.length ? rowsFromDependencies() : rowsFromItems();
  return rows.map((row, rowIndex) => ({
    ...row,
    nodes: row.nodes.map((node, nodeIndex) => ({
      ...node,
      rowIndex,
      nodeIndex
    }))
  }));
});

function itemId(item) {
  return item?.id || item?.itemId || "";
}

function findItem(id) {
  return visibleItems.value.find((item) => itemId(item) === id || item?.taskUid === id);
}

function rowsFromDependencies() {
  const used = new Set();
  const rows = dependencies.value
    .map((dependency, index) => {
      const from = findItem(dependency.fromItemId);
      const to = findItem(dependency.toItemId);
      if (!from && !to) return null;
      if (from) used.add(itemId(from));
      if (to) used.add(itemId(to));
      return {
        key: dependency.id || `${dependency.fromItemId}-${dependency.toItemId}-${index}`,
        label: dependency.type || "依赖关系",
        dependency,
        nodes: [from, to].filter(Boolean)
      };
    })
    .filter(Boolean);

  const looseItems = visibleItems.value.filter((item) => !used.has(itemId(item)));
  if (looseItems.length) {
    rows.push({
      key: "unlinked",
      label: "未设置依赖",
      dependency: null,
      nodes: sortItems(looseItems)
    });
  }
  return rows;
}

function rowsFromItems() {
  const groups = new Map();
  sortItems(visibleItems.value).forEach((item) => {
    const colorInfo = getScheduleColorInfo(item.module);
    const key = colorInfo.label || "未分组";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return Array.from(groups.entries()).map(([label, nodes]) => ({
    key: label,
    label,
    dependency: null,
    nodes
  }));
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const dateCompare = String(a.startDate || "").localeCompare(String(b.startDate || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function formatDateRange(item) {
  const start = item?.startDate || "";
  const end = item?.endDate || "";
  if (!start && !end) return "未设置日期";
  if (start === end || !end) return start;
  return `${start} - ${end}`;
}

function statusLabel(status) {
  const value = String(status || "todo").toLowerCase();
  if (["done", "completed", "complete"].includes(value)) return "已完成";
  if (["risk", "blocked", "delay", "delayed", "overdue"].includes(value)) return "风险";
  if (["doing", "progress", "in_progress", "review", "active"].includes(value)) return "进行中";
  return "待处理";
}

function dependencyLabel(dependency) {
  const from = findItem(dependency?.fromItemId);
  const to = findItem(dependency?.toItemId);
  const fromTitle = from?.title || "前置排期";
  const toTitle = to?.title || "后续排期";
  return `前置：${fromTitle}，后续：${toTitle}`;
}

function selectItem(item) {
  if (store.selectScheduleItem) {
    store.selectScheduleItem(item);
    return;
  }
  store.scheduleUi.selectedItemId = itemId(item);
  store.scheduleUi.selectedTaskId = item?.taskUid || null;
}

function startPan(event) {
  if (event.button !== 0 || event.target?.closest?.(".schedule-node-card")) return;
  activePointerId.value = event.pointerId;
  panStart.value = { x: event.clientX, y: event.clientY };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  if (store.setScheduleNodePan) store.setScheduleNodePan({ isPanning: true });
}

function movePan(event) {
  if (!panStart.value || activePointerId.value !== event.pointerId) return;
  const dx = event.clientX - panStart.value.x;
  const dy = event.clientY - panStart.value.y;
  panStart.value = { x: event.clientX, y: event.clientY };
  if (store.moveScheduleNodePan) store.moveScheduleNodePan({ dx, dy, isPanning: true });
}

function endPan() {
  activePointerId.value = null;
  panStart.value = null;
  if (store.setScheduleNodePan) store.setScheduleNodePan({ isPanning: false });
}
</script>

<template>
  <section
    class="schedule-node-view"
    aria-label="排期节点模式"
  >
    <div v-if="visibleItems.length === 0" class="schedule-empty-state">
      <strong>暂无节点数据</strong>
      <span>新建排期后会按依赖、日期或部门自动生成节点。</span>
    </div>

    <div
      v-else
      class="schedule-node-canvas"
      :class="{ 'has-dependencies': dependencies.length > 0, 'is-panning': nodePan.isPanning }"
      :data-pan-x="nodePan.x"
      :data-pan-y="nodePan.y"
      :style="{ transform: `translate3d(${nodePan.x}px, ${nodePan.y}px, 0)` }"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointercancel="endPan"
      @lostpointercapture="endPan"
    >
      <section v-for="row in nodeRows" :key="row.key" class="schedule-node-row">
        <header>
          <strong>{{ row.label }}</strong>
          <span v-if="row.dependency">{{ dependencyLabel(row.dependency) }}</span>
          <span v-else>{{ row.nodes.length }} 个节点</span>
        </header>

        <div class="schedule-node-track">
          <button
            v-for="node in row.nodes"
            :key="`${row.key}-${itemId(node)}`"
            type="button"
            class="schedule-node-card"
            :class="{ 'is-selected': selectedItemId === itemId(node) }"
            :style="{ '--schedule-item-color': getScheduleColorInfo(node.module).color }"
            @click="selectItem(node)"
          >
            <span class="schedule-node-dot"></span>
            <strong>{{ node.title || "未命名排期" }}</strong>
            <small>{{ statusLabel(node.status) }} · {{ formatDateRange(node) }}</small>
            <em>{{ node.owner || "未分配" }}</em>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
