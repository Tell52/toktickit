import { Request, Response, Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { requireCurrentBusinessUser } from '../services/action-access.js';
import { getPrisma } from '../prisma.js';
import { invalid, sendApiError } from '../services/api-error.js';
import { requesterDashboard, requesterTickets } from '../services/dashboard.js';

import { staffDashboard, staffActions, actionsPage } from '../services/staff-dashboard.js';
const router = Router();
const staff = [requireCurrentBusinessUser, requireRole(['IT_STAFF', 'ADMINISTRATOR'])];
const requester = [requireCurrentBusinessUser, requireRole(['REQUESTER'])];
const run = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  try { await handler(req, res); } catch (error) { sendApiError(res, error); }
};
router.get('/dashboard/requester', ...requester, run(async (req, res) => {
  if (Object.keys(req.query).length) invalid('query', 'Unsupported query parameter.');
  res.json(await requesterDashboard(getPrisma(), req.session.user!.id));
}));
router.get('/tickets', ...requester, run(async (req, res) => {
  res.json(await requesterTickets(getPrisma(), req.session.user!.id, req.query));
}));
router.get('/staff/dashboard', ...staff, run(async (req, res) => {
  if (Object.keys(req.query).length) invalid('query', 'Unsupported query parameter.');
  res.json(await staffDashboard(getPrisma(), req.session.user!.id));
}));
router.get('/staff/actions/mine', ...staff, run(async (req, res) => {
  res.json(await staffActions(getPrisma(), req.session.user!.id, actionsPage(req.query)));
}));
export default router;
