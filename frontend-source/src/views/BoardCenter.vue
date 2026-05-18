<script setup>
import { computed, reactive } from "vue";
import { avatarTones, taskModules } from "@/data/seed";
import { useWorkspaceStore } from "@/stores/workspace";
import { idsEqual } from "@/stores/workspace/helpers";
import { getUserBoardPermission } from "@/features/collab-board/boardModel";

const store = useWorkspaceStore();
const activeTab = reactive({ key: "mine" });
const contextMenu = reactive({ open: false, x: 0, y: 0, boardId: "" });
const sharePanel = reactive({ open: false, boardId: "", draft: {} });
const boardDialog = reactive({ open: false, type: "", boardId: "", input: "" });

const tabs = computed(() => [
  { key: "mine", label: "我的画板", count: store.myBoards.length },
  { key: "shared-with-me", label: "共享给我", count: store.sharedWithMeBoards.length },
  { key: "shared-by-me", label: "我共享的", count: store.sharedByMeBoards.length }
]);

const visibleBoards = computed(() => {
  if (activeTab.key === "shared-with-me") return store.sharedWithMeBoards;
  if (activeTab.key === "shared-by-me") return store.sharedByMeBoards;
  return store.myBoards;
});

const selectedBoard = computed(() => (store.boards || []).find((board) => board.id === sharePanel.boardId) || null);
const dialogBoard = computed(() => (store.boards || []).find((board) => board.id === boardDialog.boardId) || null);
const shareUsers = computed(() =>
  store.activeUsers.filter((user) => user.id !== selectedBoard.value?.ownerId && user.id !== store.currentUser?.id)
);

function projectName(board) {
  return store.allProjects.find((project) => idsEqual(project.id, board.projectId))?.name || "未命名项目";
}

function scopeName(board) {
  if (board.scopeType !== "module") return "项目画板";
  return taskModules.find((module) => module.key === board.moduleKey)?.label || board.moduleKey || "部门画板";
}

function permissionLabel(board) {
  const permission = getUserBoardPermission(board, store.currentUser);
  if (permission === "owner") return "拥有者";
  if (permission === "edit") return "可编辑";
  if (permission === "readonly") return "只读";
  return store.canEditBoardRecord(board) ? "项目权限" : "只读";
}

function openContextMenu(event, board) {
  const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale-factor")) || 1;
  const menuWidth = 132;
  const menuHeight = 108;
  const gap = 10;
  const viewportWidth = window.innerWidth / scale;
  const viewportHeight = window.innerHeight / scale;
  contextMenu.open = true;
  contextMenu.x = Math.max(gap, Math.min(event.clientX / scale + gap, viewportWidth - menuWidth - gap));
  contextMenu.y = Math.max(gap, Math.min(event.clientY / scale + gap, viewportHeight - menuHeight - gap));
  contextMenu.boardId = board.id;
}

function closeContextMenu() {
  contextMenu.open = false;
}

function currentContextBoard() {
  return (store.boards || []).find((board) => board.id === contextMenu.boardId) || null;
}

function closeBoardDialog() {
  boardDialog.open = false;
  boardDialog.type = "";
  boardDialog.boardId = "";
  boardDialog.input = "";
}

function renameBoard(board = null) {
  const target = board || currentContextBoard();
  closeContextMenu();
  if (!target) return;
  boardDialog.open = true;
  boardDialog.type = "rename";
  boardDialog.boardId = target.id;
  boardDialog.input = target.title || "";
}

function deleteBoard(board = null) {
  const target = board || currentContextBoard();
  closeContextMenu();
  if (!target) return;
  boardDialog.open = true;
  boardDialog.type = "delete";
  boardDialog.boardId = target.id;
  boardDialog.input = "";
}

function submitBoardDialog() {
  if (!dialogBoard.value) return closeBoardDialog();
  if (boardDialog.type === "rename") {
    const next = boardDialog.input.trim();
    if (!next) return;
    if (store.renameBoardById(dialogBoard.value.id, next)) closeBoardDialog();
    return;
  }
  if (boardDialog.type === "delete" && store.deleteBoardById(dialogBoard.value.id)) closeBoardDialog();
}

function openSharePanel(board = null) {
  const target = board || currentContextBoard();
  closeContextMenu();
  if (!target) return;
  closeBoardDialog();
  sharePanel.boardId = target.id;
  sharePanel.draft = {};
  (target.sharedWith || []).forEach((entry) => {
    if (entry.userId || entry.userName) sharePanel.draft[entry.userId || entry.userName] = entry.permission;
  });
  sharePanel.open = true;
}

