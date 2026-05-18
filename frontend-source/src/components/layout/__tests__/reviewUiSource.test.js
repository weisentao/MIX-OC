import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

async function sourceTree(rootPath, options = {}) {
  const root = new URL(rootPath, import.meta.url);
  const ignoredSegments = new Set(options.ignoredSegments || []);
  const allowedExtensions = new Set(options.allowedExtensions || [".js", ".vue"]);
  const files = [];

  async function walk(dirUrl) {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredSegments.has(entry.name)) continue;

      const childUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
      if (entry.isDirectory()) {
        await walk(childUrl);
        continue;
      }

      if ([...allowedExtensions].some((extension) => entry.name.endsWith(extension))) {
        files.push({ path: childUrl.pathname, text: await readFile(childUrl, "utf8") });
      }
    }
  }

  await walk(root);
  return files;
}

async function fileExists(path) {
  try {
    const stats = await stat(new URL(path, import.meta.url));
    return stats.isFile();
  } catch {
    return false;
  }
}

async function assertSourceFileExists(relativePath) {
  assert.ok(await fileExists(relativePath), `missing source file: ${relativePath}`);
}

async function firstExistingSource(paths) {
  for (const path of paths) {
    if (await fileExists(path)) {
      return { path, text: await source(path) };
    }
  }
  assert.fail(`missing one of: ${paths.join(", ")}`);
}

