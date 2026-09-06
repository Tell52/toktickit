# Lab 2 Test Plan and Results

## 1. Test Strategy
The testing strategy utilizes Vitest and React Testing Library for frontend component testing (UI), Supertest for backend API testing, and automated E2E tests for full-flow validation across responsive viewports[cite: 8].

## 2. Planned Tests

| Test ID | Type | AC Tested | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Create valid ticket | 201; one saved Ticket; number returned | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-02 | API | AC-03 | Request ticket owned by another Requester | 403/404; ownership rejection | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-03 | API | AC-04 | Upload file exceeding 5MB | 400; validation error returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| UI-01 | UI | AC-02 | Access My Tickets without active Requester | Renders Requester Selection screen | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-02 | UI | AC-01 | Submit ticket with missing required fields | Shows field-level validation messages | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-03 | UI | AC-05 | Soft-remove attachment interaction | Displays confirmation and reason input | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| E2E-01 | E2E | AC-01, AC-05 | Complete responsive submission flow | Confirmation shows official number | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |

## 3. Acceptance-Criterion Traceability

| Acceptance Criterion | Covered By Test IDs |
|---|---|
| **AC-01** (Ticket creation & number display) | API-01, UI-02, E2E-01 |
| **AC-02** (Requester selection redirection) | UI-01 |
| **AC-03** (Strict cross-requester data protection) | API-02 |
| **AC-04** (File size and type validation bounds) | API-03 |
| **AC-05** (Soft-removal behavior and metadata) | UI-03, E2E-01 |

## 4. Responsive and Visual Checklist
*   [ ] Primary green (#006B3C) and secondary green (#0B7A46) applied accurately[cite: 8].
*   [ ] Required fields display a red asterisk and validation below the field[cite: 8].
*   [ ] Submit button shows disabled busy state upon submission[cite: 8].
*   [ ] Desktop layout (≥ 992 px) displays multi-column grids correctly[cite: 8].
*   [ ] Mobile layout (< 768 px) stacks fields vertically with no horizontal scrolling[cite: 8].

## 5. Test Commands
*   **API Tests:** `npm run test` (in `server/` directory)[cite: 8].
*   **UI Tests:** `npm run test` (in `client/` directory)[cite: 8].
*   **E2E Tests:** `npm run e2e` (in root directory)[cite: 8].