import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '../../server/node_modules/@prisma/client';
import bcrypt from '../../server/node_modules/bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const url = process.env.LAB4_UI_DATABASE_URL;
test.skip(!url, 'Requires the dedicated disposable Lab 4 UI database.');
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
const password = 'WorkflowFlow!123';
let ticketId = 0;
let accounts: { id: string; name: string; email: string; role: 'IT_STAFF' | 'REQUESTER' }[] = [];
test.beforeEach(async () => {
  ticketId = 0;
  const suffix = randomUUID(), passwordHash = await bcrypt.hash(password, 10);
  accounts = (['IT_STAFF', 'REQUESTER'] as const).map((role, index) => ({ id: randomUUID(), name: ['Mali Workflow Staff', 'Niran Workflow Requester'][index], email: `workflow-ui-${suffix}-${index}@example.com`, role }));
  await db!.user.createMany({ data: accounts.map(account => ({ ...account, passwordHash, isActive: true, mustChangePassword: false })) });
});
test.afterEach(async () => {
  if (!db) return;
  // Each test owns its users/Tickets; leave seed and other test records alone.
  const tickets = (await db.ticket.findMany({ where: { requesterId: accounts[1].id }, select: { id: true } })).map(t => t.id);
  const ids = (await db.actionTaken.findMany({ where: { ticketId: { in: tickets } }, select: { id: true } })).map(a => a.id);
  await db.actionTakenRevision.deleteMany({ where: { actionId: { in: ids } } });
  await db.actionCreateRequest.deleteMany({ where: { ticketId: { in: tickets } } });
  await db.actionTaken.deleteMany({ where: { ticketId: { in: tickets } } });
  await db.ticketStatusEvent.deleteMany({ where: { ticketId: { in: tickets } } });
  await db.comment.deleteMany({ where: { ticketId: { in: tickets } } });
  await db.note.deleteMany({ where: { ticketId: { in: tickets } } });
  await db.attachment.deleteMany({ where: { ticketId: { in: tickets } } });
  await db.ticket.deleteMany({ where: { id: { in: tickets } } });
  await db.user.deleteMany({ where: { id: { in: accounts.map(account => account.id) } } });
});
test.afterAll(async () => { await db?.$disconnect(); });

