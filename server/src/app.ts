import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";

import session from 'express-session';
import authRoutes from './routes/auth.routes';
import staffRoutes from './routes/staff.routes';
import adminRoutes from './routes/admin.routes';
import actionsRoutes, { actionsParseError } from './routes/actions.routes';
import workflowRoutes, { workflowParseError } from './routes/workflow.routes';
import ticketsRoutes from './routes/tickets.routes';
import { requireCurrentBusinessUser } from './services/action-access.js';
import { ApiError, sendApiError } from './services/api-error.js';
import dashboardRoutes from './routes/dashboard.routes';
import { requireAuth, requireRole } from "./middleware/auth";

import { Role } from "@prisma/client";

void getPrisma;

export const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// Each business router revalidates current account state before roles/resources.
app.use('/api', actionsRoutes);
app.use('/api', workflowRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', ticketsRoutes);

app.use('/api/auth', authRoutes);

// Staff and Admin routes protection (RBAC)
// Staff router revalidates the current database role before its role guard.
app.use('/api/staff', requireAuth, staffRoutes);

app.use('/api/admin', requireAuth, adminRoutes);

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/requesters", requireCurrentBusinessUser, requireRole(['IT_STAFF', 'ADMINISTRATOR']), async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().user.findMany({
      where: {
        role: Role.REQUESTER,
        isActive: true,
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(requesters);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const systems = await getPrisma().relatedSystem.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(systems);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use(actionsParseError);
app.use(workflowParseError);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const malformed = error instanceof URIError || (error && typeof error === 'object' && 'type' in error && ['entity.parse.failed', 'entity.too.large'].includes(String(error.type)));
  return sendApiError(res, malformed ? new ApiError(400, 'VALIDATION_ERROR', 'Use a valid request within size limits.') : error);
});

export default app;
