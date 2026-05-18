<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Bell } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { avatarTones } from "@/data/seed";
import NoticeInlineContent from "@/components/layout/NoticeInlineContent.vue";
import notificationApi from "@/services/notificationApi";
import { openNoticeLink } from "@/utils/noticeCarousel";

const emit = defineEmits([
  "delete-project",
  "archive-project",
  "open-board",
  "open-contacts",
  "open-launcher",
  "invite-member",
  "open-members",
  "open-profile",
  "open-admin",
  "logout",
  "change-password",
  "open-schedule"
]);

const store = useWorkspaceStore();
const noticeIndex = ref(0);
const activeMenu = ref("");
const adminMenuOpen = ref(false);
const actionsWrap = ref(null);
const notifications = ref([]);
const notificationUnreadCount = ref(0);
const notificationsLoading = ref(false);
const notificationsError = ref("");
let noticeTimer;

const members = computed(() => store.activeMembersDetailed);
const visibleMembers = computed(() => members.value.slice(0, 3));
const hiddenMemberCount = computed(() => Math.max(0, members.value.length - visibleMembers.value.length));
const activeNotices = computed(() => (store.carouselNotices || []).filter((item) => item.enabled !== false));
const currentNoticeIndex = computed(() => (activeNotices.value.length ? noticeIndex.value % activeNotices.value.length : 0));
const currentNotice = computed(() => activeNotices.value[currentNoticeIndex.value] || null);
const unreadBadgeText = computed(() => (notificationUnreadCount.value > 99 ? "99+" : String(notificationUnreadCount.value || "")));
const visibleNotifications = computed(() => notifications.value.slice(0, 8));
const hasVisibleNotifications = computed(() => visibleNotifications.value.length > 0);

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

function handleDocumentPointerDown(event) {
  if (!activeMenu.value) return;
  if (actionsWrap.value?.contains(event.target)) return;
  activeMenu.value = "";
}

watch(
  () => [activeNotices.value.length, currentNotice.value?.interval],
  () => {
    if (noticeIndex.value >= activeNotices.value.length) noticeIndex.value = 0;
    scheduleNotice();
  },
  { immediate: true }
);

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  loadNotificationUnreadCount();
});

onBeforeUnmount(() => {
  window.clearTimeout(noticeTimer);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});

function toggleMenu(name) {
  adminMenuOpen.value = false;
  const nextMenu = activeMenu.value === name ? "" : name;
  activeMenu.value = nextMenu;
  if (nextMenu === "notice") {
    loadNotifications();
  }
}

function handleAvatarClick(event) {
  event.stopPropagation();
  activeMenu.value = "";
  if (store.isManagementUser) {
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

function handleNoticeClick(event) {
  if (!event.target?.closest?.(".notice-inline-link")) return;
  event.preventDefault();
  openNoticeLink(currentNotice.value);
}

function normalizeNotificationList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.notifications)) return response.notifications;
  return [];
}

async function loadNotificationUnreadCount() {
  try {
    const response = await notificationApi.getUnreadCount();
    notificationUnreadCount.value = Number(response?.unreadCount || response?.count || 0);
    return true;
  } catch {
    notificationUnreadCount.value = 0;
    return false;
  }
}

async function loadNotifications() {
  notificationsLoading.value = true;
  notificationsError.value = "";
  try {
    const [listResponse, countResponse] = await Promise.all([
      notificationApi.listNotifications({ limit: 20 }),
      notificationApi.getUnreadCount()
    ]);
    notifications.value = normalizeNotificationList(listResponse);
    notificationUnreadCount.value = Number(countResponse?.unreadCount || countResponse?.count || 0);
    return true;
  } catch (error) {
    notificationsError.value = error?.message || "通知加载失败";
    return false;
  } finally {
    notificationsLoading.value = false;
  }
}

async function markNotificationRead(notification) {
  if (!notification?.id && !notification?.notificationId) return;
  if (notification.isRead === false) {
    notification.isRead = true;
    notificationUnreadCount.value = Math.max(0, notificationUnreadCount.value - 1);
  }
  try {
    await notificationApi.markNotificationRead(notification.id || notification.notificationId);
    await loadNotificationUnreadCount();
  } catch (error) {
    store.showToast(error?.message || "标记已读失败");
    await loadNotifications();
  }
}

async function markAllNotificationsRead() {
  const previousCount = notificationUnreadCount.value;
  notifications.value = notifications.value.map((notification) => ({ ...notification, isRead: true }));
  notificationUnreadCount.value = 0;
  try {
    await notificationApi.markAllNotificationsRead();
  } catch (error) {
    notificationUnreadCount.value = previousCount;
    store.showToast(error?.message || "全部已读失败");
    await loadNotifications();
  }
}

async function handleNotificationClick(notification) {
  await markNotificationRead(notification);
  const title = notification.title || "通知";
  const project = notification.projectName ? ` · ${notification.projectName}` : "";
  const task = notification.taskTitle ? ` / ${notification.taskTitle}` : "";
  store.showToast(`${title}${project}${task}`);
}

