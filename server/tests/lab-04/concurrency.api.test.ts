import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request, { Response } from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../../src/app';
import { SecurityFixture, securityUrl } from './security-support';

describe.skipIf(!securityUrl).sequential('Lab 4 legacy mutation concurrency hardening', () => {
  const f = new SecurityFixture();
  beforeAll(() => f.setup(), 60_000); afterAll(() => f.close(), 60_000);
  async function waitForLock(table: 'User' | 'Ticket') {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await f.db.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${`%FROM "${table}"%`} AND query LIKE '%FOR UPDATE%'`);
      if (row.count) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Expected a blocked ${table} row lock`);
  }
  it.each([{ isActive: false }, { mustChangePassword: true }])('CON-04: creation rechecks account change $isActive/$mustChangePassword after waiting', async data => {
    let signal!: () => void, release!: () => void;
    const locked = new Promise<void>(r => { signal = r; }), commit = new Promise<void>(r => { release = r; });
    const before = await f.db.ticket.count();
    const holder = f.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${f.ids.r1} FOR UPDATE`;
      signal(); await commit; await tx.user.update({ where: { id: f.ids.r1 }, data });
    }, { timeout: 15_000 });
    let pending: Promise<Response> | undefined;
    try {
      await locked;
      pending = request(app).post('/api/tickets').set('Cookie', f.sessions.r1.cookie).set('X-CSRF-Token', f.sessions.r1.csrf).send(f.body()).then(r => r);
      await waitForLock('User'); release(); await holder;
      const result = await pending;
      expect(result.status).toBe('isActive' in data ? 401 : 403);
      expect(result.body.error.code).toBe('isActive' in data ? 'UNAUTHENTICATED' : 'PASSWORD_CHANGE_REQUIRED');
      expect(await f.db.ticket.count()).toBe(before);
    } finally {
      release(); await holder; await pending;
      await f.db.user.update({ where: { id: f.ids.r1 }, data: { isActive: true, mustChangePassword: false } });
    }
  });
  it.each([{ role: 'REQUESTER' as const }, { isActive: false }])('CON-04: private-note writer reauthorizes after a committed role/activation change', async data => {
    const ticket = await f.ticket();
    let signal!: () => void, release!: () => void;
    const locked = new Promise<void>(r => { signal = r; }), commit = new Promise<void>(r => { release = r; });
    const holder = f.db.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticket.id} FOR UPDATE`; signal(); await commit; }, { timeout: 15_000 });
    let pending: Promise<Response> | undefined;
    try {
      await locked;
      pending = request(app).post(`/api/staff/tickets/${ticket.id}/notes`).set('Cookie', f.sessions.staff.cookie).set('X-CSRF-Token', f.sessions.staff.csrf).send({ content: 'Must not be recorded' }).then(r => r);
      await waitForLock('Ticket');
      await f.db.user.update({ where: { id: f.ids.staff }, data }); release(); await holder;
      expect((await pending).status).toBe('role' in data ? 403 : 401);
      expect(await f.db.note.count({ where: { ticketId: ticket.id } })).toBe(0);
      expect(await f.db.ticket.findUnique({ where: { id: ticket.id } })).toEqual(ticket);
    } finally {
      release(); await holder; await pending;
      await f.db.user.update({ where: { id: f.ids.staff }, data: { role: 'IT_STAFF', isActive: true } });
    }
  });
  it('CON-01: simultaneous authenticated Ticket creation preserves distinct work and unique numbers', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => request(app).post('/api/tickets').set('Cookie', f.sessions.r1.cookie).set('X-CSRF-Token', f.sessions.r1.csrf).send({ ...f.body(), summary: `Concurrent report ${i}` })));
    expect(results.map(r => r.status)).toEqual(Array(6).fill(201));
    expect(new Set(results.map(r => r.body.ticketNumber)).size).toBe(6);
    const rows = await f.db.ticket.findMany({ where: { id: { in: results.map(r => r.body.id) } } });
    expect(rows).toHaveLength(6); expect(rows.every(t => t.requesterId === f.ids.r1 && t.version === 1)).toBe(true);
  });
});
