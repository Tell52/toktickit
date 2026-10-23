import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '../../server/node_modules/@prisma/client';
import bcrypt from '../../server/node_modules/bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const url = process.env.LAB4_UI_DATABASE_URL;
test.skip(!url, 'Requires the explicitly designated disposable UI database.');
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
let users: { id: string; email: string }[] = [], ticketIds: number[] = [];
const password = 'DashboardFlow!123';
test.beforeEach(async () => {
  const suffix = randomUUID(), passwordHash = await bcrypt.hash(password, 10);
  users = [0, 1].map(n => ({ id: randomUUID(), email: `dashboard-${suffix}-${n}@example.com` }));
  await db!.user.createMany({ data: users.map((u, index) => ({ ...u, passwordHash, name: index ? 'Other Dashboard Requester' : 'Mali Dashboard Requester', role: 'REQUESTER', mustChangePassword: false })) });
  const category = await db!.category.findFirstOrThrow(), system = await db!.relatedSystem.findFirstOrThrow();
  ticketIds = [];
  for (const [index, status] of ['Waiting for Requester', 'Open', 'Resolved', 'Waiting for Requester'].entries()) {
    ticketIds.push((await db!.ticket.create({ data: { ticketNumber: `DASH-${suffix}-${index}`, summary: index === 3 ? 'PRIVATE_OTHER_REQUESTER' : ['Router response needed', 'Laptop investigation', 'Email access repaired'][index], description: 'Dashboard browser fixture', requesterId: users[index === 3 ? 1 : 0].id, categoryId: category.id, relatedSystemId: system.id, currentStatus: status, requestedPriority: 'Medium', createdAt: new Date(Date.now() - 86400000), updatedAt: new Date(Date.now() - 3600000), resolvedAt: status === 'Resolved' ? new Date(Date.now() - 3600000) : null } })).id);
  }
});
test.afterEach(async () => {
  if (!db) return;
  const ids = (await db.ticket.findMany({ where: { requesterId: { in: users.map(u => u.id) } }, select: { id: true } })).map(t => t.id);
  await db.comment.deleteMany({ where: { ticketId: { in: ids } } }); await db.ticket.deleteMany({ where: { id: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
});
test.afterAll(async () => { await db?.$disconnect(); });
async function login(page: Page) {
  await page.goto('/login'); await page.getByPlaceholder(/name@example.com/i).fill(users[0].email); await page.getByPlaceholder(/enter password/i).fill(password); await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/); await expect(page.getByRole('link', { name: 'Open tickets 2' })).toBeVisible();
}
test('Requester cards match filtered lists, preserve URLs and never reveal another owner', async ({ page }) => {
  await login(page);
  await expect(page.getByText('PRIVATE_OTHER_REQUESTER')).toHaveCount(0);
  const response = await page.request.get('http://localhost:3106/api/dashboard/requester'); expect(response.status()).toBe(200);
  const data = await response.json();
  for (const [label, key] of [['Open tickets', 'openTickets'], ['Waiting for you', 'waitingForRequester'], ['Updated in last 7 days', 'recentlyUpdated'], ['Resolved in last 7 days', 'recentlyResolved']] as const) {
    await page.getByRole('link', { name: `${label} ${data.metrics[key]}`, exact: true }).click();
    const filteredUrl = page.url();
    await expect(page.getByText(new RegExp(`^${data.metrics[key]} tickets · Page`))).toBeVisible(); await expect(page.getByText('PRIVATE_OTHER_REQUESTER')).toHaveCount(0);
    await page.reload(); await expect(page).toHaveURL(filteredUrl); await expect(page.getByText(new RegExp(`^${data.metrics[key]} tickets · Page`))).toBeVisible();
    await page.goBack(); await expect(page).toHaveURL(/\/dashboard$/); await expect(page.getByRole('link', { name: 'Open tickets 2' })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Open tickets 2', exact: true }).click(); const listUrl = page.url();
  await page.getByRole('link', { name: 'Router response needed', exact: true }).first().click(); await expect(page).toHaveURL(new RegExp(`/tickets/${ticketIds[0]}$`));
  await page.getByRole('button', { name: /Back to My Tickets/ }).click(); await expect(page).toHaveURL(listUrl);
  await page.getByRole('link', { name: 'Laptop investigation', exact: true }).first().click(); await expect(page).toHaveURL(new RegExp(`/tickets/${ticketIds[1]}$`));
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Laptop investigation');
  await page.goBack(); await page.goForward(); await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('Laptop investigation');
});
test('creation and requester activity are refreshed when returning to Dashboard', async ({ page }) => {
  await login(page); await page.getByRole('link', { name: 'Create a ticket', exact: true }).click();
  await page.getByLabel(/Summary/i).fill('Dashboard created ticket'); await page.getByLabel(/Description/i).fill('Verify dashboard refresh after creation');
  await expect(page.getByLabel(/Summary/i)).toHaveValue('Dashboard created ticket');
  await page.getByLabel(/Category/i).selectOption({ label: 'Hardware' }); await page.getByLabel(/Related System/i).selectOption({ label: 'Corporate Laptop' }); await page.getByLabel(/Requested Priority/i).selectOption({ label: 'Medium' });
  await page.getByRole('button', { name: /Submit Ticket/i }).click(); await expect(page.getByText(/Ticket submitted|Ticket created/i)).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click(); await expect(page.getByRole('link', { name: 'Open tickets 3' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recently updated' }).getByRole('link', { name: /Dashboard created ticket/ })).toBeVisible();
  await page.getByRole('region', { name: 'Waiting for you' }).getByRole('link').click();
  const comment = page.getByPlaceholder('Write a public comment for IT Staff...');
  await comment.fill('Requester public update');
  let releaseComment!: () => void;
  const commentGate = new Promise<void>(resolve => { releaseComment = resolve; });
  await page.route(`**/api/tickets/${ticketIds[0]}/comments`, async route => {
    if (route.request().method() === 'POST') await commentGate;
    await route.continue();
  });
  const saved = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/api/tickets/${ticketIds[0]}/comments`));
  try {
    await page.getByRole('button', { name: 'Post Comment', exact: true }).click();
    await expect(comment).toBeDisabled();
    await expect(comment).toHaveValue('Requester public update');
  } finally { releaseComment(); }
  expect((await saved).status()).toBe(201);
  // Text in the textarea is a draft, not evidence that the write committed.
  await expect(comment).toHaveValue('');
  await expect(page.locator('div.text-secondary').filter({ hasText: /^Requester public update$/ })).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Recently updated' }).getByRole('link').first()).toContainText('Router response needed');
  await expect(page.getByRole('link', { name: 'Waiting for you 1' })).toBeVisible();
});
test('Requester dashboard supports narrow layouts, large text, safe errors and keyboard links', async ({ page }, info) => {
  await login(page);
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (info.project.name === 'chromium') { mkdirSync('artifacts/lab-04/screenshots/requester-dashboard', { recursive: true }); await page.screenshot({ path: `artifacts/lab-04/screenshots/requester-dashboard/dashboard-${width}x${height}-chromium.png`, fullPage: true }); }
  }
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('link', { name: 'Open tickets 2' }).focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/statusGroup=active/);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.route('**/api/dashboard/requester', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'PRIVATE_SQL_DATABASE' } }) }));
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Dashboard could not be refreshed'); await expect(page.getByText('PRIVATE_SQL_DATABASE')).toHaveCount(0);
  await page.unroute('**/api/dashboard/requester'); await page.getByRole('button', { name: 'Retry dashboard', exact: true }).click(); await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByRole('link', { name: 'Open tickets 2' })).toBeVisible();
});
