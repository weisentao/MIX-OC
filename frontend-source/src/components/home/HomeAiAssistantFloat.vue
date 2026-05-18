<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useTemplateRef, watch } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  pending: { type: Boolean, default: false },
  status: { type: String, default: "idle" },
  errorMessage: { type: String, default: "" },
  modelName: { type: String, default: "等待提问" },
  online: { type: Boolean, default: false },
  sources: { type: Array, default: () => [] },
  settings: { type: Object, default: () => ({}) }
});

const emit = defineEmits(["update:open", "ask", "open-source"]);

const launcherRef = useTemplateRef("launcher");
const panelRef = useTemplateRef("panel");
const inputRef = useTemplateRef("input");
const messageListRef = useTemplateRef("messageList");
const draft = shallowRef("");
const isDragging = shallowRef(false);
const isResizing = shallowRef(false);
const isMobile = shallowRef(false);
const wasPositioned = shallowRef(false);
const panelSizeState = reactive({ width: 340, height: 430 });
const position = reactive({ x: 0, y: 0 });
const dragState = reactive({ pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 });
const resizeState = reactive({
  pointerId: null,
  direction: "",
  startX: 0,
  startY: 0,
  startWidth: 0,
  startHeight: 0,
  startLeft: 0,
  startTop: 0
});
const resizeHandles = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
let mediaQuery = null;
let lastFocusElement = null;

const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 340;
const PANEL_MARGIN = 12;

const displayMessages = computed(() => (Array.isArray(props.messages) ? props.messages : []));
const sourceList = computed(() => (Array.isArray(props.sources) ? props.sources.filter(Boolean).slice(0, 5) : []));
const displayModelName = computed(() => props.modelName || props.settings?.model || "等待提问");
const statusText = computed(() => {
  if (props.pending) return "正在整理";
  if (props.status === "error") return "本地整理";
  if (displayMessages.value.length) return "已整理";
  return "待输入";
});
const settingsStatusText = computed(() => {
  if (props.settings?.error) return "暂时使用本地整理";
  if (!props.settings?.loaded) return "准备资料整理";
  if (props.settings.webSearch) return "可整理站内和联网资料";
  return "站内资料整理";
});
const panelStyle = computed(() => {
  const sizeVars = {
    "--assistant-panel-width": `${panelSizeState.width}px`,
    "--assistant-panel-height": `${panelSizeState.height}px`
  };
  if (isMobile.value || !wasPositioned.value) return null;
  return {
    ...sizeVars,
    left: `${position.x}px`,
    top: `${position.y}px`,
    right: "auto",
    bottom: "auto"
  };
});

function updateMobileState() {
  isMobile.value = Boolean(mediaQuery?.matches);
  if (!isMobile.value && props.open) nextTick(constrainWindow);
}

function setOpen(value) {
  emit("update:open", value);
}

function openAssistant() {
  if (typeof document !== "undefined") {
    lastFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  setOpen(true);
}

function closeAssistant() {
  setOpen(false);
}

function handlePanelKeydown(event) {
  if (event.key === "Escape") closeAssistant();
}

function panelSize() {
  const rect = panelRef.value?.getBoundingClientRect();
  return {
    width: rect?.width || panelSizeState.width,
    height: rect?.height || panelSizeState.height
  };
}

function resetPosition() {
  if (isMobile.value) return;
  const size = { width: panelSizeState.width, height: panelSizeState.height };
  const margin = 24;
  position.x = Math.max(margin, window.innerWidth - size.width - margin);
  position.y = Math.max(margin, window.innerHeight - size.height - margin);
  wasPositioned.value = true;
}

function constrainWindow() {
  if (isMobile.value || !wasPositioned.value) return;
  const maxWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - PANEL_MARGIN * 2);
  panelSizeState.width = Math.min(panelSizeState.width, maxWidth);
  panelSizeState.height = Math.min(panelSizeState.height, maxHeight);
  const size = panelSize();
  const maxX = Math.max(PANEL_MARGIN, window.innerWidth - size.width - PANEL_MARGIN);
  const maxY = Math.max(PANEL_MARGIN, window.innerHeight - size.height - PANEL_MARGIN);
  position.x = Math.min(Math.max(position.x, PANEL_MARGIN), maxX);
  position.y = Math.min(Math.max(position.y, PANEL_MARGIN), maxY);
}

