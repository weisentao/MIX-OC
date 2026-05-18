<script setup>
import { computed, reactive, watch } from "vue";
import { taskModules } from "@/data/seed";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps({
  modelValue: Boolean,
  defaultType: {
    type: String,
    default: "流程"
  }
});

const emit = defineEmits(["update:modelValue"]);
const store = useWorkspaceStore();

function todayISO() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function moduleMeta(moduleKey) {
  return taskModules.find((module) => module.key === moduleKey) || { key: moduleKey, label: moduleKey, color: "blue" };
}

function createDepartmentNode({ key, label, module, department, selectable, children = [] }) {
  const meta = moduleMeta(module);
  return {
    key,
    label,
    module: meta.key,
    color: meta.color,
    department: department || label,
    selectable: selectable ?? children.length === 0,
    children: children.map((child) => createDepartmentNode({ module: meta.key, ...child }))
  };
}

function flattenDepartmentNodes(nodes) {
  return nodes.flatMap((node) => [...(node.selectable ? [node] : []), ...flattenDepartmentNodes(node.children)]);
}

const departmentTree = [
  createDepartmentNode({ key: "project", label: "项目管理", module: "project", department: "项目管理" }),
  createDepartmentNode({
    key: "design",
    label: "美术设计",
    module: "design",
    department: "美术设计",
    selectable: false,
    children: [
      { key: "design-1", label: "美术设计一部", department: "美术设计一部" },
      { key: "design-2", label: "美术设计二部", department: "美术设计二部" }
    ]
  }),
  createDepartmentNode({ key: "threeD", label: "三维动态设计部", module: "threeD", department: "三维动态设计部" }),
  createDepartmentNode({
    key: "post",
    label: "视效包装",
    module: "post",
    department: "视效包装",
    selectable: false,
    children: [
      { key: "post-1", label: "视效包装一部", department: "视效包装一部" },
      { key: "post-2", label: "视效包装二部", department: "视效包装二部" },
      { key: "post-3", label: "视效包装三部", department: "视效包装三部" }
    ]
  })
];

const departmentOptions = flattenDepartmentNodes(departmentTree);
const treeOpen = reactive({
  design: true,
  post: true
});

const form = reactive({
  title: "",
  note: "",
  module: "project",
  department: "项目管理",
  departmentLabel: "项目管理",
  departmentKey: "project",
  type: "流程",
  startDate: todayISO(),
  endDate: todayISO()
});

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const selectedDepartmentNode = computed(() => departmentOptions.find((node) => node.key === form.departmentKey) || departmentOptions[0]);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.title = "";
      form.note = "";
      selectDepartmentNode("project");
      form.type = props.defaultType || "流程";
      form.startDate = todayISO();
      form.endDate = todayISO();
      treeOpen.design = true;
      treeOpen.post = true;
    }
  }
);

function selectDepartmentNode(nodeKey) {
  const node = departmentOptions.find((item) => item.key === nodeKey);
  if (!node) return;
  form.departmentKey = node.key;
  form.department = node.department;
  form.departmentLabel = node.department;
  form.module = node.module;
}

function isDepartmentSelected(node) {
  return selectedDepartmentNode.value?.key === node.key;
}

function hasSelectedChild(node) {
  return node.children.some((child) => isDepartmentSelected(child));
}

function isTreeOpen(node) {
  return Boolean(treeOpen[node.key]);
}

function toggleTreeNode(nodeKey) {
  treeOpen[nodeKey] = !treeOpen[nodeKey];
}

function departmentPickerPayload() {
  const node = selectedDepartmentNode.value;
  return {
    ...form,
    module: node?.module || form.module,
    department: node?.department || form.department,
    departmentLabel: node?.department || form.departmentLabel,
    departmentKey: node?.key || form.departmentKey
  };
}

function close() {
  visible.value = false;
}

function submit() {
  if (!form.title.trim()) return;
  if (store.createTask(departmentPickerPayload())) close();
}
</script>

