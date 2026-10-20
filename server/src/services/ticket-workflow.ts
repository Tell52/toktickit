import { Prisma, PrismaClient, Ticket } from '@prisma/client';
import { assertBusinessUser, currentViewer, lockActionUsers } from './action-access.js';
import { lockActionTicket, actionSnapshot } from './actions.js';
import { ticketIdentity, version } from './action-validation.js';
import { ApiError, invalid } from './api-error.js';
import { canonicalStatus, isValidStatusTransition, resolutionGate } from './workflow-state.js';

export type TicketIdentity = ReturnType<typeof ticketIdentity>;
export function strictBody(body: unknown, fields: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('body', 'Use a JSON object.');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !fields.includes(key))) invalid('body', 'Unsupported body field.');
  return value;
}
export function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max || value.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) invalid(field, `Use valid nonblank text of at most ${max} characters.`);
  return value.trim();
}
export function checkTicketVersion(ticket: Ticket, expected: number) {
  if (ticket.version !== expected) throw new ApiError(409, 'STALE_VERSION', 'This Ticket has changed. Load latest before retrying.', { currentTicketVersion: ticket.version });
}
export function owned(ticket: Ticket, viewer: { id: string; role: string }) {
  if (viewer.role === 'REQUESTER' && ticket.requesterId !== viewer.id) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
}
// Parent first, then User: compatible with Actions writes, including account changes.
export async function lockActivity(tx: Prisma.TransactionClient, identity: TicketIdentity, actorId: string, requesterOnly = false) {
  const ticket = await lockActionTicket(tx, identity);
  const users = await tx.$queryRaw<{ id: string; name: string; role: string; isActive: boolean; mustChangePassword: boolean }[]>(Prisma.sql`SELECT "id", "name", "role", "isActive", "mustChangePassword" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`);
  const viewer = users[0]; assertBusinessUser(viewer ?? null);
  if (requesterOnly && viewer.role !== 'REQUESTER') throw new ApiError(403, 'FORBIDDEN', 'Only Requesters can perform this operation.');
  owned(ticket, viewer);
  return { ticket, viewer };
}
export const touchTicket = (tx: Prisma.TransactionClient, id: number, now = new Date()) => tx.ticket.update({ where: { id }, data: { updatedAt: now, version: { increment: 1 } } });

