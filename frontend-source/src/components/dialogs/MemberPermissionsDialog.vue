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

const departmentTreeConfig = [
  {
    key: "project-management",
    label: "项目管理",
    icon: "项",
    departments: ["项目管理", "项目管理部"],
    prefixes: ["项目管理"]
  },
  {
    key: "art-design",
    label: "美术设计",
    icon: "美",
    departments: ["美术设计"],
    prefixes: ["美术设计"],
    children: [
      { key: "art-design-1", label: "美术设计一部", departments: ["美术设计一部"] },
      { key: "art-design-2", label: "美术设计二部", departments: ["美术设计二部"] }
    ]
  },
  {
    key: "three-dimensional-design",
    label: "三维动态设计部",
    icon: "3D",
    departments: ["三维设计", "三维动态", "三维动态设计部", "三维动画"],
    prefixes: ["三维动态设计", "三维设计", "三维动画"]
  },
  {
    key: "visual-packaging",
    label: "视效包装",
    icon: "视",
    departments: ["视效包装"],
    prefixes: ["视效包装"],
    children: [
      { key: "visual-packaging-1", label: "视效包装一部", departments: ["视效包装一部"] },
      { key: "visual-packaging-2", label: "视效包装二部", departments: ["视效包装二部"] },
      { key: "visual-packaging-3", label: "视效包装三部", departments: ["视效包装三部"] }
    ]
  }
];

const expandedGroupKeys = ref(["art-design"]);

const currentMemberNames = computed(() => new Set((store.activeMembersDetailed || []).map((member) => member.name)));
const contacts = computed(() =>
  (store.activeUsers || [])
    .filter((user) => user.role !== "admin")
    .sort((a, b) =>
      String(a.department || "").localeCompare(String(b.department || ""), "zh-Hans") ||
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans")
    )
);

const primaryGroupItems = computed(() => [
  { key: "all", label: "全部好友", icon: "全", count: contacts.value.length },
  { key: "care", label: "关注好友", icon: "关", count: contacts.value.filter((user) => store.isCareContact(user.id)).length }
]);

const departmentTreeItems = computed(() => {
  return departmentTreeConfig.map((item) => withDepartmentCount(item));
});

const groupItems = computed(() => [
  ...primaryGroupItems.value,
  ...departmentTreeItems.value.flatMap((item) => [item, ...(item.children || [])])
]);

const activeGroupItem = computed(() => groupItems.value.find((item) => item.key === activeGroup.value) || primaryGroupItems.value[0]);
const activeGroupLabel = computed(() => activeGroupItem.value?.label || "全部好友");
const activeGroupCount = computed(() => groupedContacts.value.length);