async function createFixture(status = 'In Progress') {
  const category = await db!.category.findFirstOrThrow(), relatedSystem = await db!.relatedSystem.findFirstOrThrow();
  ticketId = (await db!.ticket.create({ data: { ticketNumber: `TKT-WF-${randomUUID()}`, summary: 'Network workflow verification', description: 'Inspect branch router and confirm stable connectivity', requestedPriority: 'High', itPriority: 'High', currentStatus: status, requesterId: accounts[1].id, ownerId: accounts[0].id, categoryId: category.id, relatedSystemId: relatedSystem.id, createdAt: new Date('2026-01-01T00:00:00Z') } })).id;
  await db!.note.create({ data: { ticketId, authorId: accounts[0].id, content: 'PRIVATE_WORKFLOW_SENTINEL' } });
}
async function login(page: Page, index = 0, open = true) {
  await page.goto('/login');
  await page.getByPlaceholder(/name@example.com/i).fill(accounts[index].email);
  await page.getByPlaceholder(/enter password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(index === 1 ? /\/tickets$/ : /\/queue$/);
  if (open) { await page.goto(`/tickets/${ticketId}`); await expect(page.getByRole('heading', { name: 'Actions Taken', exact: true })).toBeVisible(); }
}
async function transition(page: Page, target: string) {
  await page.getByLabel('Current Status', { exact: true }).selectOption(target);
  await expect(page.getByText(`Status changed to ${target}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current Status', { exact: true })).toHaveValue(target);
}
async function add(page: Page, description: string) {
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByLabel('Description *', { exact: true }).fill(description);
  await page.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `View action: ${description}`, exact: true }).click();
}
async function complete(page: Page, description: string) {
  await add(page, description);
  await page.getByRole('button', { name: 'Complete action', exact: true }).click();
  await page.getByLabel('Result *', { exact: true }).fill('Verified stable connection');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  await expect(page.getByText('Resolution requirements met.', { exact: true })).toBeVisible();
}
const resolveOption = (page: Page) => page.getByLabel('Current Status', { exact: true }).locator('option[value="Resolved"]');

test('E2E-02: create, advisory, gated resolve, close, reopen and resolve with new work', async ({ page, browser }) => {
  const requesterContext = await browser.newContext(), requester = await requesterContext.newPage();
  await login(requester, 1, false);
  await requester.getByRole('link', { name: /Create Ticket/i }).click();
  const summary = `Workflow router repair ${randomUUID()}`;
  await requester.getByLabel(/Summary/i).fill(summary);
  await requester.getByLabel(/Description/i).fill('Confirm branch connectivity after router repair');
  await requester.getByLabel(/Category/i).selectOption({ label: 'Hardware' });
  await requester.getByLabel(/Related System/i).selectOption({ label: 'Corporate Laptop' });
  await requester.getByLabel(/Requested Priority/i).selectOption({ label: 'Medium' });
  await requester.getByRole('button', { name: /Submit Ticket/i }).click();
  await requester.getByRole('link', { name: /My Tickets/i }).click();
  await requester.getByText(summary, { exact: true }).first().click();
  await expect(requester).toHaveURL(/\/tickets\/\d+$/);
  ticketId = Number(new URL(requester.url()).pathname.split('/').pop());
  await login(page); await transition(page, 'In Progress');
  await requester.reload();
  await requester.getByRole('button', { name: /Problem Appears Resolved/i }).click();
  await requester.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(requester.getByText(/You indicated this problem appears resolved on/)).toBeVisible();
  await page.getByRole('button', { name: 'Refresh ticket', exact: true }).click();
  await expect(page.getByTestId('problem-resolved-indicator')).toBeVisible();
  await expect(resolveOption(page)).toBeDisabled();
  await expect(page.getByText('Complete at least one action in this resolution cycle.', { exact: true })).toBeVisible();
  expect((await db!.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe('In Progress');
  await complete(page, 'Repair router'); await transition(page, 'Resolved');
  await expect(page.getByRole('region', { name: 'Ticket status history' }).getByText('In Progress → Resolved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add action', exact: true })).toHaveCount(0);
  await transition(page, 'Closed');
  await page.getByLabel('Current Status', { exact: true }).selectOption('Reopened');
  await expect(page.getByRole('dialog', { name: 'Reopen ticket' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm ticket reopening', exact: true }).click();
  await expect(page.getByText('Status changed to Reopened', { exact: true })).toBeVisible();
  await expect(page.getByTestId('problem-resolved-indicator')).toHaveCount(0);
  await expect(page.getByText('Resolution cycle 2', { exact: true })).toBeVisible();
  const reopened = await db!.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  expect(reopened.resolvedAt).toBeNull(); expect(reopened.problemAppearsResolved).toBe(false);
  await transition(page, 'In Progress'); await expect(resolveOption(page)).toBeDisabled();
  await page.getByRole('button', { name: 'View action: Repair router', exact: true }).click();
  await expect(page.locator('.action-detail').getByText('Previous resolution cycle — read-only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit action', exact: true })).toHaveCount(0);
  await complete(page, 'Repair replacement router'); await transition(page, 'Resolved');
  const final = await db!.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  expect(final.resolutionCycle).toBe(2); expect(final.resolvedAt).not.toBeNull();
  await requester.reload(); await expect(requester.locator('.badge', { hasText: /^Resolved$/ }).first()).toBeVisible();
  await expect(requester.getByRole('region', { name: 'Ticket status history' }).getByText('Closed → Reopened')).toBeVisible();
  await expect(requester.getByRole('button', { name: /Problem Appears Resolved/ })).toHaveCount(0);
  await expect(requester.getByTestId('operational-controls')).toHaveCount(0);
  await page.getByRole('link', { name: /My Queue/ }).click();
  await page.getByPlaceholder('Search by ticket number or summary…').fill(summary);
  await expect(page.getByRole('row').filter({ hasText: summary }).getByText('Resolved', { exact: true })).toBeVisible();
  await requester.getByRole('link', { name: /My Tickets/ }).click();
  await expect(requester.getByRole('row').filter({ hasText: summary }).getByText('Resolved', { exact: true })).toBeVisible();
  await requesterContext.close();
});

test('E2E-03: cancellation keeps completed evidence and shares reason/history safely', async ({ page, browser }) => {
  await createFixture(); await login(page);
  await complete(page, 'Completed inspection');
  await add(page, 'Planned replacement');
  await add(page, 'Ongoing monitoring'); await page.getByRole('button', { name: 'Start action', exact: true }).click();
  await expect(page.getByText('Action saved successfully.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View action: Ongoing monitoring', exact: true }).click();
  await page.getByLabel('Current Status', { exact: true }).selectOption('Cancelled');
  await page.getByRole('button', { name: 'Confirm ticket cancellation' }).click();
  await expect(page.getByLabel('Ticket cancellation reason *', { exact: true })).toBeFocused();
  await page.getByLabel('Ticket cancellation reason *', { exact: true }).fill('Site retired; no further work required');
  await page.getByRole('button', { name: 'Confirm ticket cancellation' }).click();
  await expect(page.getByLabel('Current Status', { exact: true })).toHaveValue('Cancelled');
  await expect(page.getByLabel('Current Status', { exact: true })).toBeDisabled();
  await expect(page.locator('.action-detail').getByText('Cancelled', { exact: true })).toBeVisible();
  const stored = await db!.actionTaken.findMany({ where: { ticketId }, orderBy: { description: 'asc' } });
  expect(stored.map(action => action.status)).toEqual(['COMPLETED', 'CANCELLED', 'CANCELLED']);
  const requesterContext = await browser.newContext(), requester = await requesterContext.newPage(); await login(requester, 1);
  await expect(requester.getByRole('region', { name: 'Ticket status history' }).getByText('Reason: Site retired; no further work required', { exact: true })).toBeVisible();
  await expect(requester.getByText('PRIVATE_WORKFLOW_SENTINEL')).toHaveCount(0);
  await expect(requester.getByRole('button', { name: /Add action|Edit action|Internal Notes|Change history/ })).toHaveCount(0);
  await requester.getByRole('button', { name: 'View action: Completed inspection', exact: true }).click();
  await expect(requester.getByText('Verified stable connection', { exact: true }).last()).toBeVisible();
  await requesterContext.close();
});

test('stale cancellation retains input, loads latest and retries the reviewed version', async ({ page, browser }) => {
  await createFixture(); await login(page);
  await page.getByLabel('Current Status', { exact: true }).selectOption('Cancelled');
  await page.getByLabel('Ticket cancellation reason *', { exact: true }).fill('Duplicate report already handled');
  const otherContext = await browser.newContext(), other = await otherContext.newPage(); await login(other);
  await other.getByLabel('IT Priority', { exact: true }).selectOption('LOW');
  await expect(other.getByText('IT Priority updated successfully', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm ticket cancellation' }).click();
  await expect(page.getByText(/This ticket changed while you were working/)).toBeVisible();
  await expect(page.getByLabel('Ticket cancellation reason *', { exact: true })).toHaveValue('Duplicate report already handled');
  await page.getByRole('button', { name: 'Load latest ticket', exact: true }).click();
  await expect(page.getByText('Latest saved ticket — your input is retained', { exact: true })).toBeVisible();
  await expect(page.getByText(/IT Priority: LOW/)).toBeVisible();
  expect((await db!.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe('In Progress');
  await page.getByRole('button', { name: 'Confirm ticket cancellation' }).click();
  await expect(page.getByText('Status changed to Cancelled', { exact: true })).toBeVisible();
  expect(await db!.ticketStatusEvent.count({ where: { ticketId } })).toBe(1);
  await otherContext.close();
});

test('workflow confirmation supports responsive layout, large text, keyboard focus and discard', async ({ page }, info) => {
  await createFixture(); await login(page);
  await page.getByLabel('Current Status', { exact: true }).focus();
  await page.getByLabel('Current Status', { exact: true }).selectOption('Cancelled');
  const reason = page.getByLabel('Ticket cancellation reason *', { exact: true }); await expect(reason).toBeFocused();
  await page.getByRole('button', { name: 'Confirm ticket cancellation' }).focus(); await page.keyboard.press('Tab'); await expect(reason).toBeFocused();
  await reason.fill('Retain this draft');
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(reason).toHaveValue('Retain this draft');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const controls = page.getByRole('dialog').locator('button,textarea');
    for (const control of await controls.all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === 'chromium') {
      mkdirSync('artifacts/lab-04/screenshots/ticket-workflow', { recursive: true });
      await page.getByTestId('operational-controls').screenshot({ path: `artifacts/lab-04/screenshots/ticket-workflow/cancellation-${width}x${height}-chromium.png` });
    }
  }
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  // A wider font reproduces the Linux runner's tab overflow on other platforms too.
  await page.addStyleTag({ content: '.staff-ticket-detail .nav-tabs { font-family: monospace; }' });
  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent?.slice(0, 55) })).slice(-12));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(overflow)).toBe(true);
  await reason.focus(); page.once('dialog', dialog => dialog.dismiss()); await page.keyboard.press('Escape'); await expect(reason).toHaveValue('Retain this draft');
  page.once('dialog', dialog => dialog.accept()); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Current Status', { exact: true })).toBeFocused();
});
