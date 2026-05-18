<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ChatDotRound, Close, MoreFilled, Paperclip, Promotion, Rank } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import ScheduleMemberAvatars from "./ScheduleMemberAvatars.vue";

const props = defineProps({
  itemId: {
    type: String,
    default: ""
  },
  taskUid: {
    type: String,
    default: ""
  },
  comments: {
    type: Array,
    default: () => []
  },
  commentsCount: {
    type: Number,
    default: undefined
  }
});

const emit = defineEmits(["open", "close", "move", "resize", "send", "open-members"]);

const store = useWorkspaceStore();
const draft = ref("");
const messages = ref([]);
const messageList = ref(null);

let dragState = null;
let resizeState = null;

const chat = computed(() => store.scheduleUi?.chat || {});
const selectedItem = computed(() => {
  const itemId = props.itemId || chat.value.itemId || chat.value.targetId || store.scheduleUi?.selectedItemId;
  return (store.schedulePlan?.items || []).find((item) => item.id === itemId || item.itemId === itemId) || null;
});
const targetItemId = computed(() => props.itemId || chat.value.itemId || chat.value.targetId || selectedItem.value?.id || selectedItem.value?.itemId || "");
const targetTaskUid = computed(() => props.taskUid || chat.value.taskUid || selectedItem.value?.taskUid || "");
const visible = computed(() => Boolean(chat.value.visible));
const targetMissing = computed(() => visible.value && Boolean(targetItemId.value) && !selectedItem.value);
const targetHidden = computed(() => Boolean(selectedItem.value?.hidden));
const inputDisabled = computed(() => targetMissing.value || targetHidden.value || Boolean(chat.value.commentsLoading));
const title = computed(() => selectedItem.value?.title || "选择排期后查看评论");
const owner = computed(() => selectedItem.value?.owner || selectedItem.value?.payload?.owner || store.currentUser?.name || "管理员");
const dateRange = computed(() => {
  const item = selectedItem.value;
  if (!item?.startDate || !item?.endDate) return "暂无日期";
  return `${item.startDate}-${item.endDate}`;
});
const commentsSource = computed(() => (props.comments.length ? props.comments : Array.isArray(chat.value.comments) ? chat.value.comments : []));
const commentsTotal = computed(() => {
  if (Number.isFinite(Number(props.commentsCount))) return Number(props.commentsCount);
  if (Number.isFinite(Number(chat.value.commentsCount))) return Number(chat.value.commentsCount);
  if (Number.isFinite(Number(selectedItem.value?.commentsCount))) return Number(selectedItem.value.commentsCount);
  return messages.value.length;
});
const style = computed(() => ({
  left: `${Number(chat.value.x ?? 900)}px`,
  top: `${Number(chat.value.y ?? 220)}px`,
  width: `${Number(chat.value.width ?? 386)}px`,
  height: `${Number(chat.value.height ?? 556)}px`
}));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

function currentGeometry() {
  return {
    x: Number(chat.value.x ?? 900),
    y: Number(chat.value.y ?? 220),
    width: Number(chat.value.width ?? 386),
    height: Number(chat.value.height ?? 556)
  };
}

function viewportBounds(width = currentGeometry().width, height = currentGeometry().height) {
  if (typeof window === "undefined") return { maxX: 1600, maxY: 900 };
  return {
    maxX: Math.max(0, window.innerWidth - width - 8),
    maxY: Math.max(0, window.innerHeight - height - 8)
  };
}

function normalizeComment(comment, index) {
  const mine = Boolean(comment.mine || comment.self || comment.isMine || comment.authorRole === "self");
  const syncStatus = comment.syncStatus || comment.payload?.syncStatus || "";
  return {
    id: comment.id || `comment-${index}`,
    mine,
    sender: comment.sender || comment.authorName || comment.author || (mine ? "项目管理 · 管理员" : "协同成员"),
    time: comment.time || comment.createdAt || "刚刚",
    body: comment.body || comment.content || comment.text || "请同步当前排期节点进展。",
    color: comment.color || ["#ef6b9a", "#f4c327", "#e11d35", "#99d2f4"][index % 4],
    syncStatus
  };
}

function resetMessages() {
  const source = commentsSource.value;
  messages.value = source.length ? source.map(normalizeComment) : [];
  scrollToBottom();
}

