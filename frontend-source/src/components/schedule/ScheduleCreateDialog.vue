<script setup>
import { computed, reactive, watch } from "vue";
import { Close } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { clampDateRange, formatSlashDate } from "@/utils/schedule/dateRange.js";

const props = defineProps({
  modelValue: Boolean,
  mode: {
    type: String,
    default: "create"
  },
  item: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(["update:modelValue", "created", "updated"]);
const store = useWorkspaceStore();

const scheduleDepartmentTree = [
  { key: "project", value: "project", label: "项目管理", color: "red", children: [] },
  { key: "aigc", value: "aigc", label: "AIGC", color: "yellow", children: [] },
  {
    key: "design",
    value: "design",
    label: "美术设计",
    color: "green",
    children: [
      { key: "design-1", value: "design-1", label: "美术设计一部", color: "green" },
      { key: "design-2", value: "design-2", label: "美术设计二部", color: "green" }
    ]
  },
  { key: "threeD", value: "threeD", label: "三维动态设计部", color: "purple", children: [] },
  { key: "motion", value: "motion", label: "动效设计", color: "pink", children: [] },
  {
    key: "post",
    value: "post",
    label: "视效包装",
    color: "blue",
    children: [
      { key: "post-1", value: "post-1", label: "视效包装一部", color: "blue" },
      { key: "post-2", value: "post-2", label: "视效包装二部", color: "blue" },
      { key: "post-3", value: "post-3", label: "视效包装三部", color: "blue" }
    ]
  }
];

const form = reactive({
  title: "",
  module: "project",
  startDate: "",
  endDate: ""
});

const departmentTreeOpen = reactive({
  design: true,
  post: true
});

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const isEdit = computed(() => props.mode === "edit");
const dialogTitle = computed(() => (isEdit.value ? "修改排期" : "创建排期"));
const titleFieldLabel = computed(() => (isEdit.value ? "修改排期环节标题" : "创建排期环节标题"));
const submitLabel = computed(() => (isEdit.value ? "确定修改" : "确定"));
const canSubmit = computed(() => Boolean(form.title.trim() && form.module && form.startDate && form.endDate));
const scheduleDepartmentSelectionOptions = computed(() => {
  if (!isEdit.value || !form.module || hasDepartmentValue(scheduleDepartmentTree, form.module)) {
    return scheduleDepartmentTree;
  }

  return [
    ...scheduleDepartmentTree,
    { key: form.module, value: form.module, label: `当前旧部门：${form.module}`, color: "gray", children: [] }
  ];
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset();
  }
);

watch(
  () => props.item,
  () => {
    if (props.modelValue) reset();
  }
);

function toInputDate(value) {
  return String(value || "").replaceAll("/", "-");
}

function todayInputDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function reset() {
  if (isEdit.value && props.item) {
    form.title = props.item.title || "";
    form.module = props.item.module || "project";
    form.startDate = toInputDate(props.item.startDate) || todayInputDate();
    form.endDate = toInputDate(props.item.endDate) || form.startDate;
    resetDepartmentTreeOpen();
    expandSelectedDepartmentPath();
    return;
  }

  const start = toInputDate(store.schedulePlan?.startDate || store.activeProject?.startDate) || todayInputDate();
  form.title = "";
  form.module = "project";
  form.startDate = start;
  form.endDate = start;
  resetDepartmentTreeOpen();
}

function resetDepartmentTreeOpen() {
  departmentTreeOpen.design = true;
  departmentTreeOpen.post = true;
}

function hasDepartmentValue(nodes, value) {
  return nodes.some((node) => node.value === value || hasDepartmentValue(node.children || [], value));
}

function expandSelectedDepartmentPath() {
  scheduleDepartmentTree.forEach((node) => {
    if ((node.children || []).some((child) => isDepartmentSelected(child))) {
      departmentTreeOpen[node.key] = true;
    }
  });
}

function isDepartmentOpen(node) {
  return Boolean(departmentTreeOpen[node.key]);
}

function toggleDepartmentNode(key) {
  departmentTreeOpen[key] = !departmentTreeOpen[key];
}

function selectDepartmentNode(node) {
  form.module = node.value;
  if ((node.children || []).length) {
    departmentTreeOpen[node.key] = true;
  }
}

function isDepartmentSelected(node) {
  return form.module === node.value;
}

function hasSelectedChild(node) {
  return (node.children || []).some((child) => isDepartmentSelected(child));
}

function departmentChildrenId(node) {
  return `schedule-department-children-${node.key}`;
}

function close() {
  visible.value = false;
}

async function submit() {
  if (!form.title.trim()) {
    store.showToast("排期标题不能为空");
    return;
  }
  if (!form.module) {
    store.showToast("部门不能为空");
    return;
  }
  if (!form.startDate || !form.endDate) {
    store.showToast("开始日期和结束日期不能为空");
    return;
  }

  const range = clampDateRange(formatSlashDate(form.startDate), formatSlashDate(form.endDate));
  if (!range.startDate || !range.endDate) {
    store.showToast("日期格式不正确");
    return;
  }

  const payload = {
    title: form.title.trim(),
    module: form.module,
    startDate: range.startDate,
    endDate: range.endDate
  };

  const itemId = props.item?.id || props.item?.itemId;
  const item = isEdit.value && itemId
    ? await store.updateScheduleItem(itemId, payload)
    : await store.createScheduleItemFromPayload(payload);

  if (item) {
    emit(isEdit.value ? "updated" : "created", item);
    close();
    reset();
  }
}
</script>

<template>
  <el-dialog v-model="visible" class="modal-shell schedule-create-modal-shell" width="min(640px, calc(100vw - 32px))" :show-close="false" @open="reset">
    <form class="modal-card schedule-create-card" @submit.prevent="submit">
      <div class="modal-head schedule-create-head">
        <h3>{{ dialogTitle }}</h3>
        <button class="schedule-create-close" type="button" aria-label="关闭排期弹窗" title="关闭排期弹窗" @click="close">
          <Close aria-hidden="true" />
        </button>
      </div>

      <div class="schedule-title-row">
        <label class="schedule-title-field">
          <span>{{ titleFieldLabel }}</span>
          <input v-model.trim="form.title" required maxlength="60" :placeholder="titleFieldLabel" />
        </label>
        <button class="schedule-create-action schedule-create-action--save" type="submit" :disabled="!canSubmit">{{ submitLabel }}</button>
      </div>

      <fieldset class="schedule-department-field">
        <legend>所属部门</legend>
        <div class="schedule-department-tree" role="tree" aria-label="所属部门">
          <div
            v-for="node in scheduleDepartmentSelectionOptions"
            :key="node.key"
            class="schedule-department-node"
            :class="{ 'has-children': node.children.length, 'has-selected-child': hasSelectedChild(node) }"
          >
            <div class="schedule-department-row">
              <button
                v-if="node.children.length"
                class="schedule-department-toggle"
                :class="{ 'is-open': isDepartmentOpen(node) }"
                type="button"
                :aria-label="`${isDepartmentOpen(node) ? '收起' : '展开'}${node.label}`"
                :aria-expanded="isDepartmentOpen(node)"
                :aria-controls="departmentChildrenId(node)"
                @click="toggleDepartmentNode(node.key)"
              >
                <span class="schedule-department-toggle-icon" aria-hidden="true"></span>
              </button>
              <span v-else class="schedule-department-spacer" aria-hidden="true"></span>
              <label
                class="schedule-department-tree-option"
                :class="{ 'is-selected': isDepartmentSelected(node) }"
                :data-color="node.color"
                role="treeitem"
                :aria-level="1"
                :aria-selected="isDepartmentSelected(node)"
                :aria-expanded="node.children.length ? isDepartmentOpen(node) : undefined"
                :aria-controls="node.children.length ? departmentChildrenId(node) : undefined"
                @click="selectDepartmentNode(node)"
              >
                <input :checked="isDepartmentSelected(node)" required type="radio" name="schedule-department" :value="node.value" @change="selectDepartmentNode(node)" />
                <span class="schedule-department-mark" aria-hidden="true"></span>
                <span class="schedule-department-copy">
                  <span>{{ node.label }}</span>
                </span>
              </label>
            </div>
            <div v-if="node.children.length && isDepartmentOpen(node)" :id="departmentChildrenId(node)" class="schedule-department-children" role="group">
              <label
                v-for="child in node.children"
                :key="child.key"
                class="schedule-department-tree-option schedule-department-child"
                :class="{ 'is-selected': isDepartmentSelected(child) }"
                :data-color="child.color"
                role="treeitem"
                :aria-level="2"
                :aria-selected="isDepartmentSelected(child)"
              >
                <input v-model="form.module" required type="radio" name="schedule-department" :value="child.value" />
                <span class="schedule-department-mark" aria-hidden="true"></span>
                <span class="schedule-department-copy">
                  <span>{{ child.label }}</span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </fieldset>

      <div class="schedule-date-range">
        <label>
          <span>开始日期</span>
          <input v-model="form.startDate" required type="date" />
        </label>
        <label>
          <span>结束日期</span>
          <input v-model="form.endDate" required type="date" />
        </label>
      </div>

      <div class="modal-actions schedule-create-actions">
        <button class="schedule-create-action schedule-create-action--cancel" type="button" @click="close">取消</button>
      </div>
    </form>
  </el-dialog>
</template>

<style scoped>
:deep(.schedule-create-modal-shell .el-dialog__body) {
  padding: 0;
}

.schedule-create-card {
  gap: 18px;
  padding: 22px;
  border: 1px solid #d6dce4;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 14px 32px rgba(30, 43, 67, 0.1);
}

.schedule-create-head {
  align-items: center;
  padding-bottom: 2px;
}

.schedule-create-head h3 {
  margin: 0;
}

.schedule-create-close {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #d9dee5;
  border-radius: 8px;
  color: #667085;
  background: #ffffff;
  cursor: pointer;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.schedule-create-close svg {
  width: 16px;
  height: 16px;
  transition: transform 0.18s ease;
}

.schedule-create-close:hover {
  color: #2f3a4c;
  border-color: #bfc7d1;
  background: #f7f9fc;
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.08);
  transform: translateY(-1px);
}

.schedule-create-close:active {
  transform: translateY(0);
}

.schedule-create-close:focus-visible {
  outline: 2px solid rgba(45, 155, 232, 0.28);
  outline-offset: 2px;
}

.schedule-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.schedule-title-field,
.schedule-date-range label {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: #344054;
  font-size: 13px;
  font-weight: 800;
}

.schedule-title-field input,
.schedule-date-range input {
  width: 100%;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #d6dce4;
  border-radius: 8px;
  color: #1f2937;
  background: #ffffff;
  font: inherit;
  font-weight: 700;
  outline: none;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.schedule-title-field input:focus,
.schedule-date-range input:focus {
  border-color: #69aee5;
  box-shadow: 0 0 0 3px rgba(45, 155, 232, 0.14);
}

.schedule-department-field {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 0;
  border: 0;
}

.schedule-department-field legend {
  padding: 0;
  color: #344054;
  font-size: 13px;
  font-weight: 800;
}

.schedule-department-tree {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #dfe7ef;
  border-radius: 8px;
  background: #f8fafc;
}

.schedule-department-node {
  min-width: 0;
}

.schedule-department-node.has-children {
  grid-row: span 3;
}

.schedule-department-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
}

.schedule-department-toggle,
.schedule-department-spacer {
  width: 20px;
  height: 34px;
}

.schedule-department-toggle {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: #697586;
  background: transparent;
  cursor: pointer;
}

.schedule-department-toggle:hover {
  color: #344054;
  background: #eef2f6;
}

.schedule-department-toggle:focus-visible {
  outline: 2px solid rgba(45, 155, 232, 0.28);
  outline-offset: 2px;
}

.schedule-department-toggle-icon {
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.18s ease;
}

.schedule-department-toggle.is-open .schedule-department-toggle-icon {
  transform: rotate(45deg);
}

.schedule-department-node.has-selected-child .schedule-department-toggle {
  color: var(--schedule-department-accent, #2d9be8);
}

.schedule-department-tree-option {
  --schedule-department-accent: #7b8794;
  --schedule-department-soft: #f4f6f8;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #d8dee7;
  border-radius: 8px;
  color: #344054;
  background: #ffffff;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.schedule-department-tree-option[data-color="red"] {
  --schedule-department-accent: #ee777a;
  --schedule-department-soft: #fff2f3;
}

.schedule-department-tree-option[data-color="yellow"] {
  --schedule-department-accent: #f4b321;
  --schedule-department-soft: #fff9e8;
}

.schedule-department-tree-option[data-color="green"] {
  --schedule-department-accent: #65b878;
  --schedule-department-soft: #f0fbf3;
}

.schedule-department-tree-option[data-color="purple"] {
  --schedule-department-accent: #bc7ad2;
  --schedule-department-soft: #fbf1ff;
}

.schedule-department-tree-option[data-color="pink"] {
  --schedule-department-accent: #e778a3;
  --schedule-department-soft: #fff2f7;
}

.schedule-department-tree-option[data-color="blue"] {
  --schedule-department-accent: #5ca9d7;
  --schedule-department-soft: #eff8fd;
}

.schedule-department-tree-option[data-color="gray"] {
  --schedule-department-accent: #98a2b3;
  --schedule-department-soft: #f2f4f7;
}

.schedule-department-tree-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.schedule-department-mark {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--schedule-department-accent);
}

.schedule-department-copy {
  display: grid;
  min-width: 0;
}

.schedule-department-copy span {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-department-tree-option:hover {
  border-color: color-mix(in srgb, var(--schedule-department-accent) 34%, #d8dee7);
  background: color-mix(in srgb, var(--schedule-department-soft) 62%, #ffffff);
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.06);
  transform: translateY(-1px);
}

.schedule-department-tree-option.is-selected {
  color: #1f2937;
  border-color: color-mix(in srgb, var(--schedule-department-accent) 42%, #d8dee7);
  background: color-mix(in srgb, var(--schedule-department-soft) 76%, #ffffff);
  box-shadow:
    inset 3px 0 0 var(--schedule-department-accent),
    inset 0 0 0 1px rgba(255, 255, 255, 0.64);
}

.schedule-department-tree-option:focus-within {
  outline: 2px solid rgba(45, 155, 232, 0.28);
  outline-offset: 2px;
}

.schedule-department-children {
  position: relative;
  display: grid;
  gap: 4px;
  margin: 4px 0 0 20px;
  padding-left: 14px;
}

.schedule-department-children::before {
  position: absolute;
  top: -4px;
  bottom: 17px;
  left: 3px;
  width: 1px;
  background: #d6dee7;
  content: "";
}

.schedule-department-child {
  min-height: 32px;
}

.schedule-department-child::before {
  position: absolute;
  top: 50%;
  left: -11px;
  width: 8px;
  height: 1px;
  background: #d6dee7;
  content: "";
}

.schedule-date-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid #dbeedc;
  border-radius: 8px;
  background: #f7fff5;
}

.schedule-create-actions {
  justify-content: flex-end;
  gap: 10px;
  padding-top: 0;
}

.schedule-create-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 86px;
  height: 38px;
  padding: 0 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.schedule-create-action--cancel {
  border: 1px solid #d9dee5;
  color: #344054;
  background: #ffffff;
}

.schedule-create-action--cancel:hover {
  border-color: #bfc7d1;
  background: #f7f9fc;
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.08);
  transform: translateY(-1px);
}

.schedule-create-action--cancel:active {
  background: #eef2f6;
  transform: translateY(0);
}

.schedule-create-action--save {
  border: 1px solid #2385c9;
  color: #ffffff;
  background: #2d9be8;
  box-shadow: 0 7px 16px rgba(36, 127, 202, 0.2);
}

.schedule-create-action--save:not(:disabled):hover {
  border-color: #1d6eb5;
  background: #2385c9;
  box-shadow: 0 9px 20px rgba(36, 127, 202, 0.25);
  transform: translateY(-1px);
}

.schedule-create-action--save:not(:disabled):active {
  box-shadow: 0 5px 12px rgba(36, 127, 202, 0.18);
  transform: translateY(0);
}

.schedule-create-action--save:disabled {
  border-color: #d0d5dd;
  color: #98a2b3;
  background: #eef2f6;
  box-shadow: none;
  cursor: not-allowed;
}

.schedule-create-action:focus-visible {
  outline: 2px solid rgba(45, 155, 232, 0.28);
  outline-offset: 2px;
}

@media (max-width: 680px) {
  .schedule-create-card {
    padding: 18px;
  }

  .schedule-title-row,
  .schedule-date-range,
  .schedule-department-tree {
    grid-template-columns: 1fr;
  }

  .schedule-department-node.has-children {
    grid-row: auto;
  }

  .schedule-create-action {
    width: 100%;
  }
}
</style>