<template>
  <el-dialog v-model="visible" class="modal-shell task-modal-shell" width="min(920px, calc(100vw - 32px))" :show-close="false">
    <form class="modal-card task-create-card" @submit.prevent="submit">
      <div class="modal-head">
        <h3>创建清单</h3>
        <button type="button" @click="close">×</button>
      </div>
      <div class="task-create-row v6-task-create-row">
        <label class="soft-field">输入主任务标题
          <input v-model="form.title" required placeholder="输入主任务标题" />
        </label>
        <label class="soft-field soft-field-note">解释备注
          <textarea v-model="form.note" rows="1" placeholder="为主标题补充详细备注，方便协同成员理解"></textarea>
        </label>
        <button class="task-submit" type="submit">确定</button>
      </div>
      <fieldset class="module-picker department-tree-picker">
        <legend>
          <span>所属部门</span>
          <small>{{ selectedDepartmentNode.department }}</small>
        </legend>
        <div class="department-tree-list" role="tree" aria-label="所属部门">
          <div
            v-for="node in departmentTree"
            :key="node.key"
            class="department-tree-node"
            :class="{ 'is-selected': isDepartmentSelected(node), 'has-children': node.children.length, 'has-selected-child': hasSelectedChild(node) }"
          >
            <div class="department-tree-row">
              <button
                v-if="node.children.length"
                class="department-tree-toggle department-tree-branch"
                :class="{ 'is-open': isTreeOpen(node) }"
                :data-color="node.color"
                type="button"
                role="treeitem"
                :aria-label="`${isTreeOpen(node) ? '收起' : '展开'}${node.label}`"
                :aria-expanded="node.children.length ? isTreeOpen(node) : undefined"
                :aria-selected="hasSelectedChild(node)"
                @click="toggleTreeNode(node.key)"
              >
                <span class="department-tree-toggle-icon" aria-hidden="true"></span>
                <span class="module-mark" :data-color="node.color"></span>
                <span class="department-tree-copy">
                  <span class="department-tree-label">{{ node.label }}</span>
                </span>
              </button>
              <span v-else class="department-tree-spacer" aria-hidden="true"></span>
              <button
                v-if="node.selectable"
                class="department-tree-choice"
                :class="{ 'is-active': isDepartmentSelected(node) }"
                :data-color="node.color"
                type="button"
                role="treeitem"
                :aria-label="node.department"
                :aria-level="1"
                :aria-selected="isDepartmentSelected(node)"
                :aria-expanded="node.children.length ? isTreeOpen(node) : undefined"
                @click="selectDepartmentNode(node.key)"
              >
                <span class="module-mark" :data-color="node.color"></span>
                <span class="department-tree-copy">
                  <span class="department-tree-label">{{ node.label }}</span>
                  <small v-if="node.department !== node.label">{{ node.department }}</small>
                </span>
              </button>
            </div>
            <div v-if="node.children.length && isTreeOpen(node)" class="department-tree-children" role="group">
              <button
                v-for="child in node.children"
                :key="child.key"
                class="department-tree-choice department-tree-child"
                :class="{ 'is-active': isDepartmentSelected(child) }"
                :data-color="child.color"
                type="button"
                role="treeitem"
                :aria-label="child.department"
                :aria-level="2"
                :aria-selected="isDepartmentSelected(child)"
                @click="selectDepartmentNode(child.key)"
              >
                <span class="module-mark" :data-color="child.color"></span>
                <span class="department-tree-copy">
                  <span class="department-tree-label">{{ child.label }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </fieldset>
      <div class="task-date-row">
        <span>任务时间</span>
        <label>
          <input v-model="form.startDate" type="date" />
        </label>
        <b>至</b>
        <label>
          <input v-model="form.endDate" type="date" />
        </label>
        <small>未来将与排期联动</small>
      </div>
    </form>
  </el-dialog>
</template>

<style scoped>
.department-tree-picker {
  display: grid;
  gap: 8px;
}

.department-tree-picker legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.department-tree-picker legend small {
  min-width: 0;
  overflow: hidden;
  color: #6a7680;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.department-tree-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 14px;
  padding: 12px;
  border: 1px solid #e0e5ea;
  border-radius: 8px;
  background: #f7f8fa;
}

.department-tree-node {
  min-width: 0;
}

.department-tree-node.has-children {
  grid-row: span 3;
}

.department-tree-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
}

