# Ticket workflow API implementation

Issue [#47](https://github.com/Tell52/toktickit/issues/47). Branch `feature/lab4-7-ticket-workflow-api`, created after switching to `lab4-staging` and pulling `b8f2bec`. This uses the existing Lab 4 schema and introduces no migration.

## Workflow and gate

PATCH `/api/staff/tickets/:id/status` enforces the exact eight-state matrix in [specification section 5](specification.md#54-ticket-transition-matrix), including case/underscore aliases. Staff and Administrators can work independently of ownership; Requesters cannot make formal status, owner or priority changes. Current activation/role/password-change state and the existing session CSRF token are checked. Staff reads accept current role promotions and enforce demotions on existing sessions.

Requests require `{status, expectedTicketVersion}`. Cancelled additionally requires a trimmed 1–1000 character `reason`; reason is rejected for other targets. Missing/unknown/spoofed fields and unknown status labels return 400. Illegal or same-state transitions return 409 INVALID_TRANSITION. Stale versions return 409 STALE_VERSION before gate/lifecycle evaluation. Existing id, Ticket-number ticketId alias, status and updatedAt response fields remain, with version, resolutionCycle and resolvedAt added.

Both incoming Resolved paths require current-cycle completedCount >=1, unfinishedCount=0 and non-cancelled followUpCount=0. Stable blockers are NO_COMPLETED_ACTION, UNFINISHED_ACTIONS and FOLLOW_UP_REQUIRED. Old cycles and cancelled follow-up do not satisfy/block the gate. Resolved sets the server resolution time; Closed preserves it, including null for an already Resolved legacy Ticket. Unresolved legacy Tickets with no actions need completed work before resolving.

Cancellation atomically cancels current-cycle Planned/In Progress actions with the shared reason and new full revisions. Completed, already Cancelled and previous-cycle work are retained. Each affected action increments once; the parent increments once regardless of action count. Each accepted transition appends one immutable TicketStatusEvent with the authenticated actor and resulting cycle. Reopened increments the cycle and clears resolvedAt, problemAppearsResolved and indicatedAt; previous work remains visible/read-only and cannot satisfy the new gate.

GET `/api/tickets/:id/status-history` returns shared events with actor `{id,name}`, createdAt/id ordering and bounded page/pageSize (1/20, maximum 50). Empty legacy history is valid. Owning Requesters and staff can read it; other-owner and missing Tickets share a 404. No event mutation route exists and no Internal Notes/account credentials are serialized.

The Requester advisory endpoint accepts only Open, In Progress or Waiting for Requester. It changes no formal status/resolution date and creates no status event. The first accepted indication increments Ticket version/updatedAt; repetition in a permitted state preserves the original timestamp/version. Reopening clears the indication.

## Related writes and transaction boundaries

Owner and priority endpoints require expectedTicketVersion alongside existing fields. Owner may be null or active staff/admin; legacy text User IDs remain supported. Existing success aliases/uppercase itPriority remain, with version/updatedAt added. requestedPriority stays immutable; supplying it to the priority endpoint is rejected as unknown input.

All workflow/action/public-activity mutations lock the parent Ticket first. Staff mutations then lock relevant User rows in sorted ID order and revalidate actor/owner eligibility. Actions use the same parent lock and recheck assignee eligibility. Gate evaluation, action/parent changes, revisions, events and versions commit or roll back together. Serialization/deadlock/lock-timeout failures use the existing safe RETRYABLE_CONFLICT mapping without hidden resubmission.

Public Comment creation and attachment upload/soft removal run in this parent transaction and increment version/updatedAt once. Attachment quota is checked under the lock; session ownership and parent-child identity are enforced. Repeated soft removal preserves the original reason/version. Invalid type/size/reason, wrong parent, quota exhaustion and parent-write failure leave no partial activity/version. Private Internal Notes remain append-only and change neither parent timestamp nor version. Touched activity writes require real sessions and reject identity overrides.

Staff detail reads Ticket values, allowedTransitions and resolutionGate in one repeatable-read snapshot, with current account/role verification inside it. Staff queue records add version, resolutionCycle, resolvedAt and updatedAt. Requester detail/list already include those persisted fields and retain their envelopes. The existing staff UI sends the observed Ticket version for owner/priority/status changes. Gate presentation, cancellation/reopen confirmations and shared status history are implemented in [issue #48's UI guide](ticket-workflow-ui.md).

## Reproduce verification

`npm run test:workflow --prefix server` requires LAB4_WORKFLOW_DATABASE_URL targeting a disposable PostgreSQL server with database-creation privileges. The suite creates/migrates its own uniquely named database, temporarily directs its worker's lazy Prisma singleton there, restores the prior environment and drops only its generated database. It never falls back to the working DATABASE_URL.

After starting a separate PostgreSQL 16 server as described in the [recovery guide](migration-recovery.md#reproducible-automated-rehearsal):

```powershell
$env:LAB4_WORKFLOW_DATABASE_URL = 'postgresql://lab4:lab4-test-only@127.0.0.1:<disposable-port>/postgres'
Push-Location server
node node_modules/vitest/vitest.mjs run --config vitest.workflow.config.ts --reporter=default --reporter=junit --outputFile=../test-results/lab4-workflow.xml
npm run build
Pop-Location
```

The suite checks all 64 pairs for each of IT Staff and Administrator against an independent matrix, both incoming resolution paths with ten gate datasets, advisory restrictions/idempotency, legacy closure/reopen cycles, mixed cancellation, immutable/paginated history, versions, activity/notes and security validation. Concurrency tests observe actual pending PostgreSQL locks before releasing writers: both orderings of Resolve versus new work/follow-up and status versus owner/priority; actor/owner demotion; and completion-assignee demotion/deactivation. Late revision/event and SQLSTATE 40001/40P01 fault injection verifies complete rollback. A failing parent update verifies public child rollback too.

The full local backend run supplies all three opt-in server variables (WORKFLOW, ACTIONS, MIGRATION), a separate seeded regression DATABASE_URL and LAB4_POSTGRES_CONTAINER for recovery tools. It executes workflow plus the existing Actions/migration/seed/Labs 1–3 suites without skips. [tests.md](tests.md#11-results-and-evidence-recording) records exact results, frontend builds and browser regression. Dedicated Lab 4 CI now runs `test:workflow` and uploads JUnit; remote results follow maintainer commit/push.

Regression fixtures now explicitly represent users who completed mandatory password change and supply observed versions. Old mock-only unauthenticated attachment assertions now verify identity rejection; authenticated file limits/removal are covered against PostgreSQL here. E2E cleanup removes only its own status-event references before deleting generated fixtures. Screenshots from regression are retained as ignored diagnostics; existing committed UI screenshots are preserved.

Broader hardening of untouched legacy Requester read/download routes remains issue #51; their old identity fallbacks are not claimed removed here. Dashboard and final-main release verification remain separate. Workflow UI evidence is recorded in [ticket-workflow-ui.md](ticket-workflow-ui.md). The maintainer will commit/push and link a reviewed PR; no commit or merge is performed by this implementation.
