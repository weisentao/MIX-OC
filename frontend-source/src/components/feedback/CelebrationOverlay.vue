<script setup>
import { computed } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const confetti = computed(() => {
  if (!store.celebration.withConfetti) return [];
  const colors = ["#ff5b7f", "#ffd54f", "#4fc3f7", "#63d471", "#8c6cff"];
  return Array.from({ length: 24 }, (_, index) => ({
    color: colors[index % colors.length],
    delay: `${(index % 8) * 0.018}s`,
    width: `${5 + (index % 4)}px`,
    height: `${8 + (index % 5)}px`,
    left: `${28 + ((index * 11) % 44)}%`
  }));
});
</script>

<template>
  <div v-if="store.celebration.visible" class="celebration" aria-live="polite">
    <div class="celebration-card animate__animated animate__zoomIn">
      <div class="celebration-burst animate__animated animate__fadeIn"></div>
      <div class="confetti-field">
        <i
          v-for="(piece, index) in confetti"
          :key="`${store.celebration.seed}-${index}`"
          :style="{
            '--color': piece.color,
            '--delay': piece.delay,
            '--w': piece.width,
            '--h': piece.height,
            left: piece.left
          }"
        ></i>
      </div>
      <strong>{{ store.celebration.title }}</strong>
      <span>{{ store.celebration.text }}</span>
    </div>
  </div>
</template>
