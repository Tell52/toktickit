# Lab 4 Seed Data and Dashboard Fixtures

**Issue:** [#44](https://github.com/Tell52/toktickit/issues/44)

**Implementation:** [fixture definitions/loader](../../server/prisma/lab4-fixtures.ts), [normal seed](../../server/prisma/seed.ts), [fixed-clock CLI](../../server/prisma/seed-lab4-fixtures.ts), [database tests](../../server/tests/lab-04/seed-fixtures.test.ts).

## Normal demonstration seed

After applying the [Lab 4 migration](migration-recovery.md), run from `server`:

~~~powershell
npm run prisma:seed
~~~

This retains the original Lab 1-3 categories, systems, accounts, Ticket, Public Comment and Internal Note, then adds the `demo` profile. In a fresh database the combined seed contains 18 Users and 12 Tickets: ten original Users/one original Ticket plus eight Lab 4 Users/eleven Lab 4 Tickets. The Lab 4 portion contains eight actions, fifteen revisions, one synthetic reopening event and zero idempotency receipts. It creates no additional uploads, comments or private notes.

Demo timestamps are relative to the **first creation**: `asOf` is captured once, and the Bangkok calendar window follows specification section 6. An existing fixture Ticket and its complete child aggregate are skipped on subsequent runs, so neither timestamps nor user-edited work move with the clock. Metric totals in a populated demo database include all existing Tickets and change as time/work progresses; use the isolated fixed-clock profile for exact expected totals.

## Stable identity and preservation

- Fixture Users, actions, revisions and events use UUID v5 IDs derived from a committed namespace, profile and alias. Ticket keys are `LAB4-<PROFILE>-T1` through `T11` (boundary Tickets use B1-B6). Numeric Ticket IDs remain database-generated; obtain them by Ticket number, not assumed production IDs.
- A profile runs in one PostgreSQL transaction under a profile-specific advisory lock. Concurrent runs of the same profile create one complete dataset. Failed nested writes or email collisions roll back new categories, systems, Users, Tickets and child rows together.
- Existing Users are found by stable ID and preserved verbatim, including edited email/name, activation, role, password hash and password-change state. A reserved email already owned by another ID, including a case variant, causes an explicit failure rather than taking over that account.
- Existing Ticket numbers cause the whole aggregate to be skipped. No action, revision or event is appended to it, even if it has been edited or is unrelated work using that reserved number. The loader reports created/skipped counts. It does not reset versions, repair missing histories, remove user work, or change ownership/status/priority.
- The original Lab 1-3 seed continues its create-only upsert behavior. Lab 4 data lives under separate keys and identities. Do not reuse reserved keys for unrelated work if you need the full fixture set; inspect skips rather than treating incomplete data as the metric oracle.

All fixture history is explicitly synthetic setup data. Creating fixture rows directly is not evidence that future service APIs accepted the transition or assignment. In particular, S0 represents an assignment made while that account was active, retained after deactivation; new API assignments/completions must still reject an inactive assignee.

## Profiles and accounts

| Profile | Clock | Tickets / actions | Intended use |
|---|---|---|---|
| demo | Relative to first creation | 11 / 8 | Included by the normal seed for demonstration |
| dashboard | Fixed below | 11 / 8 | Exact metrics, filters, priority fallback, ownership and action predicates |
| boundaries | Fixed below | 6 / 0 | Before/at/after both timestamp bounds, without altering dashboard totals |
| empty | Fixed below | 0 / 0 | All-zero staff/Requester metrics and empty lists |

Every profile creates these eight Users with separate profile-specific UUIDs and emails `lab4.<profile>.<alias-lowercase>@example.com`:

| Alias | Role / activation | Purpose |
|---|---|---|
| R1 | Active Requester | Main owned-Ticket metric fixture |
| R2 | Active Requester | Other owner and ownership-isolation cases |
| R0 | Active Requester, no Tickets | Zero-data Requester |
| S1 | Active IT Staff | Personal owner/action metric assertions |
| S2 | Active IT Staff | Different Ticket Owner, performer and editor |
| S0 | Inactive IT Staff | Historical unfinished assignment retained |
| A1 | Active Administrator | Shared staff metrics, zero personal assignments |
| P1 | Active Requester, forced password change | Business-endpoint password-change guard |

New fixture accounts initially use the same demonstration password as the original seed, `Str0ng!Temp`, stored as a bcrypt hash. Demo accounts require the first-login password change; fixed-clock profiles set that flag false except P1. S0 cannot log in. Rerunning any seed does not restore or overwrite a changed password or account state.

## Fixed-clock dashboard oracle

Use a **separate empty, migrated database per profile**, without running the normal seed first. The fixed-clock CLI requires `LAB4_FIXTURE_DATABASE_URL` explicitly; it does not fall back to the working `DATABASE_URL`. It adds records safely but does not erase other data to make counts match. Existing data or mixed profiles invalidate the global totals below.

The clock is `asOf = 2026-10-20T10:00:00.000Z` (17:00 Bangkok) and `since = 2026-10-13T17:00:00.000Z` (October 14 midnight Bangkok). The window is `[since, asOf)`. Future API tests must supply this clock through a test dependency; no production HTTP clock override is added here.

The exact T1-T11 and X1-X8 rows are listed in [tests.md, section 2.3](tests.md#23-deterministic-dashboard-dataset). The loader inserts Tickets in that order, preserving numeric-ID tie-breaking in a fresh database. It sets timestamps explicitly instead of letting insertion time change the oracle.

| User / scope | Expected values |
|---|---|
| R1 | openTickets=4; waitingForRequester=1; recentlyUpdated=6; recentlyResolved=2 |
| R2 | openTickets=1; waitingForRequester=0; recentlyUpdated=2; recentlyResolved=0 |
| R0 | All counts 0; previews empty |
| S1 | unassignedTickets=2; myTickets=2; recentlyUpdated=8; myActiveActions=3 |
| A1 | Same shared buckets/recent/unassigned values; myTickets=0; myActiveActions=0 |
| All-status buckets | New=1; Open=1; In Progress=1; Waiting for Requester=1; Resolved=3; Closed=2; Reopened=1; Cancelled=1 |
| Active-priority buckets | Low=1; Medium=1; High=3, including T4's null IT Priority fallback |
| R1 attention preview | T4 |
| R1 recent preview | T11, T4, T6, T5, T3 |
| Staff urgent preview | T7, T4, T3 |
| Staff recent preview | T11, T4, T9, T8, T6 |
| S1 My actions | X6, X2, X1 in descending effective action time |

Coverage includes all eight Ticket statuses and all three priorities; assigned/unassigned ownership; zero/one/multiple actions; all four action states; owner/performer/assignee independence; follow-up blocking; X8's follow-up-clearing revision; X7 assigned to inactive S0; T7 reopened cycle 2 with X5 retained in cycle 1; T9's unknown legacy resolvedAt; and a zero-Ticket Requester. X1's performer is the Ticket Owner while its assignee differs; X2 demonstrates both performer and assignee differing from the Ticket Owner.

Revision snapshots contain only the eleven business fields selected in the API contract. Their last snapshot matches the current row, revisions are contiguous and unique, and clearing X8's note retains earlier evidence. No passwords, emails or private notes appear in those snapshots. These fixtures describe current and historical states; dashboard fixture tests do not exercise API authorization or workflow gates.

## Boundary and empty oracles

The separate boundary profile assigns all six Closed Tickets to R1. Their updatedAt and resolvedAt match the following instants; all were created before the window.

| Ticket | Instant | Included in recent metrics? |
|---|---|---|
| B1 | 2026-10-13T16:59:59.999Z | No |
| B2 | 2026-10-13T17:00:00.000Z | Yes |
| B3 | 2026-10-13T17:00:00.001Z | Yes |
| B4 | 2026-10-20T09:59:59.999Z | Yes |
| B5 | 2026-10-20T10:00:00.000Z | No |
| B6 | 2026-10-20T10:00:00.001Z | No |

Boundary R1 has openTickets=0, waitingForRequester=0, recentlyUpdated=3 and recentlyResolved=3; its recent preview is B4, B3, B2. Staff has Closed=6 and every other status bucket zero, recent=3, all active-priority/owner/action counts zero and no urgent Tickets. The empty profile has no Tickets/actions/history; every metric bucket is zero and all previews are empty. It retains accounts so zero-data pages can be accessed after authentication.

## Loading and testing

After provisioning a fresh database and applying migrations to it, set `LAB4_FIXTURE_DATABASE_URL` to that database, then run from `server`:

~~~powershell
# Default fixed-clock profile:
npm run prisma:seed:fixtures

# Choose either alternative with its own empty migrated database URL:
node node_modules/tsx/dist/cli.mjs prisma/seed-lab4-fixtures.ts boundaries
node node_modules/tsx/dist/cli.mjs prisma/seed-lab4-fixtures.ts empty
~~~

For isolated automated tests, use the disposable PostgreSQL server setup in [migration-recovery.md](migration-recovery.md#reproducible-automated-rehearsal), with `LAB4_MIGRATION_DATABASE_URL` and, when using Docker, `LAB4_POSTGRES_CONTAINER`. The suite creates its own uniquely named databases and drops only those it created. It never seeds the working database.

~~~powershell
npm run test:fixtures
# Both migration/recovery and seed suites:
npm run test:migration
# Equivalent combined run with a local JUnit report:
node node_modules/vitest/vitest.mjs run --config vitest.migration.config.ts --reporter default --reporter junit --outputFile ../test-results/lab4-database-fixtures.xml
~~~

CI now runs both suites in the existing [Lab 4 database workflow](../../.github/workflows/lab4-migration.yml). Standard backend tests skip these isolated suites when the explicit server URL is absent; they are executed separately before reporting database preparation complete.

## Execution evidence

Recorded against branch `feature/lab4-4-seed-fixtures`, base `a1dd4df` plus working changes, on 2026-10-20. Environment: Windows PowerShell, Node 22.17.1, Prisma 5.22.0, Vitest 2.1.9, and a separate Docker PostgreSQL 16 server. [tests.md](tests.md#11-results-and-evidence-recording) records final results, earlier failing runs and corrections. Local ignored JUnit reports are kept under `test-results/`; remote CI and dashboard API/UI results are reported only after those checks actually execute.
