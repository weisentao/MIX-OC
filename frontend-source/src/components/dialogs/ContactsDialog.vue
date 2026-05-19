<script setup>
import { computed, ref, shallowRef } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean,
  source: { type: String, default: "default" }
});

const emit = defineEmits(["update:modelValue", "view-profile"]);
const store = useWorkspaceStore();
const activeGroup = shallowRef("all");
const searchText = shallowRef("");
const expandedGroupKeys = ref(["art-design", "post-composition"]);

const departmentTreeConfig = [
  {
    key: "project-management",
    label: "项目管理部",
    shortLabel: "项目管理",
    icon: "项",
    departments: ["项目管理", "项目管理部"],
    prefixes: ["项目管理"]
  },
  {
    key: "aigc",
    label: "AIGC",
    icon: "AI",
    departments: ["AIGC", "AIGC设计", "AI生成", "智能生成"],
    prefixes: ["AIGC", "AI生成", "智能生成"]
  },
  {
    key: "art-design",
    label: "美术设计",
    icon: "美",
    departments: ["美术设计", "美术设计部", "美术设计一部", "美术设计二部"],
    prefixes: ["美术设计"],
    children: [
      { key: "art-design-1", label: "美术设计一部", departments: ["美术设计一部"], prefixes: ["美术设计一部"] },
      { key: "art-design-2", label: "美术设计二部", departments: ["美术设计二部"], prefixes: ["美术设计二部"] }
    ]
  },
  {
    key: "three-dynamic",
    label: "三维动态",
    icon: "3D",
    departments: ["三维动态", "三维动态设计部", "三维设计", "三维动画", "三维视觉部"],
    prefixes: ["三维动态", "三维设计", "三维动画", "三维视觉"]
  },
  {
    key: "motion-design",
    label: "动效设计",
    icon: "动",
    departments: ["动效设计", "动效设计部", "动画动效", "动画设计", "动效组"],
    prefixes: ["动效设计", "动效", "动画动效", "动画设计"]
  },
  {
    key: "post-composition",
    label: "视效包装",
    icon: "视",
    departments: ["视效包装", "视效包装部", "后期合成", "后期合成部", "后期设计"],
    prefixes: ["视效包装", "后期合成", "后期设计"],
    children: [
      {
        key: "post-composition-1",
        label: "视效包装一部",
        departments: ["视效包装一部", "视效1部", "视效1", "视效一部", "后期合成一部", "后期设计一部"],
        prefixes: ["视效包装一部", "视效1", "视效一部", "后期合成一部", "后期设计一部"]
      },
      {
        key: "post-composition-2",
        label: "视效包装二部",
        departments: ["视效包装二部", "视效2部", "视效2", "视效二部", "后期合成二部", "后期设计二部"],
        prefixes: ["视效包装二部", "视效2", "视效二部", "后期合成二部", "后期设计二部"]
      },
      {
        key: "post-composition-3",
        label: "视效包装三部",
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

const isLauncherSource = computed(() => props.source === "launcher");
const shellClass = computed(() => [
  "contacts-directory-shell",
  { "is-launcher-source": isLauncherSource.value }
]);
const dialogLabel = computed(() => (isLauncherSource.value ? "快捷导航通讯录整页面板" : "通讯录"));

const contacts = computed(() => {
  const active = (store.activeUsers || []).filter((user) => user.role !== "admin");
  return [...active].sort((a, b) =>
    departmentSortValue(a.department) - departmentSortValue(b.department) ||
    String(displayDepartment(a.department)).localeCompare(String(displayDepartment(b.department)), "zh-Hans") ||
    String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans")
  );
});

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

const normalizedSearchText = computed(() => searchText.value.trim().toLowerCase());

const groupedContacts = computed(() => {
  if (activeGroup.value === "all") return contacts.value;
  if (activeGroup.value === "care") return contacts.value.filter((user) => store.isCareContact(user.id));
  const item = activeGroupItem.value;
  if (!item) return contacts.value;
  return contacts.value.filter((user) => matchesDepartment(user.department, item));
});

const filteredContacts = computed(() => {
  const query = normalizedSearchText.value;
  if (!query) return groupedContacts.value;
  return groupedContacts.value.filter((user) => {
    const fields = [
      user.name,
      user.department,
      displayDepartment(user.department),
      user.email,
      user.phone,
      user.mbti,
      user.job,
      user.username
    ];
    return fields.some((field) => String(field || "").toLowerCase().includes(query));
  });
});

const resultSummary = computed(() => `${filteredContacts.value.length} / ${groupedContacts.value.length} 人`);

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

function departmentSortValue(value) {
  const index = departmentTreeConfig.findIndex((item) => matchesDepartment(value, item));
  return index === -1 ? departmentTreeConfig.length : index;
}

function displayDepartment(value) {
  const department = normalizeDepartment(value);
  if (!department) return "未分组";
  const matchedRoot = departmentTreeConfig.find((item) => matchesDepartment(department, item));
  const matchedChild = matchedRoot?.children?.find((item) => matchesDepartment(department, item));
  if (matchedChild) return matchedChild.label;
  if (matchedRoot) return matchedRoot.label;
  return department;
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
  return `contacts-subtree-${item.key}`;
}

function close() {
  visible.value = false;
}

function openProfile(user) {
  emit("view-profile", user.id);
}

function toggleCare(user) {
  store.toggleCareContact(user.id);
}

function isCare(user) {
  return store.isCareContact(user.id);
}

function avatarLabel(user) {
  return String(user.avatar || user.name || user.username || "用").slice(0, 1);
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :class="shellClass"
    width="min(1060px, calc(100vw - 56px))"
    :show-close="false"
    append-to-body
    align-center
    :aria-label="dialogLabel"
    @click.self="close"
  >
    <section class="contacts-collab-panel" :aria-label="dialogLabel" @click.stop>
      <aside class="contacts-collab-rail">
        <header class="contacts-rail-heading">
          <span>通讯录</span>
          <strong>{{ contacts.length }}</strong>
        </header>

        <nav class="contacts-primary-nav" aria-label="通讯录快捷分组">
          <button
            v-for="item in primaryGroupItems"
            :key="item.key"
            class="contacts-nav-node is-shortcut"
            :class="{ 'is-active': item.key === activeGroup }"
            type="button"
            :aria-pressed="item.key === activeGroup"
            @click="selectGroup(item)"
          >
            <span class="contacts-nav-main">
              <span class="contacts-nav-icon">{{ item.icon }}</span>
              <b>{{ item.label }}</b>
            </span>
            <span class="contacts-nav-count">{{ item.count }}</span>
          </button>
        </nav>

        <nav class="contacts-department-nav" aria-label="通讯录部门导航" role="tree">
          <div
            v-for="item in departmentTreeItems"
            :key="item.key"
            class="contacts-tree-branch"
            :class="{ 'is-active-branch': isBranchActive(item), 'is-expanded': isGroupExpanded(item.key) }"
          >
            <div class="contacts-branch-row">
              <button
                v-if="hasDepartmentChildren(item)"
                class="contacts-node-caret"
                :class="{ 'is-open': isGroupExpanded(item.key) }"
                type="button"
                :aria-label="departmentToggleLabel(item)"
                :aria-expanded="isGroupExpanded(item.key)"
                :aria-controls="departmentChildrenId(item)"
                @click.stop="toggleGroupExpansion(item)"
              >
                <span aria-hidden="true"></span>
              </button>
              <span v-else class="contacts-node-spacer" aria-hidden="true"></span>

              <button
                class="contacts-nav-node"
                :class="{ 'is-active': item.key === activeGroup, 'has-children': hasDepartmentChildren(item) }"
                type="button"
                role="treeitem"
                :aria-label="departmentTreeItemLabel(item)"
                :aria-expanded="hasDepartmentChildren(item) ? isGroupExpanded(item.key) : undefined"
                :aria-controls="hasDepartmentChildren(item) ? departmentChildrenId(item) : undefined"
                :aria-selected="item.key === activeGroup"
                @click="selectGroup(item)"
              >
                <span class="contacts-nav-main">
                  <span class="contacts-nav-icon">{{ item.icon }}</span>
                  <b>{{ item.label }}</b>
                </span>
                <span class="contacts-nav-count">{{ item.count }}</span>
              </button>
            </div>

            <div
              v-if="hasDepartmentChildren(item)"
              v-show="isGroupExpanded(item.key)"
              :id="departmentChildrenId(item)"
              class="contacts-subtree"
              role="group"
              :aria-hidden="!isGroupExpanded(item.key)"
            >
              <div v-for="child in item.children" :key="child.key" class="contacts-child-row">
                <span class="contacts-node-spacer is-child-spacer" aria-hidden="true"></span>
                <button
                  class="contacts-nav-node is-child"
                  :class="{ 'is-active': child.key === activeGroup }"
                  type="button"
                  role="treeitem"
                  :aria-label="`筛选${child.label}，${child.count}人`"
                  :aria-selected="child.key === activeGroup"
                  @click="selectGroup(child)"
                >
                  <span class="contacts-nav-main">
                    <span class="contacts-nav-dot" aria-hidden="true"></span>
                    <b>{{ child.label }}</b>
                  </span>
                  <span class="contacts-nav-count">{{ child.count }}</span>
                </button>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      <main class="contacts-collab-content">
        <button class="contacts-close-x" type="button" aria-label="关闭通讯录" @click="close">×</button>

        <header class="contacts-titlebar">
          <div class="contacts-title">
            <strong>通讯录</strong>
            <span>{{ activeGroupLabel }} · {{ resultSummary }}</span>
          </div>
          <label class="contacts-search" aria-label="搜索通讯录">
            <span aria-hidden="true"></span>
            <input v-model="searchText" type="search" placeholder="搜索姓名、部门、邮箱、电话" />
          </label>
          <small>好友资料</small>
        </header>

        <div class="contacts-list" role="list" aria-label="通讯录用户池">
          <article
            v-for="user in filteredContacts"
            :key="user.id"
            class="contacts-person-row"
            role="listitem"
            tabindex="0"
            @click="openProfile(user)"
            @keydown.enter.prevent="openProfile(user)"
            @keydown.space.prevent="openProfile(user)"
          >
            <span class="contacts-avatar" aria-hidden="true">{{ avatarLabel(user) }}</span>

            <span class="contacts-person-main">
              <strong>{{ user.name || "未命名用户" }}</strong>
              <small>{{ displayDepartment(user.department) }} · {{ user.job || user.mbti || "协同成员" }}</small>
            </span>

            <span class="contacts-person-meta">
              <span>{{ user.email || "未填写邮箱" }}</span>
              <span>{{ user.phone || "未填写电话" }}</span>
            </span>

            <span class="contacts-person-tags">
              <span v-if="user.mbti">{{ user.mbti }}</span>
              <span v-if="isCare(user)" class="is-care">已关注</span>
            </span>

            <span class="contacts-row-actions">
              <button class="contacts-profile-action" type="button" @click.stop="openProfile(user)">个人主页</button>
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
          </article>

          <div v-if="!filteredContacts.length" class="contacts-empty">没有找到匹配的同学</div>
        </div>
      </main>
    </section>
  </el-dialog>
</template>

<style scoped>
:global(.contacts-directory-shell.el-dialog) {
  width: min(1060px, calc((100vw / var(--scale-factor)) - 36px)) !important;
  height: min(680px, calc((100vh / var(--scale-factor)) - 36px)) !important;
  background: transparent !important;
  box-shadow: none !important;
}

:global(.contacts-directory-shell .el-dialog__body) {
  width: 100% !important;
  height: 100% !important;
  padding: 0 !important;
  overflow: hidden !important;
}

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
  pointer-events: auto;
}

.contacts-collab-panel {
  --contacts-line: #dce4ea;
  --contacts-line-soft: #edf1f4;
  --contacts-text: #27313b;
  --contacts-muted: #74818d;
  --contacts-bg: #f5f7f9;
  --contacts-panel: #ffffff;
  --contacts-blue: #2f7de1;
  --contacts-blue-soft: #eaf3ff;
  display: grid;
  grid-template-columns: minmax(210px, 238px) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--contacts-line);
  border-radius: 10px;
  color: var(--contacts-text);
  background: var(--contacts-bg);
  box-shadow: 0 18px 46px rgba(39, 49, 59, 0.1);
}

.contacts-collab-rail {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  padding: 18px 12px;
  border-right: 1px solid var(--contacts-line);
  background: #f6f8fa;
  overflow: auto;
}

.contacts-rail-heading,
.contacts-titlebar {
  border-bottom: 1px solid var(--contacts-line-soft);
}

.contacts-rail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 6px 10px;
  color: var(--contacts-muted);
  font-size: 12px;
  font-weight: 800;
}

.contacts-rail-heading strong,
.contacts-nav-count {
  display: grid;
  min-width: 26px;
  height: 20px;
  padding: 0 7px;
  place-items: center;
  border: 1px solid var(--contacts-line);
  border-radius: 999px;
  color: #5e6d78;
  background: #ffffff;
  font-size: 11px;
  font-weight: 800;
}

.contacts-primary-nav,
.contacts-department-nav,
.contacts-tree-branch,
.contacts-subtree {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.contacts-branch-row,
.contacts-child-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 2px;
}

.contacts-subtree {
  margin: 2px 0 2px 11px;
  padding-left: 11px;
  border-left: 1px solid var(--contacts-line);
}

.contacts-nav-node {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #53616d;
  background: transparent;
  text-align: left;
  box-shadow: none;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.contacts-nav-node:hover,
.contacts-nav-node:focus-visible {
  border-color: var(--contacts-line);
  color: #2f3c48;
  background: #ffffff;
  outline: none;
}

.contacts-nav-node.is-active {
  border-color: #b8d4f8;
  color: #1f66bd;
  background: var(--contacts-blue-soft);
  box-shadow: inset 2px 0 0 var(--contacts-blue);
}

.contacts-nav-node.has-children {
  cursor: pointer;
}

.contacts-nav-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.contacts-nav-main b {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contacts-nav-icon {
  display: grid;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid #dbe4ec;
  border-radius: 50%;
  color: #58718a;
  background: #ffffff;
  font-size: 10px;
  font-weight: 900;
}

.contacts-nav-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 999px;
  background: #aeb8c1;
}

.contacts-node-caret,
.contacts-node-spacer {
  width: 22px;
  height: 34px;
}

.contacts-node-caret {
  display: grid;
  place-items: center;
  min-width: 22px;
  min-height: 34px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: #7c8792;
  background: transparent;
  box-shadow: none;
}

.contacts-node-caret:hover,
.contacts-node-caret:focus-visible {
  color: #394854;
  background: #edf2f6;
  outline: none;
}

.contacts-node-caret span {
  display: block;
  width: 7px;
  height: 7px;
  border-right: 1.6px solid currentColor;
  border-bottom: 1.6px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.16s ease;
}

.contacts-node-caret.is-open span {
  transform: rotate(45deg);
}

.contacts-node-spacer.is-child-spacer,
.contacts-nav-node.is-child {
  min-height: 31px;
}

.contacts-collab-content {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 18px 20px;
  background: var(--contacts-panel);
}

.contacts-close-x {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 3;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--contacts-line);
  border-radius: 50%;
  color: #657381;
  background: #ffffff;
  box-shadow: none;
  font-size: 20px;
  line-height: 1;
}

.contacts-close-x:hover,
.contacts-close-x:focus-visible {
  color: var(--contacts-blue);
  background: var(--contacts-blue-soft);
  outline: none;
}

.contacts-titlebar {
  display: grid;
  grid-template-columns: minmax(150px, auto) minmax(190px, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding-right: 44px;
  padding-bottom: 12px;
}

.contacts-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.contacts-title strong {
  color: var(--contacts-text);
  font-size: 16px;
  font-weight: 900;
  line-height: 1.2;
}

.contacts-title span,
.contacts-titlebar small {
  color: var(--contacts-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.contacts-titlebar small {
  justify-self: end;
  color: var(--contacts-blue);
  white-space: nowrap;
}

.contacts-search {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--contacts-line);
  border-radius: 6px;
  background: #ffffff;
}

.contacts-search:focus-within {
  border-color: #a8ccf8;
  box-shadow: 0 0 0 3px rgba(47, 125, 225, 0.1);
}

.contacts-search span {
  position: relative;
  width: 13px;
  height: 13px;
  border: 1.8px solid #8a9aaa;
  border-radius: 50%;
}

.contacts-search span::after {
  content: "";
  position: absolute;
  right: -4px;
  bottom: -3px;
  width: 6px;
  border-top: 1.8px solid #8a9aaa;
  transform: rotate(45deg);
}

.contacts-search input {
  min-width: 0;
  height: 28px;
  border: 0;
  outline: none;
  color: var(--contacts-text);
  background: transparent;
  font-size: 12px;
  font-weight: 650;
}

.contacts-list {
  display: grid;
  align-content: start;
  gap: 4px;
  min-height: 0;
  padding-right: 4px;
  overflow: auto;
}

.contacts-person-row {
  display: grid;
  grid-template-columns: 34px minmax(130px, 0.9fr) minmax(180px, 1.2fr) minmax(84px, auto) auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 7px 10px;
  border: 1px solid var(--contacts-line-soft);
  border-radius: 6px;
  color: var(--contacts-text);
  background: #ffffff;
  cursor: pointer;
  box-shadow: none;
  text-align: left;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.contacts-person-row:hover,
.contacts-person-row:focus-visible {
  border-color: #c8d8e6;
  background: #f8fbff;
  outline: none;
}

.contacts-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  background: linear-gradient(135deg, #4f93e8, #78aeea);
  font-size: 13px;
  font-weight: 900;
}

.contacts-person-main,
.contacts-person-meta,
.contacts-person-tags {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.contacts-person-main strong {
  min-width: 0;
  overflow: hidden;
  color: #26313a;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contacts-person-main small,
.contacts-person-meta span {
  min-width: 0;
  overflow: hidden;
  color: var(--contacts-muted);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contacts-person-tags {
  grid-auto-flow: column;
  justify-content: start;
  gap: 5px;
}

.contacts-person-tags span {
  display: grid;
  height: 22px;
  padding: 0 7px;
  place-items: center;
  border: 1px solid #dbe5ee;
  border-radius: 999px;
  color: #667583;
  background: #f8fafc;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.contacts-person-tags .is-care {
  border-color: #c8dfff;
  color: var(--contacts-blue);
  background: var(--contacts-blue-soft);
}

.contacts-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  min-width: max-content;
}

.contacts-profile-action,
.contacts-care-action {
  min-width: 62px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid #d8e2ea;
  border-radius: 999px;
  color: #5f6e7b;
  background: #ffffff;
  font-size: 12px;
  font-weight: 800;
  box-shadow: none;
}

.contacts-profile-action:hover,
.contacts-profile-action:focus-visible,
.contacts-care-action:hover,
.contacts-care-action:focus-visible,
.contacts-care-action.is-active {
  border-color: #c3dcff;
  color: var(--contacts-blue);
  background: var(--contacts-blue-soft);
  outline: none;
}

.contacts-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  border: 1px dashed #d8e2ea;
  border-radius: 6px;
  color: #8b98a5;
  background: #fafcfe;
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 980px), (max-height: 620px) {
  .contacts-collab-panel {
    grid-template-columns: minmax(168px, 198px) minmax(0, 1fr);
  }

  .contacts-collab-content {
    padding: 16px;
  }

  .contacts-titlebar {
    grid-template-columns: minmax(0, 1fr);
    gap: 9px;
    padding-right: 40px;
  }

  .contacts-titlebar small {
    justify-self: start;
  }

  .contacts-person-row {
    grid-template-columns: 34px minmax(120px, 1fr) auto;
  }

  .contacts-person-meta,
  .contacts-person-tags {
    display: none;
  }
}

@media (max-width: 720px), (max-height: 520px) {
  .contacts-collab-panel {
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }

  .contacts-collab-rail {
    grid-template-rows: auto auto auto;
    max-height: 210px;
    border-right: 0;
    border-bottom: 1px solid var(--contacts-line);
  }

  .contacts-person-row {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .contacts-row-actions {
    grid-column: 2;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
