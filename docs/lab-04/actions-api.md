# Actions Taken API Implementation

**Issue:** [#45](https://github.com/Tell52/toktickit/issues/45)

**Branch:** `feature/lab4-5-actions-api`, based on `52ce172` after pulling `lab4-staging`.

The four Actions endpoints in [API specification section 3](api-spec.md#3-actions-taken-endpoints) are implemented. This issue adds no migration. Apply the existing [Lab 4 migration](migration-recovery.md), generate Prisma Client and use the existing login/password-change flow before making requests.

## Endpoints

| Method / path | Access | Behavior |
|---|---|---|
| GET `/api/tickets/:id/actions` | Owning Requester; staff/admin | Every current action, including cancelled and earlier-cycle records; no revisions or Internal Notes |
| POST `/api/staff/tickets/:id/actions` | Current active staff/admin | Create Planned work, authenticated performer, default/explicit assignee, revision 1 and idempotency receipt |
| PATCH `/api/staff/tickets/:id/actions/:actionId` | Current active staff/admin | Edit permitted content/assignment or apply the action lifecycle; append a revision |
| GET `/api/staff/tickets/:id/actions/:actionId/revisions` | Current active staff/admin | Paginated immutable snapshots, revision actor and timestamp |

Ticket lookup accepts a positive numeric ID or Ticket number. Nested Action IDs and supplied assignee IDs must be UUIDs. List pagination uses page/pageSize, defaults 1/20 and maximum pageSize 50. Invalid/unsupported parameters return 400. Lists use one repeatable-read snapshot for rows, count and parent version/cycle. Actions order by actionAt/id ascending; revisions order by revision ascending. Empty/beyond-last pages return 200 and empty arrays.

Responses use `Cache-Control: no-store`. Shared action DTOs expose only approved business fields and performer `{id,name}` / assignee `{id,name,isActive}`. Audit actors expose `{id,name}`. No password hash, account email, Internal Note, note count or revision collection is included in shared reads.

## Creating and changing work

Read the list first to obtain the current `ticketVersion`. For POST, send the existing session cookie, `X-CSRF-Token` and a new UUID `Idempotency-Key`, with a body such as:

~~~json
{
  "expectedTicketVersion": 1,
  "description": "Inspect the network connection.",
  "followUpRequired": true,
  "followUpNote": "Check stability after the restart."
}
~~~

The response is 201 `{action,ticketVersion}`. The server defaults actionAt to its captured time, assignee to the authenticated creator, followUpRequired to false and optional text to null. Client-supplied performedById, actorId, status, Ticket reference, cycle, version or audit timestamps are rejected rather than trusted.

PATCH requires both `expectedTicketVersion` and `expectedVersion` (the action version), plus at least one effective change. Only the documented mutable fields are accepted. Required text is trimmed and nonblank; descriptions/results allow up to 2000 Unicode characters, notes/reasons 1000. Optional blank text normalizes to null. Dates require an explicit offset and a valid calendar date, with Ticket.createdAt <= actionAt <= server time. Validation examines the final merged record.

- Planned can start, complete or cancel. In Progress can complete or cancel. Completion requires a nonblank result and an active staff/admin assignee; assignment is independent of Ticket ownership and the immutable performer.
- Cancelling requires a reason. Cancelled actions reject every mutation with ACTION_NOT_EDITABLE, including attempts to resubmit their existing status.
- Completed actions allow content/follow-up corrections while the parent is active, preserving fixed status/assignee. Correcting content does not require reactivating a historical assignee. An explicit same-status transition on an otherwise editable action and a no-op patch return 400.
- Setting followUpRequired=false clears an omitted/null note. An explicit nonblank note with false is invalid. Earlier snapshots retain the previous note.
- Parent states New/Open/In Progress/Waiting for Requester/Reopened permit writes (including supported legacy case/underscore aliases). Resolved/Closed/Cancelled parents and actions outside the current resolution cycle remain read-only. Staff may work on Tickets owned by other staff.

Every rejected mutation is checked in tests for unchanged Ticket/action values, versions, revisions and receipts. No application route updates/deletes revision records or deletes actions.

## Authorization, transactions and retries

Actions routes revalidate the database account before role checks, parsing resource identifiers or returning protected data. Missing/inactive/logout sessions receive 401, forced-password-change users 403 PASSWORD_CHANGE_REQUIRED and Requester writes/revision reads 403. Other-owner and missing Ticket reads share a 404 shape. Cookie-authenticated writes require the existing CSRF token.

Each action mutation locks its parent Ticket, then relevant User rows in ascending ID order and revalidates the actor under those locks. Assignment/completion rechecks current assignee eligibility. Action updates also scope the action to its parent and compare both versions before evaluating lifecycle rules. Stale responses return 409 STALE_VERSION with authorized current versions, without another user's draft. The parent lock is exported for the later Ticket-workflow service to reuse.

Creation/edit, its full revision, Ticket version/updatedAt and any creation receipt commit or roll back together. Each accepted change increments the Ticket version once; edits also increment the action version once. Snapshots select only the eleven approved business fields. Creator, Ticket reference and cycle are never accepted from PATCH.

Create receipts are permanent for this lab and scoped to authenticated actor + UUID key. The hash includes resolved parent ID and sorted normalized supplied fields, preserving omissions of server-default fields. Field order, trimmed text and equivalent offset timestamps normalize consistently; omitted defaults are not regenerated for hashing. Replay requires the original submitted versions/body/key, returns 200 with `Idempotency-Replayed: true` and the original response, and runs after authorization but before stale/lifecycle checks. Clients refetch afterward because the original body may now be stale. A changed payload or parent conflicts; another actor has an independent key scope. Failed requests save no success receipt.

Same-parent writes serialize; common actor locks and receipt uniqueness also protect same-key attempts across parents. PostgreSQL serialization/deadlock/lock-timeout failures map to 409 RETRYABLE_CONFLICT; unexpected failures return a generic 500. Prisma 5's unknown-error representation of deadlock SQLSTATE is handled locally without returning SQL/error details. No automatic retry hides a partially failed request.

## Verification and remaining integration

The tests use real authentication, PostgreSQL transactions and Supertest. The API suite requires an explicit `LAB4_ACTIONS_DATABASE_URL` pointing to a disposable PostgreSQL **server** with database-creation privileges. It creates/drops only its own uniquely named database, temporarily directs the test worker's Prisma singleton there, and restores the prior environment afterward. It never uses the working DATABASE_URL as its provisioning target. The unit suite needs no database.

From `server`, after starting a disposable PostgreSQL 16 server as described in the [recovery guide](migration-recovery.md#reproducible-automated-rehearsal), set LAB4_ACTIONS_DATABASE_URL to that server and run:

~~~powershell
npm run test:actions
# Equivalent command retaining an ignored local JUnit report:
node node_modules/vitest/vitest.mjs run --config vitest.actions.config.ts --reporter default --reporter junit --outputFile ../test-results/lab4-actions.xml
npm run build
~~~

The API suite is skipped by ordinary backend tests when its explicit server URL is absent; the dedicated CI workflow supplies it and runs `test:actions`. The existing regression workflow now also accepts PRs/pushes targeting lab4-staging. Remote CI results are recorded only after they actually execute.

Local evidence on 2026-10-20: Windows PowerShell, Node 22.17.1, Prisma 5.22.0, Vitest 2.1.9 and a separate Docker PostgreSQL 16 server. The final [tests.md ledger](tests.md#11-results-and-evidence-recording) records counts and reports. Coverage includes all 16 lifecycle pairs through unit tests and direct API calls; text/date/default/merged-field validation; private-data masking; original and edited revisions; pagination; replays after changes; simultaneous retries/competing edits; account changes while an action waits for a real User-row lock; and injected receipt/serialization/deadlock failures with full rollback. Fault SQLSTATE injection establishes error mapping, while the account-change tests establish actual lock overlap.

Ticket resolution gates, Ticket status events/cascade cancellation, versioning of older owner/priority/activity routes and workflow detail additions remain with issue #47. Action UI/draft handling belongs to #46. Full authentication hardening of older routes remains with #51. Existing staff lookup is reused and checked for active staff/admin filtering, but its legacy session middleware is not represented as newly hardened here. These boundaries remain explicit in traceability; this issue does not mark the broader workflow/security/UI acceptance criteria or final-main regression complete.
