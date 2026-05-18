<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { avatarTones } from "@/data/seed";
import { useWorkspaceStore } from "@/stores/workspace";
import { mountExcalidrawBoard, unmountExcalidrawBoard } from "@/features/collab-board/ExcalidrawIsland.jsx";

const store = useWorkspaceStore();
const canvasRef = ref(null);
const historyOpen = ref(false);
const islandError = ref("");
const newBoardTitle = ref("");
const contextMenu = reactive({ open: false, x: 0, y: 0, boardId: "" });
const sharePanel = reactive({ open: false, boardId: "", draft: {} });
const boardDialog = reactive({ open: false, type: "", boardId: "", input: "" });
let boardRoot = null;
let saveTimer = 0;
let pendingPayload = null;

const boardTitle = computed(() => store.activeBoard?.title || "协作画板");
const boardSubtitle = computed(() => (store.boardLibraryOpen ? store.activeBoardScopeLabel : `${store.activeBoardScopeLabel} · ${store.roleLabel(store.currentProjectRole)}`));
const boardMembers = computed(() => store.activeMembersDetailed.slice(0, 5));
const boardMountKey = computed(() => `${store.activeBoardId || "none"}-${store.boardReloadToken || 0}-${store.canEditBoard ? "edit" : "view"}-${store.boardLibraryOpen ? "library" : "canvas"}`);
const selectedBoard = computed(() => (store.boards || []).find((board) => board.id === sharePanel.boardId) || null);
const dialogBoard = computed(() => (store.boards || []).find((board) => board.id === boardDialog.boardId) || null);
const shareUsers = computed(() =>
  store.activeUsers.filter((user) => user.id !== selectedBoard.value?.ownerId && user.id !== store.currentUser?.id)
);
const saveText = computed(() => {
  if (store.boardSaveState === "saving") return "保存中";
  if (store.boardSaveState === "saved") return "已保存";
  return "未修改";
});

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function boardKindLabel(board) {
  if (board.isDefault) return "主画板";
  if (board.boardKind === "proposal") return "方案";
  return "草稿";
}

function destroyCanvas() {
  if (!boardRoot) return;
  unmountExcalidrawBoard(boardRoot);
  boardRoot = null;
}

function mountCanvas() {
  destroyCanvas();
  if (store.boardLibraryOpen || !canvasRef.value || !store.activeBoard) return;
  islandError.value = "";
  try {
    boardRoot = mountExcalidrawBoard(canvasRef.value, {
      board: store.activeBoard,
      readonly: !store.canEditBoard,
      onChange: queueSave
    });
  } catch (error) {
    islandError.value = error?.message || "画板加载失败";
  }
}

function queueSave(payload) {
  if (!store.canEditBoard) return;
  pendingPayload = payload;
  store.boardSaveState = "saving";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (pendingPayload) store.saveActiveBoard(pendingPayload);
    pendingPayload = null;
  }, 900);
}

function flushSave() {
  window.clearTimeout(saveTimer);
  if (!pendingPayload) return;
  store.saveActiveBoard(pendingPayload);
  pendingPayload = null;
}

function closeBoard() {
  flushSave();
  destroyCanvas();
  store.closeBoard();
}

function backToLibrary() {
  flushSave();
  destroyCanvas();
  historyOpen.value = false;
  store.backToBoardLibrary();
}

function clearBoard() {
  flushSave();
  store.clearActiveBoard();
}

function restoreSnapshot(snapshotId) {
  flushSave();
  store.restoreActiveBoardSnapshot(snapshotId);
}

function openBoard(boardId) {
  destroyCanvas();
  store.openScopedBoard(boardId);
}

function createBoard() {
  if (!store.createBoardInActiveScope({ title: newBoardTitle.value })) return;
  newBoardTitle.value = "";
}

function openContextMenu(event, board) {
  contextMenu.open = true;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.boardId = board.id;
}

function closeContextMenu() {
  contextMenu.open = false;
}

function currentContextBoard() {
  return (store.boards || []).find((item) => item.id === contextMenu.boardId) || null;
}

function closeBoardDialog() {
  boardDialog.open = false;
  boardDialog.type = "";
  boardDialog.boardId = "";
  boardDialog.input = "";
}

function renameSelectedBoard(board = null) {
  const target = board || (store.boards || []).find((item) => item.id === contextMenu.boardId);
  closeContextMenu();
  if (!target) return;
  boardDialog.open = true;
  boardDialog.type = "rename";
  boardDialog.boardId = target.id;
  boardDialog.input = target.title || "";
}

