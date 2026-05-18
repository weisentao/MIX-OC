# xjg-api 运维 Runbook

更新时间：2026-05-13 00:31:03 +08:00

本 runbook 用于 `G:\mutou\xm\xjg-api` 后端运维。当前阶段是上线准备，不代表已经上线。

## 1. 如何启动后端

后端目录：

```powershell
cd /d G:\mutou\xm\xjg-api
```

安装依赖：

```powershell
npm install
```

确认 `.env` 存在并包含关键项：

```powershell
Test-Path .env
```

启动：

```powershell
npm start
```

预期：

- 服务监听 `PORT`，当前目标端口为 `13001`。
- MySQL 可用时自动准备认证和工作台相关表。
- MySQL 不可用时后端可能进入内存 fallback，但该状态不能作为生产上线通过依据。

## 2. 如何查看健康检查

本机后端：

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:13001/health
Invoke-WebRequest -UseBasicParsing http://localhost:13001/api/health
```

预期响应包含：

```json
{
  "ok": true,
  "service": "xjg-api"
}
```

如果前端生产入口已配置反代，还需要验证：

```text
GET /api/health
```

## 3. 如何查看日志

如果后端在当前控制台直接通过 `npm start` 启动，日志会输出到该控制台。

如果通过重定向方式启动，项目根目录已有类似日志文件：

- `run-*.log`
- `run-*.out.log`
- `run-*.err.log`

查看最近日志：

```powershell
Get-ChildItem -Path G:\mutou\xm\xjg-api -Filter "*.log" |
  Sort-Object LastWriteTime -Descending |
  Select-Object Name,Length,LastWriteTime
```

查看某个日志尾部：

```powershell
Get-Content -Path G:\mutou\xm\xjg-api\run-ag1-prod-20260512232316.out.log -Tail 80
```

重点关注：

- `xjg-api started on http://localhost:13001`
- `MySQL unavailable`
- `FAIL_*`
- `/workspace/*` 返回 `503`
- `Unhandled error`

## 4. 如何重启服务

先定位 13001 端口进程：

```powershell
Get-NetTCPConnection -LocalPort 13001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess,State
```

查看进程命令：

```powershell
Get-CimInstance Win32_Process -Filter "ProcessId=<PID>" |
  Select-Object ProcessId,Name,CommandLine
```

在确认该进程就是 `xjg-api` 后，停止并重新启动：

```powershell
Stop-Process -Id <PID>
cd /d G:\mutou\xm\xjg-api
npm start
```

如果后端由服务管理器、计划任务、PM2、NSSM 或部署平台托管，应使用对应平台的重启命令，不要直接结束未知进程。

## 5. 如何判断 MySQL 断连

端口检查：

```powershell
Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
```

服务检查：

```powershell
Get-Service | Where-Object { $_.Name -match 'mysql|mariadb' -or $_.DisplayName -match 'mysql|mariadb' }
```

项目检查：

```powershell
cd /d G:\mutou\xm\xjg-api
npm run db:check:production
```

常见断连表现：

- `FAIL_ECONNREFUSED`
- `FAIL_MYSQL_UNREACHABLE`
- 后端日志出现 `MySQL unavailable`
- 登录后访问 `/workspace/bootstrap` 或 `/workspace/*` 返回 `503`
- 错误信息包含 `MySQL unavailable for modular workspace API`

注意：`/appState/main` fallback 可用于兼容旧状态，但不能证明生产 MySQL 链路可用。

## 6. 如何重新跑 verify:production

前置条件：

- MySQL 已启动，3306 已监听。
- `.env` 指向正确 MySQL。
- `MYSQL_DATABASE=xjg`。
- `JWT_SECRET` 不是默认占位。

执行：

```powershell
cd /d G:\mutou\xm\xjg-api
npm run verify:production
```

该命令依次运行：

- `npm run db:check:production`
- `npm run smoke:production`
- `npm run smoke:schedule`
- `npm run smoke:boards`

只有全部退出码为 0，才可把后端真实数据库链路视为通过。前端是否可上线还必须等待 UI 冻结、最终 `npm run build`、反代配置和浏览器验收通过。

## 7. 常见故障

### 13001 被占用

现象：

