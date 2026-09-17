# Test Plan and Traceability — Sprint 3 (Lab 3)

**Course:** CPE 334 — Introduction to Software Engineering in the Age of AI Agents
**Status:** Written before/alongside implementation (Test DD / TDD). Not reconstructed from existing code.

This plan covers Unit, API/Integration, UI Component, UI Style, Responsive, Security/Authorization, Migration/Regression, and End-to-End tests. Every Acceptance Criterion in `specification.md` §9 maps to at least one test below. "Final" is updated to Pass/Fail once the corresponding implementation PR merges to `main`.

---

## 1. Traceability Summary

| AC ID | Covered By |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-02, E2E-02 |
| AC-03 | API-05, SEC-01 |
| AC-04 | API-08, SEC-02 |
| AC-05 | API-03, UNIT-02 |
| AC-06 | API-09, UI-04, E2E-04 |
| AC-07 | API-12, SEC-05 |
| AC-08 | API-06, UI-02, E2E-03 |
| AC-09 | API-16, UI-07, SEC-07 |
| AC-10 | API-17, SEC-08 |
| AC-11 | API-15, UI-06 |
| AC-12 | API-04, SEC-03 |
| AC-13 | API-10, UI-05 |
| AC-14 | API-07, UNIT-04 |

---

## 2. Unit Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|
| UNIT-01 | BR-06 | Password hashing utility | Plaintext never stored; hash verifies correctly, wrong password fails verification | `server/tests/lab-03/auth.api.test.ts` | Pending |
| UNIT-02 | AC-05, BR-07 | Login error normalization function | Unknown email, wrong password, and inactive account all produce the identical generic error object | `server/tests/lab-03/auth.api.test.ts` | Pending |
| UNIT-03 | BR-12 | IT Priority default logic | On Ticket creation, `itPriority` is set equal to `requestedPriority` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| UNIT-04 | AC-14, BR-16 | Comment/Note content validator | Empty string and whitespace-only string both rejected; valid string passes | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| UNIT-05 | BR-13 | Status transition matrix validator | Given (fromStatus, toStatus) pairs, returns allowed/rejected matching the matrix in `ui-spec.md` §1.1 for all 8×8 combinations | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| UNIT-06 | BR-09 | Email uniqueness normalizer | Emails compared case-insensitively (`User@x.com` conflicts with `user@x.com`) | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| UNIT-07 | password rules (spec §11) | Password strength validator | Rejects <8 chars, missing upper/lower, missing number, missing special char; accepts a compliant password | `server/tests/lab-03/auth.api.test.ts` | Pending |

---

