<script setup>
import { Collection, Connection, DataLine } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();

const views = [
  { key: "timeline", label: "时间线模式", icon: DataLine },
  { key: "board", label: "看板模式", icon: Collection },
  { key: "node", label: "节点模式", icon: Connection }
];

function switchView(view) {
  store.setScheduleUiView(view);
}
</script>

<template>
  <div class="schedule-view-tabs" aria-label="排期视图切换">
    <button
      v-for="view in views"
      :key="view.key"
      type="button"
      :class="{ 'is-active': store.scheduleUi.view === view.key }"
      @click="switchView(view.key)"
    >
      <component :is="view.icon" aria-hidden="true" />
      <span>{{ view.label }}</span>
    </button>
  </div>
</template>
