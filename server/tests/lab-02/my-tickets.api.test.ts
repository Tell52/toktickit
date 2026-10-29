import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

describe("GET /api/tickets", () => {
    const id = randomUUID(); let cookie: string;
    beforeAll(async () => {
        await getPrisma().user.create({ data: { id, name: 'List regression Requester', email: `${id}@list.invalid`, role: 'REQUESTER', passwordHash: await bcrypt.hash('ListPass!123', 10), mustChangePassword: false } });
        const login = await request(app).post('/api/auth/login').send({ email: `${id}@list.invalid`, password: 'ListPass!123' });
        expect(login.status).toBe(200); cookie = login.headers['set-cookie'][0];
    });
    afterAll(async () => { await getPrisma().user.delete({ where: { id } }); });
    it("returns 200 and a paginated list of tickets for a valid requester", async () => {
        const res = await request(app).get("/api/tickets").set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("data");
        expect(res.body).toHaveProperty("meta");
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("returns 401 without a session even with a client requesterId", async () => {
        const res = await request(app).get('/api/tickets?requesterId=' + id);

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
});
