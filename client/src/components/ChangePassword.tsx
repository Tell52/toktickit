import React, { useState } from 'react';
import { changePassword as apiChangePassword } from '../api.js';
import { useAuth } from '../context/AuthContext.js';

interface ChangePasswordProps {
  onSuccess?: () => void;
  onNavigate?: (path: string) => void;
}

export const ChangePassword: React.FC<ChangePasswordProps> = ({ onSuccess, onNavigate }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const auth = useAuth();

  // เงื่อนไขรหัสผ่านตาม Spec §2.3
  const isLengthValid = newPassword.length >= 8;
  const hasUpperLower = /(?=.*[a-z])(?=.*[A-Z])/.test(newPassword);
  const hasNumSpec = /(?=.*[0-9])(?=.*[!@#$%^&*])/.test(newPassword);
  const isMatch = newPassword !== '' && newPassword === confirmPassword;

  const canSubmit =
    isLengthValid &&
    hasUpperLower &&
    hasNumSpec &&
    isMatch &&
    currentPassword.trim() !== '' &&
    !isBusy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setCurrentPasswordError('');
    setGeneralError('');
    setIsBusy(true);

    try {
      await apiChangePassword({ currentPassword, newPassword, confirmPassword });
      await auth.checkAuth(); // ดึงข้อมูล User ใหม่เพื่อลบสถานะ mustChangePassword
      if (onSuccess) {
        onSuccess();
      }
      onNavigate?.('/');
    } catch (err: any) {
      const errCode = err?.error?.code;
      const errMsg = err?.error?.message || err?.message || 'Failed to change password.';

      if (errCode === 'INVALID_CREDENTIALS' || errMsg.toLowerCase().includes('current password')) {
        // On failure (wrong current password): inline error under "Current (temporary) password" field only
        setCurrentPasswordError(errMsg);
      } else {
        setGeneralError(errMsg);
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="change-password-container d-flex justify-content-center align-items-center vh-100" style={{ backgroundColor: '#F5F7F6' }}>
      <div className="card p-4 shadow-sm border-0" style={{ maxWidth: '440px', width: '100%', borderRadius: '12px' }}>
        <h4 className="text-center mb-2 fw-bold" style={{ color: '#006B3C' }}>Change your password</h4>
        <p className="text-center text-muted small mb-4">
          Please update your temporary password to continue.
        </p>

        {generalError && <div className="alert alert-danger" role="alert">{generalError}</div>}

        <form onSubmit={handleSubmit}>
          {/* 1. Current Password */}
          <div className="mb-3">
            <label className="form-label fw-semibold">Current (temporary) password</label>
            <div className="input-group">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                className={`form-control ${currentPasswordError ? 'is-invalid' : ''}`}
                value={currentPassword}
                onChange={e => {
                  setCurrentPassword(e.target.value);
                  if (currentPasswordError) setCurrentPasswordError('');
                }}
                placeholder="Enter current password"
                required
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
              >
                {showCurrentPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {currentPasswordError && (
              <div className="text-danger small mt-1">
                {currentPasswordError}
              </div>
            )}
          </div>

          {/* 2. New Password */}
          <div className="mb-3">
            <label className="form-label fw-semibold">New password</label>
            <div className="input-group">
              <input
                type={showNewPassword ? 'text' : 'password'}
                className="form-control"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                {showNewPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {/* Live checklist under the New Password field */}
            <ul className="list-unstyled small mt-2 mb-0 ps-1">
              <li className={isLengthValid ? 'text-success fw-medium' : 'text-muted'}>
                {isLengthValid ? '✓' : '○'} Be at least 8 characters
              </li>
              <li className={hasUpperLower ? 'text-success fw-medium' : 'text-muted'}>
                {hasUpperLower ? '✓' : '○'} Include upper and lower case letters
              </li>
              <li className={hasNumSpec ? 'text-success fw-medium' : 'text-muted'}>
                {hasNumSpec ? '✓' : '○'} Include a number and a special character
              </li>
            </ul>
          </div>

          {/* 3. Confirm New Password */}
          <div className="mb-4">
            <label className="form-label fw-semibold">Confirm new password</label>
            <div className="input-group">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className={`form-control ${confirmPassword && !isMatch ? 'is-invalid' : ''}`}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {confirmPassword && !isMatch && (
              <div className="text-danger small mt-1">
                Passwords do not match
              </div>
            )}
          </div>

          {/* Primary Action */}
          <button
            type="submit"
            className="btn w-100 text-white fw-bold py-2"
            style={{ backgroundColor: '#006B3C', borderColor: '#006B3C' }}
            disabled={!canSubmit}
          >
            {isBusy ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Updating password…
              </>
            ) : (
              'Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
