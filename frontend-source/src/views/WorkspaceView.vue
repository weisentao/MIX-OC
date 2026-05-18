<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import { consumePostLoginSection } from "@/services/authRedirect";
import RailNav from "@/components/layout/RailNav.vue";
import ProjectPanel from "@/components/layout/ProjectPanel.vue";
import WorkbenchHeader from "@/components/layout/WorkbenchHeader.vue";
import ProjectMetaTags from "@/components/layout/ProjectMetaTags.vue";
import HomeDashboard from "@/views/HomeDashboard.vue";
import FlowBoard from "@/views/FlowBoard.vue";
import ScheduleView from "@/views/ScheduleView.vue";
import BoardCenter from "@/views/BoardCenter.vue";
import ResourceView from "@/views/ResourceView.vue";
import ProjectDialog from "@/components/dialogs/ProjectDialog.vue";
import TaskDialog from "@/components/dialogs/TaskDialog.vue";
import TagDialog from "@/components/dialogs/TagDialog.vue";
import ArchiveDialog from "@/components/dialogs/ArchiveDialog.vue";
import ProfileDialog from "@/components/dialogs/ProfileDialog.vue";
import ContactsDialog from "@/components/dialogs/ContactsDialog.vue";
import MemberPermissionsDialog from "@/components/dialogs/MemberPermissionsDialog.vue";
import TemplateShareDialog from "@/components/dialogs/TemplateShareDialog.vue";
import AdminDialog from "@/components/dialogs/AdminDialog.vue";
import AppLauncherDialog from "@/components/dialogs/AppLauncherDialog.vue";
import CollabBoardOverlay from "@/components/boards/CollabBoardOverlay.vue";
import AppToast from "@/components/feedback/AppToast.vue";
import CelebrationOverlay from "@/components/feedback/CelebrationOverlay.vue";
import VideoPlayer from "@/components/media/VideoPlayer.vue";
import { askConfirm, askText } from "@/utils/appDialog";
import { changePassword as changePasswordApi } from "@/services/auth";

const store = useWorkspaceStore();
const router = useRouter();
const route = useRoute();
const isHome = computed(() => store.activeSection === "home");
const isSchedule = computed(() => store.activeSection === "schedule");
const isResource = computed(() => store.activeSection === "resource");
const projectOwnerText = computed(() => store.activeProject?.owner || "请先创建项目");
const projectPeriodText = computed(() => store.activeProjectPeriod || "未设置项目时间");
const homeRenderKey = ref(0);
const projectPanelMode = shallowRef("default");
const viewTransitionKey = computed(() => `${store.activeSection}-${store.activeSection === "home" ? homeRenderKey.value : 0}`);
const frameClass = computed(() => ({
  "is-home-shell": isHome.value,
  "is-resource-shell": isResource.value,
  "is-project-panel-collapsed": projectPanelMode.value === "collapsed",
  "is-project-panel-wide": projectPanelMode.value === "wide"
}));
let saveTimer = 0;

function syncStoredLoginUser() {
  try {
    const user = JSON.parse(localStorage.getItem("xjg_user") || "null");
    if (!user?.id) return;
    const existing = store.getUser(user.id);
    if (existing) Object.assign(existing, user);
    else store.users.push(user);
    store.currentUserId = user.id;
    store.ensureCurrentUserTemplateGroups();
  } catch {
    localStorage.removeItem("xjg_user");
  }
}

onMounted(async () => {
  if (!store.backendLoaded) await store.loadAppState();
  syncStoredLoginUser();
  const postLoginSection = consumePostLoginSection(route.query || {});
  if (postLoginSection) {
    store.setSection(postLoginSection);
    if (route.query?.section) router.replace({ path: "/", query: {} });
  }
  store.$subscribe(() => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (store.backendLoaded) store.saveAppState();
    }, 500);
  });
});

function handleExternalProfile(event) {
  const { userId, readonly = true } = event.detail || {};
  if (userId) openProfile(userId, readonly);
}

onMounted(() => {
  window.addEventListener("xjg-open-profile", handleExternalProfile);
});

onBeforeUnmount(() => {
  window.removeEventListener("xjg-open-profile", handleExternalProfile);
});

