<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const tagDropActive = ref(false);
const activeTagDrag = ref(null);
const activeTagRemoving = ref("");
const tagPopoverOpen = ref(false);
const tagLibraryOpen = ref(false);

const activeTags = computed(() => store.activeProject?.tags || []);
const visibleActiveTags = computed(() => activeTags.value.slice(0, 5));
const hiddenActiveTags = computed(() => activeTags.value.slice(5));
const availableTags = computed(() =>
  (store.tags || []).filter((tag) => tag?.name && !activeTags.value.includes(tag.name))
);

function findAvailableTag(name = "") {
  const cleanName = String(name || "").replace("#", "").trim();
  if (!cleanName) return null;
  return availableTags.value.find((tag) => tag.name === cleanName) || null;
}

function tagDragOver(event) {
  if (![...event.dataTransfer.types].includes("text/tag-name")) return;
  event.preventDefault();
  tagDropActive.value = true;
}

function tagDrop(event) {
  event.preventDefault();
  tagDropActive.value = false;
  const name = event.dataTransfer.getData("text/tag-name");
  const tag = findAvailableTag(name);
  if (tag) store.bindTagToActiveProject(tag.name);
}

function activeTagDragStart(event, tagName) {
  activeTagDrag.value = { name: tagName, startY: event.clientY };
  activeTagRemoving.value = "";
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/tag-name", tagName);
  event.dataTransfer.setData("text/active-tag-name", tagName);
}

function activeTagDragMove(event) {
  if (!activeTagDrag.value || !event.clientY) return;
  activeTagRemoving.value = event.clientY < activeTagDrag.value.startY - 28 ? activeTagDrag.value.name : "";
}

function activeTagDragEnd(event) {
  const drag = activeTagDrag.value;
  activeTagDrag.value = null;
  activeTagRemoving.value = "";
  if (!drag || !event.clientY) return;
  if (event.clientY < drag.startY - 28) {
    store.removeTagFromActiveProject(drag.name);
  }
}

function selectTagFromLibrary(tag) {
  const availableTag = findAvailableTag(tag?.name);
  if (!availableTag) return;
  store.bindTagToActiveProject(availableTag.name);
  tagLibraryOpen.value = false;
}
</script>

<template>
  <div
    class="meta-tags"
    :class="{ 'is-tag-drop': tagDropActive }"
    title="从左下角拖拽标签到这里添加；向上拖出现有标签可移除"
    @dragover="tagDragOver"
    @dragleave="tagDropActive = false"
    @drop="tagDrop"
  >
    <span class="meta-tags-label">标签</span>
    <span
      v-for="tagName in visibleActiveTags"
      :key="tagName"
      class="tag-pill active-tag-pill meta-tag-pill"
      :class="{ 'is-removing': activeTagRemoving === tagName }"
      :data-color="store.getTag(tagName).color"
      draggable="true"
      @dragstart="activeTagDragStart($event, tagName)"
      @drag="activeTagDragMove"
      @dragend="activeTagDragEnd"
    >
      {{ store.getTag(tagName).name }}
    </span>
    <button
      v-if="hiddenActiveTags.length"
      class="tag-pill active-tag-more meta-tag-more"
      type="button"
      @click="tagPopoverOpen = !tagPopoverOpen"
    >
      +{{ hiddenActiveTags.length }}
    </button>
    <button
      class="tag-pill meta-tag-add"
      type="button"
      title="从标签库选择标签"
      aria-label="从标签库选择标签"
      @click="tagLibraryOpen = !tagLibraryOpen"
    >
      +
    </button>
    <small v-if="!activeTags.length">拖拽标签到这里</small>
    <div v-if="tagPopoverOpen" class="active-tag-popover meta-tag-popover">
      <span
        v-for="tagName in hiddenActiveTags"
        :key="`hidden-${tagName}`"
        class="tag-pill active-tag-pill"
        :data-color="store.getTag(tagName).color"
      >
        {{ store.getTag(tagName).name }}
      </span>
    </div>
    <div v-if="tagLibraryOpen" class="active-tag-popover meta-tag-popover meta-tag-library-popover">
      <button
        v-for="tag in availableTags"
        :key="`library-${tag.name}`"
        class="tag-pill active-tag-pill meta-tag-library-option"
        type="button"
        :data-color="tag.color"
        @click="selectTagFromLibrary(tag)"
      >
        {{ tag.name }}
      </button>
      <span v-if="!availableTags.length" class="meta-tag-empty">标签库暂无可添加标签</span>
    </div>
  </div>
</template>
