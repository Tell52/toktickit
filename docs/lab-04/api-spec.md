# API Specification - Sprint 4

**Status:** Section 3 Actions endpoints are implemented by #45. Section 4 workflow and related activity/version changes are implemented by #47 ([implementation/evidence](ticket-workflow-api.md)). Dashboard additions and broader legacy hardening remain planned.
**Base URL:** `/api`  
**Related:** [Engineering specification](specification.md), [UI specification](ui-spec.md).

## 1. Conventions and Compatibility

- JSON requests/responses, except existing multipart attachment upload. All timestamps are ISO 8601 UTC strings in responses; request timestamps require an explicit offset.
- Ticket IDs are positive integers. Existing Ticket routes continue accepting a numeric ID or official Ticket number; new nested action routes use the same resolver. New responses use numeric `ticketId` and a separate `ticketNumber`.
- User IDs and new Action IDs are UUID strings. Invalid identifiers return 400; a valid but inaccessible/nonexistent resource returns 404.
- Ticket statuses use canonical labels: New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled. Existing supported case/underscore aliases are normalized on input. Action statuses are PLANNED, IN_PROGRESS, COMPLETED, CANCELLED.
- Priorities normalize to Low/Medium/High for new dashboard responses. Preserve existing fields/accepted values for earlier APIs, including the `status`/`currentStatus` aliases on staff Ticket responses.
- Existing Requester list envelope `{data, meta}` and staff list envelope `{tickets, pagination}` remain intact. Do not migrate them to one envelope silently.
- New endpoints reject unknown body fields, including client-supplied performedById, actorId, ticketId, resolutionCycle or server timestamps. PATCH accepts only the fields listed below; null is permitted only where stated.
- Authentication uses the existing HttpOnly session cookie and `X-CSRF-Token` for mutations. No separate Lab 4 token mechanism.
- Revalidate current user activation, role and mustChangePassword before every protected operation. Invalid/inactive sessions return 401; valid users requiring password change receive 403 PASSWORD_CHANGE_REQUIRED on business endpoints.
- Apply role checks before resource lookup on staff-only endpoints. Shared Ticket/action reads scope Requester ownership within the query; other-owner and missing resources share a 404.
- New dashboard responses use `Cache-Control: no-store`; client caches must be keyed by user/role and cleared on logout.

### 1.1 Common error response

~~~json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "fields": {
      "followUpNote": "Required when follow-up is needed."
    }
  }
}
~~~

`fields` is optional and contains only public field names and safe messages. For new/touched endpoints use this shape; adapt earlier client error handling before standardizing legacy routes that currently return string errors.

| HTTP | Codes / meaning |
|---|---|
| 200 | Successful GET/PATCH, or successful idempotent replay |
| 201 | New action created |
| 400 | VALIDATION_ERROR: malformed input, unknown enum/field, invalid assignee, missing version/key |
| 401 | UNAUTHENTICATED: absent/expired/inactive session |
| 403 | FORBIDDEN: role or CSRF failure; PASSWORD_CHANGE_REQUIRED |
| 404 | NOT_FOUND: missing or inaccessible Ticket/action |
| 409 | STALE_VERSION, INVALID_TRANSITION, RESOLUTION_BLOCKED, TICKET_NOT_EDITABLE, ACTION_NOT_EDITABLE, IDEMPOTENCY_CONFLICT, RETRYABLE_CONFLICT |
| 500 | INTERNAL_ERROR: generic safe message; no SQL, secrets, stack traces or private data |

For writes: authenticate/authorize and validate basic types first; resolve scoped resources; lock/check versions; then evaluate lifecycle/gate/business validation. A stale version takes precedence over a gate failure based on newer data. A recognized idempotent replay follows authorization/resource-access validation but precedes stale-version or lifecycle checks.

## 2. Response Shapes

### 2.1 Action

~~~json
{
  "id": "1df6c7dd-73e5-46ee-946d-681077e142a0",
  "ticketId": 12,
  "ticketNumber": "TKT-2026-0012",
  "resolutionCycle": 1,
  "actionAt": "2026-10-20T08:00:00.000Z",
  "description": "Inspect the network connection.",
  "result": null,
  "performedBy": { "id": "d4ba924d-66a5-46d8-a090-66d9ae6d1f16", "name": "Michael Brown" },
  "assignee": { "id": "d4ba924d-66a5-46d8-a090-66d9ae6d1f16", "name": "Michael Brown", "isActive": true },
  "status": "PLANNED",
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": null,
  "cancellationReason": null,
  "version": 1,
  "createdAt": "2026-10-20T08:01:00.000Z",
  "updatedAt": "2026-10-20T08:01:00.000Z"
}
~~~

