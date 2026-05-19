<script setup>
import { computed, ref, shallowRef, watch } from "vue";
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

const activeGroup = shallowRef("all");
const searchText = shallowRef("");
const selectedUserIds = ref([]);
const expandedGroupKeys = ref(["art-design", "post-composition"]);
const editableUserIds = ref([]);
const readonlyUserIds = ref([]);

const roles = [
  { key: "edit", label: "可编辑" },
  { key: "read", label: "只读" }
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
    departments: ["AIGC", "AI生成", "智能生成", "AIGC设计"],
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
    departments: ["后期合成", "后期合成部", "视效包装", "视效包装部", "后期设计"],
    prefixes: ["后期合成", "视效包装", "后期设计"],
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

const templateTitle = computed(() => props.templateName || "未选择模板");
const kindLabel = computed(() => (props.templateKind === "schedule" ? "项目排期模板共享" : "项目任务模板共享"));
const currentUserKey = computed(() => userKey(store.currentUser));

function sortDepartmentLabel(user) {
  return displayDepartment(user);
}

function sortDepartmentOrder(user) {
  const index = departmentTreeConfig.findIndex((item) => matchesDepartment(user, item));
  return index === -1 ? departmentTreeConfig.length : index;
}

const activeUsers = computed(() =>
  (store.activeUsers || [])
    .filter((user) => user.role !== "admin" && userKey(user) !== currentUserKey.value)
    .sort((a, b) =>
      sortDepartmentOrder(a) - sortDepartmentOrder(b) ||
      sortDepartmentLabel(a).localeCompare(sortDepartmentLabel(b), "zh-Hans") ||
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans")
    )
);

const primaryGroupItems = computed(() => [
  { key: "all", label: "全部对象", icon: "全", count: activeUsers.value.length },
  { key: "care", label: "关注对象", icon: "关", count: activeUsers.value.filter((user) => store.isCareContact(user.id)).length }
]);

const departmentTreeItems = computed(() => departmentTreeConfig.map((item) => withDepartmentCount(item)));
const groupItems = computed(() => [
  ...primaryGroupItems.value,
  ...departmentTreeItems.value.flatMap((item) => [item, ...(item.children || [])])
]);

const activeGroupItem = computed(() => groupItems.value.find((item) => item.key === activeGroup.value) || primaryGroupItems.value[0]);
const activeGroupLabel = computed(() => activeGroupItem.value?.label || "全部对象");

const groupedUsers = computed(() => {
  if (activeGroup.value === "all") return activeUsers.value;
  if (activeGroup.value === "care") return activeUsers.value.filter((user) => store.isCareContact(user.id));
  const item = activeGroupItem.value;
  if (!item) return activeUsers.value;
  return activeUsers.value.filter((user) => matchesDepartment(user, item));
});

const filteredUsers = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  if (!query) return groupedUsers.value;
  return groupedUsers.value.filter((user) =>
    [user.name, user.department, user.displayDepartment, displayDepartment(user), user.email, user.phone, user.job, user.username, user.mbti]
      .some((field) => String(field || "").toLowerCase().includes(query))
  );
});

const selectedUsers = computed(() =>
  activeUsers.value.filter((user) => selectedUserIds.value.includes(userKey(user)))
);

const selectedCountLabel = computed(() =>
  selectedUsers.value.length ? `已勾选 ${selectedUsers.value.length} 人` : "可多选并批量授权"
);

const editableUsers = computed(() => editableUserIds.value.map(findUser).filter(Boolean));
const readonlyUsers = computed(() => readonlyUserIds.value.map(findUser).filter(Boolean));
const sharedCount = computed(() => editableUserIds.value.length + readonlyUserIds.value.length);
const shareSummaryLabel = computed(
  () => `已共享 ${sharedCount.value} 人（可编辑 ${editableUserIds.value.length} / 只读 ${readonlyUserIds.value.length}）`
);

const allVisibleSelected = computed(() => {
  const visibleIds = filteredUsers.value.map(userKey).filter(Boolean);
  return Boolean(visibleIds.length) && visibleIds.every((id) => selectedUserIds.value.includes(id));
});

