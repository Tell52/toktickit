import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app'; // ปรับ path ให้ชี้ไปที่ express app ของคุณ
import { getPrisma } from '../../src/prisma';
import bcrypt from 'bcrypt';

describe('Auth API (Lab 3)', () => {
    // สร้างข้อมูลจำลอง (Mock Data) ก่อนเริ่มรันเทสต์
    beforeAll(async () => {
        const passwordHash = await bcrypt.hash('ValidPass123!', 10);

        // สร้าง User ปกติ
        await prisma.user.upsert({
            where: { email: 'test.active@tiktockit.com' },
            update: { passwordHash, isActive: true },
            create: {
                name: 'Active User',
                email: 'test.active@tiktockit.com',
                passwordHash,
                role: 'REQUESTER',
                isActive: true,
                mustChangePassword: true,
            },
        });

        // สร้าง Inactive User
        await prisma.user.upsert({
            where: { email: 'test.inactive@tiktockit.com' },
            update: { passwordHash, isActive: false },
            create: {
                name: 'Inactive User',
                email: 'test.inactive@tiktockit.com',
                passwordHash,
                role: 'REQUESTER',
                isActive: false,
                mustChangePassword: true,
            },
        });
    });

    // ล้างข้อมูลหลังเทสต์เสร็จ
    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { in: ['test.active@tiktockit.com', 'test.inactive@tiktockit.com'] } }
        });
    });

    // API-01: Valid login[cite: 5]
    it('should login successfully with valid credentials and return safe user data', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test.active@tiktockit.com',
                password: 'ValidPass123!'
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).not.toHaveProperty('passwordHash'); // ห้ามหลุด Hash ออกไป[cite: 7]
        expect(res.body.user.email).toBe('test.active@tiktockit.com');
        expect(res.headers['set-cookie']).toBeDefined(); // ต้องมีการเซ็ต Session Cookie[cite: 7]
    });

    // API-03: Login attempt on inactive account[cite: 5]
    it('should return 401 generic error for inactive account with correct password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test.inactive@tiktockit.com',
                password: 'ValidPass123!'
            });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(res.body.error.message).toBe('Invalid email or password.'); // ข้อความต้องเหมือนกับกรณีรหัสผิด[cite: 7, 8]
    });

    // กรณีรหัสผ่านผิด
    it('should return 401 generic error for wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test.active@tiktockit.com',
                password: 'WrongPassword!'
            });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(res.body.error.message).toBe('Invalid email or password.');
    });
});

const prisma = getPrisma();