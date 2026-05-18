# MIX-OC

MIX-OC 是一套面向影视、AIGC、设计与后期团队的项目协同系统。它把项目树、任务流转、排期时间线、协同成员、模板共享、人力负载和后台管理放在同一个工作台里，适合项目经理、部门负责人和执行成员一起使用。

当前发布版本：`v1.0.1`

[查看 v1.0.1 发布说明](release-notes/v1.0.1.md) · [GitHub Releases](https://github.com/weisentao/MIX-OC/releases/tag/v1.0.1)

## 界面预览

<details open>
<summary><strong>工作台与流程任务</strong></summary>

任务工作台围绕项目树、任务模块、评论、标签、归档和模板管理组织。任务卡片按部门模块上色，拖拽时会给出明确的落点反馈。

<p>
  <img src="docs/06-客户反馈/流程页面修改/流程页面修改_图片/embedded_contact_sheet.png" alt="流程页面功能总览" width="100%">
</p>

</details>

<details>
<summary><strong>排期与项目模板</strong></summary>

排期页支持时间线、看板、节点视图切换，项目排期模板可以复用到新项目中。`v1.0.1` 优化了排期创建入口的部门选择和旧数据兼容。

<p>
  <img src="第一版修改内容/c8078676b8a1bc05011bb9c81de28bfe.png" alt="排期模板与共享模板设计" width="100%">
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
<summary><strong>人力推荐与超负荷确认</strong></summary>

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

## v1.0.1 更新

### 新增

- 协同成员弹窗新增部门树：项目管理、美术设计一/二部、三维动态设计部、视效包装一/二/三部可以按树形结构筛选。
- 新建任务弹窗新增部门树选择，任务会保存 `department`、`departmentKey` 和 `departmentLabel`，后续同步和排期能识别更细的部门归属。
- 排期创建弹窗加入新部门入口，同时保留旧排期模块值，编辑历史数据时不会强行重映射。
- 新增 `ScheduleCreateDialog` 源码契约测试，把新部门入口和旧模块兼容纳入前端测试链路。

### 优化

- 任务模块卡片使用部门色彩变量，拖拽、选中和高亮状态更容易识别。
- 排期工具栏的部门筛选统一为“全部、项目管理、美术设计、三维动态设计部、视效包装”，减少旧分类造成的视觉噪音。
- 成员权限弹窗的搜索、已加入状态和可编辑/只读列表更清楚。
- 移除工作台顶部重复的新建任务入口，减少用户在流程和排期之间误点。

### 修复

- 修复任务下发时部门信息没有进入本地任务 payload 的问题。
- 修复排期筛选对新旧部门 key 的兼容范围不足的问题。
- 修复旧排期模块在编辑时被新部门列表吞掉的问题。
- 修复部分源码契约测试没有覆盖新交互结构的问题。
- 修复生产登录流程 smoke 对“密保问题未启用”中文提示的判断，生产校验结果更贴近当前接口文档。
- 修复排期快照创建时误触发评论通知变量导致 500 的问题。

## 功能清单

<details open>
<summary><strong>项目与任务工作台</strong></summary>

- 项目树、项目归档、项目排序、项目详情编辑。
- 任务创建、任务拖拽、状态流转、评论、负责人、时间范围和标签。
- 模块化任务列表：项目管理、AIGC、美术设计、三维动态设计部、动效设计、视效包装等。
- 任务模板与项目模板复用，支持模板分享和权限管理。

</details>

<details>
<summary><strong>排期中心</strong></summary>

- 时间线、看板、节点视图、固定表格视图。
- 排期环节创建、编辑、导出、缩放、部门筛选和任务关联。
- 旧模块兼容：历史 AIGC、动效、后期等分类仍可被识别。
- 项目排期模板可以沉淀成可复用模板。

</details>

<details>
<summary><strong>协作与权限</strong></summary>

- 项目成员、联系人、关注好友和部门树筛选。
- 权限分组：可编辑、只读、不可编辑。
- 模板分享弹窗支持居中展示并挂载到 body，低高度窗口更稳定。
- 通讯录支持头像、部门、邮箱、MBTI、职务、手机号和关注状态。

</details>

<details>
<summary><strong>后台、人力与 AI 能力</strong></summary>

- 后台管理：用户、项目、公告、评论洞察和基础审计信息。
- 人力模块：超级管理视角、部门经理视角、个人视角、空闲池、交互完成态。
- AI 助手：首页/人力场景的 DeepSeek 配置、用量记录和后端密钥隔离。
- 通知：任务评论、@ 提及、公告和协作事件。

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

后端生产校验：

```powershell
cd backend-source
npm run verify:production
```

`v1.0.1` 新增的排期部门兼容测试已经接入 `npm run test:schedule`。

## 发布与打包

本仓库使用 Git tag 标记发布版本。`v1.0.1` 推送后，GitHub 会自动提供 Source code `zip` 和 `tar.gz` 下载入口。

本地发布包建议使用：

```powershell
git archive --format=zip --output=packages/MIX-OC-v1.0.1-source.zip v1.0.1
```

发布包清单见 [packages/v1.0.1/README.md](packages/v1.0.1/README.md)。

## 仓库内容说明

已提交内容包括源码、测试、文档、示例环境配置和必要的产品截图。已排除内容包括：

- `node_modules/`
- 前端构建产物 `dist/`、`frontend-dist/`
- 真实 `.env` 与本地密钥
- 运行日志、QA 截图、临时脚本、浏览器输出
- 压缩包、临时发布包和本地缓存

## 目录

```text
frontend-source/    Vue 3 前端应用
backend-source/     Express API 服务
docs/               架构、接口、部署和验收文档
release-notes/      发布说明
packages/           发布包清单和打包说明
人力/               人力模块设计与截图
第一版修改内容/      需求图、设计图和验收截图
```
