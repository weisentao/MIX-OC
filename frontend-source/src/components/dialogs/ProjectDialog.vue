<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean,
  projectId: {
    type: [Number, String],
    default: null
  }
});

const emit = defineEmits(["update:modelValue", "saved"]);
const store = useWorkspaceStore();
const tagLibraryOpen = ref(false);

const form = reactive({
  mode: "category",
  groupId: "",
  groupTitle: "",
  categoryTitle: "",
  name: "",
  startDate: "",
  endDate: "",
  syncSchedule: true,
  tags: [],
  owner: "",
  members: "",
  sample: "blank"
});

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const isEdit = computed(() => props.projectId !== null && props.projectId !== undefined);
const dialogTitle = computed(() => (isEdit.value ? "修改项目" : "创建项目"));
const currentProject = computed(() => (isEdit.value ? store.findProjectWithGroup(Number(props.projectId))?.project : null));
const selectedTags = computed(() => (Array.isArray(form.tags) ? form.tags : []).filter(Boolean));
const availableTags = computed(() =>
  (store.tags || []).filter((tag) => tag?.name && !selectedTags.value.includes(tag.name))
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset();
  }
);

watch(
  () => form.mode,
  (mode) => {
    if (mode === "child" && !form.groupId) form.groupId = store.projectGroups[0]?.id || "";
    if (mode === "category" && !form.categoryTitle) form.categoryTitle = form.name || "新项目大类";
  }
);

function toInputDate(value) {
  return String(value || "").replaceAll("/", "-");
}

function todayInputDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function reset() {
  tagLibraryOpen.value = false;
  const found = isEdit.value ? store.findProjectWithGroup(Number(props.projectId)) : null;
  if (found?.project) {
    const project = found.project;
    const projectPeriod = store.getProjectPeriod(project).replace("项目排期", "");
    const [periodStart = "", periodEnd = ""] = projectPeriod.split("-");
    form.mode = found.isRoot ? "root" : "child";
    form.groupId = found.group?.id || store.projectGroups[0]?.id || "";
    form.groupTitle = found.group?.title || project.group || "";
    form.categoryTitle = "";
    form.name = project.name || "";
    form.startDate = toInputDate(project.startDate || periodStart) || todayInputDate();
    form.endDate = toInputDate(project.endDate || periodEnd) || form.startDate;
    form.syncSchedule = project.syncSchedule !== false;
    form.tags = [...(project.tags || [])];
    form.owner = project.owner || "";
    form.members = (project.members || []).join("、");
    form.sample = "keep";
    return;
  }

  form.mode = "category";
  form.groupId = store.projectGroups[0]?.id || "";
  form.groupTitle = "";
  form.categoryTitle = "新项目大类";
  form.name = "";
  form.startDate = todayInputDate();
  form.endDate = form.startDate;
  form.syncSchedule = true;
  form.tags = [];
  form.owner = store.currentUser ? `${store.currentUser.department || "项目管理"}: ${store.currentUser.name}` : "";
  form.members = store.currentUser?.name || "";
  form.sample = "blank";
}

function close() {
  tagLibraryOpen.value = false;
  visible.value = false;
}

function selectTagFromLibrary(tag) {
  if (!tag?.name || selectedTags.value.includes(tag.name)) return;
  form.tags = selectedTags.value.concat(tag.name);
  tagLibraryOpen.value = false;
}

function removeSelectedTag(tagName) {
  form.tags = selectedTags.value.filter((name) => name !== tagName);
}

function tagColor(tagName) {
  return store.getTag(tagName).color;
}

function tagLabel(tagName) {
  return store.getTag(tagName).name;
}