watch(
  () => [props.modelValue, props.templateName],
  ([open]) => {
    if (open) resetFromStore();
  },
  { immediate: true }
);

watch(visible, (isVisible) => {
  if (!isVisible) {
    selectedUserIds.value = [];
    searchText.value = "";
  }
});

function close() {
  visible.value = false;
}

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

function userKey(user) {
  return String(user?.id || user?.username || user?.name || "").trim();
}

function matchesDepartment(source, item) {
  const candidates = departmentCandidates(source);
  if (!candidates.length) return false;

  const itemKeys = [item.key, ...(item.keys || [])].map(compactDepartment).filter(Boolean);
  if (candidates.some((candidate) => itemKeys.includes(compactDepartment(candidate)))) return true;

  return candidates.some((department) => {
    if ((item.departments || []).includes(department)) return true;
    return (item.prefixes || []).some((prefix) => department.startsWith(prefix));
  });
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

function countDepartmentUsers(item) {
  return activeUsers.value.filter((user) => matchesDepartment(user, item)).length;
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

function hasDepartmentChildren(item) {
  return Boolean(item.children?.length);
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
  return `template-share-subtree-${item.key}`;
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

function findUser(userId) {
  const key = String(userId || "").trim();
  const activeUser = activeUsers.value.find((user) =>
    userKey(user) === key ||
    user.id === key ||
    user.username === key ||
    user.name === key
  );
  if (activeUser) return activeUser;

  const recipient = currentShareRecipients().find((item) =>
    item.userId === key ||
    item.userName === key ||
    item.name === key ||
    item.username === key
  );

  return recipient
    ? {
        id: key,
        name: recipient.userName || recipient.name || recipient.username || recipient.userId || key,
        username: recipient.username || recipient.userId || key,
        department: recipient.department || recipient.displayDepartment || "",
        displayDepartment: recipient.displayDepartment || recipient.display_department || recipient.departmentLabel || recipient.department_label || recipient.department || "",
        avatar: recipient.avatar || ""
      }
    : null;
}

function permissionForUserId(userId) {
  if (editableUserIds.value.includes(userId)) return "edit";
  if (readonlyUserIds.value.includes(userId)) return "read";
  return "none";
}

function permissionForUser(user) {
  return permissionForUserId(userKey(user));
}

function permissionLabelForUser(user) {
  const permission = permissionForUser(user);
  if (permission === "edit") return "已共享 · 可编辑";
  if (permission === "read") return "已共享 · 只读";
  return "未共享";
}

function permissionUsers(role) {
  return role === "edit" ? editableUsers.value : readonlyUsers.value;
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
    const key = userKey(matched) || recipient.userId || recipient.userName;
    if (!key) return;
    if (recipient.permission === "edit") nextEditable.push(key);
    else nextReadonly.push(key);
  });

  editableUserIds.value = [...new Set(nextEditable)];
  readonlyUserIds.value = [...new Set(nextReadonly)];
  selectedUserIds.value = [];
}

function removeFromLists(userId) {
  editableUserIds.value = editableUserIds.value.filter((id) => id !== userId);
  readonlyUserIds.value = readonlyUserIds.value.filter((id) => id !== userId);
}

function setPermissionForUserId(userId, permission) {
  if (!userId) return;
  removeFromLists(userId);
  if (permission === "edit") editableUserIds.value.push(userId);
  if (permission === "read") readonlyUserIds.value.push(userId);
}

function applyPermissionToSelected(permission) {
  selectedUserIds.value.forEach((userId) => setPermissionForUserId(userId, permission));
  syncShare();
}

function removeSelectedUsers() {
  selectedUserIds.value.forEach(removeFromLists);
  syncShare();
}

function changeUserPermission(user, permission) {
  setPermissionForUserId(userKey(user), permission);
  syncShare();
}

function removeUser(userId) {
  removeFromLists(userId);
  selectedUserIds.value = selectedUserIds.value.filter((id) => id !== userId);
  syncShare();
}

function removeSelectedChip(user) {
  selectedUserIds.value = selectedUserIds.value.filter((id) => id !== userKey(user));
}

function toggleVisibleSelection() {
  const visibleIds = filteredUsers.value.map(userKey).filter(Boolean);
  if (allVisibleSelected.value) {
    selectedUserIds.value = selectedUserIds.value.filter((id) => !visibleIds.includes(id));
    return;
  }
  selectedUserIds.value = [...new Set([...selectedUserIds.value, ...visibleIds])];
}

function clearSelection() {
  selectedUserIds.value = [];
}

function shareEntry(userId, permission) {
  const user = findUser(userId) || { id: userId, name: userId };
  const department = displayDepartment(user);
  return {
    userId: user.id || userId,
    userName: user.name || user.username || userId,
    permission,
    department: department === "未分组" ? "" : department,
    displayDepartment: department === "未分组" ? "" : department,
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
    append-to-body
    width="min(1180px, calc(100vw - 72px))"
    :show-close="false"
    :close-on-click-modal="false"
    @open="resetFromStore"
  >
    <section class="template-share-directory" aria-label="模板共享权限" @click.stop>
      <aside class="template-share-rail">
        <header class="template-share-rail-heading">
          <span>通讯录部门树</span>
          <strong>{{ activeUsers.length }}</strong>
        </header>

        <nav class="template-share-tree" aria-label="共享对象部门树" role="tree">
          <button
            v-for="item in primaryGroupItems"
            :key="item.key"
            class="template-share-tree-node is-shortcut"
            :class="{ 'is-active': item.key === activeGroup }"
            type="button"
            role="treeitem"
            :aria-selected="item.key === activeGroup"
            @click="selectGroup(item)"
          >
            <span class="template-share-node-main">
              <span class="template-share-node-icon">{{ item.icon }}</span>
              <b>{{ item.label }}</b>
            </span>
            <span class="template-share-node-count">{{ item.count }}</span>
          </button>

          <div
            v-for="item in departmentTreeItems"
            :key="item.key"
            class="template-share-tree-branch"
            :class="{ 'is-active-branch': isBranchActive(item), 'is-expanded': isGroupExpanded(item.key) }"
          >
            <div class="template-share-branch-row" :class="{ 'is-active-branch': isBranchActive(item) }">
              <button
                v-if="hasDepartmentChildren(item)"
                class="template-share-node-caret"
                :class="{ 'is-open': isGroupExpanded(item.key) }"
                type="button"
                :aria-label="departmentToggleLabel(item)"
                :aria-expanded="isGroupExpanded(item.key)"
                :aria-controls="departmentChildrenId(item)"
                @click.stop="toggleDepartmentTree(item)"
              >
                <span aria-hidden="true"></span>
              </button>
              <span v-else class="template-share-node-spacer" aria-hidden="true"></span>

              <button
                class="template-share-tree-node template-share-group-item"
                :class="{ 'is-active': item.key === activeGroup, 'has-children': hasDepartmentChildren(item) }"
                type="button"
                role="treeitem"
                :aria-label="departmentTreeItemLabel(item)"
                :aria-expanded="hasDepartmentChildren(item) ? isGroupExpanded(item.key) : undefined"
                :aria-controls="hasDepartmentChildren(item) ? departmentChildrenId(item) : undefined"
                :aria-selected="item.key === activeGroup"
                @click="selectGroup(item)"
              >
                <span class="template-share-node-main">
                  <span class="template-share-node-icon">{{ item.icon }}</span>
                  <b>{{ item.label }}</b>
                </span>
                <span class="template-share-node-count">{{ item.count }}</span>
              </button>
            </div>

            <div
              v-if="hasDepartmentChildren(item)"
              v-show="isGroupExpanded(item.key)"
              :id="departmentChildrenId(item)"
              class="template-share-subtree"
              role="group"
              :aria-hidden="!isGroupExpanded(item.key)"
            >
              <div v-for="child in item.children" :key="child.key" class="template-share-child-row">
                <span class="template-share-node-spacer is-child-spacer" aria-hidden="true"></span>
                <button
                  class="template-share-tree-node is-child"
                  :class="{ 'is-active': child.key === activeGroup }"
                  type="button"
                  role="treeitem"
                  :aria-label="`筛选${child.label}，${child.count}人`"
                  :aria-selected="child.key === activeGroup"
                  @click="selectGroup(child)"
                >
                  <span class="template-share-node-main">
                    <span class="template-share-node-dot" aria-hidden="true"></span>
                    <b>{{ child.label }}</b>
                  </span>
                  <span class="template-share-node-count">{{ child.count }}</span>
                </button>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      <main class="template-share-picker">
        <button class="template-share-close" type="button" aria-label="关闭模板共享" @click="close">×</button>

        <header class="template-share-titlebar">
          <div class="template-share-title">
            <span>{{ kindLabel }}</span>
            <strong>{{ templateTitle }}</strong>
          </div>
          <label class="template-share-search" aria-label="搜索共享对象">
            <input v-model="searchText" type="search" placeholder="搜索姓名、部门、邮箱、电话" />
          </label>
          <small>{{ selectedCountLabel }}</small>
        </header>

        <section class="template-share-bulkbar" aria-label="批量操作">
          <button type="button" :disabled="!filteredUsers.length" @click="toggleVisibleSelection">
            {{ allVisibleSelected ? "取消全选" : "全选当前" }}
          </button>
          <button type="button" :disabled="!selectedUsers.length" @click="applyPermissionToSelected('edit')">设为可编辑</button>
          <button type="button" :disabled="!selectedUsers.length" @click="applyPermissionToSelected('read')">设为只读</button>
          <button type="button" :disabled="!selectedUsers.length" @click="removeSelectedUsers">取消共享</button>
          <button type="button" :disabled="!selectedUsers.length" @click="clearSelection">清空勾选</button>
        </section>

        <section class="template-share-selected-board" aria-label="已选择成员列表">
          <header>
            <span>已选择成员</span>
            <b>{{ selectedUsers.length }}</b>
          </header>
          <div class="template-share-selected-list">
            <button
              v-for="user in selectedUsers"
              :key="userKey(user)"
              class="template-share-selected-chip"
              type="button"
              :aria-label="`取消勾选${user.name || user.username}`"
              @click="removeSelectedChip(user)"
            >
              <span>{{ user.name || user.username }}</span>
              <i aria-hidden="true">×</i>
            </button>
            <span v-if="!selectedUsers.length" class="template-share-selected-empty">未选择成员，可在列表中勾选后批量授权</span>
          </div>
        </section>

        <div class="template-share-list">
          <label
            v-for="user in filteredUsers"
            :key="userKey(user)"
            class="template-share-user-row"
            :class="{
              'is-selected': selectedUserIds.includes(userKey(user)),
              'is-shared': permissionForUser(user) !== 'none'
            }"
          >
            <span class="template-share-avatar">{{ user.avatar || String(user.name || user.username || "共").slice(0, 1) }}</span>
            <span class="template-share-user-main">
              <strong>{{ user.name || user.username }}</strong>
              <small>{{ displayDepartment(user) }} · {{ user.job || user.mbti || "共享对象" }}</small>
            </span>
            <span class="template-share-permission-pill" :class="`is-${permissionForUser(user)}`">{{ permissionLabelForUser(user) }}</span>
            <input v-model="selectedUserIds" type="checkbox" :value="userKey(user)" />
          </label>
          <div v-if="!filteredUsers.length" class="template-share-empty">没有找到匹配对象</div>
        </div>
      </main>

      <aside class="template-share-permissions" aria-label="模板共享权限列表">
        <header class="template-share-permission-heading">
          <div>
            <strong>共享权限</strong>
            <small>{{ sharedCount }} 人</small>
          </div>
          <span>{{ activeGroupLabel }}</span>
        </header>

        <div class="template-share-feedback" role="status" aria-live="polite">
          {{ shareSummaryLabel }}
        </div>

        <section v-for="role in roles" :key="role.key" class="template-share-permission-section">
          <h4>
            <span>{{ role.label }}</span>
            <b>{{ permissionUsers(role.key).length }}</b>
          </h4>
          <div class="template-share-permission-list">
            <article v-for="user in permissionUsers(role.key)" :key="userKey(user)" class="template-share-permission-member">
              <span class="template-share-avatar is-mini">{{ user.avatar || String(user.name || user.username || "共").slice(0, 1) }}</span>
              <span class="template-share-permission-person">
                <strong>{{ user.name || user.username }}</strong>
                <small>{{ displayDepartment(user) }}</small>
              </span>
              <select :value="permissionForUserId(userKey(user))" @change="changeUserPermission(user, $event.target.value)">
                <option v-for="item in roles" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
              <button type="button" @click="removeUser(userKey(user))">移除</button>
            </article>
            <div v-if="!permissionUsers(role.key).length" class="template-share-empty compact">暂无对象</div>
          </div>
        </section>
      </aside>
    </section>
  </el-dialog>
</template>

<style scoped>
:deep(.template-share-shell) {
  border-radius: 10px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.template-share-shell .el-dialog__header) {
  padding: 0;
}

:deep(.template-share-shell .el-dialog__body) {
  padding: 0;
  flex: 1;
  min-height: 0;
}

.template-share-directory {
  --share-line: #d9e0e6;
  --share-line-soft: #e9edf2;
  --share-text: #26313c;
  --share-muted: #798590;
  --share-bg: #f3f6f8;
  --share-accent: #2f7fd6;
  --share-accent-line: #b8d7f2;
  --share-accent-soft: #edf6ff;
  display: grid;
  grid-template-columns: minmax(212px, 238px) minmax(370px, 1fr) minmax(300px, 340px);
  height: min(660px, calc(100vh - 96px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--share-line);
  border-radius: 10px;
  color: var(--share-text);
  background: var(--share-bg);
}

.template-share-rail,
.template-share-picker,
.template-share-permissions {
  min-height: 0;
  overflow: auto;
}

.template-share-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 10px 14px;
  border-right: 1px solid var(--share-line);
  background: #f8fafb;
}

.template-share-rail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 8px 10px;
  border-bottom: 1px solid var(--share-line-soft);
  color: #5a6874;
  font-size: 12px;
  font-weight: 800;
}

.template-share-rail-heading strong,
.template-share-node-count {
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #ffffff;
  font-weight: 800;
}

.template-share-rail-heading strong {
  min-width: 28px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--share-line);
  color: #51616f;
}

