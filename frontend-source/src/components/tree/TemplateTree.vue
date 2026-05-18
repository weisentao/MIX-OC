<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const emit = defineEmits(["prompt"]);
const store = useWorkspaceStore();
const dragOverIndex = ref(null);
const menuOpenKey = ref("");

const sections = [
  { key: "scheduleTemplates", title: "项目排期模板", kind: "schedule", actionTitle: "新增排期模板目录", emptyTitle: "暂无排期内容模板" },
  { key: "templates", title: "项目任务模板", kind: "task", actionTitle: "新增任务模板目录", emptyTitle: "暂无项目任务模板" }
];

function nodePrompt(action, payload = {}) {
  emit("prompt", { action, ...payload });
}

function closeMenu() {
  menuOpenKey.value = "";
}

onMounted(() => {
  document.addEventListener("click", closeMenu);
  document.addEventListener("contextmenu", closeMenu);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeMenu);
  document.removeEventListener("contextmenu", closeMenu);
});

function sectionGroups(section) {
  return section.kind === "schedule" ? store.scheduleTemplateGroups : store.taskTemplateGroups;
}

function groupIndex(template) {
  return store.templates.indexOf(template);
}

function templateDragStart(event, name) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/template-name", name);
}

function templateDragOver(event, index) {
  if (![...event.dataTransfer.types].includes("text/template-name")) return;
  if (store.templates[index]?.locked) return;
  event.preventDefault();
  dragOverIndex.value = index;
}

function templateDrop(event, index) {
  event.preventDefault();
  dragOverIndex.value = null;
  store.moveTemplate(event.dataTransfer.getData("text/template-name"), index);
}

function openTemplate(name, index, childIndex) {
  store.switchToTemplateView(index, childIndex);
  const template = store.templates[index];
  const message = template?.kind === "schedule"
    ? "已切换到排期模板编辑界面，可添加排期内容并保存为模板"
    : "已切换到任务模板编辑界面，可维护待完成任务模板清单";
  store.showToast(message);
}

function templateChildren(template) {
  return template.locked ? store.sharedTemplateNames : template.children;
}

function templateKey(template, index) {
  return template.id || `${template.title}-${index}`;
}

function isTemplateCollapsed(template, index) {
  return store.collapsedTemplateSet.has(templateKey(template, index));
}

function visibleTemplateChildren(template, index) {
  return isTemplateCollapsed(template, index) ? [] : templateChildren(template);
}

function templateChildMenuKey(section, template, childIndex) {
  return `${section.kind}-template-${groupIndex(template)}-${childIndex}`;
}
</script>

