/**
 * E2E tests — Lobby and Login pages.
 * Tests a11y compliance, empty states, keyboard navigation, and form validation.
 */

import { test, expect, expectAccessible } from './fixtures.js';

test.describe('Lobby Page', () => {
  test('empty state is visible when no projects exist', async ({ page }) => {
    // Intercept project list to guarantee empty state
    await page.route('/api/projects', (route) => {
      if (route.request().url().endsWith('/api/projects')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/lobby.html');
    await page.waitForLoadState('networkidle');

    // The empty state message should be visible
    const emptyState = page.locator('#empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState.locator('h2')).toContainText('The Lobby is quiet');

    // The "New Project" button inside empty state should be visible
    await expect(page.locator('#btn-new-empty')).toBeVisible();
  });

  test('passes axe-core accessibility scan', async ({ page }) => {
    await page.goto('/lobby.html');
    await page.waitForLoadState('networkidle');
    await expectAccessible(page);
  });

  test('keyboard navigation cycles through interactive elements', async ({ page }) => {
    await page.goto('/lobby.html');
    await page.waitForLoadState('networkidle');

    // The skip-nav link should be the first focusable element
    await page.keyboard.press('Tab');
    const skipNav = page.locator('a.skip-nav');
    await expect(skipNav).toBeFocused();

    // Continue tabbing — should reach the header action buttons
    // Tab through: skip-nav -> Danger Room link -> Import button -> New Project button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // One of the lobby action buttons should be focused
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A']).toContain(focusedTag);
  });

  test('import modal opens and Escape closes it', async ({ page }) => {
    await page.goto('/lobby.html');
    await page.waitForLoadState('networkidle');

    // Open the import modal
    await page.locator('#btn-import').click();
    const modal = page.locator('#import-modal');
    await expect(modal).toHaveClass(/active/);

    // Escape should close the modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/active/);
  });
});

test.describe('Login Page', () => {
  // In local mode (VOIDFORGE_TEST=1), the login page detects an authenticated
  // session and redirects to lobby. To test the login form itself, we intercept
  // the session API to simulate remote/unauthenticated mode.

  test('login form renders with all expected fields', async ({ page }) => {
    // Intercept the session check to simulate unauthenticated remote mode
    await page.route('/api/auth/session', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { authenticated: false, needsSetup: false },
        }),
      });
    });

    await page.goto('/login.html');

    // Wait for the login section to become active (JS adds .active class)
    const loginSection = page.locator('#login-section');
    await expect(loginSection).toHaveClass(/active/);

    // Verify form fields are present
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#login-submit')).toBeVisible();
    await expect(page.locator('#login-submit')).toContainText('Sign In');
  });

  test('submit with empty fields shows validation error', async ({ page }) => {
    await page.route('/api/auth/session', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { authenticated: false, needsSetup: false },
        }),
      });
    });

    await page.goto('/login.html');
    await expect(page.locator('#login-section')).toHaveClass(/active/);

    // Click submit without filling fields
    await page.locator('#login-submit').click();

    // Should show an error in the status area
    const loginStatus = page.locator('#login-status');
    await expect(loginStatus).toContainText('required');
    await expect(loginStatus).toHaveClass(/error/);
  });

  test('passes axe-core accessibility scan', async ({ page }) => {
    await page.route('/api/auth/session', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { authenticated: false, needsSetup: false },
        }),
      });
    });

    await page.goto('/login.html');
    await expect(page.locator('#login-section')).toHaveClass(/active/);
    await expectAccessible(page);
  });
});
