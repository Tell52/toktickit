import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import bcrypt from 'bcrypt';

const prisma = getPrisma();

// Helper validator matching the requirements for UNIT-04
function isNonEmptyContent(content: unknown): boolean {
  if (typeof content !== 'string') return false;
  return content.trim().length > 0;
}

describe('Public Comments & Internal Notes API (Lab 3)', () => {
  let requesterCookie: string;
  let requesterCsrf: string;
  let otherRequesterCookie: string;
  let otherRequesterCsrf: string;
  let staffCookie: string;
  let staffCsrf: string;
  let ticketId: number;
  let ticketNumber = 'TKT-CN-001';

  beforeAll(async () => {
    // 1. Cleanup
    await prisma.comment.deleteMany({ where: { authorId: { in: ['req-cn-01', 'req-cn-02', 'staff-cn-01'] } } });
    await prisma.note.deleteMany({ where: { authorId: { in: ['req-cn-01', 'req-cn-02', 'staff-cn-01'] } } });
    await prisma.ticket.deleteMany({ where: { ticketNumber: 'TKT-CN-001' } });
    await prisma.user.deleteMany({ where: { id: { in: ['req-cn-01', 'req-cn-02', 'staff-cn-01'] } } });

    // 2. Setup Category & System
    let cat = await prisma.category.findFirst();
    if (!cat) cat = await prisma.category.create({ data: { name: 'Hardware' } });
    let sys = await prisma.relatedSystem.findFirst();
    if (!sys) sys = await prisma.relatedSystem.create({ data: { name: 'Corporate Laptop' } });

    // 3. Create Users
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await prisma.user.createMany({
      data: [
        { id: 'req-cn-01', name: 'Alice Requester', email: 'alice-cn@test.com', role: 'REQUESTER', passwordHash },
        { id: 'req-cn-02', name: 'Bob Requester', email: 'bob-cn@test.com', role: 'REQUESTER', passwordHash },
        { id: 'staff-cn-01', name: 'Sam Staff', email: 'sam-cn@test.com', role: 'IT_STAFF', passwordHash },
      ],
    });

    // 4. Create Ticket owned by Alice (not assigned to Sam)
    const tkt = await prisma.ticket.create({
      data: {
        ticketNumber,
        summary: 'Comments & Notes Testing',
        description: 'Test ticket for comments and notes validation',
        requestedPriority: 'Low',
        itPriority: 'LOW',
        currentStatus: 'New',
        requesterId: 'req-cn-01',
        ownerId: null, // Unassigned
        categoryId: cat.id,
        relatedSystemId: sys.id,
      },
    });
    ticketId = tkt.id;

    // 5. Login
    const r1 = await request(app).post('/api/auth/login').send({ email: 'alice-cn@test.com', password: 'TestPass123!' });
    requesterCookie = r1.headers['set-cookie'][0];
    requesterCsrf = r1.body.csrfToken;

    const r2 = await request(app).post('/api/auth/login').send({ email: 'bob-cn@test.com', password: 'TestPass123!' });
    otherRequesterCookie = r2.headers['set-cookie'][0];
    otherRequesterCsrf = r2.body.csrfToken;

    const s1 = await request(app).post('/api/auth/login').send({ email: 'sam-cn@test.com', password: 'TestPass123!' });
    staffCookie = s1.headers['set-cookie'][0];
    staffCsrf = s1.body.csrfToken;
  });

  afterAll(async () => {
    await prisma.comment.deleteMany({ where: { authorId: { in: ['req-cn-01', 'req-cn-02', 'staff-cn-01'] } } });
    await prisma.note.deleteMany({ where: { authorId: { in: ['req-cn-01', 'req-cn-02', 'staff-cn-01'] } } });
    await prisma.ticket.deleteMany({ where: { ticketNumber: 'TKT-CN-001' } });
    await prisma.user.deleteMany({ where: { id: { in: ['req-cn-01', 'req-cn-02', 'staff-cn-01'] } } });
  });

  // ---------------------------------------------------------------------------
  // UNIT-04: Comment/Note content validator (BR-16, AC-14)
  // ---------------------------------------------------------------------------
  describe('UNIT-04: Comment/Note content validator (AC-14, BR-16)', () => {
    it('rejects empty string and whitespace-only string; accepts valid string', () => {
      expect(isNonEmptyContent('')).toBe(false);
      expect(isNonEmptyContent('   ')).toBe(false);
      expect(isNonEmptyContent('\t\n')).toBe(false);
      expect(isNonEmptyContent(null)).toBe(false);
      expect(isNonEmptyContent(undefined)).toBe(false);
      expect(isNonEmptyContent(123)).toBe(false);
      expect(isNonEmptyContent('Valid comment')).toBe(true);
      expect(isNonEmptyContent('  Hello world  ')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // API-07: POST comment with empty/whitespace content (BR-16, AC-14, FR-11)
  // ---------------------------------------------------------------------------
  describe('API-07: POST comment with empty/whitespace content', () => {
    it('returns 400 VALIDATION_ERROR and creates no Comment row for empty content', async () => {
      const countBefore = await prisma.comment.count({ where: { ticketId } });

      const res = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({ content: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const countAfter = await prisma.comment.count({ where: { ticketId } });
      expect(countAfter).toBe(countBefore);
    });

    it('returns 400 VALIDATION_ERROR and creates no Comment row for whitespace-only content', async () => {
      const countBefore = await prisma.comment.count({ where: { ticketId } });

      const res = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({ content: '    \n  \t  ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const countAfter = await prisma.comment.count({ where: { ticketId } });
      expect(countAfter).toBe(countBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // API-20: IT Staff posts a Public Comment on a Ticket they do not own (FR-21)
  // ---------------------------------------------------------------------------
  describe('API-20: IT Staff posts Public Comment regardless of ownership (FR-21)', () => {
    it('creates comment with 201 status for IT Staff on unowned ticket', async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ content: 'Technician note: reviewing hardware issue.' });

      expect(res.status).toBe(201);
      expect(res.body.authorName).toBe('Sam Staff');
      expect(res.body.authorRole).toBe('IT_STAFF');
      expect(res.body.content).toBe('Technician note: reviewing hardware issue.');
    });
  });

  // ---------------------------------------------------------------------------
  // API-08 & SEC-02: Requester calls Internal Notes endpoints (AC-04, FR-22, BR-04)
  // ---------------------------------------------------------------------------
  describe('API-08: Requester role blocked from Internal Notes (AC-04, FR-22, BR-04)', () => {
    it('returns 403 on GET /api/staff/tickets/:id/notes with no note content or count', async () => {
      const res = await request(app)
        .get(`/api/staff/tickets/${ticketId}/notes`)
        .set('Cookie', requesterCookie);

      expect(res.status).toBe(403);
      expect(res.body.notes).toBeUndefined();
      expect(res.body.internalNotesCount).toBeUndefined();
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 on POST /api/staff/tickets/:id/notes for Requester', async () => {
      const res = await request(app)
        .post(`/api/staff/tickets/${ticketId}/notes`)
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({ content: 'Requester trying to post note' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ---------------------------------------------------------------------------
  // IT Staff: Internal Notes CRUD (FR-21, BR-04)
  // ---------------------------------------------------------------------------
  describe('IT Staff Internal Notes operations', () => {
    it('allows IT Staff to create and retrieve internal notes', async () => {
      // 1. Post note
      const postRes = await request(app)
        .post(`/api/staff/tickets/${ticketId}/notes`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ content: 'Internal staff discussion: escalated to Level 2.' });

      expect(postRes.status).toBe(201);
      expect(postRes.body.content).toBe('Internal staff discussion: escalated to Level 2.');
      expect(postRes.body.authorName).toBe('Sam Staff');
      expect(postRes.body.authorId).toBe('staff-cn-01');

      // 2. Get notes
      const getRes = await request(app)
        .get(`/api/staff/tickets/${ticketId}/notes`)
        .set('Cookie', staffCookie);

      expect(getRes.status).toBe(200);
      expect(Array.isArray(getRes.body.notes)).toBe(true);
      expect(getRes.body.notes.length).toBeGreaterThanOrEqual(1);
      expect(getRes.body.notes[0].content).toBe('Internal staff discussion: escalated to Level 2.');
      expect(getRes.body.notes[0].authorName).toBe('Sam Staff');
    });

    it('rejects empty internal note content with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/api/staff/tickets/${ticketId}/notes`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ content: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
