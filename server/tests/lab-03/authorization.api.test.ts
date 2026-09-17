import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app'; // ปรับ path ให้ตรงกับที่ export app
import { getPrisma } from '../../src/prisma';
import bcrypt from 'bcrypt';

const prisma = getPrisma();

describe('Authorization & Security API Tests', () => {
    let requesterCookie: string;
    let requesterCsrf: string;
    let staffCookie: string;
    let staffCsrf: string;

    beforeAll(async () => {
        // ล้างข้อมูลเก่า (ถ้ามีค้างจากการรันก่อนหน้า)
        await prisma.ticket.deleteMany({ where: { requesterId: { in: ['991', '992'] } } });
        await prisma.user.deleteMany({ where: { id: { in: ['991', '992'] } } });

        // เตรียมข้อมูล User จำลองสำหรับเทส
        const passwordHash = await bcrypt.hash('TestPass123!', 10);

        await prisma.user.createMany({
            data: [
                { id: '991', name: 'Req User', email: 'req@test.com', role: 'REQUESTER', passwordHash },
                { id: '992', name: 'Staff User', email: 'staff@test.com', role: 'IT_STAFF', passwordHash },
            ]
        });

        // Login As Requester
        const reqRes = await request(app).post('/api/auth/login').send({ email: 'req@test.com', password: 'TestPass123!' });
        requesterCookie = reqRes.headers['set-cookie'][0];
        requesterCsrf = reqRes.body.csrfToken;

        // Login As IT Staff
        const staffRes = await request(app).post('/api/auth/login').send({ email: 'staff@test.com', password: 'TestPass123!' });
        staffCookie = staffRes.headers['set-cookie'][0];
        staffCsrf = staffRes.body.csrfToken;
    });

    afterAll(async () => {
        await prisma.ticket.deleteMany({ where: { requesterId: { in: ['991', '992'] } } });
        await prisma.user.deleteMany({ where: { id: { in: ['991', '992'] } } });
    });

    it('SEC-01: Direct API call with forged requesterId ignores client value (AC-03, BR-03)', async () => {
        // จำลองการสร้าง Ticket โดยส่ง requesterId ปลอมไป
        const res = await request(app)
            .post('/api/tickets')
            .set('Cookie', requesterCookie)
            .set('x-csrf-token', requesterCsrf)
            .send({
                summary: 'Forged Ticket',
                description: 'Test',
                category: 'Hardware',
                relatedSystemId: 1,
                requestedPriority: 'LOW',
                requesterId: '9999' // ส่ง ID ปลอม
            });

        expect(res.status).toBe(201);
        // ระบบต้องใช้ ID จาก session ('991') แทนค่าที่ส่งมา
        expect(res.body.requesterId).toBe('991');
    });

    it('SEC-02: Requester calls Internal Notes endpoint returns 403 with no content (AC-04, BR-04)', async () => {
        // Requester พยายามเข้าถึง Internal Notes[cite: 5]
        const res = await request(app)
            .get('/api/staff/tickets/1/notes')
            .set('Cookie', requesterCookie);

        expect(res.status).toBe(403);
        expect(res.body).not.toHaveProperty('notes');
        expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('SEC-03: Direct API call with an expired/invalidated session token returns 401 (AC-12, BR-08)', async () => {
        // ทำการ Logout ก่อน[cite: 5]
        await request(app)
            .post('/api/auth/logout')
            .set('Cookie', requesterCookie)
            .set('x-csrf-token', requesterCsrf);

        // นำ Cookie เดิมที่ถูก Logout ไปแล้วมาใช้ใหม่
        const res = await request(app)
            .get('/api/tickets')
            .set('Cookie', requesterCookie);

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('SEC-04: Requester calling /staff/* or /admin/* routes returns 403 (FR-08)', async () => {
        // ต้อง Login Requester ใหม่เพราะ test ที่แล้วทำ logout ไป
        const reqRes = await request(app).post('/api/auth/login').send({ email: 'req@test.com', password: 'TestPass123!' });
        const activeReqCookie = reqRes.headers['set-cookie'][0];

        // พยายามเข้าถึง route ของ Staff[cite: 5]
        const staffRouteRes = await request(app).get('/api/staff/tickets').set('Cookie', activeReqCookie);
        expect(staffRouteRes.status).toBe(403);

        // พยายามเข้าถึง route ของ Admin[cite: 5]
        const adminRouteRes = await request(app).get('/api/admin/users').set('Cookie', activeReqCookie);
        expect(adminRouteRes.status).toBe(403);
    });

    it('SEC-06: IT Staff calling /admin/users returns 403 (FR-08)', async () => {
        // Staff พยายามเข้าถึง User Management ของ Admin[cite: 5]
        const res = await request(app)
            .get('/api/admin/users')
            .set('Cookie', staffCookie);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('SEC-10: CSRF token omitted or invalid on a state-changing request returns 403', async () => {
        // ไม่ส่ง CSRF Token ในการทำ POST Request[cite: 5]
        const noCsrfRes = await request(app)
            .post('/api/tickets')
            .set('Cookie', staffCookie)
            .send({ summary: 'CSRF Test' });

        expect(noCsrfRes.status).toBe(403);
        expect(noCsrfRes.body.error.code).toBe('FORBIDDEN');

        // ส่ง CSRF Token ผิด
        const invalidCsrfRes = await request(app)
            .post('/api/tickets')
            .set('Cookie', staffCookie)
            .set('x-csrf-token', 'invalid-token-123')
            .send({ summary: 'CSRF Test' });

        expect(invalidCsrfRes.status).toBe(403);
    });
});