- `npm start` 失败，提示端口占用。
- `Get-NetTCPConnection -LocalPort 13001` 有监听进程。

处理：

```powershell
Get-NetTCPConnection -LocalPort 13001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess,State
Get-CimInstance Win32_Process -Filter "ProcessId=<PID>" |
  Select-Object ProcessId,Name,CommandLine
```

确认是旧后端进程后再停止；如果是其他服务，占用原因需要先确认。

### 3306 不通

现象：

- `Get-NetTCPConnection -LocalPort 3306` 无输出。
- `npm run db:check:production` 返回 `FAIL_ECONNREFUSED`。

处理：

- 启动 MySQL 服务或 Docker MySQL。
- 检查 `.env` 中 `MYSQL_HOST` 和 `MYSQL_PORT`。
- 确认防火墙和 MySQL 绑定地址允许本机连接。

### JWT_SECRET 默认值

现象：

- `npm run db:check:production` 返回 `FAIL_ENV_INVALID`。
- 输出包含 `JWT_SECRET uses a default insecure value`。

处理：

- 修改 `G:\mutou\xm\xjg-api\.env`。
- 将 `JWT_SECRET` 替换为生产用长随机值。
- 重启后端。
- 重新执行 `npm run db:check:production` 或 `npm run verify:production`。

### /workspace/* 503

现象：

- 登录成功，但 `/workspace/bootstrap` 或 `/workspace/*` 返回 `503`。
- 日志包含 `MySQL unavailable for modular workspace API`。

处理：

- 确认 MySQL 正常监听。
- 执行 `npm run db:check:production` 定位是连接、权限、数据库、表结构还是种子数据问题。
- 必要时在有备份和上线窗口的前提下执行 `npm run db:prepare:production`。

### 页面能打开但 MySQL-backed API 失败

现象：

- 前端页面 shell、登录页或旧状态页面可以打开。
- MySQL-backed API 返回 `503`，响应或日志包含 `MySQL unavailable`。
- 常见失败路径包括 `/workspace/bootstrap`、`/workspace/boards`、`/workspace/projects/:projectId/schedule`、`/workspace/tasks/:taskId/comments`。
- `/appState/main` 或文件 fallback 仍能返回内容，但生产验收不能把它当作通过依据。

处理：

1. 先确认后端进程存活：`GET http://localhost:13001/health` 与反代后的 `GET /api/health`。
2. 查看后端日志，区分 `MySQL unavailable for modular workspace API`、`MySQL unavailable for board API`、`MySQL unavailable for schedule API`。
3. 执行 `npm run db:check:production`，定位连接、账号权限、数据库、表结构、环境变量问题。
4. MySQL 恢复后执行 `npm run db:prepare:production`，仅在有备份和上线窗口时用于补齐表结构或种子。
5. 正式放行前必须依次通过 `npm run smoke:production`、`npm run smoke:boards`、`npm run smoke:schedule`。

### 前端 /api 反代错误

现象：

- 前端页面能打开，但登录、项目、任务、评论、画板等接口失败。
- `/api/health` 404、502、503 或指向错误服务。

处理：

- 确认后端 `http://localhost:13001/health` 正常。
- 检查 Web 服务器或部署平台反代配置，确保 `/api` 指向 `http://localhost:13001`。
- 确认前端生产入口不是 Vite dev server。
- 修改反代后重新访问 `/api/health`。

## 8. 当前本机状态快照

检查时间：2026-05-13 00:31 +08:00

- Node.js：`v24.15.0`
- npm：`11.12.1`
- MySQL：当前不可用，未发现 MySQL/MariaDB 服务，`mysql` 客户端不在 PATH。
- 3306：未监听。
- 13001：已监听，进程为 `node src/server.js`。
- 15173：已监听，进程为 Vite dev server。
- `.env`：存在。
- `JWT_SECRET`：当前值命中 `scripts/check-production-mysql.mjs` 的默认不安全值清单。
- `MYSQL_DATABASE`：`xjg`。
- `MYSQL_USER`：当前为 `root`，生产检查脚本提示只适合本地调试，正式上线建议使用专用应用用户。
- `npm run db:check:production`：当前返回 `FAIL_ECONNREFUSED`，并提示 `JWT_SECRET` 默认不安全值。

