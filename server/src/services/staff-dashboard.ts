import { Prisma, PrismaClient } from '@prisma/client';
import { currentViewer, staffRoles } from './action-access.js';
import { ApiError, invalid } from './api-error.js';
import { ACTIVE_STATUSES, dashboardWindow, effectivePriority, summarySelect } from './dashboard.js';
import { actionDto, actionSelect } from './actions.js';

export const DASHBOARD_STATUSES = ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Resolved', 'Closed', 'Reopened', 'Cancelled'];
export function priorityWhere(priority: string): Prisma.TicketWhereInput {
  return { OR: [{ itPriority: { equals: priority, mode: 'insensitive' } }, { itPriority: null, requestedPriority: { equals: priority, mode: 'insensitive' } }] };
}
async function staffViewer(tx: Prisma.TransactionClient, id: string) {
  const viewer = await currentViewer(tx, id);
  if (!staffRoles.includes(viewer.role)) throw new ApiError(403, 'FORBIDDEN', 'This view is available to staff.');
}
export function actionsPage(query: Record<string, unknown>) {
  if (Object.keys(query).some(key => key !== 'page')) invalid('query', 'Unsupported query parameter.');
  const page = query.page ?? '1';
  if (typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || Number(page) > 1000000) invalid('page', 'Use a bounded positive integer.');
  return Number(page);
}
async function myActions(tx: Prisma.TransactionClient, id: string, page: number) {
  // The cycle comparison crosses tables; parameterized SQL avoids loading all parent Tickets.
  const predicate = Prisma.sql`FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
    WHERE a."assigneeId" = ${id} AND a.status::text IN ('PLANNED', 'IN_PROGRESS')
    AND a."resolutionCycle" = t."resolutionCycle" AND t."currentStatus" IN (${Prisma.join(ACTIVE_STATUSES)})`;
  const [count] = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${predicate}`);
  const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT a.id ${predicate} ORDER BY a."actionAt" DESC, a.id DESC LIMIT 5 OFFSET ${(page - 1) * 5}`);
  const rows = await tx.actionTaken.findMany({ where: { id: { in: ids.map(row => row.id) } }, select: actionSelect, orderBy: [{ actionAt: 'desc' }, { id: 'desc' }] });
  return { actions: rows.map(actionDto), pagination: { page, pageSize: 5, totalCount: Number(count.total) } };
}
export async function staffActions(prisma: PrismaClient, id: string, page: number) {
  return prisma.$transaction(async tx => { await staffViewer(tx, id); return myActions(tx, id, page); }, { isolationLevel: 'RepeatableRead' });
}
export async function staffDashboard(prisma: PrismaClient, id: string, now = new Date()) {
  const { asOf, since } = dashboardWindow(now);
  return prisma.$transaction(async tx => {
    await staffViewer(tx, id);
    const active = { currentStatus: { in: ACTIVE_STATUSES } };
    const recent = { updatedAt: { gte: since, lt: asOf } };
    const unassignedTickets = await tx.ticket.count({ where: { ...active, ownerId: null } });
    const myTickets = await tx.ticket.count({ where: { ...active, ownerId: id } });
    const recentlyUpdated = await tx.ticket.count({ where: recent });
    const grouped = await tx.ticket.groupBy({ by: ['currentStatus'], _count: true });
    const byStatus = Object.fromEntries(DASHBOARD_STATUSES.map(status => [status, grouped.find(row => row.currentStatus === status)?._count ?? 0]));
    const byPriority: Record<string, number> = {};
    for (const priority of ['Low', 'Medium', 'High']) byPriority[priority] = await tx.ticket.count({ where: { ...active, ...priorityWhere(priority) } });
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [{ updatedAt: 'desc' }, { id: 'desc' }];
    const urgent = await tx.ticket.findMany({ where: { ...active, ...priorityWhere('High') }, select: summarySelect, orderBy, take: 5 });
    const recentTickets = await tx.ticket.findMany({ where: recent, select: summarySelect, orderBy, take: 5 });
    const summary = ({ requestedPriority, ...row }: typeof urgent[number]) => ({ ...row, itPriority: effectivePriority({ ...row, requestedPriority }) });
    const actions = await myActions(tx, id, 1);
    return { asOf: asOf.toISOString(), timeZone: 'Asia/Bangkok', window: { since: since.toISOString(), before: asOf.toISOString() },
      metrics: { unassignedTickets, myTickets, recentlyUpdated, myActiveActions: actions.pagination.totalCount, byStatus, byPriority },
      urgentTickets: urgent.map(summary), recentTickets: recentTickets.map(summary), myActions: actions };
  }, { isolationLevel: 'RepeatableRead' });
}
