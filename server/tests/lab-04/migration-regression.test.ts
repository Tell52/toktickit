import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { MigrationHarness, migrationName, migrationSql, serverRoot } from './migration-support';

const databaseUrl = process.env.LAB4_MIGRATION_DATABASE_URL;
const statuses = ['NEW', 'open', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'Closed', 'REOPENED', 'CANCELLED'];
const canonical = ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Resolved', 'Closed', 'Reopened', 'Cancelled'];
const ids = { requester: randomUUID(), owner: randomUUID(), performer: randomUUID(), inactive: randomUUID() };
const fixedTime = new Date('2026-10-01T00:00:00.000Z');
const legacyTables = ['Category', 'RelatedSystem', 'User', 'Ticket', 'Attachment', 'Comment', 'Note'] as const;

async function inventory(db: PrismaClient) {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const table of legacyTables) {
    result[table] = await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY "id"`)
      .then(rows => (rows as { row: Record<string, unknown> }[]).map(r => r.row));
  }
  return result;
}

async function seedLegacy(db: PrismaClient) {
  await db.$executeRaw`INSERT INTO "Category" ("name") VALUES ('Migration hardware')`;
  await db.$executeRaw`INSERT INTO "RelatedSystem" ("name") VALUES ('Migration network')`;
  for (const [kind, id] of Object.entries(ids)) {
    const role = kind === 'requester' ? 'REQUESTER' : kind === 'owner' ? 'ADMINISTRATOR' : 'IT_STAFF';
    await db.$executeRaw`INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "updatedAt")
      VALUES (${id}, ${kind}, ${kind + '@migration.invalid'}, 'preserve-hash', ${role}::"Role", ${kind !== 'inactive'}, false, ${fixedTime})`;
  }
  for (let i = 0; i < statuses.length; i++) {
    await db.$executeRaw`INSERT INTO "Ticket" ("ticketNumber", "summary", "description", "requestedPriority", "itPriority", "currentStatus",
      "requesterId", "ownerId", "categoryId", "relatedSystemId", "createdAt", "updatedAt", "problemAppearsResolved", "indicatedAt")
      VALUES (${'MIG-' + i}, 'Preserve summary', 'Preserve description', ${['LOW', 'medium', 'High'][i % 3]},
        ${i % 2 ? null : 'HIGH'}, ${statuses[i]}, ${ids.requester}, ${i % 2 ? null : ids.owner}, 1, 1, ${fixedTime}, ${fixedTime}, true, ${fixedTime})`;
  }
  await db.$executeRaw`INSERT INTO "Attachment" ("fileName", "fileType", "fileSize", "fileUrl", "ticketId")
    VALUES ('evidence.pdf', 'application/pdf', 28, '/uploads/evidence.pdf', 1)`;
  await db.$executeRaw`INSERT INTO "Attachment" ("fileName", "fileType", "fileSize", "fileUrl", "ticketId", "isRemoved", "removalReason")
    VALUES ('removed.png', 'image/png', 4, '/uploads/removed.png', 2, true, 'Duplicate')`;
  await db.$executeRaw`INSERT INTO "Comment" ("id", "content", "ticketId", "authorId") VALUES (${randomUUID()}, 'Public evidence', 1, ${ids.requester})`;
  await db.$executeRaw`INSERT INTO "Note" ("id", "content", "ticketId", "authorId") VALUES (${randomUUID()}, 'Private evidence', 1, ${ids.owner})`;
}

// Ordinary API runs skip this isolated, database-creating suite. CI and the
// explicit test:migration command enable it with a dedicated server URL.
describe.skipIf(!databaseUrl).sequential('Lab 4 database migration and recovery', () => {
  let directory: string;
  let harness: MigrationHarness;
  let db: PrismaClient;
  let url: string;
  let before: Awaited<ReturnType<typeof inventory>>;
  let backup: Buffer;
  const connections: PrismaClient[] = [];
  const connect = (value: string) => {
    const client = harness.client(value);
    connections.push(client);
    return client;
  };
  const actionData = () => ({
    ticketId: 1, resolutionCycle: 1, description: 'Inspect connection',
    performedById: ids.performer, assigneeId: ids.owner, actionAt: fixedTime,
  });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'toktickit-lab4-migration-'));
    harness = new MigrationHarness(databaseUrl!, directory);
    url = await harness.database();
    harness.deploy(url, false);
    db = connect(url);
    await seedLegacy(db);
    before = await inventory(db);
    writeFileSync(join(directory, 'evidence.pdf'), '%PDF-1.4\nMigration evidence\n');
    cpSync(join(directory, 'evidence.pdf'), join(directory, 'evidence.pdf.backup'));
    backup = harness.backup(url, 'lab3.dump');
    harness.deploy(url, true);
  }, 120_000);

  afterAll(async () => {
    await Promise.all(connections.map(c => c.$disconnect()));
    try { await harness?.close(); }
    finally {
      if (directory && resolve(dirname(directory)) === resolve(tmpdir()) && basename(directory).startsWith('toktickit-lab4-migration-')) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }, 60_000);

  it('MIG-01 preserves every legacy row/reference except documented aliases; backfills without fabricated history', async () => {
    const after = await inventory(db);
    for (const table of legacyTables) {
      if (table !== 'Ticket') expect(after[table]).toEqual(before[table]);
    }
    expect(after.Ticket).toEqual(before.Ticket.map((ticket, i) => ({
      ...ticket, currentStatus: canonical[i], requestedPriority: ['Low', 'Medium', 'High'][i % 3],
      itPriority: i % 2 ? null : 'High', version: 1, resolutionCycle: 1, resolvedAt: null,
    })));
    for (const table of ['ActionTaken', 'ActionTakenRevision', 'TicketStatusEvent', 'ActionCreateRequest']) {
      expect(await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "${table}"`)).toEqual([{ count: 0 }]);
    }
    const counts = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE "migration_name" = ${migrationName} AND "finished_at" IS NOT NULL`;
    expect(counts).toEqual([{ count: 1 }]);
    harness.deploy(url, true);
    expect(await inventory(db)).toEqual(after);
  }, 60_000);

  it('DB-01 stores independent performers/assignees, required defaults, revisions, receipts and events through Prisma', async () => {
    const first = await db.actionTaken.create({ data: actionData() });
    const second = await db.actionTaken.create({ data: { ...actionData(), performedById: ids.owner, assigneeId: ids.performer } });
    expect(first).toMatchObject({ status: 'PLANNED', version: 1, followUpRequired: false, result: null, followUpNote: null });
    expect(first.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(second.performedById).not.toBe(first.performedById);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: 1 } })).ownerId).toBe(ids.owner);
    const { id, version, ticketId, createdAt, updatedAt, ...snapshot } = first;
    await db.actionTakenRevision.create({ data: { actionId: id, revision: version, actorId: ids.performer, snapshot: JSON.parse(JSON.stringify(snapshot)) } });
    await db.ticketStatusEvent.create({ data: { ticketId, actorId: ids.owner, fromStatus: 'New', toStatus: 'Open', resolutionCycle: 1 } });
    const key = randomUUID();
    await db.actionCreateRequest.create({ data: { actorId: ids.performer, key, ticketId, requestHash: 'a'.repeat(64), response: { id, version } } });
    expect(await db.actionCreateRequest.findUnique({ where: { actorId_key: { actorId: ids.performer, key } } })).toMatchObject({ response: { id, version } });
    await db.user.update({ where: { id: ids.performer }, data: { isActive: false, role: 'REQUESTER' } });
    expect((await db.actionTaken.findUniqueOrThrow({ where: { id }, include: { performedBy: true } })).performedBy.isActive).toBe(false);
    await db.user.update({ where: { id: ids.performer }, data: { isActive: true, role: 'IT_STAFF' } });
  });

  it('DB-02 rejects invalid field boundaries, missing conditional evidence and nonpositive counters', async () => {
    const invalid: Prisma.ActionTakenUncheckedCreateInput[] = [
      { ...actionData(), description: '' }, { ...actionData(), description: '\t\n ' },
      { ...actionData(), description: 'x'.repeat(2001) }, { ...actionData(), result: 'x'.repeat(2001) },
      { ...actionData(), status: 'COMPLETED' }, { ...actionData(), status: 'COMPLETED', result: ' ' },
      { ...actionData(), followUpRequired: true }, { ...actionData(), followUpRequired: true, followUpNote: ' ' },
      { ...actionData(), followUpRequired: true, followUpNote: 'x'.repeat(1001) },
      { ...actionData(), followUpNote: 'Unexpected' }, { ...actionData(), attachmentNotes: 'x'.repeat(1001) },
      { ...actionData(), status: 'CANCELLED' }, { ...actionData(), status: 'CANCELLED', cancellationReason: ' ' },
      { ...actionData(), status: 'CANCELLED', cancellationReason: 'x'.repeat(1001) },
      { ...actionData(), cancellationReason: 'Unexpected' }, { ...actionData(), version: 0 }, { ...actionData(), resolutionCycle: 0 },
    ];
    const count = await db.actionTaken.count();
    for (const data of invalid) await expect(db.actionTaken.create({ data })).rejects.toThrow(/violates check constraint/);
    expect(await db.actionTaken.count()).toBe(count);
    const valid = await db.actionTaken.create({ data: {
      ...actionData(), description: 'x'.repeat(2000), status: 'COMPLETED', result: 'x'.repeat(2000),
      followUpRequired: true, followUpNote: 'x'.repeat(1000), attachmentNotes: 'x'.repeat(1000),
    } });
    expect(valid.version).toBe(1);
    await db.actionTaken.create({ data: { ...actionData(), status: 'CANCELLED', cancellationReason: 'x'.repeat(1000) } });
    await expect(db.ticket.update({ where: { id: 1 }, data: { version: 0 } })).rejects.toThrow(/violates check constraint/);
    await expect(db.ticket.update({ where: { id: 1 }, data: { resolutionCycle: 0 } })).rejects.toThrow(/violates check constraint/);
  });

  it('DB-03 restricts orphans/deletion, validates audit payloads and enforces uniqueness scopes', async () => {
    for (const data of [{ ...actionData(), ticketId: 99999 }, { ...actionData(), performedById: randomUUID() }, { ...actionData(), assigneeId: randomUUID() }]) {
      await expect(db.actionTaken.create({ data })).rejects.toMatchObject({ code: 'P2003' });
    }
    const action = await db.actionTaken.findFirstOrThrow({ where: { revisions: { some: {} } } });
    const revision = { actionId: action.id, revision: 1, actorId: ids.performer, snapshot: {} };
    await expect(db.actionTakenRevision.create({ data: revision })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.actionTakenRevision.create({ data: { ...revision, revision: 0 } })).rejects.toThrow(/violates check constraint/);
    await expect(db.actionTakenRevision.create({ data: { ...revision, revision: 2, snapshot: [] } })).rejects.toThrow(/violates check constraint/);
    await expect(db.actionTakenRevision.create({ data: { ...revision, revision: 2, actorId: randomUUID() } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.actionTaken.delete({ where: { id: action.id } })).rejects.toMatchObject({ code: 'P2003' });
    // Isolate each User FK: the baseline's other relations must not cause a false positive.
    for (const relation of ['performer', 'assignee', 'revision', 'event', 'receipt'] as const) {
      const user = await db.user.create({ data: { name: relation, email: `${randomUUID()}@migration.invalid`, passwordHash: 'hash', role: 'IT_STAFF' } });
      if (relation === 'performer' || relation === 'assignee') await db.actionTaken.create({ data: { ...actionData(), [relation === 'performer' ? 'performedById' : 'assigneeId']: user.id } });
      if (relation === 'revision') await db.actionTakenRevision.create({ data: { ...revision, revision: 2, actorId: user.id } });
      if (relation === 'event') await db.ticketStatusEvent.create({ data: { ticketId: 1, actorId: user.id, fromStatus: 'New', toStatus: 'Open', resolutionCycle: 1 } });
      if (relation === 'receipt') await db.actionCreateRequest.create({ data: { actorId: user.id, key: randomUUID(), ticketId: 1, requestHash: 'b'.repeat(64), response: {} } });
      await expect(db.user.delete({ where: { id: user.id } })).rejects.toMatchObject({ code: 'P2003' });
    }
    const receipt = await db.actionCreateRequest.findFirstOrThrow();
    const receiptData = {
      actorId: receipt.actorId, key: receipt.key, ticketId: receipt.ticketId,
      requestHash: receipt.requestHash, response: receipt.response as Prisma.InputJsonObject,
    };
    await expect(db.actionCreateRequest.create({ data: receiptData })).rejects.toMatchObject({ code: 'P2002' });
    await db.actionCreateRequest.create({ data: { ...receiptData, actorId: ids.inactive } }); // actor/key scope, not global key
    for (const data of [{ ...receiptData, key: randomUUID(), requestHash: 'bad' }, { ...receiptData, key: randomUUID(), response: [] }]) {
      await expect(db.actionCreateRequest.create({ data })).rejects.toThrow(/violates check constraint/);
    }
    for (const change of [{ toStatus: 'New' }, { toStatus: 'Unknown' }, { toStatus: 'Cancelled' }, { resolutionCycle: 0 }, { reason: 'Unexpected' }]) {
      await expect(db.ticketStatusEvent.create({ data: { ticketId: 1, actorId: ids.owner, fromStatus: 'New', toStatus: 'Open', resolutionCycle: 1, ...change } })).rejects.toThrow(/violates check constraint/);
    }
    // New parents have no legacy children; test each new parent FK separately.
    for (const relation of ['action', 'event', 'receipt'] as const) {
      const parent = await db.ticket.create({ data: { ticketNumber: `FK-${relation}`, summary: 'FK', description: 'FK', requestedPriority: 'Low', requesterId: ids.requester, categoryId: 1, relatedSystemId: 1 } });
      if (relation === 'action') await db.actionTaken.create({ data: { ...actionData(), ticketId: parent.id } });
      if (relation === 'event') await db.ticketStatusEvent.create({ data: { ticketId: parent.id, actorId: ids.owner, fromStatus: 'New', toStatus: 'Open', resolutionCycle: 1 } });
      if (relation === 'receipt') await db.actionCreateRequest.create({ data: { ...receiptData, key: randomUUID(), ticketId: parent.id } });
      await expect(db.ticket.delete({ where: { id: parent.id } })).rejects.toMatchObject({ code: 'P2003' });
    }
  });

  it('DB-04 supports conditional stale-write detection, transaction rollback and required query indexes', async () => {
    const action = await db.actionTaken.create({ data: actionData() });
    const writes = await Promise.all([1, 2].map(() => db.ticket.updateMany({ where: { id: 1, version: 1 }, data: { version: { increment: 1 } } })));
    expect(writes.map(w => w.count).sort()).toEqual([0, 1]);
    const actionWrites = await Promise.all([1, 2].map(() => db.actionTaken.updateMany({ where: { id: action.id, version: 1 }, data: { version: { increment: 1 } } })));
    expect(actionWrites.map(w => w.count).sort()).toEqual([0, 1]);
    const count = await db.actionTaken.count();
    await expect(db.$transaction(async tx => {
      const value = await tx.actionTaken.create({ data: actionData() });
      await tx.actionTakenRevision.create({ data: { actionId: value.id, revision: 1, actorId: ids.performer, snapshot: {} } });
      await tx.ticket.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
      throw new Error('Injected failure before receipt');
    })).rejects.toThrow('Injected failure');
    expect(await db.actionTaken.count()).toBe(count);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: 1 } })).version).toBe(2);
    const indexes = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    expect(indexes.map(x => x.indexname)).toEqual(expect.arrayContaining([
      'ActionTaken_ticketId_resolutionCycle_status_idx', 'ActionTaken_ticketId_actionAt_id_idx',
      'ActionTaken_assigneeId_status_actionAt_id_idx', 'ActionTakenRevision_actionId_revision_key',
      'TicketStatusEvent_ticketId_createdAt_id_idx', 'ActionCreateRequest_actorId_key_key',
      'Ticket_requesterId_currentStatus_idx', 'Ticket_requesterId_updatedAt_id_idx',
      'Ticket_requesterId_resolvedAt_id_idx', 'Ticket_ownerId_currentStatus_idx',
      'Ticket_currentStatus_itPriority_idx', 'Ticket_updatedAt_id_idx',
    ]));
  });

  it.each(['currentStatus', 'requestedPriority', 'itPriority'] as const)('MIG-02 preflight rejects unknown %s and leaves Lab 3 schema/data intact', async field => {
    const badUrl = await harness.database();
    harness.restore(badUrl, backup);
    const badDb = connect(badUrl);
    await badDb.$executeRawUnsafe(`UPDATE "Ticket" SET "${field}" = 'Unknown' WHERE id = 1`);
    const original = await inventory(badDb);
    expect(() => harness.sql(badUrl, readFileSync(join(serverRoot, 'prisma/preflight-lab4.sql'), 'utf8'))).toThrow(/Lab 4 preflight/);
    // Prisma 5 may mask the first SQL error with transaction-aborted; the
    // direct PostgreSQL execution above verifies the actionable diagnostic.
    expect(() => harness.deploy(badUrl, true)).toThrow(/Migration deploy failed/);
    expect(await inventory(badDb)).toEqual(original);
    expect(await badDb.$queryRaw`SELECT to_regclass('public."ActionTaken"')::text AS name`).toEqual([{ name: null }]);
    expect(await badDb.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'Ticket' AND column_name IN ('version', 'resolutionCycle', 'resolvedAt')`).toEqual([]);
    await badDb.$executeRawUnsafe(`UPDATE \"Ticket\" SET \"${field}\" = '${field === 'currentStatus' ? 'New' : 'Low'}' WHERE id = 1`);
    harness.resolveRolledBack(badUrl);
    harness.deploy(badUrl, true);
    expect((await badDb.ticket.findUniqueOrThrow({ where: { id: 1 } })).version).toBe(1);
  }, 60_000);

  it('MIG-03 rolls back late DDL failure and restores the complete Lab 3 backup with attachment bytes', async () => {
    const failedUrl = await harness.database();
    harness.restore(failedUrl, backup);
    const failedDb = connect(failedUrl);
    const injected = migrationSql.replace(/COMMIT;\s*$/, "SELECT 1 / 0;\nCOMMIT;\n");
    expect(injected).not.toBe(migrationSql);
    expect(() => harness.sql(failedUrl, injected)).toThrow(/division by zero/);
    expect(await inventory(failedDb)).toEqual(before);
    expect(await failedDb.$queryRaw`SELECT to_regclass('public."ActionTaken"')::text AS name`).toEqual([{ name: null }]);
    // Preserve all post-upgrade writes before returning to the old application.
    const upgradedDump = harness.backup(url, 'post-upgrade.dump');
    const archiveUrl = await harness.database();
    harness.restore(archiveUrl, upgradedDump);
    const archiveDb = connect(archiveUrl);
    expect(await inventory(archiveDb)).toEqual(await inventory(db));
    for (const table of ['ActionTaken', 'ActionTakenRevision', 'TicketStatusEvent', 'ActionCreateRequest']) {
      const query = `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY "id"`;
      expect(await archiveDb.$queryRawUnsafe(query)).toEqual(await db.$queryRawUnsafe(query));
    }
    const restoredUrl = await harness.database();
    harness.restore(restoredUrl, backup);
    const restoredDb = connect(restoredUrl);
    expect(await inventory(restoredDb)).toEqual(before);
    expect(await restoredDb.$queryRaw`SELECT to_regclass('public."ActionTaken"')::text AS name`).toEqual([{ name: null }]);
    writeFileSync(join(directory, 'evidence.pdf'), 'Damaged after upgrade');
    cpSync(join(directory, 'evidence.pdf.backup'), join(directory, 'evidence.pdf'));
    const digest = (file: string) => createHash('sha256').update(readFileSync(join(directory, file))).digest('hex');
    expect(digest('evidence.pdf')).toBe(digest('evidence.pdf.backup'));
    // Restored sequences must accept subsequent legacy writes.
    const inserted = await restoredDb.$queryRaw<{ id: number }[]>`INSERT INTO "Category" ("name") VALUES ('After restore') RETURNING "id"`;
    expect(inserted[0].id).toBeGreaterThan(1);
    expect(existsSync(join(directory, 'post-upgrade.dump'))).toBe(true);
  }, 60_000);
});
