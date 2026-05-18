# 真实用户初始化说明

## 范围

- 后端种子来源：`G:\mutou\文档\用户列表.md` 中“数据库导入用用户表”
- 同步到：
  - MySQL 初始化用户（`users`）
  - 后端内存 fallback 用户
  - 前端 `demoUsers` 通讯录种子

## 固定管理员账号

- 固定唯一账号：
  - `username: admin`
  - `password: admin`
  - `role: admin`
- 初始化阶段每次强制回写 admin 密码和角色。
- 接口层禁止 admin 走修改密码/找回密码。

## 真实用户导入规则

- `username` = 账号列
- `name` = 姓名列
- `department` = 部门列
- `job` = 备注/花名；为空时用部门；再兜底“成员”
- `role` 统一为 `user`
- `status` 固定 `active`
- `email`/`phone` 默认空
- `mbti` 默认 `ENTP`
- 默认密码统一：`MIX801002`

## 管理员候选（权限预留）

- 文档中“用户角色=管理员”的真实用户，不赋予 `role=admin`。
- 仅通过 `profileNote` / `characterLabel` 记录“权限预留：管理员候选”。
- 当前未改表结构。后续可新增字段：`permission_role`、`admin_candidate`。

## 重复账号处理

- `MIX-yuanye` 在源数据中出现 2 条（美术设计一部、美术设计二部）。
- 去重策略：按账号唯一保留第一条记录，并在 `profileNote` 追加重复部门说明。

## 虚拟用户清理

- 已清理旧虚拟账号 `MIX-yanyunxue`（数据库初始化时删除）。
- 前端通讯录种子已移除张三、李四、星星、eva 等演示账号。

## 统计

- 源记录：72
- 去重后导入账号：71
- 管理员候选：23