<template>
  <section v-for="section in sections" :key="section.key" class="tree-group">
    <div class="tree-heading-row">
      <button class="tree-heading" @click="store.toggleTree(section.key)">
        <span class="chevron" :class="{ 'is-open': store.treesOpen[section.key] }"></span>
        <span>{{ section.title }}</span>
      </button>
      <button class="tree-heading-action" :title="section.actionTitle" @click="nodePrompt('add-template-group', { kind: section.kind })">+</button>
    </div>

    <div v-if="store.treesOpen[section.key]" class="tree-content">
      <div v-for="template in sectionGroups(section)" :key="templateKey(template, groupIndex(template))" class="template-block">
        <div
          class="tree-node-wrap tree-drop-zone"
          :class="{ 'is-drag-over': dragOverIndex === groupIndex(template), 'is-menu-open': menuOpenKey === `template-group-${groupIndex(template)}` }"
          @contextmenu.prevent.stop="menuOpenKey = `template-group-${groupIndex(template)}`"
          @dragover="templateDragOver($event, groupIndex(template))"
          @dragleave="dragOverIndex = null"
          @drop="templateDrop($event, groupIndex(template))"
        >
          <button
            class="template-node"
            :class="{ 'is-muted': !templateChildren(template).length }"
            style="--indent: 50px"
            @click="templateChildren(template).length && store.toggleTemplateGroup(templateKey(template, groupIndex(template)))"
          >
            <span v-if="templateChildren(template).length" class="tree-caret" :class="{ 'is-open': !isTemplateCollapsed(template, groupIndex(template)) }"></span>
            <span v-else class="tree-caret-spacer"></span>
            <span>{{ template.title }}</span>
          </button>
          <div class="tree-node-actions is-menu-actions" aria-label="模板目录操作">
            <button class="tree-menu-trigger" title="模板目录操作" @click.stop="menuOpenKey = menuOpenKey === `template-group-${groupIndex(template)}` ? '' : `template-group-${groupIndex(template)}`"><i></i></button>
            <div v-if="menuOpenKey === `template-group-${groupIndex(template)}`" class="tree-action-popover" @click.stop @contextmenu.stop>
              <button type="button" @click.stop="nodePrompt('rename-template-group', { templateIndex: groupIndex(template), current: template.title }); menuOpenKey = ''">重命名分类</button>
              <button type="button" @click.stop="nodePrompt('add-template', { templateIndex: groupIndex(template), title: template.title }); menuOpenKey = ''">创建模板</button>
              <button type="button" @click.stop="store.pinTemplateGroup(groupIndex(template)); menuOpenKey = ''">置顶模板目录</button>
              <button class="danger" type="button" @click.stop="nodePrompt('delete-template-group', { templateIndex: groupIndex(template), title: template.title, count: template.children.length }); menuOpenKey = ''">删除分类</button>
            </div>
          </div>
        </div>

        <div
          v-for="(child, childIndex) in visibleTemplateChildren(template, groupIndex(template))"
          :key="child"
          class="tree-node-wrap"
          :class="{ 'is-shared-template': store.templateShareInfo[child]?.shared, 'is-menu-open': menuOpenKey === templateChildMenuKey(section, template, childIndex) }"
          draggable="true"
          @contextmenu.prevent.stop="menuOpenKey = templateChildMenuKey(section, template, childIndex)"
          @dragstart="templateDragStart($event, child)"
        >
          <button class="template-node is-leaf" @click="openTemplate(child, groupIndex(template), childIndex)">{{ child }}</button>
          <div class="tree-node-actions is-menu-actions" aria-label="模板操作">
            <button class="tree-menu-trigger" title="模板操作" @click.stop="menuOpenKey = menuOpenKey === templateChildMenuKey(section, template, childIndex) ? '' : templateChildMenuKey(section, template, childIndex)"><i></i></button>
            <div v-if="menuOpenKey === templateChildMenuKey(section, template, childIndex)" class="tree-action-popover" @click.stop @contextmenu.stop>
              <button v-if="section.kind === 'schedule'" type="button" @click.stop="store.applyScheduleTemplateToActiveProject(child); menuOpenKey = ''">启用模板</button>
              <button v-if="section.kind === 'task'" type="button" @click.stop="store.useTemplateToCreateProject(child); menuOpenKey = ''">启用模板</button>
              <button type="button" :class="{ 'is-shared': store.templateShareInfo[child]?.shared }" @click.stop="nodePrompt('share-template', { templateName: child, templateKind: section.kind }); menuOpenKey = ''">共享模板</button>
              <button type="button" @click.stop="store.pinTemplate(child); menuOpenKey = ''">置顶模板</button>
              <button type="button" @click.stop="nodePrompt('rename-template', { templateName: child }); menuOpenKey = ''">重命名模板</button>
              <button class="danger" type="button" @click.stop="nodePrompt('delete-template', { templateName: child }); menuOpenKey = ''">删除模板</button>
            </div>
          </div>
        </div>

        <div v-if="!templateChildren(template).length" class="tree-empty-note">{{ section.emptyTitle }}</div>
      </div>
      <div v-if="!sectionGroups(section).length" class="tree-empty-note">{{ section.emptyTitle }}</div>
    </div>
  </section>
</template>
