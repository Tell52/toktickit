import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  // TODO(Issue 2): replace this stub with the required 200 response.
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list
// Add:  GET /api/categories
//   -> read categories from PostgreSQL via getPrisma().category.findMany(...)
//   -> return each { id, name } in a predictable (id) order
//   -> on failure, respond 500 with a safe message (no internal details)
// TODO(Issue 4): implement the route here.
// ---------------------------------------------------------------------------
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

app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requester.findMany({
      where: { isActive: true },
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
      orderBy: { name: "asc" }, // เรียงตามตัวอักษร
    });
    res.status(200).json(systems);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tickets", async (req: Request, res: Response) => {
  const { requesterId, summary, description, categoryId, relatedSystemId, requestedPriority } = req.body;

  // ตรวจสอบ Validation เบื้องต้น (400 Bad Request)
  if (!requesterId || !summary || !description || !categoryId || !relatedSystemId || !requestedPriority) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // จำลองการสร้าง Ticket Number เช่น TKT-2026-0001
    const ticketCount = await getPrisma().ticket.count();
    const generatedTicketNumber = `TKT-2026-${String(ticketCount + 1).padStart(4, "0")}`;

    const newTicket = await getPrisma().ticket.create({
      data: {
        ticketNumber: generatedTicketNumber,
        summary,
        description,
        requestedPriority,
        currentStatus: "New",
        requesterId,
        categoryId,
        relatedSystemId,
      },
    });

    // คืนค่าสถานะ 201 Created
    res.status(201).json(newTicket);
  } catch (error) {
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

export default app;
