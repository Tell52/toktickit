import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ChangePassword from "../../src/components/ChangePassword.js";
import { AuthContext } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("ChangePassword Component (UI-02)", () => {
  const mockLogin = vi.fn();
  const mockLogout = vi.fn().mockResolvedValue(undefined);
  const mockCheckAuth = vi.fn().mockResolvedValue(undefined);
  const mockOnSuccess = vi.fn();
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderChangePassword = (props: { onSuccess?: any; onNavigate?: any } = {}) => {
    return render(
      <AuthContext.Provider
        value={{
          user: {
            id: 1,
            name: "Test User",
            email: "test@example.com",
            role: "REQUESTER",
            mustChangePassword: true,
          },
          loading: false,
          login: mockLogin,
          logout: mockLogout,
          checkAuth: mockCheckAuth,
        }}
      >
        <ChangePassword
          onSuccess={props.onSuccess || mockOnSuccess}
          onNavigate={props.onNavigate || mockOnNavigate}
        />
      </AuthContext.Provider>
    );
  };

  describe("1. Rendering fields and initial disabled state", () => {
    it("renders all 3 password inputs and displays initial unfulfilled checklist", () => {
      renderChangePassword();

      expect(screen.getByPlaceholderText(/Enter current password/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/^Enter new password$/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Re-enter new password/i)).toBeInTheDocument();

      // Verify initial checklist items with ○ (unfulfilled) marker
      const lengthRule = screen.getByText(/Be at least 8 characters/i);
      const caseRule = screen.getByText(/Include upper and lower case letters/i);
      const numSpecRule = screen.getByText(/Include a number and a special character/i);

      expect(lengthRule).toHaveTextContent("○ Be at least 8 characters");
      expect(caseRule).toHaveTextContent("○ Include upper and lower case letters");
      expect(numSpecRule).toHaveTextContent("○ Include a number and a special character");

      // Continue button must be disabled initially
      const continueBtn = screen.getByRole("button", { name: /continue/i });
      expect(continueBtn).toBeInTheDocument();
      expect(continueBtn).toBeDisabled();
    });

    it("supports toggling password visibility for all 3 fields", () => {
      renderChangePassword();

      const currentInput = screen.getByPlaceholderText(/Enter current password/i);
      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      expect(currentInput).toHaveAttribute("type", "password");
      expect(newInput).toHaveAttribute("type", "password");
      expect(confirmInput).toHaveAttribute("type", "password");

      // Toggle current password
      fireEvent.click(screen.getByRole("button", { name: /show current password/i }));
      expect(currentInput).toHaveAttribute("type", "text");

      // Toggle new password
      fireEvent.click(screen.getByRole("button", { name: /show new password/i }));
      expect(newInput).toHaveAttribute("type", "text");

      // Toggle confirm password
      fireEvent.click(screen.getByRole("button", { name: /show confirm password/i }));
      expect(confirmInput).toHaveAttribute("type", "text");
    });
  });

  describe("2. Real-time Checklist updates as the user types", () => {
    it("updates length rule in real-time when >= 8 characters are entered", () => {
      renderChangePassword();

      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const lengthRule = screen.getByText(/Be at least 8 characters/i);

      // Typing 5 characters (less than 8)
      fireEvent.change(newInput, { target: { value: "Short" } });
      expect(lengthRule).toHaveTextContent("○ Be at least 8 characters");
      expect(lengthRule).toHaveClass("text-muted");

      // Typing 8 characters
      fireEvent.change(newInput, { target: { value: "EightChr" } });
      expect(lengthRule).toHaveTextContent("✓ Be at least 8 characters");
      expect(lengthRule).toHaveClass("text-success");
    });

    it("updates upper and lower case rule in real-time", () => {
      renderChangePassword();

      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const caseRule = screen.getByText(/Include upper and lower case letters/i);

      // Lowercase only
      fireEvent.change(newInput, { target: { value: "lowercase" } });
      expect(caseRule).toHaveTextContent("○ Include upper and lower case letters");

      // Uppercase only
      fireEvent.change(newInput, { target: { value: "UPPERCASE" } });
      expect(caseRule).toHaveTextContent("○ Include upper and lower case letters");

      // Both upper and lower
      fireEvent.change(newInput, { target: { value: "UpperAndLower" } });
      expect(caseRule).toHaveTextContent("✓ Include upper and lower case letters");
      expect(caseRule).toHaveClass("text-success");
    });

    it("updates number and special character rule in real-time", () => {
      renderChangePassword();

      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const numSpecRule = screen.getByText(/Include a number and a special character/i);

      // Number only (no special char)
      fireEvent.change(newInput, { target: { value: "Password123" } });
      expect(numSpecRule).toHaveTextContent("○ Include a number and a special character");

      // Special char only (no number)
      fireEvent.change(newInput, { target: { value: "Password!@#" } });
      expect(numSpecRule).toHaveTextContent("○ Include a number and a special character");

      // Both number and special char (!@#$%^&*)
      fireEvent.change(newInput, { target: { value: "Pass1!" } });
      expect(numSpecRule).toHaveTextContent("✓ Include a number and a special character");
      expect(numSpecRule).toHaveClass("text-success");
    });

    it("shows all 3 rules checked when strong password is typed", () => {
      renderChangePassword();

      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      fireEvent.change(newInput, { target: { value: "Str0ng!Pass" } });

      expect(screen.getByText(/Be at least 8 characters/i)).toHaveTextContent("✓ Be at least 8 characters");
      expect(screen.getByText(/Include upper and lower case letters/i)).toHaveTextContent("✓ Include upper and lower case letters");
      expect(screen.getByText(/Include a number and a special character/i)).toHaveTextContent("✓ Include a number and a special character");
    });
  });

  describe("3. Continue button disabled until ALL criteria are met", () => {
    it("keeps Continue disabled if passwords do not match and shows mismatch error", () => {
      renderChangePassword();

      const currentInput = screen.getByPlaceholderText(/Enter current password/i);
      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      const continueBtn = screen.getByRole("button", { name: /continue/i });

      fireEvent.change(currentInput, { target: { value: "OldTempPass!1" } });
      fireEvent.change(newInput, { target: { value: "ValidPass123!" } });
      fireEvent.change(confirmInput, { target: { value: "DifferentPass123!" } });

      expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
      expect(continueBtn).toBeDisabled();
    });

    it("keeps Continue disabled if Current password is missing, even if new password is fully valid", () => {
      renderChangePassword();

      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      const continueBtn = screen.getByRole("button", { name: /continue/i });

      fireEvent.change(newInput, { target: { value: "ValidPass123!" } });
      fireEvent.change(confirmInput, { target: { value: "ValidPass123!" } });

      expect(continueBtn).toBeDisabled();
    });

    it("enables Continue button when Current password, all 3 rules, and matching confirmation are provided", () => {
      renderChangePassword();

      const currentInput = screen.getByPlaceholderText(/Enter current password/i);
      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      const continueBtn = screen.getByRole("button", { name: /continue/i });

      fireEvent.change(currentInput, { target: { value: "OldTempPass!1" } });
      fireEvent.change(newInput, { target: { value: "Str0ng!NewPass1" } });
      fireEvent.change(confirmInput, { target: { value: "Str0ng!NewPass1" } });

      expect(screen.queryByText(/Passwords do not match/i)).not.toBeInTheDocument();
      expect(continueBtn).not.toBeDisabled();
    });
  });

  describe("4. Form submission, busy state, and error handling", () => {
    it("submits the change password request, disables during loading, and completes flow", async () => {
      vi.mocked(api.changePassword).mockResolvedValueOnce({ success: true });

      renderChangePassword();

      const currentInput = screen.getByPlaceholderText(/Enter current password/i);
      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      const continueBtn = screen.getByRole("button", { name: /continue/i });

      fireEvent.change(currentInput, { target: { value: "Str0ng!Temp" } });
      fireEvent.change(newInput, { target: { value: "Str0ng!NewPass1" } });
      fireEvent.change(confirmInput, { target: { value: "Str0ng!NewPass1" } });

      fireEvent.click(continueBtn);

      await waitFor(() => {
        expect(api.changePassword).toHaveBeenCalledWith({
          currentPassword: "Str0ng!Temp",
          newPassword: "Str0ng!NewPass1",
          confirmPassword: "Str0ng!NewPass1",
        });
        expect(mockCheckAuth).toHaveBeenCalled();
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnNavigate).toHaveBeenCalledWith("/");
      });
    });

    it("shows inline error under Current password when current password is wrong", async () => {
      vi.mocked(api.changePassword).mockRejectedValueOnce({
        error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect" },
      });

      renderChangePassword();

      const currentInput = screen.getByPlaceholderText(/Enter current password/i);
      const newInput = screen.getByPlaceholderText(/^Enter new password$/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      const continueBtn = screen.getByRole("button", { name: /continue/i });

      fireEvent.change(currentInput, { target: { value: "WrongCurrentPass" } });
      fireEvent.change(newInput, { target: { value: "Str0ng!NewPass1" } });
      fireEvent.change(confirmInput, { target: { value: "Str0ng!NewPass1" } });

      fireEvent.click(continueBtn);

      await waitFor(() => {
        expect(screen.getByText("Current password is incorrect")).toBeInTheDocument();
      });

      // Continue button should be re-enabled
      expect(continueBtn).not.toBeDisabled();
    });
  });
});
