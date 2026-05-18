<script setup>
import { computed } from "vue";

const props = defineProps({
  person: { type: Object, default: null },
  workItems: { type: Array, default: () => [] },
  availability: { type: Array, default: () => [] },
  suggestions: { type: Array, default: () => [] },
  canAssign: { type: Boolean, default: false },
  canCare: { type: Boolean, default: false },
  isCare: { type: Boolean, default: false },
  completion: { type: Object, default: null }
});

const emit = defineEmits(["close", "openAssignment", "requestAlternative", "toggleCare"]);

const personItems = computed(() => {
  if (!props.person) return [];
  return props.workItems.filter((item) => item.personId === props.person.id);
});

const personAvailability = computed(() => {
  if (!props.person) return [];
  return props.availability.filter((item) => item.personId === props.person.id);
});

function stablePanelItemKey(prefix, item = {}, index = 0) {
  return [
    prefix,
    item.source,
    item.projectId,
    item.scheduleItemId,
    item.itemId,
    item.workItemId,
    item.taskUid,
    item.taskId,
    item.id,
    index
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("-");
}

const loadLevel = computed(() => {
  const load = Number(props.person?.load || 0);
  if (load >= 100) return "risk";
  if (load >= 85) return "warning";
  return "ok";
});

const heatmapSlots = computed(() => {
  const activeSlots = [
    ...personItems.value.map((item, index) => ({
      id: stablePanelItemKey("task", item, index),
      status: item.status || "normal",
      title: `${item.title} ${item.startDate}-${item.endDate}`
    })),
    ...personAvailability.value.map((item, index) => ({
      id: stablePanelItemKey("free", item, index),
      status: "free",
      title: `${item.label || ""} ${item.startDate}-${item.endDate}`
    }))
  ].slice(0, 12);

  return Array.from({ length: 12 }, (_, index) => activeSlots[index] || {
    id: `empty-${props.person?.id || "person"}-${index}`,
    status: "empty",
    title: ""
  });
});

const suggestionMessages = computed(() => {
  return props.suggestions
    .filter(Boolean)
    .slice(0, 3)
    .map((text, index) => ({
      id: `suggestion-${index}`,
      side: index === 0 ? "ai" : "system",
      text
    }));
});

const chatMessages = computed(() => {
  if (!props.person) return [];
  if (suggestionMessages.value.length) return suggestionMessages.value;
  if (loadLevel.value === "risk") {
    return [
      { id: "risk", side: "system", text: `当前 ${props.person.load}% ，已有 ${personItems.value.length} 个高优任务` },
      { id: "ask", side: "manager", text: "这个活动还能不能排给她？" },
      { id: "answer", side: "ai", text: "不建议。建议查看智能推荐候选人后再调整。" },
      { id: "self", side: "person", text: "我只能做半天复核。" }
    ];
  }
  return [
    { id: "ok", side: "system", text: `${props.person.name} 当前负载 ${props.person.load}%` },
    { id: "ask", side: "manager", text: "可以承接新任务吗？" },
    { id: "answer", side: "ai", text: props.person.recommendation || "可以安排，但请避开已有评审节点。" }
  ];
});
</script>

<template>
  <aside v-if="person" class="resource-person-panel" :class="`is-${loadLevel}`" aria-label="人员详情和沟通建议">
    <button type="button" class="resource-panel-close" aria-label="关闭人员详情" @click="emit('close')">×</button>

    <header class="resource-person-panel-head">
      <span class="resource-avatar" :class="`is-${person.tone || 'green'}`">{{ person.avatar }}</span>
      <div>
        <h3>{{ person.name }}</h3>
        <p>{{ person.departmentName }} / {{ person.roleTitle }}</p>
      </div>
      <strong class="resource-load-number">{{ person.load }}%</strong>
    </header>

    <section class="resource-person-metrics" aria-label="个人负载">
      <article>
        <span>当前任务</span>
        <strong>{{ personItems.length }}</strong>
      </article>
      <article>
        <span>空闲窗口</span>
        <strong>{{ personAvailability.length }}</strong>
      </article>
      <article>
        <span>风险</span>
        <strong>{{ loadLevel === "risk" ? "高" : loadLevel === "warning" ? "中" : "低" }}</strong>
      </article>
    </section>

    <section class="resource-heatmap" aria-label="负载日历">
      <span
        v-for="slot in heatmapSlots"
        :key="slot.id"
        class="resource-heatmap-cell"
        :class="`is-${slot.status}`"
        :title="slot.title"
      ></span>
    </section>

    <section class="resource-person-task-list" aria-label="当前任务列表">
      <h4>当前任务</h4>
      <article v-for="(item, index) in personItems" :key="stablePanelItemKey('person-task', item, index)" class="resource-person-task" :class="`is-${item.status || 'normal'}`">
        <strong>{{ item.title }}</strong>
        <span>{{ item.project }} · {{ item.startDate }} - {{ item.endDate }}</span>
      </article>
      <p v-if="!personItems.length" class="resource-person-empty">暂无当前任务，可查看空闲窗口或安排新任务。</p>
    </section>

    <section class="resource-chat-suggestion" aria-label="聊天建议">
      <h4>沟通建议</h4>
      <p v-for="message in chatMessages" :key="message.id" :class="`is-${message.side}`">{{ message.text }}</p>
    </section>

    <section class="resource-person-actions" aria-label="人员动作">
      <button v-if="canAssign" type="button" @click="emit('openAssignment', person)">安排任务</button>
      <button v-if="loadLevel === 'risk' && canAssign" type="button" @click="emit('requestAlternative', person)">智能推荐候选人</button>
      <button v-if="canCare" type="button" @click="emit('toggleCare', person)">{{ isCare ? "取消关心" : "关心" }}</button>
    </section>

    <section v-if="completion?.personId === person.id" class="resource-person-completion">
      <strong>写入完成</strong>
      <span>{{ completion.taskTitle }} 已同步到该人员时间轴</span>
    </section>
  </aside>
</template>
