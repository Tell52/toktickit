import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import { MigrationHarness } from './migration-support';
import { staffDashboard } from '../../src/services/staff-dashboard';
import { ACTIVE_STATUSES } from '../../src/services/dashboard';

const serverUrl = process.env.LAB4_DASHBOARD_DATABASE_URL;
describe.skipIf(!serverUrl).sequential('Staff dashboard and queue drill-down', () => {
  let db: PrismaClient, harness: MigrationHarness, oldUrl: string | undefined;
  const ids = { staff: randomUUID(), admin: randomUUID(), requester: randomUUID() };
  const cookies: Record<string, string> = {};
  const asOf = new Date('2026-10-20T10:00:00Z'), since = new Date('2026-10-13T17:00:00Z');
  beforeAll(async () => {
    harness = new MigrationHarness(serverUrl!, mkdtempSync(join(tmpdir(), 'toktickit-staff-dashboard-')));
    const url = await harness.database(); harness.deploy(url, true); oldUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = url; db = getPrisma();
    const passwordHash = await bcrypt.hash('StaffDashboard123!', 10);
    for (const [name, id] of Object.entries(ids)) {
      await db.user.create({ data: { id, name, email: `${name}@staff-dashboard.invalid`, passwordHash, role: name === 'staff' ? 'IT_STAFF' : name === 'admin' ? 'ADMINISTRATOR' : 'REQUESTER', mustChangePassword: false } });
      const login = await request(app).post('/api/auth/login').send({ email: `${name}@staff-dashboard.invalid`, password: 'StaffDashboard123!' });
      expect(login.status).toBe(200); cookies[name] = login.headers['set-cookie'][0];
    }
    const category = await db.category.create({ data: { name: 'Hardware' } }), system = await db.relatedSystem.create({ data: { name: 'Laptop' } });
    for (let i = 0; i < 12; i++) {
      const status = ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened', 'Resolved', 'Closed', 'Cancelled'][i % 8];
      const ticket = await db.ticket.create({ data: { ticketNumber: `STAFF-${i}`, summary: `Support ${i}`, description: 'Description', requesterId: ids.requester, ownerId: i % 3 === 0 ? null : i % 3 === 1 ? ids.staff : ids.admin, currentStatus: status, categoryId: category.id, relatedSystemId: system.id, requestedPriority: i % 2 ? 'Low' : 'High', itPriority: i === 0 ? 'Medium' : null, resolutionCycle: 2, updatedAt: i === 0 ? new Date(+since - 1) : i === 1 ? since : i === 2 ? asOf : new Date(+asOf - 1) } });
      for (const [cycle, assignee, state] of [[2, ids.staff, 'PLANNED'], [1, ids.staff, 'PLANNED'], [2, ids.staff, 'COMPLETED'], [2, ids.admin, 'IN_PROGRESS']] as const) {
        await db.actionTaken.create({ data: { ticketId: ticket.id, resolutionCycle: cycle, performedById: ids.admin, assigneeId: assignee, status: state, result: state === 'COMPLETED' ? 'Done' : null, description: 'Investigate', actionAt: since } });
      }
    }
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(asOf);
  }, 60000);
  afterAll(async () => { vi.useRealTimers(); await db?.$disconnect(); if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl; await harness?.close(); }, 60000);
  const get = (path = '/api/staff/dashboard', actor = 'staff') => request(app).get(path).set('Cookie', cookies[actor]);
  it('matches independent counts, boundaries, zero buckets and bounded ordered previews', async () => {
    const res = await get(); expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.window).toEqual({ since: since.toISOString(), before: asOf.toISOString() });
    expect(res.body.metrics).toMatchObject({ recentlyUpdated: 10, myActiveActions: 9 });
    expect(Object.values(res.body.metrics.byStatus).reduce((a: number, b: any) => a + b, 0)).toBe(12);
    expect(res.body.metrics.byPriority).toEqual({ Low: 4, Medium: 1, High: 4 });
    expect(res.body.metrics.unassignedTickets).toBe(await db.ticket.count({ where: { ownerId: null, currentStatus: { in: ACTIVE_STATUSES } } }));
    expect(res.body.metrics.myTickets).toBe(await db.ticket.count({ where: { ownerId: ids.staff, currentStatus: { in: ACTIVE_STATUSES } } }));
    expect(res.body.recentTickets).toHaveLength(5); expect(res.body.urgentTickets).toHaveLength(4);
    expect(res.body.myActions.actions).toHaveLength(5); expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|email|Internal Note/);
    expect(res.body.myActions.actions.every((a: any) => a.assignee.id === ids.staff && a.performedBy.id === ids.admin && a.resolutionCycle === 2 && a.status === 'PLANNED')).toBe(true);
  });
  it('administrator uses their own assignment and owner scope', async () => {
    const res = await get('/api/staff/dashboard', 'admin'); expect(res.status).toBe(200);
    expect(res.body.metrics.myActiveActions).toBe(9);
    expect(res.body.myActions.actions.every((a: any) => a.assignee.id === ids.admin && a.status === 'IN_PROGRESS')).toBe(true);
    expect(res.body.metrics.myTickets).toBe(await db.ticket.count({ where: { ownerId: ids.admin, currentStatus: { in: ACTIVE_STATUSES } } }));
  });
  it('paginates current-cycle actions without duplicates and permits beyond-last pages', async () => {
    const first = await get('/api/staff/actions/mine'), second = await get('/api/staff/actions/mine?page=2');
    expect(second.body.pagination).toEqual({ page: 2, pageSize: 5, totalCount: 9 });
    expect(new Set([...first.body.actions, ...second.body.actions].map(a => a.id)).size).toBe(9);
    expect((await get('/api/staff/actions/mine?page=3')).body.actions).toEqual([]);
  });
  it('every status, priority and top metric queue filter matches dashboard counts', async () => {
    const { body: data } = await get();
    const cases: [Record<string, string>, number][] = [[{ statusGroup: 'active', owner: 'unassigned' }, data.metrics.unassignedTickets], [{ statusGroup: 'active', owner: 'me' }, data.metrics.myTickets], [{ updatedFrom: data.window.since, updatedBefore: data.window.before, sort: '-updatedAt' }, data.metrics.recentlyUpdated]];
    for (const [status, count] of Object.entries(data.metrics.byStatus)) cases.push([{ status }, Number(count)]);
    for (const [priority, count] of Object.entries(data.metrics.byPriority)) cases.push([{ statusGroup: 'active', priority }, Number(count)]);
    for (const [query, total] of cases) { const res = await get(`/api/staff/tickets?${new URLSearchParams(query)}`); expect(res.status).toBe(200); expect(res.body.pagination.totalCount).toBe(total); }
  });
  it.each(['/api/staff/dashboard?owner=me', '/api/staff/actions/mine?assigneeId=other', '/api/staff/actions/mine?page=0', '/api/staff/actions/mine?page=2.1', '/api/staff/tickets?statusGroup=active&status=Open', '/api/staff/tickets?updatedFrom=2026-02-30T00:00:00Z', '/api/staff/tickets?resolvedFrom=2026-10-20T00:00:00Z&resolvedBefore=2026-10-19T00:00:00Z'])('rejects malformed or spoofed query %s', async path => { expect((await get(path)).status).toBe(400); });
  it.each(['/api/staff/dashboard', '/api/staff/actions/mine'])('enforces session and current role on %s', async path => {
    expect((await request(app).get(path)).status).toBe(401); expect((await get(path, 'requester')).status).toBe(403);
    for (const data of [{ isActive: false }, { mustChangePassword: true }, { role: 'REQUESTER' as const }]) {
      await db.user.update({ where: { id: ids.staff }, data });
      expect((await get(path)).status).toBe('isActive' in data ? 401 : 403);
      await db.user.update({ where: { id: ids.staff }, data: { isActive: true, mustChangePassword: false, role: 'IT_STAFF' } });
    }
  });
  it('keeps aggregates, previews and actions in a single snapshot during concurrent writes', async () => {
    const writer = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
    const ticket = await db.ticket.findFirstOrThrow({ where: { ticketNumber: 'STAFF-1' } });
    let armed = true;
    const extended = db.$extends({ query: { ticket: { async count({ args, query }) {
      const result = await query(args);
      if (armed) { armed = false; await writer.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'Closed' } }); }
      return result;
    } } } });
    try {
      const snapshot = await staffDashboard(extended as unknown as PrismaClient, ids.staff, asOf);
      expect(snapshot.metrics.myActiveActions).toBe(9); expect(snapshot.metrics.byStatus.Open).toBe(2);
      const fresh = await get(); expect(fresh.body.metrics.myActiveActions).toBe(8); expect(fresh.body.metrics.byStatus.Open).toBe(1);
    } finally { await writer.$disconnect(); }
  });
  it('retains every zero bucket and empty preview in an empty database', async () => {
    await db.actionTaken.deleteMany(); await db.ticket.deleteMany();
    const { body } = await get();
    expect(body.metrics).toMatchObject({ unassignedTickets: 0, myTickets: 0, recentlyUpdated: 0, myActiveActions: 0, byPriority: { Low: 0, Medium: 0, High: 0 } });
    expect(Object.keys(body.metrics.byStatus)).toHaveLength(8); expect(Object.values(body.metrics.byStatus).every(value => value === 0)).toBe(true);
    expect(body.urgentTickets).toEqual([]); expect(body.recentTickets).toEqual([]); expect(body.myActions.actions).toEqual([]);
  });

});
