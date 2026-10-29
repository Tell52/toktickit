import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '../../server/node_modules/@prisma/client';
import bcrypt from '../../server/node_modules/bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
const url = process.env.LAB4_UI_DATABASE_URL;
test.skip(!url, 'Requires the explicitly designated disposable UI database.');
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
let users: { id: string; email: string }[] = [], tickets: number[] = [];
const password = 'StaffDashboard!123';
test.beforeEach(async () => {
  const suffix = randomUUID(), passwordHash = await bcrypt.hash(password, 10);
  users = [0, 1, 2].map(n => ({ id: randomUUID(), email: `staffdash-${suffix}-${n}@example.com` }));
  await db!.user.createMany({ data: users.map((u, i) => ({ ...u, passwordHash, name: ['Mali Staff', 'Niran Administrator', 'Ploy Requester'][i], role: (['IT_STAFF', 'ADMINISTRATOR', 'REQUESTER'] as const)[i], mustChangePassword: false })) });
  const category = await db!.category.findFirstOrThrow(), system = await db!.relatedSystem.findFirstOrThrow(); tickets = [];
  for (let i = 0; i < 2; i++) {
    const ticket = await db!.ticket.create({ data: { ticketNumber: `SD-${suffix}-${i}`, summary: ['Router needs investigation', 'Laptop support'][i], description: 'Staff dashboard browser fixture', requesterId: users[2].id, ownerId: users[i].id, categoryId: category.id, relatedSystemId: system.id, currentStatus: 'In Progress', requestedPriority: 'High' } }); tickets.push(ticket.id);
    for (let n = 0; n < 7; n++) await db!.actionTaken.create({ data: { ticketId: ticket.id, resolutionCycle: 1, performedById: users[1].id, assigneeId: users[i].id, description: `Investigate connection ${n}`, status: 'PLANNED', actionAt: new Date(Date.now() - n * 1000) } });
  }
});
test.afterEach(async () => { if (!db) return;
  await db.actionTaken.deleteMany({ where: { ticketId: { in: tickets } } }); await db.ticket.deleteMany({ where: { id: { in: tickets } } }); await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
});
test.afterAll(async () => { await db?.$disconnect(); });
async function login(page: Page, i: number) {
  await page.goto('/login'); await page.getByPlaceholder(/name@example.com/i).fill(users[i].email); await page.getByPlaceholder(/enter password/i).fill(password); await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/); await expect(page.getByRole('link', { name: 'My open tickets 1', exact: true })).toBeVisible();
}
for (const role of [0, 1]) test(`${role ? 'Administrator' : 'Staff'} metrics, queue bounds, action pages and return refresh`, async ({ page }) => {
  await login(page, role);
  await page.getByRole('link', { name: 'My open tickets 1' }).click();
  await expect(page).toHaveURL(/statusGroup=active&owner=me/); await expect(page.getByText('Total Tickets: 1')).toBeVisible();
  await page.reload(); await expect(page.getByText('Total Tickets: 1')).toBeVisible();
  await page.goBack(); await expect(page.getByRole('link', { name: 'Actions assigned to me 7' })).toBeVisible();
  await page.getByRole('link', { name: 'Actions assigned to me 7' }).click(); await expect(page.getByRole('region', { name: 'My actions' })).toBeFocused();
  await page.getByRole('button', { name: 'Next actions' }).click(); await expect(page).toHaveURL(/actionsPage=2/); await expect(page.getByText('Page 2 · 7 actions')).toBeVisible();
  const link = page.getByRole('region', { name: 'My actions' }).getByRole('link').first(); await link.click();
  await expect(page.getByRole('heading', { name: 'Actions Taken', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Action details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Back to My Queue/ }).click(); await expect(page).toHaveURL(/dashboard\?actionsPage=2/);
  await db!.ticket.update({ where: { id: tickets[role] }, data: { ownerId: null } });
  await page.getByRole('button', { name: 'Refresh dashboard' }).click(); await expect(page.getByRole('link', { name: 'My open tickets 0' })).toBeVisible();
});
test('responsive dashboard, keyboard drill-down and safe retry', async ({ page, browserName }) => {
  await login(page, 0); mkdirSync('artifacts/lab-04/screenshots/staff-dashboard', { recursive: true });
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (browserName === 'chromium') await page.screenshot({ path: `artifacts/lab-04/screenshots/staff-dashboard/dashboard-${width}x${height}.png`, fullPage: true });
  }
  await page.addStyleTag({ content: 'html { font-size: 200%; }' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'My open tickets 1' }).focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/owner=me/);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click(); await expect(page.getByRole('link', { name: 'My open tickets 1' })).toBeVisible();
  await page.route('**/api/staff/dashboard', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'PRIVATE_DATABASE_FAILURE' } }) }));
  await page.getByRole('button', { name: 'Refresh dashboard' }).click(); await expect(page.getByRole('alert')).toContainText('Dashboard could not be refreshed'); await expect(page.getByText('PRIVATE_DATABASE_FAILURE')).toHaveCount(0);
  await page.unroute('**/api/staff/dashboard'); await page.getByRole('button', { name: 'Retry dashboard' }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
});