watch(
  () => store.activeSection,
  (section, previous) => {
    if (section === "home" && previous !== "home") homeRenderKey.value += 1;
  }
);

const projectDialogOpen = ref(false);
const editingProjectId = ref(null);
const taskDialogOpen = ref(false);
const tagDialogOpen = ref(false);
const contactsDialogOpen = ref(false);
const contactsDialogSource = ref("default");
const membersDialogOpen = ref(false);
const adminDialogOpen = ref(false);
const launcherDialogOpen = ref(false);
const helpDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const profileDialogOpen = ref(false);
const profileUserId = ref("");
const profileReadonly = ref(false);
const taskDefaultType = ref("流程");
const backgroundInput = ref(null);
const templateShareDialogOpen = ref(false);
const sharingTemplateName = ref("");
const sharingTemplateKind = ref("task");

function openProjectDialog(projectId = null) {
  editingProjectId.value = projectId;
  projectDialogOpen.value = true;
}

function setProjectPanelMode(mode) {
  projectPanelMode.value = ["collapsed", "wide"].includes(mode) ? mode : "default";
}

function openTaskDialog(type = "流程") {
  taskDefaultType.value = type;
  taskDialogOpen.value = true;
}

function openTemplateShareDialog(templateName, templateKind = "task") {
  sharingTemplateName.value = templateName || "";
  sharingTemplateKind.value = templateKind === "schedule" ? "schedule" : "task";
  templateShareDialogOpen.value = Boolean(sharingTemplateName.value);
}

async function promptAction(payload) {
  const { action } = payload;
  if (action === "add-group") {
    const title = await askText({ title: "新建分组", message: "请输入分组名称", inputValue: "新建分组" });
    store.addProjectGroup(title);
  } else if (action === "add-project") {
    const group = store.getProjectGroup(payload.groupId);
    const name = await askText({
      title: "新建项目",
      message: `在「${group?.title || ""}」下新建项目`,
      inputValue: "新建项目"
    });
    store.addProjectToGroup(payload.groupId, name);
  } else if (action === "rename-group") {
    const next = await askText({ title: "重命名分组", message: "请输入新的分组名称", inputValue: payload.current });
    store.renameProjectGroup(payload.groupId, next);
  } else if (action === "delete-group") {
    const text = payload.count
      ? `分组「${payload.title}」下还有 ${payload.count} 个项目，确认一起删除吗？`
      : `确认删除分组「${payload.title}」吗？`;
    if (await askConfirm({ title: "删除分组", message: text, confirmButtonText: "删除" })) store.deleteProjectGroup(payload.groupId);
  } else if (action === "rename-project-node") {
    openProjectDialog(payload.projectId);
  } else if (action === "delete-project-node") {
    const text = `确认删除项目「${String(payload.title || "")}」吗？`;
    if (await askConfirm({ title: "删除项目", message: text, confirmButtonText: "删除" })) store.deleteProjectNode(payload.projectId);
  } else if (action === "edit-project") {
    openProjectDialog(payload.projectId);
  } else if (action === "invite-member") {
    inviteMember();
  } else if (action === "add-template-group") {
    const isScheduleTemplate = payload.kind === "schedule";
    const title = await askText({ title: "新建模板分组", message: "请输入模板分组名称", inputValue: isScheduleTemplate ? "新建排期模板分组" : "新建任务模板分组" });
    store.addTemplateGroup(title, payload.kind);
  } else if (action === "add-template") {
    const title = await askText({
      title: "新建模板",
      message: `在「${payload.title}」下新建模板`,
      inputValue: "新建模板"
    });
    store.addTemplateToGroup(payload.templateIndex, title);
  } else if (action === "rename-template-group") {
    const next = await askText({ title: "重命名模板分组", message: "请输入新的模板分组名称", inputValue: payload.current });
    store.renameTemplateGroup(payload.templateIndex, next);
  } else if (action === "delete-template-group") {
    const text = payload.count
      ? `模板分组「${payload.title}」下还有模板，确认一起删除吗？`
      : `确认删除模板分组「${payload.title}」吗？`;
    if (await askConfirm({ title: "删除模板分组", message: text, confirmButtonText: "删除" })) store.deleteTemplateGroup(payload.templateIndex);
  } else if (action === "share-template") {
    openTemplateShareDialog(payload.templateName, payload.templateKind);
  } else if (action === "rename-template") {
    const next = await askText({ title: "重命名模板", message: "请输入新的模板名称", inputValue: payload.templateName });
    store.renameTemplate(payload.templateName, next);
  } else if (action === "delete-template") {
    if (await askConfirm({ title: "删除模板", message: `确认删除模板「${payload.templateName}」吗？`, confirmButtonText: "删除" })) {
      store.deleteTemplate(payload.templateName);
    }
  }
}

