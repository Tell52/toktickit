import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import {
  createOrUpdateUser,
  createTestTicket,
  createTestNote,
  createTestComment,
  cleanupTestUsers,
  prisma,
} from './db-helper';


test.describe('Staff and Requester Ticket Flows (Lab 3 E2E)', () => {
  const cleanupEmails: string[] = [];

  test.afterAll(async () => {
    if (cleanupEmails.length > 0) {
      await cleanupTestUsers(cleanupEmails);
    }
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // E2E-03: Requester logs in, opens own ticket, posts comment, indicates resolved (AC-08)
  // ---------------------------------------------------------------------------
  test('E2E-03: Requester logs in, opens own Ticket, posts Public Comment, and marks Problem Appears Resolved (AC-08)', async ({ page }) => {
    const requesterEmail = `e2e.flow.req.${Date.now()}-${Math.floor(Math.random() * 1000)}@toktickit.com`;
    cleanupEmails.push(requesterEmail);

    const user = await createOrUpdateUser({
      email: requesterEmail,
      name: 'E2E Flow Requester',
      password: 'FlowPassword123!',
      role: 'REQUESTER',
      mustChangePassword: false,
      isActive: true,
    });

    const ticketSummary = `VPN Connection Drops - ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const ticket = await createTestTicket({
      requesterId: user.id,
      summary: ticketSummary,
      description: 'VPN connection drops intermittently every few minutes.',
      currentStatus: 'In Progress',
      requestedPriority: 'High',
      itPriority: 'High',
    });

    // 1. Login as Requester
    await page.goto('/login');
    await page.getByPlaceholder(/name@example.com/i).fill(requesterEmail);
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
    await expect(page).toHaveURL(new RegExp(`.*\\/tickets\\/${ticket.id}`));
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

  // ---------------------------------------------------------------------------
  // E2E-04: IT Staff logs in, searches Queue, claims Ticket, sets IT Priority,
  //         changes status, adds Internal Note, and verifies persistence (AC-06)
  // ---------------------------------------------------------------------------
  test('E2E-04: IT Staff searches Queue, claims Ticket, updates IT Priority & Status, adds Internal Note, and verifies persistence (AC-06)', async ({ page }) => {
    const staffEmail = `e2e.staff.flow.${Date.now()}-${Math.floor(Math.random() * 1000)}@toktickit.com`;
    const reqEmail = `e2e.req.forstaff.${Date.now()}-${Math.floor(Math.random() * 1000)}@toktickit.com`;
    cleanupEmails.push(staffEmail, reqEmail);

    const staffUser = await createOrUpdateUser({
      email: staffEmail,
      name: 'E2E Flow Staff',
      password: 'StaffPass123!',
      role: 'IT_STAFF',
      mustChangePassword: false,
      isActive: true,
    });

    const reqUser = await createOrUpdateUser({
      email: reqEmail,
      name: 'E2E Requesting User',
      password: 'ReqPass123!',
      role: 'REQUESTER',
      mustChangePassword: false,
      isActive: true,
    });

    // Create an unassigned ticket in "New" status
    const unassignedSummary = `Server Disk Alert - ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const unassignedTicket = await createTestTicket({
      requesterId: reqUser.id,
      summary: unassignedSummary,
      description: 'Root partition is at 95% disk usage on db-node-01.',
      currentStatus: 'New',
      requestedPriority: 'Medium',
      itPriority: 'Medium',
      ownerId: null,
    });

    // 1. IT Staff logs in
    await page.goto('/login');
    await page.getByPlaceholder(/name@example.com/i).fill(staffEmail);
    await page.getByPlaceholder(/enter password/i).fill('StaffPass123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify redirected to /queue
    await expect(page).toHaveURL(/.*\/queue/);
    await expect(page.getByText('E2E Flow Staff')).toBeVisible();

    // 2. Search for the unassigned ticket in Queue
    const searchInput = page.getByPlaceholder(/search by ticket number or summary/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill(unassignedSummary);

    // Click on matching ticket row
    const ticketRow = page.getByText(unassignedSummary).first();
    await expect(ticketRow).toBeVisible();
    await ticketRow.click();

    // 3. Verify navigation to StaffTicketDetail
    await expect(page).toHaveURL(new RegExp(`.*\\/tickets\\/${unassignedTicket.id}`));
    await expect(page.getByTestId('staff-ticket-detail')).toBeVisible();
    await expect(page.getByTestId('operational-controls')).toBeVisible();

    // 4. Claim Ticket: change owner select to logged-in IT Staff
    const ownerSelect = page.getByTestId('editable-owner-select');
    await expect(ownerSelect).toBeVisible();
    await ownerSelect.selectOption(staffUser.id);
    await expect(page.getByText(/owner updated successfully/i)).toBeVisible();

    // 5. Set IT Priority to HIGH
    const prioritySelect = page.getByTestId('editable-priority-select');
    await expect(prioritySelect).toBeVisible();
    await prioritySelect.selectOption('HIGH');
    await expect(page.getByText(/it priority updated successfully/i)).toBeVisible();

    // 6. Change Status from "New" to "In Progress"
    const statusSelect = page.getByTestId('editable-status-select');
    await expect(statusSelect).toBeVisible();
    await statusSelect.selectOption('In Progress');
    await expect(page.getByText(/status changed to In Progress/i)).toBeVisible();

    // 7. Add Internal Note
    await page.getByTestId('tab-internal-notes').click();
    await expect(page.getByTestId('internal-notes-panel')).toBeVisible();

    const noteContent = `Cleaned up archived WAL logs and extended LVM volume at ${Date.now()}`;
    await page.getByTestId('internal-note-input').fill(noteContent);
    await page.getByTestId('post-note-button').click();

    // Verify note rendered in internal notes list
    await expect(page.getByText(noteContent)).toBeVisible();

    // 8. Verify persistence on page reload
    await page.reload();
    await expect(page.getByTestId('staff-ticket-detail')).toBeVisible();
    await expect(page.getByTestId('editable-owner-select')).toHaveValue(staffUser.id);
    await expect(page.getByTestId('editable-priority-select')).toHaveValue('HIGH');
    await expect(page.getByTestId('editable-status-select')).toHaveValue('In Progress');

    // Switch to Internal Notes tab and verify note is still present
    await page.getByTestId('tab-internal-notes').click();
    await expect(page.getByText(noteContent)).toBeVisible();

    // 9. Return to My Queue and verify updated row reflects owner, priority, and status
    await page.getByRole('button', { name: /back to my queue/i }).click();
    await expect(page).toHaveURL(/.*\/queue/);

    // Search for ticket in Queue table
    const queueSearch = page.getByPlaceholder(/search by ticket number or summary/i);
    await queueSearch.fill(unassignedSummary);

    const updatedQueueRow = page.getByTestId(`ticket-row-${unassignedTicket.ticketNumber}`);
    await expect(updatedQueueRow).toBeVisible();
    await expect(updatedQueueRow.locator('[data-testid="status-badge"]')).toHaveText('In Progress');
    await expect(updatedQueueRow.locator('[data-testid="priority-badge"]').nth(1)).toHaveText('HIGH', { ignoreCase: true });
    await expect(updatedQueueRow.getByText('E2E Flow Staff')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // E2E-07: Requester direct URL navigation to Staff/Internal Notes is blocked (FR-22, AC-04)
  // ---------------------------------------------------------------------------
  test('E2E-07: Requester account cannot access Queue or see Internal Notes (FR-22, AC-04)', async ({ page }) => {
    const requesterEmail = `e2e.forbidden.req.${Date.now()}-${Math.floor(Math.random() * 1000)}@toktickit.com`;
    const staffEmail = `e2e.author.staff.${Date.now()}-${Math.floor(Math.random() * 1000)}@toktickit.com`;
    cleanupEmails.push(requesterEmail, staffEmail);

    const reqUser = await createOrUpdateUser({
      email: requesterEmail,
      name: 'E2E Forbidden Check Req',
      password: 'FlowPassword123!',
      role: 'REQUESTER',
      mustChangePassword: false,
      isActive: true,
    });

    const staffUser = await createOrUpdateUser({
      email: staffEmail,
      name: 'E2E Author Staff',
      password: 'StaffPass123!',
      role: 'IT_STAFF',
      mustChangePassword: false,
      isActive: true,
    });

    const forbiddenTicket = await createTestTicket({
      requesterId: reqUser.id,
      summary: `Confidential Audit Ticket - ${Date.now()}`,
      description: 'System security audit ticket.',
      currentStatus: 'In Progress',
    });

    // 1. Create a staff internal note on the test ticket
    const secretInternalNote = `Confidential IT analysis - internal secret key ${Date.now()}`;
    await createTestNote({
      ticketId: forbiddenTicket.id,
      authorId: staffUser.id,
      content: secretInternalNote,
    });

    // 2. Requester logs in
    await page.goto('/login');
    await page.getByPlaceholder(/name@example.com/i).fill(requesterEmail);
    await page.getByPlaceholder(/enter password/i).fill('FlowPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/.*\/tickets/);

    // 3. Attempt direct URL navigation to /queue
    await page.goto('/queue');

    // ProtectedRoute must redirect Requester away from /queue back to /tickets
    await expect(page).toHaveURL(/.*\/tickets/);
    await expect(page.getByTestId('staff-ticket-table')).toHaveCount(0);

    // 4. Navigate directly to ticket detail
    await page.goto(`/tickets/${forbiddenTicket.id}`);
    await expect(page.getByRole('heading', { name: /ticket details:/i })).toBeVisible();

    // Verify Requester view is loaded: Internal Notes tab, panel, and controls must NOT exist in the DOM
    await expect(page.getByTestId('tab-internal-notes')).toHaveCount(0);
    await expect(page.getByTestId('internal-notes-panel')).toHaveCount(0);
    await expect(page.getByTestId('operational-controls')).toHaveCount(0);

    // Confidential internal note content must never be rendered in the DOM
    await expect(page.getByText(secretInternalNote)).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-08: Full user journey across desktop, tablet, and mobile viewports (ui-spec §7)
  //         and automated screenshot capture into artifacts/lab-03/screenshots/
  // ---------------------------------------------------------------------------
  test('E2E-08: Responsive user journey renders cleanly across desktop, tablet, and mobile viewports (ui-spec §7)', async ({ page }) => {
    const adminEmail = `e2e.responsive.admin.${Date.now()}-${Math.floor(Math.random() * 1000)}@toktickit.com`;
    const forcedEmail = `e2e.responsive.forced.${Date.now()}-${Math.floor(Math.random() * 1000)}@toktickit.com`;
    cleanupEmails.push(adminEmail, forcedEmail);

    const screenshotBaseDir = path.resolve(__dirname, '../../artifacts/lab-03/screenshots');
    const screenshotDirs = ['authentication', 'staff-queue', 'staff-ticket-detail', 'user-management'];
    for (const dir of screenshotDirs) {
      fs.mkdirSync(path.join(screenshotBaseDir, dir), { recursive: true });
    }

    const breakpoints = [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 },
    ];

    // 1. Create Admin user and Forced Change Password user
    const adminUser = await createOrUpdateUser({
      email: adminEmail,
      name: 'E2E Responsive Administrator',
      password: 'AdminPass123!',
      role: 'ADMINISTRATOR',
      mustChangePassword: false,
      isActive: true,
    });

    await createOrUpdateUser({
      email: forcedEmail,
      name: 'E2E Forced Change User',
      password: 'InitialPass123!',
      role: 'REQUESTER',
      mustChangePassword: true,
      isActive: true,
    });

    // 2. Create populated ticket with Comment and Internal Note
    const testTicket = await createTestTicket({
      requesterId: adminUser.id,
      summary: `Responsive Verification Ticket - ${Date.now()}`,
      description: 'Checking responsive layouts and capturing screenshots across breakpoints.',
      currentStatus: 'In Progress',
      requestedPriority: 'High',
      itPriority: 'High',
    });

    await createTestNote({
      ticketId: testTicket.id,
      authorId: adminUser.id,
      content: 'Internal note: Verified database connectivity and cluster performance across all nodes.',
    });

    await createTestComment({
      ticketId: testTicket.id,
      authorId: adminUser.id,
      content: 'Public comment: System monitoring active. All services running within expected parameters.',
    });

    // -------------------------------------------------------------------------
    // Phase A: Authentication Screenshots (Login & Force Change Password)
    // -------------------------------------------------------------------------
    // A1. Capture Login Screen across all breakpoints
    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();
      await page.screenshot({
        path: path.join(screenshotBaseDir, `authentication/login-${bp.name}.png`),
        fullPage: true,
      });
    }

    // A2. Log in with forcedChange user to capture Change Password screen
    await page.getByPlaceholder(/name@example.com/i).fill(forcedEmail);
    await page.getByPlaceholder(/enter password/i).fill('InitialPass123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/.*\/change-password/);
    await expect(page.getByRole('heading', { name: /change your password/i })).toBeVisible();

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await expect(page.getByRole('heading', { name: /change your password/i })).toBeVisible();
      await page.screenshot({
        path: path.join(screenshotBaseDir, `authentication/change-password-${bp.name}.png`),
        fullPage: true,
      });
    }

    // -------------------------------------------------------------------------
    // Phase B: Admin Journey (Queue -> Ticket Detail -> User Management)
    // -------------------------------------------------------------------------
    // Clear session cookies and localStorage to log in as Administrator
    await page.context().clearCookies();
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');

    await page.getByPlaceholder(/name@example.com/i).fill(adminEmail);
    await page.getByPlaceholder(/enter password/i).fill('AdminPass123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/.*\/queue/);
    await expect(page.getByText('E2E Responsive Administrator')).toBeVisible();

    // B1. Staff Ticket Queue across breakpoints
    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/queue');

      if (bp.name === 'desktop') {
        await expect(page.getByTestId('staff-ticket-table')).toBeVisible();
        await expect(page.getByTestId('staff-ticket-mobile-list')).toBeHidden();
      } else if (bp.name === 'tablet') {
        await expect(page.getByTestId('staff-ticket-table')).toBeVisible();
      } else if (bp.name === 'mobile') {
        await expect(page.getByTestId('staff-ticket-mobile-list')).toBeVisible();
        await expect(page.getByTestId('staff-ticket-table')).toBeHidden();
      }

      await page.screenshot({
        path: path.join(screenshotBaseDir, `staff-queue/queue-${bp.name}.png`),
        fullPage: true,
      });
    }

    // B2. Staff Ticket Detail across breakpoints
    await page.goto(`/tickets/${testTicket.id}`);
    await expect(page.getByTestId('staff-ticket-detail')).toBeVisible();
    await expect(page.getByTestId('operational-controls')).toBeVisible();

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await expect(page.getByTestId('staff-ticket-detail')).toBeVisible();
      await expect(page.getByTestId('operational-controls')).toBeVisible();
      await page.screenshot({
        path: path.join(screenshotBaseDir, `staff-ticket-detail/detail-${bp.name}.png`),
        fullPage: true,
      });
    }

    // B3. Administrator User Management across breakpoints
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /administrator user management/i })).toBeVisible();
    await expect(page.getByTestId('user-table')).toBeVisible();

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await expect(page.getByTestId('user-table')).toBeVisible();

      // Screenshot 1: User Management List
      await page.screenshot({
        path: path.join(screenshotBaseDir, `user-management/user-admin-${bp.name}.png`),
        fullPage: true,
      });

      // Screenshot 2: Create User panel/modal open
      await page.getByTestId('create-user-btn').click();
      await expect(page.getByTestId('user-panel')).toBeVisible();
      await page.screenshot({
        path: path.join(screenshotBaseDir, `user-management/create-user-${bp.name}.png`),
        fullPage: true,
      });

      // Close panel
      await page.getByTestId('cancel-user-btn').click();
      await expect(page.getByTestId('user-panel')).toBeHidden();
    }
  });
});
