import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { getPrisma } from '../prisma.js';
import { requireAuth, requireRole, requireCsrf } from '../middleware/auth.js';

const router = Router();

// Ensure all admin routes require authentication and Administrator role
router.use(requireAuth, requireRole(['ADMINISTRATOR']));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
const VALID_ROLES = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'];

function isTargetActiveActiveAdmin(targetUser: { role: string; isActive: boolean }, newIsActive?: boolean, newRole?: string): boolean {
  if (targetUser.role !== 'ADMINISTRATOR' || !targetUser.isActive) {
    return false;
  }
  const willBeInactive = newIsActive === false;
  const willChangeRole = newRole !== undefined && newRole.toUpperCase() !== 'ADMINISTRATOR';
  return willBeInactive || willChangeRole;
}

/**
 * GET /api/admin/users
 * Returns list of users filtered by optional search and role parameters
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { search, role } = req.query;

    if (role && typeof role === 'string') {
      if (!VALID_ROLES.includes(role.toUpperCase())) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid role filter' }
        });
      }
    }

    const prisma = getPrisma();
    const whereClause: any = {};

    if (role && typeof role === 'string') {
      whereClause.role = role.toUpperCase() as Role;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      whereClause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } }
      ];
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    return res.status(200).json({ users });
  } catch (error) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch users' }
    });
  }
});

/**
 * POST /api/admin/users
 * Creates a new user with initial password and forced password change
 */
router.post('/users', requireCsrf, async (req: Request, res: Response) => {
  try {
    const { name, email, role, isActive, initialPassword } = req.body;

    // Field validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Full name is required' }
      });
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'A valid email address is required' }
      });
    }

    if (!role || typeof role !== 'string' || !VALID_ROLES.includes(role.toUpperCase())) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'A valid role is required' }
      });
    }

    if (!initialPassword || typeof initialPassword !== 'string' || !STRONG_PASSWORD_REGEX.test(initialPassword)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters long and contain lowercase, uppercase, number, and special character'
        }
      });
    }

    const prisma = getPrisma();
    const cleanEmail = email.trim();

    // Check unique email case-insensitively (BR-09)
    const existing = await prisma.user.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' } }
    });

    if (existing) {
      return res.status(409).json({
        error: { code: 'EMAIL_ALREADY_EXISTS', message: 'This email is already in use.' }
      });
    }

    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        role: role.toUpperCase() as Role,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        mustChangePassword: true,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      }
    });

    return res.status(201).json(user);
  } catch (error) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create user' }
    });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Updates an existing user's attributes
 */
router.patch('/users/:id', requireCsrf, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive } = req.body;

    const prisma = getPrisma();
    const targetUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!targetUser) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Validation
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Full name cannot be empty' }
        });
      }
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'A valid email address is required' }
        });
      }
    }

    if (role !== undefined) {
      if (typeof role !== 'string' || !VALID_ROLES.includes(role.toUpperCase())) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'A valid role is required' }
        });
      }
    }

    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'isActive must be a boolean' }
      });
    }

    // Email duplicate check
    if (email !== undefined && email.trim().toLowerCase() !== targetUser.email.toLowerCase()) {
      const emailConflict = await prisma.user.findFirst({
        where: {
          email: { equals: email.trim(), mode: 'insensitive' },
          id: { not: targetUser.id }
        }
      });
      if (emailConflict) {
        return res.status(409).json({
          error: { code: 'EMAIL_ALREADY_EXISTS', message: 'This email is already in use.' }
        });
      }
    }

    // Self-deactivation check (AC-09, FR-30)
    if (targetUser.id === req.session.user?.id && isActive === false) {
      return res.status(409).json({
        error: { code: 'CANNOT_DEACTIVATE_SELF', message: 'You cannot deactivate your own account.' }
      });
    }

    // Last active administrator check (AC-10, FR-31)
    if (isTargetActiveActiveAdmin(targetUser, isActive, role)) {
      const activeAdminCount = await prisma.user.count({
        where: {
          role: 'ADMINISTRATOR',
          isActive: true
        }
      });

      if (activeAdminCount <= 1) {
        return res.status(409).json({
          error: { code: 'LAST_ACTIVE_ADMIN', message: 'At least one active Administrator is required.' }
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email.trim() } : {}),
        ...(role !== undefined ? { role: role.toUpperCase() as Role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      }
    });

    return res.status(200).json(updatedUser);
  } catch (error) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update user' }
    });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Sets a new temporary password forcing a password change on next login
 */
router.post('/users/:id/reset-password', requireCsrf, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const prisma = getPrisma();
    const targetUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!targetUser) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!newPassword || typeof newPassword !== 'string' || !STRONG_PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters long and contain lowercase, uppercase, number, and special character'
        }
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        passwordHash,
        mustChangePassword: true,
      }
    });

    return res.status(200).json({
      userId: targetUser.id,
      mustChangePassword: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to reset password' }
    });
  }
});

export default router;