function scrollToBottom() {
  nextTick(() => {
    if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
  });
}

function constrainWindow() {
  const geometry = currentGeometry();
  const bounds = viewportBounds(geometry.width, geometry.height);
  const x = clamp(geometry.x, 0, bounds.maxX);
  const y = clamp(geometry.y, 0, bounds.maxY);
  if (x !== geometry.x || y !== geometry.y) {
    store.moveScheduleChat({ x, y });
  }
}

function openChat() {
  const geometry = currentGeometry();
  const bounds = viewportBounds(geometry.width, geometry.height);
  const payload = {
    itemId: targetItemId.value,
    taskUid: targetTaskUid.value,
    comments: commentsSource.value,
    commentsCount: commentsTotal.value,
    x: clamp(geometry.x, 0, bounds.maxX),
    y: clamp(geometry.y, 0, bounds.maxY),
    width: geometry.width,
    height: geometry.height
  };
  const next = store.openScheduleChat(payload);
  emit("open", next);
}

function closeChat() {
  const next = store.closeScheduleChat();
  emit("close", next);
}

function startDrag(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const geometry = currentGeometry();
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    originX: geometry.x,
    originY: geometry.y,
    width: geometry.width,
    height: geometry.height
  };
  window.addEventListener("pointermove", dragChat);
  window.addEventListener("pointerup", stopDrag);
  document.body.style.userSelect = "none";
}

function dragChat(event) {
  if (!dragState) return;
  const bounds = viewportBounds(dragState.width, dragState.height);
  const x = clamp(dragState.originX + event.clientX - dragState.startX, 0, bounds.maxX);
  const y = clamp(dragState.originY + event.clientY - dragState.startY, 0, bounds.maxY);
  const next = store.moveScheduleChat({ x, y });
  emit("move", next);
}

function stopDrag() {
  dragState = null;
  window.removeEventListener("pointermove", dragChat);
  window.removeEventListener("pointerup", stopDrag);
  document.body.style.userSelect = "";
}

function startResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const geometry = currentGeometry();
  resizeState = {
    startX: event.clientX,
    startY: event.clientY,
    originWidth: geometry.width,
    originHeight: geometry.height,
    x: geometry.x,
    y: geometry.y
  };
  window.addEventListener("pointermove", resizeChat);
  window.addEventListener("pointerup", stopResize);
  document.body.style.userSelect = "none";
}

function resizeChat(event) {
  if (!resizeState) return;
  const maxWidth = typeof window === "undefined" ? 560 : Math.max(300, window.innerWidth - resizeState.x - 8);
  const maxHeight = typeof window === "undefined" ? 720 : Math.max(360, window.innerHeight - resizeState.y - 8);
  const width = clamp(resizeState.originWidth + event.clientX - resizeState.startX, 300, Math.min(560, maxWidth));
  const height = clamp(resizeState.originHeight + event.clientY - resizeState.startY, 360, Math.min(720, maxHeight));
  const next = store.resizeScheduleChat({ width, height });
  emit("resize", next);
}

function stopResize() {
  resizeState = null;
  window.removeEventListener("pointermove", resizeChat);
  window.removeEventListener("pointerup", stopResize);
  document.body.style.userSelect = "";
}

async function sendMessage() {
  const body = draft.value.trim();
  if (!body || inputDisabled.value) return;
  draft.value = "";
  const comment = await store.createScheduleChatComment(targetItemId.value, {
    content: body,
    payload: {
      taskUid: targetTaskUid.value
    },
    authorName: owner.value
  });
  emit("send", { itemId: targetItemId.value, taskUid: targetTaskUid.value, message: comment });
  scrollToBottom();
}

watch(() => `${targetItemId.value}|${commentsSource.value.length}|${visible.value}|${chat.value.commentsSyncStatus}`, resetMessages, { immediate: true });
watch(
  () => [visible.value, targetItemId.value, targetMissing.value, targetHidden.value],
  ([isOpen, itemId, missing, hidden], [wasOpen, previousItemId, wasMissing, wasHidden] = []) => {
    if (!isOpen) return;
    if (!wasOpen) nextTick(constrainWindow);

    const becameAvailable = (wasMissing || wasHidden) && !missing && !hidden;
    if (itemId && !missing && !hidden && (!wasOpen || itemId !== previousItemId || becameAvailable)) {
      store.loadScheduleChatComments(itemId);
    }
  }
);

