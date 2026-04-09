/**
 * E2E tests — Danger Room dashboard, Deploy wizard, Tower, and War Room.
 * Tests page loads, tab navigation, empty states, and a11y compliance.
 */

import { test, expect, expectAccessible } from './fixtures.js';

test.describe('Danger Room', () => {
  test('page loads with main content visible', async ({ page }) => {
    await page.goto('/danger-room.html');

    // Header should render with the title
    await expect(page.locator('.danger-room-title')).toContainText('Danger Room');

    // The main grid should be visible
    await expect(page.locator('#danger-room-grid')).toBeVisible();

    // The Ops panel (default active tab panel) should be visible
    await expect(page.locator('#panel-ops')).toHaveClass(/active/);
  });

  test('tab buttons are clickable and switch content panels', async ({ page }) => {
    // The heartbeat API returns data at top level (no success/data wrapper).
    // Simulate Cultivation installed so the tab bar becomes visible.
    await page.route('**/api/danger-room/heartbeat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cultivationInstalled: true,
          heartbeat: null,
          campaigns: [],
          treasury: { revenue: 0, spend: 0, net: 0, roas: 0, budgetRemaining: 0 },
        }),
      });
    });

    await page.goto('/danger-room.html');
    await page.waitForLoadState('networkidle');

    // Tab bar should be visible now that Cultivation is "installed"
    const tabBar = page.locator('#tab-bar');
    await expect(tabBar).toHaveClass(/active/);

    // Click each growth tab and verify the corresponding panel becomes active
    const tabTests = [
      { tab: 'tab-growth', panel: 'panel-growth' },
      { tab: 'tab-campaigns', panel: 'panel-campaigns' },
      { tab: 'tab-treasury', panel: 'panel-treasury' },
      { tab: 'tab-heartbeat', panel: 'panel-heartbeat' },
      { tab: 'tab-ops', panel: 'panel-ops' },
    ];

    for (const { tab, panel } of tabTests) {
      await page.locator(`#${tab}`).click();
      await expect(page.locator(`#${panel}`)).toHaveClass(/active/);
      // The clicked tab should have aria-selected="true"
      await expect(page.locator(`#${tab}`)).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('growth tab shows empty state without Cultivation data', async ({ page }) => {
    // Intercept heartbeat to enable Cultivation (tab bar visible) but with no growth data.
    await page.route('**/api/danger-room/heartbeat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cultivationInstalled: true,
          heartbeat: null,
          campaigns: [],
          treasury: { revenue: 0, spend: 0, net: 0, roas: 0, budgetRemaining: 0 },
        }),
      });
    });

    await page.goto('/danger-room.html');
    await page.waitForLoadState('networkidle');

    // Switch to growth tab
    await page.locator('#tab-growth').click();
    await expect(page.locator('#panel-growth')).toHaveClass(/active/);

    // Empty state should be visible with guidance message.
    // When cultivationInstalled is true but no financial data exists,
    // JS updates the message to indicate Cultivation is installed.
    const emptyState = page.locator('#growth-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('no financial data');
  });

  test('passes axe-core accessibility scan (ops tab)', async ({ page }) => {
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

test.describe('War Room', () => {
  test('page loads with main panels visible', async ({ page }) => {
    await page.goto('/war-room.html');

    // Page title should contain VoidForge
    await expect(page).toHaveTitle(/VoidForge/);

    // Header should show the War Room title
    await expect(page.locator('.war-room-title')).toContainText('War Room');

    // Main panels grid should be visible
    await expect(page.locator('#war-room-grid')).toBeVisible();

    // Campaign timeline panel should be present
    await expect(page.locator('#campaign-timeline')).toBeVisible();

    // Finding scoreboard should be visible
    await expect(page.locator('#finding-scoreboard')).toBeVisible();
  });
});
