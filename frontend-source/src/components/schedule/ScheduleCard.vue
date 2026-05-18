<script setup>
import { computed } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  task: {
    type: Object,
    required: true
  },
  mode: {
    type: String,
    default: "card"
  }
});

const store = useWorkspaceStore();
const module = computed(() => store.getTaskModule(props.task));
const selected = computed(() => store.scheduleSelectedTaskId === props.task.id);

function dragStart(event) {
  store.scheduleDraggingTaskId = props.task.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/schedule-task-id", String(props.task.id));
}

function dragEnd() {
  store.scheduleDraggingTaskId = null;
}
</script>

<template>
  <article
    v-if="mode === 'card'"
    class="schedule-card"
    :class="{ 'is-selected': selected, 'is-dragging': store.scheduleDraggingTaskId === task.id }"
    :data-schedule-before="task.id"
    draggable="true"
    @click="store.selectScheduleTask(task.id)"
    @dragstart="dragStart"
    @dragend="dragEnd"
  >
    <div class="schedule-card-top">
      <strong>{{ task.title }}</strong>
      <span class="priority-pill" :data-priority="task.priority || '中'">{{ task.priority || "中" }}</span>
    </div>
    <p>{{ task.note }}</p>
    <div class="schedule-meta-line">
      <span class="avatar mini-avatar" data-tone="blue">{{ (task.owner || "严").slice(-3, -2) || "严" }}</span>
      <span>{{ task.endDate }} 截止</span>
      <span>{{ task.comments.length }} 评</span>
      <span>{{ task.attachments || 0 }} 附</span>
    </div>
    <div class="schedule-progress"><i :style="{ width: `${task.progress}%` }"></i></div>
    <small>{{ module.label }} · {{ task.duration }} 天</small>
  </article>

  <article
    v-else
    class="schedule-row"
    :class="{ 'is-selected': selected, 'is-dragging': store.scheduleDraggingTaskId === task.id }"
    :data-schedule-before="task.id"
    draggable="true"
    @click="store.selectScheduleTask(task.id)"
    @dragstart="dragStart"
    @dragend="dragEnd"
  >
    <span class="drag-handle">⋮⋮</span>
    <strong>{{ task.title }}</strong>
    <span>{{ task.startDate }} - {{ task.endDate }}</span>
    <span>{{ task.duration }} 天</span>
    <span><span class="table-dot" :data-color="module.color"></span>{{ module.label }}</span>
    <span>{{ task.comments.length }} 评 / {{ task.attachments || 0 }} 附</span>
    <button type="button" @click.stop="store.showToast('编辑入口已触发')">编辑</button>
  </article>
</template>
