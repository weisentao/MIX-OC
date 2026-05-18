<script setup>
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean,
  templateName: {
    type: String,
    default: ""
  },
  templateKind: {
    type: String,
    default: "task"
  }
});

const emit = defineEmits(["update:modelValue"]);
const store = useWorkspaceStore();
const activeGroup = ref("all");
const searchText = ref("");
const draggedUserId = ref("");
const editableUserIds = ref([]);
const readonlyUserIds = ref([]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const templateTitle = computed(() => props.templateName || "未选择模板");
const kindLabel = computed(() => (props.templateKind === "schedule" ? "项目排期模板" : "项目任务模板"));
const activeUsers = computed(() =>
  (store.activeUsers || [])
    .filter((user) => user.role !== "admin" && user.id !== store.currentUser?.id)
    .sort((a, b) =>
      String(a.department || "").localeCompare(String(b.department || ""), "zh-Hans") ||
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans")
    )
);

const groups = computed(() => {
  const departments = [...new Set(activeUsers.value.map((user) => user.department).filter(Boolean))];
  return [
    { key: "all", label: "全部好友", count: activeUsers.value.length },
    { key: "care", label: "关注好友", count: store.careContacts.length },
    ...departments.map((department) => ({
      key: department,
      label: department,
      count: activeUsers.value.filter((user) => user.department === department).length
    }))
  ];
});

const groupedUsers = computed(() => {
  if (activeGroup.value === "all") return activeUsers.value;
  if (activeGroup.value === "care") return activeUsers.value.filter((user) => store.isCareContact(user.id));
  return activeUsers.value.filter((user) => user.department === activeGroup.value);
});

const filteredUsers = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  if (!query) return groupedUsers.value;
  return groupedUsers.value.filter((user) =>
    [user.name, user.department, user.email, user.phone, user.job, user.username]
      .some((field) => String(field || "").toLowerCase().includes(query))
  );
});

const editableUsers = computed(() => editableUserIds.value.map(findUser).filter(Boolean));
const readonlyUsers = computed(() => readonlyUserIds.value.map(findUser).filter(Boolean));

watch(
  () => [props.modelValue, props.templateName],
  ([open]) => {
    if (open) resetFromStore();
  },
  { immediate: true }
);

function close() {
  visible.value = false;
}

function findUser(userId) {
  return activeUsers.value.find((user) => user.id === userId);
}

function userKey(user) {
  return user?.id || user?.username || user?.name || "";
}

function currentShareRecipients() {
  const info = store.templateShareInfo?.[props.templateName] || {};
  return Array.isArray(info.recipients)
    ? info.recipients
    : (info.sharedWith || []).map((name) => ({
        userId: name,
        userName: name,
        permission: info.permissions?.[name] || "read"
      }));
}

function resetFromStore() {
  const nextEditable = [];
  const nextReadonly = [];
  currentShareRecipients().forEach((recipient) => {
    const matched = activeUsers.value.find((user) =>
      user.id === recipient.userId ||
      user.username === recipient.userId ||
      user.name === recipient.userName ||
      user.name === recipient.userId
    );
    const key = matched?.id || recipient.userId || recipient.userName;
    if (!key) return;
    if (recipient.permission === "edit") nextEditable.push(key);
    else nextReadonly.push(key);
  });
  editableUserIds.value = [...new Set(nextEditable)];
  readonlyUserIds.value = [...new Set(nextReadonly)];
}

function dragStart(user) {
  draggedUserId.value = userKey(user);
}

function removeFromLists(userId) {
  editableUserIds.value = editableUserIds.value.filter((id) => id !== userId);
  readonlyUserIds.value = readonlyUserIds.value.filter((id) => id !== userId);
}

function dropSharedUser(permission) {
  if (!draggedUserId.value) return;
  const userId = draggedUserId.value;
  removeFromLists(userId);
  if (permission === "edit") editableUserIds.value.push(userId);
  else readonlyUserIds.value.push(userId);
  draggedUserId.value = "";
  syncShare();
}

