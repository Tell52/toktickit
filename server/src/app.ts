import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import multer from "multer";
import session from 'express-session';
import authRoutes from './routes/auth.routes';
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

// CSRF check for state-changing requests when authenticated via session
app.use((req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    if (req.headers.cookie && req.session && req.session.user) {
      const token = req.headers['x-csrf-token'];
      if (!token || token !== req.session.csrfToken) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Invalid CSRF token' }
        });
      }
    }
  }
  next();
});

app.use('/api/auth', authRoutes);

// Staff and Admin routes protection (RBAC)
app.use('/api/staff', requireAuth, requireRole(['IT_STAFF', 'ADMINISTRATOR']), (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.use('/api/admin', requireAuth, requireRole(['ADMINISTRATOR']), (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

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

app.post("/api/tickets", async (req: Request, res: Response) => {
  const { requesterId, summary, description, categoryId, category, relatedSystemId, relatedSystem, requestedPriority } = req.body;

  // Resolve requesterId: if user is authenticated via session, BR-03 requires using session user ID (ignoring client value)
  let finalRequesterId: string | undefined;
  if (req.session && req.session.user) {
    finalRequesterId = req.session.user.id;
  } else if (requesterId) {
    finalRequesterId = String(requesterId);
  }

  // Resolve categoryId if category name is passed
  let finalCategoryId = Number(categoryId);
  if (!finalCategoryId && category) {
    const foundCategory = await getPrisma().category.findFirst({
      where: { name: { equals: String(category), mode: "insensitive" } },
    });
    if (foundCategory) {
      finalCategoryId = foundCategory.id;
    }
  }

  // Resolve relatedSystemId if relatedSystem name is passed
  let finalRelatedSystemId = Number(relatedSystemId);
  if (!finalRelatedSystemId && relatedSystem) {
    const foundSystem = await getPrisma().relatedSystem.findFirst({
      where: { name: { equals: String(relatedSystem), mode: "insensitive" } },
    });
    if (foundSystem) {
      finalRelatedSystemId = foundSystem.id;
    }
  }

  // (400 Bad Request)
  if (!finalRequesterId || !summary || !description || !finalCategoryId || !finalRelatedSystemId || !requestedPriority) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const userExists = await getPrisma().user.findUnique({ where: { id: finalRequesterId } });
    if (!userExists) {
      const fallbackRequester = await getPrisma().user.findFirst({
        where: { role: Role.REQUESTER, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (fallbackRequester) {
        finalRequesterId = fallbackRequester.id;
      }
    }

    // จำลองการสร้าง Ticket Number เช่น TKT-2026-0001
    const ticketCount = await getPrisma().ticket.count();
    let counter = ticketCount + 1;
    let generatedTicketNumber = `TKT-2026-${String(counter).padStart(4, "0")}`;
    while (await getPrisma().ticket.findUnique({ where: { ticketNumber: generatedTicketNumber } })) {
      counter++;
      generatedTicketNumber = `TKT-2026-${String(counter).padStart(4, "0")}`;
    }

    const newTicket = await getPrisma().ticket.create({
      data: {
        ticketNumber: generatedTicketNumber,
        summary,
        description,
        requestedPriority,
        itPriority: requestedPriority,
        currentStatus: "New",
        requesterId: finalRequesterId,
        categoryId: Number(finalCategoryId),
        relatedSystemId: Number(finalRelatedSystemId),
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
    // หากมี Cookie ส่งมา แต่ไม่มี session.user แสดงว่า session หมดอายุหรือไม่ถูกต้อง
    if (req.headers.cookie && (!req.session || !req.session.user)) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Session expired or invalid' }
      });
    }

    // 1. รับค่าจาก Query Parameters หรือ Session
    let requesterId = req.session?.user?.id;
    if (!requesterId) {
      requesterId = req.query.requesterId as string;
    }

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
  const sessionUser = req.session?.user;
  const requesterId = sessionUser ? sessionUser.id : (req.query.requesterId as string);

  if (!sessionUser && !requesterId) {
    return res.status(403).json({ error: "Requester ID is required" });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      include: {
        category: true,
        relatedSystem: true,
        attachments: true,
        comments: {
          include: {
            author: {
              select: { id: true, name: true, role: true }
            }
          },
          orderBy: { createdAt: "asc" }
        }
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Role-based ownership check
    if (sessionUser) {
      if (sessionUser.role === "REQUESTER" && String(ticket.requesterId) !== String(sessionUser.id)) {
        return res.status(404).json({ error: "Ticket not found" });
      }
    } else if (requesterId) {
      if (String(ticket.requesterId) !== String(requesterId)) {
        return res.status(403).json({ error: "Unauthorized access to this ticket" });
      }
    }

    const formattedComments = (ticket.comments || []).map(c => ({
      id: c.id,
      ticketId: c.ticketId,
      authorId: c.authorId,
      authorName: c.author?.name || "Unknown",
      authorRole: c.author?.role || "REQUESTER",
      author: c.author,
      content: c.content,
      createdAt: c.createdAt
    }));

    res.status(200).json({
      ...ticket,
      comments: formattedComments
    });
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
  const requesterId = req.session?.user?.id || (req.body.requesterId as string);
  const file = req.file;

  if (!requesterId || !file) {
    return res.status(400).json({ error: "Requester ID and file are required" });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      include: { attachments: { where: { isRemoved: false } } },
    });

    if (!ticket || String(ticket.requesterId) !== String(requesterId)) {
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
  const requesterId = req.session?.user?.id || (req.query.requesterId as string);

  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || (requesterId && String(ticket.requesterId) !== String(requesterId))) {
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
  const requesterId = req.session?.user?.id || (req.body.requesterId as string);
  const { reason } = req.body;

  // บังคับให้ต้องใส่เหตุผลในการลบ[cite: 8]
  if (!requesterId || !reason) {
    return res.status(400).json({ error: "Requester ID and removal reason are required" });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || String(ticket.requesterId) !== String(requesterId)) {
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

// ---------------------------------------------------------------------------
// 5. Public Comments (Lab 3)
// ---------------------------------------------------------------------------
app.post("/api/tickets/:id/comments", async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const { content } = req.body;

  // Validation: empty or whitespace-only content rejected (BR-16, AC-14)
  if (!content || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Comment content cannot be empty" }
    });
  }

  const sessionUser = req.session?.user;
  const authorId = sessionUser?.id || (req.body.authorId as string);

  if (!authorId) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" }
    });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Ticket not found" }
      });
    }

    // If requester, must own ticket
    if (sessionUser && sessionUser.role === "REQUESTER" && String(ticket.requesterId) !== String(sessionUser.id)) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Ticket not found" }
      });
    }

    const author = await getPrisma().user.findUnique({
      where: { id: authorId },
      select: { id: true, name: true, role: true }
    });

    const newComment = await getPrisma().comment.create({
      data: {
        ticketId,
        authorId,
        content: content.trim(),
      },
      include: {
        author: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    res.status(201).json({
      id: newComment.id,
      ticketId: newComment.ticketId,
      authorId: newComment.authorId,
      authorName: newComment.author?.name || "Unknown",
      authorRole: newComment.author?.role || "REQUESTER",
      author: newComment.author,
      content: newComment.content,
      createdAt: newComment.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create comment" });
  }
});

// ---------------------------------------------------------------------------
// 6. Problem Appears Resolved Indicator (Lab 3)
// ---------------------------------------------------------------------------
app.post("/api/tickets/:id/resolved-indicator", async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const sessionUser = req.session?.user;

  if (!sessionUser) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" }
    });
  }

  // Owning Requester only
  if (sessionUser.role !== "REQUESTER") {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Only requesters can indicate problem resolved" }
    });
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || String(ticket.requesterId) !== String(sessionUser.id)) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Ticket not found" }
      });
    }

    const updated = await getPrisma().ticket.update({
      where: { id: ticketId },
      data: {
        problemAppearsResolved: true,
        indicatedAt: new Date()
      }
    });

    res.status(200).json({
      ticketId: updated.id,
      problemAppearsResolved: updated.problemAppearsResolved,
      indicatedAt: updated.indicatedAt
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to set resolved indicator" });
  }
});

export default app;
