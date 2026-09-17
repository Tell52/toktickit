# UI Specification — Sprint 3 (Lab 3)

**Course:** CPE 334 — Introduction to Software Engineering in the Age of AI Agents
**Scope:** Login/Change Password, Application Shell, Requester regression screens, IT Staff Ticket Queue, IT Staff Ticket Detail, Administrator User Management

Design language: **Zen Green** (unchanged from Lab 2 — tokens, cards, badges, buttons, validation placement, and accessibility rules carry forward as-is).

---

## 1. Global Conventions

### 1.1 Status Transition Matrix

Applies to `Ticket.status`. Enforced server-side (§4.5 of `api-spec.md`) as well as reflected in the UI's status dropdown (only legal targets are shown/enabled).

| From \ To | New | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
|---|---|---|---|---|---|---|---|---|
| **New** | — | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Open** | ❌ | — | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **In Progress** | ❌ | ❌ | — | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Waiting for Requester** | ❌ | ❌ | ✅ | — | ✅ | ❌ | ❌ | ✅ |
| **Resolved** | ❌ | ❌ | ❌ | ❌ | — | ✅ | ✅ | ❌ |
| **Closed** | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ | ❌ |
| **Reopened** | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | — | ✅ |
| **Cancelled** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |

- Only IT Staff / Administrator may perform any transition (BR-14).
- Requesters never see a status control — only the read-only status badge plus the separate "Problem Appears Resolved" action.
- "Cancelled" and "Closed" are terminal except for the explicit Reopened path.

### 1.2 Role-Specific Navigation (Application Shell)

| Nav Item | Requester | IT Staff | Administrator |
|---|---|---|---|
| My Tickets / My Queue | ✅ (own tickets) | ✅ (shared queue) | ✅ (shared queue) |
| Create Ticket | ✅ | ✅ | ✅ |
| Admin | ❌ | ❌ | ✅ |
| Profile / Change Password | ✅ | ✅ | ✅ |
| Logout | ✅ | ✅ | ✅ |

The shell always shows the current user's name and a role badge (e.g. `IT Staff`, `Administrator`) in the top-right corner, replacing the Lab 2 Development Requester display entirely. No unauthorized destination is ever rendered, linked, or reachable via direct navigation (backend still enforces this independently — see `api-spec.md` §6).

### 1.3 Standard Feedback States (all screens)

Every screen that loads or mutates data must visibly support:

| State | Trigger | Example presentation |
|---|---|---|
| Loading | initial fetch / query change | skeleton rows or spinner in content area |
| Busy | form submit in flight | disabled submit button + inline spinner |
| Success | mutation completed | green toast/inline confirmation |
| Validation | client/server rejects input | red inline message under the specific field |
| Empty | no data exists yet | friendly empty-state illustration/text + primary action |
| No results | filters/search return zero rows | "No tickets match your filters" + clear-filters action |
| Forbidden | 403 from backend | "You don't have permission to view this" panel, no partial data shown |
| Not found | 404 from backend | "This ticket could not be found" panel |
| Safe failure | 500 / network error | generic "Something went wrong, please try again" banner, no stack trace |

### 1.4 Badge Conventions (reused from Lab 2, extended)

- **Status**: New (gray), Open (blue), In Progress (amber), Waiting for Requester (purple), Resolved (green), Closed (dark gray), Reopened (orange), Cancelled (red-gray)
- **Priority (Requested & IT)**: Low (green), Medium (amber), High (red) — identical palette for both, distinguished only by column label
- **Role**: Requester (neutral), IT Staff (blue outline), Administrator (dark green outline)
- **Account Status**: Active (green), Inactive (red)

---

## 2. Screen: Login & Change Password

### 2.1 Modes
- **Login** (default)
- **Change Password** (forced when `mustChangePassword = true`; not otherwise reachable except voluntarily from Profile)

### 2.2 Login — Fields & Controls
| Field | Type | Validation |
|---|---|---|
| Email address | text input | required, valid email format |
| Password | password input (show/hide toggle) | required, non-empty |

