# xjg-api

Backend service for `G:\mutou\xm\xjg`.

## Tech Stack

- Node.js (>= 18)
- Express
- MySQL (`mysql2/promise`)
- JWT (`jsonwebtoken`)
- bcrypt
- winston
- dotenv
- Redis (`ioredis`, phase-2 reserved)
- BullMQ (reserved)

## Run

1. Install dependencies

```bash
npm install
```

2. Prepare env file

```bash
copy .env.example .env
```

3. Start backend

```bash
npm start
```

4. Health check

```text
GET http://localhost:13001/health
GET http://localhost:13001/api/health
```

## Project Portable MySQL

For this project, the portable MySQL ZIP lives outside the backend repo and does not need a C: drive install:

- MySQL home: `N:\mutou\.runtime\mysql\mysql-8.4.9-winx64`
- Data directory: `N:\mutou\.runtime\mysql-data`
- Port: `3306`

Helper commands:

```powershell
.\scripts\portable-mysql.ps1 status
.\scripts\portable-mysql.ps1 init
.\scripts\portable-mysql.ps1 start
.\scripts\portable-mysql.ps1 stop
```

Normal startup must not clear business data. `npm run db:prepare:production` is schema/seed preparation only; destructive reset requires the explicit double-confirmed command documented in the production MySQL runbook.

## Startup Behavior

- `JWT_SECRET` is required. Missing it will stop startup.
- MySQL reachable:
  - auto create auth/workspace tables
  - seed fixed admin user `admin/admin`
  - seed real users from the local user list with default password `MIX801002`
  - remove legacy virtual user `MIX-yanyunxue`
- MySQL unreachable:
  - backend still starts in memory fallback mode
  - legacy `/appState/main` fallback remains available
- Redis unreachable:
  - only warn logs; startup does not fail in current phase

## Auth Notes

- Fixed super admin: `admin/admin` (must not change).
- `ADMIN_INITIAL_PASSWORD` is ignored for the fixed super admin; startup and prepare scripts repair only the admin hash to `admin/admin`.
- Real user example: `MIX-zhengjianxing/MIX801002`.
- Legacy virtual `MIX-yanyunxue/123456` is no longer default seed user.

## API Notes

- Frontend default baseURL: `/api`
- Vite proxy: `/api -> http://localhost:13001`
- Existing modular workspace APIs:
  - `workspace/bootstrap`
  - `project-groups`
  - `projects`
  - `tasks`
  - `comments`
  - `tags`
- Reserved placeholders:
  - `templates`
  - `boards`
- `/appState/main` fallback is kept for compatibility.

## Deployment Guide

See [docs/deploy-backend.md](docs/deploy-backend.md).

## Production Readiness

Before formal launch, use the production handoff and readiness docs:

- [Production MySQL runbook](docs/production-mysql-runbook.md)
- [Production unblock commands](docs/production-unblock-commands.md)
- [Production readiness checklist](docs/production-readiness-checklist.md)
- [Deployment handoff](docs/deployment-handoff.md)

Final backend verification command:

```bash
npm run verify:production
```

This command runs `db:check:production`, `db:check:schedule`, `smoke:production`, `smoke:schedule`, and `smoke:boards` in order. Any schedule schema or schedule smoke failure is `P0_BLOCKED` and production must not pass. `/appState/main` fallback is not a formal production pass condition.