function scrollToBottom() {
  const list = messageListRef.value;
  if (!list) return;
  list.scrollTop = list.scrollHeight;
}

function startDrag(event) {
  if (isMobile.value || isResizing.value || event.button !== 0) return;
  isDragging.value = true;
  dragState.pointerId = event.pointerId;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.originX = position.x;
  dragState.originY = position.y;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);
}

function moveDrag(event) {
  if (!isDragging.value || event.pointerId !== dragState.pointerId) return;
  position.x = dragState.originX + event.clientX - dragState.startX;
  position.y = dragState.originY + event.clientY - dragState.startY;
  constrainWindow();
}

function stopDrag() {
  isDragging.value = false;
  dragState.pointerId = null;
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", stopDrag);
  window.removeEventListener("pointercancel", stopDrag);
}

function clampPanelWidth(width, left, direction) {
  const maxViewportWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
  if (direction.includes("w")) {
    const rightEdge = resizeState.startLeft + resizeState.startWidth;
    return Math.min(Math.max(width, MIN_PANEL_WIDTH), Math.min(maxViewportWidth, rightEdge - PANEL_MARGIN));
  }
  return Math.min(Math.max(width, MIN_PANEL_WIDTH), window.innerWidth - left - PANEL_MARGIN);
}

function clampPanelHeight(height, top, direction) {
  const maxViewportHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - PANEL_MARGIN * 2);
  if (direction.includes("n")) {
    const bottomEdge = resizeState.startTop + resizeState.startHeight;
    return Math.min(Math.max(height, MIN_PANEL_HEIGHT), Math.min(maxViewportHeight, bottomEdge - PANEL_MARGIN));
  }
  return Math.min(Math.max(height, MIN_PANEL_HEIGHT), window.innerHeight - top - PANEL_MARGIN);
}

function startResize(event, direction) {
  if (isMobile.value || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (!wasPositioned.value) resetPosition();
  const rect = panelRef.value?.getBoundingClientRect();
  isResizing.value = true;
  resizeState.pointerId = event.pointerId;
  resizeState.direction = direction;
  resizeState.startX = event.clientX;
  resizeState.startY = event.clientY;
  resizeState.startWidth = rect?.width || panelSizeState.width;
  resizeState.startHeight = rect?.height || panelSizeState.height;
  resizeState.startLeft = rect?.left || position.x;
  resizeState.startTop = rect?.top || position.y;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", moveResize);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
}

function moveResize(event) {
  if (!isResizing.value || event.pointerId !== resizeState.pointerId) return;
  const direction = resizeState.direction;
  const deltaX = event.clientX - resizeState.startX;
  const deltaY = event.clientY - resizeState.startY;
  let nextLeft = resizeState.startLeft;
  let nextTop = resizeState.startTop;
  let nextWidth = resizeState.startWidth;
  let nextHeight = resizeState.startHeight;

  if (direction.includes("e")) {
    nextWidth = clampPanelWidth(resizeState.startWidth + deltaX, resizeState.startLeft, direction);
  }
  if (direction.includes("w")) {
    const rightEdge = resizeState.startLeft + resizeState.startWidth;
    nextWidth = clampPanelWidth(resizeState.startWidth - deltaX, resizeState.startLeft + deltaX, direction);
    nextLeft = rightEdge - nextWidth;
  }
  if (direction.includes("s")) {
    nextHeight = clampPanelHeight(resizeState.startHeight + deltaY, resizeState.startTop, direction);
  }
  if (direction.includes("n")) {
    const bottomEdge = resizeState.startTop + resizeState.startHeight;
    nextHeight = clampPanelHeight(resizeState.startHeight - deltaY, resizeState.startTop + deltaY, direction);
    nextTop = bottomEdge - nextHeight;
  }

  panelSizeState.width = nextWidth;
  panelSizeState.height = nextHeight;
  position.x = Math.max(PANEL_MARGIN, Math.min(nextLeft, window.innerWidth - nextWidth - PANEL_MARGIN));
  position.y = Math.max(PANEL_MARGIN, Math.min(nextTop, window.innerHeight - nextHeight - PANEL_MARGIN));
}

function stopResize() {
  isResizing.value = false;
  resizeState.pointerId = null;
  resizeState.direction = "";
  window.removeEventListener("pointermove", moveResize);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
  constrainWindow();
}

function sendDraft() {
  const text = draft.value.trim();
  if (!text || props.pending) return;
  emit("ask", text);
  draft.value = "";
}

watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (!open) {
      const target = lastFocusElement?.isConnected ? lastFocusElement : launcherRef.value;
      target?.focus?.({ preventScroll: true });
      return;
    }
    if (!isMobile.value && !wasPositioned.value) resetPosition();
    constrainWindow();
    scrollToBottom();
    inputRef.value?.focus?.({ preventScroll: true });
  }
);

