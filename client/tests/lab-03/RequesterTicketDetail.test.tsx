import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("RequesterTicketDetail Component (Lab 3)", () => {
  const baseTicket = {
    id: 1,
    ticketNumber: "TKT-2026-0001",
    summary: "Laptop keyboard not responding",
    description: "Several keys stopped working after software update.",
    requestedPriority: "High",
    currentStatus: "Open",
    problemAppearsResolved: false,
    indicatedAt: null,
    category: { name: "Hardware" },
    relatedSystem: { name: "Corporate Laptop" },
    attachments: [],
    comments: [
      {
        id: "c1",
        content: "We received your ticket and are looking into it.",
        authorName: "Alice Staff",
        authorRole: "IT_STAFF",
        createdAt: "2026-09-18T01:00:00.000Z",
      },
      {
        id: "c2",
        content: "Thank you, please let me know when you need the laptop.",
        authorName: "John Requester",
        authorRole: "REQUESTER",
        createdAt: "2026-09-18T02:00:00.000Z",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Problem Appears Resolved Button", () => {
    it("shows button when status is Open, In Progress, or Waiting for Requester", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue({
        ...baseTicket,
        currentStatus: "In Progress",
      });

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /problem appears resolved/i })
        ).toBeInTheDocument();
      });
    });

    it("hides button when status is Resolved, Closed, Cancelled, or New", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue({
        ...baseTicket,
        currentStatus: "Resolved",
      });

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(screen.getByText("Ticket Details: TKT-2026-0001")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: /problem appears resolved/i })
      ).not.toBeInTheDocument();
    });

    it("hides button and shows indication message if already indicated", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue({
        ...baseTicket,
        currentStatus: "Open",
        problemAppearsResolved: true,
        indicatedAt: "2026-09-18T03:00:00.000Z",
      });

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(screen.getByText(/You indicated this problem appears resolved on/i)).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: /problem appears resolved/i })
      ).not.toBeInTheDocument();
    });

    it("displays micro-dialog on click and calls indicateResolved on confirm", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue({
        ...baseTicket,
        currentStatus: "Open",
      });
      vi.mocked(api.indicateResolved).mockResolvedValue({
        ticketId: 1,
        problemAppearsResolved: true,
        indicatedAt: "2026-09-18T04:00:00.000Z",
      });

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /problem appears resolved/i })
        ).toBeInTheDocument();
      });

      // Click the button to open micro-dialog
      fireEvent.click(screen.getByRole("button", { name: /problem appears resolved/i }));

      // Micro-dialog confirmation text must appear
      expect(
        screen.getByText("This lets IT Staff know the issue seems fixed. It won't close the ticket.")
      ).toBeInTheDocument();

      // Click Confirm
      const confirmBtn = screen.getByRole("button", { name: /confirm/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.indicateResolved).toHaveBeenCalledWith("1");
        expect(screen.getByText(/You indicated this problem appears resolved on/i)).toBeInTheDocument();
      });

      // The button should now be gone
      expect(
        screen.queryByRole("button", { name: /problem appears resolved/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("2. Public Comments Section", () => {
    it("renders comments chronologically with author name, role badge, timestamp, and content", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue(baseTicket);

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(screen.getByText("Public Comments (2)")).toBeInTheDocument();
      });

      // Author names
      expect(screen.getByText("Alice Staff")).toBeInTheDocument();
      expect(screen.getByText("John Requester")).toBeInTheDocument();

      // Content
      expect(
        screen.getByText("We received your ticket and are looking into it.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Thank you, please let me know when you need the laptop.")
      ).toBeInTheDocument();

      // Role badges
      expect(screen.getByText("IT Staff")).toBeInTheDocument();
      expect(screen.getByText("Requester")).toBeInTheDocument();
    });

    it("disables Post Comment button when input is empty or whitespace-only", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue(baseTicket);

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /post comment/i })).toBeDisabled();
      });

      const textarea = screen.getByPlaceholderText(/write a public comment/i);
      fireEvent.change(textarea, { target: { value: "   " } });
      expect(screen.getByRole("button", { name: /post comment/i })).toBeDisabled();

      fireEvent.change(textarea, { target: { value: "A valid comment" } });
      expect(screen.getByRole("button", { name: /post comment/i })).not.toBeDisabled();
    });

    it("posts comment and refreshes ticket", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue(baseTicket);
      vi.mocked(api.createComment).mockResolvedValue({
        id: "c3",
        content: "New update from user",
      });

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/write a public comment/i)).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText(/write a public comment/i);
      fireEvent.change(textarea, { target: { value: "New update from user" } });

      const postBtn = screen.getByRole("button", { name: /post comment/i });
      fireEvent.click(postBtn);

      await waitFor(() => {
        expect(api.createComment).toHaveBeenCalledWith("1", "New update from user");
      });
    });
  });

  describe("3. Strict Absence of Internal Notes from DOM", () => {
    it("never renders Internal Notes tab or content in the DOM", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue(baseTicket);

      render(<RequesterTicketDetail ticketId="1" />);

      await waitFor(() => {
        expect(screen.getByText("Ticket Details: TKT-2026-0001")).toBeInTheDocument();
      });

      expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/internal notes/i)).not.toBeInTheDocument();
    });
  });

  describe("4. No requesterId in API calls", () => {
    it("calls getTicketDetail without passing requesterId", async () => {
      vi.mocked(api.getTicketDetail).mockResolvedValue(baseTicket);

      render(<RequesterTicketDetail ticketId="1" currentRequesterId={999} />);

      await waitFor(() => {
        expect(api.getTicketDetail).toHaveBeenCalledWith("1");
      });
      expect(api.getTicketDetail).not.toHaveBeenCalledWith("1", 999);
    });
  });
});
