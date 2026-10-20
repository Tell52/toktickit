import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { ActionStatus, PrismaClient, Role, Ticket } from '@prisma/client';
import request, { Response } from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, join } from 'node:path';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import { actionSnapshot } from '../../src/services/actions';
import { MigrationHarness } from './migration-support';

const serverUrl = process.env.LAB4_WORKFLOW_DATABASE_URL;
const matrix: Record<string, string[]> = {
  New: ['Open', 'In Progress', 'Cancelled'], Open: ['In Progress', 'Waiting for Requester', 'Cancelled'],
  'In Progress': ['Waiting for Requester', 'Resolved', 'Cancelled'], 'Waiting for Requester': ['In Progress', 'Resolved', 'Cancelled'],
  Resolved: ['Closed', 'Reopened'], Closed: ['Reopened'], Reopened: ['In Progress', 'Waiting for Requester', 'Cancelled'], Cancelled: [],
};
type Alias = 's1' | 's2' | 'admin' | 'r1' | 'r2' | 'forced' | 'inactive';
const ids = Object.fromEntries(['s1', 's2', 'admin', 'r1', 'r2', 'forced', 'inactive'].map(alias => [alias, randomUUID()])) as Record<Alias, string>;
type Login = { cookie: string; csrf: string };
describe.skipIf(!serverUrl).sequential('Ticket workflow API (Lab 4)', () => {
  let directory: string, harness: MigrationHarness, db: PrismaClient, originalUrl: string | undefined, sequence = 0;
  const sessions = {} as Record<Exclude<Alias, 'inactive'>, Login>;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'toktickit-lab4-workflow-')); harness = new MigrationHarness(serverUrl!, directory);
    const url = await harness.database(); harness.deploy(url, true);
    originalUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = url; db = getPrisma();
    await db.category.create({ data: { name: 'Workflow hardware' } }); await db.relatedSystem.create({ data: { name: 'Workflow system' } });
    const passwordHash = await bcrypt.hash('WorkflowPass!123', 10);
    for (const alias of Object.keys(ids) as Alias[]) {
      const role: Role = ['r1', 'r2', 'forced'].includes(alias) ? 'REQUESTER' : alias === 'admin' ? 'ADMINISTRATOR' : 'IT_STAFF';
      await db.user.create({ data: { id: ids[alias], email: `${alias}@workflow.invalid`, name: alias, role, passwordHash, isActive: alias !== 'inactive', mustChangePassword: alias === 'forced' } });
      if (alias !== 'inactive') { const result = await request(app).post('/api/auth/login').send({ email: `${alias}@workflow.invalid`, password: 'WorkflowPass!123' }); expect(result.status).toBe(200); sessions[alias] = { cookie: result.headers['set-cookie'][0], csrf: result.body.csrfToken }; }
    }
  }, 60_000);
  afterAll(async () => {
    await db?.$disconnect(); if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
    try { await harness?.close(); } finally { if (directory && resolve(dirname(directory)) === resolve(tmpdir()) && basename(directory).startsWith('toktickit-lab4-workflow-')) rmSync(directory, { recursive: true, force: true }); }
  }, 60_000);
  const ticket = (status = 'In Progress', resolutionCycle = 1) => db.ticket.create({ data: { ticketNumber: `TKT-WF-${++sequence}`, summary: 'Network issue', description: 'Investigate network', requestedPriority: 'Medium', currentStatus: status, categoryId: 1, relatedSystemId: 1, requesterId: ids.r1, ownerId: ids.s2, resolutionCycle, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') } });
  async function action(parent: Ticket, status: ActionStatus = 'COMPLETED', followUpRequired = false, cycle = parent.resolutionCycle, assigneeId = ids.s1) {
    const record = await db.actionTaken.create({ data: { ticketId: parent.id, resolutionCycle: cycle, status, performedById: ids.s1, assigneeId, description: 'Recorded work', result: status === 'COMPLETED' ? 'Verified fixed' : null, followUpRequired, followUpNote: followUpRequired ? 'Verify follow-up' : null, cancellationReason: status === 'CANCELLED' ? 'Previous reason' : null } });
    await db.actionTakenRevision.create({ data: { actionId: record.id, revision: 1, actorId: ids.s1, snapshot: actionSnapshot(record) } }); return record;
  }
  async function mutate(parent: Ticket, operation: string, body: Record<string, unknown>, actor: Exclude<Alias, 'inactive'> = 's1') {
    return request(app).patch(`/api/staff/tickets/${parent.id}/${operation}`).set('Cookie', sessions[actor].cookie).set('X-CSRF-Token', sessions[actor].csrf).send(body);
  }
  const status = (parent: Ticket, target: string, body: Record<string, unknown> = {}, actor: 's1' | 's2' | 'admin' = 's1') => mutate(parent, 'status', { expectedTicketVersion: parent.version, status: target, ...(target === 'Cancelled' ? { reason: 'No further work needed' } : {}), ...body }, actor);
  async function get(parent: Ticket, path = '', actor: Exclude<Alias, 'inactive'> = 's1') { return request(app).get(`/api/${path === 'detail' ? 'staff/' : ''}tickets/${parent.id}${path === 'detail' ? '' : path}`).set('Cookie', sessions[actor].cookie); }
  async function state(parent: Ticket) { return { ticket: await db.ticket.findUnique({ where: { id: parent.id } }), actions: await db.actionTaken.findMany({ where: { ticketId: parent.id }, orderBy: { id: 'asc' } }), revisions: await db.actionTakenRevision.findMany({ where: { action: { ticketId: parent.id } }, orderBy: [{ actionId: 'asc' }, { revision: 'asc' }] }), events: await db.ticketStatusEvent.findMany({ where: { ticketId: parent.id }, orderBy: { id: 'asc' } }), receipts: await db.actionCreateRequest.findMany({ where: { ticketId: parent.id } }) }; }
  function error(result: Response, expectedStatus: number, code: string) { expect(result.status, JSON.stringify(result.body)).toBe(expectedStatus); expect(result.body.error.code).toBe(code); expect(JSON.stringify(result.body)).not.toMatch(/PrismaClient|ConnectorError|passwordHash|PRIVATE_DATABASE|SELECT /); }

  it.each(['s1', 'admin'] as const)('WF-01: all 64 transition pairs as %s obey the independent matrix', async actor => {
    for (const from of Object.keys(matrix)) for (const target of Object.keys(matrix)) {
      const parent = await ticket(from); await action(parent); const before = await state(parent);
      const result = await status(parent, target, {}, actor);
      if (matrix[from].includes(target)) {
        expect(result.status, `${from} -> ${target}: ${JSON.stringify(result.body)}`).toBe(200);
        expect(result.body).toMatchObject({ id: parent.id, ticketId: parent.ticketNumber, status: target, version: 2, resolutionCycle: target === 'Reopened' ? 2 : 1 });
        const after = await state(parent); expect(after.events).toHaveLength(1); expect(after.events[0]).toMatchObject({ actorId: ids[actor], fromStatus: from, toStatus: target, resolutionCycle: target === 'Reopened' ? 2 : 1 });
      } else { error(result, 409, 'INVALID_TRANSITION'); expect(await state(parent)).toEqual(before); }
    }
  }, 60_000);
  const gates: { name: string; actions: [ActionStatus, boolean, number?][]; blockers: string[] }[] = [
    { name: 'legacy zero actions', actions: [], blockers: ['NO_COMPLETED_ACTION'] },
    { name: 'cancelled only', actions: [['CANCELLED', true]], blockers: ['NO_COMPLETED_ACTION'] },
    { name: 'old completion', actions: [['COMPLETED', false, 1]], blockers: ['NO_COMPLETED_ACTION'] },
    { name: 'unfinished follow-up', actions: [['IN_PROGRESS', true]], blockers: ['NO_COMPLETED_ACTION', 'UNFINISHED_ACTIONS', 'FOLLOW_UP_REQUIRED'] },
    { name: 'planned plus completed', actions: [['COMPLETED', false], ['PLANNED', false]], blockers: ['UNFINISHED_ACTIONS'] },
    { name: 'started plus completed', actions: [['COMPLETED', false], ['IN_PROGRESS', false]], blockers: ['UNFINISHED_ACTIONS'] },
    { name: 'completed follow-up', actions: [['COMPLETED', true]], blockers: ['FOLLOW_UP_REQUIRED'] },
    { name: 'completed only', actions: [['COMPLETED', false]], blockers: [] },
    { name: 'cancelled follow-up ignored', actions: [['COMPLETED', false], ['CANCELLED', true]], blockers: [] },
    { name: 'old unfinished/follow-up ignored', actions: [['COMPLETED', false], ['IN_PROGRESS', true, 1]], blockers: [] },
  ];
  it.each(['In Progress', 'Waiting for Requester'].flatMap(from => gates.map(gate => ({ from, ...gate }))))('WF-02: $from gate: $name', async scenario => {
    const parent = await ticket(scenario.from, 2);
    for (const [kind, follow, cycle] of scenario.actions) await action(parent, kind, follow, cycle);
    const before = await state(parent), detail = await get(parent, 'detail'); expect(detail.status).toBe(200);
    expect(detail.body.resolutionGate.blockers).toEqual(scenario.blockers); expect(detail.body.resolutionGate.eligible).toBe(!scenario.blockers.length);
    const result = await status(parent, 'Resolved');
    if (scenario.blockers.length) { error(result, 409, 'RESOLUTION_BLOCKED'); expect(result.body.error.blockers).toEqual(scenario.blockers); expect(await state(parent)).toEqual(before); }
    else { expect(result.status).toBe(200); expect(result.body.resolvedAt).toBeTruthy(); expect((await state(parent)).events).toHaveLength(1); }
  });
  it('WF-02: clearing completed follow-up via Actions API unblocks resolution without losing its revision', async () => {
    const parent = await ticket(), record = await action(parent, 'COMPLETED', true);
    error(await status(parent, 'Resolved'), 409, 'RESOLUTION_BLOCKED');
    const edit = await request(app).patch(`/api/staff/tickets/${parent.id}/actions/${record.id}`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ expectedTicketVersion: 1, expectedVersion: 1, followUpRequired: false }); expect(edit.status).toBe(200);
    expect((await status({ ...parent, version: 2 }, 'Resolved')).status).toBe(200);
    expect((await state(parent)).revisions.map(r => (r.snapshot as { followUpRequired: boolean }).followUpRequired)).toEqual([true, false]);
  });
  it.each(Object.keys(matrix))('WF-03: advisory is restricted and idempotent in %s', async from => {
    const parent = await ticket(from), before = await state(parent);
    const call = () => request(app).post(`/api/tickets/${parent.id}/resolved-indicator`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf);
    const result = await call();
    if (['Open', 'In Progress', 'Waiting for Requester'].includes(from)) {
      expect(result.status).toBe(200); const first = await state(parent); expect(first.ticket).toMatchObject({ currentStatus: from, problemAppearsResolved: true, version: 2, resolvedAt: null }); expect(first.events).toHaveLength(0);
      expect((await call()).body).toEqual(result.body); expect(await state(parent)).toEqual(first);
      error(await status({ ...parent, version: 2 }, 'Resolved'), 409, from === 'Open' ? 'INVALID_TRANSITION' : 'RESOLUTION_BLOCKED');
    } else { error(result, 409, 'INVALID_TRANSITION'); expect(await state(parent)).toEqual(before); }
  });
  it.each(['Resolved', 'Closed'])('WF-04: reopen %s preserves old work, resets advisory/time and requires new-cycle evidence', async from => {
    let parent = await ticket(from); const old = await action(parent);
    parent = await db.ticket.update({ where: { id: parent.id }, data: { resolvedAt: new Date('2026-10-01T00:00:00Z'), problemAppearsResolved: true, indicatedAt: new Date() } });
    expect((await status(parent, 'Reopened')).body).toMatchObject({ resolutionCycle: 2, resolvedAt: null, version: 2 });
    let fresh = await db.ticket.findUniqueOrThrow({ where: { id: parent.id } }); expect(fresh).toMatchObject({ problemAppearsResolved: false, indicatedAt: null });
    expect((await get(parent, '/actions', 'r1')).body.actions[0].id).toBe(old.id);
    const rejected = await request(app).patch(`/api/staff/tickets/${parent.id}/actions/${old.id}`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ expectedTicketVersion: 2, expectedVersion: 1, description: 'Old edit' }); error(rejected, 409, 'ACTION_NOT_EDITABLE');
    expect((await status(fresh, 'In Progress')).status).toBe(200); fresh = await db.ticket.findUniqueOrThrow({ where: { id: parent.id } });
    error(await status(fresh, 'Resolved'), 409, 'RESOLUTION_BLOCKED'); await action(fresh); expect((await status(fresh, 'Resolved')).status).toBe(200);
    expect(await db.actionTaken.findUnique({ where: { id: old.id } })).toEqual(old);
  });
  it('WF-04: already-Resolved legacy Ticket closes with unknown resolvedAt; modern closure preserves its instant', async () => {
    const legacy = await ticket('Resolved'); expect((await status(legacy, 'Closed')).body.resolvedAt).toBeNull();
    const parent = await ticket(); await action(parent); const resolved = await status(parent, 'Resolved');
    const fresh = await db.ticket.findUniqueOrThrow({ where: { id: parent.id } }); expect((await status(fresh, 'Closed')).body.resolvedAt).toBe(resolved.body.resolvedAt);
  });
  it('WF-05: cancellation cascades once over current unfinished work, retaining completed/cancelled/old evidence', async () => {
    const parent = await ticket('In Progress', 2);
    const records = await Promise.all([action(parent, 'PLANNED', true), action(parent, 'IN_PROGRESS'), action(parent), action(parent, 'CANCELLED'), action(parent, 'PLANNED', false, 1)]);
    const result = await status(parent, 'Cancelled', { reason: '  Shared cancellation reason  ' }); expect(result.status).toBe(200);
    const after = await state(parent); expect(after.ticket?.version).toBe(2); expect(after.events).toHaveLength(1); expect(after.events[0].reason).toBe('Shared cancellation reason');
    for (const [index, record] of records.entries()) { const updated = after.actions.find(a => a.id === record.id)!;
      if (index < 2) { expect(updated).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Shared cancellation reason', version: 2 }); expect(after.revisions.filter(r => r.actionId === record.id)).toHaveLength(2); }
      else expect(updated).toEqual(record);
    }
    const beforeRetry = await state(parent); error(await status({ ...parent, version: 2 }, 'Cancelled'), 409, 'INVALID_TRANSITION'); expect(await state(parent)).toEqual(beforeRetry);
  });
  it('WF-06: history scopes ownership, is immutable/paginated/deterministic, and discloses only shared fields', async () => {
    const parent = await ticket(); expect((await get(parent, '/status-history', 'r1')).body.events).toEqual([]);
    const time = new Date('2026-10-01T00:00:00Z'); const eventIds = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'];
    for (const id of eventIds) await db.ticketStatusEvent.create({ data: { id, ticketId: parent.id, actorId: ids.s1, fromStatus: 'Open', toStatus: 'Cancelled', reason: 'Shared reason', resolutionCycle: 1, createdAt: time } });
    await db.note.create({ data: { ticketId: parent.id, authorId: ids.s1, content: 'PRIVATE_NOTE' } });
    const result = await get(parent, '/status-history', 'r1'); expect(result.status).toBe(200); expect(result.body.events.map((e: { id: string }) => e.id)).toEqual([...eventIds].sort()); expect(Object.keys(result.body.events[0]).sort()).toEqual(['id', 'fromStatus', 'toStatus', 'reason', 'resolutionCycle', 'createdAt', 'actor'].sort()); expect(Object.keys(result.body.events[0].actor).sort()).toEqual(['id', 'name']); expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE_NOTE|password|email|internalNotes/);
    const paged = await get(parent, '/status-history?page=2&pageSize=1', 'admin'); expect(paged.body.events[0].id).toBe(eventIds[0]); expect(paged.body.pagination.totalCount).toBe(2);
    const other = await get(parent, '/status-history', 'r2'), missing = await request(app).get('/api/tickets/2147483647/status-history').set('Cookie', sessions.r2.cookie); error(other, 404, 'NOT_FOUND'); expect(other.body).toEqual(missing.body);
    for (const method of ['post', 'patch', 'delete'] as const) { const write = await request(app)[method](`/api/tickets/${parent.id}/status-history/${eventIds[0]}`).set('Cookie', sessions.s1.cookie).send({ reason: 'Overwrite' }); error(write, 404, 'NOT_FOUND'); }
  });
  it('WF-07: owner/priority require versions, keep legacy aliases and do not change requested priority', async () => {
    const parent = await ticket(); error(await mutate(parent, 'owner', { ownerId: ids.s1 }), 400, 'VALIDATION_ERROR');
    const assigned = await mutate(parent, 'owner', { expectedTicketVersion: 1, ownerId: ids.admin }); expect(assigned.status).toBe(200); expect(assigned.body).toMatchObject({ id: parent.id, ticketId: parent.ticketNumber, owner: { id: ids.admin }, version: 2 });
    const before = await state(parent); error(await mutate(parent, 'priority', { expectedTicketVersion: 1, itPriority: 'HIGH' }), 409, 'STALE_VERSION'); expect(await state(parent)).toEqual(before);
    const priority = await mutate(parent, 'priority', { expectedTicketVersion: 2, itPriority: 'high' }); expect(priority.body).toMatchObject({ itPriority: 'HIGH', version: 3, ticketId: parent.ticketNumber });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: parent.id } })).requestedPriority).toBe('Medium');
    expect((await mutate(parent, 'owner', { expectedTicketVersion: 3, ownerId: null })).body).toMatchObject({ owner: null, version: 4 });
    for (const ownerId of [ids.r1, ids.inactive, 'missing']) { error(await mutate(parent, 'owner', { expectedTicketVersion: 4, ownerId }), 400, 'VALIDATION_ERROR'); }
  });
  it('WF-07: public comment/upload/removal bump parent version atomically; private notes and repeated removal do not', async () => {
    const parent = await ticket(); const initial = await db.ticket.findUniqueOrThrow({ where: { id: parent.id } });
    const note = await request(app).post(`/api/staff/tickets/${parent.id}/notes`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ content: 'Private diagnosis' }); expect(note.status).toBe(201); expect(await db.ticket.findUnique({ where: { id: parent.id } })).toEqual(initial);
    const comment = await request(app).post(`/api/tickets/${parent.id}/comments`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).send({ content: 'Public update' }); expect(comment.status).toBe(201); expect((await state(parent)).ticket?.version).toBe(2);
    const upload = await request(app).post(`/api/tickets/${parent.id}/attachments`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).attach('file', Buffer.from('synthetic-file'), { filename: 'proof.pdf', contentType: 'application/pdf' }); expect(upload.status).toBe(201); expect((await state(parent)).ticket?.version).toBe(3);
    const remove = () => request(app).delete(`/api/tickets/${parent.id}/attachments/${upload.body.id}`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).send({ reason: 'Wrong screenshot' }); expect((await remove()).status).toBe(200); const after = await state(parent); expect(after.ticket?.version).toBe(4); expect((await remove()).status).toBe(200); expect(await state(parent)).toEqual(after);
  });
  it.each([
    {}, { expectedTicketVersion: 0, status: 'Open' }, { expectedTicketVersion: '1', status: 'Open' }, { expectedTicketVersion: 1, status: 'Unknown' },
    { expectedTicketVersion: 1, status: 'Cancelled' }, { expectedTicketVersion: 1, status: 'Cancelled', reason: ' ' }, { expectedTicketVersion: 1, status: 'Cancelled', reason: 'x'.repeat(1001) },
    { expectedTicketVersion: 1, status: 'Open', reason: 'Unexpected' }, { expectedTicketVersion: 1, status: 'Open', actorId: 'Spoofed' },
  ])('validation rejects malformed workflow input %j with no writes', async input => { const parent = await ticket('New'), before = await state(parent); error(await mutate(parent, 'status', input), 400, 'VALIDATION_ERROR'); expect(await state(parent)).toEqual(before); });
  it('accepts case/underscore aliases, Ticket numbers and stale precedence over the resolution gate', async () => {
    const parent = await ticket('OPEN'); const result = await request(app).patch(`/api/staff/tickets/${parent.ticketNumber}/status`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ expectedTicketVersion: 1, status: 'in_progress' }); expect(result.status).toBe(200); expect(result.body.status).toBe('In Progress');
    const before = await state(parent); error(await status(parent, 'Resolved'), 409, 'STALE_VERSION'); expect(await state(parent)).toEqual(before);
  });
  it('security: role/current account/CSRF checks precede resources and no advisory or activity identity can be spoofed', async () => {
    const parent = await ticket(), before = await state(parent);
    error(await mutate(parent, 'status', { expectedTicketVersion: 1, status: 'Resolved' }, 'r1'), 403, 'FORBIDDEN');
    error(await request(app).patch('/api/staff/tickets/2147483647/status').send({}), 401, 'UNAUTHENTICATED');
    error(await request(app).patch(`/api/staff/tickets/${parent.id}/status`).set('Cookie', sessions.s1.cookie).send({ expectedTicketVersion: 1, status: 'Resolved' }), 403, 'FORBIDDEN');
    error(await get(parent, '/status-history', 'forced'), 403, 'PASSWORD_CHANGE_REQUIRED');
    await db.user.update({ where: { id: ids.s2 }, data: { isActive: false } }); try { error(await mutate(parent, 'status', { expectedTicketVersion: 1, status: 'Resolved' }, 's2'), 401, 'UNAUTHENTICATED'); } finally { await db.user.update({ where: { id: ids.s2 }, data: { isActive: true } }); }
    for (const actor of ['s1', 'r2'] as const) { const result = await request(app).post(`/api/tickets/${parent.id}/resolved-indicator`).set('Cookie', sessions[actor].cookie).set('X-CSRF-Token', sessions[actor].csrf); error(result, actor === 's1' ? 403 : 404, actor === 's1' ? 'FORBIDDEN' : 'NOT_FOUND'); }
    error(await request(app).post(`/api/tickets/${parent.id}/comments`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).send({ content: 'Spoof', authorId: ids.s1 }), 400, 'VALIDATION_ERROR');
    expect(await state(parent)).toEqual(before);
  });
  async function waitForTicketWaiters(count: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Ticket"%' AND query LIKE '%FOR UPDATE%'`;
      if (rows[0].count >= count) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Did not observe ${count} pending parent locks`);
  }
  async function raceInOrder(parent: Ticket, first: () => Promise<Response>, second: () => Promise<Response>) {
    let signal!: () => void, release!: () => void;
    const locked = new Promise<void>(resolve => { signal = resolve; });
    const commit = new Promise<void>(resolve => { release = resolve; });
    const holder = db.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${parent.id} FOR UPDATE`; signal(); await commit; }, { timeout: 15000 });
    await locked;
    const pending: Promise<Response>[] = [];
    try {
      pending.push(first()); await waitForTicketWaiters(1);
      pending.push(second()); await waitForTicketWaiters(2);
      release(); await holder;
      return await Promise.all(pending);
    } finally { release(); await holder; await Promise.allSettled(pending); }
  }
  it.each(['owner', 'priority'].flatMap(operation => [true, false].map(statusFirst => ({ operation, statusFirst }))))('CON-01: status versus $operation; statusFirst=$statusFirst', async ({ operation, statusFirst }) => {
    const parent = await ticket('New');
    const transition = () => status(parent, 'In Progress');
    const edit = () => mutate(parent, operation, { expectedTicketVersion: 1, ...(operation === 'owner' ? { ownerId: ids.admin } : { itPriority: 'HIGH' }) }, 's2');
    const [winner, loser] = await raceInOrder(parent, statusFirst ? transition : edit, statusFirst ? edit : transition);
    expect(winner.status).toBe(200); error(loser, 409, 'STALE_VERSION');
    const after = await state(parent); expect(after.ticket?.version).toBe(2); expect(after.events).toHaveLength(statusFirst ? 1 : 0);
  });
  it.each(['create', 'follow-up'].flatMap(kind => [true, false].map(resolveFirst => ({ kind, resolveFirst }))))('CON-02: Resolve versus $kind; resolveFirst=$resolveFirst', async ({ kind, resolveFirst }) => {
    const parent = await ticket(), completed = await action(parent);
    const transition = () => status(parent, 'Resolved');
    const work = () => kind === 'create'
      ? request(app).post(`/api/staff/tickets/${parent.id}/actions`).set('Cookie', sessions.s2.cookie).set('X-CSRF-Token', sessions.s2.csrf).set('Idempotency-Key', randomUUID()).send({ expectedTicketVersion: 1, description: 'New unfinished work' }).then(r => r)
      : request(app).patch(`/api/staff/tickets/${parent.id}/actions/${completed.id}`).set('Cookie', sessions.s2.cookie).set('X-CSRF-Token', sessions.s2.csrf).send({ expectedTicketVersion: 1, expectedVersion: 1, followUpRequired: true, followUpNote: 'New follow-up' }).then(r => r);
    const [winner, loser] = await raceInOrder(parent, resolveFirst ? transition : work, resolveFirst ? work : transition);
    expect(winner.status).toBe(resolveFirst || kind === 'follow-up' ? 200 : 201); error(loser, 409, 'STALE_VERSION');
    const after = await state(parent); expect(after.ticket?.version).toBe(2);
    if (resolveFirst) { expect(after.ticket?.currentStatus).toBe('Resolved'); expect(after.actions).toHaveLength(1); expect(after.actions[0].followUpRequired).toBe(false); }
    else { expect(after.ticket?.currentStatus).toBe('In Progress'); error(await status(after.ticket!, 'Resolved'), 409, 'RESOLUTION_BLOCKED'); }
  });
  it.each(['revision', 'event', '40001', '40P01'])('CON-03: cancellation failure at %s rolls back all actions, parent and history', async failure => {
    const parent = await ticket(); const records = await Promise.all([action(parent, 'PLANNED'), action(parent, 'IN_PROGRESS')]); const before = await state(parent);
    const secondId = records.map(r => r.id).sort()[1]; const table = failure === 'revision' ? 'ActionTakenRevision' : 'TicketStatusEvent';
    const condition = failure === 'revision' ? `IF NEW."actionId" = '${secondId}'::uuid AND NEW."revision" = 2 THEN` : 'IF true THEN';
    const code = ['40001', '40P01'].includes(failure) ? failure : 'P0001';
    await db.$executeRawUnsafe(`CREATE FUNCTION wf_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${condition} RAISE EXCEPTION 'PRIVATE_DATABASE_FAILURE' USING ERRCODE = '${code}'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER wf_fail BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION wf_fail()`);
    try { error(await status(parent, 'Cancelled'), ['40001', '40P01'].includes(failure) ? 409 : 500, ['40001', '40P01'].includes(failure) ? 'RETRYABLE_CONFLICT' : 'INTERNAL_ERROR'); expect(await state(parent)).toEqual(before); }
    finally { await db.$executeRawUnsafe(`DROP TRIGGER wf_fail ON "${table}"`); await db.$executeRawUnsafe('DROP FUNCTION wf_fail()'); }
    expect((await status(parent, 'Cancelled')).status).toBe(200);
  });
  it('WF-07: failed public activity rolls back its row and version; attachment boundaries preserve ownership/quota', async () => {
    const parent = await ticket(); const other = await ticket();
    const file = await db.attachment.create({ data: { ticketId: other.id, fileName: 'other.pdf', fileType: 'application/pdf', fileSize: 1, fileUrl: '/uploads/synthetic' } });
    error(await request(app).delete(`/api/tickets/${parent.id}/attachments/${file.id}`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).send({ reason: 'Wrong ticket' }), 404, 'NOT_FOUND');
    expect((await db.attachment.findUniqueOrThrow({ where: { id: file.id } })).isRemoved).toBe(false);
    await db.$executeRawUnsafe('CREATE FUNCTION wf_fail_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'PRIVATE_DATABASE_FAILURE\'; END $$');
    await db.$executeRawUnsafe('CREATE TRIGGER wf_fail_touch BEFORE UPDATE ON "Ticket" FOR EACH ROW EXECUTE FUNCTION wf_fail_touch()');
    try {
      error(await request(app).post(`/api/tickets/${parent.id}/comments`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).send({ content: 'Must roll back' }), 500, 'INTERNAL_ERROR');
      error(await request(app).post(`/api/tickets/${parent.id}/attachments`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).attach('file', Buffer.from('pdf'), { filename: 'proof.pdf', contentType: 'application/pdf' }), 500, 'INTERNAL_ERROR');
      expect(await db.comment.count({ where: { ticketId: parent.id } })).toBe(0); expect(await db.attachment.count({ where: { ticketId: parent.id } })).toBe(0); expect((await state(parent)).ticket?.version).toBe(1);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER wf_fail_touch ON "Ticket"'); await db.$executeRawUnsafe('DROP FUNCTION wf_fail_touch()'); }
    for (let i = 0; i < 5; i++) await db.attachment.create({ data: { ticketId: parent.id, fileName: `${i}.pdf`, fileType: 'application/pdf', fileSize: 1, fileUrl: '/uploads/synthetic' } });
    error(await request(app).post(`/api/tickets/${parent.id}/attachments`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).attach('file', Buffer.from('pdf'), { filename: 'sixth.pdf', contentType: 'application/pdf' }), 400, 'VALIDATION_ERROR');
    expect((await state(parent)).ticket?.version).toBe(1);
  });
  it.each(['actor', 'owner', 'completion-assignee', 'completion-inactive'] as const)('CON-04: rechecks %s eligibility after an actual account lock wait', async kind => {
    const parent = await ticket(), record = await action(parent, 'PLANNED', false, 1, ids.s2), before = await state(parent);
    const changingId = kind === 'actor' ? ids.s1 : ids.s2;
    let signal!: () => void, release!: () => void;
    const locked = new Promise<void>(resolve => { signal = resolve; }), commit = new Promise<void>(resolve => { release = resolve; });
    const adminChange = db.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${changingId} FOR UPDATE`; signal(); await commit; await tx.user.update({ where: { id: changingId }, data: kind === 'completion-inactive' ? { isActive: false } : { role: 'REQUESTER' } }); }, { timeout: 15000 });
    await locked;
    const pending = kind.startsWith('completion-')
      ? request(app).patch(`/api/staff/tickets/${parent.id}/actions/${record.id}`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ expectedTicketVersion: 1, expectedVersion: 1, status: 'COMPLETED', result: 'Verified' }).then(r => r)
      : mutate(parent, kind === 'actor' ? 'status' : 'owner', { expectedTicketVersion: 1, ...(kind === 'actor' ? { status: 'Waiting for Requester' } : { ownerId: ids.s2 }) });
    try {
      let observed = false; const deadline = Date.now() + 5000;
      while (Date.now() < deadline) { const rows = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "User"%' AND query LIKE '%FOR UPDATE%'`; if (rows[0].count) { observed = true; break; } await new Promise(resolve => setTimeout(resolve, 10)); }
      expect(observed).toBe(true); release(); await adminChange;
      error(await pending, kind === 'actor' ? 403 : 400, kind === 'actor' ? 'FORBIDDEN' : 'VALIDATION_ERROR'); expect(await state(parent)).toEqual(before);
    } finally { release(); await adminChange; await pending; await db.user.update({ where: { id: changingId }, data: { role: 'IT_STAFF', isActive: true } }); }
  });
  it('validates authenticated attachment type/size/removal reason without changing parent or consuming quota', async () => {
    const parent = await ticket(), before = await state(parent);
    for (const data of [{ bytes: Buffer.from('text'), filename: 'unsafe.txt', contentType: 'text/plain' }, { bytes: Buffer.alloc(5 * 1024 * 1024 + 1), filename: 'large.pdf', contentType: 'application/pdf' }]) {
      error(await request(app).post(`/api/tickets/${parent.id}/attachments`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).attach('file', data.bytes, { filename: data.filename, contentType: data.contentType }), 400, 'VALIDATION_ERROR');
    }
    error(await request(app).delete(`/api/tickets/${parent.id}/attachments/1`).set('Cookie', sessions.r1.cookie).set('X-CSRF-Token', sessions.r1.csrf).send({}), 400, 'VALIDATION_ERROR'); expect(await state(parent)).toEqual(before); expect(await db.attachment.count({ where: { ticketId: parent.id } })).toBe(0);
  });
  it('staff detail/queue use the current database role after promotion and demotion of an existing session', async () => {
    const parent = await ticket();
    error(await get(parent, 'detail', 'r2'), 403, 'FORBIDDEN');
    try {
      await db.user.update({ where: { id: ids.r2 }, data: { role: 'IT_STAFF' } });
      expect((await get(parent, 'detail', 'r2')).status).toBe(200);
      expect((await request(app).get('/api/staff/tickets').set('Cookie', sessions.r2.cookie)).status).toBe(200);
    } finally { await db.user.update({ where: { id: ids.r2 }, data: { role: 'REQUESTER' } }); }
    error(await get(parent, 'detail', 'r2'), 403, 'FORBIDDEN');
    error(await get(parent, '/status-history', 'r2'), 404, 'NOT_FOUND');
  });
});