The shared DTO contains no user email/password data or Internal Notes. `performedBy` remains the original recorder; subsequent editors/completers are revision actors. Include inactive historical assignees rather than dropping their names.

### 2.2 Ticket workflow additions

Staff Ticket detail gains:

~~~json
{
  "version": 7,
  "resolutionCycle": 1,
  "resolvedAt": null,
  "allowedTransitions": ["Waiting for Requester", "Resolved", "Cancelled"],
  "resolutionGate": {
    "eligible": false,
    "completedCount": 0,
    "unfinishedCount": 1,
    "followUpCount": 0,
    "blockers": ["NO_COMPLETED_ACTION", "UNFINISHED_ACTIONS"]
  }
}
~~~

`allowedTransitions` comes from the Ticket matrix for the current state, independent of the gate. `eligible` reports only the action-evidence predicate; the matrix still controls whether Resolved is a legal target. Gate counts use the current cycle. `followUpCount` excludes Cancelled actions. Stable blocker values are NO_COMPLETED_ACTION, UNFINISHED_ACTIONS and FOLLOW_UP_REQUIRED.

Shared Requester detail gains version, resolutionCycle and resolvedAt, but no staff-only controls/revision data. Ticket-status-history is a separate shared read.

## 3. Actions Taken Endpoints

### 3.1 GET `/api/tickets/:id/actions`

**Access:** Owning Requester, IT Staff, Administrator.

Query: `page` positive integer default 1; `pageSize` integer 1-50 default 20. Invalid new-endpoint pagination returns 400. Returns every action state and cycle, ordered `(actionAt ASC, id ASC)`.

~~~json
{
  "actions": [],
  "pagination": { "page": 1, "pageSize": 20, "totalCount": 0 },
  "ticketVersion": 7,
  "resolutionCycle": 1
}
~~~

`actions` entries use section 2.1. No action revision data is embedded. Read list/count/version from one consistent snapshot. Empty or beyond-last pages return 200 with an empty array.

### 3.2 POST `/api/staff/tickets/:id/actions`

**Access:** IT Staff, Administrator. Parent must satisfy BR-09.

Required header: `Idempotency-Key: <UUID>`, in addition to CSRF.

~~~json
{
  "expectedTicketVersion": 7,
  "actionAt": "2026-10-20T08:00:00.000Z",
  "description": "Inspect the network connection.",
  "result": null,
  "assigneeId": "d4ba924d-66a5-46d8-a090-66d9ae6d1f16",
  "followUpRequired": true,
  "followUpNote": "Check the connection again after the restart.",
  "attachmentNotes": "See network-status.png in Ticket attachments."
}
~~~

Required body fields: expectedTicketVersion, description. Defaults: actionAt=server now, assigneeId=current user, followUpRequired=false, optional strings=null. Status is always PLANNED; performedById and resolutionCycle are derived on the server. Reject attempts to provide them.

Use the field rules in specification section 7. Trim text, convert optional blank strings to null, require a nonblank followUpNote when true, and reject a nonblank followUpNote when false. `actionAt` must be >= Ticket.createdAt and <= server time at validation. Datetimes without offsets are invalid.

**201:** `{ "action": <Action>, "ticketVersion": 8 }`. Insert the action, revision 1, idempotency receipt and Ticket version/updatedAt change in the same transaction.

**200 replay:** the same original body, with `Idempotency-Replayed: true`. The original version may now be stale, so clients refetch after replay. A changed payload with the same actor/key returns 409 IDEMPOTENCY_CONFLICT.

**Other errors:** common 400/401/403/404/500; 409 STALE_VERSION or TICKET_NOT_EDITABLE.

### 3.3 PATCH `/api/staff/tickets/:id/actions/:actionId`

**Access:** IT Staff, Administrator. The action must belong to the resolved parent ID. Parent and action cycle must satisfy BR-09.

~~~json
{
  "expectedTicketVersion": 8,
  "expectedVersion": 1,
  "status": "COMPLETED",
  "result": "Connection restored and checked.",
  "followUpRequired": false,
  "followUpNote": null
}
~~~