.template-share-tree,
.template-share-tree-branch {
  display: grid;
  gap: 3px;
}

.template-share-branch-row,
.template-share-child-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 3px;
}

.template-share-tree-node {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #53616e;
  background: transparent;
  text-align: left;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.template-share-tree-node:hover,
.template-share-branch-row.is-active-branch > .template-share-tree-node {
  border-color: var(--share-line);
  color: #2f3d49;
  background: #ffffff;
}

.template-share-tree-node.is-active {
  border-color: var(--share-accent-line);
  color: #1f67ad;
  background: var(--share-accent-soft);
  box-shadow: inset 2px 0 0 var(--share-accent);
}

.template-share-node-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.template-share-node-main b {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-share-node-icon {
  display: grid;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid #d5dee7;
  border-radius: 50%;
  color: #617282;
  background: #ffffff;
  font-size: 10px;
  font-weight: 900;
}

.template-share-tree-node.is-shortcut .template-share-node-icon {
  border-color: #dbe5ee;
  color: #5d748d;
}

.template-share-tree-node.is-active .template-share-node-icon {
  border-color: #b8d7f2;
  color: #2f7fd6;
  background: #ffffff;
}

.template-share-node-caret,
.template-share-node-spacer {
  width: 22px;
  height: 30px;
}

.template-share-node-caret {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: #7c8792;
  background: transparent;
}

.template-share-node-caret:hover,
.template-share-node-caret:focus-visible {
  color: #394854;
  background: #edf2f6;
}

.template-share-node-caret:focus-visible,
.template-share-tree-node:focus-visible,
.template-share-bulkbar button:focus-visible,
.template-share-permission-member button:focus-visible,
.template-share-selected-chip:focus-visible {
  outline: 2px solid rgba(47, 127, 214, 0.24);
  outline-offset: 2px;
}

.template-share-node-caret span {
  display: block;
  width: 7px;
  height: 7px;
  border-right: 1.8px solid currentColor;
  border-bottom: 1.8px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.16s ease;
}

.template-share-node-caret.is-open span {
  transform: rotate(45deg);
}

.template-share-node-count {
  min-width: 24px;
  height: 19px;
  padding: 0 6px;
  border: 1px solid var(--share-line-soft);
  color: #7b8893;
  font-size: 11px;
}

.template-share-tree-node.is-active .template-share-node-count {
  border-color: #bfd8f3;
  color: #2f7fd6;
}

.template-share-subtree {
  display: grid;
  gap: 2px;
  margin: 2px 0 2px 9px;
  padding-left: 10px;
  border-left: 1px solid var(--share-line);
}

.template-share-tree-node.is-child {
  min-height: 31px;
  padding: 0 8px;
  font-size: 12px;
}

.template-share-node-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #a8b3bf;
}

.template-share-picker {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  background: #ffffff;
}

.template-share-close {
  position: absolute;
  top: 12px;
  right: 14px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--share-line);
  border-radius: 50%;
  color: #687583;
  background: #ffffff;
  font-size: 19px;
  line-height: 1;
}

