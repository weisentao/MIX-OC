import { tagColors, taskModules } from "../../../data/seed.js";
import { idsEqual, lower, normalizeTaskModuleKey } from "../helpers.js";

export const coreActions = {
jumpToOptimize(projectId = this.activeProjectId) {
  this.activeProjectId = projectId;
  this.activeSection = "optimize";
  this.activeView = "project";
  this.activeFilter = "all";
  this.showToast("已打开项目优化入口");
},
setTaskFilter(value) {
  this.activeFilter = value || "all";
  if (this.activeFilter !== "all") this.taskModuleFilter = "all";
},
setTaskModuleFilter(value) {
  this.taskModuleFilter = value || "all";
},
toggleTree(key) {
  this.treesOpen[key] = !this.treesOpen[key];
},
toggleGroup(groupId) {
  const set = new Set(this.collapsedGroups);
  if (set.has(groupId)) {
    set.delete(groupId);
  } else {
    set.add(groupId);
  }
  this.collapsedGroups = [...set];
},
collapseOpen(groupId) {
  const set = new Set(this.collapsedGroups);
  set.delete(groupId);
  this.collapsedGroups = [...set];
},
toggleTemplateGroup(templateId) {
  const set = new Set(this.collapsedTemplateGroups);
  if (set.has(templateId)) {
    set.delete(templateId);
  } else {
    set.add(templateId);
  }
  this.collapsedTemplateGroups = [...set];
},
collapseTemplateOpen(templateId) {
  const set = new Set(this.collapsedTemplateGroups);
  set.delete(templateId);
  this.collapsedTemplateGroups = [...set];
},
selectProject(projectId) {
  const found = this.findProjectWithGroup(projectId);
  if (!found?.project || found.project.status === "archived") {
    this.showToast("归档项目处于冻结状态，请先恢复后查看");
    return false;
  }
  const previousProjectId = this.activeProjectId;
  const wasInSchedule = this.activeSection === "schedule";
  this.activeProjectId = found.project.id;
  this.activeView = "project";
  if (this.activeSection !== "schedule") {
    this.activeSection = this.activeSection === "home" ? "home" : "flow";
  } else if (
    wasInSchedule &&
    typeof this.loadScheduleForActiveProject === "function" &&
    (!idsEqual(previousProjectId, found.project.id) || !idsEqual(this.schedulePlan?.projectId, found.project.id))
  ) {
    this.loadScheduleForActiveProject({ skipIfLoadingProject: true });
  }
  return true;
},
selectSearchResult(result) {
  this.activeProjectId = result.projectId;
  const task = this.getTask(result.taskId);
  if (task) task.expanded = true;
  this.activeView = "project";
},
getTag(name) {
  return (this.tags || []).find((tag) => tag.name === name) || { name, color: tagColors[String(name).length % tagColors.length] };
},
getTaskModule(task) {
  const key = normalizeTaskModuleKey(task?.module);
  return taskModules.find((module) => module.key === key) || taskModules[0];
},
getUser(userId) {
  return (this.users || []).find((user) => user.id === userId) || null;
},
getUserByName(name) {
  return (this.users || []).find((user) => lower(user.name) === lower(name)) || null;
},
roleLabel(role) {
  return {
    readonly: "只读",
    editor: "编辑",
    manager: "管理"
  }[role] || "只读";
},
getProjectGroup(groupId) {
  return (this.projectGroups || []).find((group) => group.id === groupId);
},
findProjectWithGroup(projectId) {
  const rootProject = (this.rootProjects || []).find((item) => idsEqual(item.id, projectId));
  if (rootProject) return { group: null, project: rootProject, isRoot: true };
  for (const group of this.projectGroups || []) {
    const project = (group.projects || []).find((item) => idsEqual(item.id, projectId));
    if (project) return { group, project };
  }
  return null;
},
findTemplate(name) {
  for (const [groupIndex, group] of (this.templates || []).entries()) {
    const childIndex = (group.children || []).indexOf(name);
    if (childIndex !== -1) return { group, groupIndex, childIndex };
  }
  return null;
},
getTask(taskId) {
  const projects = Array.isArray(this.allProjects) ? this.allProjects : [];
  return (
    this.activeTemplateTasks?.find((task) => idsEqual(task.id, taskId)) ||
    this.activeProject?.tasks?.find((task) => idsEqual(task.id, taskId)) ||
    projects.flatMap((project) => project.tasks || []).find((task) => idsEqual(task.id, taskId))
  );
},
getProjectPeriod(project) {
  if (project?.startDate && project?.endDate) return `项目排期${project.startDate}-${project.endDate}`;
  if (!project?.tasks?.length) return "";
  this.ensureScheduleDefaults(project);
  const starts = project.tasks.map((task) => task.startDate).filter(Boolean).sort();
  const ends = project.tasks.map((task) => task.endDate).filter(Boolean).sort();
  if (!starts.length || !ends.length) return "";
  return `项目排期${starts[0]}-${ends[ends.length - 1]}`;
},
getNextActiveProjectId() {
  return this.activeProjects[0]?.id || null;
},
taskMatchesFilter(task) {
  const filterOk = this.activeFilter === "all" || task.type === this.activeFilter;
  const module = this.getTaskModule(task);
  const moduleFilterOk = (this.taskModuleFilter || "all") === "all" || module.key === this.taskModuleFilter;
  return filterOk && moduleFilterOk;
},
requireTaskEditPermission() {
  if (["template", "schedule-template"].includes(this.activeView) && this.templateCanEdit) return true;
  if (this.canEditTask) return true;
  if (this.activeView === "schedule-template") {
    this.showToast("当前模板仅有查看权限，不能编辑排期模板内容");
    return false;
  }
  this.showToast("只读权限只能查看和评论，不能编辑任务清单");
  return false;
},
requireProjectManagePermission() {
  if (this.canManageProject) return true;
  this.showToast("只有管理权限可以操作当前项目");
  return false;
},
};
