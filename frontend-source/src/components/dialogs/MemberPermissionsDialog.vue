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
const expandedGroupKeys = ref(["art-design", "post-composition"]);

const roles = [
  { key: "manager", label: "管理", helper: "项目管理与成员维护" },
  { key: "editor", label: "编辑", helper: "任务编辑与协作执行" },
  { key: "readonly", label: "只读", helper: "查看项目与评论协同" }
];

const departmentTreeConfig = [
  {
    key: "project-management",
    label: "项目管理",
    icon: "项",
    keys: ["project-management", "project", "pm"],
    departments: ["项目管理", "项目管理部"],
    prefixes: ["项目管理"]
  },
  {
    key: "aigc",
    label: "AIGC",
    icon: "AI",
    keys: ["aigc", "ai"],
    departments: ["AIGC", "AIGC设计", "AI生成", "智能生成"],
    prefixes: ["AIGC", "AI生成", "智能生成"]
  },
  {
    key: "art-design",
    label: "美术设计",
    icon: "美",
    keys: ["art-design", "design", "design-1", "design-2"],
    departments: ["美术设计", "美术设计部", "美术设计一部", "美术设计二部"],
    prefixes: ["美术设计"],
    children: [
      { key: "art-design-1", label: "美术设计一部", keys: ["art-design-1", "design-1"], departments: ["美术设计一部"], prefixes: ["美术设计一部"] },
      { key: "art-design-2", label: "美术设计二部", keys: ["art-design-2", "design-2"], departments: ["美术设计二部"], prefixes: ["美术设计二部"] }
    ]
  },
  {
    key: "three-dynamic",
    label: "三维动态",
    icon: "3D",
    keys: ["three-dynamic", "3d-dynamic", "threeD", "threed", "3d"],
    departments: ["三维动态", "三维动态设计部", "三维设计", "三维动画", "三维视觉部"],
    prefixes: ["三维动态", "三维设计", "三维动画", "三维视觉"]
  },
  {
    key: "motion-design",
    label: "动效设计",
    icon: "动",
    keys: ["motion-design", "motion"],
    departments: ["动效设计", "动效设计部", "动画动效", "动画设计", "动效组"],
    prefixes: ["动效设计", "动效", "动画动效", "动画设计"]
  },
  {
    key: "post-composition",
    label: "视效包装",
    icon: "视",
    keys: ["post-composition", "effect-packaging", "post", "post-1", "post-2", "post-3"],
    departments: ["视效包装", "视效包装部", "后期合成", "后期合成部", "后期设计"],
    prefixes: ["视效包装", "后期合成", "后期设计"],
    children: [
      {
        key: "post-composition-1",
        label: "视效包装一部",
        keys: ["post-composition-1", "effect-packaging-1", "post-1"],
        departments: ["视效包装一部", "视效1部", "视效1", "视效一部", "后期合成一部", "后期设计一部"],
        prefixes: ["视效包装一部", "视效1", "视效一部", "后期合成一部", "后期设计一部"]
      },
      {
        key: "post-composition-2",
        label: "视效包装二部",
        keys: ["post-composition-2", "effect-packaging-2", "post-2"],
        departments: ["视效包装二部", "视效2部", "视效2", "视效二部", "后期合成二部", "后期设计二部"],
        prefixes: ["视效包装二部", "视效2", "视效二部", "后期合成二部", "后期设计二部"]
      },
      {
        key: "post-composition-3",
        label: "视效包装三部",
        keys: ["post-composition-3", "effect-packaging-3", "post-3"],
        departments: ["视效包装三部", "视效3部", "视效3", "视效三部", "后期合成三部", "后期设计三部"],
        prefixes: ["视效包装三部", "视效3", "视效三部", "后期合成三部", "后期设计三部"]
      }
    ]
  }
];

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const activeMembers = computed(() => store.activeMembersDetailed || []);
const currentMemberNames = computed(() => new Set(activeMembers.value.map((member) => member.name)));
const contacts = computed(() =>
  (store.activeUsers || [])
    .filter((user) => user.role !== "admin")
    .sort((a, b) =>
      departmentSortValue(a) - departmentSortValue(b) ||
      String(displayDepartment(a)).localeCompare(String(displayDepartment(b)), "zh-Hans") ||
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans")
    )
);

