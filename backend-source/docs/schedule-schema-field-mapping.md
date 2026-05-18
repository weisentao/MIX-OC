# Schedule Schema Field Mapping

This file is for AG3 API implementation. Database fields stay snake_case. API responses should expose camelCase.

## schedule_plans

| DB field | API field | Notes |
| --- | --- | --- |
| plan_uid | planUid, id | Public schedule plan id. |
| project_uid | projectUid | Linked project uid. |
| active_project_uid | none | Internal generated column for active-plan uniqueness. Do not expose. |
| title | title | Plan title. |
| status | status | active, archived, deleted. |
| start_date | startDate | Date string in API format. |
| end_date | endDate | Date string in API format. |
| default_view | defaultView | timeline, board, node. |
| view_config_json | viewConfig | Parse JSON before returning. |
| payload_json | payload | Reserved extension payload. |
| created_by | createdBy | User uid. |
| updated_by | updatedBy | User uid. |
| created_at | createdAt | Datetime. |
| updated_at | updatedAt | Datetime. |

## schedule_items

| DB field | API field | Notes |
| --- | --- | --- |
| item_uid | itemUid, itemId, id | Public schedule item id. |
| plan_uid | planUid | Parent plan uid. |
| project_uid | projectUid | Project uid for direct filtering. |
| task_uid | taskUid | Nullable. Pure schedule items may have no task. |
| legacy_task_id | taskId | Numeric compatibility id when available. |
| item_type | type | schedule, task, milestone. |
| title | title | Item title. |
| module_key | module | Department or module key. |
| owner_user_uid | ownerUserUid | Owner user uid. |
| owner_text | owner | Display owner text. |
| status | status | todo, doing, review, done, blocked. |
| priority | priority | normal, high, etc. |
| progress | progress | 0 to 100. |
| start_date | startDate | Date string in API format. |
| end_date | endDate | Date string in API format. |
| sort_order | sortOrder | BIGINT sort value. |
| hidden | hidden | Boolean in API. |
| link_task | linkTask | Boolean in API. |
| link_flow | linkFlow | Boolean in API. |
| note_text | note | Free text note. |
| payload_json | payload | Reserved extension payload. |
| created_by | createdBy | User uid. |
| updated_by | updatedBy | User uid. |
| created_at | createdAt | Datetime. |
| updated_at | updatedAt | Datetime. |

## schedule_dependencies

| DB field | API field | Notes |
| --- | --- | --- |
| dependency_uid | dependencyUid, dependencyId, id | Public dependency id. |
| plan_uid | planUid | Parent plan uid. |
| project_uid | projectUid | Project uid. |
| from_item_uid | fromItemUid, fromItemId | Source item uid. |
| to_item_uid | toItemUid, toItemId | Target item uid. |
| dependency_type | type | finish_to_start, start_to_start, finish_to_finish, blocks. |
| lag_days | lagDays | Dependency lag in days. |
| payload_json | payload | Reserved extension payload. |
| created_by | createdBy | User uid. |
| updated_by | updatedBy | User uid. |
| created_at | createdAt | Datetime. |
| updated_at | updatedAt | Datetime. |

## schedule_snapshots

| DB field | API field | Notes |
| --- | --- | --- |
| snapshot_uid | snapshotUid, snapshotId, id | Public snapshot id. |
| plan_uid | planUid | Parent plan uid. |
| project_uid | projectUid | Project uid. |
| title | title | Snapshot title. |
| summary_json | summary | Parse JSON before returning. |
| snapshot_json | snapshot | Parse JSON before returning. |
| created_by | createdBy | User uid. |
| created_by_name | createdByName | Display name. |
| created_at | createdAt | Datetime. |

## schedule_templates

| DB field | API field | Notes |
| --- | --- | --- |
| template_uid | templateUid, templateId, id | Public template id. |
| title | title | Template title. |
| description | description | Template description. |
| owner_user_uid | ownerUserUid | Owner user uid. |
| visibility | visibility | private, shared, public. |
| item_count | itemCount | Template item count. |
| template_json | template | Parse JSON before returning. Must not contain real project ids, task ids, snapshots, or comments. |
| payload_json | payload | Reserved extension payload. |
| created_by | createdBy | User uid. |
| updated_by | updatedBy | User uid. |
| created_at | createdAt | Datetime. |
| updated_at | updatedAt | Datetime. |

## schedule_template_shares

| DB field | API field | Notes |
| --- | --- | --- |
| share_uid | shareUid, shareId, id | Public share id. |
| template_uid | templateUid, templateId | Shared template uid. |
| from_user_uid | fromUserUid | Sender user uid. |
| to_user_uid | toUserUid | Receiver user uid. |
| permission | permission | read, write, manage. |
| status | status | active, revoked, expired. |
| note | note | Share note. |
| shared_at | sharedAt | Datetime. |
| expires_at | expiresAt | Nullable datetime. |
| payload_json | payload | Reserved extension payload. |
| created_at | createdAt | Datetime. |
| updated_at | updatedAt | Datetime. |

## schedule_item_comments

| DB field | API field | Notes |
| --- | --- | --- |
| comment_uid | commentUid, commentId, id | Public comment id. |
| item_uid | itemUid, itemId | Schedule item uid. |
| plan_uid | planUid | Parent plan uid. |
| project_uid | projectUid | Project uid. |
| user_uid | userUid | Commenter user uid. |
| user_name | userName | Commenter display name. |
| user_dept | userDept | Commenter department. |
| tone | tone | UI tone key. |
| content_text | text, content | Comment body. |
| commented_at | commentedAt | Business comment time. |
| payload_json | payload | Reserved extension payload. |
| created_at | createdAt | Datetime. |
| updated_at | updatedAt | Datetime. |

## First-Batch API Use

Must be used by the first schedule API batch:

- schedule_plans
- schedule_items
- schedule_dependencies
- schedule_item_comments

Created now for near-future APIs:

- schedule_snapshots
- schedule_templates
- schedule_template_shares

Not created in this batch:

- schedule_exports
- schedule_holidays
