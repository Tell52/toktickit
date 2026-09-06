import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// จำลองการทำงานของ Prisma เพื่อให้เทสได้โดยไม่ต้องต่อ Database จริง
vi.mock("../../src/prisma.js", () => {
    const mockPrismaInstance = {
        ticket: { findUnique: vi.fn() },
    };
    return {
        getPrisma: vi.fn(() => mockPrismaInstance),
    };
});

describe("GET /api/tickets/:id", () => {
    const mockPrisma = getPrisma() as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 200 and the ticket details if the requester owns the ticket", async () => {
        // จำลองว่าตั๋วนี้เป็นของ requesterId: 1
        mockPrisma.ticket.findUnique.mockResolvedValue({
            id: 1,
            ticketNumber: "TKT-2026-0001",
            requesterId: 1,
            summary: "Login issue",
        });

        const res = await request(app).get("/api/tickets/1?requesterId=1");

        expect(res.status).toBe(200);
        expect(res.body.ticketNumber).toBe("TKT-2026-0001");
    });

    it("returns 403 Forbidden if a requester attempts to access another requester's ticket", async () => {
        // จำลองว่าตั๋วนี้เป็นของ requesterId: 1 (AC-03)
        mockPrisma.ticket.findUnique.mockResolvedValue({
            id: 1,
            ticketNumber: "TKT-2026-0001",
            requesterId: 1,
        });

        // แต่จำลองว่า requesterId: 2 เป็นคนพยายามเรียกดูข้อมูล
        const res = await request(app).get("/api/tickets/1?requesterId=2");

        // ต้องถูกบล็อกและขึ้นสถานะ 403
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Unauthorized access/i);
    });

    it("returns 404 Not Found if the ticket does not exist", async () => {
        mockPrisma.ticket.findUnique.mockResolvedValue(null);

        const res = await request(app).get("/api/tickets/999?requesterId=1");

        expect(res.status).toBe(404);
    });
});