const primaryGroupItems = computed(() => [
  { key: "all", label: "全部好友", icon: "全", count: contacts.value.length },
  { key: "care", label: "关注好友", icon: "关", count: contacts.value.filter((user) => store.isCareContact(user.id)).length }
]);

const departmentTreeItems = computed(() => departmentTreeConfig.map((item) => withDepartmentCount(item)));
const groupItems = computed(() => [
  ...primaryGroupItems.value,
  ...departmentTreeItems.value.flatMap((item) => [item, ...(item.children || [])])
]);

const activeGroupItem = computed(() => groupItems.value.find((item) => item.key === activeGroup.value) || primaryGroupItems.value[0]);
const activeGroupLabel = computed(() => activeGroupItem.value?.label || "全部好友");
const groupedContacts = computed(() => {
  if (activeGroup.value === "all") return contacts.value;
  if (activeGroup.value === "care") return contacts.value.filter((user) => store.isCareContact(user.id));
  const item = activeGroupItem.value;
  if (!item) return contacts.value;
  return contacts.value.filter((user) => matchesDepartment(user, item));
});
const activeGroupCount = computed(() => groupedContacts.value.length);

const normalizedSearchText = computed(() => searchText.value.trim().toLowerCase());
const filteredContacts = computed(() => {
  const query = normalizedSearchText.value;
  const list = groupedContacts.value;
  if (!query) return list;
  return list.filter((user) =>
    [user.name, user.department, user.displayDepartment, displayDepartment(user), user.job, user.mbti, user.email, user.phone]
      .some((field) => String(field || "").toLowerCase().includes(query))
  );
});

const selectedUsers = computed(() =>
  contacts.value.filter((user) => selectedUserIds.value.includes(user.id) && !currentMemberNames.value.has(user.name))
);
const selectedCountLabel = computed(() => (selectedUsers.value.length ? `已选 ${selectedUsers.value.length} 人` : "已选 0 人"));
const availableFilteredCount = computed(() => filteredContacts.value.filter((user) => !isAlreadyMember(user)).length);
const allVisibleSelected = computed(() => {
  const visibleIds = filteredContacts.value.filter((user) => !isAlreadyMember(user)).map((user) => user.id);
  return Boolean(visibleIds.length) && visibleIds.every((id) => selectedUserIds.value.includes(id));
});

function normalizeDepartment(value) {
  return String(value || "").trim();
}

function compactDepartment(value) {
  return normalizeDepartment(value).replace(/[\s\-_:：/\\|>]+/g, "").toLowerCase();
}

function departmentCandidates(source) {
  if (!source || typeof source !== "object") return [normalizeDepartment(source)].filter(Boolean);
  return [
    source.departmentKey,
    source.department_key,
    source.departmentId,
    source.department_id,
    source.departmentAliasKey,
    source.childDepartmentKey,
    source.displayDepartment,
    source.display_department,
    source.departmentLabel,
    source.department_label,
    source.departmentName,
    source.department_name,
    source.department
  ].map(normalizeDepartment).filter(Boolean);
}

function matchesDepartment(value, item) {
  const candidates = departmentCandidates(value);
  if (!candidates.length) return false;

  const itemKeys = [item.key, ...(item.keys || [])].map(compactDepartment).filter(Boolean);
  if (candidates.some((candidate) => itemKeys.includes(compactDepartment(candidate)))) return true;

  return candidates.some((department) => {
    if ((item.departments || []).includes(department)) return true;
    return (item.prefixes || []).some((prefix) => department.startsWith(prefix));
  });
}

