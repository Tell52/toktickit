# Sprint 3 Engineering Specification — TokTickIT

**Course:** CPE 334 — Introduction to Software Engineering in the Age of AI Agents
**Sprint:** Lab 3 — Users, Roles, IT Staff Ticketing, and Admin Screens
**Status:** Draft for approval before implementation PRs begin

---

## 1. Sprint Goal

This sprint replaces the temporary Development Requester selector with real authentication and server-enforced, role-based authorization. It delivers the first operational IT Staff Ticket Queue and Ticket Detail workflow, adds Public Comments and role-restricted Internal Notes, and introduces a minimalist Administrator screen for user account management — all while preserving every Lab 2 Requester capability and existing Ticket/Attachment data.

---

## 2. Stakeholder Request (Interpreted)

The system needs to move from a fake requester picker to real login. Every user must sign in with an email and password, and anyone given a temporary password must change it before they can use the app. Requesters keep doing what they did in Lab 2, but now tied to their real authenticated account instead of a dropdown. IT Staff need a shared queue to find tickets, claim or reassign them, set an internal priority, move status forward, and talk to Requesters via Public Comments while keeping private Internal Notes separate. Requesters can say a problem looks fixed, but only IT Staff can actually resolve or close a ticket. Administrators get one simple screen to view, create, and edit user accounts, assign a single role, turn accounts on/off, and reset a starting password — nothing more elaborate than that. Every one of these rules has to be enforced on the backend, not just hidden in the UI.

---

## 3. Scope

### 3.1 Included
- Email/password authentication, session handling, logout, current-user retrieval
- Mandatory first-login password change flow
- Role-based navigation and server-side authorization for Requester, IT Staff, Administrator
- Migration of Development Requester records into a real `User` model
- Continued Requester ticket/attachment ownership from Lab 2, now backed by authenticated identity
- IT Staff Ticket Queue: search, filter, sort, pagination
- IT Staff Ticket Detail: claim/reassign ownership, IT Priority, permitted status transitions
- Public Comments (visible to Requester, IT Staff, Administrator)
- Internal Notes (visible to IT Staff, Administrator only)
- Requester "Problem Appears Resolved" indicator (non-binding, cannot close/resolve)
- Administrator User Management: list, search, role filter, create, edit, activate/deactivate, set initial password
- Zen Green visual language extended to all new screens, responsive on desktop/tablet/mobile

### 3.2 Explicitly Excluded
- Email invitations, password-reset email, MFA, social login, SSO
- Self-registration / Requester-created accounts
- Actions Taken (deferred to Lab 4)
- SLA calculation, escalation rules, notification services
- Dashboards / KPI analytics
- Multi-tenant organizations or departments
- User deletion, bulk operations, import/export
- Multiple roles per user
- Mandatory pagination, multi-column sort, or multiple simultaneous filters on the Admin user list
- Account-history / audit-history screens
- Production-grade deployment or infrastructure changes

---

## 4. Functional Requirements

### Authentication & Session
- **FR-01**: The system shall allow a user to authenticate using an email address and password.
- **FR-02**: The system shall establish an authenticated session/token on successful login and reject requests without valid credentials.
- **FR-03**: The system shall provide a logout action that invalidates the current session.
- **FR-04**: The system shall provide a `/me` (current-user) endpoint that returns the authenticated user's identity and role.
- **FR-05**: The system shall force any user flagged as requiring a password change into a Change Password flow before granting access to normal application screens.
- **FR-06**: The system shall reject login for inactive accounts with a generic error that does not reveal account existence or status.

### Role-Based Navigation & Authorization
- **FR-07**: The system shall render only the navigation items and actions permitted for the authenticated user's role.
- **FR-08**: The system shall enforce authorization for every protected endpoint on the backend, independent of what the UI displays.

### Requester (Lab 2 Regression)
- **FR-09**: The system shall allow a Requester to create and manage only Tickets they own, using their authenticated identity (never a client-supplied `requesterId`).
- **FR-10**: The system shall remove the Development Requester selector and "Change Requester" action entirely.
- **FR-11**: The system shall allow a Requester to post Public Comments on their own Tickets.
- **FR-12**: The system shall allow a Requester to mark a Ticket as "Problem Appears Resolved" without changing its formal status.

### IT Staff Ticket Queue
- **FR-13**: The system shall provide a shared Ticket Queue visible to IT Staff and Administrators showing all Tickets regardless of owner.
- **FR-14**: The system shall support search by ticket number or summary text in the queue.
- **FR-15**: The system shall support filtering the queue by at least status, category, and priority.
- **FR-16**: The system shall support sorting the queue by at least Created Date, Priority, and Status.
- **FR-17**: The system shall paginate queue results.

