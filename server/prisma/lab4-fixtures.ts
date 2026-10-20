import { ActionStatus, Prisma, PrismaClient, Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';

export type FixtureProfile = 'demo' | 'dashboard' | 'boundaries' | 'empty';
export type UserAlias = 'R1' | 'R2' | 'R0' | 'S1' | 'S2' | 'S0' | 'A1' | 'P1';
export const fixtureAsOf = new Date('2026-10-20T10:00:00.000Z');
const day = 86_400_000;
const namespace = Buffer.from('0b0cf4f38dcd4c509f7ff99d62c728fa', 'hex');

// Standard UUID v5: stable keys across processes, without changing legacy IDs.
export function fixtureId(profile: FixtureProfile, key: string): string {
  const bytes = createHash('sha1').update(namespace).update(`lab4:${profile}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const fixtureEmail = (profile: FixtureProfile, alias: UserAlias) => `lab4.${profile}.${alias.toLowerCase()}@example.com`;
export const fixtureTicketNumber = (profile: FixtureProfile, alias: string) => `LAB4-${profile.toUpperCase()}-${alias}`;

export function fixtureWindow(asOf: Date) {
  if (!Number.isFinite(asOf.getTime())) throw new Error('Fixture clock must be a valid date');
  const bangkok = new Date(asOf.getTime() + 7 * 3_600_000);
  const since = new Date(Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate() - 6) - 7 * 3_600_000);
  return {
    asOf, since,
    B: new Date(since.getTime() - 1), L: since,
    M: new Date(since.getTime() + 4.5 * day),
    U: new Date(asOf.getTime() - 1), E: asOf,
    createdAt: new Date(since.getTime() - 2 * day),
  };
}

type TicketFixture = {
  alias: string; requester: UserAlias; status: string; owner: UserAlias | null;
  priority: string; itPriority?: string | null; updatedAt: Date; resolvedAt: Date | null; cycle?: number;
};
type ActionFixture = {
  alias: string; ticket: string; cycle: number; assignee: UserAlias; performer: UserAlias;
  status: ActionStatus; actionAt: Date; followUp?: boolean; clearedFollowUp?: boolean;
};

export function buildLab4Fixtures(profile: FixtureProfile, now = new Date()) {
  const clock = fixtureWindow(profile === 'demo' ? now : fixtureAsOf);
  const { B, L, M, U, E, createdAt } = clock;
  const users: { alias: UserAlias; role: Role; isActive: boolean }[] = [
    { alias: 'R1', role: 'REQUESTER', isActive: true },
    { alias: 'R2', role: 'REQUESTER', isActive: true },
    { alias: 'R0', role: 'REQUESTER', isActive: true },
    { alias: 'S1', role: 'IT_STAFF', isActive: true },
    { alias: 'S2', role: 'IT_STAFF', isActive: true },
    { alias: 'S0', role: 'IT_STAFF', isActive: false },
    { alias: 'A1', role: 'ADMINISTRATOR', isActive: true },
    { alias: 'P1', role: 'REQUESTER', isActive: true },
  ];
  let tickets: TicketFixture[] = [
    { alias: 'T1', requester: 'R1', status: 'New', owner: null, priority: 'Low', updatedAt: B, resolvedAt: null },
    { alias: 'T2', requester: 'R1', status: 'Open', owner: 'S1', priority: 'Medium', updatedAt: L, resolvedAt: null },
    { alias: 'T3', requester: 'R1', status: 'In Progress', owner: 'S2', priority: 'High', updatedAt: M, resolvedAt: null },
    { alias: 'T4', requester: 'R1', status: 'Waiting for Requester', owner: 'S1', priority: 'High', itPriority: null, updatedAt: U, resolvedAt: null },
    { alias: 'T5', requester: 'R1', status: 'Resolved', owner: 'S2', priority: 'Low', updatedAt: M, resolvedAt: L },
    { alias: 'T6', requester: 'R1', status: 'Closed', owner: 'S1', priority: 'Medium', updatedAt: M, resolvedAt: B },
    { alias: 'T7', requester: 'R2', status: 'Reopened', owner: null, priority: 'High', updatedAt: E, resolvedAt: null, cycle: 2 },
    { alias: 'T8', requester: 'R2', status: 'Cancelled', owner: 'S2', priority: 'Low', updatedAt: M, resolvedAt: null },
    { alias: 'T9', requester: 'R2', status: 'Resolved', owner: 'S1', priority: 'High', updatedAt: M, resolvedAt: null },
    { alias: 'T10', requester: 'R2', status: 'Closed', owner: null, priority: 'Medium', updatedAt: E, resolvedAt: E },
    { alias: 'T11', requester: 'R1', status: 'Resolved', owner: null, priority: 'High', updatedAt: U, resolvedAt: U },
  ];
  let actions: ActionFixture[] = [
    { alias: 'X1', ticket: 'T3', cycle: 1, status: 'PLANNED', assignee: 'S1', performer: 'S2', actionAt: new Date(M.getTime() - 3 * 3_600_000) },
    { alias: 'X2', ticket: 'T3', cycle: 1, status: 'IN_PROGRESS', assignee: 'S1', performer: 'S1', actionAt: new Date(M.getTime() - 2 * 3_600_000) },
    { alias: 'X3', ticket: 'T3', cycle: 1, status: 'COMPLETED', assignee: 'S2', performer: 'S1', actionAt: new Date(M.getTime() - 3_600_000), followUp: true },
    { alias: 'X4', ticket: 'T3', cycle: 1, status: 'CANCELLED', assignee: 'S1', performer: 'S1', actionAt: M },
    { alias: 'X5', ticket: 'T7', cycle: 1, status: 'COMPLETED', assignee: 'S1', performer: 'S1', actionAt: new Date(L.getTime() - 3_600_000) },
    { alias: 'X6', ticket: 'T7', cycle: 2, status: 'PLANNED', assignee: 'S1', performer: 'S2', actionAt: M },
    { alias: 'X7', ticket: 'T7', cycle: 2, status: 'IN_PROGRESS', assignee: 'S0', performer: 'S2', actionAt: new Date(M.getTime() - 3_600_000) },
    { alias: 'X8', ticket: 'T5', cycle: 1, status: 'COMPLETED', assignee: 'S1', performer: 'S1', actionAt: new Date(L.getTime() - 3_600_000), clearedFollowUp: true },
  ];
  if (profile === 'boundaries') {
    tickets = [B, L, new Date(L.getTime() + 1), U, E, new Date(E.getTime() + 1)].map((at, index) => ({
      alias: `B${index + 1}`, requester: 'R1', status: 'Closed', owner: null, priority: 'Low', updatedAt: at, resolvedAt: at,
    }));
    actions = [];
  }
  if (profile === 'empty') { tickets = []; actions = []; }
  return { profile, clock, users, tickets, actions, createdAt };
}

function actionHistory(profile: FixtureProfile, action: ActionFixture) {
  const initial = {
    resolutionCycle: action.cycle, actionAt: action.actionAt.toISOString(),
    description: `Lab 4 ${action.alias}: investigate the reported issue`, result: null as string | null,
    performedById: fixtureId(profile, action.performer), assigneeId: fixtureId(profile, action.assignee),
    status: 'PLANNED' as ActionStatus, followUpRequired: Boolean(action.followUp || action.clearedFollowUp),
    followUpNote: action.followUp || action.clearedFollowUp ? 'Confirm stability with the requester.' : null,
    attachmentNotes: null as string | null, cancellationReason: null as string | null,
  };
  const snapshots = [initial];
  if (action.status !== 'PLANNED') snapshots.push({
    ...initial, status: action.status,
    result: action.status === 'COMPLETED' ? 'Connection tested and service restored.' : null,
    cancellationReason: action.status === 'CANCELLED' ? 'Replaced by another investigation step.' : null,
  });
  if (action.clearedFollowUp) snapshots.push({ ...snapshots.at(-1)!, followUpRequired: false, followUpNote: null });
  return snapshots;
}

/** Add whole new fixture aggregates only. Existing users and Tickets are never repaired or reset. */
export async function seedLab4Fixtures(prisma: PrismaClient, options: {
  profile?: FixtureProfile; now?: Date; passwordHash?: string;
} = {}) {
  const profile = options.profile ?? 'demo';
  const fixture = buildLab4Fixtures(profile, options.now);
  const passwordHash = options.passwordHash ?? await bcrypt.hash('Str0ng!Temp', 10);
  return prisma.$transaction(async tx => {
    // Serialize same-profile seed runs. Each profile has a separate, stable key.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(440004, ${['demo', 'dashboard', 'boundaries', 'empty'].indexOf(profile)}::integer)`;
    const category = await tx.category.upsert({ where: { name: 'Hardware' }, update: {}, create: { name: 'Hardware' } });
    const system = await tx.relatedSystem.upsert({ where: { name: 'Corporate Laptop' }, update: {}, create: { name: 'Corporate Laptop' } });
    for (const user of fixture.users) {
      const id = fixtureId(profile, user.alias);
      if (await tx.user.findUnique({ where: { id } })) continue;
      const email = fixtureEmail(profile, user.alias);
      if (await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })) {
        throw new Error(`Lab 4 fixture email is already owned by another user: ${email}`);
      }
      await tx.user.create({ data: {
        id, email, name: `Lab 4 ${profile} ${user.alias}`, role: user.role, isActive: user.isActive,
        mustChangePassword: profile === 'demo' || user.alias === 'P1', passwordHash,
        createdAt: fixture.createdAt, updatedAt: fixture.createdAt,
      } });
    }
    const ids: Record<string, number> = {};
    let created = 0;
    for (const item of fixture.tickets) {
      const ticketNumber = fixtureTicketNumber(profile, item.alias);
      const existing = await tx.ticket.findUnique({ where: { ticketNumber } });
      if (existing) {
        ids[item.alias] = existing.id;
        continue; // Do not append actions/events to edited or coincidentally matching work.
      }
      const actions = fixture.actions.filter(a => a.ticket === item.alias);
      const histories = actions.map(action => ({ action, snapshots: actionHistory(profile, action) }));
      const isReopened = item.alias === 'T7';
      const ticket = await tx.ticket.create({ data: {
        ticketNumber, summary: `Lab 4 ${item.alias}: ${item.status} service request`,
        description: `Synthetic ${profile} fixture for the documented Lab 4 scenario.`,
        currentStatus: item.status, requestedPriority: item.priority,
        itPriority: item.itPriority === undefined ? item.priority : item.itPriority,
        requesterId: fixtureId(profile, item.requester), ownerId: item.owner ? fixtureId(profile, item.owner) : null,
        categoryId: category.id, relatedSystemId: system.id,
        resolutionCycle: item.cycle ?? 1,
        version: 1 + histories.reduce((sum, h) => sum + h.snapshots.length, 0) + (isReopened ? 1 : 0),
        createdAt: fixture.createdAt, updatedAt: item.updatedAt, resolvedAt: item.resolvedAt,
        actions: { create: histories.map(({ action, snapshots }) => {
          const current = snapshots.at(-1)!;
          return {
            ...current, id: fixtureId(profile, action.alias), actionAt: action.actionAt,
            version: snapshots.length, createdAt: action.actionAt, updatedAt: action.actionAt,
            revisions: { create: snapshots.map((snapshot, index) => ({
              id: fixtureId(profile, `${action.alias}:revision:${index + 1}`), revision: index + 1,
              actorId: fixtureId(profile, index === 0 ? action.performer : 'S1'),
              createdAt: action.actionAt, snapshot: snapshot as Prisma.InputJsonObject,
            })) },
          };
        }) },
        statusEvents: isReopened ? { create: {
          id: fixtureId(profile, 'T7:reopened'), actorId: fixtureId(profile, 'S1'),
          fromStatus: 'Resolved', toStatus: 'Reopened', resolutionCycle: 2,
          createdAt: new Date(fixture.clock.L.getTime() + 3_600_000),
        } } : undefined,
      } });
      ids[item.alias] = ticket.id;
      created++;
    }
    return { profile, created, skipped: fixture.tickets.length - created, ticketIds: ids, asOf: fixture.clock.asOf.toISOString(), since: fixture.clock.since.toISOString() };
  }, { timeout: 30_000 });
}
