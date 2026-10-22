# UI Specification - Sprint 4

**Status:** Actions Taken is implemented in #46 ([guide](actions-ui.md)), Ticket workflow/history in #48 ([guide](ticket-workflow-ui.md)), and Requester dashboard/navigation/filter drill-down in #49 ([guide](requester-dashboard.md)). Staff dashboard/landing is implemented by #50 ([guide](staff-dashboard.md)); final release checks remain tracked separately.

**Authority:** [specification.md](specification.md) defines roles, rules and metrics; [api-spec.md](api-spec.md) defines wire behavior.

## 1. Shared Design and Navigation

Continue the existing Zen Green language: primary #006B3C, page background #F5F7F6, white cards, muted read-only surfaces #F0F4F1 and existing Bootstrap typography/spacing. Use 4/8/16/24/32px spacing, 12px card radius and the existing role/status/priority badge vocabulary. Validate text contrast rather than relying on color names.

| Destination | Requester | IT Staff / Administrator |
|---|---|---|
| `/dashboard` | Requester Dashboard | Staff Dashboard |
| `/tickets` | My Tickets | Use shared queue |
| `/queue` | Forbidden | Shared Ticket Queue |
| `/tickets/:id` | Own Ticket Detail | Staff Ticket Detail |
| `/create-ticket` | Existing Create Ticket | Existing Create Ticket |
| `/admin` | Forbidden | Administrator only |
| `/profile` | Existing profile/password | Existing profile/password |

After successful authentication and mandatory password change, `/` lands on `/dashboard`. Keep existing direct destinations working. The logo and Dashboard link navigate to the role-appropriate dashboard. Use real links with `aria-current="page"`, visible current-page styling, identity/role and Logout.

Parse both pathname and query parameters. Refresh and browser Back/Forward must preserve dashboard drill-down filters; never substitute a stale selectedTicketId for the ID in the URL. Unknown routes show a useful not-found view.

## 2. Dashboard Layouts

### Requester

- Title: **Dashboard**; secondary text: **Your tickets at a glance**.
- Four metric cards in the order Open tickets, Waiting for you, Updated in last 7 days, Resolved in last 7 days.
- Two concise sections: **Waiting for you** and **Recently updated**, maximum five Ticket rows each.
- Rows display Ticket number, summary, status and updated time. A row has an explicit keyboard-accessible detail link.
- Each card links to the exact filtered My Tickets destination in specification section 6.2. Counts represent all matching records; previews show only five.
- Existing My Tickets remains the detailed searchable/paginated list. New statusGroup/date/sort filters appear as readable filter chips and can be cleared.

### IT Staff / Administrator

- Title: **Service desk dashboard**.
- Top cards: Unassigned open tickets, My open tickets, Updated in last 7 days, Actions assigned to me.
- Compact status and open-ticket priority summaries include labelled zero-count buckets; each bucket links to the matching queue.
- **Urgent tickets** and **Recently updated** show at most five rows each.
- **My actions** shows five current-cycle unfinished assigned actions per page, with description, Ticket number, status and effective action time. The count card focuses this section. Previous/Next updates `/dashboard?actionsPage=N`; clicking an action opens its Ticket's Actions Taken section.
- Administrators see the same screen and keep the existing Admin navigation link. Do not add optional account statistics.

All dashboards display **Updated [time]**, **Last 7 days · Asia/Bangkok** for recent metrics and Refresh. A fresh drill-down may differ from an older card because operational data changed; do not pretend it is a historical snapshot.

## 3. Actions Taken on Ticket Detail

### List and read-only view

Add an **Actions Taken** section/tab beside Public Comments, Attachments and staff-only Internal Notes. Requesters see all current actions for their own Ticket, including cancelled and earlier-cycle actions. Current records are ordered by effective action time ascending, then ID ascending; edits can move a row if its effective time changes.

Desktop columns: Action time, Description, Result, Performed by, Assigned to, Status, Follow-up and View/Edit. Long descriptions/results wrap; details expose full content without clipping.

Each detail view shows:

