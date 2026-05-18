<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { askConfirm } from "@/utils/appDialog";
import ScheduleBoardView from "@/components/schedule/ScheduleBoardView.vue";
import ScheduleCreateDialog from "@/components/schedule/ScheduleCreateDialog.vue";
import ScheduleExportDialog from "@/components/schedule/ScheduleExportDialog.vue";
import ScheduleFloatingChat from "@/components/schedule/ScheduleFloatingChat.vue";
import ScheduleItemDetail from "@/components/schedule/ScheduleItemDetail.vue";
import ScheduleNodeView from "@/components/schedule/ScheduleNodeView.vue";
import ScheduleTimelineView from "@/components/schedule/ScheduleTimelineView.vue";
import ScheduleToolbar from "@/components/schedule/ScheduleToolbar.vue";

const emit = defineEmits([
  "create-schedule-task",
  "open-launcher",
  "open-profile",
  "open-admin",
  "logout",
  "change-password",
  "open-members"
]);

const store = useWorkspaceStore();
const createDialogOpen = ref(false);
const editDialogOpen = ref(false);
const exportDialogOpen = ref(false);
const editingItem = ref(null);

const activeViewComponent = computed(() => {
  if (store.scheduleUi.view === "board") return ScheduleBoardView;
  if (store.scheduleUi.view === "node") return ScheduleNodeView;
  return ScheduleTimelineView;
});

function toPlainExportValue(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

const exportPlan = computed(() => ({
  ...toPlainExportValue(store.schedulePlan, {}),
  projectName: store.activeProjectName || store.activeProject?.name || store.schedulePlan?.projectName || ""
}));

const exportItems = computed(() => toPlainExportValue(store.schedulePlan?.items, []));
const exportDependencies = computed(() => toPlainExportValue(store.schedulePlan?.dependencies, []));

const exportOptions = computed(() => ({
  viewMode: store.scheduleUi.view || "timeline",
  dayWidth: store.scheduleUi.dayWidth || store.schedulePlan?.viewConfig?.dayWidth || 28,
  rowHeight: store.scheduleUi.rowHeight || store.schedulePlan?.viewConfig?.rowHeight || 34
}));

const activeScheduleProjectKey = computed(() => {
  const project = store.activeProject || {};
  return [
    store.activeSection,
    store.activeProjectId,
    project.id,
    project.projectId,
    project.projectUid,
    project.project_id,
    project.project_uid,
    project.uid
  ]
    .map((value) => String(value ?? "").trim())
    .join("|");
});

function loadActiveProjectSchedule(options = {}) {
  if (store.activeSection !== "schedule") return false;
  return store.loadScheduleForActiveProject(options);
}

function openCreateDialog() {
  createDialogOpen.value = true;
}

function openExportDialog() {
  exportDialogOpen.value = true;
}

function openEditDialog(item) {
  editingItem.value = item;
  editDialogOpen.value = true;
}

function registerScheduleEdit(item) {
  openEditDialog(item);
}

function registerScheduleDelete(item) {
  return deleteItem(item);
}

async function deleteItem(item) {
  const itemId = item?.id || item?.itemId;
  if (!itemId) return;
  const ok = await askConfirm({
    title: "删除排期",
    message: `确认删除「${item.title || "未命名排期"}」吗？`,
    confirmButtonText: "删除",
    type: "warning"
  });
  if (ok) await store.deleteScheduleItem(itemId);
}

onMounted(() => {
  store.openScheduleEdit = registerScheduleEdit;
  store.confirmScheduleDelete = registerScheduleDelete;
  loadActiveProjectSchedule({ skipIfLoadingProject: true });
});

watch(
  activeScheduleProjectKey,
  () => {
    loadActiveProjectSchedule({ skipIfLoadingProject: true });
  },
  { flush: "post" }
);
</script>

<template>
  <section class="schedule-center animate__animated animate__fadeIn">
    <ScheduleToolbar
      @open-create="openCreateDialog"
      @open-export="openExportDialog"
      @delete-item="deleteItem"
    />
    <div class="schedule-center-content">
      <component :is="activeViewComponent" @edit="openEditDialog" @delete="deleteItem" />
      <ScheduleItemDetail class="schedule-detail-dock" @edit="openEditDialog" @delete="deleteItem" />
    </div>
    <ScheduleFloatingChat @open-members="emit('open-members')" />
    <ScheduleCreateDialog v-model="createDialogOpen" mode="create" />
    <ScheduleCreateDialog v-model="editDialogOpen" mode="edit" :item="editingItem" />
    <ScheduleExportDialog
      v-model="exportDialogOpen"
      :plan="exportPlan"
      :items="exportItems"
      :dependencies="exportDependencies"
      :export-options="exportOptions"
    />
  </section>
</template>
