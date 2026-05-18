# Database Design (Phase 1)

## Goal
This phase evolves storage from `users + app_states` to normalized business tables while preserving `app_states` as compatibility fallback for existing frontend behavior.

## Runtime behavior
- If MySQL is reachable at boot, `ensureAuthTables()` runs and now also calls `ensureWorkspaceTables()`.
- If MySQL is unreachable, server still starts in fallback mode (existing behavior), and JSON/file fallback remains available.
- `app_states` is intentionally retained for backward compatibility during incremental migration.

## Table list

### users
Purpose: authentication and profile source of truth.

Key fields:
- `user_uid`, `username`, `password_hash`
- profile fields (`name`, `role`, `department`, `job`, `mbti`, etc.)
- `last_login_at`, `created_at`, `updated_at`

Future API mapping:
- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/me`

### app_states
Purpose: compatibility storage for whole app JSON snapshot.

Key fields:
- `id` (currently `main`)
- `data_json`
- `updated_by`, timestamps

Future API mapping:
- `GET /appState/main`
- `PUT /appState/main`

### project_groups
Purpose: top-level project tree grouping (e.g., game/business lines).

Key fields:
- `group_uid`
- `title`, `suffix`, `status`, `sort_order`
- `payload_json` (migration extension area)

Future API mapping:
- `GET /project-groups`
- `POST /project-groups`
- `PATCH /project-groups/:groupUid`

### projects
Purpose: project core entity.

Key fields:
- `project_uid`
- `legacy_project_id` (maps old numeric seed IDs)
- `group_uid`, `name`, `status`, `owner_text`
- `start_date`, `end_date`, `archived`, `sort_order`
- `payload_json`

Future API mapping:
- `GET /projects`
- `GET /projects/:projectUid`
- `POST /projects`
- `PATCH /projects/:projectUid`

### project_members
Purpose: project-level membership and role mapping.

Key fields:
- `member_uid`
- `project_uid`, `user_uid`, `member_name`
- `member_role` (`manager`/`editor`/`readonly` etc.)
- `department`, `department_en`, `status`, `joined_at`
- `payload_json`

Future API mapping:
- `GET /projects/:projectUid/members`
- `PUT /projects/:projectUid/members`

### tasks
Purpose: task card entity under projects.

Key fields:
- `task_uid`
- `project_uid`, `legacy_task_id`
- `title`, `task_type`, `module_key`
- `owner_user_uid`, `owner_text`
- `status`, `priority`
- `start_date`, `end_date`
- `archived`, `expanded`, `sort_order`
- `note_text`, `payload_json`

Future API mapping:
- `GET /projects/:projectUid/tasks`
- `POST /projects/:projectUid/tasks`
- `PATCH /tasks/:taskUid`

### task_comments
Purpose: task discussion stream.

Key fields:
- `comment_uid`
- `task_uid`, `project_uid`
- `user_uid`, `user_name`, `user_dept`, `tone`
- `content_text`, `commented_at`
- `payload_json`

Future API mapping:
- `GET /tasks/:taskUid/comments`
- `POST /tasks/:taskUid/comments`

### tags
Purpose: workspace/project tag dictionary.

Key fields:
- `tag_uid`
- `name`, `color`, `scope`, `status`, `sort_order`
- `is_system`, `payload_json`

Future API mapping:
- `GET /tags`
- `POST /tags`
- `PATCH /tags/:tagUid`

### project_tags
Purpose: many-to-many mapping between projects and tags.

Key fields:
- `project_uid`
- `tag_uid`, `tag_name`, `tag_color`
- `sort_order`

Future API mapping:
- `GET /projects/:projectUid/tags`
- `PUT /projects/:projectUid/tags`

### templates
Purpose: template tree and task template payload storage.

Key fields:
- `template_uid`
- `legacy_template_id`
- `title`, `group_key`, `parent_template_uid`
- `owner_user_uid`, `visibility`, `is_locked`
- `sort_order`, `task_count`
- `content_json`, `payload_json`

Future API mapping:
- `GET /templates`
- `POST /templates`
- `PATCH /templates/:templateUid`

### template_shares
Purpose: template sharing relationship and permission policy.

Key fields:
- `share_uid`
- `template_uid`
- `from_user_uid`, `to_user_uid`
- `permission`, `status`, `note`
- `shared_at`, `expires_at`, `payload_json`

Future API mapping:
- `GET /templates/:templateUid/shares`
- `POST /templates/:templateUid/shares`
- `DELETE /templates/:templateUid/shares/:shareUid`

### boards
Purpose: collaboration board main record and latest snapshot.

Key fields:
- `board_uid`
- `scope_type`, `scope_uid`, `project_uid`
- `title`, `description_text`
- `owner_user_uid`, `is_archived`, `latest_version`
- `board_state_json`, `files_json`, `app_state_json`, `payload_json`

Future API mapping:
- `GET /boards`
- `GET /boards/:boardUid`
- `POST /boards`
- `PATCH /boards/:boardUid`

### board_history
Purpose: immutable board version history.

Key fields:
- `history_uid`
- `board_uid`, `version_no`
- `actor_user_uid`, `action_type`, `change_summary`
- `elements_json`, `files_json`, `app_state_json`, `payload_json`

Future API mapping:
- `GET /boards/:boardUid/history`
- `POST /boards/:boardUid/history`

### carousel_notices
Purpose: homepage/top notice rotation data.

Key fields:
- `notice_uid`
- `title`, `content_text`, `notice_type`
- `enabled`, `start_at`, `end_at`, `sort_order`
- `payload_json`

Future API mapping:
- `GET /notices/carousel`
- `POST /notices/carousel`
- `PATCH /notices/carousel/:noticeUid`

## Index strategy
- No foreign-key constraints in this phase to avoid blocking old JSON import.
- Indexes are added for all expected lookup keys (`*_uid`, status, sort, relation keys, time windows).
- Unique constraints use business IDs (`*_uid`) to keep upsert/import deterministic.

## Migration files
- Canonical schema: `src/db/schema.sql`
- Initial migration snapshot: `src/db/migrations/20260512_001_workspace_tables.sql`
- Production launch additions: `src/db/migrations/20260512_002_production_launch_tables.sql`

Both are idempotent (`CREATE TABLE IF NOT EXISTS`) and safe to run repeatedly.

## Production launch initialization

Run this before first production startup:

```bash
npm run db:prepare:production
```

The script:
- Ensures database `xjg` exists with `utf8mb4`.
- Runs the workspace and production-launch migrations.
- Clears legacy/demo business data from `app_states`, project/task/comment/template/board/share tables.
- Seeds only `admin/admin` plus real users from `G:\mutou\文档\用户列表.md`.
- Assigns `admin` only to the fixed super admin.
- Assigns `manager` to users marked with the computer flag.
- Assigns `employee` to users without the computer flag.
- Merges the duplicated `MIX-yuanye` account into one user record.

After the backend starts, verify production behavior:

```bash
npm run smoke:production
```

Expected production workspace state after initialization:
- `workspace/bootstrap` returns empty `projectGroups`, empty `rootProjects`, and empty `tags`.
- `/appState/main` returns an empty object and is not used as the primary production data source.
