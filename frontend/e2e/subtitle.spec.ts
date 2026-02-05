import { test, expect } from './fixtures/auth';

test.describe('Subtitle panel', () => {
  test('subtitle tab renders with generate button', async ({ authenticatedPage }) => {
    // Create a project
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const input = authenticatedPage.locator('input[type="text"]');
    await input.fill(`Subtitle Test ${Date.now()}`);
    const createButton = authenticatedPage.locator('button', { hasText: /new|新增/ });
    await createButton.click();
    await authenticatedPage.waitForURL(/\/editor\/\d+/);

    // Click Subtitles tab in sidebar
    const subtitlesTab = authenticatedPage.locator('button', { hasText: /subtitles|字幕/ }).first();
    await subtitlesTab.click();

    // Should see Generate button
    await expect(
      authenticatedPage.locator('button', { hasText: /generate|生成/ })
    ).toBeVisible();

    // Should see empty state message
    await expect(
      authenticatedPage.locator('text=/no subtitles|尚無字幕|empty/i')
    ).toBeVisible();
  });
});
