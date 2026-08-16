import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Issue 4 — write these yourself.
  it("shows Online and the seeded categories on success", async () => {
    vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: [
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" },
        { id: 3, name: "Software" },
        { id: 4, name: "Network" },
      ],
    });

    render(<App />);

    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Online/i)).toBeInTheDocument();
      expect(screen.getByText(/Account and Access/i)).toBeInTheDocument();
      expect(screen.getByText(/Hardware/i)).toBeInTheDocument();
      expect(screen.getByText(/Software/i)).toBeInTheDocument();
      expect(screen.getByText(/Network/i)).toBeInTheDocument();
    });
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkSystem").mockRejectedValue(new Error("Unable to connect to TokTickIT API"));
    render(<App />);
    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText(/Offline/i)).toBeInTheDocument();
      expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
    });
  });
});