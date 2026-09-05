import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import MyTickets from "../../src/MyTickets.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("App & Requester Selection (Lab 2)", () => {
    it("UI-01: Access My Tickets without active Requester renders Requester Selection screen", async () => {
        // จำลองรายชื่อ Requester ให้หน้าจอ
        vi.mocked(api.getRequesters).mockResolvedValue([
            { id: 1, name: "Jennifer Anderson", email: "jen@example.com" }
        ]);

        render(<App />);

        // ตรวจสอบว่าหน้าจอจำลองล็อกอิน (Development Requester Selection) แสดงขึ้นมา[cite: 8]
        await waitFor(() => {
            expect(screen.getByText(/Select Development Requester/i)).toBeInTheDocument();
            expect(screen.getByText(/This is for testing only/i)).toBeInTheDocument();
        });
    });
});

describe("MyTickets Component Data View", () => {
    it("renders tickets when API returns data", async () => {
        // จำลองผลลัพธ์จาก API สำหรับการดึงข้อมูลตั๋ว
        vi.mocked(api.getMyTickets).mockResolvedValue({
            data: [
                {
                    id: 1,
                    ticketNumber: "TKT-2026-0007",
                    summary: "Test Ticket Summary",
                    currentStatus: "New",
                    createdAt: new Date().toISOString(),
                    category: { name: "Hardware" }
                }
            ],
            meta: { totalPages: 1 }
        });

        // เรนเดอร์เฉพาะคอมโพเนนต์ MyTickets โดยส่ง requesterId จำลองเข้าไป
        render(<MyTickets requesterId={1} />);

        // ตรวจสอบว่ามีข้อมูลตั๋วปรากฏบนหน้าจอ
        await waitFor(() => {
            expect(screen.getAllByText("TKT-2026-0007")[0]).toBeInTheDocument();
            expect(screen.getAllByText("Test Ticket Summary")[0]).toBeInTheDocument();
        });
    });

    it("shows empty state when no tickets are found", async () => {
        // จำลองผลลัพธ์ว่างเปล่า
        vi.mocked(api.getMyTickets).mockResolvedValue({
            data: [],
            meta: { totalPages: 1 }
        });

        render(<MyTickets requesterId={1} />);

        // ตรวจสอบว่าแสดงข้อความแจ้งเตือนเมื่อไม่มีตั๋ว
        await waitFor(() => {
            expect(screen.getByText(/You haven't created any tickets yet/i)).toBeInTheDocument();
        });
    });
});