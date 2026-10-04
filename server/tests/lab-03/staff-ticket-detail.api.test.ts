import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import bcrypt from 'bcrypt';
import { isValidStatusTransition, ALLOWED_STATUS_TRANSITIONS } from '../../src/routes/staff.routes';

const prisma = getPrisma();

describe('Staff Ticket Detail & Operations API (Lab 3)', () => {
  let requesterCookie: string;
  let requesterCsrf: string;
  let staffCookie: string;
  let staffCsrf: string;
  let staffUserId = 'staff-ops-user-01';
  let categoryId: number;
  let systemId: number;
  let testTicketNumber = 'TKT-OPS-001';
  let testTicketId: number;

  beforeAll(async () => {
    // 1. Cleanup old records
    await prisma.comment.deleteMany({ where: { authorId: { in: ['req-ops-user', 'staff-ops-user-01', 'staff-ops-inactive'] } } });
    await prisma.note.deleteMany({ where: { authorId: { in: ['req-ops-user', 'staff-ops-user-01', 'staff-ops-inactive'] } } });
    await prisma.ticket.deleteMany({ where: { requesterId: { in: ['req-ops-user'] } } });
    await prisma.ticket.deleteMany({ where: { ownerId: { in: ['staff-ops-user-01', 'staff-ops-inactive'] } } });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { in: ['TKT-OPS-001', 'TKT-OPS-002', 'TKT-OPS-003'] } } });
    await prisma.user.deleteMany({ where: { id: { in: ['req-ops-user', 'staff-ops-user-01', 'staff-ops-inactive'] } } });

    // 2. Ensure Category & RelatedSystem
    let cat = await prisma.category.findFirst();
    if (!cat) cat = await prisma.category.create({ data: { name: 'Hardware' } });
    categoryId = cat.id;

    let sys = await prisma.relatedSystem.findFirst();
    if (!sys) sys = await prisma.relatedSystem.create({ data: { name: 'Corporate Laptop' } });
    systemId = sys.id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await prisma.user.createMany({
      data: [
        { id: 'req-ops-user', name: 'Ops Requester', email: 'req-ops@test.com', role: 'REQUESTER', passwordHash },
        { id: 'staff-ops-user-01', name: 'Ops Staff', email: 'staff-ops@test.com', role: 'IT_STAFF', passwordHash },
        { id: 'staff-ops-inactive', name: 'Inactive Staff', email: 'staff-inactive-ops@test.com', role: 'IT_STAFF', isActive: false, passwordHash },
      ],
    });

    // 4. Create base test ticket
    const createdTicket = await prisma.ticket.create({
      data: {
        ticketNumber: testTicketNumber,
        summary: 'Ops Test Ticket',
        description: 'Detailed description for ops testing',
        requestedPriority: 'Medium',
        itPriority: 'MEDIUM',
        currentStatus: 'New',
        requesterId: 'req-ops-user',
        categoryId,
        relatedSystemId: systemId,
      },
    });
    testTicketId = createdTicket.id;

    // 5. Authenticate sessions
    const reqRes = await request(app).post('/api/auth/login').send({ email: 'req-ops@test.com', password: 'TestPass123!' });
    requesterCookie = reqRes.headers['set-cookie'][0];
    requesterCsrf = reqRes.body.csrfToken;

    const staffRes = await request(app).post('/api/auth/login').send({ email: 'staff-ops@test.com', password: 'TestPass123!' });
    staffCookie = staffRes.headers['set-cookie'][0];
    staffCsrf = staffRes.body.csrfToken;
  });

  afterAll(async () => {
    await prisma.comment.deleteMany({ where: { authorId: { in: ['req-ops-user', 'staff-ops-user-01', 'staff-ops-inactive'] } } });
    await prisma.note.deleteMany({ where: { authorId: { in: ['req-ops-user', 'staff-ops-user-01', 'staff-ops-inactive'] } } });
    await prisma.ticket.deleteMany({ where: { requesterId: { in: ['req-ops-user'] } } });
    await prisma.ticket.deleteMany({ where: { ownerId: { in: ['staff-ops-user-01', 'staff-ops-inactive'] } } });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { in: ['TKT-OPS-001', 'TKT-OPS-002', 'TKT-OPS-003'] } } });
    await prisma.user.deleteMany({ where: { id: { in: ['req-ops-user', 'staff-ops-user-01', 'staff-ops-inactive'] } } });
  });

  // ---------------------------------------------------------------------------
  // UNIT-03: IT Priority default logic (BR-12)
  // ---------------------------------------------------------------------------
  describe('UNIT-03: IT Priority default logic (BR-12)', () => {
    it('On Ticket creation, itPriority is set equal to requestedPriority', async () => {
      const createRes = await request(app)
        .post('/api/tickets')
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({
          summary: 'Unit-03 Priority Test',
          description: 'Testing default itPriority',
          categoryId,
          category: 'Hardware',
          relatedSystemId: systemId,
          relatedSystem: 'Corporate Laptop',
          requestedPriority: 'High',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.requestedPriority).toBe('High');
      expect(createRes.body.itPriority).toBe('High');

      // Cleanup
      await prisma.ticket.delete({ where: { id: createRes.body.id } });
    });
  });

  // ---------------------------------------------------------------------------
  // UNIT-05: Status transition matrix validator (BR-13)
  // ---------------------------------------------------------------------------
  describe('UNIT-05: Status transition matrix validator (BR-13)', () => {
    const ALL_STATUSES = [
      'New',
      'Open',
      'In Progress',
      'Waiting for Requester',
      'Resolved',
      'Closed',
      'Reopened',
      'Cancelled',
    ];

    it('accurately validates all 8x8 combinations against ui-spec.md §1.1 matrix', () => {
      for (const from of ALL_STATUSES) {
        const allowedTargets = ALLOWED_STATUS_TRANSITIONS[from] || [];
        for (const to of ALL_STATUSES) {
          const expected = allowedTargets.includes(to);
          const actual = isValidStatusTransition(from, to);
          expect(actual, `Transition from '${from}' to '${to}' should be ${expected}`).toBe(expected);
        }
      }
    });

    it('rejects identity transitions (from == to)', () => {
      for (const status of ALL_STATUSES) {
        expect(isValidStatusTransition(status, status)).toBe(false);
      }
    });

    it('returns false for unknown status strings', () => {
      expect(isValidStatusTransition('NonExistent', 'Open')).toBe(false);
      expect(isValidStatusTransition('New', 'InvalidStatus')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/staff/tickets/:id — Full Ticket Detail
  // ---------------------------------------------------------------------------
  describe('GET /api/staff/tickets/:id', () => {
    it('returns full ticket detail by numeric id or ticketNumber for IT Staff', async () => {
      const resById = await request(app)
        .get(`/api/staff/tickets/${testTicketId}`)
        .set('Cookie', staffCookie);

      expect(resById.status).toBe(200);
      expect(resById.body.ticketNumber).toBe(testTicketNumber);
      expect(resById.body.summary).toBe('Ops Test Ticket');
      expect(resById.body.requester.name).toBe('Ops Requester');
      expect(resById.body.itPriority).toBe('MEDIUM');
      expect(Array.isArray(resById.body.comments)).toBe(true);
      expect(Array.isArray(resById.body.notes)).toBe(true);
      expect(Array.isArray(resById.body.attachments)).toBe(true);

      const resByNum = await request(app)
        .get(`/api/staff/tickets/${testTicketNumber}`)
        .set('Cookie', staffCookie);

      expect(resByNum.status).toBe(200);
      expect(resByNum.body.id).toBe(testTicketId);
    });

    it('returns 404 for non-existent ticket', async () => {
      const res = await request(app)
        .get('/api/staff/tickets/999999')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 403 for Requester accessing staff ticket detail', async () => {
      const res = await request(app)
        .get(`/api/staff/tickets/${testTicketId}`)
        .set('Cookie', requesterCookie);

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/staff/tickets/:id/priority (FR-19, BR-11, BR-12, API-13)
  // ---------------------------------------------------------------------------
  describe('PATCH /api/staff/tickets/:id/priority (API-13, FR-19, BR-11, BR-12)', () => {
    it('updates itPriority successfully', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/priority`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ itPriority: 'HIGH' });

      expect(res.status).toBe(200);
      expect(res.body.itPriority).toBe('HIGH');

      const check = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(check?.itPriority).toBe('HIGH');
    });

    it('API-13: requestedPriority remains immutable even if sent in payload', async () => {
      const original = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      const origRequestedPriority = original?.requestedPriority;

      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/priority`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ itPriority: 'LOW', requestedPriority: 'High' });

      expect(res.status).toBe(200);

      const after = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(after?.itPriority).toBe('LOW');
      expect(after?.requestedPriority).toBe(origRequestedPriority);
    });

    it('rejects invalid itPriority values with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/priority`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ itPriority: 'SUPER_URGENT' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/staff/tickets/:id/status (API-12, AC-07, FR-20, BR-13, BR-14)
  // ---------------------------------------------------------------------------
  describe('PATCH /api/staff/tickets/:id/status (API-12, AC-07, FR-20, BR-13, BR-14)', () => {
    it('permits legal status transition (e.g. New -> In Progress)', async () => {
      // Ensure ticket is in New status
      await prisma.ticket.update({ where: { id: testTicketId }, data: { currentStatus: 'New' } });

      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/status`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ status: 'In Progress' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('In Progress');

      const check = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(check?.currentStatus).toBe('In Progress');
    });

    it('API-12: rejects illegal status transition (e.g. In Progress -> Closed) with 409 CONFLICT', async () => {
      // Current status is 'In Progress'
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/status`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ status: 'Closed' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');

      // Verify DB status is unchanged
      const check = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(check?.currentStatus).toBe('In Progress');
    });

    it('rejects invalid enum status with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/status`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ status: 'FABRICATED_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // API-14: Owner Assignment Validation (FR-18)
  // ---------------------------------------------------------------------------
  describe('API-14: Owner Assignment (FR-18)', () => {
    it('API-14: rejects assigning Ticket owner to an inactive user (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/owner`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ ownerId: 'staff-ops-inactive' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('assigns owner to active IT staff user', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/owner`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ ownerId: staffUserId });

      expect(res.status).toBe(200);
      expect(res.body.owner.id).toBe(staffUserId);
    });

    it('unassigns ticket owner when ownerId is null', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/owner`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ ownerId: null });

      expect(res.status).toBe(200);
      expect(res.body.owner).toBeNull();

      const check = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(check?.ownerId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // API-06: Resolved-Indicator Endpoint (AC-08, FR-12, BR-05)
  // ---------------------------------------------------------------------------
  describe('API-06: Resolved-Indicator Endpoint (AC-08, FR-12, BR-05)', () => {
    it('API-06: Requester (owner) calls resolved-indicator endpoint (200, status unchanged)', async () => {
      // First ensure ticket status is New and problemAppearsResolved is false
      await prisma.ticket.update({
        where: { id: testTicketId },
        data: { currentStatus: 'New', problemAppearsResolved: false, indicatedAt: null },
      });

      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/resolved-indicator`)
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf);

      expect(res.status).toBe(200);
      expect(res.body.problemAppearsResolved).toBe(true);
      expect(res.body.indicatedAt).toBeDefined();

      // Verify status is unchanged in DB
      const check = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(check?.problemAppearsResolved).toBe(true);
      expect(check?.currentStatus).toBe('New');
    });

    it('rejects resolved-indicator call from IT Staff with 403 (only requester can indicate)', async () => {
      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/resolved-indicator`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf);

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // MIG-02: Pre-existing Ticket itPriority backfill (spec §7.4)
  // ---------------------------------------------------------------------------
  describe('MIG-02: Pre-existing Ticket itPriority backfill (spec §7.4)', () => {
    it('ensures every ticket has itPriority populated matching requestedPriority', async () => {
      const tickets = await prisma.ticket.findMany({
        where: { ticketNumber: { in: [testTicketNumber] } },
      });

      for (const t of tickets) {
        expect(t.itPriority).toBeDefined();
        expect(t.itPriority).not.toBeNull();
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain((t.itPriority || '').toUpperCase());
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Security & Authorization Protections for Staff Operations
  // ---------------------------------------------------------------------------
  describe('Security & Authorization Protections (Staff Operations)', () => {
    it('rejects Requester role accessing PATCH /api/staff/tickets/:id/priority with 403', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/priority`)
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({ itPriority: 'HIGH' });

      expect(res.status).toBe(403);
    });

    it('rejects Requester role accessing PATCH /api/staff/tickets/:id/status with 403', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/status`)
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({ status: 'In Progress' });

      expect(res.status).toBe(403);
    });

    it('rejects Requester role accessing PATCH /api/staff/tickets/:id/owner with 403', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/owner`)
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({ ownerId: staffUserId });

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/status`)
        .send({ status: 'In Progress' });

      expect(res.status).toBe(401);
    });

    it('rejects requests missing CSRF token with 403', async () => {
      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/status`)
        .set('Cookie', staffCookie)
        .send({ status: 'In Progress' });

      expect(res.status).toBe(403);
    });

    it('rejects any status transition from terminal status Cancelled with 409 CONFLICT', async () => {
      // Move ticket to Cancelled
      await prisma.ticket.update({ where: { id: testTicketId }, data: { currentStatus: 'Cancelled' } });

      const res = await request(app)
        .patch(`/api/staff/tickets/${testTicketNumber}/status`)
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ status: 'Reopened' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');

      // Verify DB remains Cancelled
      const check = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(check?.currentStatus).toBe('Cancelled');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/staff/users
  // ---------------------------------------------------------------------------
  describe('GET /api/staff/users', () => {
    it('returns active IT Staff and Administrator users', async () => {
      const res = await request(app)
        .get('/api/staff/users')
        .set('Cookie', staffCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.some((u: any) => u.id === staffUserId)).toBe(true);
      // Inactive staff should NOT be included
      expect(res.body.users.some((u: any) => u.id === 'staff-ops-inactive')).toBe(false);
    });
  });
});