### IT Staff Ticket Operations
- **FR-18**: The system shall allow IT Staff to claim an unassigned Ticket or reassign an already-owned Ticket to another active IT Staff/Administrator.
- **FR-19**: The system shall allow IT Staff/Administrator to set or change IT Priority independently of Requested Priority.
- **FR-20**: The system shall allow IT Staff/Administrator to change Ticket status according to the permitted transition matrix (Section 8).
- **FR-21**: The system shall allow IT Staff/Administrator to post Public Comments and Internal Notes on any Ticket.
- **FR-22**: The system shall hide Internal Note content and existence from Requester-role API responses.

### Administrator User Management
- **FR-23**: The system shall allow an Administrator to view a list of users showing Name, Email, Role, and Status.
- **FR-24**: The system shall allow an Administrator to search users by name or email.
- **FR-25**: The system shall allow an Administrator to optionally filter the user list by role.
- **FR-26**: The system shall allow an Administrator to create a user with name, email, one role, activation state, and an initial password.
- **FR-27**: The system shall allow an Administrator to edit a user's name, email, role, and activation state.
- **FR-28**: The system shall allow an Administrator to set a new initial password that forces a password change at the user's next login.
- **FR-29**: The system shall prevent creation or update of a user with a duplicate email address.
- **FR-30**: The system shall prevent an Administrator from deactivating their own account.
- **FR-31**: The system shall prevent deactivation or removal of the last remaining active Administrator.

---

## 5. Business Rules

| BR ID | Rule |
|---|---|
| BR-01 | Only an active user with valid credentials may authenticate. |
| BR-02 | A user marked as requiring a password change cannot enter the normal application until a new valid password is saved. |
| BR-03 | The authenticated user identity, not a `requesterId` supplied by the client, determines ownership of Requester operations. |
| BR-04 | Public Comments are visible to the Requester, IT Staff, and Administrator. Internal Notes are visible only to IT Staff and Administrator. |
| BR-05 | A Requester may indicate that the problem appears resolved, but cannot formally set the Ticket to Resolved or Closed. |
| BR-06 | Passwords are never stored in plaintext; only a salted hash is persisted. |
| BR-07 | Login attempts must not reveal whether the failure was due to an unknown email, wrong password, or inactive account — the error message is identical in all cases. |
| BR-08 | Logout invalidates the current session/token; a reused token after logout is rejected. |
| BR-09 | Email addresses are unique (case-insensitive) across all users regardless of role. |
| BR-10 | A Ticket may have zero or one primary Ticket Owner, who must be an active IT Staff or Administrator user. |
| BR-11 | Requested Priority is set by the Requester at ticket creation and is never editable by any role after submission. |
| BR-12 | IT Priority initially copies Requested Priority at ticket creation and may thereafter be changed only by IT Staff or Administrator. |
| BR-13 | Ticket status may only move along permitted transitions (see Section 8); invalid transitions are rejected by the backend regardless of UI state. |
| BR-14 | Only IT Staff or Administrator may set status to Resolved, Closed, or Reopened. |
| BR-15 | Public Comments and Internal Notes are append-only in Lab 3 — no edit or delete operations exist. |
| BR-16 | Empty or whitespace-only Public Comments/Internal Notes are rejected by the backend. |
| BR-17 | Every Comment/Note is stamped with author identity and creation time from the backend, never from client input. |
| BR-18 | A new user account is created with `mustChangePassword = true` by default. |
| BR-19 | An Administrator may assign exactly one role per user; multi-role assignment is not supported. |
| BR-20 | Deactivating a user does not delete their historical Tickets, Comments, or Notes. |
| BR-21 | Migration of Lab 2 Development Requester records must preserve existing Ticket ownership references without data loss. |

---

## 6. UI Specification Summary

*(Full detail in `docs/lab-03/ui-spec.md`; this section summarizes structure only.)*

- **Login / Change Password** — single-purpose auth screen; Change Password view only reachable when `mustChangePassword = true`; shows password rule checklist, inline validation, busy and safe-failure states.
- **Application Shell** — top nav showing product name, role-appropriate links (My Queue / Create Ticket for Requester & IT Staff, Admin for Administrator), current user name + role badge, Logout.
- **Requester Ticket Detail** — Lab 2 layout plus Public Comments thread and "Problem Appears Resolved" button; no Internal Notes tab visible.
- **IT Staff Ticket Queue** — searchable/filterable/sortable/paginated table (desktop) collapsing to a card list (tablet/mobile); columns: Ticket No., Created Date, Summary, Category, Requested Priority, IT Priority, Status, Owner.
- **IT Staff Ticket Detail** — extends Lab 2 detail view; adds Ticket Owner selector, IT Priority selector, Status selector (permitted transitions only), tabbed Public Comments / Internal Notes / Attachments, visually distinct comment vs. note styling (color + icon).
- **Administrator User Management** — single screen: search bar, role filter, user table (Name, Email, Role, Status, Edit), side panel/modal for Create/Edit user with role dropdown, active toggle, and "Set New Password" action.
- All screens reuse Zen Green tokens, badges, and form conventions from Lab 2; no new visual system is introduced.

