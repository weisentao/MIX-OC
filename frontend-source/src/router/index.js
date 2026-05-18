import { createRouter, createWebHashHistory } from "vue-router";
import LoginView from "@/views/LoginView.vue";
import WorkspaceView from "@/views/WorkspaceView.vue";
const AdminConsoleView = () => import("@/views/AdminConsoleView.vue");
const ManagerConsoleView = () => import("@/views/ManagerConsoleView.vue");
import { buildLoginRedirectQuery, resolvePostLoginTarget } from "@/services/authRedirect";

const routes = [
  {
    path: "/login",
    name: "login",
    component: LoginView
  },
  {
    path: "/",
    name: "workspace",
    component: WorkspaceView
  },
  {
    path: "/admin/notice",
    redirect: { name: "admin-console", params: { section: "notices" } }
  },
  {
    path: "/admin/:section?",
    name: "admin-console",
    component: AdminConsoleView,
    meta: { requiresAdmin: true }
  },
  {
    path: "/manager/:section?",
    name: "manager-console",
    component: ManagerConsoleView,
    meta: { requiresManagement: true }
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/"
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

function storedUser() {
  try {
    const token = localStorage.getItem("xjg_token");
    const user = JSON.parse(localStorage.getItem("xjg_user") || "null");
    if (user?.id) return user;
    if (token === "local-admin-token") {
      return { id: "u-admin", username: "admin", name: "admin", role: "admin" };
    }
    const authUsers = JSON.parse(localStorage.getItem("xjg_local_auth_users") || "[]");
    const localUsers = JSON.parse(localStorage.getItem("xjg_local_users") || "[]");
    const authUser = Array.isArray(authUsers) ? authUsers.find((item) => item.token === token) : null;
    const localUser = authUser && Array.isArray(localUsers) ? localUsers.find((item) => item.id === authUser.userId) : null;
    return localUser || {};
  } catch {
    return {};
  }
}

function hasUsableToken(token) {
  return Boolean(token);
}

function isManagementUser(user = {}) {
  const role = String(user.role || "").trim().toLowerCase();
  if (["admin", "super_admin"].includes(role)) return true;
  if (["manager", "department_admin", "department_manager", "project_manager"].includes(role)) return true;
  return false;
}

router.beforeEach((to) => {
  const token = localStorage.getItem("xjg_token");
  const usableToken = hasUsableToken(token);
  if (to.name !== "login" && !usableToken) return { name: "login", query: buildLoginRedirectQuery(to) };
  if (to.name === "login" && usableToken) return resolvePostLoginTarget(to.query || {});
  if (to.meta.requiresAdmin) {
    const user = storedUser();
    const role = String(user.role || "").trim().toLowerCase();
    if (!["admin", "super_admin"].includes(role)) return { name: "manager-console" };
  }
  if (to.meta.requiresManagement) {
    const user = storedUser();
    if (!isManagementUser(user)) return { name: "workspace" };
  }
  return true;
});

if (typeof window !== "undefined") {
  window.addEventListener("xjg-auth-required", () => {
    if (router.currentRoute.value.name !== "login") {
      router.replace({ name: "login", query: buildLoginRedirectQuery(router.currentRoute.value) });
    }
  });
}

export default router;