## 3. API / Integration Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|
| API-01 | AC-01, FR-01, FR-02 | Valid login | Authenticated response; safe user data (id, name, email, role, mustChangePassword); session cookie set | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-02 | AC-02, FR-05, BR-02 | Login with `mustChangePassword=true`, then access a protected route before changing password | Protected route returns 403/redirect-equivalent until `change-password` succeeds | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-03 | AC-05, FR-06, BR-01, BR-07 | Login attempt on inactive account with correct password | 401, generic message, identical to wrong-password case | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-04 | AC-12, FR-03, BR-08 | Logout, then reuse old session cookie on protected route | 401 on reused session; new login required | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-05 | AC-03, FR-09, BR-03 | Requester submits Ticket create/read request with a spoofed `requesterId` in body | Backend ignores client `requesterId`; resource is owned by/scoped to authenticated user only | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-06 | AC-08, FR-12, BR-05 | Requester (owner) calls resolved-indicator endpoint | 200; `problemAppearsResolved=true`; `status` field unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-07 | AC-14, FR-11, BR-16 | POST comment with empty and whitespace-only content | 400 validation error in both cases; no Comment row created | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-08 | AC-04, FR-22, BR-04 | Requester calls GET/POST Internal Notes endpoint | 403; response body contains no note content or count | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-09 | AC-06, FR-18 | IT Staff claims an unassigned Ticket | 200; `ownerId` set to caller; visible in subsequent queue fetch | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-10 | AC-13, FR-14, FR-15, FR-16, FR-17 | Queue request with `status` filter + `sort=-createdAt` + pagination params | Only matching tickets returned, correctly ordered, correct `pagination` metadata | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-11 | FR-15 | Queue request with invalid enum filter value (e.g. `status=BOGUS`) | 400 validation error, no partial/default results silently substituted | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-12 | AC-07, FR-20, BR-13, BR-14 | IT Staff attempts an illegal status transition (e.g. New → Closed) | 409 conflict; status unchanged in DB | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-13 | FR-19, BR-11, BR-12 | Attempt to modify `requestedPriority` via any endpoint | Rejected or silently ignored — field remains immutable post-creation | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-14 | FR-18 | Assign Ticket owner to an inactive IT Staff user | 400 validation error; assignment rejected | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-15 | AC-11, FR-26, FR-29, BR-09 | Admin creates user with an email that already exists | 409 `EMAIL_ALREADY_EXISTS`; no new user row created | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-16 | AC-09, FR-30, BR (self-deactivation) | Admin attempts to set `isActive=false` on their own account | 409 `CANNOT_DEACTIVATE_SELF`; account remains active | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-17 | AC-10, FR-31, BR (last-admin) | Deactivate the sole remaining active Administrator | 409 `LAST_ACTIVE_ADMIN`; account remains active | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-18 | FR-28 | Admin sets new initial password for a user | 200; target user's `mustChangePassword=true`; target user's next login forces Change Password | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-19 | FR-24, FR-25 | Admin user list with `search` and `role` query params combined | Returns only users matching both name/email substring AND role | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-20 | FR-21 | IT Staff posts a Public Comment on a Ticket they don't own | 201 — any IT Staff/Admin may comment regardless of ownership | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |

---

## 4. UI Component Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|
| UI-01 | FR-01, FR-05 | `Login` component | Renders email/password fields; shows inline error banner on failed submit; disables Sign In button while busy | `client/.../lab-03 tests/Login.test.tsx` | Pending |
| UI-02 | AC-02, FR-05 | `ChangePassword` component | Live checklist updates per keystroke (length, case, number, special char); Continue disabled until all rules + match pass | `client/.../lab-03 tests/ChangePassword.test.tsx` | Pending |
| UI-03 | FR-13–17 | `StaffTicketQueue` component | Renders table columns per spec; search input debounces; clicking column header toggles sort indicator | `client/.../lab-03 tests/StaffTicketQueue.test.tsx` | Pending |
| UI-04 | AC-06, FR-18 | `StaffTicketQueue` / owner filter | Selecting "Unassigned" filter shows only tickets with no owner; "Me" shows only caller's tickets | `client/.../lab-03 tests/StaffTicketQueue.test.tsx` | Pending |
| UI-05 | AC-13 | `StaffTicketQueue` pagination | "Showing X to Y of Z" label matches returned data; Next/Previous disabled at boundaries | `client/.../lab-03 tests/StaffTicketQueue.test.tsx` | Pending |
| UI-06 | AC-11, FR-29 | `UserManagement` create form | Duplicate-email server error renders inline under Email field, not as a generic toast only | `client/.../lab-03 tests/UserManagement.test.tsx` | Pending |
| UI-07 | AC-09, FR-30 | `UserManagement` edit panel | Deactivate button is disabled with tooltip when editing the logged-in Admin's own row | `client/.../lab-03 tests/UserManagement.test.tsx` | Pending |
| UI-08 | FR-20 | `StaffTicketDetail` status dropdown | Only legal transition targets (per matrix) are rendered as selectable options for the ticket's current status | `client/.../lab-03 tests/StaffTicketDetail.test.tsx` | Pending |
| UI-09 | BR-04 | `StaffTicketDetail` Comments vs. Notes tabs | Internal Notes panel renders with distinct background/icon vs. Public Comments panel | `client/.../lab-03 tests/StaffTicketDetail.test.tsx` | Pending |
| UI-10 | FR-12 | `RequesterTicketDetail` resolved-indicator button | Button hidden once already indicated or when status is Resolved/Closed/Cancelled | `client/.../lab-03 tests/StaffTicketDetail.test.tsx` (or Requester-specific file) | Pending |