---

## 7. Data Changes

### 7.1 New/Modified Models (Prisma, conceptual)

**User** *(new)*
- `id`
- `name`
- `email` (unique, case-insensitive)
- `passwordHash`
- `role` (enum: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`)
- `isActive` (boolean, default `true`)
- `mustChangePassword` (boolean, default `true`)
- `createdAt`, `updatedAt`

**Ticket** *(extended from Lab 2)*
- existing Lab 2 fields retained (category, related system, requested priority, summary, description, status, requester reference, etc.)
- add `ownerId` (nullable FK → User, IT Staff/Admin only)
- add `itPriority` (enum, mirrors priority values; defaults to Requested Priority at creation)
- `requesterId` now a required FK → User (migrated from Dev Requester identity)

**Comment** *(new)* — Public Comments
- `id`, `ticketId` (FK), `authorId` (FK → User), `content`, `createdAt`

**Note** *(new)* — Internal Notes
- `id`, `ticketId` (FK), `authorId` (FK → User), `content`, `createdAt`

**Attachment** — unchanged from Lab 2; relation preserved.

### 7.2 Relationships
- `User (1) ── (many) Ticket` as requester
- `User (0..1) ── (many) Ticket` as owner
- `Ticket (1) ── (many) Comment`
- `Ticket (1) ── (many) Note`
- `User (1) ── (many) Comment` / `Note` as author

### 7.3 Indexes
- `User.email` unique index
- `Ticket.status`, `Ticket.ownerId`, `Ticket.requesterId` indexed to support queue filtering/sorting

### 7.4 Migration Strategy
1. Create `User` table and enums.
2. For each existing Lab 2 Development Requester identity referenced by Tickets, create a corresponding `User` row with role `REQUESTER`, `mustChangePassword = true`, and a documented seeded initial password.
3. Backfill `Ticket.requesterId` to point at the new `User.id`.
4. Add `ownerId` and `itPriority` columns to `Ticket`; backfill `itPriority` = existing Requested Priority for all pre-existing rows; leave `ownerId` null (unassigned) unless otherwise decided.
5. Run migration inside a transaction; verify row counts for Ticket/Attachment before and after match exactly (regression check).
6. Remove client-side Development Requester selector state/code.

### 7.5 Seed Data
- ≥4 active Requester accounts, ≥1 inactive Requester account
- ≥3 active IT Staff accounts, ≥1 inactive IT Staff account
- ≥1 active Administrator account
- Tickets distributed across multiple Requesters, statuses, priorities, and both assigned/unassigned owners
- Example Public Comments and Internal Notes with no sensitive data
- Seed script is idempotent (safe to re-run)
- All seeded credentials documented in a local-dev-only README section; never real personal passwords

---

## 8. API Contract

*(Full detail in `docs/lab-03/api-spec.md`; summary below.)*

### Auth
| Method | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Returns session/token + user identity + role |
| POST | `/api/auth/logout` | Authenticated | Invalidates session |
| GET | `/api/auth/me` | Authenticated | Returns current user + `mustChangePassword` flag |
| POST | `/api/auth/change-password` | Authenticated | Requires current + new password; clears `mustChangePassword` |

### Requester (Lab 2 continuation, now authenticated)
| Method | Endpoint | Access |
|---|---|---|
| GET/POST | `/api/tickets` | Requester (own only), IT Staff/Admin (all) |
| GET | `/api/tickets/:id` | Owner or IT Staff/Admin |
| POST | `/api/tickets/:id/comments` | Owner, IT Staff, Admin |
| POST | `/api/tickets/:id/resolved-indicator` | Requester (owner only) |

### IT Staff Queue & Ticket Ops
| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET | `/api/staff/tickets` | IT Staff, Admin | Query params: `search`, `status`, `category`, `priority`, `sort`, `page`, `pageSize` |
| GET | `/api/staff/tickets/:id` | IT Staff, Admin | |
| PATCH | `/api/staff/tickets/:id/owner` | IT Staff, Admin | Claim/reassign |
| PATCH | `/api/staff/tickets/:id/priority` | IT Staff, Admin | Sets IT Priority |
| PATCH | `/api/staff/tickets/:id/status` | IT Staff, Admin | Validated against transition matrix |
| POST | `/api/staff/tickets/:id/notes` | IT Staff, Admin | Internal Notes |
| GET | `/api/staff/tickets/:id/notes` | IT Staff, Admin | Rejected (403, no content) for Requester |

### Administrator
| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/admin/users` | Administrator — supports `search`, `role` filter |
| POST | `/api/admin/users` | Administrator |
| PATCH | `/api/admin/users/:id` | Administrator |
| POST | `/api/admin/users/:id/reset-password` | Administrator |

### Error Handling
- `401` unauthenticated, `403` authenticated-but-forbidden, `400` invalid input, `404` not found (never reveals whether resource belongs to another user), `409` conflict (e.g., duplicate email, invalid status transition), `500` unexpected — no stack traces or internals leaked.

---

## 9. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-01 | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | Given a user who must change the initial password, when login succeeds, then normal application screens remain unavailable until a valid new password is saved. |
| AC-03 | Given an authenticated Requester, when the client supplies another `requesterId`, then the backend still applies the authenticated identity and does not return another Requester's data. |
| AC-04 | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content. |
| AC-05 | Given an inactive account, when login is attempted with correct credentials, then the response is a generic authentication failure with no indication the account exists or is inactive. |
| AC-06 | Given an authenticated IT Staff user, when they claim an unassigned Ticket, then the Ticket's owner is set to that user and is visible to all roles with queue access. |
| AC-07 | Given a Ticket in a status with no permitted transition to "Closed," when IT Staff attempts to set status to "Closed," then the backend rejects the change. |
| AC-08 | Given a Requester viewing their own Ticket, when they mark it "Problem Appears Resolved," then the Ticket's formal status is unchanged. |
| AC-09 | Given an Administrator, when they attempt to deactivate their own account, then the backend rejects the operation. |
| AC-10 | Given exactly one active Administrator, when an attempt is made to deactivate that account, then the backend rejects the operation regardless of who initiates it. |
| AC-11 | Given an Administrator creating a user with an email that already exists, when the create request is submitted, then the backend rejects it with a conflict error and no user is created. |
| AC-12 | Given a logged-out session, when a previously valid token/session is reused to call a protected endpoint, then the backend returns 401. |
| AC-13 | Given an IT Staff Ticket Queue request with a status filter and sort parameter, when the request is made, then only matching Tickets are returned in the specified order, correctly paginated. |
| AC-14 | Given a Public Comment submitted with empty/whitespace-only content, when the create request is made, then the backend rejects it with a validation error. |

*(Students must extend this list to cover the full approved scope; every AC must map to ≥1 planned test in `tests.md`.)*

---

## 10. Definition of Done

A Lab 3 feature/story is done only when **all** of the following hold:

1. Approved `specification.md`, `ui-spec.md`, and `api-spec.md` exist and predate the implementation PR.
2. All related Functional Requirements and Business Rules are implemented and enforced server-side.
3. Every relevant Acceptance Criterion has at least one passing automated test, traceable in `tests.md`.
4. No Lab 2 Requester functionality is broken (regression tests pass).
5. No plaintext passwords, secrets, or tokens are committed to source control.
6. All protected endpoints correctly reject unauthenticated and unauthorized access (verified by direct API tests, not just UI hiding).
7. UI matches the Zen Green design language and is verified responsive on desktop, tablet, and mobile.
8. Feature was merged via PR with recorded review evidence in `reviewer.md`.
9. Seed data and migration run cleanly against a fresh database and idempotently against an already-seeded one.
10. The AI coding agent reports completion only after confirming items 1–9 against this contract.

---

## 11. Assumptions and Decisions

- **Session mechanism**: HTTP-only cookie-based session (not localStorage token) is assumed for CSRF-safety and simplicity, to be finalized and justified in `api-spec.md` §6.1.
- **Status transition matrix**: New → Open → In Progress → Waiting for Requester ⇄ In Progress → Resolved → Closed, with Reopened available from Resolved/Closed, and Cancelled available from any non-terminal state. Exact matrix to be finalized and documented in `ui-spec.md`/`api-spec.md`.
- **Password rules**: minimum 8 characters, upper + lower case, at least one number and one special character (per the login mockup's password checklist).
- **Queue default sort**: Created Date descending, page size 10, matching the reference mockup.
- **Admin screen**: no pagination is implemented per Lab 3 exclusions, even though the mockup visually shows pagination controls — this is treated as reference-image inconsistency, not a requirement.
- **Ticket Owner selection**: limited to active IT Staff and Administrator users only; inactive staff cannot be assigned.
- **Requested Priority immutability**: once submitted by a Requester, it is never edited by any role (only IT Priority is adjustable).