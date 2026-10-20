import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '../../server/node_modules/@prisma/client';
import bcrypt from '../../server/node_modules/bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

// The ordinary legacy suite does not supply this opt-in database. This file is
// executed by playwright.actions.config.ts against a separate migrated database.
const url = process.env.LAB4_UI_DATABASE_URL;
test.skip(!url, 'Requires the dedicated disposable Actions UI database.');
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
const password = 'ActionFlow!123';
let ticketId: number;
let accounts: { id: string; name: string; email: string; role: 'IT_STAFF' | 'REQUESTER' | 'ADMINISTRATOR' }[] = [];
const apiUrl = 'http://localhost:3106';
test.beforeEach(async () => {
  ticketId = 0;
  const suffix = randomUUID();
  accounts = (['IT_STAFF', 'REQUESTER', 'ADMINISTRATOR', 'REQUESTER'] as const).map((role, index) => ({ id: randomUUID(), name: ['Mali Staff', 'Niran Requester', 'Arun Administrator', 'Other Requester'][index], email: `actions-ui-${suffix}-${index}@example.com`, role }));
  const passwordHash = await bcrypt.hash(password, 10);
  await db!.user.createMany({ data: accounts.map(account => ({ ...account, passwordHash, isActive: true, mustChangePassword: false })) });
  const category = await db!.category.findFirstOrThrow();
  const relatedSystem = await db!.relatedSystem.findFirstOrThrow();
  const ticket = await db!.ticket.create({ data: { ticketNumber: `TKT-UI-${suffix}`, summary: 'Branch network connection drops', description: 'Check the router and report stability after repair.', requestedPriority: 'High', itPriority: 'High', currentStatus: 'In Progress', requesterId: accounts[1].id, ownerId: accounts[2].id, categoryId: category.id, relatedSystemId: relatedSystem.id, createdAt: new Date('2026-01-01T00:00:00Z') } });
  ticketId = ticket.id;
  await db!.note.create({ data: { ticketId, authorId: accounts[0].id, content: 'PRIVATE_INTERNAL_DIAGNOSTIC' } });
});
test.afterEach(async () => {
  if (!db || !ticketId) return;
  const ids = (await db.actionTaken.findMany({ where: { ticketId }, select: { id: true } })).map(a => a.id);
  await db.actionTakenRevision.deleteMany({ where: { actionId: { in: ids } } });
  await db.actionCreateRequest.deleteMany({ where: { ticketId } });
  await db.actionTaken.deleteMany({ where: { ticketId } });
  await db.note.deleteMany({ where: { ticketId } });
  await db.ticket.delete({ where: { id: ticketId } });
  await db.user.deleteMany({ where: { id: { in: accounts.map(a => a.id) } } });
});
test.afterAll(async () => { await db?.$disconnect(); });
async function login(page: Page, index = 0) {
  await page.goto('/login');
  await page.getByPlaceholder(/name@example.com/i).fill(accounts[index].email);
  await page.getByPlaceholder(/enter password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(index === 1 || index === 3 ? /\/tickets$/ : /\/queue$/);
  await page.goto(`/tickets/${ticketId}`);
  if (index !== 3) await expect(page.getByRole('heading', { name: 'Actions Taken', exact: true })).toBeVisible();
}
async function add(page: Page, description = 'Inspect router connection') {
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByLabel('Description *', { exact: true }).fill(description);
  await page.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
}
const view = async (page: Page) => { await page.getByRole('button', { name: /^View action:/ }).first().click(); };

test('real staff lifecycle, administrator history and Requester privacy', async ({ page, browser }, info) => {
  await login(page); await add(page); await view(page);
  await page.getByRole('button', { name: 'Start action', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible(); await view(page);
  await page.getByRole('button', { name: 'Complete action', exact: true }).click();
  await page.getByLabel('Result *', { exact: true }).fill('Connection is stable after restart');
  await page.getByLabel(/Follow-up required:/).check();
  await page.getByLabel('Follow-up note *', { exact: true }).fill('Check again tomorrow');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  const stored = await db!.actionTaken.findFirstOrThrow({ where: { ticketId } });
  expect(stored.status).toBe('COMPLETED'); expect(stored.performedById).toBe(accounts[0].id); expect(stored.assigneeId).toBe(accounts[0].id);
  const adminContext = await browser.newContext(); const admin = await adminContext.newPage(); await login(admin, 2); await view(admin);
  await admin.getByRole('button', { name: 'Edit action', exact: true }).click();
  await expect(admin.getByLabel('Assigned to *', { exact: true })).toBeDisabled();
  await admin.getByLabel(/Follow-up required:/).uncheck(); await admin.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(admin.getByText('Action saved successfully.', { exact: true })).toBeVisible(); await view(admin);
  await admin.getByRole('button', { name: 'Change history', exact: true }).click();
  await expect(admin.getByText(/Revision 4 · Arun Administrator/)).toBeVisible();
  // Assignment belongs to the action and does not change the Ticket Owner.
  await page.getByRole('button', { name: 'Refresh actions', exact: true }).click();
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByLabel('Description *', { exact: true }).fill('Duplicate inspection');
  await page.getByLabel('Assigned to *', { exact: true }).selectOption(accounts[2].id);
  await page.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View action: Duplicate inspection', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel action', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByLabel('Cancellation reason *', { exact: true })).toBeFocused();
  await page.getByLabel('Cancellation reason *', { exact: true }).fill('Duplicate work already completed');
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByLabel('Description *', { exact: true }).fill('Reassign inactive staff');
  await page.getByLabel('Assigned to *', { exact: true }).selectOption(accounts[2].id);
  await page.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  await db!.user.update({ where: { id: accounts[2].id }, data: { isActive: false } });
  await page.reload();
  await page.getByRole('button', { name: 'View action: Reassign inactive staff', exact: true }).click();
  await expect(page.getByText('Reassign this action to active staff before completion.')).toBeVisible();
  await page.getByRole('button', { name: 'Complete action', exact: true }).click();
  await page.getByLabel('Result *', { exact: true }).fill('Rechecked successfully');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByText('Choose an active IT Staff or Administrator.', { exact: true })).toBeVisible();
  await page.getByLabel('Assigned to *', { exact: true }).selectOption(accounts[0].id);
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  expect((await db!.ticket.findUniqueOrThrow({ where: { id: ticketId } })).ownerId).toBe(accounts[2].id);
  const cancelled = await db!.actionTaken.findFirstOrThrow({ where: { ticketId, description: 'Duplicate inspection' } });
  expect(cancelled.status).toBe('CANCELLED'); expect(cancelled.assigneeId).toBe(accounts[2].id); expect(cancelled.performedById).toBe(accounts[0].id);
  const requestContext = await browser.newContext(); const requester = await requestContext.newPage(); await login(requester, 1); await view(requester);
  await expect(requester.getByText('Connection is stable after restart')).toHaveCount(2);
  await expect(requester.getByText('PRIVATE_INTERNAL_DIAGNOSTIC')).toHaveCount(0);
  await expect(requester.getByRole('button', { name: /Internal Notes|Change history|Add action|Edit action/ })).toHaveCount(0);
  await expect(requester.getByText('Check again tomorrow')).toHaveCount(0);
  await requester.getByRole('button', { name: 'View action: Duplicate inspection', exact: true }).click();
  await expect(requester.getByText('Duplicate work already completed', { exact: true })).toBeVisible();
  if (info.project.name === 'chromium') {
    mkdirSync('artifacts/lab-04/screenshots/actions-taken', { recursive: true });
    await requester.setViewportSize({ width: 390, height: 844 });
    await requester.locator('#actions-taken').screenshot({ path: 'artifacts/lab-04/screenshots/actions-taken/requester-read-only-390x844-chromium.png' });
  }
  const otherContext = await browser.newContext(); const other = await otherContext.newPage(); await login(other, 3);
  await expect(other.getByText('Inspect router connection')).toHaveCount(0);
  expect((await other.request.get(`${apiUrl}/api/tickets/${ticketId}/actions`)).status()).toBe(404);
  await adminContext.close(); await requestContext.close(); await otherContext.close();
});

test('lost create response replays the committed request without duplicate work', async ({ page }) => {
  await login(page); let first = true; const submissions: { body: string | null; key: string | undefined }[] = [];
  await page.route('**/api/staff/tickets/*/actions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submissions.push({ body: route.request().postData(), key: route.request().headers()['idempotency-key'] });
    if (first) { first = false; const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByLabel('Description *', { exact: true }).fill('Replay must not duplicate');
  await page.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry identical submission', exact: true })).toBeVisible();
  await expect(page.getByLabel('Description *', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry identical submission', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(2); expect(submissions[1]).toEqual(submissions[0]);
  expect(await db!.actionTaken.count({ where: { ticketId } })).toBe(1);
  expect(await db!.actionCreateRequest.count({ where: { ticketId } })).toBe(1);
});

test('stale edit keeps draft, requires latest review and guards shell navigation', async ({ page }) => {
  await login(page); await add(page); await view(page); await page.getByRole('button', { name: 'Edit action', exact: true }).click();
  await page.getByLabel('Description *', { exact: true }).fill('My unsaved correction');
  const cookie = await page.context().cookies(apiUrl); const csrf = await page.evaluate(() => localStorage.getItem('csrfToken'));
  const stored = await db!.actionTaken.findFirstOrThrow({ where: { ticketId } }); const ticket = await db!.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const result = await page.request.patch(`${apiUrl}/api/staff/tickets/${ticketId}/actions/${stored.id}`, { headers: { 'X-CSRF-Token': csrf!, Cookie: cookie.map(c => `${c.name}=${c.value}`).join('; ') }, data: { expectedTicketVersion: ticket.version, expectedVersion: stored.version, description: 'Saved by another window' } });
  expect(result.status()).toBe(200);
  await page.getByRole('button', { name: 'Save action', exact: true }).click(); await expect(page.getByRole('button', { name: 'Load latest', exact: true })).toBeVisible();
  await expect(page.getByLabel('Description *', { exact: true })).toHaveValue('My unsaved correction');
  await page.getByRole('button', { name: 'Load latest', exact: true }).click(); await expect(page.getByText('Latest saved values — your draft is retained below')).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('link', { name: 'My Queue', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/tickets/${ticketId}$`));
  await page.getByRole('button', { name: 'Save action', exact: true }).click(); await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  expect((await db!.actionTaken.findUniqueOrThrow({ where: { id: stored.id } })).description).toBe('My unsaved correction');
});

test('responsive long-text cards, keyboard focus and visual evidence', async ({ page }, info) => {
  await login(page); await add(page, 'Verify long network diagnostics and document branch stability. '.repeat(4));
  const directory = 'artifacts/lab-04/screenshots/actions-taken'; mkdirSync(directory, { recursive: true });
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height });
    const section = page.locator('#actions-taken'); await section.scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.right > window.innerWidth + 1; }).map(el => `${el.tagName}.${el.className}: ${Math.round(el.getBoundingClientRect().right)}`).slice(0, 15));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px: ${overflow.join(', ')}`).toBe(true);
    const cells = section.locator('tbody td').first(); expect(await cells.evaluate(el => getComputedStyle(el).display)).toBe(width >= 1024 ? 'table-cell' : 'grid');
    for (const button of await section.getByRole('button').all()) { const box = await button.boundingBox(); if (box) expect(box.height).toBeGreaterThanOrEqual(44); }
    if (info.project.name === 'chromium') await section.screenshot({ path: `${directory}/staff-list-${width}x${height}-chromium.png` });
  }
  // 200% browser enlargement has half the CSS viewport width; verify reflow at
  // 640px for a 1280px physical window, plus a real enlarged text-size check.
  await page.setViewportSize({ width: 640, height: 900 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; }); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await expect(page.getByLabel('Action time (Asia/Bangkok) *', { exact: true })).toBeFocused();
  await page.getByLabel(/Follow-up required:/).check(); await page.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(page.getByLabel('Description *', { exact: true })).toBeFocused();
  if (info.project.name === 'chromium') await page.locator('.action-form').screenshot({ path: `${directory}/staff-validation-390x844-chromium.png` });
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Description *', { exact: true }).press('Escape');
  await expect(page.getByRole('button', { name: 'Add action', exact: true })).toBeFocused();
});