function countDepartmentUsers(item) {
  return contacts.value.filter((user) => matchesDepartment(user, item)).length;
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

function departmentSortValue(source) {
  const index = departmentTreeConfig.findIndex((item) => matchesDepartment(source, item));
  return index === -1 ? departmentTreeConfig.length : index;
}

function displayDepartment(source) {
  const department = typeof source === "object"
    ? normalizeDepartment(source?.displayDepartment || source?.departmentLabel || source?.departmentName || source?.department)
    : normalizeDepartment(source);
  if (!department) return "未分组";
  const matchedRoot = departmentTreeConfig.find((item) => matchesDepartment(source, item));
  const matchedChild = matchedRoot?.children?.find((item) => matchesDepartment(source, item));
  if (matchedChild) return matchedChild.label;
  if (matchedRoot) return matchedRoot.label;
  return department;
}

function isGroupExpanded(key) {
  return expandedGroupKeys.value.includes(key);
}

function hasDepartmentChildren(item) {
  const children = item.children || [];
  return Boolean(children.length);
}

function setGroupExpansion(key, expanded) {
  if (isGroupExpanded(key) === expanded) return;
  expandedGroupKeys.value = expanded
    ? [...expandedGroupKeys.value, key]
    : expandedGroupKeys.value.filter((item) => item !== key);
}

function toggleGroupExpansion(item) {
  if (!hasDepartmentChildren(item)) return;
  setGroupExpansion(item.key, !isGroupExpanded(item.key));
}

function toggleDepartmentTree(item) {
  toggleGroupExpansion(item);
}

function selectGroup(item) {
  activeGroup.value = item.key;
  if (hasDepartmentChildren(item)) setGroupExpansion(item.key, true);
}

function isBranchActive(item) {
  return activeGroup.value === item.key || (item.children || []).some((child) => child.key === activeGroup.value);
}

function departmentToggleLabel(item) {
  return `${isGroupExpanded(item.key) ? "收起" : "展开"}${item.label}子部门`;
}

function departmentTreeItemLabel(item) {
  if (!hasDepartmentChildren(item)) return `筛选${item.label}，${item.count}人`;
  return `筛选${item.label}，${item.count}人，子部门${isGroupExpanded(item.key) ? "已展开" : "已收起"}`;
}

function departmentChildrenId(item) {
  return `collaboration-subtree-${item.key}`;
}

function avatarLabel(person) {
  return String(person?.avatar || person?.name || "协").slice(0, 1);
}

function isAlreadyMember(user) {
  return currentMemberNames.value.has(user.name);
}

function toggleVisibleSelection() {
  const visibleIds = filteredContacts.value.filter((user) => !isAlreadyMember(user)).map((user) => user.id);
  if (allVisibleSelected.value) {
    selectedUserIds.value = selectedUserIds.value.filter((id) => !visibleIds.includes(id));
    return;
  }
  selectedUserIds.value = [...new Set([...selectedUserIds.value, ...visibleIds])];
}

function clearSelection() {
  selectedUserIds.value = [];
}

function removeSelectedChip(user) {
  selectedUserIds.value = selectedUserIds.value.filter((id) => id !== user.id);
}

function addSelectedUsers() {
  if (!selectedUsers.value.length) return;
  store.inviteMembers(selectedUsers.value.map((user) => user.name));
  selectedUserIds.value = [];
}

function membersByRole(role) {
  return activeMembers.value.filter((member) => member.role === role);
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
  if (!isVisible) {
    selectedUserIds.value = [];
    searchText.value = "";
  }
});
</script>

