# Production Readiness Checklist

Use this checklist before first production launch. It is intentionally non-destructive: do not clear or reseed production data from this checklist alone.

验收口径：前端 fallback 不可作为通过依据。页面能打开、`/appState/main` 可读、或本地文件 fallback 生效，只能说明兼容兜底存在，不能证明生产 MySQL 链路可上线。正式验收必须看到 workspace smoke、board smoke、schedule smoke 全部通过。

| Area | Check | Owner | Status/Notes |
| --- | --- | --- | --- |
| Database | MySQL service or Docker container is running. | AG1 or deployer | Pending |
| Database | `MYSQL_HOST` and `MYSQL_PORT` point to the intended MySQL instance. | AG1 or deployer | Pending |
| Database | Port `3306` is listening, or `.env` uses the actual MySQL port. | AG1 or deployer | Pending |
| Database | Database `xjg` exists. | AG1 or deployer | Pending |
| Database | Database charset/collation is `utf8mb4` / `utf8mb4_unicode_ci`. | AG1 or deployer | Pending |
| Database | Application MySQL user can connect. | AG1 or deployer | Pending |
| Database | Application MySQL user has required permissions on `xjg.*`. | AG1 or deployer | Pending |
| Environment | `NODE_ENV=production` is set for production runtime. | AG1 or deployer | Pending |
| Environment | `JWT_SECRET` is set to a long random value and is not the default placeholder. | AG1 or deployer | Pending |
| Environment | `MYSQL_DATABASE=xjg`. | AG1 or deployer | Pending |
| Environment | `MYSQL_USER` is set to the dedicated app user. | AG1 or deployer | Pending |
| Environment | `MYSQL_PASSWORD` is set and matches the app user. | AG1 or deployer | Pending |
| Migration and seed | `npm run db:prepare:production` has completed successfully in non-reset mode; it must prepare schema/seed without clearing business data. | AG1 or deployer | Pending |
| Migration and seed | Core tables exist: `users`, `departments`, `roles`, `permissions`, `projects`, `tasks`, `task_comments`, `comment_mentions`, `project_members`, `address_book`, `contacts`, `shares`, `boards`, `board_members`, `board_shares`, `board_history` or `board_snapshots`, and `app_states`. | AG1 or deployer | Pending |
| Migration and seed | Fixed super administrator exists: `admin/admin`. | AG1 or deployer | Pending |
| Migration and seed | Real user seed is complete from `G:\mutou\文档\用户列表.md`. | AG1 or deployer | Pending |
| Migration and seed | Real users can log in with default password `MIX801002`. | AG2 | Pending |
| Migration and seed | Users with computer flag are `manager`. | AG1 or deployer | Pending |
| Migration and seed | Users without computer flag are `employee`. | AG1 or deployer | Pending |
| Migration and seed | Duplicate account `MIX-yuanye` is represented once with merged department/profile information. | AG1 or deployer | Pending |
| Demo data cleanup | A database backup exists before cleanup or reseed. | AG1 or deployer | Pending |
| Demo data cleanup | `data/storage-v1` is backed up in the same recovery unit as MySQL before cleanup or reseed. | AG1 or deployer | Pending |
| Demo data cleanup | Business data reset is only allowed with explicit command-line confirmation: `node scripts/prepare-production-db.mjs --reset-business-data --confirm-reset-business-data`. | AG1 or deployer | Pending |
| Demo data cleanup | `app_states` production table has no old test workspace state. | AG1 or deployer | Pending |
| Demo data cleanup | Test projects are cleared. | AG2 | Pending |
| Demo data cleanup | Test tasks are cleared. | AG2 | Pending |
| Demo data cleanup | Test comments are cleared. | AG2 | Pending |
| Demo data cleanup | Test comment mentions are cleared. | AG2 | Pending |
| Demo data cleanup | Test boards are cleared. | AG3 | Pending |
| Demo data cleanup | Board members, shares, history, and snapshots from demo data are cleared. | AG3 | Pending |
| Demo data cleanup | Template demo data and template shares are cleared. | AG2 | Pending |
| Demo data cleanup | Demo tags, project tags, project members, project groups, shares, and carousel notices are cleared. | AG2 | Pending |
| Demo data cleanup | `users`, `departments`, `roles`, `permissions`, `role_permissions`, `user_roles`, `address_book`, and `contacts` are not cleared unless there is an approved reseed plan. | AG1 or deployer | Pending |
| Verification | `npm run db:check:production` returns `PASS`. | AG1 or deployer | Pending |
| Verification | `npm run db:check:schedule` returns `PASS` inside `npm run verify:production`. | AG2 | Pending |
| Verification | Workspace smoke: `npm run smoke:production` returns success against MySQL. | AG2 | Pending |
| Verification | Schedule smoke: `npm run smoke:schedule` returns success inside `npm run verify:production`. | AG2 | Pending |
| Verification | Board smoke: `npm run smoke:boards` returns success against MySQL. | AG3 | Pending |
| Verification | `npm run verify:production` covers schedule schema and schedule smoke gates; any schedule failure is `P0_BLOCKED` and blocks launch. | AG2 or deployer | Pending |
| Verification | Admin login smoke passes. | AG2 | Pending |
| Verification | Real manager login smoke passes. | AG2 | Pending |
| Verification | Real employee login smoke passes. | AG2 | Pending |
| Verification | Empty production workspace state is verified against MySQL, not fallback. | AG2 | Pending |
| Verification | Frontend can log in with real accounts. | AG4 | Pending |
| Verification | Frontend can load the workspace without demo projects, tasks, comments, boards, or templates. | AG4 | Pending |
| Verification | Frontend API base URL points to the production backend or reverse proxy. | AG4 | Pending |
| Release gate | Backend process starts with `npm start`. | AG1 or deployer | Pending |
| Release gate | `/health` returns healthy. | AG1 or deployer | Pending |
| Release gate | `/api/health` returns healthy if routed through the reverse proxy. | AG4 | Pending |
| Release gate | Production smoke does not pass through `/appState/main` fallback. | AG2 | Pending |
| Release gate | Frontend fallback is disabled as evidence: any `503 MySQL unavailable` from workspace, board, or schedule APIs blocks launch even if the page renders. | Manager/user | Pending |
| Release gate | Known remaining risks are documented before launch. | Manager/user | Pending |
| Release gate | Final launch decision is approved. | Manager/user | Pending |