onBeforeUnmount(() => {
  stopDrag();
  stopResize();
});
</script>

<template>
  <aside
    v-if="visible"
    class="schedule-floating-chat"
    :style="style"
    data-testid="schedule-floating-chat-window"
    aria-label="排期浮动聊天"
  >
    <header class="schedule-floating-chat-head" data-testid="schedule-floating-chat-header" @pointerdown="startDrag">
      <div class="schedule-floating-chat-title">
        <div>
          <strong>排期</strong>
          <span>{{ dateRange }}</span>
        </div>
        <p>{{ title }}</p>
        <small>负责人：{{ owner }} · 评论 {{ commentsTotal }}</small>
      </div>
      <ScheduleMemberAvatars small @open-members="emit('open-members')" />
      <button type="button" title="关闭聊天" data-testid="schedule-floating-chat-close" @pointerdown.stop @click="closeChat">
        <Close aria-hidden="true" />
      </button>
    </header>

    <div ref="messageList" class="schedule-floating-chat-body" data-testid="schedule-floating-chat-messages">
      <div v-if="targetMissing || targetHidden" class="schedule-chat-notice" data-testid="schedule-floating-chat-disabled-notice">
        当前排期已删除或隐藏，评论只读显示。
      </div>
      <div v-else-if="chat.commentsLoading" class="schedule-chat-notice">
        正在加载评论...
      </div>
      <div v-else-if="chat.commentsSyncStatus === 'failed'" class="schedule-chat-notice is-warning">
        评论接口暂不可用，已切换为本地消息。
      </div>
      <div v-else-if="!messages.length" class="schedule-chat-notice">
        暂无评论，发送第一条协同消息。
      </div>
      <div v-for="message in messages" :key="message.id" class="schedule-chat-message" :class="{ 'is-self': message.mine }">
        <span v-if="!message.mine" class="schedule-chat-avatar" :style="{ background: message.color }"></span>
        <div>
          <small>{{ message.sender }} / {{ message.time }} <b v-if="message.syncStatus === 'failed'">发送失败，已本地保留</b></small>
          <p>{{ message.body }}</p>
        </div>
        <span v-if="message.mine" class="schedule-chat-avatar is-blue"></span>
      </div>
    </div>

    <form class="schedule-floating-chat-input" @submit.prevent="sendMessage">
      <input v-model="draft" data-testid="schedule-floating-chat-input" :disabled="inputDisabled" placeholder="请发表评论，可输入 @ 选择通讯录成员" />
      <button type="button" title="附件"><Paperclip aria-hidden="true" /></button>
      <button type="button" title="更多"><MoreFilled aria-hidden="true" /></button>
      <button type="submit" data-testid="schedule-floating-chat-send" :disabled="inputDisabled"><Promotion aria-hidden="true" />发送</button>
    </form>

    <button
      class="schedule-chat-resize"
      type="button"
      title="调整大小"
      data-testid="schedule-floating-chat-resize"
      @pointerdown="startResize"
    >
      <Rank aria-hidden="true" />
    </button>
  </aside>

  <button
    v-else
    class="schedule-floating-chat-entry"
    type="button"
    title="打开排期聊天"
    data-testid="schedule-floating-chat-launcher"
    @click="openChat"
  >
    <ChatDotRound aria-hidden="true" />
  </button>
</template>

<style scoped>
.schedule-floating-chat,
.schedule-floating-chat-entry {
  position: fixed;
  z-index: 1200;
  font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
}

.schedule-floating-chat {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 300px;
  min-height: 360px;
  overflow: hidden;
  border: 1px solid #dce2ea;
  border-radius: 14px;
  background: #f5f7fb;
  box-shadow: 0 18px 42px rgba(38, 55, 78, 0.18);
}

.schedule-floating-chat-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 28px;
  gap: 10px;
  align-items: center;
  min-height: 78px;
  padding: 16px 18px 12px 24px;
  background: rgba(255, 255, 255, 0.72);
  cursor: grab;
  user-select: none;
}

.schedule-floating-chat-head:active {
  cursor: grabbing;
}

.schedule-floating-chat-title {
  min-width: 0;
}

