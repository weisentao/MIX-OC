<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { scheduleColumns } from "@/data/seed";

const store = useWorkspaceStore();
const task = computed(() => store.selectedScheduleTask);
const module = computed(() => (task.value ? store.getTaskModule(task.value) : null));
const column = computed(() => scheduleColumns.find((item) => item.key === task.value?.scheduleStatus) || scheduleColumns[0]);
const collapsed = ref(false);
</script>

<template>
  <aside class="schedule-detail" :class="{ 'is-collapsed': collapsed }">
    <div v-if="!task" class="schedule-detail-empty">选择一个排期任务查看详情</div>
    <template v-else>
      <div class="schedule-detail-head">
        <span>任务详情</span>
        <button type="button" title="折叠" @click="collapsed = !collapsed">{{ collapsed ? "展开" : "收起" }}</button>
      </div>
      <template v-if="!collapsed">
        <h3>{{ task.title }}</h3>
        <p>{{ task.note }}</p>
        <dl>
          <dt>状态</dt>
          <dd>{{ column.label }}</dd>
          <dt>排期</dt>
          <dd>{{ task.startDate }} - {{ task.endDate }}</dd>
          <dt>负责人</dt>
          <dd>{{ task.owner }}</dd>
          <dt>工期</dt>
          <dd>{{ task.duration }} 天</dd>
          <dt>依赖任务</dt>
          <dd>{{ module.label }}确认后进入下一环节</dd>
          <dt>附件 / 评论</dt>
          <dd>{{ task.attachments || 0 }} 个附件 · {{ task.comments.length }} 条评论</dd>
        </dl>
        <div class="schedule-detail-comments">
          <span v-for="comment in task.comments.slice(0, 3)" :key="`${comment.time}-${comment.text}`">{{ comment.user }}：{{ comment.text }}</span>
          <span v-if="!task.comments.length">暂无评论</span>
        </div>
      </template>
    </template>
  </aside>
</template>