.template-share-close:hover,
.template-share-close:focus-visible {
  border-color: #c7dcf3;
  color: #2f7fd6;
  background: #f3f9ff;
  outline: none;
}

.template-share-titlebar {
  display: grid;
  grid-template-columns: minmax(124px, auto) minmax(180px, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 36px 12px 0;
  border-bottom: 1px solid var(--share-line-soft);
}

.template-share-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.template-share-title span,
.template-share-titlebar small,
.template-share-permission-heading small,
.template-share-permission-heading span {
  color: var(--share-muted);
  font-size: 12px;
}

.template-share-title strong {
  min-width: 0;
  overflow: hidden;
  color: var(--share-text);
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-share-search input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--share-line);
  border-radius: 6px;
  color: var(--share-text);
  background: #ffffff;
}

.template-share-search input:focus {
  border-color: var(--share-accent-line);
  outline: 0;
  box-shadow: 0 0 0 3px rgba(47, 127, 214, 0.12);
}

.template-share-bulkbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-share-bulkbar button,
.template-share-permission-member button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #d5dfe8;
  border-radius: 6px;
  color: #4f6171;
  background: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

.template-share-bulkbar button:hover:not(:disabled),
.template-share-permission-member button:hover {
  border-color: var(--share-accent-line);
  color: #2f7fd6;
  background: var(--share-accent-soft);
}

