import { Request, Response, NextFunction } from 'express';
import 'express-session';

// Extend Session type เพื่อให้รองรับข้อมูล User และ CSRF
declare module 'express-session' {
    interface SessionData {
        user: {
            id: string;
            name: string;
            email: string;
            role: string;
            mustChangePassword: boolean;
        };
        csrfToken: string;
    }
}

// 1. ตรวจสอบว่า Login แล้วหรือยัง
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: { code: 'UNAUTHENTICATED', message: 'Please log in to continue' }
        });
    }
    next();
};

// 2. ตรวจสอบ CSRF Token สำหรับ POST, PATCH, DELETE[cite: 7]
export const requireCsrf = (req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
        const token = req.headers['x-csrf-token'];
        if (!token || token !== req.session.csrfToken) {
            return res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Invalid CSRF token' }
            });
        }
    }
    next();
};

// 3. ตรวจสอบ Role (RBAC)[cite: 7, 8]
export const requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.session.user || !allowedRoles.includes(req.session.user.role)) {
            return res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' }
            });
        }
        next();
    };
};