function submit() {
  if (!isEdit.value && form.mode === "category") {
    if (!form.categoryTitle.trim()) return;
  } else if (!form.name.trim() || !form.startDate || !form.endDate) {
    return;
  }
  const payload = isEdit.value
    ? {
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        syncSchedule: currentProject.value?.syncSchedule !== false,
        tags: form.tags,
        owner: currentProject.value?.owner || form.owner,
        members: form.members
      }
    : form;
  const ok = isEdit.value ? store.updateProjectFromForm(Number(props.projectId), payload) : store.createProjectFromForm(payload);
  if (ok) {
    emit("saved");
    close();
    if (!isEdit.value) reset();
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :class="['modal-shell project-modal', { 'is-edit-project': isEdit }]"
    width="680px"
    :show-close="false"
    @open="reset"
  >
    <form :class="['modal-card project-create-card', { 'edit-project-card': isEdit }]" @submit.prevent="submit">
      <div class="modal-head">
        <div>
          <span class="modal-kicker">{{ isEdit ? '编辑项目' : '新建项目' }}</span>
          <h3>{{ dialogTitle }}</h3>
        </div>
        <button class="modal-close-button" type="button" :aria-label="isEdit ? '关闭修改项目弹窗' : '关闭创建项目弹窗'" @click="close">×</button>
      </div>

      <div v-if="!isEdit" class="create-mode-grid">
        <label v-if="!isEdit" class="mode-card" :class="{ 'is-active': form.mode === 'category' }">
          <input v-model="form.mode" type="radio" value="category" />
          <strong>创建大类 / 一级目录</strong>
          <span>直接生成左侧大分类，例如项目汇总、项目流程、外部项目等。</span>
        </label>
        <label class="mode-card" :class="{ 'is-active': form.mode === 'root' }">
          <input v-model="form.mode" type="radio" value="root" />
          <strong>创建到项目汇总</strong>
          <span>作为主目录外层项目显示，保存后默认不带任务清单。</span>
        </label>
        <label class="mode-card" :class="{ 'is-active': form.mode === 'child' }">
          <input v-model="form.mode" type="radio" value="child" />
          <strong>创建到分目录</strong>
          <span>放入已有一级目录下，后续可拖拽迁移。</span>
        </label>
      </div>

      <div v-if="!isEdit && form.mode === 'category'" class="project-form-grid">
        <label class="full-field">大类名称
          <input v-model="form.categoryTitle" required placeholder="例如：项目汇总 / 项目流程 / 外部项目" />
        </label>
      </div>

      <div v-else :class="['project-form-grid', { 'edit-project-grid': isEdit }]">
        <label v-if="!isEdit && form.mode === 'child'">选择一级目录
          <select v-model="form.groupId">
            <option v-for="group in store.projectGroups" :key="group.id" :value="group.id">{{ group.title }}</option>
          </select>
        </label>
        <label v-else-if="!isEdit">主目录名称
          <input v-model="form.groupTitle" placeholder="例如：项目汇总 / 外部项目" />
        </label>
        <label>项目名称
          <input v-model="form.name" required placeholder="输入项目名称" />
        </label>
        <label>开始时间
          <input v-model="form.startDate" required type="date" />
        </label>
        <label>结束时间
          <input v-model="form.endDate" required type="date" />
        </label>
        <label class="edit-project-tags">标签
          <div class="edit-project-tag-list">
            <span
              v-for="tagName in selectedTags"
              :key="tagName"
              class="tag-pill active-tag-pill edit-project-tag-pill"
              :data-color="tagColor(tagName)"
              role="button"
              tabindex="0"
              title="移除标签"
              @click="removeSelectedTag(tagName)"
              @keydown.enter.prevent="removeSelectedTag(tagName)"
              @keydown.space.prevent="removeSelectedTag(tagName)"
            >
              {{ tagLabel(tagName) }}
            </span>
            <button
              class="tag-pill edit-project-tag-add"
              type="button"
              title="从标签库选择标签"
              aria-label="从标签库选择标签"
              @click="tagLibraryOpen = !tagLibraryOpen"
            >
              +
            </button>
            <small v-if="!selectedTags.length">暂无标签</small>
            <div v-if="tagLibraryOpen" class="active-tag-popover edit-project-tag-library">
              <button
                v-for="tag in availableTags"
                :key="`edit-library-${tag.name}`"
                class="tag-pill active-tag-pill edit-project-tag-option"
                type="button"
                :data-color="tag.color"
                @click="selectTagFromLibrary(tag)"
              >
                {{ tag.name }}
              </button>
              <span v-if="!availableTags.length" class="edit-project-tag-empty">标签库暂无可添加标签</span>
            </div>
          </div>
        </label>
        <label v-if="!isEdit">项目负责人（管理）
          <input v-model="form.owner" placeholder="保存后默认使用当前登录用户" />
        </label>
        <label :class="['full-field', { 'edit-project-members': isEdit }]">协同成员
          <input v-model="form.members" placeholder="保存后默认使用当前登录用户" />
        </label>
        <label v-if="!isEdit" class="full-field inline-check project-sync-check">
          <input v-model="form.syncSchedule" type="checkbox" />
          <span>同步到排期，保存后项目时间会同步更新到任务排期范围</span>
        </label>
      </div>

      <div v-if="!isEdit" class="sample-choice">
        <span>初始内容</span>
        <label><input v-model="form.sample" type="radio" value="blank" /> 空项目</label>
      </div>

      <div :class="['modal-actions', { 'edit-project-actions': isEdit }]">
        <button class="ghost" type="button" @click="close">取消</button>
        <button class="solid" type="submit">{{ isEdit ? '保存修改' : '创建项目' }}</button>
      </div>
    </form>
  </el-dialog>
</template>
