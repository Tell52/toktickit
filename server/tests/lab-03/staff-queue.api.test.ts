import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import bcrypt from 'bcrypt';

const prisma = getPrisma();

describe('Staff Ticket Queue API (GET /api/staff/tickets)', () => {
  let requesterCookie: string;
  let requesterCsrf: string;
  let staffCookie: string;
  let staffCsrf: string;
  let staffUserId = 'test-staff-queue-01';
  let adminCookie: string;
  let adminCsrf: string;
  let categoryId: number;
  let systemId: number;

  beforeAll(async () => {
    // 1. Cleanup previous test records
    await prisma.ticket.deleteMany({
      where: {
        summary: { startsWith: 'QUEUE_TEST_' },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: ['test-req-queue', 'test-staff-queue-01', 'test-staff-queue-02', 'test-admin-queue', 'test-staff-inactive'] },
      },
    });

    // 2. Ensure Category & RelatedSystem exist
    let cat = await prisma.category.findFirst();
    if (!cat) {
      cat = await prisma.category.create({ data: { name: 'Hardware' } });
    }
    categoryId = cat.id;

    let sys = await prisma.relatedSystem.findFirst();
    if (!sys) {
      sys = await prisma.relatedSystem.create({ data: { name: 'Corporate Laptop' } });
    }
    systemId = sys.id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await prisma.user.createMany({
      data: [
        { id: 'test-req-queue', name: 'Queue Requester', email: 'req-queue@test.com', role: 'REQUESTER', passwordHash },
        { id: 'test-staff-queue-01', name: 'Queue Staff 1', email: 'staff1-queue@test.com', role: 'IT_STAFF', passwordHash },
        { id: 'test-staff-queue-02', name: 'Queue Staff 2', email: 'staff2-queue@test.com', role: 'IT_STAFF', passwordHash },
        { id: 'test-admin-queue', name: 'Queue Admin', email: 'admin-queue@test.com', role: 'ADMINISTRATOR', passwordHash },
        { id: 'test-staff-inactive', name: 'Queue Inactive Staff', email: 'staff-inactive-queue@test.com', role: 'IT_STAFF', isActive: false, passwordHash },
      ],
    });

    // 4. Seed test tickets
    await prisma.ticket.createMany({
      data: [
        {
          ticketNumber: 'TKT-Q-001',
          summary: 'QUEUE_TEST_ Alpha Monitor flickering',
          description: 'Screen flickers when connected via HDMI',
          requestedPriority: 'Low',
          itPriority: 'LOW',
          currentStatus: 'New',
          requesterId: 'test-req-queue',
          ownerId: null, // unassigned
          categoryId,
          relatedSystemId: systemId,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          ticketNumber: 'TKT-Q-002',
          summary: 'QUEUE_TEST_ Beta Keyboard broken',
          description: 'Spacebar is stuck',
          requestedPriority: 'Medium',
          itPriority: 'MEDIUM',
          currentStatus: 'In Progress',
          requesterId: 'test-req-queue',
          ownerId: 'test-staff-queue-01', // assigned to staff 1 ("me")
          categoryId,
          relatedSystemId: systemId,
          createdAt: new Date('2026-01-02T10:00:00Z'),
        },
        {
          ticketNumber: 'TKT-Q-003',
          summary: 'QUEUE_TEST_ Gamma Laptop battery died',
          description: 'Battery does not hold charge',
          requestedPriority: 'High',
          itPriority: 'HIGH',
          currentStatus: 'Resolved',
          requesterId: 'test-req-queue',
          ownerId: 'test-staff-queue-02', // assigned to staff 2
          categoryId,
          relatedSystemId: systemId,
          createdAt: new Date('2026-01-03T10:00:00Z'),
        },
      ],
    });

    // 5. Authenticate users
    const reqRes = await request(app).post('/api/auth/login').send({ email: 'req-queue@test.com', password: 'TestPass123!' });
    requesterCookie = reqRes.headers['set-cookie'][0];
    requesterCsrf = reqRes.body.csrfToken;

    const staffRes = await request(app).post('/api/auth/login').send({ email: 'staff1-queue@test.com', password: 'TestPass123!' });
    staffCookie = staffRes.headers['set-cookie'][0];
    staffCsrf = staffRes.body.csrfToken;

    const adminRes = await request(app).post('/api/auth/login').send({ email: 'admin-queue@test.com', password: 'TestPass123!' });
    adminCookie = adminRes.headers['set-cookie'][0];
    adminCsrf = adminRes.body.csrfToken;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: {
        summary: { startsWith: 'QUEUE_TEST_' },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: ['test-req-queue', 'test-staff-queue-01', 'test-staff-queue-02', 'test-admin-queue', 'test-staff-inactive'] },
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Authorization & Role Checks
  // ---------------------------------------------------------------------------
  it('SEC: Unauthenticated request to /api/staff/tickets returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/staff/tickets');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('SEC: Requester calling /api/staff/tickets returns 403 FORBIDDEN', async () => {
    const res = await request(app).get('/api/staff/tickets').set('Cookie', requesterCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('SEC: IT Staff and Administrator can access /api/staff/tickets', async () => {
    const staffRes = await request(app).get('/api/staff/tickets').set('Cookie', staffCookie);
    expect(staffRes.status).toBe(200);
    expect(staffRes.body).toHaveProperty('tickets');
    expect(staffRes.body).toHaveProperty('pagination');

    const adminRes = await request(app).get('/api/staff/tickets').set('Cookie', adminCookie);
    expect(adminRes.status).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 2. Default Query & Response Structure
  // ---------------------------------------------------------------------------
  it('API-10: Returns tickets matching default structure with pagination and default sort (-createdAt)', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(res.body.tickets.length).toBe(3);

    // Verify pagination metadata
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalCount: 3,
    });

    // Default sort is -createdAt (descending: Gamma 2026-01-03 -> Beta 2026-01-02 -> Alpha 2026-01-01)
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-003');
    expect(res.body.tickets[1].ticketNumber).toBe('TKT-Q-002');
    expect(res.body.tickets[2].ticketNumber).toBe('TKT-Q-001');

    // Verify ticket item structure
    const ticket = res.body.tickets[0];
    expect(ticket).toHaveProperty('id');
    expect(ticket).toHaveProperty('ticketNumber');
    expect(ticket).toHaveProperty('summary');
    expect(ticket).toHaveProperty('category');
    expect(typeof ticket.category).toBe('string');
    expect(ticket).toHaveProperty('requestedPriority');
    expect(ticket).toHaveProperty('itPriority');
    expect(ticket).toHaveProperty('status');
    expect(ticket).toHaveProperty('owner');
  });

  // ---------------------------------------------------------------------------
  // 3. Search Filter
  // ---------------------------------------------------------------------------
  it('FR-14: Search by ticket number or summary (case-insensitive substring)', async () => {
    // Search by summary keyword
    const summaryRes = await request(app)
      .get('/api/staff/tickets?search=monitor')
      .set('Cookie', staffCookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.tickets.some((t: any) => t.ticketNumber === 'TKT-Q-001')).toBe(true);
    expect(summaryRes.body.tickets.every((t: any) => t.summary.toLowerCase().includes('monitor'))).toBe(true);

    // Search by ticketNumber
    const tktNumRes = await request(app)
      .get('/api/staff/tickets?search=TKT-Q-002')
      .set('Cookie', staffCookie);
    expect(tktNumRes.status).toBe(200);
    expect(tktNumRes.body.tickets.length).toBe(1);
    expect(tktNumRes.body.tickets[0].ticketNumber).toBe('TKT-Q-002');
  });

  // ---------------------------------------------------------------------------
  // 4. Status Filter & Validation
  // ---------------------------------------------------------------------------
  it('FR-15: Filter by status returns only matching tickets', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&status=IN_PROGRESS')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(1);
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-002');
  });

  it('API-11: Invalid status filter returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?status=BOGUS')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---------------------------------------------------------------------------
  // 5. Priority Filter & Validation
  // ---------------------------------------------------------------------------
  it('FR-15: Filter by priority returns only matching tickets', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&priority=HIGH')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(1);
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-003');
  });

  it('API-11: Invalid priority filter returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?priority=SUPER_HIGH')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---------------------------------------------------------------------------
  // 6. Category Filter & Validation
  // ---------------------------------------------------------------------------
  it('FR-15: Filter by valid category returns matching tickets', async () => {
    const res = await request(app)
      .get(`/api/staff/tickets?search=QUEUE_TEST_&category=${categoryId}`)
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(3);
  });

  it('API-11: Invalid category returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?category=NonExistentCategoryXYZ')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---------------------------------------------------------------------------
  // 7. Owner Filter ("me", "unassigned", userId)
  // ---------------------------------------------------------------------------
  it('FR-18: Filter by owner=unassigned returns unassigned tickets', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&owner=unassigned')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(1);
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-001');
    expect(res.body.tickets[0].owner).toBeNull();
  });

  it('FR-18: Filter by owner=me returns only tickets assigned to caller', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&owner=me')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(1);
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-002');
    expect(res.body.tickets[0].owner.id).toBe(staffUserId);
  });

  it('FR-18: Filter by specific owner userId', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&owner=test-staff-queue-02')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(1);
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-003');
    expect(res.body.tickets[0].owner.id).toBe('test-staff-queue-02');
  });

  // ---------------------------------------------------------------------------
  // 8. Sorting
  // ---------------------------------------------------------------------------
  it('FR-16: Sort by createdAt ascending', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&sort=createdAt')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-001');
    expect(res.body.tickets[2].ticketNumber).toBe('TKT-Q-003');
  });

  it('FR-16: Invalid sort returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?sort=unknownField')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---------------------------------------------------------------------------
  // 9. Pagination
  // ---------------------------------------------------------------------------
  it('FR-17: Pagination respects page and pageSize, with correct totalCount', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&sort=createdAt&page=2&pageSize=1')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(1);
    expect(res.body.tickets[0].ticketNumber).toBe('TKT-Q-002');
    expect(res.body.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalCount: 3,
    });
  });

  it('FR-17: Unrecognized or negative page/pageSize falls back to defaults', async () => {
    const res = await request(app)
      .get('/api/staff/tickets?search=QUEUE_TEST_&page=-1&pageSize=abc')
      .set('Cookie', staffCookie);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // 10. API-09: Claim and Reassign Ticket Owner (AC-06, FR-18)
  // ---------------------------------------------------------------------------
  describe('API-09: Claim and Reassign Ticket Owner (AC-06, FR-18)', () => {
    it('IT Staff claims an unassigned Ticket (200, ownerId set to caller, visible in subsequent queue fetch)', async () => {
      // 1. Claim unassigned ticket TKT-Q-001
      const claimRes = await request(app)
        .patch('/api/staff/tickets/TKT-Q-001/owner')
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ ownerId: staffUserId });

      expect(claimRes.status).toBe(200);
      expect(claimRes.body.owner).not.toBeNull();
      expect(claimRes.body.owner.id).toBe(staffUserId);
      expect(claimRes.body.owner.name).toBe('Queue Staff 1');

      // 2. Visible in subsequent queue fetch with owner=me
      const queueRes = await request(app)
        .get('/api/staff/tickets?search=QUEUE_TEST_&owner=me')
        .set('Cookie', staffCookie);

      expect(queueRes.status).toBe(200);
      expect(queueRes.body.tickets.some((t: any) => t.ticketNumber === 'TKT-Q-001')).toBe(true);

      // Reset TKT-Q-001 back to unassigned
      await request(app)
        .patch('/api/staff/tickets/TKT-Q-001/owner')
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ ownerId: null });
    });

    it('Rejects assigning ticket owner to an inactive user (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .patch('/api/staff/tickets/TKT-Q-001/owner')
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ ownerId: 'test-staff-inactive' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Rejects assigning ticket owner to a non-existent user (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .patch('/api/staff/tickets/TKT-Q-001/owner')
        .set('Cookie', staffCookie)
        .set('x-csrf-token', staffCsrf)
        .send({ ownerId: 'non-existent-user-id' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Rejects claiming ticket from Requester role (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch('/api/staff/tickets/TKT-Q-001/owner')
        .set('Cookie', requesterCookie)
        .set('x-csrf-token', requesterCsrf)
        .send({ ownerId: 'test-req-queue' });

      expect(res.status).toBe(403);
    });
  });
});
