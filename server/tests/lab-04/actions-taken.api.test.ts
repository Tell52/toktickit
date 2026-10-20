import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import request, { Response as TestResponse } from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { app } from '../../src/app';
import { getPrisma } from '../../src/prisma';
import { MigrationHarness } from './migration-support';

const serverUrl = process.env.LAB4_ACTIONS_DATABASE_URL;
type Login = { cookie: string; csrf: string };
type Alias = 'r1' | 'r2' | 's1' | 's2' | 'admin' | 'forced' | 'inactive';
const ids = Object.fromEntries(['r1', 'r2', 's1', 's2', 'admin', 'forced', 'inactive'].map(alias => [alias, randomUUID()])) as Record<Alias, string>;
const baseTime = new Date('2026-10-01T00:00:00.000Z');

// This suite gets its own database so legacy admin tests cannot deactivate its
// accounts, and it cannot mutate any user's development database accidentally.
describe.skipIf(!serverUrl).sequential('Actions Taken API (Lab 4)', () => {
  let directory: string, harness: MigrationHarness, db: PrismaClient;
  let originalUrl: string | undefined;
  const sessions = {} as Record<Exclude<Alias, 'inactive'>, Login>;
  let counter = 0;
  async function login(alias: Exclude<Alias, 'inactive'>): Promise<Login> {
    const result = await request(app).post('/api/auth/login').send({ email: `${alias}@actions.invalid`, password: 'ActionPass!123' });
    expect(result.status).toBe(200);
    return { cookie: result.headers['set-cookie'][0], csrf: result.body.csrfToken };
  }
  async function ticket(status = 'New', cycle = 1) {
    return db.ticket.create({ data: {
      ticketNumber: `TKT-ACTIONS-${++counter}`, summary: 'API action scenario', description: 'Ticket description', requestedPriority: 'Medium',
      currentStatus: status, requesterId: ids.r1, ownerId: ids.s2, categoryId: 1, relatedSystemId: 1,
      createdAt: baseTime, updatedAt: baseTime, resolutionCycle: cycle,
    } });
  }
  async function post(ticketId: number | string, body: Record<string, unknown> = {}, actor: Exclude<Alias, 'inactive'> = 's1', key = randomUUID()) {
    const parent = await db.ticket.findFirstOrThrow({ where: typeof ticketId === 'number' ? { id: ticketId } : { ticketNumber: ticketId } });
    return request(app).post(`/api/staff/tickets/${ticketId}/actions`).set('Cookie', sessions[actor].cookie).set('X-CSRF-Token', sessions[actor].csrf).set('Idempotency-Key', key)
      .send({ expectedTicketVersion: parent.version, description: 'Inspect connection', ...body });
  }
  async function patch(ticketId: number, actionId: string, body: Record<string, unknown>, actor: Exclude<Alias, 'inactive'> = 's1') {
    const parent = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const action = await db.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
    return request(app).patch(`/api/staff/tickets/${ticketId}/actions/${actionId}`).set('Cookie', sessions[actor].cookie).set('X-CSRF-Token', sessions[actor].csrf)
      .send({ expectedTicketVersion: parent.version, expectedVersion: action.version, ...body });
  }
  async function state(ticketId: number) {
    return {
      ticket: await db.ticket.findUnique({ where: { id: ticketId } }),
      actions: await db.actionTaken.findMany({ where: { ticketId }, orderBy: { id: 'asc' } }),
      revisions: await db.actionTakenRevision.findMany({ where: { action: { ticketId } }, orderBy: [{ actionId: 'asc' }, { revision: 'asc' }] }),
      receipts: await db.actionCreateRequest.findMany({ where: { ticketId }, orderBy: { id: 'asc' } }),
    };
  }
  function error(result: TestResponse, status: number, code: string) {
    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
    expect(JSON.stringify(result.body)).not.toMatch(/ConnectorError|PrismaClient|SELECT |passwordHash|stack/);
  }
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'toktickit-lab4-actions-'));
    harness = new MigrationHarness(serverUrl!, directory);
    const url = await harness.database();
    harness.deploy(url, true);
    originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    db = getPrisma();
    await db.category.create({ data: { name: 'Action API hardware' } });
    await db.relatedSystem.create({ data: { name: 'Action API system' } });
    const passwordHash = await bcrypt.hash('ActionPass!123', 10);
    for (const alias of Object.keys(ids) as Alias[]) {
      const role: Role = ['r1', 'r2', 'forced'].includes(alias) ? 'REQUESTER' : alias === 'admin' ? 'ADMINISTRATOR' : 'IT_STAFF';
      await db.user.create({ data: { id: ids[alias], email: `${alias}@actions.invalid`, name: alias, role, isActive: alias !== 'inactive', mustChangePassword: alias === 'forced', passwordHash } });
      if (alias !== 'inactive') sessions[alias] = await login(alias);
    }
  }, 60_000);
  afterAll(async () => {
    await db?.$disconnect();
    if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
    try { await harness?.close(); }
    finally {
      if (directory && resolve(dirname(directory)) === resolve(tmpdir()) && basename(directory).startsWith('toktickit-lab4-actions-')) rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it.each(['s1', 'admin'] as const)('API-01/02: %s creates defaulted Planned work independently of Ticket Owner with one full revision', async actor => {
    const parent = await ticket();
    const result = await post(parent.ticketNumber, { description: '  Inspect connection  ', result: ' ', attachmentNotes: '' }, actor);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ ticketVersion: 2, action: { ticketId: parent.id, ticketNumber: parent.ticketNumber, resolutionCycle: 1, description: 'Inspect connection', status: 'PLANNED', version: 1, result: null, attachmentNotes: null, followUpNote: null, followUpRequired: false, performedBy: { id: ids[actor] }, assignee: { id: ids[actor], isActive: true } } });
    expect(Object.keys(result.body.action.performedBy).sort()).toEqual(['id', 'name']);
    const data = await state(parent.id);
    expect(data.ticket?.ownerId).toBe(ids.s2);
    expect(data.ticket?.updatedAt.getTime()).toBeGreaterThan(baseTime.getTime());
    expect(data.actions).toHaveLength(1); expect(data.revisions).toHaveLength(1); expect(data.receipts).toHaveLength(1);
    expect(data.revisions[0]).toMatchObject({ actorId: ids[actor], revision: 1 });
    expect(Object.keys(data.revisions[0].snapshot as object)).toHaveLength(11);
    const lookup = await request(app).get('/api/staff/users').set('Cookie', sessions[actor].cookie);
    expect(lookup.status).toBe(200);
    expect(lookup.body.users.map((user: { id: string }) => user.id).sort()).toEqual([ids.s1, ids.s2, ids.admin].sort());
  });
  it.each([
    { description: '' }, { description: ' \t ' }, { description: 'x'.repeat(2001) }, { description: null },
    { result: 'x'.repeat(2001) }, { attachmentNotes: 'x'.repeat(1001) }, { followUpNote: 'x'.repeat(1001) },
    { followUpRequired: true }, { followUpRequired: true, followUpNote: ' ' }, { followUpRequired: false, followUpNote: 'Unexpected' },
    { followUpRequired: 'true' }, { assigneeId: null }, { assigneeId: 'bad' },
    { expectedTicketVersion: 0 }, { expectedTicketVersion: '1' }, { expectedTicketVersion: 1.5 },
    { performedById: ids.s2 }, { actorId: ids.admin }, { ticketId: 99 }, { resolutionCycle: 3 },
    { status: 'COMPLETED' }, { createdAt: '2026-10-01T00:00:00Z' }, { cancellationReason: 'No' },
    { actionAt: '2026-10-20T10:00:00' }, { actionAt: '2026-02-30T10:00:00Z' },
    { actionAt: '2026-09-30T23:59:59.999Z' }, { actionAt: '2099-01-01T00:00:00Z' },
  ])('API-03: rejects invalid/spoofed POST %j without any writes', async body => {
    const parent = await ticket(), before = await state(parent.id);
    error(await post(parent.id, body), 400, 'VALIDATION_ERROR');
    expect(await state(parent.id)).toEqual(before);
  });
  it('API-03: exact maximum strings and offset-equivalent Ticket creation time round-trip', async () => {
    const parent = await ticket();
    const result = await post(parent.id, { description: '😀'.repeat(2000), result: 'x'.repeat(2000), followUpRequired: true, followUpNote: 'x'.repeat(1000), attachmentNotes: 'x'.repeat(1000), actionAt: '2026-10-01T07:00:00+07:00' });
    expect(result.status).toBe(201);
    expect(result.body.action.actionAt).toBe(baseTime.toISOString());
  });
  it('API-04: assignment, different editor and reassignment preserve performer and Ticket Owner', async () => {
    const parent = await ticket();
    const first = await post(parent.id, { assigneeId: ids.s2 });
    const result = await patch(parent.id, first.body.action.id, { assigneeId: ids.admin, description: 'Updated by a different staff member' }, 's2');
    expect(result.status).toBe(200);
    expect(result.body.action).toMatchObject({ version: 2, performedBy: { id: ids.s1 }, assignee: { id: ids.admin } });
    const data = await state(parent.id);
    expect(data.ticket?.ownerId).toBe(ids.s2);
    expect(data.revisions.map(r => r.actorId)).toEqual([ids.s1, ids.s2]);
  });
  it.each(['r1', 'inactive', 'missing'] as const)('API-05: refuses new assignment to %s', async alias => {
    const parent = await ticket(), before = await state(parent.id);
    error(await post(parent.id, { assigneeId: alias === 'missing' ? randomUUID() : ids[alias] }), 400, 'VALIDATION_ERROR');
    expect(await state(parent.id)).toEqual(before);
  });
  it('API-05: inactive-assignee completion fails; reassignment enables completion and historical correction', async () => {
    const parent = await ticket();
    const created = await post(parent.id, { assigneeId: ids.s2 });
    await db.user.update({ where: { id: ids.s2 }, data: { isActive: false } });
    try {
      const before = await state(parent.id);
      error(await patch(parent.id, created.body.action.id, { status: 'COMPLETED', result: 'Done' }), 400, 'VALIDATION_ERROR');
      expect(await state(parent.id)).toEqual(before);
      const read = await request(app).get(`/api/tickets/${parent.id}/actions`).set('Cookie', sessions.r1.cookie);
      expect(read.body.actions[0].assignee).toMatchObject({ id: ids.s2, name: 's2', isActive: false });
      expect((await patch(parent.id, created.body.action.id, { assigneeId: ids.admin, status: 'COMPLETED', result: 'Completed after reassignment' })).status).toBe(200);
      await db.user.update({ where: { id: ids.admin }, data: { isActive: false } });
      try { expect((await patch(parent.id, created.body.action.id, { result: 'Corrected historical result' })).status).toBe(200); }
      finally { await db.user.update({ where: { id: ids.admin }, data: { isActive: true } }); }
    } finally { await db.user.update({ where: { id: ids.s2 }, data: { isActive: true } }); }
  });
  it('API-06/07/08: validates merged completion/follow-up, appends immutable revisions and rejects no-ops/fixed fields', async () => {
    const parent = await ticket();
    const first = await post(parent.id, { followUpRequired: true, followUpNote: 'Check later' });
    const id = first.body.action.id;
    const initial = await db.actionTakenRevision.findMany({ where: { actionId: id } });
    for (const bad of [{ status: 'COMPLETED' }, { description: 'Inspect connection' }, { status: 'PLANNED' }, { followUpNote: '' }, { followUpRequired: false, followUpNote: 'Keep it' }]) {
      const before = await state(parent.id); error(await patch(parent.id, id, bad), 400, 'VALIDATION_ERROR'); expect(await state(parent.id)).toEqual(before);
    }
    expect((await patch(parent.id, id, { status: 'IN_PROGRESS' }, 's2')).status).toBe(200);
    error(await patch(parent.id, id, { status: 'PLANNED' }), 409, 'INVALID_TRANSITION');
    expect((await patch(parent.id, id, { status: 'COMPLETED', result: '  Restored  ' })).body.action.result).toBe('Restored');
    expect((await patch(parent.id, id, { followUpRequired: false })).body.action.followUpNote).toBeNull();
    for (const bad of [{ result: '' }, { status: 'COMPLETED' }]) error(await patch(parent.id, id, bad), 400, 'VALIDATION_ERROR');
    error(await patch(parent.id, id, { assigneeId: ids.s2 }), 409, 'ACTION_NOT_EDITABLE');
    error(await patch(parent.id, id, { status: 'CANCELLED', cancellationReason: 'No' }), 409, 'ACTION_NOT_EDITABLE');
    expect(await db.actionTakenRevision.findFirst({ where: { id: initial[0].id } })).toEqual(initial[0]);
    const revisions = await request(app).get(`/api/staff/tickets/${parent.ticketNumber}/actions/${id}/revisions`).set('Cookie', sessions.admin.cookie);
    expect(revisions.status).toBe(200); expect(revisions.body.pagination.totalCount).toBe(4);
    expect(revisions.body.revisions.map((r: { revision: number }) => r.revision)).toEqual([1, 2, 3, 4]);
    expect(revisions.body.revisions[1].actor.id).toBe(ids.s2);
    expect(revisions.body.revisions[2].snapshot.followUpNote).toBe('Check later');
  });
  it('API-06: cancellation requires reason, preserves cancellation evidence and makes the action read-only', async () => {
    const parent = await ticket(), result = await post(parent.id), id = result.body.action.id;
    error(await patch(parent.id, id, { status: 'CANCELLED' }), 400, 'VALIDATION_ERROR');
    error(await patch(parent.id, id, { cancellationReason: 'Unexpected' }), 400, 'VALIDATION_ERROR');
    expect((await patch(parent.id, id, { status: 'CANCELLED', cancellationReason: '  Superseded  ' })).body.action.cancellationReason).toBe('Superseded');
    const before = await state(parent.id);
    error(await patch(parent.id, id, { description: 'Change cancelled' }), 409, 'ACTION_NOT_EDITABLE');
    expect(await state(parent.id)).toEqual(before);
  });
  it.each(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].flatMap(from => ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(to => [from, to])))('API-06: direct API matrix %s -> %s', async (from, to) => {
    const parent = await ticket(), created = await post(parent.id), id = created.body.action.id;
    if (from !== 'PLANNED') expect((await patch(parent.id, id, { status: from, ...(from === 'COMPLETED' ? { result: 'Initial completion' } : {}), ...(from === 'CANCELLED' ? { cancellationReason: 'Initial cancellation' } : {}) })).status).toBe(200);
    const before = await state(parent.id);
    const result = await patch(parent.id, id, { status: to, ...(to === 'COMPLETED' ? { result: 'Work finished' } : {}), ...(to === 'CANCELLED' ? { cancellationReason: 'No longer required' } : {}) });
    const allowed = (from === 'PLANNED' && ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(to)) || (from === 'IN_PROGRESS' && ['COMPLETED', 'CANCELLED'].includes(to));
    if (allowed) { expect(result.status).toBe(200); expect(result.body.action.status).toBe(to); }
    else { expect(result.status).toBe(from !== 'CANCELLED' && from === to ? 400 : 409); expect(await state(parent.id)).toEqual(before); }
  });
  it('API-03/08/09: invalid PATCH, missing nested resources, empty/beyond-last history and unsupported history writes are safe', async () => {
    const parent = await ticket();
    const empty = await request(app).get(`/api/tickets/${parent.id}/actions`).set('Cookie', sessions.r1.cookie);
    expect(empty.body).toMatchObject({ actions: [], pagination: { totalCount: 0 }, ticketVersion: 1 });
    const created = await post(parent.id), id = created.body.action.id;
    for (const bad of [{ description: null }, { result: 2 }, { attachmentNotes: 'x'.repeat(1001) }, { performedById: ids.admin }, { expectedVersion: 0 }, { expectedTicketVersion: '2' }, { cancellationReason: 'x'.repeat(1001), status: 'CANCELLED' }]) {
      const before = await state(parent.id); error(await patch(parent.id, id, bad), 400, 'VALIDATION_ERROR'); expect(await state(parent.id)).toEqual(before);
    }
    const history = `/api/staff/tickets/${parent.id}/actions/${id}/revisions`;
    expect((await request(app).get(`${history}?page=2&pageSize=1`).set('Cookie', sessions.s1.cookie)).body.revisions).toEqual([]);
    error(await request(app).get(`${history}?pageSize=51`).set('Cookie', sessions.s1.cookie), 400, 'VALIDATION_ERROR');
    const before = await state(parent.id);
    error(await request(app).patch(history).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ snapshot: {} }), 404, 'NOT_FOUND');
    error(await request(app).delete(history).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf), 404, 'NOT_FOUND');
    error(await request(app).patch(`/api/staff/tickets/${parent.id}/actions/${randomUUID()}`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ expectedTicketVersion: 2, expectedVersion: 1, description: 'Missing action' }), 404, 'NOT_FOUND');
    expect(await state(parent.id)).toEqual(before);
  });
  it.each(['Resolved', 'Closed', 'Cancelled'])('API-06: freezes action writes under %s parent', async status => {
    const parent = await ticket(), first = await post(parent.id);
    await db.ticket.update({ where: { id: parent.id }, data: { currentStatus: status } });
    const before = await state(parent.id);
    error(await post(parent.id), 409, 'TICKET_NOT_EDITABLE');
    error(await patch(parent.id, first.body.action.id, { description: 'Cannot change' }), 409, 'TICKET_NOT_EDITABLE');
    expect(await state(parent.id)).toEqual(before);
  });
  it('API-06: preserves visible prior-cycle records while refusing edits after reopening', async () => {
    const parent = await ticket(), first = await post(parent.id);
    await db.ticket.update({ where: { id: parent.id }, data: { currentStatus: 'Reopened', resolutionCycle: 2 } });
    error(await patch(parent.id, first.body.action.id, { description: 'Old cycle' }), 409, 'ACTION_NOT_EDITABLE');
    expect((await post(parent.id)).body.action.resolutionCycle).toBe(2);
    const list = await request(app).get(`/api/tickets/${parent.id}/actions`).set('Cookie', sessions.r1.cookie);
    expect(list.body.actions.map((a: { resolutionCycle: number }) => a.resolutionCycle)).toEqual([1, 2]);
  });
  it('API-09: list ordering, pagination, actionAt correction and scoped parent/revision lookups are stable', async () => {
    const parent = await ticket();
    const first = await post(parent.id, { actionAt: baseTime.toISOString() });
    const second = await post(parent.id, { actionAt: baseTime.toISOString() });
    const path = `/api/tickets/${parent.id}/actions`;
    const list = await request(app).get(path).set('Cookie', sessions.r1.cookie);
    expect(list.body.actions.map((a: { id: string }) => a.id)).toEqual([first.body.action.id, second.body.action.id].sort());
    expect(list.body.pagination).toEqual({ page: 1, pageSize: 20, totalCount: 2 });
    expect((await request(app).get(`${path}?page=3&pageSize=1`).set('Cookie', sessions.r1.cookie)).body.actions).toEqual([]);
    expect((await request(app).get(`${path}?pageSize=1`).set('Cookie', sessions.r1.cookie)).body.actions).toHaveLength(1);
    expect((await patch(parent.id, first.body.action.id, { actionAt: '2026-10-02T00:00:00Z' })).status).toBe(200);
    expect((await request(app).get(path).set('Cookie', sessions.r1.cookie)).body.actions.at(-1).id).toBe(first.body.action.id);
    for (const query of ['page=0', 'pageSize=51', 'page=1&page=2', 'requesterId=' + ids.r2]) error(await request(app).get(`${path}?${query}`).set('Cookie', sessions.r1.cookie), 400, 'VALIDATION_ERROR');
    const other = await ticket();
    error(await request(app).get(`/api/staff/tickets/${other.id}/actions/${first.body.action.id}/revisions`).set('Cookie', sessions.s1.cookie), 404, 'NOT_FOUND');
    const before = await state(parent.id);
    error(await patch(other.id, first.body.action.id, { description: 'Wrong parent' }), 404, 'NOT_FOUND');
    expect(await state(parent.id)).toEqual(before);
  });
  it('API-10/11: canonical replay retains original body after edits/terminal state; changed payload/parent conflicts and actor scopes differ', async () => {
    const parent = await ticket(), key = randomUUID();
    const first = await post(parent.id, { description: '  Replay work  ' }, 's1', key);
    const secondActor = await post(parent.id, { description: 'Replay work' }, 'admin', key);
    expect(secondActor.status).toBe(201);
    await patch(parent.id, first.body.action.id, { description: 'Later correction' });
    await db.ticket.update({ where: { id: parent.id }, data: { currentStatus: 'Resolved' } });
    const before = await state(parent.id);
    const replay = await post(parent.ticketNumber, { expectedTicketVersion: 1, description: 'Replay work' }, 's1', key);
    expect(replay.status).toBe(200); expect(replay.headers['idempotency-replayed']).toBe('true'); expect(replay.body).toEqual(first.body);
    expect(await state(parent.id)).toEqual(before);
    error(await post(parent.id, { expectedTicketVersion: 1, description: 'Different' }, 's1', key), 409, 'IDEMPOTENCY_CONFLICT');
    const other = await ticket();
    error(await post(other.id, { expectedTicketVersion: 1, description: 'Replay work' }, 's1', key), 409, 'IDEMPOTENCY_CONFLICT');
    error(await post(parent.id, { expectedTicketVersion: 1, description: 'Replay work', actionAt: first.body.action.actionAt }, 's1', key), 409, 'IDEMPOTENCY_CONFLICT');
  });
  it('API-11: failed input stores no receipt and the same key can submit corrected work', async () => {
    const parent = await ticket(), key = randomUUID();
    error(await post(parent.id, { description: ' ' }, 's1', key), 400, 'VALIDATION_ERROR');
    expect(await db.actionCreateRequest.count({ where: { actorId: ids.s1, key } })).toBe(0);
    expect((await post(parent.id, {}, 's1', key)).status).toBe(201);
  });
  it('SEC-01/03: Requester reads only own current actions, including cancelled history, without private/account fields', async () => {
    const parent = await ticket(), created = await post(parent.id), id = created.body.action.id;
    await patch(parent.id, id, { status: 'CANCELLED', cancellationReason: 'Shared reason' });
    await db.note.create({ data: { ticketId: parent.id, authorId: ids.s1, content: 'PRIVATE_NOTE_SENTINEL' } });
    const own = await request(app).get(`/api/tickets/${parent.id}/actions`).set('Cookie', sessions.r1.cookie);
    expect(own.status).toBe(200); expect(own.body.actions[0].status).toBe('CANCELLED');
    expect(JSON.stringify(own.body)).not.toMatch(/PRIVATE_NOTE_SENTINEL|internalNotes|passwordHash|email|revisions/);
    const other = await request(app).get(`/api/tickets/${parent.id}/actions`).set('Cookie', sessions.r2.cookie);
    const missing = await request(app).get('/api/tickets/2147483647/actions').set('Cookie', sessions.r2.cookie);
    error(other, 404, 'NOT_FOUND'); expect(other.body).toEqual(missing.body);
    error(await request(app).get(`/api/staff/tickets/${parent.id}/actions/${id}/revisions`).set('Cookie', sessions.r1.cookie), 403, 'FORBIDDEN');
  });
  it('SEC-02/04/06: authentication, role and CSRF checks reject direct requests before lookup or writes', async () => {
    const parent = await ticket(), before = await state(parent.id);
    error(await request(app).get(`/api/tickets/${parent.id}/actions?requesterId=${ids.r1}`), 401, 'UNAUTHENTICATED');
    error(await request(app).post('/api/staff/tickets/not-valid!/actions').set('Cookie', sessions.r1.cookie).send({}), 403, 'FORBIDDEN');
    error(await post(parent.id, {}, 'r1'), 403, 'FORBIDDEN');
    error(await request(app).post(`/api/staff/tickets/${parent.id}/actions`).set('Cookie', sessions.s1.cookie).set('Idempotency-Key', randomUUID()).send({ expectedTicketVersion: 1, description: 'Work' }), 403, 'FORBIDDEN');
    error(await request(app).post(`/api/staff/tickets/${parent.id}/actions`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s2.csrf).set('Idempotency-Key', randomUUID()).send({ expectedTicketVersion: 1, description: 'Work' }), 403, 'FORBIDDEN');
    expect(await state(parent.id)).toEqual(before);
    const created = await post(parent.id), id = created.body.action.id;
    const actionPath = `/api/staff/tickets/${parent.id}/actions/${id}`;
    const after = await state(parent.id);
    for (const actor of ['r1', 'r2'] as const) error(await patch(parent.id, id, { description: 'Unauthorized' }, actor), 403, 'FORBIDDEN');
    error(await request(app).patch(actionPath).send({ expectedTicketVersion: 2, expectedVersion: 1, description: 'No login' }), 401, 'UNAUTHENTICATED');
    error(await request(app).get(`${actionPath}/revisions`), 401, 'UNAUTHENTICATED');
    error(await request(app).patch(actionPath).set('Cookie', sessions.s1.cookie).send({ expectedTicketVersion: 2, expectedVersion: 1, description: 'No CSRF' }), 403, 'FORBIDDEN');
    expect(await state(parent.id)).toEqual(after);
  });
  it('SEC-05/07: current deactivation/demotion/password-change state is enforced before replay', async () => {
    const parent = await ticket(), key = randomUUID();
    expect((await post(parent.id, {}, 's1', key)).status).toBe(201);
    const before = await state(parent.id);
    for (const [changes, status, code] of [
      [{ isActive: false }, 401, 'UNAUTHENTICATED'], [{ role: 'REQUESTER' }, 403, 'FORBIDDEN'], [{ mustChangePassword: true }, 403, 'PASSWORD_CHANGE_REQUIRED'],
    ] as const) {
      await db.user.update({ where: { id: ids.s1 }, data: changes });
      try { error(await post(parent.id, { expectedTicketVersion: 1 }, 's1', key), status, code); }
      finally { await db.user.update({ where: { id: ids.s1 }, data: { isActive: true, role: 'IT_STAFF', mustChangePassword: false } }); }
    }
    error(await request(app).get(`/api/tickets/${parent.id}/actions`).set('Cookie', sessions.forced.cookie), 403, 'PASSWORD_CHANGE_REQUIRED');
    const disposableSession = await login('s1');
    expect((await request(app).post('/api/auth/logout').set('Cookie', disposableSession.cookie).set('X-CSRF-Token', disposableSession.csrf)).status).toBe(200);
    error(await request(app).get(`/api/tickets/${parent.id}/actions`).set('Cookie', disposableSession.cookie), 401, 'UNAUTHENTICATED');
    expect(await state(parent.id)).toEqual(before);
  });
  it('SEC-08: receipt failure rolls back action/audit/version and returns a generic error; JSON and IDs fail safely', async () => {
    const parent = await ticket(), before = await state(parent.id);
    await db.$executeRawUnsafe(`CREATE FUNCTION lab4_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_DATABASE_FAILURE'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER lab4_fail_receipt BEFORE INSERT ON "ActionCreateRequest" FOR EACH ROW EXECUTE FUNCTION lab4_fail_receipt()`);
    try {
      const result = await post(parent.id); error(result, 500, 'INTERNAL_ERROR'); expect(JSON.stringify(result.body)).not.toContain('PRIVATE_DATABASE_FAILURE');
      expect(await state(parent.id)).toEqual(before);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER lab4_fail_receipt ON "ActionCreateRequest"'); await db.$executeRawUnsafe('DROP FUNCTION lab4_fail_receipt()'); }
    error(await request(app).post(`/api/staff/tickets/${parent.id}/actions`).set('Content-Type', 'application/json').send('{'), 400, 'VALIDATION_ERROR');
    error(await request(app).post(`/api/staff/tickets/${parent.id}/actions`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).set('Idempotency-Key', randomUUID()).send({ expectedTicketVersion: 1, description: 'x'.repeat(120_000) }), 400, 'VALIDATION_ERROR');
    error(await request(app).get('/api/tickets/%E0%A4%A/actions').set('Cookie', sessions.r1.cookie), 400, 'VALIDATION_ERROR');
    error(await request(app).get('/api/tickets/0/actions').set('Cookie', sessions.r1.cookie), 400, 'VALIDATION_ERROR');
    error(await request(app).get(`/api/staff/tickets/${parent.id}/actions/not-uuid/revisions`).set('Cookie', sessions.s1.cookie), 400, 'VALIDATION_ERROR');
    error(await request(app).post(`/api/staff/tickets/${parent.id}/actions`).set('Cookie', sessions.s1.cookie).set('X-CSRF-Token', sessions.s1.csrf).send({ expectedTicketVersion: 1, description: 'Work' }), 400, 'VALIDATION_ERROR');
  });
  it('CON-01/05 (action portion): simultaneous creates/retries and edits cannot duplicate or overwrite current work', async () => {
    const parent = await ticket(), key = randomUUID();
    const creates = await Promise.all([post(parent.id, { expectedTicketVersion: 1 }, 's1', key), post(parent.id, { expectedTicketVersion: 1 }, 's1', key)]);
    expect(creates.map(r => r.status).sort()).toEqual([200, 201]);
    expect(creates[0].body).toEqual(creates[1].body);
    const id = creates[0].body.action.id;
    const edits = await Promise.all([patch(parent.id, id, { expectedTicketVersion: 2, expectedVersion: 1, description: 'Writer one' }), patch(parent.id, id, { expectedTicketVersion: 2, expectedVersion: 1, description: 'Writer two' }, 's2')]);
    expect(edits.map(r => r.status).sort()).toEqual([200, 409]);
    const failed = edits.find(r => r.status === 409)!;
    error(failed, 409, 'STALE_VERSION'); expect(failed.body.error).toMatchObject({ currentTicketVersion: 3, currentActionVersion: 2 });
    const data = await state(parent.id);
    expect(data.actions).toHaveLength(1); expect(data.revisions).toHaveLength(2); expect(data.receipts).toHaveLength(1); expect(data.ticket?.version).toBe(3);
    const staleBefore = await state(parent.id);
    await db.ticket.update({ where: { id: parent.id }, data: { currentStatus: 'Resolved' } });
    error(await patch(parent.id, id, { expectedTicketVersion: 1, description: 'Stale even though parent frozen' }), 409, 'STALE_VERSION');
    expect(await db.actionTaken.findUnique({ where: { id } })).toEqual(staleBefore.actions[0]);
    const different = await ticket(), differentKey = randomUUID();
    const conflicts = await Promise.all([post(different.id, { expectedTicketVersion: 1, description: 'First payload' }, 's1', differentKey), post(different.id, { expectedTicketVersion: 1, description: 'Second payload' }, 's1', differentKey)]);
    expect(conflicts.map(r => r.status).sort()).toEqual([201, 409]);
    error(conflicts.find(r => r.status === 409)!, 409, 'IDEMPOTENCY_CONFLICT');
    expect((await state(different.id)).actions).toHaveLength(1);
    const left = await ticket(), right = await ticket(), crossKey = randomUUID();
    const cross = await Promise.all([post(left.id, { expectedTicketVersion: 1 }, 's1', crossKey), post(right.id, { expectedTicketVersion: 1 }, 's1', crossKey)]);
    expect(cross.map(r => r.status).sort()).toEqual([201, 409]);
    error(cross.find(r => r.status === 409)!, 409, 'IDEMPOTENCY_CONFLICT');
    expect(await db.actionTaken.count({ where: { ticketId: { in: [left.id, right.id] } } })).toBe(1);
    expect(await db.actionCreateRequest.count({ where: { actorId: ids.s1, key: crossKey } })).toBe(1);
  });
  it.each(['actor', 'assignee'] as const)('CON-04 (action portion): revalidates %s after waiting for an account-change lock', async kind => {
    const parent = await ticket(), before = await state(parent.id);
    const userId = kind === 'actor' ? ids.s1 : ids.s2;
    let signalLocked!: () => void, commitChange!: () => void;
    const locked = new Promise<void>(resolve => { signalLocked = resolve; });
    const release = new Promise<void>(resolve => { commitChange = resolve; });
    const adminWrite = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      signalLocked();
      await release;
      await tx.user.update({ where: { id: userId }, data: { isActive: false } });
    }, { timeout: 10_000 });
    await locked;
    const pending = post(parent.id, { assigneeId: ids.s2 });
    try {
      const deadline = Date.now() + 4000;
      let observed = false;
      while (Date.now() < deadline) {
        const waiting = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "User"%' AND query LIKE '%FOR UPDATE%'`;
        if (waiting[0].count > 0) { observed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(observed).toBe(true);
      commitChange(); await adminWrite;
      error(await pending, kind === 'actor' ? 401 : 400, kind === 'actor' ? 'UNAUTHENTICATED' : 'VALIDATION_ERROR');
      expect(await state(parent.id)).toEqual(before);
    } finally {
      commitChange(); await adminWrite; await pending;
      await db.user.update({ where: { id: userId }, data: { isActive: true } });
    }
  });
  it.each(['40001', '40P01'])('CON-03 (action portion): database SQLSTATE %s rolls back and returns a retryable conflict', async code => {
    const parent = await ticket(), before = await state(parent.id);
    await db.$executeRawUnsafe(`CREATE FUNCTION lab4_retry_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_RETRY_DETAIL' USING ERRCODE = '${code}'; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER lab4_retry_receipt BEFORE INSERT ON "ActionCreateRequest" FOR EACH ROW EXECUTE FUNCTION lab4_retry_receipt()');
    try {
      error(await post(parent.id), 409, 'RETRYABLE_CONFLICT');
      expect(await state(parent.id)).toEqual(before);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER lab4_retry_receipt ON "ActionCreateRequest"'); await db.$executeRawUnsafe('DROP FUNCTION lab4_retry_receipt()'); }
  });
});
