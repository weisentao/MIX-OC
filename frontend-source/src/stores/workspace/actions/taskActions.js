import {
  idsEqual,
  normalizeDate,
  normalizeDepartmentFields,
  normalizeTaskModuleKey,
  nowText
} from "../helpers.js";
import workspaceApi from "../../../services/workspaceApi.js";
import { backendSyncToast, isLoginExpiredApiError } from "../../../services/apiErrors.js";
import { handleWorkspaceAuthFailure } from "./appActions.js";

let recentTimer;

function syncInBackground(store, label, requestFactory, options = {}) {
  if (typeof window === "undefined") return;
  Promise.resolve()
    .then(() => requestFactory())
    .then((result) => {
      if (typeof options.onSuccess === "function") options.onSuccess(result);
      return result;
    })
    .catch((error) => {
      console.warn(`[workspaceApi] ${label} failed`, error);
      if (isLoginExpiredApiError(error)) handleWorkspaceAuthFailure(store, error);
      if (typeof options.onError === "function") options.onError(error);
      store.showToast(backendSyncToast(error));
    });
}

function firstNonEmptyId(...values) {
  return values
    .map((value) => String(value ?? "").trim())
    .find(Boolean) || "";
}

function projectApiId(project = {}, fallback = {}) {
  return firstNonEmptyId(
    project.projectId,
    project.projectUid,
    project.project_uid,
    project.project_id,
    project.uid,
    fallback.projectId,
    fallback.projectUid,
    fallback.project_uid,
    fallback.project_id,
    fallback.uid,
    project.id
  );
}

function isLocalUnsyncedTask(task = {}) {
  const status = String(task.syncStatus || task.payload?.syncStatus || "").trim();
  return (status === "pending" || status === "failed") && !firstNonEmptyId(task.taskId, task.taskUid, task.backendTaskId);
}

function taskApiId(task) {
  if (isLocalUnsyncedTask(task)) return "";
  return [task?.taskId, task?.taskUid, task?.backendTaskId, task?.id]
    .map((value) => String(value ?? "").trim())
    .find(Boolean) || "";
}

function mergeBackendTask(task, response) {
  const source = response?.task || response?.data?.task || response?.data || response;
  if (!task || !source || typeof source !== "object") return task;
  const taskUid = String(source.taskUid || source.taskId || source.task_uid || source.task_id || "").trim();
  const backendTaskId = source.id ?? source.legacyTaskId ?? source.legacy_task_id ?? task.backendTaskId;
  const projectId = source.projectId || source.project_uid || source.project_id || task.projectId;
  if (taskUid) {
    task.taskUid = taskUid;
    task.taskId = taskUid;
  }
  if (backendTaskId !== undefined && backendTaskId !== null && String(backendTaskId).trim()) {
    task.backendTaskId = backendTaskId;
  }
  if (projectId !== undefined && projectId !== null && String(projectId).trim()) task.projectId = projectId;
  task.syncStatus = "synced";
  return task;
}

function taskPayload(task, projectId = null) {
  const department = normalizeDepartmentFields(task);
  return {
    id: task.id,
    taskId: task.taskId || task.taskUid || "",
    taskUid: task.taskUid || task.taskId || "",
    backendTaskId: task.backendTaskId ?? null,
    projectId: projectId || null,
    title: task.title,
    type: task.type,
    note: task.note,
    module: task.module,
    department: department.department,
    displayDepartment: department.displayDepartment,
    departmentPath: department.departmentPath,
    departmentKey: department.departmentKey,
    departmentLabel: department.departmentLabel,
    owner: task.owner,
    time: task.time,
    startDate: task.startDate,
    endDate: task.endDate,
    archived: !!task.archived,
    unreadComments: Number(task.unreadComments || 0),
    scheduleStatus: task.scheduleStatus || "",
    priority: task.priority || "",
    progress: Number(task.progress || 0)
  };
}

function currentTaskOwner(store) {
  const user = store.currentUser || {};
  const name = String(user.name || user.username || "").trim() || "当前用户";
  const department = normalizeDepartmentFields(user).displayDepartment || "项目成员";
  return `${department}: ${name}`;
}

function taskListForCurrentContext(store) {
  if (store.activeView === "template") return store.activeTemplateName ? store.activeTemplateTasks : null;
  return store.activeProject?.tasks || null;
}

function projectIdForTask(store, task) {
  if (store.activeView === "template") return null;
  return store.activeProject?.tasks?.some((item) => idsEqual(item.id, task.id)) ? projectApiId(store.activeProject, task) : null;
}

function blockMissingBackendId(store, message) {
  store.showToast(message);
  return false;
}

function taskMatchesId(task = {}, taskId) {
  return idsEqual(task.id, taskId);
}

