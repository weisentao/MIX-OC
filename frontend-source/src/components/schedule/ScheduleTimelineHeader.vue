<script setup>
import { computed } from "vue";
import { buildWeeks, getLocalTodaySlashDate } from "@/utils/schedule/dateRange.js";
import { shouldShowWeekHeaderLabel } from "@/utils/schedule/timelineLayout.js";

const props = defineProps({
  days: {
    type: Array,
    default: () => []
  },
  layout: {
    type: Object,
    default: () => ({ dayWidth: 28, rowHeight: 34 })
  }
});
const emit = defineEmits(["today"]);

const today = getLocalTodaySlashDate();
const weeks = computed(() => buildWeeks(props.days));

function getWeekWidth(week) {
  return week.days.length * props.layout.dayWidth;
}

function getWeekTitle(week) {
  return week.title || (week.startDate === week.endDate ? week.startDate : `${week.startDate} - ${week.endDate}`);
}

function getWeekLabel(week) {
  return week.label || getWeekTitle(week);
}
</script>

<template>
  <div class="schedule-timeline-header">
    <div class="schedule-timeline-today-layer">
      <button class="schedule-timeline-today-button" type="button" title="回到今日" aria-label="回到今日" @click="emit('today')">
        今日
      </button>
    </div>
    <div class="schedule-timeline-week-row">
      <div
        v-for="week in weeks"
        :key="week.key"
        class="schedule-timeline-week"
        :class="{ 'is-single-day': week.isSingleDay, 'is-narrow': !shouldShowWeekHeaderLabel(week, layout) }"
        :style="{ width: `${getWeekWidth(week)}px` }"
        :title="getWeekTitle(week)"
        :aria-label="getWeekTitle(week)"
      >
        <span
          v-if="shouldShowWeekHeaderLabel(week, layout)"
          class="schedule-timeline-week-label"
          :style="{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }"
        >
          {{ getWeekLabel(week) }}
        </span>
      </div>
    </div>
    <div class="schedule-timeline-day-row">
      <div
        v-for="day in days"
        :key="day.date"
        class="schedule-timeline-day"
        :class="{ 'is-rest-day': day.isRestDay, 'is-weekend': day.isWeekend, 'is-holiday': day.isHoliday, 'is-today': day.date === today }"
        :style="{ width: `${layout.dayWidth}px` }"
        :title="day.holidayName || day.date"
      >
        <span>{{ day.month }}/{{ String(day.day).padStart(2, "0") }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-timeline-today-layer {
  position: sticky;
  left: 8px;
  top: 0;
  z-index: 6;
  width: 0;
  height: 0;
  overflow: visible;
}

.schedule-timeline-today-button {
  position: absolute;
  top: 5px;
  left: 0;
  min-width: 44px;
  height: 24px;
  border: 1px solid #8edc9b;
  border-radius: 4px;
  color: #286f34;
  background: #ffffff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(40, 111, 52, 0.12);
}

.schedule-timeline-today-button:hover {
  background: #effaf1;
}
</style>
