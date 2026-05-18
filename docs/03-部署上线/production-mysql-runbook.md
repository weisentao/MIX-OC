# Production MySQL Runbook

This runbook is for the first production launch of `xjg-api` with a real MySQL database. Production smoke must fail when MySQL is unavailable; `/appState/main` fallback is not a production pass condition.

## Current Target

- Backend directory: `G:\mutou\xm\xjg-api`
- MySQL host: `127.0.0.1`
- MySQL port: `3306`
- Database: `xjg`
- Backend port: `13001`
- Production init command: `npm run db:prepare:production` (schema and seed only; does not clear business data)
- Production smoke command: `npm run smoke:production`

## 1. Option A: Project Portable MySQL ZIP

Use the project-local ZIP build when you do not want to install MySQL globally. Do not install MySQL to C:. The downloaded ZIP is expected at:

- MySQL ZIP home: `N:\mutou\.runtime\mysql\mysql-8.4.9-winx64`
- Data directory: `N:\mutou\.runtime\mysql-data`
- Host and port: `127.0.0.1:3306`

The data directory is project-local runtime state. Do not delete it and do not clear business data during normal startup.

Helper commands from `N:\mutou\xm\xjg-api`:

```powershell
.\scripts\portable-mysql.ps1 status
.\scripts\portable-mysql.ps1 init
.\scripts\portable-mysql.ps1 start
.\scripts\portable-mysql.ps1 stop
```

Use `init` only when `N:\mutou\.runtime\mysql-data` has not been initialized. `start` and `stop` do not run `db:prepare:production`, do not run reset flags, and must not clear business data.

After the listener is up, run schema and seed preparation separately:

```powershell
npm run db:prepare:production
npm run db:check:production
```

The normal prepare command remains non-destructive. The destructive reset form is documented later and requires explicit double confirmation.

## 2. Option B: Start Local MySQL On Windows

Run these commands in PowerShell:

```powershell
Get-Service | Where-Object { $_.Name -match 'mysql|mariadb' -or $_.DisplayName -match 'mysql|mariadb' }
Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
Get-Command mysql,mysqld,mariadb,mariadbd -ErrorAction SilentlyContinue
```

Expected:

- A service such as `MySQL`, `MySQL80`, or `MariaDB` exists.
- Port `3306` is listening.
- The `mysql` client is available, or you know the full path to it.

If the service exists but is stopped:

```powershell
Start-Service MySQL80
Set-Service MySQL80 -StartupType Automatic
```

If the service name is different, replace `MySQL80` with the actual service name.

If no service and no command exist, install MySQL Server 8.x or MariaDB, then re-run the checks.

## 3. Option C: Start MySQL With Docker

Use this option only if Docker is already installed and the team accepts Docker for the local production-like environment. Do not run these commands if an existing MySQL service is already using port `3306`.

Check Docker first:

```powershell
docker version
docker ps
```

Create a named volume:

```powershell
docker volume create xjg-mysql-data
```

Start MySQL 8 on port `3306`:

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

Verify the container:

```powershell
docker ps --filter "name=xjg-mysql"
docker logs xjg-mysql
Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
```

Connect from the host:

```powershell
mysql -h 127.0.0.1 -P 3306 -u xjg_app -p xjg
```

If the host does not have the `mysql` client, use the container client:

```powershell
docker exec -it xjg-mysql mysql -u xjg_app -p xjg
```

Stop and start without deleting data:

```powershell
docker stop xjg-mysql
docker start xjg-mysql
```

Do not remove the container or volume unless there is an approved backup and rebuild plan.

## 4. Create Database

Connect with a MySQL administrator account:

```powershell
mysql -h 127.0.0.1 -P 3306 -u root -p
```

Create the production database:

```sql
CREATE DATABASE IF NOT EXISTS xjg
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

## 5. Create And Authorize Application User

Recommended production user:

```sql
CREATE USER IF NOT EXISTS 'xjg_app'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
CREATE USER IF NOT EXISTS 'xjg_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-password';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON xjg.* TO 'xjg_app'@'localhost';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON xjg.* TO 'xjg_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

The current development `.env` uses `root/123456`. For production, prefer a dedicated application user instead of `root`.

## 6. .env Example

```dotenv
NODE_ENV=production
PORT=13001

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=xjg_app
MYSQL_PASSWORD=replace-with-a-strong-password
MYSQL_DATABASE=xjg
MYSQL_CONNECTION_LIMIT=10
MYSQL_CONNECT_TIMEOUT=5000
```

Rules:

- `MYSQL_DATABASE` must be `xjg`.
- `MYSQL_CONNECT_TIMEOUT` is optional, but if set it must be a positive integer in milliseconds.
- Use `utf8mb4` for Chinese names, comments, tasks, and board content.
- Keep `/appState/main` only as compatibility fallback, not as production data source.

