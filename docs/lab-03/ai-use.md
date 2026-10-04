# Lab 3 — AI Use and Reflection

**LLM/agent used:** Antigravity / Gemini 3.8 Flash

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Design Prisma schema migration for Lab 3 to transition from fake requesters to a real User model with Role enum (REQUESTER, IT_STAFF, ADMIN), password hashes, and relations for Public Comments and Internal Notes. | Applied migration `init_lab3`, updated `schema.prisma`, and created `seed.ts` with bcrypt hashed passwords for default test accounts. |
| 2 | Implement JWT authentication foundation (`/api/auth/login`, `/logout`, `/me`, `/change-password`) and role-based middleware (`authenticateToken`, `requireRole`). | Added authentication routes in `auth.routes.ts`, middleware in `middleware/auth.ts`, and verified token issuance and role validation with Supertest API tests. |
| 3 | Fix TypeScript compiler error: "Could not find a declaration file for module 'bcrypt'" in server auth routes. | Installed `@types/bcrypt` in `server/package.json` and adjusted the import syntax so `tsc` compiled cleanly without type errors. |
| 4 | Build React `AuthContext`, `Login.tsx`, and `ChangePassword.tsx` enforcing mandatory first-login password change before accessing protected views. | Integrated `AuthProvider` into `main.tsx`, created the login and password change modals, and verified redirection logic with Vitest component tests. |
| 5 | Refactor Lab 2 `RequesterTicketDetail.tsx` and `CreateTicket.tsx` to use authenticated user identity instead of the removed development requester selector. | Updated ticket creation and viewing logic to use the authenticated session from `useAuth()`, ensuring full regression compatibility with Lab 2 tests. |
| 6 | Create IT Staff Ticket Queue API (`/api/staff/queue`) with filtering (status, priority), sorting, and pagination, plus frontend `StaffTicketQueue.tsx`. | Built queue query logic in Prisma, created the responsive queue table with status badges and quick-claim actions matching the Zen Green theme. |
| 7 | Implement ticket status transition state machine, claim/reassign logic, Public Comments, and role-restricted Internal Notes in `StaffTicketDetail.tsx`. | Enforced server-side status transition matrix, restricted Internal Notes access to IT Staff/Admin (403 for Requesters), and added separate comment/note timeline tabs. |
| 8 | Build Administrator User Management API (`/api/admin/users`) and `UserManagement.tsx` with user creation, role editing, account deactivation, and self-deactivation guard. | Created user management table with role filter and modals, adding backend logic to prevent an administrator from deactivating their own account. |
| 9 | Setup Playwright E2E tests (`authentication.spec.ts`, `staff-ticket-flow.spec.ts`, `user-administration.spec.ts`) with database helper for clean test runs. | Implemented `e2e/lab-03/db-helper.ts` to reset and seed the database before test suites, ensuring isolated and reproducible end-to-end runs. |
| 10 | Fix Playwright strict mode violation where `getByRole('button', { name: 'Claim' })` resolved to multiple elements in the queue table. | Scoped the locators to specific table rows using `.filter({ hasText: ticketSummary })` to ensure deterministic single-element interaction. |

## Reflection
Two or three sentences: what made your prompts better, and one place you had to
correct or reject what the agent produced.

Ans :
Structuring prompts around specific issues and providing exact test error logs—such as Playwright strict-mode locator collisions and TypeScript declaration issues—significantly improved the precision and relevance of the AI's solutions. I had to reject the agent's initial suggestion to return Internal Notes in the general ticket detail API and rely solely on UI-level hiding for Requesters; instead, I steered the agent to enforce server-side role validation in the route handler so Requesters receive a 403 Forbidden and internal IT discussions are never leaked over the network.
