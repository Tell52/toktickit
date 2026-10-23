import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../prisma.js';
import { requireCsrf } from '../middleware/auth.js';
import { assertBusinessUser, currentViewer, requireCurrentBusinessUser } from '../services/action-access.js';
import { ticketIdentity, version } from '../services/action-validation.js';
import { requiredText, strictBody } from '../services/ticket-workflow.js';
import { ApiError, invalid, sendApiError } from '../services/api-error.js';

const router = Router();
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  try { await handler(req, res); } catch (error) { sendApiError(res, error); }
};
const missing = () => new ApiError(404, 'NOT_FOUND', 'Ticket or attachment not found.');
function noQuery(req: Request) { if (Object.keys(req.query).length) invalid('query', 'Unsupported query parameter.'); }

router.post('/tickets', requireCurrentBusinessUser, requireCsrf, run(async (req, res) => {
  noQuery(req);
  // Keep the earlier form's requesterId field compatible, but never use it as authority.
  const input = strictBody(req.body, ['requesterId', 'summary', 'description', 'categoryId', 'category', 'relatedSystemId', 'relatedSystem', 'requestedPriority']);
  const summary = requiredText(input.summary, 'summary', 200), description = requiredText(input.description, 'description', 10000);
  const priority = typeof input.requestedPriority === 'string' ? input.requestedPriority.trim().toLowerCase() : '';
  if (!['low', 'medium', 'high'].includes(priority)) invalid('requestedPriority', 'Choose Low, Medium or High.');
  const requestedPriority = priority[0].toUpperCase() + priority.slice(1);
  const ticket = await getPrisma().$transaction(async tx => {
    // Account administration and creation serialize on the authenticated actor.
    const [actor] = await tx.$queryRaw<{ id: string; role: string; isActive: boolean; mustChangePassword: boolean }[]>`
      SELECT "id", "role", "isActive", "mustChangePassword" FROM "User" WHERE "id" = ${req.session.user!.id} FOR UPDATE`;
    assertBusinessUser(actor ?? null);
    const category = await tx.category.findFirst({ where: input.categoryId !== undefined
      ? { id: version(input.categoryId, 'categoryId') }
      : { name: { equals: requiredText(input.category, 'category', 200), mode: 'insensitive' } } });
    const system = await tx.relatedSystem.findFirst({ where: input.relatedSystemId !== undefined
      ? { id: version(input.relatedSystemId, 'relatedSystemId') }
      : { name: { equals: requiredText(input.relatedSystem, 'relatedSystem', 200), mode: 'insensitive' } } });
    if (!category) invalid('categoryId', 'Choose an existing category.');
    if (!system) invalid('relatedSystemId', 'Choose an existing related system.');
    // Preserve sequential Ticket numbers without a count/read/create race.
    // Only creation takes this transaction-scoped lock; there is no process-local mutex.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(334, 4)`;
    const year = new Date().getUTCFullYear(), prefix = `TKT-${year}-`;
    let counter = await tx.ticket.count() + 1;
    let ticketNumber = prefix + String(counter).padStart(4, '0');
    while (await tx.ticket.findUnique({ where: { ticketNumber }, select: { id: true } })) ticketNumber = prefix + String(++counter).padStart(4, '0');
    return tx.ticket.create({ data: { ticketNumber, summary, description, requestedPriority, itPriority: requestedPriority,
      requesterId: actor.id, categoryId: category.id, relatedSystemId: system.id, currentStatus: 'New' } });
  });
  res.status(201).json(ticket);
}));

router.get('/tickets/:id', requireCurrentBusinessUser, run(async (req, res) => {
  noQuery(req);
  const result = await getPrisma().$transaction(async tx => {
    const viewer = await currentViewer(tx, req.session.user!.id);
    const ticket = await tx.ticket.findFirst({
      where: { ...ticketIdentity(req.params.id), ...(viewer.role === 'REQUESTER' ? { requesterId: viewer.id } : {}) },
      // Internal Notes and account secrets are deliberately absent from this projection.
      include: { category: true, relatedSystem: true, attachments: true,
        comments: { include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw missing();
    return { ...ticket, comments: ticket.comments.map(c => ({ ...c, authorName: c.author.name, authorRole: c.author.role })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  res.json(result);
}));

router.get('/tickets/:id/attachments/:attachmentId', requireCurrentBusinessUser, run(async (req, res) => {
  noQuery(req);
  if (!/^[1-9]\d*$/.test(req.params.attachmentId)) invalid('attachmentId', 'Use a positive attachment ID.');
  const attachmentId = version(Number(req.params.attachmentId), 'attachmentId');
  const result = await getPrisma().$transaction(async tx => {
    const viewer = await currentViewer(tx, req.session.user!.id);
    const ticket = await tx.ticket.findFirst({ where: { ...ticketIdentity(req.params.id), ...(viewer.role === 'REQUESTER' ? { requesterId: viewer.id } : {}) }, select: { id: true } });
    if (!ticket) throw missing();
    const attachment = await tx.attachment.findFirst({ where: { id: attachmentId, ticketId: ticket.id } });
    if (!attachment) throw missing();
    if (attachment.isRemoved) throw new ApiError(403, 'FORBIDDEN', 'This attachment has been removed and cannot be downloaded.');
    return { message: 'File ready for download', fileUrl: attachment.fileUrl };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  res.json(result);
}));

export default router;
