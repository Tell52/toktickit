import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import StaffTicketDetail, { ALLOWED_STATUS_TRANSITIONS } from "../../src/components/StaffTicketDetail.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("StaffTicketDetail Component (Lab 3)", () => {
  const baseStaffTicket: api.StaffTicketDetailData = {
    id: 101,
    ticketNumber: "TKT-2026-0101",
    summary: "Slow network connection in branch office",
    description: "Users reported slow speeds after router upgrade.",
    category: "Network",
    relatedSystem: "Branch Router",
    requestedPriority: "Medium",
    itPriority: "HIGH",
    status: "New",
    currentStatus: "New",
    owner: { id: "staff-1", name: "Sarah Tech" },
    requester: { id: "req-1", name: "David Requester", email: "david@test.com" },
    problemAppearsResolved: false,
    indicatedAt: null,
    createdAt: "2026-09-18T08:00:00.000Z",
    updatedAt: "2026-09-18T08:00:00.000Z",
    attachments: [
      {
        id: 1,
        fileName: "network_log.txt",
        fileType: "text/plain",
        fileSize: 2048,
        fileUrl: "/uploads/network_log.txt",
        createdAt: "2026-09-18T08:00:00.000Z",
      },
    ],
    comments: [
      {
        id: "c-1",
        ticketId: "TKT-2026-0101",
        authorId: "req-1",
        authorName: "David Requester",
        authorRole: "REQUESTER",
        content: "Ping times are above 300ms.",
        createdAt: "2026-09-18T08:05:00.000Z",
      },
    ],
    notes: [
      {
        id: "n-1",
        authorId: "staff-1",
        authorName: "Sarah Tech",
        content: "ISP confirmed maintenance window in this region.",
        createdAt: "2026-09-18T08:15:00.000Z",
      },
    ],
  };

  const mockStaffUsers: api.StaffUserItem[] = [
    { id: "staff-1", name: "Sarah Tech", email: "sarah@test.com", role: "IT_STAFF" },
    { id: "staff-2", name: "Alex Admin", email: "alex@test.com", role: "ADMINISTRATOR" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getStaffTicketDetail).mockResolvedValue(baseStaffTicket);
    vi.mocked(api.getStaffUsers).mockResolvedValue({ users: mockStaffUsers });
  });

  // ---------------------------------------------------------------------------
  // 1. UI-08: Status Dropdown Transition Matrix (FR-20, §1.1)
  // ---------------------------------------------------------------------------
  describe("UI-08: Status Dropdown Transition Matrix (FR-20)", () => {
    it("renders ONLY legal transition targets for status 'New'", async () => {
      vi.mocked(api.getStaffTicketDetail).mockResolvedValue({
        ...baseStaffTicket,
        currentStatus: "New",
        status: "New",
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-status-select")).toBeInTheDocument();
      });

      const select = screen.getByTestId("editable-status-select") as HTMLSelectElement;
      const optionTexts = Array.from(select.options).map((o) => o.text);

      // Legal for New: Open, In Progress, Cancelled
      expect(optionTexts.some((t) => t.includes("Open"))).toBe(true);
      expect(optionTexts.some((t) => t.includes("In Progress"))).toBe(true);
      expect(optionTexts.some((t) => t.includes("Cancelled"))).toBe(true);

      // Illegal for New: Resolved, Closed, Reopened, Waiting for Requester
      expect(optionTexts.some((t) => t.includes("Resolved"))).toBe(false);
      expect(optionTexts.some((t) => t.includes("Closed"))).toBe(false);
      expect(optionTexts.some((t) => t.includes("Reopened"))).toBe(false);
      expect(optionTexts.some((t) => t.includes("Waiting for Requester"))).toBe(false);
    });

    it("renders ONLY legal transition targets for status 'In Progress'", async () => {
      vi.mocked(api.getStaffTicketDetail).mockResolvedValue({
        ...baseStaffTicket,
        currentStatus: "In Progress",
        status: "In Progress",
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-status-select")).toBeInTheDocument();
      });

      const select = screen.getByTestId("editable-status-select") as HTMLSelectElement;
      const optionTexts = Array.from(select.options).map((o) => o.text);

      // Legal for In Progress: Waiting for Requester, Resolved, Cancelled
      expect(optionTexts.some((t) => t.includes("Waiting for Requester"))).toBe(true);
      expect(optionTexts.some((t) => t.includes("Resolved"))).toBe(true);
      expect(optionTexts.some((t) => t.includes("Cancelled"))).toBe(true);

      // Illegal for In Progress: New, Open, Closed, Reopened
      expect(optionTexts.some((t) => t.includes("Open"))).toBe(false);
      expect(optionTexts.some((t) => t.includes("Closed"))).toBe(false);
    });

    it("calls updateStaffTicketStatus when status is changed", async () => {
      vi.mocked(api.updateStaffTicketStatus).mockResolvedValue({
        ticketId: "TKT-2026-0101",
        status: "In Progress",
        updatedAt: "2026-09-18T09:00:00.000Z",
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-status-select")).toBeInTheDocument();
      });

      const select = screen.getByTestId("editable-status-select");
      fireEvent.change(select, { target: { value: "In Progress" } });

      await waitFor(() => {
        expect(api.updateStaffTicketStatus).toHaveBeenCalledWith("101", "In Progress");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. UI-09: Comments vs. Notes Tabs Distinction (BR-04, STYLE-04)
  // ---------------------------------------------------------------------------
  describe("UI-09: Public Comments vs. Internal Notes Tabs Distinction (BR-04, STYLE-04)", () => {
    it("renders Public Comments tab with comments and composer", async () => {
      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("public-comments-panel")).toBeInTheDocument();
      });

      expect(screen.getByText("Ping times are above 300ms.")).toBeInTheDocument();
      expect(screen.getByTestId("public-comment-input")).toBeInTheDocument();
      expect(screen.getByTestId("post-comment-button")).toBeInTheDocument();
    });

    it("renders Internal Notes panel with distinct background, lock icon, and confidential banner", async () => {
      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("tab-internal-notes")).toBeInTheDocument();
      });

      // Switch to Internal Notes tab
      fireEvent.click(screen.getByTestId("tab-internal-notes"));

      await waitFor(() => {
        expect(screen.getByTestId("internal-notes-panel")).toBeInTheDocument();
      });

      const panel = screen.getByTestId("internal-notes-panel");
      // Distinct tint style
      expect(panel).toHaveStyle({ backgroundColor: "#FFFBEB" });

      // Persistent confidential banner and lock icon
      expect(screen.getByTestId("internal-notes-banner")).toBeInTheDocument();
      expect(screen.getByText(/Internal Notes — Confidential/i)).toBeInTheDocument();
      expect(screen.getByText("ISP confirmed maintenance window in this region.")).toBeInTheDocument();
      expect(screen.getByTestId("internal-note-input")).toBeInTheDocument();
      expect(screen.getByTestId("post-note-button")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. STYLE-03: Editable vs. Read-Only Styling
  // ---------------------------------------------------------------------------
  describe("STYLE-03: Editable vs. Read-Only Visual Distinction", () => {
    it("renders editable controls with white background and read-only fields with muted background", async () => {
      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("readonly-category")).toBeInTheDocument();
      });

      // Read-only elements
      const catField = screen.getByTestId("readonly-category");
      expect(catField).toHaveStyle({ backgroundColor: "#F0F4F1" });

      const reqField = screen.getByTestId("readonly-requester");
      expect(reqField).toHaveStyle({ backgroundColor: "#F0F4F1" });

      // Editable elements
      const ownerSelect = screen.getByTestId("editable-owner-select");
      expect(ownerSelect).toHaveStyle({ backgroundColor: "#FFFFFF" });

      const prioritySelect = screen.getByTestId("editable-priority-select");
      expect(prioritySelect).toHaveStyle({ backgroundColor: "#FFFFFF" });

      const statusSelect = screen.getByTestId("editable-status-select");
      expect(statusSelect).toHaveStyle({ backgroundColor: "#FFFFFF" });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Operational Controls: Owner & Priority Updates
  // ---------------------------------------------------------------------------
  describe("Operational Controls: Owner & Priority Updates", () => {
    it("updates ticket owner on dropdown change", async () => {
      vi.mocked(api.updateStaffTicketOwner).mockResolvedValue({
        ticketId: "TKT-2026-0101",
        owner: { id: "staff-2", name: "Alex Admin" },
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-owner-select")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("editable-owner-select"), { target: { value: "staff-2" } });

      await waitFor(() => {
        expect(api.updateStaffTicketOwner).toHaveBeenCalledWith("101", "staff-2");
      });
    });

    it("updates IT Priority on dropdown change", async () => {
      vi.mocked(api.updateStaffTicketPriority).mockResolvedValue({
        ticketId: "TKT-2026-0101",
        itPriority: "LOW",
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-priority-select")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("editable-priority-select"), { target: { value: "LOW" } });

      await waitFor(() => {
        expect(api.updateStaffTicketPriority).toHaveBeenCalledWith("101", "LOW");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Public Comment & Internal Note Posting
  // ---------------------------------------------------------------------------
  describe("Public Comment & Internal Note Posting", () => {
    it("posts a public comment when form is submitted", async () => {
      vi.mocked(api.createComment).mockResolvedValue({
        id: "c-2",
        ticketId: "101",
        content: "New public response from technician",
        authorName: "Sarah Tech",
        authorRole: "IT_STAFF",
        createdAt: "2026-09-18T08:30:00.000Z",
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("public-comment-input")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("public-comment-input"), {
        target: { value: "New public response from technician" },
      });
      fireEvent.click(screen.getByTestId("post-comment-button"));

      await waitFor(() => {
        expect(api.createComment).toHaveBeenCalledWith("101", "New public response from technician");
      });
    });

    it("posts an internal note when note form is submitted", async () => {
      vi.mocked(api.createStaffTicketNote).mockResolvedValue({
        id: "n-2",
        authorId: "staff-1",
        authorName: "Sarah Tech",
        content: "Escalated to ISP tier 3",
        createdAt: "2026-09-18T08:35:00.000Z",
      });

      render(<StaffTicketDetail ticketId="101" />);

      // Switch to notes tab
      await waitFor(() => {
        expect(screen.getByTestId("tab-internal-notes")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId("tab-internal-notes"));

      await waitFor(() => {
        expect(screen.getByTestId("internal-note-input")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("internal-note-input"), {
        target: { value: "Escalated to ISP tier 3" },
      });
      fireEvent.click(screen.getByTestId("post-note-button"));

      await waitFor(() => {
        expect(api.createStaffTicketNote).toHaveBeenCalledWith("101", "Escalated to ISP tier 3");
      });
    });

    it("disables post buttons when inputs are empty or whitespace-only", async () => {
      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("post-comment-button")).toBeInTheDocument();
      });

      // Initially empty -> button disabled
      expect(screen.getByTestId("post-comment-button")).toBeDisabled();

      // Whitespace only -> button remains disabled
      fireEvent.change(screen.getByTestId("public-comment-input"), {
        target: { value: "    " },
      });
      expect(screen.getByTestId("post-comment-button")).toBeDisabled();

      // Switch to notes tab
      fireEvent.click(screen.getByTestId("tab-internal-notes"));
      await waitFor(() => {
        expect(screen.getByTestId("post-note-button")).toBeInTheDocument();
      });

      expect(screen.getByTestId("post-note-button")).toBeDisabled();

      fireEvent.change(screen.getByTestId("internal-note-input"), {
        target: { value: "   " },
      });
      expect(screen.getByTestId("post-note-button")).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Additional Status Transition Edge Cases & Error Feedback
  // ---------------------------------------------------------------------------
  describe("Status Transition Edge Cases & Error Feedback", () => {
    it("disables status select and has zero transitions for terminal status 'Cancelled'", async () => {
      vi.mocked(api.getStaffTicketDetail).mockResolvedValue({
        ...baseStaffTicket,
        currentStatus: "Cancelled",
        status: "Cancelled",
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-status-select")).toBeInTheDocument();
      });

      const select = screen.getByTestId("editable-status-select") as HTMLSelectElement;
      expect(select).toBeDisabled();
      // Only the current status option exists
      expect(select.options.length).toBe(1);
      expect(select.options[0].text).toContain("Cancelled");
      expect(screen.getByText(/Terminal status — no further transitions/i)).toBeInTheDocument();
    });

    it("displays inline error message when status update fails (e.g. 409 conflict)", async () => {
      vi.mocked(api.updateStaffTicketStatus).mockRejectedValue({
        status: 409,
        error: { code: "CONFLICT", message: "Transition from 'New' to 'Closed' is not permitted" },
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-status-select")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("editable-status-select"), {
        target: { value: "In Progress" },
      });

      await waitFor(() => {
        expect(screen.getByTestId("status-error-message")).toBeInTheDocument();
        expect(screen.getByTestId("status-error-message")).toHaveTextContent(
          "Transition from 'New' to 'Closed' is not permitted"
        );
      });
    });

    it("unassigns ticket owner when selecting '-- Unassigned --'", async () => {
      vi.mocked(api.updateStaffTicketOwner).mockResolvedValue({
        ticketId: "TKT-2026-0101",
        owner: null,
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("editable-owner-select")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("editable-owner-select"), {
        target: { value: "unassigned" },
      });

      await waitFor(() => {
        expect(api.updateStaffTicketOwner).toHaveBeenCalledWith("101", null);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Problem Appears Resolved Indicator
  // ---------------------------------------------------------------------------
  describe("Problem Appears Resolved Indicator (FR-12)", () => {
    it("renders indicator badge when problemAppearsResolved is true", async () => {
      vi.mocked(api.getStaffTicketDetail).mockResolvedValue({
        ...baseStaffTicket,
        problemAppearsResolved: true,
        indicatedAt: "2026-09-18T10:00:00.000Z",
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("problem-resolved-indicator")).toBeInTheDocument();
        expect(screen.getByTestId("problem-resolved-indicator")).toHaveTextContent(
          "Requester indicated problem appears resolved"
        );
      });
    });

    it("does not render indicator badge when problemAppearsResolved is false", async () => {
      vi.mocked(api.getStaffTicketDetail).mockResolvedValue({
        ...baseStaffTicket,
        problemAppearsResolved: false,
        indicatedAt: null,
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("staff-ticket-detail")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("problem-resolved-indicator")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Attachments Tab
  // ---------------------------------------------------------------------------
  describe("Attachments Tab", () => {
    it("renders attachment list with file details and download links", async () => {
      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("tab-attachments")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("tab-attachments"));

      await waitFor(() => {
        expect(screen.getByTestId("attachments-panel")).toBeInTheDocument();
        expect(screen.getByText("network_log.txt")).toBeInTheDocument();
        expect(screen.getByText(/2.0 KB · text\/plain/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /download \/ view/i })).toHaveAttribute(
          "href",
          "/uploads/network_log.txt"
        );
      });
    });

    it("renders empty state message when there are no attachments", async () => {
      vi.mocked(api.getStaffTicketDetail).mockResolvedValue({
        ...baseStaffTicket,
        attachments: [],
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(screen.getByTestId("tab-attachments")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("tab-attachments"));

      await waitFor(() => {
        expect(screen.getByText(/No attachments uploaded for this ticket/i)).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Error, Forbidden, and Loading States
  // ---------------------------------------------------------------------------
  describe("Error, Forbidden, and Loading States", () => {
    it("displays forbidden error message when user lacks permission (403)", async () => {
      vi.mocked(api.getStaffTicketDetail).mockRejectedValue({
        status: 403,
        error: { code: "FORBIDDEN", message: "Forbidden" },
      });

      render(<StaffTicketDetail ticketId="101" />);

      await waitFor(() => {
        expect(
          screen.getByText(/You do not have permission to view this staff ticket/i)
        ).toBeInTheDocument();
      });
    });

    it("displays not found error message when ticket does not exist (404)", async () => {
      vi.mocked(api.getStaffTicketDetail).mockRejectedValue({
        status: 404,
        error: { code: "NOT_FOUND", message: "Not found" },
      });

      render(<StaffTicketDetail ticketId="999" />);

      await waitFor(() => {
        expect(screen.getByText(/Ticket not found/i)).toBeInTheDocument();
      });
    });
  });
});
