<script setup>
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const confirmText = ref("");

const visible = computed({
  get: () => Boolean(store.pendingArchiveTaskId),
  set: (value) => {
    if (!value) store.closeArchiveDialog();
  }
});

const task = computed(() => store.getTask(store.pendingArchiveTaskId));

watch(visible, (open) => {
  if (open) confirmText.value = "";
});

function close() {
  store.closeArchiveDialog();
}

function submit() {
  if (store.confirmArchive(confirmText.value)) {
    confirmText.value = "";
  }
}
</script>

<template>
  <el-dialog v-model="visible" class="modal-shell confirm-archive-modal-shell" width="480px" :show-close="false">
    <form class="modal-card" @submit.prevent="submit">
      <div class="modal-head">
        <h3>确认完成归档</h3>
        <button type="button" @click="close">×</button>
      </div>
      <p class="confirm-copy">
        归档会把「{{ task?.title }}」移动到已完成任务列表，评论和备注都会保留。
        请在下方输入 <strong>{{ store.archiveConfirmPhrase }}</strong> 后继续。
      </p>
      <label>确认文字
        <input v-model="confirmText" autocomplete="off" :placeholder="`输入：${store.archiveConfirmPhrase}`" />
      </label>
      <div class="modal-actions">
        <button class="ghost" type="button" @click="close">取消</button>
        <button class="solid" type="submit" :disabled="confirmText.trim() !== store.archiveConfirmPhrase">确认归档</button>
      </div>
    </form>
  </el-dialog>
</template>
