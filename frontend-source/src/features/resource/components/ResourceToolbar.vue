<script setup>
import { computed } from "vue";

const props = defineProps({
  activeView: { type: String, default: "person" },
  mode: { type: String, default: "timeline" },
  query: { type: String, default: "" },
  permissions: { type: Object, default: () => ({}) },
  stats: { type: Object, default: () => ({}) },
  activeStatsFilter: { type: String, default: "all" },
  selectedPerson: { type: Object, default: null },
  activeDepartment: { type: Object, default: null },
  completion: { type: Object, default: null }
});

const emit = defineEmits(["setMode", "updateQuery", "openAssignment", "clearCompletion", "setStatsFilter"]);

const scopeType = computed(() => props.permissions?.scope?.type || "self");

const modeEntries = computed(() => {
  const entries = [{ key: "timeline", label: "时间线模式" }];
  if (props.permissions?.canViewDepartmentView) entries.push({ key: "department", label: "部门模式" });
  entries.push({ key: "person", label: "个人模式" });
  if (props.permissions?.canViewConflictRisk) entries.push({ key: "conflict", label: "冲突模式" });
  if (scopeType.value !== "self") entries.push({ key: "node", label: "节点模式" });
  return entries;
});

const toolbarTitle = computed(() => {
  if (props.mode === "node") return "人力节点视图";
  if (props.mode === "department") return `${props.activeDepartment?.name || "部门"} · 人力视图`;
  if (props.mode === "person") return `${props.selectedPerson?.name || "个人"} · 个人视角`;
  if (props.activeView === "completed") return "交互完成态";
  return "人力排期";
});

const toolbarSubtitle = computed(() => {
  if (scopeType.value === "self") return "普通个人只展示本人任务、本人空闲窗口和个人沟通记录。";
  if (props.mode === "conflict") return "优先展示超负荷、冲突任务和需要二次确认的分配风险。";
  if (props.mode === "node") return "用节点关系查看任务从项目经理流向人员的过程。";
  return "查看谁在做什么、谁有空，以及新任务应该优先给谁。";
});

function updateQuery(event) {
  emit("updateQuery", event.target.value);
}

function setStatsFilter(filter) {
  emit("setStatsFilter", filter);
}

function isStatsFilterActive(filter) {
  return props.activeStatsFilter === filter;
}
</script>

<template>
  <header class="resource-toolbar">
    <div class="resource-toolbar-heading">
      <span>首页 · 项目可视化</span>
      <h2>{{ toolbarTitle }}</h2>
      <p>{{ toolbarSubtitle }}</p>
    </div>

    <div class="resource-toolbar-actions">
      <label class="resource-toolbar-search">
        <span class="resource-sr-only">搜索人员、项目、空闲时间</span>
        <input
          :value="query"
          type="search"
          :placeholder="scopeType === 'self' ? '搜索我的任务' : '搜索人员 / 项目 / 空闲时间'"
          @input="updateQuery"
        />
      </label>

      <div class="resource-mode-switch" aria-label="人力模式切换">
        <button
          v-for="entry in modeEntries"
          :key="entry.key"
          type="button"
          class="resource-mode-button"
          :class="{ 'is-active': mode === entry.key }"
          @click="emit('setMode', entry.key)"
        >
          {{ entry.label }}
        </button>
      </div>

      <button
        v-if="permissions.canCreateAssignmentPreview"
        type="button"
        class="resource-assignment-open"
        @click="emit('openAssignment')"
      >
        查找可分配人员
      </button>
    </div>

    <div class="resource-toolbar-summary" aria-label="人力统计">
      <button
        type="button"
        class="resource-stat-card"
        :class="{ 'is-active': isStatsFilterActive('all') }"
        :aria-pressed="isStatsFilterActive('all')"
        @click="setStatsFilter('all')"
      >
        <span>全员</span>
        <strong>{{ stats.totalPeople || 0 }}</strong>
        <small>活跃</small>
      </button>
      <button
        type="button"
        class="resource-stat-card is-risk"
        :class="{ 'is-active': isStatsFilterActive('overload') }"
        :aria-pressed="isStatsFilterActive('overload')"
        @click="setStatsFilter('overload')"
      >
        <span>超负荷</span>
        <strong>{{ stats.overloadCount || 0 }}</strong>
        <small>需调整</small>
      </button>
      <button
        type="button"
        class="resource-stat-card is-warning"
        :class="{ 'is-active': isStatsFilterActive('unassigned') }"
        :aria-pressed="isStatsFilterActive('unassigned')"
        @click="setStatsFilter('unassigned')"
      >
        <span>无人负责</span>
        <strong>{{ stats.unassignedCount || 0 }}</strong>
        <small>待指派</small>
      </button>
      <button
        type="button"
        class="resource-stat-card is-ok"
        :class="{ 'is-active': isStatsFilterActive('available') }"
        :aria-pressed="isStatsFilterActive('available')"
        @click="setStatsFilter('available')"
      >
        <span>今日空闲</span>
        <strong>{{ stats.availableCount || 0 }}</strong>
        <small>可接活</small>
      </button>
    </div>

    <section v-if="completion" class="resource-completion-strip" aria-label="分配完成态">
      <strong>分配完成</strong>
      <span>{{ completion.taskTitle }} 已写入 {{ completion.personName }} 时间轴</span>
      <button type="button" @click="emit('clearCompletion')">收起</button>
    </section>
  </header>
</template>
