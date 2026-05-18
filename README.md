# 第一版源代码交接说明

更新时间：2026-05-15

这个目录是第一版上线/交接用的源代码复制包。包内已经按前端、后端、前端静态构建产物和说明文档拆开，方便上线人员、后续开发人员和验收人员分别使用。

## 1. 目录怎么用

```text
第一版源代码/
  frontend-source/   前端源码，来源：N:\mutou\xm\xjg
  frontend-dist/     前端最新构建产物，可用于静态部署
  backend-source/    后端源码，来源：N:\mutou\xm\xjg-api
  docs/              精选说明文档、接口文档、上线文档
  release-notes/     最新进度与验收状态材料
  版本核对.md         当前锁定版本与 npm 当前最新版本对照
```

## 2. 当前技术栈

前端是 Vue 3 + Vite 项目：

- Vue：lockfile 当前锁定 `3.5.34`
- Vite：lockfile 当前锁定 `5.4.21`
- Vue Router：`4.6.4`
- Pinia：`2.3.1`
- Element Plus：`2.14.0`
- Axios：`1.16.0`
- Excalidraw：`0.18.1`
- React / React DOM：`18.3.1`，主要用于 Excalidraw/协作画板集成

后端是 Node.js + Express API 服务：

- Node.js：项目要求 `>=18.0.0`
- Express：lockfile 当前锁定 `4.22.1`
- MySQL 客户端 `mysql2`：`3.22.3`
- Redis 客户端 `ioredis`：`5.10.1`
- BullMQ：`5.76.7`，当前偏预留/队列能力
- JWT：`jsonwebtoken 9.0.3`
- bcrypt：`5.1.1`
- dotenv：`16.6.1`
- winston：`3.19.0`

注意：本复制包没有擅自升级依赖，优先保证第一版上线稳定性。2026-05-15 查询 npm registry 时，部分上游已经有更高主版本，例如 Vite 8、Express 5、React 19、bcrypt 6、dotenv 17。是否升级需要单独开升级分支、跑完整构建和回归测试，不能混进第一版上线复制包。

更完整的依赖版本对照见 `版本核对.md`。

## 3. 前端运行与构建

前端源码目录：

```powershell
cd /d N:\mutou\第一版源代码\frontend-source
npm ci
npm run dev
```

生产构建：

```powershell
cd /d N:\mutou\第一版源代码\frontend-source
npm ci
npm run build
```

本复制包已经在 2026-05-15 重新执行过一次前端构建，构建产物放在：

```text
N:\mutou\第一版源代码\frontend-dist
```

生产环境前端 API 基础路径保持为：

```dotenv
VITE_API_BASE_URL=/api
```

部署时应由 Nginx 或等价网关把 `/api/*` 反向代理到后端，例如 `http://127.0.0.1:13001/*`。

## 4. 后端运行与生产准备

后端源码目录：

```powershell
cd /d N:\mutou\第一版源代码\backend-source
npm ci
```

准备环境变量：

```powershell
copy .env.production.example .env
```

生产必须修改以下值：

- `NODE_ENV=production`
- `PORT=13001`，或按实际部署端口填写
- `CORS_ORIGIN` 改为前端正式域名
- `JWT_SECRET` 改为长随机值，不能使用示例值
- `ADMIN_INITIAL_PASSWORD` 改为长随机值，不能使用 `admin`
- `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`
- `REDIS_*` 按实际 Redis 策略填写；当前阶段 Redis 不通不会阻断后端启动，但上线前要明确策略

生产数据库准备与验证：

```powershell
cd /d N:\mutou\第一版源代码\backend-source
npm run db:prepare:production
npm run verify:production
```

启动：

```powershell
npm run start:production
```

健康检查：

```text
GET http://localhost:13001/health
GET http://localhost:13001/api/health
```

## 5. 本次复制时刻的上线状态

当前代码和构建产物已经整理进复制包，但是否能正式上线仍以生产环境验证为准。上线必须至少满足：

- 后端 `.env` 使用生产随机 `JWT_SECRET`，不能使用默认示例值。
- MySQL 可连接，数据库 `xjg` 可用，生产迁移/seed 成功。
- `npm run verify:production` 通过。
- 前端使用冻结后的最终 `dist`，并确认 `/api` 走正式反向代理。
- 使用正式入口完成人工浏览器验收：登录、项目、任务、评论、标签、通讯录、后台、画板、排期相关流程。
- 线上切换前完成前端 `dist`、后端代码和 MySQL 数据库备份。

历史文档里有些路径仍写作 `G:\mutou`，本机当前项目路径是 `N:\mutou`，执行命令时请按实际路径替换。

## 6. 本复制包刻意没有带入的内容

为了让这个目录适合作为源码交接和上线复制，已排除：

- `node_modules/`
- 前后端历史运行日志：`*.log`、`*.out.log`、`*.err.log`
- 后端真实 `.env`
- 后端运行态 `data/`
- MySQL 数据目录：`mysql-data/`、`mysql-dev-data/`、`.runtime/`
- Playwright/Chrome 输出缓存：`output/`、`test-results/`、`.playwright-cli/`
- Codex/gstack 临时目录：`.codex-dev/`、`.gstack/`
- 临时打包目录：`deploy_tmp/`

不要把真实 `.env`、数据库数据目录、证书、私钥、浏览器缓存目录直接复制给别人。上线机器应单独配置 `.env`，数据库应走迁移、备份和恢复流程。

## 7. 推荐阅读顺序

1. `docs/01-项目概览/已经实现的功能-2026-05-15.md`
2. `docs/01-项目概览/项目概述.md`
3. `docs/01-项目概览/项目目录结构.md`
4. `docs/02-技术架构/前端技术架构&框架规范.md`
5. `docs/02-技术架构/后端技术架构&框架规范.md`
6. `docs/02-技术架构/数据库表结构设计.md`
7. `docs/03-部署上线/正式上线操作手册.md`
8. `docs/03-部署上线/production-readiness-checklist.md`
9. `docs/03-部署上线/deploy-frontend.md`
10. `docs/03-部署上线/deploy-backend.md`

## 8. 后续优先级

- 在生产机器上重新填写 `.env` 并替换默认/示例密钥。
- 确认 MySQL 正式环境、专用应用用户和数据库备份策略。
- 跑后端 `npm run verify:production`，不要用 `/appState/main` fallback 当作正式通过依据。
- 用 `frontend-dist` 完成静态部署，并确认 `/api` 反代正确。
- 做真实账号浏览器验收和回滚演练。
- 若要追赶上游最新主版本，单独做依赖升级计划和回归测试。