- Primary action: **Sign In** button — disabled while busy, shows spinner label "Signing in…"
- Secondary link: "Forgot your password?" — **visually present but non-functional / disabled** in Lab 3 (password-reset email is explicitly excluded); clicking shows a tooltip/notice that this feature isn't available yet, rather than silently doing nothing.
- Failure feedback: single inline banner above the form — *"Invalid email or password."* — identical wording for unknown email, wrong password, and inactive account (BR-07).

### 2.3 Change Password — Fields & Controls
| Field | Type | Validation |
|---|---|---|
| Current (temporary) password | password input | required |
| New password | password input | ≥8 chars, upper+lower, number, special char |
| Confirm new password | password input | must match New password |

- Live checklist under the New Password field, each rule shown with a check/cross icon as the user types:
  - ✓ Be at least 8 characters
  - ✓ Include upper and lower case letters
  - ✓ Include a number and a special character
- Primary action: **Continue** — disabled until all rules pass and confirmation matches.
- On success: redirect directly into the authenticated application shell (no separate confirmation screen).
- On failure (wrong current password): inline error under "Current (temporary) password" field only.

### 2.4 Responsive Behavior
- **Desktop/tablet**: centered card, max-width ~420px, vertically centered in viewport.
- **Mobile**: full-width card with standard screen padding; show/hide password toggles remain tap-accessible (≥44px touch target).

---

## 3. Screen: Requester Ticket Detail (Regression + New)

### 3.1 Modes
- **View** — default, most fields read-only
- **Comment composing** — inline, no separate mode/page

### 3.2 Layout (unchanged Lab 2 groupings, plus additions)
- Ticket header: Ticket No., Category, Related System, Requested Priority (read-only badge), Current Status (read-only badge)
- Summary / Description — read-only, as submitted
- **New**: "Problem Appears Resolved" button — visible only when status is `Open`, `In Progress`, or `Waiting for Requester`; hidden once already indicated or once Ticket is Resolved/Closed/Cancelled.
  - Clicking shows a confirmation micro-dialog: *"This lets IT Staff know the issue seems fixed. It won't close the ticket."*
  - After confirmation: button replaced with a small "You indicated this problem appears resolved on [date]" note.
