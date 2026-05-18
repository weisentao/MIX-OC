<script setup>
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean
});

const emit = defineEmits(["update:modelValue"]);
const store = useWorkspaceStore();
const activeGroup = ref("all");
const searchText = ref("");
const selectedUserIds = ref([]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const roles = [
  { key: "manager", label: "管理" },
  { key: "editor", label: "编辑" },
  { key: "readonly", label: "只读" }
];
const defaultGroups = ["项目管理", "AIGC", "美术设计", "三维设计", "视效包装"];

const currentMemberNames = computed(() => new Set((store.activeMembersDetailed || []).map((member) => member.name)));
const contacts = computed(() =>
  (store.activeUsers || [])
    .filter((user) => user.role !== "admin")
    .sort((a, b) =>
      String(a.department || "").localeCompare(String(b.department || ""), "zh-Hans") ||
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans")
    )
);

const groupItems = computed(() => {
  const departments = [...new Set(contacts.value.map((user) => user.department).filter(Boolean))];
  const mergedDepartments = [...new Set([...defaultGroups, ...departments])];
  return [
    { key: "all", label: "全部好友", count: contacts.value.length },
    { key: "care", label: "关注好友", count: (store.careContacts || []).length },
    ...mergedDepartments.map((name) => ({ key: name, label: name, count: contacts.value.filter((user) => user.department === name).length }))
  ];
});

const groupedContacts = computed(() => {
  if (activeGroup.value === "all") return contacts.value;
  if (activeGroup.value === "care") return contacts.value.filter((user) => store.isCareContact(user.id));
  return contacts.value.filter((user) => user.department === activeGroup.value);
});

const normalizedSearchText = computed(() => searchText.value.trim().toLowerCase());
const filteredContacts = computed(() => {
  const query = normalizedSearchText.value;
  const list = groupedContacts.value;
  if (!query) return list;
  return list.filter((user) => [user.name, user.department, user.email, user.phone, user.mbti, user.job].some((field) => String(field || "").toLowerCase().includes(query)));
});

const selectedUsers = computed(() => contacts.value.filter((user) => selectedUserIds.value.includes(user.id) && !currentMemberNames.value.has(user.name)));
const selectedCountLabel = computed(() => (selectedUsers.value.length ? `已选${selectedUsers.value.length}人` : "可多选成员"));

function isAlreadyMember(user) {
  return currentMemberNames.value.has(user.name);
}

function addSelectedUsers() {
  store.inviteMembers(selectedUsers.value.map((user) => user.name));
  selectedUserIds.value = [];
}

function membersByRole(role) {
  return (store.activeMembersDetailed || []).filter((member) => member.role === role);
}

function setUserRole(member, role) {
  store.setMemberRole(member.name, role);
}

function removeUser(member) {
  store.removeMember(member.name);
}

function close() {
  visible.value = false;
}

watch(visible, (isVisible) => {
  if (!isVisible) selectedUserIds.value = [];
});
</script>

<template>
  <el-dialog
    v-model="visible"
    class="collaboration-dialog-shell"
    width="min(1180px, calc(100vw - 72px))"
    :show-close="false"
    align-center
    append-to-body
  >
    <section class="collaboration-directory" aria-label="协同成员">
      <aside class="collaboration-rail">
        <button
          v-for="item in groupItems"
          :key="item.key"
          class="collaboration-group-item"
          :class="{ 'is-active': item.key === activeGroup }"
          type="button"
          @click="activeGroup = item.key"
        >
          <b>{{ item.label }}</b>
          <span>{{ item.count }}</span>
        </button>
      </aside>

      <main class="collaboration-picker">
        <button class="collaboration-close" type="button" aria-label="关闭协同成员" @click="close">×</button>
        <header class="collaboration-titlebar">
          <strong>协同列表</strong>
          <label class="collaboration-search" aria-label="搜索协同成员">
            <input v-model="searchText" type="search" placeholder="搜索姓名、部门、邮箱、电话" />
          </label>
          <small>{{ selectedCountLabel }}</small>
        </header>

        <div class="collaboration-list">
          <label
            v-for="user in filteredContacts"
            :key="user.id"
            class="collaboration-user-row"
            :class="{ 'is-disabled': isAlreadyMember(user) }"
          >
            <span class="collaboration-avatar">{{ user.avatar || String(user.name || "成").slice(0, 1) }}</span>
            <span>
              <strong>{{ user.name }}</strong>
              <small>{{ user.department || "未分组" }} · {{ user.job || user.mbti || "协同成员" }}</small>
            </span>
            <input v-model="selectedUserIds" type="checkbox" :value="user.id" :disabled="isAlreadyMember(user)" />
          </label>
          <div v-if="!filteredContacts.length" class="empty-state compact">没有找到匹配的同学</div>
        </div>

        <button class="solid compact collaboration-add-selected" type="button" :disabled="!selectedUsers.length" @click="addSelectedUsers">加入项目</button>
      </main>

      <aside class="collaboration-permissions">
        <header>
          <strong>协同权限</strong>
          <small>可添加或删除协同成员</small>
        </header>
        <section v-for="role in roles" :key="role.key" class="permission-column">
          <h4>{{ role.label }}</h4>
          <div class="permission-list">
            <article v-for="member in membersByRole(role.key)" :key="member.id || member.name" class="permission-member">
              <span class="avatar mini-avatar">{{ member.avatar }}</span>
              <strong>{{ member.name }}</strong>
              <small>{{ member.department }}</small>
              <select :value="member.role" @change="setUserRole(member, $event.target.value)">
                <option v-for="item in roles" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
              <button type="button" @click="removeUser(member)">删除</button>
            </article>
            <div v-if="!membersByRole(role.key).length" class="empty-state compact">暂无成员</div>
          </div>
        </section>
      </aside>
    </section>
  </el-dialog>
</template>
