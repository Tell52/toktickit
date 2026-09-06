import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import multer from "multer";

void getPrisma;

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

// ตั้งค่า Multer สำหรับจัดการไฟล์อัปโหลดในหน่วยความจำ (เพื่อตรวจสอบขนาดและประเภทก่อนบันทึก)
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // บังคับขนาดสูงสุด 5 MB ต่อไฟล์[cite: 8]
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"]; // อนุญาตเฉพาะประเภทที่กำหนด[cite: 8]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// ---------------------------------------------------------------------------
// 1. API ดึงรายละเอียดตั๋ว 1 ใบ (Ticket Detail)
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id", async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const requesterId = Number(req.query.requesterId);

  if (!requesterId) {
    return res.status(403).json({ error: "Requester ID is required" });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      include: {
        category: true,
        relatedSystem: true,
        attachments: true // ดึงข้อมูลไฟล์แนบมาด้วย[cite: 8]
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // ตรวจสอบสิทธิ์: ป้องกันการเข้าถึงตั๋วของคนอื่น[cite: 8]
    if (ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: "Unauthorized access to this ticket" });
    }

    res.status(200).json(ticket);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve ticket details" });
  }
});

// ---------------------------------------------------------------------------
// 2. API อัปโหลดไฟล์แนบ (Upload Attachment)
// ---------------------------------------------------------------------------
app.post("/api/tickets/:id/attachments", (req: Request, res: Response, next) => {
  // ดักจับ Error จาก Multer โดยตรง
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      if (err.message === "Invalid file type") {
        return res.status(400).json({ error: "Unsupported file type" });
      }
      return res.status(400).json({ error: "File upload error" });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const requesterId = Number(req.body.requesterId);
  const file = req.file;

  if (!requesterId || !file) {
    return res.status(400).json({ error: "Requester ID and file are required" });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      include: { attachments: { where: { isRemoved: false } } },
    });

    if (!ticket || ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    // ตรวจสอบโควต้าไฟล์แนบ: ต้องไม่เกิน 5 ไฟล์ต่อตั๋ว
    if (ticket.attachments.length >= 5) {
      return res.status(400).json({ error: "Maximum of 5 active attachments allowed" });
    }

    const mockFileUrl = `/uploads/${Date.now()}-${file.originalname}`;

    const newAttachment = await getPrisma().attachment.create({
      data: {
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        fileUrl: mockFileUrl,
        ticketId: ticketId,
      },
    });

    res.status(201).json(newAttachment);
  } catch (error) {
    res.status(500).json({ error: "Failed to upload attachment" });
  }
});

// ---------------------------------------------------------------------------
// 3. API ดาวน์โหลด/ดูข้อมูลไฟล์แนบ (Retrieve/Download Attachment)
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id/attachments/:attachmentId", async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const requesterId = Number(req.query.requesterId);

  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    const attachment = await getPrisma().attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.ticketId !== ticketId) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // บล็อกการดาวน์โหลดหากไฟล์ถูกลบไปแล้ว[cite: 8]
    if (attachment.isRemoved) {
      return res.status(403).json({ error: "This attachment has been removed and cannot be downloaded" });
    }

    // ในระบบจริง จะใช้ res.download() หรือส่งไฟล์สตรีมกลับไป
    res.status(200).json({ message: "File ready for download", fileUrl: attachment.fileUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve attachment" });
  }
});

// ---------------------------------------------------------------------------
// 4. API ลบไฟล์แนบแบบ Soft Removal
// ---------------------------------------------------------------------------
app.delete("/api/tickets/:id/attachments/:attachmentId", async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const { requesterId, reason } = req.body;

  // บังคับให้ต้องใส่เหตุผลในการลบ[cite: 8]
  if (!requesterId || !reason) {
    return res.status(400).json({ error: "Requester ID and removal reason are required" });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    // เปลี่ยนสถานะเป็นลบ พร้อมบันทึกเหตุผล[cite: 8]
    const removedAttachment = await getPrisma().attachment.update({
      where: { id: attachmentId },
      data: {
        isRemoved: true,
        removalReason: reason,
      },
    });

    res.status(200).json(removedAttachment);
  } catch (error) {
    res.status(500).json({ error: "Failed to remove attachment" });
  }
});

export default app;
