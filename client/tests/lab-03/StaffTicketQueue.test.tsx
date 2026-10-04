import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import StaffTicketQueue from "../../src/components/StaffTicketQueue.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("StaffTicketQueue Component (Lab 3)", () => {
  const mockTickets: api.StaffTicket[] = [
    {
      id: 1,
      ticketNumber: "TKT-2026-0001",
      createdAt: "2026-01-01T10:00:00.000Z",
      summary: "Monitor flickering when using HDMI",
      category: "Hardware",
      requestedPriority: "Low",
      itPriority: "LOW",
      status: "New",
      owner: null, // Unassigned
    },
    {
      id: 2,
      ticketNumber: "TKT-2026-0002",
      createdAt: "2026-01-02T11:00:00.000Z",
      summary: "Keyboard spacebar broken",
      category: "Hardware",
      requestedPriority: "Medium",
      itPriority: "MEDIUM",
      status: "In Progress",
      owner: { id: "usr_staff_01", name: "Michael Brown" },
    },
    {
      id: 3,
      ticketNumber: "TKT-2026-0003",
      createdAt: "2026-01-03T12:00:00.000Z",
      summary: "VPN access disconnected",
      category: "Network",
      requestedPriority: "High",
      itPriority: "HIGH",
      status: "Resolved",
      owner: { id: "usr_staff_02", name: "Sarah Connor" },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCategories).mockResolvedValue([
      { id: 1, name: "Hardware" },
      { id: 2, name: "Network" },
    ]);
    vi.mocked(api.getStaffTickets).mockResolvedValue({
      tickets: mockTickets,
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 3,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // UI-03: Table columns, Debounced search, Column header sorting
  // ---------------------------------------------------------------------------
  describe("UI-03: Table Columns, Search Debounce, and Sorting (FR-13–17)", () => {
    it("renders all 8 required table columns per specification", async () => {
      render(<StaffTicketQueue />);

      await waitFor(() => {
        expect(screen.getByTestId("staff-ticket-table")).toBeInTheDocument();
      });

      const table = screen.getByTestId("staff-ticket-table");

      // Desktop table header columns
      expect(within(table).getByText(/Ticket No\./i)).toBeInTheDocument();
      expect(within(table).getByText(/Created Date/i)).toBeInTheDocument();
      expect(within(table).getByText(/^Summary$/i)).toBeInTheDocument();
      expect(within(table).getByText(/^Category$/i)).toBeInTheDocument();
      expect(within(table).getByText(/Req\. Priority/i)).toBeInTheDocument();
      expect(within(table).getByText(/IT Priority/i)).toBeInTheDocument();
      expect(within(table).getByText(/^Status$/i)).toBeInTheDocument();
      expect(within(table).getByText(/^Owner$/i)).toBeInTheDocument();

      // Check rendered rows inside table
      expect(within(table).getByText("TKT-2026-0001")).toBeInTheDocument();
      expect(within(table).getByText("Monitor flickering when using HDMI")).toBeInTheDocument();
      expect(within(table).getByText("TKT-2026-0002")).toBeInTheDocument();
      expect(within(table).getByText("TKT-2026-0003")).toBeInTheDocument();
    });

    it("search input debounces before triggering API request (~300ms)", async () => {
      render(<StaffTicketQueue />);

      // Initial call
      expect(api.getStaffTickets).toHaveBeenCalledTimes(1);

      const searchInput = screen.getByPlaceholderText(/search by ticket number or summary/i);

      // User types "keyboard"
      fireEvent.change(searchInput, { target: { value: "keyboard" } });

      // Before debounce delay, should not have fired 2nd call immediately
      expect(api.getStaffTickets).toHaveBeenCalledTimes(1);

      // Wait for debounce (~300ms) to trigger next API call
      await waitFor(
        () => {
          expect(api.getStaffTickets).toHaveBeenCalledTimes(2);
          expect(api.getStaffTickets).toHaveBeenLastCalledWith(
            expect.objectContaining({ search: "keyboard" })
          );
        },
        { timeout: 1000 }
      );
    });

    it("clicking sortable column headers toggles sort order and indicator", async () => {
      render(<StaffTicketQueue />);

      await waitFor(() => {
        expect(screen.getByTestId("staff-ticket-table")).toBeInTheDocument();
      });

      // Default sort is createdAt desc (indicator shows ▼)
      const createdDateHeader = screen.getByLabelText(/sort by created date/i);
      expect(screen.getByTestId("sort-indicator-createdAt")).toHaveTextContent("▼");

      // Click Created Date header -> toggles to asc (▲)
      fireEvent.click(createdDateHeader);

      await waitFor(() => {
        expect(screen.getByTestId("sort-indicator-createdAt")).toHaveTextContent("▲");
        expect(api.getStaffTickets).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: "createdAt" })
        );
      });

      // Click Ticket No. header -> switches active sort to ticketNumber
      const ticketNoHeader = screen.getByLabelText(/sort by ticket number/i);
      fireEvent.click(ticketNoHeader);

      await waitFor(() => {
        expect(screen.getByTestId("sort-indicator-ticketNumber")).toBeInTheDocument();
        expect(api.getStaffTickets).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: "ticketNumber" })
        );
      });

      // Click Status header -> switches to status
      const statusHeader = screen.getByLabelText(/sort by status/i);
      fireEvent.click(statusHeader);

      await waitFor(() => {
        expect(screen.getByTestId("sort-indicator-status")).toBeInTheDocument();
        expect(api.getStaffTickets).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: "status" })
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // UI-04: Owner filter ("unassigned" and "me")
  // ---------------------------------------------------------------------------
  describe("UI-04: Owner Filter (AC-06, FR-18)", () => {
    it('selecting "Unassigned" filter queries with owner=unassigned and displays unassigned tickets', async () => {
      vi.mocked(api.getStaffTickets).mockResolvedValueOnce({
        tickets: [mockTickets[0]], // Only unassigned ticket
        pagination: { page: 1, pageSize: 10, totalCount: 1 },
      });

      render(<StaffTicketQueue />);

      const ownerSelect = screen.getByLabelText(/owner filter/i);
      fireEvent.change(ownerSelect, { target: { value: "unassigned" } });

      await waitFor(() => {
        expect(api.getStaffTickets).toHaveBeenLastCalledWith(
          expect.objectContaining({ owner: "unassigned" })
        );
      });

      const table = screen.getByTestId("staff-ticket-table");
      expect(within(table).getByText("TKT-2026-0001")).toBeInTheDocument();
      expect(within(table).getByText("Unassigned")).toBeInTheDocument();
    });

    it('selecting "Me" filter queries with owner=me and displays caller tickets with owner avatar', async () => {
      vi.mocked(api.getStaffTickets).mockResolvedValueOnce({
        tickets: [mockTickets[1]], // Assigned to Michael Brown
        pagination: { page: 1, pageSize: 10, totalCount: 1 },
      });

      render(<StaffTicketQueue />);

      const ownerSelect = screen.getByLabelText(/owner filter/i);
      fireEvent.change(ownerSelect, { target: { value: "me" } });

      await waitFor(() => {
        expect(api.getStaffTickets).toHaveBeenLastCalledWith(
          expect.objectContaining({ owner: "me" })
        );
      });

      const table = screen.getByTestId("staff-ticket-table");
      expect(within(table).getByText("TKT-2026-0002")).toBeInTheDocument();
      expect(within(table).getByText("Michael Brown")).toBeInTheDocument();
      expect(within(table).getByText("MB")).toBeInTheDocument(); // Initials
    });
  });

  // ---------------------------------------------------------------------------
  // UI-05: Pagination
  // ---------------------------------------------------------------------------
  describe("UI-05: Pagination (AC-13)", () => {
    it('"Showing X to Y of Z tickets" matches returned data and boundary buttons disable properly', async () => {
      vi.mocked(api.getStaffTickets).mockResolvedValueOnce({
        tickets: mockTickets,
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 25,
        },
      });

      render(<StaffTicketQueue />);

      await waitFor(() => {
        expect(screen.getByTestId("pagination-label")).toHaveTextContent(
          "Showing 1 to 10 of 25 tickets"
        );
      });

      const prevBtn = screen.getByRole("button", { name: /previous page/i });
      const nextBtn = screen.getByRole("button", { name: /next page/i });

      // Page 1: Previous should be disabled, Next enabled
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();

      // Click Next -> should request page 2
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(api.getStaffTickets).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 2 })
        );
      });
    });

    it("disables Next button when at the last page", async () => {
      vi.mocked(api.getStaffTickets).mockResolvedValue({
        tickets: [mockTickets[0]],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 20,
        },
      });

      render(<StaffTicketQueue />);

      // Wait for table & pagination controls to finish loading
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /next page/i })).toBeInTheDocument();
      });

      // Initially at Page 1 of 2 -> Next is enabled
      const nextBtn = screen.getByRole("button", { name: /next page/i });
      expect(nextBtn).not.toBeDisabled();

      // Click Next to navigate to Page 2
      fireEvent.click(nextBtn);

      // Now at Page 2 of 2 (last page) -> Next button must be disabled
      await waitFor(() => {
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Row interaction, Empty/No Results States, and Error handling
  // ---------------------------------------------------------------------------
  describe("Row Interaction, States, and Error Handling", () => {
    it("clicking a ticket row invokes onViewTicket callback with ticket id", async () => {
      const mockOnViewTicket = vi.fn();
      render(<StaffTicketQueue onViewTicket={mockOnViewTicket} />);

      await waitFor(() => {
        expect(screen.getByTestId("ticket-row-TKT-2026-0001")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("ticket-row-TKT-2026-0001"));
      expect(mockOnViewTicket).toHaveBeenCalledWith("1");
    });

    it("displays empty state illustration when system has no tickets", async () => {
      vi.mocked(api.getStaffTickets).mockResolvedValueOnce({
        tickets: [],
        pagination: { page: 1, pageSize: 10, totalCount: 0 },
      });

      render(<StaffTicketQueue />);

      await waitFor(() => {
        expect(screen.getByText(/no tickets yet/i)).toBeInTheDocument();
      });
    });

    it('displays "No tickets match your search/filters" and Clear Filters button when filter has no matches', async () => {
      vi.mocked(api.getStaffTickets).mockResolvedValue({
        tickets: [],
        pagination: { page: 1, pageSize: 10, totalCount: 0 },
      });

      render(<StaffTicketQueue />);

      const statusSelect = screen.getByLabelText(/status filter/i);
      fireEvent.change(statusSelect, { target: { value: "Cancelled" } });

      await waitFor(() => {
        expect(screen.getByText(/no tickets match your search\/filters/i)).toBeInTheDocument();
        const clearBtns = screen.getAllByRole("button", { name: /clear filters/i });
        expect(clearBtns.length).toBeGreaterThanOrEqual(1);
      });

      // Clicking Clear Filters resets selection
      const clearBtn = screen.getAllByRole("button", { name: /clear filters/i })[0];
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(statusSelect).toHaveValue("");
      });
    });

    it("displays error banner with Retry button on API failure", async () => {
      vi.mocked(api.getStaffTickets).mockRejectedValueOnce(new Error("Network Failure"));

      render(<StaffTicketQueue />);

      await waitFor(() => {
        expect(screen.getByText(/unable to load ticket queue/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
      });

      // Clicking Retry calls API again
      vi.mocked(api.getStaffTickets).mockResolvedValueOnce({
        tickets: mockTickets,
        pagination: { page: 1, pageSize: 10, totalCount: 3 },
      });

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      await waitFor(() => {
        expect(screen.getByTestId("ticket-row-TKT-2026-0001")).toBeInTheDocument();
      });
    });
  });
});
