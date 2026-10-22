import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient, Role, Ticket } from '@prisma/client';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import { requesterDashboard } from '../../src/services/dashboard';
import { MigrationHarness } from './migration-support';

const serverUrl = process.env.LAB4_DASHBOARD_DATABASE_URL;
const asOf = new Date('2026-10-20T10:00:00.000Z'), since = new Date('2026-10-13T17:00:00.000Z');
const B = new Date(+since - 1), L = since, M = new Date('2026-10-18T05:00:00.000Z'), U = new Date(+asOf - 1), E = asOf;
const ids = { r1: randomUUID(), r2: randomUUID(), r0: randomUUID(), staff: randomUUID(), admin: randomUUID(), forced: randomUUID() };
type Alias = keyof typeof ids;
describe.skipIf(!serverUrl).sequential('Requester dashboard API and drill-down (Lab 4)', () => {
  let directory: string, harness: MigrationHarness, db: PrismaClient, originalUrl: string | undefined;
  const sessions = {} as Record<Alias, { cookie: string; csrf: string }>;
  let tickets: Ticket[];
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'toktickit-lab4-dashboard-')); harness = new MigrationHarness(serverUrl!, directory);
    const url = await harness.database(); harness.deploy(url, true);
    originalUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = url; db = getPrisma();
    await db.category.create({ data: { name: 'Dashboard hardware' } }); await db.relatedSystem.create({ data: { name: 'Dashboard system' } });
    const passwordHash = await bcrypt.hash('DashboardPass!123', 10);
    for (const alias of Object.keys(ids) as Alias[]) {
      const role: Role = alias === 'staff' ? 'IT_STAFF' : alias === 'admin' ? 'ADMINISTRATOR' : 'REQUESTER';
      await db.user.create({ data: { id: ids[alias], email: `${alias}@dashboard.invalid`, name: alias, role, passwordHash, isActive: true, mustChangePassword: alias === 'forced' } });
      const login = await request(app).post('/api/auth/login').send({ email: `${alias}@dashboard.invalid`, password: 'DashboardPass!123' });
      expect(login.status).toBe(200); sessions[alias] = { cookie: login.headers['set-cookie'][0], csrf: login.body.csrfToken };
    }
  }, 60000);
  beforeEach(async () => {
    await db.comment.deleteMany(); await db.note.deleteMany(); await db.ticket.deleteMany();
    await db.user.update({ where: { id: ids.r1 }, data: { role: 'REQUESTER', isActive: true, mustChangePassword: false } });
    const rows: [Alias, string, string, Date, Date | null, string | null][] = [
      ['r1', 'New', 'Low', B, null, 'Low'], ['r1', 'Open', 'Medium', L, null, 'Medium'],
      ['r1', 'In Progress', 'High', M, null, 'High'], ['r1', 'Waiting for Requester', 'High', U, null, null],
      ['r1', 'Resolved', 'Low', M, L, 'Low'], ['r1', 'Closed', 'Medium', M, B, 'Medium'],
      ['r2', 'Reopened', 'High', E, null, 'High'], ['r2', 'Cancelled', 'Low', M, null, 'Low'],
      ['r2', 'Resolved', 'High', M, null, 'High'], ['r2', 'Closed', 'Medium', E, E, 'Medium'], ['r1', 'Resolved', 'High', U, U, 'High'],
    ];
    tickets = [];
    for (const [requester, currentStatus, requestedPriority, updatedAt, resolvedAt, itPriority] of rows) {
      tickets.push(await db.ticket.create({ data: { ticketNumber: `T${tickets.length + 1}`, summary: `Ticket ${tickets.length + 1}`, description: 'Shared description', requesterId: ids[requester], currentStatus, requestedPriority, itPriority, categoryId: 1, relatedSystemId: 1, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt, resolvedAt } }));
    }
    await db.note.create({ data: { ticketId: tickets[3].id, authorId: ids.staff, content: 'PRIVATE_DASHBOARD_SENTINEL' } });
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(asOf);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  afterAll(async () => {
    await db?.$disconnect(); if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
    try { await harness?.close(); } finally { if (directory && resolve(dirname(directory)) === resolve(tmpdir()) && basename(directory).startsWith('toktickit-lab4-dashboard-')) rmSync(directory, { recursive: true, force: true }); }
  }, 60000);
  const get = (path = '/api/dashboard/requester', actor: Alias = 'r1') => request(app).get(path).set('Cookie', sessions[actor].cookie);
  const numbers = (list: { ticketNumber: string }[]) => list.map(t => t.ticketNumber);
  it('DASH-01: exact independent fixture counts, ordering, fallback and private-field projection', async () => {
    const result = await get(); expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toMatchObject({ asOf: asOf.toISOString(), timeZone: 'Asia/Bangkok', window: { since: since.toISOString(), before: asOf.toISOString() }, metrics: { openTickets: 4, waitingForRequester: 1, recentlyUpdated: 6, recentlyResolved: 2 } });
    expect(numbers(result.body.attentionTickets)).toEqual(['T4']); expect(numbers(result.body.recentTickets)).toEqual(['T11', 'T4', 'T6', 'T5', 'T3']);
    expect(result.body.attentionTickets[0].itPriority).toBe('High');
    expect(Object.keys(result.body.attentionTickets[0]).sort()).toEqual(['id', 'ticketNumber', 'summary', 'currentStatus', 'itPriority', 'updatedAt', 'resolvedAt'].sort());
    expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE_|password|email|notes|requesterId/i);
    const other = await get(undefined, 'r2'); expect(other.body.metrics).toEqual({ openTickets: 1, waitingForRequester: 0, recentlyUpdated: 2, recentlyResolved: 0 });
    expect(numbers(other.body.recentTickets)).toEqual(['T9', 'T8']);
  });
  it('DASH-02/06: genuine zero/empty response, including a wholly empty ticket table', async () => {
    for (const actor of ['r0', 'r1'] as const) {
      if (actor === 'r1') { await db.note.deleteMany(); await db.ticket.deleteMany(); }
      const result = await get(undefined, actor); expect(result.status).toBe(200);
      expect(result.body.metrics).toEqual({ openTickets: 0, waitingForRequester: 0, recentlyUpdated: 0, recentlyResolved: 0 });
      expect(result.body.attentionTickets).toEqual([]); expect(result.body.recentTickets).toEqual([]);
    }
  });
  it('caps both previews at five while counts include all matches', async () => {
    await db.ticket.createMany({ data: Array.from({ length: 7 }, (_, index) => ({ ticketNumber: `WAIT-${index}`, summary: 'More waiting', description: '', requesterId: ids.r1, currentStatus: 'Waiting for Requester', requestedPriority: 'Low', categoryId: 1, relatedSystemId: 1, updatedAt: U })) });
    const result = await get(); expect(result.body.metrics.waitingForRequester).toBe(8); expect(result.body.attentionTickets).toHaveLength(5); expect(result.body.recentTickets).toHaveLength(5);
    expect(numbers(result.body.attentionTickets)).toEqual(['WAIT-6', 'WAIT-5', 'WAIT-4', 'WAIT-3', 'WAIT-2']);
  });
  it('DASH-05: each drill-down matches its metric and independent ordered fixture IDs', async () => {
    const cases = [
      [{ statusGroup: 'active' }, ['T4', 'T3', 'T2', 'T1']],
      [{ status: 'Waiting for Requester' }, ['T4']],
      [{ updatedFrom: since.toISOString(), updatedBefore: asOf.toISOString(), sort: '-updatedAt' }, ['T11', 'T4', 'T6', 'T5', 'T3', 'T2']],
      [{ statusGroup: 'resolved', resolvedFrom: since.toISOString(), resolvedBefore: asOf.toISOString(), sort: '-resolvedAt' }, ['T11', 'T5']],
    ] as const;
    for (const [query, expected] of cases) {
      const result = await get('/api/tickets?' + new URLSearchParams(query)); expect(result.status).toBe(200);
      expect(result.body.meta.total).toBe(expected.length); expect(numbers(result.body.data)).toEqual(expected);
      expect(result.body.data.every((t: Ticket) => t.requesterId === ids.r1)).toBe(true);
    }
    const page = await get('/api/tickets?statusGroup=active&limit=2&page=2'); expect(numbers(page.body.data)).toEqual(['T2', 'T1']); expect(page.body.meta).toEqual({ total: 4, page: 2, limit: 2, totalPages: 2 });
    expect((await get('/api/tickets?page=99')).body.data).toEqual([]);
    const nulls = await get('/api/tickets?sort=resolvedAt'); expect(numbers(nulls.body.data).slice(0, 3)).toEqual(['T6', 'T5', 'T11']);
    expect((await get('/api/tickets?search=Ticket%204&status=waiting_for_requester')).body.meta.total).toBe(1);
  });
  it.each(['requesterId=someone-else', 'timeZone=UTC', 'since=2020-01-01'])('rejects dashboard identity/window overrides: %s', async query => {
    const result = await get('/api/dashboard/requester?' + query); expect(result.status).toBe(400); expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });
  it.each(['requesterId=someone-else', 'status=New&statusGroup=active', 'updatedFrom=2026-10-20', 'updatedFrom=2026-02-30T00%3A00%3A00Z', 'resolvedFrom=2026-10-20T00%3A00%3A00Z&resolvedBefore=2026-10-19T00%3A00%3A00Z', 'limit=51', 'page=-1', 'sort=notes', 'status=New&status=Closed'])('rejects malformed list filters: %s', async query => {
    const result = await get('/api/tickets?' + query); expect(result.status).toBe(400); expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('enforces session, current role, activation and password-change state on both views', async () => {
    for (const path of ['/api/dashboard/requester', '/api/tickets']) {
      expect((await request(app).get(path + '?requesterId=' + ids.r1)).status).toBe(401);
      for (const actor of ['staff', 'admin', 'forced'] as const) expect((await get(path, actor)).status).toBe(403);
    }
    await db.user.update({ where: { id: ids.r1 }, data: { role: 'IT_STAFF' } }); expect((await get()).status).toBe(403);
    await db.user.update({ where: { id: ids.r1 }, data: { isActive: false } }); expect((await get()).status).toBe(401);
    await db.user.update({ where: { id: ids.r1 }, data: { isActive: true, role: 'REQUESTER', mustChangePassword: true } }); expect((await get()).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
  it('DASH-06: aggregates and previews use one snapshot during a concurrent update', async () => {
    const writer = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
    let armed = true;
    const extended = db.$extends({ query: { ticket: { async count({ args, query }) {
      const result = await query(args);
      if (armed) { armed = false; await writer.ticket.update({ where: { id: tickets[3].id }, data: { currentStatus: 'Cancelled' } }); }
      return result;
    } } } });
    try {
      const snapshot = await requesterDashboard(extended as unknown as PrismaClient, ids.r1, asOf);
      expect(snapshot.metrics.openTickets).toBe(4); expect(snapshot.metrics.waitingForRequester).toBe(1); expect(numbers(snapshot.attentionTickets)).toEqual(['T4']);
      expect((await get()).body.metrics.waitingForRequester).toBe(0);
    } finally { await writer.$disconnect(); }
  });
  it('refreshes after public activity; private notes do not change requester-visible metrics', async () => {
    const path = `/api/tickets/${tickets[0].id}/comments`;
    const comment = await request(app).post(path).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).send({ content: 'Public follow-up' }); expect(comment.status).toBe(201);
    vi.setSystemTime(new Date(+asOf + 1)); const afterPublic = await get(); expect(afterPublic.body.metrics.recentlyUpdated).toBe(7); expect(afterPublic.body.recentTickets[0].ticketNumber).toBe('T1');
    const note = await request(app).post(`/api/staff/tickets/${tickets[1].id}/notes`).set('Cookie', sessions.staff.cookie).set('X-CSRF-Token', sessions.staff.csrf).send({ content: 'PRIVATE_NOTE_UPDATE' }); expect(note.status).toBe(201);
    expect((await get()).body).toEqual(afterPublic.body);
  });
});