.department-tree-toggle,
.department-tree-spacer {
  width: 18px;
  height: 32px;
}

.department-tree-toggle {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: #65717c;
  background: transparent;
}

.department-tree-branch {
  --department-accent: #8995a1;
  --department-soft: #f4f6f8;
  grid-column: 1 / -1;
  grid-template-columns: 14px 10px minmax(0, 1fr);
  justify-content: start;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  color: #35404a;
  background: transparent;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  box-shadow: none;
}

.department-tree-toggle:hover,
.department-tree-toggle:focus-visible {
  color: #1f2933;
  background: #eef3f5;
  transform: none;
}

.department-tree-branch:hover,
.department-tree-branch:focus-visible {
  background: #eef2f5;
}

.department-tree-node.has-selected-child .department-tree-branch {
  color: #27313a;
  background: color-mix(in srgb, var(--department-soft) 70%, #ffffff);
  box-shadow: inset 2px 0 0 var(--department-accent);
}

.department-tree-toggle:focus-visible,
.department-tree-choice:focus-visible {
  outline: 2px solid rgba(255, 0, 80, 0.32);
  outline-offset: 2px;
}

.department-tree-toggle-icon {
  display: block;
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.18s ease;
}

.department-tree-toggle.is-open .department-tree-toggle-icon {
  transform: rotate(45deg);
}

.department-tree-choice {
  --department-accent: #8995a1;
  --department-soft: #f4f6f8;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #34414b;
  background: transparent;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  box-shadow: none;
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.department-tree-choice:hover {
  border-color: transparent;
  background: #eef2f5;
  transform: none;
}

.department-tree-choice.is-active {
  border-color: color-mix(in srgb, var(--department-accent) 36%, #d9e0e6);
  color: #1f2933;
  background: color-mix(in srgb, var(--department-soft) 78%, #ffffff);
  box-shadow: inset 2px 0 0 var(--department-accent);
}

.department-tree-choice[data-color="red"],
.department-tree-branch[data-color="red"] {
  --department-accent: #ee777a;
  --department-soft: #fff2f3;
}

.department-tree-choice[data-color="green"],
.department-tree-branch[data-color="green"] {
  --department-accent: #65b878;
  --department-soft: #f0fbf3;
}

.department-tree-choice[data-color="blue"],
.department-tree-branch[data-color="blue"] {
  --department-accent: #5ca9d7;
  --department-soft: #eff8fd;
}

.department-tree-choice[data-color="purple"],
.department-tree-branch[data-color="purple"] {
  --department-accent: #bc7ad2;
  --department-soft: #fbf1ff;
}

.department-tree-choice[data-color="yellow"],
.department-tree-branch[data-color="yellow"] {
  --department-accent: #f4b321;
  --department-soft: #fff9e8;
}

.department-tree-choice[data-color="pink"],
.department-tree-branch[data-color="pink"] {
  --department-accent: #e778a3;
  --department-soft: #fff2f7;
}

.department-tree-picker .module-mark {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.department-tree-copy {
  display: grid;
  min-width: 0;
  line-height: 1.2;
}

.department-tree-label,
.department-tree-copy small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.department-tree-copy small {
  margin-top: 3px;
  color: #7a858f;
  font-size: 11px;
  font-weight: 700;
}

.department-tree-children {
  position: relative;
  display: grid;
  gap: 2px;
  margin: 2px 0 2px 8px;
  padding-left: 18px;
}

.department-tree-children::before {
  position: absolute;
  top: -2px;
  bottom: 16px;
  left: 6px;
  width: 1px;
  background: #d8dee4;
  content: "";
}

.department-tree-child {
  position: relative;
  min-height: 34px;
}

.department-tree-child::before {
  position: absolute;
  top: 50%;
  left: -12px;
  width: 8px;
  height: 1px;
  background: #d8dee4;
  content: "";
}

@media (max-width: 760px), (max-height: 620px) {
  .department-tree-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .department-tree-node.has-children {
    grid-row: auto;
  }
}
</style>
