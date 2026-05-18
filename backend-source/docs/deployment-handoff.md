# Deployment Handoff

This handoff is for the first production launch of `xjg-api`. It only defines deployment responsibilities and verification order.

## Ownership

| Owner | Responsibility |
| --- | --- |
| AG1 | MySQL availability, `JWT_SECRET`, production seed, and `db:check:production`. |
| AG2 | Core business database smoke, schedule schema/smoke gates, `smoke:production`, and `smoke:schedule`. |
| AG3 | Board sharing/collaboration smoke and `smoke:boards`. |
| AG4 | Frontend empty-data state, real-account browser acceptance, and frontend deployment verification. |
| Manager/user | Final launch decision. |

## Current P0 Blockers

- MySQL `127.0.0.1:3306` has no listener.
- `JWT_SECRET` still uses the default placeholder value in the current local `.env`.

## Required Production Command

Run from `G:\mutou\xm\xjg-api` after MySQL is started and `.env` is updated:

```powershell
npm run verify:production
```

The command runs these checks in order and stops on the first failure:

```powershell
npm run db:check:production
npm run db:check:schedule
npm run smoke:production
npm run smoke:schedule
npm run smoke:boards
```

## Pass Standard

- `db:check:production` returns `PASS`.
- `db:check:schedule` returns `PASS`.
- `smoke:production` returns `PASS`.
- `smoke:schedule` returns `PASS`.
- `smoke:boards` returns `PASS`.
- Frontend real-account browser acceptance returns `PASS`.

Schedule schema or schedule smoke failure is `P0_BLOCKED`; do not approve production launch until it passes inside `npm run verify:production`.

## Fallback Rule

`/appState/main` fallback is retained only for compatibility. It cannot be used as evidence that production launch is ready.

## Troubleshooting Links

- MySQL runbook: `docs/production-mysql-runbook.md`
- Unblock command sequence: `docs/production-unblock-commands.md`
- Readiness checklist: `docs/production-readiness-checklist.md`
