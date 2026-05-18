<script setup>
import { computed } from "vue";
import { formatSlashDate } from "@/utils/schedule/dateRange.js";

const props = defineProps({
  days: {
    type: Array,
    default: () => []
  },
  items: {
    type: Array,
    default: () => []
  },
  layout: {
    type: Object,
    default: () => ({ dayWidth: 28, rowHeight: 34 })
  }
});

const today = formatSlashDate(new Date());
const gridHeight = computed(() => `${props.items.length * props.layout.rowHeight}px`);
</script>

<template>
  <div class="schedule-timeline-grid" :style="{ height: gridHeight }">
    <div
      v-for="day in days"
      :key="day.date"
      class="schedule-timeline-grid-day"
      :class="{ 'is-rest-day': day.isRestDay, 'is-weekend': day.isWeekend, 'is-holiday': day.isHoliday, 'is-today': day.date === today }"
      :style="{ width: `${layout.dayWidth}px` }"
    ></div>
  </div>
</template>
