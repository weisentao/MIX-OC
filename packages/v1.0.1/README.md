# MIX-OC v1.0.1 发布包清单

这个目录记录 `v1.0.1` 的打包方式。实际源码包建议通过 GitHub Release 的 Source code 下载，或在本地用 Git 生成同等内容。

## 推荐产物

- Git tag：`v1.0.1`
- GitHub Release 页面：`https://github.com/weisentao/MIX-OC/releases/tag/v1.0.1`
- 本地源码包：`packages/MIX-OC-v1.0.1-source.zip`

## 本地打包命令

```powershell
git archive --format=zip --output=packages/MIX-OC-v1.0.1-source.zip v1.0.1
```

这个包只包含 Git 已跟踪文件，不包含 `node_modules`、真实 `.env`、运行日志、临时文件和构建缓存。

## 验收清单

- README 已更新为 `v1.0.1`。
- 前后端 package 版本已同步为 `1.0.1`。
- 发布说明已写入 `release-notes/v1.0.1.md`。
- 标签推送后，GitHub 会自动生成 Source code `zip` 和 `tar.gz`。
