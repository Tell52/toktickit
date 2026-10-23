import { Prisma, PrismaClient } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { ApiError, sendApiError } from './api-error.js';

export const staffRoles = ['IT_STAFF', 'ADMINISTRATOR'];
export function assertBusinessUser(user: { isActive: boolean; mustChangePassword: boolean; role: string } | null, staffOnly = false) {
  if (!user?.isActive) throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
  if (user.mustChangePassword) throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your password before continuing.');
  if (staffOnly && !staffRoles.includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
}
export const businessUserSelect = { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true } as const;
function currentSession(allowPasswordChange: boolean) { return async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (!req.session?.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    const user = await getPrisma().user.findUnique({ where: { id: req.session.user.id }, select: businessUserSelect });
    assertBusinessUser(user && allowPasswordChange ? { ...user, mustChangePassword: false } : user);
    const { isActive, ...sessionUser } = user!;
    req.session.user = sessionUser;
    next();
  } catch (error) { sendApiError(res, error); }
}; }
export const requireCurrentBusinessUser = currentSession(false);
// Forced-change users still need /me and change-password to recover their account.
export const requireCurrentSession = currentSession(true);
export async function lockActionUsers(tx: Prisma.TransactionClient, actorId: string, assigneeId: string) {
  const users = await tx.$queryRaw<{ id: string; role: string; isActive: boolean; mustChangePassword: boolean }[]>(Prisma.sql`
    SELECT "id", "role", "isActive", "mustChangePassword" FROM "User"
    WHERE "id" IN (${Prisma.join([...new Set([actorId, assigneeId])])}) ORDER BY "id" FOR UPDATE`);
  assertBusinessUser(users.find(user => user.id === actorId) ?? null, true);
  return users.find(user => user.id === assigneeId);
}
export async function currentViewer(tx: Prisma.TransactionClient | PrismaClient, actorId: string) {
  const user = await tx.user.findUnique({ where: { id: actorId }, select: businessUserSelect });
  assertBusinessUser(user);
  return user!;
}
