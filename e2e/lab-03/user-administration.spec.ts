import { test, expect } from '@playwright/test';
import { createOrUpdateUser, cleanupTestUsers, prisma } from './db-helper';

const TEST_ADMIN_EMAIL = 'e2e.admin.mgmt@toktickit.com';

test.describe('Administrator User Management (Lab 3 E2E - E2E-05)', () => {
  let adminId: string;
  const createdUserEmails: string[] = [];

  test.beforeEach(async () => {
    // Ensure active Administrator account exists
    const adminUser = await createOrUpdateUser({
      email: TEST_ADMIN_EMAIL,
      name: 'E2E Admin Master',
      password: 'AdminPassword123!',
      role: 'ADMINISTRATOR',
      mustChangePassword: false,
      isActive: true,
    });
    adminId = adminUser.id;
  });

  test.afterAll(async () => {
    await cleanupTestUsers([TEST_ADMIN_EMAIL, ...createdUserEmails]);
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // E2E-05: Administrator creates user, fails duplicate email, edits user,
  //         resets password, and is blocked from self-deactivation (AC-09, AC-10, AC-11)
  // ---------------------------------------------------------------------------
  test('E2E-05: Admin lifecycle — create, duplicate check, edit, reset password, self-deactivation protection (AC-09, AC-10, AC-11)', async ({ page }) => {
    // 1. Log in as Administrator
    await page.goto('/login');
    await page.getByPlaceholder(/name@example.com/i).fill(TEST_ADMIN_EMAIL);
    await page.getByPlaceholder(/enter password/i).fill('AdminPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify redirected to /queue
    await expect(page).toHaveURL(/.*\/queue/);
    await expect(page.getByText('E2E Admin Master')).toBeVisible();

    // 2. Navigate to Admin screen via top navbar
    const adminNavLink = page.getByRole('link', { name: /^admin$/i });
    await expect(adminNavLink).toBeVisible();
    await adminNavLink.click();

    await expect(page).toHaveURL(/.*\/admin/);
    await expect(page.getByRole('heading', { name: /administrator user management/i })).toBeVisible();
    await expect(page.getByTestId('user-table')).toBeVisible();

    // 3. Step A: Create a new IT Staff user (AC-11, FR-26)
    const newStaffEmail = `e2e.staff.new.${Date.now()}@toktickit.com`;
    createdUserEmails.push(newStaffEmail);

    await page.getByTestId('create-user-btn').click();
    await expect(page.getByRole('heading', { name: /create user/i })).toBeVisible();

    await page.getByTestId('user-name-input').fill('E2E Staff Member');
    await page.getByTestId('user-email-input').fill(newStaffEmail);
    await page.getByTestId('user-role-select').selectOption('IT_STAFF');
    await page.getByTestId('user-password-input').fill('InitialPass123!');

    await page.getByTestId('save-user-btn').click();

    // Verify success toast and table rendering
    await expect(page.getByTestId('success-toast')).toBeVisible();
    await expect(page.getByText('E2E Staff Member')).toBeVisible();
    await expect(page.getByText(newStaffEmail)).toBeVisible();

    // Verify user in Database: mustChangePassword must be true initially
    const userInDb = await prisma.user.findUnique({ where: { email: newStaffEmail } });
    expect(userInDb).not.toBeNull();
    expect(userInDb?.mustChangePassword).toBe(true);
    expect(userInDb?.role).toBe('IT_STAFF');
    expect(userInDb?.isActive).toBe(true);

    // 4. Step B: Attempt duplicate email creation (fails) (AC-11, FR-29)
    await page.getByTestId('create-user-btn').click();
    await expect(page.getByRole('heading', { name: /create user/i })).toBeVisible();

    await page.getByTestId('user-name-input').fill('Duplicate Staff Member');
    await page.getByTestId('user-email-input').fill(newStaffEmail); // Duplicate!
    await page.getByTestId('user-password-input').fill('InitialPass123!');

    await page.getByTestId('save-user-btn').click();

    // Expect inline error under email input
    const emailError = page.getByTestId('email-error');
    await expect(emailError).toBeVisible();
    await expect(emailError).toHaveText(/this email is already in use/i);

    // Cancel panel
    await page.getByTestId('cancel-user-btn').click();

    // 5. Step C: Edit the user (FR-27)
    // Filter/search for newly created user
    await page.getByTestId('user-search-input').fill('E2E Staff Member');
    const editBtn = page.getByTestId(`edit-user-${userInDb!.id}`);
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Panel opens in Edit mode
    await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible();
    await page.getByTestId('user-name-input').fill('E2E Staff Member Renamed');
    await page.getByTestId('save-user-btn').click();

    // Verify toast & table update
    await expect(page.getByTestId('success-toast')).toBeVisible();
    await expect(page.getByText('E2E Staff Member Renamed')).toBeVisible();

    // Verify DB update
    const updatedUserInDb = await prisma.user.findUnique({ where: { id: userInDb!.id } });
    expect(updatedUserInDb?.name).toBe('E2E Staff Member Renamed');

    // 6. Step D: Reset password (FR-28)
    await page.getByTestId(`edit-user-${userInDb!.id}`).click();
    await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible();

    // Open reset password subsection
    await page.getByTestId('open-reset-password-btn').click();
    await page.getByTestId('new-password-input').fill('ResetPass456!Valid');
    await page.getByTestId('submit-reset-password-btn').click();

    // Verify toast
    await expect(page.getByTestId('success-toast')).toBeVisible();
    await expect(page.getByTestId('success-toast')).toHaveText(/password reset/i);

    // Verify DB state: target user's mustChangePassword is true
    const resetUserInDb = await prisma.user.findUnique({ where: { id: userInDb!.id } });
    expect(resetUserInDb?.mustChangePassword).toBe(true);

    // 7. Step E: Self-deactivation prevention (AC-09, FR-30)
    // Clear search filter to show all users
    await page.getByTestId('user-search-input').fill('');

    // Click Edit on logged-in Administrator's own row
    await page.getByTestId(`edit-user-${adminId}`).click();
    await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible();

    // Deactivate button must be disabled
    const deactivateBtn = page.getByTestId('deactivate-user-btn');
    await expect(deactivateBtn).toBeDisabled();
    await expect(page.getByText(/you cannot deactivate your own account/i)).toBeVisible();

    // Confirm DB state: Admin remains active
    const adminInDb = await prisma.user.findUnique({ where: { id: adminId } });
    expect(adminInDb?.isActive).toBe(true);
  });
});
