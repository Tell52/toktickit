# Lab 4 Issue 13 — End-to-End Flows and Labs 1–3 Regression

Issue [#53](https://github.com/Tell52/toktickit/issues/53). Branch `feature/lab4-13-e2e-regression`, based on pulled `lab4-staging` at `fc56ed80758b854d2d60b0b9fc41bcbb1dfbf96d`. Results apply to this uncommitted feature working tree on 2026-10-23. Maintainer commit/push, remote CI, human PR review and merge remain pending.

## Coverage

| Plan IDs | Executed implementation |
|---|---|
| E2E-01 | `e2e/lab-04/actions-taken-flow.spec.ts`: existing create/edit/start/complete/cancel, revisions, replay/conflict and privacy cases; additional staff and administrator authors on one Ticket, required follow-up note, persisted distinct performers and unchanged Ticket Owner |
| E2E-02/03 | `e2e/lab-04/ticket-resolution.spec.ts`: create → progress → advisory → blocked resolve → completed work → resolve → close → reopen → new-cycle work → resolve; final Requester and staff dashboard drill-downs agree with Ticket detail/lists; separate mixed-action cancellation/history case |
| E2E-04 | `e2e/lab-04/requester-dashboard.spec.ts` and `staff-dashboard.spec.ts`: every metric destination, query bounds, refresh/history, personal action paging and details |
| E2E-05 | `e2e/lab-04/dashboards.spec.ts`: same browser/context switches R1 → R2 → Staff → Administrator → R1; personal counts/assignments, cross-owner detail rejection, role guards, logout/back and direct unauthenticated API access. Existing Requester dashboard case checks mutation then return |
| REG-01 | `server/tests/lab-01/{health,categories}.test.ts`, `client/tests/lab-01/App.test.tsx` |
| REG-02 | `server/tests/lab-02/{create-ticket,my-tickets,ticket-detail,attachments}.api.test.ts`; `client/tests/lab-02/{CreateTicket,MyTickets,RequesterTicketDetail,AttachmentSection}.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| REG-03 | `server/tests/lab-03/{auth,authorization}.api.test.ts`; `client/tests/lab-03/{Login,ChangePassword,AppNavigationAndGuards}.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| REG-04 | `server/tests/lab-03/{staff-queue,staff-ticket-detail,requester-ticket-detail,comments-notes}.api.test.ts`; `client/tests/lab-03/{StaffTicketQueue,StaffTicketDetail,RequesterTicketDetail}.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| REG-05 | `server/tests/lab-03/users-admin.api.test.ts`, `client/tests/lab-03/UserManagement.test.tsx`, `e2e/lab-03/user-administration.spec.ts` |
| VIS/A11Y | Existing feature responsive cases and `e2e/lab-04/ui-accessibility.spec.ts`: desktop/tablet/mobile, 320px reflow, enlarged text, keyboard focus/dialog/skip link and role-screen axe scans |

Brace notation above names each existing file; the persisted execution summary lists individual paths. Backend execution additionally opts into migration/recovery, seed fixtures, Actions, workflow, both dashboards, authorization, concurrency and bounded performance suites.

## Changes to regression execution

`server/vitest.regression.config.ts` requires an explicit disposable database, enables all database suites and runs files serially. Migration/security/feature harnesses allocate and clean their own databases. Legacy suites use the migrated and seeded base database. `playwright.regression.config.ts` reuses the real API/UI servers and three browser projects, includes all E2E files, uses one worker and no retries, and sets legacy fixture `DATABASE_URL` to the same explicit UI database.

The existing migration CI job now runs the combined backend suite once, replacing separate overlapping feature commands. The existing Actions UI job runs the full browser regression, including accessibility, in one command. Check/job identities remain stable. The legacy Playwright workflow remains in place. JUnit, failure traces/screenshots, accessibility JSON and performance evidence are uploaded by the existing artifact steps.

The first combined backend run exposed a timezone-dependent seed oracle: Prisma binds Date parameters as `timestamptz`, while schema timestamps store UTC without timezone. Implicit comparison on an Asia/Bangkok PostgreSQL server excluded the inclusive lower boundary. The independent SQL oracle now converts bounds explicitly to UTC; a transaction-local UTC/Asia/Bangkok check preserves the same expected counts. No product metric or expected fixture count changed.

## Reproduce

Install locked root/server/client dependencies and Playwright browsers. Create two disposable PostgreSQL 16 databases on a server where the test account can create databases. For each database, set `DATABASE_URL`, then run from `server`: `npx prisma generate`, `npx prisma migrate deploy`, `npm run prisma:seed`. Never point these suites at working data.

PowerShell from the repository root, after database preparation:

```powershell
$env:LAB4_REGRESSION_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/DISPOSABLE_API_DB'
# Native PostgreSQL 16 tools must be on PATH, or set PSQL_PATH,
# PG_DUMP_PATH and PG_RESTORE_PATH to their absolute executable paths.
# CI instead supplies LAB4_POSTGRES_CONTAINER for its disposable service.
npm run test:regression --prefix server
npm test --prefix client
$env:LAB4_UI_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/DISPOSABLE_UI_DB'
npm run test:e2e:regression
npm run build --prefix server
npm run build --prefix client
git diff --check
```

Local execution used Windows 11, Node 22.17.1 and PostgreSQL 16.15 on port 55441, with separate `toktickit_pr13_api` and `toktickit_pr13_ui` databases. No working database or Docker installation was modified.

## Results and limits

Execution results are recorded in [tests.md](tests.md) under Issue #53. Raw reports are local ignored files under `test-results/`; the reviewable evidence under `artifacts/lab-04/regression/` preserves JUnit reports, counts, per-file paths, report hashes and accessibility totals. Per-state accessibility JSON is summarized there; browser output directories are temporary and replaced by subsequent runs.

Automated accessibility scans do not establish full WCAG/screen-reader certification; incomplete axe checks remain reported. The legacy attachment regression covers metadata, validation, ownership and soft removal; it cannot certify a real persistent file/download service absent from the baseline. Deployment backup recovery with actual uploaded bytes and final-main release certification remain separate planned release checks. Existing screenshot baselines are retained; this issue changes test execution and coverage rather than the product layout.
