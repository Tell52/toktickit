# Sprint 4 Engineering Specification - TokTickIT

**Course:** CPE 334  
**Issue:** [#41 - Sprint Specification & Engineering Contract](https://github.com/Tell52/toktickit/issues/41)  
**Prepared:** 2026-10-20  
**Status:** Proposed implementation contract, ready for human review; no implementation or approval is claimed.  
**Baseline:** Lab 3 commit `8035a53`. Companion contracts: [UI](ui-spec.md) and [API](api-spec.md).

## 1. Sprint Goal

Complete the service-desk workflow by recording the work performed on each Ticket, enforcing a testable resolution gate, and providing concise role-specific dashboards linked to detailed views. Preserve earlier data and supported workflows while improving concurrency handling, authorization, responsiveness, accessibility and demonstration evidence.

## 2. Stakeholder Request

IT Staff need to record individual actions, their results and follow-up needs while one Ticket Owner coordinates the overall request. Different staff members can contribute to the same Ticket. Requesters should see progress on their own Tickets and indicate when a problem appears fixed; staff retain authority over formal status changes. Dashboards should identify work needing attention without replacing My Tickets or the shared queue.

The source is the supplied **SE Lab 4: Actions Taken, Dashboards, and Final Regression** handout, particularly sections 4-12 and the submission rubric in section 14. Section 11 below records choices where that handout leaves details open or uses conflicting terminology.

## 3. Scope

### Included

- Actions Taken: list, create, assign, edit, start, complete and cancel, with immutable change history.
- Required action information, automatic actor identity, conditional follow-up validation and Requester read-only visibility.
- Final eight-status Ticket transition matrix, resolution gate and safe stale-update handling.
- Requester dashboard; shared IT Staff/Administrator dashboard; matching filtered drill-down.
- Additive Prisma migration, preservation/recovery checks and idempotent demonstration fixtures.
- Labs 1-3 regression, consistent error states, security hardening, responsive/accessibility review and final release evidence.

Issue #41 produces these three contract documents. Detailed test planning belongs to [#42](https://github.com/Tell52/toktickit/issues/42); schema, APIs, UI and execution evidence belong to subsequent Lab 4 issues. Section 9 supplies the initial AC-to-test handoff.

### Excluded

SLA clocks, escalation/on-call engines, external notifications, inventory/purchasing, labor billing/payroll, multi-level approvals/e-signatures, advanced BI/report builders/exports, multi-tenancy and production-scale cloud operations. No new upload subsystem is introduced for actions: Attachment Notes refer to the existing Ticket attachment workflow. Administrator account-count cards are optional in the handout and omitted from this contract.

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| FR-01 | Staff and Administrators can retrieve, create and update Actions Taken on accessible Tickets. |
| FR-02 | Each action records the fields and validation in section 7, with actor identity set by the server. |
| FR-03 | Staff can assign an action independently of Ticket ownership and use the action lifecycle in section 5. |
| FR-04 | Owning Requesters can read all current action records, including cancelled actions, but cannot mutate them. |
| FR-05 | Every action creation/change appends an immutable revision; Ticket transitions append immutable events. |
| FR-06 | The backend enforces the complete Ticket transition matrix and resolution gate. |
| FR-07 | Requester resolution indication remains advisory and never changes formal Ticket status. |
| FR-08 | Conflicting writes and retried action creation cannot silently overwrite or duplicate work. |
| FR-09 | The Requester dashboard returns only authenticated-user-owned metrics and recent Tickets. |
| FR-10 | The staff dashboard returns operational metrics, current-user action information and recent/urgent Tickets; Administrators reuse it. |
| FR-11 | Every metric has the query, empty behavior and detailed destination defined in section 6. |
| FR-12 | Migration and seed preserve previous records, identity references and attachment metadata/files. |
| FR-13 | All protected features enforce current authentication, activation, password-change and role/ownership rules server-side. |
| FR-14 | The final application follows the Zen Green, feedback, keyboard and responsive contract in ui-spec.md. |
| FR-15 | Relevant automated tests, visual checks, review history and release documentation provide traceable completion evidence. |

## 5. Business Rules and Authorization

### 5.1 Numbered rules

| ID | Rule |
|---|---|
| BR-01 | An Action Taken belongs to exactly one existing Ticket; its Ticket reference cannot change. |
| BR-02 | Ticket Owner coordinates the Ticket. Action assignee and recording performer may differ from that owner. |
| BR-03 | `performedById` is the authenticated creator, set automatically and immutable. It identifies the person recording the action; every later editor/completer is recorded separately in revision `actorId`. |
| BR-04 | `assigneeId` is required, defaults to the creator and must reference an active IT Staff/Administrator on creation or reassignment. Historical references survive deactivation. |
| BR-05 | Action description is trimmed, 1-2000 characters. Result is 0-2000 characters while unfinished and 1-2000 when completed. Notes have the limits in section 7. |
| BR-06 | `followUpRequired=true` requires a non-blank follow-up note. When false, the current note is null; previous values remain in revisions. |
| BR-07 | `actionAt` is the action record's effective date/time, initially server time; supplied values must include an offset and lie between Ticket creation and server now. It is not a future due date. Creation/audit timestamps are always server-generated. |
| BR-08 | New actions start in Planned. Action status changes follow section 5.3; there is no hard-delete operation. |
| BR-09 | Actions can be created/changed only while the parent Ticket is unresolved: New, Open, In Progress, Waiting for Requester or Reopened. Prior resolution-cycle actions are read-only. |
| BR-10 | Current action values can be corrected while BR-09 permits it. Each accepted change appends a full revision with editor and timestamp; prior revisions cannot be modified or removed through the application. |
| BR-11 | All current action values are shared with the owning Requester. Staff-only action revision history is separate from current action values; Internal Notes and their counts remain private. |
| BR-12 | Ticket status changes are staff/admin-only and follow section 5.4. Requested Priority stays immutable; IT Priority remains independently editable. |
| BR-13 | Resolving requires at least one Completed action in the current resolution cycle, no Planned/In Progress actions in that cycle, and no non-cancelled action in that cycle with follow-up still required. |
| BR-14 | Ticket cancellation requires a reason and atomically cancels unfinished actions with that reason. Completed action evidence is retained. |
| BR-15 | Reopening increments `resolutionCycle`, clears `resolvedAt` and the Requester advisory flag/time. Earlier actions remain visible but cannot satisfy a new resolution gate. |
| BR-16 | Legacy Tickets receive cycle 1 and version 1 with no fabricated action/history. Already Resolved Tickets can close without retroactive action evidence; reopening activates the normal new-cycle gate. |
| BR-17 | Every action write and Ticket owner/priority/status write uses the expected Ticket version. Action edits also require the expected action version. A stale request writes nothing and returns 409. |
| BR-18 | Action creation requires an idempotency key. Same actor/key/payload retries replay the original success; reuse with different payload returns 409. |
| BR-19 | Action writes and Ticket transitions serialize on the same parent Ticket within a database transaction; gate evaluation, mutation, audit records and version increment either all commit or all roll back. |
| BR-20 | Dashboard values come from authoritative backend queries, not browser counts or an entire downloaded Ticket collection. |
| BR-21 | Dashboard time windows use Asia/Bangkok; stored timestamps and API timestamps use UTC. Section 6 defines exact bounds. |
| BR-22 | Authentication and current user state are checked before protected data is returned. Inactive/expired sessions return 401; forced-password-change users cannot access business endpoints. |
| BR-23 | A Requester sees only their own Ticket/action data. A different owner's Ticket and a nonexistent Ticket produce the same 404. Staff-only endpoints return 403 to Requesters before resource lookup. |
| BR-24 | Public Comments/Internal Notes remain append-only; attachment count/type/size/removal rules from Lab 2 remain in force. |
| BR-25 | Loading and recoverable failures never display invented zero metrics or discard unsaved form input. Duplicate submissions are disabled while pending. |
| BR-26 | Existing supported business behavior is preserved; development identity bypasses and obsolete UI are removed as hardening, not treated as compatibility requirements. |

### 5.2 Role matrix

All allowed cells also require an active authenticated account with its mandatory password change complete.

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| Requester dashboard | Own data | No | No |
| Staff dashboard/shared queue | No | All Tickets | All Tickets |
| Read current actions | Own Tickets only | All Tickets | All Tickets |
| Create/edit/assign/change action status | No | Subject to BR-09 | Subject to BR-09 |
| Read action revisions | No | All Tickets | All Tickets |
| Read Ticket status history | Own Tickets | All Tickets | All Tickets |
| Change Ticket owner/IT Priority/status | No | Yes | Yes |
| Set problem-appears-resolved indicator | Own Tickets | No | No |
| Read/post Public Comments | Own Tickets | All Tickets | All Tickets |
| Read/post Internal Notes | No, including counts | All Tickets | All Tickets |
| User administration | No | No | Existing Lab 3 rules |

Creating Tickets remains available to all three roles, as in the existing application; the authenticated creator is its Requester identity. Dashboard access does not grant any extra write permission. Staff need not be either the Ticket Owner or action assignee to record or update work.

### 5.3 Action lifecycle

API/storage values are `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`; UI labels use title case.

| From | Allowed targets | Additional conditions |
|---|---|---|
| Planned | In Progress, Completed, Cancelled | Completion requires Result; cancellation requires reason. |
| In Progress | Completed, Cancelled | Same completion/cancellation conditions. |
| Completed | None | Content/follow-up corrections are allowed under BR-09 and append a revision; status and assignee remain fixed. |
| Cancelled | None | Read-only. Create a new action if further work is needed. |

Completing an action requires its assignee still to be active staff/admin. Reassign an unfinished action first if that account is inactive or no longer staff. Correcting a completed historical action does not require reactivating its assignee. A same-status request is invalid, rather than creating a spurious revision.

Completion does not automatically resolve the Ticket. A Completed action can retain follow-up required, which blocks resolution until staff edit it to clear the follow-up after addressing it. The new revision preserves the original follow-up evidence.

### 5.4 Ticket transition matrix

This preserves the existing Lab 3 matrix and adds the gate/transaction rules. All unlisted transitions, including same-state transitions, are rejected.

| From | Allowed targets |
|---|---|
| New | Open, In Progress, Cancelled |
| Open | In Progress, Waiting for Requester, Cancelled |
| In Progress | Waiting for Requester, Resolved, Cancelled |
| Waiting for Requester | In Progress, Resolved, Cancelled |
| Resolved | Closed, Reopened |
| Closed | Reopened |
| Reopened | In Progress, Waiting for Requester, Cancelled |
| Cancelled | None |

- Both incoming Resolved transitions require BR-13. The gate is checked after locking the Ticket, against current database records.
- Resolving sets `resolvedAt` to server time. Closing preserves it. Reopening clears it.
- Resolving does not require the Requester's advisory indication; that indication cannot bypass the gate.
- The indicator is accepted only for Open, In Progress or Waiting for Requester, as in Lab 3. Repeating an already accepted indication is a no-op.
- Cancelling the Ticket atomically cancels current-cycle Planned/In Progress actions and appends their revisions. It does not rewrite Completed/previous-cycle records.
- Every accepted transition creates one TicketStatusEvent. Public status history is ordered by `(createdAt ASC, id ASC)` and contains only status-event fields, never Internal Notes.
- Zero-action unresolved legacy Tickets must record work before resolving. Pre-existing Resolved/Closed/Cancelled Tickets retain their state and data; no invented completion dates are backfilled.

## 6. Dashboard Calculations and Drill-down

### 6.1 Shared definitions

`ACTIVE = {New, Open, In Progress, Waiting for Requester, Reopened}`. Resolved is excluded from open-work counts. `effectivePriority = itPriority ?? requestedPriority`, normalized to Low/Medium/High.

Capture `asOf` from server time once per dashboard request. `since` is midnight six calendar days before the local date of `asOf` in **Asia/Bangkok**. The recent window is **[since, asOf)**: today so far plus the preceding six local dates. Example: asOf 2026-10-20 17:00 +07:00 gives since 2026-10-14 00:00 +07:00, or 2026-10-13T17:00:00.000Z. Include exactly-since records; exclude exactly-asOf records.

Read all aggregates/lists in one repeatable-read database snapshot. These are current-state metrics with timestamp filters, not historical state reconstruction. Empty counts are integer 0, all eight status/three priority buckets remain present, and empty lists are `[]`.

Recent lists are bounded to 5 rows, ordered `(updatedAt DESC, id DESC)` unless specified otherwise. Counts include all matches, not just the preview. Drill-down preserves the same predicates and time bounds, but runs a fresh query; changes after dashboard retrieval can legitimately change its total. Show the dashboard's update time and provide Refresh.

### 6.2 Requester metrics

Apply `requesterId = authenticated user.id` before every filter, aggregate and list.

| Key / label | Calculation | Destination and extra filters |
|---|---|---|
| `openTickets` / Open tickets | Count currentStatus in ACTIVE | `/tickets?statusGroup=active` |
| `waitingForRequester` / Waiting for you | Count currentStatus = Waiting for Requester | `/tickets?status=Waiting%20for%20Requester` |
| `recentlyUpdated` / Updated in last 7 days | Count updatedAt in [since, asOf), all statuses | `/tickets?updatedFrom={since}&updatedBefore={asOf}&sort=-updatedAt` |
| `recentlyResolved` / Resolved in last 7 days | Count currentStatus in {Resolved, Closed} AND non-null resolvedAt in [since, asOf) | `/tickets?statusGroup=resolved&resolvedFrom={since}&resolvedBefore={asOf}&sort=-resolvedAt` |

Two previews: attention-required Tickets (Waiting for Requester, latest updated first) and recently updated Tickets (recent-window predicate). Each row opens `/tickets/{numericId}`. Null legacy resolvedAt is excluded only from date-based resolution metrics, not current-status counts.

### 6.3 IT Staff and Administrator metrics

| Key / label | Calculation | Destination |
|---|---|---|
| `unassignedTickets` / Unassigned open tickets | ACTIVE AND ownerId is null | `/queue?statusGroup=active&owner=unassigned` |
| `myTickets` / My open tickets | ACTIVE AND ownerId = current user | `/queue?statusGroup=active&owner=me` |
| `byStatus` / Tickets by status | Count every Ticket once in each of the eight canonical statuses | `/queue?status={status}` |
| `byPriority` / Open tickets by IT priority | Count ACTIVE by effectivePriority; include zero buckets | `/queue?statusGroup=active&priority={priority}` |
| `recentlyUpdated` / Updated in last 7 days | Count updatedAt in [since, asOf), all statuses | `/queue?updatedFrom={since}&updatedBefore={asOf}&sort=-updatedAt` |
| `myActiveActions` / Actions assigned to me | Count current-cycle Planned/In Progress actions assigned to current user on ACTIVE Tickets | Dashboard's paginated My actions section |

Previews: urgent Tickets (ACTIVE and effectivePriority High); recently updated Tickets (recent window); My actions (same predicate as myActiveActions, first 5 ordered `(actionAt DESC, id DESC)`). Ticket previews use updatedAt descending, then id descending. Every action row links to `/tickets/{ticketId}?tab=actions&actionId={actionId}`. The My actions section supports page navigation through a dedicated bounded API; it is not an unbounded report.

### 6.4 Update and performance rules

- Ticket creation/owner/priority/status changes and action writes update Ticket.updatedAt. Public comments, attachment additions/removals and resolution indication also update it.
- Internal Note writes must **not** change the requester-visible updatedAt, avoiding leakage of private-note activity through recent metrics.
- After relevant mutations, refetch affected detail/list/dashboard data on return; do not calculate counters optimistically.
- Add only indexes justified by section 7 queries. Performance-smoke target: on a documented local environment with 10,000 Tickets and 30,000 actions, after 5 warm-ups, 20 sequential requests per dashboard endpoint have p95 below 1 second, with bounded preview sizes and no per-Ticket query loop. Record measurements; this is a lab target, not a production SLA.

## 7. Data Changes, Migration and Seed

### 7.1 Proposed models and constraints

Existing Ticket/Attachment IDs remain integers; User IDs remain UUID strings. Do not rename existing columns or change prior response fields merely to match illustrative Lab 3 documentation.

| Model / field | Type / constraint |
|---|---|
| ActionTaken.id | UUID string primary key |
| ticketId | Required FK to Ticket; deletion restricted |
| resolutionCycle | Integer >= 1, copied from Ticket at creation; immutable |
| actionAt | Required UTC instant; BR-07 |
| description | Trimmed string, 1-2000 characters |
| result | Nullable string, up to 2000; required non-blank for Completed |
| performedById | Required User FK; server-authenticated creator; immutable |
| assigneeId | Required User FK; active staff/admin validation on assignment/completion |
| status | Enum PLANNED / IN_PROGRESS / COMPLETED / CANCELLED; default PLANNED |
| followUpRequired | Boolean, default false |
| followUpNote | Nullable string, 1-1000 when required; otherwise null |
| attachmentNotes | Nullable plain text, max 1000; no new file storage/link authorization |
| cancellationReason | Nullable string, 1-1000 when cancelled |
| version | Integer >= 1, initially 1; increment per accepted change |
| createdAt / updatedAt | Server-generated UTC timestamps |
| ActionTakenRevision | UUID id, actionId FK, revision integer, actorId FK, createdAt, full action-value snapshot JSON; unique (actionId, revision) |
| Ticket additions | version integer default 1; resolutionCycle integer default 1; resolvedAt nullable UTC instant |
| TicketStatusEvent | UUID id, ticketId FK, actorId FK, fromStatus, toStatus, reason nullable, resolutionCycle, createdAt |
| ActionCreateRequest | UUID id, actorId FK, key UUID, ticketId FK, normalized request hash, original response JSON, createdAt; unique (actorId, key) |

All new User references restrict deletion and survive activation/role changes. Revision snapshots use explicitly selected action fields; never serialize full User objects, credentials, Public Comments or Internal Notes into them. Revision 1 captures creation. No API permits deleting/updating revisions, status events or idempotency receipts.

Proposed indexes:

- ActionTaken: `(ticketId, resolutionCycle, status)`, `(ticketId, actionAt, id)`, `(assigneeId, status, actionAt, id)`.
- Ticket: `(requesterId, currentStatus)`, `(requesterId, updatedAt, id)`, `(requesterId, resolvedAt, id)`, `(ownerId, currentStatus)`, `(currentStatus, itPriority)`, `(updatedAt, id)`.
- TicketStatusEvent: `(ticketId, createdAt, id)`; revision uniqueness also supports ordered history lookup.

**Design decision D-01:** Keep a current action row plus immutable revisions. This supports ordinary Prisma queries and editable UI while preserving append-only evidence; full event sourcing is unnecessary for this lab.

**D-02:** Use integer versions and a shared parent-Ticket transaction lock. Timestamps alone cannot reliably detect two writes within the same clock precision, and an action-only lock cannot protect a Ticket resolution race.

**D-03:** Store resolvedAt separately. updatedAt may change after resolution and cannot truthfully represent when a Ticket was resolved. Unknown legacy resolution times stay null.

**D-04:** Keep current Ticket status storage compatible with the existing string column, normalize recognized aliases to the eight canonical labels, and validate all writes. Use an enum for the new action lifecycle. Unknown historical values require explicit review before migration, not silent conversion or deletion.

### 7.2 Migration and recovery procedure

1. In a disposable copy of the Lab 3 database, inventory IDs, counts, foreign keys, known status/priority aliases and attachment metadata; back up the database and existing attachment storage before a real upgrade.
2. Add new tables and defaulted/nullable Ticket columns in an additive migration. Preserve all earlier rows and references. Canonicalize only documented status aliases; normalize priority aliases to the existing supported values. Stop on unknown values with a diagnostic.
3. Initialize version/cycle to 1 and resolvedAt to null for existing Tickets. Do not manufacture actions, status events or historical timestamps.
4. Compare pre/post record IDs, values (except documented normalization) and relationships; exercise old Ticket, comment, note and attachment reads. Test unresolved and already-resolved legacy cases.
5. Rehearse failure recovery on the disposable copy. Roll back a failed transactional migration; after a successful upgrade prefer a forward correction. If full restore is needed, stop writes, preserve the upgraded database, restore the verified backup plus attachments and the matching application version, then verify counts/relationships before reopening.
6. Record exact migration name, commands, backup location and restore results in the implementation evidence. Never run a destructive Prisma reset against the user's working database.

An application rollback alone does not restore the older workflow semantics after Lab 4 writes. Recovery evidence must account for any post-upgrade data; do not drop new tables as an unreviewed rollback shortcut.

### 7.3 Seed fixtures

Retain existing accounts and data. Add stable fixture keys with create-only/upsert behavior that leaves user-edited records intact. Seed repeated runs must not append duplicate revisions/events or rewrite passwords.

Include: all eight Ticket statuses; all three priorities; assigned/unassigned ownership; zero/one/multiple actions; different owner/performer/assignee; all four action statuses; follow-up blocking/cleared; an inactive assignee retained historically; reopened cycles; zero-data Requester; unknown legacy resolvedAt; and records immediately before/at/after a fixed test-window boundary. Freeze the test clock and document exact expected aggregate counts. Demonstration seed timestamps may be relative to invocation time only on first creation.

## 8. API and UI Summary

[api-spec.md](api-spec.md) defines exact paths, payloads, filters, versions, errors and compatibility. [ui-spec.md](ui-spec.md) defines controls, navigation, role visibility, conflict recovery and visual inspection.

Required new capabilities: action list/create/update, staff-only revision retrieval, role-filtered status-history retrieval, two dashboard endpoints and paginated current-user action drill-down. Existing owner/priority/status endpoints gain expected-version validation; list endpoints gain dashboard predicates without replacing their existing envelopes.

Baseline gaps observed in source, to be addressed during implementation/hardening:

- There is no ActionTaken model, resolution gate, version or resolvedAt field yet.
- The current staff matrix already matches section 5.4; it checks state before an unguarded update.
- Requester listing currently uses `{data, meta}` while staff listing uses `{tickets, pagination}`.
- Some old routes still accept a client-supplied requester identity without a session; requireAuth currently checks session presence without revalidating current activation/role. These are security gaps to close, not behavior to preserve.
- The app uses pathname-based navigation; dashboard drill-down needs query-string parsing/restoration.

## 9. Acceptance Criteria and Initial Test Handoff

All tests below are **planned, not executed**. Issue #42 expands this into docs/lab-04/tests.md with test IDs, detailed cases and actual results. Paths in this table are planned files, not claims that those files exist.

| ID | Given / When / Then | FR coverage | Planned test/evidence |
|---|---|---|---|
| AC-01 | Given active staff and valid action input, when created, then one Planned action belongs to the specified Ticket with the authenticated performer and revision 1. | FR-01, FR-02 | server/tests/lab-04/actions-taken.api.test.ts |
| AC-02 | Given whitespace, excessive lengths, invalid/future dates or missing conditional note, when submitted, then 400 is returned and no records/versions change. | FR-02 | server/tests/lab-04/actions-taken.api.test.ts |
| AC-03 | Given a different Ticket Owner, when staff assign/update an action, then the action changes without changing Ticket Owner; inactive/non-staff assignment and completion with inactive assignee fail. | FR-03 | server/tests/lab-04/actions-taken.api.test.ts |
| AC-04 | Given each action state, when every target is attempted, then only section 5.3 transitions succeed, completion requires a result and cancellation requires a reason. | FR-03 | server/tests/lab-04/actions-taken.api.test.ts |
| AC-05 | Given owning and non-owning Requesters, when reading/writing actions, then only owner reads succeed and every Requester write is denied; no Internal Notes leak. | FR-04, FR-13 | server/tests/lab-04/actions-taken.api.test.ts |
| AC-06 | Given edits and transitions, when history is read, then prior snapshots/events remain intact, actor/time are server-set and ordering is deterministic; Requesters cannot read action revisions. | FR-05 | server/tests/lab-04/actions-taken.api.test.ts; ticket-workflow.api.test.ts in the same directory |
| AC-07 | Given every pair of eight Ticket states, when status is changed by each role, then matrix/role rules are enforced through direct API calls. | FR-06 | server/tests/lab-04/ticket-workflow.api.test.ts |
| AC-08 | Given zero actions, unfinished actions, follow-up blockers or qualifying completed work, when resolving, then only the gate-passing case succeeds atomically. | FR-06 | server/tests/lab-04/ticket-workflow.api.test.ts |
| AC-09 | Given a Requester indication, when recorded, then formal status is unchanged; after reopening the indicator is cleared and old actions cannot satisfy the new cycle. | FR-07 | server/tests/lab-04/ticket-workflow.api.test.ts |
| AC-10 | Given a Ticket with unfinished actions, when cancelled with a reason, then those actions and the Ticket are cancelled together with audit evidence; no partial result survives failure. | FR-03, FR-06 | server/tests/lab-04/ticket-workflow.api.test.ts |
| AC-11 | Given two edits or an action-write/resolution race, when committed concurrently, then no newer data is overwritten and stale requests receive 409 without partial audit records. | FR-08 | server/tests/lab-04/concurrency.api.test.ts |
| AC-12 | Given a retried action-create key, when payload matches, then the original success is replayed without duplicate action/revision; a different payload with that key returns 409. | FR-08 | server/tests/lab-04/actions-taken.api.test.ts |
| AC-13 | Given mixed-owner fixtures, when a Requester dashboard loads, then all counts/lists match only that user's database records including zero and date-boundary cases. | FR-09, FR-11 | server/tests/lab-04/requester-dashboard.api.test.ts |
| AC-14 | Given staff fixtures, when staff/admin dashboards load, then status/priority/owner/action counts and bounded lists match section 6, including null priority fallback. | FR-10, FR-11 | server/tests/lab-04/staff-dashboard.api.test.ts |
| AC-15 | Given a metric card or action row, when followed, then matching filters/time bounds and role-safe details load and survive refresh/back navigation. | FR-11 | e2e/lab-04/dashboards.spec.ts |
| AC-16 | Given a Lab 3 snapshot and repeated seeds, when upgraded/recovered, then old IDs/relationships/files survive, no fictitious history appears and fixtures do not duplicate. | FR-12 | server/tests/lab-04/migration-regression.test.ts plus restore evidence |
| AC-17 | Given missing/expired/inactive sessions, changed roles, forced password change or invalid CSRF, when business APIs are called directly, then access is rejected before data/mutation. | FR-13 | server/tests/lab-04/authorization.api.test.ts |
| AC-18 | Given action/workflow forms, when success/validation/conflict/network failure occurs, then controls/refresh/draft recovery follow ui-spec.md and repeated clicks cannot duplicate work. | FR-01, FR-14 | client/tests/lab-04/ActionsTaken.test.tsx; client/tests/lab-04/TicketWorkflow.test.tsx |
| AC-19 | Given dashboards in loading/zero/forbidden/failure states, when rendered, then accurate labels and accessible recovery appear without fabricated zero values. | FR-09, FR-10, FR-14 | client/tests/lab-04/RequesterDashboard.test.tsx; client/tests/lab-04/StaffDashboard.test.tsx |
| AC-20 | Given desktop/tablet/mobile and keyboard-only use, when all Lab 4 screens are exercised, then focus, labels, touch targets and overflow checks pass with screenshots. | FR-14 | e2e/lab-04/dashboards.spec.ts; e2e/lab-04/actions-taken-flow.spec.ts; visual checklist |
| AC-21 | Given existing accounts and data, when Labs 1-3 flows run, then authenticated ticketing, attachments, comments/notes, staff operations and admin rules still work. | FR-12, FR-13, FR-15 | existing server/client lab-01..03 suites and e2e/lab-02..03, updated only for intentional contract changes |
| AC-22 | Given the documented smoke dataset, when dashboard measurements run, then section 6.4 latency and bounded-response targets are met. | FR-10, FR-15 | server/tests/lab-04/dashboard-performance.test.ts plus measurement report |
| AC-23 | Given final main, when release evidence is assembled, then test results, screenshots, review links, AI reflection and setup/recovery/demo instructions are truthful and reproducible. | FR-15 | issue #54 release checklist and docs/lab-04/reviewer.md / ai-use.md |
| AC-24 | Given a complete service-desk scenario, when actions are recorded and the Ticket is resolved/closed or cancelled, then all three roles see consistent results. | FR-01, FR-03, FR-06, FR-15 | e2e/lab-04/actions-taken-flow.spec.ts; e2e/lab-04/ticket-resolution.spec.ts |

## 10. Definition of Done

### Specification issue #41

- [ ] Human review confirms the three companion documents agree and the decisions in section 11 are accepted or revised.
- [ ] Numbered requirements, rules, ACs, role permissions, both lifecycles, metrics, migration and API/UI behavior are concrete enough to implement.
- [ ] Issue #42 has an explicit test-planning handoff without claiming tests already passed.
- [ ] The user commits the contract before main implementation PRs and controls commit/merge operations.

### Final Product Completion

- [ ] All approved FR/BR/AC implemented, including direct-API authorization and concurrent-write cases.
- [ ] Detailed tests.md maps every AC to tests/evidence, actual paths and final results; required suites pass from final main.
- [ ] Migration, recovery and repeatable seed verified without losing earlier records or files.
- [ ] Dashboard metrics match database queries, preview bounds and drill-down predicates.
- [ ] All earlier role workflows pass regression; no identity bypass or private-note leakage remains.
- [ ] Desktop/tablet/mobile screenshots and keyboard/visual checklist pass; no console errors, broken controls or unfinished placeholders.
- [ ] README setup, migration, seed, test and demonstration instructions are current.
- [ ] reviewer.md contains actual reviews/responses/approvals; ai-use.md contains actual model/prompt/reflection evidence.
- [ ] Feature PRs integrate through lab4-staging to main; Kanban Done reflects verified completion. Commits and merges are performed by the user.
- [ ] One concise submission PDF contains Answer Part 1 through Answer Part 9 with working links and readable evidence.

Unchecked items are completion gates, not assertions of current results.

## 11. Assumptions and Decisions

| ID | Ambiguity / choice | Contract decision |
|---|---|---|
| A-01 | Section 8.3 requires editable actions; section 14 mentions append-only behavior. | Current action records are editable under BR-09, while action revisions and Ticket status history are append-only. Existing comments/notes remain append-only. |
| A-02 | Main field list lacks assignee/status but section 14 requires assign/start/complete/cancel and inactive-assignee rejection. | Add separate assignee and four-state action lifecycle. Keep automatic performer independent from assignment, with every later actor in revisions. |
| A-03 | Section 4.3 leaves Requester visibility to the specification; 8.3 says all items are visible. | Owning Requesters see every current action, including cancelled/earlier-cycle records, but not staff-only revision history. |
| A-04 | The handout requires a resolution rule without an exact predicate. | Use BR-13; each reopened cycle requires new completed work. Do not infer resolution from the Requester indicator. |
| A-05 | Action date/time and creation time are used interchangeably. | Keep editable effective actionAt plus immutable server-created createdAt, with clearly different UI labels. |
| A-06 | Unknown historic resolution time. | Preserve state and leave resolvedAt null; never substitute updatedAt as a fabricated resolution date. |
| A-07 | Dashboard metric examples are not exact mandatory queries. | Adopt section 6 definitions, Bangkok calendar windows and bounded previews. No optional admin account statistics. |
| A-08 | Old documentation examples differ from source types/envelopes. | Preserve numeric Ticket IDs, string User IDs and existing list envelopes; specify additive fields explicitly. |

These are proposed engineering decisions for review, not claims that an instructor has approved an interpretation. If review changes one, update the related BR/AC and both companion contracts before dependent implementation.
