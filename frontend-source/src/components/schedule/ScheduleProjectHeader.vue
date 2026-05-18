<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { MoreFilled, Plus, Share, User } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { askConfirm } from "@/utils/appDialog";
import ScheduleMemberAvatars from "./ScheduleMemberAvatars.vue";

const emit = defineEmits(["open-create", "open-export", "open-members"]);
const store = useWorkspaceStore();
const activePanel = ref("");
const headerRef = ref(null);

const plan = computed(() => store.schedulePlan || {});
const summary = computed(() => plan.value.summary || {});
const projectName = computed(() => store.activeProjectName || store.activeProject?.name || "未选择项目");
const dateRange = computed(() => {
  if (!plan.value.startDate || !plan.value.endDate) return "暂无日期范围";
  return `${plan.value.startDate} - ${plan.value.endDate}`;
});
const members = computed(() => store.activeMembersDetailed || []);

function closePanel() {
  activePanel.value = "";
}

function togglePanel(name) {
  activePanel.value = activePanel.value === name ? "" : name;
}

function openCreate() {
  closePanel();
  emit("open-create");
}

function openExportPreview() {
  closePanel();
  emit("open-export");
}

function handleDocumentPointerDown(event) {
  if (!activePanel.value) return;
  if (headerRef.value?.contains(event.target)) return;
  closePanel();
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});
</script>

<template>
  <section ref="headerRef" class="schedule-project-header">
    <div class="schedule-project-info">
      <div class="schedule-project-name">
        <span>项目名称</span>
        <strong>{{ projectName }}</strong>
      </div>

      <div class="schedule-project-meta">
        <span>项目管理: 木头 / {{ dateRange }}</span>
        <em>严谨</em>
        <em class="is-green">非常准</em>
        <em class="is-yellow">容易忘记</em>
      </div>

      <div class="schedule-project-summary" aria-label="排期统计">
        <span><strong>{{ summary.itemCount || 0 }}</strong>项环节排期</span>
        <span><strong>{{ summary.pendingCount || 0 }}</strong>项待完成 / <strong>{{ summary.doneCount || 0 }}</strong>项已完成</span>
      </div>
    </div>

    <div class="schedule-project-members">
      <User aria-hidden="true" />
      <ScheduleMemberAvatars @open-members="emit('open-members')" />
      <div class="schedule-project-popover-wrap">
        <button type="button" title="更多成员" aria-label="更多成员" @click="togglePanel('members')"><MoreFilled aria-hidden="true" /></button>
        <section v-if="activePanel === 'members'" class="schedule-project-popover is-member-list" aria-label="成员列表">
          <strong>项目成员</strong>
          <p v-if="!members.length">暂无项目成员</p>
          <button v-for="member in members" :key="member.id || member.name" type="button" @click="store.showToast(`${member.name} · ${store.roleLabel(member.role)}`)">
            <span>{{ member.avatar || String(member.name).slice(0, 1) }}</span>
            <em>{{ member.name }}</em>
            <small>{{ store.roleLabel(member.role) }}</small>
          </button>
        </section>
      </div>
    </div>

    <div class="schedule-project-icon-tray" aria-label="项目操作">
      <button type="button" title="新增排期" aria-label="新增排期" @click="openCreate"><Plus aria-hidden="true" /></button>
      <button type="button" title="分享排期" aria-label="分享排期" @click="openExportPreview"><Share aria-hidden="true" /></button>
    </div>
  </section>
</template>
