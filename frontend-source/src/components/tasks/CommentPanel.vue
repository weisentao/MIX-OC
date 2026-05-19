<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  task: {
    type: Object,
    required: true
  }
});

const store = useWorkspaceStore();
const comment = ref("");
const selectedMentions = ref([]);
const pickerOpen = ref(false);
const mentionOpen = ref(false);
const emojiPage = ref("常用");

const emojiGroups = {
  常用: ["😀", "😂", "😊", "😍", "🥰", "😎", "😭", "😅", "😤", "🤔", "👍", "🙏", "👏", "🤝", "👌", "💪", "✅", "⚠️", "📌", "⏰"],
  工作: ["🎯", "💡", "📝", "📎", "📁", "📦", "🔍", "🔧", "📊", "📅", "🚩", "⭐", "🔥", "✨", "💬", "📣", "🧩", "🛠️", "🧠", "🏁"],
  表情: ["😄", "😆", "😉", "😋", "😐", "😮", "😴", "😵", "🥲", "😇", "😈", "🤯", "🥳", "😬", "🙃", "😌", "😞", "😡", "🤩", "😶"],
  GIF: ["[GIF:收到]", "[GIF:加油]", "[GIF:好的]", "[GIF:马上改]", "[GIF:辛苦了]", "[GIF:已确认]", "[GIF:在看]", "[GIF:催一下]"]
};

const GIF_TEXT_ALIASES = {
  收到: "收到",
  加油: "加油",
  OK: "好的",
  ok: "好的",
  好的: "好的",
  马上改: "马上改",
  辛苦了: "辛苦了",
  已确认: "已确认",
  在看: "在看",
  催一下: "催一下"
};

const activeEmojis = computed(() => emojiGroups[emojiPage.value] || emojiGroups.常用);
const mentionUsers = computed(() => store.activeMembersDetailed.filter((user) => user.status !== "archived"));

onMounted(() => {
  store.markTaskCommentsRead(props.task.id);
});

watch(
  () => props.task.comments.length,
  () => {
    store.markTaskCommentsRead(props.task.id);
  }
);

function submit() {
  if (store.addComment(props.task.id, comment.value, selectedMentions.value)) {
    comment.value = "";
    selectedMentions.value = [];
    pickerOpen.value = false;
    mentionOpen.value = false;
  }
}

function insertEmoji(emoji) {
  comment.value += emoji.startsWith("[GIF:") ? `${emoji} ` : emoji;
  pickerOpen.value = false;
}

function displayEmoji(emoji) {
  if (!emoji.startsWith("[GIF:")) return emoji;
  const clean = emoji.replace("[GIF:", "").replace("]", "").trim();
  return GIF_TEXT_ALIASES[clean] || clean;
}

function insertMention(user) {
  const prefix = comment.value.endsWith(" ") || !comment.value ? "" : " ";
  comment.value += `${prefix}@${user.name} `;
  selectedMentions.value = [
    ...selectedMentions.value.filter((item) => item.userId !== user.id && item.name !== user.name),
    { userId: user.id, username: user.username || "", name: user.name }
  ];
  mentionOpen.value = false;
}

function openCommentUser(item) {
  const user = store.getUserByName(item.user);
  if (!user) {
    store.showToast("通讯录里暂未找到该用户");
    return;
  }
  window.dispatchEvent(new CustomEvent("xjg-open-profile", { detail: { userId: user.id, readonly: true } }));
}

function textareaKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  submit();
}

function isOwnComment(item) {
  return item.user === store.currentUser?.name;
}
</script>

<template>
  <div class="comment-drawer animate__animated animate__fadeInDown">
    <div class="comment-scroll">
      <div v-for="item in task.comments" :key="`${item.time}-${item.text}`" class="comment-row" :class="{ 'is-own': isOwnComment(item) }">
        <button class="avatar comment-avatar-button" type="button" :data-tone="item.tone" :title="`查看 ${item.user} 的主页`" @click="openCommentUser(item)">{{ item.user.slice(0, 1) }}</button>
        <div class="comment-bubble">
          <strong>{{ item.dept }}: {{ item.user }} / {{ item.time }}</strong>
          {{ item.text }}
        </div>
      </div>
      <div v-if="!task.comments.length" class="empty-state compact">暂无协同评论</div>
    </div>
    <form class="comment-form" @submit.prevent.stop="submit">
      <textarea v-model="comment" name="comment" placeholder="请发表你的评论，可输入 @ 或点击 @ 选择通讯录成员" @focus="mentionOpen = false" @keydown="textareaKeydown"></textarea>
      <button class="mention-toggle" type="button" title="@ 通讯录成员" @click.stop="mentionOpen = !mentionOpen; pickerOpen = false">@</button>
      <button class="emoji-toggle" type="button" title="添加表情" @click.stop="pickerOpen = !pickerOpen">☺</button>
      <button type="submit" title="发送评论">发送</button>
      <div v-if="mentionOpen" class="mention-picker" @click.stop>
        <button v-for="user in mentionUsers" :key="user.id" type="button" @click="insertMention(user)">
          <span class="avatar mini-avatar" :data-tone="user.tone || 'blue'">{{ user.avatar }}</span>
          {{ user.name }} · {{ store.roleLabel(user.role) }}
        </button>
      </div>
      <div v-if="pickerOpen" class="emoji-picker" @click.stop>
        <div class="emoji-tabs">
          <button v-for="(_, name) in emojiGroups" :key="name" type="button" :class="{ active: emojiPage === name }" @click="emojiPage = name">{{ name }}</button>
        </div>
        <div class="emoji-grid">
          <button v-for="emoji in activeEmojis" :key="emoji" type="button" :class="{ 'is-gif': emoji.startsWith('[GIF:') }" @click="insertEmoji(emoji)">{{ displayEmoji(emoji) }}</button>
        </div>
      </div>
    </form>
  </div>
</template>
