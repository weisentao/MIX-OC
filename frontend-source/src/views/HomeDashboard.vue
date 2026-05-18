<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import HomeAiAssistantFloat from "@/components/home/HomeAiAssistantFloat.vue";
import HomeSearchEcho from "@/components/home/HomeSearchEcho.vue";
import NoticeInlineContent from "@/components/layout/NoticeInlineContent.vue";
import { buildWorkspaceSearchResults } from "@/features/search/workspaceSearch";
import aiApi from "@/services/aiApi";
import { aiErrorMessage } from "@/services/apiErrors";
import { useWorkspaceStore } from "@/stores/workspace";
import { openNoticeLink } from "@/utils/noticeCarousel";

const store = useWorkspaceStore();
const emit = defineEmits(["open-profile", "open-admin", "logout", "change-password", "open-launcher"]);
const adminMenuOpen = ref(false);
const noticeIndex = ref(0);
let noticeTimer = 0;
const assistantText = shallowRef("");

const heroCopies = [
  ["今日工作台", "先搜索项目、任务或资料，整理结果会在这里展示。"],
  ["资料与任务", "输入关键词，快速查看相关项目、评论和待办。"],
  ["项目进展", "按项目名、成员或风险点检索当前资料。"],
  ["今日安排", "先看关键任务，再处理评论和排期变更。"],
  ["资料搜索", "需要更多背景时，可在结果里继续补充问题。"]
];

const heroAnimations = ["fade"];
const heroIndex = ref(Math.floor(Math.random() * heroCopies.length));
const heroAnimation = ref("fade");
let heroTimer = 0;

const currentHeroCopy = computed(() => heroCopies[heroIndex.value]);
const heroTransitionName = computed(() => `ai-copy-${heroAnimation.value}`);
const activeNotices = computed(() => (store.carouselNotices || []).filter((item) => item.enabled !== false));
const currentNoticeIndex = computed(() => (activeNotices.value.length ? noticeIndex.value % activeNotices.value.length : 0));
const currentNotice = computed(() => activeNotices.value[currentNoticeIndex.value] || null);
const assistantOpen = shallowRef(false);
const assistantPending = shallowRef(false);
const assistantStatus = shallowRef("idle");
const assistantErrorMessage = shallowRef("");
const assistantModelName = shallowRef("等待提问");
const assistantOnline = shallowRef(false);
const assistantMessages = ref([]);
const assistantSources = ref([]);
const assistantSettings = reactive({
  loaded: false,
  enabled: false,
  configured: false,
  model: "按后台配置",
  webSearch: false,
  error: false
});
const searchEcho = reactive({
  visible: false,
  state: "idle",
  query: "",
  message: "",
  result: null
});
let assistantRequestId = 0;

const resourceCards = computed(() => [
  {
    title: "首页搜索",
    lines: ["搜：项目名称", "搜：风险任务", "搜：成员评论"],
    action: "输入关键词后回车"
  },
  {
    title: "项目资料",
    lines: ["流程模板、项目标签、复核规范", "素材来源、尺寸要求、归档规则"],
    action: "整理成工作资料"
  },
  {
    title: "今日安排",
    lines: ["先处理快到期任务", "再查看评论里的返工风险", "最后同步项目进度"],
    action: "生成工作建议"
  }
]);

function pickNextAnimation() {
  const choices = heroAnimations.filter((name) => name !== heroAnimation.value);
  return choices[Math.floor(Math.random() * choices.length)] || "fade";
}

function rotateHeroCopy() {
  heroAnimation.value = pickNextAnimation();
  heroIndex.value = (heroIndex.value + 1) % heroCopies.length;
}

function scheduleNotice() {
  window.clearTimeout(noticeTimer);
  const delay = Math.max(1000, Number(currentNotice.value?.interval || 5500));
  noticeTimer = window.setTimeout(() => {
    const count = activeNotices.value.length;
    if (count > 1) noticeIndex.value = (noticeIndex.value + 1) % count;
    scheduleNotice();
  }, delay);
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

onMounted(() => {
  heroTimer = window.setInterval(rotateHeroCopy, 9000);
  loadAssistantSettings();
});

onBeforeUnmount(() => {
  window.clearInterval(heroTimer);
  window.clearTimeout(noticeTimer);
});

watch(
  () => [activeNotices.value.length, currentNotice.value?.interval],
  () => {
    if (noticeIndex.value >= activeNotices.value.length) noticeIndex.value = 0;
    scheduleNotice();
  },
  { immediate: true }
);

function createMessage(role, text, options = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    sources: options.sources || [],
    degraded: Boolean(options.degraded)
  };
}

