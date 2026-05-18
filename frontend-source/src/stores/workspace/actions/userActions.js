import { nowText, uniqueId } from "../helpers.js";
import workspaceApi from "../../../services/workspaceApi.js";
import adminApi from "../../../services/adminApi.js";
import { updateCurrentUserProfile } from "../../../services/auth.js";
import { backendSyncToast, isLoginExpiredApiError } from "../../../services/apiErrors.js";
import { handleWorkspaceAuthFailure } from "./appActions.js";

const LOCAL_USERS_KEY = "xjg_local_users";

function readLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistLocalUser(user) {
  if (!user?.id) return;
  try {
    localStorage.setItem("xjg_user", JSON.stringify(user));
    const users = readLocalUsers();
    const index = users.findIndex((item) => item.id === user.id);
    if (index === -1) users.push({ ...user });
    else users[index] = { ...users[index], ...user };
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
  }
}

function persistKnownUser(store, user) {
  if (!user?.id) return;
  if (user.id === store.currentUser?.id) {
    persistLocalUser(user);
    return;
  }
  try {
    const users = readLocalUsers();
    const index = users.findIndex((item) => item.id === user.id);
    if (index >= 0) {
      users[index] = { ...users[index], ...user };
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    }
  } catch {
  }
}

function syncInBackground(store, label, requestFactory, options = {}) {
  if (typeof window === "undefined") return Promise.resolve(null);
  return Promise.resolve()
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
      return null;
    });
}

