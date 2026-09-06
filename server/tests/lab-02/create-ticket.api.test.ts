import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("POST /api/tickets", () => {
    it("API-01: Create valid ticket returns 201, a saved Ticket, and generated ticket number", async () => {
        const validTicketData = {
            requesterId: 1,
            summary: "Laptop battery drains quickly",
            description: "My laptop battery is draining much faster than usual.",
            categoryId: 2,
            relatedSystemId: 3,
            requestedPriority: "Medium"
        };

        const res = await request(app)
            .post("/api/tickets")
            .send(validTicketData);

        // ตรวจสอบว่าสำเร็จและได้ HTTP Status 201 ตามที่โจทย์กำหนด
        expect(res.status).toBe(201);

        // ตรวจสอบว่ามีการสร้าง Ticket Number และกำหนดสถานะเริ่มต้นเป็น New[cite: 8]
        expect(res.body).toHaveProperty("ticketNumber");
        expect(res.body.ticketNumber).toMatch(/^TKT-/);
        expect(res.body.currentStatus).toBe("New");
    });

    it("returns 400 Bad Request when required fields are missing", async () => {
        const invalidTicketData = {
            summary: "Missing other required fields"
        };

        const res = await request(app)
            .post("/api/tickets")
            .send(invalidTicketData);

        // ตรวจสอบพฤติกรรมเมื่อส่งข้อมูลไม่ครบตาม Validation rules[cite: 8]
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");
    });
});