watch(
  () => [displayMessages.value.length, props.pending],
  () => nextTick(scrollToBottom)
);

onMounted(() => {
  mediaQuery = window.matchMedia("(max-width: 720px)");
  updateMobileState();
  mediaQuery.addEventListener?.("change", updateMobileState);
  window.addEventListener("resize", constrainWindow);
});

onBeforeUnmount(() => {
  stopDrag();
  stopResize();
  mediaQuery?.removeEventListener?.("change", updateMobileState);
  window.removeEventListener("resize", constrainWindow);
});
</script>

<template>
  <Teleport to="body">
    <button v-if="!open" ref="launcher" class="home-ai-launcher" type="button" aria-label="继续提问" title="继续提问" @click="openAssistant">
      <span aria-hidden="true">
        <i></i>
        <i></i>
      </span>
    </button>

    <section
      v-else
      ref="panel"
      class="home-ai-assistant-panel"
      :class="{ 'is-dragging': isDragging, 'is-resizing': isResizing, 'is-mobile': isMobile }"
      :style="panelStyle"
      role="dialog"
      aria-modal="false"
      aria-label="继续提问"
      tabindex="-1"
      @keydown="handlePanelKeydown"
    >
      <header class="home-ai-assistant-head" @pointerdown="startDrag" @dblclick="resetPosition">
        <div class="home-ai-assistant-mark" aria-hidden="true">
          <i></i>
          <i></i>
        </div>
        <div class="home-ai-assistant-title">
          <strong>继续提问</strong>
          <span>{{ statusText }}</span>
        </div>
        <button type="button" title="收起" aria-label="收起提问面板，保留当前会话" @pointerdown.stop @dblclick.stop @click="closeAssistant">收起</button>
      </header>

      <div class="home-ai-assistant-meta">
        <span>{{ settingsStatusText }}</span>
        <span>资料来源：{{ sourceList.length ? `${sourceList.length} 条` : "暂无" }}</span>
        <button v-for="source in sourceList" :key="source.id || source.title" type="button" @click="emit('open-source', source)">
          {{ source.title }}
        </button>
      </div>

      <div ref="messageList" class="home-ai-assistant-messages">
        <div v-if="!displayMessages.length && !pending" class="home-ai-assistant-empty">
          <strong>今天想先处理哪件事？</strong>
          <p>可以继续问项目、排期、评论或资料整理。</p>
        </div>

        <article
          v-for="message in displayMessages"
          :key="message.id"
          class="home-ai-message"
          :class="[`is-${message.role}`, { 'is-degraded': message.degraded }]"
        >
          <span>{{ message.role === "user" ? "我" : "整理结果" }}</span>
          <p>{{ message.text }}</p>
          <div v-if="message.sources?.length" class="home-ai-message-sources">
            <strong>资料来源</strong>
            <button v-for="source in message.sources" :key="source.id || source.title" type="button" @click="emit('open-source', source)">
              {{ source.title }}
            </button>
          </div>
        </article>

        <article v-if="pending" class="home-ai-message is-assistant">
          <span>整理结果</span>
          <p><i class="home-ai-typing" aria-hidden="true"></i>正在整理，请稍等。</p>
        </article>

        <div v-if="errorMessage" class="home-ai-assistant-notice">{{ errorMessage }}</div>
      </div>

      <form class="home-ai-assistant-input" @submit.prevent="sendDraft">
        <input ref="input" v-model="draft" type="text" :disabled="pending" aria-label="继续提问" placeholder="继续问" />
        <button type="submit" :disabled="pending || !draft.trim()">发送</button>
      </form>

      <span
        v-for="handle in resizeHandles"
        :key="handle"
        class="home-ai-resize-handle"
        :class="`is-${handle}`"
        aria-hidden="true"
        @pointerdown="startResize($event, handle)"
      ></span>
    </section>
  </Teleport>
</template>