- Action time (effective time) and Recorded at (immutable creation time), labelled separately.
- Description, Result or “No result recorded yet,” Performed by and Assigned to.
- Status badge, Follow-up required with text, conditional Follow-up note, Attachment Notes.
- Resolution cycle, Last updated and cancellation reason when present.
- “Previous resolution cycle — read-only” for earlier-cycle records.

Attachment Notes are plain text guidance to existing Ticket attachments. They do not grant download access or create new file links. Existing soft-removed attachment behavior is preserved.

### Create / edit controls

| Field | Create default | Editing / validation |
|---|---|---|
| Action time | Current time | Required; show Asia/Bangkok; convert to offset-bearing ISO timestamp. Must be between Ticket creation and server now. |
| Description | Empty | Required; trimmed 1-2000 characters |
| Result | Empty | Up to 2000; required for completion |
| Performed by | Current signed-in user | Always read-only; do not submit editable actor identity |
| Assigned to | Current signed-in user | Active staff/admin selector; editable only for unfinished actions |
| Follow-up required | No | Checkbox with explicit Yes/No presentation |
| Follow-up note | Hidden | Required, 1-1000 characters when Yes; changing to No explains that the current note will clear while history is retained |
| Attachment Notes | Empty | Optional, max 1000 characters |
| Status | Planned, read-only | Lifecycle changes use explicit Start / Complete / Cancel actions |

Create/edit uses an inline form or labelled detail panel, with Save and Cancel. Create saves Planned first; Complete is a subsequent explicit operation and can submit Result/follow-up fields atomically. Start moves to In Progress. Cancel opens a confirmation with required reason. There is no Delete button.

Only staff/admin see mutation controls. Completed action content/follow-up can be corrected while its parent is active and in the same cycle; its assignee/status cannot change. Cancelled actions and all actions under Resolved/Closed/Cancelled parents are read-only. A Ticket must be reopened before new work is recorded.

Inactive historical assignees remain visible as “Name (inactive)” and are excluded from new assignment options. Explain that an unfinished action must be reassigned before completion.

### History

Staff can expand **Change history** for an action. Show revision number, editor, server timestamp and saved values, oldest revision first. This is view-only, with pagination; never render it for Requesters.

Ticket **Status history** is shared with the owning Requester and staff. Show prior/next status, actor, time and cancellation reason when applicable, in deterministic chronological order. An empty legacy history says “No status changes recorded since the Lab 4 upgrade,” without inventing events.

## 4. Ticket Workflow Controls

Use the single transition matrix from specification section 5.4. Staff/admin see only permitted target states; Requesters see the current status badge and existing advisory control.

Before choosing Resolved, display current-cycle evidence:

- Number of completed actions.
- Number of unfinished actions.
- Number of non-cancelled actions still requiring follow-up.

Explain blockers near the status control and link to Actions Taken. The server remains authoritative; stale UI can still receive a gate/conflict error. Do not automatically resolve after an action is completed.

Ticket cancellation requires a reason and confirmation explaining that unfinished actions will also be cancelled. Reopening explains that previous actions remain in history and new completed work is required for the next resolution.

After success refetch Ticket status, version, gate information, actions and history. On returning to a dashboard/list, refresh affected data. The problem-appears-resolved control remains advisory, available only in its permitted Lab 3 states, and resets after reopening.

## 5. Feedback and Conflict Recovery

| State | Required presentation |
|---|---|
| Loading | Labelled skeleton/spinner; do not show 0 before a successful response |
| Busy | Disable submit/lifecycle controls for that operation; retain inputs; show “Saving…” |
| Success | Polite live announcement and refreshed authoritative data |
| Validation | Field-level message associated by aria-describedby; focus first invalid field; preserve values |
| Empty | Real 0/empty response; explain “No actions yet” or “No tickets need your attention”; permitted create action where appropriate |
| No results | Explain that filters found nothing; provide Clear filters |
| 401 | Clear private data and return to Login |
| Forced password change | Route to Change Password before business content |
| 403 | Safe permission message, no partial private content |
| 404 | Same “Ticket could not be found” for nonexistent and other-owner resources |
| 409 stale version | Keep local draft; explain another update occurred; offer Load latest before an explicit retry |
| 409 retryable transaction conflict | Preserve draft and offer Retry after loading current versions; never report an uncommitted write as successful |
| Resolution gate failure | Show missing-completion/unfinished/follow-up blockers, with link to actions |
| Network / 500 | Safe message and Retry; preserve draft; never show SQL, stack traces or raw server payload |

