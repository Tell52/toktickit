import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { execSync } from 'child_process';
import path from 'path';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';

const prisma = getPrisma();

describe('Administrator User Management API Tests (Lab 3)', () => {
  let adminCookie: string;
  let adminCsrf: string;
  let adminUser: any;

  let staffCookie: string;
  let requesterCookie: string;

  beforeAll(async () => {
    // Clean up test users if they exist from previous test runs
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'admin.test@toktickit.com',
            'staff.test@toktickit.com',
            'requester.test@toktickit.com',
            'new.user@toktickit.com',
            'dup.user@toktickit.com',
            'edit.user@toktickit.com',
            'solo.admin@toktickit.com',
          ],
        },
      },
    });

    const passwordHash = await bcrypt.hash('Str0ng!Pass1', 10);

    // Create test users
    adminUser = await prisma.user.create({
      data: {
        id: 'usr_admin_test_01',
        name: 'Admin Test',
        email: 'admin.test@toktickit.com',
        role: 'ADMINISTRATOR',
        isActive: true,
        mustChangePassword: false,
        passwordHash,
      },
    });

    await prisma.user.create({
      data: {
        id: 'usr_staff_test_01',
        name: 'Staff Test',
        email: 'staff.test@toktickit.com',
        role: 'IT_STAFF',
        isActive: true,
        mustChangePassword: false,
        passwordHash,
      },
    });

    await prisma.user.create({
      data: {
        id: 'usr_req_test_01',
        name: 'Requester Test',
        email: 'requester.test@toktickit.com',
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: false,
        passwordHash,
      },
    });

    // Login Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin.test@toktickit.com', password: 'Str0ng!Pass1' });
    adminCookie = adminRes.headers['set-cookie'][0];
    adminCsrf = adminRes.body.csrfToken;

    // Login Staff
    const staffRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff.test@toktickit.com', password: 'Str0ng!Pass1' });
    staffCookie = staffRes.headers['set-cookie'][0];

    // Login Requester
    const reqRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'requester.test@toktickit.com', password: 'Str0ng!Pass1' });
    requesterCookie = reqRes.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'admin.test@toktickit.com',
            'staff.test@toktickit.com',
            'requester.test@toktickit.com',
            'new.user@toktickit.com',
            'dup.user@toktickit.com',
            'edit.user@toktickit.com',
            'solo.admin@toktickit.com',
            'new.edited@toktickit.com',
          ],
        },
      },
    });
  });

  describe('Authorization', () => {
    it('returns 401 UNAUTHENTICATED when unauthenticated', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 FORBIDDEN when accessed by Requester', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', requesterCookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN when accessed by IT Staff', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', staffCookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/admin/users (API-19)', () => {
    it('returns list of users with id, name, email, role, isActive', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(3);

      const user = res.body.users.find((u: any) => u.id === adminUser.id);
      expect(user).toBeDefined();
      expect(user).toHaveProperty('name', 'Admin Test');
      expect(user).toHaveProperty('email', 'admin.test@toktickit.com');
      expect(user).toHaveProperty('role', 'ADMINISTRATOR');
      expect(user).toHaveProperty('isActive', true);
      // Password hash must never be returned
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('filters users by role', async () => {
      const res = await request(app)
        .get('/api/admin/users?role=IT_STAFF')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      res.body.users.forEach((u: any) => {
        expect(u.role).toBe('IT_STAFF');
      });
    });

    it('returns 400 VALIDATION_ERROR on invalid role filter', async () => {
      const res = await request(app)
        .get('/api/admin/users?role=INVALID_ROLE')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('searches users by name or email substring', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=staff.test')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].email).toBe('staff.test@toktickit.com');
    });

    it('combines search and role filters (API-19)', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=Test&role=REQUESTER')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      res.body.users.forEach((u: any) => {
        expect(u.role).toBe('REQUESTER');
        expect(u.name.toLowerCase().includes('test') || u.email.toLowerCase().includes('test')).toBe(true);
      });
    });
  });

  describe('POST /api/admin/users (API-15)', () => {
    it('creates a user successfully with mustChangePassword=true', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          name: 'New User',
          email: 'new.user@toktickit.com',
          role: 'IT_STAFF',
          isActive: true,
          initialPassword: 'Str0ng!Password2',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('New User');
      expect(res.body.email).toBe('new.user@toktickit.com');
      expect(res.body.role).toBe('IT_STAFF');
      expect(res.body.isActive).toBe(true);
      expect(res.body.mustChangePassword).toBe(true);
      expect(res.body).not.toHaveProperty('passwordHash');

      // Verify in DB that mustChangePassword is true and password is encrypted
      const dbUser = await prisma.user.findUnique({ where: { id: res.body.id } });
      expect(dbUser?.mustChangePassword).toBe(true);
      expect(dbUser?.passwordHash).not.toBe('Str0ng!Password2');
      const isMatch = await bcrypt.compare('Str0ng!Password2', dbUser!.passwordHash);
      expect(isMatch).toBe(true);
    });

    it('rejects creation when email already exists (API-15, 409 EMAIL_ALREADY_EXISTS)', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          name: 'Duplicate Email User',
          email: 'admin.test@toktickit.com', // already exists
          role: 'REQUESTER',
          initialPassword: 'Str0ng!Password2',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects creation with weak initialPassword (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          name: 'Weak Pass User',
          email: 'weak.user@toktickit.com',
          role: 'REQUESTER',
          initialPassword: 'weak',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects creation with invalid email or missing name', async () => {
      const res1 = await request(app)
        .post('/api/admin/users')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          name: '',
          email: 'valid@toktickit.com',
          role: 'REQUESTER',
          initialPassword: 'Str0ng!Password2',
        });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/admin/users')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          name: 'Valid Name',
          email: 'not-an-email',
          role: 'REQUESTER',
          initialPassword: 'Str0ng!Password2',
        });
      expect(res2.status).toBe(400);
    });
  });

  describe('PATCH /api/admin/users/:id (API-16, API-17)', () => {
    let editUserId: string;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash('Str0ng!Pass1', 10);
      const user = await prisma.user.create({
        data: {
          name: 'Edit User',
          email: 'edit.user@toktickit.com',
          role: 'REQUESTER',
          isActive: true,
          passwordHash,
        },
      });
      editUserId = user.id;
    });

    it('updates user attributes successfully', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${editUserId}`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          name: 'Edited User Name',
          role: 'IT_STAFF',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Edited User Name');
      expect(res.body.role).toBe('IT_STAFF');
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/usr_does_not_exist')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects update if new email conflicts with another user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${editUserId}`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ email: 'admin.test@toktickit.com' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('prevents Administrator from deactivating their own account (API-16, CANNOT_DEACTIVATE_SELF)', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminUser.id}`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ isActive: false });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');

      // Verify account remains active
      const dbUser = await prisma.user.findUnique({ where: { id: adminUser.id } });
      expect(dbUser?.isActive).toBe(true);
    });

    it('prevents deactivating the last remaining active Administrator (API-17, LAST_ACTIVE_ADMIN)', async () => {
      // First, find all active admins except adminUser and temporarily deactivate them
      const otherAdmins = await prisma.user.findMany({
        where: {
          role: 'ADMINISTRATOR',
          isActive: true,
          id: { not: adminUser.id },
        },
      });

      if (otherAdmins.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: otherAdmins.map((a) => a.id) } },
          data: { isActive: false },
        });
      }

      // Create a second admin to test deactivating
      const passwordHash = await bcrypt.hash('Str0ng!Pass1', 10);
      const soloAdmin = await prisma.user.create({
        data: {
          name: 'Solo Admin',
          email: 'solo.admin@toktickit.com',
          role: 'ADMINISTRATOR',
          isActive: true,
          passwordHash,
        },
      });

      // Now deactivate adminUser's active status from DB directly to simulate soloAdmin being the only active admin
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { isActive: false },
      });

      // Now try to deactivate soloAdmin via API using adminCookie (even though session user is inactive in DB, token is valid)
      const res = await request(app)
        .patch(`/api/admin/users/${soloAdmin.id}`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ isActive: false });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('LAST_ACTIVE_ADMIN');

      // Restore adminUser and other admins
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { isActive: true },
      });
      if (otherAdmins.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: otherAdmins.map((a) => a.id) } },
          data: { isActive: true },
        });
      }
    });
  });

  describe('POST /api/admin/users/:id/reset-password (API-18)', () => {
    let targetUserId: string;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash('Old!Password123', 10);
      const user = await prisma.user.create({
        data: {
          name: 'Reset Target User',
          email: 'dup.user@toktickit.com',
          role: 'REQUESTER',
          isActive: true,
          mustChangePassword: false,
          passwordHash,
        },
      });
      targetUserId = user.id;
    });

    it('rejects weak newPassword with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${targetUserId}/reset-password`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ newPassword: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('resets password and sets mustChangePassword=true on target user (API-18)', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${targetUserId}/reset-password`)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ newPassword: 'Fresh!Start123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        userId: targetUserId,
        mustChangePassword: true,
      });

      // Verify in DB
      const dbUser = await prisma.user.findUnique({ where: { id: targetUserId } });
      expect(dbUser?.mustChangePassword).toBe(true);

      const isMatch = await bcrypt.compare('Fresh!Start123', dbUser!.passwordHash);
      expect(isMatch).toBe(true);
    });

    it('returns 404 for non-existent target user', async () => {
      const res = await request(app)
        .post('/api/admin/users/usr_ghost/reset-password')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ newPassword: 'Fresh!Start123' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Email uniqueness normalizer (UNIT-06, BR-09)', () => {
    it('rejects user creation when email matches case-insensitively (User@x.com vs user@x.com)', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({
          name: 'Case Test User',
          email: 'ADMIN.TEST@TOKTICKIT.COM',
          role: 'REQUESTER',
          initialPassword: 'Str0ng!Password2',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects user update when email matches case-insensitively', async () => {
      const res = await request(app)
        .patch('/api/admin/users/usr_staff_test_01')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({ email: 'Admin.Test@toktickit.com' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('Stored password security (SEC-09, BR-06)', () => {
    it('ensures no plaintext password is stored in database; only secure bcrypt hash', async () => {
      const allUsers = await prisma.user.findMany({
        where: {
          email: {
            in: [
              'admin.test@toktickit.com',
              'staff.test@toktickit.com',
              'requester.test@toktickit.com',
            ],
          },
        },
      });

      expect(allUsers.length).toBeGreaterThanOrEqual(3);
      for (const u of allUsers) {
        expect(u.passwordHash).toBeDefined();
        // Plaintext must never be stored
        expect(u.passwordHash).not.toBe('Str0ng!Pass1');
        expect(u.passwordHash).not.toBe('Str0ng!Password2');
        // Must match standard bcrypt hash format ($2a$ or $2b$ with cost factor)
        expect(u.passwordHash).toMatch(/^\$2[aby]?\$\d+\$/);
        const valid = await bcrypt.compare('Str0ng!Pass1', u.passwordHash);
        expect(valid).toBe(true);
      }
    });
  });

  describe('Seed script idempotency (MIG-03, spec §7.5)', () => {
    it('running seed script twice does not duplicate users or tickets (idempotent)', async () => {
      const serverDir = path.resolve(__dirname, '../../');

      // First seed run
      execSync('npm run prisma:seed', { cwd: serverDir, stdio: 'pipe' });
      const userCount1 = await prisma.user.count();
      const ticketCount1 = await prisma.ticket.count();
      const categoryCount1 = await prisma.category.count();

      // Second seed run
      execSync('npm run prisma:seed', { cwd: serverDir, stdio: 'pipe' });
      const userCount2 = await prisma.user.count();
      const ticketCount2 = await prisma.ticket.count();
      const categoryCount2 = await prisma.category.count();

      expect(userCount2).toBe(userCount1);
      expect(ticketCount2).toBe(ticketCount1);
      expect(categoryCount2).toBe(categoryCount1);
    });
  });
});