const groupedContacts = computed(() => {
  if (activeGroup.value === "all") return contacts.value;
  if (activeGroup.value === "care") return contacts.value.filter((user) => store.isCareContact(user.id));
  const item = activeGroupItem.value;
  if (!item) return contacts.value;
  return contacts.value.filter((user) => matchesDepartment(user.department, item));
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

function normalizeDepartment(value) {
  return String(value || "").trim();
}

function matchesDepartment(value, item) {
  const department = normalizeDepartment(value);
  if (!department) return false;
  if ((item.departments || []).includes(department)) return true;
  return (item.prefixes || []).some((prefix) => department.startsWith(prefix));
}

function countDepartmentUsers(item) {
  return contacts.value.filter((user) => matchesDepartment(user.department, item)).length;
}

function withDepartmentCount(item) {
  const children = (item.children || []).map((child) => ({
    ...child,
    icon: child.icon || item.icon,
    count: countDepartmentUsers(child),
    children: []
  }));

  return {
    ...item,
    count: countDepartmentUsers(item),
    children
  };
}

function isGroupExpanded(key) {
  return expandedGroupKeys.value.includes(key);
}

function toggleGroupExpansion(key) {
  expandedGroupKeys.value = isGroupExpanded(key)
    ? expandedGroupKeys.value.filter((item) => item !== key)
    : [...expandedGroupKeys.value, key];
}

function toggleDepartmentTree(key) {
  toggleGroupExpansion(key);
}

function selectGroup(item) {
  activeGroup.value = item.key;
  if (item.children?.length && !isGroupExpanded(item.key)) {
    toggleDepartmentTree(item.key);
  }
}

function isBranchActive(item) {
  return activeGroup.value === item.key || (item.children || []).some((child) => child.key === activeGroup.value);
}

function departmentToggleLabel(item) {
  return `${isGroupExpanded(item.key) ? "收起" : "展开"}${item.label}`;
}

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
        <header class="collaboration-rail-heading">
          <span>成员范围</span>
          <strong>{{ contacts.length }}</strong>
        </header>

        <nav class="collaboration-tree collaboration-department-tree" aria-label="协同成员部门树" role="tree">
          <button
            v-for="item in primaryGroupItems"
            :key="item.key"
            class="collaboration-tree-node is-shortcut"
            :class="{ 'is-active': item.key === activeGroup }"
            type="button"
            role="treeitem"
            :aria-selected="item.key === activeGroup"
            @click="selectGroup(item)"
          >
            <span class="collaboration-node-main">
              <span class="collaboration-node-icon">{{ item.icon }}</span>
              <b>{{ item.label }}</b>
            </span>
            <span class="collaboration-node-count">{{ item.count }}</span>
          </button>

          <div
            v-for="item in departmentTreeItems"
            :key="item.key"
            class="collaboration-tree-branch"
            :class="{ 'is-active-branch': isBranchActive(item), 'is-expanded': isGroupExpanded(item.key) }"
          >
            <div class="collaboration-branch-row" :class="{ 'is-active-branch': isBranchActive(item) }">
              <button
                v-if="item.children.length"
                class="collaboration-node-caret"
                :class="{ 'is-open': isGroupExpanded(item.key) }"
                type="button"
                :aria-label="departmentToggleLabel(item)"
                :aria-expanded="isGroupExpanded(item.key)"
                @click="toggleDepartmentTree(item.key)"
              >
                <span aria-hidden="true"></span>
              </button>
              <span v-else class="collaboration-node-spacer" aria-hidden="true"></span>

              <button
                class="collaboration-tree-node collaboration-group-item"
                :class="{ 'is-active': item.key === activeGroup, 'has-children': item.children.length }"
                type="button"
                role="treeitem"
                :aria-expanded="item.children.length ? isGroupExpanded(item.key) : undefined"
                :aria-selected="item.key === activeGroup"
                @click="selectGroup(item)"
              >
                <span class="collaboration-node-main">
                  <span class="collaboration-node-icon">{{ item.icon }}</span>
                  <b>{{ item.label }}</b>
                </span>
                <span class="collaboration-node-count">{{ item.count }}</span>
              </button>
            </div>

            <div v-if="item.children.length && isGroupExpanded(item.key)" class="collaboration-subtree" role="group">
              <div v-for="child in item.children" :key="child.key" class="collaboration-child-row">
                <span class="collaboration-node-spacer is-child-spacer" aria-hidden="true"></span>
                <button
                  class="collaboration-tree-node is-child"
                  :class="{ 'is-active': child.key === activeGroup }"
                  type="button"
                  role="treeitem"
                  :aria-selected="child.key === activeGroup"
                  @click="selectGroup(child)"
                >
                  <span class="collaboration-node-main">
                    <span class="collaboration-node-dot" aria-hidden="true"></span>
                    <b>{{ child.label }}</b>
                  </span>
                  <span class="collaboration-node-count">{{ child.count }}</span>
                </button>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      <main class="collaboration-picker">
        <button class="collaboration-close" type="button" aria-label="关闭协同成员" @click="close">×</button>
        <header class="collaboration-titlebar">
          <div class="collaboration-title">
            <strong>协同列表</strong>
            <span>{{ activeGroupLabel }} · {{ activeGroupCount }} 人</span>
          </div>
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
            <span v-if="isAlreadyMember(user)" class="collaboration-member-status">已加入</span>
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

<style scoped>
.collaboration-directory {
  --collab-line: #dde3e7;
  --collab-line-soft: #e9edf0;
  --collab-text: #26313a;
  --collab-muted: #78838b;
  --collab-bg: #f5f6f7;
  --collab-panel: #fbfcfc;
  --collab-accent: #62897f;
  --collab-accent-line: #9fb8b0;
  --collab-accent-soft: #edf4f2;
  grid-template-columns: minmax(218px, 244px) minmax(360px, 1fr) minmax(292px, 340px);
  color: var(--collab-text);
  background: var(--collab-bg);
}

.collaboration-rail {
  gap: 10px;
  padding: 22px 12px 18px;
  border-right: 1px solid var(--collab-line);
  background: #f7f8f9;
}

.collaboration-rail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 8px;
  border-bottom: 1px solid var(--collab-line-soft);
  color: var(--collab-muted);
  font-size: 12px;
  font-weight: 800;
}

.collaboration-rail-heading strong {
  display: grid;
  min-width: 28px;
  height: 20px;
  padding: 0 7px;
  place-items: center;
  border: 1px solid var(--collab-line);
  border-radius: 999px;
  color: #52635f;
  background: #ffffff;
}

.collaboration-tree {
  display: grid;
  gap: 3px;
}

.collaboration-tree-branch {
  display: grid;
  gap: 2px;
}

.collaboration-branch-row,
.collaboration-child-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 3px;
}

