<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { lower } from "@/stores/workspace/helpers";

const emit = defineEmits(["prompt"]);
const props = defineProps({
  filterQuery: { type: String, default: "" }
});
const store = useWorkspaceStore();
const dragOverGroup = shallowRef(null);
const menuOpenKey = shallowRef("");

const collapsedSet = computed(() => new Set(store.collapsedGroups));
const normalizedFilterQuery = computed(() => lower(props.filterQuery));

function nodePrompt(action, payload = {}) {
  emit("prompt", { action, ...payload });
}

function projectCount(project) {
  return (project.tasks || []).filter((task) => !task.archived).length;
}

function groupCount(group) {
  return activeGroupProjects(group).length;
}

function archivedAtLabel(project) {
  return project.archivedAt || "未记录";
}

function toggleMenu(key) {
  menuOpenKey.value = menuOpenKey.value === key ? "" : key;
}

function closeMenu() {
  menuOpenKey.value = "";
}

onMounted(() => {
  document.addEventListener("click", closeMenu);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeMenu);
});

function filteredRootProjects() {
  return (store.rootProjects || []).filter((project) => project.status !== "archived" && projectMatchesFilter(project));
}

function projectDragStart(event, projectId) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/project-id", String(projectId));
}

function projectDragOver(event, groupId) {
  if (![...event.dataTransfer.types].includes("text/project-id")) return;
  event.preventDefault();
  dragOverGroup.value = groupId;
}

function projectDrop(event, groupId) {
  event.preventDefault();
  dragOverGroup.value = null;
  const projectId = Number(event.dataTransfer.getData("text/project-id"));
  store.moveProject(projectId, groupId);
}

function filteredProjects(group) {
  return activeGroupProjects(group).filter((project) => projectMatchesFilter(project));
}

function activeGroupProjects(group) {
  return (group.projects || []).filter((project) => project.status !== "archived");
}

