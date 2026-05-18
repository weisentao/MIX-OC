<script setup>
import ScheduleProjectHeader from "./ScheduleProjectHeader.vue";

const emit = defineEmits([
  "open-create",
  "open-export",
  "open-members"
]);
</script>

<template>
  <div class="schedule-center-topbar">
    <ScheduleProjectHeader @open-create="emit('open-create')" @open-export="emit('open-export')" @open-members="emit('open-members')" />
  </div>
</template>