export const userActions = {
  switchUser(userId) {
    if (!this.getUser(userId)) return false;
    this.currentUserId = userId;
    persistLocalUser(this.currentUser);
    this.showToast(`已切换到 ${this.currentUser.name}`);
    return true;
  },
  updateCurrentUserField(field, value, maxLength = 40) {
    const user = this.currentUser;
    const clean = String(value || "").trim();
    if (!user || !clean) return false;
    user[field] = clean.slice(0, maxLength);
    persistLocalUser(user);
    syncInBackground(this, "updateCurrentUserProfile", () => updateCurrentUserProfile({ [field]: user[field] }), {
      onSuccess: (result) => {
        if (result?.id === user.id) Object.assign(user, result);
        persistLocalUser(user);
      }
    });
    this.showToast("个人资料已同步");
    return true;
  },
  updateCurrentUserAsset(field, value, label = "素材") {
    const user = this.currentUser;
    if (!user || !value) return false;
    user[field] = value;
    persistLocalUser(user);
    syncInBackground(this, "updateCurrentUserProfile", () => updateCurrentUserProfile({ [field]: value }), {
      onSuccess: (result) => {
        if (result?.id === user.id) Object.assign(user, result);
        persistLocalUser(user);
      }
    });
    this.showToast(`${label}已同步`);
    return true;
  },
  clearCurrentUserAsset(field, label = "素材") {
    const user = this.currentUser;
    if (!user) return false;
    user[field] = "";
    persistLocalUser(user);
    syncInBackground(this, "updateCurrentUserProfile", () => updateCurrentUserProfile({ [field]: "" }), {
      onSuccess: (result) => {
        if (result?.id === user.id) Object.assign(user, result);
        persistLocalUser(user);
      }
    });
    this.showToast(`${label}已重置`);
    return true;
  },
  updateUserField(userId, field, value) {
    const user = this.getUser(userId);
    const clean = String(value || "").trim();
    if (!user || !clean) return false;
    user[field] = clean;
    persistKnownUser(this, user);
    syncInBackground(this, "adminApi.updateUser", () => adminApi.updateUser(userId, { [field]: clean }), {
      onSuccess: (result) => {
        if (result?.id === user.id) Object.assign(user, result);
        persistKnownUser(this, user);
      }
    });
    this.showToast("用户信息已更新");
    return true;
  },
  toggleCareContact(userId) {
    const current = this.currentUser;
    const target = this.getUser(userId);
    if (!current?.id || !target || current.id === target.id) return false;
    this.contacts = this.contacts || [];
    const isCareRelation = (item) => String(item?.relationType || item?.relation_type || "care").trim().toLowerCase() === "care";
    const contactTargetId = (item) => item?.userId || item?.user_id || item?.targetUserId || item?.target_user_id || item?.target?.id || "";
    const existingIndex = this.contacts.findIndex((item) => isCareRelation(item) && (contactTargetId(item) === target.id || item.id === target.id));
    if (existingIndex >= 0) {
      const existing = this.contacts[existingIndex];
      this.contacts.splice(existingIndex, 1);
      syncInBackground(this, "removeContact", () => workspaceApi.deleteContact(existing.contactId || existing.id || existing.userId || target.id), {
        onError: () => {
          this.contacts.splice(existingIndex, 0, existing);
        }
      });
      this.showToast(`已取消关注：${target.name}`);
      return false;
    }

    const contact = {
      id: target.id,
      userId: target.id,
      username: target.username || "",
      name: target.name || "",
      displayName: target.name || "",
      department: target.department || "",
      job: target.job || "",
      phone: target.phone || "",
      email: target.email || "",
      relationType: "care",
      status: "active"
    };
    this.contacts.push(contact);
    syncInBackground(this, "createContact", () => workspaceApi.createContact({ targetUserId: target.id, relationType: "care" }), {
      onSuccess: (result) => {
        if (!result) return;
        const resultTargetId = contactTargetId(result);
        if (resultTargetId === target.id || result.id === target.id) Object.assign(contact, result, { userId: target.id, contactId: result.contactId || result.id || contact.contactId });
      },
      onError: () => {
        const index = this.contacts.indexOf(contact);
        if (index >= 0) this.contacts.splice(index, 1);
      }
    });
    this.showToast(`已关注：${target.name}`);
    return true;
  },
  isCareContact(userId) {
    return (this.contacts || []).some((item) => {
      if (String(item?.relationType || item?.relation_type || "care").trim().toLowerCase() !== "care") return false;
      return item.userId === userId || item.id === userId;
    });
  },
  resetUserPassword(userId) {
    const user = this.getUser(userId);
    if (!user) return false;
    this.showToast(`${user.name} 的密码重置需通过后端流程完成`);
    return false;
  },
  archiveUser(userId) {
    const user = this.getUser(userId);
    if (!user || user.role === "admin") return false;
    user.status = "archived";
    user.archivedAt = nowText();
    this.showToast(`${user.name} 已归档`);
    return true;
  },
  restoreUser(userId) {
    const user = this.getUser(userId);
    if (!user) return false;
    user.status = "active";
    this.showToast(`${user.name} 已恢复`);
    return true;
  },
  deleteUser(userId) {
    const user = this.getUser(userId);
    if (!user || user.role === "admin") return false;
    this.users = this.users.filter((item) => item.id !== userId);
    this.allProjects.forEach((project) => {
      project.members = (project.members || []).filter((name) => name !== user.name);
      if (project.memberRoles) delete project.memberRoles[user.name];
    });
    this.showToast(`${user.name} 已删除`);
    return true;
  },
  updateNotice(noticeId, value) {
    const notice = (this.carouselNotices || []).find((item) => item.id === noticeId);
    if (!notice) return false;
    notice.text = String(value || "").trim() || notice.text;
    this.showToast("公告已更新");
    return true;
  },
  updateNoticeField(noticeId, field, value) {
    const notice = (this.carouselNotices || []).find((item) => item.id === noticeId);
    if (!notice) return false;
    notice[field] = field === "interval" ? Math.max(1000, Number(value) || 5500) : String(value || "").trim();
    this.showToast("公告配置已更新");
    return true;
  },
  addNotice(text) {
    const clean = String(text || "").trim();
    if (!clean) return false;
    this.carouselNotices = this.carouselNotices || [];
    this.carouselNotices.unshift({
      id: uniqueId("notice"),
      title: "公告",
      text: clean,
      type: "公告",
      interval: 5500,
      enabled: true
    });
    this.showToast("公告已新增");
    return true;
  },
  deleteNotice(noticeId) {
    this.carouselNotices = this.carouselNotices.filter((item) => item.id !== noticeId);
    this.showToast("公告已删除");
    return true;
  }
};