async function deleteProject() {
  if (!store.activeProject) return;
  if (!(await askConfirm({ title: "删除项目", message: `确认删除「${store.activeProjectName}」吗？`, confirmButtonText: "删除" }))) return;
  store.deleteActiveProject();
}

async function archiveProject() {
  if (!store.activeProject) return;
  const ok = await askConfirm({
    title: "归档项目",
    message: `确认归档「${store.activeProjectName}」吗？归档后项目会冻结，恢复前不可继续编辑。`,
    confirmButtonText: "归档"
  });
  if (!ok) return;
  store.archiveActiveProject();
}

function openProfile(userId = store.currentUser?.id, readonly = false) {
  profileUserId.value = userId || store.currentUser?.id || "";
  profileReadonly.value = readonly;
  profileDialogOpen.value = true;
}

function openContactsDialog(source = "default") {
  contactsDialogSource.value = source;
  contactsDialogOpen.value = true;
}

function managementConsoleRoute() {
  return {
    name: store.isAdmin ? "admin-console" : "manager-console"
  };
}

function openManagementConsole() {
  try {
    if (store.currentUser?.id) {
      localStorage.setItem("xjg_user", JSON.stringify(store.currentUser));
    }
  } catch {
    // Keep opening the console even when localStorage is unavailable.
  }
  router.push(managementConsoleRoute());
}

function openManagementConsoleFromSettings() {
  settingsDialogOpen.value = false;
  openManagementConsole();
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("profile") === "1") openProfile(store.currentUser?.id);
  if (params.get("admin") === "1") {
    store.switchUser("u-admin");
    openManagementConsole();
  }
});

function openContactProfile(userId) {
  contactsDialogOpen.value = false;
  openProfile(userId, true);
}

async function inviteMember() {
  const name = await askText({ title: "邀请成员", message: "请输入通讯录中的用户名称", inputValue: "新成员" });
  store.inviteMember(name);
}

function logout() {
  localStorage.removeItem("xjg_token");
  localStorage.removeItem("xjg_user");
  router.replace("/login");
}

async function changePassword() {
  const oldPassword = await askText({ title: "修改密码", message: "请输入旧密码", inputType: "password" });
  if (!oldPassword) return;
  const newPassword = await askText({ title: "修改密码", message: "请输入新密码（不少于 6 位）", inputType: "password" });
  if (!newPassword) return;
  if (String(newPassword).length < 6) {
    store.showToast("新密码不能少于 6 位");
    return;
  }
  const confirmPassword = await askText({ title: "修改密码", message: "请再次输入新密码", inputType: "password" });
  if (confirmPassword !== newPassword) {
    store.showToast("两次输入的新密码不一致");
    return;
  }
  try {
    const result = await changePasswordApi({ oldPassword, newPassword });
    store.showToast(result?.message || "密码已修改，请重新登录");
    localStorage.removeItem("xjg_token");
    localStorage.removeItem("xjg_user");
    router.replace("/login");
    return;
  } catch (error) {
    store.showToast(error.message || "修改密码失败，请检查旧密码");
  }
}

function inviteFromContacts(name) {
  store.inviteMember(name);
  contactsDialogOpen.value = false;
  membersDialogOpen.value = true;
}

async function deleteTag(name) {
  const usedCount = store.allProjects.filter((project) => (project.tags || []).includes(name)).length;
  const message = usedCount
    ? `标签「${name}」已绑定 ${usedCount} 个项目，删除后会同步从这些项目移除，确认删除吗？`
    : `确认删除标签「${name}」吗？`;
  if (await askConfirm({ title: "删除标签", message, confirmButtonText: "删除" })) store.deleteTag(name);
}

