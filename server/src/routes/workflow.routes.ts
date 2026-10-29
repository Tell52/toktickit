import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { getPrisma } from '../prisma.js';
import { requireRole, requireCsrf } from '../middleware/auth.js';
import { requireCurrentBusinessUser } from '../services/action-access.js';
import { pagination, ticketIdentity, version } from '../services/action-validation.js';
import { ApiError, invalid, sendApiError } from '../services/api-error.js';
import { changeTicket, indicateResolved, lockActivity, requiredText, statusHistory, strictBody, touchTicket } from '../services/ticket-workflow.js';

const router = Router();
const staff = [requireCurrentBusinessUser, requireRole(['IT_STAFF', 'ADMINISTRATOR'])];
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  try { if (Object.keys(req.query).length && req.method !== 'GET') invalid('query', 'Unsupported query parameter.'); await handler(req, res); }
  catch (error) { sendApiError(res, error); }
};
for (const operation of ['status', 'owner', 'priority'] as const) router.patch(`/staff/tickets/:id/${operation}`, ...staff, requireCsrf, run(async (req, res) => {
  res.json(await changeTicket(getPrisma(), req.session.user!.id, ticketIdentity(req.params.id), operation, req.body));
}));
router.get('/tickets/:id/status-history', requireCurrentBusinessUser, run(async (req, res) => {
  res.json(await statusHistory(getPrisma(), req.session.user!.id, ticketIdentity(req.params.id), pagination(req.query)));
}));
router.post('/tickets/:id/resolved-indicator', requireCurrentBusinessUser, requireRole(['REQUESTER']), requireCsrf, run(async (req, res) => {
  strictBody(req.body ?? {}, []);
  res.json(await indicateResolved(getPrisma(), req.session.user!.id, ticketIdentity(req.params.id)));
}));
router.post('/tickets/:id/comments', requireCurrentBusinessUser, requireCsrf, run(async (req, res) => {
  const input = strictBody(req.body, ['content']);
  const content = requiredText(input.content, 'content', 10000);
  const result = await getPrisma().$transaction(async tx => {
    const { ticket, viewer } = await lockActivity(tx, ticketIdentity(req.params.id), req.session.user!.id);
    const comment = await tx.comment.create({ data: { ticketId: ticket.id, authorId: viewer.id, content }, include: { author: { select: { id: true, name: true, role: true } } } });
    await touchTicket(tx, ticket.id);
    return { id: comment.id, ticketId: comment.ticketId, authorId: comment.authorId, authorName: viewer.name, authorRole: viewer.role, author: comment.author, content: comment.content, createdAt: comment.createdAt };
  });
  res.status(201).json(result);
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file type'));
} });
router.post('/tickets/:id/attachments', requireCurrentBusinessUser, requireCsrf, (req, res, next) => {
  upload.single('file')(req, res, error => error ? sendApiError(res, new ApiError(400, 'VALIDATION_ERROR', 'Use a supported file of at most 5 MB.')) : next());
}, run(async (req, res) => {
  strictBody(req.body ?? {}, []);
  if (!req.file) invalid('file', 'A file is required.');
  const file = req.file;
  const attachment = await getPrisma().$transaction(async tx => {
    const { ticket, viewer } = await lockActivity(tx, ticketIdentity(req.params.id), req.session.user!.id);
    if (ticket.requesterId !== viewer.id) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    if (await tx.attachment.count({ where: { ticketId: ticket.id, isRemoved: false } }) >= 5) invalid('file', 'Maximum of 5 active attachments allowed.');
    const row = await tx.attachment.create({ data: { ticketId: ticket.id, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size, fileUrl: `/uploads/${Date.now()}-${file.originalname}` } });
    await touchTicket(tx, ticket.id);
    return row;
  });
  res.status(201).json(attachment);
}));
router.delete('/tickets/:id/attachments/:attachmentId', requireCurrentBusinessUser, requireCsrf, run(async (req, res) => {
  const input = strictBody(req.body, ['reason']), reason = requiredText(input.reason, 'reason', 1000);
  if (!/^[1-9]\d*$/.test(req.params.attachmentId)) invalid('attachmentId', 'Use a positive attachment ID.');
  const attachmentId = version(Number(req.params.attachmentId), 'attachmentId');
  const attachment = await getPrisma().$transaction(async tx => {
    const { ticket, viewer } = await lockActivity(tx, ticketIdentity(req.params.id), req.session.user!.id);
    if (ticket.requesterId !== viewer.id) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    const row = await tx.attachment.findFirst({ where: { id: attachmentId, ticketId: ticket.id } });
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Attachment not found.');
    if (row.isRemoved) return row;
    const removed = await tx.attachment.update({ where: { id: row.id }, data: { isRemoved: true, removalReason: reason } });
    await touchTicket(tx, ticket.id);
    return removed;
  });
  res.json(attachment);
}));
const workflowPath = (path: string) => /^\/api\/(?:staff\/)?tickets\/[^/]+\/(?:status-history|status|owner|priority|resolved-indicator|comments|attachments)(?:\/|$)/.test(path);
router.all(/^\/(?:tickets\/[^/]+\/status-history(?:\/[^/]+)?|staff\/tickets\/[^/]+\/(?:status|owner|priority))\/?$/, (_req, res) => sendApiError(res, new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')));
export function workflowParseError(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (!workflowPath(req.path)) return next(error);
  if (error instanceof URIError || (error && typeof error === 'object' && 'type' in error && ['entity.parse.failed', 'entity.too.large'].includes(String(error.type)))) return sendApiError(res, new ApiError(400, 'VALIDATION_ERROR', 'Use a valid request within size limits.'));
  sendApiError(res, error);
}
export default router;
