<script setup>
import { computed } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const emit = defineEmits(["edit", "delete"]);
const store = useWorkspaceStore();

const selectedItem = computed(() => {
  const selectedId = store.scheduleUi?.selectedItemId;
  if (!selectedId) return null;
  return (store.schedulePlan?.items || []).find((item) => item.id === selectedId || item.itemId === selectedId) || null;
});

function statusLabel(status) {
  const value = String(status || "todo").toLowerCase();
  if (["done", "completed", "complete"].includes(value)) return "已完成";
  if (["risk", "blocked", "delay", "delayed", "overdue"].includes(value)) return "风险延期";
  if (["doing", "progress", "in_progress", "review", "active"].includes(value)) return "进行中";
  if (["todo", "pending", "planned", "new"].includes(value)) return "待排期";
  return "待处理";
}

function syncStatusLabel(status) {
  const value = String(status || "synced").toLowerCase();
  if (["failed", "error"].includes(value)) return "同步失败";
  if (["pending", "local", "saving"].includes(value)) return "等待同步";
  return "已同步";
}

const fields = computed(() => {
  const item = selectedItem.value;
  if (!item) return [];
  return [
    { label: "部门", value: item.module || "未分组" },
    { label: "负责人", value: item.owner || "未设置" },
    { label: "日期范围", value: `${item.startDate || "-"} - ${item.endDate || "-"}` },
    { label: "状态", value: statusLabel(item.status) },
    { label: "进度", value: `${Number(item.progress || 0)}%` },
    { label: "关联任务", value: item.taskUid ? "已绑定任务" : "未绑定任务" },
    { label: "同步状态", value: syncStatusLabel(item.payload?.syncStatus) }
  ];
});

const note = computed(() => selectedItem.value?.payload?.note || selectedItem.value?.note || "暂无备注");
</script>

<template>
  <aside class="schedule-item-detail">
    <div v-if="!selectedItem" class="schedule-item-detail-empty">
      <strong>选择排期查看详情</strong>
      <p>点击时间线条后，可在这里编辑或删除排期。</p>
    </div>

    <template v-else>
      <header class="schedule-item-detail-head">
        <div>
          <span>排期详情</span>
          <h3>{{ selectedItem.title || "未命名排期" }}</h3>
        </div>
        <div class="schedule-item-detail-actions">
          <button type="button" @click="emit('edit', selectedItem)">编辑</button>
          <button class="is-danger" type="button" @click="emit('delete', selectedItem)">删除</button>
        </div>
      </header>

      <dl class="schedule-item-detail-list">
        <div v-for="field in fields" :key="field.label">
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
      </dl>

      <section class="schedule-item-detail-note">
        <span>备注</span>
        <p>{{ note }}</p>
      </section>
    </template>
  </aside>
</template>
