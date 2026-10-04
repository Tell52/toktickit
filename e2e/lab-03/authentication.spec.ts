import { test, expect } from '@playwright/test';
import { createOrUpdateUser, cleanupTestUsers, prisma } from './db-helper';

test.describe('Authentication and Session Flows (Lab 3 E2E)', () => {
  const cleanupEmails: string[] = [];

  test.afterAll(async () => {
    if (cleanupEmails.length > 0) {
      await cleanupTestUsers(cleanupEmails);
    }
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // E2E-01: Full login flow, active user, correct credentials (AC-01)
  // ---------------------------------------------------------------------------
  test('E2E-01: Valid login lands in authenticated app shell with role-based navigation (AC-01)', async ({ page }) => {
    const userEmail = `e2e.active.req.${Date.now()}@toktickit.com`;
    cleanupEmails.push(userEmail);

    await createOrUpdateUser({
      email: userEmail,
      name: 'E2E Active Requester',
      password: 'ActivePass123!',
      role: 'REQUESTER',
      mustChangePassword: false,
      isActive: true,
    });

    await page.goto('/login');

    // Verify login form is visible
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    // Fill credentials
    await page.getByPlaceholder(/name@example.com/i).fill(userEmail);
    await page.getByPlaceholder(/enter password/i).fill('ActivePass123!');

    // Submit
    await page.getByRole('button', { name: /sign in/i }).click();

    // Expect navigation to /tickets (for Requester)
    await expect(page).toHaveURL(/.*\/tickets/);

    // Authenticated app shell verification
    await expect(page.getByText('TokTickIT')).toBeVisible();
    await expect(page.getByText('E2E Active Requester')).toBeVisible();

    // Role badge
    const roleBadge = page.getByTestId('role-badge');
    await expect(roleBadge).toBeVisible();
    await expect(roleBadge).toHaveText('Requester');

    // Role-specific nav links for Requester (FR-07)
    await expect(page.getByRole('link', { name: /my tickets/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /create ticket/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /profile/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();

    // Unauthorized Admin and Queue nav items must NOT be present (FR-07)
    await expect(page.getByRole('link', { name: /^admin$/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /my queue/i })).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-02: Initial-password login -> forced Change Password -> continuation (AC-02)
  // ---------------------------------------------------------------------------
  test('E2E-02: Initial login forces Change Password screen before normal app access (AC-02)', async ({ page }) => {
    const userEmail = `e2e.forced.change.${Date.now()}@toktickit.com`;
    cleanupEmails.push(userEmail);

    await createOrUpdateUser({
      email: userEmail,
      name: 'E2E Forced Change User',
      password: 'TempPassword123!',
      role: 'REQUESTER',
      mustChangePassword: true,
      isActive: true,
    });

    await page.goto('/login');

    // 1. Log in with initial/temporary credentials
    await page.getByPlaceholder(/name@example.com/i).fill(userEmail);
    await page.getByPlaceholder(/enter password/i).fill('TempPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // 2. Verified: forced redirection to /change-password
    await expect(page).toHaveURL(/.*\/change-password/);
    await expect(page.getByRole('heading', { name: /change your password/i })).toBeVisible();

    // 3. Verified: Normal app screens are unreachable while mustChangePassword is true
    await page.goto('/tickets');
    await expect(page).toHaveURL(/.*\/change-password/);
    await expect(page.getByRole('heading', { name: /change your password/i })).toBeVisible();

    await page.goto('/create-ticket');
    await expect(page).toHaveURL(/.*\/change-password/);
    await expect(page.getByRole('heading', { name: /change your password/i })).toBeVisible();

    // 4. Fill in the Change Password form
    const currentPassInput = page.getByPlaceholder(/enter current password/i);
    const newPassInput = page.getByPlaceholder(/^enter new password$/i);
    const confirmPassInput = page.getByPlaceholder(/re-enter new password/i);
    const continueButton = page.getByRole('button', { name: /continue/i });

    // Enter wrong current password first to verify validation
    await currentPassInput.fill('WrongTempPassword!');
    await newPassInput.fill('NewStr0ng!Pass2026');
    await confirmPassInput.fill('NewStr0ng!Pass2026');
    await continueButton.click();

    await expect(page.getByText(/current password is incorrect/i)).toBeVisible();

    // Now enter correct current password
    await currentPassInput.fill('TempPassword123!');
    await continueButton.click();

    // 5. Successful continuation: user is redirected into the normal app shell
    await expect(page).toHaveURL(/.*\/tickets/);
    await expect(page.getByText('E2E Forced Change User')).toBeVisible();
    await expect(page.getByRole('link', { name: /my tickets/i })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // E2E-06: Logout flow and back navigation protection (FR-03, AC-12)
  // ---------------------------------------------------------------------------
  test('E2E-06: Logout destroys session and blocks browser back navigation (AC-12)', async ({ page }) => {
    const userEmail = `e2e.logout.req.${Date.now()}@toktickit.com`;
    cleanupEmails.push(userEmail);

    await createOrUpdateUser({
      email: userEmail,
      name: 'E2E Logout Requester',
      password: 'ActivePass123!',
      role: 'REQUESTER',
      mustChangePassword: false,
      isActive: true,
    });

    // 1. Log in
    await page.goto('/login');
    await page.getByPlaceholder(/name@example.com/i).fill(userEmail);
    await page.getByPlaceholder(/enter password/i).fill('ActivePass123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/.*\/tickets/);
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();

    // 2. Perform Logout
    await page.getByRole('button', { name: /logout/i }).click();

    // 3. User is redirected to Login
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    // 4. Attempt to navigate back via browser back button
    await page.goBack();

    // Must be redirected to /login (protected route rejects unauthenticated state)
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    // 5. Attempt direct navigation to protected route
    await page.goto('/tickets');
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();
  });
});
