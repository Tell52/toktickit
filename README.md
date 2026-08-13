# TokTickIT 

## Project Setup Instructions

### 1. Database & Server (Backend)
1. Open a terminal and navigate to the `server` folder: `cd server`
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your PostgreSQL database URL.
4. Run Prisma migration: `npx prisma migrate dev`
5. Start the backend server: `npm run dev`

### 2. Client (Frontend)
1. Open a new terminal and navigate to the `client` folder: `cd client`
2. Install dependencies: `npm install`
3. Start the Vite development server: `npm run dev`