<template>
  <el-dialog
    v-model="visible"
    class="collaboration-dialog-shell"
    width="min(1120px, calc(100vw - 56px))"
    :show-close="false"
    :close-on-click-modal="false"
    align-center
    append-to-body
  >
    <section class="collaboration-directory" aria-label="协同成员" @click.stop>
      <aside class="collaboration-rail">
        <header class="collaboration-rail-heading">
          <span>协同范围</span>
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
            <div class="collaboration-branch-row">
              <button
                v-if="hasDepartmentChildren(item)"
                class="collaboration-node-caret"
                :class="{ 'is-open': isGroupExpanded(item.key) }"
                type="button"
                :aria-label="departmentToggleLabel(item)"
                :aria-expanded="isGroupExpanded(item.key)"
                :aria-controls="departmentChildrenId(item)"
                @click.stop="toggleDepartmentTree(item)"
              >
                <span aria-hidden="true"></span>
              </button>
              <span v-else class="collaboration-node-spacer" aria-hidden="true"></span>

              <button
                class="collaboration-tree-node collaboration-group-item"
                :class="{ 'is-active': item.key === activeGroup, 'has-children': hasDepartmentChildren(item) }"
                type="button"
                role="treeitem"
                :aria-label="departmentTreeItemLabel(item)"
                :aria-expanded="hasDepartmentChildren(item) ? isGroupExpanded(item.key) : undefined"
                :aria-controls="hasDepartmentChildren(item) ? departmentChildrenId(item) : undefined"
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

            <div
              v-if="hasDepartmentChildren(item)"
              v-show="isGroupExpanded(item.key)"
              :id="departmentChildrenId(item)"
              class="collaboration-subtree"
              role="group"
              :aria-hidden="!isGroupExpanded(item.key)"
            >
              <div v-for="child in item.children" :key="child.key" class="collaboration-child-row">
                <span class="collaboration-node-spacer is-child-spacer" aria-hidden="true"></span>
                <button
                  class="collaboration-tree-node is-child"
                  :class="{ 'is-active': child.key === activeGroup }"
                  type="button"
                  role="treeitem"
                  :aria-label="`筛选${child.label}，${child.count}人`"
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
            <input v-model="searchText" type="search" placeholder="搜索姓名、部门或协同职能" />
          </label>
          <small class="collaboration-selected-count">{{ selectedCountLabel }}</small>
        </header>

        <div class="collaboration-bulkbar" aria-label="协同批量选择">
          <button type="button" :disabled="!availableFilteredCount" @click="toggleVisibleSelection">
            {{ allVisibleSelected ? "取消本组" : "勾选本组" }}
          </button>
          <button type="button" :disabled="!selectedUserIds.length" @click="clearSelection">清空选择</button>
        </div>

        <section class="collaboration-selected-board" aria-label="已选择协同成员">
          <header>
            <span>已选择成员</span>
            <b>{{ selectedUsers.length }}</b>
          </header>
          <div class="collaboration-selected-list">
            <button
              v-for="user in selectedUsers"
              :key="user.id"
              class="collaboration-selected-chip"
              type="button"
              :aria-label="`取消选择${user.name}`"
              @click="removeSelectedChip(user)"
            >
              <span>{{ user.name }}</span>
              <i aria-hidden="true">×</i>
            </button>
            <span v-if="!selectedUsers.length" class="collaboration-selected-empty">跨部门勾选后会显示在这里</span>
          </div>
        </section>

        <div class="collaboration-list">
          <label
            v-for="user in filteredContacts"
            :key="user.id"
            class="collaboration-user-row"
            :class="{ 'is-disabled': isAlreadyMember(user), 'is-selected': selectedUserIds.includes(user.id) && !isAlreadyMember(user) }"
          >
            <input
              v-model="selectedUserIds"
              class="collaboration-row-check"
              type="checkbox"
              :value="user.id"
              :disabled="isAlreadyMember(user)"
              :aria-label="`选择${user.name}加入项目`"
            />
            <span class="collaboration-avatar">{{ avatarLabel(user) }}</span>
            <span class="collaboration-user-copy">
              <strong>{{ user.name }}</strong>
              <small>{{ displayDepartment(user) }} · {{ user.job || user.mbti || "协同成员" }}</small>
            </span>
            <span v-if="isAlreadyMember(user)" class="collaboration-member-status">已在项目</span>
          </label>
          <div v-if="!filteredContacts.length" class="empty-state compact collaboration-empty">没有匹配的协同成员</div>
        </div>

        <footer class="collaboration-picker-footer">
          <span>{{ availableFilteredCount }} 位可加入</span>
          <button class="solid compact collaboration-add-selected" type="button" :disabled="!selectedUsers.length" @click="addSelectedUsers">
            加入项目
          </button>
        </footer>
      </main>

      <aside class="collaboration-permissions">
        <header class="permissions-heading">
          <div>
            <strong>协同权限</strong>
            <small>{{ activeMembers.length }} 位项目成员</small>
          </div>
        </header>
        <section v-for="role in roles" :key="role.key" class="permission-column">
          <h4>
            <span>{{ role.label }}</span>
            <small>{{ membersByRole(role.key).length }}</small>
          </h4>
          <p>{{ role.helper }}</p>
          <div class="permission-list">
            <article v-for="member in membersByRole(role.key)" :key="member.id || member.name" class="permission-member">
              <span class="avatar mini-avatar permission-avatar">{{ avatarLabel(member) }}</span>
              <span class="permission-member-copy">
                <strong>{{ member.name }}</strong>
                <small>{{ displayDepartment(member) }}</small>
              </span>
              <select class="permission-role-select" :value="member.role" :aria-label="`调整${member.name}权限`" @change="setUserRole(member, $event.target.value)">
                <option v-for="item in roles" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
              <button class="permission-remove" type="button" :aria-label="`移除${member.name}`" @click="removeUser(member)">删除</button>
            </article>
            <div v-if="!membersByRole(role.key).length" class="empty-state compact permission-empty">暂无成员</div>
          </div>
        </section>
      </aside>
    </section>
  </el-dialog>
</template>