Both versions are required positive integers. At least one changed field is required. Mutable fields: actionAt, description, result, assigneeId, followUpRequired, followUpNote, attachmentNotes, status, cancellationReason. Omitted fields keep their current values. Validate the merged final record, not only supplied fields.

Exception to omitted-field preservation: setting followUpRequired to false clears followUpNote to null when that note is omitted or null. An explicitly supplied nonblank note with false is rejected. This makes clearing a completed action's follow-up unambiguous.

- Planned/In Progress actions may change content, assignee and status according to the matrix.
- Completing requires nonblank Result and an active staff/admin assignee. Content and completion may be submitted together.
- Cancelling requires a 1-1000 character reason. Reject cancellationReason except with a transition to CANCELLED.
- Completed actions permit only actionAt, description, result, followUpRequired, followUpNote and attachmentNotes corrections; Result must stay nonblank. Status/assignee are fixed.
- Cancelled actions and prior-cycle actions reject every mutation.
- A no-op patch or explicit same-status transition returns 400 VALIDATION_ERROR; it does not increment versions.

**200:** `{ "action": <updated Action>, "ticketVersion": 9 }`. Increment action version and Ticket version once, append the new full revision and update timestamps atomically. Performing staff may differ from owner/assignee; record the editor in the revision.

**Errors:** common errors; 409 STALE_VERSION, INVALID_TRANSITION, TICKET_NOT_EDITABLE or ACTION_NOT_EDITABLE. No update/delete endpoint exists for action history.

### 3.4 GET `/api/staff/tickets/:id/actions/:actionId/revisions`

**Access:** IT Staff, Administrator only. Same parent-child lookup protection as section 3.3.

Pagination: page default 1, pageSize default 20, maximum 50. Order by revision ascending. Return:

