# Lab 4 Issue 11 — Security, Concurrency and Safe Failure

Issue: [#51](https://github.com/Tell52/toktickit/issues/51). Integration: `feature/lab4-11-security-concurrency` → `lab4-staging`. Commit, push, PR review and merge are performed by the project owner.

## Implemented behavior

- Earlier Ticket creation, Ticket detail and attachment-download APIs now require an active current session. Client `requesterId` cannot authorize a request. For compatibility the create form may still send that field; the saved Requester is always the authenticated creator, including staff/admin creators. No default/fallback Requester is selected.
- Shared detail and attachment reads scope ownership in the database query. Another Requester's resource and an absent resource share a safe 404 body. Staff/admin may read shared attachments. Removed attachments remain unavailable. Numeric IDs and official Ticket numbers are supported.
- Administrator routes, `/auth/me`, password change and the requester-directory lookup revalidate current activation/role. Mandatory-password-change users can reach `/me`, logout and password change; business endpoints return `PASSWORD_CHANGE_REQUIRED`. The requester directory is restricted to staff/admin. Public health/category/system lookups contain no user data.
- Login regenerates the session and CSRF token. Password change locks/rechecks the current account before modifying its credential, preserving the recovery path for forced-change users. All business mutations apply current-user/role checks before their CSRF and resource checks. `requireCsrf` also covers PUT.
- Ticket creation validates text, priority and existing category/system references, locks/rechecks the actor and serializes number allocation with a transaction advisory lock. Concurrent legitimate reports retain distinct IDs/numbers. This does not introduce an idempotency contract for Ticket creation.
- Internal Note creation validates an allowlist, binds the author to the session and rechecks authorization under the same parent/User lock order as Actions/workflow. Private Notes never change public `updatedAt`/version, dashboard activity or shared response fields. Public comment identity remains server-bound.
- Touched routes use the common validation/authentication/forbidden/not-found/conflict/internal-error envelope. Malformed JSON/URI and unexpected errors return safe JSON. The earlier create form understands this feedback and retains inputs after validation, permission/session and server failures.

## Concurrency and duplicate handling

The existing Actions and workflow transactions continue locking the parent Ticket before users, then checking expected Ticket/Action versions. Resolution evaluates the gate under that same lock. The hardening command reruns both forced orderings of action-create/follow-up versus Resolve, competing edits/owner/priority/status writes, full cancellation rollback and actor/assignee administration races.

Action creation retains the approved actor/key/payload receipt contract. Identical concurrent/retried submissions create one Action/revision/receipt and replay the stored response; different payloads under the key conflict. Logout, activation, role and mandatory-password-change checks precede replay. UI duplicate-click, uncertain-network-response and stale-draft recovery cases remain in the client regression.

Additional real-lock tests block a new Ticket or private Note while an administrator changes the actor, observe the waiting database lock, then release it. Unauthorized work must leave no row, public timestamp or version change. No timing-only sleeps decide race winners.

## Performance smoke

`dashboard-performance.test.ts` creates exactly **10,000 synthetic Tickets and 30,000 Actions** in a generated disposable database. It records environment/PostgreSQL version, 5 warm-ups and 20 sequential authenticated HTTP requests for Requester, IT Staff and Administrator dashboards. The target is p95 **<1000 ms** per role, using nearest-rank p95 (`ceil(.95*n)-1`). Raw durations, query counts and response bytes are written to `test-results/lab4-dashboard-performance.json`.

Queries are instrumented at the Prisma middleware boundary, including identity checks. Each measured request has the same command count as the empty fixture and at most 20 commands. Preview sizes and My actions pages stay at five. Every model `findMany` must use `take <=50` or a bounded five-ID projection after SQL LIMIT; aggregates may scan their indexed predicates inside PostgreSQL. All responses must be 200; failures cannot count as fast successes. Setup bulk inserts/fixture scans are outside the measurements. This is a bounded local smoke target, not a production SLA or concurrent load benchmark.

## Local verification — 2026-10-23

| Check | Actual result | Evidence |
|---|---|---|
| Dedicated hardening: authorization, real-lock races, Actions/workflow regression, validation, performance | 238 passed; 0 failed/skipped | `test-results/lab4-security.xml` |
| Full client suite | 218 passed; 0 failed/skipped | `test-results/lab4-security-client.xml` |
| Default backend regression | 186 passed; 237 opt-in cases skipped in this command | `test-results/lab4-security-server.xml` |
| Labs 2–4 browser regression | 69 passed; all 23 scenarios on Chromium, Firefox and WebKit; no retries | `test-results/lab4-security-all-browser.xml` |
| Server/client TypeScript and production builds; whitespace | Passed | Build output; `git diff --check` |

Performance environment: Windows 11 (10.0.26200), Node 22.17.1, PostgreSQL 16.15, Intel Core i7-14700HX (28 logical CPUs), 31.7 GiB RAM. A dedicated loopback PostgreSQL instance used the [EDB binary distribution](https://www.enterprisedb.com/download-postgresql-binaries); the working database was not used. Full raw sample/environment data is in the JSON report.

| Authenticated dashboard | p95 | Queries/request, empty and 10k/30k | Response bytes |
|---|---:|---:|---:|
| Requester | 6.791 ms | 8 | 2,153 |
| IT Staff | 31.397 ms | 14 | 5,200 |
| Administrator | 34.135 ms | 14 | 5,197 |

The default backend command intentionally leaves generated-database suites opted out; Actions/workflow/security/performance were executed separately above. Migration/seed recovery and dashboard oracle suites were not rerun by this issue's default-backend command. Initial failures exposed a Note role-check ordering and an earlier admin fixture's inactive-actor assumption; both are corrected in the passing results. GitHub checks and human review remain pending the owner's commit/push.

## Reproduce

Use a separate disposable PostgreSQL server with database-creation privileges. Each API/performance test file creates, migrates and drops only its generated `toktickit_lab4_*` database; it does not reset a development database.

```powershell
$env:LAB4_SECURITY_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/postgres'
Push-Location server
node node_modules/vitest/vitest.mjs run --config vitest.hardening.config.ts --reporter=default --reporter=junit --outputFile=../test-results/lab4-security.xml
Pop-Location
Push-Location client
node node_modules/vitest/vitest.mjs run --reporter=default --reporter=junit --outputFile=../test-results/lab4-security-client.xml
Pop-Location
# Migrate and seed an independent disposable UI database first.
$env:LAB4_UI_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/DISPOSABLE_UI_DB'
$env:DATABASE_URL = $env:LAB4_UI_DATABASE_URL
npx playwright test --config=playwright.hardening.config.ts
```

The existing migration workflow runs hardening and uploads its JUnit/performance reports. Broader legacy regression uses its own migrated/seeded disposable database. Final-main certification and reviewed PR links remain release work; local evidence does not imply GitHub checks or review have completed.