<style scoped>
.collaboration-directory {
  --collab-accent: #2f7fd6;
  --collab-accent-soft: #eef6ff;
  --collab-bg: #f3f5f7;
  --collab-line: #d9e0e6;
  --collab-line-soft: #e8edf1;
  --collab-muted: #7b8791;
  --collab-panel: #fbfcfd;
  --collab-text: #26313c;
  display: grid;
  grid-template-columns: minmax(194px, 220px) minmax(390px, 1fr) minmax(314px, 354px);
  min-width: 0;
  height: min(690px, calc(100vh - 82px));
  min-height: 0;
  color: var(--collab-text);
  background: var(--collab-bg);
}

.collaboration-rail,
.collaboration-picker,
.collaboration-permissions {
  min-width: 0;
  min-height: 0;
}

.collaboration-rail {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 18px 10px 14px;
  overflow: auto;
  border-right: 1px solid var(--collab-line);
  background: #f8fafb;
}

.collaboration-rail-heading,
.collaboration-titlebar,
.permissions-heading {
  border-bottom: 1px solid var(--collab-line);
}

.collaboration-rail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 8px 10px;
  color: #56636f;
  font-size: 12px;
  font-weight: 800;
}

.collaboration-rail-heading strong,
.collaboration-node-count {
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #fff;
  font-weight: 800;
}

.collaboration-rail-heading strong {
  min-width: 30px;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--collab-line);
  color: #51606d;
  font-size: 11px;
}

.collaboration-tree,
.collaboration-tree-branch {
  display: grid;
  gap: 3px;
}

.collaboration-branch-row,
.collaboration-child-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 2px;
}

.collaboration-tree-node {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 34px;
  padding: 0 8px 0 10px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #52606b;
  background: transparent;
  text-align: left;
  box-shadow: none;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.collaboration-tree-node::before {
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: transparent;
  content: "";
}

.collaboration-tree-node:hover {
  border-color: var(--collab-line);
  background: #fff;
}

.collaboration-tree-node.is-active {
  border-color: #c8dff5;
  color: #1f67ad;
  background: var(--collab-accent-soft);
}

.collaboration-tree-node.is-active::before {
  background: var(--collab-accent);
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
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collaboration-node-icon {
  display: grid;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid #d5dee6;
  border-radius: 50%;
  color: #627383;
  background: #fff;
  font-size: 10px;
  font-weight: 900;
}

.collaboration-tree-node.is-active .collaboration-node-icon {
  border-color: #b8d7f2;
  color: var(--collab-accent);
}

.collaboration-node-count {
  min-width: 24px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid var(--collab-line-soft);
  color: #82909b;
  font-size: 11px;
}

.collaboration-node-caret,
.collaboration-node-spacer {
  width: 20px;
  height: 30px;
}

.collaboration-node-caret {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: #7c8a95;
  background: transparent;
  box-shadow: none;
}

.collaboration-node-caret:hover {
  color: #3c4b57;
  background: #edf1f4;
}

.collaboration-node-caret:focus-visible,
.collaboration-tree-node:focus-visible,
.collaboration-row-check:focus-visible,
.permission-role-select:focus-visible,
.permission-remove:focus-visible,
.collaboration-add-selected:focus-visible,
.collaboration-close:focus-visible,
.collaboration-bulkbar button:focus-visible {
  outline: 2px solid rgba(47, 127, 214, 0.24);
  outline-offset: 2px;
}

.collaboration-node-caret span {
  display: block;
  width: 7px;
  height: 7px;
  border-right: 1.6px solid currentColor;
  border-bottom: 1.6px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.16s ease;
}

.collaboration-node-caret.is-open span {
  transform: rotate(45deg);
}

.collaboration-subtree {
  display: grid;
  gap: 2px;
  margin-left: 9px;
  padding-left: 9px;
  border-left: 1px solid var(--collab-line);
}

.collaboration-tree-node.is-child {
  min-height: 31px;
  padding-left: 8px;
}

.collaboration-node-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9aa7b1;
}

.collaboration-picker {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 10px;
  padding: 18px 18px 14px;
  background: var(--collab-panel);
}

.collaboration-close {
  position: absolute;
  z-index: 1;
  top: 8px;
  right: 10px;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0 !important;
  border-radius: 50%;
  color: #8b98a3;
  background: transparent !important;
  font-size: 20px;
  line-height: 1;
  box-shadow: none;
}

.collaboration-close:hover {
  color: #394854;
  background: #eef2f5 !important;
  transform: none;
}

.collaboration-titlebar {
  display: grid;
  grid-template-columns: minmax(112px, auto) minmax(190px, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 34px 12px 0;
}

.collaboration-title,
.permissions-heading div {
  display: grid;
  gap: 2px;
}

.collaboration-title strong,
.permissions-heading strong {
  color: var(--collab-text);
  font-size: 16px;
  line-height: 1.25;
}

.collaboration-title span,
.collaboration-selected-count,
.permissions-heading small {
  color: var(--collab-muted);
  font-size: 12px;
  line-height: 1.35;
}

.collaboration-search {
  min-width: 0;
}

.collaboration-search input {
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #cfd9e2;
  border-radius: 4px;
  color: var(--collab-text);
  background: #fff;
  font-size: 13px;
}

.collaboration-search input:focus {
  border-color: #8ebce9;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(47, 127, 214, 0.12);
}

.collaboration-selected-count {
  justify-self: end;
  min-width: 58px;
  text-align: right;
  white-space: nowrap;
}

.collaboration-bulkbar {
  display: flex;
  gap: 8px;
}

.collaboration-bulkbar button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d5dfe8;
  border-radius: 4px;
  color: #4f6171;
  background: #fff;
  font-size: 12px;
  font-weight: 800;
}

.collaboration-bulkbar button:hover:not(:disabled) {
  border-color: #b8d7f2;
  color: #2f7fd6;
  background: #eef6ff;
}

.collaboration-bulkbar button:disabled {
  color: #a3adb6;
  background: #f0f3f5;
}

.collaboration-selected-board {
  display: grid;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--collab-line-soft);
  border-radius: 4px;
  background: #f9fcff;
}