function sourcesFromSearchResults(results = []) {
  return results.slice(0, 4).map((result, index) => ({
    id: `local-${result.projectId || "project"}-${result.taskId || result.title || index}`,
    title: result.title || "本地资料",
    text: result.text || "",
    type: result.source || "本地资料",
    projectId: result.projectId || null,
    taskId: result.taskId || null
  }));
}

function applyAssistantSettings(settings = {}) {
  assistantSettings.loaded = true;
  assistantSettings.enabled = Boolean(settings.enabled);
  assistantSettings.configured = Boolean(settings.configured);
  assistantSettings.model = settings.model || "按后台配置";
  assistantSettings.webSearch = Boolean(settings.webSearch);
  assistantSettings.error = false;
  assistantModelName.value = assistantSettings.model;
  assistantOnline.value = assistantSettings.webSearch;
}

async function loadAssistantSettings() {
  try {
    const settings = await aiApi.getHomeAiSettings();
    applyAssistantSettings(settings);
  } catch {
    assistantSettings.loaded = true;
    assistantSettings.enabled = false;
    assistantSettings.configured = false;
    assistantSettings.model = "按后台配置";
    assistantSettings.webSearch = false;
    assistantSettings.error = true;
  }
}

function fallbackAnswer(question, sources = []) {
  if (!sources.length) return `没有从本地资料里找到「${question}」的直接匹配，可以继续补充项目、任务或成员信息。`;
  const sourceText = sources.map((source) => `「${source.title}」`).join("、");
  return `已使用本地整理结果：和「${question}」相关的内容主要来自 ${sourceText}。后端恢复后可以继续补全联网整理。`;
}

function applyAssistantResult(question, result, options = {}) {
  const localSources = sourcesFromSearchResults(buildWorkspaceSearchResults(store, question));
  const sources = result.sources?.length ? result.sources : localSources;
  const answer = result.answer || fallbackAnswer(question, sources);
  assistantSources.value = sources;
  assistantModelName.value = result.modelName || assistantModelName.value || "资料整理";
  assistantOnline.value = Boolean(result.online);
  assistantMessages.value = [
    ...assistantMessages.value,
    createMessage("assistant", answer, {
      sources,
      degraded: options.degraded
    })
  ];
  searchEcho.visible = true;
  searchEcho.state = options.degraded ? "error" : sources.length || answer ? "ready" : "empty";
  searchEcho.query = question;
  searchEcho.message = options.degraded ? options.message || "后端暂时没有返回，已使用本地整理结果。" : "";
  searchEcho.result = {
    answer,
    sources
  };
}

async function askAssistant(question) {
  const text = String(question || "").trim();
  if (!text) {
    store.showToast("请输入要查找或整理的内容");
    return;
  }

  assistantRequestId += 1;
  const requestId = assistantRequestId;
  assistantPending.value = true;
  assistantStatus.value = "loading";
  assistantErrorMessage.value = "";
  searchEcho.visible = true;
  searchEcho.state = "loading";
  searchEcho.query = text;
  searchEcho.message = "";
  searchEcho.result = null;
  assistantMessages.value = [...assistantMessages.value, createMessage("user", text)];

  try {
    const result = await aiApi.askHomeAssistant({
      question: text,
      query: text,
      context: {
        activeProjectId: store.activeProject?.id || null,
        activeProjectName: store.activeProjectName || "",
        searchResults: buildWorkspaceSearchResults(store, text).slice(0, 6)
      }
    });
    if (requestId !== assistantRequestId) return;
    assistantStatus.value = "ready";
    applyAssistantResult(text, result);
  } catch (error) {
    if (requestId !== assistantRequestId) return;
    const localSources = sourcesFromSearchResults(buildWorkspaceSearchResults(store, text));
    const message = aiErrorMessage(error, "后端暂时不可用，已使用本地整理结果。");
    assistantStatus.value = "error";
    assistantOnline.value = false;
    assistantErrorMessage.value = message;
    applyAssistantResult(
      text,
      {
        answer: fallbackAnswer(text, localSources),
        modelName: "本地整理",
        online: false,
        sources: localSources
      },
      { degraded: true, message }
    );
    store.showToast(message);
  } finally {
    if (requestId === assistantRequestId) assistantPending.value = false;
  }
}

