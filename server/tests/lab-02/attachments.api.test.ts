import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

vi.mock("../../src/prisma.js", () => {
    const mockPrismaInstance = {
        ticket: { findUnique: vi.fn() },
        attachment: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    };
    return {
        getPrisma: vi.fn(() => mockPrismaInstance),
    };
});

describe("Attachments API", () => {
    const mockPrisma = getPrisma() as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("POST /api/tickets/:id/attachments", () => {
        it("returns 400 if the uploaded file is not a supported type", async () => {
            // จำลองว่าตั๋วเป็นของ requesterId: 1
            mockPrisma.ticket.findUnique.mockResolvedValue({
                id: 1,
                requesterId: 1,
                attachments: [],
            });

            // ส่งไฟล์ .txt ซึ่งเป็นประเภทที่ไม่อนุญาต (อนุญาตแค่ JPG, PNG, WEBP, PDF)[cite: 8]
            const res = await request(app)
                .post("/api/tickets/1/attachments")
                .field("requesterId", 1)
                .attach("file", Buffer.from("test content"), "test.txt");

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Unsupported file type/i);
        });
    });

    describe("DELETE /api/tickets/:id/attachments/:attachmentId", () => {
        it("soft-removes the attachment and requires a removal reason", async () => {
            mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1, requesterId: 1 });
            mockPrisma.attachment.update.mockResolvedValue({
                id: 101,
                isRemoved: true,
                removalReason: "Wrong file uploaded",
            });

            // ทดสอบลบไฟล์โดยส่งเหตุผลการลบมาด้วย (AC-05)[cite: 8]
            const res = await request(app)
                .delete("/api/tickets/1/attachments/101")
                .send({ requesterId: 1, reason: "Wrong file uploaded" });

            expect(res.status).toBe(200);
            expect(mockPrisma.attachment.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { isRemoved: true, removalReason: "Wrong file uploaded" },
                })
            );
        });

        it("returns 400 if the removal reason is missing", async () => {
            const res = await request(app)
                .delete("/api/tickets/1/attachments/101")
                .send({ requesterId: 1 }); // ไม่ได้ส่ง reason

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/removal reason are required/i);
        });
    });

    describe("GET /api/tickets/:id/attachments/:attachmentId", () => {
        it("returns 403 Forbidden if trying to download a soft-removed attachment", async () => {
            mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1, requesterId: 1 });

            // จำลองข้อมูลไฟล์ที่ถูกทำเครื่องหมายว่าถูกลบแล้ว (isRemoved: true)
            mockPrisma.attachment.findUnique.mockResolvedValue({
                id: 101,
                ticketId: 1,
                isRemoved: true,
            });

            const res = await request(app).get("/api/tickets/1/attachments/101?requesterId=1");

            // ต้องถูกบล็อกไม่ให้ดาวน์โหลด[cite: 8]
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/has been removed and cannot be downloaded/i);
        });
    });
});