After Load latest, display fresh values alongside the retained draft or let the user explicitly reapply it. Never silently overwrite the latest server values or automatically resubmit a stale edit.

For a create request with an uncertain network outcome, Retry reuses the same idempotency key and identical submitted payload. Do not permit changing that uncertain submission until replay establishes whether it succeeded. After success, clear the draft/key and refetch; subsequent edits use the edit flow. A known validation failure can be corrected and submitted as a new attempt.

Do not persist sensitive drafts in localStorage. Leaving an unsaved form requires a discard confirmation; returning from a recoverable in-page error preserves its current draft.

## 6. Responsive and Accessibility Contract

| Viewport | Dashboard | Ticket/actions |
|---|---|---|
| Desktop >=1024px | Four metric columns; two preview columns | Wrapped table; form up to two columns |
| Tablet 768-1023px | Two metric columns; stacked previews | Action cards; two-column form where labels fit |
| Mobile <768px | One metric column; stacked previews | Single-column cards/forms; full-width primary controls |

Verify at 1440x900, 768x1024 and 390x844, plus 320px width and 200% zoom. Avoid page-level horizontal scrolling. Tab controls may wrap; do not hide actions beyond an inaccessible horizontal strip.

- Keyboard-operable links, controls, tabs and dialogs; no clickable div as the only navigation mechanism.
- Visible focus, logical focus order and focus return after closing a dialog.
- Named dialog with focus containment; Escape cancels when idle.
- Persistent labels, required markers explained in text, field-error associations.
- Status/priority/follow-up/private-content meaning conveyed by text/icon as well as color.
- Touch controls at least 44px high/wide where interactive.
- Normal text contrast at least 4.5:1; large text and meaningful UI boundaries/focus at least 3:1.
- Loading/success use polite announcements; errors use an appropriate alert without repeated announcements.
- Requester DOM contains no Internal Note controls/content/counts or staff-only action history.

## 7. Verification Handoff

Planned component files: client/tests/lab-04/ActionsTaken.test.tsx, TicketWorkflow.test.tsx, RequesterDashboard.test.tsx and StaffDashboard.test.tsx. Planned E2E files and AC mappings are in specification section 9; detailed test cases are issue #42.

Record the following during implementation; these items have not been executed by the specification issue:

- [ ] All role navigation and direct-route guards behave correctly.
- [ ] Counts, labels and drill-down filters match backend data, including zero values.
- [ ] Create/edit/assign/start/complete/cancel and Requester read-only action views work.
- [ ] Validation, conflict, safe failure and uncertain-create retry preserve appropriate data.
- [ ] Both lifecycle controls match the backend matrix and gate.
- [ ] Desktop/tablet/mobile layouts show no clipping, overlap or horizontal page overflow.
- [ ] Keyboard, focus, labels, dialogs and contrast meet section 6.
- [ ] Public/private content is consistently distinguished.
- [ ] Earlier screens remain available; remove obsolete selectors, placeholders and nonfunctional controls.
- [ ] Store readable screenshots under artifacts/lab-04/screenshots/staff-dashboard/, requester-dashboard/ and actions-taken/, naming viewport and state; include workflow feedback.

Visual evidence demonstrates appearance, while API/component/E2E results demonstrate behavior. Both are required for final product completion.

## 8. Ticket Workflow Implementation Evidence

Issue [#48](https://github.com/Tell52/toktickit/issues/48) implements section 4's transition/gate controls, cancellation/reopen confirmations, shared status history and section 5's recoverable conflict flow. See [ticket-workflow-ui.md](ticket-workflow-ui.md) for behavior, screenshots, reproduction and scoped test evidence. Dashboard and final product verification remain tracked separately.