function toggleUserPermission(user, permission) {
  const userId = userKey(user);
  if (!userId) return;
  removeFromLists(userId);
  if (permission === "edit") editableUserIds.value.push(userId);
  else readonlyUserIds.value.push(userId);
  syncShare();
}

function removeUser(userId) {
  removeFromLists(userId);
  syncShare();
}

function shareEntry(userId, permission) {
  const user = findUser(userId) || { id: userId, name: userId };
  return {
    userId: user.id || userId,
    userName: user.name || user.username || userId,
    permission,
    department: user.department || "",
    avatar: user.avatar || ""
  };
}

function syncShare() {
  if (!props.templateName) return;
  const entries = [
    ...editableUserIds.value.map((userId) => shareEntry(userId, "edit")),
    ...readonlyUserIds.value.map((userId) => shareEntry(userId, "read"))
  ];
  store.shareTemplate(props.templateName, entries);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="template-share-shell"
    align-center
    width="min(1160px, calc(100vw - 56px))"
    :show-close="false"
    @open="resetFromStore"
  >
    <section class="template-share-page">
      <aside class="template-share-directory" aria-label="共享对象分类">
        <nav class="template-share-group-list">
          <button
            v-for="group in groups"
            :key="group.key"
            class="template-share-group"
            :class="{ 'is-active': activeGroup === group.key }"
            type="button"
            @click="activeGroup = group.key"
          >
            <span>{{ group.label }}</span>
            <small>{{ group.count }}</small>
          </button>
        </nav>
      </aside>

      <main class="template-share-friends">
        <header class="template-share-titlebar">
          <div>
            <span>{{ kindLabel }}</span>
            <h3>{{ templateTitle }}</h3>
          </div>
          <button class="template-share-close" type="button" aria-label="关闭共享模板" @click="close">×</button>
        </header>

        <label class="template-share-search" aria-label="搜索好友">
          <span aria-hidden="true"></span>
          <input v-model="searchText" type="search" placeholder="搜索姓名、部门、邮箱、电话" />
        </label>

        <div class="template-share-list">
          <article
            v-for="user in filteredUsers"
            :key="user.id"
            class="template-share-user"
            draggable="true"
            @dragstart="dragStart(user)"
          >
            <span class="template-share-avatar">{{ (user.avatar || user.name || "?").slice(0, 1) }}</span>
            <div>
              <strong>{{ user.name || user.username }}</strong>
              <small>{{ user.department || "未设置部门" }}</small>
            </div>
            <div class="template-share-user-actions">
              <button type="button" @click="toggleUserPermission(user, 'edit')">可编辑</button>
              <button type="button" @click="toggleUserPermission(user, 'read')">不可编辑</button>
            </div>
          </article>
          <div v-if="!filteredUsers.length" class="template-share-empty">没有找到匹配好友</div>
        </div>
      </main>

      <aside class="template-share-permissions" aria-label="共享权限">
        <section class="template-share-dropzone" @dragover.prevent @drop="dropSharedUser('edit')">
          <header>
            <strong>可编辑</strong>
            <span>{{ editableUsers.length }}</span>
          </header>
          <p>可编辑共享者可修改模板内排期/待完成任务列表。</p>
          <button
            v-for="user in editableUsers"
            :key="user.id"
            class="template-share-chip"
            type="button"
            @click="removeUser(user.id)"
          >
            {{ user.name || user.username }}
          </button>
          <div v-if="!editableUsers.length" class="template-share-empty">拖入好友</div>
        </section>

        <section class="template-share-dropzone" @dragover.prevent @drop="dropSharedUser('read')">
          <header>
            <strong>不可编辑</strong>
            <span>{{ readonlyUsers.length }}</span>
          </header>
          <p>不可编辑共享者只能查看模板内容。</p>
          <button
            v-for="user in readonlyUsers"
            :key="user.id"
            class="template-share-chip"
            type="button"
            @click="removeUser(user.id)"
          >
            {{ user.name || user.username }}
          </button>
          <div v-if="!readonlyUsers.length" class="template-share-empty">拖入好友</div>
        </section>
      </aside>
    </section>
  </el-dialog>
</template>

<style scoped>
:deep(.template-share-shell) {
  border-radius: 8px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
}

:deep(.template-share-shell .el-dialog__header) {
  padding: 0;
}

:deep(.template-share-shell .el-dialog__body) {
  padding: 0;
  flex: 1;
  min-height: 0;
}

.template-share-page {
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr) 316px;
  height: min(620px, calc(100vh - 96px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.template-share-directory {
  padding: 68px 18px 18px;
  border-right: 1px solid #e7ebf1;
  background: #f8fafc;
  min-height: 0;
  overflow: auto;
}

.template-share-group-list,
.template-share-list,
.template-share-permissions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.template-share-group,
.template-share-user,
.template-share-chip {
  border: 0;
  background: transparent;
  text-align: left;
}

.template-share-group {
  display: flex;
  justify-content: space-between;
  padding: 11px 12px;
  border-radius: 7px;
  color: #596272;
}

.template-share-group.is-active {
  background: #eef6ff;
  color: #2563eb;
}

.template-share-friends {
  min-width: 0;
  padding: 32px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.template-share-titlebar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.template-share-titlebar span {
  color: #7b8494;
  font-size: 13px;
}

.template-share-titlebar h3 {
  margin: 6px 0 0;
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
}

.template-share-close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-size: 20px;
}

.template-share-search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  margin: 24px 0 18px;
  padding: 0 12px;
  border: 1px solid #d9e0ea;
  border-radius: 6px;
  background: #ffffff;
}

.template-share-search span {
  width: 12px;
  height: 12px;
  border: 2px solid #9aa4b2;
  border-radius: 50%;
}

.template-share-search input {
  width: 100%;
  border: 0;
  outline: 0;
  color: #263142;
}

.template-share-list {
  max-height: none;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.template-share-user {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid #edf1f6;
  border-radius: 8px;
  background: #ffffff;
}

.template-share-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: #eaf2ff;
  color: #2f63d7;
  font-weight: 700;
}

.template-share-user strong,
.template-share-chip {
  color: #263142;
}

.template-share-user small {
  display: block;
  margin-top: 4px;
  color: #8a94a3;
}

.template-share-user-actions {
  display: flex;
  gap: 8px;
}

.template-share-user-actions button {
  height: 30px;
  border: 1px solid #d7e1ee;
  border-radius: 6px;
  background: #f8fbff;
  color: #496174;
}

.template-share-permissions {
  padding: 72px 22px 22px;
  border-left: 1px solid #e7ebf1;
  background: #f6f8fb;
  min-height: 0;
  overflow: auto;
}

.template-share-dropzone {
  min-height: 212px;
  padding: 14px;
  border: 1px dashed #c7d0dc;
  border-radius: 8px;
  background: #ffffff;
}

.template-share-dropzone header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #273346;
}

.template-share-dropzone p,
.template-share-empty {
  margin: 8px 0 12px;
  color: #8792a2;
  font-size: 13px;
}

.template-share-chip {
  display: inline-flex;
  max-width: 100%;
  margin: 0 8px 8px 0;
  padding: 7px 10px;
  border-radius: 999px;
  background: #eef6ff;
  font-size: 13px;
}

@media (max-width: 900px) {
  .template-share-page {
    grid-template-columns: 1fr;
    height: auto;
    max-height: calc(100vh - 56px);
    overflow: auto;
  }

  .template-share-directory,
  .template-share-permissions {
    padding: 18px;
    border: 0;
  }

  .template-share-friends {
    padding: 18px;
  }
}
</style>
