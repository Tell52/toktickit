# TokTickIT — IT Support Ticketing System

TokTickIT is a full-stack IT service desk and support ticketing web application developed as part of **CPE 334 (Software Engineering)**. The system provides role-based ticketing workflows connecting **Requesters**, **IT Staff**, and **Administrators** to report, track, collaborate on, and resolve technical issues efficiently.

---

## Evolution & Sprint Changelog (Lab 1 – Lab 3)

The project has evolved iteratively through three major development sprints:

### 🔹 Lab 1: Project Foundation & Core Architecture
* **Repository Architecture:** Configured monorepo layout separating `client/` (frontend) and `server/` (backend).
* **Database & ORM Setup:** Integrated PostgreSQL database managed via Prisma ORM.
* **Health Check API:** Implemented baseline health verification endpoint (`GET /api/health`).
* **Category Seeding & UI Display:** Seeded default ticket categories (*Account and Access*, *Hardware*, *Software*, *Network*) and displayed them on the frontend.
* **Baseline Testing:** Setup Supertest for backend API testing and Vitest for frontend component testing.

### 🔹 Lab 2: Requester Portal & Ticket Lifecycle Initial Phase
* **Development Requester Identity:** Implemented mock requester switcher to simulate multi-user ownership before real auth.
* **Ticket Submission:** Created a validated ticket creation form (Summary, Description, Category, Related System, Requested Priority).
* **Ticket Number Generation:** Implemented automated generation of unique official ticket numbers (e.g., `TCK-YYYYMMDD-XXXX`).
* **"My Tickets" Portal:** Added paginated, filterable (by status/category), and sortable ticket list for requesters.
* **Attachment Lifecycle:** Added secure attachment upload (JPG, PNG, WEBP, PDF up to 5 MB, max 5 files per ticket), download/preview, and soft-removal with a mandatory reason.
* **Zen Green Theme:** Designed a clean, accessible UI adhering to the Zen Green design language (#006B3C) with responsive layouts for Desktop, Tablet, and Mobile.

### 🔹 Lab 3: Authentication, RBAC, IT Staff Workflow, Admin Management & E2E Testing
* **Real Authentication & Session Management:**
  * Replaced the temporary Development Requester selector with secure email/password authentication using `bcrypt` and `express-session`.
  * Mandatory first-login password change flow (`mustChangePassword`) before accessing system features.
  * Role-Based Access Control (RBAC) with three distinct roles: `REQUESTER`, `IT_STAFF`, and `ADMINISTRATOR`.
  * Strict server-side authorization enforcement on all API routes.
* **IT Staff Ticket Queue & Lifecycle Operations:**
  * Shared IT ticket queue with multi-criteria search (ticket number, summary), filters (status, category, priority, assignment), and sorting.
  * Ticket claiming and reassignment among active IT staff and administrators.
  * Formal status progression (`New` → `In Progress` → `Resolved` → `Closed`, etc.) and IT Priority adjustment.
* **Communication & Collaboration:**
  * **Public Comments:** Two-way communication thread visible to Requesters, IT Staff, and Admins.
  * **Internal Notes:** Private notes restricted exclusively to IT Staff and Administrators.
  * **Resolution Indicator:** Requesters can mark "Problem Appears Resolved" without prematurely altering formal ticket status.
* **Administrator User Management:**
  * Dedicated user administration dashboard to list, search, and filter users by role.
  * Create new user accounts, edit profiles, toggle active/inactive status, and set/reset temporary initial passwords.
* **End-to-End (E2E) Test Suite:**
  * Integrated Playwright E2E testing covering authentication flows, IT staff lifecycle workflows, and user administration across desktop, tablet, and mobile viewports.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Bootstrap 5, Zen Green Design System |
| **Backend** | Node.js, Express, TypeScript, express-session, bcrypt, Multer |
| **Database & ORM** | PostgreSQL, Prisma ORM |
| **Testing** | Vitest (Client/Server), Supertest (API), Playwright (End-to-End) |

---

## Prerequisites

Before setting up TokTickIT, make sure you have installed:
* [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
* [PostgreSQL](https://www.postgresql.org/) (v14+ running locally or in Docker)
* `npm` package manager

---

## Installation & Setup

### 1. Clone Repository & Setup Environment
```bash
git clone https://github.com/Tell52/toktickit.git
cd toktickit
```

Create a `.env` file in the `server/` directory (e.g. `server/.env`):
```env
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public"
PORT=3000
```
> Adjust `DATABASE_URL` with your local PostgreSQL user, password, host, port, and database name.

---

### 2. Backend (Server) Setup
Open a terminal and run:
```bash
cd server
npm install

# Run database migrations to apply the schema
npx prisma migrate dev

# Seed initial categories, systems, users, and tickets
npm run prisma:seed

# Start the development server
npm run dev
```
The backend API server will start on **`http://localhost:3000`**.

---

### 3. Frontend (Client) Setup
Open a second terminal and run:
```bash
cd client
npm install

# Start the Vite development server
npm run dev
```
The frontend UI will be accessible at **`http://localhost:5173`**.

---

## Default Seed User Accounts

After running `npm run prisma:seed`, the following accounts are pre-configured.  
All seed accounts have the default temporary password: **`Str0ng!Temp`**  
*(On first login, users will be prompted to change their password).*

| Role | Name | Email | Initial Password |
|---|---|---|---|
| **Administrator** | System Admin | `admin@example.com` | `Str0ng!Temp` |
| **IT Staff** | Michael Brown | `michael@example.com` | `Str0ng!Temp` |
| **IT Staff** | Sarah Johnson | `sarah@example.com` | `Str0ng!Temp` |
| **IT Staff** | David Lee | `david@example.com` | `Str0ng!Temp` |
| **Requester** | Jennifer Anderson | `jennifer@example.com` | `Str0ng!Temp` |
| **Requester** | Emily Davis | `emily@example.com` | `Str0ng!Temp` |
| **Requester** | Kevin Patel | `kevin@example.com` | `Str0ng!Temp` |
| **Requester** | Amanda Clark | `amanda@example.com` | `Str0ng!Temp` |

---

## Running Tests

### Backend Unit & Integration Tests (Vitest + Supertest)
```bash
cd server
npm run test
```

### Frontend UI Component Tests (Vitest + Testing Library)
```bash
cd client
npm run test
```

### End-to-End (E2E) Tests (Playwright)
Ensure both the server (`localhost:3000`) and client (`localhost:5173`) are running, then in the project root:
```bash
# Run all E2E tests across Chromium, Firefox, and WebKit
npx playwright test

# View interactive HTML test report
npx playwright show-report
```

---

## Project Structure

```text
toktickit/
├── client/                     # Frontend application (React + Vite + TS)
│   ├── src/
│   │   ├── components/         # Login, ChangePassword, TicketDetail, Queues, etc.
│   │   ├── context/            # AuthContext and state providers
│   │   ├── App.tsx             # Route management & top navigation
│   │   └── api.ts              # Centralized API client
│   └── tests/                  # Client component tests
├── server/                     # Backend API server (Express + Prisma + TS)
│   ├── prisma/
│   │   ├── schema.prisma       # Database models & relationships
│   │   └── seed.ts             # Seed data (Users, Categories, Tickets)
│   ├── src/
│   │   ├── routes/             # auth, tickets, users, categories, attachments
│   │   ├── middleware/         # authMiddleware, role authorization
│   │   └── index.ts            # Server entrypoint
│   └── tests/                  # Backend unit & integration tests
├── e2e/                        # End-to-End test suites (Playwright)
│   ├── lab-02/                 # Lab 2 regression tests
│   └── lab-03/                 # Auth, Staff flow, and Admin E2E tests
├── docs/                       # Project specifications & lab documentation
│   ├── lab-01/
│   ├── lab-02/
│   └── lab-03/
└── playwright.config.ts        # Playwright configuration
```