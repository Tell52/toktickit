import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Requester Ticket Flow (Lab 2 E2E)', () => {

    test('Complete submission flow, view in My Tickets, and soft-remove attachment (AC-01, AC-05)', async ({ page }) => {
        // ---------------------------------------------------------
        // 1. Development Requester Selection
        // ---------------------------------------------------------
        await page.goto('/');
        await page.getByLabel(/Development Requester/i).selectOption({ label: 'Jennifer Anderson (jennifer@example.com)' });
        await page.getByRole('button', { name: /Continue/i }).click();
        await expect(page.getByText('Jennifer Anderson')).toBeVisible();

        // ---------------------------------------------------------
        // 2. Create Ticket (สร้างตั๋วเพียวๆ ไม่มีการอัปโหลดไฟล์ที่นี่)
        // ---------------------------------------------------------
        await page.getByRole('link', { name: /Create Ticket/i }).click();

        const testSummary = `E2E Test Ticket - ${Date.now()}`;
        await page.getByLabel(/Summary/i).fill(testSummary);
        await page.getByLabel(/Description/i).fill('Testing the E2E flow for Lab 2.');
        await page.getByLabel(/Category/i).selectOption({ label: 'Hardware' });
        await page.getByLabel(/Related System/i).selectOption({ label: 'Corporate Laptop' });
        await page.getByLabel(/Requested Priority/i).selectOption({ label: 'Medium' });

        // กดปุ่ม Submit Ticket
        await page.getByRole('button', { name: /Submit Ticket/i }).click();

        // (ถ้าหน้า Create คุณมี Alert โชว์ว่าสำเร็จ ค่อยใส่ expect ตรงนี้)

        // ---------------------------------------------------------
        // 3. My Tickets (ไปหาตั๋วที่เพิ่งสร้าง)
        // ---------------------------------------------------------
        await page.getByRole('link', { name: /My Tickets/i }).click();

        // ตรวจสอบว่าเจอชื่อตั๋วที่เพิ่งสร้าง
        await expect(page.getByText(testSummary).first()).toBeVisible();

        // ---------------------------------------------------------
        // 4. Ticket Detail & Upload/Soft-Remove Attachment
        // ---------------------------------------------------------
        // กดคลิกที่ชื่อตั๋วเพื่อเข้าหน้า Detail
        await page.getByText(testSummary).first().click();

        // ตรวจสอบว่าเข้ามาหน้า Detail แล้ว (เช็คจาก input Read-only)
        await expect(page.locator(`input[value="${testSummary}"]`)).toBeVisible();

        // ⬇️ ตรงนี้แหละครับที่ต้องอัปโหลดไฟล์! ⬇️
        const filePath = path.join(__dirname, 'test-file.pdf');

        // จำลองการใส่ไฟล์และกดอัปโหลด
        await page.locator('input[type="file"]').setInputFiles(filePath);
        await page.getByRole('button', { name: /Upload/i }).click();

        // ตรวจสอบว่าอัปโหลดสำเร็จ (ชื่อไฟล์โผล่ขึ้นมาบนจอ)
        await expect(page.getByText('test-file.pdf')).toBeVisible();

        // จำลองขั้นตอนการกดลบ (Soft Remove)
        await page.getByRole('button', { name: /Remove/i }).first().click();

        // ใส่เหตุผลและกดยืนยัน
        await page.getByPlaceholder(/Reason for removal.../i).fill('Uploaded by mistake in E2E');
        await page.getByRole('button', { name: /Confirm/i }).click();

        // ตรวจสอบผลการลบว่ากลายเป็นสถานะ Removed แล้ว
        await expect(page.getByText('Removed')).toBeVisible();
        await expect(page.getByText('Reason: Uploaded by mistake in E2E')).toBeVisible();

        // ตรวจสอบว่าลิงก์ดาวน์โหลดหายไปแล้ว
        const fileLink = page.getByRole('link', { name: /test-file.pdf/i });
        await expect(fileLink).toHaveCount(0);
    });
});