function permissionFor(user) {
  return sharePanel.draft[user.id] || sharePanel.draft[user.name] || "none";
}

function setPermission(user, permission) {
  sharePanel.draft[user.id] = permission;
}

function saveSharePanel() {
  const entries = shareUsers.value
    .map((user) => ({ userId: user.id, userName: user.name, permission: permissionFor(user) }))
    .filter((entry) => entry.permission === "edit" || entry.permission === "readonly");
  if (store.shareBoardById(sharePanel.boardId, entries)) sharePanel.open = false;
}
</script>

<template>
  <section class="board-center-page" aria-label="画板中心" @click="closeContextMenu">
    <header class="board-center-head">
      <div>
        <span>画板中心</span>
        <h2>画板</h2>
      </div>
      <div class="board-center-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="{ 'is-active': activeTab.key === tab.key }"
          @click="activeTab.key = tab.key"
        >
          {{ tab.label }} <b>{{ tab.count }}</b>
        </button>
      </div>
    </header>

    <div v-if="visibleBoards.length" class="board-center-grid">
      <article
        v-for="board in visibleBoards"
        :key="board.id"
        class="board-center-card"
        @contextmenu.prevent.stop="openContextMenu($event, board)"
      >
        <span>{{ scopeName(board) }}</span>
        <h3>{{ board.title }}</h3>
        <p>{{ projectName(board) }}</p>
        <footer>
          <small>{{ board.ownerName || board.createdBy }} · {{ permissionLabel(board) }}</small>
          <button type="button" @click="store.openBoardFromCenter(board.id)">打开</button>
        </footer>
      </article>
    </div>

    <div v-else class="board-center-empty">
      <strong>暂无画板</strong>
      <small>在项目或部门画板库中新建后，会出现在这里。</small>
    </div>

    <div v-if="contextMenu.open" class="board-context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
      <button type="button" @click="renameBoard()">重命名</button>
      <button type="button" @click="openSharePanel()">共享设置</button>
      <button type="button" class="danger" @click="deleteBoard()">删除</button>
    </div>

    <aside v-if="sharePanel.open" class="board-share-panel" @click.stop>
      <header>
        <div>
          <strong>画板权限</strong>
          <small>{{ selectedBoard?.title }}</small>
        </div>
        <button type="button" @click="sharePanel.open = false">×</button>
      </header>
      <div class="board-share-list">
        <div v-if="!shareUsers.length" class="board-share-empty">暂无可共享用户，请先在项目成员或通讯录里添加成员。</div>
        <label v-for="user in shareUsers" :key="user.id" class="board-share-row">
          <span class="avatar" :data-tone="avatarTones[user.name.length % avatarTones.length]">{{ user.avatar || user.name.slice(0, 1) }}</span>
          <strong>{{ user.name }}</strong>
          <select :value="permissionFor(user)" @change="setPermission(user, $event.target.value)">
            <option value="none">不共享</option>
            <option value="readonly">只读</option>
            <option value="edit">可编辑</option>
          </select>
        </label>
      </div>
      <footer>
        <button class="board-ghost-btn" type="button" @click="sharePanel.open = false">取消</button>
        <button class="board-ghost-btn primary" type="button" @click="saveSharePanel">保存权限</button>
      </footer>
    </aside>

    <div v-if="boardDialog.open" class="board-local-dialog-mask" @click.self="closeBoardDialog">
      <form class="board-local-dialog" @submit.prevent="submitBoardDialog">
        <button class="board-local-close" type="button" @click="closeBoardDialog">×</button>
        <strong>{{ boardDialog.type === 'rename' ? '重命名画板' : '删除画板' }}</strong>
        <p v-if="boardDialog.type === 'rename'">请输入新的画板名称</p>
        <p v-else>确认删除「{{ dialogBoard?.title }}」吗？删除后不会影响其他画板。</p>
        <input v-if="boardDialog.type === 'rename'" v-model.trim="boardDialog.input" type="text" maxlength="40" autofocus />
        <footer>
          <button class="board-ghost-btn" type="button" @click="closeBoardDialog">取消</button>
          <button class="board-ghost-btn" :class="{ danger: boardDialog.type === 'delete', primary: boardDialog.type === 'rename' }" type="submit">
            {{ boardDialog.type === 'rename' ? '确定' : '删除' }}
          </button>
        </footer>
      </form>
    </div>
  </section>
</template>
