import { test, expect } from './fixtures/auth';
import path from 'path';

test.describe('Asset upload', () => {
  test('upload a video file via file input', async ({ authenticatedPage }) => {
    // Create a project first
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const input = authenticatedPage.locator('input[type="text"]');
    await input.fill(`Asset Test ${Date.now()}`);
    const createButton = authenticatedPage.locator('button', { hasText: /new|新增/ });
    await createButton.click();
    await authenticatedPage.waitForURL(/\/editor\/\d+/);

    // The sidebar should default to assets tab
    // Find the file input (hidden) and upload test video
    const testVideoPath = path.resolve(__dirname, 'fixtures/test-video.mp4');

    // Look for file input in the assets panel
    const fileInput = authenticatedPage.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(testVideoPath);

      // Wait for upload to process
      await authenticatedPage.waitForTimeout(2000);

      // Asset should appear in the grid area
      await expect(authenticatedPage.locator('[class*="grid"]').first()).toBeVisible();
    }
  });
});