describe("diff review UI source contracts", () => {
  it("keeps focused visible mojibake out of bootstrap, template and resource sources", async () => {
    const files = [
      ["frontend seed", "../../../data/seed.js"],
      ["workspace normalizer", "../../../stores/workspace/actions/appActions.js"],
      ["template actions", "../../../stores/workspace/actions/templateActions.js"],
      ["resource view", "../../../features/resource/components/ResourceView.vue"],
      ["home dashboard", "../../../views/HomeDashboard.vue"],
      ["workbench header", "../WorkbenchHeader.vue"],
      ["mock db", "../../../../mock/db.json"],
      ["backend template service", "../../../../../backend-source/src/services/template.service.js"]
    ];
    const forbidden = [
      [0x699b, 0x6a18, 0x8a75, 0x93ba, 0x6393, 0x6e6f, 0x59af, 0x6fa8],
      [0x699b, 0x6a18, 0x8a75, 0x6d60, 0x8bef, 0x59ec, 0x52a1, 0x59af, 0x6fa8],
      [0x74d2, 0x5470, 0x9a87, 0x7ba0, 0xff27, 0x60ca],
      [0x93b4, 0x610d, 0x61b3],
      [0x6d93, 0x5db6, 0x7f13, 0x7481, 0x8669, 0x6237, 0x7f01, 0x5c7e, 0x62f7, 0x934a, 0x72b1, 0x6362, 0x936b],
      [0x5a23, 0x8bf2, 0x59de, 0x9357, 0x5fd3, 0x6093, 0x93b4, 0x612c, 0x61b3],
      [0x93cc, 0x30e7, 0x6e45, 0x9357, 0x5fd3, 0x6093, 0x93b4, 0x612c, 0x61b3],
      [0x6d93, 0x5db6, 0x7f13, 0x7481]
    ].map((codePoints) => String.fromCodePoint(...codePoints));

    const matches = [];
    for (const [label, path] of files) {
      const text = await source(path);
      forbidden.forEach((pattern) => {
        if (text.includes(pattern)) matches.push(`${label}: ${pattern}`);
      });
    }

    assert.deepEqual(matches, []);
  });

  it("opens backend management as a routed full-page console instead of an in-place dialog", async () => {
    const main = await source("../../../main.js");
    const router = await source("../../../router/index.js");
    const adminConsoleView = await source("../../../views/AdminConsoleView.vue");
    const managerConsoleView = await source("../../../views/ManagerConsoleView.vue");
    const adminApi = await source("../../../services/adminApi.js");
    const managerApi = await source("../../../services/managerApi.js");
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const workbenchHeader = await source("../WorkbenchHeader.vue");
    const railNav = await source("../RailNav.vue");
    const getters = await source("../../../stores/workspace/getters.js");
    const adminDialog = await source("../../dialogs/AdminDialog.vue");

    assert.match(main, /import\s+["']\.\/styles\/admin-console\.css["'];?/);
    assert.match(router, /path:\s*["']\/admin/);
    assert.match(router, /path:\s*["']\/manager/);
    assert.match(router, /AdminConsoleView/);
    assert.match(router, /ManagerConsoleView/);
    assert.match(adminConsoleView, /@\/features\/management-console\/data\/adminConsoleData/);
    assert.match(managerConsoleView, /@\/features\/management-console\/data\/managerConsoleData/);
    assert.match(adminApi, /\/admin\/dashboard/);
    assert.match(managerApi, /\/manager\/overview/);
    assert.match(workspaceView, /function\s+openManagementConsole\(/);
    assert.match(getters, /isManagementUser\(\)/);
    assert.match(workbenchHeader, /store\.isManagementUser/);
    assert.match(railNav, /store\.isManagementUser/);
    assert.match(workspaceView, /function\s+managementConsoleRoute\(/);
    assert.match(workspaceView, /router\.push\(managementConsoleRoute\(\)\)/);
    assert.doesNotMatch(workspaceView, /window\.open\(/);
    assert.match(workspaceView, /import AdminDialog from "@\/components\/dialogs\/AdminDialog\.vue"/);
    assert.match(workspaceView, /const adminDialogOpen = ref\(false\)/);
    assert.match(workspaceView, /<AdminDialog v-model="adminDialogOpen"/);
    assert.match(adminDialog, /defineProps/);
    assert.match(adminDialog, /defineEmits/);
    assert.doesNotMatch(workspaceView, /@open-admin="[^"]*adminDialogOpen\s*=\s*true[^"]*"/);
    assert.doesNotMatch(workspaceView, /@click="[^"]*adminDialogOpen\s*=\s*true[^"]*后台数据管理/s);
    assert.match(workspaceView, /function\s+openManagementConsoleFromSettings\(/);
    assert.match(workspaceView, /settingsDialogOpen\.value = false;[\s\S]{0,120}openManagementConsole\(\)/);
    assert.match(workspaceView, /@click="openManagementConsoleFromSettings"/);
    assert.match(workbenchHeader, /@click="adminAction\('open-admin'\)"/);
    assert.match(railNav, /runSetting\('open-admin'\)/);
  });

  it("renders the routed management console as a reference-matched CRUD workspace", async () => {
    const consoleShell = await source("../../../features/management-console/components/ConsoleShell.vue");
    const consoleSection = await source("../../../features/management-console/components/ConsoleSection.vue");
    const adminConsoleView = await source("../../../views/AdminConsoleView.vue");
    const managerConsoleView = await source("../../../views/ManagerConsoleView.vue");
    const adminApi = await source("../../../services/adminApi.js");
    const managerApi = await source("../../../services/managerApi.js");
    const css = await source("../../../styles/management-console.css");

    assert.match(consoleShell, /class="console-admin-frame"/);
    assert.match(consoleShell, /class="console-side-card"/);
    assert.match(consoleShell, /class="console-top-filter"/);
    assert.doesNotMatch(consoleShell, /statusChips|console-status-chips/);
    assert.match(consoleSection, /class="console-metric-strip"/);
    assert.match(consoleSection, /class="console-context-panel"/);
    assert.match(consoleSection, /class="console-dense-table"/);
    assert.match(consoleSection, /class="console-detail-drawer"/);
    assert.match(consoleSection, /class="console-crud-modal"/);
    assert.match(consoleSection, /console-dashboard-overview/);
    assert.match(consoleSection, /console-bar-chart/);
    assert.match(consoleSection, /console-line-chart/);
    assert.match(consoleSection, /"chart-navigate"/);
    assert.match(consoleSection, /emit\("chart-navigate",\s*\{\s*source,\s*target:\s*item\.targetSection,\s*item\s*\}\)/);
    assert.match(consoleSection, /class="console-chart-item"/);
    assert.match(consoleSection, /type="button"[\s\S]*class="console-chart-item"/);
    assert.match(consoleSection, /:aria-label="chartAriaLabel\(item,\s*'bar'\)"/);
    assert.match(consoleSection, /@keydown\.enter\.prevent="handleChartNavigate\(point,\s*'line'\)"/);
    assert.match(consoleSection, /@keydown\.space\.prevent="handleChartNavigate\(point,\s*'line'\)"/);
    assert.match(consoleSection, /displayMap/);
    assert.match(consoleSection, /管理表单/);
    assert.doesNotMatch(consoleSection, /CRUD \/ API READY/);
    assert.match(consoleSection, /emit\((?:"|')row-action/);
    assert.match(adminConsoleView, /function\s+handleCrudSubmit\(/);
    assert.match(adminConsoleView, /sectionLayout/);
    assert.match(adminConsoleView, /layout="sectionLayout"/);
    assert.match(adminConsoleView, /后台总览/);
    assert.match(adminConsoleView, /targetSection:\s*"schedules"/);
    assert.match(adminConsoleView, /targetSection:\s*"system"/);
    assert.match(adminConsoleView, /@chart-navigate="navigateDashboardChart"/);
    assert.doesNotMatch(adminConsoleView, /:status-chips|statusChips\s*=/);
    assert.doesNotMatch(adminConsoleView, /后台总览 Dashboard/);
    assert.match(adminConsoleView, /adminApi\.(?:create|update|delete|archive)/);
    assert.match(managerConsoleView, /function\s+handleCrudSubmit\(/);
    assert.match(managerConsoleView, /sectionLayout/);
    assert.match(managerConsoleView, /项目管理员权限等同管理该项目/);
    assert.match(managerConsoleView, /buildManagerDashboardChartItems/);
    assert.match(managerConsoleView, /targetSection:\s*"tasks"/);
    assert.match(managerConsoleView, /@chart-navigate="navigateDashboardChart"/);
    assert.doesNotMatch(managerConsoleView, /:status-chips|statusChips\s*=/);
    assert.match(managerConsoleView, /managerApi\.(?:create|update|delete|archive)/);
    assert.match(adminApi, /createUser/);
    assert.match(adminApi, /createProject/);
    assert.match(adminApi, /deleteProject/);
    assert.match(adminApi, /createNotice/);
    assert.match(managerApi, /createProject/);
    assert.match(managerApi, /archiveProject/);
    assert.match(managerApi, /deleteTask/);
    assert.match(css, /--mc-page-bg:\s*#fbfbfd/);
    assert.match(css, /--mc-workspace-bg:\s*#fffdf8/);
    assert.match(css, /--mc-side-bg:\s*#ffffff/);
    assert.match(css, /--mc-primary:\s*#ff0050/i);
    assert.match(css, /--mc-primary-soft:\s*#fff0f6/i);
    assert.match(css, /--mc-primary-line:\s*#f1bed4/i);
    assert.doesNotMatch(css, /--mc-primary:\s*#2f80ed/i);
    const homeBlockColors = ["#ff0050", "#baf3c7", "#ffe88a", "#ffd797", "#a7daf5"];
    homeBlockColors.forEach((color) => assert.match(css, new RegExp(color, "i")));
    assert.match(css, /--mc-home-pink:\s*#ff0050/i);
    assert.match(css, /--mc-home-green:\s*#baf3c7/i);
    assert.match(css, /--mc-home-yellow:\s*#ffe88a/i);
    assert.match(css, /--mc-home-orange:\s*#ffd797/i);
    assert.match(css, /--mc-home-blue:\s*#a7daf5/i);
    [
      /(?:var\(--mc-home-pink\)|#ff0050)/i,
      /(?:var\(--mc-home-green\)|#baf3c7)/i,
      /(?:var\(--mc-home-yellow\)|#ffe88a)/i,
      /(?:var\(--mc-home-orange\)|#ffd797)/i,
      /(?:var\(--mc-home-blue\)|#a7daf5)/i
    ].forEach((colorToken) => {
      assert.match(css, new RegExp(`\\.console-topbar::after[\\s\\S]*linear-gradient\\([\\s\\S]*${colorToken.source}`, "i"));
    });
    assert.match(css, /\.console-metric-strip article::before/);
    assert.match(css, /\.console-metric-strip article:nth-child\(6n\+6\)[\s\S]*--metric-color:\s*var\(--mc-cyan\)/);
    assert.match(css, /\.console-system-card-grid article:nth-child\(4n\+4\)[\s\S]*--system-color:\s*var\(--mc-primary\)/);
    assert.match(css, /\.console-dashboard-chart-panel--line/);
    assert.match(css, /\.console-chart-item:not\(:disabled\):hover/);
    assert.match(css, /@keyframes\s+consoleBarRise/);
    assert.match(css, /@keyframes\s+consoleLineDraw/);
    assert.match(css, /@keyframes\s+consoleDotPop/);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.doesNotMatch(css, /console-status-chips/);
    assert.doesNotMatch(css, /#0f2f2d|#17423d|#12a878|#18b8a6|#c5b79f|#2f62d6|#e85d7e|#0c7c5b|#e7fbf3|#b9efd9|#9a69c7|rgba\(47,\s*128,\s*237/);
    assert.match(css, /\.console-board-layout--dashboard\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    assert.match(css, /\.console-admin-frame\s*\{[^}]*grid-template-columns:\s*204px minmax\(0,\s*1fr\)/s);
    assert.match(css, /\.console-workspace\s*\{[^}]*grid-template-rows:\s*58px minmax\(0,\s*1fr\)/s);
    assert.match(css, /\.console-content\s*\{[^}]*padding:\s*14px/s);
    assert.match(css, /\.console-metric-strip\.is-dashboard\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
    assert.match(css, /\.console-metric-strip article\s*\{[^}]*min-height:\s*66px/s);
    assert.match(css, /\.console-dashboard-chart-panel,\s*\.console-dashboard-panel\s*\{[^}]*min-height:\s*214px/s);
    assert.match(css, /\.console-bar-chart\s*\{[^}]*height:\s*132px/s);
    assert.match(css, /\.console-line-chart svg\s*\{[^}]*height:\s*116px/s);
    assert.match(css, /\.console-board-layout--two-column\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+292px/s);
    assert.match(css, /\.console-board-layout--three-column\s*\{[^}]*grid-template-columns:\s*188px minmax\(0,\s*1fr\) 286px/s);
    assert.match(css, /min-width:\s*max\(100%,\s*760px\)/);
    assert.match(css, /\.console-table-panel\s*\{[^}]*min-height:\s*390px/s);
    assert.match(css, /\.console-table-body-row\s*\{[^}]*min-height:\s*42px/s);
    assert.doesNotMatch(css, /grid-template-rows:\s*(?:7[2-9]|[89]\d|1\d{2})px minmax\(0,\s*1fr\)/);
    assert.doesNotMatch(css, /\.console-content\s*\{[^}]*padding:\s*(?:2[4-9]|[3-9]\d)px/s);
    assert.doesNotMatch(css, /\.console-metric-strip article\s*\{[^}]*min-height:\s*(?:8[6-9]|9\d|1\d{2})px/s);
    assert.doesNotMatch(css, /\.console-dashboard-chart-panel,\s*\.console-dashboard-panel\s*\{[^}]*min-height:\s*(?:2[8-9]\d|[3-9]\d{2})px/s);
    assert.doesNotMatch(css, /\.console-bar-chart\s*\{[^}]*height:\s*(?:18\d|19\d|2\d{2})px/s);
    assert.doesNotMatch(css, /\.console-table-body-row\s*\{[^}]*min-height:\s*(?:5[6-9]|[6-9]\d)px/s);
    assert.match(css, /\.console-context-panel/);
    assert.match(css, /\.console-dense-table/);
    assert.match(css, /\.console-detail-drawer/);
    assert.match(css, /\.console-dashboard-overview/);
    assert.match(css, /\.console-bar-chart/);
    assert.match(css, /\.console-line-chart/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /transform:\s*translateY\(1px\)/);
  });

  it("does not report management console write failures as fake backend success", async () => {
    const adminConsoleView = await source("../../../views/AdminConsoleView.vue");
    const managerConsoleView = await source("../../../views/ManagerConsoleView.vue");

    for (const view of [adminConsoleView, managerConsoleView]) {
      assert.match(view, /backendSyncToast/);
      assert.match(view, /handleWorkspaceAuthFailure/);
      assert.match(view, /throw\s+error/);
      assert.doesNotMatch(view, /已在前端生效，等待后端接口联调/);
    }
  });

  it("uses inline icon buttons for register password visibility", async () => {
    const loginView = await source("../../../views/LoginView.vue");

    assert.match(loginView, /class="password-visibility-toggle"/);
    assert.match(loginView, /<span class="password-eye-icon"/);
    assert.doesNotMatch(loginView, />\{\{\s*showRegisterPassword\s*\?\s*"隐"\s*:\s*"看"\s*\}\}</);
    assert.doesNotMatch(loginView, />\{\{\s*showRegisterConfirmPassword\s*\?\s*"隐"\s*:\s*"看"\s*\}\}</);
  });

  it("keeps project tags in work meta instead of the top project name bar", async () => {
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const workbenchHeader = await source("../WorkbenchHeader.vue");

    assert.match(workspaceView, /<ProjectMetaTags/);
    assert.match(workspaceView, /项目时间/);
    assert.match(workspaceView, /待完成/);
    assert.match(workspaceView, /已完成/);
    assert.doesNotMatch(workspaceView, /\u6900\u7470\u7ddf\u7039\u5c7e\u579a|\u6900\u7470\u51e1\u7039\u5c7e\u579a|\u7487\u5cf0\u5388\u9352\u6db4\u7f13\u6900\u572d\u76f0/);
    assert.doesNotMatch(workbenchHeader, /class="active-tags"/);
  });

  it("lets project meta tags add existing tags from the tag library", async () => {
    const projectMetaTags = await source("../ProjectMetaTags.vue");

    assert.match(projectMetaTags, /class="[^"]*meta-tag-add/);
    assert.match(projectMetaTags, /availableTags\s*=\s*computed/);
    assert.match(projectMetaTags, /store\.tags[\s\S]*activeTags\.value/);
    assert.match(projectMetaTags, /function\s+selectTagFromLibrary\(tag\)/);
    assert.match(projectMetaTags, /store\.bindTagToActiveProject\(tag\.name\)/);
    assert.match(projectMetaTags, /标签库暂无可添加标签/);
  });

  it("removes the carousel eyebrow while keeping the notice vertically centered", async () => {
    const workbenchHeader = await source("../WorkbenchHeader.vue");
    const css = await source("../../../styles/overrides.css");

    assert.doesNotMatch(workbenchHeader, /首页 · 项目可视化/);
    assert.match(css, /\.carousel-copy\s*\{[^}]*display:\s*grid/s);
    assert.match(css, /\.carousel-copy strong\s*\{[^}]*align-self:\s*center/s);
  });

  it("keeps the board entry at project level only", async () => {
    const taskModule = await source("../../tasks/TaskModule.vue");
    const workbenchHeader = await source("../WorkbenchHeader.vue");

    assert.doesNotMatch(taskModule, /module-board-entry/);
    assert.doesNotMatch(taskModule, /openBoardLibrary\(\{\s*scopeType:\s*['"]module['"]/);
    assert.match(workbenchHeader, /project-action-board/);
  });

  it("does not expose a project rename icon in the top project action bar", async () => {
    const workbenchHeader = await source("../WorkbenchHeader.vue");
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const projectTree = await source("../../tree/ProjectTree.vue");

    assert.match(workbenchHeader, /project-action-create/);
    assert.match(workbenchHeader, /project-action-delete/);
    assert.match(workbenchHeader, /project-action-archive/);
    assert.match(workbenchHeader, /project-action-board/);
    assert.doesNotMatch(workbenchHeader, /project-action-(?:rename|edit)/);
    assert.doesNotMatch(workbenchHeader, /"rename-project"/);
    assert.doesNotMatch(workspaceView, /@rename-project=/);
    assert.doesNotMatch(projectTree, />xxx<\/button>/);
    assert.doesNotMatch(projectTree, /预留功能入口/);
  });

  it("keeps edit project dialog focused on editable project details", async () => {
    const projectDialog = await source("../../dialogs/ProjectDialog.vue");
    const css = await source("../../../styles/overrides.css");

    assert.match(projectDialog, /<div v-if="!isEdit" class="create-mode-grid">/);
    assert.match(projectDialog, /<div v-if="!isEdit && form\.mode === 'category'" class="project-form-grid">/);
    assert.match(projectDialog, /<div v-else :class="\['project-form-grid', \{ 'edit-project-grid': isEdit \}\]">/);
    assert.match(projectDialog, /<label v-if="!isEdit && form\.mode === 'child'">/);
    assert.match(projectDialog, /<label v-else-if="!isEdit">/);
    assert.match(projectDialog, /<label v-if="!isEdit">项目负责人（管理）/);
    assert.match(projectDialog, /<label v-if="!isEdit" class="full-field inline-check project-sync-check">/);
    assert.match(projectDialog, /class="modal-close-button"/);
    assert.match(projectDialog, /:aria-label="[^"]*关闭修改项目弹窗[^"]*"/);
    assert.match(projectDialog, /v-if="isEdit"\s+class="edit-project-tags"/);
    assert.match(projectDialog, /class="[^"]*edit-project-tag-add[^"]*"/);
    assert.match(projectDialog, /title="从标签库选择标签"/);
    assert.match(projectDialog, /function\s+selectEditTagFromLibrary\(tag\)/);
    assert.match(projectDialog, /form\.tags = selectedEditTags\.value\.concat\(tag\.name\)\.join\("#"\)/);
    assert.doesNotMatch(projectDialog, /v-if="isEdit"[\s\S]{0,220}<input[\s\S]{0,80}v-model="form\.tags"/);
    assert.doesNotMatch(projectDialog, /v-if="isEdit"[\s\S]{0,220}v-model="form\.owner"/);
    assert.doesNotMatch(projectDialog, /v-if="isEdit"[\s\S]{0,220}v-model="form\.syncSchedule"/);
    assert.match(projectDialog, /:class="\['full-field', \{ 'edit-project-members': isEdit \}\]"/);
    assert.doesNotMatch(projectDialog, /edit-project-hint/);
    assert.doesNotMatch(projectDialog, /保存后会同步到正式工作台数据/);
    assert.match(projectDialog, /class="\['modal-actions', \{ 'edit-project-actions': isEdit \}\]"/);
    assert.match(projectDialog, /const payload = isEdit\.value\s*\?/);
    assert.doesNotMatch(projectDialog, /store\.updateProjectFromForm\(Number\(props\.projectId\), form\)/);
    assert.match(css, /\.project-modal\.is-edit-project \.el-dialog/s);
    assert.match(css, /\.edit-project-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s);
    assert.match(css, /\.edit-project-tags\s*\{/s);
    assert.match(css, /\.edit-project-tag-add\s*\{/s);
    assert.match(css, /\.edit-project-actions\s*\{[^}]*justify-content:\s*flex-end/s);
  });

  it("matches the flow carousel notice bar to the schedule hero header metrics", async () => {
    const css = await source("../../../styles/overrides.css");

    assert.match(css, /\.top-carousel,\s*\.schedule-hero-header\s*\{[^}]*height:\s*55px\s*!important/s);
    assert.match(css, /\.top-carousel,\s*\.schedule-hero-header\s*\{[^}]*background:\s*linear-gradient\(100deg,\s*#fffbe1 0%,\s*#f8fbec 36%,\s*#f1fbf8 70%,\s*#eefbff 100%\)\s*!important/s);
    assert.match(css, /\.carousel-copy strong,\s*\.schedule-hero-copy h1\s*\{[^}]*font-size:\s*18px\s*!important/s);
  });

  it("centers carousel dots under the notice bar and keeps them clickable across workbench headers", async () => {
    const workbenchHeader = await source("../WorkbenchHeader.vue");
    const heroHeader = await source("../../schedule/ScheduleHeroHeader.vue");
    const css = await source("../../../styles/overrides.css");

    for (const header of [workbenchHeader, heroHeader]) {
      assert.match(header, /class="carousel-dots"/);
      assert.match(header, /@click="setNoticeIndex\(index\)"/);
      assert.match(header, /:aria-label="`\$\{index \+ 1\}/);
    }

    assert.match(css, /\.top-carousel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s);
    assert.match(css, /\.carousel-dots\s*\{[^}]*position:\s*absolute\s*!important[^}]*left:\s*50%\s*!important[^}]*bottom:\s*5px\s*!important[^}]*transform:\s*translateX\(-50%\)\s*!important/s);
    assert.match(css, /\.carousel-copy,\s*\.schedule-hero-copy\s*\{[^}]*justify-content:\s*center\s*!important/s);
  });

  it("binds the schedule hero title to backend carousel notices", async () => {
    const heroHeader = await source("../../schedule/ScheduleHeroHeader.vue");

    assert.match(heroHeader, /const currentNoticeIndex = computed/);
    assert.match(heroHeader, /const currentNotice = computed/);
    assert.match(heroHeader, /scheduleNotice\(\)/);
    assert.match(heroHeader, /window\.clearTimeout\(noticeTimer\)/);
    assert.match(heroHeader, /<h1>\s*\{\{\s*currentNotice\?\.text\s*\|\|\s*"暂无轮播提醒"\s*\}\}\s*<\/h1>/);
    assert.doesNotMatch(heroHeader, /王者活动首版需要/);
  });

  it("renders the home dashboard carousel with inline notice link support", async () => {
    const homeDashboard = await source("../../../views/HomeDashboard.vue");
    const workbenchHeader = await source("../WorkbenchHeader.vue");

    assert.match(homeDashboard, /class="(?:home-top-carousel top-carousel|top-carousel home-top-carousel)"/);
    assert.match(homeDashboard, /NoticeInlineContent/);
    assert.match(homeDashboard, /openNoticeLink/);
    assert.match(homeDashboard, /@click="handleNoticeClick"/);
    assert.match(homeDashboard, /class="carousel-dots"/);
    assert.match(workbenchHeader, /NoticeInlineContent/);
    assert.match(workbenchHeader, /<NoticeInlineContent\s+:notice="currentNotice"/);
    assert.match(workbenchHeader, /openNoticeLink/);
    assert.match(workbenchHeader, /@click="handleNoticeClick"/);
    assert.match(workbenchHeader, /fallback="暂无轮播提醒"/);
  });

  it("keeps the schedule body inside the shared workspace chrome", async () => {
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const scheduleView = await source("../../../views/ScheduleView.vue");

    assert.match(workspaceView, /<WorkbenchHeader\s+v-if="!isHome"/);
    assert.match(workspaceView, /<div v-if="!isHome" class="work-meta"/);
    assert.match(scheduleView, /ScheduleToolbar/);
    assert.doesNotMatch(workspaceView, /<ScheduleHeroHeader/);
    assert.doesNotMatch(scheduleView, /<ScheduleHeroHeader/);
  });

  it("keeps the project header and meta row shared while switching into schedule", async () => {
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const scheduleView = await source("../../../views/ScheduleView.vue");

    assert.match(workspaceView, /<WorkbenchHeader\s+v-if="!isHome"/);
    assert.match(workspaceView, /<div v-if="!isHome" class="work-meta"/);
    assert.doesNotMatch(workspaceView, /store\.activeSection !== ['"]schedule['"]/);
    assert.doesNotMatch(workspaceView, /<ScheduleHeroHeader/);
    assert.doesNotMatch(scheduleView, /import ScheduleTopbar/);
    assert.doesNotMatch(scheduleView, /<ScheduleTopbar/);
  });

  it("refreshes schedule data from active project changes instead of relying only on mount", async () => {
    const scheduleView = await source("../../../views/ScheduleView.vue");

    assert.match(scheduleView, /import \{[^}]*watch[^}]*\} from "vue"/);
    assert.match(scheduleView, /store\.activeProjectId/);
    assert.match(scheduleView, /store\.activeSection/);
    assert.match(scheduleView, /function\s+loadActiveProjectSchedule\(options\s*=\s*\{\}\)/);
    assert.match(scheduleView, /store\.loadScheduleForActiveProject\(options\)/);
    assert.match(scheduleView, /loadActiveProjectSchedule\(\{\s*skipIfLoadingProject:\s*true\s*\}\)/);
    assert.match(scheduleView, /watch\(\s*activeScheduleProjectKey,[\s\S]*loadActiveProjectSchedule\(\{\s*skipIfLoadingProject:\s*true\s*\}\)/);
    assert.doesNotMatch(scheduleView, /onMounted\(\(\)\s*=>\s*\{[\s\S]{0,240}store\.loadScheduleForActiveProject\(\);/);
  });

  it("keeps flow and schedule workbench backgrounds visually aligned", async () => {
    const baseCss = await source("../../../styles/base.css");
    const scheduleCenterBlocks = baseCss.match(/\.schedule-center\s*\{[^}]*\}/g) || [];

    assert.match(baseCss, /--workbench-bg:\s*linear-gradient\(180deg,\s*#f8f9fa,\s*#ffffff\);/);
    assert.match(baseCss, /\.workbench\s*\{[^}]*background:\s*var\(--workbench-bg\);/s);
    assert.doesNotMatch(baseCss, /\.workbench\.is-schedule-workbench\s*\{/);
    assert.ok(scheduleCenterBlocks.length >= 1);
    for (const block of scheduleCenterBlocks) {
      if (/background:/.test(block)) assert.match(block, /background:\s*transparent;/);
      assert.doesNotMatch(block, /background:\s*#ffffff/);
    }
  });

  it("adds the schedule-style notice action to the shared workbench header", async () => {
    const workbenchHeader = await source("../WorkbenchHeader.vue");
    const css = await source("../../../styles/overrides.css");

    assert.match(workbenchHeader, /import \{ Bell \} from "@element-plus\/icons-vue"/);
    assert.match(workbenchHeader, /class="work-hero-actions-wrap"/);
    assert.match(workbenchHeader, /class="work-notice-button"/);
    assert.match(workbenchHeader, /toggleMenu\((?:"|'|&quot;)notice(?:"|'|&quot;)\)/);
    assert.match(workbenchHeader, /class="schedule-hero-menu work-hero-menu"/);
    assert.match(css, /\.work-notice-button,\s*\.schedule-hero-actions > button:not\(\.schedule-hero-launcher\)/s);
  });

  it("shows archive, schedule template, and task template as separate left tree groups", async () => {
    const projectTree = await source("../../tree/ProjectTree.vue");
    const templateTree = await source("../../tree/TemplateTree.vue");

    assert.match(projectTree, /项目归档/);
    assert.match(templateTree, /项目排期模板/);
    assert.match(templateTree, /项目任务模板/);
    assert.doesNotMatch(templateTree, /项目流程模版/);
  });

  it("lays archived projects out as a compact name-left time-right row", async () => {
    const projectTree = await source("../../tree/ProjectTree.vue");
    const css = await source("../../../styles/overrides.css");

    assert.match(projectTree, /class="tree-node archive-project-node"/);
    assert.match(projectTree, /class="archive-project-main"/);
    assert.match(projectTree, /class="archive-project-name"/);
    assert.match(projectTree, /class="archive-project-time"/);
    assert.match(css, /\.archive-project-node\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);
    assert.match(css, /\.archive-project-name\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.archive-project-time\s*\{[^}]*justify-self:\s*end[^}]*text-align:\s*right[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.is-archived-project\s+\.tree-node-actions\s*\{[^}]*position:\s*static/s);
  });

  it("closes template tree menus from outside clicks and context menus", async () => {
    const templateTree = await source("../../tree/TemplateTree.vue");

    assert.match(templateTree, /function\s+closeMenu\(\)/);
    assert.match(templateTree, /document\.addEventListener\("click",\s*closeMenu\)/);
    assert.match(templateTree, /document\.addEventListener\("contextmenu",\s*closeMenu\)/);
    assert.match(templateTree, /document\.removeEventListener\("click",\s*closeMenu\)/);
    assert.match(templateTree, /document\.removeEventListener\("contextmenu",\s*closeMenu\)/);
    assert.match(templateTree, /class="tree-action-popover" @click\.stop @contextmenu\.stop/);
  });

  it("only exposes template activation from task template menus", async () => {
    const templateTree = await source("../../tree/TemplateTree.vue");

    assert.match(templateTree, /function\s+templateChildMenuKey\(section,\s*template,\s*childIndex\)/);
    assert.match(templateTree, /`\$\{section\.kind\}-template-\$\{groupIndex\(template\)\}-\$\{childIndex\}`/);
    assert.match(templateTree, /v-if="section\.kind === 'task'"/);
    assert.match(templateTree, /store\.useTemplateToCreateProject\(child\)/);
    assert.match(templateTree, />启用模板</);
    assert.doesNotMatch(templateTree, /用任务模板生成项目/);
  });

  it("keeps production UI copy on 模板 wording instead of 模版", async () => {
    const files = await sourceTree("../../../", { ignoredSegments: ["__tests__"] });
    const matches = files
      .filter((file) => file.text.includes("模版"))
      .map((file) => file.path);

    assert.deepEqual(matches, []);
  });

  it("keeps schedule template tree copy focused on schedule content templates", async () => {
    const templateTree = await source("../../tree/TemplateTree.vue");

    assert.match(templateTree, /title:\s*"项目排期模板"/);
    assert.match(templateTree, /emptyTitle:\s*"暂无排期内容模板"/);
    assert.match(templateTree, /emptyTitle:\s*"暂无项目任务模板"/);
    assert.match(templateTree, />启用模板</);
    assert.match(templateTree, />共享模板</);
    assert.match(templateTree, />置顶模板</);
    assert.match(templateTree, />重命名模板</);
    assert.match(templateTree, />删除模板</);
    assert.doesNotMatch(templateTree, /\?{3,}/);
    assert.doesNotMatch(templateTree, /用排期模板生成项目/);
  });

  it("opens schedule templates through schedule template state instead of task template editing", async () => {
    const templateActions = await source("../../../stores/workspace/actions/templateActions.js");

    assert.match(templateActions, /activeView\s*=\s*"schedule-template"/);
    assert.match(templateActions, /template\.kind === "schedule"/);
    assert.match(templateActions, /templateSchedules/);
    assert.match(templateActions, /saveScheduleTemplate/);
    assert.match(templateActions, /applyScheduleTemplateToActiveProject/);
    assert.doesNotMatch(templateActions, /template\.kind === "schedule"[\s\S]{0,700}templateTasks\[name\]/);
  });

  it("keeps schedule header actions wired and member avatars project-driven", async () => {
    const scheduleView = await source("../../../views/ScheduleView.vue");
    const topbar = await source("../../schedule/ScheduleTopbar.vue");
    const heroHeader = await source("../../schedule/ScheduleHeroHeader.vue");
    const projectHeader = await source("../../schedule/ScheduleProjectHeader.vue");
    const memberAvatars = await source("../../schedule/ScheduleMemberAvatars.vue");

    assert.doesNotMatch(heroHeader, /首页 · 项目可视化/);
    assert.match(heroHeader, /toggleMenu\((?:"|'|&quot;)notice(?:"|'|&quot;)\)/);
    assert.match(heroHeader, /"open-launcher"/);
    assert.match(heroHeader, /handleAvatarClick/);
    assert.match(heroHeader, /emit\(['"]open-profile['"]/);
    assert.match(heroHeader, /addEventListener\("pointerdown", handleDocumentPointerDown\)/);
    assert.match(heroHeader, /removeEventListener\("pointerdown", handleDocumentPointerDown\)/);
    assert.doesNotMatch(topbar, /"open-launcher"/);
    assert.match(scheduleView, /<ScheduleToolbar[\s\S]*@open-create="openCreateDialog"[\s\S]*@open-export="openExportDialog"[\s\S]*@delete-item="deleteItem"[\s\S]*\/>/);
    assert.doesNotMatch(scheduleView, /<ScheduleTopbar/);
    assert.match(projectHeader, /defineEmits\(\["open-create", "open-export", "open-members"\]\)/);
    assert.match(projectHeader, /emit\("open-create"\)/);
    assert.doesNotMatch(projectHeader, /\bEditPen\b/);
    assert.doesNotMatch(projectHeader, /\bopenEditProject\b/);
    assert.doesNotMatch(projectHeader, /title="\u7f16\u8f91\u9879\u76ee"/);
    assert.doesNotMatch(projectHeader, /aria-label="\u7f16\u8f91\u9879\u76ee"/);
    assert.match(projectHeader, /askConfirm/);
    assert.match(projectHeader, /emit\("open-export"\)/);
    assert.match(memberAvatars, /store\.activeMembersDetailed/);
    assert.match(memberAvatars, /remainingCount/);
    assert.match(memberAvatars, /default:\s*3/);
    assert.match(memberAvatars, /const emit = defineEmits\(\["open-members"\]\)/);
    assert.match(memberAvatars, /@click="selectMember\(member\)"/);
    assert.match(memberAvatars, /@click="openMembers"/);
    assert.match(memberAvatars, /@keydown\.enter\.prevent="openMembers"/);
    assert.match(memberAvatars, /@keydown\.space\.prevent="openMembers"/);
    assert.match(memberAvatars, /moreLabel/);
    assert.match(memberAvatars, />\{\{\s*moreLabel\s*\}\}<\/button>/);
    assert.doesNotMatch(memberAvatars, />\+\{\{\s*remainingCount\s*\}\}<\/button>/);
    assert.doesNotMatch(memberAvatars, /label:\s*"严"|label:\s*"张"|label:\s*"大"|label:\s*"木"|label:\s*"星"/);
  });

  it("keeps schedule floating chat member avatars wired to the workspace members dialog", async () => {
    const scheduleView = await source("../../../views/ScheduleView.vue");
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const floatingChat = await source("../../schedule/ScheduleFloatingChat.vue");
    const memberAvatars = await source("../../schedule/ScheduleMemberAvatars.vue");

    assert.match(floatingChat, /import ScheduleMemberAvatars from "\.\/ScheduleMemberAvatars\.vue"/);
    assert.match(floatingChat, /const emit = defineEmits\(\[[\s\S]*"open-members"[\s\S]*\]\)/);
    assert.match(floatingChat, /<ScheduleMemberAvatars\s+small\s+@open-members="emit\('open-members'\)"\s*\/>/);
    assert.match(scheduleView, /<ScheduleFloatingChat\s+@open-members="emit\('open-members'\)"\s*\/>/);
    assert.match(workspaceView, /<ScheduleView[\s\S]*@open-members="openMembersDialog"/);
    assert.match(workspaceView, /function openMembersDialog\(\)\s*\{[\s\S]*membersDialogOpen\.value = true;[\s\S]*\}/);
    assert.match(memberAvatars, /function\s+openMembers\(\)\s*\{[\s\S]*selectedMemberId\.value = "";[\s\S]*emit\("open-members"\);[\s\S]*\}/);
  });

  it("keeps local sync failure state without rendering a local badge on timeline bars", async () => {
    const css = await source("../../../styles/base.css");

    assert.match(css, /\.schedule-timeline-bar\[data-sync-status="failed"\],\s*\.schedule-timeline-bar\[data-sync-status="deleteFailed"\]\s*\{[^}]*outline:/s);
    assert.doesNotMatch(css, /\.schedule-timeline-bar\[data-sync-status="failed"\]::after\s*\{[^}]*content:/s);
  });

  it("keeps schedule toolbar share, more menu, real delete, and outside-click close wired", async () => {
    const scheduleView = await source("../../../views/ScheduleView.vue");
    const toolbar = await source("../../schedule/ScheduleToolbar.vue");
    const css = await source("../../../styles/base.css");

    assert.match(toolbar, /import \{[^}]*MoreFilled[^}]*Share[^}]*\} from "@element-plus\/icons-vue"/);
    assert.match(toolbar, /<Share aria-hidden="true" \/>/);
    assert.match(toolbar, /title="[^"]*分享[^"]*"/);
    assert.match(toolbar, /<Teleport to="body">/);
    assert.match(toolbar, /class="schedule-toolbar-menu"/);
    assert.match(toolbar, /role="menu"/);
    assert.match(toolbar, /store\.applyFirstScheduleTemplateToActiveProject\(\)/);
    assert.match(toolbar, /store\.saveCurrentScheduleAsTemplate\(\)/);
    assert.match(toolbar, /@click="deleteSelectedItem"/);
    assert.match(toolbar, /emit\("delete-item",\s*selectedItem\.value\)/);
    assert.doesNotMatch(toolbar, /class="is-danger"[\s\S]{0,160}placeholder/);
    assert.match(toolbar, /document\.addEventListener\("pointerdown",\s*handleDocumentPointerDown\)/);
    assert.match(toolbar, /document\.removeEventListener\("pointerdown",\s*handleDocumentPointerDown\)/);
    assert.match(scheduleView, /@delete-item="deleteItem"/);
    assert.match(scheduleView, /await store\.deleteScheduleItem\(itemId\)/);
    assert.match(css, /\.schedule-toolbar-menu\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*2600/s);
  });

  it("keeps the schedule more icon vertical and the floating menu clamped into the viewport", async () => {
    const toolbar = await source("../../schedule/ScheduleToolbar.vue");
    const css = await source("../../../styles/base.css");

    assert.match(toolbar, /<MoreFilled class="schedule-more-icon" aria-hidden="true" \/>/);
    assert.match(toolbar, /const menuPosition = reactive\(\{ top: 0, left: 0 \}\)/);
    assert.match(toolbar, /const menuWidth = menuRef\.value\?\.offsetWidth \|\| 176/);
    assert.match(toolbar, /Math\.max\(8,\s*Math\.min\(buttonRect\.right - menuWidth,\s*window\.innerWidth - menuWidth - 8\)\)/);
    assert.match(toolbar, /:style="\{ top: `\$\{menuPosition\.top\}px`, left: `\$\{menuPosition\.left\}px` \}"/);
    assert.match(css, /\.schedule-more-icon\s*\{[^}]*transform:\s*rotate\(90deg\)/s);
    assert.match(css, /\.schedule-toolbar-menu\s*\{[^}]*position:\s*fixed[^}]*right:\s*auto/s);
  });

  it("keeps schedule row overflow menus portaled, measured, and anchored to the trigger", async () => {
    const fixedTable = await source("../../schedule/ScheduleFixedTable.vue");
    const css = await source("../../../styles/base.css");

    assert.match(fixedTable, /const menuRef = ref\(null\)/);
    assert.match(fixedTable, /function\s+positionMenuNearTrigger\(event\)/);
    assert.match(fixedTable, /event\?\.currentTarget\?\.getBoundingClientRect\?\.\(\)/);
    assert.match(fixedTable, /menuRef\.value\?\.offsetHeight\s*\|\|\s*176/);
    assert.match(fixedTable, /nextTick\(\(\)\s*=>\s*positionMenuNearTrigger\(event\)\)/);
    assert.match(fixedTable, /<Teleport to="body">[\s\S]*ref="menuRef"[\s\S]*class="schedule-row-context-menu"/);
    assert.match(fixedTable, /menuRef\.value\?\.contains\(event\.target\)/);
    assert.match(css, /\.schedule-row-context-menu\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*3200[^}]*max-height:\s*calc\(100vh - 16px\)[^}]*overflow-y:\s*auto/s);
  });

  it("deletes selected schedule items through the store after a readable confirmation", async () => {
    const scheduleView = await source("../../../views/ScheduleView.vue");
    const toolbar = await source("../../schedule/ScheduleToolbar.vue");

    assert.match(toolbar, /emit\("delete-item",\s*selectedItem\.value\)/);
    assert.match(scheduleView, /title:\s*"删除排期"/);
    assert.match(scheduleView, /message:\s*`确认删除「\$\{item\.title \|\| "未命名排期"\}」吗？`/);
    assert.match(scheduleView, /confirmButtonText:\s*"删除"/);
    assert.match(scheduleView, /await store\.deleteScheduleItem\(itemId\)/);
  });

  it("keeps the home launcher and avatar capsule aligned with shared header metrics", async () => {
    const homeDashboard = await source("../../../views/HomeDashboard.vue");
    const workbenchHeader = await source("../WorkbenchHeader.vue");
    const css = await source("../../../styles/overrides.css");

    assert.match(homeDashboard, /class="ai-home-top"/);
    assert.match(workbenchHeader, /class="header-top-tools"/);
    assert.match(css, /\.ai-home-top,\s*\.work-header \.header-top-tools,\s*\.schedule-hero-header \.schedule-hero-actions \.header-top-tools\s*\{[^}]*min-width:\s*88px\s*!important[^}]*height:\s*40px\s*!important/s);
    assert.match(css, /\.ai-home-top \.ai-grid-menu,\s*\.work-header \.header-top-tools \.grid-menu-btn,\s*\.schedule-hero-header \.schedule-hero-actions \.header-top-tools \.grid-menu-btn\s*\{[^}]*width:\s*32px\s*!important[^}]*height:\s*32px\s*!important/s);
    assert.match(css, /\.ai-home-top \.ai-home-avatar,\s*\.work-header \.header-top-tools \.user-avatar,\s*\.schedule-hero-header \.schedule-hero-actions \.header-top-tools \.user-avatar\s*\{[^}]*width:\s*32px\s*!important[^}]*height:\s*32px\s*!important/s);
  });

  it("keeps timeline zoom on the mouse wheel instead of toolbar zoom buttons", async () => {
    const toolbar = await source("../../schedule/ScheduleToolbar.vue");
    const timeline = await source("../../schedule/ScheduleTimelineView.vue");

    assert.doesNotMatch(toolbar, /ScheduleZoomControl/);
    assert.doesNotMatch(toolbar, /schedule-zoom-control/);
    assert.match(timeline, /@wheel(?:\.prevent)?="handleTimelineWheel"/);
    assert.match(timeline, /function\s+handleTimelineWheel\(event\)/);
    assert.match(timeline, /store\.adjustScheduleZoom\(/);
  });

  it("keeps schedule and context menus inside the viewport", async () => {
    const toolbar = await source("../../schedule/ScheduleToolbar.vue");
    const taskCard = await source("../../tasks/TaskCard.vue");
    const resourceNodeView = await source("../../../features/resource/components/ResourceNodeView.vue");

    assert.match(toolbar, /const menuHeight = menuRef\.value\?\.offsetHeight \|\| \d+/);
    assert.match(toolbar, /const viewportHeight = window\.innerHeight/);
    assert.match(toolbar, /menuPosition\.top = Math\.max\(8,\s*Math\.min\(preferredTop,\s*viewportHeight - menuHeight - 8\)\)/);
    assert.match(toolbar, /\.schedule-toolbar-menu\s*\{[\s\S]*max-height:\s*calc\(100vh - 16px\)[\s\S]*overflow-y:\s*auto/s);

    assert.match(taskCard, /const viewportWidth = window\.innerWidth/);
    assert.match(taskCard, /const viewportHeight = window\.innerHeight/);
    assert.match(taskCard, /maxHeight:\s*`calc\(100vh - \$\{gap \* 2\}px\)`/);
    assert.match(taskCard, /\.task-context-menu\s*\{[\s\S]*max-height:\s*calc\(100vh - 16px\)[\s\S]*overflow-y:\s*auto/s);

    assert.match(resourceNodeView, /<Teleport to="body">/);
    assert.match(resourceNodeView, /const viewportWidth = window\.innerWidth/);
    assert.match(resourceNodeView, /contextMenu\.x = clamp\(event\.clientX \+ gap,\s*gap,\s*viewportWidth - menuWidth - gap\)/);
    assert.match(resourceNodeView, /\.resource-node-context-menu\s*\{[\s\S]*position:\s*fixed[\s\S]*max-height:\s*calc\(100vh - 16px\)[\s\S]*overflow-y:\s*auto/s);
  });

  it("keeps schedule view tabs and department filtering without date setting controls", async () => {
    const toolbar = await source("../../schedule/ScheduleToolbar.vue");
    const css = await source("../../../styles/base.css");

    assert.match(toolbar, /import ScheduleViewTabs from "\.\/ScheduleViewTabs\.vue"/);
    assert.match(toolbar, /<ScheduleViewTabs \/>/);
    assert.match(toolbar, /const departments = \[/);
    assert.match(toolbar, /store\.setScheduleDepartmentFilter\(department\)/);
    assert.doesNotMatch(toolbar, /\bCalendar\b/);
    assert.doesNotMatch(css, /schedule-(?:toolbar-calendar|zoom-control)/);
    assert.doesNotMatch(toolbar, /日期设置|设置日期|date-setting|schedule-date-setting/);
    assert.doesNotMatch(toolbar, /placeholder[\s\S]{0,80}(?:日期设置|设置日期|date setting)/i);
  });

  it("keeps timeline range extension, today reset, and header/body scroll sharing in one scroller", async () => {
    const timeline = await source("../../schedule/ScheduleTimelineView.vue");

    assert.match(timeline, /extendVisibleDateRangeToDate/);
    assert.match(timeline, /function\s+resetToToday\(\)/);
    assert.match(timeline, /setVisibleRange\(.*today.*\)/s);
    assert.match(timeline, /class="schedule-timeline-scroll"[\s\S]*@scroll="maybeExtendVisibleRange"/);
    assert.match(timeline, /<ScheduleTimelineHeader[\s\S]*<div class="schedule-timeline-body"/);
    assert.doesNotMatch(timeline, /class="schedule-timeline-header-scroll"/);
    assert.doesNotMatch(timeline, /class="schedule-timeline-body-scroll"/);
  });

  it("keeps schedule timeline bars previewing pointer drags with three selected control dots", async () => {
    const timelineBar = await source("../../schedule/ScheduleTimelineBar.vue");
    const timelineLayout = await source("../../../utils/schedule/timelineLayout.js");

    assert.match(timelineBar, /getBarPreviewStyle/);
    assert.match(timelineBar, /previewRange:\s*null/);
    assert.match(timelineBar, /dragState\.previewRange\s*=\s*getDateRangeFromDragDelta/);
    assert.match(timelineBar, /dragState\.active[\s\S]{0,120}getBarPreviewStyle/);
    assert.match(timelineBar, /@pointermove="moveDrag"/);
    assert.match(timelineLayout, /left:\s*"0px"/);
    assert.match(timelineBar, /v-if="selected"[\s\S]{0,120}schedule-timeline-control-dot is-start/);
    assert.match(timelineBar, /v-if="selected"[\s\S]{0,120}schedule-timeline-control-dot is-middle/);
    assert.match(timelineBar, /v-if="selected"[\s\S]{0,120}schedule-timeline-control-dot is-end/);
    assert.match(timelineBar, /startDrag\(\$event,\s*'resize-start'\)/);
    assert.match(timelineBar, /startDrag\(\$event,\s*'move'\)/);
    assert.match(timelineBar, /startDrag\(\$event,\s*'resize-end'\)/);

    assert.match(timelineBar, /\.schedule-timeline-control-dot\s*\{/s);
    assert.match(timelineBar, /\.schedule-timeline-bar\.is-selected\s+\.schedule-timeline-control-dot/s);
    assert.match(timelineBar, /\.schedule-timeline-control-dot\.is-middle/s);
  });

  it("keeps timeline rows and fixed table rows using the shared row-height contract", async () => {
    const timelineRow = await source("../../schedule/ScheduleTimelineRow.vue");
    const timelineView = await source("../../schedule/ScheduleTimelineView.vue");

    assert.match(timelineRow, /getRowStyle/);
    assert.match(timelineRow, /const rowStyle = computed\(\(\) => getRowStyle/);
    assert.match(timelineRow, /:style="rowStyle"/);
    assert.match(timelineView, /<ScheduleFixedTable[\s\S]*:layout="layout"/);
    assert.match(timelineView, /<ScheduleTimelineRow[\s\S]*:layout="layout"/);
  });

  it("keeps the timeline grid height tied to real rows without a forced empty background", async () => {
    const timelineGrid = await source("../../schedule/ScheduleTimelineGrid.vue");

    assert.match(timelineGrid, /const gridHeight = computed\(\(\) => `\$\{props\.items\.length \* props\.layout\.rowHeight\}px`\)/);
    assert.match(timelineGrid, /class="schedule-timeline-grid"[\s\S]*:style="\{ height: gridHeight \}"/);
    assert.doesNotMatch(timelineGrid, /Math\.max\(props\.items\.length,\s*1\)/);
    assert.doesNotMatch(timelineGrid, /schedule-timeline-empty/);
  });

  it("keeps timeline body date cells transparent while preserving date-header colors", async () => {
    const css = await source("../../../styles/base.css");

    assert.match(css, /\.schedule-timeline-day\.is-rest-day[\s\S]*background:\s*#77dc86/s);
    assert.match(css, /\.schedule-timeline-day\.is-today[\s\S]*background:\s*#ffd7db/s);
    assert.match(css, /\.schedule-timeline-grid-day,\s*\.schedule-timeline-grid-day\.is-rest-day,\s*\.schedule-timeline-grid-day\.is-today[\s\S]*background:\s*transparent\s*!important/s);
    assert.doesNotMatch(css, /\.schedule-timeline-grid-day\.is-rest-day\s*\{[^}]*background:\s*#[0-9a-f]{3,6}/is);
    assert.doesNotMatch(css, /\.schedule-timeline-grid-day\.is-today\s*\{[^}]*background:\s*#[0-9a-f]{3,6}/is);
    assert.doesNotMatch(css, /\.schedule-timeline-grid-day\.is-today\s*\{[^}]*repeating-linear-gradient/is);
  });

  it("keeps the schedule timeline structure compact and free of extra type markers", async () => {
    const toolbar = await source("../../schedule/ScheduleToolbar.vue");
    const timeline = await source("../../schedule/ScheduleTimelineView.vue");
    const fixedTable = await source("../../schedule/ScheduleFixedTable.vue");
    const css = await source("../../../styles/base.css");

    assert.match(toolbar, /const departments = \["全部", "项目管理", "AIGC", "美术设计", "三维动态", "动效设计", "后期合成"\]/);
    assert.match(css, /\.schedule-center-toolbar\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*auto\)\s+minmax\(0,\s*1fr\)\s+auto/s);
    assert.match(css, /\.schedule-toolbar-main\s*\{[^}]*display:\s*contents/s);
    assert.match(css, /\.schedule-department-pills\s*\{[^}]*flex-wrap:\s*nowrap/s);
    assert.match(css, /\.schedule-timeline-shell\s*\{[^}]*align-self:\s*start[^}]*background:\s*transparent/s);
    assert.match(css, /\.schedule-timeline-scroll\s*\{[^}]*background:\s*transparent/s);
    assert.match(css, /\.schedule-timeline-body\s*\{[^}]*background:\s*transparent/s);
    assert.match(css, /\.schedule-timeline-left\s*\{[^}]*background:\s*transparent/s);
    assert.match(timeline, /:style="\{ minHeight: `\$\{visibleItems\.length \* layout\.rowHeight\}px` \}"/);
    assert.doesNotMatch(fixedTable, /schedule-row-(?:color|dot)/);
    assert.doesNotMatch(css, /\.schedule-row-(?:color|dot)\s*\{/);
    assert.doesNotMatch(css, /grid-template-columns:\s*6px\s+10px\s+58px/);
  });

  it("keeps schedule create dialog reduced to title, department, and date range", async () => {
    const dialog = await source("../../schedule/ScheduleCreateDialog.vue");

    assert.match(dialog, /isEdit\.value \? "修改排期" : "创建排期"/);
    assert.match(dialog, /isEdit\.value \? "修改排期环节标题" : "创建排期环节标题"/);
    assert.match(dialog, /:placeholder="titleFieldLabel"/);
    assert.match(dialog, /form\.title = props\.item\.title \|\| ""/);
    assert.match(dialog, /store\.createScheduleItemFromPayload\(payload\)/);
    assert.match(dialog, /store\.updateScheduleItem\(itemId,\s*payload\)/);
    assert.match(dialog, /class="schedule-title-row"/);
    assert.match(dialog, /class="schedule-department-options"/);
    assert.match(dialog, /class="schedule-date-range"/);
    assert.match(dialog, /type="radio"/);
    assert.match(dialog, /type="date"/);
    assert.match(dialog, /<button class="schedule-create-action schedule-create-action--save" type="submit"/);
    assert.match(dialog, />\{\{\s*submitLabel\s*\}\}<\/button>/);
    assert.doesNotMatch(dialog, /v-model(?:\.trim|\.number)?="form\.(?:owner|status|progress|note|addToTaskList|linkTask|linkFlow)"/);
    assert.doesNotMatch(dialog, /statusOptions|linkageOptions/);
    assert.match(dialog, /aria-label="关闭排期弹窗"/);
    assert.doesNotMatch(dialog, /@click="close">×</);
    assert.doesNotMatch(dialog, /class="schedule-linkage-options"/);
    assert.doesNotMatch(dialog, /class="schedule-linkage-chip"/);
    assert.doesNotMatch(dialog, /--chip-accent|--chip-soft|module-mark|color-dot|type-color|task-type-mark/);
    assert.match(dialog, /class="[^"]*schedule-create-actions[^"]*"/);
    assert.match(dialog, /schedule-create-action--cancel/);
    assert.match(dialog, /schedule-create-action--save/);
    assert.match(dialog, /\.schedule-create-action\s*\{[^}]*transition:[^}]*transform/s);
    assert.match(dialog, /\.schedule-create-action--cancel:hover\s*\{[^}]*transform:\s*translateY\(-1px\)/s);
    assert.match(dialog, /\.schedule-create-action--save:not\(:disabled\):hover\s*\{[^}]*transform:\s*translateY\(-1px\)/s);
    assert.match(dialog, /\.schedule-create-action:focus-visible\s*\{[^}]*outline:\s*2px solid/s);
    assert.match(dialog, /\.schedule-create-close:hover\s*\{[^}]*transform:\s*translateY\(-1px\)/s);
    assert.match(dialog, /\.schedule-create-close:active\s*\{[^}]*transform:\s*translateY\(0\)/s);
    assert.match(dialog, /\.schedule-create-close:focus-visible\s*\{[^}]*outline:\s*2px solid/s);
  });

  it("shows whole-column drop outlines on both flow task boards", async () => {
    const flowBoard = await source("../../../views/FlowBoard.vue");
    const taskModule = await source("../../tasks/TaskModule.vue");
    const css = await source("../../../styles/base.css");

    assert.match(flowBoard, /const taskBoardOver = ref\(false\)/);
    assert.match(flowBoard, /class="task-board"[\s\S]*:class="\{ 'is-task-board-drag-over': taskBoardOver \}"/);
    assert.match(flowBoard, /@dragover="taskBoardDragOver"/);
    assert.match(flowBoard, /@drop="taskBoardDrop"/);
    assert.match(css, /\.task-board\.is-task-board-drag-over,\s*\.archive-board\.is-archive-drag-over/);
    assert.match(taskModule, /event\.stopPropagation\(\)/);
  });

  it("keeps dialog action buttons calm, animated, and keyboard visible", async () => {
    const css = await source("../../../styles/overrides.css");

    assert.match(css, /\.modal-actions\s+\.ghost,\s*\.modal-actions\s+\.solid,\s*\.schedule-create-action,\s*\.board-ghost-btn/s);
    assert.match(css, /transition:[^}]*transform[^}]*box-shadow/s);
    assert.match(css, /\.modal-actions\s+\.ghost:hover,\s*\.modal-actions\s+\.solid:hover,\s*\.schedule-create-action:hover,\s*\.board-ghost-btn:hover/s);
    assert.match(css, /transform:\s*translateY\(-1px\)/);
    assert.match(css, /:active[^}]*transform:\s*translateY\(0\)/s);
    assert.match(css, /:focus-visible[^}]*outline:\s*2px solid/s);
    assert.match(css, /\.modal-head\s+button,\s*\.schedule-create-close,\s*\.board-local-close,\s*\.board-share-panel\s+header\s+button/s);
  });

  it("keeps DeepSeek credentials out of frontend production source", async () => {
    const files = await sourceTree("../../../", { ignoredSegments: ["__tests__"] });
    const frontendSource = files.map((file) => file.text).join("\n");

    assert.doesNotMatch(frontendSource, /\bDEEPSEEK_API_KEY\b/);
    assert.doesNotMatch(frontendSource, /\bVITE_DEEPSEEK_[A-Z0-9_]*KEY\b/i);
    assert.doesNotMatch(frontendSource, /import\.meta\.env\.[A-Z0-9_]*DEEPSEEK[A-Z0-9_]*(?:KEY|SECRET|TOKEN)/i);
    assert.doesNotMatch(frontendSource, /(?:^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{32,}(?:[^A-Za-z0-9_-]|$)/);
  });

  it("routes aiApi requests through the backend only", async () => {
    const { text: aiApi } = await firstExistingSource(["../../../services/aiApi.js", "../../../api/aiApi.js"]);

    assert.match(aiApi, /["']\.\/http\.js["']/);
    assert.match(aiApi, /\/ai(?:\/|["'`?])/i);
    assert.doesNotMatch(aiApi, /https?:\/\/[^"'`]*deepseek/i);
    assert.doesNotMatch(aiApi, /\bapi\.deepseek\.com\b/i);
    assert.doesNotMatch(aiApi, /\bchat\/completions\b/i);
    assert.doesNotMatch(aiApi, /\bDEEPSEEK_API_KEY\b|\bVITE_DEEPSEEK/i);
    assert.doesNotMatch(aiApi, /Authorization[\s\S]{0,80}Bearer/i);
  });

  it("routes advisor apply through assignment preview before confirmation", async () => {
    const resourceView = await source("../../../features/resource/components/ResourceView.vue");

    assert.match(resourceView, /@apply-candidate="applyAdvisorCandidate"/);
    assert.match(resourceView, /async function applyAdvisorCandidate\(candidateOrId\)/);
    assert.match(resourceView, /await resourceApi\.previewAssignment\(\s*buildAssignmentApiPayload\(buildAssignmentDraftPayload\(\)/);
    assert.match(resourceView, /assignmentPreview\.value = normalizeAssignmentPreview\(result,\s*candidate\)/);
  });

  it("keeps contact follow action visible next to follow friend grouping", async () => {
    const contactsDialog = await source("../../dialogs/ContactsDialog.vue");

    assert.match(contactsDialog, /\{ key: "care", label: "关注好友", count: store\.careContacts\.length \}/);
    assert.match(contactsDialog, /class="contacts-care-action"/);
    assert.match(contactsDialog, /@click\.stop="toggleCare\(user\)"/);
    assert.match(contactsDialog, /\{\{ isCare\(user\) \? "取消关注" : "关注" \}\}/);
  });

  it("opens the launcher contacts directory as a centered whole-page panel", async () => {
    const contactsDialog = await source("../../dialogs/ContactsDialog.vue");
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const css = await source("../../../styles/overrides.css");

    assert.match(workspaceView, /const contactsDialogSource = ref\("default"\)/);
    assert.match(workspaceView, /function openContactsDialog\(source = "default"\)/);
    assert.match(workspaceView, /@open-contacts="openContactsDialog\('launcher'\)"/);
    assert.match(workspaceView, /<ContactsDialog[\s\S]*:source="contactsDialogSource"/);
    assert.doesNotMatch(workspaceView, /<MemberPermissionsDialog[\s\S]*@open-contacts=/);

    assert.match(contactsDialog, /source:\s*\{\s*type:\s*String,\s*default:\s*"default"\s*\}/);
    assert.match(contactsDialog, /const searchText = ref\(""\)/);
    assert.match(contactsDialog, /v-model="searchText"/);
    assert.match(contactsDialog, /class="contacts-search"/);
    assert.match(contactsDialog, /const filteredContacts = computed\(\(\) =>/);
    assert.match(contactsDialog, /normalizedSearchText/);
    assert.match(contactsDialog, /@click="openProfile\(user\)"/);
    assert.match(contactsDialog, /@click\.stop="toggleCare\(user\)"/);
    assert.match(contactsDialog, /@click\.stop="inviteUser\(user\)"/);

    assert.match(css, /\.contacts-directory-shell\.is-launcher-source\.el-dialog/s);
    assert.match(css, /display:\s*grid[^}]*place-items:\s*center/s);
    assert.match(css, /\.contacts-search/s);
    assert.match(css, /\.contacts-care-action\.is-active/s);
  });

  it("opens a centered collaboration selector and permission dialog from the project member entry", async () => {
    const workbenchHeader = await source("../WorkbenchHeader.vue");
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const memberDialog = await source("../../dialogs/MemberPermissionsDialog.vue");

    assert.match(workbenchHeader, /class="add-member-btn"[\s\S]*@click="emit\('open-members'\)"/);
    assert.match(workbenchHeader, /visibleMembers\s*=\s*computed\(\(\)\s*=>\s*members\.value\.slice\(0,\s*3\)\)/);
    assert.match(workbenchHeader, /hiddenMemberCount/);
    assert.match(workbenchHeader, /v-if="hiddenMemberCount"/);
    assert.match(workbenchHeader, />\.\.\.<\/span>/);
    assert.match(workspaceView, /<MemberPermissionsDialog v-model="membersDialogOpen"/);
    assert.doesNotMatch(workspaceView, /<MemberPermissionsDialog[\s\S]*@open-contacts=/);
    assert.match(memberDialog, /class="collaboration-dialog-shell"/);
    assert.match(memberDialog, /class="collaboration-directory"/);
    assert.match(memberDialog, /全部好友/);
    assert.match(memberDialog, /关注好友/);
    assert.match(memberDialog, /项目管理/);
    assert.match(memberDialog, /AIGC/);
    assert.match(memberDialog, /美术设计/);
    assert.match(memberDialog, /三维设计/);
    assert.match(memberDialog, /视效包装/);
    assert.match(memberDialog, /v-model="searchText"/);
    assert.match(memberDialog, /v-model="selectedUserIds"/);
    assert.match(memberDialog, /function\s+addSelectedUsers\(/);
    assert.match(memberDialog, /store\.inviteMembers\(selectedUsers\.value\.map\(\(user\)\s*=>\s*user\.name\)\)/);
    assert.doesNotMatch(memberDialog, /open-contacts/);
    assert.doesNotMatch(memberDialog, /从通讯录添加成员/);
    assert.match(memberDialog, /function\s+setUserRole\(/);
    assert.match(memberDialog, /store\.setMemberRole\(member\.name,\s*role\)/);
    assert.match(memberDialog, /function\s+removeUser\(/);
    assert.match(memberDialog, /store\.removeMember\(member\.name\)/);
    assert.match(memberDialog, /管理/);
    assert.match(memberDialog, /编辑/);
    assert.match(memberDialog, /只读/);
  });

  it("opens the redesigned template sharing dialog from schedule and task templates", async () => {
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const templateTree = await source("../../tree/TemplateTree.vue");
    const templateShareDialog = await source("../../dialogs/TemplateShareDialog.vue");

    assert.match(workspaceView, /import TemplateShareDialog from "@\/components\/dialogs\/TemplateShareDialog\.vue"/);
    assert.match(workspaceView, /<TemplateShareDialog\s+v-model="templateShareDialogOpen"/);
    assert.match(workspaceView, /:template-name="sharingTemplateName"/);
    assert.match(workspaceView, /:template-kind="sharingTemplateKind"/);
    assert.doesNotMatch(workspaceView, /title:\s*"分享模板"/);
    assert.doesNotMatch(workspaceView, /title:\s*"管理分享"/);

    assert.match(templateTree, /nodePrompt\('share-template',\s*\{\s*templateName:\s*child,\s*templateKind:\s*section\.kind\s*\}\)/);
    assert.match(templateShareDialog, /class="template-share-directory"/);
    assert.match(templateShareDialog, /class="template-share-search"/);
    assert.match(templateShareDialog, /全部好友/);
    assert.match(templateShareDialog, /关注好友/);
    assert.match(templateShareDialog, /可编辑/);
    assert.match(templateShareDialog, /不可编辑/);
    assert.match(templateShareDialog, /@drop="dropSharedUser\('edit'\)"/);
    assert.match(templateShareDialog, /@drop="dropSharedUser\('read'\)"/);
  });

  it("keeps task and assignment dialogs free of confirmed visible mojibake", async () => {
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const taskDialog = await source("../../dialogs/TaskDialog.vue");
    const resourceView = await source("../../../features/resource/components/ResourceView.vue");

    assert.doesNotMatch(workspaceView, /\u5a34\u4f7a\u7a0b|\u93ba\u639\u6e61/);
    assert.match(workspaceView, /openTaskDialog\(store\.activeSection === "schedule" \? "排期" : "流程"\)/);
    assert.match(taskDialog, /default:\s*"流程"/);
    assert.match(taskDialog, /<h3>创建清单<\/h3>/);
    assert.match(taskDialog, /placeholder="输入主任务标题"/);
    assert.match(taskDialog, /<small>未来将与排期联动<\/small>/);
    assert.doesNotMatch(resourceView, /\u5bee\u54c4\u57d7|\u9352\u55d8\u53b4/);
    assert.match(resourceView, /"强制分配已记录"/);
    assert.match(resourceView, /"分配完成，已写入时间线"/);
  });

  it("integrates the home dashboard assistant with the AI API", async () => {
    const homeDashboard = await source("../../../views/HomeDashboard.vue");

    assert.match(homeDashboard, /aiApi/);
    assert.match(homeDashboard, /assistantText/);
    assert.match(homeDashboard, /function\s+submitAssistant\(/);
    assert.match(homeDashboard, /@submit\.prevent="submitAssistant"/);
    assert.match(homeDashboard, /await\s+aiApi\.[A-Za-z0-9_]+\(/);
    assert.match(homeDashboard, /aria-label="[^"]*(首页搜索|资料搜索|继续提问)[^"]*"/);
  });

  it("keeps workspace, home assistant, and resource search state isolated", async () => {
    const projectPanel = await source("../ProjectPanel.vue");
    const projectTree = await source("../../tree/ProjectTree.vue");
    const tagBank = await source("../../tree/TagBank.vue");
    const searchResults = await source("../SearchResults.vue");
    const homeDashboard = await source("../../../views/HomeDashboard.vue");
    const workspaceView = await source("../../../views/WorkspaceView.vue");
    const resourceView = await source("../../../features/resource/components/ResourceView.vue");
    const coreActions = await source("../../../stores/workspace/actions/coreActions.js");
    const projectActions = await source("../../../stores/workspace/actions/projectActions.js");
    const getters = await source("../../../stores/workspace/getters.js");
    const appActions = await source("../../../stores/workspace/actions/appActions.js");
    const baseCss = await source("../../../styles/base.css");
    const overridesCss = await source("../../../styles/overrides.css");

    assert.match(projectPanel, /const searchText = shallowRef\(""\)/);
    assert.doesNotMatch(projectPanel, /buildWorkspaceSearchResults\(store,\s*searchText\.value\)/);
    assert.doesNotMatch(projectPanel, /store\.setQuery|store\.query|store\.searchResults/);
    assert.doesNotMatch(projectPanel, /<teleport|<Teleport|to="body"|center-search-overlay|center-search-panel|搜索结果|search-open-change/i);
    assert.match(projectPanel, /<ProjectTree\s+:filter-query="projectTreeQuery"/);
    assert.match(projectPanel, /@filter-tag="filterByTag"/);
    assert.match(projectPanel, /v-if="searchText"\s+class="project-side-search-hint"/);
    assert.match(projectTree, /filterQuery/);
    assert.match(projectTree, /function\s+projectMatchesFilter\(project\)/);
    assert.doesNotMatch(projectTree, /store\.projectMatchesQuery|store\.query|store\.setQuery|store\.searchResults/);
    assert.match(tagBank, /"filter-tag"/);
    assert.doesNotMatch(tagBank, /store\.filterByTag|store\.setQuery|store\.query/);
    assert.doesNotMatch(workspaceView, /centerSearchOpen|search-open-change/);
    assert.match(searchResults, /defineProps/);
    assert.doesNotMatch(searchResults, /useWorkspaceStore|store\.query|store\.searchResults|selectSearchResult/);
    assert.match(homeDashboard, /const assistantText = shallowRef\(""\)/);
    assert.doesNotMatch(homeDashboard, /store\.setQuery|store\.query\s*=/);
    assert.match(resourceView, /const sidebarSearchQuery = shallowRef\(""\)/);
    assert.match(resourceView, /const toolbarQuery = shallowRef\(""\)/);
    assert.doesNotMatch(resourceView, /store\.setQuery|store\.query/);
    assert.doesNotMatch(coreActions, /taskMatchesFilter\(task\)\s*\{[\s\S]*this\.query[\s\S]*\n\}/);
    assert.doesNotMatch(coreActions, /setQuery|projectMatchesQuery|this\.query/);
    assert.doesNotMatch(projectActions, /filterByTag|this\.query\s*=\s*lower/);
    assert.doesNotMatch(getters, /searchResults\(\)|buildWorkspaceSearchResults\(this,\s*this\.query\)/);
    assert.match(appActions, /normalizeLoadedState\(\) \{\s*this\.query = "";/);
    assert.match(appActions, /async saveAppState\(\) \{[\s\S]*\bquery,/);
    assert.match(baseCss, /\.project-panel\s*\{[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) minmax\(108px,\s*144px\)/);
    assert.doesNotMatch(overridesCss, /\.project-side-search-panel\s*\{/);
    assert.match(overridesCss, /\.project-side-search-hint\s*\{/);
  });

  it("exposes AI configuration in the admin console navigation", async () => {
    const adminData = await source("../../../features/management-console/data/adminConsoleData.js");
    const adminApi = await source("../../../services/adminApi.js");

    assert.match(adminData, /key:\s*["']ai[-_]?(?:config|settings)?["']/i);
    assert.match(adminData, /deepseek|AI|Ai|aiApi/i);
    assert.match(adminApi, /\/admin\/ai\/config/i);
  });
});
