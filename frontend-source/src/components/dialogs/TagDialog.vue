<script setup>
import { computed, reactive, watch } from "vue";
import { tagColors } from "@/data/seed";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean
});

const emit = defineEmits(["update:modelValue"]);
const store = useWorkspaceStore();

const form = reactive({
  name: "",
  color: "red"
});

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.name = "";
      form.color = "red";
    }
  }
);

function close() {
  visible.value = false;
}

function submit() {
  if (store.addTag(form.name, form.color)) close();
}
</script>

<template>
  <el-dialog v-model="visible" class="modal-shell" width="480px" :show-close="false">
    <form class="modal-card" @submit.prevent="submit">
      <div class="modal-head">
        <h3>添加标签</h3>
        <button type="button" @click="close">×</button>
      </div>
      <label>标签名称
        <input v-model="form.name" required placeholder="例如：客户确认" />
      </label>
      <label>标签颜色
        <select v-model="form.color">
          <option v-for="color in tagColors" :key="color" :value="color">{{ { red: "红色", green: "绿色", yellow: "黄色", blue: "蓝色", purple: "紫色", pink: "粉色" }[color] }}</option>
        </select>
      </label>
      <div class="modal-actions">
        <button class="ghost" type="button" @click="close">取消</button>
        <button class="solid" type="submit">添加</button>
      </div>
    </form>
  </el-dialog>
</template>
