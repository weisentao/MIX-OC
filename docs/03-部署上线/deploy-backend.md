# xjg-api Backend Deployment

## 1. Runtime Requirements

- Node.js: `>= 18` (recommended: Node 18/20 LTS)
- npm: version bundled with Node
- MySQL: 8.x or compatible

## 2. Install

In `G:\mutou\xm\xjg-api`:

```bash
npm install
```

## 3. Configure Environment

Copy env template:

```bash
copy .env.example .env
```

Minimum required values in `.env`:

- `JWT_SECRET` (required; if empty backend startup fails)
- `PORT` (default `13001`)
- `MYSQL_*` (target DB should be `xjg`)
- `REDIS_*` (optional in current phase; failure only logs warning)

## 4. Create MySQL Database (xjg)

Connect to MySQL and run:

```sql
CREATE DATABASE IF NOT EXISTS xjg
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

No manual table creation is required:
- When MySQL is reachable, backend startup runs auto table creation and seed logic.

## 5. Start Service

In `G:\mutou\xm\xjg-api`:

```bash
npm start
```

Expected behavior:
- MySQL reachable: auth/workspace tables auto-created, users seeded.
- MySQL unreachable: service still starts in fallback mode.
- Redis unreachable: warning only, service still starts.

Production acceptance must use MySQL-backed workspace APIs. Legacy `/appState/main` fallback is compatibility behavior only and must not be used as the production pass condition.

## 6. Health Check

```text
GET http://localhost:13001/health
GET http://localhost:13001/api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "xjg-api",
  "env": "development",
  "time": "2026-05-12T00:00:00.000Z"
}
```

## 7. Frontend Reverse Proxy

Current frontend Vite proxy:

- `/api` -> `http://localhost:13001`

So frontend requests like `/api/login` are forwarded to backend `http://localhost:13001/login`.

## 8. Login/Seed Expectations

- Fixed super admin (must remain unchanged): `admin / admin`
- Real users source: local `user list` markdown under the project documents directory
- Real user default password: `MIX801002`
- Legacy virtual user `MIX-yanyunxue/123456` should not remain as default seed.

## 9. Smoke Test Commands

```bash
node scripts/smoke-auth.mjs
node scripts/smoke-workspace.mjs
npm run smoke:production
```

These scripts print clear PASS/FAIL states and non-zero exit code on failures.
When MySQL is not listening on `127.0.0.1:3306`, `npm run db:prepare:production` and `npm run smoke:production` are expected to fail with a clear MySQL connection error.