.collaboration-branch-row.is-active-branch {
  background: transparent;
}

.collaboration-tree-node {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #53606a;
  background: transparent;
  text-align: left;
  box-shadow: none;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.collaboration-tree-node:hover,
.collaboration-branch-row.is-active-branch > .collaboration-tree-node {
  border-color: var(--collab-line);
  color: #35443f;
  background: #ffffff;
}

.collaboration-tree-node.is-active {
  border-color: var(--collab-accent-line);
  color: #2f5149;
  background: var(--collab-accent-soft);
  box-shadow: inset 2px 0 0 var(--collab-accent);
}

.collaboration-node-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.collaboration-node-main b {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collaboration-node-icon {
  display: grid;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid #d7e0dc;
  border-radius: 5px;
  color: #586a65;
  background: #f4f7f6;
  font-size: 11px;
  font-weight: 900;
}

.collaboration-tree-node.is-shortcut .collaboration-node-icon {
  border-color: #e2ded2;
  color: #71634a;
  background: #faf7ef;
}

.collaboration-tree-node.is-active .collaboration-node-icon {
  border-color: #bfd1cb;
  color: #36564e;
  background: #ffffff;
}

.collaboration-node-caret,
.collaboration-node-spacer {
  width: 22px;
  height: 30px;
}

.collaboration-node-caret {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: #7c878d;
  background: transparent;
  box-shadow: none;
}

.collaboration-node-caret:hover,
.collaboration-node-caret:focus-visible {
  color: #394842;
  background: #eceff1;
}

.collaboration-node-caret:focus-visible,
.collaboration-tree-node:focus-visible {
  outline: 2px solid rgba(98, 137, 127, 0.24);
  outline-offset: 2px;
}

.collaboration-node-caret span {
  display: block;
  width: 7px;
  height: 7px;
  border-right: 1.8px solid currentColor;
  border-bottom: 1.8px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.16s ease;
}

.collaboration-node-caret.is-open span {
  transform: rotate(45deg);
}

.collaboration-node-count {
  display: grid;
  min-width: 24px;
  height: 19px;
  padding: 0 6px;
  place-items: center;
  border: 1px solid var(--collab-line-soft);
  border-radius: 999px;
  color: #738089;
  background: #ffffff;
  font-size: 11px;
  font-weight: 800;
}

.collaboration-tree-node.is-active .collaboration-node-count {
  border-color: #c9d8d3;
  color: #3d5e55;
  background: #ffffff;
}

.collaboration-subtree {
  display: grid;
  gap: 2px;
  margin: 2px 0 2px 9px;
  padding-left: 10px;
  border-left: 1px solid var(--collab-line);
}

.collaboration-tree-node.is-child {
  min-height: 31px;
  padding: 0 8px;
  font-size: 12px;
}

.collaboration-tree-node.is-child .collaboration-node-main {
  gap: 6px;
}

.collaboration-node-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #aeb9b5;
}

.collaboration-picker {
  background: #ffffff;
}

.collaboration-titlebar {
  grid-template-columns: minmax(124px, auto) minmax(180px, 1fr) auto;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--collab-line-soft);
}

