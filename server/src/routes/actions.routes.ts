import { NextFunction, Request, Response, Router } from 'express';
import { getPrisma } from '../prisma.js';
import { requireCsrf, requireRole } from '../middleware/auth.js';
import { requireCurrentBusinessUser } from '../services/action-access.js';
import { pagination, parseActionInput, ticketIdentity, uuid } from '../services/action-validation.js';
import { createAction, readActions, updateAction } from '../services/actions.js';
import { ApiError, invalid, sendApiError } from '../services/api-error.js';

const router = Router();
const staff = [requireCurrentBusinessUser, requireRole(['IT_STAFF', 'ADMINISTRATOR'])];
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await handler(req, res); } catch (error) { sendApiError(res, error); }
};
router.get('/tickets/:id/actions', requireCurrentBusinessUser, run(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await readActions(getPrisma(), req.session.user!.id, ticketIdentity(req.params.id), pagination(req.query)));
}));
router.get('/staff/tickets/:id/actions/:actionId/revisions', ...staff, run(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await readActions(getPrisma(), req.session.user!.id, ticketIdentity(req.params.id), pagination(req.query), uuid(req.params.actionId, 'actionId')));
}));
router.post('/staff/tickets/:id/actions', ...staff, requireCsrf, run(async (req, res) => {
  if (Object.keys(req.query).length) invalid('query', 'Unsupported query parameter.');
  const identity = ticketIdentity(req.params.id), key = uuid(req.get('Idempotency-Key'), 'Idempotency-Key');
  const result = await createAction(getPrisma(), req.session.user!.id, identity, key, parseActionInput(req.body));
  res.set('Cache-Control', 'no-store');
  if (result.replayed) res.set('Idempotency-Replayed', 'true');
  res.status(result.replayed ? 200 : 201).json(result.body);
}));
router.patch('/staff/tickets/:id/actions/:actionId', ...staff, requireCsrf, run(async (req, res) => {
  if (Object.keys(req.query).length) invalid('query', 'Unsupported query parameter.');
  const input = parseActionInput(req.body, true);
  res.set('Cache-Control', 'no-store');
  res.json(await updateAction(getPrisma(), req.session.user!.id, ticketIdentity(req.params.id), uuid(req.params.actionId, 'actionId'), input));
}));

export const isActionsPath = (path: string) => /^\/api\/(?:staff\/)?tickets\/[^/]+\/actions(?:\/|$)/.test(path);
router.use((req, res, next) => {
  if (isActionsPath('/api' + req.path)) return sendApiError(res, new ApiError(404, 'NOT_FOUND', 'Endpoint not found.'));
  next();
});
export function actionsParseError(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (!isActionsPath(req.path)) return next(error);
  if (error instanceof URIError || (error && typeof error === 'object' && 'type' in error && ['entity.parse.failed', 'entity.too.large'].includes(String(error.type)))) return sendApiError(res, new ApiError(400, 'VALIDATION_ERROR', 'Use a valid request within the size limits.'));
  return sendApiError(res, error);
}
export default router;
