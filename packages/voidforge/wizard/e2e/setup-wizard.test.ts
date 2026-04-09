/**
 * E2E tests — Setup Wizard (index.html + app.js).
 * Tests initial load, form interaction, a11y, and keyboard navigation.
 * Only tests up to the vault password step (step 1) since proceeding
 * requires real vault state.
 */

import { test, expect, expectAccessible } from './fixtures.js';

test.describe('Setup Wizard', () => {
  test('loads with first step (Secure Your Forge) visible', async ({ page }) => {
    await page.goto('/index.html');

    // Wizard container should be rendered
    await expect(page.locator('#wizard')).toBeVisible();

    // Step 1 (vault password) should be the visible step
    const step1 = page.locator('#step-1');
    await expect(step1).toBeVisible();
    await expect(step1.locator('h1')).toContainText('Secure Your Forge');

    // Step label should indicate Act 1 (app.js updates the label with act names)
    await expect(page.locator('#step-label')).toContainText('Act 1');

    // Progress bar should be visible
    await expect(page.locator('#progress-bar')).toBeVisible();
  });

  test('vault password input accepts typed text', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#step-1')).toBeVisible();

    const vaultInput = page.locator('#vault-password');
    await expect(vaultInput).toBeVisible();

    // Type a password and verify the input has a value
    await vaultInput.fill('test-password-123');
    await expect(vaultInput).toHaveValue('test-password-123');

    // The unlock button should be present
    await expect(page.locator('#unlock-vault')).toBeVisible();
  });

  test('passes axe-core accessibility scan', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#step-1')).toBeVisible();
    await expectAccessible(page);
  });

  test('keyboard navigation moves through form fields in order', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#step-1')).toBeVisible();

    // Tab from the skip-nav link into the main content
    await page.keyboard.press('Tab'); // skip-nav
    await page.keyboard.press('Tab'); // vault password input
    await page.keyboard.press('Tab'); // toggle visibility button

    // The toggle button should be focused
    await expect(page.locator('#toggle-vault-visibility')).toBeFocused();

    // Tab again to reach the unlock button
    await page.keyboard.press('Tab');

    // Should reach the unlock button or status area
    const activeId = await page.evaluate(() => document.activeElement?.id);
    // After the card fields, we should reach the unlock button or the footer nav
    expect(['unlock-vault', 'btn-back', 'btn-next']).toContain(activeId);
  });
});