.collaboration-selected-board header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #637485;
  font-size: 12px;
  font-weight: 800;
}

.collaboration-selected-board header b {
  display: grid;
  min-width: 24px;
  height: 18px;
  place-items: center;
  padding: 0 6px;
  border: 1px solid #d8e6f5;
  border-radius: 999px;
  color: var(--collab-accent);
  background: #fff;
  font-size: 11px;
}

.collaboration-selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
}

.collaboration-selected-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  height: 24px;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid #cfe2f6;
  border-radius: 999px;
  color: #2e6dad;
  background: #fff;
  box-shadow: none;
  font-size: 12px;
}

.collaboration-selected-chip:hover {
  border-color: #b8d7f2;
  background: #eef6ff;
  transform: none;
}

.collaboration-selected-chip span {
  max-width: 148px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collaboration-selected-chip i {
  color: #8fa4b8;
  font-style: normal;
}

.collaboration-selected-empty {
  color: #8c98a3;
  font-size: 12px;
  line-height: 24px;
}

.collaboration-list {
  display: grid;
  align-content: start;
  gap: 5px;
  min-height: 0;
  padding-right: 2px;
  overflow: auto;
}

.collaboration-user-row {
  display: grid;
  grid-template-columns: 18px 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 8px;
  border: 1px solid var(--collab-line-soft);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.collaboration-user-row:hover {
  border-color: #c9d5df;
  background: #fafdff;
}

.collaboration-user-row.is-selected {
  border-color: #bcd7f0;
  background: #f3f9ff;
}

.collaboration-user-row.is-disabled {
  cursor: default;
  opacity: 0.66;
  background: #f6f8f9;
}

.collaboration-row-check {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--collab-accent);
}

.collaboration-avatar,
.permission-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 50%;
  color: #fff;
  background: #6c9fd0;
  font-weight: 900;
}

.collaboration-avatar {
  width: 30px;
  height: 30px;
  font-size: 12px;
}

