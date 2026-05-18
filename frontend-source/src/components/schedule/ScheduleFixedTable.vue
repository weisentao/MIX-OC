<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ChatDotSquare, Delete, EditPen, MoreFilled } from "@element-plus/icons-vue";
import { getScheduleModuleLabel } from "@/utils/schedule/scheduleColors.js";
import { createScheduleRowMovePlan, getBarColorStyle, getScheduleRowKind } from "@/utils/schedule/timelineLayout.js";

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  layout: {
    type: Object,
    default: () => ({ dayWidth: 28, rowHeight: 34 })
  },
  selectedItemId: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["select", "edit", "delete", "chat", "move"]);
const tableRef = ref(null);
const menuRef = ref(null);
const menuTriggerRef = ref(null);
const menu = reactive({
  visible: false,
  left: 0,
  top: 0,
  item: null
});

function itemId(item) {
  return item.id || item.itemId || "";
}

function closeMenu() {
  menu.visible = false;
  menu.item = null;
  menuTriggerRef.value = null;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function openMenu(event, item) {
  menuTriggerRef.value = event.currentTarget || null;
  menu.item = item;
  menu.visible = true;
  emit("select", item);
  nextTick(() => positionMenuNearTrigger(event));
}

function positionMenuNearTrigger(event) {
  if (!menu.visible) return;
  const gap = 8;
  const triggerRect = menuTriggerRef.value?.getBoundingClientRect?.() || event?.currentTarget?.getBoundingClientRect?.() || null;
  const menuWidth = menuRef.value?.offsetWidth || 136;
  const menuHeight = menuRef.value?.offsetHeight || 176;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const fallbackX = Number(event?.clientX || 0);
  const fallbackY = Number(event?.clientY || 0);
  const anchorRight = triggerRect?.right ?? fallbackX;
  const anchorTop = triggerRect?.top ?? fallbackY;
  const anchorBottom = triggerRect?.bottom ?? fallbackY;
  const bottomTop = anchorBottom + gap;
  const topTop = anchorTop - menuHeight - gap;
  const nextTop = bottomTop + menuHeight <= viewportHeight - gap ? bottomTop : topTop;

  menu.left = clampNumber(anchorRight - menuWidth, gap, Math.max(gap, viewportWidth - menuWidth - gap));
  menu.top = clampNumber(nextTop, gap, Math.max(gap, viewportHeight - menuHeight - gap));
}

function runMenuAction(action) {
  if (!menu.item) return;
  emit(action, menu.item);
  closeMenu();
}

function moveItem(item, direction) {
  if (!item) return;
  emit("select", item);
  emit("move", { item, direction });
  closeMenu();
}

function canMoveItem(item, direction) {
  return createScheduleRowMovePlan(props.items, itemId(item), direction).ok;
}

function closeMenuFromOutside(event) {
  if (tableRef.value?.contains(event.target) || menuRef.value?.contains(event.target)) return;
  closeMenu();
}

onMounted(() => {
  document.addEventListener("click", closeMenuFromOutside);
  window.addEventListener("resize", positionMenuNearTrigger);
  window.addEventListener("scroll", positionMenuNearTrigger, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeMenuFromOutside);
  window.removeEventListener("resize", positionMenuNearTrigger);
  window.removeEventListener("scroll", positionMenuNearTrigger, true);
});
</script>

<template>
  <div ref="tableRef" class="schedule-fixed-table">
    <div
      v-for="(item, index) in items"
      :key="itemId(item)"
      class="schedule-timeline-left-row"
      :class="{ 'is-selected': selectedItemId === itemId(item) }"
      :data-kind="getScheduleRowKind(item)"
      :data-even="index % 2 === 0"
      :style="{ height: `${layout.rowHeight}px`, ...getBarColorStyle(item) }"
      @click="emit('select', item)"
      @dblclick.stop="emit('chat', item)"
      @contextmenu.prevent="openMenu($event, item)"
    >
      <span class="schedule-row-module">{{ getScheduleModuleLabel(item.module) }}</span>
      <strong>{{ item.title || "未命名排期" }}</strong>
      <div class="schedule-row-actions">
        <button type="button" title="上移" :disabled="!canMoveItem(item, 'up')" @click.stop="moveItem(item, 'up')">
          ↑
        </button>
        <button type="button" title="下移" :disabled="!canMoveItem(item, 'down')" @click.stop="moveItem(item, 'down')">
          ↓
        </button>
        <button type="button" title="编辑" @click.stop="emit('edit', item)">
          <EditPen aria-hidden="true" />
        </button>
        <button type="button" title="删除" @click.stop="emit('delete', item)">
          <Delete aria-hidden="true" />
        </button>
        <button type="button" title="评论" @click.stop="emit('chat', item)">
          <ChatDotSquare aria-hidden="true" />
          <span>{{ String(item.commentsCount || 0).padStart(2, "0") }}</span>
        </button>
        <button type="button" title="更多" @click.stop="openMenu($event, item)">
          <MoreFilled aria-hidden="true" />
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="menu.visible"
        ref="menuRef"
        class="schedule-row-context-menu"
        :style="{ left: `${menu.left}px`, top: `${menu.top}px` }"
        @click.stop
      >
        <button type="button" @click="runMenuAction('edit')">编辑</button>
        <button type="button" @click="runMenuAction('delete')">删除</button>
        <button type="button" @click="runMenuAction('chat')">打开评论</button>
        <button type="button" :disabled="!canMoveItem(menu.item, 'up')" @click="moveItem(menu.item, 'up')">上移</button>
        <button type="button" :disabled="!canMoveItem(menu.item, 'down')" @click="moveItem(menu.item, 'down')">下移</button>
      </div>
    </Teleport>
  </div>
</template>
