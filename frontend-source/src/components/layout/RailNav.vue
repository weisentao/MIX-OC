<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { rememberWorkspaceSection } from "@/services/authRedirect";

const store = useWorkspaceStore();
const emit = defineEmits(["open-help", "open-settings", "open-profile", "open-admin", "open-contacts", "open-members", "change-password", "logout", "pick-background", "clear-background"]);
const helpOpen = ref(false);
const settingsOpen = ref(false);

const items = [
  { key: "home", label: "首页", title: "首页", icon: "icon-home" },
  { key: "schedule", label: "排期", title: "排期", icon: "icon-calendar" },
  { key: "flow", label: "流程", title: "流程", icon: "icon-file" },
  { key: "boards", label: "画板", title: "画板", icon: "icon-board" },
  { key: "resource", label: "人力", title: "人力", icon: "icon-resource" },
  { key: "optimize", label: "优化", title: "优化", icon: "icon-smile" }
];

const bottomItems = [
  { key: "help", label: "帮助", title: "帮助" },
  { key: "settings", label: "设置", title: "设置" }
];

const activeKey = computed(() => {
  if (store.activeFilter === "优化" && store.activeSection === "flow") return "optimize";
  return store.activeSection;
});

function switchSection(key) {
  rememberWorkspaceSection(key);
  store.setSection(key);
  const label = items.find((item) => item.key === key)?.label || "";
  store.showToast(`已切换到${label}`);
}

function triggerBottom(key) {
  if (key === "help") {
    helpOpen.value = true;
  } else {
    settingsOpen.value = true;
  }
}

function runSetting(action) {
  settingsOpen.value = false;
  if (action === "open-members" && !store.activeProject) {
    store.showToast("请先选择项目，再编辑项目权限");
    return;
  }
  emit(action);
}
</script>

<template>
  <aside class="rail" aria-label="功能栏">
    <button class="logo-mark" title="首页" aria-label="首页" @click="switchSection('home')">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path
          d="M18 100V54C18 25 41 8 60 8s42 17 42 46v46c0 8-12 8-12 0V72c-5 5-10 8-16 10v22c0 8-12 8-12 0V84h-4v20c0 8-12 8-12 0V82c-6-2-11-5-16-10v28c0 8-12 8-12 0Z"
        />
        <circle cx="60" cy="51" r="28" fill="#fff" />
        <circle cx="60" cy="51" r="16" />
      </svg>
    </button>

    <nav class="rail-nav">
      <button
        v-for="item in items"
        :key="item.key"
        class="rail-item"
        :class="{ 'is-active': activeKey === item.key }"
        :title="item.title"
        @click="switchSection(item.key)"
      >
        <span class="icon" :class="item.icon"></span>
        <b>{{ item.label }}</b>
      </button>
    </nav>

    <div class="rail-bottom">
      <button
        v-for="item in bottomItems"
        :key="item.key"
        class="rail-mini"
        :class="`rail-mini-${item.key}`"
        :title="item.title"
        :aria-label="item.label"
        @click="triggerBottom(item.key)"
      >
        <i></i>
      </button>
    </div>

    <teleport to="body">
      <div v-if="helpOpen" class="rail-modal-mask" @click.self="helpOpen = false">
        <section class="rail-modal-card" aria-label="帮助文档">
          <button class="rail-modal-close" type="button" @click="helpOpen = false">×</button>
          <span>帮助中心</span>
          <h3>帮助文档</h3>
          <p>这里先放一份项目工作台的使用说明，后续可以替换成正式知识库内容。</p>
          <div class="rail-help-list">
            <article>
              <strong>项目清单</strong>
              <p>从左侧进入首页、排期、流程和优化视图；项目右侧的更多菜单可进入重命名、排期、流程、优化和删除等功能。</p>
            </article>
            <article>
              <strong>任务协作</strong>
              <p>展开任务后可以查看评论，自己的评论显示在右侧，其他成员评论显示在左侧。</p>
            </article>
            <article>
              <strong>个人资料</strong>
              <p>头像、人物图、手写签名和首页背景都支持上传，预览环境会先保存到当前浏览器本地。</p>
            </article>
          </div>
        </section>
      </div>

      <div v-if="settingsOpen" class="rail-modal-mask" @click.self="settingsOpen = false">
        <section class="rail-modal-card rail-settings-card" aria-label="设置">
          <button class="rail-modal-close" type="button" @click="settingsOpen = false">×</button>
          <span>系统设置</span>
          <h3>设置</h3>
          <div class="rail-settings-grid">
            <button type="button" @click="runSetting('open-profile')">编辑个人资料</button>
            <button type="button" @click="runSetting('change-password')">修改密码</button>
            <button type="button" @click="runSetting('open-contacts')">通讯录用户池</button>
            <button type="button" @click="runSetting('pick-background')">上传首页背景</button>
            <button v-if="store.currentUser?.homeBackgroundImage" type="button" @click="runSetting('clear-background')">恢复默认背景</button>
            <button type="button" @click="runSetting('logout')">退出登录</button>
            <button v-if="store.isManagementUser" type="button" @click="runSetting('open-admin')">后台数据管理</button>
            <button v-if="store.isAdmin" type="button" @click="runSetting('open-members')">项目权限设置</button>
          </div>
        </section>
      </div>
    </teleport>
  </aside>
</template>
