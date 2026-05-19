# MIX-OC v1.0.2 发布包清单

这个目录记录 `v1.0.2` 的打包方式。实际源码包建议通过 GitHub Release 的 Source code 下载，或在本地用 Git 生成同等内容。

## 推荐产物

- Git tag：`v1.0.2`
- GitHub Release 页面：`https://github.com/weisentao/MIX-OC/releases/tag/v1.0.2`
- 本地源码包：`packages/MIX-OC-v1.0.2-source.zip`

## 本地打包命令

```powershell
git archive --format=zip --output=packages/MIX-OC-v1.0.2-source.zip v1.0.2
```

这个包只包含 Git 已跟踪文件，不包含 `node_modules`、真实 `.env`、运行日志、临时部署目录、构建缓存和本地压缩包。

## 本版内容

- 前后端 package 版本同步为 `1.0.2`。
- README 更新为 `v1.0.2`，新增产品简介、版本摘要、折叠截图和功能清单。
- 发布说明写入 `release-notes/v1.0.2.md`。
- 协同通讯录、项目成员权限、模板共享、部门 taxonomy、人力资源视图和相关契约测试纳入本次源码包。
- `.gitignore` 排除 `backend-deploy-stage-*/`，避免临时部署目录进入发布。

## 验收清单

- `git diff --check`
- `frontend-source`: `npm run test:frontend`
- `frontend-source`: `npm run build`
- `backend-source`: `npm run verify:production`
- tag 推送后，GitHub 自动生成 Source code `zip` 和 `tar.gz`。
