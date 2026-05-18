<script setup>
import { computed } from "vue";
import { getRowStyle } from "@/utils/schedule/timelineLayout.js";
import ScheduleTimelineBar from "./ScheduleTimelineBar.vue";

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  range: {
    type: Object,
    default: () => ({ startDate: "", endDate: "" })
  },
  layout: {
    type: Object,
    default: () => ({ dayWidth: 28, rowHeight: 34 })
  },
  leftOnly: {
    type: Boolean,
    default: false
  }
});

const rowStyle = computed(() => getRowStyle(props.item.rowIndex || 0, props.layout));
</script>

<template>
  <div v-if="leftOnly" class="schedule-timeline-left-row" :style="rowStyle">
    <strong>{{ item.title || "未命名排期" }}</strong>
  </div>
  <div v-else class="schedule-timeline-row" :style="rowStyle">
    <ScheduleTimelineBar :item="item" :range="range" :layout="layout" />
  </div>
</template>
