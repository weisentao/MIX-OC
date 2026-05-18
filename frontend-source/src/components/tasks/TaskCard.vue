<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import CommentPanel from "./CommentPanel.vue";
import { askConfirm, askText } from "@/utils/appDialog";

const props = defineProps({
  task: {
    type: Object,
    required: true
  }
});

const store = useWorkspaceStore();
const module = computed(() => store.getTaskModule(props.task));
const contextOpen = ref(false);
const contextStyle = ref({});
let contextCloseTimer = 0;
const unreadCount = computed(() => {
  if (props.task.expanded) return 0;
  return Math.max(0, Number(props.task.unreadComments || 0));
});

const people = computed(() => {
  if (props.task.comments.length) {
    return props.task.comments.map((comment) => ({ name: comment.user, tone: comment.tone })).slice(0, 3);
  }
  return [];
});

watch(
  () => props.task.comments.length,
  (nextCount, previousCount) => {
    const added = nextCount - previousCount;
    if (added <= 0) return;
    if (props.task.expanded) {
      store.markTaskCommentsRead(props.task.id);
      return;
    }
    const latest = props.task.comments[nextCount - 1];
    if (latest?.user === store.currentUser?.name) {
      store.markTaskCommentsRead(props.task.id);
      return;
    }
    props.task.unreadComments = Math.max(0, Number(props.task.unreadComments || 0)) + added;
  }
);

function dragStart(event) {
  store.draggingTaskId = props.task.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/task-id", String(props.task.id));
}

function dragEnd() {
  store.draggingTaskId = null;
}

async function editNote() {
  if (!store.canEditTask) return;
  const next = await askText({ title: "编辑备注", message: "请输入备注内容", inputValue: props.task.note });
  store.updateTaskNote(props.task.id, next);
}

async function editTitle() {
  if (!store.canEditTask) return;
  const next = await askText({ title: "修改任务标题", message: "请输入新的任务标题", inputValue: props.task.title });
  store.updateTaskTitle(props.task.id, next);
}

async function deleteTask() {
  if (!store.canEditTask) return;
  if (!(await askConfirm({ title: "删除清单", message: `确认删除「${props.task.title}」这条清单吗？`, confirmButtonText: "删除" }))) return;
  store.deleteTask(props.task.id);
}

async function noteDblClick() {
  if (props.task.archived) return;
  const next = await askText({ title: "编辑备注", message: "请输入备注内容", inputValue: props.task.note });
  store.updateTaskNote(props.task.id, next);
}

function rowKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  store.toggleTask(props.task.id);
}

function openContext(event) {
  if (props.task.archived) return;
  event.preventDefault();
  window.clearTimeout(contextCloseTimer);
  const menuWidth = 148;
  const menuHeight = 126;
  const gap = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(gap, Math.min(event.clientX + gap, viewportWidth - menuWidth - gap));
  const top = Math.max(gap, Math.min(event.clientY + gap, viewportHeight - menuHeight - gap));
  contextStyle.value = { left: `${left}px`, top: `${top}px`, maxHeight: `calc(100vh - ${gap * 2}px)` };
  contextOpen.value = true;
}

function closeContextSoon() {
  contextCloseTimer = window.setTimeout(() => {
    contextOpen.value = false;
  }, 120);
}

function keepContextOpen() {
  window.clearTimeout(contextCloseTimer);
}

function runContext(action) {
  contextOpen.value = false;
  if (action === "title") editTitle();
  if (action === "note") editNote();
  if (action === "delete") deleteTask();
}

onBeforeUnmount(() => {
  window.clearTimeout(contextCloseTimer);
});
</script>

<template>
  <article
    class="task-card"
    :class="{
      'is-expanded': task.expanded,
      'is-recent animate__animated animate__pulse': store.recentTaskId === task.id,
      'is-dragging': store.draggingTaskId === task.id
    }"
    :data-color="module.color"
    draggable="true"
    @dragstart="dragStart"
    @dragend="dragEnd"
    @mouseleave="closeContextSoon"
  >
    <div class="task-row" role="button" tabindex="0" :aria-expanded="task.expanded" @click="store.toggleTask(task.id)" @keydown="rowKeydown" @dblclick="noteDblClick" @contextmenu="openContext">
      <button class="task-check" type="button" title="完成清单" :disabled="!store.canEditTask" @click.stop="store.completeTask(task, true)"></button>
      <span class="task-divider task-divider-main"></span>
      <div class="task-title" @dblclick.stop="editTitle">
        <button class="task-title-link" type="button" title="点击打开任务详情，双击可修改任务标题" @click.stop="store.toggleTask(task.id)" @dblclick.stop="editTitle">{{ task.title }}</button>
        <small v-if="task.startDate || task.endDate">任务时间: {{ task.startDate }}-{{ task.endDate }}</small>
      </div>
      <span class="task-divider task-divider-note"></span>
      <div class="task-note">{{ task.note }}</div>
      <span class="task-arrow" aria-hidden="true"></span>
      <span class="task-divider task-divider-comment"></span>
      <button class="comment-chip" type="button" title="展开评论" @click.stop="store.toggleTask(task.id)">
        <svg class="comment-icon" viewBox="0 0 32 28" aria-hidden="true" focusable="false">
          <path d="M5.5 3.5h21a3 3 0 0 1 3 3v12.5a3 3 0 0 1-3 3H15.2l-7 4.2V22H5.5a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z"></path>
          <circle cx="11" cy="13" r="1.7"></circle>
          <circle cx="16" cy="13" r="1.7"></circle>
          <circle cx="21" cy="13" r="1.7"></circle>
        </svg>
        <span v-if="unreadCount" class="comment-number">{{ unreadCount }}</span>
      </button>
      <div class="task-people">
        <span v-for="person in people" :key="`${task.id}-${person.name}`" class="avatar mini-avatar" :data-tone="person.tone" :title="person.name">
          {{ person.name.slice(0, 1) }}
        </span>
      </div>
      <div class="task-actions">
        <button class="close-action" type="button" aria-label="删除清单" title="删除清单" @click.stop="deleteTask">×</button>
      </div>
      <Teleport to="body">
      <div v-if="contextOpen" class="task-context-menu" :style="contextStyle" @mouseenter="keepContextOpen" @mouseleave="closeContextSoon" @click.stop>
        <button type="button" @click="runContext('title')">编辑主题</button>
        <button type="button" @click="runContext('note')">编辑备注</button>
        <button type="button" @click="runContext('delete')">删除清单</button>
      </div>
      </Teleport>
    </div>

    <div v-if="task.expanded" class="task-detail-drawer animate__animated animate__fadeInDown">
      <div class="task-detail-note">
        <strong>备注详情</strong>
        <p>{{ task.note }}</p>
      </div>
      <CommentPanel :task="task" />
    </div>
  </article>
</template>

<style scoped>
.task-context-menu {
  max-height: calc(100vh - 16px);
  overflow-y: auto;
}
</style>
