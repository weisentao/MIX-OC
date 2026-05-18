<script setup>
import { shallowRef } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const emit = defineEmits(["add-tag", "delete-tag", "filter-tag"]);
const store = useWorkspaceStore();
const removeOver = shallowRef(false);

function dragStart(event, tag) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/tag-name", tag.name);
}

function removeDragOver(event) {
  if (![...event.dataTransfer.types].includes("text/tag-name")) return;
  if ([...event.dataTransfer.types].includes("text/active-tag-name")) return;
  event.preventDefault();
  removeOver.value = true;
}

function removeDrop(event) {
  event.preventDefault();
  removeOver.value = false;
  if ([...event.dataTransfer.types].includes("text/active-tag-name")) return;
  const name = event.dataTransfer.getData("text/tag-name");
  emit("delete-tag", name);
}
</script>

<template>
  <section class="tag-bank">
    <div class="tag-toolbar">
      <div class="tag-title">
        <strong>#</strong>
        <span>标签</span>
        <button @click="emit('add-tag')">+</button>
      </div>
      <div
        class="tag-remove-drop"
        :class="{ 'is-over': removeOver }"
        @dragover="removeDragOver"
        @dragleave="removeOver = false"
        @drop="removeDrop"
      >
        标签拖到这里删除
      </div>
    </div>
    <div class="tag-list">
      <span
        v-for="tag in store.tags"
        :key="tag.name"
        class="tag-pill tag-pill-editable animate__animated animate__zoomIn"
        :data-color="tag.color"
        draggable="true"
        @dragstart="dragStart($event, tag)"
      >
        <button class="tag-filter" type="button" @click="emit('filter-tag', tag.name)">{{ tag.name }}</button>
      </span>
    </div>
  </section>
</template>
