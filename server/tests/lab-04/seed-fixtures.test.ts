import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import bcrypt from 'bcrypt';
import { buildLab4Fixtures, fixtureAsOf, fixtureEmail, fixtureId, fixtureTicketNumber, seedLab4Fixtures } from '../../prisma/lab4-fixtures';
import { MigrationHarness, serverRoot } from './migration-support';

const databaseUrl = process.env.LAB4_MIGRATION_DATABASE_URL;
const tables = ['Category', 'RelatedSystem', 'User', 'Ticket', 'Attachment', 'Comment', 'Note', 'ActionTaken', 'ActionTakenRevision', 'TicketStatusEvent', 'ActionCreateRequest'];
async function snapshot(db: PrismaClient) {
  const result: Record<string, unknown> = {};
  for (const table of tables) result[table] = await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY "id"`);
  return result;
}

function seedCli(url: string, fixtureProfile?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url };
  if (fixtureProfile) env.LAB4_FIXTURE_DATABASE_URL = url;
  const result = spawnSync(process.execPath, [
    join(serverRoot, 'node_modules/tsx/dist/cli.mjs'),
    join(serverRoot, 'prisma', fixtureProfile ? 'seed-lab4-fixtures.ts' : 'seed.ts'),
    ...(fixtureProfile ? [fixtureProfile] : []),
  ], { cwd: serverRoot, env, encoding: 'utf8', timeout: 60_000 });
  if (result.error || result.status !== 0) throw new Error(`Seed failed: ${result.error?.message ?? result.stderr}\n${result.stdout}`);
  return result.stdout;
}

async function requesterMetrics(db: PrismaClient, requesterId: string, since: Date, asOf: Date) {
  const rows = await db.$queryRaw<Record<string, number>[]>`
    SELECT count(*) FILTER (WHERE "currentStatus" IN ('New','Open','In Progress','Waiting for Requester','Reopened'))::int AS "openTickets",
      count(*) FILTER (WHERE "currentStatus" = 'Waiting for Requester')::int AS "waitingForRequester",
      count(*) FILTER (WHERE "updatedAt" >= ${since} AND "updatedAt" < ${asOf})::int AS "recentlyUpdated",
      count(*) FILTER (WHERE "currentStatus" IN ('Resolved','Closed') AND "resolvedAt" >= ${since} AND "resolvedAt" < ${asOf})::int AS "recentlyResolved"
    FROM "Ticket" WHERE "requesterId" = ${requesterId}`;
  return rows[0];
}

describe.skipIf(!databaseUrl).sequential('Lab 4 seed and dashboard fixtures', () => {
  let directory: string;
  let harness: MigrationHarness;
  let metrics: PrismaClient;
  const clients: PrismaClient[] = [];
  async function fresh() {
    const url = await harness.database();
    harness.deploy(url, true);
    const db = harness.client(url);
    clients.push(db);
    return { url, db };
  }
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'toktickit-lab4-seed-'));
    harness = new MigrationHarness(databaseUrl!, directory);
  });
  afterEach(async () => {
    await Promise.all(clients.map(client => client.$disconnect()));
  });
  afterAll(async () => {
    await Promise.all(clients.map(client => client.$disconnect()));
    try { await harness?.close(); }
    finally {
      if (directory && resolve(dirname(directory)) === resolve(tmpdir()) && basename(directory).startsWith('toktickit-lab4-seed-')) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }, 60_000);

  it('MIG-04 / SEED-01: normal CLI extends the legacy seed, and repeated runs preserve every stored value', async () => {
    const { url, db } = await fresh();
    seedCli(url);
    expect(await db.ticket.count()).toBe(12); // one original + eleven Lab 4 demo Tickets
    expect(await db.user.count()).toBe(18); // ten original + eight Lab 4 users
    expect(await db.comment.count()).toBe(1);
    expect(await db.note.count()).toBe(1);
    expect(await db.actionTaken.count()).toBe(8);
    expect(await db.actionTakenRevision.count()).toBe(15);
    expect(await db.ticketStatusEvent.count()).toBe(1);
    expect(await db.actionCreateRequest.count()).toBe(0); // never manufacture replay receipts
    const before = await snapshot(db);
    seedCli(url);
    expect(await snapshot(db)).toEqual(before);
    await seedLab4Fixtures(db, { now: new Date('2030-01-01T10:00:00Z') });
    expect(await snapshot(db)).toEqual(before); // do not slide demo timestamps on rerun
  }, 60_000);

  it('MIG-04 / SEED-02: passwords, user edits, related work and changed action history survive reseeding', async () => {
    const { url, db } = await fresh();
    seedCli(url);
    const userId = fixtureId('demo', 'S1');
    const changedHash = await bcrypt.hash('UserChanged!123', 10);
    await db.user.update({ where: { id: userId }, data: { name: 'User-edited name', email: 'edited.fixture@example.com', passwordHash: changedHash, mustChangePassword: false, isActive: false, role: 'REQUESTER' } });
    await db.user.update({ where: { email: 'admin@example.com' }, data: { passwordHash: changedHash, name: 'Existing admin edit', mustChangePassword: false } });
    const ticket = await db.ticket.update({ where: { ticketNumber: fixtureTicketNumber('demo', 'T3') }, data: { summary: 'User-edited Ticket', ownerId: null, resolutionCycle: 2, version: { increment: 1 } } });
    const action = await db.actionTaken.update({ where: { id: fixtureId('demo', 'X1') }, data: { description: 'User-edited action', version: { increment: 1 } } });
    const { id, version, ticketId, createdAt, updatedAt, ...current } = action;
    await db.actionTakenRevision.create({ data: { actionId: id, revision: version, actorId: fixtureId('demo', 'S2'), snapshot: JSON.parse(JSON.stringify(current)) } });
    await db.actionTaken.create({ data: { ticketId: ticket.id, resolutionCycle: 2, description: 'New work after demonstration', performedById: fixtureId('demo', 'S2'), assigneeId: fixtureId('demo', 'S2') } });
    await db.comment.create({ data: { ticketId: ticket.id, authorId: fixtureId('demo', 'R1'), content: 'Unrelated public work' } });
    await db.note.create({ data: { ticketId: ticket.id, authorId: fixtureId('demo', 'S2'), content: 'Unrelated private work' } });
    await db.attachment.create({ data: { ticketId: ticket.id, fileName: 'user.pdf', fileType: 'application/pdf', fileSize: 10, fileUrl: '/uploads/user.pdf' } });
    const before = await snapshot(db);
    seedCli(url);
    expect(await snapshot(db)).toEqual(before);
    expect(await bcrypt.compare('UserChanged!123', (await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash)).toBe(true);
  }, 60_000);

  it('SEED-03: deterministic CLI creates the exact 11-Ticket dashboard fixture and role/priority/action coverage', async () => {
    const { url, db } = await fresh();
    metrics = db;
    const output = seedCli(url, 'dashboard');
    expect(JSON.parse(output)).toMatchObject({ created: 11, skipped: 0, asOf: '2026-10-20T10:00:00.000Z', since: '2026-10-13T17:00:00.000Z' });
    expect(await db.user.count()).toBe(8);
    expect(await db.ticket.count()).toBe(11);
    expect(await db.actionTaken.count()).toBe(8);
    const statuses = await db.ticket.findMany({ select: { currentStatus: true }, distinct: ['currentStatus'] });
    expect(statuses.map(x => x.currentStatus).sort()).toEqual(['New', 'Open', 'In Progress', 'Waiting for Requester', 'Resolved', 'Closed', 'Reopened', 'Cancelled'].sort());
    expect((await db.actionTaken.findMany({ select: { status: true }, distinct: ['status'] })).map(x => x.status).sort()).toEqual(['CANCELLED', 'COMPLETED', 'IN_PROGRESS', 'PLANNED']);
    const counts = await db.ticket.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { actions: true } } } });
    expect(counts.map(t => t._count.actions)).toEqual([0, 0, 4, 0, 1, 0, 3, 0, 0, 0, 0]);
    expect(counts[3].itPriority).toBeNull();
    expect(counts[8].resolvedAt).toBeNull();
    expect(counts[6].resolutionCycle).toBe(2);
    expect((await db.user.findUniqueOrThrow({ where: { id: fixtureId('dashboard', 'S0') } })).isActive).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: fixtureId('dashboard', 'P1') } })).mustChangePassword).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: fixtureId('dashboard', 'R1') } })).mustChangePassword).toBe(false);
    const before = await snapshot(db);
    seedCli(url, 'dashboard');
    expect(await snapshot(db)).toEqual(before);
  }, 60_000);

  it('SEED-04: independent SQL proves the documented requester/staff counts, ordering and ownership predicates', async () => {
    const since = new Date('2026-10-13T17:00:00.000Z');
    const r1 = fixtureId('dashboard', 'R1'), r2 = fixtureId('dashboard', 'R2'), r0 = fixtureId('dashboard', 'R0');
    const s1 = fixtureId('dashboard', 'S1'), admin = fixtureId('dashboard', 'A1');
    expect(await requesterMetrics(metrics, r1, since, fixtureAsOf)).toEqual({ openTickets: 4, waitingForRequester: 1, recentlyUpdated: 6, recentlyResolved: 2 });
    expect(await requesterMetrics(metrics, r2, since, fixtureAsOf)).toEqual({ openTickets: 1, waitingForRequester: 0, recentlyUpdated: 2, recentlyResolved: 0 });
    expect(await requesterMetrics(metrics, r0, since, fixtureAsOf)).toEqual({ openTickets: 0, waitingForRequester: 0, recentlyUpdated: 0, recentlyResolved: 0 });
    const staff = await metrics.$queryRaw<Record<string, number>[]>`SELECT
      count(*) FILTER (WHERE "currentStatus" IN ('New','Open','In Progress','Waiting for Requester','Reopened') AND "ownerId" IS NULL)::int AS unassigned,
      count(*) FILTER (WHERE "currentStatus" IN ('New','Open','In Progress','Waiting for Requester','Reopened') AND "ownerId" = ${s1})::int AS mine,
      count(*) FILTER (WHERE "updatedAt" >= ${since} AND "updatedAt" < ${fixtureAsOf})::int AS recent FROM "Ticket"`;
    expect(staff).toEqual([{ unassigned: 2, mine: 2, recent: 8 }]);
    const byStatus = await metrics.$queryRaw<{ label: string; count: number }[]>`SELECT "currentStatus" AS label, count(*)::int AS count FROM "Ticket" GROUP BY "currentStatus"`;
    expect(Object.fromEntries(byStatus.map(x => [x.label, x.count]))).toEqual({ New: 1, Open: 1, 'In Progress': 1, 'Waiting for Requester': 1, Resolved: 3, Closed: 2, Reopened: 1, Cancelled: 1 });
    const byPriority = await metrics.$queryRaw<{ label: string; count: number }[]>`SELECT coalesce("itPriority", "requestedPriority") AS label, count(*)::int AS count FROM "Ticket" WHERE "currentStatus" IN ('New','Open','In Progress','Waiting for Requester','Reopened') GROUP BY coalesce("itPriority", "requestedPriority")`;
    expect(Object.fromEntries(byPriority.map(x => [x.label, x.count]))).toEqual({ Low: 1, Medium: 1, High: 3 });
    const aliases = (rows: { ticketNumber: string }[]) => rows.map(t => t.ticketNumber.split('-').at(-1));
    expect(aliases(await metrics.$queryRaw`SELECT "ticketNumber" FROM "Ticket" WHERE "requesterId" = ${r1} AND "updatedAt" >= ${since} AND "updatedAt" < ${fixtureAsOf} ORDER BY "updatedAt" DESC, id DESC LIMIT 5`)).toEqual(['T11', 'T4', 'T6', 'T5', 'T3']);
    expect(aliases(await metrics.$queryRaw`SELECT "ticketNumber" FROM "Ticket" WHERE "updatedAt" >= ${since} AND "updatedAt" < ${fixtureAsOf} ORDER BY "updatedAt" DESC, id DESC LIMIT 5`)).toEqual(['T11', 'T4', 'T9', 'T8', 'T6']);
    expect(aliases(await metrics.$queryRaw`SELECT "ticketNumber" FROM "Ticket" WHERE "currentStatus" IN ('New','Open','In Progress','Waiting for Requester','Reopened') AND coalesce("itPriority", "requestedPriority") = 'High' ORDER BY "updatedAt" DESC, id DESC LIMIT 5`)).toEqual(['T7', 'T4', 'T3']);
    const activeActions = await metrics.$queryRaw<{ id: string }[]>`SELECT a.id FROM "ActionTaken" a JOIN "Ticket" t ON t.id=a."ticketId" WHERE a."assigneeId" = ${s1} AND a.status IN ('PLANNED','IN_PROGRESS') AND a."resolutionCycle"=t."resolutionCycle" AND t."currentStatus" IN ('New','Open','In Progress','Waiting for Requester','Reopened') ORDER BY a."actionAt" DESC, a.id DESC`;
    expect(activeActions.map(x => x.id)).toEqual(['X6', 'X2', 'X1'].map(alias => fixtureId('dashboard', alias)));
    expect(await metrics.ticket.count({ where: { ownerId: admin, currentStatus: { in: ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened'] } } })).toBe(0);
    expect(await metrics.actionTaken.count({ where: { assigneeId: admin } })).toBe(0);
  });

  it('SEED-05: action snapshots are complete, ordered and consistent, including follow-up clearing and reopened history', async () => {
    const actions = await metrics.actionTaken.findMany({ include: { revisions: { orderBy: { revision: 'asc' } }, ticket: true } });
    for (const { revisions, ticket, id, version, ticketId, createdAt, updatedAt, ...action } of actions) {
      expect(revisions).toHaveLength(version);
      expect(revisions.map(r => r.revision)).toEqual(Array.from({ length: version }, (_, i) => i + 1));
      expect(revisions.at(-1)!.snapshot).toEqual({ ...action, actionAt: action.actionAt.toISOString() });
      expect(revisions[0].actorId).toBe(action.performedById);
      expect(action.actionAt.getTime()).toBeGreaterThanOrEqual(ticket.createdAt.getTime());
      expect(action.actionAt.getTime()).toBeLessThanOrEqual(fixtureAsOf.getTime());
      for (const privateField of ['passwordHash', 'email', 'notes']) expect(revisions[0].snapshot).not.toHaveProperty(privateField);
    }
    const cleared = actions.find(a => a.id === fixtureId('dashboard', 'X8'))!;
    expect(cleared.revisions.map(r => (r.snapshot as { followUpRequired: boolean }).followUpRequired)).toEqual([true, true, false]);
    const different = actions.find(a => a.id === fixtureId('dashboard', 'X2'))!;
    expect(different.performedById).not.toBe(different.ticket.ownerId);
    expect(different.assigneeId).not.toBe(different.ticket.ownerId);
    const old = actions.find(a => a.id === fixtureId('dashboard', 'X5'))!;
    expect(old.resolutionCycle).toBe(1);
    expect(old.ticket.resolutionCycle).toBe(2);
    expect(await metrics.ticketStatusEvent.count()).toBe(1);
  });

  it('SEED-06: separate boundary and empty profiles provide exact before/at/after and all-zero fixtures', async () => {
    const { url, db } = await fresh();
    seedCli(url, 'boundaries');
    const since = new Date('2026-10-13T17:00:00.000Z');
    expect((await db.ticket.findMany({ orderBy: { id: 'asc' } })).map(t => t.updatedAt.toISOString())).toEqual([
      '2026-10-13T16:59:59.999Z', '2026-10-13T17:00:00.000Z', '2026-10-13T17:00:00.001Z',
      '2026-10-20T09:59:59.999Z', '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.001Z',
    ]);
    expect(await requesterMetrics(db, fixtureId('boundaries', 'R1'), since, fixtureAsOf)).toEqual({ openTickets: 0, waitingForRequester: 0, recentlyUpdated: 3, recentlyResolved: 3 });
    const empty = await fresh();
    seedCli(empty.url, 'empty');
    expect(await empty.db.user.count()).toBe(8);
    expect(await empty.db.ticket.count()).toBe(0);
    expect(await empty.db.actionTaken.count()).toBe(0);
    expect(await requesterMetrics(empty.db, fixtureId('empty', 'R1'), since, fixtureAsOf)).toEqual({ openTickets: 0, waitingForRequester: 0, recentlyUpdated: 0, recentlyResolved: 0 });
  }, 60_000);

  it('SEED-07: concurrent same-profile seed attempts commit one complete dataset', async () => {
    const { db } = await fresh();
    const results = await Promise.all([seedLab4Fixtures(db, { profile: 'dashboard' }), seedLab4Fixtures(db, { profile: 'dashboard' })]);
    expect(results.map(r => r.created).sort((a, b) => a - b)).toEqual([0, 11]);
    expect(await db.ticket.count()).toBe(11);
    expect(await db.actionTaken.count()).toBe(8);
    expect(await db.actionTakenRevision.count()).toBe(15);
    const before = await snapshot(db);
    await seedLab4Fixtures(db, { profile: 'dashboard' });
    expect(await snapshot(db)).toEqual(before);
  }, 60_000);

  it('SEED-08: email collisions abort without changing existing work or leaving a partial dataset', async () => {
    const { db } = await fresh();
    await db.user.create({ data: { name: 'Unrelated user', email: fixtureEmail('dashboard', 'S2').toUpperCase(), passwordHash: 'do-not-rewrite' } });
    const before = await snapshot(db);
    await expect(seedLab4Fixtures(db, { profile: 'dashboard' })).rejects.toThrow(/already owned/);
    expect(await snapshot(db)).toEqual(before);
  }, 60_000);

  it('SEED-09: a late nested-record collision rolls back every new fixture and leaves the existing Ticket intact', async () => {
    const { db } = await fresh();
    const category = await db.category.create({ data: { name: 'Unrelated category' } });
    const system = await db.relatedSystem.create({ data: { name: 'Unrelated system' } });
    const user = await db.user.create({ data: { email: 'unrelated@example.com', name: 'Other user', passwordHash: 'keep' } });
    const ticket = await db.ticket.create({ data: { ticketNumber: 'CUSTOM-WORK', summary: 'Keep this work', description: 'Unrelated', requestedPriority: 'Low', requesterId: user.id, categoryId: category.id, relatedSystemId: system.id } });
    await db.actionTaken.create({ data: { id: fixtureId('dashboard', 'X6'), ticketId: ticket.id, resolutionCycle: 1, description: 'Reserved UUID already in use', performedById: user.id, assigneeId: user.id } });
    const before = await snapshot(db);
    await expect(seedLab4Fixtures(db, { profile: 'dashboard' })).rejects.toMatchObject({ code: 'P2002' });
    expect(await snapshot(db)).toEqual(before);
  }, 60_000);

  it('SEED-10: an existing Ticket key gets no added action/history; invalid demo clocks fail before writes', async () => {
    const { db } = await fresh();
    const category = await db.category.create({ data: { name: 'Existing category' } });
    const system = await db.relatedSystem.create({ data: { name: 'Existing system' } });
    const user = await db.user.create({ data: { name: 'Existing Requester', email: 'existing@example.com', passwordHash: 'keep' } });
    const t3 = await db.ticket.create({ data: {
      ticketNumber: fixtureTicketNumber('dashboard', 'T3'), summary: 'Preexisting work', description: 'Retain this work',
      requestedPriority: 'Medium', requesterId: user.id, categoryId: category.id, relatedSystemId: system.id,
    } });
    expect(await seedLab4Fixtures(db, { profile: 'dashboard' })).toMatchObject({ created: 10, skipped: 1 });
    expect(await db.ticket.findUniqueOrThrow({ where: { id: t3.id } })).toEqual(t3);
    expect(await db.actionTaken.count({ where: { ticketId: t3.id } })).toBe(0);
    expect(await db.ticketStatusEvent.count({ where: { ticketId: t3.id } })).toBe(0);
    const after = await snapshot(db);
    await expect(seedLab4Fixtures(db, { now: new Date('invalid') })).rejects.toThrow(/valid date/);
    expect(await snapshot(db)).toEqual(after);
    expect(buildLab4Fixtures('dashboard', new Date('2030-01-01')).clock.asOf.toISOString()).toBe('2026-10-20T10:00:00.000Z');
  }, 60_000);
});
