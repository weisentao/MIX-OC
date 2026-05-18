<script setup>
import { computed, nextTick, ref, shallowRef } from "vue";
import ProjectTree from "@/components/tree/ProjectTree.vue";
import TemplateTree from "@/components/tree/TemplateTree.vue";
import TagBank from "@/components/tree/TagBank.vue";

const props = defineProps({
  layoutMode: { type: String, default: "default" }
});
const emit = defineEmits(["prompt", "add-tag", "delete-tag", "layout-mode-change"]);
const searchInputRef = ref(null);

const searchText = shallowRef("");
const projectTreeQuery = computed(() => searchText.value);
const normalizedLayoutMode = computed(() => (["collapsed", "wide"].includes(props.layoutMode) ? props.layoutMode : "default"));
const isCollapsed = computed(() => normalizedLayoutMode.value === "collapsed");
const layoutControls = [
  { mode: "collapsed", label: "收起左侧项目树", icon: "collapse" },
  { mode: "default", label: "恢复默认宽度", icon: "default" },
  { mode: "wide", label: "展开左侧项目树", icon: "wide" }
];

async function openSearch() {
  await nextTick();
  searchInputRef.value?.focus?.();
}

function clearSearch() {
  searchText.value = "";
}

function filterByTag(tagName) {
  searchText.value = tagName;
  openSearch();
}

function setLayoutMode(mode) {
  emit("layout-mode-change", mode);
}

function collapsePanel() {
  setLayoutMode("collapsed");
}

function handleLayoutControl(mode) {
  if (mode === "collapsed" && isCollapsed.value) {
    setLayoutMode("default");
    return;
  }
  setLayoutMode(mode);
}

function isControlActive(mode) {
  return normalizedLayoutMode.value === mode;
}
</script>

<template>
  <section class="project-panel" :class="`is-${normalizedLayoutMode}`">
    <button v-if="isCollapsed" class="project-panel-restore" type="button" title="恢复默认项目栏" aria-label="恢复默认项目栏" @click="setLayoutMode('default')">
      <span class="project-panel-restore-icon" aria-hidden="true"></span>
    </button>

    <template v-else>
      <button class="project-panel-collapse-zone" type="button" title="收起左侧项目树" aria-label="收起左侧项目树" @click="collapsePanel">
        <span aria-hidden="true"></span>
      </button>

      <div class="project-top">
        <label class="search-box" @click="openSearch">
          <input ref="searchInputRef" v-model="searchText" type="search" placeholder="搜索" @focus="openSearch" @click.stop="openSearch" @keydown.esc="clearSearch" />
        </label>
        <div class="project-layout-controls" aria-label="左侧项目树显示控制">
          <button
            v-for="control in layoutControls"
            :key="control.mode"
            class="project-layout-control"
            :class="[`is-${control.icon}`, { 'is-active': isControlActive(control.mode) }]"
            type="button"
            :title="control.label"
            :aria-label="control.label"
            :aria-pressed="isControlActive(control.mode)"
            @click="handleLayoutControl(control.mode)"
          >
            <span class="project-layout-control-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      <div v-if="searchText" class="project-side-search-hint" aria-live="polite">
        <span>正在筛选左侧项目树</span>
        <button type="button" aria-label="清空项目搜索" @click="clearSearch">清空</button>
      </div>

      <div class="tree-scroll">
        <ProjectTree :filter-query="projectTreeQuery" @prompt="emit('prompt', $event)" />
        <div class="tree-section-divider" role="presentation"></div>
        <TemplateTree @prompt="emit('prompt', $event)" />
      </div>

      <TagBank @add-tag="emit('add-tag')" @delete-tag="emit('delete-tag', $event)" @filter-tag="filterByTag" />
    </template>
  </section>
</template>