function submitAssistant() {
  const text = assistantText.value.trim();
  if (!text) {
    store.showToast("请输入要查找或整理的内容");
    return;
  }
  askAssistant(text);
}

function useShortcut(card) {
  const prompts = {
    "首页搜索": "查找当前项目里需要优先处理的任务",
    "项目资料": "整理本站流程模板和注意事项",
    "今日安排": "根据待办和评论生成今天的工作建议"
  };
  assistantText.value = prompts[card.title] || card.title;
  submitAssistant();
}

function openAssistantFromEcho() {
  assistantOpen.value = true;
}

function closeSearchEcho() {
  searchEcho.visible = false;
}

function openAssistantSource(source) {
  if (source?.url) {
    window.open(source.url, "_blank", "noopener,noreferrer");
    return;
  }
  if (source?.projectId && typeof store.selectSearchResult === "function") {
    store.activeSection = String(source.type || "").includes("排期") ? "schedule" : "flow";
    store.selectSearchResult(source);
    store.showToast(`已打开资料来源：${source.title}`);
    return;
  }
  store.showToast(source?.title ? `资料来源：${source.title}` : "暂无可打开的资料来源");
}

function handleAvatarClick() {
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
</script>

<template>
  <section
    class="home-view ai-home-view animate__animated animate__fadeIn"
    :class="{ 'has-custom-bg': store.currentUser?.homeBackgroundImage }"
    :style="store.currentUser?.homeBackgroundImage ? { '--home-bg-image': `url(${store.currentUser.homeBackgroundImage})` } : null"
  >
    <div class="home-top-carousel top-carousel" aria-live="polite">
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

    <div class="ai-home-top">
      <button class="ai-grid-menu" type="button" title="快捷导航" @click="emit('open-launcher')">
        <i v-for="item in 9" :key="item"></i>
      </button>
      <button class="ai-home-avatar" type="button" title="个人主页" @click="handleAvatarClick">
        <img v-if="store.currentUser?.avatarImage" :src="store.currentUser.avatarImage" alt="" />
        <span v-else>{{ store.currentUser?.avatar || "严" }}</span>
      </button>
      <div v-if="adminMenuOpen" class="admin-avatar-menu ai-home-admin-menu">
        <button type="button" @click="adminAction('logout')">退出登录</button>
        <button type="button" @click="adminAction('change-password')">更改密码</button>
        <button type="button" @click="adminAction('open-admin')">后台管理</button>
      </div>
    </div>

    <div class="ai-home-main">
      <div class="ai-home-copy">
        <Transition :name="heroTransitionName" mode="out-in" appear>
          <div :key="heroIndex" class="ai-home-copy-inner">
            <h1>{{ currentHeroCopy[0] }}</h1>
            <p>{{ currentHeroCopy[1] }}</p>
          </div>
        </Transition>
      </div>

      <form class="ai-home-search" @submit.prevent="submitAssistant">
        <input v-model="assistantText" type="search" aria-label="首页搜索" placeholder="" />
        <button type="submit" title="搜索并整理">
          <span class="ai-search-icon"></span>
        </button>
      </form>

      <HomeSearchEcho
        v-if="searchEcho.visible"
        :state="searchEcho.state"
        :query="searchEcho.query"
        :result="searchEcho.result"
        :sources="searchEcho.result?.sources || assistantSources"
        :message="searchEcho.message"
        @open-assistant="openAssistantFromEcho"
        @open-source="openAssistantSource"
        @close="closeSearchEcho"
      />

      <div class="ai-resource-grid">
        <button
          v-for="card in resourceCards"
          :key="card.title"
          class="ai-resource-card"
          type="button"
          @click="useShortcut(card)"
        >
          <strong>{{ card.title }}</strong>
          <span v-for="line in card.lines" :key="line">{{ line }}</span>
          <small>{{ card.action }}</small>
        </button>
      </div>
    </div>

    <HomeAiAssistantFloat
      v-model:open="assistantOpen"
      :messages="assistantMessages"
      :pending="assistantPending"
      :status="assistantStatus"
      :error-message="assistantErrorMessage"
      :model-name="assistantModelName"
      :online="assistantOnline"
      :sources="assistantSources"
      :settings="assistantSettings"
      @ask="askAssistant"
      @open-source="openAssistantSource"
    />
  </section>
</template>


