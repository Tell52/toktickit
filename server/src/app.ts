import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());
app.use(express.json());

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
      orderBy: { name: "asc" },
    });
    res.status(200).json(systems);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tickets", async (req: Request, res: Response) => {
  const { requesterId, summary, description, categoryId, relatedSystemId, requestedPriority } = req.body;

  // (400 Bad Request)
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

app.get("/api/tickets", async (req: Request, res: Response) => {
  try {
    // 1. รับค่าจาก Query Parameters
    const requesterId = Number(req.query.requesterId);
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search as string;
    const status = req.query.status as string;

    // 2. ตรวจสอบสิทธิ์ (Ownership Check)
    if (!requesterId) {
      return res.status(403).json({ error: "Requester ID is required to view tickets" });
    }

    // 3. สร้างเงื่อนไขการค้นหา (Where clause)
    const whereClause: any = {
      requesterId: requesterId, // บังคับดูได้แค่ของตัวเอง
    };

    if (search) {
      whereClause.OR = [
        { ticketNumber: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } }
      ];
    }
    if (status) {
      whereClause.currentStatus = status;
    }

    // 4. ดึงข้อมูลจากฐานข้อมูลพร้อม Pagination
    const skip = (page - 1) * limit;
    const [tickets, totalCount] = await Promise.all([
      getPrisma().ticket.findMany({
        where: whereClause,
        include: { category: true, relatedSystem: true }, // ดึงชื่อหมวดหมู่มาด้วย
        orderBy: { createdAt: "desc" }, // เรียงตั๋วใหม่ล่าสุดขึ้นก่อน
        skip,
        take: limit,
      }),
      getPrisma().ticket.count({ where: whereClause })
    ]);

    // 5. ส่งข้อมูลกลับพร้อม Metadata สำหรับแบ่งหน้า
    res.status(200).json({
      data: tickets,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve tickets" });
  }
});

export default app;
