import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App, { RoleBadge } from "../../src/App.js";
import { AuthContext } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("Lab 3: Navigation, Role Badges, and Route Guards", () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined);
  const mockLogin = vi.fn();
  const mockCheckAuth = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  const renderWithAuth = (user: any, loading = false) => {
    return render(
      <AuthContext.Provider
        value={{
          user,
          loading,
          login: mockLogin,
          logout: mockLogout,
          checkAuth: mockCheckAuth,
        }}
      >
        <App />
      </AuthContext.Provider>
    );
  };

  describe("1. Removal of Development Requester Selector (FR-10)", () => {
    it("does not render Development Requester selector when unauthenticated (renders Login instead)", async () => {
      renderWithAuth(null, false);

      // ไม่ต้องมี Development Requester Selector อีกต่อไป
      expect(screen.queryByText(/Select Development Requester/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Choose a development requester/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Change Requester/i)).not.toBeInTheDocument();

      // แสดงหน้า Sign in to your account
      expect(screen.getByText(/Sign in to your account/i)).toBeInTheDocument();
    });

    it("does not render Development Requester selector when authenticated", async () => {
      renderWithAuth({
        id: 1,
        name: "Somchai Requester",
        email: "somchai@example.com",
        role: "REQUESTER",
        mustChangePassword: false,
      });

      expect(screen.queryByText(/Select Development Requester/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Change Requester/i)).not.toBeInTheDocument();
    });
  });

  describe("2. Navbar Top-Right: Name, Role Badge, and Logout", () => {
    it("renders current user's name, neutral Role badge, and functional Logout button for REQUESTER", async () => {
      renderWithAuth({
        id: 1,
        name: "Somchai Jaidee",
        email: "somchai@example.com",
        role: "REQUESTER",
        mustChangePassword: false,
      });

      expect(screen.getByText("Somchai Jaidee")).toBeInTheDocument();

      const badge = screen.getByTestId("role-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Requester");

      const logoutBtn = screen.getByRole("button", { name: /logout/i });
      expect(logoutBtn).toBeInTheDocument();

      fireEvent.click(logoutBtn);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it("renders blue outline Role badge for IT_STAFF", () => {
      render(<RoleBadge role="IT_STAFF" />);
      const badge = screen.getByTestId("role-badge");
      expect(badge).toHaveTextContent("IT Staff");
      expect(badge.style.border).toContain("solid");
      // ตรวจสอบโทนสีฟ้า
      expect(badge.style.color).toBe("rgb(13, 110, 253)");
    });

    it("renders dark green outline Role badge for ADMINISTRATOR", () => {
      render(<RoleBadge role="ADMINISTRATOR" />);
      const badge = screen.getByTestId("role-badge");
      expect(badge).toHaveTextContent("Administrator");
      expect(badge.style.border).toContain("solid");
      // ตรวจสอบโทนสีเขียวเข้ม Zen Green
      expect(badge.style.color).toBe("rgb(0, 107, 60)");
    });
  });

  describe("3. Role-based Navigation Links (FR-07)", () => {
    it("Requester sees only 'My Tickets', 'Create Ticket', 'Profile', and 'Logout'", async () => {
      renderWithAuth({
        id: 1,
        name: "Test Requester",
        email: "req@test.com",
        role: "REQUESTER",
        mustChangePassword: false,
      });

      expect(screen.getByRole("link", { name: /My Tickets/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Create Ticket/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Profile/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Logout/i })).toBeInTheDocument();

      // ห้ามเห็น My Queue หรือ Admin
      expect(screen.queryByRole("link", { name: /My Queue/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Admin/i })).not.toBeInTheDocument();
    });

    it("IT Staff sees only 'My Queue', 'Create Ticket', 'Profile', and 'Logout'", async () => {
      renderWithAuth({
        id: 2,
        name: "Test Staff",
        email: "staff@test.com",
        role: "IT_STAFF",
        mustChangePassword: false,
      });

      expect(screen.getByRole("link", { name: /My Queue/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Create Ticket/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Profile/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Logout/i })).toBeInTheDocument();

      // ห้ามเห็น My Tickets หรือ Admin
      expect(screen.queryByRole("link", { name: /My Tickets/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Admin/i })).not.toBeInTheDocument();
    });

    it("Administrator sees 'My Queue', 'Create Ticket', 'Admin', 'Profile', and 'Logout'", async () => {
      renderWithAuth({
        id: 3,
        name: "Test Admin",
        email: "admin@test.com",
        role: "ADMINISTRATOR",
        mustChangePassword: false,
      });

      expect(screen.getByRole("link", { name: /My Queue/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Create Ticket/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Admin/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Profile/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Logout/i })).toBeInTheDocument();

      // ห้ามเห็น My Tickets
      expect(screen.queryByRole("link", { name: /My Tickets/i })).not.toBeInTheDocument();
    });
  });

  describe("4. Route Guards (FR-05, FR-07)", () => {
    it("forces user with mustChangePassword=true to Change Password screen", async () => {
      window.history.pushState({}, "", "/tickets");

      renderWithAuth({
        id: 4,
        name: "New User",
        email: "new@test.com",
        role: "REQUESTER",
        mustChangePassword: true,
      });

      await waitFor(() => {
        expect(screen.getByText(/Change your password/i)).toBeInTheDocument();
        expect(screen.getByText(/Please update your temporary password to continue/i)).toBeInTheDocument();
      });
    });

    it("guards /admin route against unauthorized Requester access", async () => {
      window.history.pushState({}, "", "/admin");

      renderWithAuth({
        id: 1,
        name: "Requester Guy",
        email: "req@test.com",
        role: "REQUESTER",
        mustChangePassword: false,
      });

      // ต้องไม่สามารถเห็นหน้า Administrator User Management และถูกส่งกลับไปหน้าสำหรับ Requester
      await waitFor(() => {
        expect(screen.queryByText(/Administrator User Management/i)).not.toBeInTheDocument();
      });
    });

    it("allows Administrator to access /admin route", async () => {
      window.history.pushState({}, "", "/admin");

      renderWithAuth({
        id: 3,
        name: "Admin Guy",
        email: "admin@test.com",
        role: "ADMINISTRATOR",
        mustChangePassword: false,
      });

      await waitFor(() => {
        expect(screen.getByText(/Administrator User Management/i)).toBeInTheDocument();
      });
    });
  });
});