## 7. Execution Order

From `G:\mutou\xm\xjg-api`:

```powershell
npm install
npm run db:prepare:production
npm start
npm run smoke:production
```

Optional direct database check:

```powershell
npm run db:check:production
```

The direct check verifies:

- Production `.env` essentials are present.
- `JWT_SECRET` is not empty and not the default placeholder.
- `xjg` database is reachable.
- Core production tables exist.
- `admin` exists as the only super administrator.
- Real users are close to the expected 71 imported accounts.
- `manager` and `employee` user roles exist.

Check result codes:

- `PASS`: MySQL is reachable, schema exists, and seed checks pass.
- `FAIL_ECONNREFUSED`: no MySQL listener is reachable at `MYSQL_HOST:MYSQL_PORT`.
- `FAIL_ACCESS_DENIED`: account, password, host, or permission is wrong.
- `FAIL_UNKNOWN_DB`: database `xjg` does not exist or the selected database is wrong.
- `FAIL_SCHEMA_MISSING`: required core tables are missing.
- `FAIL_SEED_MISSING`: `admin`, real users, or required roles are missing.
- `FAIL_ENV_INVALID`: required `.env` values are missing or unsafe for production.

## 8. Backup Before Cleaning Test Data

Before any formal cleanup or reseed, create a database backup:

```powershell
$ts = Get-Date -Format "yyyyMMddHHmmss"
New-Item -ItemType Directory -Force backups | Out-Null
mysqldump -h 127.0.0.1 -P 3306 -u xjg_app -p --default-character-set=utf8mb4 xjg > "backups\xjg-before-clean-$ts.sql"
```

Do not run cleanup without a backup and an explicit production window.

The normal production prepare command is non-destructive. It creates or updates schema and idempotent seed data, and it must not clear business data:

```powershell
npm run db:prepare:production
```

Only run the destructive reset form after backup, approval, and a maintenance window:

```powershell
node scripts/prepare-production-db.mjs --reset-business-data --confirm-reset-business-data
```

The explicit reset form clears demo/business data from these areas:

- `app_states`
- `projects`
- `tasks`
- `task_comments`
- `comment_mentions`
- `boards`
- `board_members`
- `board_shares`
- `board_history`
- `board_snapshots`
- `templates`
- `template_shares`
- `tags`
- `project_tags`
- `project_members`
- `project_groups`
- `shares`
- `carousel_notices`

The prepare script does not treat fallback JSON as production initial data.

Do not clear these tables during normal production cleanup unless there is a documented reseed strategy:

- `users`
- `departments`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `address_book`
- `contacts`

## 9. Common Errors

### ECONNREFUSED

ECONNREFUSED is a listener-level failure. Do not run npm run db:prepare:production to fix ECONNREFUSED until a MySQL listener is reachable.

Meaning:

- MySQL is not running.
- MySQL is not installed.
- Port is wrong.
- MySQL is bound to another address.

Checks:

```powershell
Get-Service | Where-Object { $_.Name -match 'mysql|mariadb' -or $_.DisplayName -match 'mysql|mariadb' }
Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
Get-Command mysql,mysqld,mariadb,mariadbd -ErrorAction SilentlyContinue
```

Fix:

- Install MySQL Server or MariaDB if no service exists.
- Start the service if it exists but is stopped.
- Fix `MYSQL_HOST` and `MYSQL_PORT` in `.env`.

### ER_ACCESS_DENIED_ERROR

Meaning:

- `MYSQL_USER` or `MYSQL_PASSWORD` is wrong.
- MySQL user exists but is not allowed from `localhost` or `127.0.0.1`.

Fix:

- Re-check `.env`.
- Re-run the application user authorization SQL.
- If connecting to `127.0.0.1`, make sure `'xjg_app'@'127.0.0.1'` exists.

### Unknown Database / ER_BAD_DB_ERROR

Meaning:

- Database `xjg` does not exist.

Fix:

```sql
CREATE DATABASE IF NOT EXISTS xjg
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Then run:

```powershell
npm run db:prepare:production
```

### Permission Denied / Insufficient Privileges

Meaning:

- The app user can connect but cannot create/alter/read/write required tables.

Fix:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON xjg.* TO 'xjg_app'@'localhost';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON xjg.* TO 'xjg_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

Then run:

```powershell
npm run db:prepare:production
node scripts/check-production-mysql.mjs
```

### Character Set Problems

Symptoms:

- Chinese names become garbled.
- Comments or task titles save as `?`.
- Inserts fail with invalid string value errors.

Fix:

```sql
ALTER DATABASE xjg CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

New tables created by the backend migrations use `utf8mb4` and `InnoDB`.

If an existing table has the wrong charset, convert it during a maintenance window after backup:

```sql
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

