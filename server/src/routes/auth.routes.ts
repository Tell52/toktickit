import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getPrisma } from '../prisma.js';
import { requireAuth, requireCsrf } from '../middleware/auth';
import { User } from '@prisma/client';
import { sendApiError, invalid, ApiError } from '../services/api-error.js';
import { assertBusinessUser, requireCurrentSession } from '../services/action-access.js';

const router = Router();

// POST /api/auth/login[cite: 7]
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' } });
    }

    try {
        const prisma = getPrisma();
        // ใช้ case-insensitive ในการหา email[cite: 8]
        const user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } }
        });

        const isMatch = user ? await bcrypt.compare(password, user.passwordHash) : false;

        // BR-07: Generic error message สำหรับทุกกรณี (อีเมลผิด, รหัสผิด, inactive)[cite: 7, 8]
        if (!user || !isMatch || !user.isActive) {
            return res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
            });
        }

        // สร้าง CSRF Token[cite: 7]
        const csrfToken = crypto.randomBytes(32).toString('hex');

        await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            mustChangePassword: user.mustChangePassword
        };
        req.session.csrfToken = csrfToken;

        res.status(200).json({
            user: req.session.user,
            csrfToken
        });
    } catch (error) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    }
});

// POST /api/auth/logout[cite: 7]
router.post('/logout', requireAuth, requireCsrf, (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not log out' } });
        res.clearCookie('connect.sid'); // ชื่อ cookie เริ่มต้นของ express-session
        res.status(200).json({ success: true });
    });
});

// GET /api/auth/me[cite: 7]
router.get('/me', requireCurrentSession, (req, res) => {
    res.status(200).json(req.session.user);
});

// POST /api/auth/change-password[cite: 7]
router.post('/change-password', requireCurrentSession, requireCsrf, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        if (![currentPassword, newPassword, confirmPassword].every(value => typeof value === 'string')) invalid('password', 'Enter the current and new passwords.');
        if (newPassword !== confirmPassword) invalid('confirmPassword', 'Passwords do not match.');
        const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
        if (!strongRegex.test(newPassword)) invalid('newPassword', 'Password does not meet requirements.');
        const user = await getPrisma().$transaction(async tx => {
            const [current] = await tx.$queryRaw<User[]>`SELECT * FROM "User" WHERE "id" = ${req.session.user!.id} FOR UPDATE`;
            assertBusinessUser(current ? { ...current, mustChangePassword: false } : null);
            if (!await bcrypt.compare(currentPassword, current.passwordHash)) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
            return tx.user.update({ where: { id: current.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
                select: { id: true, name: true, email: true, role: true, mustChangePassword: true } });
        });
        req.session.user = user;
        res.status(200).json({ user });
    } catch (error) { sendApiError(res, error); }
});

export default router;
