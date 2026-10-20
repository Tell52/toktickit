import { Prisma } from '@prisma/client';
import { invalid } from './api-error.js';

export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  New: ['Open', 'In Progress', 'Cancelled'],
  Open: ['In Progress', 'Waiting for Requester', 'Cancelled'],
  'In Progress': ['Waiting for Requester', 'Resolved', 'Cancelled'],
  'Waiting for Requester': ['In Progress', 'Resolved', 'Cancelled'],
  Resolved: ['Closed', 'Reopened'], Closed: ['Reopened'],
  Reopened: ['In Progress', 'Waiting for Requester', 'Cancelled'], Cancelled: [],
};
export const STATUS_CANONICAL = Object.fromEntries(Object.keys(ALLOWED_STATUS_TRANSITIONS).flatMap(status => [[status.toLowerCase(), status], [status.toLowerCase().replaceAll(' ', '_'), status]]));
export function isValidStatusTransition(from: string, to: string) {
  return !!ALLOWED_STATUS_TRANSITIONS[STATUS_CANONICAL[from?.trim().toLowerCase()]]?.includes(STATUS_CANONICAL[to?.trim().toLowerCase()]);
}
export function canonicalStatus(value: unknown) {
  if (typeof value !== 'string' || !STATUS_CANONICAL[value.trim().toLowerCase()]) invalid('status', 'Choose a supported Ticket status.');
  return STATUS_CANONICAL[value.trim().toLowerCase()];
}
export async function resolutionGate(tx: Prisma.TransactionClient, ticket: { id: number; resolutionCycle: number }) {
  const where = { ticketId: ticket.id, resolutionCycle: ticket.resolutionCycle };
  const [completedCount, unfinishedCount, followUpCount] = await Promise.all([
    tx.actionTaken.count({ where: { ...where, status: 'COMPLETED' } }),
    tx.actionTaken.count({ where: { ...where, status: { in: ['PLANNED', 'IN_PROGRESS'] } } }),
    tx.actionTaken.count({ where: { ...where, status: { not: 'CANCELLED' }, followUpRequired: true } }),
  ]);
  const blockers = [...(completedCount === 0 ? ['NO_COMPLETED_ACTION'] : []), ...(unfinishedCount ? ['UNFINISHED_ACTIONS'] : []), ...(followUpCount ? ['FOLLOW_UP_REQUIRED'] : [])];
  return { eligible: blockers.length === 0, completedCount, unfinishedCount, followUpCount, blockers };
}
export async function workflowDetail(tx: Prisma.TransactionClient, ticket: { id: number; version: number; resolutionCycle: number; resolvedAt: Date | null; currentStatus: string }) {
  return { version: ticket.version, resolutionCycle: ticket.resolutionCycle, resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    allowedTransitions: ALLOWED_STATUS_TRANSITIONS[STATUS_CANONICAL[ticket.currentStatus.trim().toLowerCase()]] ?? [], resolutionGate: await resolutionGate(tx, ticket) };
}