function deleteSelectedBoard(board = null) {
  const target = board || (store.boards || []).find((item) => item.id === contextMenu.boardId);
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
  const target = board || currentContextBoard() || store.activeBoard;
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

onMounted(() => {
  nextTick(mountCanvas);
});

onBeforeUnmount(() => {
  flushSave();
  destroyCanvas();
});

watch(boardMountKey, () => {
  nextTick(mountCanvas);
});
</script>

<template>
  <section class="collab-board-overlay" aria-label="协作画板" @click="closeContextMenu">
    <header class="collab-board-topbar">
      <button class="board-icon-btn board-back-btn" :title="store.boardLibraryOpen ? '关闭画板库' : '返回画板库'" type="button" @click="store.boardLibraryOpen ? closeBoard() : backToLibrary()">
        <span></span>
      </button>
      <div class="board-title-block">
        <strong>{{ store.boardLibraryOpen ? '画板库' : boardTitle }}</strong>
        <small>{{ boardSubtitle }}</small>
      </div>
      <span v-if="!store.boardLibraryOpen" class="board-state" :data-state="store.boardSaveState">{{ saveText }}</span>
      <span v-if="!store.canEditBoard" class="board-readonly-badge">只读</span>
      <div class="board-member-stack" aria-label="当前项目成员">
        <span
          v-for="(member, index) in boardMembers"
          :key="member.id"
          class="avatar"
          :data-tone="avatarTones[index % avatarTones.length]"
          :title="`${member.name} · ${store.roleLabel(member.role)}`"
        >
          {{ member.avatar }}
        </span>
      </div>
      <div v-if="!store.boardLibraryOpen" class="board-actions">
        <button class="board-ghost-btn" type="button" :disabled="!store.canManageBoard" @click="openSharePanel(store.activeBoard)">权限</button>
        <button class="board-ghost-btn" type="button" @click="historyOpen = !historyOpen">历史 {{ store.activeBoardSnapshots.length }}</button>
        <button class="board-ghost-btn danger" type="button" :disabled="!store.canManageBoard" @click="clearBoard">清空</button>
      </div>
    </header>

    <div v-if="store.boardLibraryOpen" class="board-library-body">
      <section class="board-library-main">
        <div class="board-library-head">
          <div>
            <strong>{{ store.activeBoardScopeLabel }}</strong>
            <small>{{ store.activeBoardScopeBoards.length }} 个画板</small>
          </div>
          <button class="board-ghost-btn" type="button" :disabled="!store.canEditBoard" @click="store.boardCreateMode = !store.boardCreateMode">
            新建画板
          </button>
        </div>

        <form v-if="store.boardCreateMode" class="board-create-form" @submit.prevent="createBoard">
          <input v-model.trim="newBoardTitle" type="text" maxlength="40" placeholder="例如：AIGC 草稿、视觉方案版" />
          <button class="board-ghost-btn" type="submit">创建</button>
        </form>

        <div class="board-library-grid">
          <button
            v-for="board in store.activeBoardScopeBoards"
            :key="board.id"
            class="board-library-card"
            :class="{ 'is-active': board.id === store.activeBoardId }"
            type="button"
            @click="openBoard(board.id)"
            @contextmenu.prevent.stop="openContextMenu($event, board)"
          >
            <span>{{ boardKindLabel(board) }}</span>
            <strong>{{ board.title }}</strong>
            <small>{{ board.ownerName || board.createdBy }} · 版本 {{ board.lastVersion || 1 }}</small>
          </button>
        </div>
      </section>
    </div>

    <div v-else class="collab-board-body" :class="{ 'has-history': historyOpen }">
      <div class="board-canvas-wrap">
        <div ref="canvasRef" class="board-canvas"></div>
        <div v-if="islandError" class="board-load-error">
          <strong>画板加载失败</strong>
          <span>{{ islandError }}</span>
        </div>
      </div>

      <aside v-if="historyOpen" class="board-history-panel">
        <div class="board-history-head">
          <strong>版本历史</strong>
          <small>保留 30 天</small>
        </div>
        <div v-if="!store.activeBoardSnapshots.length" class="board-empty-history">暂无可回滚版本</div>
        <button
          v-for="snapshot in store.activeBoardSnapshots"
          :key="snapshot.id"
          class="board-history-item"
          type="button"
          :disabled="!store.canManageBoard"
          @click="restoreSnapshot(snapshot.id)"
        >
          <span>版本 {{ snapshot.version }}</span>
          <small>{{ formatTime(snapshot.createdAt) }} · {{ snapshot.createdByName || snapshot.createdBy || '成员' }}</small>
        </button>
      </aside>
    </div>

    <div v-if="contextMenu.open" class="board-context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
      <button type="button" @click="renameSelectedBoard()">重命名</button>
      <button type="button" @click="openSharePanel()">共享设置</button>
      <button type="button" class="danger" @click="deleteSelectedBoard()">删除</button>
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
