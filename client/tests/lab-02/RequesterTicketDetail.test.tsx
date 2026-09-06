import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("RequesterTicketDetail Component", () => {
    const mockTicket = {
        id: 1,
        ticketNumber: "TKT-2026-0001",
        summary: "Laptop battery issue",
        description: "Battery drains very fast.",
        requestedPriority: "High",
        currentStatus: "New",
        category: { name: "Hardware" },
        relatedSystem: { name: "Corporate Laptop" },
        attachments: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders ticket details correctly and fields are read-only", async () => {
        // จำลองให้ API ส่งข้อมูล mockTicket กลับมา
        vi.mocked(api.getTicketDetail).mockResolvedValue(mockTicket);

        render(<RequesterTicketDetail ticketId="1" currentRequesterId={1} />);

        // รอให้ข้อความ Loading หายไปและข้อมูลแสดงขึ้นมา
        await waitFor(() => {
            expect(screen.getByText("Ticket Details: TKT-2026-0001")).toBeInTheDocument();
        });

        // ตรวจสอบว่ามีข้อมูล Summary แสดงและเป็น Read-only
        const summaryInput = screen.getByDisplayValue("Laptop battery issue");
        expect(summaryInput).toBeInTheDocument();
        expect(summaryInput).toHaveAttribute("readonly");

        // ตรวจสอบว่ามีข้อมูล Description แสดงและเป็น Read-only
        const descInput = screen.getByDisplayValue("Battery drains very fast.");
        expect(descInput).toBeInTheDocument();
        expect(descInput).toHaveAttribute("readonly");

        // ตรวจสอบ Reference Data ว่ามาครบ
        expect(screen.getByDisplayValue("Hardware")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Corporate Laptop")).toBeInTheDocument();
    });

    it("shows error message if API fails", async () => {
        vi.mocked(api.getTicketDetail).mockRejectedValue(new Error("Unauthorized access"));

        render(<RequesterTicketDetail ticketId="1" currentRequesterId={2} />);

        await waitFor(() => {
            expect(screen.getByText(/Error: Unauthorized access/i)).toBeInTheDocument();
        });
    });
});