- **New**: Public Comments tab/section — chronological thread (oldest first), each entry shows author name, role badge, timestamp, content. Composer at top or bottom with **Post Comment** button (disabled while empty or busy).
- Attachments — unchanged from Lab 2 (view/download only in this screen).
- Internal Notes: **not rendered at all** for this role (not just hidden via CSS — the tab/section does not exist in the Requester's DOM).

### 3.3 Responsive Behavior
- Desktop: two-column (ticket fields left, comments thread right) or single column with clear section breaks — student to finalize; must avoid horizontal scroll.
- Tablet/mobile: single column, comments thread below ticket fields, composer sticky or clearly anchored above thread.

---

## 4. Screen: IT Staff Ticket Queue

### 4.1 Modes
- **List/browse** (only mode — detail navigation is a separate screen)

### 4.2 Controls
| Control | Behavior |
|---|---|
| Search box | placeholder "Search by ticket number or summary…"; debounced (~300ms); searches both fields |
| Filters button/panel | opens filter controls: Status (multi or single — student to decide and justify), Category, IT Priority, Owner (Me / Unassigned / specific staff) |
| Column headers (sortable) | Ticket No., Created Date, IT Priority, Status — clicking toggles asc/desc, shown via arrow icon |
| Pagination controls | Previous / page numbers / Next, plus "Showing X to Y of Z tickets" label |

### 4.3 Columns (Desktop Table)
Ticket No. · Created Date · Summary · Category · Req. Priority · IT Priority · Status · Owner

Justification for this set: these are the fields IT Staff need to triage and prioritize work at a glance without opening each ticket; Related System and Description are deferred to Ticket Detail to avoid an unreadable mega-grid.

### 4.4 Row Interaction
- Entire row is clickable → navigates to IT Staff Ticket Detail.
- Owner column shows avatar-style initials + name, or "Unassigned" in muted/italic style when `ownerId` is null.

### 4.5 States
- **Loading**: skeleton rows (5–8 placeholder rows)
- **Empty** (zero tickets exist in system): illustration + "No tickets yet"
- **No results** (filters/search active, zero matches): "No tickets match your search/filters" + "Clear filters" button
- **Forbidden**: Requester attempting direct navigation to this route is redirected to their own ticket list, not shown a forbidden panel (route-level guard)
- **Safe failure**: generic error banner with "Retry" button

### 4.6 Responsive Behavior
- **Desktop (≥1024px)**: full table as designed above.
- **Tablet (768–1023px)**: table collapses two lower-priority columns (Related fields omitted already; drop "Category" and "Req. Priority" from the visible table, still viewable in Ticket Detail) OR switches to a condensed card list — student to pick one approach and apply consistently.
- **Mobile (<768px)**: card list — one card per ticket showing Ticket No. + Summary (title), Status + IT Priority badges, Owner, Created Date; tapping card opens Ticket Detail. Search and Filters remain accessible via a top bar; Filters open as a bottom sheet or full-screen panel rather than a dropdown.

---

## 5. Screen: IT Staff Ticket Detail

### 5.1 Modes
- **View** — default
- **Edit ownership / priority / status** — inline editable controls, not a separate page mode
- **Compose comment/note** — inline

### 5.2 Layout Groups
1. **Header / Identity** (read-only): Ticket No., Category, Related System
2. **Requester Info** (read-only): Requester name, Requested Priority badge, Current Status badge
3. **Operational Controls** (editable, IT Staff/Admin only):
   - Ticket Owner — dropdown of active IT Staff/Administrator users, plus "Unassigned"; changing it calls `PATCH /staff/tickets/:id/owner` immediately with inline save-state feedback (not a separate Save button)
   - IT Priority — dropdown (Low/Medium/High); same immediate-save pattern
   - Current Status — dropdown restricted to legal transitions per §1.1 matrix for the ticket's current status; illegal targets are not shown as options at all (defense in depth alongside backend rejection)
4. **Summary / Description** — read-only, as submitted by Requester
5. **Resolution Summary** — editable textarea, visible to Requester once populated (optional field IT Staff can fill in when resolving)
6. **Tabbed section**: Public Comments · Internal Notes · Attachments
   - **Public Comments tab**: identical thread/composer pattern as Requester screen (§3.2), but composer available to IT Staff/Admin too
   - **Internal Notes tab**: same thread/composer pattern, but **visually distinct** — different background tint (e.g., muted yellow/amber panel vs. white/green for Public Comments) and a persistent label/icon (e.g., a lock icon + "Internal — not visible to Requester") to prevent accidental public posting
   - **Attachments tab**: unchanged from Lab 2, read-only list with download links

### 5.3 Editable vs. Read-Only Styling
- Editable fields (Owner, IT Priority, Status, Resolution Summary): white background, visible border, subtle "editable" affordance (dropdown chevron / cursor)
- Read-only fields (everything else): muted/gray background, no border, no hover state — matches Lab 2 convention exactly

### 5.4 States
- Same standard set as §1.3, applied per-tab where relevant (e.g., "No public comments yet" empty state inside that tab independently of Internal Notes having entries)
- **Forbidden**: Requester attempting to load this route directly is redirected to the Requester Ticket Detail equivalent (or shown a forbidden panel if no equivalent Ticket ID mapping exists) — never partial data
- Status dropdown shows a brief inline validation message if a transition is somehow rejected server-side (race condition / stale UI) — does not silently fail

### 5.5 Responsive Behavior
- **Desktop**: fields in a 3-column grid (Category / Related System / — or similar grouping as in the mockup), tabs below as full-width panel
- **Tablet**: fields collapse to 2-column grid
- **Mobile**: single column throughout; tabs become a horizontally scrollable tab bar or a dropdown selector if space is constrained; Owner/Priority/Status dropdowns are full-width, ≥44px tap height

---

## 6. Screen: Administrator User Management

### 6.1 Modes
- **List/browse** (default)
- **Create** — side panel or modal
- **Edit** — same panel/modal, pre-filled

### 6.2 List View
| Control | Behavior |
|---|---|
| Search box | "Search users…" — matches name or email, debounced |
| Filters | single-select Role filter (All / Requester / IT Staff / Administrator) |
| **+ Create User** button | opens Create panel |
| Table columns | Name, Role (badge), Status (badge: Active/Inactive), Edit (icon/button) |

No pagination, no multi-column sort, no multiple simultaneous filters — per Lab 3 exclusions, even though the reference mockup visually includes pagination controls; the full filtered/searched result set is rendered directly.

### 6.3 Create / Edit Panel
| Field | Create | Edit | Validation |
|---|---|---|---|
| Full Name | ✅ required | ✅ editable | non-empty |
| Email Address | ✅ required | ✅ editable | valid format, unique (server-checked on submit) |
| Role | ✅ required, single-select dropdown (Requester / IT Staff / Administrator) | ✅ editable | required |
| Active | ✅ toggle, default On | ✅ toggle | — |
| Initial Password | ✅ required at creation | N/A here — use separate "Set New Password" action | meets password rules (§2.3) |

- **Note on the mockup's "Send password reset email" checkbox**: this control is **not implemented** in Lab 3 — email delivery is explicitly excluded. The Create panel instead requires the Administrator to set/view the initial password directly (e.g., a generated or manually entered value shown once), which the new user must change at first login.
- **Save User** button — creates or updates; shows inline validation for duplicate email (`409 EMAIL_ALREADY_EXISTS` → "This email is already in use.")
- **Set New Password** action (Edit mode only, separate button/section): sets `mustChangePassword = true` for that user; confirmation toast "Password reset — user must set a new password at next login."
- **Deactivate User** / **Activate User** button (Edit mode only, toggles based on current state):
  - If target is the Administrator's own account → button disabled with tooltip "You cannot deactivate your own account."
  - If target is the last active Administrator → button disabled with tooltip "At least one active Administrator is required."
  - Otherwise → confirmation dialog before applying.
- **Cancel** — discards changes, closes panel without saving.

### 6.4 States
- Standard set from §1.3
- **Forbidden**: non-Administrator navigating here directly is redirected away (route guard), consistent with backend `403` on the underlying API
- **Conflict** (self-deactivation / last-admin attempts): inline disabled-state + tooltip as above, rather than a post-submit error — prevented proactively in the UI in addition to backend enforcement

### 6.5 Responsive Behavior
- **Desktop**: two-pane layout — table on the left, Create/Edit panel slides in on the right (as in the reference mockup)
- **Tablet**: table full-width; Create/Edit opens as an overlay modal instead of a side panel
- **Mobile**: table becomes a stacked card list (Name + Role/Status badges + Edit button per card); Create/Edit opens as a full-screen modal/sheet with standard form stacking

---

## 7. Cross-Screen Responsive & Accessibility Checklist

*(Same baseline as Lab 2, reconfirmed for all Lab 3 screens.)*

- [ ] No horizontal scroll on the page body at any breakpoint (desktop / tablet / mobile) — wide tables scroll within their own container only
- [ ] All interactive controls have visible focus states (keyboard navigable)
- [ ] Color is never the only signal — status/priority/role badges include text labels, not color alone
- [ ] Form validation messages are associated with their field (not just a top-of-form summary)
- [ ] Touch targets ≥44px on mobile for buttons, toggles, and dropdown triggers
- [ ] Public Comments vs. Internal Notes remain visually distinguishable even for colorblind users (icon + label, not color alone)
- [ ] Loading/empty/no-results/forbidden/failure states are implemented for every data-driven screen listed above, not just the "happy path"
- [ ] Screenshots captured at desktop, tablet, and mobile widths for every screen in this document, stored under `artifacts/lab-03/screenshots/`