~~~json
{
  "revisions": [
    {
      "revision": 1,
      "actor": { "id": "d4ba924d-66a5-46d8-a090-66d9ae6d1f16", "name": "Michael Brown" },
      "createdAt": "2026-10-20T08:01:00.000Z",
      "snapshot": {
        "actionAt": "2026-10-20T08:00:00.000Z",
        "description": "Inspect the network connection.",
        "result": null,
        "performedById": "d4ba924d-66a5-46d8-a090-66d9ae6d1f16",
        "assigneeId": "d4ba924d-66a5-46d8-a090-66d9ae6d1f16",
        "status": "PLANNED",
        "followUpRequired": false,
        "followUpNote": null,
        "attachmentNotes": null,
        "cancellationReason": null,
        "resolutionCycle": 1
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "totalCount": 1 }
}
~~~

Snapshot fields above are the complete mutable/business snapshot; action ID, version and revision timestamp are provided by the containing resource. Do not enrich snapshots with private account fields.

## 4. Ticket Workflow Extensions

### 4.1 PATCH `/api/staff/tickets/:id/status`

Existing endpoint gains required expectedTicketVersion and optional reason:

~~~json
{ "status": "Resolved", "expectedTicketVersion": 9 }
~~~

`reason` is required and trimmed to 1-1000 characters for Cancelled; reject it for other target states. Preserve existing status input aliases. All role, matrix and gate rules are in specification section 5.

**200:** preserve existing id, ticketId (legacy Ticket-number alias), status and updatedAt, and add version, resolutionCycle and resolvedAt. Never change the legacy ticketId type on this existing endpoint.

For Cancelled, atomically cancel each unfinished current-cycle action, append a revision with the cancelling actor/reason, and append one TicketStatusEvent. Increment each affected action version once and the Ticket version once.

For Reopened, increment cycle, clear resolvedAt, problemAppearsResolved and indicatedAt, preserving earlier actions/events. For Resolved, set resolvedAt. For Closed, retain resolvedAt, including null for an already-resolved legacy Ticket.

**409 RESOLUTION_BLOCKED:**

~~~json
{
  "error": {
    "code": "RESOLUTION_BLOCKED",
    "message": "Complete the required work before resolving this ticket.",
    "blockers": ["UNFINISHED_ACTIONS", "FOLLOW_UP_REQUIRED"]
  }
}
~~~

**409 STALE_VERSION:** safe message and currentTicketVersion; include currentActionVersion on action-edit conflicts only after authorization. The response does not contain another user's draft or private content.

### 4.2 Owner / priority / detail

Existing PATCH `/api/staff/tickets/:id/owner` and `/priority` require expectedTicketVersion alongside existing ownerId or itPriority. Owner may still be null; non-null owner must be active staff/admin. Mutations lock the parent, validate its version and increment it once. Their existing success fields remain; add version and updatedAt.

All Ticket detail/list DTOs add version and resolvedAt where needed for editing/dashboard navigation, without dropping prior fields. Staff detail includes section 2.2 gate information. The existing GET `/api/staff/users` supplies active assignees.

### 4.3 GET `/api/tickets/:id/status-history`

**Access:** Owning Requester, IT Staff, Administrator. Same ownership masking as action reads.

page/pageSize default 1/20, max 50; order `(createdAt ASC, id ASC)`.

Return `{ "events": [...], "pagination": { "page": 1, "pageSize": 20, "totalCount": 0 } }`.
Each event contains id, fromStatus, toStatus, reason, resolutionCycle, createdAt and actor `{id,name}`. Empty legacy history is a valid 200 response. Reasons are shared Ticket content; staff must use Internal Notes for private information.

### 4.4 Other Ticket activity

Preserve existing comments, notes, attachment and resolved-indicator paths/payloads. Public comments, attachments and a new resolution indication update Ticket.updatedAt and increment version under the parent lock. They do not require an expected version because they do not overwrite workflow/action fields. Repeated already-set indication is a no-op.

Internal Notes retain their own timestamps and do not update requester-visible Ticket.updatedAt or Ticket.version. This avoids exposing private-note activity through dashboard ordering/version changes. No Internal Note content/count may be embedded in shared DTOs, dashboard responses or status history.

## 5. Transactions and Idempotency

For action creates/edits and Ticket owner/priority/status writes:

1. Authenticate, check current account state/role/CSRF and validate basic input.
2. Begin a transaction; lock the parent Ticket row using a parameterized row-lock query.
3. Resolve any action under that Ticket; check its cycle and required expected versions.
4. Lock relevant User rows in ascending User ID order and revalidate actor/assignee/owner eligibility. User administration must lock affected User rows in the same order before activation/role updates.
5. Evaluate the action lifecycle or Ticket gate against records inside that transaction.
6. Write the action/Ticket changes, audit records, receipt if applicable, and versions; commit. An exception rolls everything back.

Lock order is parent Ticket first, then relevant User rows sorted by ID. User administration locks User rows only and must not acquire Ticket locks afterward; role/deactivation changes retain historical references without rewriting Tickets/actions. A deadlock/serialization failure must roll back and return 409 RETRYABLE_CONFLICT; it must not expose a partially successful result. All action mutation paths, including cascade cancellation, must use the same parent lock as resolution.

Action creation idempotency:

- Key scope is authenticated actor + UUID key. Persist receipts without expiry for this lab.
- Hash a canonical representation of the submitted payload and parent ID, preserving the distinction between omitted server-default fields and supplied values. Do not hash a freshly generated default timestamp on every retry.
- The unique key plus transaction must protect simultaneous retries: at most one action/revision/receipt is created. On a uniqueness race, roll back, load the committed receipt and compare the hash.
- Successful receipts replay their original body, even if the Ticket has since changed; authorization is checked again first.
- Validation/authorization/conflict failures do not create a success receipt.
- PATCH retries are protected by versions: a committed first write makes a repeated old-version write conflict. Clients refetch instead of automatically repeating a modified PATCH.

## 6. Dashboard APIs

### 6.1 GET `/api/dashboard/requester`

**Access:** REQUESTER only. No requesterId, arbitrary timezone or custom date-range parameters. Derive identity from the current session. Reject unsupported query parameters.

~~~json
{
  "asOf": "2026-10-20T10:00:00.000Z",
  "timeZone": "Asia/Bangkok",
  "window": {
    "since": "2026-10-13T17:00:00.000Z",
    "before": "2026-10-20T10:00:00.000Z"
  },
  "metrics": {
    "openTickets": 0,
    "waitingForRequester": 0,
    "recentlyUpdated": 0,
    "recentlyResolved": 0
  },
  "attentionTickets": [],
  "recentTickets": []
}
~~~

Metric predicates, boundaries and preview ordering are normative in specification section 6. Each preview is at most 5 TicketSummary objects:

`{id, ticketNumber, summary, currentStatus, itPriority, updatedAt, resolvedAt}`.

itPriority uses the effective-priority fallback. No Requester ID override is accepted. The client builds documented local drill-down URLs from these fixed metric keys and returned window values; the API does not return arbitrary external links.

### 6.2 GET `/api/staff/dashboard`

**Access:** IT_STAFF, ADMINISTRATOR. No query parameters.

Return asOf/timeZone/window as above, and:

~~~json
{
  "metrics": {
    "unassignedTickets": 0,
    "myTickets": 0,
    "recentlyUpdated": 0,
    "myActiveActions": 0,
    "byStatus": {
      "New": 0,
      "Open": 0,
      "In Progress": 0,
      "Waiting for Requester": 0,
      "Resolved": 0,
      "Closed": 0,
      "Reopened": 0,
      "Cancelled": 0
    },
    "byPriority": { "Low": 0, "Medium": 0, "High": 0 }
  },
  "urgentTickets": [],
  "recentTickets": [],
  "myActions": {
    "actions": [],
    "pagination": { "page": 1, "pageSize": 5, "totalCount": 0 }
  }
}
~~~

urgentTickets/recentTickets use TicketSummary, maximum 5 each. myActions uses section 2.1 Action DTOs, maximum 5, with the exact myActiveActions predicate. Staff/admin metrics cover all accessible Tickets, while owner/assignee “me” always refers to the authenticated user, not a query value.

### 6.3 GET `/api/staff/actions/mine`

Supports the paginated My actions dashboard section. Access is staff/admin only. Query page positive integer default 1; fixed pageSize 5. Reject arbitrary assignee IDs and unsupported filters.

Return `{actions, pagination}` with Action DTOs; predicate matches myActiveActions and order is `(actionAt DESC, id DESC)`. An action must be Planned/In Progress, in its Ticket's current cycle, assigned to the authenticated user, with an ACTIVE parent. Empty/beyond-last page returns 200 and `[]`.

This endpoint is a fresh operational query, not a continuation of the original dashboard snapshot.

## 7. Existing List Extensions for Drill-down

Implement these on GET `/api/tickets` and GET `/api/staff/tickets`, with identical predicate helpers:

| Query | Rule |
|---|---|
| statusGroup | `active` = the five ACTIVE states; `resolved` = Resolved or Closed |
| status | Existing single status, normalized to canonical value |
| updatedFrom / updatedBefore | Offset-bearing instants; inclusive lower / exclusive upper |
| resolvedFrom / resolvedBefore | Same bounds; null resolvedAt never matches |
| sort | Add updatedAt, -updatedAt, resolvedAt, -resolvedAt; retain existing supported values |

Reject status combined with statusGroup, unsupported values, or a lower bound >= upper bound with 400 VALIDATION_ERROR. A single bound is allowed. Date filters combine with other predicates using AND. Limit date strings to valid instants; no timezone-less local dates.

For new timestamp sorts, append ID in the same direction as a deterministic tie-breaker; resolvedAt sorts put nulls last. Shared new filters never change Requester ownership scoping. Staff owner/priority/category/search and Requester search/status remain supported.

Requester pagination retains page/limit and `{data, meta:{total,page,limit,totalPages}}`; staff retains page/pageSize (legacy limit alias) and `{tickets,pagination:{page,pageSize,totalCount}}`. The client converts dashboard URLs to these route-specific query names. Pagination remains bounded to at most 50 records per response.

Metric destination mapping is in specification section 6. Encode status/date values with URLSearchParams. `/dashboard?actionsPage=N` calls section 6.3; it does not send actionsPage to the dashboard aggregate endpoint.

## 8. Security and Regression Verification

Required implementation checks, not current results:

- [ ] Direct action/transition requests enforce all role, ownership, actor, version and gate rules.
- [ ] Active/current roles and forced-password-change state are checked server-side, including after admin changes an already logged-in user.
- [ ] Missing/invalid CSRF fails mutations; missing cookies cannot fall back to client requesterId.
- [ ] Parent/action mismatches cannot read or mutate an action through another Ticket URL.
- [ ] Dashboard responses are bounded, contain no private-note/account fields and use server aggregates.
- [ ] Private-note writes do not leak through shared updatedAt/version/dashboard changes.
- [ ] Gate/update races, simultaneous idempotency retries, stale edits and transactional rollback are exercised against a database.
- [ ] Existing list/detail shapes and attachment/comment/note behavior remain compatible except documented security/version changes.
- [ ] Legacy API/UI tests are updated for required versions and real authentication, never weakened to preserve an identity bypass.
- [ ] Every error is safe and machine-readable; unauthorized responses never include conflict versions or resource content.

Detailed planned-test ownership and AC references are in specification section 9 and will be expanded by issue #42.
