<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import ScheduleCard from "./ScheduleCard.vue";

const props = defineProps({
  column: {
    type: Object,
    required: true
  },
  tasks: {
    type: Array,
    default: () => []
  },
  mode: {
    type: String,
    default: "kanban"
  }
});

const store = useWorkspaceStore();
const over = ref(false);
const columnTasks = computed(() => props.tasks.filter((task) => task.scheduleStatus === props.column.key));

function dragOver(event) {
  event.preventDefault();
  over.value = true;
}

function drop(event) {
  event.preventDefault();
  over.value = false;
  const taskId = Number(event.dataTransfer.getData("text/schedule-task-id"));
  const beforeTaskId = Number(event.target.closest("[data-schedule-before]")?.dataset.scheduleBefore || 0);
  store.moveScheduleTask(taskId, props.column.key, beforeTaskId);
}
</script>

<template>
  <section
    v-if="mode === 'kanban'"
    class="schedule-column"
    :class="{ 'is-schedule-drag-over': over }"
    :data-color="column.color"
    @dragover="dragOver"
    @dragleave="over = false"
    @drop="drop"
  >
    <div class="schedule-column-head">
      <span>{{ column.label }}</span>
      <small>{{ columnTasks.length }}</small>
    </div>
    <div class="schedule-card-list">
      <ScheduleCard v-for="task in columnTasks" :key="task.id" :task="task" />
      <div v-if="!columnTasks.length" class="schedule-empty">拖入任务后自动进入「{{ column.label }}」</div>
    </div>
  </section>

  <section
    v-else
    class="schedule-list-group"
    :class="{ 'is-schedule-drag-over': over }"
    :data-color="column.color"
    @dragover="dragOver"
    @dragleave="over = false"
    @drop="drop"
  >
    <button class="schedule-list-head" type="button">
      <span>{{ column.label }}</span>
      <small>{{ columnTasks.length }} 项</small>
    </button>
    <ScheduleCard v-for="task in columnTasks" :key="task.id" :task="task" mode="row" />
    <div v-if="!columnTasks.length" class="schedule-empty">暂无{{ column.label }}任务</div>
  </section>
</template>
