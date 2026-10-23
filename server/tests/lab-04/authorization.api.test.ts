import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../../src/app';
import { SecurityFixture, securityUrl } from './security-support';

describe.skipIf(!securityUrl).sequential('Lab 4 direct API authorization and safe failures', () => {
  const f = new SecurityFixture();
  beforeAll(() => f.setup(), 60_000); afterAll(() => f.close(), 60_000);
  function error(result: request.Response, status: number, code: string) {
    expect(result.status, JSON.stringify(result.body)).toBe(status);
    expect(result.body).toMatchObject({ error: { code, message: expect.any(String) } });
    expect(JSON.stringify(result.body)).not.toMatch(/Prisma|SELECT |passwordHash|stack|PRIVATE_/);
  }
  const get = (path: string, actor: keyof typeof f.sessions = 'r1') => request(app).get(path).set('Cookie', f.sessions[actor].cookie);

  it.each(['/api/tickets', '/api/tickets/1', '/api/tickets/1/attachments/1', '/api/tickets/1/actions', '/api/tickets/1/status-history', '/api/staff/tickets', '/api/admin/users', '/api/requesters'])('SEC-04: absent/forged identity cannot read %s', async path => {
    error(await request(app).get(path).query({ requesterId: f.ids.r1 }), 401, 'UNAUTHENTICATED');
  });
  it('SEC-04: anonymous creation never falls back to an active Requester', async () => {
    const before = await f.db.ticket.count();
    error(await request(app).post('/api/tickets').send({ ...f.body(), requesterId: f.ids.r1 }), 401, 'UNAUTHENTICATED');
    expect(await f.db.ticket.count()).toBe(before);
  });
  it('SEC-04: logout, invalid signature and expired cookie have no business access', async () => {
    const session = await f.login('r1');
    expect((await request(app).post('/api/auth/logout').set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf)).status).toBe(200);
    for (const cookie of [session.cookie, 'connect.sid=s%3Aforged.invalid', 'connect.sid=; Expires=Thu, 01 Jan 1970 00:00:00 GMT']) {
      error(await request(app).get('/api/tickets').set('Cookie', cookie), 401, 'UNAUTHENTICATED');
    }
  });
  it('SEC-04: logging in rotates an existing session and its CSRF token', async () => {
    const previous = await f.login('r2');
    const result = await request(app).post('/api/auth/login').set('Cookie', previous.cookie).send({ email: `${f.ids.r2}@hardening.invalid`, password: 'SecurityPass!123' });
    expect(result.status).toBe(200);
    expect(result.headers['set-cookie'][0].split(';')[0]).not.toBe(previous.cookie.split(';')[0]);
    expect(result.body.csrfToken).not.toBe(previous.csrf);
    error(await request(app).get('/api/tickets').set('Cookie', previous.cookie), 401, 'UNAUTHENTICATED');
  });
  it.each(['r1', 'staff', 'admin'] as const)('SEC-04: %s creation uses authenticated identity and ignores forged requesterId', async actor => {
    const result = await request(app).post('/api/tickets').set('Cookie', f.sessions[actor].cookie).set('X-CSRF-Token', f.sessions[actor].csrf).send({ ...f.body(), requesterId: f.ids.r2 });
    expect(result.status).toBe(201); expect(result.body.requesterId).toBe(f.ids[actor]);
    expect(result.body).toMatchObject({ version: 1, currentStatus: 'New', requestedPriority: 'High', itPriority: 'High' });
  });
  it('SEC-01/03: Ticket, attachment, action and history reads hide other-owner existence and Internal Notes', async () => {
    const ticket = await f.ticket();
    await f.db.note.create({ data: { ticketId: ticket.id, authorId: f.ids.staff, content: 'PRIVATE_DIAGNOSIS' } });
    const attachment = await f.db.attachment.create({ data: { ticketId: ticket.id, fileName: 'guide.pdf', fileType: 'application/pdf', fileSize: 12, fileUrl: '/uploads/guide.pdf' } });
    const paths = [String(ticket.id), `${ticket.id}/attachments/${attachment.id}`, `${ticket.id}/actions`, `${ticket.id}/status-history`];
    for (const suffix of paths) {
      const own = await get(`/api/tickets/${suffix}`); expect(own.status).toBe(200); expect(own.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(own.body)).not.toMatch(/PRIVATE_DIAGNOSIS|notes|internalNotesCount|passwordHash/);
      const denied = await get(`/api/tickets/${suffix}`, 'r2'); error(denied, 404, 'NOT_FOUND');
      const missing = await get(`/api/tickets/${suffix.replace(String(ticket.id), '2147483647')}`, 'r2');
      expect(denied.body).toEqual(missing.body);
      expect((await get(`/api/tickets/${suffix}`, 'staff')).status).toBe(200);
    }
    error(await get(`/api/tickets/${ticket.id}?requesterId=${f.ids.r2}`), 400, 'VALIDATION_ERROR');
    await f.db.attachment.update({ where: { id: attachment.id }, data: { isRemoved: true, removalReason: 'Replaced' } });
    error(await get(`/api/tickets/${ticket.id}/attachments/${attachment.id}`), 403, 'FORBIDDEN');
    error(await get(`/api/tickets/${ticket.id}/attachments/${attachment.id}`, 'r2'), 404, 'NOT_FOUND');
  });
  const staffGets = ['/api/staff/dashboard', '/api/staff/actions/mine', '/api/staff/tickets', '/api/staff/users', '/api/staff/tickets/1', '/api/staff/tickets/1/notes', `/api/staff/tickets/1/actions/${randomUUID()}/revisions`, '/api/admin/users', '/api/requesters'];
  it.each(staffGets)('SEC-02: Requester forbidden before lookup at %s', async path => { error(await get(path), 403, 'FORBIDDEN'); });
  it.each(['status', 'owner', 'priority', 'actions'])('SEC-02: Requester cannot mutate staff %s with valid CSRF', async operation => {
    const r = request(app)[operation === 'actions' ? 'post' : 'patch'](`/api/staff/tickets/2147483647/${operation}`).set('Cookie', f.sessions.r1.cookie).set('X-CSRF-Token', f.sessions.r1.csrf);
    error(await r.send({ expectedTicketVersion: 1 }), 403, 'FORBIDDEN');
  });
  it.each(['r1', 'staff', 'admin'] as const)('SEC-05: forced-change %s cannot use any business endpoint but can recover', async actor => {
    await f.db.user.update({ where: { id: f.ids[actor] }, data: { mustChangePassword: true } });
    try {
      for (const path of ['/api/tickets/1', '/api/staff/tickets', '/api/admin/users', '/api/requesters']) error(await get(path, actor), 403, 'PASSWORD_CHANGE_REQUIRED');
      expect((await get('/api/auth/me', actor)).body.mustChangePassword).toBe(true);
    } finally { await f.db.user.update({ where: { id: f.ids[actor] }, data: { mustChangePassword: false } }); }
  });
  it.each(['r1', 'staff', 'admin'] as const)('SEC-05: deactivation invalidates already logged-in %s, including /me', async actor => {
    await f.db.user.update({ where: { id: f.ids[actor] }, data: { isActive: false } });
    try {
      for (const path of ['/api/tickets/1', '/api/staff/tickets', '/api/admin/users', '/api/auth/me']) error(await get(path, actor), 401, 'UNAUTHENTICATED');
    } finally { await f.db.user.update({ where: { id: f.ids[actor] }, data: { isActive: true } }); }
  });
  it('SEC-05: current database role replaces the session role for admin and private-note access', async () => {
    await f.db.user.update({ where: { id: f.ids.admin }, data: { role: 'REQUESTER' } });
    try {
      error(await get('/api/admin/users', 'admin'), 403, 'FORBIDDEN');
      error(await get('/api/staff/tickets/1/notes', 'admin'), 403, 'FORBIDDEN');
      expect((await get('/api/auth/me', 'admin')).body.role).toBe('REQUESTER');
    } finally { await f.db.user.update({ where: { id: f.ids.admin }, data: { role: 'ADMINISTRATOR' } }); }
    expect((await get('/api/admin/users', 'admin')).status).toBe(200);
  });
  it('SEC-05: mandatory password change remains available while business access is blocked', async () => {
    error(await get('/api/tickets', 'forced'), 403, 'PASSWORD_CHANGE_REQUIRED');
    const result = await request(app).post('/api/auth/change-password').set('Cookie', f.sessions.forced.cookie).set('X-CSRF-Token', f.sessions.forced.csrf)
      .send({ currentPassword: 'SecurityPass!123', newPassword: 'ChangedPass!123', confirmPassword: 'ChangedPass!123' });
    expect(result.status).toBe(200); expect(result.body.user.mustChangePassword).toBe(false);
    expect(JSON.stringify(result.body)).not.toMatch(/passwordHash|SecurityPass|ChangedPass/);
    expect((await get('/api/tickets', 'forced')).status).toBe(200);
  });
  it('SEC-06: missing/wrong/another session CSRF rejects every business mutation without writes', async () => {
    const ticket = await f.ticket(), attachment = await f.db.attachment.create({ data: { ticketId: ticket.id, fileName: 'x.pdf', fileType: 'application/pdf', fileSize: 1, fileUrl: '/uploads/x' } });
    const action = await f.db.actionTaken.create({ data: { ticketId: ticket.id, resolutionCycle: 1, performedById: f.ids.staff, assigneeId: f.ids.staff, description: 'Existing' } });
    const mutations = [
      ['post', '/api/tickets', 'r1'], ['post', `/api/tickets/${ticket.id}/comments`, 'r1'], ['post', `/api/tickets/${ticket.id}/attachments`, 'r1'],
      ['delete', `/api/tickets/${ticket.id}/attachments/${attachment.id}`, 'r1'], ['post', `/api/tickets/${ticket.id}/resolved-indicator`, 'r1'],
      ['post', `/api/staff/tickets/${ticket.id}/notes`, 'staff'], ['post', `/api/staff/tickets/${ticket.id}/actions`, 'staff'],
      ['patch', `/api/staff/tickets/${ticket.id}/actions/${action.id}`, 'staff'], ...['status', 'owner', 'priority'].map(op => ['patch', `/api/staff/tickets/${ticket.id}/${op}`, 'staff']),
      ['post', '/api/admin/users', 'admin'], ['patch', `/api/admin/users/${f.ids.r2}`, 'admin'], ['post', `/api/admin/users/${f.ids.r2}/reset-password`, 'admin'],
    ] as const;
    const counts = async () => Promise.all([f.db.ticket.count(), f.db.comment.count(), f.db.note.count(), f.db.attachment.count(), f.db.actionTakenRevision.count(), f.db.actionCreateRequest.count(), f.db.user.findMany({ orderBy: { id: 'asc' } }), f.db.ticket.findUnique({ where: { id: ticket.id } })]);
    const before = await counts();
    for (const [method, path, actor] of mutations) for (const token of [undefined, 'wrong', f.sessions.forced.csrf]) {
      const call = (request(app) as any)[method](path).set('Cookie', f.sessions[actor as keyof typeof f.sessions].cookie);
      if (token) call.set('X-CSRF-Token', token);
      error(await call.send({}), 403, 'FORBIDDEN');
    }
    expect(await counts()).toEqual(before);
  });
  it('SEC-07: successful Action replay is reauthorized after logout/demotion/deactivation/forced change', async () => {
    const ticket = await f.ticket(), key = randomUUID(), session = await f.login('otherStaff');
    const replay = () => request(app).post(`/api/staff/tickets/${ticket.id}/actions`).set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf).set('Idempotency-Key', key).send({ description: 'Receipt secret', expectedTicketVersion: 1 });
    expect((await replay()).status).toBe(201); expect((await replay()).status).toBe(200);
    for (const [data, status, code] of [[{ role: 'REQUESTER' }, 403, 'FORBIDDEN'], [{ isActive: false }, 401, 'UNAUTHENTICATED'], [{ mustChangePassword: true }, 403, 'PASSWORD_CHANGE_REQUIRED']] as const) {
      await f.db.user.update({ where: { id: f.ids.otherStaff }, data });
      error(await replay(), status, code);
      await f.db.user.update({ where: { id: f.ids.otherStaff }, data: { role: 'IT_STAFF', isActive: true, mustChangePassword: false } });
    }
    await request(app).post('/api/auth/logout').set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf);
    error(await replay(), 401, 'UNAUTHENTICATED');
    expect(await f.db.actionCreateRequest.count({ where: { ticketId: ticket.id } })).toBe(1);
  });
  it('SEC-08: creation validation/failure is safe and a database failure has no partial Ticket', async () => {
    const send = (body: object) => request(app).post('/api/tickets').set('Cookie', f.sessions.r1.cookie).set('X-CSRF-Token', f.sessions.r1.csrf).send(body);
    const before = await f.db.ticket.count();
    for (const body of [{}, { ...f.body(), summary: ' ' }, { ...f.body(), requestedPriority: 'urgent' }, { ...f.body(), actorId: f.ids.admin }, { ...f.body(), categoryId: 2147483647 }]) error(await send(body), 400, 'VALIDATION_ERROR');
    await f.db.$executeRawUnsafe(`CREATE FUNCTION sec_fail_ticket() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_DATABASE passwordHash SELECT *'; END $$`);
    await f.db.$executeRawUnsafe(`CREATE TRIGGER sec_fail_ticket BEFORE INSERT ON "Ticket" FOR EACH ROW EXECUTE FUNCTION sec_fail_ticket()`);
    try { error(await send(f.body()), 500, 'INTERNAL_ERROR'); }
    finally { await f.db.$executeRawUnsafe('DROP TRIGGER sec_fail_ticket ON "Ticket"'); await f.db.$executeRawUnsafe('DROP FUNCTION sec_fail_ticket()'); }
    expect(await f.db.ticket.count()).toBe(before);
    const malformed = await request(app).post('/api/tickets').set('Content-Type', 'application/json').send('{bad');
    error(malformed, 400, 'VALIDATION_ERROR');
  });
  it('SEC-08: Internal Notes bind the actor, reject spoofing and never change public activity/version', async () => {
    const ticket = await f.ticket();
    const post = (body: object) => request(app).post(`/api/staff/tickets/${ticket.id}/notes`).set('Cookie', f.sessions.staff.cookie).set('X-CSRF-Token', f.sessions.staff.csrf).send(body);
    error(await post({ content: 'PRIVATE_NOTE', authorId: f.ids.admin }), 400, 'VALIDATION_ERROR');
    const result = await post({ content: '  PRIVATE_NOTE  ' }); expect(result.status).toBe(201); expect(result.body.authorId).toBe(f.ids.staff);
    expect(await f.db.ticket.findUnique({ where: { id: ticket.id } })).toEqual(ticket);
    const detail = await get(`/api/tickets/${ticket.id}`); expect(JSON.stringify(detail.body)).not.toMatch(/PRIVATE_NOTE|notes|internalNotesCount/);
    const comment = await request(app).post(`/api/tickets/${ticket.id}/comments`).set('Cookie', f.sessions.r1.cookie).set('X-CSRF-Token', f.sessions.r1.csrf).send({ content: 'Shared', authorId: f.ids.staff });
    error(comment, 400, 'VALIDATION_ERROR');
  });
});
