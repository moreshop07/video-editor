import { test, expect } from './fixtures/auth';

test.describe('Timeline interaction', () => {
  test('timeline renders with toolbar and tracks area', async ({ authenticatedPage }) => {
    // Create a project
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const input = authenticatedPage.locator('input[type="text"]');
    await input.fill(`Timeline Test ${Date.now()}`);
    const createButton = authenticatedPage.locator('button', { hasText: /new|新增/ });
    await createButton.click();
    await authenticatedPage.waitForURL(/\/editor\/\d+/);

    // Timeline should have Add Track button
    const addTrackButton = authenticatedPage.locator('button', { hasText: /Add Track|新增軌道/ });
    await expect(addTrackButton).toBeVisible();

    // Zoom controls should be visible
    await expect(authenticatedPage.locator('text=100%')).toBeVisible();
  });

  test('add track button shows track type dropdown on hover', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const input = authenticatedPage.locator('input[type="text"]');
    await input.fill(`Track Type Test ${Date.now()}`);
    const createButton = authenticatedPage.locator('button', { hasText: /new|新增/ });
    await createButton.click();
    await authenticatedPage.waitForURL(/\/editor\/\d+/);

    // Hover over Add Track to show dropdown
    const addTrackButton = authenticatedPage.locator('button', { hasText: /Add Track|新增軌道/ });
    await addTrackButton.hover();

    // Should show track type options
    await expect(authenticatedPage.locator('text=Video')).toBeVisible({ timeout: 3000 });
    await expect(authenticatedPage.locator('text=Audio')).toBeVisible();
  });
});
