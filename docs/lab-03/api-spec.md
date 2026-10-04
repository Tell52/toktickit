# API Specification — Sprint 3 (Lab 3)

**Course:** CPE 334 — Introduction to Software Engineering in the Age of AI Agents
**Scope:** Authentication, Requester (regression), IT Staff Queue/Ticket Ops, Administrator User Management

Base URL: `/api`
All request/response bodies are JSON. All timestamps are ISO 8601 UTC.

---

## 1. Authentication & Session Mechanism

- **Mechanism**: HTTP-only, `Secure`, `SameSite=Lax` session cookie (`sid`). Not stored in localStorage/sessionStorage, and never exposed to client-side JavaScript.
- **Password hashing**: bcrypt (or argon2), cost factor sufficient for interactive login (~250ms server-side). Plaintext passwords are never logged or persisted.
- **Session storage**: server-side session store keyed by session ID; session record holds `userId`, `role`, `issuedAt`, `expiresAt`.
- **Expiration**: session expires after 8 hours of issuance or on explicit logout, whichever comes first. Expired sessions are rejected as `401`.
- **CSRF**: since auth uses cookies, all state-changing requests (`POST`/`PATCH`/`DELETE`) require a `X-CSRF-Token` header matching a token issued at login and validated server-side (double-submit pattern).
- **Logout invalidation**: logout deletes the server-side session record immediately; the cookie is cleared. Any reuse of the old session ID after logout returns `401`.
- **Secrets**: session signing secret and DB credentials are read from environment variables only; never committed to source control or exposed in any API response.

### 1.1 Standard Error Shape

