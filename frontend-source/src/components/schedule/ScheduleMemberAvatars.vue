<script setup>
import { computed, ref } from "vue";
import { avatarTones } from "@/data/seed";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  members: {
    type: Array,
    default: null
  },
  small: {
    type: Boolean,
    default: false
  },
  max: {
    type: Number,
    default: 3
  }
});

const emit = defineEmits(["open-members"]);
const store = useWorkspaceStore();
const selectedMemberId = ref("");

const members = computed(() => {
  const list = Array.isArray(props.members) ? props.members : store.activeMembersDetailed;
  return (list || []).filter(Boolean);
});
const visibleMembers = computed(() => members.value.slice(0, Math.max(1, props.max)));
const remainingCount = computed(() => Math.max(0, members.value.length - visibleMembers.value.length));
const moreLabel = computed(() => (remainingCount.value ? "..." : ""));
const selectedMember = computed(() => members.value.find((member) => member.id === selectedMemberId.value || member.name === selectedMemberId.value) || null);

function memberKey(member, index) {
  return member.id || member.name || `schedule-member-${index}`;
}

function memberAvatar(member) {
  return String(member.avatar || member.name || "成").slice(0, 1);
}

function selectMember(member) {
  selectedMemberId.value = selectedMemberId.value === (member.id || member.name) ? "" : member.id || member.name;
}

function openMembers() {
  selectedMemberId.value = "";
  emit("open-members");
}
</script>

<template>
  <div class="schedule-member-avatars" :class="{ 'is-small': props.small }" aria-label="排期成员">
    <button
      v-for="(member, index) in visibleMembers"
      :key="memberKey(member, index)"
      type="button"
      class="schedule-member-avatar"
      :data-tone="avatarTones[index % avatarTones.length]"
      :title="`${member.name || '项目成员'} · ${store.roleLabel(member.role)}`"
      :aria-label="`${member.name || '项目成员'} · ${store.roleLabel(member.role)}`"
      @click="selectMember(member)"
    >
      {{ memberAvatar(member) }}
    </button>

    <button
      v-if="remainingCount"
      type="button"
      class="schedule-member-avatar is-more"
      title="查看协同成员和权限"
      aria-label="查看协同成员和权限"
      @click="openMembers"
    >{{ moreLabel }}</button>

    <section v-if="selectedMember" class="schedule-member-popover" aria-label="成员信息">
      <strong>{{ selectedMember.name }}</strong>
      <span>{{ selectedMember.department || "项目成员" }}</span>
      <small>{{ store.roleLabel(selectedMember.role) }}</small>
    </section>

  </div>
</template>
