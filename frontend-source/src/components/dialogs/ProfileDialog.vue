<script setup>
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { askText } from "@/utils/appDialog";
import defaultCharacterImage from "@/assets/profile-character-default.png";

const props = defineProps({
  modelValue: Boolean,
  userId: {
    type: String,
    default: ""
  },
  readonly: Boolean
});

const emit = defineEmits(["update:modelValue", "logout", "change-password"]);
const store = useWorkspaceStore();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const avatarInput = ref(null);
const characterInput = ref(null);
const signatureInput = ref(null);
const emailPanelOpen = ref(false);
const emailSaving = ref(false);
const editableEmail = computed(() => (user.value?.email || "").trim());

const user = computed(() => store.getUser(props.userId) || store.currentUser);
const isOwnProfile = computed(() => Boolean(user.value?.id && user.value.id === store.currentUser?.id));
const canEdit = computed(() => !props.readonly && (store.isAdmin || isOwnProfile.value));
const showAccountActions = computed(() => isOwnProfile.value);
const canEditEmail = computed(() => canEdit.value && isOwnProfile.value);
const emailText = computed(() => {
  if (editableEmail.value) return editableEmail.value;
  return canEditEmail.value ? "点击填写邮箱" : "暂未填写邮箱";
});
const departmentTitle = computed(() => user.value?.department || "三维视觉部");
const departmentEnParts = computed(() => {
  const text = user.value?.department || "三维视觉部";
  const main = text.replace(/部/u, "").trim() || "三维视觉";
  return [main, "部门"];
});
const emailProviders = [
  { label: "谷歌邮箱", url: "https://mail.google.com/" },
  { label: "QQ 邮箱", url: "https://mail.qq.com/" },
  { label: "网易 163", url: "https://mail.163.com/" },
  { label: "微软邮箱", url: "https://outlook.live.com/mail/" }
];

function close() {
  emailPanelOpen.value = false;
  visible.value = false;
}

async function edit(field, label, maxLength) {
  if (!canEdit.value) return;
  if (field === "email" && !canEditEmail.value) return;
  const next = await askText({
    title: `修改${label}`,
    message: `请输入${label}（最多 ${maxLength} 字）`,
    inputValue: user.value?.[field] || ""
  });
  if (next === null) return;
  const value = String(next).trim();
  if (!value) return;
  if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    store.showToast("请输入有效邮箱");
    return;
  }
  if (store.isAdmin && user.value?.id !== store.currentUser?.id) {
    store.updateUserField(user.value.id, field, value.slice(0, maxLength));
  } else {
    store.updateCurrentUserField(field, value, maxLength);
  }
}

async function editEmail() {
  if (!canEditEmail.value || emailSaving.value) return;
  emailSaving.value = true;
  try {
    await edit("email", "邮箱", 128);
    emailPanelOpen.value = false;
  } finally {
    emailSaving.value = false;
  }
}

function pickFile(inputRef) {
  if (!canEdit.value) return;
  const input = inputRef?.value || inputRef;
  input?.click?.();
}

function readImage(event, { field, label, pngOnly = false, maxSize, maxWidth, maxHeight }) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !canEdit.value) return;
  if (pngOnly && file.type !== "image/png") {
    store.showToast(`${label}只支持 PNG 格式`);
    return;
  }
  if (!pngOnly && !["image/png", "image/jpeg"].includes(file.type)) {
    store.showToast(`${label}只支持 JPG/PNG 格式`);
    return;
  }
  if (file.size > maxSize) {
    const sizeText = maxSize >= 1024 * 1024 ? `${Math.round((maxSize / 1024 / 1024) * 10) / 10}MB` : `${Math.round(maxSize / 1024)}KB`;
    store.showToast(`${label}大小不能超过 ${sizeText}`);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      if (image.width > maxWidth || image.height > maxHeight) {
        store.showToast(`${label}尺寸不能超过 ${maxWidth}x${maxHeight}px`);
        return;
      }
      if (store.isAdmin && user.value?.id !== store.currentUser?.id) {
        store.updateUserField(user.value.id, field, reader.result);
      } else {
        store.updateCurrentUserAsset(field, reader.result, label);
      }
    };
    image.onerror = () => store.showToast("图片读取失败");
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function toggleEmailPanel() {
  if (!canEditEmail.value) return;
  emailPanelOpen.value = !emailPanelOpen.value;
}

function openMailProvider(url) {
  emailPanelOpen.value = false;
  window.open(url, "_blank", "noopener,noreferrer");
  store.showToast("已打开邮箱入口");
}

function profileAction(action) {
  if (!showAccountActions.value) return;
  if (action === "change-password") {
    emit("change-password");
    return;
  }
  if (action === "logout") {
    close();
    emit("logout");
  }
}
</script>