.collaboration-title {
  display: grid;
  gap: 2px;
}

.collaboration-title strong {
  color: var(--collab-text);
  font-size: 16px;
}

.collaboration-title span,
.collaboration-titlebar small {
  color: var(--collab-muted);
  font-size: 12px;
}

.collaboration-search input {
  height: 30px;
  border-color: var(--collab-line);
  border-radius: 6px;
  color: var(--collab-text);
  background: #ffffff;
}

.collaboration-search input:focus {
  border-color: var(--collab-accent-line);
  outline: 0;
  box-shadow: 0 0 0 3px rgba(98, 137, 127, 0.12);
}

.collaboration-list {
  gap: 5px;
  padding-right: 3px;
}

.collaboration-user-row {
  grid-template-columns: 30px minmax(0, 1fr) auto 18px;
  gap: 8px;
  min-height: 43px;
  padding: 6px 9px;
  border-color: var(--collab-line-soft);
  border-radius: 6px;
  box-shadow: none;
}

.collaboration-user-row:hover {
  border-color: #cfd9dd;
  background: #fbfcfc;
}

.collaboration-user-row.is-disabled {
  opacity: 0.64;
  background: #f8f9f9;
}

.collaboration-user-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--collab-accent);
}

.collaboration-avatar {
  width: 30px;
  height: 30px;
  background: #78948c;
  font-size: 12px;
}

.collaboration-user-row strong {
  color: #26313a;
  font-size: 13px;
  line-height: 1.25;
}

.collaboration-user-row small {
  color: #7b868e;
  font-size: 11px;
  line-height: 1.25;
}

.collaboration-member-status {
  padding: 2px 6px;
  border: 1px solid #dbe2e5;
  border-radius: 999px;
  color: #78838b;
  background: #f4f6f6;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.collaboration-add-selected.solid.compact {
  min-width: 104px;
  min-height: 32px;
  border: 1px solid #557b72 !important;
  border-radius: 6px;
  color: #ffffff !important;
  background: #5f877d !important;
  box-shadow: none;
}

.collaboration-add-selected.solid.compact:hover:not(:disabled) {
  border-color: #486f66 !important;
  background: #52786f !important;
  transform: none;
}

.collaboration-add-selected.solid.compact:disabled {
  border-color: #d6dee1 !important;
  color: #9aa3a8 !important;
  background: #eef1f2 !important;
  box-shadow: none;
}

.collaboration-permissions {
  border-left: 1px solid var(--collab-line);
  background: #f7f8f9;
}

.collaboration-permissions > header {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--collab-line-soft);
}

.collaboration-permissions .permission-column {
  padding: 10px 0 12px;
  border: 0;
  border-bottom: 1px solid var(--collab-line-soft);
  border-radius: 0;
  background: transparent;
}

.collaboration-permissions .permission-column h4 {
  margin-bottom: 8px;
  color: #34413d;
  font-size: 13px;
}

.collaboration-permissions .permission-member {
  border-color: var(--collab-line-soft);
  border-radius: 6px;
  box-shadow: none;
}

@media (max-width: 980px), (max-height: 760px) {
  .collaboration-directory {
    grid-template-columns: minmax(198px, 220px) minmax(0, 1fr) minmax(260px, 320px);
  }

  .collaboration-titlebar {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px), (max-height: 620px) {
  .collaboration-directory {
    grid-template-columns: minmax(0, 1fr);
  }

  .collaboration-rail {
    max-height: 220px;
    padding: 14px;
  }

  .collaboration-user-row {
    grid-template-columns: 30px minmax(0, 1fr) 18px;
  }

  .collaboration-member-status {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
