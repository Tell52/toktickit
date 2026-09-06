import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateTicket from "../../src/components/CreateTicket.js";
import * as api from "../../src/api.js";

// จำลองการทำงานของ API ทั้งหมด
vi.mock("../../src/api.js");

describe("CreateTicket Component", () => {
    beforeEach(() => {
        // ป้องกัน error .map() โดยการส่ง Array จำลองกลับไปให้ useEffect
        vi.mocked(api.getCategories).mockResolvedValue([{ id: 1, name: "Hardware" }]);
        vi.mocked(api.getRelatedSystems).mockResolvedValue([{ id: 1, name: "Corporate Laptop" }]);
        vi.mocked(api.createTicket).mockReset();
    });

    it("UI-02: Submit without Summary shows field message and API is not called", async () => {
        // โค้ดของคุณใช้ props ชื่อ requesterId 
        render(<CreateTicket requesterId={1} />);

        // รอให้ Dropdown โหลดข้อมูลจำลองเสร็จก่อน
        await waitFor(() => expect(screen.getByText("Hardware")).toBeInTheDocument());

        // ปุ่มของคุณใช้คำว่า "Submit Ticket"
        const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
        fireEvent.click(submitButton);

        // ตรวจสอบข้อความ Error ที่อยู่ใต้ฟิลด์[cite: 8]
        await waitFor(() => {
            expect(screen.getByText(/Summary is required/i)).toBeInTheDocument();
        });

        // ยืนยันว่า API ไม่ถูกเรียกเพราะติด Validation
        expect(api.createTicket).not.toHaveBeenCalled();
    });

    it("AC-01: Displays the official Ticket Number and shows busy state upon valid submission", async () => {
        // จำลองผลลัพธ์เมื่อสร้าง Ticket สำเร็จ
        vi.mocked(api.createTicket).mockResolvedValue({
            id: 1,
            ticketNumber: "TKT-2026-0001",
            currentStatus: "New"
        } as any);

        render(<CreateTicket requesterId={1} />);

        await waitFor(() => expect(screen.getByText("Hardware")).toBeInTheDocument());

        // กรอกข้อมูลให้ครบทุกช่องเพื่อผ่าน Validation ของคุณ
        await userEvent.type(screen.getByLabelText(/Summary/i), "Network issue");
        await userEvent.type(screen.getByLabelText(/Description/i), "Cannot connect to campus Wi-Fi.");

        // เลือกตัวเลือกจาก Dropdown (value เป็น "1" และ "High")
        await userEvent.selectOptions(screen.getByLabelText(/Category/i), "1");
        await userEvent.selectOptions(screen.getByLabelText(/Related System/i), "1");
        await userEvent.selectOptions(screen.getByLabelText(/Requested Priority/i), "High");

        const submitButton = screen.getByRole("button", { name: /Submit Ticket/i });
        fireEvent.click(submitButton);

        // ตรวจสอบว่าปุ่มเข้าสู่สถานะ Busy (Disabled และเปลี่ยนข้อความเป็น Submitting...)[cite: 8]
        expect(submitButton).toBeDisabled();
        expect(submitButton).toHaveTextContent(/Submitting/i);

        // ตรวจสอบหน้าจอ Success State ว่าแสดง Ticket Number ถูกต้อง[cite: 8]
        await waitFor(() => {
            expect(screen.getByText(/TKT-2026-0001/i)).toBeInTheDocument();
            expect(screen.getByText(/Ticket Created Successfully!/i)).toBeInTheDocument();
        });
    });
});