function createTaskSnapshot(taskList = [], task = {}) {
  return {
    module: normalizeTaskModuleKey(task.module),
    archived: Boolean(task.archived),
    expanded: Boolean(task.expanded),
    index: taskList.findIndex((item) => taskMatchesId(item, task.id))
  };
}

function restoreTaskSnapshot(taskList = [], task, snapshot) {
  if (!task || !snapshot) return false;
  const currentIndex = taskList.findIndex((item) => taskMatchesId(item, task.id));
  if (currentIndex >= 0) taskList.splice(currentIndex, 1);
  task.module = snapshot.module;
  task.archived = snapshot.archived;
  task.expanded = snapshot.expanded;
  const insertIndex = snapshot.index >= 0 ? Math.min(snapshot.index, taskList.length) : taskList.length;
  taskList.splice(insertIndex, 0, task);
  return true;
}

function todaySlash() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

export const taskActions = {
  createTask(payload) {
    const taskList = taskListForCurrentContext(this);
    if (!taskList) {
      this.showToast("请先创建或选择一个项目，再新建流程任务");
      return false;
    }
    if (!payload.title?.trim()) return false;
    if (!this.requireTaskEditPermission()) return false;
    const projectId = this.activeView !== "template" ? projectApiId(this.activeProject, payload) : "";
    if (this.activeView !== "template" && !projectId) return blockMissingBackendId(this, "任务下发需要先同步项目到后端");
    const startDate = normalizeDate(payload.startDate) || todaySlash();
    const endDate = normalizeDate(payload.endDate) || startDate;
    const normalizedDepartment = normalizeDepartmentFields(payload, {
      department: this.currentUser?.department || "项目成员",
      departmentKey: payload.module || ""
    });
    const task = {
      id: Date.now(),
      title: payload.title.trim(),
      type: payload.type || "流程",
      note: payload.note?.trim() || "暂无备注，可点击备注修改",
      module: normalizeTaskModuleKey(payload.module),
      department: normalizedDepartment.department,
      displayDepartment: normalizedDepartment.displayDepartment,
      departmentPath: normalizedDepartment.departmentPath,
      departmentKey: normalizedDepartment.departmentKey,
      departmentLabel: normalizedDepartment.departmentLabel,
      owner: currentTaskOwner(this),
      time: nowText(),
      startDate,
      endDate,
      comments: [],
      unreadComments: 0,
      expanded: false,
      archived: false,
      syncStatus: "pending"
    };
    taskList.unshift(task);
    if (this.activeView !== "template") {
      this.activeView = "project";
      syncInBackground(this, "createTask", () =>
        workspaceApi.createTask(projectId, taskPayload(task, projectId)),
        {
          onSuccess: (response) => mergeBackendTask(task, response),
          onError: () => {
            const index = taskList.findIndex((item) => taskMatchesId(item, task.id));
            if (index >= 0) taskList.splice(index, 1);
          }
        }
      );
    }
    this.showToast(this.activeView === "template" ? "模板清单已添加" : "清单已创建");
    return true;
  },
  toggleTask(taskId) {
    const task = this.getTask(taskId);
    if (!task) return;
    task.expanded = !task.expanded;
    if (task.expanded) task.unreadComments = 0;
  },
  markTaskCommentsRead(taskId) {
    const task = this.getTask(taskId);
    if (task) task.unreadComments = 0;
  },
  updateTaskNote(taskId, note) {
    if (!this.requireTaskEditPermission()) return false;
    const task = this.getTask(taskId);
    if (!task || !note?.trim()) {
      this.showToast("备注可在弹窗里修改，已保留原内容");
      return false;
    }
    const previousNote = task.note;
    task.note = note.trim();
    const projectId = projectIdForTask(this, task);
    const apiTaskId = taskApiId(task);
    if (this.activeView !== "template" && (!projectId || !apiTaskId)) {
      task.note = previousNote;
      return blockMissingBackendId(this, "任务更新需要先同步到后端");
    }
    if (projectId && apiTaskId) {
      syncInBackground(this, "updateTask", () =>
        workspaceApi.updateTask(apiTaskId, {
          note: task.note,
          projectId
        })
      );
    }
    this.showToast("备注已更新");
    return true;
  },
  updateTaskTitle(taskId, title) {
    if (!this.requireTaskEditPermission()) return false;
    const task = this.getTask(taskId);
    const clean = String(title || "").trim();
    if (!task || !clean) {
      this.showToast("任务标题不能为空");
      return false;
    }
    const previousTitle = task.title;
    task.title = clean;
    const projectId = projectIdForTask(this, task);
    const apiTaskId = taskApiId(task);
    if (this.activeView !== "template" && (!projectId || !apiTaskId)) {
      task.title = previousTitle;
      return blockMissingBackendId(this, "任务更新需要先同步到后端");
    }
    if (projectId && apiTaskId) {
      syncInBackground(this, "updateTask", () =>
        workspaceApi.updateTask(apiTaskId, {
          title: task.title,
          projectId
        })
      );
    }
    this.showToast("任务标题已更新");
    return true;
  },
  deleteTask(taskId) {
    if (!this.requireTaskEditPermission()) return false;
    const taskList = taskListForCurrentContext(this);
    if (!taskList) return false;
    const target = taskList.find((task) => taskMatchesId(task, taskId));
    if (target && this.activeView !== "template") {
      const projectId = projectApiId(this.activeProject || {}, target);
      const apiTaskId = taskApiId(target);
      if (!projectId || !apiTaskId) return blockMissingBackendId(this, "任务删除需要先同步到后端");
    }
    const nextTasks = taskList.filter((task) => !taskMatchesId(task, taskId));
    if (this.activeView === "template") {
      const template = this.activeTemplate;
      const name = this.activeTemplateName;
      if (template && name) template.templateTasks[name] = nextTasks;
    } else if (this.activeProject) {
      this.activeProject.tasks = nextTasks;
    }
    this.showToast("清单已删除");
    if (target && this.activeView !== "template") {
      const projectId = projectApiId(this.activeProject || {}, target);
      const apiTaskId = taskApiId(target);
      if (projectId && apiTaskId) {
        syncInBackground(this, "deleteTask", () => workspaceApi.deleteTask(apiTaskId), {
          onError: () => {
            if (this.activeProject) this.activeProject.tasks = taskList;
          }
        });
      }
    }
    return true;
  },
  openArchiveDialog(taskId) {
    if (!this.requireTaskEditPermission()) return false;
    const task = this.getTask(taskId);
    if (!task || task.archived) return false;
    this.pendingArchiveTaskId = task.id;
    this.archiveConfirmPhrase = "确认归档";
    return true;
  },
  closeArchiveDialog() {
    this.pendingArchiveTaskId = null;
    this.archiveConfirmPhrase = "确认归档";
  },
  confirmArchive(inputText) {
    if (String(inputText || "").trim() !== this.archiveConfirmPhrase) {
      this.showToast(`请输入「${this.archiveConfirmPhrase}」后再归档`);
      return false;
    }
    const task = this.getTask(this.pendingArchiveTaskId);
    if (!task) {
      this.closeArchiveDialog();
      this.showToast("没有找到要归档的任务");
      return false;
    }
    this.closeArchiveDialog();
    this.completeTask(task, true);
    return true;
  },
  completeTask(task, highlight = false) {
    if (!this.requireTaskEditPermission()) return false;
    const taskList = taskListForCurrentContext(this);
    const snapshot = taskList ? createTaskSnapshot(taskList, task) : null;
    task.archived = true;
    task.expanded = false;
    this.recentTaskId = task.id;
    const projectId = projectIdForTask(this, task);
    const apiTaskId = taskApiId(task);
    if (projectId && apiTaskId) {
      syncInBackground(
        this,
        "updateTask",
        () =>
          workspaceApi.updateTask(apiTaskId, {
            archived: true,
            expanded: false,
            projectId
          }),
        {
          onError: () => {
            if (taskList && snapshot) restoreTaskSnapshot(taskList, task, snapshot);
          }
        }
      );
    }
    this.showToast("已移入已完成任务列表");
    if (highlight) this.clearRecentTask();
    return true;
  },
  restoreTask(task, highlight = false) {
    if (!this.requireTaskEditPermission()) return false;
    if (!task) return false;
    const restored = this.moveTaskWithinModule(task.id, task.module, "active");
    if (restored) {
      this.recentTaskId = task.id;
      if (highlight) this.clearRecentTask();
    }
    return restored;
  },
  clearRecentTask() {
    clearTimeout(recentTimer);
    recentTimer = window.setTimeout(() => {
      this.recentTaskId = null;
    }, 1300);
  },
  moveTaskWithinModule(taskId, moduleKey, status, beforeTaskId = 0) {
    if (!this.requireTaskEditPermission()) return false;
    const taskList = taskListForCurrentContext(this);
    if (!taskList) return false;
    const isArchived = status === "archived";
    const taskIndex = taskList.findIndex((task) => taskMatchesId(task, taskId));
    if (taskIndex < 0) return false;
    const [task] = taskList.splice(taskIndex, 1);
    const snapshot = {
      module: normalizeTaskModuleKey(task.module),
      archived: Boolean(task.archived),
      expanded: Boolean(task.expanded),
      index: taskIndex
    };
    const wasArchived = !!task.archived;
    task.module = normalizeTaskModuleKey(moduleKey);
    task.archived = isArchived;
    if (wasArchived !== isArchived) task.expanded = false;
    let insertIndex = beforeTaskId
      ? taskList.findIndex((item) => taskMatchesId(item, beforeTaskId) && item.module === moduleKey && item.archived === isArchived)
      : -1;
    if (insertIndex === -1) {
      insertIndex = taskList.findIndex((item) => item.module === moduleKey && item.archived === isArchived);
    }
    taskList.splice(insertIndex === -1 ? taskList.length : insertIndex, 0, task);
    if (this.activeView !== "template") {
      const projectId = projectApiId(this.activeProject || {}, task);
      const apiTaskId = taskApiId(task);
      if (!projectId || !apiTaskId) {
        restoreTaskSnapshot(taskList, task, snapshot);
        return blockMissingBackendId(this, "任务调整需要先同步到后端");
      }
      if (projectId && apiTaskId) {
        syncInBackground(
          this,
          "updateTask",
          () =>
            workspaceApi.updateTask(apiTaskId, {
              module: task.module,
              archived: task.archived,
              expanded: task.expanded,
              projectId
            }),
          {
            onError: () => {
              restoreTaskSnapshot(taskList, task, snapshot);
            }
          }
        );
      }
    }
    this.showToast(wasArchived && !isArchived ? "已恢复到待完成任务列表" : "已调整同色模块内顺序");
    return true;
  },
  handleTaskDrop(taskId, targetStatus, targetModule, beforeTaskId = 0) {
    const task = this.getTask(taskId);
    if (!task || !targetStatus || !targetModule) return "noop";
    if (!this.requireTaskEditPermission()) return "blocked";
    const moduleKey = normalizeTaskModuleKey(targetModule);

    if (!task.archived && targetStatus === "active" && normalizeTaskModuleKey(task.module) !== moduleKey) {
      this.showToast("任务只能在所属部门模块里上下拖拽");
      return "blocked";
    }

    if (!task.archived && targetStatus === "archived") {
      this.completeTask(task, true);
      return "archive";
    }

    if (task.archived && targetStatus === "archived" && normalizeTaskModuleKey(task.module) !== moduleKey) {
      this.showToast("已完成任务也只能在所属部门内调整顺序");
      return "blocked";
    }

    if (beforeTaskId && idsEqual(beforeTaskId, task.id)) return "noop";
    this.moveTaskWithinModule(task.id, moduleKey, targetStatus, beforeTaskId);
    return "moved";
  },
  addComment(taskId, text, mentions = []) {
    if (!this.canComment) {
      this.showToast("当前用户没有该项目评论权限");
      return false;
    }
    const task = this.getTask(taskId);
    const clean = text?.trim();
    if (!task) {
      this.showToast("没有找到对应任务");
      return false;
    }
    if (!clean) {
      this.showToast("请输入评论内容");
      return false;
    }
    task.comments.push({
      user: this.currentUser?.name || this.currentUser?.username || "当前用户",
      dept: normalizeDepartmentFields(this.currentUser).displayDepartment || "项目成员",
      tone: "pink",
      time: nowText(),
      text: clean
    });
    task.unreadComments = 0;
    const projectId = projectIdForTask(this, task);
    const apiTaskId = taskApiId(task);
    if (projectId && apiTaskId) {
      syncInBackground(this, "addTaskComment", () => workspaceApi.addTaskComment(apiTaskId, clean, mentions));
    }
    this.showToast(task.archived ? "已完成任务的补充留言已保存" : "评论已发送");
    return true;
  },
  archiveFirstActiveTask() {
    if (!this.requireTaskEditPermission()) return false;
    const task = this.activeProject?.tasks.find((item) => !item.archived && this.taskMatchesFilter(item));
    if (!task) {
      this.showToast("没有可归档的任务");
      return false;
    }
    this.completeTask(task, true);
    return true;
  },
  clearArchive() {
    if (!this.requireTaskEditPermission()) return false;
    const project = this.activeProject;
    if (!project) return false;
    project.tasks = project.tasks || [];
    const count = project.tasks.filter((task) => task.archived).length;
    if (!count) {
      this.showToast("当前没有归档任务");
      return false;
    }
    const archivedTasks = project.tasks.filter((task) => task.archived);
    project.tasks = project.tasks.filter((task) => !task.archived);
    archivedTasks.forEach((task) => {
      const projectId = projectApiId(project, task);
      const apiTaskId = taskApiId(task);
      if (projectId && apiTaskId) syncInBackground(this, "deleteTask", () => workspaceApi.deleteTask(apiTaskId));
    });
    this.showToast("归档已清理");
    this.celebrate("项目归档完成", `已整理 ${count} 个归档任务`, true);
    return true;
  },
};
