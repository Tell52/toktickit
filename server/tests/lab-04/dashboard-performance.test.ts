import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { app } from '../../src/app';
import { SecurityFixture, securityUrl } from './security-support';

describe.skipIf(!securityUrl).sequential('Lab 4 bounded dashboard performance smoke', () => {
  const f = new SecurityFixture();
  let measured = false;
  let queries: { model?: string; action: string; args: any }[] = [];
  const baselineQueries: Record<string, number> = {};
  const statuses = ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened', 'Resolved', 'Closed', 'Cancelled'];
  beforeAll(async () => {
    await f.setup();
    f.db.$use(async (params, next) => { if (measured) queries.push({ model: params.model, action: params.action, args: params.args }); return next(params); });
    // Compare the same HTTP routes before/after growing the fixture, not query
    // counts from a service call that omits authentication overhead.
    for (const actor of ['r1', 'staff', 'admin'] as const) {
      queries = []; measured = true;
      const result = await request(app).get(actor === 'r1' ? '/api/dashboard/requester' : '/api/staff/dashboard').set('Cookie', f.sessions[actor].cookie);
      measured = false; expect(result.status).toBe(200); baselineQueries[actor] = queries.length;
    }
    for (let start = 0; start < 10_000; start += 1000) {
      await f.db.ticket.createMany({ data: Array.from({ length: 1000 }, (_, j) => {
        const i = start + j;
        return { ticketNumber: `PERF-${i}`, summary: `Performance Ticket ${i}`, description: 'Synthetic benchmark only', requestedPriority: ['Low', 'Medium', 'High'][i % 3], itPriority: i % 4 ? null : 'High', currentStatus: statuses[i % 8], requesterId: i % 2 ? f.ids.r1 : f.ids.r2, ownerId: i % 3 ? f.ids.staff : null, categoryId: f.categoryId, relatedSystemId: f.relatedSystemId };
      }) });
    }
    const tickets = await f.db.ticket.findMany({ select: { id: true, currentStatus: true } });
    for (let start = 0; start < tickets.length; start += 300) {
      await f.db.actionTaken.createMany({ data: tickets.slice(start, start + 300).flatMap(t => [0, 1, 2].map(j => {
        const terminal = ['Resolved', 'Closed', 'Cancelled'].includes(t.currentStatus);
        return { ticketId: t.id, resolutionCycle: 1, performedById: f.ids.otherStaff, assigneeId: j % 2 ? f.ids.admin : f.ids.staff,
          status: terminal || j === 2 ? 'COMPLETED' as const : 'PLANNED' as const, result: terminal || j === 2 ? 'Synthetic result' : null, description: 'Synthetic action' };
      })) });
    }
    await f.db.$executeRaw`ANALYZE "Ticket"`; await f.db.$executeRaw`ANALYZE "ActionTaken"`;
  }, 120_000);
  afterAll(() => f.close(), 60_000);
  it('PERF-01/02: 10k Tickets/30k Actions, five warmups and twenty sequential HTTP measurements per role', async () => {
    expect(await f.db.ticket.count()).toBe(10_000); expect(await f.db.actionTaken.count()).toBe(30_000);
    const report: any = { recordedAt: new Date().toISOString(), environment: { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryGiB: +(totalmem() / 2 ** 30).toFixed(1), postgres: await f.db.$queryRaw`SHOW server_version` },
      volume: { tickets: 10_000, actions: 30_000 }, emptyFixtureQueryCounts: baselineQueries, warmups: 5, samples: 20, thresholdMs: 1000, percentiles: 'nearest rank: sorted[ceil(0.95*n)-1]', endpoints: [] };
    const cases = [['/api/dashboard/requester', 'r1'], ['/api/staff/dashboard', 'staff'], ['/api/staff/dashboard', 'admin']] as const;
    for (const [path, actor] of cases) {
      const call = () => request(app).get(path).set('Cookie', f.sessions[actor].cookie);
      for (let i = 0; i < 5; i++) expect((await call()).status).toBe(200);
      const durations: number[] = [], counts: number[] = [], bytes: number[] = [];
      for (let i = 0; i < 20; i++) {
        queries = []; measured = true; const begin = performance.now();
        const result = await call(); const elapsed = performance.now() - begin; measured = false;
        expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('no-store');
        durations.push(+elapsed.toFixed(3)); counts.push(queries.length); bytes.push(Buffer.byteLength(JSON.stringify(result.body)));
        for (const q of queries.filter(q => q.action === 'findMany')) {
          // By-ID projection after a raw LIMIT is bounded too; no whole-table app filtering.
          expect(q.args.take && q.args.take <= 50 || q.args.where?.id?.in?.length <= 5, JSON.stringify(q)).toBeTruthy();
        }
        expect(queries.length).toBeLessThanOrEqual(20);
        expect(queries.length).toBe(baselineQueries[actor]);
        if (actor === 'r1') { expect(result.body.recentTickets).toHaveLength(5); expect(result.body.attentionTickets.length).toBeLessThanOrEqual(5); }
        else { expect(result.body.urgentTickets).toHaveLength(5); expect(result.body.recentTickets).toHaveLength(5); expect(result.body.myActions.actions).toHaveLength(5); expect(result.body.myActions.pagination.pageSize).toBe(5); }
      }
      const sorted = [...durations].sort((a, b) => a - b), p95 = sorted[Math.ceil(.95 * sorted.length) - 1];
      report.endpoints.push({ path, role: actor, durationsMs: durations, p95Ms: p95, maxMs: sorted.at(-1), queriesPerRequest: counts, responseBytes: bytes });
    }
    const destination = resolve('..', 'test-results', 'lab4-dashboard-performance.json'); mkdirSync(resolve(destination, '..'), { recursive: true });
    writeFileSync(destination, JSON.stringify(report, null, 2));
    for (const row of report.endpoints) expect(row.p95Ms, `${row.role}: ${row.path}; see ${destination}`).toBeLessThan(1000);
  }, 120_000);
});
