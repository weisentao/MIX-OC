<script setup>
import { computed, reactive } from "vue";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2;
const ZOOM_SENSITIVITY = 0.0015;
const PAN_MARGIN = 160;

const props = defineProps({
  people: { type: Array, default: () => [] },
  workItems: { type: Array, default: () => [] },
  selectedPersonId: { type: String, default: "" },
  recommendation: { type: Object, default: null },
  permissions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(["selectPerson", "selectWorkItem", "openAssignment"]);

const viewport = reactive({
  scale: 1,
  x: 0,
  y: 0
});

const panState = reactive({
  active: false,
  pointerId: null,
  startClientX: 0,
  startClientY: 0,
  startX: 0,
  startY: 0
});

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  node: null
});

const visiblePeople = computed(() => props.people.slice(0, 5));
const visibleTasks = computed(() => props.workItems.slice(0, 5));

const viewportStyle = computed(() => ({
  transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`
}));

const contextMenuStyle = computed(() => ({
  left: `${contextMenu.x}px`,
  top: `${contextMenu.y}px`
}));

const contextMenuTitle = computed(() => {
  if (!contextMenu.node) return "画布操作";
  return contextMenu.node.person ? "人员节点" : "任务节点";
});

const contextMenuDetail = computed(() => contextMenu.node?.label || "空白区域");

const nodes = computed(() => {
  const peopleNodes = visiblePeople.value.map((person, index) => ({
    id: person.id,
    type: person.load >= 100 ? "risk-person" : person.load >= 85 ? "warning-person" : "person",
    label: person.name,
    subLabel: person.roleTitle,
    x: [50, 28, 50, 72, 34][index] || 50,
    y: [18, 48, 48, 48, 78][index] || 60,
    person
  }));
  const taskNodes = visibleTasks.value.map((item, index) => ({
    id: item.id,
    type: item.status === "danger" ? "risk-task" : item.status === "new" ? "new-task" : "task",
    label: item.title,
    subLabel: item.project,
    x: [18, 72, 72, 18, 50][index] || 40,
    y: [28, 30, 66, 70, 88][index] || 70,
    item
  }));
  return [...peopleNodes, ...taskNodes];
});

const edges = computed(() => {
  return visibleTasks.value
    .map((item) => {
      const from = nodes.value.find((node) => node.id === item.id);
      const to = nodes.value.find((node) => node.id === item.personId);
      if (!from || !to) return null;
      return {
        id: `${item.id}-${item.personId}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        status: item.status
      };
    })
    .filter(Boolean);
});

function nodeStyle(node) {
  return {
    left: `${node.x}%`,
    top: `${node.y}%`
  };
}

function selectNode(node) {
  hideContextMenu();
  if (node.person) emit("selectPerson", node.person.id);
  if (node.item) emit("selectWorkItem", node.item);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getClampedPan(x, y, scale, rect) {
  const scaledWidth = rect.width * scale;
  const scaledHeight = rect.height * scale;
  const minX = Math.min(-PAN_MARGIN, rect.width - scaledWidth - PAN_MARGIN);
  const maxX = Math.max(PAN_MARGIN, rect.width - scaledWidth + PAN_MARGIN);
  const minY = Math.min(-PAN_MARGIN, rect.height - scaledHeight - PAN_MARGIN);
  const maxY = Math.max(PAN_MARGIN, rect.height - scaledHeight + PAN_MARGIN);

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY)
  };
}

function clampViewport(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const nextPan = getClampedPan(viewport.x, viewport.y, viewport.scale, rect);
  viewport.x = nextPan.x;
  viewport.y = nextPan.y;
}

function hideContextMenu() {
  contextMenu.visible = false;
  contextMenu.node = null;
}

function isInteractiveTarget(target) {
  return target instanceof Element
    && Boolean(target.closest(".resource-node, .resource-node-context-menu, button, a, input, textarea, select"));
}

function handleWheel(event) {
  hideContextMenu();

  const rect = event.currentTarget.getBoundingClientRect();
  const nextScale = clamp(
    viewport.scale * Math.exp(-event.deltaY * ZOOM_SENSITIVITY),
    MIN_ZOOM,
    MAX_ZOOM
  );

  if (nextScale === viewport.scale) return;

  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const worldX = (pointerX - viewport.x) / viewport.scale;
  const worldY = (pointerY - viewport.y) / viewport.scale;

  viewport.x = pointerX - worldX * nextScale;
  viewport.y = pointerY - worldY * nextScale;
  viewport.scale = nextScale;
  clampViewport(event.currentTarget);
}