---

## 5. UI Style / Visual Consistency Tests

*(Primarily manual/visual-checklist, some automatable via snapshot testing.)*

| Test ID | Requirement / AC | What It Tests | Expected Result | Method | Final |
|---|---|---|---|---|---|
| STYLE-01 | Zen Green consistency | All new screens use existing design tokens (colors, spacing, typography) | No new/ad-hoc colors or fonts introduced outside the Zen Green token set | Manual visual review + snapshot diff | Pending |
| STYLE-02 | Badge conventions §1.4 | Status/Priority/Role/Account badges use the documented palette consistently across Queue, Detail, and Admin screens | Same badge component reused, no per-screen reimplementation | Manual review | Pending |
| STYLE-03 | Editable vs. read-only styling | Operational Controls (Owner/Priority/Status) visually distinguishable from read-only fields | Editable fields show border + white background; read-only fields show muted background | Manual review / snapshot | Pending |
| STYLE-04 | Comments vs. Notes distinction | Internal Notes are visually distinct even without color perception | Icon + text label present, not color-only signal | Manual review (simulate grayscale) | Pending |

---

## 6. Responsive Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Method | Final |
|---|---|---|---|---|---|
| RESP-01 | ui-spec §4.6 | Ticket Queue at mobile width (<768px) | Renders as card list, no horizontal scroll on page body | Manual + Playwright viewport test | Pending |
| RESP-02 | ui-spec §5.5 | Ticket Detail at tablet width (768–1023px) | Field grid collapses to 2 columns; tabs remain usable | Manual + Playwright viewport test | Pending |
| RESP-03 | ui-spec §6.5 | Admin User Management at mobile width | Table becomes stacked card list; Create/Edit opens full-screen | Manual + Playwright viewport test | Pending |
| RESP-04 | ui-spec §2.4 | Login/Change Password at mobile width | Card is full-width with standard padding; password toggle remains ≥44px tap target | Manual + Playwright viewport test | Pending |
| RESP-05 | ui-spec §7 checklist | All Lab 3 screens at desktop/tablet/mobile | No horizontal overflow, no clipped/overlapping elements at any breakpoint | Manual screenshot review (feeds Part 9 evidence) | Pending |

---

## 7. Security / Authorization Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|
| SEC-01 | AC-03, BR-03 | Direct API call (bypassing UI) with forged `requesterId` | Server ignores client value; ownership resolved from session only | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-02 | AC-04, BR-04 | Direct API call to Internal Notes endpoints as Requester | 403; zero note data in response, verified via body inspection not just status code | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-03 | AC-12, BR-08 | Direct API call with an expired/invalidated session token | 401 on every protected endpoint tested (tickets, staff, admin) | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-04 | FR-08 | Direct API calls to `/staff/*` and `/admin/*` routes as Requester (no UI navigation involved) | 403 on all, regardless of whether the UI would have hidden the corresponding buttons | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-05 | AC-07, BR-13 | Direct API call forcing an illegal status transition, bypassing the UI dropdown's option filtering | 409 — proves backend enforcement independent of UI-side restriction (UI-08) | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-06 | FR-08 | IT Staff (non-Admin) direct API call to `/admin/users*` | 403 on list, create, update, and reset-password endpoints | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-07 | AC-09 | Direct API call: Admin PATCHes own user record with `isActive=false` | 409, bypassing any UI-side disabled-button protection | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-08 | AC-10 | Direct API call: deactivate the last active Administrator via a second Admin account (if seed allows) or via self | 409 in all cases where it would leave zero active Administrators | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-09 | BR-06 | Inspect stored user records after seed/creation | No plaintext password present in DB; only hash | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| SEC-10 | api-spec §1.1 | CSRF token omitted or invalid on a state-changing request | Request rejected (403/401) despite valid session cookie | `server/tests/lab-03/authorization.api.test.ts` | Pending |