export async function changeTicket(prisma: PrismaClient, actorId: string, identity: TicketIdentity, operation: 'status' | 'owner' | 'priority', raw: unknown) {
  const input = strictBody(raw, ['expectedTicketVersion', ...(operation === 'status' ? ['status', 'reason'] : operation === 'owner' ? ['ownerId'] : ['itPriority'])]);
  const expected = version(input.expectedTicketVersion, 'expectedTicketVersion');
  let target: string | null;
  let reason: string | undefined;
  if (operation === 'status') {
    target = canonicalStatus(input.status);
    if (target === 'Cancelled') reason = requiredText(input.reason, 'reason', 1000);
    else if (input.reason !== undefined) invalid('reason', 'Reason is only accepted for cancellation.');
  } else if (operation === 'priority') {
    if (typeof input.itPriority !== 'string' || !['LOW', 'MEDIUM', 'HIGH'].includes(input.itPriority.trim().toUpperCase())) invalid('itPriority', 'Choose Low, Medium or High.');
    target = input.itPriority.trim().toUpperCase();
  } else {
    // Earlier User IDs are text, including IDs predating UUID-based seeds.
    if (input.ownerId !== null && (typeof input.ownerId !== 'string' || !input.ownerId.trim() || input.ownerId.length > 128)) invalid('ownerId', 'Choose active staff or null.');
    target = input.ownerId === null ? null : (input.ownerId as string).trim();
  }
  return prisma.$transaction(async tx => {
    const ticket = await lockActionTicket(tx, identity);
    const owner = await lockActionUsers(tx, actorId, operation === 'owner' && target ? target : actorId);
    checkTicketVersion(ticket, expected);
    const now = new Date();
    if (operation === 'status') {
      if (!isValidStatusTransition(ticket.currentStatus, target!)) throw new ApiError(409, 'INVALID_TRANSITION', 'This Ticket transition is not permitted.');
      if (target === 'Resolved') {
        const gate = await resolutionGate(tx, ticket);
        if (!gate.eligible) throw new ApiError(409, 'RESOLUTION_BLOCKED', 'Complete the required work before resolving this ticket.', { blockers: gate.blockers });
      }
      if (target === 'Cancelled') {
        const unfinished = await tx.actionTaken.findMany({ where: { ticketId: ticket.id, resolutionCycle: ticket.resolutionCycle, status: { in: ['PLANNED', 'IN_PROGRESS'] } }, orderBy: { id: 'asc' } });
        for (const action of unfinished) {
          const updated = await tx.actionTaken.update({ where: { id: action.id }, data: { status: 'CANCELLED', cancellationReason: reason!, version: { increment: 1 }, updatedAt: now } });
          await tx.actionTakenRevision.create({ data: { actionId: action.id, revision: updated.version, actorId, snapshot: actionSnapshot(updated), createdAt: now } });
        }
      }
      const updated = await tx.ticket.update({ where: { id: ticket.id }, data: {
        currentStatus: target!, updatedAt: now, version: { increment: 1 },
        ...(target === 'Resolved' ? { resolvedAt: now } : {}),
        ...(target === 'Reopened' ? { resolutionCycle: { increment: 1 }, resolvedAt: null, problemAppearsResolved: false, indicatedAt: null } : {}),
      } });
      await tx.ticketStatusEvent.create({ data: { ticketId: ticket.id, actorId, fromStatus: canonicalStatus(ticket.currentStatus), toStatus: target!, reason: reason ?? null, resolutionCycle: updated.resolutionCycle, createdAt: now } });
      return { ticketId: updated.ticketNumber, id: updated.id, status: updated.currentStatus, updatedAt: updated.updatedAt.toISOString(), version: updated.version, resolutionCycle: updated.resolutionCycle, resolvedAt: updated.resolvedAt?.toISOString() ?? null };
    }
    if (operation === 'owner' && target && (!owner?.isActive || !['IT_STAFF', 'ADMINISTRATOR'].includes(owner.role))) invalid('ownerId', 'Choose active IT Staff or Administrator.');
    const updated = await tx.ticket.update({ where: { id: ticket.id }, data: { ...(operation === 'owner' ? { ownerId: target } : { itPriority: target }), updatedAt: now, version: { increment: 1 } }, include: { owner: { select: { id: true, name: true } } } });
    return { ticketId: updated.ticketNumber, id: updated.id, ...(operation === 'owner' ? { owner: updated.owner } : { itPriority: updated.itPriority }), version: updated.version, updatedAt: updated.updatedAt.toISOString() };
  });
}
export async function indicateResolved(prisma: PrismaClient, actorId: string, identity: TicketIdentity) {
  return prisma.$transaction(async tx => {
    const { ticket } = await lockActivity(tx, identity, actorId, true);
    if (!['Open', 'In Progress', 'Waiting for Requester'].includes(canonicalStatus(ticket.currentStatus))) throw new ApiError(409, 'INVALID_TRANSITION', 'The resolution indication is unavailable in this Ticket state.');
    const updated = ticket.problemAppearsResolved ? ticket : await tx.ticket.update({ where: { id: ticket.id }, data: { problemAppearsResolved: true, indicatedAt: new Date(), version: { increment: 1 } } });
    return { ticketId: updated.id, problemAppearsResolved: updated.problemAppearsResolved, indicatedAt: updated.indicatedAt, version: updated.version, updatedAt: updated.updatedAt };
  });
}
export async function statusHistory(prisma: PrismaClient, actorId: string, identity: TicketIdentity, paging: { page: number; pageSize: number; skip: number }) {
  return prisma.$transaction(async tx => {
    const viewer = await currentViewer(tx, actorId);
    const ticket = await tx.ticket.findFirst({ where: { ...identity, ...(viewer.role === 'REQUESTER' ? { requesterId: actorId } : {}) } });
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    const where = { ticketId: ticket.id };
    const totalCount = await tx.ticketStatusEvent.count({ where });
    const events = await tx.ticketStatusEvent.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: paging.skip, take: paging.pageSize,
      select: { id: true, fromStatus: true, toStatus: true, reason: true, resolutionCycle: true, createdAt: true, actor: { select: { id: true, name: true } } } });
    return { events, pagination: { page: paging.page, pageSize: paging.pageSize, totalCount } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
