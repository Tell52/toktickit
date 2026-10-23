import { test, expect, Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PrismaClient } from '../../server/node_modules/@prisma/client';
import bcrypt from '../../server/node_modules/bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.env.LAB4_UI_DATABASE_URL;
test.skip(!url, 'Requires an explicitly selected disposable UI database.');
test.setTimeout(120_000);
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
const password = 'Accessibility!123';
let users: { id: string; email: string }[] = [], ticketId: number;
test.beforeEach(async () => {
  const hash = await bcrypt.hash(password, 10), suffix = randomUUID();
  users = [0, 1, 2].map(i => ({ id: randomUUID(), email: `accessibility-${suffix}-${i}@example.com` }));
  await db!.user.createMany({ data: users.map((u, i) => ({ ...u, name: ['Ploy Requester', 'Mali IT Staff', 'Arun Administrator'][i], role: (['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const)[i], passwordHash: hash, mustChangePassword: false })) });
  const category = await db!.category.findFirstOrThrow(), system = await db!.relatedSystem.findFirstOrThrow();
  const ticket = await db!.ticket.create({ data: { ticketNumber: `TKT-ACCESS-${suffix}`, summary: 'Network connection drops in the west wing', description: 'Review the router connection, document the outcome and arrange the next check.', requesterId: users[0].id, ownerId: users[1].id, categoryId: category.id, relatedSystemId: system.id, currentStatus: 'In Progress', requestedPriority: 'High', itPriority: 'High', createdAt: new Date('2026-01-01Z') } }); ticketId = ticket.id;
  await db!.actionTaken.create({ data: { ticketId, description: 'Inspect the network connection and check the cabling at the service desk', resolutionCycle: 1, performedById: users[1].id, assigneeId: users[1].id, status: 'PLANNED', actionAt: new Date('2026-10-20T08:00:00Z') } });
  await db!.attachment.create({ data: { ticketId, fileName: 'router-guide.pdf', fileType: 'application/pdf', fileSize: 2048, fileUrl: '/uploads/review-placeholder.pdf' } });
  await db!.note.create({ data: { ticketId, authorId: users[1].id, content: 'PRIVATE_ACCESSIBILITY_NOTE' } });
});
test.afterEach(async () => {
  if (!db || !ticketId) return;
  await db.actionTakenRevision.deleteMany({ where: { action: { ticketId } } });
  await db.actionTaken.deleteMany({ where: { ticketId } }); await db.ticketStatusEvent.deleteMany({ where: { ticketId } });
  await db.attachment.deleteMany({ where: { ticketId } });
  await db.note.deleteMany({ where: { ticketId } }); await db.ticket.delete({ where: { id: ticketId } });
  await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
});
test.afterAll(async () => { await db?.$disconnect(); });
async function login(page: Page, role: number) {
  await page.goto('/login'); await page.getByLabel('Email address', { exact: true }).fill(users[role].email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Refresh dashboard' })).toBeEnabled();
}
async function audit(page: Page, info: TestInfo, state: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const report = { state, browser: info.project.name, violations: result.violations, incomplete: result.incomplete, passes: result.passes.map(p => p.id) };
  const path = info.outputPath(`${state}.json`); writeFileSync(path, JSON.stringify(report, null, 2)); await info.attach(state, { path, contentType: 'application/json' });
  expect(result.violations.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), state).toEqual([]);
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
async function targets(page: Page) {
  const small = await page.locator('.app-shell a,.app-shell button,.app-shell select').evaluateAll(elements => elements.filter(el => {
    const box = el.getBoundingClientRect(); const style = getComputedStyle(el);
    return box.width && box.height && style.visibility !== 'hidden' && !el.closest('[hidden]') && !el.classList.contains('skip-link') && (box.width < 43.999 || box.height < 43.999);
  }).map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
  expect(small).toEqual([]);
}
async function screenshot(page: Page, info: TestInfo, folder: string, state: string) {
  if (info.project.name !== 'chromium') return;
  const path = `artifacts/lab-04/screenshots/${folder}/accessibility-${state}.png`; mkdirSync(`artifacts/lab-04/screenshots/${folder}`, { recursive: true });
  await page.screenshot({ path, fullPage: !state.startsWith('confirmation-') });
}
for (const role of [0, 1, 2]) test(`role ${role}: shell, responsive dashboard, shared actions and earlier destinations`, async ({ page }, info) => {
  await login(page, role);
  // The intentional unauthenticated /me probe precedes login. All subsequent
  // authenticated navigation must have no console or uncaught runtime errors.
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const folder = role ? 'staff-dashboard' : 'requester-dashboard';
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: role ? 'My Queue' : 'My Tickets', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(role === 2 ? 1 : 0);
  for (const [width, height, columns] of [[1440, 900, 4], [768, 1024, 2], [390, 844, 1], [320, 844, 1]]) {
    await page.setViewportSize({ width, height }); await noOverflow(page);
    expect(await page.locator('.dashboard-metrics').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(columns);
    await targets(page); await screenshot(page, info, folder, `${role}-${width}x${height}`);
    if (width === 1440 || width === 320) await audit(page, info, `dashboard-${width}`);
  }
  await page.addStyleTag({ content: 'html { font-size: 200%; }' }); await noOverflow(page); await screenshot(page, info, folder, `${role}-320-text-200`);
  await page.goto(`/tickets/${ticketId}`); await expect(page.getByRole('heading', { name: 'Actions Taken', exact: true })).toBeVisible(); await noOverflow(page);
  await expect(nav.getByRole('link', { name: role ? 'My Queue' : 'My Tickets', exact: true })).toHaveAttribute('aria-current', 'location');
  await expect(page.getByRole('button', { name: 'Refresh actions', exact: true })).toBeEnabled();
  await audit(page, info, 'ticket-actions'); await targets(page); await screenshot(page, info, 'actions-taken', `${role}-shared-320`);
  await page.getByRole('button', { name: /^View action:/ }).first().click();
  await expect(page.getByRole('region', { name: 'Action details', exact: true })).toBeVisible();
  await audit(page, info, 'action-details');
  if (role) {
    await page.getByRole('button', { name: 'Add action', exact: true }).click();
    await expect(page.getByRole('form', { name: 'create action', exact: true })).toBeVisible();
    await audit(page, info, 'action-form');
    await page.getByRole('button', { name: 'Discard / Cancel', exact: true }).click();
  }
  if (!role) { await expect(page.getByText('PRIVATE_ACCESSIBILITY_NOTE')).toHaveCount(0); await expect(page.getByRole('tab', { name: /Internal Notes/ })).toHaveCount(0); }
  else {
    const comments = page.getByRole('tab', { name: /Public Comments/ }); await comments.focus(); await page.keyboard.press('ArrowRight');
    const notes = page.getByRole('tab', { name: /Internal Notes/ }); await expect(notes).toBeFocused(); await expect(notes).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Internal Notes — Confidential')).toBeVisible(); await expect(page.getByText('PRIVATE_ACCESSIBILITY_NOTE')).toBeVisible(); await audit(page, info, 'private-notes');
    await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: /Attachments/ })).toBeFocused(); await expect(page.getByText(/Download unavailable/)).toBeVisible(); await expect(page.locator('a[href^="/uploads/"]')).toHaveCount(0); await page.keyboard.press('Home'); await expect(comments).toBeFocused();
  }
  for (const destination of ['/create-ticket', '/profile', role ? '/queue' : '/tickets', ...(role === 2 ? ['/admin'] : [])]) {
    const link = nav.locator(`a[href="${destination}"]`); await link.click(); await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(page.getByRole('main')).toBeFocused(); await expect(link).toHaveAttribute('aria-current', 'page'); await noOverflow(page);
    // Wait for the destination's data before scanning its controls.
    if (destination === '/create-ticket') await expect(page.getByLabel('Category', { exact: false })).toContainText('Select Category');
    if (destination === '/queue') await expect(page.getByText(/Total Tickets:/)).toBeVisible();
    if (destination === '/tickets') await expect(page.getByRole('link', { name: 'Network connection drops in the west wing' })).toBeVisible();
    if (destination === '/admin') await expect(page.getByTestId('user-table')).toBeVisible();
    await audit(page, info, destination.slice(1)); await targets(page);
  }
  expect(errors).toEqual([]);
});

test('keyboard skip link, visible focus and native confirmation containment/return', async ({ page }, info) => {
  await login(page, 1); await page.goto('/dashboard'); await expect(page.getByRole('button', { name: 'Refresh dashboard' })).toBeEnabled();
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
  await page.goto(`/tickets/${ticketId}`); await page.getByLabel('Current Status', { exact: true }).selectOption('Cancelled');
  const dialog = page.getByRole('dialog', { name: 'Cancel ticket', exact: true }), reason = dialog.getByLabel('Ticket cancellation reason *');
  await expect(dialog).toBeVisible(); await expect(reason).toBeFocused();
  expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Confirm ticket cancellation' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(reason).toBeFocused();
  const outline = await reason.evaluate(el => getComputedStyle(el).outlineStyle); expect(outline).not.toBe('none');
  await reason.fill('Retained draft for keyboard review'); await audit(page, info, 'confirmation');
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height }); await noOverflow(page); const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await screenshot(page, info, 'actions-taken', `confirmation-${width}x${height}`);
  }
  page.once('dialog', d => d.accept()); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Current Status', { exact: true })).toBeFocused();
});

test('sign-in labels and usable password recovery guidance', async ({ page }, info) => {
  await page.goto('/login'); await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByLabel('Email address')).toBeVisible(); await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Forgot your password?' }).click(); await expect(page.getByRole('status')).toContainText('Contact your Administrator');
  await audit(page, info, 'sign-in'); await noOverflow(page);
});