function startPan(event) {
  if (event.button !== 0 || isInteractiveTarget(event.target)) return;

  hideContextMenu();
  panState.active = true;
  panState.pointerId = event.pointerId;
  panState.startClientX = event.clientX;
  panState.startClientY = event.clientY;
  panState.startX = viewport.x;
  panState.startY = viewport.y;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function movePan(event) {
  if (!panState.active || event.pointerId !== panState.pointerId) return;

  viewport.x = panState.startX + event.clientX - panState.startClientX;
  viewport.y = panState.startY + event.clientY - panState.startClientY;
  clampViewport(event.currentTarget);
}

function endPan(event) {
  if (!panState.active || event.pointerId !== panState.pointerId) return;

  event.currentTarget.releasePointerCapture?.(event.pointerId);
  panState.active = false;
  panState.pointerId = null;
}

function showContextMenu(event, node = null) {
  event.preventDefault();
  event.stopPropagation();

  if (!(event.target instanceof Element)) return;

  const menuWidth = 190;
  const menuHeight = node ? 154 : 112;
  const gap = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  contextMenu.x = clamp(event.clientX + gap, gap, viewportWidth - menuWidth - gap);
  contextMenu.y = clamp(event.clientY + gap, gap, viewportHeight - menuHeight - gap);
  contextMenu.node = node;
  contextMenu.visible = true;
}

function showCanvasContextMenu(event) {
  if (isInteractiveTarget(event.target)) return;
  showContextMenu(event);
}

function resetViewport() {
  viewport.scale = 1;
  viewport.x = 0;
  viewport.y = 0;
  hideContextMenu();
}

function openAssignmentFromMenu() {
  hideContextMenu();
  emit("openAssignment");
}
</script>

<template>
  <section class="resource-node-view" aria-label="人力节点关系视图">
    <div
      class="resource-node-canvas"
      :class="{ 'is-panning': panState.active }"
      @click="hideContextMenu"
      @contextmenu="showCanvasContextMenu"
      @pointercancel="endPan"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @wheel.prevent="handleWheel"
    >
      <div class="resource-node-viewport" :style="viewportStyle">
        <svg class="resource-node-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line
            v-for="edge in edges"
            :key="edge.id"
            :x1="edge.x1"
            :y1="edge.y1"
            :x2="edge.x2"
            :y2="edge.y2"
            class="resource-node-edge"
            :class="`is-${edge.status || 'normal'}`"
          />
        </svg>

        <button
          v-for="node in nodes"
          :key="node.id"
          type="button"
          class="resource-node"
          :class="[`is-${node.type}`, { 'is-selected': selectedPersonId && node.id === selectedPersonId }]"
          :style="nodeStyle(node)"
          @click="selectNode(node)"
          @contextmenu="showContextMenu($event, node)"
          @pointerdown.stop
        >
          <span>{{ node.subLabel }}</span>
          <strong>{{ node.label }}</strong>
        </button>
      </div>

      <Teleport to="body">
        <div
          v-if="contextMenu.visible"
          class="resource-node-context-menu"
          :style="contextMenuStyle"
          role="menu"
          @click.stop
          @contextmenu.prevent
          @pointerdown.stop
        >
        <div class="resource-node-context-menu__header">
          <strong>{{ contextMenuTitle }}</strong>
          <span>{{ contextMenuDetail }}</span>
        </div>
        <button v-if="contextMenu.node" type="button" role="menuitem" @click="selectNode(contextMenu.node)">
          {{ contextMenu.node.person ? "选择人员" : "查看任务" }}
        </button>
        <button
          v-if="permissions.canCreateAssignmentPreview"
          type="button"
          role="menuitem"
          @click="openAssignmentFromMenu"
        >
          打开推荐分配
        </button>
        <button type="button" role="menuitem" @click="resetViewport">
          重置视图
        </button>
        </div>
      </Teleport>
    </div>

    <aside class="resource-node-legend" aria-label="节点说明">
      <h3>节点说明</h3>
      <p><span class="resource-node-dot is-risk"></span><strong>红色节点</strong>高风险 / 超负荷</p>
      <p><span class="resource-node-dot is-new"></span><strong>粉色节点</strong>新任务 / 关键任务</p>
      <p><span class="resource-node-dot is-ok"></span><strong>绿色节点</strong>可承接 / 已确认</p>
      <p><span class="resource-node-dot is-blue"></span><strong>蓝色节点</strong>备选人员</p>

      <section class="resource-node-advice">
        <strong>当前建议</strong>
        <span>{{ recommendation?.text || "高负载人员只保留复核，执行任务请按负载、冲突和技能匹配重新分配。" }}</span>
        <button
          v-if="permissions.canCreateAssignmentPreview"
          type="button"
          @click="emit('openAssignment')"
        >
          打开推荐分配
        </button>
      </section>
    </aside>
  </section>
</template>

<style scoped>
.resource-node-canvas {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.resource-node-canvas.is-panning {
  cursor: grabbing;
}

.resource-node-viewport {
  position: absolute;
  inset: 0;
  min-width: 100%;
  min-height: 100%;
  transform-origin: 0 0;
  will-change: transform;
}

.resource-node {
  cursor: pointer;
}

.resource-node-context-menu {
  position: fixed;
  z-index: 20;
  display: grid;
  gap: 4px;
  min-width: 180px;
  max-width: min(240px, calc(100% - 16px));
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 6px;
  background: #ffffff;
  border: 1px solid rgba(121, 139, 164, 0.22);
  border-radius: var(--resource-radius-sm);
  box-shadow: 0 18px 48px rgba(27, 39, 58, 0.18);
}

.resource-node-context-menu__header {
  display: grid;
  gap: 2px;
  padding: 6px 8px 8px;
  border-bottom: 1px solid rgba(121, 139, 164, 0.16);
}

.resource-node-context-menu__header strong,
.resource-node-context-menu__header span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-node-context-menu__header strong {
  color: var(--resource-text);
  font-size: 12px;
  font-weight: 850;
}

.resource-node-context-menu__header span {
  color: var(--resource-text-muted);
  font-size: 11px;
}

.resource-node-context-menu button {
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  color: var(--resource-text);
  font-size: 12px;
  font-weight: 750;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.resource-node-context-menu button:hover {
  background: rgba(255, 0, 80, 0.08);
}
</style>