.schedule-floating-chat-title > div {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.schedule-floating-chat-title strong {
  color: #969da6;
  font-size: 24px;
  font-weight: 500;
  line-height: 1;
}

.schedule-floating-chat-title span,
.schedule-floating-chat-title small,
.schedule-chat-message small {
  color: #8d98a5;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.2;
}

.schedule-floating-chat-title p {
  max-width: 220px;
  margin: 7px 0 3px;
  overflow: hidden;
  color: #252b30;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-floating-chat-head button {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  padding: 0;
  border: 1px solid #8a8f96;
  border-radius: 6px;
  color: #4b535b;
  background: #ffffff;
}

.schedule-floating-chat-head button:hover {
  transform: none;
  background: #f8fbff;
}

.schedule-floating-chat-body {
  min-height: 0;
  padding: 0 22px 12px 24px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #c5ced8 transparent;
}

.schedule-chat-notice {
  margin: 0 0 12px;
  padding: 8px 10px;
  border: 1px solid #d9e3ee;
  border-radius: 6px;
  color: #566271;
  background: #eef4fb;
  font-size: 11px;
  line-height: 1.35;
}

.schedule-chat-notice.is-warning {
  border-color: #f0d199;
  color: #785322;
  background: #fff8e8;
}

.schedule-chat-message {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin: 8px 0 18px;
}

.schedule-chat-message.is-self {
  grid-template-columns: minmax(0, 1fr) 28px;
}

.schedule-chat-avatar {
  width: 28px;
  height: 28px;
  margin-top: 18px;
  border-radius: 50%;
}

.schedule-chat-avatar.is-blue {
  background: #99d2f4;
}

.schedule-chat-message.is-self > div {
  justify-self: end;
  text-align: right;
}

.schedule-chat-message small b {
  display: inline-block;
  margin-left: 6px;
  color: #c54242;
  font-weight: 700;
}

.schedule-chat-message p {
  width: fit-content;
  max-width: min(274px, 100%);
  min-height: 42px;
  margin: 5px 0 0;
  padding: 12px 14px;
  border-radius: 8px 10px 10px 10px;
  color: #37404a;
  background: #dfe3eb;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
}

.schedule-chat-message.is-self p {
  margin-left: auto;
  border-radius: 10px 8px 10px 10px;
  background: #99d2f4;
}

.schedule-floating-chat-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px 28px 58px;
  gap: 6px;
  align-items: center;
  padding: 8px 10px 10px;
  border-top: 1px solid rgba(220, 226, 234, 0.72);
  background: rgba(245, 247, 251, 0.96);
}

.schedule-floating-chat-input input {
  width: 100%;
  height: 30px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid #d9dee5;
  border-radius: 5px;
  color: #2d343c;
  background: #ffffff;
  font-size: 11px;
  outline: none;
}

.schedule-floating-chat-input input:focus {
  border-color: #9ed0ec;
  box-shadow: 0 0 0 2px rgba(125, 195, 238, 0.18);
}

.schedule-floating-chat-input input:disabled {
  color: #8d98a5;
  background: #eef1f5;
  cursor: not-allowed;
}

.schedule-floating-chat-input button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 30px;
  min-width: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  color: #ffffff;
  background: #7dc3ee;
  font-size: 12px;
  font-weight: 800;
}

.schedule-floating-chat-input button:hover {
  transform: none;
}

.schedule-floating-chat-input button:disabled {
  color: #f8fbff;
  background: #b9c4d0;
  cursor: not-allowed;
}

.schedule-chat-resize {
  position: absolute;
  right: 5px;
  bottom: 5px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid #e43d48;
  border-radius: 4px;
  color: #e43d48;
  background: #ffffff;
  cursor: nwse-resize;
}

.schedule-chat-resize:hover {
  transform: none;
}

.schedule-floating-chat-entry {
  right: 28px;
  bottom: 30px;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid #cfd7e2;
  border-radius: 50%;
  color: #19394f;
  background: #ffffff;
  box-shadow: 0 12px 28px rgba(37, 58, 80, 0.16);
}

.schedule-floating-chat-entry:hover {
  background: #f3f9ff;
  transform: translateY(-1px);
}

@media (max-width: 700px) {
  .schedule-floating-chat-entry {
    right: 14px;
    bottom: 16px;
  }

  .schedule-floating-chat {
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
  }
}
</style>
