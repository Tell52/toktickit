# Requester Dashboard — Lab 4 Issue 9

Implements [issue #49](https://github.com/Tell52/toktickit/issues/49) on `feature/lab4-9-requester-dashboard`, based on `lab4-staging` commit `fc9078d`. The maintainer performs commit, push, PR review and merge. No migration or new dependency is required.

## API and calculations

`GET /api/dashboard/requester` derives identity from the current authenticated account and rejects query overrides. Counts and two previews (at most five rows each) use one repeatable-read snapshot. Responses are `Cache-Control: no-store`; summaries select only the seven documented fields and fall back to requested priority when IT priority is null. No Internal Note/account fields are selected. Role, active state and mandatory password change are checked on each request and again inside the transaction.

| Card | Predicate | My Tickets filters |
|---|---|---|
| Open tickets | New, Open, In Progress, Waiting for Requester, Reopened | `statusGroup=active` |
| Waiting for you | Waiting for Requester | exact status |
| Updated in last 7 days | updatedAt in `[since,asOf)`, all statuses | returned window and `sort=-updatedAt` |
| Resolved in last 7 days | Resolved/Closed, non-null resolvedAt in that window | resolved group, returned window and `sort=-resolvedAt` |

Capture server time once. `since` is Bangkok midnight six local dates earlier: today so far plus six preceding dates, not a rolling 168 hours. At 2026-10-20 17:00 Bangkok, the window is `[2026-10-13T17:00:00Z,2026-10-20T10:00:00Z)`. Previews order by updatedAt descending then ID descending; counts include all matches.

`GET /api/tickets` now requires a current Requester session and rejects requesterId overrides, replacing the old development-only fallback. It preserves `{data,meta:{total,page,limit,totalPages}}`, search and status; adds statusGroup, offset-bearing updated/resolved bounds and timestamp sorts; and caps limit at 50. Invalid/duplicate/unknown filters, conflicting status/group and reversed/equal bounds return 400. New sorts have deterministic ID ties; resolvedAt nulls sort last. Every predicate is ANDed with authenticated ownership. Staff list extensions remain in #50.

## Navigation, refresh and accessibility

Requesters land on `/dashboard` after authentication and mandatory password change. The logo and Dashboard link return there; existing My Tickets/detail links keep working. Staff/Admin retain their queue landing until #50.

Cards and preview rows are keyboard-accessible links. My Tickets shows applied filter chips; search, status, pagination and Clear Filters update the URL. Reload and Back/Forward preserve queries. Detail always reads its ID from the URL, and its Back button retains the originating filtered list.

Loading/initial failure never invent zero counts. Real zeros show empty guidance and a create link. Recoverable failures offer Retry; a failed refresh marks retained data as the last successful update. Session/permission failures clear cached dashboard data and update authentication. Superseded responses are ignored. Dashboard remount, window focus/pageshow and explicit Refresh fetch fresh values after creation, public activity, advisory or other Ticket mutations.

The existing green/white style uses four cards on desktop, two on tablet/mobile and one below 400px, wrapping previews, visible focus and 44px controls. Browser checks cover four viewports and 200% text. Manual browser-menu zoom and full screen-reader verification remain in the final accessibility issue. Screenshots use synthetic users:

- [Desktop 1440×900](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-1440x900-chromium.png)
- [Tablet 768×1024](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-768x1024-chromium.png)
- [Mobile 390×844](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-390x844-chromium.png)
- [Narrow mobile 320×844](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-320x844-chromium.png)

## Verification and reproduction

The fixed-clock API fixture independently reproduces T1–T11: R1 counts **4/1/6/2**, attention T4 and recent T11,T4,T6,T5,T3; R2 counts **1/0/2/0**. Tests include zero/empty data, caps, legacy null dates, exact boundaries, rollover dates, ownership, account changes, invalid filters, pagination and null ordering. A separate writer commits between the first count and later reads to verify snapshot consistency. Public comments update recent metrics; private notes do not.

Use an explicitly designated disposable PostgreSQL server with database-creation privileges. The API suite generates, migrates and drops only its own database; it never falls back to the working DATABASE_URL:

```powershell
$env:LAB4_DASHBOARD_DATABASE_URL = 'postgresql://lab4:lab4-test-only@127.0.0.1:<disposable-port>/postgres'
npm run test:dashboard --prefix server
```

For browser verification, set `LAB4_UI_DATABASE_URL` to a separate migrated database with the normal seed. Use IPv4 on Windows when Docker publishes only on 127.0.0.1. The [workflow UI guide](ticket-workflow-ui.md#reproduce) covers provisioning and ports. The dedicated suite includes Actions, workflow and Requester dashboard scenarios:

```powershell
node node_modules/@playwright/test/cli.js test --config=playwright.actions.config.ts
```

Client tests run with `node node_modules/vitest/vitest.mjs run` from `client/`. Builds use `npm run build --prefix client` and `npm run build --prefix server`. CI runs the API and combined browser suites, uploading JUnit and screenshots. Results and remaining staff/combined scope are recorded in [tests.md](tests.md#11-results-and-evidence-recording). Remote CI and reviewed PR linkage follow the maintainer's push.
