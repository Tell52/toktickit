import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import UserManagement from "../../src/components/UserManagement.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("UserManagement Component (Lab 3)", () => {
  const mockAdminLoggedIn = {
    id: "usr_admin_01",
    name: "Admin User",
    email: "admin@toktickit.com",
    role: "ADMINISTRATOR",
  };

  const mockUsers: api.AdminUser[] = [
    {
      id: "usr_admin_01",
      name: "Admin User",
      email: "admin@toktickit.com",
      role: "ADMINISTRATOR",
      isActive: true,
    },
    {
      id: "usr_staff_01",
      name: "Staff Person",
      email: "staff@toktickit.com",
      role: "IT_STAFF",
      isActive: true,
    },
    {
      id: "usr_req_01",
      name: "Requester Guy",
      email: "requester@toktickit.com",
      role: "REQUESTER",
      isActive: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAdminUsers).mockResolvedValue({ users: mockUsers });
  });

  describe("List View", () => {
    it("renders user table with all users, roles, statuses and NO pagination controls", async () => {
      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
        expect(screen.getByText("Staff Person")).toBeInTheDocument();
        expect(screen.getByText("Requester Guy")).toBeInTheDocument();
      });

      // Badges
      expect(screen.getAllByText("Administrator").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("IT Staff").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Requester").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Active").length).toBe(2);
      expect(screen.getByText("Inactive")).toBeInTheDocument();

      // No pagination buttons/controls (Spec requirement: no pagination in User Management)
      expect(screen.queryByText(/Next/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Previous/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Page \d/i)).not.toBeInTheDocument();
    });

    it("filters user list by role", async () => {
      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      const roleSelect = screen.getByTestId("user-role-filter");
      fireEvent.change(roleSelect, { target: { value: "IT_STAFF" } });

      await waitFor(() => {
        expect(api.getAdminUsers).toHaveBeenCalledWith({
          search: "",
          role: "IT_STAFF",
        });
      });
    });

    it("debounces search input by name or email", async () => {
      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId("user-search-input");
      fireEvent.change(searchInput, { target: { value: "staff" } });

      await waitFor(() => {
        expect(api.getAdminUsers).toHaveBeenCalledWith({
          search: "staff",
          role: undefined,
        });
      });
    });
  });

  describe("Create User Panel", () => {
    it("opens create panel, validates client input, and submits successfully", async () => {
      vi.mocked(api.createAdminUser).mockResolvedValue({
        id: "usr_new_01",
        name: "Alice Cooper",
        email: "alice@toktickit.com",
        role: "IT_STAFF",
        isActive: true,
        mustChangePassword: true,
      });

      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      // Click "+ Create User"
      fireEvent.click(screen.getByTestId("create-user-btn"));

      expect(screen.getByRole("heading", { name: "Create User" })).toBeInTheDocument();

      // Fill in valid form
      fireEvent.change(screen.getByTestId("user-name-input"), {
        target: { value: "Alice Cooper" },
      });
      fireEvent.change(screen.getByTestId("user-email-input"), {
        target: { value: "alice@toktickit.com" },
      });
      fireEvent.change(screen.getByTestId("user-role-select"), {
        target: { value: "IT_STAFF" },
      });
      fireEvent.change(screen.getByTestId("user-password-input"), {
        target: { value: "Str0ng!Pass1" },
      });

      fireEvent.click(screen.getByTestId("save-user-btn"));

      await waitFor(() => {
        expect(api.createAdminUser).toHaveBeenCalledWith({
          name: "Alice Cooper",
          email: "alice@toktickit.com",
          role: "IT_STAFF",
          isActive: true,
          initialPassword: "Str0ng!Pass1",
        });
      });
    });

    it("UI-06: duplicate-email server error renders inline under Email field, not as a generic toast only (AC-11, FR-29)", async () => {
      vi.mocked(api.createAdminUser).mockRejectedValue({
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "This email is already in use.",
        },
      });

      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("create-user-btn"));

      fireEvent.change(screen.getByTestId("user-name-input"), {
        target: { value: "Bob" },
      });
      fireEvent.change(screen.getByTestId("user-email-input"), {
        target: { value: "existing@toktickit.com" },
      });
      fireEvent.change(screen.getByTestId("user-password-input"), {
        target: { value: "Str0ng!Pass1" },
      });

      fireEvent.click(screen.getByTestId("save-user-btn"));

      // Must display inline error under the email field
      await waitFor(() => {
        const inlineError = screen.getByTestId("email-error");
        expect(inlineError).toBeInTheDocument();
        expect(inlineError).toHaveTextContent(/already in use/i);
      });
    });
  });

  describe("Edit User Panel & Business Rules", () => {
    it("UI-07: Deactivate button is disabled with tooltip when editing the logged-in Admin's own row (AC-09, FR-30)", async () => {
      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      // Open Edit panel for the logged-in Admin (usr_admin_01)
      fireEvent.click(screen.getByTestId("edit-user-usr_admin_01"));

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      const deactivateBtn = screen.getByTestId("deactivate-user-btn");
      expect(deactivateBtn).toBeDisabled();

      // Check tooltip / title text
      expect(
        screen.getByTitle("You cannot deactivate your own account.")
      ).toBeInTheDocument();
    });

    it("Deactivate button is disabled with tooltip when editing the last active Administrator (AC-10, FR-31)", async () => {
      // In this setup, another admin logged in, but there is only 1 active admin in total
      const mockAnotherAdminLoggedIn = {
        id: "usr_other_admin",
        name: "Other Admin",
        email: "other@toktickit.com",
        role: "ADMINISTRATOR",
      };

      render(<UserManagement currentUser={mockAnotherAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      // Edit usr_admin_01 (the only active admin in mockUsers)
      fireEvent.click(screen.getByTestId("edit-user-usr_admin_01"));

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      const deactivateBtn = screen.getByTestId("deactivate-user-btn");
      expect(deactivateBtn).toBeDisabled();
      expect(
        screen.getByTitle("At least one active Administrator is required.")
      ).toBeInTheDocument();
    });

    it("allows deactivating an active non-admin user with confirmation dialog", async () => {
      window.confirm = vi.fn().mockReturnValue(true);
      vi.mocked(api.updateAdminUser).mockResolvedValue({
        id: "usr_staff_01",
        name: "Staff Person",
        email: "staff@toktickit.com",
        role: "IT_STAFF",
        isActive: false,
      });

      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Staff Person")).toBeInTheDocument();
      });

      // Click Edit for staff
      fireEvent.click(screen.getByTestId("edit-user-usr_staff_01"));

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      const deactivateBtn = screen.getByTestId("deactivate-user-btn");
      expect(deactivateBtn).not.toBeDisabled();
      expect(deactivateBtn).toHaveTextContent("Deactivate User");

      fireEvent.click(deactivateBtn);

      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining("Staff Person")
      );
      await waitFor(() => {
        expect(api.updateAdminUser).toHaveBeenCalledWith("usr_staff_01", {
          isActive: false,
        });
      });
    });

    it("resets password using 'Set New Password' and displays confirmation toast (API-18, FR-28)", async () => {
      vi.mocked(api.resetAdminUserPassword).mockResolvedValue({
        userId: "usr_staff_01",
        mustChangePassword: true,
      });

      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Staff Person")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("edit-user-usr_staff_01"));

      await waitFor(() => {
        expect(screen.getByTestId("open-reset-password-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("open-reset-password-btn"));

      const passwordInput = screen.getByTestId("new-password-input");
      fireEvent.change(passwordInput, {
        target: { value: "Fresh!Start123" },
      });

      fireEvent.click(screen.getByTestId("submit-reset-password-btn"));

      await waitFor(() => {
        expect(api.resetAdminUserPassword).toHaveBeenCalledWith("usr_staff_01", {
          newPassword: "Fresh!Start123",
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Password reset — user must set a new password at next login./i)
        ).toBeInTheDocument();
      });
    });

    it("allows activating an inactive user without confirmation dialog", async () => {
      window.confirm = vi.fn();
      vi.mocked(api.updateAdminUser).mockResolvedValue({
        id: "usr_req_01",
        name: "Requester Guy",
        email: "requester@toktickit.com",
        role: "REQUESTER",
        isActive: true,
      });

      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Requester Guy")).toBeInTheDocument();
      });

      // Edit inactive user usr_req_01
      fireEvent.click(screen.getByTestId("edit-user-usr_req_01"));

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      const activateBtn = screen.getByTestId("deactivate-user-btn");
      expect(activateBtn).toHaveTextContent("Activate User");
      expect(activateBtn).not.toBeDisabled();

      fireEvent.click(activateBtn);

      // Confirmation dialog should NOT be shown for activation
      expect(window.confirm).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(api.updateAdminUser).toHaveBeenCalledWith("usr_req_01", {
          isActive: true,
        });
      });
    });

    it("validates weak password in reset password form", async () => {
      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Staff Person")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("edit-user-usr_staff_01"));

      await waitFor(() => {
        expect(screen.getByTestId("open-reset-password-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("open-reset-password-btn"));

      const passwordInput = screen.getByTestId("new-password-input");
      fireEvent.change(passwordInput, {
        target: { value: "weak" },
      });

      fireEvent.click(screen.getByTestId("submit-reset-password-btn"));

      expect(api.resetAdminUserPassword).not.toHaveBeenCalled();
      expect(screen.getByTestId("reset-password-error")).toBeInTheDocument();
    });

    it("closes panel when Cancel button is clicked", async () => {
      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Staff Person")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("create-user-btn"));
      expect(screen.getByRole("heading", { name: "Create User" })).toBeInTheDocument();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      expect(screen.queryByRole("heading", { name: "Create User" })).not.toBeInTheDocument();
    });
  });

  describe("Form Client-Side Validation", () => {
    it("displays inline validation errors when submitting empty Create User form", async () => {
      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("create-user-btn"));

      // Click save immediately without entering fields
      fireEvent.click(screen.getByTestId("save-user-btn"));

      expect(screen.getByTestId("name-error")).toHaveTextContent("Full name is required");
      expect(screen.getByTestId("email-error")).toHaveTextContent("A valid email address is required");
      expect(screen.getByTestId("password-error")).toHaveTextContent(/Password must be at least 8 characters long/i);
      expect(api.createAdminUser).not.toHaveBeenCalled();
    });
  });

  describe("Error State", () => {
    it("displays global error banner when fetching users fails", async () => {
      vi.mocked(api.getAdminUsers).mockRejectedValueOnce({
        error: { message: "Network failure loading user list" },
      });

      render(<UserManagement currentUser={mockAdminLoggedIn} />);

      await waitFor(() => {
        expect(screen.getByTestId("error-banner")).toHaveTextContent("Network failure loading user list");
      });
    });
  });
});

