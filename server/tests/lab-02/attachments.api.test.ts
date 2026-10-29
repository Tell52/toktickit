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
        it("rejects an unauthenticated upload even when requesterId is supplied", async () => {
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

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe("UNAUTHENTICATED");
        });
    });

    describe("DELETE /api/tickets/:id/attachments/:attachmentId", () => {
        it("rejects forged requesterId during unauthenticated removal", async () => {
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

            expect(res.status).toBe(401);
            expect(mockPrisma.attachment.update).not.toHaveBeenCalled();
        });

        it("authenticates before validating a removal reason", async () => {
            const res = await request(app)
                .delete("/api/tickets/1/attachments/101")
                .send({ requesterId: 1 }); // ไม่ได้ส่ง reason

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe("UNAUTHENTICATED");
        });
    });

    describe("GET /api/tickets/:id/attachments/:attachmentId", () => {
        it("requires a session before downloading even with a forged requesterId", async () => {
            mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1, requesterId: 1 });

            // จำลองข้อมูลไฟล์ที่ถูกทำเครื่องหมายว่าถูกลบแล้ว (isRemoved: true)
            mockPrisma.attachment.findUnique.mockResolvedValue({
                id: 101,
                ticketId: 1,
                isRemoved: true,
            });

            const res = await request(app).get("/api/tickets/1/attachments/101?requesterId=1");

            // ต้องถูกบล็อกไม่ให้ดาวน์โหลด[cite: 8]
            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHENTICATED');
            expect(mockPrisma.attachment.findUnique).not.toHaveBeenCalled();
        });
    });
});