All error responses share this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable, safe message"
  }
}
```

`code` is a stable machine-readable string (e.g. `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`). Messages never leak stack traces, SQL, or internal identifiers, and never confirm/deny the existence of another user's resource.

### 1.2 Standard Status Code Usage

| Code | Meaning |
|---|---|
| 200 | Success (read or update) |
| 201 | Resource created |
| 400 | Invalid input (validation failure) |
| 401 | Not authenticated / session invalid or expired |
| 403 | Authenticated but not permitted for this role/ownership |
| 404 | Resource does not exist, or exists but the caller must not be able to tell (used interchangeably with 403 where existence itself is sensitive) |
| 409 | Conflict (duplicate email, invalid status transition, last-Administrator rule, etc.) |
| 500 | Unexpected server error — generic message only |

---

## 2. Authentication Endpoints

### 2.1 `POST /api/auth/login`

**Access:** Public

**Request body:**
```json
{
  "email": "janderson@tiktockit.com",
  "password": "TempPass123!"
}
```

**Success — 200:**
```json
{
  "user": {
    "id": "usr_123",
    "name": "Jennifer Anderson",
    "email": "janderson@tiktockit.com",
    "role": "REQUESTER",
    "mustChangePassword": true
  },
  "csrfToken": "a1b2c3..."
}
```
Sets `sid` cookie (HTTP-only).

**Errors:**
- `400 VALIDATION_ERROR` — missing/malformed email or password
- `401 INVALID_CREDENTIALS` — wrong email, wrong password, unknown email, **or inactive account** (identical generic message for all three cases per BR-07)

---

### 2.2 `POST /api/auth/logout`

**Access:** Authenticated

**Request body:** none

**Success — 200:**
```json
{ "success": true }
```
Clears session cookie and destroys server-side session record.

**Errors:**
- `401 UNAUTHENTICATED` — no valid session present

---

### 2.3 `GET /api/auth/me`

**Access:** Authenticated

**Success — 200:**
```json
{
  "id": "usr_123",
  "name": "Jennifer Anderson",
  "email": "janderson@tiktockit.com",
  "role": "REQUESTER",
  "mustChangePassword": false
}
```

**Errors:**
- `401 UNAUTHENTICATED`

---

### 2.4 `POST /api/auth/change-password`

**Access:** Authenticated (usable both when `mustChangePassword = true` and for voluntary changes)

**Request body:**
```json
{
  "currentPassword": "TempPass123!",
  "newPassword": "N3wSecure!Pass",
  "confirmPassword": "N3wSecure!Pass"
}
```

**Validation rules:** new password ≥ 8 characters, includes upper + lower case, at least one number, at least one special character; `newPassword` must equal `confirmPassword`; `newPassword` must differ from `currentPassword`.

**Success — 200:**
```json
{
  "user": {
    "id": "usr_123",
    "mustChangePassword": false
  }
}
```

**Errors:**
- `400 VALIDATION_ERROR` — password rules not met, or confirmation mismatch
- `401 UNAUTHENTICATED`
- `401 INVALID_CREDENTIALS` — `currentPassword` incorrect

---

## 3. Requester Endpoints (Lab 2 Continuation)

All Requester endpoints resolve ownership from the authenticated session; any `requesterId` field present in a request body is **ignored** by the server (BR-03 / AC-03).

### 3.1 `GET /api/tickets`

**Access:** Requester (returns only own Tickets) · IT Staff/Admin (should use `/api/staff/tickets` instead for full queue access)

**Query params:** `status` (optional), `page` (default 1), `pageSize` (default 10)

**Success — 200:**
```json
{
  "tickets": [
    {
      "id": "tkt_001",
      "ticketNumber": "TKT-2025-000234",
      "summary": "Laptop battery drains quickly",
      "category": "Hardware",
      "requestedPriority": "MEDIUM",
      "status": "IN_PROGRESS",
      "createdAt": "2025-05-12T09:14:00Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "totalCount": 4 }
}
```

**Errors:** `401 UNAUTHENTICATED`

---

### 3.2 `POST /api/tickets`

**Access:** Requester

**Request body:**
```json
{
  "category": "Hardware",
  "relatedSystem": "Corporate Laptop",
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "Battery draining faster than usual, started after last update."
}
```
(`requesterId`, if supplied, is ignored — the authenticated user is always the owner.)

**Success — 201:** returns the created Ticket, `status: "NEW"`, `itPriority` copied from `requestedPriority`, `ownerId: null`.

**Errors:**
- `400 VALIDATION_ERROR` — missing required fields
- `401 UNAUTHENTICATED`

---

### 3.3 `GET /api/tickets/:id`

**Access:** Owning Requester, or IT Staff/Admin

**Success — 200:** full Ticket detail including Public Comments (Internal Notes omitted entirely for Requester role, not just hidden).

**Errors:**
- `401 UNAUTHENTICATED`
- `404 NOT_FOUND` — Ticket does not exist, **or** exists but caller is a Requester who does not own it (identical response in both cases — no existence leakage)

---

### 3.4 `POST /api/tickets/:id/comments`

**Access:** Owning Requester, or IT Staff/Admin

**Request body:**
```json
{ "content": "Thank you for the update." }
```

**Success — 201:**
```json
{
  "id": "cmt_045",
  "ticketId": "tkt_001",
  "authorId": "usr_123",
  "authorName": "Jennifer Anderson",
  "authorRole": "REQUESTER",
  "content": "Thank you for the update.",
  "createdAt": "2025-05-13T11:45:00Z"
}
```

**Errors:**
- `400 VALIDATION_ERROR` — empty or whitespace-only content (BR-16)
- `401 UNAUTHENTICATED`
- `404 NOT_FOUND` — Ticket not owned by caller (Requester) or does not exist

---

### 3.5 `POST /api/tickets/:id/resolved-indicator`

**Access:** Owning Requester only

**Request body:** none

**Success — 200:**
```json
{
  "ticketId": "tkt_001",
  "problemAppearsResolved": true,
  "indicatedAt": "2025-05-13T12:00:00Z"
}
```
Does **not** change `status` (BR-05 / AC-08).

**Errors:**
- `401 UNAUTHENTICATED`
- `404 NOT_FOUND` — not owner, or Ticket does not exist

---

## 4. IT Staff Endpoints

### 4.1 `GET /api/staff/tickets` — Ticket Queue

**Access:** IT Staff, Administrator

**Query params:**

| Param | Type | Notes |
|---|---|---|
| `search` | string | matches ticket number or summary (case-insensitive substring) |
| `status` | enum | filter by exact status |
| `category` | string | filter by category |
| `priority` | enum | filters on **IT Priority** |
| `owner` | `"me"` \| `"unassigned"` \| userId | filter by ownership |
| `sort` | string | one of `createdAt`, `itPriority`, `status`, `-createdAt`, `-itPriority`, `-status` (`-` = descending) |
| `page` | int | default 1 |
| `pageSize` | int | default 10, max 50 |

**Success — 200:**
```json
{
  "tickets": [
    {
      "id": "tkt_001",
      "ticketNumber": "TKT-2025-000234",
      "createdAt": "2025-05-12T09:14:00Z",
      "summary": "Laptop battery drains quickly",
      "category": "Hardware",
      "requestedPriority": "MEDIUM",
      "itPriority": "MEDIUM",
      "status": "IN_PROGRESS",
      "owner": { "id": "usr_050", "name": "Michael Brown" }
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "totalCount": 87 }
}
```
Invalid `sort`/`status`/`priority`/`category` values return `400`; an unrecognized `page`/`pageSize` falls back to defaults rather than erroring.

**Errors:**
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN` — caller is a Requester
- `400 VALIDATION_ERROR` — invalid `sort`/enum value

---

### 4.2 `GET /api/staff/tickets/:id`

**Access:** IT Staff, Administrator

**Success — 200:** full Ticket detail including owner, IT Priority, status, Public Comments, Internal Notes metadata (counts), and Attachments.

**Errors:**
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN` — Requester role
- `404 NOT_FOUND`

---

### 4.3 `PATCH /api/staff/tickets/:id/owner` — Claim / Reassign

**Access:** IT Staff, Administrator

**Request body:**
```json
{ "ownerId": "usr_050" }
```
(`ownerId: null` releases/unassigns the Ticket.)

**Success — 200:**
```json
{ "ticketId": "tkt_001", "owner": { "id": "usr_050", "name": "Michael Brown" } }
```

**Errors:**
- `400 VALIDATION_ERROR` — `ownerId` does not reference an active IT Staff/Administrator user
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`

---

### 4.4 `PATCH /api/staff/tickets/:id/priority`

**Access:** IT Staff, Administrator

**Request body:**
```json
{ "itPriority": "HIGH" }
```

**Success — 200:**
```json
{ "ticketId": "tkt_001", "itPriority": "HIGH" }
```

**Errors:**
- `400 VALIDATION_ERROR` — invalid priority value
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`

---

### 4.5 `PATCH /api/staff/tickets/:id/status`

**Access:** IT Staff, Administrator

**Request body:**
```json
{ "status": "RESOLVED" }
```

**Success — 200:**
```json
{ "ticketId": "tkt_001", "status": "RESOLVED", "updatedAt": "2025-05-13T13:00:00Z" }
```

**Errors:**
- `400 VALIDATION_ERROR` — target status not a valid enum value
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN` — Requester role, or role not permitted for this specific transition
- `404 NOT_FOUND`
- `409 CONFLICT` — transition not permitted from current status (see transition matrix in `ui-spec.md`)

---

### 4.6 `POST /api/staff/tickets/:id/notes` — Internal Notes

**Access:** IT Staff, Administrator

**Request body:**
```json
{ "content": "Escalated to hardware vendor for battery replacement." }
```

**Success — 201:**
```json
{
  "id": "note_012",
  "ticketId": "tkt_001",
  "authorId": "usr_050",
  "authorName": "Michael Brown",
  "content": "Escalated to hardware vendor for battery replacement.",
  "createdAt": "2025-05-13T13:05:00Z"
}
```

**Errors:**
- `400 VALIDATION_ERROR` — empty/whitespace content
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN` — **Requester role receives this with no note content in the response body** (AC-04)
- `404 NOT_FOUND`

---

### 4.7 `GET /api/staff/tickets/:id/notes`

**Access:** IT Staff, Administrator

**Success — 200:**
```json
{
  "notes": [
    {
      "id": "note_012",
      "authorId": "usr_050",
      "authorName": "Michael Brown",
      "content": "Escalated to hardware vendor for battery replacement.",
      "createdAt": "2025-05-13T13:05:00Z"
    }
  ]
}
```

**Errors:**
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN` — Requester role; response body contains **no** `notes` array or note content (AC-04)
- `404 NOT_FOUND`

---

## 5. Administrator Endpoints

### 5.1 `GET /api/admin/users`

**Access:** Administrator

**Query params:** `search` (name or email substring), `role` (optional enum filter)

**Success — 200:**
```json
{
  "users": [
    {
      "id": "usr_010",
      "name": "Jennifer Anderson",
      "email": "janderson@tiktockit.com",
      "role": "IT_STAFF",
      "isActive": true
    }
  ]
}
```
(No pagination per Lab 3 exclusions — full filtered list is returned.)

**Errors:**
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN` — non-Administrator

---

### 5.2 `POST /api/admin/users`

**Access:** Administrator

**Request body:**
```json
{
  "name": "Alex Thompson",
  "email": "alex.thompson@tiktockit.com",
  "role": "IT_STAFF",
  "isActive": true,
  "initialPassword": "Str0ng!Temp"
}
```

**Success — 201:**
```json
{
  "id": "usr_099",
  "name": "Alex Thompson",
  "email": "alex.thompson@tiktockit.com",
  "role": "IT_STAFF",
  "isActive": true,
  "mustChangePassword": true
}
```

**Errors:**
- `400 VALIDATION_ERROR` — missing fields, invalid role, weak `initialPassword`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `409 CONFLICT` — `EMAIL_ALREADY_EXISTS`

---

### 5.3 `PATCH /api/admin/users/:id`

**Access:** Administrator

**Request body** (any subset):
```json
{
  "name": "Alex J. Thompson",
  "email": "alex.j.thompson@tiktockit.com",
  "role": "ADMINISTRATOR",
  "isActive": false
}
```

**Success — 200:** updated user object (same shape as 5.2 response, minus `mustChangePassword` unless also reset).

**Errors:**
- `400 VALIDATION_ERROR` — invalid role/email format
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 CONFLICT` — `EMAIL_ALREADY_EXISTS`
- `409 CONFLICT` — `CANNOT_DEACTIVATE_SELF` (caller's own `id` with `isActive: false`) (BR — self-deactivation)
- `409 CONFLICT` — `LAST_ACTIVE_ADMIN` (would leave zero active Administrators)

---

### 5.4 `POST /api/admin/users/:id/reset-password`

**Access:** Administrator

**Request body:**
```json
{ "newPassword": "Fresh!Start1" }
```

**Success — 200:**
```json
{ "userId": "usr_099", "mustChangePassword": true }
```
Sets `mustChangePassword = true` on the target user; does not affect the Administrator's own session.

**Errors:**
- `400 VALIDATION_ERROR` — password does not meet rules
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`

---

## 6. Authorization Summary (Role × Endpoint)

| Endpoint | Requester | IT Staff | Administrator |
|---|---|---|---|
| `POST /auth/login`, `/logout`, `/me`, `/change-password` | ✅ | ✅ | ✅ |
| `GET/POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/comments` | ✅ (own only) | ✅ (read/comment on any) | ✅ (read/comment on any) |
| `POST /tickets/:id/resolved-indicator` | ✅ (own only) | ❌ | ❌ |
| `GET /staff/tickets`, `GET /staff/tickets/:id` | ❌ | ✅ | ✅ |
| `PATCH /staff/tickets/:id/owner`, `/priority`, `/status` | ❌ | ✅ | ✅ |
| `POST/GET /staff/tickets/:id/notes` | ❌ (403, no content) | ✅ | ✅ |
| `GET/POST/PATCH /admin/users`, `/reset-password` | ❌ | ❌ | ✅ |

All ❌ cells are enforced server-side regardless of UI state, per BR (hiding a button is not authorization).

---

## 7. Safe Error Behavior Checklist

- [ ] Unknown vs. wrong-password vs. inactive login failures are indistinguishable to the client.
- [ ] A Requester requesting another Requester's Ticket receives `404`, not `403` (existence not confirmed).
- [ ] A Requester requesting Internal Notes receives `403` with an empty body — no note count, no content.
- [ ] Duplicate-email conflicts never reveal which existing user holds the email beyond the conflict code.
- [ ] All `500` responses return a generic message; details are server-logged only, never returned to the client.