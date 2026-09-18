import React, { useState, useEffect, useMemo, useId } from "react";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
  AdminUser,
} from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { RoleBadge } from "../App.js";

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <span
        data-testid="status-badge"
        className="badge px-2 py-1"
        style={{
          backgroundColor: "#EAF6EF",
          color: "#006B3C",
          border: "1px solid #006B3C",
          fontWeight: 600,
        }}
      >
        Active
      </span>
    );
  }
  return (
    <span
      data-testid="status-badge"
      className="badge px-2 py-1"
      style={{
        backgroundColor: "#F8F9FA",
        color: "#6C757D",
        border: "1px solid #CED4DA",
        fontWeight: 600,
      }}
    >
      Inactive
    </span>
  );
}

interface UserManagementProps {
  currentUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export default function UserManagement({ currentUser: propCurrentUser }: UserManagementProps) {
  const auth = useAuth?.() || ({} as any);
  const loggedInUser = propCurrentUser || auth.user;

  // List states
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Panel state: 'list' | 'create' | 'edit'
  const [panelMode, setPanelMode] = useState<"list" | "create" | "edit">("list");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("REQUESTER");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPassword, setFormPassword] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Form inline error states
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalFormError, setGeneralFormError] = useState<string | null>(null);

  // Reset password states in Edit mode
  const [showResetPasswordBox, setShowResetPasswordBox] = useState(false);
  const [newResetPassword, setNewResetPassword] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false);

  // Generate unique IDs for form labels and accessible controls
  const nameInputId = useId();
  const emailInputId = useId();
  const roleSelectId = useId();
  const activeToggleId = useId();
  const passwordInputId = useId();
  const resetPasswordInputId = useId();

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch users when search or filter changes
  const fetchUsers = async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await getAdminUsers({
        search: debouncedSearch,
        role: roleFilter !== "ALL" ? roleFilter : undefined,
      });
      setUsers(res.users || []);
    } catch (err: any) {
      setErrorBanner(err?.error?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [debouncedSearch, roleFilter]);

  // Count active administrators for last-admin prevention logic
  const activeAdminCount = useMemo(() => {
    return users.filter((u) => u.role === "ADMINISTRATOR" && u.isActive).length;
  }, [users]);

  // Reset form errors
  const clearErrors = () => {
    setNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setGeneralFormError(null);
    setResetPasswordError(null);
  };

  // Open Create panel
  const handleOpenCreate = () => {
    clearErrors();
    setPanelMode("create");
    setSelectedUser(null);
    setFormName("");
    setFormEmail("");
    setFormRole("REQUESTER");
    setFormIsActive(true);
    setFormPassword("");
    setShowResetPasswordBox(false);
    setNewResetPassword("");
  };

  // Open Edit panel
  const handleOpenEdit = (user: AdminUser) => {
    clearErrors();
    setPanelMode("edit");
    setSelectedUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormRole(user.role);
    setFormIsActive(user.isActive);
    setFormPassword("");
    setShowResetPasswordBox(false);
    setNewResetPassword("");
  };

  // Close panel
  const handleClosePanel = () => {
    setPanelMode("list");
    setSelectedUser(null);
    clearErrors();
    setShowResetPasswordBox(false);
    setNewResetPassword("");
  };

  // Handle Save (Create or Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    let hasClientError = false;

    if (!formName.trim()) {
      setNameError("Full name is required");
      hasClientError = true;
    }

    if (!formEmail.trim() || !EMAIL_REGEX.test(formEmail.trim())) {
      setEmailError("A valid email address is required");
      hasClientError = true;
    }

    if (panelMode === "create") {
      if (!formPassword || !STRONG_PASSWORD_REGEX.test(formPassword)) {
        setPasswordError("Password must be at least 8 characters long with uppercase, lowercase, number, and special character (!@#$%^&*)");
        hasClientError = true;
      }
    }

    if (hasClientError) return;

    setFormSubmitting(true);

    try {
      if (panelMode === "create") {
        await createAdminUser({
          name: formName.trim(),
          email: formEmail.trim(),
          role: formRole,
          isActive: formIsActive,
          initialPassword: formPassword,
        });
        setToastMessage("User created successfully");
      } else if (panelMode === "edit" && selectedUser) {
        await updateAdminUser(selectedUser.id, {
          name: formName.trim(),
          email: formEmail.trim(),
          role: formRole,
          isActive: formIsActive,
        });
        setToastMessage("User updated successfully");
      }

      handleClosePanel();
      await fetchUsers();
    } catch (err: any) {
      const errCode = err?.error?.code;
      const errMsg = err?.error?.message;

      if (errCode === "EMAIL_ALREADY_EXISTS") {
        setEmailError("This email is already in use.");
      } else if (errCode === "CANNOT_DEACTIVATE_SELF") {
        setGeneralFormError("You cannot deactivate your own account.");
      } else if (errCode === "LAST_ACTIVE_ADMIN") {
        setGeneralFormError("At least one active Administrator is required.");
      } else {
        setGeneralFormError(errMsg || "An error occurred while saving user");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle active / deactive in Edit panel
  const handleToggleActive = async () => {
    if (!selectedUser) return;

    const willBeActive = !selectedUser.isActive;

    if (!willBeActive) {
      const confirmed = window.confirm(`Are you sure you want to deactivate ${selectedUser.name}?`);
      if (!confirmed) return;
    }

    setFormSubmitting(true);
    clearErrors();

    try {
      const updated = await updateAdminUser(selectedUser.id, {
        isActive: willBeActive,
      });
      setSelectedUser(updated);
      setFormIsActive(updated.isActive);
      setToastMessage(willBeActive ? "User activated successfully" : "User deactivated successfully");
      await fetchUsers();
    } catch (err: any) {
      const errCode = err?.error?.code;
      if (errCode === "CANNOT_DEACTIVATE_SELF") {
        setGeneralFormError("You cannot deactivate your own account.");
      } else if (errCode === "LAST_ACTIVE_ADMIN") {
        setGeneralFormError("At least one active Administrator is required.");
      } else {
        setGeneralFormError(err?.error?.message || "Failed to change user activation status");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Reset Password in Edit panel
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetPasswordError(null);

    if (!newResetPassword || !STRONG_PASSWORD_REGEX.test(newResetPassword)) {
      setResetPasswordError("Password must be at least 8 characters long with uppercase, lowercase, number, and special character (!@#$%^&*)");
      return;
    }

    if (!selectedUser) return;

    setResetPasswordSubmitting(true);
    try {
      await resetAdminUserPassword(selectedUser.id, { newPassword: newResetPassword });
      setToastMessage("Password reset — user must set a new password at next login.");
      setShowResetPasswordBox(false);
      setNewResetPassword("");
    } catch (err: any) {
      setResetPasswordError(err?.error?.message || "Failed to reset password");
    } finally {
      setResetPasswordSubmitting(false);
    }
  };

  // Determine if deactivate button should be disabled
  const isEditingSelf = Boolean(loggedInUser && selectedUser && loggedInUser.id === selectedUser.id);
  const isLastActiveAdmin = Boolean(
    selectedUser &&
      selectedUser.role === "ADMINISTRATOR" &&
      selectedUser.isActive &&
      activeAdminCount <= 1
  );

  let deactivateDisabledTooltip = "";
  if (isEditingSelf) {
    deactivateDisabledTooltip = "You cannot deactivate your own account.";
  } else if (isLastActiveAdmin) {
    deactivateDisabledTooltip = "At least one active Administrator is required.";
  }

  return (
    <div className="container-fluid px-0">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          data-testid="success-toast"
          className="alert alert-success alert-dismissible fade show d-flex justify-content-between align-items-center mb-3 shadow-sm"
          role="alert"
          style={{ backgroundColor: "#EAF6EF", borderColor: "#006B3C", color: "#006B3C" }}
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            className="btn-close"
            onClick={() => setToastMessage(null)}
            aria-label="Close"
          />
        </div>
      )}

      {/* Global Error Banner */}
      {errorBanner && (
        <div
          data-testid="error-banner"
          className="alert alert-danger alert-dismissible fade show mb-3"
          role="alert"
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            className="btn-close"
            onClick={() => setErrorBanner(null)}
            aria-label="Close"
          />
        </div>
      )}

      {/* Main Container: 2-column on Desktop when Panel is open, 1-column otherwise */}
      <div className="row g-4">
        {/* Left column: List View */}
        <div className={panelMode !== "list" ? "col-lg-7 col-xl-8" : "col-12"}>
          <div className="card shadow-sm border-0 p-4" style={{ backgroundColor: "#FFFFFF", borderRadius: 12 }}>
            {/* Header and Create Button */}
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
              <div>
                <h2 className="h4 mb-1 fw-bold" style={{ color: "#006B3C" }}>
                  Administrator User Management
                </h2>
                <p className="text-muted small mb-0">
                  Manage accounts, assign roles, and administer passwords.
                </p>
              </div>
              <button
                data-testid="create-user-btn"
                className="btn text-white fw-semibold d-flex align-items-center justify-content-center gap-1"
                style={{ backgroundColor: "#006B3C", borderRadius: 8, minHeight: 40 }}
                onClick={handleOpenCreate}
              >
                <span>+</span> <span>Create User</span>
              </button>
            </div>

            {/* Filter and Search Controls */}
            <div className="row g-2 mb-4">
              <div className="col-12 col-md-8">
                <input
                  type="text"
                  data-testid="user-search-input"
                  className="form-control"
                  placeholder="Search users by name or email…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ borderRadius: 8 }}
                />
              </div>
              <div className="col-12 col-md-4">
                <select
                  data-testid="user-role-filter"
                  className="form-select"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  style={{ borderRadius: 8 }}
                >
                  <option value="ALL">All Roles</option>
                  <option value="REQUESTER">Requester</option>
                  <option value="IT_STAFF">IT Staff</option>
                  <option value="ADMINISTRATOR">Administrator</option>
                </select>
              </div>
            </div>

            {/* Users Table / Responsive List */}
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-success" role="status">
                  <span className="visually-hidden">Loading users...</span>
                </div>
                <div className="text-muted small mt-2">Loading user accounts...</div>
              </div>
            ) : users.length === 0 ? (
              <div data-testid="empty-user-list" className="text-center py-5 text-muted">
                <p className="mb-0">No users found.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" data-testid="user-table">
                  <thead className="table-light">
                    <tr>
                      <th scope="col" style={{ color: "#495057", fontWeight: 600 }}>Name</th>
                      <th scope="col" style={{ color: "#495057", fontWeight: 600 }}>Email</th>
                      <th scope="col" style={{ color: "#495057", fontWeight: 600 }}>Role</th>
                      <th scope="col" style={{ color: "#495057", fontWeight: 600 }}>Status</th>
                      <th scope="col" className="text-end" style={{ color: "#495057", fontWeight: 600 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelected = selectedUser?.id === u.id;
                      return (
                        <tr
                          key={u.id}
                          data-testid={`user-row-${u.id}`}
                          style={{
                            backgroundColor: isSelected ? "#EAF6EF" : undefined,
                            cursor: "pointer",
                          }}
                          onClick={() => handleOpenEdit(u)}
                        >
                          <td className="fw-semibold text-dark">{u.name}</td>
                          <td className="text-muted small">{u.email}</td>
                          <td>
                            <RoleBadge role={u.role} />
                          </td>
                          <td>
                            <StatusBadge isActive={u.isActive} />
                          </td>
                          <td className="text-end">
                            <button
                              data-testid={`edit-user-${u.id}`}
                              className="btn btn-sm btn-outline-secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(u);
                              }}
                              style={{ borderRadius: 6 }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Create / Edit Panel */}
        {panelMode !== "list" && (
          <div className="col-12 col-lg-5 col-xl-4" data-testid="user-panel">
            <div
              className="card shadow-sm border-0 p-4 sticky-lg-top"
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                top: 24,
                zIndex: 10,
              }}
            >
              {/* Panel Header */}
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h3 className="h5 mb-0 fw-bold" style={{ color: "#006B3C" }}>
                  {panelMode === "create" ? "Create User" : "Edit User"}
                </h3>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close panel"
                  onClick={handleClosePanel}
                />
              </div>

              {/* General Form Error Banner */}
              {generalFormError && (
                <div data-testid="form-general-error" className="alert alert-danger py-2 small mb-3">
                  {generalFormError}
                </div>
              )}

              {/* Main Form */}
              <form onSubmit={handleSave} noValidate>
                {/* Full Name */}
                <div className="mb-3">
                  <label htmlFor={nameInputId} className="form-label small fw-semibold text-dark mb-1">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id={nameInputId}
                    type="text"
                    data-testid="user-name-input"
                    className={`form-control ${nameError ? "is-invalid" : ""}`}
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    placeholder="e.g. Jennifer Anderson"
                    style={{ borderRadius: 8 }}
                  />
                  {nameError && (
                    <div data-testid="name-error" className="invalid-feedback small">
                      {nameError}
                    </div>
                  )}
                </div>

                {/* Email Address */}
                <div className="mb-3">
                  <label htmlFor={emailInputId} className="form-label small fw-semibold text-dark mb-1">
                    Email Address <span className="text-danger">*</span>
                  </label>
                  <input
                    id={emailInputId}
                    type="email"
                    data-testid="user-email-input"
                    className={`form-control ${emailError ? "is-invalid" : ""}`}
                    value={formEmail}
                    onChange={(e) => {
                      setFormEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="e.g. user@toktickit.com"
                    style={{ borderRadius: 8 }}
                  />
                  {emailError && (
                    <div data-testid="email-error" className="invalid-feedback small d-block">
                      {emailError}
                    </div>
                  )}
                </div>

                {/* Role */}
                <div className="mb-3">
                  <label htmlFor={roleSelectId} className="form-label small fw-semibold text-dark mb-1">
                    Role <span className="text-danger">*</span>
                  </label>
                  <select
                    id={roleSelectId}
                    data-testid="user-role-select"
                    className="form-select"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    style={{ borderRadius: 8 }}
                  >
                    <option value="REQUESTER">Requester</option>
                    <option value="IT_STAFF">IT Staff</option>
                    <option value="ADMINISTRATOR">Administrator</option>
                  </select>
                </div>

                {/* Active Toggle */}
                <div className="mb-3 form-check form-switch">
                  <input
                    id={activeToggleId}
                    type="checkbox"
                    data-testid="user-active-toggle"
                    className="form-check-input"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label htmlFor={activeToggleId} className="form-check-label small fw-semibold" style={{ cursor: "pointer" }}>
                    Account Active
                  </label>
                </div>

                {/* Initial Password (Create mode only) */}
                {panelMode === "create" && (
                  <div className="mb-3">
                    <label htmlFor={passwordInputId} className="form-label small fw-semibold text-dark mb-1">
                      Initial Password <span className="text-danger">*</span>
                    </label>
                    <input
                      id={passwordInputId}
                      type="password"
                      data-testid="user-password-input"
                      className={`form-control ${passwordError ? "is-invalid" : ""}`}
                      value={formPassword}
                      onChange={(e) => {
                        setFormPassword(e.target.value);
                        if (passwordError) setPasswordError(null);
                      }}
                      placeholder="Enter strong temporary password"
                      style={{ borderRadius: 8 }}
                    />
                    {passwordError && (
                      <div data-testid="password-error" className="invalid-feedback small d-block">
                        {passwordError}
                      </div>
                    )}
                    <small className="text-muted d-block mt-1" style={{ fontSize: "0.75rem" }}>
                      User will be required to change this password on first login. (Must have ≥8 chars, uppercase, lowercase, number, special char).
                    </small>
                  </div>
                )}

                {/* Buttons: Save & Cancel */}
                <div className="d-flex gap-2 mt-4">
                  <button
                    type="submit"
                    data-testid="save-user-btn"
                    className="btn btn-success flex-grow-1 fw-semibold text-white"
                    style={{ backgroundColor: "#006B3C", borderColor: "#006B3C", borderRadius: 8 }}
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? "Saving..." : panelMode === "create" ? "Create User" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    data-testid="cancel-user-btn"
                    className="btn btn-outline-secondary"
                    onClick={handleClosePanel}
                    style={{ borderRadius: 8 }}
                    disabled={formSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>

              {/* Edit Mode Actions: Deactivate/Activate button and Set New Password */}
              {panelMode === "edit" && selectedUser && (
                <div className="mt-4 pt-4 border-top">
                  <h4 className="h6 fw-bold mb-3 text-dark">Administrative Actions</h4>

                  {/* Deactivate / Activate Button */}
                  <div className="mb-3">
                    <div title={deactivateDisabledTooltip}>
                      <button
                        type="button"
                        data-testid="deactivate-user-btn"
                        className={`btn w-100 ${
                          selectedUser.isActive ? "btn-outline-danger" : "btn-outline-success"
                        }`}
                        style={{ borderRadius: 8 }}
                        onClick={handleToggleActive}
                        disabled={formSubmitting || Boolean(deactivateDisabledTooltip)}
                      >
                        {selectedUser.isActive ? "Deactivate User" : "Activate User"}
                      </button>
                    </div>
                    {deactivateDisabledTooltip && (
                      <div className="text-muted small mt-1 text-center" style={{ fontSize: "0.75rem" }}>
                        {deactivateDisabledTooltip}
                      </div>
                    )}
                  </div>

                  {/* Set New Password Action */}
                  <div className="mt-3">
                    {!showResetPasswordBox ? (
                      <button
                        type="button"
                        data-testid="open-reset-password-btn"
                        className="btn btn-outline-secondary w-100"
                        style={{ borderRadius: 8 }}
                        onClick={() => setShowResetPasswordBox(true)}
                      >
                        Set New Password
                      </button>
                    ) : (
                      <div className="p-3 bg-light rounded border mt-2">
                        <label htmlFor={resetPasswordInputId} className="form-label small fw-semibold text-dark mb-1">
                          New Temporary Password
                        </label>
                        <input
                          id={resetPasswordInputId}
                          type="password"
                          data-testid="new-password-input"
                          className={`form-control form-control-sm mb-2 ${
                            resetPasswordError ? "is-invalid" : ""
                          }`}
                          value={newResetPassword}
                          onChange={(e) => {
                            setNewResetPassword(e.target.value);
                            if (resetPasswordError) setResetPasswordError(null);
                          }}
                          placeholder="e.g. Str0ng!TempPass"
                        />
                        {resetPasswordError && (
                          <div data-testid="reset-password-error" className="invalid-feedback small d-block mb-2">
                            {resetPasswordError}
                          </div>
                        )}
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            data-testid="submit-reset-password-btn"
                            className="btn btn-sm btn-primary flex-grow-1"
                            onClick={handleResetPassword}
                            disabled={resetPasswordSubmitting}
                          >
                            {resetPasswordSubmitting ? "Updating..." : "Save Password"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => {
                              setShowResetPasswordBox(false);
                              setNewResetPassword("");
                              setResetPasswordError(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