.template-share-bulkbar button:disabled {
  color: #a0a9b1;
  background: #f3f6f8;
}

.template-share-selected-board {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--share-line-soft);
  border-radius: 6px;
  background: #f9fcff;
}

.template-share-selected-board header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #637485;
  font-size: 12px;
  font-weight: 800;
}

.template-share-selected-board header b {
  display: grid;
  min-width: 24px;
  height: 18px;
  place-items: center;
  padding: 0 6px;
  border: 1px solid #d8e6f5;
  border-radius: 999px;
  color: #2f7fd6;
  background: #ffffff;
  font-size: 11px;
}

.template-share-selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 26px;
}

.template-share-selected-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 26px;
  padding: 0 9px;
  border: 1px solid #cfe2f6;
  border-radius: 999px;
  color: #2e6dad;
  background: #ffffff;
  font-size: 12px;
}

.template-share-selected-chip span {
  max-width: 168px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-share-selected-chip i {
  color: #8fa4b8;
  font-style: normal;
}

.template-share-selected-empty {
  color: #8c98a3;
  font-size: 12px;
}

.template-share-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 5px;
  overflow: auto;
  padding-right: 2px;
}

.template-share-user-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 9px;
  border: 1px solid var(--share-line-soft);
  border-radius: 6px;
  background: #ffffff;
}

