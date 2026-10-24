import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '../../server/node_modules/@prisma/client';
import bcrypt from '../../server/node_modules/bcrypt';
import { randomUUID } from 'node:crypto';

const url = process.env.LAB4_UI_DATABASE_URL;
test.skip(!url, 'Requires the explicitly selected disposable UI database.');
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
const password = 'DashboardSwitch!123';
let users: { id: string; email: string; name: string }[] = [], tickets: number[] = [];
test.beforeEach(async () => {
  tickets = [];
  const hash = await bcrypt.hash(password, 10), suffix = randomUUID();
  users = ['First Requester', 'Second Requester', 'Switch Staff', 'Switch Administrator'].map((name, i) => ({ id: randomUUID(), email: `switch-${suffix}-${i}@example.com`, name }));
  await db!.user.createMany({ data: users.map((user, i) => ({ ...user, passwordHash: hash, role: (['REQUESTER', 'REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const)[i], mustChangePassword: false })) });
  const category = await db!.category.findFirstOrThrow(), system = await db!.relatedSystem.findFirstOrThrow();
  for (let i = 0; i < 3; i++) {
    const owner = users[i === 0 ? 2 : 3].id;
    const ticket = await db!.ticket.create({ data: { ticketNumber: `SWITCH-${suffix}-${i}`, summary: `${i === 0 ? 'FIRST_ACCOUNT_ONLY' : 'SECOND_ACCOUNT_ONLY'} ${i}`, description: 'Role and account switch regression', requesterId: users[i === 0 ? 0 : 1].id, ownerId: owner, currentStatus: 'In Progress', requestedPriority: 'Medium', categoryId: category.id, relatedSystemId: system.id } });
    tickets.push(ticket.id);
    await db!.actionTaken.create({ data: { ticketId: ticket.id, performedById: owner, assigneeId: owner, actionAt: new Date(), description: `ASSIGNEE_${i}`, status: 'PLANNED', resolutionCycle: 1 } });
  }
});
test.afterEach(async () => {
  if (!db) return;
  await db.actionTaken.deleteMany({ where: { ticketId: { in: tickets } } });
  await db.ticket.deleteMany({ where: { id: { in: tickets } } });
  await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
});
test.afterAll(async () => { await db?.$disconnect(); });
async function login(page: Page, index: number) {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(users[index].email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Refresh dashboard' })).toBeEnabled();
}

test('E2E-05: same-browser account/role switches isolate dashboards, action assignments and guarded routes', async ({ page }) => {
  test.setTimeout(120_000);
  // Reuse one context deliberately: a fresh context would hide stale client caches.
  for (const index of [0, 1, 2, 3, 0]) {
    await login(page, index);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(index === 3 ? 1 : 0);
    if (index < 2) {
      await expect(page.getByRole('link', { name: `Open tickets ${index + 1}`, exact: true })).toBeVisible();
      await expect(page.getByText(index === 0 ? /SECOND_ACCOUNT_ONLY/ : /FIRST_ACCOUNT_ONLY/)).toHaveCount(0);
      await page.getByRole('link', { name: `Open tickets ${index + 1}`, exact: true }).click();
      await expect(page.getByText(`${index + 1} tickets · Page 1`)).toBeVisible();
      const forbidden = tickets[index === 0 ? 1 : 0];
      expect((await page.request.get(`http://localhost:3106/api/tickets/${forbidden}`)).status()).toBe(404);
      await page.goto(`/tickets/${forbidden}`);
      await expect(page.getByRole('button', { name: 'Retry loading ticket' })).toBeVisible();
      await expect(page.getByText(index === 0 ? /SECOND_ACCOUNT_ONLY/ : /FIRST_ACCOUNT_ONLY/)).toHaveCount(0);
      await page.goto('/admin'); await expect(page).toHaveURL(/\/tickets$/);
      expect((await page.request.get('http://localhost:3106/api/staff/dashboard')).status()).toBe(403);
    } else {
      const count = index === 2 ? 1 : 2;
      await expect(page.getByRole('link', { name: `My open tickets ${count}`, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: `Actions assigned to me ${count}`, exact: true })).toBeVisible();
      const actions = page.getByRole('region', { name: 'My actions' });
      await expect(actions.getByRole('link')).toHaveCount(count);
      await expect(actions.getByText(index === 2 ? /ASSIGNEE_[12]/ : /ASSIGNEE_0/)).toHaveCount(0);
      await actions.getByRole('link').first().click();
      await expect(page.getByRole('heading', { name: 'Action details', exact: true })).toBeVisible();
      if (index === 2) expect((await page.request.get('http://localhost:3106/api/admin/users')).status()).toBe(403);
      else { await nav.getByRole('link', { name: 'Admin', exact: true }).click(); await expect(page.getByTestId('user-table')).toBeVisible(); }
    }
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('http://localhost:3106/api/dashboard/requester')).status()).toBe(401);
    await page.goBack(); await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  }
});
