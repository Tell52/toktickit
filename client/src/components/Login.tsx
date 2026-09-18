import React, { useState } from 'react';
import { login as apiLogin } from '../api.js';
import { useAuth, User } from '../context/AuthContext.js';

interface LoginProps {
  onSuccess?: (user: User) => void;
  onNavigate?: (path: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess, onNavigate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [showForgotNotice, setShowForgotNotice] = useState(false);
  const auth = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsBusy(true);

    try {
      const response = await apiLogin({ email, password });
      auth.login(response.user, response.csrfToken);

      if (onSuccess) {
        onSuccess(response.user);
      }

      // ตรวจสอบว่าต้องเปลี่ยนรหัสผ่านหรือไม่
      if (response.user.mustChangePassword) {
        onNavigate?.('/change-password');
      } else {
        onNavigate?.('/');
      }
    } catch (err: any) {
      // แสดง Banner Error ทั่วไป ไม่ว่าจะอีเมลผิด รหัสผิด หรือ inactive (BR-07)
      setError(err?.error?.message || err?.message || 'Invalid email or password.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="login-container d-flex justify-content-center align-items-center vh-100" style={{ backgroundColor: '#F5F7F6' }}>
      <div className="card p-4 shadow-sm border-0" style={{ maxWidth: '420px', width: '100%', borderRadius: '12px' }}>
        <h2 className="text-center fw-bold mb-1" style={{ color: '#006B3C' }}>TokTickIT</h2>
        <h4 className="text-center mb-4 text-muted small fw-semibold">Sign in to your account</h4>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label fw-semibold">Email address</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold">Password</label>
            <div className="input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn w-100 text-white fw-bold py-2 mt-2"
            style={{ backgroundColor: '#006B3C', borderColor: '#006B3C' }}
            disabled={isBusy}
          >
            {isBusy ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="text-center mt-3">
          <a
            href="#forgot-password"
            title="Password reset via email is not available in this version."
            className="text-muted small text-decoration-none"
            onClick={(e) => {
              e.preventDefault();
              setShowForgotNotice(true);
            }}
          >
            Forgot your password?
          </a>
          {showForgotNotice && (
            <div className="alert alert-info py-1 px-2 mt-2 small mb-0">
              Password reset via email is not available in this version.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
