import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

describe("POST /api/tickets", () => {
    const id = randomUUID(); let cookie: string, csrf: string, categoryId: number, relatedSystemId: number;
    beforeAll(async () => {
        const db = getPrisma();
        await db.user.create({ data: { id, name: 'Create regression', email: `${id}@create.invalid`, role: 'REQUESTER', passwordHash: await bcrypt.hash('CreatePass!123', 10), mustChangePassword: false } });
        categoryId = (await db.category.findFirstOrThrow()).id;
        relatedSystemId = (await db.relatedSystem.findFirstOrThrow()).id;
        const login = await request(app).post('/api/auth/login').send({ email: `${id}@create.invalid`, password: 'CreatePass!123' });
        expect(login.status).toBe(200); cookie = login.headers['set-cookie'][0]; csrf = login.body.csrfToken;
    });
    afterAll(async () => {
        await getPrisma().ticket.deleteMany({ where: { requesterId: id } });
        await getPrisma().user.delete({ where: { id } });
    });
    it("API-01: Create valid ticket returns 201, a saved Ticket, and generated ticket number", async () => {
        const validTicketData = {
            requesterId: 1,
            summary: "Laptop battery drains quickly",
            description: "My laptop battery is draining much faster than usual.",
            categoryId,
            relatedSystemId,
            requestedPriority: "Medium"
        };

        const res = await request(app)
            .post("/api/tickets").set('Cookie', cookie).set('X-CSRF-Token', csrf)
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
            .post("/api/tickets").set('Cookie', cookie).set('X-CSRF-Token', csrf)
            .send(invalidTicketData);

        // ตรวจสอบพฤติกรรมเมื่อส่งข้อมูลไม่ครบตาม Validation rules[cite: 8]
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");
    });
});