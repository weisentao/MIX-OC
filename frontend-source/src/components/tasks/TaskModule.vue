<script setup>
import { ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import TaskCard from "./TaskCard.vue";
import ArchiveCard from "./ArchiveCard.vue";

const props = defineProps({
  module: {
    type: Object,
    required: true
  },
  tasks: {
    type: Array,
    default: () => []
  },
  status: {
    type: String,
    default: "active"
  }
});

const store = useWorkspaceStore();
const isOver = ref(false);

function dragOver(event) {
  if (![...event.dataTransfer.types].includes("text/task-id")) return;
  event.preventDefault();
  isOver.value = true;
}

function drop(event) {
  event.preventDefault();
  event.stopPropagation();
  isOver.value = false;
  const taskId = event.dataTransfer.getData("text/task-id");
  const beforeTaskId = event.target.closest("[data-before-task-id]")?.dataset.beforeTaskId || 0;
  store.handleTaskDrop(taskId, props.status, props.module.key, beforeTaskId);
}
</script>

<template>
  <section class="task-module" :class="{ 'is-task-drag-over': isOver }" :data-color="module.color" @dragover="dragOver" @dragleave="isOver = false" @drop="drop">
    <div class="task-module-head">
      <span class="module-dot"></span>
      <strong>{{ module.label }}</strong>
      <small>{{ tasks.length }} 项</small>
    </div>
    <div class="task-module-list">
      <div v-for="task in tasks" :key="task.id" :data-before-task-id="task.id">
        <TaskCard v-if="status === 'active'" :task="task" />
        <ArchiveCard v-else :task="task" />
      </div>
      <div v-if="!tasks.length" class="empty-state compact">拖入第一条{{ module.label }}任务后自动创建模块</div>
    </div>
  </section>
</template>
