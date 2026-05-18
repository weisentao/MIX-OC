# 2026-05-16 agent：本地启动/上线脚本与端口口径修复

## 目标

补一份可靠的一键本地验收启动/检查脚本，统一本地验收端口口径为 MySQL `3306`、后端 `13001`、前端 `15173`，并修正文档中易误导的旧端口描述。

## 分工

- 本轮仅处理本地启动/检查脚本与上线文档口径。
- 不修改前端业务代码，不回滚其他人运行中的实例，不写入任何 DeepSeek 密钥明文。

## 文件

- 新增：`backend-source/scripts/local-stack-acceptance.ps1`
- 新增：`backend-source/test/local-stack-acceptance-script.test.js`
- 新增：`backend-source/test/local-stack-acceptance-docs.test.js`
- 新增：`backend-source/docs/ai-trace/2026-05-16-agent-acceptance-launch-script.md`
- 修改：`docs/03-部署上线/第一版上线清单.md`
- 修改：`docs/03-部署上线/联调验收清单.md`
- 修改：`docs/03-部署上线/正式上线操作手册.md`

## 接口

- `root-mounted`：`GET /health`
- `root-mounted`：`GET /api/health`
- `frontend-detected`：前端 Vite 本地代理 `/api/* -> http://127.0.0.1:13001`

## 验证

- 静态测试：
  - `node --test test/local-stack-acceptance-script.test.js test/local-stack-acceptance-docs.test.js`
  - 结果：通过
- 实机脚本：
  - `powershell -ExecutionPolicy Bypass -File .\scripts\local-stack-acceptance.ps1 -Action start-and-check`
  - 结果：通过；确认 `3306`、`13001`、`15173` 均已监听，后端 `/health`、后端 `/api/health`、前端代理 `/api/health` 与前端根路径均返回成功

## 风险

- 一键脚本默认复用现有监听实例；若端口被其他非目标服务占用，脚本只会报出现状，不会清理冲突进程。
- 文档中 `docs/03-部署上线/**` 之外仍可能存在历史路径或旧机器路径示例，本轮未做全仓替换。