.collaboration-user-copy,
.permission-member-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.collaboration-user-copy strong,
.collaboration-user-copy small,
.permission-member-copy strong,
.permission-member-copy small {
  min-width: 0;
  overflow: hidden;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collaboration-user-copy strong,
.permission-member-copy strong {
  color: var(--collab-text);
  font-size: 13px;
  line-height: 1.25;
}

.collaboration-user-copy small,
.permission-member-copy small {
  color: var(--collab-muted);
  font-size: 11px;
  line-height: 1.25;
}

.collaboration-member-status {
  padding: 2px 7px;
  border: 1px solid #d7e0e7;
  border-radius: 999px;
  color: #74818c;
  background: #f3f6f8;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.collaboration-empty,
.permission-empty {
  border: 1px dashed #cfd9e2;
  border-radius: 4px;
  color: #86929d;
  background: #fff;
}

.collaboration-picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  padding-top: 12px;
  border-top: 1px solid var(--collab-line);
  color: var(--collab-muted);
  font-size: 12px;
}

.collaboration-add-selected.solid.compact {
  min-width: 104px;
  min-height: 32px;
  padding: 0 16px;
  border: 1px solid #236fbd !important;
  border-radius: 4px;
  color: #fff !important;
  background: var(--collab-accent) !important;
  box-shadow: none;
  font-weight: 900;
}

.collaboration-add-selected.solid.compact:hover:not(:disabled) {
  border-color: #1d67b0 !important;
  background: #256fbf !important;
  transform: none;
}

.collaboration-add-selected.solid.compact:disabled {
  border-color: #d4dde5 !important;
  color: #9aa6b0 !important;
  background: #edf1f4 !important;
  box-shadow: none;
  cursor: not-allowed;
}

.collaboration-permissions {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 18px 14px 14px;
  overflow: auto;
  border-left: 1px solid var(--collab-line);
  background: #f8fafb;
}

.permissions-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  padding-bottom: 12px;
}

.permission-column {
  display: grid;
  gap: 8px;
  min-height: 0;
  padding: 0 0 12px;
  border: 0;
  border-bottom: 1px solid var(--collab-line);
  border-radius: 0;
  background: transparent;
}

.permission-column h4 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  color: #33414d;
  font-size: 13px;
  font-weight: 900;
}

.permission-column h4 small {
  display: grid;
  min-width: 22px;
  height: 18px;
  place-items: center;
  padding: 0 6px;
  border: 1px solid var(--collab-line);
  border-radius: 999px;
  color: #75828c;
  background: #fff;
  font-size: 11px;
}

.permission-column p {
  min-height: 0;
  margin: 0;
  color: #89949e;
  font-size: 11px;
  line-height: 1.35;
}

.permission-list {
  display: grid;
  gap: 5px;
  min-height: 0;
}

.permission-member {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 76px 44px;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 6px 7px;
  border: 1px solid var(--collab-line-soft);
  border-radius: 4px;
  background: #fff;
  box-shadow: none;
  cursor: default;
}

.permission-avatar {
  width: 30px;
  height: 30px;
  margin-left: 0;
  border: 0;
  font-size: 12px;
}

.permission-role-select {
  width: 76px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid #cfd9e2;
  border-radius: 4px;
  color: #33414d;
  background: #fff;
  font-size: 12px;
}

.permission-remove {
  width: 44px;
  height: 28px;
  padding: 0;
  border: 1px solid #ead0d0;
  border-radius: 4px;
  color: #c44747;
  background: #fff7f7;
  box-shadow: none;
  font-size: 12px;
  font-weight: 800;
}

.permission-remove:hover {
  border-color: #d7a9a9;
  color: #a93535;
  background: #ffecec;
  transform: none;
}

@media (max-width: 980px), (max-height: 760px) {
  .collaboration-directory {
    grid-template-columns: minmax(178px, 204px) minmax(330px, 1fr) minmax(286px, 326px);
  }

  .collaboration-picker {
    padding: 16px 14px 12px;
  }

  .collaboration-titlebar {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 8px;
    padding-right: 34px;
  }

  .collaboration-selected-count {
    justify-self: start;
    text-align: left;
  }

  .permission-member {
    grid-template-columns: 30px minmax(0, 1fr) 70px 42px;
  }
}

@media (max-width: 760px), (max-height: 620px) {
  .collaboration-directory {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "rail"
      "picker"
      "permissions";
    overflow: auto;
  }

  .collaboration-rail {
    grid-area: rail;
    max-height: 210px;
    padding: 12px;
    border-right: 0;
    border-bottom: 1px solid var(--collab-line);
  }

  .collaboration-picker {
    grid-area: picker;
    min-height: 330px;
  }

  .collaboration-permissions {
    grid-area: permissions;
    border-top: 1px solid var(--collab-line);
    border-left: 0;
  }

  .collaboration-user-row {
    grid-template-columns: 18px 30px minmax(0, 1fr);
  }

  .collaboration-member-status {
    grid-column: 3;
    justify-self: start;
  }
}
</style>
