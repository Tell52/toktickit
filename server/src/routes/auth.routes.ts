import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getPrisma } from '../prisma.js';
import { requireAuth, requireCsrf } from '../middleware/auth';

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
router.get('/me', requireAuth, (req, res) => {
    res.status(200).json(req.session.user);
});

// POST /api/auth/change-password[cite: 7]
router.post('/change-password', requireAuth, requireCsrf, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Passwords do not match' } });
    }

    // Regex เช็ค กฎรหัสผ่าน: >= 8 ตัว, ตัวพิมพ์เล็ก, พิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ[cite: 8]
    const strongRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})");
    if (!strongRegex.test(newPassword)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password does not meet requirements' } });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: req.session.user!.id } });
    if (!user) {
        return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'User not found' } });
    }
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isMatch) {
        return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' } });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
        where: { id: user!.id },
        data: { passwordHash: newHash, mustChangePassword: false }
    });

    req.session.user!.mustChangePassword = false;

    res.status(200).json({ user: req.session.user });
});

export default router;