.template-share-user-row:hover,
.template-share-user-row.is-selected {
  border-color: #c9d7e5;
  background: #f8fbff;
}

.template-share-user-row.is-selected {
  box-shadow: inset 2px 0 0 var(--share-accent);
}

.template-share-user-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--share-accent);
}

.template-share-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  background: #6c9fd0;
  font-size: 12px;
  font-weight: 900;
}

.template-share-avatar.is-mini {
  width: 28px;
  height: 28px;
  font-size: 11px;
}

.template-share-user-main,
.template-share-permission-person {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.template-share-user-main strong,
.template-share-permission-person strong {
  min-width: 0;
  overflow: hidden;
  color: #26313a;
  font-size: 13px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-share-user-main small,
.template-share-permission-person small {
  min-width: 0;
  overflow: hidden;
  color: #7b8691;
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-share-permission-pill {
  padding: 2px 8px;
  border: 1px solid #dbe3ec;
  border-radius: 999px;
  color: #7d8892;
  background: #f5f7f9;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.template-share-permission-pill.is-edit {
  border-color: #c3dbf4;
  color: #236cb7;
  background: #edf6ff;
}

.template-share-permission-pill.is-read {
  border-color: #d9e2ea;
  color: #5e7284;
  background: #f2f6f9;
}

.template-share-permissions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 14px 14px;
  border-left: 1px solid var(--share-line);
  background: #f8fafb;
}

.template-share-permission-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--share-line-soft);
}

