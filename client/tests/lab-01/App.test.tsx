import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

// จำลองการเรียก API สำหรับ Lab 2
vi.mock("../../src/api.js");

describe("App & Requester Selection (Lab 2)", () => {
  beforeEach(() => {
    // จำลองผลลัพธ์ของ getRequesters เพื่อไม่ให้หน้าจอค้างอยู่ที่ Loading
    vi.mocked(api.getRequesters).mockResolvedValue([
      { id: 1, name: "Jennifer Anderson", email: "jen@example.com", isActive: true }
    ] as any);
  });

  it("renders the TokTickIT heading", async () => {
    render(<App />);
    // ในหน้า Requester Selection ยังคงต้องมีคำว่า TokTickIT อยู่[cite: 8]
    await waitFor(() => {
      expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
    });
  });

  it("UI-01: Access App without active Requester renders Requester Selection screen", async () => {
    render(<App />);

    // ตรวจสอบว่าหน้าจอจำลองล็อกอิน (Development Requester Selection) แสดงขึ้นมา[cite: 8]
    await waitFor(() => {
      expect(screen.getByText(/Select Development Requester/i)).toBeInTheDocument();
      // เช็คว่ามีข้อความอธิบายตามที่ Lab 2 กำหนดว่าใช้สำหรับเทสเท่านั้น[cite: 8]
      expect(screen.getByText(/This is for testing only/i)).toBeInTheDocument();
    });
  });
});