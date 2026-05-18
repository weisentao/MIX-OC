<script setup>
import { computed, ref } from "vue";
import { CircleCheck, Delete, EditPen, FolderOpened, Plus, Refresh, Search, Upload } from "@element-plus/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { askText } from "@/utils/appDialog";
import { idsEqual } from "@/stores/workspace/helpers";

const props = defineProps({
  modelValue: Boolean
});

const emit = defineEmits(["update:modelValue", "view-profile"]);
const store = useWorkspaceStore();
const archivedView = ref(false);
const activeSide = ref("comments");
const commentSearch = ref("");
const userSearch = ref("");
const noticeEditorOpen = ref(false);
const noticeIndex = ref(0);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const allProjects = computed(() => store.allProjects);
const allTasks = computed(() => allProjects.value.flatMap((project) => project.tasks || []));
const allComments = computed(() => store.adminCommentEntries);
const commentInsights = computed(() => store.adminCommentInsights);
const activeNotices = computed(() => store.carouselNotices.filter((item) => item.enabled !== false));
const currentNotice = computed(() => activeNotices.value[noticeIndex.value % Math.max(activeNotices.value.length, 1)] || store.carouselNotices[0] || null);

const taskStats = computed(() => [
  { label: "待完成", value: store.adminStats.activeTasks, hint: "待处理任务" },
  { label: "已完成", value: store.adminStats.doneTasks, hint: "已归档任务" }
]);

const projectStats = computed(() => [
  { label: "在做项目", value: store.adminStats.activeProjects, hint: "进行中项目" },
  { label: "危险项目", value: store.adminStats.dangerProjects, hint: "风险项目" },
  { label: "归档项目", value: store.adminStats.archivedProjects, hint: "已归档项目" },
  { label: "惩罚项目", value: store.adminStats.penaltyProjects, hint: "惩罚项目" }
]);

const assetStats = computed(() => [
  { label: "所有评论", value: store.adminStats.comments, unit: "条" },
  { label: "视频", value: store.adminStats.videos, unit: "个", size: store.adminStats.videoSize },
  { label: "图片", value: store.adminStats.images, unit: "张", size: store.adminStats.imageSize }
]);

const backendSourceLabel = computed(() => {
  if (store.backendSource === "workspace") return "工作台初始化数据";
  if (store.backendSource === "appState") return "本地状态兜底";
  return "未连接";
});

const backendStatusLabel = computed(() => {
  if (store.backendSource === "workspace") return "数据库接口";
  if (store.backendSource === "appState") return "异常兜底";
  return "待连接";
});

const syncRows = computed(() => [
  { key: "projects", name: "项目", count: allProjects.value.length, status: backendStatusLabel.value, time: backendSourceLabel.value },
  { key: "tasks", name: "任务", count: allTasks.value.length, status: backendStatusLabel.value, time: backendSourceLabel.value },
  { key: "comments", name: "评论", count: allComments.value.length, status: backendStatusLabel.value, time: backendSourceLabel.value },
  { key: "users", name: "用户", count: (store.users || []).length, status: backendStatusLabel.value, time: backendSourceLabel.value }
]);

const auditRows = computed(() => []);

const quickActions = [
  { label: "评论审查", text: "筛选最近返工和风险评论" },
  { label: "素材上传", text: "进入视频、图片上传队列" },
  { label: "权限复核", text: "检查新入职用户权限" },
  { label: "归档清理", text: "整理冻结项目和离职用户" }
];

