<script setup>
import { computed, reactive } from "vue";

const props = defineProps({
  views: { type: Array, default: () => [] },
  activeView: { type: String, default: "person" },
  departments: { type: Array, default: () => [] },
  people: { type: Array, default: () => [] },
  selectedDepartmentId: { type: String, default: "" },
  selectedPersonId: { type: String, default: "" },
  permissions: { type: Object, default: () => ({}) },
  stats: { type: Object, default: () => ({}) },
  searchQuery: { type: String, default: "" }
});

const emit = defineEmits(["selectView", "selectDepartment", "selectPerson", "updateSearch", "contextmenu"]);

const collapsedDepartments = reactive(new Set());

const scopeType = computed(() => props.permissions?.scope?.type || "self");
const showDepartmentTree = computed(() => scopeType.value !== "self");

const departmentsWithPeople = computed(() => {
  return props.departments.map((department) => ({
    ...department,
    people: props.people.filter((person) => person.departmentId === department.id)
  }));
});

const selfPerson = computed(() => props.people.find((person) => person.id === props.selectedPersonId) || props.people[0] || null);

function updateSearch(event) {
  emit("updateSearch", event.target.value);
}

function isDepartmentCollapsed(departmentId) {
  return collapsedDepartments.has(departmentId);
}

function toggleDepartment(departmentId) {
  if (collapsedDepartments.has(departmentId)) {
    collapsedDepartments.delete(departmentId);
    return;
  }
  collapsedDepartments.add(departmentId);
}

function emitDepartmentContextMenu(event, department) {
  emit("contextmenu", {
    targetType: "department",
    department,
    departmentId: department.id,
    clientX: event.clientX,
    clientY: event.clientY
  });
}

function emitPersonContextMenu(event, person, department) {
  emit("contextmenu", {
    targetType: "person",
    person,
    personId: person.id,
    department,
    departmentId: department.id,
    clientX: event.clientX,
    clientY: event.clientY
  });
}
</script>

<template>
  <aside class="resource-sidebar" aria-label="人力筛选">
    <div class="resource-sidebar-title">
      <span>人力排期</span>
      <strong>{{ stats.scopeLabel || "资源视图" }}</strong>
    </div>

    <label class="resource-sidebar-search">
      <span class="resource-sr-only">搜索人员、部门或项目</span>
      <input
        :value="searchQuery"
        type="search"
        :placeholder="scopeType === 'self' ? '搜索我的任务' : '姓名 / 部门 / 项目'"
        @input="updateSearch"
      />
    </label>

    <nav class="resource-view-list" aria-label="人力视角入口">
      <button
        v-for="view in views"
        :key="view.key"
        type="button"
        class="resource-view-entry"
        :class="{ 'is-active': activeView === view.key }"
        @click="emit('selectView', view.key)"
      >
        <span>{{ view.label }}</span>
        <small v-if="view.description">{{ view.description }}</small>
      </button>
    </nav>

    <section v-if="showDepartmentTree" class="resource-tree" aria-label="部门和人员">
      <div class="resource-tree-head">
        <strong>{{ scopeType === "department" ? "本部门 / 人员" : "部门 / 人员" }}</strong>
      </div>

      <article
        v-for="department in departmentsWithPeople"
        :key="department.id"
        class="resource-department-node"
        :class="{ 'is-active': selectedDepartmentId === department.id, 'is-collapsed': isDepartmentCollapsed(department.id) }"
      >
        <button
          type="button"
          class="resource-department-button"
          :aria-expanded="!isDepartmentCollapsed(department.id)"
          @click="emit('selectDepartment', department.id)"
          @dblclick.prevent="toggleDepartment(department.id)"
          @contextmenu.prevent="emitDepartmentContextMenu($event, department)"
        >
          <span class="resource-dot" :class="`is-${department.color || 'green'}`"></span>
          <strong>{{ department.name }}</strong>
          <small>{{ department.people.length }}</small>
          <span class="resource-tree-toggle" aria-hidden="true" @click.stop="toggleDepartment(department.id)">
            {{ isDepartmentCollapsed(department.id) ? "展" : "收" }}
          </span>
        </button>
        <div v-show="!isDepartmentCollapsed(department.id)" class="resource-person-node-list">
          <button
            v-for="person in department.people"
            :key="person.id"
            type="button"
            class="resource-person-node"
            :class="{ 'is-active': selectedPersonId === person.id, 'is-risk': person.load >= 100 }"
            @click="emit('selectPerson', person.id)"
            @contextmenu.prevent="emitPersonContextMenu($event, person, department)"
          >
            <span class="resource-dot" :class="`is-${person.tone || department.color || 'green'}`"></span>
            <span>{{ person.name }}</span>
            <small>{{ person.roleTitle }}</small>
            <em>{{ person.load }}%</em>
          </button>
        </div>
      </article>
    </section>

    <section v-else class="resource-self-card" aria-label="个人入口">
      <div class="resource-avatar">{{ selfPerson?.avatar || "我" }}</div>
      <strong>{{ selfPerson?.name || "我的视角" }}</strong>
      <span>{{ selfPerson?.departmentName || "个人任务" }}</span>
      <small>只展示本人任务和空闲窗口</small>
    </section>

    <section class="resource-idle-alert" aria-label="空闲提醒">
      <strong>{{ scopeType === "self" ? "我的空闲提醒" : stats.idleTitle || "今日空闲提醒" }}</strong>
      <p>
        <span>{{ stats.availableCount || 0 }}</span>
        人可接新活，
        <span>{{ stats.overloadCount || 0 }}</span>
        人超负荷
      </p>
      <small v-if="scopeType === 'department'">只显示本部门数据</small>
      <small v-else-if="scopeType === 'self'">不展示部门树和分配入口</small>
    </section>
  </aside>
</template>
