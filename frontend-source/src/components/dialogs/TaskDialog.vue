<script setup>
import { computed, reactive, watch } from "vue";
import { taskModules } from "@/data/seed";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean,
  defaultType: {
    type: String,
    default: "流程"
  }
});

const emit = defineEmits(["update:modelValue"]);
const store = useWorkspaceStore();

function todayISO() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const form = reactive({
  title: "",
  note: "",
  module: "project",
  type: "流程",
  startDate: todayISO(),
  endDate: todayISO()
});

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.title = "";
      form.note = "";
      form.module = "aigc";
      form.type = props.defaultType || "流程";
      form.startDate = todayISO();
      form.endDate = todayISO();
    }
  }
);

function close() {
  visible.value = false;
}

function submit() {
  if (!form.title.trim()) return;
  if (store.createTask(form)) close();
}
</script>

<template>
  <el-dialog v-model="visible" class="modal-shell task-modal-shell" width="min(920px, calc(100vw - 32px))" :show-close="false">
    <form class="modal-card task-create-card" @submit.prevent="submit">
      <div class="modal-head">
        <h3>创建清单</h3>
        <button type="button" @click="close">×</button>
      </div>
      <div class="task-create-row v6-task-create-row">
        <label class="soft-field">输入主任务标题
          <input v-model="form.title" required placeholder="输入主任务标题" />
        </label>
        <label class="soft-field soft-field-note">解释备注
          <textarea v-model="form.note" rows="1" placeholder="为主标题补充详细备注，方便协同成员理解"></textarea>
        </label>
        <button class="task-submit" type="submit">确定</button>
      </div>
      <fieldset class="module-picker">
        <legend>所属部门</legend>
        <label v-for="module in taskModules" :key="module.key" class="module-option">
          <input v-model="form.module" type="radio" name="module" :value="module.key" />
          <span class="module-mark" :data-color="module.color"></span>
          <span>{{ module.label }}</span>
        </label>
      </fieldset>
      <div class="task-date-row">
        <span>任务时间</span>
        <label>
          <input v-model="form.startDate" type="date" />
        </label>
        <b>至</b>
        <label>
          <input v-model="form.endDate" type="date" />
        </label>
        <small>未来将与排期联动</small>
      </div>
    </form>
  </el-dialog>
</template>
