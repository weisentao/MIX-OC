<script setup>
import { computed, ref, watch } from "vue";
import { Delete, EditPen, Plus, Upload } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";

const STORAGE_KEY = "xjg_app_launcher_items";

const props = defineProps({
  modelValue: Boolean
});

const emit = defineEmits(["update:modelValue", "open-contacts", "open-profile"]);
const store = useWorkspaceStore();
const iconInput = ref(null);
const editingId = ref("");

const defaultItems = [
  { id: "account", name: "账号", icon: "账", url: "#/profile", kind: "text" },
  { id: "contacts", name: "通讯录", icon: "通", url: "contacts", kind: "contacts" },
  { id: "docs", name: "文档", icon: "文", url: "https://docs.qq.com", kind: "text" },
  { id: "sheet", name: "表格", icon: "表", url: "https://docs.qq.com/sheet", kind: "text" },
  { id: "mail", name: "谷歌邮箱", icon: "G", url: "https://mail.google.com", kind: "gmail" },
  { id: "slides", name: "幻灯片", icon: "片", url: "https://docs.qq.com/slide", kind: "text" },
  { id: "youtube", name: "视频网站", icon: "▶", url: "https://www.youtube.com", kind: "youtube" },
  { id: "maps", name: "地图", icon: "图", url: "https://maps.google.com", kind: "maps" },
  { id: "search", name: "搜索", icon: "搜", url: "https://www.google.com", kind: "google" },
  { id: "drive", name: "云端硬盘", icon: "云", url: "https://drive.google.com", kind: "drive" },
  { id: "calendar", name: "日历", icon: "31", url: "https://calendar.google.com", kind: "calendar" },
  { id: "news", name: "新闻", icon: "新", url: "https://news.google.com", kind: "news" }
];

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const items = ref(loadItems());
const draft = ref(emptyDraft());

function emptyDraft() {
  return { id: "", name: "", icon: "", url: "", kind: "text", image: "" };
}

function loadItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {
    // Keep the launcher usable even if saved data is corrupted.
  }
  return defaultItems;
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value));
}

watch(items, saveItems, { deep: true });

function startCreate() {
  editingId.value = "";
  draft.value = { ...emptyDraft(), id: `app-${Date.now()}`, icon: "新" };
}

function startEdit(item) {
  editingId.value = item.id;
  draft.value = { ...item };
}

function normalizeLauncherUrl(value) {
  const text = String(value || "").trim();
  return text === "通讯录" ? "contacts" : text;
}

function saveDraft() {
  const clean = {
    ...draft.value,
    name: String(draft.value.name || "").trim() || "未命名",
    url: normalizeLauncherUrl(draft.value.url),
    icon: String(draft.value.icon || "").trim().slice(0, 2) || String(draft.value.name || "新").slice(0, 1)
  };
  if (!clean.url) {
    store.showToast("请填写跳转链接地址");
    return;
  }
  const index = items.value.findIndex((item) => item.id === editingId.value);
  if (index >= 0) {
    items.value[index] = clean;
  } else {
    items.value.push(clean);
  }
  editingId.value = "";
  draft.value = emptyDraft();
  store.showToast("导航项已保存到本地");
}

function deleteItem(item) {
  items.value = items.value.filter((entry) => entry.id !== item.id);
  if (editingId.value === item.id) {
    editingId.value = "";
    draft.value = emptyDraft();
  }
}

function openItem(item) {
  if (item.id === "account" || item.url === "#/profile") {
    emit("open-profile");
    visible.value = false;
    return;
  }
  if (item.kind === "contacts" || item.url === "contacts") {
    emit("open-contacts");
    visible.value = false;
    return;
  }
  const url = item.url.startsWith("#") ? `${window.location.origin}/${item.url}` : item.url;
  window.open(url, "_blank", "noopener,noreferrer");
}

function pickIcon() {
  iconInput.value?.click();
}

function readIcon(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    store.showToast("图标只支持 JPG/PNG/WebP");
    return;
  }
  if (file.size > 512 * 1024) {
    store.showToast("图标不能超过 512KB");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    draft.value.image = reader.result;
    draft.value.kind = "image";
  };
  reader.readAsDataURL(file);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="launcher-popover-layer" @click.self="visible = false">
    <section class="launcher-card launcher-popover" aria-label="快捷导航" @click.stop>
      <input ref="iconInput" class="launcher-icon-input" type="file" accept="image/png,image/jpeg,image/webp" @change="readIcon" />
      <div class="launcher-head">
        <strong>快捷导航</strong>
        <div>
          <button type="button" title="新增导航" @click="startCreate"><Plus aria-hidden="true" /></button>
          <button type="button" aria-label="关闭快捷导航" @click="visible = false">×</button>
        </div>
      </div>

      <div class="launcher-grid">
        <article v-for="item in items" :key="item.id" class="launcher-item-card">
          <button class="launcher-item-main" type="button" @click="openItem(item)">
            <span class="launcher-icon" :data-kind="item.kind">
              <img v-if="item.image" :src="item.image" alt="" />
              <b v-else>{{ item.icon || item.name.slice(0, 1) }}</b>
            </span>
            <strong>{{ item.name }}</strong>
          </button>
          <div class="launcher-item-actions">
            <button type="button" title="编辑" @click="startEdit(item)"><EditPen aria-hidden="true" /></button>
            <button type="button" title="删除" @click="deleteItem(item)"><Delete aria-hidden="true" /></button>
          </div>
        </article>
      </div>

      <form v-if="draft.id" class="launcher-editor" @submit.prevent="saveDraft">
        <label>
          <span>名称</span>
          <input v-model="draft.name" placeholder="例如：通讯录" />
        </label>
        <label>
          <span>图标文字</span>
          <input v-model="draft.icon" maxlength="2" placeholder="首字" />
        </label>
        <label class="wide">
          <span>跳转链接地址</span>
          <input v-model="draft.url" placeholder="填写完整网址，或输入“通讯录”" />
        </label>
        <div class="launcher-editor-actions">
          <button type="button" @click="pickIcon"><Upload aria-hidden="true" />上传图标</button>
          <button type="button" @click="draft = emptyDraft(); editingId = ''">取消</button>
          <button type="submit">保存</button>
        </div>
      </form>
    </section>
    </div>
  </Teleport>
</template>
