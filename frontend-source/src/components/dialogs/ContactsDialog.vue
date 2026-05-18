<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean,
  source: { type: String, default: "default" }
});

const emit = defineEmits(["update:modelValue", "view-profile", "invite-user"]);
const store = useWorkspaceStore();
const activeGroup = ref("all");
const searchText = ref("");

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const isLauncherSource = computed(() => props.source === "launcher");
const shellClass = computed(() => [
  "contacts-directory-shell",
  { "is-launcher-source": isLauncherSource.value }
]);
const dialogLabel = computed(() => (isLauncherSource.value ? "快捷导航通讯录整页面板" : "通讯录 / 用户池"));

const contacts = computed(() => {
  const active = store.activeUsers.filter((user) => user.role !== "admin");
  return [...active].sort((a, b) =>
    String(a.department || "").localeCompare(String(b.department || ""), "zh-Hans") ||
    String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans")
  );
});

const groupItems = computed(() => {
  const departments = [...new Set(contacts.value.map((user) => user.department).filter(Boolean))];
  return [
    { key: "all", label: "全部好友", count: contacts.value.length },
    { key: "care", label: "关注好友", count: store.careContacts.length },
    ...departments.map((name) => ({ key: name, label: name, count: contacts.value.filter((user) => user.department === name).length }))
  ];
});

const normalizedSearchText = computed(() => searchText.value.trim().toLowerCase());

const groupedContacts = computed(() => {
  if (activeGroup.value === "all") return contacts.value;
  if (activeGroup.value === "care") return contacts.value.filter((user) => store.isCareContact(user.id));
  return contacts.value.filter((user) => user.department === activeGroup.value);
});

const filteredContacts = computed(() => {
  const query = normalizedSearchText.value;
  if (!query) return groupedContacts.value;
  return groupedContacts.value.filter((user) => {
    const fields = [user.name, user.department, user.email, user.phone, user.mbti, user.job, user.username];
    return fields.some((field) => String(field || "").toLowerCase().includes(query));
  });
});

function close() {
  visible.value = false;
}

function openProfile(user) {
  emit("view-profile", user.id);
}

function inviteUser(user) {
  emit("invite-user", user.name);
}

function toggleCare(user) {
  store.toggleCareContact(user.id);
}

function isCare(user) {
  return store.isCareContact(user.id);
}

function userAvatarFace(user) {
  const faces = ["blue-mask", "blue-cat", "yellow-face", "pink-face", "brown-face"];
  const code = String(user.id || user.name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return faces[code % faces.length];
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :class="shellClass"
    width="min(1180px, calc(100vw - 72px))"
    :show-close="false"
    append-to-body
    align-center
    :aria-label="dialogLabel"
    @click.self="close"
  >
    <button class="contacts-dismiss-layer" type="button" aria-label="关闭通讯录" @click="close"></button>
    <section class="contacts-directory contacts-directory-panel" :aria-label="dialogLabel">
      <aside class="contacts-rail">
        <nav class="contacts-group-nav" aria-label="通讯录分组">
          <button
            v-for="item in groupItems"
            :key="item.key"
            class="contacts-group-item"
            :class="{ 'is-active': item.key === activeGroup }"
            type="button"
            @click="activeGroup = item.key"
          >
            <b>{{ item.label }}</b>
            <span>{{ item.count }}</span>
          </button>
        </nav>
      </aside>

      <div class="contacts-content">
        <button class="contacts-close-x" type="button" aria-label="关闭通讯录" @click="close">×</button>

        <header class="contacts-titlebar">
          <div class="contacts-title">
            <span class="contacts-menu-mark" aria-hidden="true"></span>
            <strong>通讯录</strong>
          </div>
          <label class="contacts-search" aria-label="搜索通讯录">
            <span aria-hidden="true"></span>
            <input v-model="searchText" type="search" placeholder="搜索姓名、部门、邮箱、电话" />
          </label>
          <small>共 {{ filteredContacts.length }} 人</small>
        </header>

        <div class="contacts-table" role="table" aria-label="用户池">
          <div class="contacts-row contacts-head-row" role="row">
            <span role="columnheader">头像</span>
            <span role="columnheader">姓名</span>
            <span role="columnheader">部门</span>
            <span role="columnheader">邮箱</span>
            <span role="columnheader">MBTI</span>
            <span role="columnheader">职务</span>
            <span role="columnheader">手机号</span>
            <span role="columnheader">关注</span>
          </div>

          <div class="contacts-table-body">
            <div
              v-for="user in filteredContacts"
              :key="user.id"
              class="contacts-row contacts-person-row"
              role="row"
              tabindex="0"
              @click="openProfile(user)"
              @keydown.enter.prevent="openProfile(user)"
              @keydown.space.prevent="openProfile(user)"
            >
              <span role="cell">
                <span class="contact-avatar-pic" :data-face="userAvatarFace(user)">
                  <span aria-hidden="true"></span>
                </span>
              </span>
              <span role="cell">{{ user.name || "-" }}</span>
              <span role="cell">{{ user.department || "-" }}</span>
              <span role="cell">{{ user.email || "-" }}</span>
              <span role="cell">{{ user.mbti || "-" }}</span>
              <span role="cell">{{ user.job || "-" }}</span>
              <span role="cell" class="contact-phone-cell">
                {{ user.phone || "-" }}
                <button v-if="!isLauncherSource && store.canManageProject" type="button" @click.stop="inviteUser(user)">加入项目</button>
              </span>
              <span role="cell">
                <button
                  class="contacts-care-action"
                  :class="{ 'is-active': isCare(user) }"
                  type="button"
                  :aria-label="`${isCare(user) ? '取消关注' : '关注'}${user.name || '用户'}`"
                  @click.stop="toggleCare(user)"
                >
                  {{ isCare(user) ? "取消关注" : "关注" }}
                </button>
              </span>
            </div>
            <div v-if="!filteredContacts.length" class="contacts-empty" role="row">没有找到匹配的同学</div>
          </div>
        </div>
      </div>
    </section>
  </el-dialog>
</template>

<style scoped>
:global(.contacts-directory-shell.is-launcher-source.el-dialog) {
  position: fixed !important;
  inset: 0 !important;
  display: grid !important;
  place-items: center !important;
  width: calc(100vw / var(--scale-factor)) !important;
  height: calc(100vh / var(--scale-factor)) !important;
  margin: 0 !important;
  pointer-events: none;
}

:global(.contacts-directory-shell.is-launcher-source .el-dialog__body) {
  width: min(1040px, calc((100vw / var(--scale-factor)) - 72px)) !important;
  height: min(680px, calc((100vh / var(--scale-factor)) - 72px)) !important;
  pointer-events: auto;
}

:global(.contacts-directory-shell.is-launcher-source .contacts-directory-panel) {
  place-self: center !important;
  width: 100% !important;
  height: 100% !important;
}

.contacts-person-row {
  width: 100%;
  border: 0;
  text-align: left;
}

:global(.contacts-directory-shell.is-launcher-source .contacts-row) {
  grid-template-columns:
    42px
    minmax(70px, 0.78fr)
    minmax(88px, 0.8fr)
    minmax(150px, 1.36fr)
    minmax(52px, 0.42fr)
    minmax(70px, 0.62fr)
    minmax(112px, 0.86fr)
    76px !important;
}
</style>
