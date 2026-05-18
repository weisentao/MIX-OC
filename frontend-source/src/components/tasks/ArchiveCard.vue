<script setup>
import { computed } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import CommentPanel from "./CommentPanel.vue";

const props = defineProps({
  task: {
    type: Object,
    required: true
  }
});

const store = useWorkspaceStore();
const module = computed(() => store.getTaskModule(props.task));

function dragStart(event) {
  store.draggingTaskId = props.task.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/task-id", String(props.task.id));
}

function dragEnd() {
  store.draggingTaskId = null;
}
</script>

<template>
  <article
    class="archive-card animate__animated animate__fadeInRight"
    :class="{
      'is-expanded': task.expanded,
      'is-recent animate__pulse': store.recentTaskId === task.id,
      'is-dragging': store.draggingTaskId === task.id
    }"
    :data-color="module.color"
    draggable="true"
    @dragstart="dragStart"
    @dragend="dragEnd"
  >
    <span class="task-check done-check" title="已完成">✓</span>
    <div>
      <strong @click="store.toggleTask(task.id)">{{ task.title }}</strong>
      <small v-if="task.startDate || task.endDate">任务时间: {{ task.startDate }}-{{ task.endDate }}</small>
      <p>{{ task.note }}</p>
    </div>
    <button class="comment-count" type="button" title="查看留言" @click="store.toggleTask(task.id)">{{ task.comments.length }} 条</button>
    <CommentPanel v-if="task.expanded" :task="task" />
  </article>
</template>
