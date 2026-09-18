import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  currentPath,
  onNavigate,
}) => {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    // 1. ถ้ายังไม่ได้ล็อกอิน ให้เด้งไปหน้า /login
    if (!user) {
      if (currentPath !== '/login') {
        onNavigate('/login');
      }
      return;
    }

    // 2. FR-05: ถ้าต้องเปลี่ยนรหัสผ่านชั่วคราว ให้บังคับเด้งไป /change-password
    if (user.mustChangePassword) {
      if (currentPath !== '/change-password') {
        onNavigate('/change-password');
      }
      return;
    }

    // 3. FR-07: Route Guard ตรวจสอบสิทธิ์ตาม Role
    if (allowedRoles && allowedRoles.length > 0) {
      const userRole = (user.role || '').toUpperCase();
      const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

      if (!normalizedAllowed.includes(userRole)) {
        // ถ้าไม่มีสิทธิ์เข้าถึงเส้นทางนี้ ให้เด้งกลับไปหน้าหลักตาม Role
        if (userRole === 'REQUESTER') {
          onNavigate('/tickets');
        } else {
          onNavigate('/queue');
        }
      }
    }
  }, [user, loading, currentPath, allowedRoles, onNavigate]);

  // กำลังโหลดสถานะ Auth
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // ไม่ได้ล็อกอิน หรือยังไม่เปลี่ยนรหัสผ่านแต่พยายามเข้าหน้าอื่น
  if (!user) return null;
  if (user.mustChangePassword && currentPath !== '/change-password') return null;

  // ตรวจสอบสิทธิ์ Role
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = (user.role || '').toUpperCase();
    const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());
    if (!normalizedAllowed.includes(userRole)) {
      return null;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
