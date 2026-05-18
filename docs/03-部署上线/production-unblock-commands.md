# Production Unblock Commands

This document is the shortest command path for unblocking production MySQL readiness. It does not replace the detailed troubleshooting docs:

- MySQL troubleshooting: `docs/production-mysql-runbook.md`
- Launch checklist: `docs/production-readiness-checklist.md`

Do not execute cleanup or reseed commands without a backup and a launch window.

## 1. Windows MySQL Option

Check whether MySQL is installed:

```powershell
Get-Service | Where-Object { $_.Name -match 'mysql|mariadb' -or $_.DisplayName -match 'mysql|mariadb' }
Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
Get-Command mysql,mysqld,mariadb,mariadbd -ErrorAction SilentlyContinue
```

Expected success:

```text
A MySQL/MySQL80/MariaDB service is listed.
Port 3306 is listening.
mysql client or server command is found, or its install path is known.
```

Start the service if it exists:

```powershell
Start-Service MySQL80
Set-Service MySQL80 -StartupType Automatic
```

Expected success:

```text
Get-Service MySQL80 shows Status = Running.
Get-NetTCPConnection -LocalPort 3306 shows State = Listen.
```

If the service name is different, replace `MySQL80` with the actual service name.

## 2. Docker MySQL Option

Use this only if Docker is installed and port `3306` is not already used by a local MySQL service.

Check Docker:

```powershell
docker version
docker ps
```

Expected success:

```text
Docker client and server versions are printed.
docker ps returns without connection errors.
```

Create a persistent volume:

```powershell
docker volume create xjg-mysql-data
```

Expected success:

```text
xjg-mysql-data
```

Start MySQL 8:

```powershell
docker run --name xjg-mysql `
  -e MYSQL_ROOT_PASSWORD=replace-with-root-password `
  -e MYSQL_DATABASE=xjg `
  -e MYSQL_USER=xjg_app `
  -e MYSQL_PASSWORD=replace-with-a-strong-password `
  -p 3306:3306 `
  -v xjg-mysql-data:/var/lib/mysql `
  -d mysql:8.4 `
  --character-set-server=utf8mb4 `
  --collation-server=utf8mb4_unicode_ci
```

Expected success:

```text
A container id is printed.
docker ps --filter "name=xjg-mysql" shows the container as Up.
Get-NetTCPConnection -LocalPort 3306 shows State = Listen.
```

Verify:

```powershell
docker ps --filter "name=xjg-mysql"
docker logs xjg-mysql
```

If the host does not have the `mysql` client:

```powershell
docker exec -it xjg-mysql mysql -u xjg_app -p xjg
```

Expected success:

```text
mysql> prompt opens after entering the configured password.
```

## 3. Create Database SQL

Connect as a MySQL administrator:

```powershell
mysql -h 127.0.0.1 -P 3306 -u root -p
```

Run:

```sql
CREATE DATABASE IF NOT EXISTS xjg
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Expected success:

```text
Query OK
```

## 4. Create Application User SQL

Run as a MySQL administrator:

```sql
CREATE USER IF NOT EXISTS 'xjg_app'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
CREATE USER IF NOT EXISTS 'xjg_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-password';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON xjg.* TO 'xjg_app'@'localhost';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON xjg.* TO 'xjg_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

Expected success:

```text
Query OK
```

## 5. .env Checkpoints

Do not overwrite the real `.env` blindly. Edit these values intentionally:

```dotenv
NODE_ENV=production
PORT=13001
JWT_SECRET=replace-with-a-long-random-production-secret
JWT_EXPIRES_IN=7d

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=xjg
MYSQL_USER=xjg_app
MYSQL_PASSWORD=replace-with-a-strong-password
MYSQL_CONNECTION_LIMIT=10
```

Expected success:

```text
JWT_SECRET is not empty and not the default placeholder.
MYSQL_DATABASE is exactly xjg.
MYSQL_USER is a dedicated app user, not root.
MYSQL_PASSWORD matches the SQL user password.
```

## 6. Final Verification Commands

Run from `G:\mutou\xm\xjg-api`:

```powershell
npm run db:prepare:production
npm run db:check:production
npm run smoke:production
npm run smoke:boards
```

Expected success:

```text
npm run db:prepare:production prints JSON with "ok": true.
npm run db:check:production prints check-production-mysql: PASS.
npm run smoke:production exits 0.
npm run smoke:boards exits 0.
```

## 7. Failure Routing

Use these docs when a step fails:

- `FAIL_ECONNREFUSED`: see `docs/production-mysql-runbook.md`, Windows/Docker startup sections.
- `FAIL_ACCESS_DENIED`: see `docs/production-mysql-runbook.md`, authorization SQL section.
- `FAIL_UNKNOWN_DB`: see `docs/production-mysql-runbook.md`, create database section.
- `FAIL_SCHEMA_MISSING`: run `npm run db:prepare:production`, then see migration errors.
- `FAIL_SEED_MISSING`: run `npm run db:prepare:production`, then verify real user source and seed policy.
- `FAIL_ENV_INVALID`: fix `.env`, especially `JWT_SECRET`, then rerun `npm run db:check:production`.
- Smoke failure after MySQL passes: see `docs/production-readiness-checklist.md` and route to the responsible Agent.

