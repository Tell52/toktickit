import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Login from "../../src/components/Login.js";
import { AuthContext } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("Login Component (UI-01)", () => {
  const mockLogin = vi.fn();
  const mockLogout = vi.fn().mockResolvedValue(undefined);
  const mockCheckAuth = vi.fn().mockResolvedValue(undefined);
  const mockOnSuccess = vi.fn();
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderLogin = (props: { onSuccess?: any; onNavigate?: any } = {}) => {
    return render(
      <AuthContext.Provider
        value={{
          user: null,
          loading: false,
          login: mockLogin,
          logout: mockLogout,
          checkAuth: mockCheckAuth,
        }}
      >
        <Login
          onSuccess={props.onSuccess || mockOnSuccess}
          onNavigate={props.onNavigate || mockOnNavigate}
        />
      </AuthContext.Provider>
    );
  };

  describe("1. Rendering Email and Password fields", () => {
    it("renders Email and Password inputs with labels and placeholders", () => {
      renderLogin();

      // Email field
      const emailInput = screen.getByPlaceholderText(/name@example.com/i);
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute("type", "email");
      expect(screen.getByText(/Email address/i)).toBeInTheDocument();

      // Password field
      const passwordInput = screen.getByPlaceholderText(/Enter password/i);
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute("type", "password");
      expect(screen.getByText(/^Password$/i)).toBeInTheDocument();

      // Sign In button
      const submitBtn = screen.getByRole("button", { name: /sign in/i });
      expect(submitBtn).toBeInTheDocument();
      expect(submitBtn).not.toBeDisabled();
      expect(submitBtn).toHaveTextContent("Sign in");
    });

    it("toggles password visibility when Show/Hide button is clicked", () => {
      renderLogin();

      const passwordInput = screen.getByPlaceholderText(/Enter password/i);
      const toggleBtn = screen.getByRole("button", { name: /show password/i });

      expect(passwordInput).toHaveAttribute("type", "password");

      // Click show password
      fireEvent.click(toggleBtn);
      expect(passwordInput).toHaveAttribute("type", "text");
      expect(screen.getByRole("button", { name: /hide password/i })).toBeInTheDocument();

      // Click hide password
      fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("renders forgot password link and displays notice on click", () => {
      renderLogin();

      const forgotLink = screen.getByText(/Forgot your password\?/i);
      expect(forgotLink).toBeInTheDocument();

      fireEvent.click(forgotLink);
      expect(
        screen.getByText(/Password reset via email is not available in this version/i)
      ).toBeInTheDocument();
    });
  });

  describe("2. Inline error banner on failed login (BR-07)", () => {
    it("displays error banner when login fails with generic error message", async () => {
      vi.mocked(api.login).mockRejectedValueOnce({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
      });

      renderLogin();

      fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
        target: { value: "wrong@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Enter password/i), {
        target: { value: "WrongPass123!" },
      });

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        const errorAlert = screen.getByRole("alert");
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent("Invalid email or password.");
        expect(errorAlert).toHaveClass("alert-danger");
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnNavigate).not.toHaveBeenCalled();
    });

    it("displays fallback error banner on unexpected network error", async () => {
      vi.mocked(api.login).mockRejectedValueOnce(new Error("Network Error"));

      renderLogin();

      fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Enter password/i), {
        target: { value: "password" },
      });

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Network Error");
      });
    });
  });

  describe("3. Sign In button busy state (disables during loading)", () => {
    it("disables Sign In button and displays spinner while login request is in flight", async () => {
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(api.login).mockReturnValueOnce(delayedPromise as any);

      renderLogin();

      fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Enter password/i), {
        target: { value: "Str0ng!Pass" },
      });

      const submitBtn = screen.getByRole("button", { name: /sign in/i });
      expect(submitBtn).not.toBeDisabled();

      fireEvent.click(submitBtn);

      // Verify button is disabled during loading/busy state
      await waitFor(() => {
        expect(submitBtn).toBeDisabled();
        expect(submitBtn).toHaveTextContent(/Signing in…/i);
      });

      // Complete the request
      resolvePromise!({
        user: {
          id: 1,
          name: "Active User",
          email: "user@example.com",
          role: "REQUESTER",
          mustChangePassword: false,
        },
        csrfToken: "csrf-token-123",
      });

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          expect.objectContaining({ email: "user@example.com" }),
          "csrf-token-123"
        );
        expect(mockOnNavigate).toHaveBeenCalledWith("/");
      });
    });

    it("re-enables Sign In button after failed login", async () => {
      vi.mocked(api.login).mockRejectedValueOnce({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
      });

      renderLogin();

      fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Enter password/i), {
        target: { value: "badpass" },
      });

      const submitBtn = screen.getByRole("button", { name: /sign in/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      // Button should be re-enabled and restored to "Sign in"
      expect(submitBtn).not.toBeDisabled();
      expect(submitBtn).toHaveTextContent("Sign in");
    });
  });

  describe("4. Navigation destination based on mustChangePassword", () => {
    it("navigates to /change-password when user.mustChangePassword is true", async () => {
      vi.mocked(api.login).mockResolvedValueOnce({
        user: {
          id: 2,
          name: "New User",
          email: "new@example.com",
          role: "REQUESTER",
          mustChangePassword: true,
        },
        csrfToken: "csrf-xyz",
      });

      renderLogin();

      fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
        target: { value: "new@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Enter password/i), {
        target: { value: "TemporaryPass1!" },
      });

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(mockOnNavigate).toHaveBeenCalledWith("/change-password");
      });
    });
  });
});
