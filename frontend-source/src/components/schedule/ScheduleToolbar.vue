<script setup>
import { Check, Clock, Delete, DocumentAdd, MoreFilled, Share, Upload } from "@element-plus/icons-vue";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import ScheduleViewTabs from "./ScheduleViewTabs.vue";

const emit = defineEmits(["open-create", "open-export", "delete-item"]);
const store = useWorkspaceStore();
const moreOpen = ref(false);
const moreButtonRef = ref(null);
const menuRef = ref(null);
const menuPosition = reactive({ top: 0, left: 0 });

const departmentOptions = [
  { label: "全部", value: "全部" },
  { label: "项目管理", value: "project" },
  { label: "美术设计", value: "design" },
  { label: "三维动态设计部", value: "threeD" },
  { label: "视效包装", value: "post" }
];
const selectedItem = computed(() => {
  const itemId = store.scheduleUi?.selectedItemId;
  return (store.schedulePlan?.items || []).find((entry) => entry.id === itemId || entry.itemId === itemId) || null;
});
const selectedItemTitle = computed(() => selectedItem.value?.title || "");
const selectedDepartmentValue = computed(() => store.scheduleUi?.departmentFilter || "全部");

function selectDepartment(department) {
  store.setScheduleDepartmentFilter(department);
}

async function confirmSelected() {
  await store.confirmSelectedScheduleItem();
}

function closeMore() {
  moreOpen.value = false;
}

function createSnapshot() {
  store.createLocalScheduleSnapshot("toolbar");
  closeMore();
}

function updateMenuPosition() {
  const buttonRect = moreButtonRef.value?.getBoundingClientRect();
  if (!buttonRect) return;
  const menuWidth = menuRef.value?.offsetWidth || 176;
  const menuHeight = menuRef.value?.offsetHeight || 216;
  const viewportHeight = window.innerHeight;
  const gap = 8;
  const preferredTop = buttonRect.bottom + gap;
  menuPosition.top = Math.max(8, Math.min(preferredTop, viewportHeight - menuHeight - 8));
  menuPosition.left = Math.max(8, Math.min(buttonRect.right - menuWidth, window.innerWidth - menuWidth - 8));
}

async function toggleMore() {
  moreOpen.value = !moreOpen.value;
  if (moreOpen.value) {
    await nextTick();
    updateMenuPosition();
  }
}

function setView(view) {
  store.setScheduleUiView(view);
  closeMore();
  store.showToast(view === "board" ? "已切换到看板模式" : "已切换到节点模式");
}

function shareSchedule() {
  emit("open-export");
  closeMore();
}

function importScheduleTemplate() {
  store.applyFirstScheduleTemplateToActiveProject();
  closeMore();
}

function saveScheduleTemplate() {
  store.saveCurrentScheduleAsTemplate();
  closeMore();
}

function deleteSelectedItem() {
  if (!selectedItem.value) {
    store.showToast("请先选择要删除的排期");
    closeMore();
    return;
  }
  emit("delete-item", selectedItem.value);
  closeMore();
}

function handleDocumentPointerDown(event) {
  if (!moreOpen.value) return;
  const target = event.target;
  if (moreButtonRef.value?.contains(target) || menuRef.value?.contains(target)) return;
  closeMore();
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.addEventListener("resize", updateMenuPosition);
  window.addEventListener("scroll", updateMenuPosition, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  window.removeEventListener("resize", updateMenuPosition);
  window.removeEventListener("scroll", updateMenuPosition, true);
});
</script>

<template>
  <div class="schedule-center-toolbar">
    <div class="schedule-toolbar-main">
      <div class="schedule-toolbar-title">
        <strong>项目排期</strong>
        <div class="schedule-toolbar-icon-group" aria-label="排期工具">
          <button type="button" title="新建排期" @click="emit('open-create')">
            <DocumentAdd aria-hidden="true" />
          </button>
          <button type="button" title="导入排期模板" @click="importScheduleTemplate">
            <Upload aria-hidden="true" />
          </button>
          <button type="button" :title="selectedItemTitle ? `确认：${selectedItemTitle}` : '确认当前排期'" @click="confirmSelected">
            <Check aria-hidden="true" />
          </button>
          <button type="button" title="创建本地快照" @click="createSnapshot">
            <Clock aria-hidden="true" />
          </button>
          <button type="button" title="分享排期" data-testid="schedule-export-open" @click="shareSchedule">
            <Share aria-hidden="true" />
          </button>
          <div class="schedule-toolbar-more">
            <button ref="moreButtonRef" type="button" title="更多功能" :aria-expanded="moreOpen ? 'true' : 'false'" @click="toggleMore">
              <MoreFilled class="schedule-more-icon" aria-hidden="true" />
            </button>
            <Teleport to="body">
              <div
                v-if="moreOpen"
                ref="menuRef"
                class="schedule-toolbar-menu"
                role="menu"
                :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }"
              >
                <button type="button" role="menuitem" @click="shareSchedule">分享排期</button>
                <button type="button" role="menuitem" @click="saveScheduleTemplate">保存为排期模板</button>
                <button type="button" role="menuitem" @click="createSnapshot">创建本地快照</button>
                <button type="button" role="menuitem" @click="setView('board')">切到看板模式</button>
                <button type="button" role="menuitem" @click="setView('node')">切到节点模式</button>
                <button type="button" role="menuitem" class="is-danger" :disabled="!selectedItem" @click="deleteSelectedItem">
                  <Delete aria-hidden="true" />
                  删除排期
                </button>
              </div>
            </Teleport>
          </div>
        </div>
      </div>

      <div class="schedule-department-pills" aria-label="部门筛选">
        <button
          v-for="department in departmentOptions"
          :key="department.value"
          type="button"
          :class="{ 'is-active': selectedDepartmentValue === department.value }"
          :data-department="department.label"
          @click="selectDepartment(department.value)"
        >
          {{ department.label }}
        </button>
      </div>
    </div>

    <div class="schedule-toolbar-right">
      <ScheduleViewTabs />
    </div>
  </div>
</template>

<style scoped>
.schedule-department-pills button:not(.is-active)[data-department="三维动态设计部"] {
  border-color: rgba(183, 107, 214, 0.4);
}

.schedule-department-pills button:not(.is-active)[data-department="视效包装"] {
  border-color: rgba(88, 169, 213, 0.42);
}

.schedule-toolbar-menu {
  max-height: calc(100vh - 16px);
  overflow-y: auto;
}
</style>