.template-share-permission-heading div {
  display: grid;
  gap: 2px;
}

.template-share-permission-heading strong {
  color: var(--share-text);
  font-size: 16px;
}

.template-share-permission-heading span {
  max-width: 138px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-share-feedback {
  padding: 9px 10px;
  border: 1px solid #d4e6f7;
  border-radius: 6px;
  color: #2d6fae;
  background: #edf6ff;
  font-size: 12px;
  font-weight: 700;
}

.template-share-permission-section {
  padding: 0 0 12px;
  border-bottom: 1px solid var(--share-line-soft);
}

.template-share-permission-section h4 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 8px;
  color: #34414d;
  font-size: 13px;
}

.template-share-permission-section h4 b {
  display: grid;
  min-width: 24px;
  height: 19px;
  padding: 0 6px;
  place-items: center;
  border: 1px solid var(--share-line-soft);
  border-radius: 999px;
  color: #75828e;
  background: #ffffff;
  font-size: 11px;
}

.template-share-permission-list {
  display: grid;
  gap: 6px;
}

.template-share-permission-member {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 76px auto;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 6px 8px;
  border: 1px solid var(--share-line-soft);
  border-radius: 6px;
  background: #ffffff;
}

.template-share-permission-member select {
  width: 76px;
  height: 28px;
  border: 1px solid #d6dee8;
  border-radius: 6px;
  color: #415261;
  background: #ffffff;
  font-size: 12px;
}

.template-share-permission-member button {
  min-height: 28px;
  padding: 0 8px;
}

.template-share-empty {
  display: grid;
  min-height: 76px;
  place-items: center;
  border: 1px dashed #d7dfe8;
  border-radius: 6px;
  color: #87929d;
  background: #fbfdff;
  font-size: 13px;
}

.template-share-empty.compact {
  min-height: 50px;
  font-size: 12px;
}

@media (max-width: 980px), (max-height: 760px) {
  .template-share-directory {
    grid-template-columns: minmax(190px, 214px) minmax(0, 1fr) minmax(256px, 312px);
  }

  .template-share-titlebar {
    grid-template-columns: minmax(0, 1fr);
    padding-right: 38px;
  }
}

@media (max-width: 760px), (max-height: 620px) {
  .template-share-directory {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
    max-height: calc(100vh - 56px);
    overflow: auto;
  }

  .template-share-rail {
    max-height: 230px;
    padding: 12px;
  }

  .template-share-picker,
  .template-share-permissions {
    padding: 14px;
  }

  .template-share-user-row {
    grid-template-columns: 30px minmax(0, 1fr) 18px;
  }

  .template-share-permission-pill {
    grid-column: 2;
    justify-self: start;
  }

  .template-share-permission-member {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .template-share-permission-member select,
  .template-share-permission-member button {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
