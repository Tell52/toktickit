import { Prisma, PrismaClient } from '@prisma/client';
import { ApiError, invalid } from './api-error.js';
import { currentViewer } from './action-access.js';
import { canonicalStatus } from './workflow-state.js';

export const ACTIVE_STATUSES = ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened'];
export const RESOLVED_STATUSES = ['Resolved', 'Closed'];
export function effectivePriority(ticket: { itPriority: string | null; requestedPriority: string }) {
  const value = ticket.itPriority ?? ticket.requestedPriority;
  return ({ low: 'Low', medium: 'Medium', high: 'High' } as Record<string, string>)[value.trim().toLowerCase()] ?? value;
}
export function dashboardWindow(asOf = new Date()) {
  // Bangkok has a fixed UTC+07 offset. Use UTC arithmetic, independent of host TZ.
  const local = new Date(asOf.getTime() + 7 * 3600000);
  const since = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 6) - 7 * 3600000);
  return { asOf, since };
}
export async function requesterViewer(tx: Prisma.TransactionClient, actorId: string) {
  const viewer = await currentViewer(tx, actorId);
  if (viewer.role !== 'REQUESTER') throw new ApiError(403, 'FORBIDDEN', 'This view is available to Requesters.');
  return viewer;
}
const summarySelect = { id: true, ticketNumber: true, summary: true, currentStatus: true, itPriority: true, requestedPriority: true, updatedAt: true, resolvedAt: true } as const;
export async function requesterDashboard(prisma: PrismaClient, actorId: string, now = new Date()) {
  const { asOf, since } = dashboardWindow(now);
  return prisma.$transaction(async tx => {
    await requesterViewer(tx, actorId);
    const own = { requesterId: actorId };
    const waiting = { ...own, currentStatus: 'Waiting for Requester' };
    const recent = { ...own, updatedAt: { gte: since, lt: asOf } };
    const openTickets = await tx.ticket.count({ where: { ...own, currentStatus: { in: ACTIVE_STATUSES } } });
    const waitingForRequester = await tx.ticket.count({ where: waiting });
    const recentlyUpdated = await tx.ticket.count({ where: recent });
    const recentlyResolved = await tx.ticket.count({ where: { ...own, currentStatus: { in: RESOLVED_STATUSES }, resolvedAt: { gte: since, lt: asOf } } });
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [{ updatedAt: 'desc' }, { id: 'desc' }];
    const attentionTickets = await tx.ticket.findMany({ where: waiting, select: summarySelect, take: 5, orderBy });
    const recentTickets = await tx.ticket.findMany({ where: recent, select: summarySelect, take: 5, orderBy });
    const summary = ({ requestedPriority, ...ticket }: typeof recentTickets[number]) => ({ ...ticket, itPriority: effectivePriority({ ...ticket, requestedPriority }) });
    return { asOf: asOf.toISOString(), timeZone: 'Asia/Bangkok', window: { since: since.toISOString(), before: asOf.toISOString() },
      metrics: { openTickets, waitingForRequester, recentlyUpdated, recentlyResolved },
      attentionTickets: attentionTickets.map(summary), recentTickets: recentTickets.map(summary) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export function parseRequesterFilters(query: Record<string, unknown>) {
  const supported = ['page', 'limit', 'search', 'status', 'statusGroup', 'updatedFrom', 'updatedBefore', 'resolvedFrom', 'resolvedBefore', 'sort'];
  for (const [key, value] of Object.entries(query)) {
    if (!supported.includes(key) || typeof value !== 'string') invalid(key, 'Unsupported query parameter.');
  }
  const text = (key: string) => query[key] as string | undefined;
  const integer = (key: string, fallback: number, max: number) => {
    const value = text(key); if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) invalid(key, 'Use a bounded positive integer.');
    return Number(value);
  };
  const page = integer('page', 1, 1000000), limit = integer('limit', 10, 50);
  const where: Prisma.TicketWhereInput = {};
  if (text('status') && text('statusGroup')) invalid('statusGroup', 'Choose status or statusGroup, not both.');
  if (text('status') !== undefined) where.currentStatus = canonicalStatus(text('status'));
  if (text('statusGroup') !== undefined) {
    if (!['active', 'resolved'].includes(text('statusGroup')!)) invalid('statusGroup', 'Choose active or resolved.');
    where.currentStatus = { in: text('statusGroup') === 'active' ? ACTIVE_STATUSES : RESOLVED_STATUSES };
  }
  if (text('search')) {
    if (text('search')!.length > 200) invalid('search', 'Use at most 200 characters.');
    where.OR = [{ ticketNumber: { contains: text('search'), mode: 'insensitive' } }, { summary: { contains: text('search'), mode: 'insensitive' } }];
  }
  const instant = (key: string) => {
    const value = text(key); if (value === undefined) return;
    // Full offset-bearing instants only; reject rolled-over dates (e.g. February 30).
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12 || Number(match[3]) < 1 || Number(match[3]) > new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate() || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[8] ?? 0) > 23 || Number(match[9] ?? 0) > 59 || !Number.isFinite(Date.parse(value))) invalid(key, 'Use a valid timestamp with timezone offset.');
    return new Date(value);
  };
  for (const field of ['updated', 'resolved'] as const) {
    const from = instant(`${field}From`), before = instant(`${field}Before`);
    if (from && before && from >= before) invalid(`${field}Before`, 'The upper bound must follow the lower bound.');
    if (from || before) where[`${field}At`] = { ...(from ? { gte: from } : {}), ...(before ? { lt: before } : {}) };
  }
  const sort = text('sort') ?? '-createdAt';
  if (!['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'resolvedAt', '-resolvedAt'].includes(sort)) invalid('sort', 'Choose a supported sort.');
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.replace(/^-/, '');
  const orderBy: Prisma.TicketOrderByWithRelationInput[] = [{ [field]: field === 'resolvedAt' ? { sort: direction, nulls: 'last' } : direction }, { id: direction }];
  return { where, orderBy, page, limit };
}
export async function requesterTickets(prisma: PrismaClient, actorId: string, query: Record<string, unknown>) {
  const { where, orderBy, page, limit } = parseRequesterFilters(query);
  return prisma.$transaction(async tx => {
    await requesterViewer(tx, actorId);
    const own = { ...where, requesterId: actorId };
    const data = await tx.ticket.findMany({ where: own, include: { category: true, relatedSystem: true }, orderBy, skip: (page - 1) * limit, take: limit });
    const total = await tx.ticket.count({ where: own });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