const commentResults = computed(() => {
  const key = commentSearch.value.trim().toLowerCase();
  return allComments.value
    .filter((comment) => {
      if (!key) return true;
      return [
        comment.text,
        comment.user,
        comment.dept,
        comment.time,
        comment.projectName,
        comment.taskTitle,
        comment.taskType,
        comment.moduleLabel,
        ...(comment.matchedRiskWords || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(key);
    })
    .slice(0, 8);
});
const riskCommentRows = computed(() => commentInsights.value.riskComments);
const commentInsightCards = computed(() => [
  { label: "评论总数", value: commentInsights.value.totalComments, hint: "全部评论" },
  { label: "风险评论数量", value: commentInsights.value.riskCommentCount, hint: "风险评论" },
  {
    label: "评论最多的用户",
    value: `${commentInsights.value.topCommentUser.name} (${commentInsights.value.topCommentUser.count})`,
    hint: "高频评论用户"
  },
  {
    label: "评论最多的任务",
    value: `${commentInsights.value.topCommentTask.taskTitle} (${commentInsights.value.topCommentTask.count})`,
    hint: commentInsights.value.topCommentTask.projectName || "高频评论任务"
  }
]);

const sortedUsers = computed(() => {
  return [...store.users]
    .filter((user) => user.role !== "admin")
    .sort((a, b) => {
      return String(a.department || "").localeCompare(String(b.department || ""), "zh-Hans") ||
        String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans") ||
        String(b.registeredAt || "").localeCompare(String(a.registeredAt || ""));
    });
});

const displayedUsers = computed(() => {
  const key = userSearch.value.trim().toLowerCase();
  return sortedUsers.value.filter((user) => {
    const statusOk = archivedView.value ? user.status === "archived" : user.status !== "archived";
    if (!statusOk) return false;
    if (!key) return true;
    return [user.name, user.department, user.departmentEn, user.email, user.mbti, user.job, user.phone]
      .join(" ")
      .toLowerCase()
      .includes(key);
  });
});

function openCommentResult(comment) {
  store.activeSection = "flow";
  store.selectSearchResult({ projectId: comment.projectId, taskId: comment.taskId });
  store.recentTaskId = comment.taskId;
  store.showToast(`已定位评论：${comment.taskTitle}`);
}

function jumpToRiskComment(row) {
  const project = store.allProjects.find((item) => idsEqual(item.id, row.projectId));
  const task = project?.tasks?.find((item) => Number(item.id) === Number(row.taskId));
  if (!project || !task) {
    store.showToast("未找到对应项目或任务，无法跳转");
    return;
  }
  store.activeProjectId = project.id;
  store.activeSection = "flow";
  store.activeView = "project";
  task.expanded = true;
  store.recentTaskId = Number(task.id);
  store.showToast(`已定位风险评论：${task.title}`);
}

async function editUser(user, field, label) {
  const next = await askText({ title: `编辑${label}`, message: `请输入${label}`, inputValue: user[field] || "" });
  if (next !== null) store.updateUserField(user.id, field, next);
}

async function editNotice(notice) {
  const next = await askText({ title: "编辑轮播内容", message: "请输入轮播内容", inputValue: notice.text });
  if (next !== null) store.updateNotice(notice.id, next);
}

async function addNotice() {
  const text = await askText({ title: "新增轮播提醒", message: "请输入新的重要事件提醒", inputValue: "新的重要事件提醒" });
  store.addNotice(text);
}

function editCurrentNotice() {
  if (!currentNotice.value) {
    store.showToast("当前没有轮播图内容");
    return;
  }
  editNotice(currentNotice.value);
}

function deleteCurrentNotice() {
  if (!currentNotice.value) {
    store.showToast("当前没有可删除的轮播图");
    return;
  }
  store.deleteNotice(currentNotice.value.id);
}

function moveNotice(delta) {
  if (!activeNotices.value.length) return;
  noticeIndex.value = (noticeIndex.value + delta + activeNotices.value.length) % activeNotices.value.length;
}

function userAvatarFace(user) {
  const faces = ["blue-mask", "blue-cat", "yellow-face", "pink-face", "brown-face"];
  const code = String(user.id || user.name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return faces[code % faces.length];
}
</script>

<template>
  <el-dialog v-model="visible" class="admin-data-shell" width="min(1160px, calc(100vw - 96px))" :show-close="false">
    <section class="admin-data-page" aria-label="后台数据管理">
      <aside class="admin-data-side">
        <button class="admin-side-head" type="button" @click="activeSide = 'comments'">
          <strong>评论统计</strong>
          <Search aria-hidden="true" />
        </button>
        <label class="admin-comment-search">
          <Search aria-hidden="true" />
          <input v-model="commentSearch" type="search" placeholder="搜索评论、任务、人员" />
        </label>
        <span class="admin-side-caption">搜索结果 · {{ commentResults.length }} 条</span>
        <div class="admin-comment-results">
          <button v-for="comment in commentResults" :key="`${comment.projectId}-${comment.taskId}-${comment.time}-${comment.user}`" type="button" @click="openCommentResult(comment)">
            <strong>{{ comment.taskTitle }}</strong>
            <span>{{ comment.user }} · {{ comment.dept }}</span>
            <small>{{ comment.text }}</small>
          </button>
          <div v-if="!commentResults.length" class="admin-comment-empty">没有搜索到评论</div>
        </div>
        <div class="admin-side-divider"></div>
        <div class="admin-quick-actions">
          <button v-for="item in quickActions" :key="item.label" type="button" @click="store.showToast(item.text)">
            <FolderOpened aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </div>
        <div class="admin-asset-list">
          <article v-for="item in assetStats" :key="item.label">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}<small>{{ item.unit }}</small></strong>
            <em v-if="item.size">大小 {{ item.size }}</em>
          </article>
        </div>
        <div class="admin-side-tabs">
          <button :class="{ active: activeSide === 'comments' }" type="button" @click="activeSide = 'comments'">评论</button>
          <button :class="{ active: activeSide === 'assets' }" type="button" @click="activeSide = 'assets'">素材</button>
          <button :class="{ active: activeSide === 'users' }" type="button" @click="activeSide = 'users'">用户</button>
        </div>
      </aside>

      <main class="admin-data-main">
        <section class="admin-notice-board">
          <div class="admin-notice-carousel">
            <span>公告管理</span>
            <button class="admin-notice-slide" type="button" @click="moveNotice(1)">
              <strong>{{ currentNotice?.title || "轮播提醒" }}</strong>
              <h2>{{ currentNotice?.text || "当前没有轮播内容" }}</h2>
              <small>{{ currentNotice?.type || "公告" }} · {{ currentNotice?.interval || 5500 }} 毫秒</small>
            </button>
            <p>{{ currentNotice?.text || "当前没有轮播内容" }}</p>
          </div>
          <div class="admin-notice-actions">
            <button type="button" @click="addNotice"><Upload aria-hidden="true" />上传</button>
            <button type="button" @click="noticeEditorOpen = true"><EditPen aria-hidden="true" />编辑</button>
          </div>
        </section>

        <section class="admin-data-tile">
          <div class="admin-tile-head">
            <span>同步状态</span>
            <strong>后端同步</strong>
          </div>
          <div class="admin-sync-table">
            <div v-for="row in syncRows" :key="row.key" class="admin-sync-row">
              <span>{{ row.name }}</span>
              <strong>{{ row.count }}</strong>
              <em :class="{ warn: row.status !== '数据库接口' }">{{ row.status }}</em>
              <small>{{ row.time }}</small>
            </div>
          </div>
        </section>

        <section class="admin-data-tile admin-task-summary">
          <div class="admin-tile-head">
            <span>任务统计</span>
            <strong>任务指标</strong>
          </div>
          <div class="admin-metric-row">
            <article v-for="item in taskStats" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.hint }}</small>
            </article>
          </div>
        </section>

        <section class="admin-data-tile admin-project-summary">
          <div class="admin-tile-head">
            <span>项目统计</span>
            <strong>项目指标</strong>
          </div>
          <div class="admin-metric-row project">
            <article v-for="item in projectStats" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.hint }}</small>
            </article>
          </div>
        </section>

        <section class="admin-data-tile admin-audit-panel">
          <div class="admin-tile-head">
            <span>操作审计</span>
            <strong>审计日志</strong>
          </div>
          <div class="admin-audit-list">
            <article v-for="row in auditRows" :key="`${row.action}-${row.target}`">
              <span>{{ row.type }}</span>
              <strong>{{ row.action }}</strong>
              <em>{{ row.operator }}</em>
              <small>{{ row.target }}</small>
              <time>{{ row.time }}</time>
            </article>
            <article v-if="!auditRows.length">
              <span>系统</span>
              <strong>审计待接入</strong>
              <em>{{ store.currentUser?.username || store.currentUser?.name || "系统" }}</em>
              <small>正式审计接口待接入，当前不展示模拟审计数据</small>
              <time>--</time>
            </article>
          </div>
        </section>

        <section class="admin-data-tile admin-comment-insight-panel">
          <div class="admin-tile-head">
            <span>评论识别</span>
            <strong>评论洞察</strong>
          </div>
          <div class="admin-comment-insight-cards">
            <article v-for="item in commentInsightCards" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.hint }}</small>
            </article>
          </div>
          <div class="admin-risk-words">
            <span>风险词</span>
            <em v-for="word in commentInsights.riskWords" :key="word">{{ word }}</em>
          </div>
          <div class="admin-risk-comment-list">
            <button v-for="row in riskCommentRows" :key="row.id" type="button" class="admin-risk-comment-row" @click="jumpToRiskComment(row)">
              <strong>{{ row.projectName }} / {{ row.taskTitle }}</strong>
              <span>{{ row.user }} · {{ row.time || "未知时间" }}</span>
              <em>命中的风险词：{{ row.matchedRiskWords.join("、") }}</em>
              <small>{{ row.summary || "（无评论内容）" }}</small>
            </button>
            <div v-if="!riskCommentRows.length" class="admin-risk-empty">暂无风险评论，当前评论内容均未命中风险词。</div>
          </div>
        </section>

        <section class="admin-users-data-panel">
          <div class="admin-users-toolbar">
            <h3>
              <button :class="{ active: !archivedView }" type="button" @click="archivedView = false">用户管理</button>
              <button :class="{ active: archivedView }" type="button" @click="archivedView = true">归档用户</button>
            </h3>
            <div>
              <span>已匹配 {{ displayedUsers.length }} 个用户，字段变更将同步后端用户表</span>
              <label class="admin-user-search">
                <Search aria-hidden="true" />
                <input v-model="userSearch" type="search" placeholder="搜索姓名、部门、邮箱、手机号" />
              </label>
            </div>
          </div>

          <div class="admin-users-table" role="table" aria-label="后台用户数据表">
            <div class="admin-users-row head" role="row">
              <span>头像</span>
              <span>姓名</span>
              <span>部门</span>
              <span>部门英文</span>
              <span>邮箱</span>
              <span>性格类型（MBTI）</span>
              <span>职务</span>
              <span>手机号码</span>
              <span>注册时间</span>
              <span>操作</span>
            </div>

            <div
              v-for="user in displayedUsers"
              :key="user.id"
              class="admin-users-row"
              :class="{ archived: user.status === 'archived' }"
              role="row"
            >
              <span>
                <button class="admin-avatar-pic" :data-face="userAvatarFace(user)" type="button" @click="emit('view-profile', user.id)">
                  <span aria-hidden="true"></span>
                </button>
              </span>
              <span><button type="button" @click="editUser(user, 'name', '姓名')">{{ user.name }}</button></span>
              <span><button type="button" @click="editUser(user, 'department', '部门')">{{ user.department }}</button></span>
              <span><button type="button" @click="editUser(user, 'departmentEn', '部门英文')">{{ user.departmentEn }}</button></span>
              <span><button type="button" @click="editUser(user, 'email', '邮箱')">{{ user.email }}</button></span>
              <span><button type="button" @click="editUser(user, 'mbti', '性格类型（MBTI）')">{{ user.mbti }}</button></span>
              <span><button type="button" @click="editUser(user, 'job', '职务')">{{ user.job }}</button></span>
              <span>{{ user.phone }}</span>
              <span>{{ user.registeredAt }}</span>
              <span>
                <div class="admin-row-actions">
                  <button type="button" title="编辑用户资料" @click="emit('view-profile', user.id)"><EditPen aria-hidden="true" /></button>
                  <button class="danger" type="button" title="删除用户" @click="store.deleteUser(user.id)"><Delete aria-hidden="true" /></button>
                  <button type="button" title="重置用户密码" @click="store.resetUserPassword(user.id)"><Refresh aria-hidden="true" /></button>
                  <button v-if="user.status !== 'archived'" type="button" title="归档冻结用户" @click="store.archiveUser(user.id)"><CircleCheck aria-hidden="true" /></button>
                  <button v-else type="button" title="再次启用用户" @click="store.restoreUser(user.id)"><CircleCheck aria-hidden="true" /></button>
                </div>
              </span>
            </div>
            <div v-if="!displayedUsers.length" class="admin-users-row empty">
              <span>{{ userSearch.trim() ? "没有匹配用户" : archivedView ? "暂无归档用户" : "暂无在职用户" }}</span>
            </div>
          </div>

          <div class="admin-data-notes">
            <p><EditPen aria-hidden="true" />编辑姓名、部门、部门英文、邮箱、性格类型（MBTI）、职务，保存后进入用户资料同步队列。</p>
            <p><Refresh aria-hidden="true" />密码重置会调用后端管理接口；接口不可用时会给出操作提示。</p>
            <p><Delete aria-hidden="true" />删除用户不可恢复；归档用户保留好友、评论、项目引用关系。</p>
          </div>
        </section>
      </main>

      <button class="admin-data-floating-close" type="button" aria-label="关闭后台" @click="visible = false">×</button>

      <div v-if="noticeEditorOpen" class="notice-editor-mask" @click.self="noticeEditorOpen = false">
        <section class="notice-editor-card" aria-label="轮播编辑">
          <div class="notice-editor-head">
            <strong>轮播内容管理</strong>
            <button type="button" @click="noticeEditorOpen = false">×</button>
          </div>
          <article v-for="notice in store.carouselNotices" :key="notice.id" class="notice-editor-row">
            <input :value="notice.title" @change="store.updateNoticeField(notice.id, 'title', $event.target.value)" />
            <textarea :value="notice.text" @change="store.updateNoticeField(notice.id, 'text', $event.target.value)"></textarea>
            <label>
              <span>间隔（毫秒）</span>
              <input type="number" min="1000" step="500" :value="notice.interval || 5500" @change="store.updateNoticeField(notice.id, 'interval', $event.target.value)" />
            </label>
            <button class="danger" type="button" @click="store.deleteNotice(notice.id)"><Delete aria-hidden="true" />删除</button>
          </article>
          <button class="notice-editor-add" type="button" @click="addNotice"><Plus aria-hidden="true" />新增轮播</button>
        </section>
      </div>
    </section>
  </el-dialog>
</template>
