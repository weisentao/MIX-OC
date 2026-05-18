<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bell } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import ScheduleMemberAvatars from "./ScheduleMemberAvatars.vue";

const emit = defineEmits(["open-launcher", "open-profile", "open-admin", "logout", "change-password"]);

const store = useWorkspaceStore();
const noticeIndex = ref(0);
const activeMenu = ref("");
const adminMenuOpen = ref(false);
const actionsWrap = ref(null);
let noticeTimer;

const activeNotices = computed(() => (store.carouselNotices || []).filter((item) => item.enabled !== false));
const currentNoticeIndex = computed(() => (activeNotices.value.length ? noticeIndex.value % activeNotices.value.length : 0));
const currentNotice = computed(() => activeNotices.value[currentNoticeIndex.value] || null);

function scheduleNotice() {
  window.clearTimeout(noticeTimer);
  const current = currentNotice.value;
  const delay = Math.max(1000, Number(current?.interval || 5500));
  noticeTimer = window.setTimeout(() => {
    const count = activeNotices.value.length;
    if (count > 1) noticeIndex.value = (noticeIndex.value + 1) % count;
    scheduleNotice();
  }, delay);
}

function toggleMenu(name) {
  adminMenuOpen.value = false;
  activeMenu.value = activeMenu.value === name ? "" : name;
}

function handleDocumentPointerDown(event) {
  if (!activeMenu.value) return;
  if (actionsWrap.value?.contains(event.target)) return;
  activeMenu.value = "";
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  scheduleNotice();
});

onBeforeUnmount(() => {
  window.clearTimeout(noticeTimer);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});

function handleAvatarClick(event) {
  event.stopPropagation();
  activeMenu.value = "";
  if (store.isAdmin) {
    adminMenuOpen.value = !adminMenuOpen.value;
    return;
  }
  emit("open-profile", store.currentUser?.id);
}

function adminAction(action) {
  adminMenuOpen.value = false;
  emit(action);
}

function setNoticeIndex(index) {
  const count = activeNotices.value.length;
  if (!count) return;
  noticeIndex.value = index % count;
  scheduleNotice();
}
</script>

<template>
  <header class="schedule-hero-header">
    <div class="schedule-hero-copy">
      <h1>{{ currentNotice?.text || "暂无轮播提醒" }}</h1>
    </div>
    <div class="carousel-dots" aria-label="轮播切换">
      <button
        v-for="(_, index) in activeNotices"
        :key="index"
        type="button"
        :aria-label="`${index + 1} / ${activeNotices.length}`"
        title="切换轮播"
        :class="{ 'is-active': index === currentNoticeIndex }"
        @click="setNoticeIndex(index)"
      ></button>
    </div>
    <div ref="actionsWrap" class="schedule-hero-actions-wrap">
      <div class="schedule-hero-actions" aria-label="排期页快捷操作">
        <button type="button" title="通知" aria-label="通知" @click="toggleMenu('notice')">
          <Bell aria-hidden="true" />
        </button>
        <div class="header-top-tools" aria-label="用户工具">
          <button class="grid-menu-btn" title="快捷导航" type="button" @click="emit('open-launcher')">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </button>
          <button class="user-avatar" title="个人主页" type="button" @click="handleAvatarClick">
            <img v-if="store.currentUser?.avatarImage" :src="store.currentUser.avatarImage" alt="" />
            <span v-else>{{ store.currentUser?.avatar || "严" }}</span>
          </button>
          <div v-if="adminMenuOpen" class="admin-avatar-menu">
            <button type="button" @click="adminAction('logout')">退出登录</button>
            <button type="button" @click="adminAction('change-password')">更改密码</button>
            <button type="button" @click="adminAction('open-admin')">后台管理</button>
          </div>
        </div>
      </div>

      <section v-if="activeMenu === 'notice'" class="schedule-hero-menu" aria-label="通知列表">
        <strong>通知</strong>
        <p v-if="!activeNotices.length">暂无通知，离线模式下仍可继续编辑排期。</p>
        <button v-for="notice in activeNotices.slice(0, 3)" :key="notice.id || notice.title || notice.text" type="button" @click="store.showToast(notice.text || notice.title || '通知')">
          <span>{{ notice.title || "提醒" }}</span>
          <small>{{ notice.text || "暂无内容" }}</small>
        </button>
      </section>
    </div>
    <ScheduleMemberAvatars class="schedule-hero-mobile-members" small />
  </header>
</template>
