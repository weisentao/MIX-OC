<script setup>
import { computed, shallowRef } from "vue";
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
const isOver = shallowRef(false);

const moduleColorTokens = {
  red: {
    color: "#ee777a",
    soft: "rgba(238, 119, 122, 0.1)",
    hover: "rgba(238, 119, 122, 0.14)",
    border: "rgba(238, 119, 122, 0.42)",
    shadow: "rgba(238, 119, 122, 0.18)"
  },
  green: {
    color: "#65b878",
    soft: "rgba(101, 184, 120, 0.1)",
    hover: "rgba(101, 184, 120, 0.14)",
    border: "rgba(101, 184, 120, 0.42)",
    shadow: "rgba(101, 184, 120, 0.18)"
  },
  yellow: {
    color: "#f4b321",
    soft: "rgba(244, 179, 33, 0.12)",
    hover: "rgba(244, 179, 33, 0.16)",
    border: "rgba(244, 179, 33, 0.46)",
    shadow: "rgba(244, 179, 33, 0.2)"
  },
  blue: {
    color: "#5ca9d7",
    soft: "rgba(92, 169, 215, 0.1)",
    hover: "rgba(92, 169, 215, 0.14)",
    border: "rgba(92, 169, 215, 0.42)",
    shadow: "rgba(92, 169, 215, 0.18)"
  },
  purple: {
    color: "#bc7ad2",
    soft: "rgba(188, 122, 210, 0.1)",
    hover: "rgba(188, 122, 210, 0.14)",
    border: "rgba(188, 122, 210, 0.42)",
    shadow: "rgba(188, 122, 210, 0.18)"
  },
  pink: {
    color: "#e778a3",
    soft: "rgba(231, 120, 163, 0.1)",
    hover: "rgba(231, 120, 163, 0.14)",
    border: "rgba(231, 120, 163, 0.42)",
    shadow: "rgba(231, 120, 163, 0.18)"
  }
};

const fallbackModuleColor = "#8d99a6";

const moduleColorStyle = computed(() => {
  const rawColor = props.module?.color;
  const token = moduleColorTokens[rawColor];
  const color = token?.color || rawColor || fallbackModuleColor;

  return {
    "--module-color": color,
    "--module-soft-bg": token?.soft || `color-mix(in srgb, ${color} 10%, #ffffff)`,
    "--module-hover-bg": token?.hover || `color-mix(in srgb, ${color} 14%, #ffffff)`,
    "--module-border-color": token?.border || `color-mix(in srgb, ${color} 42%, #dfe4e8)`,
    "--module-shadow-color": token?.shadow || `color-mix(in srgb, ${color} 18%, transparent)`
  };
});

const taskModuleClasses = computed(() => ({
  "is-task-drag-over": isOver.value,
  "is-module-selected": store.taskModuleFilter === props.module.key,
  "is-module-dragging": props.tasks.some((task) => task.id === store.draggingTaskId),
  "is-module-highlighted": props.tasks.some((task) => task.id === store.recentTaskId)
}));

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
  <section class="task-module" :class="taskModuleClasses" :data-color="module.color" :style="moduleColorStyle" @dragover="dragOver" @dragleave="isOver = false" @drop="drop">
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

<style scoped>
.task-module {
  position: relative;
  overflow: hidden;
  background: var(--v16-panel-bg, #fff) !important;
  border: 1px solid var(--module-border-color, #dfe4e8) !important;
  border-top: 4px solid var(--module-color, #999) !important;
  border-left: 4px solid var(--module-color, #999) !important;
  box-shadow: 0 8px 20px var(--module-shadow-color, rgba(0, 0, 0, 0.06)) !important;
}

.task-module:hover,
.task-module.is-module-selected,
.task-module.is-module-dragging,
.task-module.is-module-highlighted {
  background: linear-gradient(180deg, var(--module-soft-bg, #f7f8fa) 0%, var(--v16-panel-bg, #fff) 72%) !important;
  border-color: var(--module-border-color, #dfe4e8) !important;
  border-top-color: var(--module-color, #999) !important;
  border-left-color: var(--module-color, #999) !important;
}

.task-module.is-task-drag-over {
  background: linear-gradient(180deg, var(--module-hover-bg, #f7f8fa) 0%, var(--module-soft-bg, #fff) 100%) !important;
  border: 2px dashed var(--module-color, #999) !important;
  border-top-width: 4px !important;
  border-left-width: 4px !important;
  box-shadow: inset 0 0 0 2px var(--module-shadow-color, rgba(0, 0, 0, 0.12)), 0 10px 22px var(--module-shadow-color, rgba(0, 0, 0, 0.08)) !important;
}

.task-module-head {
  padding-inline: 8px !important;
  border-radius: calc(var(--radius-md, 8px) - 2px);
  background: linear-gradient(90deg, var(--module-soft-bg, #f7f8fa) 0%, rgba(255, 255, 255, 0) 78%) !important;
}

.module-dot {
  background: var(--module-color, #999) !important;
  box-shadow: 0 0 0 3px var(--module-soft-bg, rgba(0, 0, 0, 0.06));
}

.empty-state.compact {
  background: var(--module-soft-bg, #f7f8fa);
  border: 1px dashed var(--module-border-color, #dfe4e8);
  color: #667085;
}

.task-module.is-task-drag-over .empty-state.compact {
  background: var(--module-hover-bg, #f7f8fa);
  border-color: var(--module-color, #999);
}
</style>
