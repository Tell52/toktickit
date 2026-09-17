import { test, expect } from '@playwright/test';
import { createOrUpdateUser, createTestTicket, cleanupTestUsers, prisma } from './db-helper';

const TEST_EMAIL = 'e2e.flow.req@toktickit.com';

test.describe('Requester Ticket Flow (Lab 3 E2E - E2E-03)', () => {
  let requesterId: string;
  let ticketId: number;
  let ticketSummary: string;

  test.beforeEach(async () => {
    // 1. Create or ensure active Requester user with mustChangePassword = false
    const user = await createOrUpdateUser({
      email: TEST_EMAIL,
      name: 'E2E Flow Requester',
      password: 'FlowPassword123!',
      role: 'REQUESTER',
      mustChangePassword: false,
      isActive: true,
    });
    requesterId = user.id;

    // 2. Create an eligible ticket in 'In Progress' status
    ticketSummary = `VPN Connection Drops - ${Date.now()}`;
    const ticket = await createTestTicket({
      requesterId,
      summary: ticketSummary,
      description: 'VPN connection drops intermittently every few minutes.',
      currentStatus: 'In Progress',
      requestedPriority: 'High',
    });
    ticketId = ticket.id;
  });

  test.afterAll(async () => {
    await cleanupTestUsers([TEST_EMAIL]);
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // E2E-03: Requester logs in, opens own ticket, posts comment, indicates resolved (AC-08)
  // ---------------------------------------------------------------------------
  test('E2E-03: Requester logs in, opens own Ticket, posts Public Comment, and marks Problem Appears Resolved (AC-08)', async ({ page }) => {
    // 1. Login as Requester
    await page.goto('/login');
    await page.getByPlaceholder(/name@example.com/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/enter password/i).fill('FlowPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify redirected to /tickets
    await expect(page).toHaveURL(/.*\/tickets/);
    await expect(page.getByText('E2E Flow Requester')).toBeVisible();

    // 2. Locate and open own Ticket from My Tickets list
    const ticketLink = page.getByText(ticketSummary).first();
    await expect(ticketLink).toBeVisible();
    await ticketLink.click();

    // Verify navigation to Ticket Details
    await expect(page).toHaveURL(new RegExp(`.*\\/tickets\\/${ticketId}`));
    await expect(page.getByRole('heading', { name: /ticket details:/i })).toBeVisible();
    await expect(page.locator(`input[value="${ticketSummary}"]`)).toBeVisible();

    // Initial Status Badge verification: "In Progress"
    const statusBadges = page.locator('.badge', { hasText: 'In Progress' });
    await expect(statusBadges.first()).toBeVisible();

    // 3. Post a Public Comment
    const commentInput = page.getByPlaceholder(/write a public comment for it staff/i);
    await expect(commentInput).toBeVisible();

    const testCommentText = `The VPN connection seems stable now after the update. Verified at ${Date.now()}.`;
    await commentInput.fill(testCommentText);

    // Click Post Comment
    await page.getByRole('button', { name: /post comment/i }).click();

    // Verify comment appears in the chronological thread
    await expect(page.getByText(testCommentText)).toBeVisible();
    await expect(page.getByText('E2E Flow Requester').first()).toBeVisible();

    // 4. Mark "Problem Appears Resolved"
    const resolvedButton = page.getByRole('button', { name: /problem appears resolved/i });
    await expect(resolvedButton).toBeVisible();
    await resolvedButton.click();

    // Verify confirmation micro-dialog appears
    await expect(page.getByText(/this lets it staff know the issue seems fixed/i)).toBeVisible();

    // Click Confirm button
    const confirmButton = page.getByRole('button', { name: /^confirm$/i });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // 5. Verify resolved indication note is displayed
    await expect(page.getByText(/you indicated this problem appears resolved on/i)).toBeVisible();

    // Verify "Problem Appears Resolved" button is now hidden
    await expect(page.getByRole('button', { name: /problem appears resolved/i })).toHaveCount(0);

    // Verify Ticket Status remains unchanged (still "In Progress", NOT Closed / Resolved)
    await expect(statusBadges.first()).toBeVisible();
  });
});
