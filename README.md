# TokTickIT 

## Project Setup Instructions

## Tech Stack
* **Frontend:** React + TypeScript + Vite + Bootstrap
* **Backend:** Node.js + Express + TypeScript
* **Database:** PostgreSQL + Prisma ORM
* **Testing:** Vitest , Supertest
## Prerequisites
* Node.js
* PostgreSQL

## Installation & Setup

### 1. Database Configuration
1. Ensure your PostgreSQL instance is running.
2. Navigate to the `server/` directory.
3. Copy `.env.example` to `.env` and update the `DATABASE_URL` with your local database credentials.

### 2. Backend (Server) Setup
Open a terminal and run the following commands:
cd server
npm install

# Run database migrations to create the schema
npx prisma migrate dev --name init

# Seed the initial categories (Account and Access, Hardware, Software, Network)
npm run prisma:seed

# Start the API server
npm run dev
```
The API will run on `http://localhost:3000`.

### 3. Frontend (Client) Setup
Open a second terminal window and run:
```bash
cd client
npm install

# Start the Vite development server
npm run dev
```
The client UI will run on `http://localhost:5173`.

## Running Tests

**Backend API Tests (Supertest):**
```bash
cd server
npm run test
```

**Frontend UI Tests (Vitest):**
```bash
cd client
npm run test
```