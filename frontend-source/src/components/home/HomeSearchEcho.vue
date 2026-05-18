<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useTemplateRef, watch } from "vue";

const props = defineProps({
  state: { type: String, default: "idle" },
  query: { type: String, default: "" },
  result: { type: Object, default: null },
  sources: { type: Array, default: () => [] },
  message: { type: String, default: "" }
});

const emit = defineEmits(["open-assistant", "open-source", "close"]);

const echoRef = useTemplateRef("echo");
const isCollapsed = shallowRef(false);
const isExpanded = shallowRef(false);
const isDragging = shallowRef(false);
const isMobile = shallowRef(false);
const wasPositioned = shallowRef(false);
const position = reactive({ x: 0, y: 0 });
const dragState = reactive({ pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 });
let mediaQuery = null;

const sourceList = computed(() => (Array.isArray(props.sources) ? props.sources.filter(Boolean).slice(0, 4) : []));
const isLoading = computed(() => props.state === "loading");
const isError = computed(() => props.state === "error");
const isEmpty = computed(() => props.state === "empty");
const titleText = computed(() => {
  if (isLoading.value) return "正在整理搜索结果";
  if (isError.value) return "已使用本地整理结果";
  if (isEmpty.value) return "暂时没有找到可展示内容";
  return "搜索整理结果";
});
const bodyText = computed(() => {
  if (props.message) return props.message;
  if (isLoading.value) return "正在联系后端并整理本站资料来源。";
  if (isError.value) return "后端暂时没有返回，我先把本站可用资料整理给你。";
  if (isEmpty.value) return "可以换个关键词，或点继续问补充更多背景。";
  return props.result?.answer || "已整理完成，可以继续追问。";
});
const canExpandBody = computed(() => !isLoading.value && bodyText.value.length > 72);
const panelStyle = computed(() => {
  if (isMobile.value || !wasPositioned.value) return null;
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
    right: "auto",
    bottom: "auto"
  };
});

function panelSize() {
  const rect = echoRef.value?.getBoundingClientRect();
  return {
    width: rect?.width || 420,
    height: rect?.height || 230
  };
}

function constrainWindow() {
  if (isMobile.value || !wasPositioned.value) return;
  const size = panelSize();
  const margin = 14;
  const maxX = Math.max(margin, window.innerWidth - size.width - margin);
  const maxY = Math.max(margin, window.innerHeight - size.height - margin);
  position.x = Math.min(Math.max(position.x, margin), maxX);
  position.y = Math.min(Math.max(position.y, margin), maxY);
}

function resetPosition() {
  if (isMobile.value) return;
  const size = panelSize();
  const margin = 24;
  position.x = Math.max(margin, window.innerWidth - size.width - 112);
  position.y = Math.max(margin, window.innerHeight - size.height - 116);
  wasPositioned.value = true;
  nextTick(constrainWindow);
}

function updateMobileState() {
  isMobile.value = Boolean(mediaQuery?.matches);
  if (isMobile.value) {
    stopDrag();
    return;
  }
  nextTick(() => {
    if (!wasPositioned.value) resetPosition();
    constrainWindow();
  });
}

function startDrag(event) {
  if (isMobile.value || event.button !== 0) return;
  if (!wasPositioned.value) resetPosition();
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

function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value;
}

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
  nextTick(constrainWindow);
}

watch(
  () => [props.query, props.state],
  () => {
    isCollapsed.value = false;
    isExpanded.value = false;
    nextTick(constrainWindow);
  }
);

onMounted(() => {
  mediaQuery = window.matchMedia("(max-width: 720px)");
  updateMobileState();
  mediaQuery.addEventListener?.("change", updateMobileState);
  window.addEventListener("resize", constrainWindow);
});

onBeforeUnmount(() => {
  stopDrag();
  mediaQuery?.removeEventListener?.("change", updateMobileState);
  window.removeEventListener("resize", constrainWindow);
});
</script>

<template>
  <section
    ref="echo"
    class="home-search-echo"
    :class="[
      `is-${state}`,
      { 'is-collapsed': isCollapsed, 'is-expanded': isExpanded, 'is-dragging': isDragging, 'is-mobile': isMobile }
    ]"
    :style="panelStyle"
    aria-live="polite"
    aria-label="搜索整理结果"
  >
    <div class="home-search-echo__accent" aria-hidden="true">
      <i></i>
      <i></i>
      <i></i>
    </div>
    <div class="home-search-echo__main">
      <header class="home-search-echo__head" @pointerdown="startDrag" @dblclick="resetPosition">
        <div class="home-search-echo__title">
          <span>{{ query ? `搜索：${query}` : "首页搜索" }}</span>
          <strong>{{ titleText }}</strong>
        </div>
        <div class="home-search-echo__controls" @pointerdown.stop @dblclick.stop>
          <button
            type="button"
            :aria-label="isCollapsed ? '展开搜索结果' : '收起搜索结果'"
            :aria-expanded="!isCollapsed"
            @click="toggleCollapsed"
          >
            {{ isCollapsed ? "展开" : "收起" }}
          </button>
          <button type="button" aria-label="关闭搜索结果" @click="emit('close')">关闭</button>
        </div>
      </header>
      <div v-if="!isCollapsed" class="home-search-echo__content">
        <p class="home-search-echo__body" :class="{ 'is-expanded': isExpanded }">
          <span v-if="isLoading" class="home-search-echo__loader" aria-hidden="true"></span>
          {{ bodyText }}
        </p>
        <button v-if="canExpandBody" class="home-search-echo__body-toggle" type="button" @click="toggleExpanded">
          {{ isExpanded ? "收起正文" : "展开" }}
        </button>
        <div v-if="sourceList.length" class="home-search-echo__sources" aria-label="资料来源">
          <button v-for="source in sourceList" :key="source.id || source.title" type="button" @click="emit('open-source', source)">
            <span>{{ source.type || "资料来源" }}</span>
            <strong>{{ source.title }}</strong>
          </button>
        </div>
        <div v-else-if="!isLoading" class="home-search-echo__empty">暂无资料来源，可继续描述你的问题。</div>
      </div>
    </div>
    <button v-if="!isCollapsed" class="home-search-echo__action" type="button" @click="emit('open-assistant')">继续问</button>
  </section>
</template>
