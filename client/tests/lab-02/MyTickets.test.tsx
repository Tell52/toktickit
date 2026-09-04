import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
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