<template>
  <el-dialog v-model="visible" class="profile-page-shell" width="min(1320px, calc(100vw - 44px))" :show-close="false">
    <section v-if="user" class="profile-page" aria-label="个人中心">
      <input
        ref="avatarInput"
        class="profile-file"
        type="file"
        accept="image/png,image/jpeg"
        @change="readImage($event, { field: 'avatarImage', label: '头像', maxSize: 500 * 1024, maxWidth: 200, maxHeight: 200 })"
      />
      <input
        ref="characterInput"
        class="profile-file"
        type="file"
        accept="image/png"
        @change="readImage($event, { field: 'characterImage', label: '人物图片', pngOnly: true, maxSize: 3 * 1024 * 1024, maxWidth: 1200, maxHeight: 1800 })"
      />
      <input
        ref="signatureInput"
        class="profile-file"
        type="file"
        accept="image/png"
        @change="readImage($event, { field: 'signatureImage', label: '手写签名', pngOnly: true, maxSize: 800 * 1024, maxWidth: 600, maxHeight: 200 })"
      />

      <div class="profile-canvas">
        <div class="profile-left">
          <div class="profile-title-cn">{{ departmentTitle }}</div>
          <div class="profile-title-en">{{ departmentEnParts[0] }}</div>
          <div class="profile-title-dept">{{ departmentEnParts[1] }}</div>
          <div class="profile-tags">
            <span class="profile-tag-blue">{{ user.job || "角色建模" }}</span>
            <span class="profile-tag-gray">{{ user.name || "当前用户" }}</span>
          </div>

          <button class="profile-mbti editable-text" :disabled="!canEdit" type="button" @click="edit('mbti', 'MBTI', 4)">
            {{ user.mbti || "ENTP" }}
            <i v-if="canEdit">✓</i>
          </button>
          <button class="profile-phone editable-text" :disabled="!canEdit" type="button" @click="edit('phone', '手机号', 32)">
            {{ user.phone || "18556654263" }}
            <i v-if="canEdit">✓</i>
          </button>
          <button class="profile-mood editable-text" :disabled="!canEdit" type="button" @click="edit('mood', '心情签名', 255)">
            {{ user.mood || "心情不好就喜欢听音乐和吃东西" }}
            <i v-if="canEdit">✓</i>
          </button>
          <button class="profile-signature editable-text" :disabled="!canEdit" type="button" @click="edit('signature', '个性签名', 255)">
            {{ user.signature || "其实我不想加班，也不想上班，想过年" }}
            <i v-if="canEdit">✓</i>
          </button>
        </div>

        <button class="profile-character-stage" :disabled="!canEdit" type="button" :title="canEdit ? '上传 PNG 人物图' : undefined" @click="pickFile(characterInput)">
          <img :src="user.characterImage || defaultCharacterImage" alt="" />
          <b v-if="canEdit">+</b>
        </button>

        <button class="profile-hand-sign" :disabled="!canEdit" type="button" @click="pickFile(signatureInput)">
          <img v-if="user.signatureImage" :src="user.signatureImage" alt="" />
          <svg v-else class="profile-sign-svg" viewBox="0 0 620 230" aria-hidden="true">
            <path d="M22 128C80 92 116 80 143 92c33 15-5 91-38 84-29-6-18-70 30-95 67-35 123-8 154 30 22 27 16 68-16 73-27 4-42-30-19-57 39-46 118-62 172-47 26 8 35 22 20 39-18 21-68 20-75 4-6-15 27-23 70-28 72-9 126-27 158-57" />
            <path d="M72 167c91-9 196-35 292-70 70-25 142-48 226-64" />
          </svg>
          <i v-if="canEdit">✓</i>
        </button>

        <button class="profile-avatar-badge" :disabled="!canEdit" type="button" :title="canEdit ? '上传头像' : undefined" @click="pickFile(avatarInput)">
          <img v-if="user.avatarImage" :src="user.avatarImage" alt="" />
          <svg v-else class="profile-avatar-default" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="39" fill="#1d79a8" stroke="#222" stroke-width="1.5" />
            <path d="M10 56c10-18 22-27 36-27 13 0 23 10 24 27Z" fill="#f7fbff" />
            <path d="M18 55h45" stroke="#222" stroke-width="2" />
            <path d="M39 18v38" stroke="#d91e35" stroke-width="5" />
            <path d="M20 35c9 9 21 14 38 14" stroke="#d91e35" stroke-width="4" />
            <path d="M23 35c13-4 28-4 43 0" stroke="#111" stroke-width="4" />
            <circle cx="40" cy="38" r="8" fill="#fff" />
          </svg>
          <i v-if="canEdit">+</i>
        </button>

        <div class="profile-top-actions">
          <button v-if="showAccountActions" type="button" @click="profileAction('change-password')">修改密码</button>
          <button v-if="showAccountActions" type="button" @click="profileAction('logout')">退出登录</button>
          <strong>{{ user.name || "当前用户" }}</strong>
        </div>

        <div class="profile-email">
          <span>邮箱：</span>
          <button v-if="canEditEmail" type="button" :disabled="emailSaving" @click="editEmail">{{ emailText }}</button>
          <strong v-else class="profile-email-readonly">{{ emailText }}</strong>
          <button v-if="canEditEmail" type="button" title="选择邮箱入口" @click="toggleEmailPanel">→</button>
        </div>
        <div v-if="canEditEmail && emailPanelOpen" class="profile-email-panel">
          <button v-for="provider in emailProviders" :key="provider.label" type="button" @click="openMailProvider(provider.url)">
            {{ provider.label }}
          </button>
        </div>

        <button class="profile-page-close" type="button" aria-label="关闭个人主页" @click="close">×</button>
      </div>
    </section>
  </el-dialog>
</template>