function projectMatchesFilter(project) {
  const query = normalizedFilterQuery.value;
  if (!query) return true;
  return [
    project.name,
    project.group,
    ...(project.tags || []),
    ...(project.tasks || []).flatMap((task) => [task.title, task.type, task.note])
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function handleMenuAction(action, payload = {}) {
  menuOpenKey.value = "";
  if (action === "schedule") {
    store.jumpToSchedule(payload.projectId);
    return;
  }
  if (action === "flow") {
    store.selectProject(payload.projectId);
    store.setSection("flow");
    return;
  }
  if (action === "optimize") {
    store.jumpToOptimize(payload.projectId);
    return;
  }
  nodePrompt(action, payload);
}
</script>

<template>
  <section class="tree-group">
    <div class="tree-heading-row">
      <button class="tree-heading" @click="store.toggleTree('summary')">
        <span class="chevron" :class="{ 'is-open': store.treesOpen.summary }"></span>
        <span>项目汇总</span>
        <small>{{ store.summaryCategoryCount }}</small>
      </button>
      <button class="tree-heading-action tree-menu-trigger" title="项目汇总操作" @click.stop="toggleMenu('summary-menu')"><i></i></button>
      <div v-if="menuOpenKey === 'summary-menu'" class="tree-action-popover tree-action-popover-root" @click.stop>
        <button type="button" @click="handleMenuAction('add-group')">新增一级目录</button>
      </div>
    </div>

    <div v-if="store.treesOpen.summary" class="tree-content">
      <div v-if="filteredRootProjects().length" class="tree-frame root-project-frame">
        <div
          v-for="project in filteredRootProjects()"
          :key="project.id"
          class="tree-node-wrap"
          :class="{ 'is-selected': project.id === store.activeProjectId, 'is-menu-open': menuOpenKey === `project-${project.id}` }"
          draggable="true"
          @contextmenu.prevent="menuOpenKey = `project-${project.id}`"
          @dragstart="projectDragStart($event, project.id)"
        >
          <button
            class="tree-node"
            :class="{ 'is-active': project.id === store.activeProjectId, 'has-wide-actions': true }"
            style="--indent: 50px"
            @click="store.selectProject(project.id)"
          >
            <span>{{ project.name }}</span>
            <small>{{ projectCount(project) }}</small>
          </button>
          <div class="tree-node-actions is-menu-actions" aria-label="项目操作">
            <button class="tree-menu-trigger" title="项目操作" @click.stop="toggleMenu(`project-${project.id}`)"><i></i></button>
            <div v-if="menuOpenKey === `project-${project.id}`" class="tree-action-popover" @click.stop>
              <button type="button" @click.stop="handleMenuAction('rename-project-node', { projectId: project.id, current: project.name })">修改项目</button>
              <button type="button" @click.stop="handleMenuAction('schedule', { projectId: project.id })">进入排期表</button>
              <button type="button" @click.stop="handleMenuAction('flow', { projectId: project.id })">进入流程表</button>
              <button type="button" @click.stop="handleMenuAction('optimize', { projectId: project.id })">进入优化</button>
              <button v-if="store.isAdmin" class="danger" type="button" @click.stop="handleMenuAction('delete-project-node', { projectId: project.id, title: project.name })">删除</button>
            </div>
          </div>
        </div>
      </div>

      <div v-for="group in store.projectGroups" :key="group.id" class="tree-children tree-level-1">
        <div
          class="tree-node-wrap tree-drop-zone"
          :class="{ 'is-drag-over': dragOverGroup === group.id, 'is-menu-open': menuOpenKey === `group-${group.id}` }"
          @contextmenu.prevent="menuOpenKey = `group-${group.id}`"
          @dragover="projectDragOver($event, group.id)"
          @dragleave="dragOverGroup = null"
          @drop="projectDrop($event, group.id)"
        >
          <button class="tree-node" style="--indent: 50px" @click="groupCount(group) && store.toggleGroup(group.id)">
            <span v-if="groupCount(group)" class="tree-caret" :class="{ 'is-open': !collapsedSet.has(group.id) }"></span>
            <span v-else class="tree-caret-spacer"></span>
            <span>{{ group.title }}</span>
            <small v-if="groupCount(group)">{{ groupCount(group) }}</small>
          </button>
          <div class="tree-node-actions is-menu-actions" aria-label="目录操作">
            <button class="tree-menu-trigger" title="目录操作" @click.stop="toggleMenu(`group-${group.id}`)"><i></i></button>
            <div v-if="menuOpenKey === `group-${group.id}`" class="tree-action-popover" @click.stop>
              <button type="button" @click.stop="handleMenuAction('rename-group', { groupId: group.id, current: group.title })">重命名分类</button>
              <button type="button" @click.stop="handleMenuAction('add-project', { groupId: group.id })">新增项目</button>
              <button type="button" @click.stop="store.pinProjectGroup(group.id); menuOpenKey = ''">置顶</button>
              <button v-if="store.isAdmin" class="danger" type="button" @click.stop="handleMenuAction('delete-group', { groupId: group.id, title: group.title, count: group.projects.length })">删除</button>
            </div>
          </div>
        </div>

        <div v-if="!collapsedSet.has(group.id)" class="tree-frame" :class="{ 'has-scroll-frame': filteredProjects(group).length > 4 }">
          <div
            v-for="project in filteredProjects(group)"
            :key="project.id"
            class="tree-node-wrap"
            :class="{ 'is-selected': project.id === store.activeProjectId, 'is-menu-open': menuOpenKey === `project-${project.id}` }"
            draggable="true"
            @contextmenu.prevent="menuOpenKey = `project-${project.id}`"
            @dragstart="projectDragStart($event, project.id)"
          >
            <button
              class="tree-node"
              :class="{ 'is-active': project.id === store.activeProjectId, 'has-wide-actions': true }"
              style="--indent: 86px"
              @click="store.selectProject(project.id)"
            >
              <span>{{ project.name }}</span>
              <small>{{ projectCount(project) }}</small>
            </button>
            <div class="tree-node-actions is-menu-actions" aria-label="项目操作">
              <button class="tree-menu-trigger" title="项目操作" @click.stop="toggleMenu(`project-${project.id}`)"><i></i></button>
              <div v-if="menuOpenKey === `project-${project.id}`" class="tree-action-popover" @click.stop>
                <button type="button" @click.stop="handleMenuAction('rename-project-node', { projectId: project.id, current: project.name })">修改项目</button>
                <button type="button" @click.stop="handleMenuAction('schedule', { projectId: project.id })">进入排期表</button>
                <button type="button" @click.stop="handleMenuAction('flow', { projectId: project.id })">进入流程表</button>
                <button type="button" @click.stop="handleMenuAction('optimize', { projectId: project.id })">进入优化</button>
                <button v-if="store.isAdmin" class="danger" type="button" @click.stop="handleMenuAction('delete-project-node', { projectId: project.id, title: project.name })">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </section>

  <section class="tree-group archive-tree-group">
    <div class="tree-heading-row">
      <button class="tree-heading" @click="store.toggleTree('archive')">
        <span class="chevron" :class="{ 'is-open': store.treesOpen.archive }"></span>
        <span>项目归档</span>
        <small>{{ store.archivedProjectsList.length }}</small>
      </button>
    </div>

    <div v-if="store.treesOpen.archive" class="tree-content">
      <div v-if="store.archivedProjectsList.length" class="tree-frame archived-project-frame">
        <div v-for="project in store.archivedProjectsList" :key="project.id" class="tree-node-wrap is-archived-project">
          <button class="tree-node archive-project-node" style="--indent: 50px" type="button" @click="store.showToast('归档项目处于冻结状态，请恢复后查看')">
            <span class="archive-project-main">
              <span class="archive-project-name">{{ project.name }}</span>
              <span class="archive-project-time">{{ archivedAtLabel(project) }}</span>
            </span>
          </button>
          <div class="tree-node-actions is-wide-actions" aria-label="归档项目操作">
            <button title="恢复项目" @click.stop="store.restoreProject(project.id)">恢复</button>
            <button v-if="store.isAdmin" title="永久删除项目" @click.stop="store.permanentlyDeleteProject(project.id)">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="tree-empty-note">暂无归档项目</div>
    </div>
  </section>
</template>
