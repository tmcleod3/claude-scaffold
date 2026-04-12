/**
 * E2E tests — Danger Room dashboard, Deploy wizard, Tower, and War Room.
 * Tests page loads, tab navigation, empty states, and a11y compliance.
 */

import { test, expect, expectAccessible } from './fixtures.js';

test.describe('Danger Room (redirect — ADR-046)', () => {
  test('page loads with redirect message', async ({ page }) => {
    // Block navigation so we can verify the redirect message before it fires
    await page.route('**/lobby.html', (route) => route.abort());
    await page.goto('/danger-room.html');

    // Should show the redirect box with heading
    await expect(page.locator('.redirect-box h1')).toContainText('Danger Room');

    // Should show the redirect message
    await expect(page.locator('#redirect-message')).toBeVisible();
  });

  test('redirects to lobby when no project param', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForURL('**/lobby.html', { timeout: 5000 }),
      page.goto('/danger-room.html'),
    ]);
    expect(page.url()).toContain('/lobby.html');
  });

  test('redirects to project dashboard when project param provided', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForURL('**/project.html?id=test-123#danger-room', { timeout: 5000 }),
      page.goto('/danger-room.html?project=test-123'),
    ]);
    expect(page.url()).toContain('/project.html');
    expect(page.url()).toContain('id=test-123');
    expect(page.url()).toContain('#danger-room');
  });

  test('passes axe-core accessibility scan', async ({ page }) => {
    // Block redirect so we can scan the page
    await page.route('**/lobby.html', (route) => route.abort());
    await page.goto('/danger-room.html');
    await page.waitForLoadState('networkidle');
    await expectAccessible(page);
  });
});

test.describe('Deploy Wizard', () => {
  test('page loads with target selection UI visible', async ({ page }) => {
    await page.goto('/deploy.html');

    // Page title should contain VoidForge
    await expect(page).toHaveTitle(/VoidForge/);

    // Step 1 heading should be visible
    await expect(page.locator('#step-1-heading')).toContainText('Select Project');

    // Vault password input and unlock button should be visible
    await expect(page.locator('#vault-password')).toBeVisible();
    await expect(page.locator('#unlock-vault')).toBeVisible();
  });

  test('passes axe-core accessibility scan', async ({ page }) => {
    await page.goto('/deploy.html');
    await page.waitForLoadState('networkidle');
    await expectAccessible(page);
  });
});

test.describe('Tower (Terminal)', () => {
  test('page loads with UI shell visible', async ({ page }) => {
    await page.goto('/tower.html');

    // Page title should contain VoidForge
    await expect(page).toHaveTitle(/VoidForge/);

    // Header should render with the Tower branding
    await expect(page.locator('.tower-header .logo')).toContainText('Avengers Tower');

    // Terminal container should exist (PTY will be mocked/unavailable in test)
    await expect(page.locator('#terminal-container')).toBeVisible();

    // Action buttons should be present
    await expect(page.locator('#btn-new-shell')).toBeVisible();
  });
});

test.describe('War Room (redirect — ADR-046)', () => {
  test('page loads with redirect message', async ({ page }) => {
    // Block navigation so we can verify the redirect message before it fires
    await page.route('**/lobby.html', (route) => route.abort());
    await page.goto('/war-room.html');

    // Should show the redirect box with heading
    await expect(page.locator('.redirect-box h1')).toContainText('War Room');

    // Should show the redirect message
    await expect(page.locator('#redirect-message')).toBeVisible();
  });

  test('redirects to lobby when no project param', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForURL('**/lobby.html', { timeout: 5000 }),
      page.goto('/war-room.html'),
    ]);
    expect(page.url()).toContain('/lobby.html');
  });

  test('redirects to project dashboard when project param provided', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForURL('**/project.html?id=test-123#war-room', { timeout: 5000 }),
      page.goto('/war-room.html?project=test-123'),
    ]);
    expect(page.url()).toContain('/project.html');
    expect(page.url()).toContain('id=test-123');
    expect(page.url()).toContain('#war-room');
  });
});
