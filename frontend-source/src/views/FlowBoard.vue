<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { taskModules } from "@/data/seed";
import TaskModule from "@/components/tasks/TaskModule.vue";

const emit = defineEmits(["clear-archive", "create-task"]);
const store = useWorkspaceStore();
const taskBoardOver = ref(false);
const archiveOver = ref(false);

const activeByModule = computed(() =>
  taskModules
    .map((module) => ({ module, tasks: store.activeTasks.filter((task) => store.getTaskModule(task).key === module.key) }))
    .filter((group) => group.tasks.length)
);

const archivedByModule = computed(() =>
  taskModules
    .map((module) => ({ module, tasks: store.archivedTasks.filter((task) => store.getTaskModule(task).key === module.key) }))
    .filter((group) => group.tasks.length)
);

function setFilter(filter) {
  store.setTaskFilter("all");
  store.setTaskModuleFilter(filter);
}

function archiveDragOver(event) {
  if (![...event.dataTransfer.types].includes("text/task-id")) return;
  event.preventDefault();
  archiveOver.value = true;
}

function taskBoardDragOver(event) {
  if (![...event.dataTransfer.types].includes("text/task-id")) return;
  event.preventDefault();
  taskBoardOver.value = true;
}

function taskBoardDrop(event) {
  event.preventDefault();
  taskBoardOver.value = false;
  const taskId = event.dataTransfer.getData("text/task-id");
  const task = store.getTask(taskId);
  const moduleKey = task ? store.getTaskModule(task).key : "project";
  store.handleTaskDrop(taskId, "active", moduleKey, 0);
}

function archiveDrop(event) {
  event.preventDefault();
  archiveOver.value = false;
  const taskId = event.dataTransfer.getData("text/task-id");
  const task = store.getTask(taskId);
  const moduleKey = task ? store.getTaskModule(task).key : "project";
  store.handleTaskDrop(taskId, "archived", moduleKey, 0);
}
</script>

<template>
  <section class="flow-view animate__animated animate__fadeIn">
    <div class="board-layout">
      <section
        class="task-board"
        :class="{ 'is-task-board-drag-over': taskBoardOver }"
        @dragover="taskBoardDragOver"
        @dragleave="taskBoardOver = false"
        @drop="taskBoardDrop"
      >
        <div class="board-head">
          <h2>待完成任务列表</h2>
          <button class="board-create-task" type="button" title="新建流程任务" @click="emit('create-task')">+ 新建</button>
          <div class="segment-tabs department-tabs">
            <button :class="{ 'is-active': store.taskModuleFilter === 'all' }" @click="setFilter('all')">全部</button>
            <button v-for="module in taskModules" :key="module.key" :data-color="module.color" :class="{ 'is-active': store.taskModuleFilter === module.key }" @click="setFilter(module.key)">
              {{ module.label }}
            </button>
          </div>
        </div>

        <div class="task-scroll">
          <TaskModule v-for="group in activeByModule" :key="group.module.key" :module="group.module" :tasks="group.tasks" status="active" />
          <div v-if="!activeByModule.length" class="empty-state">{{ store.activeView === 'template' ? '当前模板还没有任务，点击新建添加自己的模板清单' : '当前没有待完成清单' }}</div>
        </div>
      </section>

      <aside
        class="archive-board"
        :class="{ 'is-archive-drag-over': archiveOver }"
        @dragover="archiveDragOver"
        @dragleave="archiveOver = false"
        @drop="archiveDrop"
      >
        <div class="board-head">
          <h2>已完成任务列表</h2>
          <button class="mini-action" @click="emit('clear-archive')">清理</button>
        </div>
        <div class="archive-scroll">
          <TaskModule v-for="group in archivedByModule" :key="group.module.key" :module="group.module" :tasks="group.tasks" status="archived" />
          <div v-if="store.activeView === 'template' || !store.archivedTasks.length" class="empty-state">
            {{ store.activeView === 'template' ? '模板任务完成后会显示在这里' : '把任务拖到这里会直接进入已完成任务列表' }}
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
