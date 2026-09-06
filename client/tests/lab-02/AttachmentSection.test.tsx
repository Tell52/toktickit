import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

describe("Attachment Section Business Rules", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("disables upload button when maximum of 5 active attachments is reached", async () => {
        // จำลองตั๋วที่มีไฟล์แนบ Active ครบ 5 ไฟล์
        const mockTicketWithMaxAttachments = {
            id: 1,
            ticketNumber: "TKT-2026-0002",
            summary: "Test Max Attachments",
            description: "Testing 5 files limit",
            requestedPriority: "Low",
            currentStatus: "New",
            category: { name: "Software" },
            relatedSystem: { name: "Email" },
            attachments: Array.from({ length: 5 }).map((_, index) => ({
                id: index + 1,
                fileName: `file${index + 1}.png`,
                isRemoved: false,
                fileUrl: `/mock/url${index + 1}`
            })),
        };

        vi.mocked(api.getTicketDetail).mockResolvedValue(mockTicketWithMaxAttachments);
        render(<RequesterTicketDetail ticketId="1" currentRequesterId={1} />);

        await waitFor(() => {
            expect(screen.getByText("Attachments (5/5)")).toBeInTheDocument();
        });

        // ตรวจสอบว่าปุ่ม Upload โดนระงับ (Disabled)
        const uploadButton = screen.getByRole("button", { name: /Upload/i });
        expect(uploadButton).toBeDisabled();
        expect(screen.getByText(/Maximum of 5 active attachments reached/i)).toBeInTheDocument();
    });

    it("displays confirmation and reason input when soft-removing an attachment", async () => {
        const mockTicketWithOneAttachment = {
            id: 1,
            ticketNumber: "TKT-2026-0003",
            summary: "Test Soft Remove",
            description: "Testing removal flow",
            requestedPriority: "Medium",
            currentStatus: "New",
            category: { name: "Software" },
            relatedSystem: { name: "VPN" },
            attachments: [
                { id: 101, fileName: "error_log.pdf", isRemoved: false, fileUrl: "/mock/error_log.pdf" }
            ],
        };

        vi.mocked(api.getTicketDetail).mockResolvedValue(mockTicketWithOneAttachment);
        vi.mocked(api.softRemoveAttachment).mockResolvedValue({});

        render(<RequesterTicketDetail ticketId="1" currentRequesterId={1} />);

        await waitFor(() => {
            expect(screen.getByText("error_log.pdf")).toBeInTheDocument();
        });

        // 1. กดปุ่ม Remove
        const removeBtn = screen.getByRole("button", { name: /Remove/i });
        fireEvent.click(removeBtn);

        // 2. ตรวจสอบว่ามีช่องให้กรอกเหตุผลและปุ่ม Confirm โผล่ขึ้นมา (UI-03)[cite: 8]
        const reasonInput = screen.getByPlaceholderText("Reason for removal...");
        expect(reasonInput).toBeInTheDocument();

        const confirmBtn = screen.getByRole("button", { name: /Confirm/i });
        expect(confirmBtn).toBeInTheDocument();

        // 3. จำลองการพิมพ์เหตุผลและกดยืนยัน (AC-05)[cite: 8]
        fireEvent.change(reasonInput, { target: { value: "Uploaded wrong file" } });
        fireEvent.click(confirmBtn);

        // 4. ตรวจสอบว่าเรียก API softRemoveAttachment ด้วยข้อมูลที่ถูกต้อง
        await waitFor(() => {
            expect(api.softRemoveAttachment).toHaveBeenCalledWith("1", 101, "Uploaded wrong file", 1);
        });
    });

    it("does not render download links for soft-removed attachments", async () => {
        const mockTicketWithRemovedAttachment = {
            id: 1,
            ticketNumber: "TKT-2026-0004",
            summary: "Test Removed Link",
            description: "Checking metadata display",
            requestedPriority: "Low",
            currentStatus: "New",
            category: { name: "Network" },
            relatedSystem: { name: "VPN" },
            attachments: [
                {
                    id: 102,
                    fileName: "secret_data.png",
                    isRemoved: true,
                    removalReason: "Sensitive info",
                    fileUrl: "/mock/secret_data.png"
                }
            ],
        };

        vi.mocked(api.getTicketDetail).mockResolvedValue(mockTicketWithRemovedAttachment);
        render(<RequesterTicketDetail ticketId="1" currentRequesterId={1} />);

        await waitFor(() => {
            expect(screen.getByText("secret_data.png")).toBeInTheDocument();
        });

        // ตรวจสอบว่ามีป้ายบอกว่า Removed และมีเหตุผลแสดงอยู่ (Metadata)
        expect(screen.getByText("Removed")).toBeInTheDocument();
        expect(screen.getByText("Reason: Sensitive info")).toBeInTheDocument();

        // ตรวจสอบว่าไม่มีลิงก์ (แท็ก <a>) สำหรับไฟล์นี้อยู่บนหน้าจอ
        const fileLink = screen.queryByRole("link", { name: "secret_data.png" });
        expect(fileLink).not.toBeInTheDocument();
    });
});