function openServerFolder() {
  const folder = store.activeProject?.serverPath || "\\\\server\\project-files\\项目清单";
  store.showToast(`后期接入局域网共享（SMB）权限后跳转服务器项目文件：${folder}`);
}
</script>

<template>
  <header class="work-header">
    <div class="top-carousel" aria-live="polite">
      <div class="carousel-copy">
        <NoticeInlineContent :notice="currentNotice" fallback="暂无轮播提醒" @click="handleNoticeClick" />
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
    </div>

    <div ref="actionsWrap" class="work-hero-actions-wrap">
      <div class="work-hero-actions" aria-label="工作台快捷操作">
        <button class="work-notice-button" type="button" title="通知" aria-label="通知" @click="toggleMenu('notice')">
          <Bell aria-hidden="true" />
          <span v-if="notificationUnreadCount" class="work-notice-badge">{{ unreadBadgeText }}</span>
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

      <section v-if="activeMenu === 'notice'" class="schedule-hero-menu work-hero-menu" aria-label="通知列表">
        <div class="notification-menu-head">
          <strong>通知</strong>
          <button class="notification-read-all" type="button" :disabled="!notificationUnreadCount" @click="markAllNotificationsRead">全部已读</button>
        </div>
        <p v-if="notificationsLoading">正在加载通知...</p>
        <p v-else-if="notificationsError">{{ notificationsError }}</p>
        <p v-else-if="!hasVisibleNotifications">暂无个人通知。</p>
        <template v-else>
          <button
            v-for="notification in visibleNotifications"
            :key="notification.id || notification.notificationId"
            class="notification-item"
            :class="{ 'is-unread': notification.isRead === false }"
            type="button"
            @click="handleNotificationClick(notification)"
          >
            <span>{{ notification.title || "通知" }}</span>
            <small>{{ notification.text || notification.content || "暂无内容" }}</small>
            <em v-if="notification.projectName || notification.taskTitle">
              {{ [notification.projectName, notification.taskTitle].filter(Boolean).join(" / ") }}
            </em>
          </button>
        </template>
      </section>
    </div>

    <div class="header-main-row">
      <div class="project-name-line">
        <span class="project-label">项目名称</span>
        <strong>{{ store.activeProjectName }}</strong>
        <div class="project-inline-actions" aria-label="项目操作">
          <button v-if="store.isAdmin" class="project-action-delete danger" title="删除项目" type="button" @click="emit('delete-project')"><i></i></button>
          <button class="project-action-archive" title="归档项目" type="button" :disabled="!store.canManageProject" @click="emit('archive-project')"><i></i></button>
          <button class="project-action-board" title="协作画板" type="button" :disabled="!store.canViewBoard" @click="emit('open-board')"><i></i></button>
        </div>
        <button class="project-server-link" type="button" title="跳转服务器项目文件" aria-label="跳转服务器项目文件" @click="openServerFolder">
          <i></i>
        </button>
      </div>

      <div class="header-actions">
        <button class="add-member-btn" title="添加协同成员" aria-label="添加协同成员" type="button" :disabled="!store.canManageProject" @click="emit('open-members')">
          <span class="person-add-icon"></span>
        </button>
        <div class="avatar-stack">
          <span
            v-for="(member, index) in visibleMembers"
            :key="`${member}-${index}`"
            class="avatar"
            :data-tone="avatarTones[index % avatarTones.length]"
            :title="`${member.name} · ${store.roleLabel(member.role)}`"
          >
            {{ member.avatar }}
          </span>
          <span
            v-if="hiddenMemberCount"
            class="avatar avatar-more"
            role="button"
            tabindex="0"
            :title="`还有${hiddenMemberCount}位协同成员，点击查看成员权限`"
            :aria-label="`还有${hiddenMemberCount}位协同成员，点击查看成员权限`"
            @click="emit('open-members')"
            @keydown.enter.prevent="emit('open-members')"
            @keydown.space.prevent="emit('open-members')"
          >...</span>
        </div>
        <button class="member-more" title="查看协同成员和权限" type="button" @click="emit('open-members')">⋯</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.work-notice-button {
  position: relative;
}

.work-notice-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border: 2px solid #fff;
  border-radius: 999px;
  color: #fff;
  background: #e5484d;
  font-size: 11px;
  font-weight: 800;
  line-height: 14px;
  text-align: center;
}

.work-hero-menu {
  width: min(360px, calc(100vw - 32px));
}

.notification-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.notification-read-all {
  width: auto !important;
  min-height: 24px !important;
  padding: 3px 8px !important;
  color: #2f6feb !important;
  background: #eef5ff !important;
}

.notification-read-all:disabled {
  color: #a4adb8 !important;
  cursor: not-allowed;
}

.notification-item {
  position: relative;
}

.notification-item.is-unread::before {
  position: absolute;
  top: 10px;
  left: 6px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #e5484d;
  content: "";
}

.notification-item.is-unread {
  padding-left: 18px !important;
  background: #fff7ed !important;
}

.notification-item em {
  color: #8a94a3;
  font-size: 11px;
  font-style: normal;
  line-height: 1.35;
}
</style>
