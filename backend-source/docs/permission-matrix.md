# Permission Matrix v1

This document records the backend role baseline introduced for the first permission-matrix work package. It does not change frontend request fields.

## Global Role Baseline

The helper lives in `src/middlewares/auth.js` and can be imported by controllers or services that need a simple role gate.

| Role | canWrite | canDelete | canExport | Notes |
| --- | --- | --- | --- | --- |
| `admin` | yes | yes | yes | Fixed super administrator. |
| `manager` | yes | no | yes | Can perform normal write/export actions, but destructive delete still needs an explicit admin or domain-specific manage rule. |
| `employee` | no | no | no | Read-first global baseline. Project or board membership may still grant domain-specific edit rights in existing services. |
| unknown/empty | no | no | no | Normalized to `employee`. |

Exports from `src/middlewares/auth.js`:

- `normalizeRole(auth)`
- `getRoleCapabilities(auth)`
- `canWrite(auth)`
- `canDelete(auth)`
- `canExport(auth)`
- `assertRoleCan(auth, action)`

`assertRoleCan` returns the capability object when allowed and throws a `403` error when denied.

## Existing Domain Rules

This package intentionally keeps existing service-level domain permissions in place:

- Board APIs still resolve board owner, board share, and project member roles in `src/services/board.service.js`.
- Schedule APIs still resolve project `view` / `edit` / `manage` permissions in `src/services/schedule.service.js`.
- Schedule export requires project `view` plus global `canExport`: `admin` and `manager` can export; `employee` cannot export.
- Workspace project/task/group/tag write and delete endpoints are not fully migrated to the helper yet.

## Follow-up Risks

- Workspace destructive endpoints still need endpoint-level gates before public production use.
- Board delete currently allows board owner or project manager by domain rule; the global `manager.canDelete=false` helper is not wired into board delete yet.
