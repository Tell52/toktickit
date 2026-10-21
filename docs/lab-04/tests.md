# Test Plan and Acceptance-Criteria Traceability - Sprint 4

**Issue:** [#42 - Test Plan & Acceptance-Criteria Traceability](https://github.com/Tell52/toktickit/issues/42)  
**Status:** Test plan created in issue #42; database/migration execution added in issue #43, seed/fixture execution in issue #44 and Actions API execution in issue #45. UI/workflow, remaining API and final-release cases remain Planned unless a result below explicitly records execution.
**Contracts:** [Specification](specification.md), [API](api-spec.md), [UI](ui-spec.md).

## 1. Scope and Test Strategy

Verify Actions Taken, both lifecycles, role dashboards and final hardening while preserving supported Labs 1-3 behavior. Use Vitest for unit/component tests, Supertest with PostgreSQL for API/integration tests, and Playwright for browser workflows. Manual visual/accessibility and recovery evidence supplements automated checks.

This document supplies the plan, traceability and execution ledger. New paths remain **planned locations** until their implementation issue creates them. The database suites now exist; see [migration/recovery](migration-recovery.md) and [seed/metric fixtures](seed-fixtures.md) for setup and execution. Actions setup and execution are described in [actions-api.md](actions-api.md). Existing regression paths are identified separately in section 8.

For each feature:

1. Select its ACs and planned test IDs before implementing it.
2. Add focused tests and record the expected failing behavior (Red).
3. Implement the contract and run the affected suite (Green).
4. Refactor while keeping the same assertions, then run related regression checks.
5. Record actual results, commit SHA, command and evidence in section 11. A test that was not run remains Planned or Not run, never Pass.

Tests assert observable outcomes and persisted invariants. Pure validation tests may isolate functions; authorization, migration, idempotency and concurrency tests must exercise the real application/database behavior. Mocking Prisma cannot establish transactional correctness.

## 2. Environment, Isolation and Fixtures

### 2.1 Environment

- Use the repository's locked npm dependencies. Current CI uses Node 22 and PostgreSQL 16.
- Use a disposable test database with an explicitly configured DATABASE_URL, not the working/demo database. Migration recovery tests use a separate disposable database.
- Apply migrations and generate Prisma before database-backed suites. Seed development/demo data only in the E2E database; dashboard count fixtures run in an isolated empty dataset.
- Authenticate through the real login/password-change flow. Capture each user's cookie and CSRF token separately. Ordinary test users have mustChangePassword=false; dedicated cases set it true.
- Create valid UUID User/action identifiers for new fixtures, numeric Ticket IDs, unique emails and run-specific Ticket numbers. Existing historical IDs remain unchanged in migration tests.
- Scope fixture cleanup by test/run identity and delete dependent test records in FK order. Do not use unscoped deletion against shared data.
- Keep concurrent scenarios on independent connections. Avoid wrapping every test in a single outer rollback transaction that hides committed data from other requests.
- Freeze the application clock through a test-only clock dependency; do not expose a production HTTP clock override. Use explicit timestamps when populating database fixtures.

### 2.2 User fixtures

| Alias | Role / state | Purpose |
|---|---|---|
| R1 | Active Requester | Owns Tickets in the Requester metric fixture |
| R2 | Active Requester | Different owner; cross-owner access rejection |
| R0 | Active Requester, no Tickets | Empty dashboard and first-ticket state |
| S1 | Active IT Staff | Current staff user for expected dashboard values |
| S2 | Active IT Staff | Different owner/performer/editor and concurrent session |
| S0 | Inactive IT Staff | Invalid new assignee; historical assignment |
| A1 | Active Administrator | Staff parity and user-management regression |
| P1 | Active user, mustChangePassword=true | Direct business-API restriction |

Run dashboard metrics on an isolated dataset containing exactly the Tickets below. Separate authorization/workflow fixtures must not contaminate its aggregate counts.

### 2.3 Deterministic dashboard dataset

Freeze **asOf = 2026-10-20T10:00:00.000Z** (17:00 in Asia/Bangkok). Then **since = 2026-10-13T17:00:00.000Z** (October 14 at midnight in Bangkok).

Use these timestamp aliases:

- B = since minus 1 millisecond.
- L = since exactly.
- M = 2026-10-18T05:00:00.000Z.
- U = asOf minus 1 millisecond.
- E = asOf exactly.

All Tickets were created before B. T1-T11 are logical labels mapped to ascending numeric IDs; do not depend on fixed production IDs. `priority` below means effective priority unless an explicit fallback is stated. All unspecified resolution times are null.

| Ticket | Requester | Status | Owner | Priority | updatedAt | resolvedAt |
|---|---|---|---|---|---|---|
| T1 | R1 | New | Unassigned | Low | B | null |
| T2 | R1 | Open | S1 | Medium | L | null |
| T3 | R1 | In Progress | S2 | High | M | null |
| T4 | R1 | Waiting for Requester | S1 | High (itPriority=null, requestedPriority=High) | U | null |
| T5 | R1 | Resolved | S2 | Low | M | L |
| T6 | R1 | Closed | S1 | Medium | M | B |
| T7 | R2 | Reopened | Unassigned | High | E | null |
| T8 | R2 | Cancelled | S2 | Low | M | null |
| T9 | R2 | Resolved | S1 | High | M | null (legacy) |
| T10 | R2 | Closed | Unassigned | Medium | E | E |
| T11 | R1 | Resolved | Unassigned | High | U | U |

Expected values, calculated independently of implementation helpers:

| Dashboard | Metric | Expected |
|---|---|---|
| R1 | openTickets / waitingForRequester | 4 / 1 |
| R1 | recentlyUpdated / recentlyResolved | 6 / 2 |
| R1 | attentionTickets | T4 |
| R1 | recentTickets, ordered and capped at 5 | T11, T4, T6, T5, T3 |
| R2 | openTickets / waitingForRequester | 1 / 0 |
| R2 | recentlyUpdated / recentlyResolved | 2 / 0 |
| R0 | All metrics / previews | 0 / empty arrays |
| S1 | unassignedTickets / myTickets | 2 / 2 |
| S1 | recentlyUpdated | 8 |
| S1 | byStatus, New/Open/In Progress/Waiting/Resolved/Closed/Reopened/Cancelled | 1 / 1 / 1 / 1 / 3 / 2 / 1 / 1 |
| S1 | byPriority, Low/Medium/High among ACTIVE Tickets | 1 / 1 / 3 |
| S1 | urgentTickets, ordered | T7, T4, T3 |
| S1 | recentTickets, ordered and capped at 5 | T11, T4, T9, T8, T6 |
| A1 | Shared metrics and previews | Same as S1 except personal owner/action metrics |
| A1 | myTickets | 0 |

The window is lower-inclusive and upper-exclusive. T7 is still an urgent active Ticket even though its updatedAt is excluded from the recent window. T9 counts as Resolved in the status buckets, but not as recently resolved. T4 proves the null IT Priority fallback.

For My actions, add the following after constructing the Ticket rows, then restore their declared updatedAt values so fixture setup does not change the metric oracle. Do not infer these expected counts from the application query implementation.

| Action | Parent / cycle | Status | Assignee | Performer | Expected in S1 My actions |
|---|---|---|---|---|---|
| X1 | T3 / current cycle 1 | PLANNED | S1 | S2 | Yes |
| X2 | T3 / current cycle 1 | IN_PROGRESS | S1 | S1 | Yes |
| X3 | T3 / current cycle 1 | COMPLETED, follow-up required | S2 | S1 | No |
| X4 | T3 / current cycle 1 | CANCELLED | S1 | S1 | No |
| X5 | T7 / previous cycle 1 | COMPLETED | S1 | S1 | No |
| X6 | T7 / current cycle 2 | PLANNED | S1 | S2 | Yes |
| X7 | T7 / current cycle 2 | IN_PROGRESS | S0 | S2 | No |
| X8 | T5 / current cycle 1 | COMPLETED | S1 | S1 | No |

S1 myActiveActions = **3**; A1 myActiveActions = **0**. Give X1/X2/X6 distinct actionAt values and assert descending order. Use a separate seven-active-action dataset for pagination: page 1 contains five, page 2 two, page 3 none, and totalCount remains seven. A separate defensive fixture may put an unfinished action on an inactive parent to prove the parent-state predicate, without treating that invalid combination as a normal workflow.

For date-unit tests also cover offset-equivalent timestamps, midnight/year/month boundaries, exact B/L/U/E values and an instant after E. For chronological sorting use identical timestamps and known IDs to verify tie-breaking.

## 3. Acceptance-Criterion Traceability

Every AC from specification section 9 maps to at least one concrete case below. Test IDs belong to this Lab 4 plan; they do not replace earlier labs' IDs.

| AC | Planned test IDs |
|---|---|
| AC-01 | API-01, API-02, E2E-01 |
| AC-02 | UNIT-01, UNIT-02, API-03 |
| AC-03 | API-04, API-05, CON-04 |
| AC-04 | UNIT-03, API-06, API-07 |
| AC-05 | SEC-01, SEC-02, UI-02 |
| AC-06 | API-08, API-09, WF-06, SEC-03 |
| AC-07 | UNIT-04, WF-01, SEC-02 |
| AC-08 | UNIT-05, WF-02, CON-02 |
| AC-09 | WF-03, WF-04, E2E-02 |
| AC-10 | WF-05, CON-03, E2E-03 |
| AC-11 | CON-01, CON-02, CON-03, CON-04, WF-07 |
| AC-12 | API-10, API-11, CON-05, UI-04 |
| AC-13 | UNIT-06, DASH-01, DASH-02, DASH-06, SEED-04, SEED-06 |
| AC-14 | UNIT-06, DASH-03, DASH-04, DASH-06, SEED-04, SEED-06 |
| AC-15 | DASH-05, E2E-04, E2E-05 |
| AC-16 | MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, DB-01, DB-02, DB-03, DB-04, SEED-01, SEED-02, SEED-03, SEED-04, SEED-05, SEED-06, SEED-07, SEED-08, SEED-09, SEED-10 |
| AC-17 | SEC-04, SEC-05, SEC-06, SEC-07 |
| AC-18 | UI-01, UI-03, UI-04, UI-05, UI-06, SEC-08 |
| AC-19 | UI-07, UI-08, SEC-08 |
| AC-20 | VIS-01, VIS-02, A11Y-01, A11Y-02 |
| AC-21 | REG-01, REG-02, REG-03, REG-04, REG-05, WF-07 |
| AC-22 | PERF-01, PERF-02 |
| AC-23 | REL-01, REL-02 |
| AC-24 | E2E-01, E2E-02, E2E-03 |

## 4. Unit and API Test Cases

### 4.1 Unit

UNIT-01..03 now execute against the action validation module. Other unit paths in this table remain planned.

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-05, BR-06; AC-02 | Text lengths 0/1/max/max+1, whitespace-only, conditional follow-up note, null vs omitted fields | Trimming and merged-field validation match API contract; clearing follow-up clears current note, explicit nonblank note with false fails | server/tests/lab-04/action-validation.test.ts | Pass: ACT-RUN-02 |
| UNIT-02 | Unit | BR-07; AC-02 | actionAt just before/at Ticket creation and at/after now; valid offsets, invalid/local-only dates | Inclusive creation/now bounds accepted; outside bounds and missing offsets rejected | server/tests/lab-04/action-validation.test.ts | Pass: ACT-RUN-02 |
| UNIT-03 | Unit | BR-08, BR-10; AC-04 | All 4x4 action-state pairs plus correction field allowlists | Only documented transitions; Completed corrections preserve fixed assignee/status; Cancelled immutable | server/tests/lab-04/action-validation.test.ts | Pass: ACT-RUN-02 |
| UNIT-04 | API/integration | BR-12; AC-07 | All 8x8 Ticket-state pairs and supported aliases | Exact specification matrix; same-state transitions disallowed; invalid labels rejected | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| UNIT-05 | API/integration | BR-13, BR-15; AC-08 | Zero/completed/unfinished/follow-up/cancelled/prior-cycle action combinations | Gate passes iff current-cycle completed count >=1, unfinished=0 and non-cancelled follow-up=0; stable blockers | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| UNIT-06 | Unit | BR-20, BR-21; AC-13, AC-14 | Frozen Bangkok calendar window, equivalent offsets, rollover dates, priority fallback | Correct [since, asOf) conversion and effective priority; no host-timezone dependence | server/tests/lab-04/dashboard-calculations.test.ts | Planned |

### 4.2 Actions Taken API

For rejected mutations assert the response **and** unchanged action/Ticket values, versions, revision counts and receipt counts.

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-01 | API/integration | FR-01, BR-01, BR-03; AC-01 | Staff/admin create with valid required fields, active parent and current version | 201; Planned action, correct parent/cycle, authenticated performer/default assignee, revision 1, Ticket version +1 | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-02 | API/integration | FR-02; AC-01 | Omitted defaults and explicit optional values; staff lookup | Server defaults applied once; active staff/admin lookup excludes inactive/non-staff; DTO has numeric ticketId and no private account fields | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-03 | API/integration | BR-05..07, BR-17; AC-02 | Boundary inputs from UNIT-01/02 through POST/PATCH; unknown fields, actor spoof, invalid IDs/version/key | 400 safe validation response and no mutation; validation examines final merged action state | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-04 | API/integration | BR-02, BR-04; AC-03 | S1 records for S2-owned Ticket, assigns S2, then different staff edits | Owner unchanged; performer stays S1; revisions identify actual editors; active reassignment succeeds | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-05 | API/integration | BR-04; AC-03 | Missing/inactive/non-staff assignee, later deactivation, completion then reassignment | Invalid assignments/completion fail 400; historical names remain readable; reassignment to active staff enables completion; Completed correction does not require reactivation | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-06 | API/integration | BR-08, BR-09; AC-04 | All action state pairs, completion without Result, cancellation without reason, terminal parent or old cycle | Legal targets succeed; invalid transition 409; missing required data/same-state 400; frozen parent/action rejects with documented 409 code | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-07 | API/integration | BR-10; AC-04 | Correct Completed content and clear follow-up while parent active; try changing Completed assignee/status or editing Cancelled | Allowed correction appends revision; fixed/immutable fields rejected; no-op patch 400 | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-08 | API/integration | BR-10, BR-11; AC-06 | Create/edit/start/complete and read revisions; attempt history mutation | Prior snapshots remain identical; revision numbers increase once per accepted write; authenticated actor/server time; no supported history write/delete route | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-09 | API/integration | FR-04, FR-05; AC-06 | Action/revision list ties, edit actionAt, empty/beyond-last page, invalid pagination | Deterministic ordering, correct totals/max 50; actionAt edit can reposition current row; history remains revision ordered; invalid query 400 | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-10 | API/integration | BR-18; AC-12 | Retry successful creation with same actor/key/body, including omitted actionAt, after Ticket changes | 200 with Idempotency-Replayed=true and original body; exactly one action/revision/receipt; no second version increment | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| API-11 | API/integration | BR-18; AC-12 | Same key with different payload/parent; different actor using same key; retry failed validation | Changed payload 409; actor scope independent; failed attempt creates no success receipt; accepted corrected attempt follows contract | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |

API-07 verifies action correction; WF-02 now verifies clearing completed follow-up unblocks resolution while preserving the earlier revision. UNIT-04/05 retain their stable IDs but their planned unit contracts are verified at the stronger real-API/database integration level in WF-REG-02.

### 4.3 Ticket workflow

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| WF-01 | API/integration | BR-12; AC-07 | Every 8x8 pair as staff/admin with gate-ready data; Requester attempts covered by SEC-02 | Only allowed transitions succeed; invalid labels 400, invalid transitions 409; version/event increment exactly once on success | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| WF-02 | API/integration | BR-13; AC-08 | Both incoming Resolved paths with zero actions, unfinished work, follow-up, cancelled-only, completed current-cycle work | Gate cases fail/succeed exactly as specified; blockers accurate; resolvedAt set only on successful resolution | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| WF-03 | API/integration | BR-15, FR-07; AC-09 | Owning Requester indicates resolution in allowed states, repeats, then staff reopens | Advisory never changes formal status; repeat no-op; reopen increments cycle and clears flag/time/resolvedAt | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| WF-04 | API/integration | BR-15, BR-16; AC-09 | Reopen Resolved/Closed Ticket with completed old actions, then try resolving new cycle | Old actions visible/read-only but do not pass gate; new current-cycle completed work required | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| WF-05 | API/integration | BR-14; AC-10 | Cancel with/without reason and mixed Completed/unfinished/old-cycle actions | Reason required; unfinished current-cycle actions cancelled atomically with revisions; Completed/old-cycle records preserved; Ticket version increments once | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| WF-06 | API/integration | FR-05; AC-06 | Multiple status events with timestamp ties, cancellation reasons, legacy empty history | Ordered by createdAt then ID; immutable events; shared DTO contains only documented fields; empty legacy history 200 | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| WF-07 | API/integration | BR-17, BR-24; AC-11, AC-21 | Owner/priority writes with versions; comments/attachments/advisory activity versus private notes | Required versions enforced, existing success fields retained; public activity updates Ticket timestamp/version, private notes change neither | server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |

### 4.4 Dashboards and list predicates

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| DASH-01 | API/integration | FR-09, BR-20; AC-13 | R1/R2 query deterministic fixture | Exact section 2.3 counts/lists, role scoping before aggregation; each preview <=5; no Internal Note/account fields | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-02 | API/integration | BR-21; AC-13 | R0 and window boundaries/legacy null resolvedAt; timezone/requesterId override | True zero/empty response, exact bounds, unknown legacy date excluded; unsupported parameters 400, no identity override | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-03 | API/integration | FR-10, BR-20; AC-14 | S1/A1 metrics and all status/priority buckets | Exact section 2.3 values; global counts same, personal counts use authenticated identity; null priority fallback correct | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| DASH-04 | API/integration | FR-10, FR-11; AC-14 | My actions with 0/3/7 matches, prior cycles/terminal parent, equal actionAt values | Correct assignee/current-cycle/parent predicate; pages 5/2/0, stable descending ID ties, no arbitrary assignee override | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| DASH-05 | API/integration | FR-11; AC-15 | Every metric's list query with fixed bounds; statusGroup/status conflict, reverse dates, null sorting, empty page | Detailed result set equals independent predicate oracle without intervening writes; invalid filters 400; envelopes preserved; null resolvedAt last | server/tests/lab-04/dashboard-drilldown.api.test.ts | Planned |
| DASH-06 | API/integration | BR-20, BR-21; AC-13, AC-14 | Empty whole database and a concurrent update during aggregate/preview reads | Zero buckets retained; one response is internally consistent with a single snapshot; later response may show new state; Cache-Control no-store | server/tests/lab-04/requester-dashboard.api.test.ts; server/tests/lab-04/staff-dashboard.api.test.ts | Planned |

## 5. Authorization, Concurrency and Safe Failure

### 5.1 Security matrix

Execute applicable cases for every new endpoint, plus touched existing endpoints; test API calls independently of hidden UI controls.

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| SEC-01 | Authorization/API | BR-11, BR-23; AC-05 | R1 reads own/other/missing Ticket actions and status history | Own reads succeed; other/missing share 404 shape; cancelled and prior-cycle current actions remain visible | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| SEC-02 | Authorization/API | FR-13; AC-05, AC-07 | Requester calls all staff action/workflow/dashboard/owner/priority routes | 403 before resource lookup; no writes, conflict versions or private payload | server/tests/lab-04/authorization.api.test.ts | Planned |
| SEC-03 | Authorization/API | BR-11; AC-06 | Requester requests action revisions; valid action ID under different parent; inspect shared DTOs | Revision route 403; staff parent mismatch 404; no note data/counts or sensitive account fields in shared data | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |
| SEC-04 | Authorization/API | BR-22, BR-26; AC-17 | No cookie, expired/logout cookie, forged requesterId in body/query | 401; no client identity fallback, including old Ticket/attachment routes; no writes | server/tests/lab-04/authorization.api.test.ts | Planned |
| SEC-05 | Authorization/API | BR-22; AC-17 | Deactivate/demote already logged-in user; P1 calls business API | Inactive session 401; current reduced role enforced; forced password change 403 PASSWORD_CHANGE_REQUIRED | server/tests/lab-04/authorization.api.test.ts | Planned |
| SEC-06 | Authorization/API | API section 1; AC-17 | Valid session with missing/wrong/another session's CSRF on each mutation | 403; no mutation/receipt; matching token succeeds when other rules pass | server/tests/lab-04/authorization.api.test.ts | Planned |
| SEC-07 | Authorization/API | BR-18, BR-22; AC-17 | Replay prior create after logout/deactivation/demotion | Reauthorization occurs before replay; unauthorized caller receives no original body or resource metadata | server/tests/lab-04/authorization.api.test.ts | Planned |
| SEC-08 | Safe failure/API | BR-25; AC-18, AC-19 | Inject controlled DB failure; text containing HTML/script markup | Generic 500 without internals and no partial writes; UI renders user text as text, not executable HTML | server/tests/lab-04/actions-taken.api.test.ts; client/tests/lab-04/ActionsTaken.test.tsx | Pass: UI-RUN-02 |

Actions portions of SEC-01/02/04..08 pass in ACT-RUN-02. Status-history access now passes in WF-REG-02; untouched older-route identity bypasses and broader business-route hardening remain Planned. SEC-08 now combines ACT-RUN-02 fault rollback/error checks with UI-RUN-02 safe text rendering.

### 5.2 Concurrency cases

Use barriers or controlled database locks to establish overlap, not arbitrary sleeps. Inspect committed database state from a separate connection after requests finish. Run both orderings where meaningful.

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| CON-01 | Database concurrency | BR-17; AC-11 | Two edits read the same action/Ticket versions; two owner/status edits share one Ticket version | Exactly one accepted mutation, other 409 STALE_VERSION; correct winning values, one revision/event and one version increment | server/tests/lab-04/actions-taken.api.test.ts; server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| CON-02 | Database concurrency | BR-13, BR-19; AC-08, AC-11 | Gate-ready Ticket: race new unfinished action or follow-up edit against Resolve | Parent lock serializes operations; if action wins, resolution is stale/blocked; if resolution wins, action write is stale/not editable; no resolved Ticket with new unresolved work | server/tests/lab-04/actions-taken.api.test.ts; server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| CON-03 | Database rollback | BR-14, BR-19; AC-10, AC-11 | Fail after first cancellation revision or before receipt/audit completion; force retryable transaction failure | Entire write rolls back, no partial cascade/history/receipt; documented safe error; explicit retry can succeed | server/tests/lab-04/actions-taken.api.test.ts; server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| CON-04 | Database concurrency | BR-04, BR-22; AC-03, AC-11 | Assignment/completion races with assignee deactivation; actor demotion races with write | Eligibility is checked under compatible locks; result reflects a valid serial ordering, never stale account state after a completed admin change | server/tests/lab-04/actions-taken.api.test.ts; server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| CON-05 | Database concurrency | BR-18; AC-12 | Two identical POSTs with one actor/key; then simultaneous different payloads under one key | One creation; identical loser replays; differing loser conflicts; one action/revision/receipt and one Ticket increment | server/tests/lab-04/actions-taken.api.test.ts | Pass: ACT-RUN-02 |

WF-REG-02 runs the existing Actions suite plus the new workflow suite. Together they pass CON-01..05: competing action edits and status/owner/priority writes, both orderings of Resolve against new work/follow-up, cascade/pre-receipt rollback and retryable failures, actor/owner role changes and completion-assignee demotion/deactivation under real locks, and identical/different/cross-parent idempotent creates.

## 6. UI, Visual and Accessibility Tests

Component tests use mocked network responses to exercise rendering/interaction states. They do not substitute for database/API assertions. Exact response fixtures match api-spec.md.

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI component | FR-01, FR-02; AC-18 | Create/edit conditional fields, validation placement, default actor/assignee, success | Correct labels/defaults, immutable performer, conditional note, submitted payload, refreshed list and success announcement | client/tests/lab-04/ActionsTaken.test.tsx | Pass: UI-RUN-02 |
| UI-02 | UI component | FR-04, BR-09, BR-11; AC-05 | Each role and action/parent/cycle combination | Requester sees all current action records read-only; no Internal Notes/history DOM; only permitted staff edits visible | client/tests/lab-04/ActionsTaken.test.tsx | Pass: UI-RUN-02 |
| UI-03 | UI component | BR-17, BR-25; AC-18 | Save receives stale version or recoverable 500 | Draft retained; latest values load explicitly; no automatic overwrite/resubmit; current versions used only after user retry | client/tests/lab-04/ActionsTaken.test.tsx | Pass: UI-RUN-02 |
| UI-04 | UI component | BR-18; AC-12, AC-18 | Double-click save; lost create response; replay; validation correction | Busy controls prevent duplicate requests; uncertain retry reuses identical body/key, draft locked until resolved; new submission after known failure uses fresh attempt | client/tests/lab-04/ActionsTaken.test.tsx | Pass: UI-RUN-02 |
| UI-05 | UI component | FR-06, FR-07; AC-18 | Each Ticket state, gate blockers, cancellation/reopen confirmation | Matrix-derived targets only; meaningful blockers; reason required; advisory separate; authoritative status/gate refresh | client/tests/lab-04/TicketWorkflow.test.tsx | Pass: WFUI-RUN-01 |
| UI-06 | UI component | FR-14; AC-18 | 401/403/404/409/500, retryable conflict, cancel dirty form | Role-safe feedback/navigation; drafts retained for recoverable failures; explicit discard/focus return; no private content after 401 | client/tests/lab-04/TicketWorkflow.test.tsx; client/tests/lab-04/ActionsTaken.test.tsx | Pass: WFUI-RUN-01 |
| UI-07 | UI component | FR-09, BR-25; AC-19 | Requester loading/zero/results/forbidden/network error | No fake zero while loading/failing; labels/timezone/refresh correct; safe recovery and owned links | client/tests/lab-04/RequesterDashboard.test.tsx | Planned |
| UI-08 | UI component | FR-10, BR-25; AC-19 | Staff/admin buckets, action paging, zeros/errors and return after mutations | Accurate backend values including zero buckets; five-row bound; personal list paging; refetch affected data | client/tests/lab-04/StaffDashboard.test.tsx | Planned |
| VIS-01 | UI style / responsive | FR-14; AC-20 | Dashboard/action/detail at 1440x900, 768x1024, 390x844 and 320px width | Zen Green tokens and consistent states; columns/cards adapt; no clipping, overlap or page overflow | e2e/lab-04/dashboards.spec.ts; e2e/lab-04/actions-taken-flow.spec.ts; e2e/lab-04/ticket-resolution.spec.ts plus screenshot review | Planned |
| VIS-02 | UI style / manual | FR-14; AC-20 | Long descriptions/names, empty/error/conflict views, 200% zoom | Readable full content, usable controls, shared/private distinction and editable/read-only styling | Same E2E files for screenshots; manual zoom/visual checklist | Planned |
| A11Y-01 | Accessibility / E2E | FR-14; AC-20 | Keyboard-only cards, tabs, forms, pagination and dialogs | Focus visible/logical, real links, labelled controls/errors, dialog focus containment/Escape/return, no keyboard trap | e2e/lab-04/actions-taken-flow.spec.ts; e2e/lab-04/ticket-resolution.spec.ts; e2e/lab-04/dashboards.spec.ts | Planned |
| A11Y-02 | Accessibility / manual | FR-14; AC-20 | Contrast, touch targets, color-independent meaning, loading/success/error announcements | >=4.5:1 normal text, >=3:1 large text/meaningful UI; >=44px controls; appropriate screen-reader feedback | Manual checklist; supporting assertions in the four client/tests/lab-04 component files | Planned |

UI-RUN-02 passes UI-01..04 with 37 Actions component cases and three Ticket Detail integration cases. UI-06's Actions responses/discard/session portions pass; issue #48 adds the Ticket-workflow cases in WFUI-RUN-01. UI-BROWSER-02 passes E2E-01 and supports the Actions portions of VIS-01/02 and A11Y-01/02 at all four viewport sizes. WFUI-BROWSER-02 additionally covers workflow layout, dialogs, text enlargement and focus at these sizes. Dashboard checks, native browser-menu zoom and a complete assistive-technology audit remain Planned, so combined visual/accessibility rows retain that status. Calculated contrast values and screenshots are linked from [actions-ui.md](actions-ui.md) and [ticket-workflow-ui.md](ticket-workflow-ui.md).

Capture screenshots under artifacts/lab-04/screenshots/staff-dashboard/, requester-dashboard/, actions-taken/ and ticket-workflow/. Include screen/state/viewport/browser in names; use test-specific output paths before copying approved evidence so parallel runs/retries do not overwrite each other. Failed-run screenshots are diagnostics, not proof of passing visual review. The dedicated Actions configuration uses one worker and only Chromium writes the named screenshots; Firefox/WebKit still execute every behavioral/layout assertion.

## 7. End-to-End Scenarios

Run on the configured Chromium, Firefox and WebKit projects. Use fresh browser contexts per role and real backend sessions. Selectors should prefer roles/labels over CSS implementation details.

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | FR-01..05; AC-01, AC-24 | Staff records multiple actions on one Ticket owned by different staff; assigns, starts, edits, completes; Requester reads | Actors/assignees independent; versions/history consistent; Requester read-only visibility; inactive assignment and validation failures covered | e2e/lab-04/actions-taken-flow.spec.ts | Pass: UI-BROWSER-02 |
| E2E-02 | E2E | FR-06, FR-07; AC-09, AC-24 | Create Ticket, progress, advisory indication, blocked Resolve, complete work, resolve, close, reopen and resolve again | Advisory never bypasses gate; new-cycle evidence required after reopen; status/history/dashboard agree | e2e/lab-04/ticket-resolution.spec.ts | Partial: workflow and return-to-list portions pass WFUI-BROWSER-02; dashboard agreement remains Planned |
| E2E-03 | E2E | BR-14; AC-10, AC-24 | Cancel Ticket with mixed actions and required reason; view as Requester | Unfinished actions cancelled together, completed evidence retained; no further edits, consistent shared display | e2e/lab-04/ticket-resolution.spec.ts | Pass: WFUI-BROWSER-02 |
| E2E-04 | E2E | FR-09..11; AC-15 | Every Requester/staff metric and action destination; browser refresh/back/forward | Correct list filters and encoded bounds persist; IDs resolve correctly; personal action paging works | e2e/lab-04/dashboards.spec.ts | Planned |
| E2E-05 | E2E | FR-11, FR-13; AC-15 | Mutate then return to dashboard; log out and switch role/user; direct unauthorized URLs | Fresh counts, isolated caches, no previous-user data; role guards and safe permission feedback | e2e/lab-04/dashboards.spec.ts | Planned |

## 8. Migration and Labs 1-3 Regression

### Migration and seed

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file / evidence | Final |
|---|---|---|---|---|---|---|
| MIG-01 | Migration/integration | FR-12; AC-16 | Upgrade disposable Lab 3 snapshot with all earlier models and attachment metadata | IDs/counts/relationships/legacy values preserved; version/cycle=1; resolvedAt null; no fabricated actions/events; documented aliases normalized | server/tests/lab-04/migration-regression.test.ts | Pass: DB-RUN-02 |
| MIG-02 | Migration/workflow | BR-16; AC-16 | Legacy unresolved zero-action Ticket, Resolved Ticket, Closed Ticket and unknown historical enum | Unresolved must record work before resolving; legacy Resolved can close; reopen activates new gate; unknown values stop migration without silent rewrite | server/tests/lab-04/migration-regression.test.ts; server/tests/lab-04/ticket-workflow.api.test.ts | Pass: WF-REG-02 |
| MIG-03 | Recovery/integration | FR-12; AC-16 | Fail migration, then rehearse database and synthetic attachment backup/restore | Transactional failure rolls back; restored rows/sequences and synthetic file hashes match; post-upgrade data is restored separately before returning to Lab 3 | server/tests/lab-04/migration-regression.test.ts; docs/lab-04/migration-recovery.md | Pass: DB-RUN-02 |
| MIG-04 | Seed/integration | FR-12; AC-16 | Seed twice, then edit fixture/user data and seed again | No duplicate actions/revisions/events; existing passwords and user edits retained; required fixture categories remain available | server/tests/lab-04/seed-fixtures.test.ts (SEED-01 and SEED-02) | Pass: SEED-RUN-03 |
| MIG-05 | Manual recovery smoke | FR-12; AC-16 | Restore a deployment backup and actual attachment storage with its matching Lab 3 application | Real legacy routes/downloads function; storage hashes/metadata match; writes remain stopped until post-upgrade data reconciliation | docs/lab-04/migration-recovery.md and deployment recovery evidence | Planned |
| DB-01 | Database/integration | FR-02, FR-03, FR-12; AC-16 | Prisma creates actions with independent performer/assignee, revisions, events and receipts | Required defaults/UUIDs/timestamps round-trip; Ticket Owner unchanged; historical inactive/demoted accounts retained | server/tests/lab-04/migration-regression.test.ts | Pass: DB-RUN-02 |
| DB-02 | Database/constraints | FR-02, FR-12; AC-16 | Invalid lengths/blank required values, conditional notes/results/reasons and nonpositive counters | PostgreSQL rejects invalid rows; exact upper bounds accepted; no rejected row persists | server/tests/lab-04/migration-regression.test.ts | Pass: DB-RUN-02 |
| DB-03 | Database/integrity | FR-05, FR-08, FR-12; AC-16 | Missing parents, deletion of referenced rows, audit payloads and duplicate keys | Restrictive FKs and unique action/revision and actor/key scopes hold; audit JSON/hash/counters validated | server/tests/lab-04/migration-regression.test.ts | Pass: DB-RUN-02 |
| DB-04 | Database/concurrency | FR-08, FR-12; AC-16 | Concurrent version-conditional updates, injected transaction failure and index inventory | One write per expected version; failure rolls back action/revision/Ticket increment; required indexes exist | server/tests/lab-04/migration-regression.test.ts | Pass: DB-RUN-02 |

WF-REG-02 reruns MIG-02's three unknown-value/preflight cases plus its unresolved zero-action, legacy closure and reopened-cycle gate scenarios. DB-04 verifies database support; CON-01..05 now have service-level locking/concurrency evidence in the combined Actions/workflow run. MIG-05 is a deployment check; the baseline upload route currently does not persist file bytes, so synthetic file recovery cannot establish real download recovery.

### Seed and metric fixture verification

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| SEED-01 | Seed/integration | FR-12; AC-16 | Run normal seed twice and repeat the demo profile with a different clock | Original seed retained; one complete Lab 4 graph; all stored values and first-creation timestamps unchanged on rerun | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-02 | Seed/preservation | FR-12; AC-16 | Change existing and fixture accounts/passwords, Ticket/action values and add public/private/attachment work, then reseed | Every edited value, new row and prior history preserved; no passwords or account flags reset | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-03 | Fixture/integration | FR-12; AC-16 | Load dashboard CLI into a fresh database, inspect coverage, then repeat | Exactly 8 Users, 11 Tickets, 8 actions, 15 revisions and 1 event; statuses, priorities, assignment, legacy timestamps and zero/one/multiple action cases present | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-04 | Fixture/SQL oracle | FR-09, FR-10, FR-12; AC-13, AC-14, AC-16 | Query committed fixed-clock fixture independently with SQL | Requester/staff counts and ordered previews match section 2.3, including ownership, null priority, cycle and assignee predicates | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-05 | Fixture/history | FR-05, FR-12; AC-16 | Inspect current actions and all revision snapshots | Contiguous revisions; current snapshot matches; no private account fields; cleared follow-up evidence and old-cycle actions retained; owner/performer/assignee independence | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-06 | Fixture/boundaries | FR-09, FR-10, FR-12; AC-13, AC-14, AC-16 | Load separate boundary and empty profiles | Exact millisecond cases before/at/after both bounds; boundary recent counts 3; empty database has accounts but zero Tickets/actions | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-07 | Seed/concurrency | FR-12; AC-16 | Two seed calls race for the same profile | One creates all 11 Tickets, the other skips all; no duplicate child/history rows or timestamp changes | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-08 | Seed/collision | FR-12; AC-16 | A reserved email has another ID, including case variant | Explicit failure, no takeover and complete transaction rollback | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-09 | Seed/rollback | FR-12; AC-16 | Reserved action UUID collides on a later Ticket's nested creation | All new seed rows roll back; existing work remains byte-for-byte equivalent in row inventory | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |
| SEED-10 | Seed/safe skip | FR-12; AC-16 | Existing Ticket uses a fixture key; invalid demo clock supplied separately | Existing aggregate gets no changes/children; other new Tickets load; invalid clock fails before writes; fixed profile ignores wall-clock changes | server/tests/lab-04/seed-fixtures.test.ts | Pass: SEED-RUN-03 |

SEED-04/06 validate fixture data and the expected SQL oracle; DASH-01..06 remain Planned for actual dashboard endpoints. MIG-04 groups the first two seed tests rather than adding a separate eleventh test. No full AC or final-main release result is inferred from fixture verification.

### Existing regression suites

These paths already exist. Their status below refers to the **future Lab 4 regression run**, not earlier lab results. Update tests only for intentional contract changes (real authentication, versions, gate, dashboard landing); do not remove meaningful assertions to obtain a green run.

| ID | Type | Requirement / AC | Scenario | Expected result | Existing automated test files | Final |
|---|---|---|---|---|---|---|
| REG-01 | Unit/API/UI regression | FR-12, FR-15; AC-21 | Health/category endpoints and initial UI behavior | Health/category behavior preserved under supported app initialization | server/tests/lab-01/health.test.ts; server/tests/lab-01/categories.test.ts; client/tests/lab-01/App.test.tsx | Planned |
| REG-02 | API/UI/E2E regression | FR-12, FR-13; AC-21 | Create/list/detail/attachments through authenticated Requester | Ownership retained; max 5 active files, 5MB/type limits and reasoned soft removal enforced; removed files inaccessible | server/tests/lab-02/*.test.ts; client/tests/lab-02/*.test.tsx; e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| REG-03 | API/UI/E2E regression | FR-13; AC-21 | Login/logout, first-login password change, role navigation and direct API/route guards | Supported authentication behavior preserved; no development identity fallback; new dashboard landing intentional | server/tests/lab-03/auth.api.test.ts; server/tests/lab-03/authorization.api.test.ts; client/tests/lab-03/Login.test.tsx; client/tests/lab-03/ChangePassword.test.tsx; client/tests/lab-03/AppNavigationAndGuards.test.tsx; e2e/lab-03/authentication.spec.ts | Planned |
| REG-04 | API/UI/E2E regression | FR-12, BR-24; AC-21 | Queue filters, ownership/priority, comments/notes, Requester detail | Existing envelopes/filter behavior retained; privacy and append-only comments/notes remain correct; versions/gate intentionally enforced | server/tests/lab-03/staff-queue.api.test.ts; server/tests/lab-03/staff-ticket-detail.api.test.ts; server/tests/lab-03/comments-notes.api.test.ts; server/tests/lab-03/requester-ticket-detail.api.test.ts; client/tests/lab-03/StaffTicketQueue.test.tsx; client/tests/lab-03/StaffTicketDetail.test.tsx; client/tests/lab-03/RequesterTicketDetail.test.tsx; e2e/lab-03/staff-ticket-flow.spec.ts | Planned |
| REG-05 | API/UI/E2E regression | FR-13; AC-21 | Admin list/search/create/edit/reset password and self/last-admin restrictions | Original admin rules hold; deactivated/demoted active sessions are revalidated; historical references remain | server/tests/lab-03/users-admin.api.test.ts; client/tests/lab-03/UserManagement.test.tsx; e2e/lab-03/user-administration.spec.ts | Planned |

When enumerating regression evidence, expand wildcard paths into the actual executed files. Update cleanup for new child FKs so old fixtures do not fail simply because revisions/actions now exist. Tests requiring separate datasets must not share mutable seed records across parallel browser projects.

## 9. Performance Smoke and Release Evidence

| ID | Type | Requirement / AC | Scenario | Expected result | Automated test file / evidence | Final |
|---|---|---|---|---|---|---|
| PERF-01 | Performance smoke | FR-10, FR-15; AC-22 | 10,000 Tickets / 30,000 actions; 5 warm-ups then 20 sequential requests per dashboard endpoint | p95 <1000ms for each endpoint; no hidden failure responses; record raw durations and environment | server/tests/lab-04/dashboard-performance.test.ts | Planned |
| PERF-02 | Performance/integration | BR-20; AC-22 | Instrument database queries and response size under growing fixtures | Preview bounds remain 5, My actions page 5, other new pages <=50; no per-Ticket query loop or full-collection response | server/tests/lab-04/dashboard-performance.test.ts | Planned |
| REL-01 | Release verification | FR-15; AC-23 | Final main builds and executes required suites | Logs identify SHA, commands, counts and outcomes; all required cases executed successfully; no unexplained skips or unresolved failures | CI logs, tests.md execution record, artifacts/lab-04/test-results/ | Planned |
| REL-02 | Manual evidence | FR-15; AC-23 | Review documentation, screenshots and final PDF against nine submission parts | Real reviewer/PR evidence, actual AI prompts/reflection, current README, migration recovery, metric query comparisons, readable linked submission | docs/lab-04/reviewer.md; docs/lab-04/ai-use.md; README.md; final submission PDF (planned artifacts) | Planned |

Use nearest-rank p95: sort the 20 durations and take the 19th value. Record OS, CPU/RAM, Node/PostgreSQL versions, database placement, dataset generator/seed, SHA, endpoint and every measured duration. Exclude warm-ups only; do not silently discard slow/error samples. Measure in isolation, without E2E/migration loads competing for the same database. Keep the performance suite opt-in for routine development, but explicitly enable and record it for release.

## 10. Execution Order and Commands

### Before execution

1. Confirm a disposable test DATABASE_URL and test SESSION_SECRET in the shell; never copy real credentials into logs.
2. Install locked dependencies in root, server and client. Generate Prisma and apply migrations to the test database.
3. Run unit/API/component suites using isolated fixtures.
4. Prepare a separate E2E database with the required accounts and seed data; run the browser suites.
5. Run migration/recovery and performance fixtures separately, then perform visual/accessibility review.
6. Repeat the final required suite from main during release; feature-branch results alone are not final-main evidence.

The following are **planned execution commands**, not a record of commands already run:

~~~powershell
npm ci
npm ci --prefix server
npm ci --prefix client
Push-Location server
npx prisma generate
npx prisma migrate deploy
Pop-Location

# Focused Lab 4 suites, after their files exist:
npm test --prefix server -- tests/lab-04
npm test --prefix client -- tests/lab-04
npx playwright test e2e/lab-04

# Full regression/build verification:
npm run build --prefix server
npm run build --prefix client
npm test --prefix server
npm test --prefix client
npx playwright test
~~~

Run npm run prisma:seed from server against the E2E database before starting Playwright when the suite requires demo accounts. Install Playwright browsers with `npx playwright install` (CI uses `--with-deps`). Playwright starts both application servers and inherits environment variables; locally it can reuse existing servers, so verify those servers use the intended test database.

Regression CI now includes main/master/lab3-staging/lab4-staging push/PR triggers. Dedicated workflows run isolated Actions API and Actions UI checks; actions-ui.md documents the required opt-in browser database. Remote CI is confirmed only after its runs execute.

The current Vitest include patterns discover the planned server `.test.ts` and client `.test.tsx` files. E2E uses Chromium/Firefox/WebKit. Screenshot naming must account for project and retry; do not change global test parallelism merely to hide shared-fixture bugs.

## 11. Results and Evidence Recording

`Planned` = case defined but not implemented/executed. After implementation use `Not run`, `Pass`, `Fail` or `Blocked`, with an execution entry. A skipped opt-in performance case is Not run for the required release run. Manual checks require a reviewer/date and evidence just like automated results.

| Run ID | Branch / commit SHA | Command or manual procedure | Environment / fixture | Test IDs / executed files | Result / counts | Evidence / failure issue |
|---|---|---|---|---|---|---|
| DB-RUN-01 | feature/lab4-3-db-migration; base a3b3df2 + working changes | npm run test:migration | Windows, Node 22.17.1, Prisma 5.22.0, PostgreSQL 16 disposable Docker | migration-regression.test.ts, 9 tests | 4 passed / 5 failed: CHECK error assertion expected P2004; actual SQLSTATE 23514; Prisma masked first transactional preflight diagnostic | Corrected assertions to CHECK failures and verified actionable diagnostics with psql before deploy; rerun DB-RUN-02 |
| DB-RUN-02 | feature/lab4-3-db-migration; base a3b3df2 + working changes | npm run test:migration (equivalent direct Vitest command recorded in migration-recovery.md) | Same isolated PostgreSQL 16; synthetic legacy rows and file | MIG-01, MIG-03, DB-01..04; MIG-02 preflight portion | 9 passed / 0 failed; broader MIG-02 and MIG-04/05 remain Planned | test-results/lab4-migration.xml (local ignored report); docs/lab-04/migration-recovery.md |
| DB-REG-01 | feature/lab4-3-db-migration; base a3b3df2 + working changes | prisma migrate deploy; prisma migrate diff --from-url <disposable URL> --to-schema-datamodel prisma/schema.prisma --exit-code; npm run prisma:seed; npm test | Separate fresh lab4_regression database on the disposable PostgreSQL 16 server | All 13 server Lab 1-3 files | 113 passed / 0 failed; isolated migration suite's 9 tests intentionally skipped here and executed separately above; schema diff empty | Backend portion of REG-01..05 only; UI/E2E/final-main regression remains Planned |
| DB-STATIC-01 | Same working tree | npx prisma validate; npx prisma generate; npm run build | Windows, Node 22.17.1 | Schema/client/server TypeScript including migration tests | Pass | Local command output; CI workflow added, remote CI not yet executed |
| SEED-RUN-01 | feature/lab4-4-seed-fixtures; base a1dd4df + working changes | Combined database/fixture Vitest command in seed-fixtures.md | Windows, Node 22.17.1, Prisma 5.22.0, disposable PostgreSQL 16 | migration-regression.test.ts + seed-fixtures.test.ts | 9 passed / 10 failed; Prisma bound lock key as bigint, but the two-key advisory-lock overload requires integers | Added explicit integer cast; local report test-results/lab4-seed-initial-failure.xml |
| SEED-RUN-02 | Same feature working tree | Focused seed suite | Same disposable PostgreSQL server | seed-fixtures.test.ts | 9 passed / 1 failed; test selected X1 to assert performer differs from Owner, while planned X1 deliberately shares performer/Owner | Asserted X2, the existing independent-performer fixture; local report test-results/lab4-seed-second-failure.xml |
| SEED-RUN-03 | feature/lab4-4-seed-fixtures; base a1dd4df + working changes | Combined database/fixture Vitest command in seed-fixtures.md | Same isolated PostgreSQL 16; each fixture profile in its own generated database | All 9 migration tests + 10 seed tests; MIG-04, SEED-01..10 | 19 passed / 0 failed / 0 skipped; 17.00s | test-results/lab4-database-fixtures.xml; docs/lab-04/seed-fixtures.md |
| SEED-REG-01 | Same feature working tree | prisma migrate deploy; normal seed; complete backend Vitest run | Separate fresh lab4_seed_regression database on disposable PostgreSQL 16 | All 13 server Lab 1-3 files with the extended normal seed | 113 passed / 0 failed; isolated database suites' 19 tests intentionally skipped here and run separately above | test-results/lab4-seed-backend-regression.xml; backend portion of REG-01..05 only |
| SEED-STATIC-01 | Same feature working tree | npm run build | Windows, Node 22.17.1 | Server TypeScript, seed scripts and database tests | Pass | Local command output; CI updated to discover both database suites; remote CI not yet executed |
| ACT-RUN-01 | feature/lab4-5-actions-api; base 52ce172 + working changes | test:actions equivalent direct Vitest command in actions-api.md | Windows, Node 22.17.1, Prisma 5.22.0, disposable PostgreSQL 16 | 54 validation + 70 Actions API tests | 123 passed / 1 failed; injected deadlock SQLSTATE 40P01 surfaced as Prisma UnknownRequestError and returned 500 instead of retryable 409 | Added connector SQLSTATE handling; test-results/lab4-actions-conflict-failure.xml |
| ACT-RUN-02 | feature/lab4-5-actions-api; base 52ce172 + working changes | test:actions equivalent direct Vitest command in actions-api.md | Same environment; API suite provisions its own isolated database | UNIT-01..03, API-01..11, SEC-03, CON-05 and explicitly scoped security/concurrency portions | 124 passed / 0 failed / 0 skipped: 54 unit + 70 API tests; 11.88s | test-results/lab4-actions.xml; docs/lab-04/actions-api.md |
| ACT-REG-01 | Same feature working tree | prisma migrate deploy; normal seed; Vitest run tests/lab-01 tests/lab-02 tests/lab-03 | Separate fresh lab4_actions_regression database on disposable PostgreSQL 16 | All 13 existing backend files | 113 passed / 0 failed / 0 skipped | test-results/lab4-actions-regression.xml; backend portions of REG-01..05; frontend/E2E/final-main remain Planned |
| ACT-STATIC-01 | Same feature working tree | npm run build | Windows, Node 22.17.1 | Server TypeScript and all test/seed sources | Pass | CI configured for isolated Actions tests and lab4-staging regression triggers; remote CI not yet executed |
| UI-RUN-01 | feature/lab4-6-actions-ui; base 72533a4 + working changes | Focused ActionsTaken.test.tsx run | Windows, Node 22.17.1, Vitest 2.1.9, jsdom | Initial 34 Actions component cases | 34 passed / 0 failed after adding an explicit accessible name to each View button | Expanded in UI-RUN-02 with boundary, authentication, read-only conflict and parent-refresh integration cases |
| UI-BROWSER-01 | Same feature working tree | Dedicated responsive browser rehearsal | PostgreSQL 16 disposable Docker; Playwright 1.63.0 | Responsive case on all three browsers | 2 passed / 1 failed: Firefox exposed a long requester email overflowing a tablet flex item | Added min-width/word wrapping to staff identity fields; test-results/lab4-actions-browser-layout-failure.xml; final rerun UI-BROWSER-02 |
| UI-RUN-02 | Same feature working tree | Full client Vitest command in actions-ui.md | Windows, Node 22.17.1, Vitest 2.1.9 | All 14 client files; UI-01..04, SEC-08 UI portion, UI-06 Actions portion | 136 passed / 0 failed / 0 skipped: 40 new component/integration cases + 96 existing cases | test-results/lab4-client-regression.xml; client portions of REG-01..05; final-main remains Planned |
| UI-BROWSER-02 | Same feature working tree | npx playwright test --config=playwright.actions.config.ts | Separate PostgreSQL 16 database; real sessions; Chromium, Firefox, WebKit | E2E-01, identical replay, stale edit/navigation guard, four viewports, text enlargement and keyboard focus | 12 passed / 0 failed / 0 skipped (four scenarios on each browser) | test-results/lab4-actions-browser.xml; artifacts/lab-04/screenshots/actions-taken/; actions-ui.md |
| UI-BROWSER-03 | Same feature working tree | Dedicated config with --grep=responsive --reporter=list; then Chromium --grep='real staff lifecycle' --reporter=list | Same separate database and browsers | Final <=400px single-column label/value refinement; regenerate narrow/mobile and Requester screenshots | 3 layout tests passed on all browsers; 1 real-flow/Requester screenshot test passed on Chromium; no failures/skips | test-results/lab4-actions-final-layout.log; test-results/lab4-actions-final-requester-view.log; UI-BROWSER-02 full JUnit report preserved |
| UI-STATIC-01 | Same feature working tree | npm run build --prefix client; diff/traceability/link checks; visual screenshot review | Windows, Node 22.17.1, TypeScript, Vite 6.4.3 | Client/test types and production bundle; six synthetic-data screenshots | Pass | Dedicated Actions UI CI configured; remote CI and reviewed PR linkage follow maintainer commit/push |
| WF-RUN-01 | feature/lab4-7-ticket-workflow-api; base b8f2bec + working changes | Dedicated workflow config | Windows, Node 22.17.1, Vitest 2.1.9, Prisma 5.22.0, separate PostgreSQL 16 | Initial 49 workflow tests, including 128 transition-pair checks | 49 passed / 0 failed; then expanded with concurrency, rollback, activity and eligibility cases | Final expanded suite is included in WF-REG-02 |
| WF-REG-01 | Same feature working tree | Full backend with all opt-in database URLs | Separate seeded regression database and independently generated suite databases | All backend files before final eligibility expansion | 311 passed / 7 failed: old owner/status requests omitted versions; mock-only attachment tests expected unauthenticated writes to proceed | Updated contract-aware fixtures/requests and retained authenticated file coverage in workflow suite; local Vitest failure output; final persisted report in WF-REG-02 |
| WF-REG-02 | Same feature working tree | Full backend Vitest; all WORKFLOW/ACTIONS/MIGRATION server URLs supplied | Same disposable PostgreSQL server, recovery tools use its container | All 18 backend files: 68 workflow + 124 Actions/unit + 19 migration/seed + 113 existing tests | 324 passed / 0 failed / 0 skipped | test-results/lab4-workflow-regression.xml; ticket-workflow-api.md |
| WF-CLIENT-01 | Same feature working tree | Full client Vitest plus production build | Windows, Node 22.17.1, mocked component responses | All 14 frontend files; existing staff controls submit observed versions | 136 passed / 0 failed / 0 skipped; build Pass | test-results/lab4-workflow-client.xml; workflow-specific presentation remains issue #48 |
| WF-BROWSER-01 | Same feature working tree | Playwright Lab 2 requester flow + Lab 3 staff-ticket-flow, workers=1 | Separate seeded browser database; real sessions; Chromium/Firefox/WebKit | Create/upload/soft-remove, advisory, queue/owner/priority/status/private notes, role/privacy and responsive journeys | 15 passed / 0 failed / 0 skipped | test-results/lab4-workflow-browser.xml; affected REG-02/03/04 portions; full final-main release remains Planned |
| WF-BROWSER-02 | Same feature working tree | Dedicated Actions UI config on all browsers | Same separate browser database; unique per-case fixtures | Full existing Actions UI integration, replay, conflict, role/history/privacy and layout cases | 12 passed / 0 failed / 0 skipped | test-results/lab4-workflow-actions-ui.xml; test-results/lab4-workflow-actions-ui.log |
| WF-STATIC-01 | Same feature working tree | Server/client builds; diff, documentation links and bidirectional AC mapping checks | Windows, Node 22.17.1 | Existing migrations unchanged; touched/new sources and documentation | Pass | CI workflow now runs isolated test:workflow; remote CI/reviewed PR follow maintainer commit/push |

| WFUI-RUN-01 | feature/lab4-8-ticket-workflow-ui; base da3b2ad + working changes | Full client Vitest command in ticket-workflow-ui.md | Windows, Node 22.17.1, Vitest 2.1.9, jsdom | All 16 client files: 136 existing + 41 workflow/component/integration + 10 HTTP-contract cases; UI-05/06 | 187 passed / 0 failed / 0 skipped | test-results/lab4-client-regression.xml; test-results/lab4-client-regression.log; ticket-workflow-ui.md |
| WFUI-BROWSER-01 | Same feature working tree | Browser rehearsals with dedicated configuration | Disposable seeded PostgreSQL 16; real sessions | Expected immediate refresh, usable 200% text and confirmation focus | Initial 1/4 passed, then 2/4 and 3/4: fixed stale Ticket version while an Action refresh was pending, initial assignee lookup timing and wrapped status/conversation labels; corrected creation test to use the existing My Tickets navigation. Full rehearsal 22/24 exposed Strict Mode cleanup stealing confirmation focus; dialog cleanup now restores focus only after real removal. | test-results/lab4-workflow-ui-browser-initial.xml; lab4-workflow-ui-browser-second.xml; lab4-workflow-ui-browser-third.xml; lab4-workflow-ui-focus-rehearsal.xml; linked fixing issue #48; rerun WFUI-BROWSER-02 |
| WFUI-BROWSER-02 | Same feature working tree | node node_modules/@playwright/test/cli.js test --config=playwright.actions.config.ts | Same separate database; Chromium/Firefox/WebKit | Four new Ticket workflow scenarios + four existing Actions scenarios per browser; E2E-03 and workflow/list portion of E2E-02; workflow VIS/A11Y portions | 24 passed / 0 failed / 0 skipped; 174.76s | test-results/lab4-actions-browser.xml; test-results/lab4-workflow-ui-browser.log; artifacts/lab-04/screenshots/ticket-workflow/; dashboard agreement remains Planned |
| WFUI-STATIC-01 | Same feature working tree | Client/server production builds; whitespace and documentation link checks; screenshot review | Windows, TypeScript, Vite 6.4.3 | Source/test types, production bundles and four workflow screenshots | Pass | Build output; ticket-workflow-ui.md; existing migrations/backend code unchanged; remote CI and reviewed PR follow maintainer commit/push |

### PR #62 correction verification

- Follow-up at `7b6b1e3`: the maintainer's CI log passed **23/24** cases; Firefox reported a 44px button as `43.99998474121094`, failing the exact height comparison. Both responsive suites now allow only **0.001 CSS px** of measurement noise and explicitly reject missing bounding boxes. The production 44px minimum remains unchanged. Boundary checks accept the reported value and reject 43.99px/43px; focused responsive verification passed **6/6** on Chromium, Firefox and WebKit (19.7s), using `--grep responsive` and the separate IPv4 PostgreSQL database. Report: `test-results/pr62-rounding-responsive.xml`. Full remote CI remains pending the maintainer's push.
- Final verification on `feature/lab4-8-ticket-workflow-ui`, `8e661d0` plus these uncommitted fixes: **24/24 browser cases passed** on Chromium, Firefox and WebKit with the IPv4 disposable database URL. Report: `test-results/pr62-browser-final.xml`; full run took about two minutes. No retries/skips or relaxed assertions. Remote CI for these fixes remains pending the maintainer's push to [PR #62](https://github.com/Tell52/toktickit/pull/62).
- Remote baseline: [run 39495660746](https://github.com/Tell52/toktickit/actions/runs/39495660746), commit `8e661d0`, **20/24 browser cases passed**. Three enlarged-text cases overflowed at the Attachments tab; WebKit's reopen scenario missed a click while the document scrolled. Downloaded CI traces are retained locally under `test-results/pr62-ci/`.
- Regression proof: the new View action focus test failed before the fix (focus incorrectly moved to the section) and passed after it. Full client regression: **188/188 passed**, `test-results/pr62-client.xml`; client TypeScript/Vite build passed.
- Local rehearsals: **23/24 passed** twice with `localhost`; both failed the first Actions list read with `RETRYABLE_CONFLICT`. A standalone six-transaction read probe reproduced transaction-start timeouts with `localhost` (5 failed, 4.06s), while `127.0.0.1` passed all six in 34ms. Docker was published on IPv4 only. Evidence: `test-results/pr62-local-rehearsal/`, `test-results/pr62-localhost-rehearsal/` and their sibling JUnit XML files. This is separate from the remote UI failures; use the explicit IPv4 URL in the reproduction guide.

For each failure record expected/actual behavior, reproducible steps or trace, linked fixing issue/PR and rerun result. Preserve failed-run evidence when it explains a correction. A retry passing does not erase a reproducible flake; investigate it before final completion.

## 12. Planning Completion and Implementation Handoff

Issue #42 is ready for review when:

- Every specification AC-01 through AC-24 has one or more defined test IDs.
- Every planned case identifies type, requirement/AC, scenario, expected result, file/evidence destination and status.
- Required action/workflow/dashboard API files, four client component files and three E2E files are represented.
- Fixtures cover roles, dates, zeros, boundaries, legacy data, concurrent writes and safe failures.
- All results remain truthful; no application test is labelled passed before execution. Issue #43 results above cover database preparation only.

Implementation ownership: database/seed cases go to issues #43-44; Actions Taken cases to #45-46; workflow cases to #47-48; dashboards to #49-50; security/concurrency/performance to #51; visual/accessibility to #52; E2E/regression to #53; final-main results and submission evidence to #54.

The user performs commits and merges. Test planning changes follow feature/lab4-2-test-plan -> lab4-staging, then the release integrates lab4-staging -> main after final verification.
