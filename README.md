# MIX-OC

MIX-OC 是一套面向影视、AIGC、设计、三维、动效、视效包装团队的项目协同系统。它把项目树、任务流转、排期时间线、协同成员、通讯录、模板共享、人力负载、后台管理和 AI 辅助放在同一个工作台里，让项目经理、部门负责人和执行成员可以围绕同一份项目状态协作。

当前发布版本：`v1.0.2`

[查看 v1.0.2 发布说明](release-notes/v1.0.2.md) · [GitHub Releases](https://github.com/weisentao/MIX-OC/releases/tag/v1.0.2)

## 版本简介

`v1.0.2` 重点补齐协同通讯录、项目成员权限、模板共享和部门统一口径。前端新增更完整的通讯录筛选、批量加入成员、模板共享权限分区和成员摘要；后端同步补上部门 canonical key、历史部门别名兼容、成员 userId 优先契约、模板共享批量 payload 与权限归一化。人力资源视图也统一了部门过滤、中文提示和权限范围，让排期、人力和协作模块的数据口径更一致。

## v1.0.2 更新

### 新增

- 协同成员弹窗支持从通讯录批量选择成员，一次加入项目，并提供已选预览、搜索和部门树筛选。
- 项目成员管理按“管理 / 编辑 / 只读”分组展示，支持调整成员权限和移除成员。
- 模板共享弹窗支持“可编辑 / 只读”权限分区，多人共享后返回规范化的 recipients 与 permissions。
- 后端新增统一部门 taxonomy：项目管理、AIGC、美术设计、三维动态、动效设计、视效包装。
- 工作区部门接口、通讯录、人力资源和项目成员 payload 增加 `departmentKey`、`departmentAliasKey`、`displayDepartment`、`departmentPath` 等结构化字段。
- 新增后端契约测试，覆盖模板共享权限兼容、项目成员 userId 优先、部门顺序与历史别名映射。
- 新增《协同通讯录共享后端对接说明》，方便后续接口继续向结构化成员、部门和共享模型演进。

### 优化

- 历史“后期合成”统一映射为“视效包装”，三维动画等旧称也会归一到当前部门主线。
- 项目头部成员摘要最多展示 3 个头像，并显示总人数或额外人数，列表扫读更轻。
- 通讯录个人详情补齐部门、岗位、联系方式、邮箱、MBTI、头像和在线状态等信息展示。
- 人力资源视图按统一部门别名过滤，超级管理、部门经理、个人视角的筛选结果更一致。
- 人力指派、负载风险和 AI 建议相关后端提示改为中文，前后端反馈更贴近实际使用场景。
- README、发布说明和打包说明重新整理为 1.0.2 版本，截图分组可折叠，仓库首页更清爽。

### 修复

- 修复模板共享接口只识别单一 payload 形态的问题，现在兼容 `entries`、`recipients`、`sharedWith`、`users`、`userIds` 和单用户对象。
- 修复模板共享 `write`、`edit`、`manage`、`owner` 等权限别名在前端展示不一致的问题。
- 修复项目成员写入时容易退化为姓名匹配的问题，后端契约优先使用 `userId`，姓名仅保留为展示兼容字段。
- 修复部门列表和人力资源过滤对历史部门名、子部门名、旧英文 key 的覆盖不足问题。
- 修复共享、成员和排期相关契约测试没有覆盖新结构化字段的问题。
- 修复临时后端部署目录可能被误加入发布提交的问题，已在 `.gitignore` 排除 `backend-deploy-stage-*/`。

## 界面预览

<details open>
<summary><strong>工作台与流程任务</strong></summary>

任务工作台围绕项目树、任务模块、评论、标签、归档和模板管理组织。任务卡片按部门模块上色，拖拽时会给出明确的落点反馈。

<p>
  <img src="docs/06-客户反馈/流程页面修改/流程页面修改_图片/embedded_contact_sheet.png" alt="流程页面功能总览" width="100%">
</p>
<p>
  <img src="docs/06-客户反馈/流程页面修改/流程页面修改_图片/crops/01_completed_to_pending_drag.png" alt="任务拖拽状态流转" width="49%">
  <img src="docs/06-客户反馈/流程页面修改/流程页面修改_图片/crops/04_edit_project_simplify_and_tags.png" alt="项目编辑与标签" width="49%">
</p>

</details>

<details>
<summary><strong>排期中心与项目模板</strong></summary>

排期页支持时间线、看板、节点视图切换，项目排期模板可以复用到新项目中。`v1.0.2` 继续收敛部门筛选入口，并让模板共享、项目排期和任务同步的口径保持一致。

<p>
  <img src="第一版修改内容/c8078676b8a1bc05011bb9c81de28bfe.png" alt="排期模板与共享模板设计" width="100%">
</p>
<p>
  <img src="第一版修改内容/e1a4652ecaf1858f717cc115aa387449.png" alt="排期部门筛选入口" width="100%">
</p>
<p>
  <img src="docs/06-客户反馈/流程页面修改/流程页面修改_图片/crops/02_template_generate_sync.png" alt="模板生成与同步" width="49%">
  <img src="docs/06-客户反馈/流程页面修改/流程页面修改_图片/crops/03_project_archive_move_sort_time.png" alt="项目归档排序与时间" width="49%">
</p>

</details>

<details>
<summary><strong>通讯录、成员权限与模板共享</strong></summary>

通讯录、协同成员和模板共享都使用统一部门树。项目成员可以批量加入，并按管理、编辑、只读分组；模板共享支持可编辑和只读权限区，便于多人复用同一套任务或排期模板。

<p>
  <img src="第一版修改内容/f6afb51f9c6e371631273ed5519c2076.png" alt="协同通讯录与成员选择" width="49%">
  <img src="第一版修改内容/831c13e92d203bdb9f787750aab371da.png" alt="项目成员权限管理" width="49%">
</p>
<p>
  <img src="第一版修改内容/8eef4e143a1e40e8e0468fe183486bc1.png" alt="模板共享权限分区" width="49%">
  <img src="第一版修改内容/d1796b1bc99541536d2551a25f4675b8.png" alt="通讯录个人信息" width="49%">
</p>

</details>

<details>
<summary><strong>人力排期与负载风险</strong></summary>

人力模块按超级管理、部门管理和个人视角拆分，支持时间线、部门、个人、冲突和节点模式。系统会提示超负荷、空闲人员和可转派建议。

<p>
  <img src="人力/05-新版超级管理人力总览.png" alt="超级管理人力总览" width="100%">
</p>
<p>
  <img src="人力/06-新版部门经理人力视图.png" alt="部门经理人力视图" width="49%">
  <img src="人力/07-新版个人视角-朱敏.png" alt="个人人力视角" width="49%">
</p>

</details>

<details>
<summary><strong>人力推荐、确认与节点关系</strong></summary>

新建任务时可以参考推荐人力，分配完成后进入确认流程；当成员超负荷时，会出现二次确认，避免无意识地把风险推到执行端。

<p>
  <img src="人力/08-交互流程1-新建任务推荐人力.png" alt="新建任务推荐人力" width="49%">
  <img src="人力/09-交互流程2-确认分配完成.png" alt="确认分配完成" width="49%">
</p>
<p>
  <img src="人力/10-交互流程3-超负荷二次确认.png" alt="超负荷二次确认" width="49%">
  <img src="人力/11-新版人力节点关系视图.png" alt="人力节点关系视图" width="49%">
</p>

</details>

<details>
<summary><strong>更多设计与验收截图</strong></summary>

这些截图保留了第一版修改内容里的产品设计、流程标注和验收画面，适合快速了解工作台、模板、协同和排期相关细节。

<p>
  <img src="第一版修改内容/0b898144b39a6d34b33edeb1f16d3ec8.png" alt="功能截图 1" width="49%">
  <img src="第一版修改内容/137e5a45c2dceae94bae3f494f967eba.png" alt="功能截图 2" width="49%">
</p>
<p>
  <img src="第一版修改内容/18237e50bc77072e97af77cfa7378b44.png" alt="功能截图 3" width="49%">
  <img src="第一版修改内容/60d4bf18d316203701c812d8e03a000e.png" alt="功能截图 4" width="49%">
</p>
<p>
  <img src="第一版修改内容/6bcbb740cab3831d4fc6837453eafffe.png" alt="功能截图 5" width="49%">
  <img src="第一版修改内容/d1796b1bc99541536d2551a25f4675b8.png" alt="功能截图 6" width="49%">
</p>

</details>

## 功能清单

<details open>
<summary><strong>项目与任务工作台</strong></summary>

- 项目树、项目归档、项目排序、项目详情编辑。
- 任务创建、任务拖拽、状态流转、评论、负责人、时间范围和标签。
- 模块化任务列表：项目管理、AIGC、美术设计、三维动态、动效设计、视效包装等。
- 项目头部成员摘要、头像堆叠、额外人数提示和项目协同状态。
- 任务模板与项目模板复用，支持模板分享和权限管理。

</details>

<details>
<summary><strong>排期中心</strong></summary>

- 时间线、看板、节点视图、固定表格视图。
- 排期环节创建、编辑、导出、缩放、部门筛选和任务关联。
- 项目排期模板可以沉淀成可复用模板，并支持共享给指定成员。
- 旧模块兼容：历史 AIGC、动效、后期合成、三维动画等分类仍可被识别。

</details>

<details>
<summary><strong>协作、通讯录与权限</strong></summary>

- 通讯录支持部门树筛选、联系人搜索、关注好友和个人资料查看。
- 协同成员弹窗支持批量选择，一次加入项目。
- 项目成员权限分组：管理、编辑、只读。
- 模板共享权限分组：可编辑、只读。
- 后端保持 `userId` 优先、姓名兼容，降低同名成员或改名后的权限错配风险。

</details>

<details>
<summary><strong>后台、人力与 AI 能力</strong></summary>

- 后台管理：用户、项目、公告、评论洞察和基础审计信息。
- 人力模块：超级管理视角、部门经理视角、个人视角、空闲池、交互完成态。
- 人力指派：推荐候选人、负载冲突提示、超负荷二次确认和节点关系视图。
- AI 助手：首页 / 人力场景的 DeepSeek 配置、用量记录和后端密钥隔离。
- 通知：任务评论、@ 提及、公告和协作事件。

</details>

<details>
<summary><strong>后端契约与兼容</strong></summary>

- 工作区部门接口返回稳定部门顺序和 canonical key。
- 项目成员接口保留 legacy `members` 数组，同时提供 `memberItems` / `memberObjects`。
- 模板共享接口支持批量 recipients、权限 map 和旧 `sharedWith` 字段。
- 人力资源接口按部门别名过滤，并输出统一部门展示字段。
- 测试覆盖部门映射、成员 userId 优先、模板共享权限和旧 payload 兼容。

</details>

## 技术栈

前端位于 `frontend-source/`，使用 Vue 3、Vite、Pinia、Vue Router、Element Plus、Axios、Video.js 和 Excalidraw。

后端位于 `backend-source/`，使用 Node.js、Express、MySQL、Redis 预留、JWT、bcrypt、winston 和一组生产校验脚本。

## 本地运行

前端：

```powershell
cd frontend-source
npm ci
npm run dev
```

后端：

```powershell
cd backend-source
npm ci
copy .env.example .env
npm run start
```

生产构建：

```powershell
cd frontend-source
npm ci
npm run build
```

生产后端准备：

```powershell
cd backend-source
copy .env.production.example .env
npm ci
npm run db:prepare:production
npm run verify:production
npm run start:production
```

真实部署前请替换 `.env` 中的 `JWT_SECRET`、MySQL 连接、CORS 域名和 DeepSeek 后端密钥。不要把真实 `.env`、数据库文件、浏览器缓存或运行日志提交到仓库。

## 测试

前端核心测试：

```powershell
cd frontend-source
npm run test:frontend
```

前端生产构建：

```powershell
cd frontend-source
npm run build
```

后端生产校验：

```powershell
cd backend-source
npm run verify:production
```

`v1.0.2` 新增的协同成员、模板共享、部门 taxonomy 和人力资源兼容测试会随前后端测试链路一起运行。

## 发布与打包

本仓库使用 Git tag 标记发布版本。`v1.0.2` 推送后，GitHub Release 会提供 Source code `zip` 和 `tar.gz` 下载入口。

本地发布包建议使用：

```powershell
git archive --format=zip --output=packages/MIX-OC-v1.0.2-source.zip v1.0.2
```

发布包清单见 [packages/v1.0.2/README.md](packages/v1.0.2/README.md)。

## 仓库内容说明

已提交内容包括源码、测试、文档、示例环境配置和必要的产品截图。已排除内容包括：

- `node_modules/`
- 前端构建产物 `dist/`、`frontend-dist/`
- 真实 `.env` 与本地密钥
- 运行日志、QA 截图、临时脚本、浏览器输出
- 压缩包、临时发布包、本地缓存和 `backend-deploy-stage-*/`

## 目录

```text
frontend-source/    Vue 3 前端应用
backend-source/     Express API 服务
docs/               架构、接口、部署、验收和后端对接文档
release-notes/      发布说明
packages/           发布包清单和打包说明
人力/               人力模块设计与截图
第一版修改内容/      需求图、设计图和验收截图
```
