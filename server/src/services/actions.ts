import { ActionTaken, Prisma, PrismaClient, Ticket } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ActionInput, mergeAction, validateFinalAction, ticketIdentity } from './action-validation.js';
import { ApiError, invalid } from './api-error.js';
import { assertBusinessUser, currentViewer, lockActionUsers, staffRoles } from './action-access.js';

const actionSelect = {
  id: true, ticketId: true, resolutionCycle: true, actionAt: true, description: true, result: true,
  status: true, followUpRequired: true, followUpNote: true, attachmentNotes: true, cancellationReason: true,
  version: true, createdAt: true, updatedAt: true,
  ticket: { select: { ticketNumber: true } },
  performedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.ActionTakenSelect;
type PublicAction = Prisma.ActionTakenGetPayload<{ select: typeof actionSelect }>;
const actionDto = ({ ticket, actionAt, createdAt, updatedAt, ...action }: PublicAction) => ({
  ...action, ticketNumber: ticket.ticketNumber, actionAt: actionAt.toISOString(), createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
});
export const actionSnapshot = (action: ActionTaken): Prisma.InputJsonObject => ({
  actionAt: action.actionAt.toISOString(), description: action.description, result: action.result,
  performedById: action.performedById, assigneeId: action.assigneeId, status: action.status,
  followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
  attachmentNotes: action.attachmentNotes, cancellationReason: action.cancellationReason, resolutionCycle: action.resolutionCycle,
});
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Ticket or action not found.');
export async function lockActionTicket(tx: Prisma.TransactionClient, identity: ReturnType<typeof ticketIdentity>) {
  const predicate = 'id' in identity ? Prisma.sql`"id" = ${identity.id}` : Prisma.sql`"ticketNumber" = ${identity.ticketNumber}`;
  const rows = await tx.$queryRaw<Ticket[]>(Prisma.sql`SELECT * FROM "Ticket" WHERE ${predicate} FOR UPDATE`);
  if (!rows[0]) throw notFound();
  return rows[0];
}
function editableTicket(ticket: Ticket) {
  const status = ticket.currentStatus.trim().toLowerCase().replaceAll('_', ' ');
  if (!['new', 'open', 'in progress', 'waiting for requester', 'reopened'].includes(status)) throw new ApiError(409, 'TICKET_NOT_EDITABLE', 'Actions are read-only in this Ticket state.');
}
function checkVersions(ticket: Ticket, input: ActionInput, action?: ActionTaken) {
  if (ticket.version !== input.expectedTicketVersion || (action && action.version !== input.expectedVersion)) {
    throw new ApiError(409, 'STALE_VERSION', 'This record has changed. Refresh before saving.', {
      currentTicketVersion: ticket.version, ...(action ? { currentActionVersion: action.version } : {}),
    });
  }
}
function eligibleAssignee(user: { isActive: boolean; role: string } | undefined) {
  if (!user?.isActive || !staffRoles.includes(user.role)) invalid('assigneeId', 'Choose an active IT Staff or Administrator.');
}
function hashRequest(ticketId: number, input: ActionInput) {
  const ordered = Object.fromEntries(Object.keys(input).sort().map(key => [key, input[key as keyof ActionInput]]));
  return createHash('sha256').update(JSON.stringify({ ticketId, input: ordered })).digest('hex');
}
export async function createAction(prisma: PrismaClient, actorId: string, identity: ReturnType<typeof ticketIdentity>, key: string, input: ActionInput) {
  const attempt = () => prisma.$transaction(async tx => {
    const ticket = await lockActionTicket(tx, identity);
    const assigneeId = input.assigneeId ?? actorId;
    const assignee = await lockActionUsers(tx, actorId, assigneeId);
    const hash = hashRequest(ticket.id, input);
    const receipt = await tx.actionCreateRequest.findUnique({ where: { actorId_key: { actorId, key } } });
    if (receipt) {
      if (receipt.requestHash !== hash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This key was used for a different request.');
      return { replayed: true, body: receipt.response };
    }
    checkVersions(ticket, input);
    editableTicket(ticket);
    eligibleAssignee(assignee);
    const now = new Date();
    const data = {
      ticketId: ticket.id, performedById: actorId, assigneeId, resolutionCycle: ticket.resolutionCycle,
      actionAt: input.actionAt ?? now, description: input.description!, result: input.result ?? null,
      followUpRequired: input.followUpRequired ?? false, followUpNote: input.followUpNote ?? null,
      attachmentNotes: input.attachmentNotes ?? null, cancellationReason: null, status: 'PLANNED' as const,
      createdAt: now, updatedAt: now,
    };
    validateFinalAction(data, ticket.createdAt, now);
    const action = await tx.actionTaken.create({ data });
    await tx.actionTakenRevision.create({ data: { actionId: action.id, revision: 1, actorId, snapshot: actionSnapshot(action), createdAt: now } });
    const updated = await tx.ticket.update({ where: { id: ticket.id }, data: { version: { increment: 1 }, updatedAt: now } });
    const body = { action: actionDto(await tx.actionTaken.findUniqueOrThrow({ where: { id: action.id }, select: actionSelect })), ticketVersion: updated.version };
    await tx.actionCreateRequest.create({ data: { actorId, key, ticketId: ticket.id, requestHash: hash, response: body, createdAt: now } });
    return { replayed: false, body };
  });
  try { return await attempt(); }
  catch (error) {
    // Defensive fallback for another writer that relies on receipt uniqueness.
    // Re-enter the transaction so actor authorization precedes any replay.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' &&
        Array.isArray(error.meta?.target) && ['actorId', 'key'].every(field => (error.meta!.target as unknown[]).includes(field))) return attempt();
    throw error;
  }
}
export async function updateAction(prisma: PrismaClient, actorId: string, identity: ReturnType<typeof ticketIdentity>, actionId: string, input: ActionInput) {
  return prisma.$transaction(async tx => {
    const ticket = await lockActionTicket(tx, identity);
    const current = await tx.actionTaken.findFirst({ where: { id: actionId, ticketId: ticket.id } });
    if (!current) throw notFound();
    const assignee = await lockActionUsers(tx, actorId, input.assigneeId ?? current.assigneeId);
    checkVersions(ticket, input, current);
    editableTicket(ticket);
    if (current.resolutionCycle !== ticket.resolutionCycle) throw new ApiError(409, 'ACTION_NOT_EDITABLE', 'Actions from another resolution cycle are read-only.');
    const now = new Date();
    const changes = mergeAction(current, input, now, ticket.createdAt);
    if (input.assigneeId !== undefined || input.status === 'COMPLETED') eligibleAssignee(assignee);
    const action = await tx.actionTaken.update({ where: { id: current.id }, data: { ...changes, version: { increment: 1 }, updatedAt: now } });
    await tx.actionTakenRevision.create({ data: { actionId: action.id, revision: action.version, actorId, snapshot: actionSnapshot(action), createdAt: now } });
    const updated = await tx.ticket.update({ where: { id: ticket.id }, data: { version: { increment: 1 }, updatedAt: now } });
    return { action: actionDto(await tx.actionTaken.findUniqueOrThrow({ where: { id: action.id }, select: actionSelect })), ticketVersion: updated.version };
  });
}

export async function readActions(prisma: PrismaClient, actorId: string, identity: ReturnType<typeof ticketIdentity>, paging: { page: number; pageSize: number; skip: number }, actionId?: string) {
  return prisma.$transaction(async tx => {
    const viewer = await currentViewer(tx, actorId);
    if (actionId) assertBusinessUser(viewer, true);
    const ticket = await tx.ticket.findFirst({ where: { ...identity, ...(viewer.role === 'REQUESTER' ? { requesterId: actorId } : {}) } });
    if (!ticket) throw notFound();
    const { page, pageSize, skip } = paging;
    if (actionId) {
      if (!await tx.actionTaken.findFirst({ where: { id: actionId, ticketId: ticket.id }, select: { id: true } })) throw notFound();
      const totalCount = await tx.actionTakenRevision.count({ where: { actionId } });
      const revisions = await tx.actionTakenRevision.findMany({ where: { actionId }, orderBy: { revision: 'asc' }, skip, take: pageSize,
        select: { revision: true, createdAt: true, snapshot: true, actor: { select: { id: true, name: true } } } });
      return { revisions, pagination: { page, pageSize, totalCount } };
    }
    const where = { ticketId: ticket.id };
    const totalCount = await tx.actionTaken.count({ where });
    const actions = await tx.actionTaken.findMany({ where, orderBy: [{ actionAt: 'asc' }, { id: 'asc' }], skip, take: pageSize, select: actionSelect });
    return { actions: actions.map(actionDto), pagination: { page, pageSize, totalCount }, ticketVersion: ticket.version, resolutionCycle: ticket.resolutionCycle };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