async function clearArchive() {
  if (!store.activeProject) return;
  const count = (store.activeProject.tasks || []).filter((task) => task.archived).length;
  if (!count) {
    store.showToast("当前项目没有已归档任务");
    return;
  }
  if (await askConfirm({ title: "清理归档", message: "确认清理当前项目中的已归档任务吗？", confirmButtonText: "清理" })) {
    store.clearArchive();
  }
}
function pickBackground() {
  backgroundInput.value?.click();
}

function openMembersFromSettings() {
  settingsDialogOpen.value = false;
  openMembersDialog();
}

function openMembersDialog() {
  if (!store.activeProject) {
    store.showToast("请先选择项目，再编辑项目权限");
    return;
  }
  membersDialogOpen.value = true;
}

function readBackground(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    store.showToast("首页背景只支持 JPG/PNG");
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    store.showToast("首页背景不能超过 2MB");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => store.updateCurrentUserAsset("homeBackgroundImage", reader.result, "个人首页背景");
  reader.readAsDataURL(file);
}
</script>

<template>
  <main class="app-frame" :class="frameClass">
    <RailNav
      @open-help="helpDialogOpen = true"
      @open-settings="settingsDialogOpen = true"
      @open-profile="openProfile(store.currentUser?.id, false)"
      @open-admin="openManagementConsole"
      @open-contacts="openContactsDialog()"
      @open-members="openMembersDialog"
      @change-password="changePassword"
      @logout="logout"
      @pick-background="pickBackground"
      @clear-background="store.clearCurrentUserAsset('homeBackgroundImage', '个人首页背景')"
    />
    <input ref="backgroundInput" class="home-bg-input" type="file" accept="image/png,image/jpeg" @change="readBackground" />
    <ProjectPanel
      v-if="!isHome && !isResource"
      :layout-mode="projectPanelMode"
      @layout-mode-change="setProjectPanelMode"
      @prompt="promptAction"
      @add-tag="tagDialogOpen = true"
      @delete-tag="deleteTag"
    />

    <section class="workbench">
      <WorkbenchHeader
        v-if="!isHome"
        @delete-project="deleteProject"
        @archive-project="archiveProject"
        @open-board="store.openActiveProjectBoard"
        @open-profile="openProfile"
        @open-admin="openManagementConsole"
        @logout="logout"
        @change-password="changePassword"
        @open-schedule="store.jumpToSchedule(store.activeProjectId)"
        @open-contacts="openContactsDialog()"
        @open-launcher="launcherDialogOpen = true"
        @open-members="openMembersDialog"
        @invite-member="inviteMember"
      />
      <div v-if="!isHome" class="work-meta">
        <div class="work-meta-main">
          <span class="work-meta-owner">{{ projectOwnerText }}</span>
          <span class="work-meta-period">项目时间：{{ projectPeriodText }}</span>
        </div>
        <ProjectMetaTags />
        <span class="work-meta-count">{{ store.activeTasks.length }} 项待完成 · {{ store.archivedTasks.length }} 项已完成</span>
      </div>
      <Transition name="workspace-view" mode="out-in" appear>
        <HomeDashboard
          v-if="store.activeSection === 'home'"
          :key="viewTransitionKey"
          @open-profile="openProfile"
          @open-admin="openManagementConsole"
          @logout="logout"
          @change-password="changePassword"
          @open-launcher="launcherDialogOpen = true"
        />
        <FlowBoard v-else-if="store.activeSection === 'flow'" :key="viewTransitionKey" @clear-archive="clearArchive" @create-task="openTaskDialog('流程')" />
        <ScheduleView
          v-else-if="store.activeSection === 'schedule'"
          :key="viewTransitionKey"
          @create-schedule-task="openTaskDialog('排期')"
          @open-members="openMembersDialog"
          @open-launcher="launcherDialogOpen = true"
          @open-profile="openProfile"
          @open-admin="openManagementConsole"
          @logout="logout"
          @change-password="changePassword"
        />
        <BoardCenter v-else-if="store.activeSection === 'boards'" :key="viewTransitionKey" />
        <ResourceView v-else-if="store.activeSection === 'resource'" :key="viewTransitionKey" />
        <section v-else :key="viewTransitionKey" class="optimize-placeholder" aria-label="项目优化入口">
          <div class="optimize-empty-card">
            <span>优化入口</span>
            <h2>项目优化入口</h2>
            <p>可先返回项目流程页查看任务、评论和排期信息，优化清单接入后会在这里集中管理。</p>
            <button type="button" @click="store.setSection('flow')">返回项目流程页</button>
          </div>
        </section>
      </Transition>
    </section>

    <ProjectDialog v-model="projectDialogOpen" :project-id="editingProjectId" />
    <TaskDialog v-model="taskDialogOpen" :default-type="taskDefaultType" />
    <TagDialog v-model="tagDialogOpen" />
    <ArchiveDialog />
    <ProfileDialog v-model="profileDialogOpen" :user-id="profileUserId" :readonly="profileReadonly" @logout="logout" @change-password="changePassword" />
    <ContactsDialog v-model="contactsDialogOpen" :source="contactsDialogSource" @view-profile="openContactProfile" @invite-user="inviteFromContacts" />
    <AppLauncherDialog v-model="launcherDialogOpen" @open-contacts="openContactsDialog('launcher')" @open-profile="openProfile(store.currentUser?.id, false)" />
    <MemberPermissionsDialog v-model="membersDialogOpen" />
    <TemplateShareDialog
      v-model="templateShareDialogOpen"
      :template-name="sharingTemplateName"
      :template-kind="sharingTemplateKind"
    />
    <AdminDialog v-model="adminDialogOpen" @view-profile="openProfile($event, false)" />
    <Teleport to="body">
      <CollabBoardOverlay v-if="store.boardOpen" />
    </Teleport>
    <el-dialog v-model="helpDialogOpen" class="help-settings-dialog" width="620px" :show-close="false">
      <section class="help-settings-card">
        <button class="dialog-x" type="button" @click="helpDialogOpen = false">×</button>
        <span>帮助中心</span>
        <h3>帮助文档</h3>
        <p>这里先放一份前端说明，后续可接入正式知识库。</p>
        <div class="help-doc-list">
          <article>
            <strong>项目清单</strong>
            <p>左侧选择项目，右侧会显示流程、排期和优化任务。任务卡片可展开查看评论。</p>
          </article>
          <article>
            <strong>协同评论</strong>
            <p>只读、编辑、管理权限都可以评论；编辑和管理权限可以调整任务。</p>
          </article>
          <article>
            <strong>个人资料</strong>
            <p>头像、人物图、签名图和首页背景都可由用户自行上传，仅当前登录用户可见。</p>
          </article>
        </div>
      </section>
    </el-dialog>
    <el-dialog v-model="settingsDialogOpen" class="help-settings-dialog" width="660px" :show-close="false">
      <section class="help-settings-card">
        <button class="dialog-x" type="button" @click="settingsDialogOpen = false">×</button>
        <span>系统设置</span>
        <h3>设置</h3>
        <div class="settings-grid">
          <button type="button" @click="openProfile(store.currentUser?.id, false); settingsDialogOpen = false">编辑个人资料</button>
          <button type="button" @click="changePassword">修改密码</button>
          <button type="button" @click="openContactsDialog(); settingsDialogOpen = false">通讯录用户池</button>
          <button type="button" @click="pickBackground(); settingsDialogOpen = false">上传首页背景</button>
          <button v-if="store.currentUser?.homeBackgroundImage" type="button" @click="store.clearCurrentUserAsset('homeBackgroundImage', '个人首页背景'); settingsDialogOpen = false">恢复默认背景</button>
          <button v-if="store.isManagementUser" type="button" @click="openManagementConsoleFromSettings">后台数据管理</button>
          <button v-if="store.isAdmin" type="button" @click="openMembersFromSettings">项目权限设置</button>
          <button type="button" @click="logout">退出登录</button>
        </div>
      </section>
    </el-dialog>
    <AppToast />
    <CelebrationOverlay />
    <div class="media-hidden-slot" aria-hidden="true">
      <VideoPlayer />
    </div>
  </main>
</template>

