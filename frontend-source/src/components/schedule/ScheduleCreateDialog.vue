<script setup>
import { computed, reactive, watch } from "vue";
import { Close } from "@element-plus/icons-vue";
import { taskModules } from "@/data/seed";
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

const form = reactive({
  title: "",
  module: "project",
  startDate: "",
  endDate: ""
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
    return;
  }

  const start = toInputDate(store.schedulePlan?.startDate || store.activeProject?.startDate) || todayInputDate();
  form.title = "";
  form.module = "project";
  form.startDate = start;
  form.endDate = start;
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
  <el-dialog v-model="visible" class="modal-shell schedule-create-modal-shell" width="min(560px, calc(100vw - 32px))" :show-close="false" @open="reset">
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
        <div class="schedule-department-options">
          <label v-for="module in taskModules" :key="module.key" class="schedule-department-option" :class="{ 'is-selected': form.module === module.key }">
            <input v-model="form.module" required type="radio" name="schedule-department" :value="module.key" />
            <span>{{ module.label }}</span>
          </label>
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

.schedule-department-options {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.schedule-department-option {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  height: 34px;
  padding: 0 13px;
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

.schedule-department-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.schedule-department-option span {
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  text-overflow: ellipsis;
}

.schedule-department-option:hover {
  border-color: #bfc7d1;
  background: #f8fafc;
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.07);
  transform: translateY(-1px);
}

.schedule-department-option.is-selected {
  color: #155f94;
  border-color: #8fc4ec;
  background: #eef8ff;
  box-shadow: inset 0 0 0 1px rgba(45, 155, 232, 0.14);
}

.schedule-department-option:focus-within {
  outline: 2px solid rgba(45, 155, 232, 0.28);
  outline-offset: 2px;
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
  .schedule-date-range {
    grid-template-columns: 1fr;
  }

  .schedule-create-action {
    width: 100%;
  }
}
</style>
