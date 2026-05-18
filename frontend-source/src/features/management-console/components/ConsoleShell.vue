<script setup>
defineProps({
  title: {
    type: String,
    default: "后台管理"
  },
  subtitle: {
    type: String,
    default: "管理控制台"
  },
  userLabel: {
    type: String,
    default: ""
  },
  roleLabel: {
    type: String,
    default: ""
  },
  scopeLabel: {
    type: String,
    default: ""
  },
  activeKey: {
    type: String,
    default: ""
  },
  navItems: {
    type: Array,
    default: () => []
  },
  search: {
    type: String,
    default: ""
  },
  searchPlaceholder: {
    type: String,
    default: "搜索项目 / 任务 / 成员"
  },
  lastSync: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["navigate", "back", "update:search"]);

const navTextMap = {
  dashboard: "总览",
  overview: "概览",
  department: "本部门",
  departments: "部门",
  users: "用户",
  members: "成员",
  "member-detail": "成员详情",
  permissions: "权限",
  projects: "项目",
  "project-detail": "项目详情",
  risk: "风险",
  schedules: "排期",
  schedule: "排期",
  tasks: "任务",
  comments: "评论",
  boards: "画板",
  templates: "模板",
  tags: "标签",
  notices: "公告",
  archives: "归档",
  system: "系统",
  accounts: "账号",
  admin: "超级管理员",
  manager: "项目管理员",
  editor: "编辑者",
  readonly: "只读成员",
  crud: "管理操作",
  "api ready": "管理就绪"
};

function localizeNavText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (navTextMap[lower]) return navTextMap[lower];
  if (/^[a-z0-9_.-]+$/i.test(text)) return "管理项";
  return text
    .replace(/\bapi ready\b/gi, "接口就绪")
    .replace(/\bcrud\b/gi, "增删改查")
    .replace(/\bdashboard\b/gi, "总览")
    .replace(/\breadonly\b/gi, "只读成员")
    .replace(/\beditor\b/gi, "编辑者")
    .replace(/\bmanager\b/gi, "项目管理员")
    .replace(/\badmin\b/gi, "超级管理员");
}

function navLabel(item) {
  return localizeNavText(item?.label || item?.title || item?.key);
}

function navDescription(item) {
  return localizeNavText(item?.description || item?.meta);
}
</script>

<template>
  <section class="console-admin-frame">
    <aside class="console-side-card" aria-label="后台导航">
      <div class="console-brand">
        <span class="console-brand-mark" aria-hidden="true">管</span>
        <div>
          <strong>{{ title }}</strong>
          <small>{{ subtitle }}</small>
        </div>
      </div>

      <nav class="console-nav" aria-label="后台功能">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="console-nav-item"
          :class="{ active: activeKey === item.key }"
          type="button"
          @click="emit('navigate', item.key)"
        >
          <span class="console-nav-dot" aria-hidden="true"></span>
          <span>
            <strong>{{ navLabel(item) }}</strong>
            <small v-if="navDescription(item)">{{ navDescription(item) }}</small>
          </span>
        </button>
      </nav>

      <slot name="sidebar"></slot>

      <div class="console-side-footer">
        <small>当前权限</small>
        <strong>{{ roleLabel || "管理权限" }}</strong>
        <span>{{ scopeLabel || "按当前账号授权范围显示" }}</span>
        <button class="console-back" type="button" @click="emit('back')">返回工作台</button>
      </div>
    </aside>

    <div class="console-workspace">
      <header class="console-topbar">
        <div class="console-title-block">
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>

        <label class="console-top-filter">
          <span class="sr-only">搜索后台数据</span>
          <input
            :value="search"
            type="search"
            :placeholder="searchPlaceholder"
            @input="emit('update:search', $event.target.value)"
          />
        </label>

        <div v-if="userLabel" class="console-user-card">
          <span>{{ userLabel.slice(0, 1) }}</span>
          <div>
            <strong>{{ userLabel }}</strong>
            <small>{{ lastSync || "刚刚同步" }}</small>
          </div>
        </div>
      </header>

      <main class="console-content">
        <slot></slot>
      </main>
    </div>
  </section>
</template>
