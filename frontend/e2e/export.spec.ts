import { test, expect } from './fixtures/auth';

test.describe('Export dialog', () => {
  test('export button opens export dialog with settings', async ({ authenticatedPage }) => {
    // Create a project to get to the editor
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const input = authenticatedPage.locator('input[type="text"]');
    await input.fill(`Export Test ${Date.now()}`);
    const createButton = authenticatedPage.locator('button', { hasText: /new|新增/ });
    await createButton.click();
    await authenticatedPage.waitForURL(/\/editor\/\d+/);

    // Click the export button in header
    const exportButton = authenticatedPage.locator('header button', { hasText: /export|匯出/ });
    await exportButton.click();

    // Export dialog should appear
    const dialog = authenticatedPage.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible();

    // Should have quality buttons
    await expect(authenticatedPage.locator('button', { hasText: /Low|低/ })).toBeVisible();
    await expect(authenticatedPage.locator('button', { hasText: /Medium|中/ })).toBeVisible();
    await expect(authenticatedPage.locator('button', { hasText: /High|高/ })).toBeVisible();

    // Should have resolution presets
    await expect(authenticatedPage.locator('button', { hasText: '1080p' })).toBeVisible();
    await expect(authenticatedPage.locator('button', { hasText: '720p' })).toBeVisible();
    await expect(authenticatedPage.locator('button', { hasText: '480p' })).toBeVisible();
    await expect(authenticatedPage.locator('button', { hasText: '4K' })).toBeVisible();
  });

  test('cancel button closes export dialog', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const input = authenticatedPage.locator('input[type="text"]');
    await input.fill(`Export Cancel Test ${Date.now()}`);
    const createButton = authenticatedPage.locator('button', { hasText: /new|新增/ });
    await createButton.click();
    await authenticatedPage.waitForURL(/\/editor\/\d+/);

    // Open export dialog
    const exportButton = authenticatedPage.locator('header button', { hasText: /export|匯出/ });
    await exportButton.click();

    const dialog = authenticatedPage.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible();

    // Click cancel
    const cancelButton = authenticatedPage.locator('button', { hasText: /cancel|取消/ });
    await cancelButton.click();

    // Dialog should be gone
    await expect(dialog).not.toBeVisible();
  });
});