---

## 8. Migration / Regression Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|
| MIG-01 | BR-21, spec §7.4 | Run migration against a Lab 2 database snapshot | Every pre-existing Ticket's `requesterId` resolves to a valid new `User` row; row count before = row count after | `server/tests/lab-03/auth.api.test.ts` (or dedicated `migration.test.ts`) | Pending |
| MIG-02 | spec §7.4 | Pre-existing Ticket `itPriority` backfill | `itPriority` equals prior `requestedPriority` for every migrated row | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| MIG-03 | spec §7.5 | Seed script run twice in sequence | Second run does not duplicate users/tickets (idempotent) | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| REG-01 | FR-09, FR-10 | Lab 2 Requester create/view/manage-own-ticket flows, now authenticated | All Lab 2 behaviors function identically under the new auth model | `server/tests/lab-03/authorization.api.test.ts` + `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| REG-02 | FR-10 | Development Requester selector / Change Requester action | Confirmed entirely absent from UI and routes (no dead code path reachable) | `client/.../lab-03 tests/*` (grep/manual) | Pending |
| REG-03 | spec §7.1 | Existing Attachment records post-migration | Attachment-to-Ticket relations remain intact; files/download links unaffected | `server/tests/lab-03/authorization.api.test.ts` | Pending |

---

## 9. End-to-End (E2E) Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|
| E2E-01 | AC-01 | Full login flow, active user, correct credentials | User lands in the authenticated app shell with correct role-based nav visible | `e2e/lab-03/authentication.spec.ts` | Pending |
| E2E-02 | AC-02 | Initial-password login → forced Change Password → successful continuation | Normal app screens are unreachable until password change completes; then app opens normally | `e2e/lab-03/authentication.spec.ts` | Pending |
| E2E-03 | AC-08 | Requester logs in, opens own Ticket, posts Public Comment, marks "Problem Appears Resolved" | Comment appears in thread; status badge unchanged; resolved-indicator note shown | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-04 | AC-06 | IT Staff logs in, searches Queue, claims a Ticket, sets IT Priority, changes status, adds Internal Note | All changes persist and are reflected in Queue and Ticket Detail on reload | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-05 | AC-09, AC-10, AC-11 | Administrator creates a user, attempts duplicate email (fails), edits a user, resets a password, attempts self-deactivation (blocked) | Each step produces the expected UI feedback; final DB state matches expectations | `e2e/lab-03/user-administration.spec.ts` | Pending |
| E2E-06 | FR-03, AC-12 | Logout flow, then attempt to navigate back to a protected route via browser back button / direct URL | Redirected to Login; no protected data flashes on screen | `e2e/lab-03/authentication.spec.ts` | Pending |
| E2E-07 | FR-22, AC-04 | Requester account attempts to navigate directly (via URL) to a Staff Ticket Detail or Internal Notes view | Redirected/forbidden; no note content ever rendered in the DOM | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-08 | ui-spec §7 | Full user journey (login → queue → ticket detail → admin) captured at desktop, tablet, and mobile viewport | No broken layout at any step across all three breakpoints | `e2e/lab-03/staff-ticket-flow.spec.ts` + `e2e/lab-03/user-administration.spec.ts` | Pending |

---

## 10. Test Summary by Type

| Type | Count |
|---|---|
| Unit | 7 |
| API / Integration | 20 |
| UI Component | 10 |
| UI Style | 4 |
| Responsive | 5 |
| Security / Authorization | 10 |
| Migration / Regression | 6 |
| End-to-End | 8 |
| **Total** | **70** |

All AC-01 through AC-14 have at least one mapped test (see §1). This plan will be updated with Pass/Fail status and any additional tests discovered necessary during implementation, but the initial coverage above is fixed before implementation PRs begin, per Test DD requirements.