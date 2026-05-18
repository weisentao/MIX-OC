<script setup>
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
</script>

<template>
  <div class="toast" :class="{ 'is-visible': store.toastVisible }" role="status" aria-live="polite">{{ store.toastMessage }}</div>
</template>
