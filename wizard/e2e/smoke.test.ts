/**
 * Smoke test — verifies the wizard server starts and serves pages.
 * Runs axe-core a11y scans on each page (excluding known pre-existing violations).
 */

import { test, expect, expectAccessible } from './fixtures.js';

test.describe('Wizard Smoke Tests', () => {
  test('lobby page loads and is accessible', async ({ page }) => {
    await page.goto('/lobby.html');

    // Page title contains VoidForge
    await expect(page).toHaveTitle(/VoidForge/);

    // Page has rendered content
    await expect(page.locator('body')).toBeVisible();

    // Accessibility scan — zero new violations (pre-existing excluded)
    await expectAccessible(page);
  });

  test('login page loads and is accessible', async ({ page }) => {
    // In local mode (non-remote), the login page checks /api/auth/session
    // and redirects to lobby when already authenticated. We verify the page
    // loads successfully — it will either show the login form (remote mode)
    // or redirect to lobby (local mode).
    const response = await page.goto('/login.html');
    expect(response?.ok()).toBe(true);

    // Page title contains VoidForge (before any JS redirect)
    await expect(page).toHaveTitle(/VoidForge/);

    // Wait for JS to execute — either shows login form or redirects to lobby
    await page.waitForLoadState('networkidle');

    // After JS runs, we should be on either login or lobby page
    const url = page.url();
    const isOnLogin = url.includes('login');
    const isOnLobby = url.includes('lobby') || url.endsWith('/');

    expect(isOnLogin || isOnLobby).toBe(true);

    // Run a11y scan on whichever page we landed on
    await expectAccessible(page);
  });
});
