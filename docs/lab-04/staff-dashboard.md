# Staff and Administrator dashboard — Issue #50

Implements [Issue #50](https://github.com/Tell52/toktickit/issues/50) on `feature/lab4-10-staff-dashboard`, based on the pulled `lab4-staging` commit `f0d6932`. Commit, push, implementation PR review and merge are maintained by the user.

## Behavior

- All authenticated roles land on `/dashboard` after login/password change. Staff/Admin see **Service desk dashboard**, while Requester retains its own dashboard. Queue, administration and direct Ticket links remain available.
- `GET /api/staff/dashboard` returns unassigned active Tickets, current-user owned active Tickets, recent activity, eight status buckets, three effective-priority active buckets, urgent/recent previews (at most five each), and the first five current-user active actions.
- `GET /api/staff/actions/mine?page=N` returns five actions per page with a total count. Both endpoints reject unsupported query parameters and revalidate activation, password-change state and current role. Neither accepts an identity override. Responses use `Cache-Control: no-store`.
- Shared ACTIVE states and `[since,asOf)` Asia/Bangkok calendar bounds match the Requester implementation. All aggregates and previews use one RepeatableRead transaction. Current-user Actions require Planned/In Progress, an ACTIVE parent and the parent's current resolution cycle. A parameterized SQL join handles the cross-table cycle comparison; counts and five-row ID selection are bounded database queries, followed by the existing public Action DTO projection. No per-Ticket query loop or new migration is needed.
- Queue retains its existing response envelope, search, category, owner, priority and legacy sort behavior. It gains shared statusGroup/date bounds and deterministic updatedAt/resolvedAt sorting (null resolvedAt last). List/count are read in one snapshot. Dashboard links use the same predicates, with authenticated `owner=me` and null-only effective-priority fallback.
- Query strings survive reload, Back/Forward, queue paging and detail return. Selecting an action opens the Actions Taken section and its details; the existing bounded action-list pages locate the linked record if it is not on the first page.
- Refresh, focus/pageshow, and returning from detail reload authoritative metrics. Loading does not invent zero counts; failures use safe text/retry; background failures label the last successful result. Access failure clears dashboard/action data. Component identity keys include current user/role.
- Native links, focused My actions section, labelled pagination, zero buckets and responsive cards support keyboard use, 320px width and 200% text. Administrator uses the same screen and keeps Admin navigation.

## Verification — 2026-10-22

| Evidence | Result |
|---|---|
| STD-API-01: `server/tests/lab-04/staff-dashboard.api.test.ts` | 15 passed; direct database count comparison, all metric drill-downs, role/activation/password guards, invalid queries, zero buckets, concurrent-update snapshot and action paging |
| Combined dashboard API/calculation suite | 53 passed; `test-results/lab4-staff-api.xml` |
| STD-CLIENT-01: `client/tests/lab-04/StaffDashboard.test.tsx` | 10 passed; links/bounds/zeros, action focus/paging, loading/retry/access clearing, focus refresh, staff/admin landing and queue filter retention |
| Client regression | 213 passed; `test-results/lab4-staff-client.xml` |
| Backend regression | 220 passed, 157 skipped; `test-results/lab4-staff-server.xml`. Separate migration/seed/actions/workflow suites were not opted in for this run. |
| STD-BROWSER-01: `e2e/lab-04/staff-dashboard.spec.ts` | 9 passed across Chromium, Firefox, WebKit; both roles, queue reload/Back, action pages/detail, refresh after owner mutation, responsive/large-text/keyboard/error recovery |
| Combined Labs 2–4 browser regression | 68 passed, 1 Firefox Actions lifecycle timeout; `test-results/lab4-staff-all-browser.xml`. The timed-out case then passed three consecutive isolated repeats (`test-results/lab4-staff-firefox-recheck.xml`) without a code change. This is intermittent evidence, not a claim of a fully green 69-case run. The queue regression passes on all three browsers after selecting its Ticket row explicitly. |
| Build | Server and client builds pass |

The API suite uses an independent 12-Ticket/48-Action fixture with all eight statuses, null priority fallback, distinct owner/performer/assignee, terminal parents, prior cycles and equal action times. At fixed asOf `2026-10-20T10:00:00Z`, recent count is 10; active priority buckets are Low=4/Medium=1/High=4; each staff/admin has 9 qualifying actions with pages 5/4/0. Counts are not inferred from previews. Empty-state and concurrent-write cases run separately. The browser fixture exercises seven actions with pages 5/2.

Screenshots: [desktop](../../artifacts/lab-04/screenshots/staff-dashboard/dashboard-1440x900.png), [tablet](../../artifacts/lab-04/screenshots/staff-dashboard/dashboard-768x1024.png), [mobile](../../artifacts/lab-04/screenshots/staff-dashboard/dashboard-390x844.png), [320px](../../artifacts/lab-04/screenshots/staff-dashboard/dashboard-320x844.png). Desktop/320px captures were visually inspected; all viewports also have overflow assertions. Synthetic seed/test records only.

## Reproduce

Use disposable PostgreSQL databases; do not reset or seed a working database for these tests.

```powershell
$env:LAB4_DASHBOARD_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/postgres'
npm run test:dashboard --prefix server
npm test --prefix client
# Migrate and seed a separate disposable UI database first.
$env:LAB4_UI_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/DISPOSABLE_UI_DB'
$env:DATABASE_URL = $env:LAB4_UI_DATABASE_URL
npx playwright test --config=playwright.actions.config.ts
```

The dedicated UI workflow includes the new browser suite and screenshot directory. Legacy Staff/Admin login tests now expect Dashboard before entering Queue/Admin. CI on a pushed commit and human PR review remain pending. This evidence covers AC-14 and staff portions of AC-15/AC-19; large-dataset p95 performance smoke (AC-22), broader legacy authorization hardening (#51) and final-main release certification remain separate work.
